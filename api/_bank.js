const crypto = require('crypto');

// Client Enable Banking (agrégateur DSP2, lecture seule des comptes).
// Clé privée et id d'application en variables d'environnement Vercel uniquement.
const EB_API = 'https://api.enablebanking.com';

function bankConfigured() {
  return !!(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY);
}

// JWT RS256 signé avec la clé privée de l'application (durée max autorisée : 24 h)
function ebJwt() {
  const key = process.env.ENABLE_BANKING_PRIVATE_KEY.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ typ: 'JWT', alg: 'RS256', kid: process.env.ENABLE_BANKING_APP_ID });
  const body = enc({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 });
  const sig  = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url');
  return `${head}.${body}.${sig}`;
}

// psu : { ip, ua } quand l'utilisateur est présent. Sans ces en-têtes, la banque
// compte l'appel comme une synchro « en arrière-plan » (souvent 4 par jour max).
async function eb(method, path, { body, psu } = {}) {
  const headers = { Authorization: `Bearer ${ebJwt()}` };
  if (body) headers['Content-Type'] = 'application/json';
  if (psu && psu.ip) headers['Psu-Ip-Address'] = psu.ip;
  if (psu && psu.ua) headers['Psu-User-Agent'] = psu.ua;
  const res  = await fetch(EB_API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Enable Banking ${method} ${path.split('?')[0]} → ${res.status}`);
    err.status = res.status;
    err.detail = data;
    throw err;
  }
  return data;
}

function psuFromReq(req) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return { ip, ua: String(req.headers['user-agent'] || '').slice(0, 300) };
}

let schemaReady = false;
async function ensureBankSchema(client) {
  if (schemaReady) return;
  // Connexion bancaire (session Enable Banking) : comptes accessibles + échéance du consentement
  await client.query(`
    CREATE TABLE IF NOT EXISTS bank_links (
      session_id   TEXT        PRIMARY KEY,
      user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      aspsp        TEXT        NOT NULL,
      country      TEXT        NOT NULL,
      valid_until  TIMESTAMPTZ NOT NULL,
      accounts     JSONB       NOT NULL DEFAULT '[]',
      last_sync_at TIMESTAMPTZ,
      last_error   TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )`);
  // Demandes d'autorisation en cours : relie le retour de la banque (state) à l'utilisateur
  await client.query(`
    CREATE TABLE IF NOT EXISTS bank_auth_states (
      state      TEXT        PRIMARY KEY,
      user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      aspsp      TEXT        NOT NULL,
      country    TEXT        NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  // Opérations reçues de la banque. 'pending' = à vérifier dans l'aperçu d'import ;
  // 'done' = traitée (importée ou écartée) — la ligne reste pour ne jamais revenir.
  await client.query(`
    CREATE TABLE IF NOT EXISTS bank_transactions (
      user_id    TEXT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tx_key     TEXT           NOT NULL,
      date       DATE           NOT NULL,
      label      TEXT           NOT NULL,
      amount     NUMERIC(10, 2) NOT NULL,
      type       TEXT           NOT NULL,
      kind       TEXT,
      account    TEXT,
      status     TEXT           NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ    DEFAULT NOW(),
      PRIMARY KEY (user_id, tx_key)
    )`);
  schemaReady = true;
}

// Transaction Enable Banking → opération. Seules les opérations comptabilisées
// (BOOK) en euros sont gardées : les « en attente » reviendront une fois passées.
function mapTransaction(tx, account) {
  if (tx.status && tx.status !== 'BOOK') return null;
  const amt = tx.transaction_amount || {};
  if (amt.currency && amt.currency !== 'EUR') return null;
  const amount = Math.abs(parseFloat(amt.amount));
  if (!Number.isFinite(amount) || amount === 0) return null;
  const date = tx.transaction_date || tx.booking_date || tx.value_date;
  if (!/^\d{4}-\d{2}-\d{2}/.test(date || '')) return null;
  const type  = tx.credit_debit_indicator === 'DBIT' ? 'depense' : 'revenu';
  const party = type === 'depense' ? tx.creditor : tx.debtor;
  const label = ((tx.remittance_information || []).join(' ').replace(/\s+/g, ' ').trim()
    || (party && party.name) || (tx.bank_transaction_code && tx.bank_transaction_code.description) || 'Opération').slice(0, 200);
  const ref = tx.transaction_id || tx.entry_reference || `${date}|${amount}|${type}|${label}`;
  const txKey = crypto.createHash('sha256').update(`${account.hash}|${ref}`).digest('base64url').slice(0, 32);
  return {
    txKey, date: date.slice(0, 10), label, amount, type,
    kind: (tx.bank_transaction_code && tx.bank_transaction_code.description) || null,
    account: account.name || null,
  };
}

const DAY = 864e5;
const FIRST_SYNC_DAYS = 90;
const OVERLAP_DAYS    = 10;   // une opération peut être comptabilisée plusieurs jours après

// Récupère les nouvelles opérations de tous les comptes d'une connexion.
// Renvoie le nombre d'opérations ajoutées ; l'erreur éventuelle est stockée sur la connexion.
async function syncLink(client, link, psu) {
  if (new Date(link.valid_until).getTime() < Date.now()) {
    await client.query('UPDATE bank_links SET last_error = $1 WHERE session_id = $2',
      ['Autorisation expirée : reconnectez la banque', link.session_id]);
    return 0;
  }
  const since = link.last_sync_at
    ? new Date(new Date(link.last_sync_at).getTime() - OVERLAP_DAYS * DAY)
    : new Date(Date.now() - FIRST_SYNC_DAYS * DAY);
  const dateFrom = since.toISOString().slice(0, 10);
  let added = 0;
  try {
    for (const account of link.accounts) {
      let key = null, pages = 0;
      do {
        const q = `date_from=${dateFrom}` + (key ? `&continuation_key=${encodeURIComponent(key)}` : '');
        const data = await eb('GET', `/accounts/${encodeURIComponent(account.uid)}/transactions?${q}`, { psu });
        for (const tx of data.transactions || []) {
          const op = mapTransaction(tx, account);
          if (!op) continue;
          const r = await client.query(
            `INSERT INTO bank_transactions (user_id, tx_key, date, label, amount, type, kind, account)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (user_id, tx_key) DO NOTHING`,
            [link.user_id, op.txKey, op.date, op.label, op.amount, op.type, op.kind, op.account]
          );
          added += r.rowCount;
        }
        key = data.continuation_key || null;
      } while (key && ++pages < 50);
    }
    await client.query('UPDATE bank_links SET last_sync_at = NOW(), last_error = NULL WHERE session_id = $1', [link.session_id]);
  } catch (err) {
    console.error('[bank] sync', link.aspsp, err.message, JSON.stringify(err.detail || {}).slice(0, 300));
    const msg = err.status === 401 || err.status === 403 || err.status === 422
      ? 'Accès refusé par la banque : reconnectez-la'
      : 'Synchronisation impossible pour le moment';
    await client.query('UPDATE bank_links SET last_error = $1 WHERE session_id = $2', [msg, link.session_id]);
  }
  return added;
}

module.exports = { bankConfigured, eb, psuFromReq, ensureBankSchema, syncLink, mapTransaction };

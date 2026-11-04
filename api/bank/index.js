const crypto = require('crypto');
const { pool, withDb } = require('../_lib');
const { bankConfigured, eb, psuFromReq, ensureBankSchema, syncLink } = require('../_bank');

const STATE_TTL_MIN = 60;
const MAX_ACK       = 2000;
const DEFAULT_CONSENT_DAYS = 90;

const iban4 = iban => (iban ? `•••• ${String(iban).slice(-4)}` : null);

// Liste des banques (France, particuliers) : mise en cache par instance
let aspspCache = null;
async function aspsps() {
  if (aspspCache && aspspCache.at > Date.now() - 6 * 3600e3) return aspspCache.list;
  const data = await eb('GET', '/aspsps?country=FR&psu_type=personal');
  const list = (data.aspsps || []).map(a => ({
    name: a.name, country: a.country, maxConsent: a.maximum_consent_validity || null,
  })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  aspspCache = { at: Date.now(), list };
  return list;
}

async function status(client, uid) {
  const links = await client.query(
    `SELECT session_id, aspsp, valid_until, accounts, last_sync_at, last_error
     FROM bank_links WHERE user_id = $1 ORDER BY created_at`, [uid]);
  const pending = await client.query(
    `SELECT tx_key, to_char(date, 'YYYY-MM-DD') AS date, label, amount::float AS amount, type, kind, account
     FROM bank_transactions WHERE user_id = $1 AND status = 'pending' ORDER BY date DESC`, [uid]);
  return {
    configured: true,
    links: links.rows.map(l => ({
      session: l.session_id, aspsp: l.aspsp, validUntil: l.valid_until, lastSync: l.last_sync_at, error: l.last_error,
      accounts: (l.accounts || []).map(a => ({ name: a.name, iban: a.iban, currency: a.currency })),
    })),
    pending: pending.rows.map(r => ({ key: r.tx_key, date: r.date, label: r.label, amount: r.amount, type: r.type, kind: r.kind, account: r.account })),
  };
}

function ebErrorMessage(err) {
  if (err.status === 401) return 'Enable Banking refuse la clé : vérifiez ENABLE_BANKING_APP_ID et ENABLE_BANKING_PRIVATE_KEY';
  const msg = err.detail && (err.detail.message || err.detail.error);
  return `Enable Banking a refusé la demande (${err.status}${msg ? ` : ${String(msg).slice(0, 160)}` : ''})`;
}

const userRoute = withDb('bank', 'GET,POST,DELETE,OPTIONS', async (req, res, client, uid) => {
  try {
    return await handle(req, res, client, uid);
  } catch (err) {
    if (err.detail === undefined) throw err;
    console.error('[api/bank]', err.message, JSON.stringify(err.detail).slice(0, 300));
    return res.status(502).json({ error: ebErrorMessage(err) });
  }
});

async function handle(req, res, client, uid) {
  if (!bankConfigured()) return res.json({ configured: false, links: [], pending: [] });
  await ensureBankSchema(client);
  const body = req.body || {};

  if (req.method === 'GET') {
    if (req.query && req.query.aspsps) return res.json(await aspsps());
    return res.json(await status(client, uid));
  }

  // ── Démarrer une connexion : renvoie l'URL de la banque ──────────────
  if (req.method === 'POST' && body.action === 'connect') {
    const bank = (await aspsps()).find(a => a.name === body.aspsp);
    if (!bank) return res.status(400).json({ error: 'Banque inconnue' });
    const seconds = Math.min(bank.maxConsent || DEFAULT_CONSENT_DAYS * 86400, 180 * 86400) - 600;
    const state = crypto.randomBytes(24).toString('base64url');
    await client.query("DELETE FROM bank_auth_states WHERE created_at < NOW() - INTERVAL '1 day'");
    await client.query('INSERT INTO bank_auth_states (state, user_id, aspsp, country) VALUES ($1, $2, $3, $4)',
      [state, uid, bank.name, bank.country]);
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const auth = await eb('POST', '/auth', { body: {
      access: { valid_until: new Date(Date.now() + seconds * 1000).toISOString() },
      aspsp: { name: bank.name, country: bank.country },
      state,
      redirect_url: `${proto}://${req.headers.host}/api/bank/callback`,
      psu_type: 'personal',
      language: 'fr',
    } });
    return res.json({ url: auth.url });
  }

  // ── Retour de la banque : échange le code contre une session ─────────
  if (req.method === 'POST' && body.action === 'session') {
    if (typeof body.code !== 'string' || typeof body.state !== 'string') {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }
    // Le state doit avoir été émis pour CE compte, récemment, et ne sert qu'une fois
    const { rows } = await client.query(
      `DELETE FROM bank_auth_states WHERE state = $1 AND user_id = $2
         AND created_at > NOW() - INTERVAL '${STATE_TTL_MIN} minutes'
       RETURNING aspsp, country`, [body.state, uid]);
    if (!rows.length) return res.status(400).json({ error: 'Demande de connexion expirée ou invalide' });
    const s = await eb('POST', '/sessions', { body: { code: body.code } });
    const accounts = (s.accounts || []).map(a => ({
      uid: a.uid, hash: a.identification_hash || a.uid, name: a.name || a.product || null,
      iban: iban4(a.account_id && a.account_id.iban), currency: a.currency || null,
    }));
    if (!accounts.length) {
      await eb('DELETE', `/sessions/${encodeURIComponent(s.session_id)}`).catch(() => {});
      return res.status(400).json({ error: 'Aucun compte accessible : en mode restreint, seuls les comptes liés à l\'application Enable Banking sont autorisés' });
    }
    // Une seule connexion par banque : la nouvelle remplace l'ancienne
    const old = await client.query('DELETE FROM bank_links WHERE user_id = $1 AND aspsp = $2 RETURNING session_id', [uid, rows[0].aspsp]);
    for (const o of old.rows) await eb('DELETE', `/sessions/${encodeURIComponent(o.session_id)}`).catch(() => {});
    const validUntil = (s.access && s.access.valid_until) || new Date(Date.now() + DEFAULT_CONSENT_DAYS * 864e5).toISOString();
    await client.query(
      `INSERT INTO bank_links (session_id, user_id, aspsp, country, valid_until, accounts)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [s.session_id, uid, rows[0].aspsp, rows[0].country, validUntil, JSON.stringify(accounts)]);
    const link = { session_id: s.session_id, user_id: uid, aspsp: rows[0].aspsp, valid_until: validUntil, accounts, last_sync_at: null };
    await syncLink(client, link, psuFromReq(req));
    return res.json(await status(client, uid));
  }

  // ── Synchroniser maintenant (utilisateur présent) ───────────────────
  if (req.method === 'POST' && body.action === 'sync') {
    const { rows } = await client.query('SELECT * FROM bank_links WHERE user_id = $1', [uid]);
    const psu = psuFromReq(req);
    for (const link of rows) await syncLink(client, link, psu);
    return res.json(await status(client, uid));
  }

  // ── Opérations traitées dans l'aperçu (importées ou écartées) ────────
  if (req.method === 'POST' && body.action === 'ack') {
    const keys = body.keys;
    if (!Array.isArray(keys) || keys.length > MAX_ACK || !keys.every(k => typeof k === 'string' && k.length <= 64)) {
      return res.status(400).json({ error: 'clés invalides' });
    }
    await client.query(
      "UPDATE bank_transactions SET status = 'done' WHERE user_id = $1 AND tx_key = ANY($2::text[])", [uid, keys]);
    return res.json({ ok: true });
  }

  // ── Déconnecter une banque (révoque aussi le consentement) ──────────
  if (req.method === 'DELETE') {
    const session = req.query && req.query.session;
    if (!session) return res.status(400).json({ error: 'Paramètre session requis' });
    const { rowCount } = await client.query('DELETE FROM bank_links WHERE session_id = $1 AND user_id = $2', [session, uid]);
    if (rowCount) await eb('DELETE', `/sessions/${encodeURIComponent(session)}`).catch(() => {});
    return res.json(await status(client, uid));
  }

  return res.status(400).json({ error: 'Action inconnue' });
}

// Tâche planifiée Vercel (vercel.json) : synchro quotidienne de toutes les connexions.
// Vercel envoie « Authorization: Bearer $CRON_SECRET ».
async function cronRoute(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Non autorisé' });
  if (!bankConfigured()) return res.json({ ok: true, skipped: 'non configuré' });
  const client = await pool.connect();
  try {
    await ensureBankSchema(client);
    const { rows } = await client.query('SELECT * FROM bank_links WHERE valid_until > NOW()');
    let added = 0;
    for (const link of rows) added += await syncLink(client, link, null);
    return res.json({ ok: true, links: rows.length, added });
  } catch (err) {
    console.error('[api/bank cron]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
}

module.exports = (req, res) =>
  req.method === 'GET' && req.query && req.query.cron ? cronRoute(req, res) : userRoute(req, res);

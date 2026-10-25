const crypto = require('crypto');
const { pool, signToken, verifyToken, hashPin, verifyPin, DEFAULT_CATEGORIES } = require('./_lib');

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/; // anciens comptes uniquement (connexion par pseudo)
const PIN_RE      = /^\d{4,6}$/;
const MAX_FAILS   = 5;
const LOCK_MS     = 15 * 60 * 1000; // 15 min

const validEmail = e => e.length <= 254 && EMAIL_RE.test(e);

// Auto-migration au cold start : connexion par email. Les comptes créés avant
// n'ont qu'un pseudo (email NULL) ; les nouveaux n'ont plus de pseudo.
let schemaReady = false;
async function ensureSchema(client) {
  if (schemaReady) return;
  await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT');
  await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_lc TEXT');
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS users_email_lc_key ON users (email_lc)');
  await client.query('ALTER TABLE users ALTER COLUMN username DROP NOT NULL');
  await client.query('ALTER TABLE users ALTER COLUMN username_lc DROP NOT NULL');
  schemaReady = true;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-auth-token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Méthode non autorisée' });

  const { action, login, email, pin } = req.body || {};

  const client = await pool.connect();
  try {
    await ensureSchema(client);

    // Ancien compte connecté par pseudo : enregistre son email (une seule fois).
    if (action === 'set-email') {
      const uid = verifyToken(req.headers['x-auth-token']);
      if (!uid) return res.status(401).json({ error: 'Non autorisé' });
      const mail = String(email || '').trim();
      if (!validEmail(mail)) return res.status(400).json({ error: 'Adresse email invalide.' });
      const taken = await client.query('SELECT 1 FROM users WHERE email_lc = $1', [mail.toLowerCase()]);
      if (taken.rowCount > 0) return res.status(409).json({ error: 'Cet email est déjà utilisé.' });
      const { rowCount } = await client.query(
        'UPDATE users SET email = $1, email_lc = $2 WHERE id = $3 AND email IS NULL',
        [mail, mail.toLowerCase(), uid]
      );
      if (!rowCount) return res.status(409).json({ error: 'Un email est déjà associé à ce compte.' });
      return res.json({ ok: true, email: mail });
    }

    if (!PIN_RE.test(String(pin || ''))) {
      return res.status(400).json({ error: 'PIN invalide (4 à 6 chiffres).' });
    }

    if (action === 'register') {
      const mail = String(email || '').trim();
      const lc   = mail.toLowerCase();
      if (!validEmail(mail)) return res.status(400).json({ error: 'Adresse email invalide.' });

      const exists = await client.query('SELECT 1 FROM users WHERE email_lc = $1', [lc]);
      if (exists.rowCount > 0) {
        return res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });
      }

      const id = crypto.randomUUID();
      const { hash, salt } = hashPin(pin);

      await client.query(
        `INSERT INTO users (id, email, email_lc, pin_hash, pin_salt)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, mail, lc, hash, salt]
      );

      // Seed des catégories par défaut pour ce nouvel utilisateur.
      // Pas de ON CONFLICT : le compte vient d'être créé (donc aucune catégorie),
      // et la contrainte unique (user_id, id) n'existe qu'après migrate-multiuser-2.
      const values = DEFAULT_CATEGORIES
        .map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`)
        .join(', ');
      const params = [id, ...DEFAULT_CATEGORIES.flat()];
      await client.query(
        `INSERT INTO categories (user_id, id, label, color) VALUES ${values}`,
        params
      );

      return res.json({ ok: true, token: signToken(id), email: mail });
    }

    if (action === 'login') {
      // Email, ou ancien pseudo pour un compte qui n'a pas encore d'email
      const ident = String(login || '').trim();
      const lc    = ident.toLowerCase();
      let query;
      if (ident.includes('@'))         query = 'WHERE email_lc = $1';
      else if (USERNAME_RE.test(ident)) query = 'WHERE username_lc = $1 AND email IS NULL';
      else return res.status(400).json({ error: 'Adresse email invalide.' });

      const { rows } = await client.query(
        `SELECT id, email, pin_hash, pin_salt, failed_count, locked_until FROM users ${query}`,
        [lc]
      );
      const user = rows[0];

      // Réponse identique (401) si compte inconnu OU mauvais PIN → pas d'énumération des comptes
      if (!user) return res.status(401).json({ error: 'Email ou PIN incorrect.' });

      if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
        return res.status(423).json({ error: 'Compte temporairement verrouillé. Réessayez plus tard.' });
      }

      if (!verifyPin(pin, user.pin_hash, user.pin_salt)) {
        const fails = (user.failed_count || 0) + 1;
        const lock  = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null;
        await client.query(
          'UPDATE users SET failed_count = $1, locked_until = $2 WHERE id = $3',
          [fails, lock, user.id]
        );
        if (lock) return res.status(423).json({ error: 'Trop d\'essais. Compte verrouillé 15 minutes.' });
        return res.status(401).json({ error: 'Email ou PIN incorrect.' });
      }

      if (user.failed_count || user.locked_until) {
        await client.query('UPDATE users SET failed_count = 0, locked_until = NULL WHERE id = $1', [user.id]);
      }

      return res.json({ ok: true, token: signToken(user.id), email: user.email, needsEmail: !user.email });
    }

    return res.status(400).json({ error: 'Action inconnue.' });
  } catch (err) {
    console.error('[api/auth]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
};

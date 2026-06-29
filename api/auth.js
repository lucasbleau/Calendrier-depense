const crypto = require('crypto');
const { pool, signToken, hashPin, verifyPin, DEFAULT_CATEGORIES } = require('./_lib');

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;
const PIN_RE      = /^\d{4,6}$/;
const MAX_FAILS   = 5;
const LOCK_MS     = 15 * 60 * 1000; // 15 min

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Méthode non autorisée' });

  const { action, username, pin } = req.body || {};
  const uname = String(username || '').trim();
  const lc    = uname.toLowerCase();

  if (!USERNAME_RE.test(uname)) {
    return res.status(400).json({ error: 'Identifiant invalide (3-20 caractères : lettres, chiffres, _ ou -).' });
  }
  if (!PIN_RE.test(String(pin || ''))) {
    return res.status(400).json({ error: 'PIN invalide (4 à 6 chiffres).' });
  }

  const client = await pool.connect();
  try {
    if (action === 'register') {
      const exists = await client.query('SELECT 1 FROM users WHERE username_lc = $1', [lc]);
      if (exists.rowCount > 0) {
        return res.status(409).json({ error: 'Cet identifiant est déjà pris.' });
      }

      const id = crypto.randomUUID();
      const { hash, salt } = hashPin(pin);

      await client.query(
        `INSERT INTO users (id, username, username_lc, pin_hash, pin_salt)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, uname, lc, hash, salt]
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

      return res.json({ ok: true, token: signToken(id), username: uname });
    }

    if (action === 'login') {
      const { rows } = await client.query(
        'SELECT id, username, pin_hash, pin_salt, failed_count, locked_until FROM users WHERE username_lc = $1',
        [lc]
      );
      const user = rows[0];

      // Réponse identique (401) si user inconnu OU mauvais PIN → pas d'énumération d'identifiants
      if (!user) return res.status(401).json({ error: 'Identifiant ou PIN incorrect.' });

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
        return res.status(401).json({ error: 'Identifiant ou PIN incorrect.' });
      }

      if (user.failed_count || user.locked_until) {
        await client.query('UPDATE users SET failed_count = 0, locked_until = NULL WHERE id = $1', [user.id]);
      }

      return res.json({ ok: true, token: signToken(user.id), username: user.username });
    }

    return res.status(400).json({ error: 'Action inconnue.' });
  } catch (err) {
    console.error('[api/auth]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
};

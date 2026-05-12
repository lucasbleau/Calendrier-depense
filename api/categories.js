const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-auth-token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (process.env.APP_TOKEN && req.headers['x-auth-token'] !== process.env.APP_TOKEN) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const client = await pool.connect();
  try {
    // ── GET : toutes les catégories ──────────────────────────────────────────
    if (req.method === 'GET') {
      const { rows } = await client.query(
        'SELECT id, label, color FROM categories ORDER BY created_at ASC'
      );
      return res.json(rows);
    }

    // ── POST : créer ou mettre à jour une catégorie (upsert) ─────────────────
    if (req.method === 'POST') {
      const { id, label, color } = req.body;
      if (!id || !label || !color) {
        return res.status(400).json({ error: 'Champs id, label et color requis' });
      }
      await client.query(
        `INSERT INTO categories (id, label, color)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET label = $2, color = $3`,
        [id, label, color]
      );
      return res.json({ ok: true });
    }

    // ── DELETE : supprimer une catégorie ─────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Paramètre id requis' });

      try {
        await client.query('DELETE FROM categories WHERE id = $1', [id]);
      } catch (err) {
        if (err.code === '23503') {
          return res.status(409).json({ error: 'Catégorie utilisée par des opérations existantes' });
        }
        throw err;
      }
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });

  } catch (err) {
    console.error('[api/categories]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
};

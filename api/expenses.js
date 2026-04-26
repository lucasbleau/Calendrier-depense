const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const client = await pool.connect();
  try {
    // ── GET : récupérer toutes les dépenses ──────────────────────────────
    if (req.method === 'GET') {
      const { rows } = await client.query(
        'SELECT id, date, label, amount::float AS amount, type, category FROM expenses ORDER BY date DESC, created_at DESC'
      );
      return res.json(rows);
    }

    // ── POST : créer une ou plusieurs dépenses ───────────────────────────
    if (req.method === 'POST') {
      const items = Array.isArray(req.body) ? req.body : [req.body];

      for (const item of items) {
        const { id, date, label, amount, type, category } = item;
        await client.query(
          'INSERT INTO expenses (id, date, label, amount, type, category) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
          [id, date, label, amount, type, category]
        );
      }

      return res.json({ ok: true, count: items.length });
    }

    // ── DELETE : supprimer une dépense ───────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Paramètre id requis' });

      await client.query('DELETE FROM expenses WHERE id = $1', [id]);
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });

  } catch (err) {
    console.error('[api/expenses]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
};

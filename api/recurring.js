const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const client = await pool.connect();
  try {
    if (req.method === 'GET') {
      const { rows } = await client.query(
        'SELECT id, label, amount::float AS amount, type, category, days FROM recurring_tasks ORDER BY created_at ASC'
      );
      return res.json(rows.map(r => ({ ...r, days: JSON.parse(r.days) })));
    }

    if (req.method === 'POST') {
      const { id, label, amount, type, category, days } = req.body;
      await client.query(
        `INSERT INTO recurring_tasks (id, label, amount, type, category, days)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
         SET label=$2, amount=$3, type=$4, category=$5, days=$6`,
        [id, label, amount, type, category, JSON.stringify(days)]
      );
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id requis' });
      await client.query('DELETE FROM recurring_tasks WHERE id = $1', [id]);
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (err) {
    console.error('[api/recurring]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
};

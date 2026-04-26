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
        'SELECT category, amount::float AS amount FROM goals'
      );
      const result = {};
      for (const r of rows) result[r.category] = r.amount;
      return res.json(result);
    }

    if (req.method === 'POST') {
      const { category, amount } = req.body;
      if (!category || !amount) return res.status(400).json({ error: 'category et amount requis' });
      await client.query(
        `INSERT INTO goals (category, amount)
         VALUES ($1, $2)
         ON CONFLICT (category) DO UPDATE SET amount=$2, updated_at=NOW()`,
        [category, amount]
      );
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { category } = req.query;
      if (!category) return res.status(400).json({ error: 'category requis' });
      await client.query('DELETE FROM goals WHERE category = $1', [category]);
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (err) {
    console.error('[api/goals]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
};

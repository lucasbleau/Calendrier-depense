const { withDb } = require('./_lib');

module.exports = withDb('goals', 'GET,POST,DELETE,OPTIONS', async (req, res, client) => {
  if (req.method === 'GET') {
    const { rows } = await client.query('SELECT category, amount::float AS amount FROM goals');
    const result = {};
    for (const r of rows) result[r.category] = r.amount;
    return res.json(result);
  }

  if (req.method === 'POST') {
    const { category, amount } = req.body;
    if (!category) return res.status(400).json({ error: 'category requis' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'amount invalide' });
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
});

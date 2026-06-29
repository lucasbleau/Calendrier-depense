const { withDb } = require('./_lib');

module.exports = withDb('goals', 'GET,POST,DELETE,OPTIONS', async (req, res, client, uid) => {
  if (req.method === 'GET') {
    const { rows } = await client.query(
      'SELECT category, amount::float AS amount FROM goals WHERE user_id = $1',
      [uid]
    );
    const result = {};
    for (const r of rows) result[r.category] = r.amount;
    return res.json(result);
  }

  if (req.method === 'POST') {
    const { category, amount } = req.body;
    if (!category) return res.status(400).json({ error: 'category requis' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'amount invalide' });
    await client.query(
      `INSERT INTO goals (user_id, category, amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, category) DO UPDATE SET amount=$3, updated_at=NOW()`,
      [uid, category, amount]
    );
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { category } = req.query;
    if (!category) return res.status(400).json({ error: 'category requis' });
    await client.query('DELETE FROM goals WHERE user_id = $1 AND category = $2', [uid, category]);
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
});

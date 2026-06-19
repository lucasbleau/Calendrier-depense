const { withDb, TYPES } = require('./_lib');

module.exports = withDb('recurring', 'GET,POST,DELETE,OPTIONS', async (req, res, client) => {
  if (req.method === 'GET') {
    const { rows } = await client.query(
      'SELECT id, label, amount::float AS amount, type, category, days FROM recurring_tasks ORDER BY created_at ASC'
    );
    return res.json(rows.map(r => {
      let days = [];
      try { days = Array.isArray(r.days) ? r.days : JSON.parse(r.days); } catch { days = []; }
      return { ...r, days };
    }));
  }

  if (req.method === 'POST') {
    const { id, label, amount, type, category, days } = req.body;
    if (!id || !label || !String(label).trim()) return res.status(400).json({ error: 'id et label requis' });
    if (!Number.isFinite(amount) || amount < 0)  return res.status(400).json({ error: 'amount invalide' });
    if (!TYPES.includes(type))                    return res.status(400).json({ error: 'type invalide' });
    if (!Array.isArray(days))                     return res.status(400).json({ error: 'days invalide' });

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
});

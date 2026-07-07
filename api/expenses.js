const { withDb, validateExpense } = require('./_lib');

module.exports = withDb('expenses', 'GET,POST,PUT,DELETE,OPTIONS', async (req, res, client, uid) => {
  // ── GET : récupérer toutes les dépenses de l'utilisateur ─────────────
  if (req.method === 'GET') {
    const { rows } = await client.query(
      `SELECT id, date, label, amount::float AS amount, type, category, recur_id AS "recurId"
       FROM expenses WHERE user_id = $1 ORDER BY date DESC, created_at DESC`,
      [uid]
    );
    return res.json(rows);
  }

  // ── POST : créer une ou plusieurs dépenses ───────────────────────────
  if (req.method === 'POST') {
    const items = Array.isArray(req.body) ? req.body : [req.body];

    for (const item of items) {
      const err = validateExpense(item);
      if (err) return res.status(400).json({ error: err });
    }

    for (const item of items) {
      const { id, date, label, amount, type, category, recurId } = item;
      await client.query(
        `INSERT INTO expenses (id, date, label, amount, type, category, recur_id, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
        [id, date, label, amount, type, category, recurId || null, uid]
      );
    }

    return res.json({ ok: true, count: items.length });
  }

  // ── PUT : modifier une dépense existante (seulement la sienne) ───────
  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Paramètre id requis' });

    const { label, amount, type, category } = req.body;
    const err = validateExpense({ date: req.body.date, label, amount, type });
    if (err) return res.status(400).json({ error: err });

    await client.query(
      'UPDATE expenses SET label = $1, amount = $2, type = $3, category = $4 WHERE id = $5 AND user_id = $6',
      [label, amount, type, category, id, uid]
    );
    return res.json({ ok: true });
  }

  // ── DELETE : supprimer une dépense (seulement la sienne) ─────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Paramètre id requis' });

    await client.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [id, uid]);
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
});

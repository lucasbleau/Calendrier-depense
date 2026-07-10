const { withDb } = require('./_lib');

module.exports = withDb('categories', 'GET,POST,DELETE,OPTIONS', async (req, res, client, uid) => {
  // ── GET : catégories de l'utilisateur ────────────────────────────────────
  if (req.method === 'GET') {
    const { rows } = await client.query(
      'SELECT id, label, color, mode FROM categories WHERE user_id = $1 ORDER BY created_at ASC',
      [uid]
    );
    return res.json(rows);
  }

  // ── POST : créer ou mettre à jour une catégorie (upsert) ─────────────────
  if (req.method === 'POST') {
    const { id, label, color } = req.body;
    if (!id || !label || !color) {
      return res.status(400).json({ error: 'Champs id, label et color requis' });
    }
    const mode = req.body.mode === 'jour' ? 'jour' : 'mois';
    await client.query(
      `INSERT INTO categories (user_id, id, label, color, mode)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, id) DO UPDATE SET label = $3, color = $4, mode = $5`,
      [uid, id, label, color, mode]
    );
    return res.json({ ok: true });
  }

  // ── DELETE : supprimer une catégorie ─────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Paramètre id requis' });

    try {
      await client.query('DELETE FROM categories WHERE user_id = $1 AND id = $2', [uid, id]);
    } catch (err) {
      if (err.code === '23503') {
        return res.status(409).json({ error: 'Catégorie utilisée par des opérations existantes' });
      }
      throw err;
    }
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
});

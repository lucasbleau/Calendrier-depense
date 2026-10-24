const { withDb } = require('./_lib');

// Auto-migration au cold start : colonne `archived` (cf. migrate-cat-archive.sql),
// pour qu'un déploiement ne demande aucune étape manuelle sur la base.
let schemaReady = false;
async function ensureSchema(client) {
  if (schemaReady) return;
  await client.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE');
  schemaReady = true;
}

module.exports = withDb('categories', 'GET,POST,DELETE,OPTIONS', async (req, res, client, uid) => {
  await ensureSchema(client);

  // ── GET : catégories de l'utilisateur ────────────────────────────────────
  if (req.method === 'GET') {
    const { rows } = await client.query(
      'SELECT id, label, color, mode, parent, archived FROM categories WHERE user_id = $1 ORDER BY created_at ASC',
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
    const parent = (typeof req.body.parent === 'string' && req.body.parent && req.body.parent !== id)
      ? req.body.parent : null;
    const archived = req.body.archived === true;
    await client.query(
      `INSERT INTO categories (user_id, id, label, color, mode, parent, archived)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, id) DO UPDATE SET label = $3, color = $4, mode = $5, parent = $6, archived = $7`,
      [uid, id, label, color, mode, parent, archived]
    );
    return res.json({ ok: true });
  }

  // ── DELETE : supprimer une catégorie ─────────────────────────────────────
  // L'objectif manuel n'est que de la config : il part avec la catégorie.
  // Opérations et récurrences restent bloquantes (FK RESTRICT).
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Paramètre id requis' });

    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM goals WHERE user_id = $1 AND category = $2', [uid, id]);
      await client.query('DELETE FROM categories WHERE user_id = $1 AND id = $2', [uid, id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23503') {
        return res.status(409).json({ error: 'Catégorie encore utilisée par des opérations ou des récurrences' });
      }
      throw err;
    }
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
});

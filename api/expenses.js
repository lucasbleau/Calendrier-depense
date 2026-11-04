const { withDb, validateExpense } = require('./_lib');

const MAX_RULES = 500;

// Auto-migration au cold start : libellés normalisés marqués « virement interne »
// (entre comptes de l'utilisateur), jamais importés.
let schemaReady = false;
async function ensureSchema(client) {
  if (schemaReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS transfer_rules (
      user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label_key  TEXT        NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, label_key)
    )`);
  schemaReady = true;
}

const validKey = k => typeof k === 'string' && k.length > 0 && k.length <= 200;

module.exports = withDb('expenses', 'GET,POST,PUT,DELETE,OPTIONS', async (req, res, client, uid) => {
  await ensureSchema(client);

  // ── GET ?transfers=1 : libellés de virements internes ────────────────
  if (req.method === 'GET' && req.query && req.query.transfers) {
    const { rows } = await client.query(
      'SELECT label_key FROM transfer_rules WHERE user_id = $1 ORDER BY label_key', [uid]
    );
    return res.json(rows.map(r => r.label_key));
  }

  // ── POST {action:'transfers', add, remove} ───────────────────────────
  if (req.method === 'POST' && req.body && !Array.isArray(req.body) && req.body.action === 'transfers') {
    const { add = [], remove = [] } = req.body;
    if (!Array.isArray(add) || !Array.isArray(remove) || add.length + remove.length > MAX_RULES ||
        !add.every(validKey) || !remove.every(validKey)) {
      return res.status(400).json({ error: 'règles de virement invalides' });
    }
    await client.query('BEGIN');
    try {
      for (const k of remove) {
        await client.query('DELETE FROM transfer_rules WHERE user_id = $1 AND label_key = $2', [uid, k]);
      }
      for (const k of add) {
        await client.query(
          'INSERT INTO transfer_rules (user_id, label_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [uid, k]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    return res.json({ ok: true });
  }

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

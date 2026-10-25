const { withDb, TYPES } = require('./_lib');

const YM_RE     = /^\d{4}-\d{2}$/;
const DATE_RE   = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BATCH = 500;

// Auto-migration au cold start : montants d'une récurrence modifiés pour un mois
// précis (autrefois en localStorage, donc propres à un appareil).
let schemaReady = false;
async function ensureSchema(client) {
  if (schemaReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS recurring_overrides (
      user_id    TEXT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recur_id   TEXT           NOT NULL REFERENCES recurring_tasks(id) ON DELETE CASCADE,
      ym         TEXT           NOT NULL,
      amount     NUMERIC(10, 2) NOT NULL,
      updated_at TIMESTAMPTZ    DEFAULT NOW(),
      PRIMARY KEY (user_id, recur_id, ym)
    )`);
  // Date de départ : NULL = compte sur tous les mois (récurrences antérieures).
  await client.query('ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS start_date DATE');
  schemaReady = true;
}

const validOverride = o => o && typeof o.recurId === 'string' && o.recurId && YM_RE.test(o.yearMonth);

module.exports = withDb('recurring', 'GET,POST,DELETE,OPTIONS', async (req, res, client, uid) => {
  await ensureSchema(client);

  if (req.method === 'GET') {
    // ?overrides=1 : montants modifiés par mois
    if (req.query && req.query.overrides) {
      const { rows } = await client.query(
        'SELECT recur_id, ym, amount::float AS amount FROM recurring_overrides WHERE user_id = $1',
        [uid]
      );
      return res.json(rows.map(r => ({ recurId: r.recur_id, yearMonth: r.ym, amount: r.amount })));
    }
    const { rows } = await client.query(
      `SELECT id, label, amount::float AS amount, type, category, days,
              to_char(start_date, 'YYYY-MM-DD') AS "startDate"
       FROM recurring_tasks WHERE user_id = $1 ORDER BY created_at ASC`,
      [uid]
    );
    return res.json(rows.map(r => {
      let days = [];
      try { days = Array.isArray(r.days) ? r.days : JSON.parse(r.days); } catch { days = []; }
      return { ...r, days };
    }));
  }

  // ── POST {action:'overrides'} : enregistre / retire des montants mensuels.
  // set: [{recurId, yearMonth, amount}], remove: [{recurId, yearMonth}].
  // onlyMissing: n'écrase pas l'existant (reprise des anciennes valeurs locales).
  // Une récurrence d'un autre compte est ignorée (EXISTS … user_id).
  if (req.method === 'POST' && req.body && req.body.action === 'overrides') {
    const { set = [], remove = [], onlyMissing = false } = req.body;
    if (!Array.isArray(set) || !Array.isArray(remove) || set.length + remove.length > MAX_BATCH ||
        !set.every(o => validOverride(o) && Number.isFinite(o.amount) && o.amount >= 0) ||
        !remove.every(validOverride)) {
      return res.status(400).json({ error: 'overrides invalides' });
    }
    const conflict = onlyMissing ? 'DO NOTHING' : 'DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()';
    await client.query('BEGIN');
    try {
      for (const o of remove) {
        await client.query(
          'DELETE FROM recurring_overrides WHERE user_id = $1 AND recur_id = $2 AND ym = $3',
          [uid, o.recurId, o.yearMonth]
        );
      }
      for (const o of set) {
        await client.query(
          `INSERT INTO recurring_overrides (user_id, recur_id, ym, amount)
           SELECT $1, $2, $3, $4
           WHERE EXISTS (SELECT 1 FROM recurring_tasks WHERE id = $2 AND user_id = $1)
           ON CONFLICT (user_id, recur_id, ym) ${conflict}`,
          [uid, o.recurId, o.yearMonth, o.amount]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    return res.json({ ok: true });
  }

  if (req.method === 'POST') {
    const { id, label, amount, type, category, days, startDate = null } = req.body;
    if (!id || !label || !String(label).trim()) return res.status(400).json({ error: 'id et label requis' });
    if (!Number.isFinite(amount) || amount < 0)  return res.status(400).json({ error: 'amount invalide' });
    if (!TYPES.includes(type))                    return res.status(400).json({ error: 'type invalide' });
    if (!Array.isArray(days))                     return res.status(400).json({ error: 'days invalide' });
    if (startDate !== null && !DATE_RE.test(startDate)) return res.status(400).json({ error: 'startDate invalide' });

    await client.query(
      `INSERT INTO recurring_tasks (id, label, amount, type, category, days, start_date, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE
       SET label=$2, amount=$3, type=$4, category=$5, days=$6, start_date=$7
       WHERE recurring_tasks.user_id = $8`,
      [id, label, amount, type, category, JSON.stringify(days), startDate, uid]
    );
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id requis' });
    await client.query('DELETE FROM recurring_tasks WHERE id = $1 AND user_id = $2', [id, uid]);
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
});

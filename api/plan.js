const { withDb } = require('./_lib');

const DATE_RE   = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BATCH = 2000;

function validEntries(list) {
  return Array.isArray(list) && list.length <= MAX_BATCH &&
    list.every(e => e && typeof e.category === 'string' && e.category && DATE_RE.test(e.date));
}

module.exports = withDb('plan', 'GET,POST,OPTIONS', async (req, res, client, uid) => {
  if (req.method === 'GET') {
    const [daysQ, ratesQ] = await Promise.all([
      client.query('SELECT category, date FROM plan_days WHERE user_id = $1', [uid]),
      client.query('SELECT category, rate::float AS rate FROM plan_rates WHERE user_id = $1', [uid]),
    ]);
    const days = {};
    for (const r of daysQ.rows) (days[r.category] ??= []).push(r.date);
    const rates = {};
    for (const r of ratesQ.rows) rates[r.category] = r.rate;
    return res.json({ days, rates });
  }

  if (req.method === 'POST') {
    const { add = [], remove = [], rates } = req.body || {};
    if (!validEntries(add) || !validEntries(remove)) {
      return res.status(400).json({ error: 'entrées invalides' });
    }

    if (add.length) {
      const values = [];
      const params = [uid];
      for (const e of add) {
        params.push(e.category, e.date);
        values.push(`($1, $${params.length - 1}, $${params.length})`);
      }
      await client.query(
        `INSERT INTO plan_days (user_id, category, date) VALUES ${values.join(',')}
         ON CONFLICT DO NOTHING`,
        params
      );
    }

    if (remove.length) {
      const tuples = [];
      const params = [uid];
      for (const e of remove) {
        params.push(e.category, e.date);
        tuples.push(`($${params.length - 1}, $${params.length})`);
      }
      await client.query(
        `DELETE FROM plan_days WHERE user_id = $1 AND (category, date) IN (${tuples.join(',')})`,
        params
      );
    }

    if (rates && typeof rates === 'object') {
      for (const [category, rate] of Object.entries(rates)) {
        if (!category) continue;
        if (rate === null || rate === 0) {
          await client.query('DELETE FROM plan_rates WHERE user_id = $1 AND category = $2', [uid, category]);
        } else if (Number.isFinite(rate) && rate > 0) {
          await client.query(
            `INSERT INTO plan_rates (user_id, category, rate)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, category) DO UPDATE SET rate = $3, updated_at = NOW()`,
            [uid, category, rate]
          );
        } else {
          return res.status(400).json({ error: 'rate invalide' });
        }
      }
    }

    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
});

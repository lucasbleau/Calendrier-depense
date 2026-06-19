const { Pool } = require('pg');

// Pool partagé entre toutes les routes (réutilisé entre invocations chaudes)
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// Enveloppe commune : CORS, court-circuit OPTIONS, vérif token, client DB + try/finally
function withDb(tag, methods, handler) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-auth-token');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (process.env.APP_TOKEN && req.headers['x-auth-token'] !== process.env.APP_TOKEN) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const client = await pool.connect();
    try {
      return await handler(req, res, client);
    } catch (err) {
      console.error(`[api/${tag}]`, err);
      return res.status(500).json({ error: 'Erreur serveur' });
    } finally {
      client.release();
    }
  };
}

const TYPES = ['depense', 'revenu'];

// Validation légère d'une opération : renvoie un message d'erreur ou null si OK
function validateExpense({ date, label, amount, type }) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return 'date invalide (attendu YYYY-MM-DD)';
  if (!label || !String(label).trim())                    return 'label requis';
  if (!Number.isFinite(amount) || amount < 0)             return 'amount invalide';
  if (!TYPES.includes(type))                              return 'type invalide';
  return null;
}

module.exports = { pool, withDb, TYPES, validateExpense };

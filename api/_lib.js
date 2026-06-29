const crypto = require('crypto');
const { Pool } = require('pg');

// Pool partagé entre toutes les routes (réutilisé entre invocations chaudes)
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Authentification : tokens signés (HMAC) + hachage des PIN (scrypt)
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000; // 30 jours
const SECRET = process.env.APP_TOKEN_SECRET || 'cb-dev-secret-change-me';

// Token stateless : base64url(payload) + '.' + HMAC_SHA256(payload). Encode l'user_id
// et une expiration. Aucune table de sessions : la vérif recalcule la signature.
function signToken(uid) {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

// Renvoie l'user_id si le token est valide et non expiré, sinon null.
function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
  if (!data || !data.uid || !data.exp || Date.now() > data.exp) return null;
  return data.uid;
}

function hashPin(pin, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPin(pin, hash, salt) {
  const h = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  const a = Buffer.from(h);
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Catégories seedées à l'inscription : strict minimum structurel (catégorie de
// revenu + fourre-tout). Chaque utilisateur construit ensuite ses propres
// catégories. Doit rester aligné avec INCOME_CATEGORY / DEFAULT_CATEGORY (app.js).
const DEFAULT_CATEGORIES = [
  ['revenus', 'Revenus', '#4A7C59'],
  ['autre',   'Autre',   '#9A9888'],
];

// ─────────────────────────────────────────────────────────────────────────────
// Enveloppe commune des routes de données : CORS, OPTIONS, AUTH, client DB
// ─────────────────────────────────────────────────────────────────────────────

// Le handler reçoit (req, res, client, uid). L'uid provient UNIQUEMENT du token
// vérifié — jamais du body/query — ce qui garantit l'isolation entre utilisateurs.
function withDb(tag, methods, handler) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-auth-token');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const uid = verifyToken(req.headers['x-auth-token']);
    if (!uid) return res.status(401).json({ error: 'Non autorisé' });

    const client = await pool.connect();
    try {
      return await handler(req, res, client, uid);
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

module.exports = {
  pool, withDb, TYPES, validateExpense,
  signToken, verifyToken, hashPin, verifyPin, DEFAULT_CATEGORIES,
};

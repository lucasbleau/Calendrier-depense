const { PrismaClient } = require('@prisma/client');

// Singleton : évite de créer trop de connexions dans les fonctions serverless
const prisma = global.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── GET : récupérer toutes les dépenses ──────────────────────────────
    if (req.method === 'GET') {
      const expenses = await prisma.expense.findMany({
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        select: { id: true, date: true, label: true, amount: true, type: true, category: true },
      });
      return res.json(expenses);
    }

    // ── POST : créer une ou plusieurs dépenses ───────────────────────────
    if (req.method === 'POST') {
      const items = Array.isArray(req.body) ? req.body : [req.body];

      await prisma.expense.createMany({
        data: items.map(({ id, date, label, amount, type, category }) => ({
          id, date, label, amount: parseFloat(amount), type, category,
        })),
        skipDuplicates: true,
      });

      return res.json({ ok: true, count: items.length });
    }

    // ── DELETE : supprimer une dépense ───────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Paramètre id requis' });

      await prisma.expense.deleteMany({ where: { id } });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });

  } catch (err) {
    console.error('[api/expenses]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

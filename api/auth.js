module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { pin } = req.body;
  if (!pin || !pin.trim()) return res.status(400).json({ ok: false });

  if (process.env.APP_PIN && pin !== process.env.APP_PIN) {
    return res.status(401).json({ ok: false });
  }

  return res.json({ ok: true, token: process.env.APP_TOKEN || 'cb-open' });
};

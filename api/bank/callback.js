// Retour de la banque après autorisation (redirect_url déclarée dans Enable Banking).
// Pas de token ici (navigation de la banque) : on renvoie vers l'appli, qui finalise
// la connexion avec son token (POST /api/bank {action:'session'}) — le state est
// vérifié côté serveur contre l'utilisateur qui l'a émis.
module.exports = (req, res) => {
  const q = req.query || {};
  const pick = v => encodeURIComponent(String(Array.isArray(v) ? v[0] : v || '').slice(0, 512));
  const target = q.code
    ? `/?bank_code=${pick(q.code)}&bank_state=${pick(q.state)}`
    : `/?bank_error=${pick(q.error_description || q.error || 'Connexion annulée')}`;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.statusCode = 302;
  res.setHeader('Location', target);
  res.end();
};

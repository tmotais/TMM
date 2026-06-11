import { applyCors, clientIp, fail } from './_lib/http.mjs';
import { kvGet, kvSet } from './_lib/kv.mjs';
import { rateLimit } from './_lib/ratelimit.mjs';

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { name, role, textFr, textEn } = req.body || {};
  if (!name || (!textFr && !textEn)) {
    return res.status(400).json({ error: 'Nom et témoignage requis' });
  }

  if (String(name).length > 100 || String(role || '').length > 150
      || String(textFr || '').length > 2000 || String(textEn || '').length > 2000) {
    return res.status(400).json({ error: 'Texte trop long' });
  }
  const ip = clientIp(req);
  if (!(await rateLimit('testimonial', ip, 5, 60 * 60))) {
    return fail(res, 429, 'Trop de soumissions. Réessayez plus tard.');
  }

  try {
    const pending = await kvGet('testimonials-pending') || [];
    pending.push({
      id: Date.now().toString(),
      name: name.trim(),
      role: (role || '').trim(),
      textFr: (textFr || '').trim(),
      textEn: (textEn || '').trim(),
      submittedAt: new Date().toISOString(),
    });
    await kvSet('testimonials-pending', pending);
    return res.status(200).json({ success: true });
  } catch (err) {
    return fail(res, 500, 'Erreur serveur', err);
  }
}

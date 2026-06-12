import { applyCors, fail } from './_lib/http.mjs';
import { kvGet } from './_lib/kv.mjs';

export default async function handler(req, res) {
  if (applyCors(req, res, 'GET, OPTIONS')) return;

  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Code requis' });

  try {
    const galleries = await kvGet('galleries') || [];
    if (!galleries.length) return res.status(404).json({ error: 'Aucune galerie trouvée' });

    const match = galleries.find(g => g.code && g.code.toUpperCase() === code.toUpperCase());

    if (!match) return res.status(404).json({ error: 'Code introuvable' });

    return res.json({
      name: match.name,
      date: match.date || '',
      url: match.url,
    });
  } catch (err) {
    return fail(res, 500, 'Erreur serveur', err);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Code requis' });

  try {
    // Fetch galleries from KV
    const r = await fetch(`${process.env.KV_REST_API_URL}/get/galleries`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const data = await r.json();
    if (!data.result) return res.status(404).json({ error: 'Aucune galerie trouvée' });

    const galleries = JSON.parse(data.result);
    const match = galleries.find(g => g.code && g.code.toUpperCase() === code.toUpperCase());

    if (!match) return res.status(404).json({ error: 'Code introuvable' });

    return res.json({
      name: match.name,
      date: match.date || '',
      url: match.url,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

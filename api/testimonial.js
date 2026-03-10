export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { name, role, textFr, textEn } = req.body || {};
  if (!name || (!textFr && !textEn)) {
    return res.status(400).json({ error: 'Nom et témoignage requis' });
  }

  async function kvGet(key) {
    const r = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const data = await r.json();
    if (!data.result) return null;
    const parsed = JSON.parse(data.result);
    if (typeof parsed === 'string') {
      try { return JSON.parse(parsed); } catch { return parsed; }
    }
    return parsed;
  }

  async function kvSet(key, value) {
    await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(JSON.stringify(value)),
    });
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
    return res.status(500).json({ error: err.message });
  }
}

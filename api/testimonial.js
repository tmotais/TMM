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

    // Notification email à l'admin
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Thibault Motais Media <contact@thibaultmotais.com>',
          to: 'thibaultmotaismedia@gmail.com',
          subject: `[TMM] Nouveau témoignage — ${name.trim()}`,
          html: `
            <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0e0e0e;color:#d4d0c8;padding:40px;">
              <h2 style="color:#C8A96E;font-weight:300;letter-spacing:2px;text-transform:uppercase;font-size:14px;">Nouveau témoignage reçu</h2>
              <hr style="border:none;border-top:1px solid #232323;margin:20px 0;">
              <p><strong style="color:#C8A96E;">Nom :</strong> ${name.trim()}</p>
              ${(role || '').trim() ? `<p><strong style="color:#C8A96E;">Rôle :</strong> ${role.trim()}</p>` : ''}
              ${(textFr || '').trim() ? `<p><strong style="color:#C8A96E;">Témoignage (FR) :</strong></p><p style="line-height:1.8;">${textFr.trim()}</p>` : ''}
              ${(textEn || '').trim() ? `<p><strong style="color:#C8A96E;">Testimonial (EN) :</strong></p><p style="line-height:1.8;">${textEn.trim()}</p>` : ''}
              <hr style="border:none;border-top:1px solid #232323;margin:20px 0;">
              <p><a href="https://thibaultmotais.com/admin" style="color:#C8A96E;">Voir dans le panel admin →</a></p>
            </div>
          `,
        }),
      });
    } catch (_) {
      // Ne pas bloquer la soumission si l'email échoue
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { firstName, lastName, email, projectType, message } = req.body;

  if (!firstName || !email || !message) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  const emailHtml = `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0e0e0e;color:#d4d0c8;padding:40px;">
      <h2 style="color:#C8A96E;font-weight:300;letter-spacing:2px;text-transform:uppercase;font-size:14px;">Nouveau message — Thibault Motais Media</h2>
      <hr style="border:none;border-top:1px solid #232323;margin:20px 0;">
      <p><strong style="color:#C8A96E;">Nom :</strong> ${firstName} ${lastName}</p>
      <p><strong style="color:#C8A96E;">Email :</strong> <a href="mailto:${email}" style="color:#d4d0c8;">${email}</a></p>
      <p><strong style="color:#C8A96E;">Projet :</strong> ${projectType || 'Non spécifié'}</p>
      <hr style="border:none;border-top:1px solid #232323;margin:20px 0;">
      <p><strong style="color:#C8A96E;">Message :</strong></p>
      <p style="line-height:1.8;">${message.replace(/\n/g, '<br>')}</p>
    </div>
  `;

  try {
    // Email to Thibault
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'contact@thibaultmotais.com',
        to: 'contact@thibaultmotais.com',
        reply_to: email,
        subject: `[TMM] ${firstName} ${lastName} — ${projectType || 'Nouveau message'}`,
        html: emailHtml,
      }),
    });

    // Auto-reply to client
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Thibault Motais Media <contact@thibaultmotais.com>',
        to: email,
        subject: 'Message reçu — Thibault Motais Media',
        html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0e0e0e;color:#d4d0c8;padding:40px;">
            <h2 style="color:#C8A96E;font-weight:300;letter-spacing:2px;text-transform:uppercase;font-size:14px;">Thibault Motais Media</h2>
            <hr style="border:none;border-top:1px solid #232323;margin:20px 0;">
            <p>Bonjour ${firstName},</p>
            <p style="line-height:1.8;">Merci pour votre message ! Je vous reviens sous 24h.</p>
            <p>À bientôt,<br><strong style="color:#C8A96E;">Thibault</strong></p>
            <hr style="border:none;border-top:1px solid #232323;margin:20px 0;">
            <p style="font-size:11px;color:#5a5a5a;">thibaultmotais.com</p>
          </div>
        `,
      }),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

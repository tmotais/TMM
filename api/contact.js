import { applyCors, clientIp, fail, escapeHtml } from './_lib/http.mjs';
import { rateLimit } from './_lib/ratelimit.mjs';

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Validate environment
  if (!process.env.RESEND_API_KEY) {
    console.error('[Contact API] RESEND_API_KEY not configured');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const ip = clientIp(req);
  if (!(await rateLimit('contact', ip, 5, 60 * 60))) {
    return fail(res, 429, 'Trop de messages envoyés. Réessayez plus tard.');
  }

  const { firstName, lastName, email, projectType, message } = req.body;

  if (!firstName || !email || !message) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  if (String(message).length > 5000 || String(firstName).length > 100) {
    return res.status(400).json({ error: 'Message trop long' });
  }
  const e = {
    firstName: escapeHtml(firstName), lastName: escapeHtml(lastName),
    email: escapeHtml(email), projectType: escapeHtml(projectType),
    message: escapeHtml(message),
  };

  const emailHtml = `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0e0e0e;color:#d4d0c8;padding:40px;">
      <h2 style="color:#C8A96E;font-weight:300;letter-spacing:2px;text-transform:uppercase;font-size:14px;">Nouveau message — Thibault Motais Media</h2>
      <hr style="border:none;border-top:1px solid #232323;margin:20px 0;">
      <p><strong style="color:#C8A96E;">Nom :</strong> ${e.firstName} ${e.lastName}</p>
      <p><strong style="color:#C8A96E;">Email :</strong> <a href="mailto:${e.email}" style="color:#d4d0c8;">${e.email}</a></p>
      <p><strong style="color:#C8A96E;">Projet :</strong> ${e.projectType || 'Non spécifié'}</p>
      <hr style="border:none;border-top:1px solid #232323;margin:20px 0;">
      <p><strong style="color:#C8A96E;">Message :</strong></p>
      <p style="line-height:1.8;">${e.message.replace(/\n/g, '<br>')}</p>
    </div>
  `;

  try {
    // Email to Thibault
    const resendResponse = await fetch('https://api.resend.com/emails', {
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

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json();
      console.error('[Contact API] Resend error:', errorData);
      return fail(res, 500, 'Erreur du service email', errorData);
    }

    const sendData = await resendResponse.json();
    console.log('[Contact API] Email sent to admin:', sendData.id);

    // Auto-reply to client
    const replyResponse = await fetch('https://api.resend.com/emails', {
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
            <p>Bonjour ${e.firstName},</p>
            <p style="line-height:1.8;">Merci pour votre message ! Je vous reviens sous 24h.</p>
            <p>À bientôt,<br><strong style="color:#C8A96E;">Thibault</strong></p>
            <hr style="border:none;border-top:1px solid #232323;margin:20px 0;">
            <p style="font-size:11px;color:#5a5a5a;">thibaultmotais.com</p>
          </div>
        `,
      }),
    });

    if (!replyResponse.ok) {
      const errorData = await replyResponse.json();
      console.error('[Contact API] Auto-reply error:', errorData);
      // Don't fail if auto-reply fails, admin email was sent
    } else {
      const replyData = await replyResponse.json();
      console.log('[Contact API] Auto-reply sent to client:', replyData.id);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Contact API] Error:', err.message);
    return fail(res, 500, 'Erreur du service email', err);
  }
}

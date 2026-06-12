const ORIGIN = 'https://thibaultmotais.com';

export function applyCors(req, res, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : (fwd || '');
  return raw.split(',')[0].trim() || 'unknown';
}

// Message générique pour le client, détail dans les logs Vercel uniquement.
export function fail(res, status, publicMessage, err) {
  if (err) console.error(`[api] ${publicMessage}:`, err);
  return res.status(status).json({ error: publicMessage });
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

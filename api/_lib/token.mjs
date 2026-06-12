import crypto from 'crypto';

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function createToken(secret, ttlMs = 24 * 60 * 60 * 1000) {
  const expiry = String(Date.now() + ttlMs);
  return `${expiry}.${sign(expiry, secret)}`;
}

export function verifyToken(token, secret) {
  if (typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const expiry = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(expiry) || !sig) return false;
  if (Number(expiry) < Date.now()) return false;
  return timingSafeEqualStr(sig, sign(expiry, secret));
}

export function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba); // temps constant même sur longueurs differentes
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

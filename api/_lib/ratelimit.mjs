import { kvIncrWithTtl } from './kv.mjs';

// true = autorisé, false = limite atteinte. Fail-open si le KV est injoignable.
export async function rateLimit(bucket, ip, limit, windowSec) {
  try {
    const count = await kvIncrWithTtl(`rl:${bucket}:${ip}`, windowSec);
    return count <= limit;
  } catch (err) {
    console.error('[ratelimit] KV error:', err);
    return true;
  }
}

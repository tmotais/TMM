async function cmd(path, opts = {}) {
  const r = await fetch(`${process.env.KV_REST_API_URL}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, ...(opts.headers || {}) },
  });
  return r.json();
}

export async function kvGet(key) {
  const data = await cmd(`/get/${key}`);
  if (!data.result) return null;
  const parsed = JSON.parse(data.result);
  // données legacy double-encodées
  if (typeof parsed === 'string') { try { return JSON.parse(parsed); } catch { return parsed; } }
  return parsed;
}

export async function kvSet(key, value) {
  await cmd(`/set/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value)),
  });
}

export async function kvIncrWithTtl(key, ttlSeconds) {
  const { result: count } = await cmd(`/incr/${key}`);
  if (count === 1) await cmd(`/expire/${key}/${ttlSeconds}`);
  return count;
}

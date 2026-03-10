export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

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

  try {
    const posts = await kvGet('blog-posts') || [];
    const published = posts
      .filter(p => p.published)
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    const { slug } = req.query;

    if (slug) {
      const post = published.find(p => p.slug === slug);
      if (!post) return res.status(404).json({ error: 'Article introuvable' });
      return res.json(post);
    }

    // Liste sans contenu complet (juste extrait)
    const list = published.map(p => ({
      id: p.id,
      slug: p.slug,
      titleFr: p.titleFr,
      titleEn: p.titleEn,
      excerptFr: (p.contentFr || '').replace(/<[^>]*>/g, '').substring(0, 160) + '...',
      excerptEn: (p.contentEn || '').replace(/<[^>]*>/g, '').substring(0, 160) + '...',
      coverImage: p.coverImage,
      publishedAt: p.publishedAt,
    }));

    return res.json(list);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

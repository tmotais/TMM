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
    const [content, photos, galleries] = await Promise.all([
      kvGet('site-content'),
      kvGet('portfolio-photos'),
      kvGet('galleries'),
    ]);
    const c = content || getDefaultContent();
    // Only expose public fields — never expose admin data
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.json({
      hero: c.hero,
      about: c.about,
      testimonials: c.testimonials || [],
      portfolioPhotos: photos || [],
      galleries: galleries || [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function getDefaultContent() {
  return {
    hero: {
      fr: { title: "L'image qui parle.", subtitle: "Portraits, événements, sport & contenu corporatif" },
      en: { title: "The image that speaks.", subtitle: "Portraits, events, sport & corporate content" }
    },
    about: {
      fr: { text1: "Basé à Montréal, je travaille avec des individus, des entreprises et des organisations pour créer du contenu visuel qui raconte une histoire.", text2: "Sony A1 II. Galerie Pictime. Livraison 48-72h. Devis sous 24h." },
      en: { text1: "Based in Montreal, I work with individuals, businesses and organizations to create visual content that tells a story.", text2: "Sony A1 II. Pictime gallery. 48-72h delivery. Quote within 24h." }
    },
    testimonials: []
  };
}

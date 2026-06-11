import { applyCors, fail } from './_lib/http.mjs';
import { kvGet } from './_lib/kv.mjs';

export default async function handler(req, res) {
  if (applyCors(req, res, 'GET, OPTIONS')) return;

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
    return fail(res, 500, 'Erreur serveur', err);
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

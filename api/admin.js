import { put, del } from '@vercel/blob';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  if (action === 'login' && req.method === 'POST') {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
      return res.status(200).json({ success: true, token: process.env.ADMIN_PASSWORD });
    }
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  async function kvGet(key) {
    const r = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const data = await r.json();
    if (!data.result) return null;
    const parsed = JSON.parse(data.result);
    // Handle double-encoded strings (legacy data)
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
    switch (action) {
      case 'get-content': return res.json(await kvGet('site-content') || getDefaultContent());
      case 'save-content': await kvSet('site-content', req.body); return res.json({ success: true });
      case 'get-galleries': return res.json(await kvGet('galleries') || []);
      case 'save-galleries': await kvSet('galleries', req.body); return res.json({ success: true });
      case 'get-products': return res.json(await kvGet('products') || getDefaultProducts());
      case 'save-products': await kvSet('products', req.body); return res.json({ success: true });
      case 'get-pending-testimonials': return res.json(await kvGet('testimonials-pending') || []);
      case 'clear-pending': await kvSet('testimonials-pending', []); return res.json({ success: true });
      case 'approve-testimonial': {
        const { id } = req.body;
        const pending = await kvGet('testimonials-pending') || [];
        const item = pending.find(t => t.id === id);
        if (!item) return res.status(404).json({ error: 'Introuvable' });
        const siteContent = await kvGet('site-content') || getDefaultContent();
        siteContent.testimonials = [...(siteContent.testimonials || []), { name: item.name, role: item.role, textFr: item.textFr, textEn: item.textEn }];
        await kvSet('site-content', siteContent);
        await kvSet('testimonials-pending', pending.filter(t => t.id !== id));
        return res.json({ success: true });
      }
      case 'reject-testimonial': {
        const { id } = req.body;
        const pending = await kvGet('testimonials-pending') || [];
        await kvSet('testimonials-pending', pending.filter(t => t.id !== id));
        return res.json({ success: true });
      }

      // Portfolio photo management
      case 'get-portfolio-photos':
        return res.json(await kvGet('portfolio-photos') || []);

      case 'upload-photo': {
        const { base64, category, label } = req.body;
        if (!base64) return res.status(400).json({ error: 'Aucune image fournie' });

        const matches = base64.match(/^data:image\/(\w+);base64,(.+)$/s);
        if (!matches) return res.status(400).json({ error: 'Format image invalide' });
        const [, ext, data] = matches;
        const buffer = Buffer.from(data, 'base64');
        const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const filename = `portfolio-${Date.now()}.${ext === 'png' ? 'png' : 'jpg'}`;

        const blob = await put(filename, buffer, {
          access: 'public',
          contentType,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });

        const photos = await kvGet('portfolio-photos') || [];
        const newPhoto = {
          id: `${Date.now()}`,
          url: blob.url,
          category: category || 'portraits',
          label: label || '',
        };
        photos.push(newPhoto);
        await kvSet('portfolio-photos', photos);
        return res.json({ success: true, photo: newPhoto });
      }

      case 'delete-photo': {
        const { id } = req.body;
        const photos = await kvGet('portfolio-photos') || [];
        const photo = photos.find(p => p.id === id);
        if (!photo) return res.status(404).json({ error: 'Photo introuvable' });

        try {
          await del(photo.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch {
          // Continue even if blob deletion fails (e.g. already deleted)
        }

        await kvSet('portfolio-photos', photos.filter(p => p.id !== id));
        return res.json({ success: true });
      }

      case 'save-portfolio-photos': {
        await kvSet('portfolio-photos', req.body);
        return res.json({ success: true });
      }

      default: return res.status(400).json({ error: 'Action inconnue' });
    }
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
    testimonials: [
      { name: "Prénom Nom", role: "Titre, Organisation", textFr: "Votre témoignage ici.", textEn: "Your testimonial here." },
      { name: "Prénom Nom", role: "Titre, Organisation", textFr: "Votre témoignage ici.", textEn: "Your testimonial here." },
      { name: "Prénom Nom", role: "Titre, Organisation", textFr: "Votre témoignage ici.", textEn: "Your testimonial here." },
    ]
  };
}

function getDefaultProducts() {
  return [
    { id: "print-sm", name: 'Print 8x10"', nameFr: 'Tirage 8x10"', descFr: "Impression fine art, papier mat 300g", descEn: "Fine art print, 300g matte paper", price: 75, available: true },
    { id: "print-md", name: 'Print 11x14"', nameFr: 'Tirage 11x14"', descFr: "Impression fine art, papier mat 300g", descEn: "Fine art print, 300g matte paper", price: 125, available: true },
    { id: "print-lg", name: 'Print 16x20"', nameFr: 'Tirage 16x20"', descFr: "Impression fine art, papier mat 300g", descEn: "Fine art print, 300g matte paper", price: 200, available: true },
    { id: "print-xl", name: 'Print 20x30"', nameFr: 'Tirage 20x30"', descFr: "Impression fine art grand format", descEn: "Large format fine art print", price: 350, available: true },
  ];
}

# TMM — Correctifs sécurité puis redesign

Date : 2026-06-11
Site : thibaultmotais.com (repo tmotais/TMM, déployé sur Vercel)
Snapshot avant travaux : tag git `pre-redesign-20260611` + dossier `TMM-backup-20260611` (30 photos Blob, contenu KV public, 5 pages live, bundle git).

## Contexte

Site vitrine de photographe : 5 pages HTML statiques (index, portfolio, tarifs, galeries, contact) + panel admin + 6 fonctions API Vercel (admin, contact, content, gallery, testimonial, checkout). Contenu dynamique dans Vercel KV, photos dans Vercel Blob, emails via Resend, paiements via Stripe Checkout.

L'audit du 2026-06-11 a révélé des failles de sécurité exploitables en production et un design générique ("noir + doré + serif italique") que le propriétaire veut remplacer. Décision : corriger la sécurité d'abord (phase 1), redesigner ensuite (phase 2).

**Correction de positionnement** : Thibault est photographe, PAS vidéaste. Le site actuel dit "Photographe & Vidéaste" partout — toute mention de vidéo/vidéaste disparaît en phase 2 (sauf le témoignage de Charlotte Cénac, écrit par la cliente, conservé tel quel).

## Phase 1 — Sécurité et fondations (à livrer avant tout changement visuel)

### 1.1 Checkout Stripe : prix côté serveur (critique)

`api/checkout.js` accepte `price` depuis le body client. N'importe qui peut acheter un tirage à 0,01 $.

- Le client n'envoie plus que `productId`.
- L'API relit le produit depuis le KV `products` (fallback : produits par défaut du code) et utilise `product.price` et `product.nameFr` pour créer la session Stripe.
- `productId` inconnu ou `available: false` → 400.
- `cancel_url` corrigée : pointe actuellement vers `/#store`, ancre morte → `/tarifs`.

### 1.2 Authentification admin : vrai token de session

`api/admin.js` renvoie le mot de passe admin comme "token" (stocké en localStorage), comparaison non timing-safe, aucun rate limit.

- Login réussi → token signé HMAC-SHA256 : `base64(expiry).base64(hmac(expiry, SESSION_SECRET))`, expiration 24 h. Nouvelle variable d'env Vercel : `SESSION_SECRET` (générée aléatoirement, à créer dans le dashboard Vercel avant déploiement).
- Vérification du mot de passe et du token en `crypto.timingSafeEqual`.
- Rate limit login : 5 échecs / 15 min par IP (`x-forwarded-for`), compteur dans le KV avec TTL (clé `rl:login:<ip>`, commande `SET ... EX` de l'API REST KV).
- Le panel admin stocke le token (inchangé côté UX), mais le token n'est plus le mot de passe.

### 1.3 XSS : échappement systématique

Témoignages publics et galeries sont injectés en `innerHTML` sans échappement sur index et admin → XSS stocké, qui combiné à 1.2 permettait de voler le mot de passe admin.

- Helper `escapeHtml()` dans le JS partagé, appliqué à toute donnée dynamique avant insertion (`name`, `role`, `textFr`, `textEn`, `title`, `date`, `label`...), sur les pages publiques ET le panel admin.
- URLs de galeries : seules les URLs `https://` sont rendues (validation à l'affichage et à la sauvegarde admin).
- Limites de taille à la soumission de témoignage : name ≤ 100, role ≤ 150, textes ≤ 2000 caractères.

### 1.4 Headers de sécurité (vercel.json)

- `Content-Security-Policy` en **Report-Only** d'abord ; passage en mode bloquant après une semaine sans rapport d'erreur. Directives : `default-src 'self'`, images self + blob Vercel + data:, styles self + inline + Google Fonts, scripts self + inline (les pages utilisent des handlers inline — toléré en phase 1, nettoyé en phase 2), `frame-ancestors 'none'`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

### 1.5 Durcissement API

- CORS : `Access-Control-Allow-Origin: https://thibaultmotais.com` partout (au lieu de `*`).
- Rate limit sur `/api/contact` et `/api/testimonial` : 5 requêtes / heure / IP (même mécanisme KV que 1.2) — protège le quota Resend et le KV.
- Échappement HTML des champs injectés dans les emails Resend (`firstName`, `lastName`, `email`, `projectType`, `message`).
- Messages d'erreur génériques côté client ; le détail (`err.message`) part dans `console.error` (logs Vercel) uniquement.

### 1.6 Hygiène repo

- `.gitattributes` : `* text=auto eol=lf` (élimine le bruit CRLF permanent sur NTFS).
- Suppression des branches mortes : `portfolio-update`, `claude/cranky-swanson`, `claude/condescending-curie` (locales et distantes).

### Vérification phase 1

Script `tests/api-tests.sh` (curl) : login mauvais mot de passe → 401, rate limit après 5 essais → 429, checkout avec faux prix dans le body → le prix serveur est utilisé, checkout `productId` inconnu → 400, témoignage avec `<script>` → stocké mais rendu échappé, headers présents sur les 5 pages. Test manuel du panel admin (login, upload photo, approbation témoignage) avant et après.

## Phase 2 — Redesign (décisions validées en brainstorm visuel)

### Direction

- **Ambiance** : sombre neutre (`#0c0c0d` fond, `#141416` surfaces, `#232326` lignes), texte `#ececec`/`#9a9a9a`. Zéro doré. CTAs en blanc plein, arrondis pill.
- **Typographie** : Fraunces (titres, poids 500-600) + Inter (corps). Remplace Cormorant Garamond + Outfit. `display=swap` + preload.
- **Supprimés** : curseur custom + son JS, grain SVG, eyebrows majuscules espacées, italiques décoratives, stats "Sony A1 II" (le matériel n'est pas un argument client).
- **Bilingue FR/EN conservé**, mécanisme `data-lang` actuel, toggle discret dans la nav.
- Maquette de référence : `.superpowers/brainstorm/2014-1781175722/content/maquette-accueil-v2.html`.

### Page d'accueil

1. Nav fixe sobre (logo texte, liens, toggle FR/EN).
2. Hero split : gauche titre Fraunces "Photographe à Montréal." + sous-texte + 2 CTAs ; droite photo portrait pleine hauteur (~86vh).
3. Bande de faits : 48 h livraison / 24 h devis / Montréal — déplacements partout au Québec.
4. "Travail récent" : 3 photos cliquables (une par catégorie phare) → portfolio filtré.
5. Témoignage : citation unique pleine largeur centrée en Fraunces (Charlotte Cénac). Passage en grille/carrousel quand il y en aura 3+. Lien "Laisser un témoignage" (modal conservée, restylée).
6. Accès galerie privée : bloc avec champ code directement sur l'accueil (utilise `/api/gallery?code=`).
7. Footer minimal.

### Autres pages

- **Portfolio** : grille filtrable par catégorie (portraits / sport / événements / nature), lightbox conservée, images via optimisation Vercel.
- **Tarifs** : cartes sobres sur surface, même peau. Lien checkout → flux 1.1.
- **Galeries** : page conservée pour le lien direct, accès principal = bloc accueil.
- **Contact** : formulaire épuré, logique Resend inchangée.
- **Admin** : re-skin léger (couleurs/typo), aucune fonctionnalité modifiée.
- **Textes** : "Photographe" partout (plus de "& Vidéaste"), meta descriptions et title mis à jour.

### Architecture front

- `public/styles.css` et `public/site.js` partagés, chargés par les 5 pages + admin (fin des ~2 500 lignes dupliquées). Les handlers inline migrent vers `site.js` (permet de durcir la CSP : suppression de `'unsafe-inline'` scripts).
- Images responsive : config `images` dans `vercel.json` + URLs `/_vercel/image?url=...&w=480|960|1600&q=75` en `srcset` sur la grille portfolio, le hero et "Travail récent". Caveat : l'optimisation d'images Vercel a un quota sur le plan Hobby (5 000 images source/mois) — largement suffisant ici.
- Lazy loading conservé, JS curseur supprimé, `scroll reveal` simplifié (IntersectionObserver conservé, transitions plus courtes).

### Vérification phase 2

- Lighthouse mobile avant/après sur l'accueil et le portfolio (cible : ≥ 90 perf, 100 accessibilité de base).
- Vérification visuelle des 5 pages + admin à 375 px / 768 px / 1440 px.
- Parcours complets : contact, soumission + approbation témoignage, accès galerie par code, login admin, upload photo, checkout Stripe en mode test.
- Re-test du script `tests/api-tests.sh`.

## Déploiement

Travail sur branche `redesign-2026`, previews Vercel par commit. Phase 1 mergée et déployée en production seule d'abord (avec `SESSION_SECRET` créée au préalable), vérifiée en prod, puis phase 2. Rollback possible via le tag `pre-redesign-20260611` et le backup.

## Hors scope

Pas de nouvelles sections (vidéo, blog, boutique), pas de migration de framework, pas de refonte de l'admin au-delà du re-skin, pas de changement Resend/Stripe/KV/Blob.

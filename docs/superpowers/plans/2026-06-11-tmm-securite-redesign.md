# TMM Sécurité + Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les failles de sécurité du site thibaultmotais.com puis appliquer le redesign validé (sombre neutre, Fraunces/Inter, hero split), en deux livraisons séparées.

**Architecture:** Site statique Vercel (5 pages HTML racine + admin) + fonctions API ESM dans `api/`. Phase 1 introduit `api/_lib/*.mjs` (helpers partagés : KV, CORS, rate-limit, token HMAC) et durcit chaque endpoint. Phase 2 extrait `styles.css`/`site.js` partagés et réécrit la peau des pages selon la maquette `.superpowers/brainstorm/2014-1781175722/content/maquette-accueil-v2.html`.

**Tech Stack:** Vanilla HTML/CSS/JS, fonctions Vercel Node ESM, Vercel KV (REST Upstash), Vercel Blob, Resend. Tests : `node --test` pour les modules purs, script curl pour l'intégration.

**Référence spec :** `docs/superpowers/specs/2026-06-11-tmm-securite-redesign-design.md`

**Écart vs spec :** la spec demandait de corriger `api/checkout.js` (prix serveur). Vérification faite : aucune page n'appelle cet endpoint (la boutique a été retirée du site, `cancel_url` pointe vers une ancre morte) et la boutique est hors scope. Le plan **supprime** l'endpoint et `success.html` au lieu de les corriger — moins de surface d'attaque, restaurable via git.

**Prérequis avant Task 4 (ACTION UTILISATEUR) :** créer la variable d'env `SESSION_SECRET` dans Vercel (Production + Preview) : générer avec `openssl rand -hex 32`, puis dashboard Vercel → tmm → Settings → Environment Variables (ou `npx vercel env add SESSION_SECRET`).

**Modèle de déploiement :** branche `redesign-2026` poussée → Vercel crée un déploiement preview par commit. Les tests d'intégration se lancent contre l'URL de preview (`BASE_URL`). Phase 1 est mergée et vérifiée en production AVANT de commencer la phase 2.

---

## Phase 1 — Sécurité

### Task 1: Branche, .gitattributes, nettoyage branches

**Files:**
- Create: `.gitattributes`
- Modify: `.gitignore` (créer s'il n'existe pas)

- [ ] **Step 1: Créer la branche de travail**

```bash
cd "/mnt/c/Users/thibaultmdn/Documents/06_Dev_Projets/Claude_Projects/TMM"
git checkout -b redesign-2026
```

- [ ] **Step 2: Écrire `.gitattributes`**

```gitattributes
* text=auto eol=lf
*.jpg binary
*.png binary
*.webp binary
*.zip binary
*.bundle binary
```

- [ ] **Step 3: Ajouter `.superpowers/` au `.gitignore`**

Créer (ou compléter) `.gitignore` :

```gitignore
node_modules/
.superpowers/
.vercel
```

- [ ] **Step 4: Renormaliser les fins de ligne et vérifier**

```bash
git add .gitattributes .gitignore
git add --renormalize .
git status --short
```

Attendu : les 10 fichiers au bruit CRLF apparaissent en staged ; `git diff --cached -w --stat` ne doit montrer AUCUN changement non-whitespace.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: normalise les fins de ligne (LF) et ignore .superpowers"
```

- [ ] **Step 6: Supprimer les branches mortes (validé en brainstorm)**

```bash
git branch -D portfolio-update claude/cranky-swanson claude/condescending-curie
git push origin --delete claude/cranky-swanson claude/condescending-curie
```

Note : `claude/cranky-swanson` locale contient 1 commit non poussé ("up") — suppression confirmée par le propriétaire. `portfolio-update` n'existe qu'en local.

### Task 2: Helpers partagés `api/_lib/`

Les fichiers commençant par `_` dans `api/` ne sont pas exposés comme routes par Vercel.

**Files:**
- Create: `api/_lib/http.mjs`
- Create: `api/_lib/kv.mjs`
- Create: `api/_lib/ratelimit.mjs`

- [ ] **Step 1: Écrire `api/_lib/http.mjs`**

```js
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
```

- [ ] **Step 2: Écrire `api/_lib/kv.mjs`** (remplace les kvGet/kvSet dupliqués dans 3 endpoints)

```js
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
```

- [ ] **Step 3: Écrire `api/_lib/ratelimit.mjs`**

```js
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
```

- [ ] **Step 4: Commit**

```bash
git add api/_lib/
git commit -m "feat(api): helpers partagés CORS/KV/rate-limit"
```

### Task 3: Token de session HMAC (TDD)

**Files:**
- Create: `api/_lib/token.mjs`
- Test: `tests/token.test.mjs`

- [ ] **Step 1: Écrire le test qui échoue**

```js
// tests/token.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToken, verifyToken, timingSafeEqualStr } from '../api/_lib/token.mjs';

const SECRET = 'test-secret';

test('un token créé est vérifiable', () => {
  const t = createToken(SECRET);
  assert.equal(verifyToken(t, SECRET), true);
});

test('un token falsifié est rejeté', () => {
  const t = createToken(SECRET);
  const [exp] = t.split('.');
  assert.equal(verifyToken(`${exp}.${'0'.repeat(64)}`, SECRET), false);
});

test('un token expiré est rejeté', () => {
  const t = createToken(SECRET, -1000);
  assert.equal(verifyToken(t, SECRET), false);
});

test('mauvais secret rejeté', () => {
  assert.equal(verifyToken(createToken(SECRET), 'autre'), false);
});

test('entrées malformées rejetées sans throw', () => {
  for (const bad of [null, undefined, '', 'abc', '123', '.sig', 'notanumber.sig']) {
    assert.equal(verifyToken(bad, SECRET), false);
  }
});

test('timingSafeEqualStr', () => {
  assert.equal(timingSafeEqualStr('abc', 'abc'), true);
  assert.equal(timingSafeEqualStr('abc', 'abd'), false);
  assert.equal(timingSafeEqualStr('abc', 'abcd'), false);
});
```

- [ ] **Step 2: Vérifier que le test échoue**

```bash
node --test tests/
```

Attendu : ERR_MODULE_NOT_FOUND sur `token.mjs`.

- [ ] **Step 3: Implémenter `api/_lib/token.mjs`**

```js
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
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
node --test tests/
```

Attendu : 6 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/token.mjs tests/token.test.mjs
git commit -m "feat(api): token de session HMAC avec expiration (TDD)"
```

### Task 4: Durcir `api/admin.js`

**Files:**
- Modify: `api/admin.js` (lignes 1–60 : CORS, login, auth, helpers KV — le switch d'actions et les fonctions getDefault* ne changent pas)

- [ ] **Step 1: Remplacer l'en-tête du handler (imports, CORS, login, auth)**

Remplacer tout le code de `api/admin.js` AVANT le bloc `try { switch (action) {` par :

```js
import { put, del } from '@vercel/blob';
import { applyCors, clientIp, fail } from './_lib/http.mjs';
import { kvGet, kvSet } from './_lib/kv.mjs';
import { rateLimit } from './_lib/ratelimit.mjs';
import { createToken, verifyToken, timingSafeEqualStr } from './_lib/token.mjs';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const { action } = req.query;

  if (action === 'login' && req.method === 'POST') {
    const ip = clientIp(req);
    if (!(await rateLimit('login', ip, 5, 15 * 60))) {
      return fail(res, 429, 'Trop de tentatives. Réessayez dans 15 minutes.');
    }
    const { password } = req.body || {};
    if (password && timingSafeEqualStr(password, process.env.ADMIN_PASSWORD)) {
      return res.status(200).json({ success: true, token: createToken(process.env.SESSION_SECRET) });
    }
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!verifyToken(token, process.env.SESSION_SECRET)) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
```

Les définitions locales `kvGet`/`kvSet` (anciennes lignes 34–57) sont supprimées — les imports les remplacent à signature identique.

- [ ] **Step 2: Rendre les erreurs du switch génériques**

Dans le `catch` final du switch, remplacer `return res.status(500).json({ error: err.message });` par :

```js
return fail(res, 500, 'Erreur serveur', err);
```

- [ ] **Step 3: Vérification statique**

```bash
node --check api/admin.js && node --test tests/
```

Attendu : pas d'erreur de syntaxe, tests verts. (`node --check` accepte la syntaxe ESM des fichiers .js depuis Node 20 via détection automatique ; si erreur "Cannot use import", utiliser `node --input-type=module --check < api/admin.js`.)

- [ ] **Step 4: Commit**

```bash
git add api/admin.js
git commit -m "fix(security): le login admin renvoie un token HMAC signé, rate limit 5/15min, timing-safe"
```

Note : le client admin (`admin/index.html`) stocke déjà `data.token` et l'envoie en Bearer — aucun changement front nécessaire. Les sessions existantes (ancien "token" = mot de passe) seront invalidées au déploiement : il faudra se reconnecter une fois.

### Task 5: Supprimer l'endpoint checkout orphelin

**Files:**
- Delete: `api/checkout.js`, `success.html`
- Modify: `vercel.json` (retirer le rewrite `/success`)

- [ ] **Step 1: Vérifier qu'aucune page n'appelle checkout ni success**

```bash
grep -rn "checkout\|/success" --include="*.html" . | grep -v node_modules | grep -v ".superpowers"
```

Attendu : aucune occurrence (hors maquettes `.superpowers`). Si une occurrence apparaît, STOP et réévaluer.

- [ ] **Step 2: Supprimer les fichiers et le rewrite**

```bash
git rm api/checkout.js success.html
```

Dans `vercel.json`, supprimer la ligne `{ "source": "/success", "destination": "/success.html" },`.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "fix(security): supprime l'endpoint checkout orphelin (prix client non fiable, boutique hors scope)"
```

### Task 6: Durcir `api/contact.js` et `api/testimonial.js`

**Files:**
- Modify: `api/contact.js`
- Modify: `api/testimonial.js`

- [ ] **Step 1: `api/contact.js` — imports, CORS, rate limit, échappement**

En tête de fichier :

```js
import { applyCors, clientIp, fail, escapeHtml } from './_lib/http.mjs';
import { rateLimit } from './_lib/ratelimit.mjs';
```

Remplacer les 4 lignes `res.setHeader(...)` + le bloc OPTIONS par :

```js
if (applyCors(req, res, 'POST, OPTIONS')) return;
```

Après le check de méthode POST, ajouter :

```js
const ip = clientIp(req);
if (!(await rateLimit('contact', ip, 5, 60 * 60))) {
  return fail(res, 429, 'Trop de messages envoyés. Réessayez plus tard.');
}
```

Après la destructuration du body, ajouter validation + échappement :

```js
if (String(message).length > 5000 || String(firstName).length > 100) {
  return res.status(400).json({ error: 'Message trop long' });
}
const e = {
  firstName: escapeHtml(firstName), lastName: escapeHtml(lastName),
  email: escapeHtml(email), projectType: escapeHtml(projectType),
  message: escapeHtml(message),
};
```

Dans `emailHtml` et l'auto-reply, remplacer chaque interpolation `${firstName}` `${lastName}` `${email}` `${projectType}` `${message.replace(...)}` par la version échappée : `${e.firstName}`, `${e.lastName}`, `${e.email}`, `${e.projectType}`, `${e.message.replace(/\n/g, '<br>')}`. Le `to: email` et `reply_to: email` (envoi Resend) restent la valeur BRUTE non échappée — c'est un champ d'adresse, pas du HTML.

Remplacer les trois `return res.status(500).json({ error: ..., details: ... })` par `return fail(res, 500, 'Erreur du service email', errorData|err)`.

- [ ] **Step 2: `api/testimonial.js` — mêmes protections + limites de taille**

En tête : mêmes imports que contact (sans escapeHtml — l'échappement des témoignages se fait à l'AFFICHAGE, Task 7, pour ne pas corrompre les données stockées). Remplacer les setHeader/OPTIONS par `if (applyCors(req, res, 'POST, OPTIONS')) return;`. Remplacer les kvGet/kvSet locaux par `import { kvGet, kvSet } from './_lib/kv.mjs';`.

Après la validation `!name || (!textFr && !textEn)`, ajouter :

```js
if (String(name).length > 100 || String(role || '').length > 150
    || String(textFr || '').length > 2000 || String(textEn || '').length > 2000) {
  return res.status(400).json({ error: 'Texte trop long' });
}
const ip = clientIp(req);
if (!(await rateLimit('testimonial', ip, 5, 60 * 60))) {
  return fail(res, 429, 'Trop de soumissions. Réessayez plus tard.');
}
```

Remplacer `return res.status(500).json({ error: err.message });` par `return fail(res, 500, 'Erreur serveur', err);`.

- [ ] **Step 3: Vérification statique et commit**

```bash
node --check api/contact.js && node --check api/testimonial.js
git add api/contact.js api/testimonial.js
git commit -m "fix(security): rate limit + échappement HTML email + erreurs génériques (contact, testimonial)"
```

### Task 7: Durcir `api/content.js`, `api/gallery.js` + XSS front

**Files:**
- Modify: `api/content.js`, `api/gallery.js`
- Create: `site-utils.js` (racine, servi statiquement à `/site-utils.js`)
- Modify: `index.html`, `portfolio.html`, `galeries.html`, `admin/index.html`

- [ ] **Step 1: `api/content.js` et `api/gallery.js`**

Dans les deux : remplacer les `setHeader` CORS + bloc OPTIONS par `if (applyCors(req, res, 'GET, OPTIONS')) return;`, les kvGet locaux par l'import `./_lib/kv.mjs`, et `err.message` par `fail(res, 500, 'Erreur serveur', err)` (imports correspondants en tête).

- [ ] **Step 2: Créer `site-utils.js`**

```js
// Échappement systématique avant toute insertion innerHTML.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Seules les URLs https sont rendues (bloque javascript: et data:).
function safeUrl(u) {
  return /^https:\/\//i.test(String(u ?? '')) ? String(u) : '';
}
```

- [ ] **Step 3: Charger le helper et échapper dans `index.html`**

Ajouter `<script src="/site-utils.js"></script>` juste avant le `<script>` inline existant. Dans `renderGalleries`, remplacer le map par :

```js
el.innerHTML = galleries.filter(g => safeUrl(g.url)).map(g => `
    <a href="${safeUrl(g.url)}" target="_blank" rel="noopener" class="gallery-card">
      <div class="gallery-card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="1"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>
      <div class="gallery-card-title">${esc(g.title) || 'Galerie'}</div>
      <div class="gallery-card-date">${esc(g.date)}</div>
      <div class="gallery-card-arrow">→</div>
    </a>
  `).join('');
```

Dans `renderTestimonials`, remplacer les interpolations par `${esc(isEn ? (t.textEn || t.textFr) : (t.textFr || t.textEn))}`, `${esc(t.name)}`, `${esc(t.role)}`.

- [ ] **Step 4: Échapper dans `portfolio.html`, `galeries.html`, `admin/index.html`**

Même mécanique : ajouter `<script src="/site-utils.js"></script>` avant le script inline de chaque page (pour `admin/index.html` : `<script src="/site-utils.js"></script>` — chemin absolu), puis localiser chaque template literal injecté en `innerHTML` (`grep -n 'innerHTML' <fichier>`) et envelopper CHAQUE variable interpolée de données dynamiques avec `esc(...)`, et chaque URL avec `safeUrl(...)`. Concerne notamment : `portfolio.html` ligne ~236 (`p.url` → `safeUrl(p.url)` en src, `p.label` → `esc(p.label)`), `galeries.html` ligne ~163 et suivantes (résultat de `/api/gallery` : `name`, `date`, `url`), `admin/index.html` ligne ~433 et tous les renderers (témoignages en attente, galeries, photos : `name`, `role`, `textFr`, `textEn`, `title`, `date`, `code`, `label`, `url`).

Critère de complétude : `grep -n '\${' <fichier>` ne montre plus AUCUNE variable de données API non enveloppée par `esc(` ou `safeUrl(` dans une chaîne destinée à `innerHTML`.

- [ ] **Step 5: Validation des URLs de galeries à la sauvegarde admin**

Dans `api/admin.js`, case `save-galleries`, remplacer `await kvSet('galleries', req.body);` par :

```js
case 'save-galleries': {
  const galleries = (Array.isArray(req.body) ? req.body : []).filter(
    g => !g.url || /^https:\/\//i.test(String(g.url))
  );
  await kvSet('galleries', galleries);
  return res.json({ success: true });
}
```

- [ ] **Step 6: Commit**

```bash
git add api/content.js api/gallery.js api/admin.js site-utils.js index.html portfolio.html galeries.html admin/index.html
git commit -m "fix(security): échappement XSS systématique + validation https des URLs galeries"
```

### Task 8: Headers de sécurité (`vercel.json`)

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Ajouter le bloc `headers`**

Ajouter à `vercel.json` (au même niveau que `rewrites`) :

```json
"headers": [
  {
    "source": "/(.*)",
    "headers": [
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
      { "key": "Content-Security-Policy-Report-Only", "value": "default-src 'self'; img-src 'self' data: https://*.public.blob.vercel-storage.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" }
    ]
  }
]
```

CSP en Report-Only : les violations s'affichent dans la console navigateur sans rien bloquer. Passage en mode bloquant en phase 2 (Task 16) après vérification.

- [ ] **Step 2: Valider le JSON et commit**

```bash
python3 -m json.tool vercel.json > /dev/null && echo OK
git add vercel.json
git commit -m "fix(security): headers XFO/XCTO/Referrer/Permissions + CSP report-only"
```

### Task 9: Tests d'intégration + déploiement phase 1

**Files:**
- Create: `tests/api-tests.sh`

- [ ] **Step 1: Écrire `tests/api-tests.sh`**

```bash
#!/usr/bin/env bash
# Usage: BASE_URL=https://<preview>.vercel.app bash tests/api-tests.sh
set -u
BASE_URL="${BASE_URL:?BASE_URL requis}"
pass=0; failed=0
check() { # check <desc> <attendu> <obtenu>
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "PASS  $1";
  else failed=$((failed+1)); echo "FAIL  $1 (attendu $2, obtenu $3)"; fi
}

# 1. Login mauvais mot de passe -> 401
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/admin?action=login" \
  -H 'Content-Type: application/json' -d '{"password":"mauvais"}')
check "login mauvais mdp -> 401" 401 "$code"

# 2. Rate limit login: 5 essais de plus -> 429
for i in 1 2 3 4 5; do curl -s -o /dev/null -X POST "$BASE_URL/api/admin?action=login" \
  -H 'Content-Type: application/json' -d '{"password":"mauvais"}'; done
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/admin?action=login" \
  -H 'Content-Type: application/json' -d '{"password":"mauvais"}')
check "rate limit login -> 429" 429 "$code"

# 3. Action admin sans token -> 401
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/admin?action=get-content")
check "admin sans token -> 401" 401 "$code"

# 4. Ancien exploit: mot de passe utilisé comme token -> 401
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/admin?action=get-content" \
  -H "Authorization: Bearer ${ADMIN_PASSWORD:-placeholder}")
check "password-comme-token -> 401" 401 "$code"

# 5. Checkout supprimé -> 404
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/checkout")
check "checkout supprimé -> 404" 404 "$code"

# 6. Témoignage trop long -> 400
long=$(python3 -c "print('x'*2001)")
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/testimonial" \
  -H 'Content-Type: application/json' -d "{\"name\":\"t\",\"textFr\":\"$long\"}")
check "témoignage 2001 chars -> 400" 400 "$code"

# 7. Headers de sécurité présents sur l'accueil
hdrs=$(curl -sI "$BASE_URL/")
echo "$hdrs" | grep -qi 'x-frame-options: DENY';        check "X-Frame-Options" 0 $?
echo "$hdrs" | grep -qi 'x-content-type-options';       check "X-Content-Type-Options" 0 $?
echo "$hdrs" | grep -qi 'content-security-policy-report-only'; check "CSP report-only" 0 $?

# 8. Contenu public toujours accessible
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/content")
check "GET /api/content -> 200" 200 "$code"

echo; echo "$pass pass, $failed fail"
exit $failed
```

```bash
chmod +x tests/api-tests.sh
git add tests/api-tests.sh
git commit -m "test: script d'intégration API phase 1"
```

- [ ] **Step 2: Pousser la branche, récupérer l'URL de preview**

```bash
git push -u origin redesign-2026
```

ACTION UTILISATEUR si pas déjà fait : créer `SESSION_SECRET` dans Vercel (voir prérequis). Récupérer l'URL du déploiement preview (dashboard Vercel, ou `npx vercel ls` si CLI connectée).

- [ ] **Step 3: Lancer les tests contre la preview**

```bash
BASE_URL=https://<preview-url> bash tests/api-tests.sh
```

Attendu : `10 pass, 0 fail`. Caveat : le test 2 (rate limit) laisse l'IP bloquée 15 min pour le login — faire le test manuel admin APRÈS ce délai ou depuis une autre IP.

- [ ] **Step 4: Test manuel admin sur la preview**

Login avec le vrai mot de passe → modifier un texte → sauvegarder → recharger → vérifier la persistance. Soumettre un témoignage contenant `<script>alert(1)</script><b>gras</b>` depuis l'accueil preview → l'approuver dans l'admin → vérifier qu'il s'affiche en TEXTE BRUT (pas d'alerte, pas de gras) sur l'accueil ET dans l'admin → le rejeter/supprimer ensuite.

- [ ] **Step 5: GATE — merge et déploiement production phase 1**

STOP : demander la validation de l'utilisateur avant ce step.

```bash
git checkout main && git merge redesign-2026 && git push origin main
```

Puis re-lancer `BASE_URL=https://thibaultmotais.com bash tests/api-tests.sh` (attendre ~2 min le déploiement). Vérifier la console navigateur sur les 5 pages prod : aucune violation CSP inattendue. Re-créer la branche de travail : `git checkout redesign-2026 && git merge main`.

---

## Phase 2 — Redesign

Référence visuelle : `.superpowers/brainstorm/2014-1781175722/content/maquette-accueil-v2.html` (commitée sur la branche au début de la phase 2 : `git add -f .superpowers/brainstorm/2014-1781175722/content/maquette-accueil-v2.html && git commit -m "docs: maquette de référence"`).

### Task 10: Fondations — `styles.css` et `site.js`

**Files:**
- Create: `styles.css` (racine, servi à `/styles.css`)
- Create: `site.js` (racine — absorbe et remplace `site-utils.js`)
- Delete: `site-utils.js` (à la fin de la phase 2, Task 15, quand plus aucune page ne le référence)

- [ ] **Step 1: Écrire `styles.css`**

Transposer les styles de la maquette v2 en y ajoutant les composants des autres pages. Contenu complet :

```css
/* ===== TMM 2026 — design system ===== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0c0c0d; --surface: #141416; --line: #232326;
  --text: #ececec; --muted: #9a9a9a; --dim: #6a6a6a;
  --radius: 4px; --pad: 40px;
}
html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--text); font-family: Inter, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; }
h1, h2, h3 { font-family: Fraunces, Georgia, serif; font-weight: 550; letter-spacing: -0.015em; }
a { color: inherit; }
img { display: block; max-width: 100%; }

/* Nav */
nav.site { position: sticky; top: 0; z-index: 100; display: flex; justify-content: space-between; align-items: center; padding: 18px var(--pad); font-size: 13px; background: rgba(12,12,13,0.85); backdrop-filter: blur(10px); border-bottom: 1px solid transparent; }
nav.site.scrolled { border-bottom-color: var(--line); }
nav.site .logo { font-weight: 600; text-decoration: none; }
nav.site .links { display: flex; gap: 26px; align-items: center; color: var(--muted); }
nav.site .links a { text-decoration: none; transition: color 0.15s; }
nav.site .links a:hover, nav.site .links a.active { color: var(--text); }
.lang-toggle { font-size: 11px; color: var(--dim); border: 1px solid var(--line); border-radius: 99px; padding: 3px 10px; background: none; cursor: pointer; font-family: inherit; }
.lang-toggle:hover { color: var(--text); }
.nav-burger { display: none; background: none; border: none; color: var(--text); font-size: 22px; cursor: pointer; }

/* Layout */
.wrap { padding: 0 var(--pad); max-width: 1280px; margin: 0 auto; }
.section { padding: 90px 0; }
.section-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 36px; gap: 16px; flex-wrap: wrap; }
.section-head h2 { font-size: clamp(28px, 3.4vw, 44px); }
.section-head a { font-size: 13px; color: var(--muted); text-decoration: none; border-bottom: 1px solid var(--line); padding-bottom: 2px; }

/* Boutons */
.cta-solid { display: inline-block; font-size: 13px; background: var(--text); color: #111; padding: 12px 26px; border-radius: 99px; font-weight: 600; text-decoration: none; border: none; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
.cta-solid:hover { opacity: 0.85; }
.cta-ghost { display: inline-block; font-size: 13px; border: 1px solid #3a3a3e; color: var(--text); padding: 12px 26px; border-radius: 99px; text-decoration: none; background: none; cursor: pointer; font-family: inherit; transition: border-color 0.15s; }
.cta-ghost:hover { border-color: var(--muted); }

/* Hero split */
.hero { display: grid; grid-template-columns: 1fr 1.1fr; min-height: 86vh; }
.hero-left { display: flex; flex-direction: column; justify-content: center; padding-right: 48px; }
.hero h1 { font-size: clamp(40px, 5.2vw, 72px); line-height: 1.02; }
.hero p { color: var(--muted); margin-top: 20px; max-width: 380px; }
.hero .ctas { margin-top: 30px; display: flex; gap: 14px; flex-wrap: wrap; }
.hero-right { display: grid; overflow: hidden; }
.hero-right img { grid-area: 1/1; width: 100%; height: 100%; object-fit: cover; }

/* Bande de faits */
.bande { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface); }
.bande .inner { display: grid; grid-template-columns: repeat(3, 1fr); }
.bande .cell { padding: 28px 24px; border-right: 1px solid var(--line); font-size: 13px; color: var(--muted); }
.bande .cell:last-child { border-right: none; }
.bande .cell b { display: block; color: var(--text); font-size: 17px; font-weight: 600; margin-bottom: 2px; }

/* Grilles photos */
.work-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.work-grid a { position: relative; display: grid; overflow: hidden; border-radius: var(--radius); text-decoration: none; color: var(--text); }
.work-grid img { grid-area: 1/1; width: 100%; aspect-ratio: 4/5; object-fit: cover; transition: transform 0.4s ease; }
.work-grid a:hover img { transform: scale(1.03); }
.work-grid .tag { grid-area: 1/1; align-self: end; padding: 14px 16px; font-size: 13px; background: linear-gradient(to top, rgba(10,10,11,0.75), transparent); }
.masonry { columns: 3; column-gap: 14px; }
.masonry figure { break-inside: avoid; margin-bottom: 14px; border-radius: var(--radius); overflow: hidden; cursor: zoom-in; }
.filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 32px; }
.filters button { font-size: 12px; padding: 8px 18px; border-radius: 99px; border: 1px solid var(--line); background: none; color: var(--muted); cursor: pointer; font-family: inherit; }
.filters button.active { background: var(--text); color: #111; border-color: var(--text); font-weight: 600; }

/* Citation témoignage */
.quote { max-width: 820px; margin: 0 auto; text-align: center; }
.quote blockquote { font-family: Fraunces, Georgia, serif; font-size: clamp(19px, 2.2vw, 26px); font-weight: 500; line-height: 1.5; }
.quote .who { margin-top: 22px; font-size: 13px; color: var(--dim); }
.quote .who b { color: var(--muted); font-weight: 500; }

/* Cartes (tarifs, témoignages multiples) */
.card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 28px; }
.panel h3 { font-size: 22px; margin-bottom: 12px; }
.price-row { display: flex; justify-content: space-between; padding: 10px 0; font-size: 14px; border-bottom: 1px solid var(--line); }
.price-row:last-child { border-bottom: none; }
.price-row .pr { color: var(--text); font-weight: 600; white-space: nowrap; margin-left: 16px; }
.price-cat { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); margin: 22px 0 6px; }

/* Accès galerie */
.galerie-acces { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 40px; display: flex; justify-content: space-between; align-items: center; gap: 24px; flex-wrap: wrap; }
.galerie-acces h3 { font-size: 24px; }
.galerie-acces p { color: var(--muted); font-size: 14px; margin-top: 6px; }
.code-input { display: flex; gap: 10px; }

/* Formulaires */
input, textarea, select { background: var(--bg); border: 1px solid #3a3a3e; border-radius: var(--radius); color: var(--text); padding: 12px 14px; font-size: 14px; font-family: inherit; width: 100%; }
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--muted); }
.code-input input { border-radius: 99px; width: 180px; padding: 11px 20px; font-size: 13px; }
label { font-size: 12px; color: var(--muted); display: block; margin-bottom: 6px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.form-grid .full { grid-column: 1 / -1; }

/* Modal + toast */
.modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 9000; align-items: center; justify-content: center; padding: 20px; }
.modal.open { display: flex; }
.modal-box { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 36px; max-width: 520px; width: 100%; position: relative; }
.modal-close { position: absolute; top: 14px; right: 16px; background: none; border: none; color: var(--muted); font-size: 20px; cursor: pointer; }
.toast { position: fixed; bottom: 24px; right: 24px; background: var(--surface); border: 1px solid var(--muted); border-radius: var(--radius); padding: 14px 24px; font-size: 13px; transform: translateY(80px); opacity: 0; transition: all 0.3s; z-index: 1000; }
.toast.show { transform: none; opacity: 1; }

/* Lightbox portfolio */
.lightbox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.92); z-index: 9500; align-items: center; justify-content: center; cursor: zoom-out; }
.lightbox.open { display: flex; }
.lightbox img { max-width: 92vw; max-height: 92vh; object-fit: contain; }

/* Footer */
footer.site { border-top: 1px solid var(--line); padding: 32px var(--pad); display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; font-size: 13px; color: var(--dim); }
footer.site a { color: var(--dim); text-decoration: none; }
footer.site a:hover { color: var(--muted); }

/* Reveal */
.reveal { opacity: 0; transform: translateY(16px); transition: opacity 0.5s ease, transform 0.5s ease; }
.reveal.visible { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) { .reveal { transition: none; opacity: 1; transform: none; } }

/* Langues */
[data-lang="en"] { display: none; }
body.lang-en [data-lang="fr"] { display: none; }
body.lang-en [data-lang="en"] { display: revert; }

/* Responsive */
@media (max-width: 900px) {
  :root { --pad: 24px; }
  .hero { grid-template-columns: 1fr; min-height: auto; }
  .hero-left { padding: 48px 0 32px; }
  .hero-right { height: 56vh; }
  .work-grid { grid-template-columns: 1fr; }
  .masonry { columns: 2; }
  .bande .inner { grid-template-columns: 1fr; }
  .bande .cell { border-right: none; border-bottom: 1px solid var(--line); }
  .bande .cell:last-child { border-bottom: none; }
  .form-grid { grid-template-columns: 1fr; }
  nav.site .links { display: none; position: fixed; inset: 0; background: var(--bg); flex-direction: column; justify-content: center; font-size: 18px; }
  nav.site .links.open { display: flex; }
  .nav-burger { display: block; z-index: 101; }
}
@media (max-width: 540px) { .masonry { columns: 1; } }
```

- [ ] **Step 2: Écrire `site.js`** (remplace `site-utils.js`, gardé identique en phase de transition)

```js
/* ===== TMM site.js — partagé par toutes les pages ===== */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function safeUrl(u) {
  return /^https:\/\//i.test(String(u ?? '')) ? String(u) : '';
}

/* Images responsive via l'optimisation Vercel */
function imgAttrs(url, sizes) {
  const u = safeUrl(url);
  if (!u) return '';
  const srcset = [480, 960, 1600]
    .map(w => `/_vercel/image?url=${encodeURIComponent(u)}&w=${w}&q=75 ${w}w`)
    .join(', ');
  return `src="/_vercel/image?url=${encodeURIComponent(u)}&w=960&q=75" srcset="${srcset}" sizes="${sizes || '(max-width: 900px) 100vw, 33vw'}" loading="lazy"`;
}

/* Langue */
let currentLang = localStorage.getItem('tmm-lang') || 'fr';
function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('tmm-lang', lang);
  document.body.classList.toggle('lang-en', lang === 'en');
  const t = document.getElementById('langToggle');
  if (t) t.textContent = lang === 'fr' ? 'EN' : 'FR';
  document.dispatchEvent(new CustomEvent('langchange'));
}
function toggleLang() { setLang(currentLang === 'fr' ? 'en' : 'fr'); }

/* Nav mobile + état scrolled */
function toggleMenu() { document.querySelector('nav.site .links').classList.toggle('open'); }
window.addEventListener('scroll', () => {
  const n = document.querySelector('nav.site');
  if (n) n.classList.toggle('scrolled', window.scrollY > 10);
});

/* Toast */
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

/* Reveal au scroll */
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

/* Init commun */
document.addEventListener('DOMContentLoaded', () => { setLang(currentLang); initReveal(); });
```

- [ ] **Step 3: Config images Vercel**

Dans `vercel.json`, ajouter au niveau racine :

```json
"images": {
  "sizes": [480, 960, 1600],
  "remotePatterns": [{ "protocol": "https", "hostname": "*.public.blob.vercel-storage.com" }]
}
```

- [ ] **Step 4: Commit**

```bash
python3 -m json.tool vercel.json > /dev/null && echo OK
git add styles.css site.js vercel.json
git commit -m "feat(design): design system partagé styles.css + site.js, images Vercel"
```

### Task 11: Refonte `index.html`

**Files:**
- Modify: `index.html` (réécriture complète)

- [ ] **Step 1: Réécrire la page**

Structure complète — le `<head>` charge Fraunces + Inter et les fichiers partagés ; chaque bloc texte existe en double `data-lang="fr"`/`data-lang="en"` comme actuellement (reprendre les traductions EN existantes du fichier actuel pour les textes conservés) :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Thibault Motais — Photographe | Montréal</title>
<meta name="description" content="Photographe professionnel à Montréal. Portraits, événements, sport. Livraison 48 h, devis sous 24 h.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<script src="/site.js" defer></script>
</head>
<body>

<nav class="site">
  <a href="/" class="logo">Thibault Motais</a>
  <div class="links" id="navLinks">
    <a href="/portfolio"><span data-lang="fr">Travail</span><span data-lang="en">Work</span></a>
    <a href="/tarifs"><span data-lang="fr">Tarifs</span><span data-lang="en">Pricing</span></a>
    <a href="/galeries"><span data-lang="fr">Galeries</span><span data-lang="en">Galleries</span></a>
    <a href="/contact">Contact</a>
    <button class="lang-toggle" id="langToggle" onclick="toggleLang()">EN</button>
  </div>
  <button class="nav-burger" onclick="toggleMenu()">☰</button>
</nav>

<div class="wrap">
  <section class="hero">
    <div class="hero-left">
      <h1><span data-lang="fr">Photographe<br>à Montréal.</span><span data-lang="en">Photographer<br>in Montreal.</span></h1>
      <p><span data-lang="fr">Portraits, événements, sport. Livraison 48 h, devis sous 24 h.</span><span data-lang="en">Portraits, events, sport. 48 h delivery, quote within 24 h.</span></p>
      <div class="ctas">
        <a href="/portfolio" class="cta-solid"><span data-lang="fr">Voir le travail</span><span data-lang="en">View work</span></a>
        <a href="/contact" class="cta-ghost"><span data-lang="fr">Me contacter</span><span data-lang="en">Get in touch</span></a>
      </div>
    </div>
    <div class="hero-right" id="heroPhoto"></div>
  </section>
</div>

<div class="bande">
  <div class="wrap"><div class="inner">
    <div class="cell"><b>48 h</b><span data-lang="fr">Livraison des galeries</span><span data-lang="en">Gallery delivery</span></div>
    <div class="cell"><b>24 h</b><span data-lang="fr">Réponse aux devis</span><span data-lang="en">Quote response</span></div>
    <div class="cell"><b>Montréal</b><span data-lang="fr">Déplacements partout au Québec</span><span data-lang="en">Available across Quebec</span></div>
  </div></div>
</div>

<div class="wrap">
  <section class="section reveal">
    <div class="section-head">
      <h2><span data-lang="fr">Travail récent</span><span data-lang="en">Recent work</span></h2>
      <a href="/portfolio"><span data-lang="fr">Tout le portfolio →</span><span data-lang="en">Full portfolio →</span></a>
    </div>
    <div class="work-grid" id="workGrid"></div>
  </section>

  <section class="section reveal" style="padding-top:0;" id="quoteSection" hidden>
    <div class="quote">
      <blockquote id="quoteText"></blockquote>
      <div class="who" id="quoteWho"></div>
      <div style="margin-top:26px;"><a href="#" onclick="openTestimonialModal();return false;" style="font-size:13px;color:var(--muted);border-bottom:1px solid var(--line);text-decoration:none;padding-bottom:2px;"><span data-lang="fr">Laisser un témoignage</span><span data-lang="en">Leave a review</span></a></div>
    </div>
  </section>

  <section class="section reveal" style="padding-top:0;">
    <div class="galerie-acces">
      <div>
        <h3><span data-lang="fr">Votre galerie privée</span><span data-lang="en">Your private gallery</span></h3>
        <p><span data-lang="fr">Entrez le code reçu après votre séance pour accéder à vos photos.</span><span data-lang="en">Enter the code you received after your session to access your photos.</span></p>
      </div>
      <div class="code-input">
        <input id="galleryCode" placeholder="CODE-2026" onkeydown="if(event.key==='Enter')openGallery()">
        <button class="cta-solid" onclick="openGallery()"><span data-lang="fr">Accéder</span><span data-lang="en">Access</span></button>
      </div>
    </div>
  </section>
</div>

<!-- Modal témoignage : reprendre la modal actuelle (champs tName/tRole/tTextFr/tTextEn,
     fonctions openTestimonialModal/closeTestimonialModal/submitTestimonial inchangées)
     en remplaçant les styles inline par class="modal"/"modal-box"/"modal-close". -->

<footer class="site">
  <span>Thibault Motais — <span data-lang="fr">Photographe, Montréal</span><span data-lang="en">Photographer, Montreal</span></span>
  <span><a href="/contact">Contact</a> · <a href="/admin">Admin</a></span>
</footer>

<div class="toast" id="toast"></div>
```

- [ ] **Step 2: Script de données de la page**

`<script>` en fin de body (après la modal) :

```js
const CATEGORY_LABELS = { portraits: {fr:'Portraits',en:'Portraits'}, sport: {fr:'Sport',en:'Sport'},
  events: {fr:'Événements',en:'Events'}, nature: {fr:'Nature',en:'Nature'} };
let _content = null;

async function loadSiteData() {
  try {
    const res = await fetch('/api/content');
    _content = await res.json();
  } catch (e) { _content = { portfolioPhotos: [], testimonials: [] }; }
  renderHero(); renderWork(); renderQuote();
}

function renderHero() {
  const photos = _content.portfolioPhotos || [];
  const p = photos.find(p => p.category === 'portraits') || photos[0];
  if (p) document.getElementById('heroPhoto').innerHTML =
    `<img ${imgAttrs(p.url, '(max-width: 900px) 100vw, 55vw')} alt="">`;
}

function renderWork() {
  const photos = _content.portfolioPhotos || [];
  const cats = ['portraits', 'sport', 'events'];
  document.getElementById('workGrid').innerHTML = cats.map(cat => {
    const p = photos.find(x => x.category === cat);
    if (!p) return '';
    const lbl = CATEGORY_LABELS[cat] || { fr: cat, en: cat };
    return `<a href="/portfolio#${esc(cat)}">
      <img ${imgAttrs(p.url)} alt="${esc(lbl.fr)}">
      <span class="tag"><span data-lang="fr">${esc(lbl.fr)}</span><span data-lang="en">${esc(lbl.en)}</span></span>
    </a>`;
  }).join('');
}

function renderQuote() {
  const ts = _content.testimonials || [];
  if (!ts.length) return;
  const t = ts[0];
  const isEn = currentLang === 'en';
  document.getElementById('quoteText').textContent = `« ${(isEn ? (t.textEn || t.textFr) : (t.textFr || t.textEn))} »`;
  document.getElementById('quoteWho').innerHTML = `<b>${esc(t.name)}</b>${t.role ? ' — ' + esc(t.role) : ''}`;
  document.getElementById('quoteSection').hidden = false;
}

async function openGallery() {
  const code = document.getElementById('galleryCode').value.trim();
  if (!code) return;
  try {
    const r = await fetch(`/api/gallery?code=${encodeURIComponent(code)}`);
    if (!r.ok) { showToast(currentLang === 'en' ? 'Code not found' : 'Code introuvable'); return; }
    const g = await r.json();
    const url = safeUrl(g.url);
    if (url) window.open(url, '_blank', 'noopener');
  } catch { showToast('Erreur, réessayez'); }
}

document.addEventListener('langchange', () => { if (_content) renderQuote(); });
document.addEventListener('DOMContentLoaded', loadSiteData);
```

Note : `textContent` pour la citation (pas d'innerHTML → pas d'échappement nécessaire), `esc()` partout ailleurs. Le témoignage unique s'affiche en citation ; quand il y en aura 3+, basculer sur une grille `.card-grid` de `.panel` (hors scope aujourd'hui).

- [ ] **Step 3: Vérifier dans le navigateur**

```bash
npx serve . -p 3333 &
```

Ouvrir http://localhost:3333 : structure et styles OK (les images `/_vercel/image` 404 en local — normal, vérifier sur la preview Vercel ; pour un check local rapide, vérifier que `imgAttrs` produit les bons attributs dans le DOM). Couper le serveur ensuite.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(design): refonte page d'accueil — hero split, travail récent, citation, accès galerie"
```

### Task 12: Refonte `portfolio.html`

**Files:**
- Modify: `portfolio.html` (réécriture complète)

- [ ] **Step 1: Réécrire la page**

Même `<head>` et même nav/footer que Task 11 (title : `Portfolio — Thibault Motais, photographe à Montréal`). Corps :

```html
<div class="wrap">
  <section class="section">
    <div class="section-head">
      <h2><span data-lang="fr">Travail</span><span data-lang="en">Work</span></h2>
    </div>
    <div class="filters" id="filters"></div>
    <div class="masonry" id="grid"></div>
  </section>
</div>
<div class="lightbox" id="lightbox" onclick="this.classList.remove('open')"><img id="lightboxImg" alt=""></div>
```

Script de page :

```js
const CATEGORY_LABELS = { all: {fr:'Tout',en:'All'}, portraits: {fr:'Portraits',en:'Portraits'},
  sport: {fr:'Sport',en:'Sport'}, events: {fr:'Événements',en:'Events'}, nature: {fr:'Nature',en:'Nature'} };
let _photos = [], _filter = location.hash.slice(1) || 'all';

async function load() {
  try {
    const res = await fetch('/api/content');
    _photos = (await res.json()).portfolioPhotos || [];
  } catch { _photos = []; }
  renderFilters(); renderGrid();
}

function renderFilters() {
  const cats = ['all', ...new Set(_photos.map(p => p.category).filter(Boolean))];
  document.getElementById('filters').innerHTML = cats.map(c => {
    const lbl = CATEGORY_LABELS[c] || { fr: c, en: c };
    return `<button class="${c === _filter ? 'active' : ''}" onclick="setFilter('${esc(c)}')">
      <span data-lang="fr">${esc(lbl.fr)}</span><span data-lang="en">${esc(lbl.en)}</span></button>`;
  }).join('');
}

function setFilter(c) { _filter = c; history.replaceState(null, '', c === 'all' ? '#' : '#' + c); renderFilters(); renderGrid(); }

function renderGrid() {
  const list = _filter === 'all' ? _photos : _photos.filter(p => p.category === _filter);
  document.getElementById('grid').innerHTML = list.map(p => `
    <figure onclick="openLightbox('${encodeURIComponent(safeUrl(p.url))}')">
      <img ${imgAttrs(p.url, '(max-width: 540px) 100vw, (max-width: 900px) 50vw, 33vw')} alt="${esc(p.label)}">
    </figure>`).join('')
    || `<p style="color:var(--muted)"><span data-lang="fr">Aucune photo dans cette catégorie.</span><span data-lang="en">No photos in this category.</span></p>`;
}

function openLightbox(encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  document.getElementById('lightboxImg').src = `/_vercel/image?url=${encodeURIComponent(url)}&w=1600&q=80`;
  document.getElementById('lightbox').classList.add('open');
}

document.addEventListener('DOMContentLoaded', load);
```

- [ ] **Step 2: Commit**

```bash
git add portfolio.html
git commit -m "feat(design): refonte portfolio — masonry, filtres par catégorie, srcset Vercel, lightbox"
```

### Task 13: Refonte `tarifs.html` et `contact.html`

**Files:**
- Modify: `tarifs.html`, `contact.html`

- [ ] **Step 1: `tarifs.html`**

Même head/nav/footer. Conserver TOUTES les lignes de prix actuelles (lignes 150–170 de l'actuel : Portraits 200/350/550 $, Événements 500/800 $, etc. — reprendre le contenu FR/EN existant tel quel). Nouvelle structure : un `.panel` par catégorie dans une `.card-grid`, chaque prix en `.price-row` (`.pl` libellé, `.pr` prix), CTA final vers /contact :

```html
<div class="wrap">
  <section class="section">
    <div class="section-head">
      <h2><span data-lang="fr">Tarifs</span><span data-lang="en">Pricing</span></h2>
    </div>
    <div class="card-grid">
      <div class="panel">
        <h3><span data-lang="fr">Portraits</span><span data-lang="en">Portraits</span></h3>
        <div class="price-row"><span class="pl"><span data-lang="fr">Portrait solo — 1h</span><span data-lang="en">Solo portrait — 1h</span></span><span class="pr">200 $</span></div>
        <!-- ... toutes les autres lignes existantes, même pattern ... -->
      </div>
      <!-- un .panel par catégorie existante -->
    </div>
    <p style="margin-top:32px;color:var(--muted);font-size:14px;">
      <span data-lang="fr">Chaque projet est unique — </span><span data-lang="en">Every project is unique — </span>
      <a href="/contact" style="color:var(--text);"><span data-lang="fr">demandez un devis personnalisé</span><span data-lang="en">request a custom quote</span></a>.
    </p>
  </section>
</div>
```

- [ ] **Step 2: `contact.html`**

Même head/nav/footer. Le formulaire garde les MÊMES ids (`firstName`, `lastName`, `email`, `projectType`, `message`) et la MÊME logique fetch `/api/contact` (copier le script existant tel quel) ; seule la présentation change :

```html
<div class="wrap">
  <section class="section" style="max-width:720px;">
    <div class="section-head">
      <h2><span data-lang="fr">Travaillons ensemble</span><span data-lang="en">Let's work together</span></h2>
    </div>
    <form id="contactForm" class="form-grid" onsubmit="return submitForm(event)">
      <div><label for="firstName"><span data-lang="fr">Prénom</span><span data-lang="en">First name</span></label><input id="firstName" required></div>
      <div><label for="lastName"><span data-lang="fr">Nom</span><span data-lang="en">Last name</span></label><input id="lastName"></div>
      <div class="full"><label for="email">Email</label><input id="email" type="email" required></div>
      <div class="full"><label for="projectType"><span data-lang="fr">Type de projet</span><span data-lang="en">Project type</span></label>
        <select id="projectType"><!-- options existantes reprises telles quelles --></select></div>
      <div class="full"><label for="message">Message</label><textarea id="message" rows="6" required></textarea></div>
      <div class="full"><button type="submit" class="cta-solid" id="submitBtn"><span data-lang="fr">Envoyer</span><span data-lang="en">Send</span></button></div>
      <div class="full" id="formMsg" style="font-size:13px;min-height:18px;"></div>
    </form>
  </section>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add tarifs.html contact.html
git commit -m "feat(design): refonte tarifs et contact"
```

### Task 14: Refonte `galeries.html` + re-skin admin

**Files:**
- Modify: `galeries.html`, `admin/index.html`

- [ ] **Step 1: `galeries.html`**

Même head/nav/footer. Corps = le bloc `.galerie-acces` de l'accueil (mêmes ids `galleryCode` + fonction `openGallery()` de Task 11, copiée) + grille des galeries publiques (logique `renderGalleries` actuelle avec `esc`/`safeUrl`, cartes en `.panel`).

- [ ] **Step 2: Re-skin léger `admin/index.html`**

UNIQUEMENT des changements cosmétiques — aucune logique modifiée :
- Remplacer le `<link>` Google Fonts (Cormorant/Outfit) par Fraunces/Inter (mêmes URLs que Task 11).
- Dans le bloc `:root` du `<style>`, remplacer les valeurs : `--gold: #ececec; --gold-dim: rgba(236,236,236,0.1); --gold-line: #3a3a3e; --bg: #0c0c0d; --bg2: #141416; --bg3: #1a1a1c; --bg4: #202023; --border: #232326; --text: #ececec; --muted: #9a9a9a; --white: #ffffff;` (les noms de variables ne changent pas pour ne pas toucher au reste du CSS).
- Remplacer `'Cormorant Garamond', serif` par `Fraunces, Georgia, serif` et `'Outfit', sans-serif` par `Inter, sans-serif` dans tout le fichier.
- Boutons dorés : les sélecteurs qui utilisaient `background: var(--gold)` avec texte sombre fonctionnent tels quels avec les nouvelles valeurs (fond clair, texte sombre) — vérifier visuellement le contraste après changement.

- [ ] **Step 3: Commit**

```bash
git add galeries.html admin/index.html
git commit -m "feat(design): refonte galeries + re-skin admin neutre"
```

### Task 15: Textes "photographe", meta, nettoyage transition

**Files:**
- Modify: les 5 pages + `admin/index.html`
- Delete: `site-utils.js`

- [ ] **Step 1: Purger "vidéaste" et le vocabulaire retiré**

```bash
grep -rn -i "vidéaste\|videaste\|videographer\|vidéo\|video" --include="*.html" . | grep -v node_modules | grep -v ".superpowers"
```

Remplacer chaque occurrence dans titles, meta descriptions, textes et alt (FR : "Photographe", EN : "Photographer" ; retirer "contenu corporatif/vidéo" des descriptions). EXCEPTION : le témoignage de Charlotte Cénac vient de l'API, pas du HTML — rien à faire. Vérifier ensuite que le grep ne retourne plus rien (hors `.superpowers`).

- [ ] **Step 2: Supprimer `site-utils.js`**

```bash
grep -rn "site-utils" --include="*.html" . | grep -v ".superpowers"
```

Attendu : aucune occurrence (toutes les pages chargent `/site.js` depuis les Tasks 11–14). Puis `git rm site-utils.js`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(design): positionnement photographe partout, suppression site-utils transitoire"
```

### Task 16: CSP en mode bloquant

**Files:**
- Modify: `vercel.json`

Préalable : les pages refondues n'ont plus de handlers inline ? NON — le plan conserve des `onclick` inline (pragmatique). La CSP garde donc `'unsafe-inline'` pour script-src. L'amélioration reste réelle : sources restreintes à self + fonts.

- [ ] **Step 1: Renommer le header**

Dans `vercel.json`, renommer la clé `Content-Security-Policy-Report-Only` en `Content-Security-Policy` (même valeur).

- [ ] **Step 2: Vérifier sur la preview puis commit**

Pousser, ouvrir les 5 pages + admin sur la preview, console : aucune ressource bloquée, images `/_vercel/image` OK, fonts OK.

```bash
git add vercel.json
git commit -m "fix(security): CSP en mode bloquant"
```

### Task 17: Vérifications finales et mise en production

- [ ] **Step 1: Tests API re-joués sur la preview**

```bash
BASE_URL=https://<preview-url> bash tests/api-tests.sh
```

Attendu : 10 pass (le test rate-limit re-bloque l'IP 15 min — à anticiper).

- [ ] **Step 2: Lighthouse**

```bash
npx lighthouse https://<preview-url>/ --preset=perf --form-factor=mobile --quiet --chrome-flags="--headless" --output=json --output-path=/tmp/lh.json
python3 -c "import json; d=json.load(open('/tmp/lh.json')); print({k: round(v['score']*100) for k,v in d['categories'].items()})"
```

Attendu : performance ≥ 90. Sinon, vérifier que les images passent bien par `/_vercel/image` et que les fonts sont en `display=swap`.

- [ ] **Step 3: Vérification visuelle**

Les 5 pages + admin à 375 px, 768 px, 1440 px (DevTools). Parcours complets : formulaire contact (reçoit l'email), soumission + approbation témoignage, code galerie valide/invalide, login admin (mauvais mdp → erreur, bon mdp → entre), upload + suppression photo, toggle FR/EN sur chaque page.

- [ ] **Step 4: GATE — mise en production**

STOP : montrer la preview à l'utilisateur et attendre sa validation explicite avant :

```bash
git checkout main && git merge redesign-2026 && git push origin main
```

Puis sur https://thibaultmotais.com : re-jouer Step 1–3 en prod, vérifier la console CSP.

- [ ] **Step 5: Pousser le commit de spec/plan et taguer**

```bash
git push origin main
git tag redesign-2026-live && git push origin redesign-2026-live
```

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

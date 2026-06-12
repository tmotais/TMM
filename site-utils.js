// Échappement systématique avant toute insertion innerHTML.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Seules les URLs https sont rendues (bloque javascript: et data:).
function safeUrl(u) {
  return /^https:\/\//i.test(String(u ?? '')) ? String(u) : '';
}

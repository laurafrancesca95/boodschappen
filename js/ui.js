// Kleine UI-hulpjes: iconen, escapen, onderblad (sheet), meldingen.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export const ICONS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="i-cal" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></symbol>
  <symbol id="i-book" viewBox="0 0 24 24"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5z"/><path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19v3H7.5"/></symbol>
  <symbol id="i-list" viewBox="0 0 24 24"><path d="M10 6.5h10M10 12h10M10 17.5h10"/><path d="M3.5 6.5l1.5 1.5 2.5-2.5M3.5 12l1.5 1.5 2.5-2.5"/><circle cx="5.3" cy="17.5" r="1.4"/></symbol>
  <symbol id="i-jar" viewBox="0 0 24 24"><rect x="7" y="2.8" width="10" height="3.4" rx="1"/><path d="M6.5 6.2h11a1.5 1.5 0 0 1 1.5 1.5V19a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 19V7.7a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M5 11h14"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/></symbol>
  <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></symbol>
  <symbol id="i-cam" viewBox="0 0 24 24"><path d="M4 8.5h3l1.8-3h6.4l1.8 3h3v11H4z"/><circle cx="12" cy="13.5" r="3.3"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
  <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.8 1.8"/></symbol>
  <symbol id="i-cart" viewBox="0 0 24 24"><path d="M3 4h2.5l2 11h10.5l2-8H7"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/></symbol>
  <symbol id="i-left" viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></symbol>
  <symbol id="i-right" viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></symbol>
  <symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></symbol>
  <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 13h9l1-13"/></symbol>
  <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M15.5 5.5a3.2 3.2 0 0 1 0 6.2M17 14a5.5 5.5 0 0 1 3.5 5.5"/></symbol>
  <symbol id="i-ext" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></symbol>
  <symbol id="i-text" viewBox="0 0 24 24"><path d="M5 6h14M5 10.5h14M5 15h9M5 19.5h6"/></symbol>
  <symbol id="i-pen" viewBox="0 0 24 24"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/></symbol>
  <symbol id="i-down" viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6"/></symbol>
  <symbol id="i-save" viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/></symbol>
  <symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M5 19.5h14"/></symbol>
  <symbol id="i-note" viewBox="0 0 24 24"><path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M9 11h6M9 15h4"/></symbol>
  <symbol id="i-swap" viewBox="0 0 24 24"><path d="M7 7h11l-3-3M17 17H6l3 3"/></symbol>
  <symbol id="i-sparkle" viewBox="0 0 24 24"><path d="M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z"/></symbol>
</svg>`;

// Placeholder "bord met eten" in vaste, warme kleuren, gekozen op basis van de titel.
const PLATES = [
  ['#D2553C', '#F4E3B0', '#F3E2D8'], ['#E08A3C', '#F7D8A0', '#F6E9DF'], ['#93B35E', '#F3EBD2', '#E9EEDD'],
  ['#B7505C', '#EADFC8', '#F1E4E4'], ['#7FA05A', '#F0D9A8', '#EFE7DC'], ['#E9A15A', '#8DAA63', '#F2E7DA'],
  ['#CF4B3A', '#F5E1A4', '#EFE2D4'],
];
export function plateStyle(seed) {
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b, c] = PLATES[h % PLATES.length];
  return `--a:${a};--b:${b};--c:${c}`;
}
export function thumb(recipe, cls = 'thumb') {
  if (recipe?.image) return `<div class="${cls} img" style="background-image:url('${esc(recipe.image)}')"></div>`;
  return `<div class="${cls} ph" style="${plateStyle(recipe?.title || '')}"></div>`;
}

// ---------- Onderblad ----------
let sheetEl = null;
export function openSheet(html, { onOpen, wide = false } = {}) {
  closeSheet();
  sheetEl = document.createElement('div');
  sheetEl.className = 'sheet-wrap';
  sheetEl.innerHTML = `<div class="sheet-bg" data-close></div><div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="grip"></div>${html}</div>`;
  document.body.appendChild(sheetEl);
  sheetEl.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  requestAnimationFrame(() => sheetEl?.classList.add('open'));
  history.pushState({ sheet: true }, '');
  onOpen?.(sheetEl.querySelector('.sheet'));
  return sheetEl.querySelector('.sheet');
}
export function closeSheet(fromPop = false) {
  if (!sheetEl) return;
  const el = sheetEl; sheetEl = null;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 220);
  if (!fromPop && history.state?.sheet) history.back();
}
export const sheetOpen = () => !!sheetEl;
window.addEventListener('popstate', () => { if (sheetEl) closeSheet(true); });

// ---------- Melding ----------
let toastT;
export function toast(msg, action) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { action.fn(); el.classList.remove('show'); };
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
}

export function confirmSheet(title, text, okLabel = 'Verwijderen') {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet(`<h3 class="sheet-title">${esc(title)}</h3><p class="muted">${esc(text)}</p>
      <div class="row-btns"><button class="btn ghost" data-close>Annuleren</button><button class="btn danger" data-ok>${esc(okLabel)}</button></div>`);
    s.querySelector('[data-ok]').onclick = () => { done = true; resolve(true); closeSheet(); };
    const obs = new MutationObserver(() => { if (!document.body.contains(s)) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}

// Afgeleide gegevens: weken, datums en de boodschappenlijst.
import { store } from './store.js';
import { parseLine, aggregate, categorize, matchesPantry, CATEGORIES, coreName } from './ingredients.js';

export const DAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
export const DAY_LONG = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayKey = () => dateKey(new Date());

export function startOfWeek(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // maandag = 0
  x.setDate(x.getDate() - dow);
  return x;
}
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const weekDays = (ws) => Array.from({ length: 7 }, (_, i) => addDays(ws, i));

export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

export function weekLabel(ws) {
  const we = addDays(ws, 6);
  const range = ws.getMonth() === we.getMonth()
    ? `${ws.getDate()} t/m ${we.getDate()} ${MONTHS[we.getMonth()]}`
    : `${ws.getDate()} ${MONTHS[ws.getMonth()]} t/m ${we.getDate()} ${MONTHS[we.getMonth()]}`;
  return `Week ${isoWeek(ws)} · ${range}`;
}

export function relWeek(ws) {
  const diff = Math.round((ws - startOfWeek()) / (7 * 86400000));
  if (diff === 0) return 'Deze week';
  if (diff === 1) return 'Volgende week';
  if (diff === -1) return 'Vorige week';
  return null;
}

export const fmtMinutes = (m) => (!m ? '' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} u${m % 60 ? ' ' + (m % 60) + ' min' : ''}`);

// ---------- Boodschappenlijst ----------
/** Bouwt de lijst voor de gekozen week uit het weekmenu + losse items. */
export function computeList() {
  const { menu, recipes, list, pantry, staples = [] } = store.state;
  const ws = list.weekStart ? fromKey(list.weekStart) : startOfWeek();
  const lines = [];
  let recipeCount = 0;
  for (const d of weekDays(ws)) {
    for (const entry of menu[dateKey(d)] || []) {
      const r = entry.recipeId && recipes[entry.recipeId];
      if (!r) continue;
      recipeCount++;
      const factor = r.servings && entry.servings ? entry.servings / r.servings : 1;
      for (const raw of r.ingredients || []) {
        const p = parseLine(raw);
        if (!p) continue;
        lines.push({ name: p.name, qty: p.qty == null ? null : p.qty * factor, unit: p.unit, recipe: r.title });
      }
    }
  }
  const agg = aggregate(lines);
  const pantryItems = [];
  const items = [];
  for (const a of agg) {
    const hit = matchesPantry(a.name, pantry);
    const item = { ...a, cat: categorize(a.name), fromMenu: true, checked: !!list.checked[a.key] };
    if (hit) {
      item.pantryState = list.pantry[a.key] || null; // null = nog niet gecheckt
      pantryItems.push(item);
      if (item.pantryState === 'need') items.push(item);
    } else items.push(item);
  }
  const stapleState = list.staples || {};
  const stapleItems = [];
  for (const s of staples) {
    const item = { key: 's:' + s.id, id: s.id, name: s.name, qtyText: s.qty || '', cat: s.cat || categorize(s.name), staple: true, checked: !!list.checked['s:' + s.id], recipes: [] };
    item.stapleState = stapleState[s.id] || null; // null = nog niet gecheckt (staat wel op de lijst)
    stapleItems.push(item);
    if (item.stapleState !== 'have') items.push(item);
  }
  for (const m of list.manual) {
    items.push({ key: 'm:' + m.id, id: m.id, name: m.name, qtyText: m.qty || '', cat: m.cat || categorize(m.name), manual: true, checked: !!m.checked, recipes: [] });
  }
  const groups = CATEGORIES.map((c) => ({ ...c, items: items.filter((i) => i.cat === c.id && !i.checked) })).filter((g) => g.items.length);
  const done = items.filter((i) => i.checked);
  return {
    weekStart: ws,
    recipeCount,
    groups,
    done,
    total: items.length,
    doneCount: done.length,
    pantryItems,
    pantryOpen: pantryItems.filter((p) => !p.pantryState).length,
    stapleItems,
    stapleNeed: stapleItems.filter((s) => s.stapleState !== 'have').length,
    stapleOpen: stapleItems.filter((s) => !s.stapleState).length,
  };
}

export function isPantry(name) {
  return !!matchesPantry(name, store.state.pantry);
}

export function togglePantry(name) {
  const key = coreName(name);
  const hit = matchesPantry(name, store.state.pantry);
  return store.update('pantry', (p) => {
    if (hit) return p.filter((x) => x.id !== hit.id);
    p.push({ id: crypto.randomUUID?.() || String(Date.now()), name: key });
    return p;
  });
}

import { store, uid } from './store.js';
import { esc, icon, ICONS, thumb, openSheet, closeSheet, toast, confirmSheet, sheetOpen } from './ui.js';
import {
  DAY_SHORT, DAY_LONG, dateKey, fromKey, todayKey, startOfWeek, addDays, weekDays, weekLabel, relWeek,
  fmtMinutes, computeList, isPantry, togglePantry,
} from './model.js';
import { parseLine, fmtQty, categorize, CATEGORIES, coreName } from './ingredients.js';
import { importFromUrl, parseRecipeText, ocrImage, shrinkImage, extractUrl } from './importer.js';
import { seed } from './seed.js';
import { firebaseConfig } from './firebase-config.js';
import { cloud, startCloud, cloudCard, cloudActions, refreshInfo } from './account.js';

const TAGS = ['Snel', 'Vega', 'Soep', 'Oven', 'Pasta', 'Salade', 'Vis', 'Kids'];
const ui = { weekStart: startOfWeek(), search: '', tag: 'Alles', draft: null, wide: false };
const $view = () => document.getElementById('view');
const $side = () => document.getElementById('side');
const wideMQ = matchMedia('(min-width: 900px)');

// ---------- Router ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name = 'week', id] = h.split('/');
  return { name: name || 'week', id: id && decodeURIComponent(id) };
}
const go = (hash) => { if (location.hash !== hash) location.hash = hash; else render(); };

// ---------- Weergave ----------
function render() {
  const r = route();
  ui.wide = wideMQ.matches;
  const active = document.activeElement;
  const keep = active && active.id ? { id: active.id, val: active.value, s: active.selectionStart, e: active.selectionEnd } : null;
  const view = $view();
  const scroll = view.scrollTop;
  const views = { week: viewWeek, recepten: viewRecipes, recept: viewRecipe, bewerk: viewEditor, lijst: viewList, voorraad: viewPantry };
  const fn = views[r.name] || viewWeek;
  view.innerHTML = fn(r);
  view.dataset.route = r.name;
  const showSide = ui.wide && r.name === 'week';
  $side().hidden = !showSide;
  $side().innerHTML = showSide ? viewList({}, true) : '';
  const tab = { recept: 'recepten', bewerk: 'recepten' }[r.name] || r.name;
  document.querySelectorAll('[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) { el.focus({ preventScroll: true }); if (el.setSelectionRange && keep.s != null) try { el.setSelectionRange(keep.s, keep.e); } catch { /* */ } }
  }
  if (view.dataset.lastRoute === location.hash) view.scrollTop = scroll; else view.scrollTop = 0;
  view.dataset.lastRoute = location.hash;
}

// ===================== WEEKMENU =====================
function viewWeek() {
  const { menu, recipes } = store.state;
  const ws = ui.weekStart;
  const rel = relWeek(ws);
  const tk = todayKey();
  const days = weekDays(ws).map((d, i) => {
    const key = dateKey(d);
    const entries = menu[key] || [];
    const today = key === tk ? ' today' : '';
    if (!entries.length) {
      return `<button class="day empty${today}" data-action="pick" data-date="${key}">${icon('plus', 'sm')}<span>${DAY_LONG[i]} ${d.getDate()}: kies een recept</span></button>`;
    }
    const rows = entries.map((en) => {
      const rcp = en.recipeId ? recipes[en.recipeId] : null;
      const title = rcp ? rcp.title : en.note || 'Recept verwijderd';
      const meta = rcp ? [key === tk ? 'Vandaag' : '', fmtMinutes(rcp.minutes), en.servings ? `${en.servings} pers` : '', (rcp.tags || []).includes('Vega') ? 'vega' : ''].filter(Boolean).join(' · ') : (key === tk ? 'Vandaag' : 'Notitie');
      return `<button class="entry" data-action="entry" data-date="${key}" data-entry="${en.id}">
        <span class="dtxt"><b>${esc(title)}</b><span>${esc(meta)}</span></span>${rcp ? thumb(rcp) : `<span class="thumb note">${icon('note')}</span>`}</button>`;
    }).join('');
    return `<div class="day${today}"><div class="dnum"><small>${DAY_SHORT[i]}</small>${d.getDate()}</div><div class="entries">${rows}</div></div>`;
  }).join('');
  const planned = weekDays(ws).reduce((n, d) => n + (menu[dateKey(d)] || []).filter((e) => e.recipeId).length, 0);
  return `
  <header class="ah">
    <div><div class="eb">${esc(weekLabel(ws))}</div><h1>Weekmenu</h1></div>
    <div class="weeknav">
      <button class="iconbtn" data-action="week" data-d="-1" aria-label="Vorige week">${icon('left')}</button>
      <button class="pillbtn" data-action="week" data-d="0">${esc(rel || 'Naar vandaag')}</button>
      <button class="iconbtn" data-action="week" data-d="1" aria-label="Volgende week">${icon('right')}</button>
    </div>
  </header>
  <div class="days">${days}</div>
  ${ui.wide ? '' : `<button class="cta" data-action="make-list" ${planned ? '' : 'disabled'}>${icon('cart')}Maak boodschappenlijst</button>`}
  ${ui.wide ? `<button class="cta" data-action="make-list" ${planned ? '' : 'disabled'}>${icon('cart')}Gebruik deze week voor de lijst</button>` : ''}`;
}

function pickRecipeSheet(onPick, { title = 'Kies een recept', allowNote = true } = {}) {
  const recipes = Object.values(store.state.recipes).sort((a, b) => a.title.localeCompare(b.title, 'nl'));
  const listHtml = (q) => {
    const f = recipes.filter((r) => matchRecipe(r, q));
    if (!f.length) return `<p class="muted pad">Geen recepten gevonden.</p>`;
    return f.map((r) => `<button class="pick-row" data-id="${r.id}">${thumb(r)}<span class="dtxt"><b>${esc(r.title)}</b><span>${esc([fmtMinutes(r.minutes), r.servings ? r.servings + ' pers' : ''].filter(Boolean).join(' · '))}</span></span></button>`).join('');
  };
  const s = openSheet(`
    <h3 class="sheet-title">${esc(title)}</h3>
    <label class="search">${icon('search', 'sm')}<input id="pick-q" type="search" placeholder="Zoek recept of ingrediënt" autocomplete="off"></label>
    <div class="pick-list">${listHtml('')}</div>
    ${allowNote ? `<div class="note-row"><input id="pick-note" placeholder="Of iets anders, bijv. uit eten, restjes" maxlength="60"><button class="btn small" data-note>Zet erin</button></div>` : ''}
  `, { wide: true });
  const q = s.querySelector('#pick-q');
  q.addEventListener('input', () => { s.querySelector('.pick-list').innerHTML = listHtml(q.value); });
  s.querySelector('.pick-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    closeSheet(); onPick({ recipeId: b.dataset.id });
  });
  const noteBtn = s.querySelector('[data-note]');
  if (noteBtn) {
    const submit = () => { const v = s.querySelector('#pick-note').value.trim(); if (!v) return; closeSheet(); onPick({ note: v }); };
    noteBtn.onclick = submit;
    s.querySelector('#pick-note').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }
}

function addEntry(date, pick, replaceId) {
  const r = pick.recipeId ? store.state.recipes[pick.recipeId] : null;
  return store.update('menu', (m) => {
    const arr = m[date] || [];
    const entry = { id: replaceId || uid(), ...pick, servings: r?.servings || null };
    const idx = arr.findIndex((e) => e.id === replaceId);
    if (idx >= 0) arr[idx] = entry; else arr.push(entry);
    m[date] = arr;
  });
}

function entrySheet(date, entryId) {
  const entry = (store.state.menu[date] || []).find((e) => e.id === entryId);
  if (!entry) return;
  const r = entry.recipeId ? store.state.recipes[entry.recipeId] : null;
  const d = fromKey(date);
  const dayName = `${DAY_LONG[(d.getDay() + 6) % 7]} ${d.getDate()}`;
  const s = openSheet(`
    <div class="eb">${esc(dayName)}</div>
    <h3 class="sheet-title">${esc(r ? r.title : entry.note || 'Recept')}</h3>
    ${r ? `<div class="stepper-row"><span>${icon('users')} Personen</span>
      <div class="stepper"><button data-srv="-1" aria-label="Minder">${icon('minus')}</button><b id="srv">${entry.servings || r.servings || '?'}</b><button data-srv="1" aria-label="Meer">${icon('plus')}</button></div></div>` : ''}
    <div class="menu-list">
      ${r ? `<button data-do="open">${icon('book')}Bekijk recept</button>` : ''}
      <button data-do="swap">${icon('swap')}Ander recept kiezen</button>
      <button data-do="more">${icon('plus')}Nog een gerecht op deze dag</button>
      <button data-do="remove" class="danger-text">${icon('trash')}Weghalen uit weekmenu</button>
    </div>`);
  s.addEventListener('click', (e) => {
    const sv = e.target.closest('[data-srv]');
    if (sv) {
      const cur = entry.servings || r.servings || 2;
      entry.servings = Math.max(1, Math.min(20, cur + +sv.dataset.srv));
      s.querySelector('#srv').textContent = entry.servings;
      store.update('menu', (m) => { const x = (m[date] || []).find((y) => y.id === entryId); if (x) x.servings = entry.servings; });
      return;
    }
    const b = e.target.closest('[data-do]'); if (!b) return;
    const act = b.dataset.do;
    closeSheet();
    setTimeout(() => {
      if (act === 'open') go(`#/recept/${r.id}`);
      if (act === 'swap') pickRecipeSheet((p) => addEntry(date, p, entryId));
      if (act === 'more') pickRecipeSheet((p) => addEntry(date, p));
      if (act === 'remove') {
        const before = structuredClone(store.state.menu[date] || []);
        store.update('menu', (m) => { m[date] = (m[date] || []).filter((x) => x.id !== entryId); if (!m[date].length) delete m[date]; });
        toast('Weggehaald', { label: 'Ongedaan maken', fn: () => store.update('menu', (m) => { m[date] = before; }) });
      }
    }, 230);
  });
}

function makeList() {
  const ws = dateKey(ui.weekStart);
  const cur = store.state.list;
  if (cur.weekStart !== ws) {
    store.update('list', (l) => ({ weekStart: ws, checked: {}, pantry: {}, manual: l.manual.filter((m) => !m.checked) }));
  }
  if (!ui.wide) go('#/lijst'); else toast('De lijst gebruikt nu deze week');
}

// ===================== RECEPTEN =====================
function matchRecipe(r, q) {
  q = (q || '').trim().toLowerCase();
  if (!q) return true;
  return r.title.toLowerCase().includes(q) || (r.ingredients || []).some((i) => i.toLowerCase().includes(q)) || (r.tags || []).some((t) => t.toLowerCase() === q);
}

function recipeGrid() {
  const all = Object.values(store.state.recipes).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const list = all.filter((r) => matchRecipe(r, ui.search) && (ui.tag === 'Alles' || (ui.tag === 'Snel' ? (r.minutes && r.minutes <= 30) || (r.tags || []).includes('Snel') : (r.tags || []).includes(ui.tag))));
  if (!all.length) return `<div class="empty-state">${icon('book')}<b>Nog geen recepten</b><p>Plak een link of maak een foto van een recept om te beginnen.</p></div>`;
  if (!list.length) return `<p class="muted pad">Niets gevonden voor deze zoekopdracht.</p>`;
  return `<div class="grid">${list.map((r) => `
    <a class="rc" href="#/recept/${r.id}">${thumb(r, 'rc-img')}
      <div class="t"><b>${esc(r.title)}</b><span>${r.minutes ? icon('clock') + fmtMinutes(r.minutes) : ''}${r.servings ? `<i class="dot"></i>${r.servings} pers` : ''}</span></div></a>`).join('')}</div>`;
}

function viewRecipes() {
  const recipes = Object.values(store.state.recipes);
  const used = new Set(recipes.flatMap((r) => r.tags || []));
  const tags = ['Alles', ...TAGS.filter((t) => t === 'Snel' || used.has(t)), ...[...used].filter((t) => !TAGS.includes(t))];
  return `
  <header class="ah">
    <div><div class="eb">${recipes.length} ${recipes.length === 1 ? 'recept' : 'recepten'}</div><h1>Recepten</h1></div>
    <button class="roundbtn" data-action="add-recipe" aria-label="Recept toevoegen">${icon('plus')}</button>
  </header>
  <label class="search">${icon('search', 'sm')}<input id="rq" type="search" placeholder="Zoek recept of ingrediënt" value="${esc(ui.search)}" autocomplete="off"></label>
  <div class="chips">${tags.map((t) => `<button class="chip ${t === ui.tag ? 'on' : ''}" data-action="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
  <div class="import">
    <b>Nieuw recept toevoegen</b>
    <div class="btns">
      <button data-action="import-link">${icon('link', 'sm')}Plak link</button>
      <button data-action="import-photo">${icon('cam', 'sm')}Foto</button>
      <button data-action="import-text">${icon('text', 'sm')}Tekst</button>
    </div>
  </div>
  <div id="rgrid">${recipeGrid()}</div>`;
}

function addRecipeSheet() {
  const s = openSheet(`<h3 class="sheet-title">Recept toevoegen</h3>
    <div class="menu-list">
      <button data-do="link">${icon('link')}<span><b>Plak een link</b><small>Van een receptensite, bijv. Allerhande of Leuke Recepten</small></span></button>
      <button data-do="photo">${icon('cam')}<span><b>Foto van een recept</b><small>Uit een kookboek of tijdschrift, de app leest de tekst</small></span></button>
      <button data-do="text">${icon('text')}<span><b>Tekst plakken</b><small>Gekopieerd uit een app, mail of bericht. Tip: in de Galerij kopieer je met de T-knop de tekst van een foto, dat werkt vaak het best.</small></span></button>
      <button data-do="manual">${icon('pen')}<span><b>Zelf typen</b><small>Een eigen of familierecept</small></span></button>
    </div>`);
  s.addEventListener('click', (e) => {
    const b = e.target.closest('[data-do]'); if (!b) return;
    closeSheet();
    setTimeout(() => ({ link: linkSheet, photo: pickPhoto, text: () => textSheet(), manual: () => startDraft({}) })[b.dataset.do](), 230);
  });
}

function linkSheet(prefill = '') {
  const s = openSheet(`<h3 class="sheet-title">Recept via link</h3>
    <p class="muted">Kopieer de link van het recept en plak hem hier. De app haalt titel, foto, ingrediënten en bereiding op.</p>
    <div class="field-row"><input id="url-in" type="url" inputmode="url" placeholder="https://..." value="${esc(prefill)}">
    ${navigator.clipboard?.readText ? `<button class="btn ghost small" data-paste>Plakken</button>` : ''}</div>
    <div class="status" hidden></div>
    <div class="row-btns"><button class="btn ghost" data-close>Annuleren</button><button class="btn" data-go>Ophalen</button></div>`);
  const input = s.querySelector('#url-in');
  const status = s.querySelector('.status');
  s.querySelector('[data-paste]')?.addEventListener('click', async () => {
    try { const t = await navigator.clipboard.readText(); input.value = extractUrl(t) || t; } catch { input.focus(); }
  });
  const run = async () => {
    const url = extractUrl(input.value) || input.value.trim();
    if (!/^https?:\/\//.test(url)) { status.hidden = false; status.className = 'status err'; status.textContent = 'Dit lijkt geen link. Begint hij met https://?'; return; }
    status.hidden = false; status.className = 'status busy'; status.innerHTML = `<span class="spinner"></span><span id="st-txt">Recept ophalen...</span>`;
    s.querySelector('[data-go]').disabled = true;
    const slow = setTimeout(() => { const t = s.querySelector('#st-txt'); if (t) t.textContent = 'Dit duurt even, we proberen een paar routes...'; }, 5000);
    try {
      const rec = await importFromUrl(url).finally(() => clearTimeout(slow));
      closeSheet();
      startDraft({ ...rec, ingredients: rec.ingredients, steps: rec.steps }, rec.partial
        ? 'Op deze pagina stond geen herkenbaar recept. Titel en foto zijn overgenomen; vul de rest aan of plak de tekst.'
        : 'Gevonden! Kijk het even na en sla op.');
    } catch {
      s.querySelector('[data-go]').disabled = false;
      status.className = 'status err';
      status.innerHTML = `Het lukte niet om deze pagina op te halen. Kopieer de recepttekst op de site en kies <button class="linkbtn" data-text>tekst plakken</button>.`;
      status.querySelector('[data-text]').onclick = () => { closeSheet(); setTimeout(() => textSheet(url), 230); };
    }
  };
  s.querySelector('[data-go]').onclick = run;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  if (!prefill) setTimeout(() => input.focus(), 250); else run();
}

function textSheet(source = '') {
  const s = openSheet(`<h3 class="sheet-title">Recepttekst plakken</h3>
    <p class="muted">Plak de hele tekst: titel, ingrediënten en bereiding. De app zet het in de juiste vakjes, daarna kun je het nakijken.</p>
    <textarea id="txt-in" rows="9" placeholder="Shakshuka met feta&#10;&#10;Ingrediënten&#10;1 ui&#10;2 blikken tomatenblokjes&#10;...&#10;&#10;Bereiding&#10;..."></textarea>
    <div class="row-btns"><button class="btn ghost" data-close>Annuleren</button><button class="btn" data-go>Verder</button></div>`);
  s.querySelector('[data-go]').onclick = () => {
    const parsed = parseRecipeText(s.querySelector('#txt-in').value);
    closeSheet();
    setTimeout(() => startDraft({ ...parsed, source }, 'Kijk even of alles in het juiste vak staat.'), 230);
  };
}

function pickPhoto() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => {
    const file = inp.files?.[0]; if (!file) return;
    const s = openSheet(`<h3 class="sheet-title">Foto lezen</h3>
      <p class="muted">De tekst op de foto wordt herkend. De eerste keer duurt dit wat langer, omdat de Nederlandse taalbestanden worden geladen. Een recht van boven genomen foto met goed licht werkt het best.</p>
      <div class="prog"><div class="bar"><i style="width:4%"></i></div><small id="ocr-st">Voorbereiden...</small></div>`);
    const bar = s.querySelector('.bar i'), st = s.querySelector('#ocr-st');
    try {
      const [img, text] = await Promise.all([
        shrinkImage(file),
        ocrImage(file, (p) => { bar.style.width = `${Math.max(4, Math.round(p * 100))}%`; st.textContent = `Tekst lezen... ${Math.round(p * 100)}%`; }),
      ]);
      const parsed = parseRecipeText(text);
      closeSheet();
      setTimeout(() => startDraft({ ...parsed, image: img }, parsed.ingredients.length
        ? 'Tekst gelezen. Tekstherkenning maakt soms foutjes, dus kijk het even na. Lukt het slecht? Open de foto in de Galerij, tik op de T-knop, kopieer de tekst en kies Tekst plakken.'
        : 'Er is weinig herkend. Tip: open de foto in de Galerij, tik op de T-knop om de tekst te kopiëren en kies bij Recept toevoegen voor Tekst plakken.'), 230);
    } catch (err) {
      st.textContent = err.message || 'Er ging iets mis bij het lezen.';
      st.classList.add('err');
    }
  };
  inp.click();
}

function startDraft(data, notice = '') {
  ui.draft = {
    id: null, title: '', image: '', minutes: null, servings: 4, tags: [], ingredients: [], steps: [], source: '',
    ...Object.fromEntries(Object.entries(data).filter(([, v]) => v != null && v !== '')), notice,
  };
  if (!ui.draft.servings) ui.draft.servings = 4;
  go('#/bewerk/nieuw');
}

function viewRecipe({ id }) {
  const r = store.state.recipes[id];
  if (!r) return `<div class="empty-state"><b>Recept niet gevonden</b><a class="btn" href="#/recepten">Naar recepten</a></div>`;
  const ings = (r.ingredients || []).map((raw, i) => {
    const p = parseLine(raw);
    const pan = p && isPantry(p.name);
    const qty = p ? fmtQty(p.qty, p.unit) : '';
    return `<li><span class="q">${esc(qty)}</span><span class="n">${esc(p ? p.name : raw)}${p?.note ? ` <small>${esc(p.note)}</small>` : ''}</span>
      ${p ? `<button class="jar ${pan ? 'on' : ''}" data-action="toggle-pantry" data-i="${i}" aria-pressed="${pan}" title="${pan ? 'Staat in je voorraadkast' : 'Markeer als voorraadkast'}">${icon('jar')}</button>` : ''}</li>`;
  }).join('');
  const steps = (r.steps || []).map((s) => `<li>${esc(s)}</li>`).join('');
  let host = '';
  try { host = r.source ? new URL(r.source).hostname.replace(/^www\./, '') : ''; } catch { /* */ }
  return `
  <div class="detail">
    <div class="hero">${thumb(r, 'hero-img')}
      <a class="iconbtn float" href="#/recepten" aria-label="Terug">${icon('left')}</a>
    </div>
    <div class="detail-body">
      <h1>${esc(r.title)}</h1>
      <div class="meta">
        ${r.minutes ? `<span>${icon('clock', 'sm')}${fmtMinutes(r.minutes)}</span>` : ''}
        ${r.servings ? `<span>${icon('users', 'sm')}${r.servings} personen</span>` : ''}
        ${(r.tags || []).map((t) => `<span class="tagpill">${esc(t)}</span>`).join('')}
      </div>
      <div class="row-btns left">
        <button class="btn" data-action="plan" data-id="${r.id}">${icon('cal', 'sm')}Zet in weekmenu</button>
        <a class="btn ghost" href="#/bewerk/${r.id}">${icon('edit', 'sm')}Wijzig</a>
        <button class="iconbtn" data-action="delete-recipe" data-id="${r.id}" aria-label="Verwijder recept">${icon('trash')}</button>
      </div>
      <section class="card">
        <h2>Ingrediënten</h2>
        <p class="hint">${icon('jar', 'xs')} Tik op het potje om iets als voorraadkast-ingrediënt te markeren.</p>
        <ul class="ing">${ings || '<li class="muted">Nog geen ingrediënten.</li>'}</ul>
      </section>
      ${steps ? `<section class="card"><h2>Bereiding</h2><ol class="steps">${steps}</ol></section>` : ''}
      ${r.source ? `<a class="source" href="${esc(r.source)}" target="_blank" rel="noopener">${icon('ext', 'sm')}Origineel recept op ${esc(host)}</a>` : ''}
    </div>
  </div>`;
}

function planSheet(recipeId) {
  const r = store.state.recipes[recipeId];
  const ws = startOfWeek();
  const weeks = [ws, addDays(ws, 7)];
  const tk = todayKey();
  const html = weeks.map((w, wi) => `<h4 class="sub">${wi ? 'Volgende week' : 'Deze week'}</h4><div class="plan-days">${weekDays(w).map((d, i) => {
    const key = dateKey(d);
    const cur = (store.state.menu[key] || []).map((e) => (e.recipeId ? store.state.recipes[e.recipeId]?.title : e.note)).filter(Boolean);
    const past = key < tk;
    return `<button data-date="${key}" ${past ? 'class="past"' : ''}><b>${DAY_SHORT[i]} ${d.getDate()}</b><small>${esc(cur.join(', ') || 'vrij')}</small></button>`;
  }).join('')}</div>`).join('');
  const s = openSheet(`<h3 class="sheet-title">Wanneer eten jullie ${esc(r.title)}?</h3>${html}`, { wide: true });
  s.addEventListener('click', (e) => {
    const b = e.target.closest('[data-date]'); if (!b) return;
    addEntry(b.dataset.date, { recipeId }).then(() => {});
    closeSheet();
    const d = fromKey(b.dataset.date);
    toast(`Op ${DAY_LONG[(d.getDay() + 6) % 7].toLowerCase()} ${d.getDate()} gezet`, { label: 'Bekijk', fn: () => { ui.weekStart = startOfWeek(d); go('#/week'); } });
  });
}

// ---------- Bewerken ----------
function viewEditor({ id }) {
  const isNew = id === 'nieuw';
  const r = isNew ? ui.draft : store.state.recipes[id];
  if (!r) return `<div class="empty-state"><b>Niets om te bewerken</b><a class="btn" href="#/recepten">Naar recepten</a></div>`;
  const tagSet = new Set(r.tags || []);
  return `
  <form class="editor" id="editor" data-id="${isNew ? '' : esc(id)}">
    <header class="ah">
      <div><div class="eb">${isNew ? 'Nieuw recept' : 'Recept wijzigen'}</div><h1>${isNew ? 'Nakijken' : 'Wijzigen'}</h1></div>
      <a class="iconbtn" href="${isNew ? '#/recepten' : `#/recept/${esc(id)}`}" aria-label="Annuleren">${icon('x')}</a>
    </header>
    ${r.notice ? `<div class="notice">${icon('sparkle', 'sm')}<span>${esc(r.notice)}</span></div>` : ''}
    <div class="photo-edit">
      <div id="ed-img-prev">${thumb(r, 'hero-img small')}</div>
      <div class="photo-btns">
        <button type="button" class="btn ghost small" data-action="ed-photo">${icon('cam', 'sm')}Foto kiezen</button>
        ${r.image ? `<button type="button" class="btn ghost small" data-action="ed-photo-del">Foto weghalen</button>` : ''}
      </div>
      <input type="hidden" name="image" value="${esc(r.image || '')}">
    </div>
    <label class="fld"><span>Naam</span><input name="title" required value="${esc(r.title)}" placeholder="Bijv. Shakshuka met feta"></label>
    <div class="fld-row">
      <label class="fld"><span>Tijd (minuten)</span><input name="minutes" type="number" inputmode="numeric" min="0" value="${r.minutes || ''}"></label>
      <label class="fld"><span>Personen</span><input name="servings" type="number" inputmode="numeric" min="1" value="${r.servings || ''}"></label>
    </div>
    <div class="fld"><span>Labels</span>
      <div class="chips wrap">${[...new Set([...TAGS, ...tagSet])].map((t) => `<label class="chip toggle"><input type="checkbox" name="tag" value="${esc(t)}" ${tagSet.has(t) ? 'checked' : ''}>${esc(t)}</label>`).join('')}</div>
    </div>
    <label class="fld"><span>Ingrediënten <small>één per regel, bijv. "200 g feta"</small></span>
      <textarea name="ingredients" rows="${Math.max(6, (r.ingredients || []).length + 1)}">${esc((r.ingredients || []).join('\n'))}</textarea></label>
    <label class="fld"><span>Bereiding <small>één stap per regel</small></span>
      <textarea name="steps" rows="${Math.max(5, (r.steps || []).length + 2)}">${esc((r.steps || []).join('\n'))}</textarea></label>
    <label class="fld"><span>Bron (link)</span><input name="source" type="url" value="${esc(r.source || '')}" placeholder="https://..."></label>
    <div class="row-btns sticky"><a class="btn ghost" href="${isNew ? '#/recepten' : `#/recept/${esc(id)}`}">Annuleren</a><button class="btn" type="submit">${icon('check', 'sm')}Opslaan</button></div>
  </form>`;
}

function readEditor(form) {
  const fd = new FormData(form);
  const lines = (s) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    title: String(fd.get('title') || '').trim(),
    image: String(fd.get('image') || ''),
    minutes: +fd.get('minutes') || null,
    servings: +fd.get('servings') || null,
    tags: fd.getAll('tag').map(String),
    ingredients: lines(fd.get('ingredients')),
    steps: lines(fd.get('steps')),
    source: String(fd.get('source') || '').trim(),
  };
}

async function saveEditor(form) {
  const data = readEditor(form);
  if (!data.title) { toast('Geef het recept een naam'); form.title.focus(); return; }
  const id = form.dataset.id || uid();
  await store.update('recipes', (rs) => {
    rs[id] = { ...(rs[id] || { createdAt: Date.now() }), ...data, id, updatedAt: Date.now() };
  });
  ui.draft = null;
  toast('Recept opgeslagen');
  location.replace(`#/recept/${id}`);
}

// ===================== BOODSCHAPPENLIJST =====================
function viewList(_r, compact = false) {
  const L = computeList();
  const pct = L.total ? Math.round((L.doneCount / L.total) * 100) : 0;
  const item = (it) => `
    <div class="it ${it.checked ? 'done' : ''}">
      <button class="it-main" data-action="check" data-key="${esc(it.key)}" aria-pressed="${it.checked}">
        <span class="box">${icon('check')}</span>
        <span class="n">${esc(it.name)}${it.recipes?.length ? `<small>${esc(it.recipes.join(', '))}</small>` : ''}</span>
        <span class="q">${esc(it.qtyText)}</span>
      </button>
      ${it.manual ? `<button class="x" data-action="del-manual" data-id="${it.id}" aria-label="Verwijder ${esc(it.name)}">${icon('x')}</button>` : ''}
    </div>`;
  const pantry = L.pantryItems.length ? `
    <section class="pantry">
      <div class="ph-h">${icon('jar', 'sm')}Eerst checken in de voorraadkast<small>${L.pantryOpen ? `${L.pantryOpen} nog checken` : 'alles gecheckt'}</small></div>
      ${L.pantryItems.map((p) => `
        <div class="pi ${p.pantryState || 'open'}">
          <span class="n">${esc(p.name)}${p.qtyText ? ` <small>${esc(p.qtyText)}</small>` : ''}</span>
          <div class="seg" role="group" aria-label="${esc(p.name)}">
            <button data-action="pantry-state" data-key="${esc(p.key)}" data-v="have" aria-pressed="${p.pantryState === 'have'}">${icon('check', 'xs')}In huis</button>
            <button data-action="pantry-state" data-key="${esc(p.key)}" data-v="need" aria-pressed="${p.pantryState === 'need'}">${icon('cart', 'xs')}Nodig</button>
          </div>
        </div>`).join('')}
    </section>` : '';
  const empty = !L.total && !L.pantryItems.length;
  return `
  <header class="ah">
    <div><button class="eb eb-btn" data-action="list-week">Voor ${esc(weekLabel(L.weekStart).replace(/ ·.*/, '').toLowerCase())} ${icon('down', 'xs')}</button><h1>Boodschappen</h1></div>
  </header>
  <form class="addrow" data-action-submit="add-item">
    <input id="${compact ? 'add-item-side' : 'add-item'}" placeholder="Voeg iets toe, bijv. 2 pak melk" autocomplete="off" enterkeyhint="done">
    <button class="btn small" type="submit" aria-label="Toevoegen">${icon('plus', 'sm')}</button>
  </form>
  ${L.total ? `<div class="prog"><div class="bar"><i style="width:${pct}%"></i></div><small>${L.doneCount} van ${L.total} in de mand${L.pantryOpen ? ` · ${L.pantryOpen} voorraad nog checken` : ''}</small></div>` : ''}
  ${pantry}
  ${L.groups.map((g) => `<div class="grp"><h5>${esc(g.label)}</h5>${g.items.map(item).join('')}</div>`).join('')}
  ${L.done.length ? `<details class="grp done-grp"><summary><h5>In de mand (${L.done.length})</h5>${icon('down', 'xs')}</summary>${L.done.map(item).join('')}</details>` : ''}
  ${empty ? `<div class="empty-state">${icon('cart')}<b>De lijst is nog leeg</b><p>${L.recipeCount ? '' : 'Kies recepten in het weekmenu, dan komen de ingrediënten hier vanzelf. '}Losse dingen voeg je hierboven toe.</p>${compact ? '' : `<a class="btn ghost" href="#/week">Naar weekmenu</a>`}</div>` : ''}
  ${!empty && !compact ? `<button class="btn ghost wide" data-action="clear-list">${icon('trash', 'sm')}Lijst opnieuw beginnen</button>` : ''}`;
}

function listWeekSheet() {
  const ws = startOfWeek();
  const opts = [-1, 0, 1, 2].map((n) => addDays(ws, n * 7));
  const cur = store.state.list.weekStart;
  const s = openSheet(`<h3 class="sheet-title">Lijst voor welke week?</h3><div class="menu-list">${opts.map((w) => `<button data-w="${dateKey(w)}" class="${dateKey(w) === cur ? 'on' : ''}">${icon('cal')}<span><b>${esc(relWeek(w) || weekLabel(w).replace(/ ·.*/, ''))}</b><small>${esc(weekLabel(w))}</small></span></button>`).join('')}</div>`);
  s.addEventListener('click', (e) => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    closeSheet();
    if (b.dataset.w !== cur) store.update('list', (l) => ({ weekStart: b.dataset.w, checked: {}, pantry: {}, manual: l.manual.filter((m) => !m.checked) }));
  });
}

function addManual(text) {
  const p = parseLine(text);
  if (!p) return;
  const qty = p.qty != null || p.unit ? fmtQty(p.qty, p.unit) : '';
  store.update('list', (l) => { l.manual.push({ id: uid(), name: p.name.charAt(0).toUpperCase() + p.name.slice(1), qty, cat: categorize(p.name), checked: false }); });
}

// ===================== VOORRAAD =====================
function viewPantry() {
  const items = [...store.state.pantry].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  const nRec = Object.keys(store.state.recipes).length;
  return `
  <header class="ah"><div><div class="eb">${items.length} ingrediënten</div><h1>Voorraadkast</h1></div></header>
  <p class="lede">Dingen die je meestal in huis hebt, zoals kruiden en olie. Staat er zoiets in een recept, dan vraagt de lijst eerst of het nog in huis is.</p>
  <form class="addrow" data-action-submit="add-pantry">
    <input id="add-pantry" placeholder="Voeg toe, bijv. kaneel" autocomplete="off" enterkeyhint="done">
    <button class="btn small" type="submit" aria-label="Toevoegen">${icon('plus', 'sm')}</button>
  </form>
  <div class="pantry-chips">${items.map((p) => `<span class="pchip">${esc(p.name)}<button data-action="del-pantry" data-id="${p.id}" aria-label="Verwijder ${esc(p.name)}">${icon('x', 'xs')}</button></span>`).join('') || '<p class="muted">Nog leeg.</p>'}</div>

  ${cloudCard()}
  <section class="card settings">
    <h2>Gegevens</h2>
    <p class="muted">${cloud.on
      ? `Alles wordt live gedeeld (${nRec} recepten). Een back-up is een extra kopie voor de zekerheid.`
      : `Alles staat nu alleen op dit toestel (${nRec} recepten). Met een back-up kun je recepten overzetten naar een ander toestel.`}</p>
    <div class="row-btns left wrap">
      <button class="btn ghost small" data-action="backup">${icon('save', 'sm')}Back-up opslaan</button>
      <button class="btn ghost small" data-action="restore">${icon('upload', 'sm')}Back-up terugzetten</button>
      ${installPrompt ? `<button class="btn small" data-action="install">${icon('plus', 'sm')}Installeer als app</button>` : ''}
    </div>
  </section>`;
}

// ===================== Acties =====================
const actions = {
  ...cloudActions,
  week: (el) => { const d = +el.dataset.d; ui.weekStart = d === 0 ? startOfWeek() : addDays(ui.weekStart, d * 7); render(); },
  pick: (el) => pickRecipeSheet((p) => addEntry(el.dataset.date, p)),
  entry: (el) => entrySheet(el.dataset.date, el.dataset.entry),
  'make-list': makeList,
  tag: (el) => { ui.tag = el.dataset.tag; render(); },
  'add-recipe': addRecipeSheet,
  'import-link': () => linkSheet(),
  'import-photo': pickPhoto,
  'import-manual': () => startDraft({}),
  'import-text': () => textSheet(),
  plan: (el) => planSheet(el.dataset.id),
  'delete-recipe': async (el) => {
    const r = store.state.recipes[el.dataset.id];
    if (!(await confirmSheet('Recept verwijderen?', `"${r.title}" verdwijnt uit de bibliotheek. In het weekmenu blijft de dag leeg achter.`))) return;
    await store.update('recipes', (rs) => { delete rs[r.id]; });
    go('#/recepten'); toast('Recept verwijderd');
  },
  'toggle-pantry': (el) => {
    const r = store.state.recipes[route().id];
    const p = parseLine(r.ingredients[+el.dataset.i]);
    const was = isPantry(p.name);
    togglePantry(p.name);
    toast(was ? `${p.name} is geen voorraadkast meer` : `${coreName(p.name)} staat nu in de voorraadkast`);
  },
  'ed-photo': () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return;
      const url = await shrinkImage(f);
      const form = document.getElementById('editor');
      form.image.value = url;
      document.getElementById('ed-img-prev').innerHTML = thumb({ image: url }, 'hero-img small');
    };
    inp.click();
  },
  'ed-photo-del': (el) => {
    const form = document.getElementById('editor');
    form.image.value = '';
    document.getElementById('ed-img-prev').innerHTML = thumb({ title: form.title.value }, 'hero-img small');
    el.remove();
  },
  check: (el) => {
    const key = el.dataset.key;
    if (key.startsWith('m:')) store.update('list', (l) => { const m = l.manual.find((x) => x.id === key.slice(2)); if (m) m.checked = !m.checked; });
    else store.update('list', (l) => { if (l.checked[key]) delete l.checked[key]; else l.checked[key] = true; });
  },
  'del-manual': (el) => store.update('list', (l) => { l.manual = l.manual.filter((m) => m.id !== el.dataset.id); }),
  'pantry-state': (el) => store.update('list', (l) => {
    const k = el.dataset.key, v = el.dataset.v;
    if (l.pantry[k] === v) delete l.pantry[k]; else l.pantry[k] = v;
  }),
  'focus-add': () => document.getElementById('add-item')?.focus(),
  'list-week': listWeekSheet,
  'clear-list': async () => {
    if (!(await confirmSheet('Lijst opnieuw beginnen?', 'Alle vinkjes, voorraad-antwoorden en losse items worden gewist. De ingrediënten uit het weekmenu blijven staan.', 'Opnieuw beginnen'))) return;
    store.update('list', (l) => ({ ...l, checked: {}, pantry: {}, manual: [] }));
  },
  'del-pantry': (el) => {
    const item = store.state.pantry.find((p) => p.id === el.dataset.id);
    store.update('pantry', (p) => p.filter((x) => x.id !== el.dataset.id));
    toast(`${item.name} verwijderd`, { label: 'Ongedaan maken', fn: () => store.update('pantry', (p) => { p.push(item); }) });
  },
  backup: () => {
    const blob = new Blob([store.exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `boodschappen-backup-${todayKey()}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  restore: () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return;
      if (!(await confirmSheet('Back-up terugzetten?', 'Alles op dit toestel wordt vervangen door de back-up.', 'Terugzetten'))) return;
      try { await store.importAll(await f.text()); toast('Back-up teruggezet'); } catch (e) { toast(e.message || 'Dit bestand werkt niet'); }
    };
    inp.click();
  },
  install: async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); },
};

const submits = {
  'add-item': (form) => { const inp = form.querySelector('input'); const v = inp.value.trim(); if (!v) return; addManual(v); inp.value = ''; inp.focus(); },
  'add-pantry': (form) => {
    const inp = form.querySelector('input'); const v = inp.value.trim().toLowerCase(); if (!v) return;
    if (!store.state.pantry.some((p) => p.name === v)) store.update('pantry', (p) => { p.push({ id: uid(), name: v }); });
    inp.value = ''; inp.focus();
  },
};

let installPrompt = null;

function bind() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('submit', (e) => {
    const form = e.target;
    e.preventDefault();
    if (form.id === 'editor') return saveEditor(form);
    submits[form.dataset.actionSubmit]?.(form);
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'rq') { ui.search = e.target.value; document.getElementById('rgrid').innerHTML = recipeGrid(); }
  });
  window.addEventListener('hashchange', () => { if (sheetOpen()) closeSheet(true); render(); if (route().name === 'voorraad') refreshInfo(render); });
  wideMQ.addEventListener('change', render);
  store.subscribe(() => { if (route().name !== 'bewerk') render(); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (route().name === 'voorraad') render(); });
}

function shell() {
  const tabs = [['week', 'cal', 'Weekmenu'], ['recepten', 'book', 'Recepten'], ['lijst', 'list', 'Lijst'], ['voorraad', 'jar', 'Voorraad']];
  const links = tabs.map(([t, ic, l]) => `<a href="#/${t}" data-tab="${t}"><span class="ic">${icon(ic)}</span>${l}</a>`).join('');
  document.getElementById('app').innerHTML = `
    <nav class="rail" aria-label="Menu"><div class="logo">B</div>${links}</nav>
    <main id="view" tabindex="-1"></main>
    <aside id="side" hidden></aside>
    <nav class="nav" aria-label="Menu">${links}</nav>`;
}

async function handleShare() {
  const q = new URLSearchParams(location.search);
  if (!q.has('url') && !q.has('text') && !q.has('title')) return;
  const url = extractUrl(q.get('url')) || extractUrl(q.get('text')) || extractUrl(q.get('title'));
  history.replaceState(null, '', location.pathname + '#/recepten');
  render();
  if (url) setTimeout(() => linkSheet(url), 300);
  else if (q.get('text')) setTimeout(() => textSheet(), 300);
}

async function start() {
  document.body.insertAdjacentHTML('afterbegin', ICONS);
  if (firebaseConfig || self.__BOODSCHAPPEN_TEST__) {
    try {
      await startCloud(firebaseConfig);
    } catch (e) {
      console.error(e);
      document.getElementById('app').innerHTML = `<main class="gate"><div class="gate-card"><div class="gate-logo">B</div>
        <h1>Even geen verbinding</h1><p class="lede">De app kon de online gegevens niet laden. Controleer je internet en probeer het opnieuw.</p>
        <button class="btn wide" onclick="location.reload()">Opnieuw proberen</button></div></main>`;
      return;
    }
  } else {
    await store.init();
    if (!store.state.meta.seeded) await seed(store);
  }
  shell();
  bind();
  render();
  refreshInfo(render);
  handleShare();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

start();

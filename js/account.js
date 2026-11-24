// Inloggen, huishouden kiezen en de "Samen"-kaart op het Voorraad-scherm.
import { store, LocalAdapter } from './store.js';
import { esc, icon, toast, openSheet, closeSheet, confirmSheet } from './ui.js';
import { seed } from './seed.js';

let C = null; // cloud.js
export const cloud = { on: false, user: null, hid: null, info: null };

const HID_KEY = (uid) => `boodschappen:hid:${uid}`;
const MERGED_KEY = (hid) => `boodschappen:merged:${hid}`;
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* */ } },
};

// Code uit een uitnodigingslink (?code=...) bewaren tot na het inloggen.
(() => {
  const q = new URLSearchParams(location.search);
  if (q.get('code')) {
    try { sessionStorage.setItem('boodschappen:code', q.get('code')); } catch { /* */ }
    q.delete('code');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  }
})();

function gate(html) {
  const app = document.getElementById('app');
  app.innerHTML = `<main class="gate"><div class="gate-card">
    <div class="gate-logo">B</div>${html}</div></main>`;
  return app.querySelector('.gate-card');
}
const busy = (form, on) => form.querySelectorAll('button, input').forEach((b) => { b.disabled = on; });

// ---------- Opstarten ----------
export async function startCloud(config) {
  C = await import('./cloud.js');
  await C.initCloud(config);
  cloud.on = true;
  let user = await new Promise((res) => { const off = C.onUser((u) => { off(); res(u); }); });
  if (!user) user = await loginScreen();
  cloud.user = user;

  let hid = ls.get(HID_KEY(user.uid));
  if (!hid) hid = await C.myHouseholdId(user).catch(() => null);
  let created = false;
  if (!hid) ({ hid, created } = await householdScreen(user));
  ls.set(HID_KEY(user.uid), hid);
  cloud.hid = hid;

  const local = new LocalAdapter();
  const localData = await local.load();
  const adapter = new C.CloudAdapter(hid, local);
  adapter.onError = (e) => {
    console.warn(e);
    if (e?.code === 'permission-denied') toast('Geen toegang meer tot dit huishouden. Log opnieuw in.');
  };
  try {
    await store.init(adapter);
  } catch (e) {
    if (e?.code === 'permission-denied') { // geen lid (meer): opnieuw kiezen
      ls.set(HID_KEY(user.uid), null);
      await C.leaveHousehold(user).catch(() => {});
      location.reload();
      return new Promise(() => {});
    }
    throw e;
  }

  if (created) {
    await moveLocalData(localData);
    ls.set(MERGED_KEY(hid), '1');
  } else if (!ls.get(MERGED_KEY(hid))) {
    setTimeout(() => offerMerge(localData, hid), 600);
  }
  C.householdInfo(hid).then((i) => { cloud.info = i; }).catch(() => {});
  C.onUser((u) => { if (!u) location.reload(); });
  if (created) setTimeout(inviteSheet, 500);
}

async function moveLocalData(d) {
  if (d.recipes && Object.keys(d.recipes).length) {
    await store.update('recipes', () => d.recipes);
    if (d.menu) await store.update('menu', () => d.menu);
    if (d.list) await store.update('list', (l) => ({ ...l, ...d.list }));
    if (d.pantry) await store.update('pantry', () => d.pantry);
  } else {
    await seed(store);
  }
}

async function offerMerge(d, hid) {
  const have = new Set(Object.values(store.state.recipes).map((r) => r.title.trim().toLowerCase()));
  const extra = Object.values(d.recipes || {}).filter((r) => r.title && !have.has(r.title.trim().toLowerCase()));
  const pHave = new Set(store.state.pantry.map((p) => p.name));
  const pExtra = (d.pantry || []).filter((p) => !pHave.has(p.name));
  ls.set(MERGED_KEY(hid), '1');
  if (!extra.length) {
    if (pExtra.length) store.update('pantry', (p) => [...p, ...pExtra]);
    return;
  }
  const n = extra.length;
  const ok = await confirmSheet(
    `${n} ${n === 1 ? 'recept' : 'recepten'} van dit toestel toevoegen?`,
    `Op dit toestel ${n === 1 ? 'staat een recept' : `staan ${n} recepten`} die nog niet in jullie gedeelde verzameling ${n === 1 ? 'zit' : 'zitten'}, zoals "${extra[0].title}".`,
    'Toevoegen',
  );
  if (!ok) return;
  await store.update('recipes', (rs) => { for (const r of extra) rs[r.id] = r; });
  if (pExtra.length) await store.update('pantry', (p) => [...p, ...pExtra]);
  toast(`${n} ${n === 1 ? 'recept' : 'recepten'} toegevoegd`);
}

// ---------- Inlogscherm ----------
function loginScreen() {
  return new Promise((resolve) => {
    const card = gate(`
      <h1>Samen boodschappen doen</h1>
      <p class="lede">Log in, dan zien jullie allebei hetzelfde weekmenu, dezelfde recepten en dezelfde lijst. Live, op elk toestel.</p>
      <form class="gate-form" novalidate>
        <label class="fld"><span>E-mailadres</span><input id="g-email" type="email" autocomplete="username" inputmode="email" required></label>
        <label class="fld"><span>Wachtwoord <small>(minstens 6 tekens)</small></span><input id="g-pw" type="password" autocomplete="current-password" required minlength="6"></label>
        <p class="gate-err" role="alert" hidden></p>
        <button class="btn wide" type="submit" data-mode="in">Inloggen</button>
        <button class="btn ghost wide" type="submit" data-mode="up">Account maken</button>
        <button class="linkbtn" type="button" data-forgot>Wachtwoord vergeten?</button>
      </form>`);
    const form = card.querySelector('form');
    const err = card.querySelector('.gate-err');
    const say = (m, good) => { err.hidden = !m; err.textContent = m || ''; err.classList.toggle('good', !!good); };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = e.submitter?.dataset.mode || 'in';
      const email = form.querySelector('#g-email').value;
      const pw = form.querySelector('#g-pw').value;
      say('');
      busy(form, true);
      try {
        const cred = mode === 'up' ? await C.signUp(email, pw) : await C.signIn(email, pw);
        resolve(cred.user);
      } catch (x) { say(C.authError(x)); busy(form, false); }
    });
    card.querySelector('[data-forgot]').onclick = async () => {
      const email = form.querySelector('#g-email').value;
      if (!email) { say('Vul eerst je e-mailadres in, dan sturen we je een link.'); return; }
      try { await C.resetPassword(email); say('Gelukt. Kijk in je mail (ook bij spam) voor een link om een nieuw wachtwoord te kiezen.', true); } catch (x) { say(C.authError(x)); }
    };
    form.querySelector('#g-email').focus();
  });
}

// ---------- Huishouden kiezen ----------
function householdScreen(user) {
  let code = '';
  try { code = sessionStorage.getItem('boodschappen:code') || ''; } catch { /* */ }
  return new Promise((resolve) => {
    const card = gate(`
      <div class="eb">Ingelogd als ${esc(user.email)}</div>
      <h1>Nog één stap</h1>
      <p class="lede">Jullie delen alles via één huishouden. De een begint het, de ander doet mee met de code.</p>
      <form class="gate-form" data-f="join">
        <h2>${icon('users', 'sm')} Ik heb een code</h2>
        <input id="g-code" class="code-in" placeholder="XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(code)}">
        <p class="gate-err" role="alert" hidden></p>
        <button class="btn wide" type="submit">Meedoen</button>
      </form>
      <div class="gate-or"><span>of</span></div>
      <form class="gate-form" data-f="new">
        <h2>${icon('plus', 'sm')} Nieuw huishouden beginnen</h2>
        <p class="muted">Je recepten, weekmenu en voorraadkast van dit toestel gaan mee. Daarna krijg je een code voor je huisgenoot.</p>
        <button class="btn ${code ? 'ghost' : ''} wide" type="submit">Begin een huishouden</button>
      </form>
      <button class="linkbtn" type="button" data-out>Uitloggen</button>`);
    const err = card.querySelector('.gate-err');
    card.querySelector('[data-f="join"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      err.hidden = true;
      busy(f, true);
      try {
        const hid = await C.joinHousehold(user, f.querySelector('#g-code').value);
        try { sessionStorage.removeItem('boodschappen:code'); } catch { /* */ }
        resolve({ hid, created: false });
      } catch (x) {
        err.textContent = (x?.code === 'permission-denied' || x?.code === 'not-found') ? 'Deze code klopt niet. Kijk hem nog eens na.' : C.authError(x);
        err.hidden = false; busy(f, false);
      }
    });
    card.querySelector('[data-f="new"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      busy(f, true);
      try { resolve({ hid: await C.createHousehold(user), created: true }); } catch (x) {
        err.textContent = C.authError(x); err.hidden = false; busy(f, false);
      }
    });
    card.querySelector('[data-out]').onclick = () => C.signOut();
  });
}

// ---------- Uitnodigen ----------
function inviteText() {
  const code = C.fmtCode(cloud.hid);
  const url = `${location.origin}${location.pathname}?code=${code}`;
  return { code, url, text: `Doe je mee met onze boodschappen-app? Open ${url} , maak een account en vul deze code in: ${code}` };
}

export function inviteSheet() {
  const { code } = inviteText();
  const s = openSheet(`
    <div class="eb">Samen</div>
    <h3 class="sheet-title">Nodig je huisgenoot uit</h3>
    <p class="muted">Stuur deze code door. Je huisgenoot opent de app, maakt een account en vult de code in. Daarna zien jullie allebei alles live.</p>
    <div class="code-big" aria-label="Code">${esc(code)}</div>
    <div class="row-btns"><button class="btn ghost" data-close>Later</button><button class="btn" data-share>${icon('ext', 'sm')}Code delen</button></div>`);
  s.querySelector('[data-share]').onclick = () => shareInvite();
}

async function shareInvite() {
  const { text } = inviteText();
  if (navigator.share) { try { await navigator.share({ title: 'Boodschappen', text }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('Uitnodiging gekopieerd. Plak hem in WhatsApp.'); } catch { toast('Kopiëren lukte niet. Neem de code over.'); }
}

// ---------- Kaart op het Voorraad-scherm ----------
export function cloudCard() {
  if (!cloud.on) return '';
  const others = Object.entries(cloud.info?.emails || {}).filter(([u]) => u !== cloud.user.uid).map(([, e]) => e).filter(Boolean);
  const who = others.length ? `Je deelt alles met ${others.map(esc).join(', ')}.` : 'Er doet nog niemand anders mee. Nodig je huisgenoot uit met de code.';
  return `
  <section class="card settings">
    <h2>Samen</h2>
    <p class="muted">Ingelogd als <b>${esc(cloud.user.email)}</b>. ${who}</p>
    <div class="code-row"><span class="muted">Code</span><b class="code-small">${esc(C.fmtCode(cloud.hid))}</b></div>
    <div class="row-btns left wrap">
      <button class="btn small" data-action="invite">${icon('users', 'sm')}Uitnodigen</button>
      <button class="btn ghost small" data-action="logout">Uitloggen</button>
    </div>
  </section>`;
}

export const cloudActions = {
  invite: () => inviteSheet(),
  logout: async () => {
    if (!(await confirmSheet('Uitloggen?', 'Je gegevens blijven bewaard. Log opnieuw in om ze weer te zien.', 'Uitloggen'))) return;
    closeSheet();
    ls.set(HID_KEY(cloud.user.uid), null);
    await C.signOut();
  },
};

export function refreshInfo(cb) {
  if (!cloud.on || !C) return;
  C.householdInfo(cloud.hid).then((i) => { const before = JSON.stringify(cloud.info); cloud.info = i; if (JSON.stringify(i) !== before) cb?.(); }).catch(() => {});
}

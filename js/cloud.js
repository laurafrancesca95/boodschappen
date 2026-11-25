// Online opslag met Firebase: inloggen + live gedeelde gegevens per huishouden.
//
// Opbouw in Firestore:
//   users/{uid}                     { householdId, email }
//   households/{code}               { members: [uid], emails: {uid: e-mail}, createdAt }
//   households/{code}/recipes/{id}  één recept per document
//   households/{code}/state/menu    { [yyyy-mm-dd]: [...] }
//   households/{code}/state/list    { weekStart, checked, pantry, manual: {id: {..., o}} }
//   households/{code}/state/pantry  { [id]: naam }
//   households/{code}/state/tags    { list: [naam] }   eigen receptfilters
//
// Bij opslaan stuurt de app alleen wat er veranderd is (per veld). Vinkt de een "melk" af en de
// ander tegelijk "brood", dan blijven allebei de vinkjes staan.

const V = '13.2.0';
const SDK = `https://www.gstatic.com/firebasejs/${V}`;

let fb = null; // { app, auth, db, A: auth-functies, F: firestore-functies }

export async function initCloud(config) {
  if (fb) return fb;
  const test = self.__BOODSCHAPPEN_TEST__ || null; // alleen voor automatische tests
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(test?.config || config);
  const auth = A.getAuth(app);
  auth.languageCode = 'nl';
  let db;
  try {
    db = F.initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
  } catch {
    db = F.initializeFirestore(app, { ignoreUndefinedProperties: true });
  }
  if (test?.emulator) {
    A.connectAuthEmulator(auth, `http://${test.emulator.auth}`, { disableWarnings: true });
    const [host, port] = test.emulator.firestore.split(':');
    F.connectFirestoreEmulator(db, host, +port);
  }
  fb = { app, auth, db, A, F };
  return fb;
}

// ---------- Inloggen ----------
export function onUser(cb) { return fb.A.onAuthStateChanged(fb.auth, cb); }
export const signIn = (email, pw) => fb.A.signInWithEmailAndPassword(fb.auth, email.trim(), pw);
export const signUp = (email, pw) => fb.A.createUserWithEmailAndPassword(fb.auth, email.trim(), pw);
export const resetPassword = (email) => fb.A.sendPasswordResetEmail(fb.auth, email.trim());
export const signOut = () => fb.A.signOut(fb.auth);

export function authError(e) {
  const c = e?.code || '';
  const m = {
    'auth/invalid-email': 'Dat e-mailadres klopt niet helemaal.',
    'auth/missing-email': 'Vul je e-mailadres in.',
    'auth/missing-password': 'Vul je wachtwoord in.',
    'auth/invalid-credential': 'E-mailadres of wachtwoord klopt niet.',
    'auth/wrong-password': 'E-mailadres of wachtwoord klopt niet.',
    'auth/user-not-found': 'Er is nog geen account met dit e-mailadres. Kies "Account maken".',
    'auth/email-already-in-use': 'Er is al een account met dit e-mailadres. Kies "Inloggen".',
    'auth/weak-password': 'Kies een wachtwoord van minstens 6 tekens.',
    'auth/too-many-requests': 'Te vaak geprobeerd. Wacht even en probeer het dan opnieuw.',
    'auth/network-request-failed': 'Geen internet. Probeer het opnieuw als je verbinding hebt.',
    'auth/operation-not-allowed': 'Inloggen met e-mail staat nog uit in Firebase (zie de handleiding, stap 2).',
    'permission-denied': 'Geen toegang. Klopt de code?',
    'not-found': 'Deze code bestaat niet. Kijk hem nog eens na.',
    unavailable: 'Geen verbinding met de server. Probeer het zo opnieuw.',
  };
  return m[c] || m[c.replace(/^firestore\//, '')] || 'Er ging iets mis. Probeer het opnieuw.';
}

// ---------- Huishouden ----------
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // zonder 0/O en 1/I
function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, (x) => ALPHA[x % 32]).join('');
}
export const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const fmtCode = (c) => c.replace(/(.{4})(?=.)/g, '$1-');

export async function myHouseholdId(user) {
  const { F, db } = fb;
  const snap = await F.getDoc(F.doc(db, 'users', user.uid));
  return snap.exists() ? snap.data().householdId || null : null;
}

export async function createHousehold(user) {
  const { F, db } = fb;
  const id = newCode();
  await F.setDoc(F.doc(db, 'households', id), { members: [user.uid], emails: { [user.uid]: user.email || '' }, createdAt: F.serverTimestamp() });
  const b = F.writeBatch(db);
  for (const s of ['menu', 'list', 'pantry']) b.set(F.doc(db, 'households', id, 'state', s), s === 'list' ? { weekStart: null, checked: {}, pantry: {}, manual: {} } : {});
  b.set(F.doc(db, 'users', user.uid), { householdId: id, email: user.email || '' });
  await b.commit();
  return id;
}

export async function joinHousehold(user, code) {
  const { F, db } = fb;
  const id = normCode(code);
  if (id.length !== 12) { const e = new Error('code'); e.code = 'not-found'; throw e; }
  await F.updateDoc(F.doc(db, 'households', id), 'members', F.arrayUnion(user.uid), new F.FieldPath('emails', user.uid), user.email || '');
  await F.setDoc(F.doc(db, 'users', user.uid), { householdId: id, email: user.email || '' });
  return id;
}

export async function householdInfo(id) {
  const { F, db } = fb;
  const snap = await F.getDoc(F.doc(db, 'households', id));
  return snap.exists() ? snap.data() : null;
}

export async function leaveHousehold(user) {
  const { F, db } = fb;
  await F.setDoc(F.doc(db, 'users', user.uid), { householdId: null, email: user.email || '' });
}

// ---------- Omzetten tussen app-vorm en opslag-vorm ----------
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function toRemote(c, data, prevRemote) {
  if (c === 'pantry') return Object.fromEntries((data || []).map((p) => [p.id, p.name]));
  if (c === 'tags') return Array.isArray(data) ? { list: data } : {};
  if (c === 'list') {
    const prev = prevRemote?.manual || {};
    let max = Math.max(-1, ...Object.values(prev).map((m) => m.o ?? -1));
    const manual = {};
    for (const m of data.manual || []) manual[m.id] = { ...m, o: prev[m.id]?.o ?? ++max };
    return { weekStart: data.weekStart ?? null, checked: data.checked || {}, pantry: data.pantry || {}, manual };
  }
  return data || {};
}

function fromRemote(c, r) {
  r = r || {};
  if (c === 'pantry') return Object.entries(r).map(([id, name]) => ({ id, name }));
  if (c === 'tags') return Array.isArray(r.list) ? r.list : null;
  if (c === 'list') {
    const manual = Object.values(r.manual || {}).sort((a, b) => (a.o - b.o) || String(a.id).localeCompare(b.id)).map(({ o, ...m }) => m);
    return { weekStart: r.weekStart ?? null, checked: r.checked || {}, pantry: r.pantry || {}, manual };
  }
  return r;
}

/** Lijst met [pad, waarde] van alles wat anders is; waarde DEL = weghalen. */
const DEL = Symbol('del');
function diff(prev, next, path = [], out = []) {
  for (const k of Object.keys(next)) {
    if (k === '') continue;
    const a = prev?.[k], b = next[k];
    if (isObj(a) && isObj(b) && Object.keys(b).length) diff(a, b, [...path, k], out);
    else if (!same(a, b)) out.push([[...path, k], b]);
  }
  for (const k of Object.keys(prev || {})) if (k !== '' && !(k in next)) out.push([[...path, k], DEL]);
  return out;
}

const STATE_DOCS = ['menu', 'list', 'pantry', 'tags'];

export class CloudAdapter {
  constructor(householdId, local) {
    this.hid = householdId;
    this.local = local; // voor 'meta' (alleen dit toestel)
    this.remote = {}; // laatst bekende opslag-vorm per state-document
    this.recipes = {}; // id -> JSON-tekst
    this.onRemote = null;
    this.unsubs = [];
    this.onError = null;
  }
  ref(...p) { return fb.F.doc(fb.db, 'households', this.hid, ...p); }

  load() {
    const { F, db } = fb;
    return new Promise((resolve, reject) => {
      let pending = STATE_DOCS.length + 1;
      const ready = () => { if (--pending === 0) resolve(this.snapshot()); };
      const fail = (e) => { if (pending > 0) { pending = -1; reject(e); } else this.onError?.(e); };
      for (const s of STATE_DOCS) {
        let first = true;
        this.unsubs.push(F.onSnapshot(this.ref('state', s), (snap) => {
          const data = snap.data() || {};
          const changed = !same(data, this.remote[s]);
          this.remote[s] = data;
          if (first) { first = false; ready(); } else if (changed) this.onRemote?.(s, fromRemote(s, data));
        }, fail));
      }
      let first = true;
      this.unsubs.push(F.onSnapshot(F.collection(db, 'households', this.hid, 'recipes'), (snap) => {
        let changed = false;
        for (const ch of snap.docChanges()) {
          const id = ch.doc.id;
          if (ch.type === 'removed') { if (id in this.recipes) { delete this.recipes[id]; changed = true; } } else {
            const j = JSON.stringify({ ...ch.doc.data(), id });
            if (this.recipes[id] !== j) { this.recipes[id] = j; changed = true; }
          }
        }
        if (first) { first = false; ready(); } else if (changed) this.onRemote?.('recipes', this.recipesObj());
      }, fail));
    }).then(async (s) => ({ ...s, ...(await this.local.load().then((l) => (l.meta ? { meta: l.meta } : {}))) }));
  }
  recipesObj() { return Object.fromEntries(Object.entries(this.recipes).map(([id, j]) => [id, JSON.parse(j)])); }
  snapshot() {
    const out = { recipes: this.recipesObj() };
    for (const s of STATE_DOCS) out[s] = fromRemote(s, this.remote[s]);
    return out;
  }
  subscribe(fn) { this.onRemote = fn; }
  stop() { this.unsubs.forEach((u) => u()); this.unsubs = []; }

  async save(c, data) {
    const { F, db } = fb;
    if (c === 'meta') return this.local.save(c, data);
    if (c === 'recipes') {
      const jobs = [];
      for (const [id, r] of Object.entries(data || {})) {
        const j = JSON.stringify({ ...r, id });
        if (this.recipes[id] !== j) { this.recipes[id] = j; jobs.push(F.setDoc(F.doc(db, 'households', this.hid, 'recipes', id), { ...r, id })); }
      }
      for (const id of Object.keys(this.recipes)) {
        if (!(id in (data || {}))) { delete this.recipes[id]; jobs.push(F.deleteDoc(F.doc(db, 'households', this.hid, 'recipes', id))); }
      }
      return this.track(Promise.all(jobs));
    }
    if (!STATE_DOCS.includes(c)) return;
    const prev = this.remote[c] || {};
    const next = toRemote(c, data, prev);
    const changes = diff(prev, next);
    this.remote[c] = structuredClone(next);
    if (!changes.length) return;
    const args = changes.flatMap(([p, v]) => [new F.FieldPath(...p), v === DEL ? F.deleteField() : v]);
    return this.track(F.updateDoc(this.ref('state', c), ...args).catch((e) => {
      if (e?.code === 'not-found') return F.setDoc(this.ref('state', c), next);
      throw e;
    }));
  }
  // Schrijven gaat ook zonder internet (wordt later verstuurd); we wachten er dus niet op.
  track(p) { p.catch((e) => this.onError?.(e)); return Promise.resolve(); }
}

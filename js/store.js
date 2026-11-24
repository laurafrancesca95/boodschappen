// Gegevenslaag.
//
// De app praat alleen met `store`. Waar de gegevens echt staan, regelt een "adapter".
// LocalAdapter: IndexedDB op dit toestel (zonder account).
// CloudAdapter (js/cloud.js): Firebase, zodat jullie live samen in hetzelfde huishouden werken.
//
// Adapter-interface:
//   load()                 -> Promise<{ [collection]: data }>
//   save(collection, data) -> Promise<void>
//   subscribe(onRemote)    -> optioneel: roep onRemote(collection, data) aan bij wijzigingen van de ander
//
// Collecties:
//   recipes : { [id]: Recipe }
//   menu    : { [yyyy-mm-dd]: [{ id, recipeId?, note?, servings? }] }
//   list    : { weekStart, checked: {key:true}, pantry: {key:'have'|'need'}, manual: [{id,name,qty,cat,checked}] }
//   pantry  : [{ id, name }]
//   meta    : { seeded, version }

const DB_NAME = 'boodschappen';
const COLLECTIONS = ['recipes', 'menu', 'list', 'pantry', 'meta'];

export const DEFAULTS = () => ({
  recipes: {},
  menu: {},
  list: { weekStart: null, checked: {}, pantry: {}, manual: [] },
  pantry: [],
  meta: { seeded: false, version: 1 },
});

export class LocalAdapter {
  constructor() { this.dbp = null; }
  open() {
    if (this.dbp) return this.dbp;
    this.dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in self)) return reject(new Error('geen IndexedDB'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbp;
  }
  async load() {
    try {
      const db = await this.open();
      const out = {};
      await Promise.all(COLLECTIONS.map((c) => new Promise((res) => {
        const r = db.transaction('kv').objectStore('kv').get(c);
        r.onsuccess = () => { if (r.result !== undefined) out[c] = r.result; res(); };
        r.onerror = () => res();
      })));
      return out;
    } catch {
      // terugval: localStorage
      const out = {};
      for (const c of COLLECTIONS) {
        try { const v = localStorage.getItem(`${DB_NAME}:${c}`); if (v) out[c] = JSON.parse(v); } catch { /* leeg */ }
      }
      return out;
    }
  }
  async save(collection, data) {
    try {
      const db = await this.open();
      await new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(data, collection);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    } catch {
      try { localStorage.setItem(`${DB_NAME}:${collection}`, JSON.stringify(data)); } catch { /* vol of geblokkeerd */ }
    }
  }
  subscribe() { /* lokaal: niets te doen */ }
}

function createStore() {
  let adapter = null;
  let state = DEFAULTS();
  const listeners = new Set();
  const notify = (c) => listeners.forEach((fn) => fn(c));

  return {
    get state() { return state; },
    get adapter() { return adapter; },
    async init(a = new LocalAdapter()) {
      adapter = a;
      const loaded = await adapter.load();
      state = { ...DEFAULTS(), ...loaded };
      state.list = { ...DEFAULTS().list, ...state.list };
      adapter.subscribe?.((c, data) => { state[c] = data; notify(c); });
      if ('storage' in navigator && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    },
    /** Wijzig een collectie: fn krijgt een kopie en geeft de nieuwe waarde terug (of past aan). */
    update(collection, fn) {
      const draft = structuredClone(state[collection]);
      const result = fn(draft);
      state[collection] = result === undefined ? draft : result;
      notify(collection);
      return adapter.save(collection, state[collection]);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    exportAll() { return JSON.stringify({ app: 'boodschappen', exported: new Date().toISOString(), data: state }, null, 1); },
    async importAll(json) {
      const parsed = JSON.parse(json);
      const data = parsed.data || parsed;
      if (!data.recipes) throw new Error('Dit is geen back-up van deze app.');
      for (const c of COLLECTIONS) {
        if (data[c] !== undefined) { state[c] = data[c]; await adapter.save(c, data[c]); }
      }
      notify('*');
    },
  };
}

export const store = createStore();

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

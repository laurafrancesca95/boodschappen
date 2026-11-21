// Ingrediënten: regels ontleden, namen gelijk trekken, categoriseren en optellen.

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

// Eenheden: alias -> [code, familie, factor naar basis]
const UNIT_DEFS = [
  ['g', 'mass', 1, ['g', 'gr', 'gram', 'grammen', 'grams']],
  ['kg', 'mass', 1000, ['kg', 'kilo', 'kilogram', 'kilo\'s']],
  ['ml', 'vol', 1, ['ml', 'milliliter', 'milliliters']],
  ['cl', 'vol', 10, ['cl', 'centiliter']],
  ['dl', 'vol', 100, ['dl', 'deciliter']],
  ['l', 'vol', 1000, ['l', 'liter', 'liters', 'ltr']],
  ['el', 'el', 1, ['el', 'eetlepel', 'eetlepels', 'eetl', 'tbsp', 'tablespoon', 'tablespoons', 'tbs']],
  ['tl', 'tl', 1, ['tl', 'theelepel', 'theelepels', 'theel', 'tsp', 'teaspoon', 'teaspoons']],
  ['st', 'st', 1, ['st', 'stuk', 'stuks', 'stk']],
  ['teen', 'teen', 1, ['teen', 'teentje', 'teentjes', 'tenen']],
  ['blik', 'blik', 1, ['blik', 'blikje', 'blikjes', 'blikken']],
  ['pak', 'pak', 1, ['pak', 'pakje', 'pakjes', 'pakken']],
  ['zak', 'zak', 1, ['zak', 'zakje', 'zakjes', 'zakken']],
  ['bos', 'bos', 1, ['bos', 'bosje', 'bosjes']],
  ['takje', 'takje', 1, ['takje', 'takjes']],
  ['plak', 'plak', 1, ['plak', 'plakje', 'plakjes', 'plakken']],
  ['snufje', 'snufje', 1, ['snuf', 'snufje', 'snufjes', 'mespunt', 'mespuntje', 'snee']],
  ['handje', 'handje', 1, ['handje', 'handjes', 'handvol']],
  ['kopje', 'kopje', 1, ['kop', 'kopje', 'kopjes', 'cup', 'cups']],
  ['pot', 'pot', 1, ['pot', 'potje', 'potjes', 'potten']],
  ['fles', 'fles', 1, ['fles', 'flesje', 'flessen']],
  ['beker', 'beker', 1, ['beker', 'bekertje', 'bekers']],
  ['scheut', 'scheut', 1, ['scheut', 'scheutje', 'scheutjes']],
  ['stengel', 'stengel', 1, ['stengel', 'stengels', 'steel', 'stelen']],
  ['krop', 'krop', 1, ['krop', 'kropje', 'kroppen']],
  ['bol', 'bol', 1, ['bol', 'bolletje', 'bollen']],
  ['blad', 'blad', 1, ['blaadje', 'blaadjes', 'vel', 'vellen']],
  ['oz', 'mass', 28.35, ['oz', 'ounce', 'ounces']],
  ['lb', 'mass', 453.6, ['lb', 'lbs', 'pound', 'pounds']],
];
const UNIT_ALIAS = new Map();
for (const [code, fam, factor, aliases] of UNIT_DEFS) {
  for (const a of aliases) UNIT_ALIAS.set(a, { code, fam, factor });
}

const NUM = '(?:\\d+[.,]\\d+|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\s*[½¼¾⅓⅔⅛]|\\d+|[½¼¾⅓⅔⅛])';
const QTY_RE = new RegExp(`^(?:ca\\.?\\s*|ongeveer\\s+|circa\\s+)?(${NUM})(?:\\s*(?:-|–|à|a|tot)\\s*(${NUM}))?\\s*`, 'i');

export function parseNumber(s) {
  if (!s) return null;
  s = s.trim();
  let m;
  if ((m = s.match(/^(\d+)\s*([½¼¾⅓⅔⅛])$/))) return +m[1] + FRACTIONS[m[2]];
  if (FRACTIONS[s] != null) return FRACTIONS[s];
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Ontleed "200 g feta, verkruimeld" naar { qty, unit, name, note, raw } */
export function parseLine(raw) {
  let line = String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/^[•·▢□☐\-–*]+\s*/, '')
    .trim();
  if (!line) return null;
  let qty = null, unit = null;
  const m = line.match(QTY_RE);
  if (m) {
    const a = parseNumber(m[1]);
    const b = m[2] ? parseNumber(m[2]) : null;
    qty = b != null ? b : a; // bij "2-3" de bovenkant nemen, dan kom je niet tekort
    line = line.slice(m[0].length);
  }
  // eenheid (ook als die vast aan het getal zat: "200g")
  const um = line.match(/^([a-zA-Zé']+)\.?(\s+|$)/);
  if (um) {
    const u = UNIT_ALIAS.get(um[1].toLowerCase());
    if (u && (qty != null || ['snufje', 'handje', 'scheut', 'bos'].includes(u.code))) {
      unit = u.code;
      line = line.slice(um[0].length);
    }
  }
  line = line.replace(/^(van\s+|of\s+)/i, '').trim();
  let name = line, note = '';
  const paren = name.match(/\(([^)]*)\)/);
  if (paren) { note = paren[1]; name = name.replace(paren[0], ' ').trim(); }
  const comma = name.indexOf(',');
  if (comma > 0) { note = [note, name.slice(comma + 1).trim()].filter(Boolean).join(', '); name = name.slice(0, comma).trim(); }
  name = name.replace(/\s+/g, ' ').replace(/[.;:]+$/, '').trim();
  if (!name) return null;
  return { qty, unit, name, note, raw: String(raw).trim() };
}

const PLURALS = {
  uien: 'ui', tomaten: 'tomaat', eieren: 'ei', aardappelen: 'aardappel', aardappels: 'aardappel',
  wortelen: 'wortel', citroenen: 'citroen', limoenen: 'limoen', sjalotten: 'sjalot', appels: 'appel',
  appelen: 'appel', peren: 'peer', bananen: 'banaan', "paprika's": 'paprika',
  "avocado's": 'avocado', "mango's": 'mango',
  courgettes: 'courgette', aubergines: 'aubergine', knoflookteentjes: 'knoflook', teentjes: 'knoflook',
  'tenen knoflook': 'knoflook', 'teentjes knoflook': 'knoflook', 'teen knoflook': 'knoflook',
  kipfilets: 'kipfilet', kippendijen: 'kippendij', kippendijtjes: 'kippendij',
  "tortilla's": 'tortilla', wraps: 'wrap', broodjes: 'broodje', pepers: 'peper', bieten: 'biet',
  prei: 'prei', preien: 'prei', komkommers: 'komkommer', radijsjes: 'radijs', champignons: 'champignon',
  sperziebonen: 'sperziebonen', bonen: 'bonen', kikkererwten: 'kikkererwten', linzen: 'linzen',
};

const PANTRY_IGNORE_PREFIX = /^(verse|vers|gedroogde|gedroogd|gemalen|grof|fijne|fijn|biologische|bio|half|halve|grote|groot|kleine|klein|middelgrote|flinke|rijpe|zachte|koude|warme|extra|vierge|gesneden|gehakte|geraspte|geraspt|versgemalen|zwarte|witte)\s+/;

/** Sleutel om dezelfde ingrediënten samen te voegen */
export function normalizeName(name) {
  let n = String(name || '').toLowerCase().normalize('NFC')
    .replace(/[’`]/g, "'")
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (PLURALS[n]) return PLURALS[n];
  const words = n.split(' ');
  const last = words[words.length - 1];
  let sing = PLURALS[last];
  if (!sing && last.length > 5 && /[elnr]s$/.test(last) && !/ss$/.test(last)) sing = last.slice(0, -1);
  if (!sing && /'s$/.test(last)) sing = last.slice(0, -2);
  if (sing) words[words.length - 1] = sing;
  return words.join(' ');
}

/** Kernwoord om met de voorraadkast te vergelijken ("versgemalen zwarte peper" -> "peper") */
export function coreName(name) {
  let n = normalizeName(name);
  let prev;
  do { prev = n; n = n.replace(PANTRY_IGNORE_PREFIX, ''); } while (n !== prev);
  return n;
}

export function matchesPantry(name, pantryList) {
  const n = coreName(name);
  const full = normalizeName(name);
  for (const p of pantryList) {
    const t = normalizeName(p.name);
    if (!t) continue;
    if (n === t || full === t) return p;
    // hele woorden: "peper" past bij "zwarte peper", niet bij "paprika"
    const re = new RegExp(`(^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`);
    if (re.test(full)) return p;
  }
  return null;
}

// ---------- Categorieën (volgorde = looproute in de winkel) ----------
export const CATEGORIES = [
  { id: 'groente', label: 'Groente & fruit' },
  { id: 'brood', label: 'Brood & bakkerij' },
  { id: 'vlees', label: 'Vlees, vis & vega' },
  { id: 'zuivel', label: 'Zuivel, kaas & eieren' },
  { id: 'houdbaar', label: 'Pasta, rijst & houdbaar' },
  { id: 'kruiden', label: 'Kruiden, sauzen & olie' },
  { id: 'diepvries', label: 'Diepvries' },
  { id: 'drinken', label: 'Drinken' },
  { id: 'huishouden', label: 'Huishouden & verzorging' },
  { id: 'overig', label: 'Overig' },
];

const CAT_WORDS = [
  ['diepvries', ['diepvries', 'bevroren', 'ijs ', 'ijsjes', 'doperwten diepvries', 'spinazie diepvries']],
  ['kruiden', ['poeder', 'gedroogde', 'komijn', 'kaneel', 'kurkuma', 'paprikapoeder', 'kerrie', 'oregano', 'tijm', 'rozemarijn gedroogd', 'laurier', 'nootmuskaat', 'kruidnagel', 'zout', 'peper', 'olie', 'azijn', 'sojasaus', 'ketjap', 'sambal', 'mosterd', 'mayonaise', 'ketchup', 'pesto', 'bouillon', 'currypasta', 'curry pasta', 'vissaus', 'sriracha', 'tabasco', 'honing', 'siroop', 'specerij', 'kruidenmix', 'garam masala', 'za\'atar', 'chilivlokken', 'kerriepoeder', 'jus', 'worcester', 'tahin', 'dressing', 'suiker', 'vanille', 'bakpoeder', 'gist', 'maizena', 'bloem', 'paneermeel']],
  ['houdbaar', ['pasta', 'spaghetti', 'penne', 'fusilli', 'macaroni', 'tagliatelle', 'lasagne', 'noedels', 'mie', 'rijst', 'couscous', 'bulgur', 'quinoa', 'linzen', 'kikkererwten', 'bonen in', 'kidneybonen', 'zwarte bonen', 'witte bonen', 'tomatenblokjes', 'tomatenpuree', 'passata', 'gepelde tomaten', 'kokosmelk', 'blik', 'tonijn', 'mais', 'olijven', 'kappertjes', 'noten', 'pijnboompitten', 'amandel', 'walnoot', 'cashew', 'pinda', 'zaden', 'rozijnen', 'havermout', 'muesli', 'cracker', 'tortilla', 'wrap', 'taco', 'chips', 'chocolade', 'koekjes', 'pindakaas', 'jam', 'hagelslag', 'zongedroogde', 'bouillonblok']],
  ['zuivel', ['melk', 'room', 'yoghurt', 'kwark', 'boter', 'kaas', 'feta', 'mozzarella', 'parmezaan', 'parmigiano', 'ricotta', 'mascarpone', 'burrata', 'halloumi', 'geitenkaas', 'crème fraîche', 'creme fraiche', 'zure room', 'ei', 'eieren', 'vla', 'skyr', 'roomkaas', 'philadelphia', 'gorgonzola', 'cheddar', 'gruyère', 'pecorino', 'margarine', 'kokosyoghurt', 'havermelk', 'sojamelk']],
  ['vlees', ['kip', 'gehakt', 'rund', 'varken', 'spek', 'ham', 'worst', 'chorizo', 'bacon', 'lam', 'biefstuk', 'shoarma', 'vis', 'zalm', 'kabeljauw', 'garnalen', 'mosselen', 'pangasius', 'tilapia', 'makreel', 'tofu', 'tempeh', 'vegetarische', 'vega ', 'kipfilet', 'kippendij', 'schnitzel', 'filet', 'salami', 'pancetta', 'prosciutto', 'rookworst', 'hamburger', 'falafel']],
  ['brood', ['brood', 'stokbrood', 'bolletje', 'broodje', 'croissant', 'pita', 'naan', 'focaccia', 'ciabatta', 'bladerdeeg', 'pizzadeeg', 'deeg', 'beschuit', 'krentenbol']],
  ['groente', ['ui', 'sjalot', 'knoflook', 'tomaat', 'tomaten', 'paprika', 'courgette', 'aubergine', 'wortel', 'winterpeen', 'prei', 'spinazie', 'sla', 'rucola', 'komkommer', 'broccoli', 'bloemkool', 'kool', 'spruit', 'boon', 'bonen', 'sperzie', 'erwt', 'peultjes', 'champignon', 'paddenstoel', 'aardappel', 'zoete aardappel', 'pompoen', 'biet', 'selderij', 'venkel', 'asperge', 'avocado', 'citroen', 'limoen', 'sinaasappel', 'appel', 'peer', 'banaan', 'aardbei', 'framboos', 'bes', 'druif', 'mango', 'ananas', 'meloen', 'gember', 'koriander', 'peterselie', 'basilicum', 'munt', 'bieslook', 'dille', 'rozemarijn', 'lente-ui', 'bosui', 'radijs', 'pastinaak', 'knolselderij', 'andijvie', 'boerenkool', 'zuurkool', 'taugé', 'paksoi', 'chilipeper', 'rode peper', 'groene peper', 'jalapeño', 'kers', 'granaatappel', 'kiwi', 'maïs', 'roerbak', 'groente', 'salade', 'veldsla', 'ijsbergsla', 'witlof', 'citroengras']],
  ['drinken', ['wijn', 'bier', 'sap', 'frisdrank', 'water', 'koffie', 'thee', 'cola', 'limonade', 'siroop']],
  ['huishouden', ['wc-papier', 'toiletpapier', 'keukenrol', 'afwasmiddel', 'wasmiddel', 'tandpasta', 'shampoo', 'zeep', 'luiers', 'vuilniszak', 'aluminiumfolie', 'bakpapier', 'vershoudfolie', 'tissues', 'schoonmaak', 'sponsjes', 'deodorant']],
];

export function categorize(name) {
  const n = ' ' + String(name || '').toLowerCase() + ' ';
  // specifieke uitzonderingen eerst
  if (/bloemkool|rode peper|groene peper|chilipeper|verse? (peterselie|koriander|basilicum|munt|dille|bieslook|rozemarijn|tijm)/.test(n)) return 'groente';
  if (/kokosmelk|tomatenpuree|tomatenblokjes|passata|gepelde tomaten|zongedroogde tomaten/.test(n)) return 'houdbaar';
  if (/paprikapoeder|knoflookpoeder|uienpoeder|gemberpoeder/.test(n)) return 'kruiden';
  for (const [cat, words] of CAT_WORDS) {
    for (const w of words) {
      const t = w.trim();
      if (t.length <= 3) {
        if (new RegExp(`[\\s-]${t}[\\s-]`).test(n)) return cat;
      } else if (n.includes(t)) return cat;
    }
  }
  return 'overig';
}

// ---------- Hoeveelheden tonen en optellen ----------
export function fmtNum(n) {
  if (n == null) return '';
  const r = Math.round(n * 100) / 100;
  const whole = Math.floor(r), frac = r - whole;
  const map = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];
  for (const [v, s] of map) if (Math.abs(frac - v) < 0.02) return (whole ? whole : '') + s;
  return String(r).replace('.', ',');
}

export function fmtQty(qty, unit) {
  if (qty == null && !unit) return '';
  if (unit === 'g' && qty >= 1000) return `${fmtNum(qty / 1000)} kg`;
  if (unit === 'ml' && qty >= 1000) return `${fmtNum(qty / 1000)} l`;
  const q = fmtNum(qty);
  if (!unit) return q;
  if (unit === 'st') return `${q} st`;
  return `${q} ${unit}`.trim();
}

/** Tel regels op. items: [{ name, qty, unit, recipe }] -> [{ key, name, parts:[{qty,unit}], recipes:[] }] */
export function aggregate(items) {
  const map = new Map();
  for (const it of items) {
    const key = normalizeName(it.name);
    if (!key) continue;
    let e = map.get(key);
    if (!e) { e = { key, name: it.name, buckets: new Map(), recipes: new Set(), noQty: false }; map.set(key, e); }
    if (it.recipe) e.recipes.add(it.recipe);
    if (it.qty == null) { if (it.unit) addBucket(e, it.unit, null); else e.noQty = true; continue; }
    const def = it.unit ? UNIT_ALIAS.get(it.unit) : null;
    if (def && (def.fam === 'mass' || def.fam === 'vol')) {
      addBucket(e, def.fam === 'mass' ? 'g' : 'ml', it.qty * def.factor);
    } else {
      addBucket(e, it.unit || '', it.qty);
    }
  }
  return [...map.values()].map((e) => {
    const parts = [...e.buckets.entries()].map(([unit, qty]) => ({ unit, qty }));
    const qtyText = parts.map((p) => (p.qty == null ? p.unit : fmtQty(p.qty, p.unit))).filter(Boolean).join(' + ');
    return { key: e.key, name: prettyName(e.name), qtyText, recipes: [...e.recipes] };
  });
}

function addBucket(e, unit, qty) {
  const cur = e.buckets.get(unit);
  if (qty == null) { if (!e.buckets.has(unit)) e.buckets.set(unit, null); return; }
  e.buckets.set(unit, (cur || 0) + qty);
}

function prettyName(n) {
  const s = String(n).trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function scaleQty(qty, factor) {
  if (qty == null) return null;
  return qty * factor;
}

// Recepten binnenhalen: via een link (schema.org/Recipe in de pagina), via geplakte tekst of via een foto (tekstherkenning).

// De meeste receptsites staan niet toe dat een andere website hun pagina rechtstreeks ophaalt (CORS).
// Daarom proberen we tegelijk een paar openbare doorgeefdiensten; de eerste die een recept oplevert wint.
// Alleen de link van het recept gaat daarheen, verder niets.
const enc = encodeURIComponent;
const SOURCES = [
  { kind: 'html', url: (u) => u },
  { kind: 'html', url: (u) => `https://api.allorigins.win/raw?url=${enc(u)}` },
  { kind: 'html', url: (u) => `https://corsproxy.io/?url=${enc(u)}` },
  { kind: 'html', url: (u) => `https://api.codetabs.com/v1/proxy?quest=${enc(u)}` },
  { kind: 'html', url: (u) => `https://r.jina.ai/${u}`, headers: { 'X-Return-Format': 'html' } },
  { kind: 'text', url: (u) => `https://r.jina.ai/${u}` },
];

async function fetchText(url, headers, signal) {
  const r = await fetch(url, { signal, credentials: 'omit', headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = await r.text();
  if (!t || t.length < 300) throw new Error('leeg');
  return t;
}

function markdownToText(md) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_`]/g, '');
}

/** Haalt een recept op. Geeft het eerste volledige resultaat, anders het beste halve, anders een fout. */
export async function importFromUrl(url, { timeout = 20000 } = {}) {
  const ctl = new AbortController();
  const partials = [];
  const attempts = SOURCES.map(async (src) => {
    const body = await fetchText(src.url(url), src.headers, ctl.signal);
    let rec;
    if (src.kind === 'html') rec = parseRecipeHtml(body, url);
    else {
      const txt = markdownToText(body.replace(/^[\s\S]*?Markdown Content:\s*/i, ''));
      const t = parseRecipeText(txt);
      const title = (body.match(/^Title:\s*(.+)$/m) || [])[1];
      rec = { ...t, title: title || t.title, image: '', source: url, partial: t.ingredients.length < 2 };
    }
    if (rec.ingredients?.length && !rec.partial) return rec;
    if (!/just a moment|access denied|attention required|captcha|forbidden|not found|404/i.test(rec.title || '')) partials.push(rec);
    throw new Error('geen recept');
  });
  const timer = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout));
  try {
    const rec = await Promise.race([Promise.any(attempts), timer]);
    return rec;
  } catch {
    const best = partials.sort((a, b) => (b.ingredients?.length || 0) - (a.ingredients?.length || 0) || (b.title ? 1 : 0) - (a.title ? 1 : 0))[0];
    if (best && (best.title || best.ingredients?.length)) return { ...best, partial: true };
    throw new Error('Pagina niet bereikbaar');
  } finally { ctl.abort(); }
}

export function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[).,]+$/, '') : null;
}

// ---------- schema.org Recipe ----------
function findRecipeNode(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipeNode(n); if (r) return r; } return null; }
  const t = node['@type'];
  if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return node;
  if (node['@graph']) return findRecipeNode(node['@graph']);
  if (node.mainEntity) return findRecipeNode(node.mainEntity);
  return null;
}

function isoToMinutes(d) {
  if (!d || typeof d !== 'string') return null;
  const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const min = (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0);
  return min || null;
}

const decode = (s) => {
  const el = document.createElement('textarea');
  el.innerHTML = String(s ?? '');
  return el.value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
};

function flattenSteps(ins) {
  if (!ins) return [];
  if (typeof ins === 'string') return ins.split(/\n+|(?<=\.)\s+(?=\d+\.\s)/).map(decode).filter(Boolean);
  if (Array.isArray(ins)) return ins.flatMap(flattenSteps);
  if (ins['@type'] === 'HowToSection') return flattenSteps(ins.itemListElement);
  if (ins.text) return [decode(ins.text)];
  if (ins.name) return [decode(ins.name)];
  return [];
}

function pickImage(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return pickImage(img[img.length > 1 ? 1 : 0]) || pickImage(img[0]);
  return img.url || img.contentUrl || '';
}

function yieldToServings(y) {
  if (Array.isArray(y)) y = y[0];
  const m = String(y ?? '').match(/\d+/);
  return m ? +m[0] : null;
}

export function parseRecipeHtml(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let node = null;
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try { node = findRecipeNode(JSON.parse(s.textContent)); } catch { /* kapotte json overslaan */ }
    if (node) break;
  }
  const meta = (p) => doc.querySelector(`meta[property="${p}"],meta[name="${p}"]`)?.content || '';
  if (!node) {
    // Geen gestructureerd recept: titel en foto meenemen, de rest zelf aanvullen.
    return {
      title: decode(meta('og:title') || doc.title || ''),
      image: meta('og:image'),
      ingredients: [], steps: [], servings: null, minutes: null, source: url, partial: true,
    };
  }
  let image = pickImage(node.image) || meta('og:image');
  try { if (image) image = new URL(image, url).href; } catch { /* laat staan */ }
  const cat = [node.recipeCategory, node.recipeCuisine, node.keywords].flat().filter(Boolean).join(',');
  return {
    title: decode(node.name || meta('og:title')),
    image,
    ingredients: (node.recipeIngredient || node.ingredients || []).map(decode).filter(Boolean),
    steps: flattenSteps(node.recipeInstructions),
    servings: yieldToServings(node.recipeYield),
    minutes: isoToMinutes(node.totalTime) || ((isoToMinutes(node.prepTime) || 0) + (isoToMinutes(node.cookTime) || 0)) || null,
    tags: guessTags(cat),
    source: url,
  };
}

function guessTags(s) {
  const t = String(s).toLowerCase();
  const out = [];
  if (/vega|vegetar/.test(t)) out.push('Vega');
  if (/soep/.test(t)) out.push('Soep');
  if (/oven/.test(t)) out.push('Oven');
  if (/pasta/.test(t)) out.push('Pasta');
  if (/salade/.test(t)) out.push('Salade');
  return out;
}


// ---------- Losse tekst (geplakt of uit een foto) ----------
const ING_HEAD = /^(ingredi[eë]nten|ingredients|benodigdheden|wat heb je nodig|boodschappen)\b/i;
const STEP_HEAD = /^(bereiding|bereidingswijze|werkwijze|instructies|zo maak je het|aan de slag|method|instructions|directions)\b/i;
const QTY_START = /^([-•*]\s*)?(\d|½|¼|¾|een |snufje|scheut|handje|zout|peper)/i;

export function parseRecipeText(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = { title: '', ingredients: [], steps: [], servings: null, minutes: null };
  if (!lines.length) return out;
  let mode = 'auto';
  let titleTaken = false;
  for (const line of lines) {
    if (ING_HEAD.test(line)) { mode = 'ing'; continue; }
    if (STEP_HEAD.test(line)) { mode = 'step'; continue; }
    const pers = line.match(/(\d+)\s*(personen|pers\.?|porties|persons|servings)/i);
    if (pers && !out.servings) out.servings = +pers[1];
    const mins = line.match(/(\d+)\s*(min|minuten)\b/i);
    if (mins && !out.minutes && line.length < 40) out.minutes = +mins[1];
    if (!titleTaken && line.length > 2 && line.length < 80 && !QTY_START.test(line)) {
      out.title = line; titleTaken = true; continue;
    }
    if ((pers || mins) && line.length < 30) continue;
    if (mode === 'ing') out.ingredients.push(line);
    else if (mode === 'step') out.steps.push(line.replace(/^\d+[.)]\s*/, ''));
    else if (QTY_START.test(line) && line.length < 70) out.ingredients.push(line);
    else if (line.length > 25) out.steps.push(line.replace(/^\d+[.)]\s*/, ''));
  }
  // OCR breekt zinnen over regels: stappen die niet met een hoofdletter beginnen aan de vorige plakken
  const merged = [];
  for (const s of out.steps) {
    if (merged.length && /^[a-zà-ÿ]/.test(s) && !/[.!?]$/.test(merged[merged.length - 1])) merged[merged.length - 1] += ' ' + s;
    else merged.push(s);
  }
  out.steps = merged;
  return out;
}

// ---------- Foto: tekstherkenning op het toestel zelf ----------
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Kon tekstherkenning niet laden (geen internet?)'));
    document.head.appendChild(s);
  });
}

/** Foto klaarmaken voor tekstherkenning: goed gedraaid, ca. 2000 px, grijs en met meer contrast. */
export async function prepareForOcr(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const target = 2200;
    const scale = Math.min(2.5, target / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h); // <img> houdt rekening met de stand van de foto (EXIF)
    const d = ctx.getImageData(0, 0, w, h); const px = d.data;
    // grijswaarden + histogram
    const hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) {
      const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
      px[i] = g; hist[g]++;
    }
    // contrast oprekken tussen 2% en 98%
    const total = w * h; let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.02) { hi = v; break; } }
    const range = Math.max(1, hi - lo);
    for (let i = 0; i < px.length; i += 4) {
      let g = ((px[i] - lo) * 255) / range;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      px[i] = px[i + 1] = px[i + 2] = g;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

export async function ocrImage(file, onProgress) {
  await loadScript(TESSERACT_URL);
  const [canvas, worker] = await Promise.all([
    prepareForOcr(file),
    window.Tesseract.createWorker('nld', 1, {
      logger: (m) => { if (m.status === 'recognizing text') onProgress?.(m.progress); },
    }),
  ]);
  try {
    await worker.setParameters({ preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(canvas);
    return cleanOcr(data.text || '');
  } finally { await worker.terminate(); }
}

/** Veelvoorkomende herkenningsfoutjes rechtzetten */
function cleanOcr(t) {
  return t
    .replace(/[|]/g, 'l')
    .replace(/[‘’]/g, "'")
    .replace(/(\d)\s*[,.]\s*(\d)/g, '$1,$2')
    .replace(/\b(\d+)\s*gr?\b/g, '$1 g')
    .replace(/\b([0-9]+)\s*(el|tl|ml|dl|cl|kg)\b/gi, '$1 $2')
    .replace(/^[ \t•·*°-]+/gm, '')
    .replace(/^o\s+(?=\d)/gm, '')
    .replace(/^[lLI](?=\s?(el|tl|kg|g|ml|dl|cl|l|st|blik|teen|pak|zak|bos|snuf)\b)\s?/gm, '1 ')
    .replace(/^[lLI](?=\s?\d)/gm, '1')
    .replace(/[ \t]{2,}/g, ' ');
}

/** Foto verkleinen tot een handzaam JPEG-plaatje (data-URL) voor bij het recept */
export async function shrinkImage(file, max = 900, quality = 0.78) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally { URL.revokeObjectURL(url); }
}

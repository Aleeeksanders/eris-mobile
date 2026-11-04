// ============================================================
// Eris — FoodText: cómo se escribe un alimento no debe importar
//
// "Coca-Cola Zero", "coca cola zero", "COCACOLA zero", "zero coca cola", "cocacola sero" y "Coca Cola Zero®" son el mismo
// producto. Antes cada buscador comparaba a su manera (subcadena exacta, sonido, palabras en orden) y bastaba una tilde,
// un guion, un plural, el orden o una letra cambiada para "no lo encontré" (2026-10-09: "chocapig"). Acá vive UNA
// normalización estándar y UN índice que usan todos los buscadores: el servidor (base chilena, catálogo, envasados,
// registro por chat) y la app. Se edita en la app (eris-mobile/src/services/foodText.ts) y el servidor recibe la COPIA
// EXACTA con `bun scripts/sync_copias.ts` (--revisar avisa si difieren).
//
// Cada palabra calza en uno de estos niveles, de más a menos confiable:
//   igual (sin tildes, mayúsculas, símbolos, espacios de más ni plural) → suena igual (z/s/c, v/b, h muda, ll/y, letras
//   dobles) → empieza igual (solo mientras se escribe en el buscador) → a 1 letra de distancia (2 si es larga).
// Lo dudoso nunca le gana a lo exacto y el orden de las palabras no importa. El índice se arma una vez y cada búsqueda
// mira solo las palabras candidatas (no recorre todos los alimentos).
// ============================================================

const MARKS = /[̀-ͯ]/g;

/** Texto estándar: sin tildes, en minúsculas, símbolos como espacio y letras separadas de números ("Súper8" → "super 8"). */
export function normText(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD").replace(MARKS, "")
    .toLowerCase()
    .replace(/['’´`]/g, "") // kellogg's → kelloggs
    .replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Palabras que no distinguen un alimento de otro ("leche CON chocolate", "yogur SABOR frutilla", "350 ML"). "sin" sí importa. */
export const STOP = new Set([
  "de", "del", "la", "el", "los", "las", "lo", "con", "y", "e", "o", "u", "en", "al", "a", "un", "una", "uno", "unos", "unas",
  "para", "por", "tipo", "estilo", "sabor", "the", "of", "and", "with", "g", "gr", "grs", "gramo", "gramos", "ml", "cc", "kg",
  "l", "lt", "lts", "litro", "litros", "cl", "oz", "x",
]);

/**
 * Forma singular estándar: empanadas → empanada, panes → pan, limones → limon, nueces/nuez → nuec, dulces/dulce → dulc.
 * No es gramática: solo tiene que dar lo MISMO para el singular y el plural de una palabra.
 */
export function stemWord(w: string): string {
  if (/\d/.test(w)) return w;
  let s = w.replace(/z$/, "c");
  if (s.length <= 3) return s;
  if (s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.length > 3 && /[lnrdzcj]e$/.test(s)) s = s.slice(0, -1);
  return s;
}

/** Cómo suena (español de Chile/Latinoamérica, con seseo): "zucaritas" = "sucaritas", "vilay" = "bilay", "hallulla" = "ayuya". */
export function phonWord(w: string): string {
  return w
    .replace(/qu/g, "k")
    .replace(/c(?=[ei])/g, "s")
    .replace(/[zx]/g, "s")
    .replace(/c/g, "k")
    .replace(/g(?=[ei])/g, "j")
    .replace(/v/g, "b")
    .replace(/h/g, "")
    .replace(/ll/g, "y")
    .replace(/w/g, "u")
    .replace(/y$/, "i")
    .replace(/(.)\1+/g, "$1");
}

/** Palabras estándar de un texto, sin las que no distinguen (si solo había de esas, se dejan). */
export function foodTokens(s: unknown): string[] {
  const words = normText(s).split(" ").filter(Boolean);
  const keep = words.filter((w) => !STOP.has(w));
  return (keep.length ? keep : words).map(stemWord);
}

/** Distancia de edición con transposición (Damerau, versión óptima), cortando apenas supera `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Cuántas letras distintas se toleran en una palabra: ninguna si es corta, 1 desde 5 letras (4 si empieza igual), 2 desde 8. */
const fuzzyMax = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

// Peso de cada nivel de coincidencia
export const EXACT = 1, SOUND = 0.95, PREFIX = 0.8, FUZZY1 = 0.75, FUZZY2 = 0.6;

/** Qué tan parecidas son dos palabras YA estándar (foodTokens): EXACT, SOUND, FUZZY1, FUZZY2 o 0. */
export function wordMatch(q: string, d: string): number {
  if (q === d) return EXACT;
  const pq = phonWord(q), pd = phonWord(d);
  if (pq === pd) return SOUND;
  const max = fuzzyMax(q.length);
  if (!max || (q.length < 5 && q[0] !== d[0])) return 0;
  const dist = editDistance(pq, pd, max);
  return dist === 1 ? FUZZY1 : dist === 2 && max >= 2 ? FUZZY2 : 0;
}

/** ¿Dos palabras sueltas (en cualquier forma: "Sopaipillas", "sopaipilla") son la misma, tolerando un error de tipeo? */
export function sameWord(a: string, b: string, minWeight = FUZZY2): boolean {
  const qa = foodTokens(a)[0], qb = foodTokens(b)[0];
  return !!qa && !!qb && wordMatch(qa, qb) >= minWeight;
}

// ─── Índice ───────────────────────────────────────────────────

/** Un texto por el que se busca un alimento. `extra` (la marca) ayuda a encontrarlo pero no cuenta como palabra de más. */
export interface FoodKey { text: string; extra?: string; weight?: number }
export interface FoodHit<T> {
  item: T;
  score: number;
  /** todas las palabras calzaron igual o por sonido */
  exact: boolean;
  /** alguna palabra se tomó con un error de tipeo */
  fuzzy: boolean;
  /** faltó una palabra (solo con `partial`) */
  partial: boolean;
}
export interface SearchOpts {
  limit?: number;
  /** la última palabra puede estar a medio escribir ("empan" → empanada): para el buscador mientras se escribe */
  prefix?: boolean;
  /** si nada calza con todas las palabras, vale que falte una (para el buscador; el registro por chat no la usa) */
  partial?: boolean;
  /** tolerar errores de tipeo (por defecto sí) */
  fuzzy?: boolean;
}

interface Key { item: number; toks: string[]; ext: string[]; norm: string; weight: number }

/** Nombres con barra son sinónimos: "Palta / Aguacate" se busca como "Palta" y como "Aguacate" (si no, cada uno sobra en el otro). */
export function nameKeys(name: string, weight = 1): FoodKey[] {
  const parts = String(name ?? "").split(/\s+\/\s+|\//).map((p) => p.trim()).filter(Boolean);
  return parts.map((text) => ({ text, weight }));
}

export class FoodIndex<T> {
  private keys: Key[] = [];
  private post = new Map<string, number[]>();
  private byPhon = new Map<string, string[]>();
  private sorted: string[] = [];
  private sortedPhon: string[] = [];
  private surface = new Map<string, string>();

  constructor(private items: T[], keysOf: (item: T) => FoodKey[]) {
    const add = (tok: string, key: number, word?: string) => {
      let list = this.post.get(tok);
      if (!list) {
        list = [];
        this.post.set(tok, list);
        const p = phonWord(tok);
        const same = this.byPhon.get(p);
        if (same) same.push(tok); else this.byPhon.set(p, [tok]);
      }
      if (list[list.length - 1] !== key) list.push(key);
      if (word && !this.surface.has(tok)) this.surface.set(tok, word);
    };
    items.forEach((item, i) => {
      for (const k of keysOf(item)) {
        const words = (t: string) => normText(t).split(" ").filter((w) => w && !STOP.has(w));
        // Cómo se escribe cada palabra, con sus tildes ("colacion" → "colación"): es lo que se muestra al corregir
        const spelled = new Map<string, string>();
        for (const t of [k.text, k.extra ?? ""]) {
          for (const sw of String(t).toLowerCase().split(/[^a-z0-9\u00e0-\u00ff]+/)) {
            const n = normText(sw);
            if (n && !n.includes(" ") && !spelled.has(n)) spelled.set(n, sw);
          }
        }
        const mainW = words(k.text).map((w) => spelled.get(w) ?? w), extW = (k.extra ? words(k.extra) : []).map((w) => spelled.get(w) ?? w);
        const toks = mainW.map((w) => stemWord(normText(w))), ext = extW.map((w) => stemWord(normText(w)));
        if (!toks.length && !ext.length) continue;
        const id = this.keys.length;
        this.keys.push({ item: i, toks, ext, norm: toks.join(" "), weight: k.weight ?? 1 });
        // Cada palabra, y cada par de palabras juntas ("coca cola" también es "cocacola")
        for (const [ts, ws] of [[toks, mainW], [ext, extW]] as const) {
          ts.forEach((t, j) => {
            add(t, id, ws[j]);
            if (j + 1 < ts.length) add(t + ts[j + 1], id, ws[j] + ws[j + 1]);
          });
        }
      }
    });
    this.sorted = [...this.post.keys()].sort();
    this.sortedPhon = [...this.byPhon.keys()].sort();
  }

  get size(): number { return this.items.length; }

  /**
   * Las palabras del índice que pueden ser `q`, con su peso. Lo fonético y lo con errores solo si no hay nada igual.
   * `raw`: la palabra tal como se escribió (sin pasar a singular), para buscar por el comienzo: «manz» es «manc» en
   * singular estándar y no encontraba «manzana» mientras se escribía (2026-10-23).
   */
  private expand(q: string, prefix: boolean, fuzzy: boolean, raw?: string): Map<string, number> {
    const m = new Map<string, number>();
    const put = (t: string, w: number) => { if ((m.get(t) ?? 0) < w) m.set(t, w); };
    if (this.post.has(q)) put(q, EXACT);
    const pq = phonWord(q);
    for (const t of this.byPhon.get(pq) ?? []) put(t, SOUND);
    if (prefix && q.length >= 1) {
      for (const t of range(this.sorted, q)) put(t, PREFIX);
      if (raw && raw !== q) for (const t of range(this.sorted, raw)) put(t, PREFIX);
      if (pq.length >= 2) for (const p of range(this.sortedPhon, pq)) for (const t of this.byPhon.get(p) ?? []) put(t, PREFIX * 0.95);
    }
    if (fuzzy && ![...m.values()].some((w) => w >= SOUND)) {
      const max = fuzzyMax(q.length);
      if (max) {
        for (const p of this.sortedPhon) {
          if (Math.abs(p.length - pq.length) > max) continue;
          const toks = this.byPhon.get(p)!;
          if (q.length < 5 && !toks.some((t) => t[0] === q[0])) continue;
          const dist = editDistance(pq, p, max);
          if (dist === 1) for (const t of toks) put(t, FUZZY1);
          else if (dist === 2 && max >= 2) for (const t of toks) put(t, FUZZY2);
        }
      }
    }
    return m;
  }

  search(query: string, opts: SearchOpts = {}): FoodHit<T>[] {
    const { limit = 20, prefix = false, partial = false, fuzzy = true } = opts;
    let Q = foodTokens(query);
    if (!Q.length) return [];
    const words = normText(query).split(" ").filter(Boolean);
    const kept = words.filter((w) => !STOP.has(w));
    const rawLast = (kept.length ? kept : words)[(kept.length ? kept : words).length - 1];
    let E = Q.map((q, i) => this.expand(q, prefix && i === Q.length - 1, fuzzy, i === Q.length - 1 ? rawLast : undefined));
    // "coca cola" contra "Cocacola": dos palabras que solas no calzan pero juntas sí
    for (let i = 0; i + 1 < Q.length; i++) {
      if (E[i].size && E[i + 1].size) continue;
      const joined = Q[i] + Q[i + 1];
      const e = this.expand(joined, prefix && i + 1 === Q.length - 1, fuzzy);
      if (!e.size) continue;
      Q = [...Q.slice(0, i), joined, ...Q.slice(i + 2)];
      E = [...E.slice(0, i), e, ...E.slice(i + 2)];
    }
    // Los números ("Super 8", "1,5 L") ayudan si calzan, pero no son obligatorios
    const soft = Q.map((q) => /^\d+$/.test(q));
    const required = Q.map((_, i) => i).filter((i) => !soft[i]);
    const allowMissing = partial && required.length >= 2 ? 1 : 0;
    const need = Math.max(1, required.length - allowMissing);

    // Candidatos: las claves que tienen al menos `need` de las palabras obligatorias
    const count = new Map<number, number>();
    for (const i of required.length ? required : Q.map((_, j) => j)) {
      const seen = new Set<number>();
      for (const t of E[i].keys()) for (const k of this.post.get(t) ?? []) if (!seen.has(k)) { seen.add(k); count.set(k, (count.get(k) ?? 0) + 1); }
    }
    const qNorm = Q.join(" ");
    const best = new Map<number, FoodHit<T>>();
    for (const [kid, c] of count) {
      if (c < (required.length ? need : 1)) continue;
      const key = this.keys[kid];
      const hit = this.scoreKey(key, Q, E, soft, qNorm, allowMissing);
      if (!hit) continue;
      const prev = best.get(key.item);
      if (!prev || hit.score > prev.score) best.set(key.item, { ...hit, item: this.items[key.item] });
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private scoreKey(key: Key, Q: string[], E: Map<string, number>[], soft: boolean[], qNorm: string, allowMissing: number) {
    // Palabras de la clave: sueltas, de a pares (cubren dos) y las de la marca (no cuentan como de más)
    const cands: Array<{ t: string; pos: number; span: number; main: boolean }> = [];
    key.toks.forEach((t, i) => {
      cands.push({ t, pos: i, span: 1, main: true });
      if (i + 1 < key.toks.length) cands.push({ t: t + key.toks[i + 1], pos: i, span: 2, main: true });
    });
    key.ext.forEach((t, i) => {
      cands.push({ t, pos: 1000 + i, span: 1, main: false });
      if (i + 1 < key.ext.length) cands.push({ t: t + key.ext[i + 1], pos: 1000 + i, span: 2, main: false });
    });
    let sum = 0, missing = 0, fuzzy = false, loose = false, lastPos = -1, inOrder = true, matched = 0;
    const used = new Set<number>();
    for (let qi = 0; qi < Q.length; qi++) {
      let w = 0, at: (typeof cands)[number] | null = null;
      for (const c of cands) {
        const cw = E[qi].get(c.t) ?? 0;
        if (cw > w) { w = cw; at = c; }
      }
      if (!at) { if (!soft[qi]) missing++; continue; }
      sum += w;
      matched++;
      if (w < SOUND) { loose = true; if (w <= FUZZY1) fuzzy = true; }
      if (at.main) {
        for (let p = at.pos; p < at.pos + at.span; p++) used.add(p);
        if (at.pos < lastPos) inOrder = false;
        lastPos = at.pos;
      }
    }
    if (missing > allowMissing || !matched) return null;
    const cover = sum / Q.length;
    const precision = key.toks.length ? used.size / key.toks.length : 0.5;
    let score = cover * 10 + precision * 3 + (used.has(0) ? 0.5 : 0) + (inOrder && matched > 1 ? 0.3 : 0) - missing * 4;
    if (key.norm === qNorm) score += 3;
    score *= key.weight;
    return { score, exact: !loose && !missing, fuzzy, partial: missing > 0 };
  }

  /**
   * La palabra del índice más parecida a `w` (ya estándar) si es UNA sola, con su distancia: para corregir "chocapig".
   * null si `w` ya existe (igual o por sonido), si no hay ninguna cerca o si hay dos igual de cerca.
   */
  nearest(w: string): { word: string; dist: number } | null {
    const q = stemWord(w);
    if (this.post.has(q) || this.byPhon.has(phonWord(q))) return null;
    const max = fuzzyMax(q.length);
    if (!max) return null;
    const pq = phonWord(q);
    let best: string | null = null, bestD = max + 1, tie = false;
    for (const p of this.sortedPhon) {
      if (Math.abs(p.length - pq.length) > max) continue;
      const toks = this.byPhon.get(p)!;
      if (q.length < 5 && !toks.some((t) => t[0] === q[0])) continue;
      const d = editDistance(pq, p, max);
      if (d < bestD) { best = p; bestD = d; tie = false; } else if (d === bestD && p !== best) tie = true;
    }
    if (!best || tie || bestD > max) return null;
    const tok = this.byPhon.get(best)![0];
    return { word: this.surface.get(tok) ?? tok, dist: bestD };
  }

  /**
   * Las palabras del índice que más se parecen a `w` por sonido (hasta `max` letras distintas, menos si es corta), de la
   * más cercana a la más lejana. Son pistas, no correcciones: las usa el dictado por voz para que el modelo elija.
   */
  similar(w: string, max = 3, k = 3): string[] {
    const q = stemWord(normText(w).replace(/ /g, ""));
    if (!q) return [];
    const pq = phonWord(q);
    const lim = Math.min(max, Math.floor(pq.length / 2));
    if (!lim) return [];
    const out: Array<{ word: string; d: number }> = [];
    for (const p of this.sortedPhon) {
      if (Math.abs(p.length - pq.length) > lim) continue;
      const d = editDistance(pq, p, lim);
      if (d > lim) continue;
      const tok = this.byPhon.get(p)![0];
      out.push({ word: this.surface.get(tok) ?? tok, d });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, k).map((x) => x.word);
  }

  /** ¿La palabra (ya estándar) existe en el índice, igual o por sonido? */
  knows(w: string): boolean {
    return this.spell(w) !== null;
  }

  /** Cómo está escrita en el índice una palabra conocida (igual o por sonido): "sopaipiya" → "sopaipilla"; null si no está. */
  spell(w: string): string | null {
    const q = stemWord(w);
    const tok = this.post.has(q) ? q : this.byPhon.get(phonWord(q))?.[0];
    return tok ? this.surface.get(tok) ?? tok : null;
  }
}

/** El texto con sus palabras desconocidas corregidas contra uno o más índices ("chocapig" → "chocapic"), o null si no cambió. */
export function correctText(text: string, indexes: Array<FoodIndex<unknown>>): string | null {
  const words = normText(text).split(" ").filter(Boolean);
  let changed = false;
  const out = words.map((w) => {
    if (STOP.has(w) || /\d/.test(w) || indexes.some((ix) => ix.knows(w))) return w;
    // La mejor de todas las bases, y tiene que ser UNA: dos candidatas igual de cerca = no se adivina
    let best: { word: string; dist: number } | null = null, tie = false;
    for (const ix of indexes) {
      const n = ix.nearest(w);
      if (!n) continue;
      if (!best || n.dist < best.dist) { best = n; tie = false; }
      else if (n.dist === best.dist && phonWord(stemWord(n.word)) !== phonWord(stemWord(best.word))) tie = true;
    }
    if (!best || tie) return w;
    changed = true;
    return best.word.toLowerCase();
  });
  return changed ? out.join(" ") : null;
}

// ─── Lo natural primero ───────────────────────────────────────────────────────
// «manzana» es la fruta (2026-10-23): el jugo de manzana anotado la semana pasada, o la «Manzana» de Watt's (un néctar),
// salían antes que la fruta. Estas palabras hacen de un alimento base un derivado cuando no se buscaron.
const DERIVED = new Set([
  "jugo", "nectar", "zumo", "bebida", "gaseosa", "refresco", "sabor", "saborizada", "saborizado", "agua", "te", "infusion",
  "kuchen", "torta", "pie", "queque", "pastel", "tarta", "galleta", "helado", "postre", "flan", "budin", "muffin",
  "mermelada", "compota", "conserva", "almibar", "deshidratada", "deshidratado", "confitada", "confitado",
  "vinagre", "salsa", "aceite", "chips", "snack", "barra", "barrita", "cereal", "polvo", "harina",
  "condensada", "manjar", "dulce", "caramelo", "chocolate", "licor", "yogur", "yogurt", "crema", "frita", "frito", "apanado", "apanada",
].map(stemWord));

/** Las palabras de un texto en su forma estándar, sin sacar las cortas ni las de relleno («sabor» es STOP para buscar). */
const allWords = (s: string) => normText(s).split(" ").filter(Boolean).map(stemWord);
const tokenSet = (s: string) => [...foodTokens(s)].sort().join(" ");

/**
 * Cuánto sube o baja un resultado para que lo natural salga primero: −2 si su nombre trae una palabra de derivado que no
 * se buscó («Jugo de manzana» al buscar «manzana»), +1 si es genérico (sin marca: la fruta antes que la manzana de Watt's).
 * Solo ordena: no saca nada. La usan el buscador de la app y los del servidor.
 */
export function naturalBoost(query: string, name: string, brand?: string): number {
  const q = new Set(allWords(query));
  const derived = allWords(name).some((w) => DERIVED.has(w) && !q.has(w));
  return (derived ? -2 : 0) + (brand ? 0 : 1);
}

/**
 * ¿Es exactamente lo buscado? Las mismas palabras, sin importar orden, plural ni tildes («Palta / Aguacate» es «palta» y
 * es «aguacate»). Un producto con marca, solo si también se nombró la marca: «manzana» no es la «Manzana» de Watt's.
 */
export function sameFood(query: string, name: string, brand?: string): boolean {
  const q = tokenSet(query);
  if (!q) return false;
  return nameKeys(name).some((k) => tokenSet(brand ? `${k.text} ${brand}` : k.text) === q);
}

/** Elementos de una lista ordenada que empiezan con `p` (búsqueda binaria). */
function range(sorted: string[], p: string): string[] {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < p) lo = mid + 1; else hi = mid; }
  const out: string[] = [];
  for (let i = lo; i < sorted.length && sorted[i].startsWith(p) && out.length < 200; i++) out.push(sorted[i]);
  return out;
}

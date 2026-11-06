// ============================================================
// Forge — la recuperación de cada músculo, con evidencia y con TUS datos (2026-11-06)
//
// Antes: «listo» a los 2 días de CALENDARIO con 4 series o más (entrenar el miércoles a las 22:00 daba «listo» el viernes a
// las 00:00: 26 h), sin mirar el esfuerzo. El usuario tenía agujetas y dudó con razón: «no creo que 48 horas funcione para
// todos». Lo que se leyó (texto completo salvo donde se indica):
//   - Refalo 2023 (24 con ≥3 años, 6 series de banca): la velocidad vuelve en 24–48 h; las agujetas siguen a las 48 h y no
//     parecen afectar la función. Flatt 2019 (6 series al fallo en 3 ejercicios): a las 48 h el rendimiento ya no difiere de
//     forma significativa y las agujetas están en su PEAK. Agujetas ≠ músculo sin recuperar, en quien entrena.
//   - Morán-Navarro 2017: sin fallo, recuperado a las 6 h; al fallo, banca hasta 48 h y salto hasta 72 h.
//   - Eur J Sport Sci 2021 (resumen): al fallo, el volumen cae a 24 h, la primera serie a 48 h y a 72 h está bien.
//   - Chen 2019 y Damas 2016 (resúmenes): en quien NO está acostumbrado la pérdida de fuerza es grande y dura días (por eso
//     «poco habitual» estira el rango); con semanas de entreno regular el daño baja mucho.
//   - Con el mismo estímulo, unos no pierden nada y otros siguen sin recuperar a 72 h (2023, PMC10803508): el promedio no
//     alcanza, por eso se mide cómo rindes TÚ (recoveryPairs).
//   - Ningún estudio da una fórmula con sueño, comida y estrés: van como aviso, no como horas inventadas. La creatina no
//     entra: un meta-análisis (Northeast 2021, solo resumen) no halla efecto en fuerza ni agujetas hasta 96 h.
// Los rangos son una ESTIMACIÓN hecha a partir de esos estudios, no un dato de ellos: la app lo dice. Nunca bloquea el entreno.
// ============================================================
import { L, catalog, effKg, setValue, type ForgeState, type FSet } from './forgeCore';

export type Soreness = 'nada' | 'molesta' | 'limita';
export interface SorenessReport { at: number; level: Soreness; subs: string[]; day: string }
export type RecoveryState = 'cargado' | 'probable' | 'listo' | 'sin_datos';

export interface Recovery {
  state: RecoveryState;
  /** el último día con trabajo para ese músculo (AAAA-MM-DD) */
  lastDay: string | null;
  hoursAgo: number | null;
  /** series (principal = 1, secundario = ½) */
  sets: number;
  /** parte de esas series a 0–1 repeticiones del fallo */
  fallo: number;
  /** lo entrenas seguido (al menos 2 veces en las 4 semanas anteriores) */
  habitual: boolean;
  /** entre cuántas horas ESTIMAMOS que ya rindes normal */
  range: [number, number] | null;
  /** lo que dijiste hoy de ese músculo */
  soreness: Soreness | null;
}

const HORA = 3_600_000;
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mediodia = (day: string) => new Date(`${day}T12:00:00`).getTime();
const puntos = (ex: any, sub: string): number => ((ex?.m ?? {}) as Record<string, number>)[sub] ?? 0;
/** La hora real de la serie. Si se anotó otro día (registrar «ayer» hoy), `at` es cuándo se anotó, no cuándo se hizo: mediodía. */
const horaDe = (x: FSet, day: string): number => (x.at && keyOf(new Date(x.at)) === day ? x.at : 0);

/** `sets`: las series de verdad (lo que se muestra). `carga`: lo que pesa para recuperarse (una serie con remate vale 2). */
interface Dosis { day: string; at: number; sets: number; carga: number; fallo: number }

function dosisDelDia(s: ForgeState, day: string, sub: string): Dosis | null {
  const cat = catalog(s);
  let n = 0, carga = 0, cerca = 0, ultima = 0;
  for (const [exId, list] of Object.entries((s.sessions || {})[day] || {})) {
    const p = puntos(cat[exId], sub);
    if (p < 1) continue;
    const w = p >= 2 ? 1 : 0.5;
    for (const x of list) {
      if (x.warmup) continue;
      // Con remate se siguió después de no poder más: siempre cuenta como al fallo, y para recuperarse pesa como dos series.
      // Las repeticiones forzadas dejan la fuerza más abajo y por más tiempo (Ahtiainen 2003: −56 % vs −38 %). Juntar las dos
      // líneas en una serie no vuelve más suave la estimación. El «2» es propio, no sale de un estudio.
      n += w;
      carga += w * (setValue(x) > 1 ? 2 : 1);
      if (x.tail || (typeof x.rir === 'number' && x.rir <= 1)) cerca += w;
      ultima = Math.max(ultima, horaDe(x, day));
    }
  }
  if (n < 1) return null;
  return { day, at: ultima || mediodia(day), sets: Math.round(n * 2) / 2, carga: Math.round(carga * 2) / 2, fallo: cerca / n };
}

/** El último trabajo de ese músculo antes de `antes` (si no se da, incluye hoy) */
function ultimaDosis(s: ForgeState, sub: string, hoy: string, antes?: string): Dosis | null {
  for (const day of Object.keys(s.sessions || {}).sort().reverse()) {
    if (day > hoy || (antes && day >= antes)) continue;
    const d = dosisDelDia(s, day, sub);
    if (d) return d;
  }
  return null;
}

/** ¿Lo entrenas seguido? Al menos 2 días con ese músculo en las 4 semanas antes de esa sesión. */
function esHabitual(s: ForgeState, sub: string, day: string): boolean {
  const desde = keyOf(new Date(mediodia(day) - 28 * 24 * HORA));
  let n = 0;
  for (const d of Object.keys(s.sessions || {})) if (d >= desde && d < day && dosisDelDia(s, d, sub)) n++;
  return n >= 2 && !negativasNuevas(s, sub, day);
}

/**
 * ¿Hoy hizo negativas de ese músculo sin haberlas hecho en las 6 semanas anteriores? Lo excéntrico daña harto cuando no hay
 * costumbre y mucho menos después (efecto de la serie repetida: Hody 2019; Chen 2019; 2021, PMID 33156414). Las 6 semanas son una
 * estimación: la protección dura de semanas a 6 meses, y va bajando.
 */
function negativasNuevas(s: ForgeState, sub: string, day: string): boolean {
  const cat = catalog(s);
  const tiene = (d: string) => Object.entries((s.sessions || {})[d] || {}).some(([id, list]) => puntos(cat[id], sub) >= 1 && list.some((x) => !x.warmup && (x.tail?.kind === 'neg' || /negativ/i.test(id))));
  if (!tiene(day)) return false;
  const desde = keyOf(new Date(mediodia(day) - 42 * 24 * HORA));
  return !Object.keys(s.sessions || {}).some((d) => d >= desde && d < day && tiene(d));
}

/**
 * Entre cuántas horas estimamos que rindes normal, por lo que hiciste. Poco habitual: el máximo sube 24 h. Lo que Forge ya
 * midió de ti lo corrige (rindes bien antes de 48 h → máximo 48; rindes mal entre 48 y 96 h → máximo +24).
 */
export function recoveryRange(sets: number, fallo: number, habitual: boolean, yo?: PersonalRecovery | null): [number, number] {
  const alta = sets >= 6 && fallo >= 0.5;
  const media = !alta && (sets >= 4 || (sets >= 3 && fallo >= 0.67));
  let [min, max]: [number, number] = alta ? [48, 72] : media ? [24, 48] : [12, 24];
  if (!habitual) max += 24;
  if (yo?.corto && yo.corto.n >= 3 && yo.corto.ratio >= 0.97) { min = Math.min(min, 24); max = Math.min(max, 48); }
  else if (yo?.medio && yo.medio.n >= 3 && yo.medio.ratio < 0.93) max += 24;
  return [min, max];
}

/** Lo último que dijiste de ese músculo, si es de las últimas 24 h y de después de entrenarlo */
function reporteDe(s: ForgeState, sub: string, trasAt: number, now: number): SorenessReport | null {
  const rs = s.soreness ?? [];
  for (let i = rs.length - 1; i >= 0; i--) {
    const r = rs[i];
    if (now - r.at > 24 * HORA) return null;
    if (r.at >= trasAt && r.subs.includes(sub)) return r;
  }
  return null;
}

/** La recuperación de un músculo. Lo que dices manda sobre la estimación; «molesta» (agujetas) no la cambia. */
export function muscleRecovery(s: ForgeState, sub: string, now: Date = L.forgeNow(), yo?: PersonalRecovery | null): Recovery {
  const d = ultimaDosis(s, sub, keyOf(now));
  if (!d) return { state: 'sin_datos', lastDay: null, hoursAgo: null, sets: 0, fallo: 0, habitual: false, range: null, soreness: null };
  const h = Math.max(0, (now.getTime() - d.at) / HORA);
  const habitual = esHabitual(s, sub, d.day);
  const range = recoveryRange(d.carga, d.fallo, habitual, yo);
  const rep = reporteDe(s, sub, d.at, now.getTime());
  let state: RecoveryState = h < range[0] ? 'cargado' : h < range[1] ? 'probable' : 'listo';
  if (rep?.level === 'limita') state = 'cargado';
  else if (rep?.level === 'nada' && h >= range[0]) state = 'listo';
  return { state, lastDay: d.day, hoursAgo: Math.round(h), sets: d.sets, fallo: d.fallo, habitual, range, soreness: rep?.level ?? null };
}

/** Guarda lo que dijiste de esos músculos (las últimas 120 respuestas: alimentan lo que Forge aprende de ti). */
export function recordSoreness(s: ForgeState, level: Soreness, subs: string[], day: string, now: number = L.forgeNow().getTime()): ForgeState {
  return { ...s, soreness: [...(s.soreness ?? []), { at: now, level, subs, day }].slice(-120) };
}

const nombreDe = (sub: string): string => String(L.SUB_BY_ID[sub]?.name ?? sub).toLowerCase();

/** ¿Toca preguntar cómo vienen los músculos? Entre 12 y 96 h después de entrenar, una vez al día. */
export function sorenessPrompt(s: ForgeState, now: Date = L.forgeNow()): { day: string; hoursAgo: number; subs: string[]; nombres: string[] } | null {
  const hoy = keyOf(now);
  const cat = catalog(s);
  for (const day of Object.keys(s.sessions || {}).sort().reverse()) {
    if (day > hoy) continue;
    const pesos: Record<string, number> = {};
    let ultima = 0;
    for (const [exId, list] of Object.entries(s.sessions[day] || {})) {
      const m = (cat[exId]?.m ?? {}) as Record<string, number>;
      for (const x of list) {
        if (x.warmup) continue;
        ultima = Math.max(ultima, horaDe(x, day));
        for (const [sub, p] of Object.entries(m)) if (p >= 1) pesos[sub] = (pesos[sub] ?? 0) + (p >= 2 ? 1 : 0.5);
      }
    }
    const subs = Object.keys(pesos).filter((k) => pesos[k] >= 2).sort((a, b) => pesos[b] - pesos[a]);
    if (!subs.length) continue;
    const h = (now.getTime() - (ultima || mediodia(day))) / HORA;
    if (h < 12 || h > 96) return null;
    if ((s.soreness ?? []).some((r) => r.day === day && now.getTime() - r.at < 20 * HORA)) return null;
    return { day, hoursAgo: Math.round(h), subs, nombres: subs.slice(0, 3).map(nombreDe) };
  }
  return null;
}

// ─── Lo que Forge aprende de ti ───────────────────────────────────────────────────────────────────────────────────────
// Cada vez que repites un ejercicio: cuánto rindió la primera serie contra la vez anterior, y cuántas horas habían pasado
// desde que trabajaste ese músculo. Es tu rendimiento real, no el promedio de un estudio.

export interface RecoveryPair { exId: string; day: string; gapH: number; ratio: number; soreness: Soreness | null }

/** Capacidad de una serie: la carga real con las repeticiones que hiciste y las que quedaban (sin RIR anotado, 1). */
function capacidad(s: ForgeState, ex: any, x: FSet): number | null {
  if (ex.unit || ex.eq === 'iso' || ex.eq === 'cardio' || x.reps < 1 || x.reps > 20) return null;
  const carga = effKg(s, ex, x);
  return carga > 0 ? carga * (1 + (x.reps + (x.rir ?? 1)) / 30) : null;
}

export function recoveryPairs(s: ForgeState, now: Date = L.forgeNow()): RecoveryPair[] {
  const cat = catalog(s);
  const hoy = keyOf(now);
  const previa: Record<string, number> = {};
  const out: RecoveryPair[] = [];
  for (const day of Object.keys(s.sessions || {}).sort()) {
    if (day > hoy) continue;
    for (const [exId, list] of Object.entries(s.sessions[day] || {})) {
      const ex = cat[exId];
      const prim = Object.entries((ex?.m ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1])[0]?.[0];
      const primera = list.find((x) => !x.warmup);
      if (!ex || !prim || !primera) continue;
      const cap = capacidad(s, ex, primera);
      if (cap == null) continue;
      const antes = previa[exId];
      previa[exId] = cap;
      if (antes == null) continue;
      const ratio = cap / antes;
      const d = ultimaDosis(s, prim, hoy, day);
      if (!d || ratio < 0.5 || ratio > 1.5) continue;
      const at = horaDe(primera, day) || mediodia(day);
      const rep = (s.soreness ?? []).filter((r) => r.subs.includes(prim) && r.at <= at && at - r.at <= 24 * HORA && r.at >= d.at).pop();
      out.push({ exId, day, gapH: Math.max(0, Math.round((at - d.at) / HORA)), ratio, soreness: rep?.level ?? null });
    }
  }
  return out;
}

export interface PersonalRecovery {
  pares: number;
  /** vuelta antes de 48 h, entre 48 y 96 h, y después (la referencia): rendimiento relativo a la referencia si hay 3 o más */
  corto: { n: number; ratio: number } | null;
  medio: { n: number; ratio: number } | null;
  largo: { n: number; ratio: number } | null;
  conAgujetas: { n: number; ratio: number } | null;
  sinAgujetas: { n: number; ratio: number } | null;
  /** lo más pronto que has vuelto a un músculo (horas) */
  minGapH: number | null;
  texto: string;
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pctTxt = (r: number) => `${Math.round(r * 100)} %`;

export function personalRecovery(s: ForgeState, now: Date = L.forgeNow()): PersonalRecovery {
  const pares = recoveryPairs(s, now);
  const de = (f: (p: RecoveryPair) => boolean) => pares.filter(f).map((p) => p.ratio);
  const largoR = de((p) => p.gapH >= 96);
  const base = largoR.length >= 3 ? media(largoR) : null;
  const grupo = (xs: number[]) => (xs.length ? { n: xs.length, ratio: base ? media(xs) / base : media(xs) } : null);
  const corto = grupo(de((p) => p.gapH < 48));
  const medio = grupo(de((p) => p.gapH >= 48 && p.gapH < 96));
  const conAgujetas = grupo(de((p) => p.soreness === 'molesta' || p.soreness === 'limita'));
  const sinAgujetas = grupo(de((p) => p.soreness === 'nada'));
  const minGapH = pares.length ? Math.min(...pares.map((p) => p.gapH)) : null;
  const partes: string[] = [];
  if (corto && corto.n >= 3) partes.push(`Cuando vuelves antes de 48 h rindes ${pctTxt(corto.ratio)} (${corto.n} veces).`);
  if (medio && medio.n >= 3) partes.push(`Entre 48 y 96 h rindes ${pctTxt(medio.ratio)} (${medio.n} veces).`);
  if (conAgujetas && conAgujetas.n >= 3) partes.push(`Con agujetas rendiste ${pctTxt(conAgujetas.ratio)} (${conAgujetas.n} veces).`);
  if (!partes.length) {
    partes.push(minGapH != null && minGapH >= 96
      ? `Todavía no puedo medir cómo te recuperas: siempre has vuelto a cada músculo después de ${Math.floor(minGapH / 24)} días o más. Cuando vuelvas antes, lo comparo con tus series.`
      : 'Todavía tengo pocas comparaciones para decirte cómo te recuperas tú: con 3 parecidas ya te digo algo.');
  }
  return { pares: pares.length, corto, medio, largo: grupo(largoR), conAgujetas, sinAgujetas, minGapH, texto: partes.join(' ') };
}

/** Lo que va al chat: los músculos recientes, cómo vienen y lo que Forge sabe de ti. */
export function recoverySummary(s: ForgeState, now: Date = L.forgeNow()) {
  const yo = personalRecovery(s, now);
  const musculos = Object.keys(L.SUB_BY_ID)
    .map((sub) => ({ sub, r: muscleRecovery(s, sub, now, yo) }))
    .filter(({ r }) => r.hoursAgo != null && r.hoursAgo <= 168 && r.sets >= 2)
    .sort((a, b) => b.r.sets - a.r.sets)
    .slice(0, 8)
    .map(({ sub, r }) => ({ nombre: nombreDe(sub), state: r.state, hoursAgo: r.hoursAgo, sets: r.sets, fallo: Math.round(r.fallo * 100) / 100, habitual: r.habitual, range: r.range, soreness: r.soreness }));
  return { musculos, personal: yo.texto, pares: yo.pares };
}

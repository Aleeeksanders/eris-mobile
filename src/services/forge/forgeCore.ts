// ============================================================
// Eris Mobile — Forge 2.0: el núcleo (F1, 2026-10-17)
//
// Puro (sin React ni almacenamiento): se copia tal cual al servidor (scripts/sync_forge_core.ts).
//
// El estado es el MISMO del HTML (forgeLegacy.defaultState: XP, racha, misiones, árbol, entrenos por día, Arena…) más
// lo nuevo de Forge 2.0:
//   - `sessions[día][ejercicio] = series`: cada serie con reps, carga (kg o lb), asistencia, RIR y hora.
//   - `gym`: «Mi gimnasio» (qué mancuernas, barras, discos y máquinas hay).
// Las series son la fuente de verdad; con cada cambio se recalculan los campos viejos (`training` = series por día,
// `trainMeta`, `weights`/`reps` = lo último usado), así:
//   1) el RPG se calcula con las MISMAS funciones del HTML (forgeLegacy) y no cambia ni un punto;
//   2) el estado sigue siendo legible por el HTML viejo (volver atrás con un respaldo funciona).
// ============================================================

import * as Legacy from './forgeLegacy';
// Las disciplinas y habilidades nuevas (fase I9): se cargan acá para que sus clases estén en la tabla del RPG siempre
import { skillById, isMasteredAny, extSkillXp, extMastered, EXT_SKILLS } from './forgeSkillsExt';
import {
  LEGACY_EXTRA, NEW_EXERCISES, BANDS, toKg, defaultGym,
  type ForgeExercise, type Gym, type Equip,
} from './forgeCatalog';

/** La lógica del HTML (sin tipos: es el JS portado tal cual). */
export const L: any = Legacy;

/** Multiplicador de intensidad de UNA serie (la misma escala del HTML: carga contra el 55 % de tu peso, 0,8–1,7). */
export function setIntensityMult(loadKg: number, bodyKg: number): number {
  const f = Math.max(0.5, Math.min(2.2, loadKg / ((bodyKg || 70) * 0.55)));
  return Math.max(0.8, Math.min(1.7, 1 + (f - 1) * 0.5));
}

/**
 * XP de entrenamiento serie por serie. En el HTML era (trabajo de TODO el historial) × 0,02 × la intensidad promedio de
 * TODO el historial: anotar una serie liviana bajaba el promedio y el XP de todo lo anterior. Ahora cada serie nueva suma
 * su trabajo × 0,02 × SU intensidad (anotar nunca resta) y lo migrado del HTML queda con la intensidad que tenía al migrar
 * (`xpMult`), sumado en el mismo orden: al migrar da exactamente lo mismo. Solo cambia para la vista del RPG (rpgView);
 * con un estado del HTML se usa la fórmula de siempre.
 */
const legacyTrainXpOf = L.trainXpOf;
L.setTrainXpOf((v: any) => {
  if (!v || !v.__rpgView) return legacyTrainXpOf(v);
  const byId = L.exCatalog(v).byId;
  let wLegacy = 0, fresh = 0;
  for (const day of Object.values(v.training || {}) as Array<Record<string, number>>) {
    let dw = 0;
    for (const [id, cnt] of Object.entries(day || {})) {
      const ex = byId[id];
      if (!ex || !cnt) continue;
      const w = (cnt || 0) * L.workOfSet(v, ex);
      if (ex.vm == null) dw += w; else fresh += w * L.GEN_WORK_FACTOR * ex.vm;
    }
    wLegacy += dw;
  }
  const M = v.xpMult ?? L.intensityMult(v);
  return Math.round(wLegacy * L.GEN_WORK_FACTOR * M + fresh);
});

/**
 * El remate (2026-11-06): lo que sigues haciendo SIN descanso cuando ya no sale otra repetición («pronas al fallo y las que me
 * quedan con negativas»). Es parte de la misma serie: un solo descanso, un solo registro. `reps` de la serie sigue siendo lo
 * estricto, así la fuerza y los récords no se inflan con lo del remate. Evidencia: AXS/25 Laboratorio/Series con Remate.
 */
export type TailKind = 'neg' | 'ayuda' | 'peso' | 'pausa';
export interface SetTail {
  kind: TailKind;
  reps: number;
  /** «bajando peso»: la carga con que seguiste */
  kg?: number;
  unit?: 'lb';
  /** «con ayuda»: la banda o la asistencia con que seguiste */
  assist?: number;
  band?: string;
}
export const TAIL_NAMES: Record<TailKind, { label: string; one: string; many: string }> = {
  neg: { label: 'Negativas', one: 'negativa', many: 'negativas' },
  ayuda: { label: 'Con ayuda', one: 'con ayuda', many: 'con ayuda' },
  peso: { label: 'Bajando peso', one: 'con menos peso', many: 'con menos peso' },
  pausa: { label: 'Pausa corta', one: 'tras una pausa', many: 'tras una pausa' },
};
/** «4 negativas», «1 negativa», «3 con ayuda» */
export const tailText = (t: SetTail) => `${t.reps} ${t.reps === 1 ? TAIL_NAMES[t.kind].one : TAIL_NAMES[t.kind].many}`;

/**
 * Cuánto vale una serie en el volumen de la semana: 1, y 1,5 si lleva un remate de 3 reps o más. ESTIMACIÓN PROPIA, ningún estudio
 * fija este número: series extendidas muestran crecimiento parecido al de varias series normales (Fink 2018, Ozaki 2018, en
 * Krzysztofik 2019) y las excéntricas valen por sí solas (ACSM 2026), pero no son dos series con su descanso.
 */
export const TAIL_MIN_REPS = 3;
export const setValue = (x: FSet): number => (x.warmup ? 0 : 1 + ((x.tail?.reps ?? 0) >= TAIL_MIN_REPS ? 0.5 : 0));

/** Una serie. `reps` son segundos en los isométricos y minutos en el cardio. */
export interface FSet {
  reps: number;
  /** lo que seguiste haciendo sin descanso al no salir más (no se suma a `reps`) */
  tail?: SetTail;
  /** carga: la mancuerna (una), el total de barra, lo que marca la máquina, el lastre en peso corporal */
  kg?: number;
  /** unidad de la máquina (solo si es lb) */
  unit?: 'lb';
  /** asistencia (máquina asistida o banda): se resta al peso corporal */
  assist?: number;
  band?: string;
  /** repeticiones en reserva: 0 = al fallo, 3 = tres o más; null/undefined = sin dato */
  rir?: number | null;
  /** descanso antes de esta serie (s), si se midió */
  rest?: number;
  /** cuándo se anotó (ms) */
  at?: number;
  /** calentamiento: no cuenta como serie de trabajo */
  warmup?: boolean;
  /** vino de la migración (antes solo se guardaba reps y un peso por ejercicio) */
  legacy?: boolean;
  /** tu peso corporal cuando la hiciste (carga en peso corporal, intensidad y fuerza relativa) */
  body?: number;
  /** solo en lo migrado: las reps y la carga con que el HTML contaba el XP (así el XP queda igual al peso) */
  rpgReps?: number;
  rpgKg?: number;
}
export type Sessions = Record<string, Record<string, FSet[]>>;

/** El estado del HTML (forgeLegacy.defaultState) más lo nuevo de Forge 2.0. */
export interface ForgeState {
  version: number;
  bankedXp: number; streak: number; bestStreak: number; lastClaimedDay: string | null;
  today: any;
  counters: Record<string, number>;
  skills: Record<string, { steps: boolean[] }>;
  /** series de trabajo por día y ejercicio (lo calcula syncLegacyDay desde `sessions`) */
  training: Record<string, Record<string, number>>;
  trainMeta: Record<string, Record<string, any>>;
  customExercises: any[];
  /** lo último usado por ejercicio (el RPG del HTML lo usa así) */
  weights: Record<string, number>;
  reps: Record<string, number>;
  bodyKg: number | null; heightCm: number | null; age: number | null; sex: 'h' | 'm' | null;
  activity: number; goal: string | null; title: string | null;
  dungeons: Record<string, boolean>;
  plan: Record<string, number>;
  log: any[];
  classes: string[];
  sessions: Sessions;
  gym: Gym | null;
  /** el descanso de cada ejercicio (s): lo que dejaste con −15/+15 en la barra de descanso (forgeTrain.restTarget) */
  restPrefs?: Record<string, number>;
  /** ejercicios que van con remate: dom_prona → negativas, y si reemplaza a otro del plan (dom_negativa) */
  tailPlan?: Record<string, { kind: TailKind; replaces?: string }>;
  /** las veces que dijiste «ahora no» a juntar dos ejercicios en una serie con remate */
  tailDismissed?: string[];
  /** ejercicios unidos, sin descanso entre ellos: A → B */
  planLinks?: Record<string, string>;
  /** series antiguas por las que ya se preguntó si fueron con ayuda («día:ejercicio») */
  assistChecked?: string[];
  /** lo que dijiste de tus músculos después de entrenar (forgeRecovery): las últimas 120 respuestas */
  soreness?: Array<{ at: number; level: 'nada' | 'molesta' | 'limita'; subs: string[]; day: string }>;
  /** lo que llega del teléfono y del servidor */
  autoLevel?: any;
  activityMode?: 'auto' | 'manual';
  /** la última carga usada por ejercicio (selector y lastre del RPG) */
  lastLoad?: Record<string, any>;
  /** cuándo se migró desde el HTML */
  migratedAt?: string;
  [k: string]: any;
}

export const STATE_VERSION = 5;

// ─── Catálogo completo (los 48 de siempre + los nuevos + los personalizados) ───

const LEGACY_LIST: ForgeExercise[] = L.EX_GROUPS.flatMap((g: any) => g.items.map((e: any) => ({
  ...e, group: g.id, ...(LEGACY_EXTRA[e.id] ?? { eq: e.load?.db ? 'db' : e.unit === 'seg' ? 'iso' : 'bw', pattern: 'aislado', range: [8, 12], level: 1 }),
  bw: e.load?.bw,
})));
export const BASE_EXERCISES: ForgeExercise[] = [...LEGACY_LIST, ...NEW_EXERCISES];
export const BASE_BY_ID: Record<string, ForgeExercise> = Object.fromEntries(BASE_EXERCISES.map((e) => [e.id, e]));

/** Un ejercicio personalizado (creado a mano o por Eris) con lo que falta para Forge 2.0. */
export function customToForge(c: any): ForgeExercise {
  const eq: Equip = c.eq ?? (c.load?.db ? 'db' : c.unit === 'seg' ? 'iso' : 'bw');
  const reps = Number(c.reps) || 10;
  return {
    id: c.id, name: c.name || c.id, group: c.group || 'empuje', m: c.m || {}, load: c.load || { bw: 0.5 }, reps, unit: c.unit,
    eq, pattern: c.pattern || 'aislado', range: c.range || [Math.max(1, reps - 3), reps + 3], level: c.level || 1,
    bw: c.load?.bw, machine: c.machine, custom: true, ...(c.met ? { met: c.met } : {}), ...(c.min ? { min: c.min } : {}),
  } as ForgeExercise;
}

export function catalog(s: Pick<ForgeState, 'customExercises'>): Record<string, ForgeExercise> {
  const out: Record<string, ForgeExercise> = { ...BASE_BY_ID };
  for (const c of s.customExercises || []) if (c?.id && !out[c.id]) out[c.id] = customToForge(c);
  return out;
}

// ─── Carga ───

const bodyOf = (s: { bodyKg?: number | null }) => s.bodyKg || 70; // igual que el HTML (effLoadKg)
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Ayuda de una banda (kg aprox.). */
export const bandKg = (id?: string) => BANDS.find((b) => b.id === id)?.kg ?? 0;

/**
 * Kilos que se mueven por repetición (para gasto, fuerza y volumen).
 * Mancuernas: el peso de UNA (los estándares de fuerza con mancuernas son por mancuerna).
 */
export function effKg(s: { bodyKg?: number | null }, ex: ForgeExercise, set: FSet): number {
  const body = set.body ?? bodyOf(s);
  const share = ex.bw ?? ex.load?.bw ?? 0;
  switch (ex.eq) {
    case 'bw': return r1(body * share + (set.kg || 0));
    case 'asist': return r1(Math.max(0, body * share - toKg(set.assist || 0, set.unit)));
    case 'banda': return r1(Math.max(0, body * share - (set.assist ?? bandKg(set.band))));
    case 'maq': case 'polea': return r1(toKg(set.kg || 0, set.unit));
    case 'iso': case 'cardio': return r1(body * share);
    default: return r1(set.kg || 0);
  }
}

/** ¿La serie es «sin ayuda»? (dominada estricta: ni asistencia ni banda) */
export const isStrict = (ex: ForgeExercise, set: FSet) => ex.eq !== 'asist' && ex.eq !== 'banda' && !(set.assist && set.assist > 0);

// ─── Los campos viejos (RPG y HTML) salen de las series ───

const workSets = (sets: FSet[] | undefined) => (sets || []).filter((x) => !x.warmup);

/** Peso «actual» de un ejercicio para el RPG (lo que el HTML guardaba en `weights`). */
function rpgWeight(s: ForgeState, ex: ForgeExercise, set: FSet): number | null {
  if (BASE_BY_ID[ex.id] && !ex.isNew && ex.load?.db) return set.kg ?? 0;          // mancuernas de siempre: igual que el HTML
  if (ex.load?.bw != null && !ex.isNew) return set.kg && set.kg > 0 ? r1(effKg(s, ex, set)) : null; // peso corporal: solo con lastre
  if (ex.load?.db) return Math.round(effKg(s, ex, set) * (ex.rpgK ?? 1) * 2) / 2;  // nuevos con carga
  return null;
}

/** Recalcula `training`, `trainMeta` y los «últimos» `weights`/`reps` de un día a partir de sus series. */
export function syncLegacyDay(s: ForgeState, day: string): ForgeState {
  const cat = catalog(s);
  const sess = s.sessions[day] || {};
  const training = { ...(s.training || {}) };
  const trainMeta = { ...(s.trainMeta || {}) };
  const tDay: Record<string, number> = {};
  const mDay: Record<string, any> = {};
  for (const [id, sets] of Object.entries(sess)) {
    const w = workSets(sets);
    if (!w.length) continue;
    tDay[id] = w.length;
    const ex = cat[id];
    const last = w[w.length - 1];
    const kg = !ex ? (last.kg || 0) : ex.load?.db && !ex.isNew ? (last.kg || 0) : Math.round(ex ? effKg(s, ex, last) : 0);
    mDay[id] = { sets: w.map((x) => x.reps), kg, unit: ex?.unit === 'seg' ? 's' : '' };
  }
  if (Object.keys(tDay).length) training[day] = tDay; else delete training[day];
  if (Object.keys(mDay).length) trainMeta[day] = mDay; else delete trainMeta[day];
  return { ...s, training, trainMeta };
}

/** La carga con que el RPG cuenta una serie (lo que el HTML llamaba effLoadKg, pero de ESA serie). */
function rpgLoadOf(s: ForgeState, ex: ForgeExercise, set: FSet): number {
  if (set.rpgKg != null) return set.rpgKg;
  return Math.max(1, effKg(s, ex, set) * (ex.rpgK ?? 1));
}

const viewCache = new WeakMap<object, ForgeState>();

/**
 * Lo que ve el RPG (forgeLegacy). En el HTML el XP de TODO el historial se calculaba con el peso y las reps «actuales»
 * de cada ejercicio: anotar una serie más liviana bajaba el XP de todo lo anterior. Acá cada serie cuenta con SU carga y
 * SUS reps: se agrupan como ejercicios «virtuales» (`jalon@54,4@9`) para que las MISMAS fórmulas del HTML (XP,
 * intensidad, músculos, Arena) las sumen tal cual. Lo migrado trae `rpgKg`/`rpgReps` = lo que usaba el HTML, así que
 * al migrar todo da igual al peso. No se guarda.
 */
export function rpgView(s: ForgeState): ForgeState {
  const hit = viewCache.get(s);
  if (hit) return hit;
  const cat = catalog(s);
  const custom: any[] = [...(s.customExercises || [])];
  const seen = new Set(custom.map((c: any) => c.id));
  const weights: Record<string, number> = { ...(s.weights || {}) };
  const reps: Record<string, number> = { ...(s.reps || {}) };
  const training: Record<string, Record<string, number>> = {};
  const days = new Set([...Object.keys(s.training || {}), ...Object.keys(s.sessions || {})]);
  for (const day of days) {
    const sess = (s.sessions || {})[day];
    const out: Record<string, number> = {};
    if (!sess) { Object.assign(out, (s.training || {})[day] || {}); training[day] = out; continue; }
    for (const [exId, sets] of Object.entries(sess)) {
      const ex = cat[exId];
      const work = workSets(sets);
      if (!work.length) continue;
      if (!ex) { out[exId] = (out[exId] || 0) + work.length; continue; } // ejercicio borrado: el HTML lo ignoraba igual
      const energy = L.exEnergy(s, exId);
      for (const set of work) {
        const kg = rpgLoadOf(s, ex, set);
        const r = set.rpgReps ?? set.reps + (set.tail?.reps ?? 0); // el remate también es trabajo
        // lo migrado cuenta con la intensidad del HTML al migrar; lo nuevo, con la de cada serie
        const vm = set.rpgKg != null ? null : Math.round(setIntensityMult(kg, set.body ?? (s.bodyKg || 70)) * 1000) / 1000;
        const vid = `${exId}@${kg}@${r}${vm == null ? '' : `@${vm}`}`;
        if (!seen.has(vid)) {
          seen.add(vid);
          custom.push({ id: vid, name: ex.name, group: ex.group, m: ex.m, load: { db: true }, reps: r, met: energy.met, min: energy.min, ...(ex.unit ? { unit: 'seg' } : {}), ...(vm == null ? {} : { vm }) });
          weights[vid] = kg;
          reps[vid] = r;
        }
        out[vid] = (out[vid] || 0) + 1;
      }
    }
    training[day] = out;
  }
  // el XP de las habilidades nuevas dominadas (fase I9) entra como XP ya ganado: nivel, rango y Arena lo cuentan igual
  const v = { ...s, customExercises: custom, training, weights, reps, bankedXp: (s.bankedXp || 0) + extSkillXp(s), __rpgView: true };
  viewCache.set(s, v);
  return v;
}

/** XP de entrenamiento de un día (el Diario y el Libro del HTML), con cada serie con su carga. */
export function dayTrainXp(s: ForgeState, day: string): number {
  const v = rpgView(s);
  const byId = L.exCatalog(v).byId;
  const M = v.xpMult ?? L.intensityMult(v);
  let xp = 0;
  for (const [id, cnt] of Object.entries(v.training[day] || {})) {
    const ex = byId[id];
    if (ex && cnt) xp += cnt * L.workOfSet(v, ex) * L.GEN_WORK_FACTOR * (ex.vm ?? M);
  }
  return Math.round(xp);
}


// ─── Estado ───

/** Como lo carga el HTML (defaultState + lo guardado), más lo nuevo. */
export function hydrate(raw: any): ForgeState {
  const d = L.defaultState();
  const p = raw && typeof raw === 'object' ? raw : {};
  const s: any = {
    ...d, ...p,
    counters: { ...d.counters, ...(p.counters || {}) },
    skills: p.skills || {}, training: p.training || {}, customExercises: p.customExercises || [], weights: p.weights || {},
    bodyKg: p.bodyKg ?? null, heightCm: p.heightCm ?? null, age: p.age ?? null, sex: p.sex ?? null,
    activity: p.activity ?? 1.375, goal: p.goal ?? null, title: p.title ?? null, dungeons: p.dungeons || {},
    reps: p.reps || {}, plan: p.plan || {},
  };
  s.sessions = p.sessions && typeof p.sessions === 'object' ? p.sessions : null;
  s.gym = p.gym ?? null;
  if (!s.sessions) {
    // Migración: la intensidad con que el HTML multiplicaba el XP de entrenamiento queda fija para lo migrado
    s.xpMult = L.intensityMult(s);
    s.sessions = sessionsFromLegacy(s);
  }
  s.version = Math.max(STATE_VERSION, Number(p.version) || 0);
  return s as ForgeState;
}

/**
 * De lo que guardaba el HTML a series: `trainMeta` tenía las reps de cada serie y un peso por ejercicio y día; sin
 * `trainMeta`, las series con las reps y el peso actuales (lo mismo que usa el HTML para el XP).
 */
export function sessionsFromLegacy(s: any): Sessions {
  const out: Sessions = {};
  const cat = catalog(s);
  for (const [day, exs] of Object.entries(s.training || {})) {
    for (const [id, cnt] of Object.entries((exs as Record<string, number>) || {})) {
      const n = Math.max(0, Math.round(Number(cnt) || 0));
      if (!n) continue;
      const meta = ((s.trainMeta || {})[day] || {})[id];
      const ex = cat[id];
      const metaSets: number[] = Array.isArray(meta?.sets) ? meta.sets : meta?.reps != null ? [meta.reps] : [];
      const repsDefault = (s.reps || {})[id] ?? ex?.reps ?? 10;
      // Lo que usaba el HTML para el XP (las reps y la carga «actuales» del ejercicio): así el XP migrado queda igual
      const lx = L.exCatalog(s).byId[id];
      const rpg = lx ? { rpgReps: L.repsOf(s, lx), rpgKg: L.effLoadKg(s, lx) } : {};
      const sets: FSet[] = [];
      for (let i = 0; i < n; i++) {
        const set: FSet = { reps: Number(metaSets[i] ?? metaSets[metaSets.length - 1] ?? repsDefault) || repsDefault, legacy: true, ...rpg };
        if (ex?.load?.db) {
          const kg = meta?.kg != null ? Number(meta.kg) : (s.weights || {})[id];
          if (kg) set.kg = kg;
        }
        sets.push(set);
      }
      (out[day] ||= {})[id] = sets;
    }
  }
  return out;
}

/** El paso de día que hacía el HTML al abrir (lo de ayer al registro, la racha se corta si no se reclamó ayer). */
export function rollover(s: ForgeState): ForgeState {
  const tk = L.todayKey();
  if (s.today?.dayKey === tk) return s;
  const prev = s.today;
  const out: any = { ...s };
  out.bankedXp = s.bankedXp + L.todayXp(prev);
  const c = { ...s.counters };
  if (prev.workout) c.workouts++;
  if ((prev.sleep || 0) >= L.SLEEP_THRESHOLD) c.sleepDays++;
  if ((prev.steps || 0) >= L.STEPS_THRESHOLD) c.stepDays++;
  if (prev.claimed) c.daysActive++;
  out.counters = c;
  out.log = [{ ...prev, day: prev.dayKey, xp: L.todayXp(prev), missions: L.missionsDone(prev), claimed: prev.claimed }, ...(s.log || [])].slice(0, 30);
  if (s.lastClaimedDay !== L.prevKey(tk)) out.streak = 0;
  out.today = L.freshToday(tk);
  return out;
}

export function newState(): ForgeState {
  return hydrate(L.defaultState());
}

// ─── Series ───

/** Anota una serie. Hoy también cumple la misión de entrenar; un día pasado la marca en su registro (como el HTML). */
export function logSet(s: ForgeState, day: string, exId: string, set: FSet): ForgeState {
  // Tu peso de ese día queda en la serie: la carga en peso corporal, la intensidad y la fuerza relativa no cambian después
  const clean: FSet = { ...set, at: set.at ?? L.forgeNow().getTime(), ...(set.body == null && s.bodyKg ? { body: s.bodyKg } : {}) };
  delete clean.rpgKg; delete clean.rpgReps; delete clean.legacy;
  const sets = [...((s.sessions[day] || {})[exId] || []), clean];
  let next: ForgeState = { ...s, sessions: { ...s.sessions, [day]: { ...(s.sessions[day] || {}), [exId]: sets } } };
  next = rememberLast(next, exId, set);
  next = syncLegacyDay(next, day);
  if (!set.warmup) next = markWorkout(next, day);
  return next;
}

export function updateSet(s: ForgeState, day: string, exId: string, idx: number, patch: Partial<FSet>): ForgeState {
  const cur = (s.sessions[day] || {})[exId] || [];
  if (idx < 0 || idx >= cur.length) return s;
  const sets = cur.map((x, i) => (i === idx ? { ...x, ...patch, legacy: undefined, rpgKg: undefined, rpgReps: undefined } : x));
  let next: ForgeState = { ...s, sessions: { ...s.sessions, [day]: { ...(s.sessions[day] || {}), [exId]: sets } } };
  if (idx === cur.length - 1) next = rememberLast(next, exId, sets[idx]);
  return syncLegacyDay(next, day);
}

export function removeSet(s: ForgeState, day: string, exId: string, idx: number): ForgeState {
  const cur = (s.sessions[day] || {})[exId] || [];
  if (idx < 0 || idx >= cur.length) return s;
  const sets = cur.filter((_, i) => i !== idx);
  const dayS = { ...(s.sessions[day] || {}) };
  if (sets.length) dayS[exId] = sets; else delete dayS[exId];
  const sessions = { ...s.sessions };
  if (Object.keys(dayS).length) sessions[day] = dayS; else delete sessions[day];
  return syncLegacyDay({ ...s, sessions }, day);
}

/** Lo último usado queda como «actual» (el selector parte de ahí; el RPG lo usa como el HTML). */
function rememberLast(s: ForgeState, exId: string, set: FSet): ForgeState {
  const ex = catalog(s)[exId];
  if (!ex || set.warmup) return s;
  const weights = { ...(s.weights || {}) };
  const w = rpgWeight(s, ex, set);
  if (w == null) delete weights[exId]; else weights[exId] = w;
  const reps = { ...(s.reps || {}), [exId]: set.reps };
  const last = { ...(s.lastLoad || {}), [exId]: { kg: set.kg, unit: set.unit, assist: set.assist, band: set.band, reps: set.reps, rir: set.rir } };
  return { ...s, weights, reps, lastLoad: last };
}

/** La última serie de trabajo de un ejercicio (para «+ Serie» y para partir el selector). */
export function lastSetOf(s: ForgeState, exId: string, beforeDay?: string): FSet | null {
  const days = Object.keys(s.sessions).filter((d) => !beforeDay || d < beforeDay).sort().reverse();
  for (const d of days) {
    const w = workSets(s.sessions[d][exId]);
    if (w.length) return w[w.length - 1];
  }
  return null;
}

/** Entrenar cumple la misión del día (antes había que marcarla a mano). Un día pasado: igual que logExercise del HTML. */
function markWorkout(s: ForgeState, day: string): ForgeState {
  const tk = L.todayKey();
  if (day === tk) {
    if (s.today.workout) return s;
    return L.applyClaim({ ...s, today: { ...s.today, workout: true } }) as ForgeState;
  }
  const log = (s.log || []).map((e: any) => ({ ...e }));
  const idx = log.findIndex((e: any) => e.day === day);
  if (idx < 0 || log[idx].workout) return s;
  const before = log[idx];
  const oldXp = before.xp != null ? before.xp : L.todayXp(before);
  const upd: any = { ...before, workout: true };
  upd.xp = L.todayXp(upd);
  upd.missions = L.missionsDone(upd);
  upd.claimed = before.claimed || upd.missions >= L.MISSIONS_TO_CLAIM;
  const c = { ...s.counters };
  if (!before.claimed && upd.claimed) c.daysActive = (c.daysActive || 0) + 1;
  log[idx] = upd;
  return { ...s, log, bankedXp: s.bankedXp + (upd.xp - oldXp), counters: c };
}

// ─── Lo demás del HTML, igual ───

export function toggleMission(s: ForgeState, key: string): ForgeState {
  if (['steps', 'sleep', 'water', 'meals'].includes(key)) return s;
  return L.applyClaim({ ...s, today: { ...s.today, [key]: !s.today[key] } }) as ForgeState;
}

export function setMissionCount(s: ForgeState, key: string, value: number): ForgeState {
  return L.applyClaim({ ...s, today: { ...s.today, [key]: value } }) as ForgeState;
}

/** Editar un día pasado (o hoy) del Diario: misiones y su XP, como patchDayField del HTML. */
export function patchDayField(s: ForgeState, dayKey: string, field: string, value: any): ForgeState {
  const tk = L.todayKey();
  if (dayKey === tk) return { ...s, today: { ...s.today, [field]: value } };
  const log = (s.log || []).map((e: any) => ({ ...e }));
  let idx = log.findIndex((e: any) => e.day === dayKey);
  if (idx < 0) {
    const hasTraining = Object.keys((s.training || {})[dayKey] || {}).length > 0;
    const seed: any = { ...L.freshToday(dayKey), day: dayKey, workout: hasTraining };
    seed.xp = L.todayXp(seed);
    seed.missions = L.missionsDone(seed);
    seed.claimed = seed.missions >= L.MISSIONS_TO_CLAIM;
    log.push(seed);
    idx = log.length - 1;
  }
  const before = log[idx];
  const oldXp = before.xp != null ? before.xp : L.todayXp(before);
  const wasClaimed = !!before.claimed;
  const updated: any = { ...before, [field]: value };
  const newXp = L.todayXp(updated);
  const newMissions = L.missionsDone(updated);
  const nowClaimed = wasClaimed || newMissions >= L.MISSIONS_TO_CLAIM;
  updated.xp = newXp; updated.missions = newMissions; updated.claimed = nowClaimed;
  log[idx] = updated;
  const c = { ...s.counters };
  if (!wasClaimed && nowClaimed) c.daysActive = (c.daysActive || 0) + 1;
  return { ...s, log, bankedXp: s.bankedXp + (newXp - oldXp), counters: c };
}

export function addPastDay(s: ForgeState, dayKey: string): ForgeState {
  const tk = L.todayKey();
  if (!dayKey || dayKey >= tk || (s.log || []).some((e: any) => e.day === dayKey)) return s;
  const entry = { ...L.freshToday(dayKey), day: dayKey, xp: 0, missions: 0, claimed: false };
  return { ...s, log: [entry, ...(s.log || [])].sort((a: any, b: any) => b.day.localeCompare(a.day)).slice(0, 60) };
}

export function toggleClass(s: ForgeState, id: string): ForgeState {
  const cur: string[] = s.classes || [];
  if (cur.includes(id)) return { ...s, classes: cur.filter((c) => c !== id) };
  if (cur.length >= 2) return { ...s, classes: [cur[1], id] };
  return { ...s, classes: [...cur, id] };
}

export function toggleStep(s: ForgeState, skId: string, idx: number): ForgeState {
  const sk = skillById(skId);
  if (!sk) return s;
  const arr = (s.skills?.[skId]?.steps || sk.steps.map(() => false)).slice();
  arr[idx] = !arr[idx];
  return { ...s, skills: { ...(s.skills || {}), [skId]: { ...(s.skills?.[skId] || {}), steps: arr } } };
}

export function masterSkill(s: ForgeState, skId: string): ForgeState {
  const sk = skillById(skId);
  if (!sk) return s;
  return { ...s, skills: { ...(s.skills || {}), [skId]: { ...(s.skills?.[skId] || {}), steps: sk.steps.map(() => true) } } };
}

export const setTitle = (s: ForgeState, id: string): ForgeState => ({ ...s, title: s.title === id ? null : id });

export function togglePlan(s: ForgeState, exId: string): ForgeState {
  const p = { ...(s.plan || {}) };
  if (p[exId]) delete p[exId]; else p[exId] = 3;
  return { ...s, plan: p };
}
export function setPlanTarget(s: ForgeState, exId: string, delta: number): ForgeState {
  const p = { ...(s.plan || {}) };
  if (p[exId] == null) return s;
  p[exId] = Math.max(1, Math.min(12, p[exId] + delta));
  return { ...s, plan: p };
}
export const clearPlan = (s: ForgeState): ForgeState => ({ ...s, plan: {} });

// ─── Remate y ejercicios unidos ───

/** Lo que se juntó en una serie con remate no vuelve al plan cuando se carga un día de la rutina o se repite un día. */
export function dropJoined<T>(s: ForgeState, plan: Record<string, number>, targets?: Record<string, T>): void {
  for (const [main, t] of Object.entries(s.tailPlan || {})) {
    if (!t.replaces || plan[main] == null || plan[t.replaces] == null) continue;
    plan[main] = Math.max(plan[main], plan[t.replaces]);
    delete plan[t.replaces];
    if (targets) delete targets[t.replaces];
  }
}

/** ¿Hay en el plan un ejercicio y sus negativas como dos líneas? Se ofrece juntarlos (dom_prona + dom_negativa). */
export function joinOffer(s: ForgeState): { main: string; tail: string } | null {
  const cat = catalog(s);
  const ids = Object.keys(s.plan || {}).filter((id) => cat[id]);
  for (const tail of ids) {
    if (!/negativ/i.test(`${tail} ${cat[tail].name}`)) continue;
    const main = ids.find((id) => id !== tail && cat[id].pattern === cat[tail].pattern && !/negativ/i.test(`${id} ${cat[id].name}`));
    if (main && !s.tailPlan?.[main] && !(s.tailDismissed || []).includes(main)) return { main, tail };
  }
  return null;
}

/** Junta dos líneas del plan en una serie con remate. El descanso que dejaste para cualquiera de las dos queda en la principal. */
export function joinAsTail(s: ForgeState, main: string, tail: string, kind: TailKind = 'neg'): ForgeState {
  const plan = { ...(s.plan || {}) };
  if (plan[main] == null) plan[main] = plan[tail] ?? 3;
  plan[main] = Math.max(plan[main], plan[tail] ?? 0);
  delete plan[tail];
  const prefs = { ...(s.restPrefs || {}) };
  const pref = Math.max(prefs[main] ?? 0, prefs[tail] ?? 0);
  if (pref) prefs[main] = pref;
  const planDay = (s as any).planDay;
  const targets = planDay?.targets ? { ...planDay.targets } : null;
  if (targets) delete targets[tail];
  return { ...s, plan, restPrefs: prefs, tailPlan: { ...(s.tailPlan || {}), [main]: { kind, replaces: tail } }, ...(targets ? { planDay: { ...planDay, targets } } : {}) } as ForgeState;
}

/** Deshace lo anterior: vuelven a ser dos líneas. */
export function splitTail(s: ForgeState, main: string): ForgeState {
  const t = s.tailPlan?.[main];
  if (!t) return s;
  const tailPlan = { ...s.tailPlan };
  delete tailPlan[main];
  const plan = { ...(s.plan || {}) };
  if (t.replaces && plan[main] != null) plan[t.replaces] = plan[main];
  return { ...s, plan, tailPlan, tailDismissed: [...(s.tailDismissed || []).filter((x) => x !== main), main] };
}

/** «Ahora no» a juntarlos: no se vuelve a ofrecer para ese ejercicio. */
export const dismissJoin = (s: ForgeState, main: string): ForgeState => ({ ...s, tailDismissed: [...(s.tailDismissed || []).filter((x) => x !== main), main] });

// ─── Series antiguas que en verdad fueron con ayuda ───
// Lo migrado del HTML guardaba solo las repeticiones: la ayuda de la máquina se perdió y esas series quedaron como estrictas,
// con récords y pasos del árbol que no eran (el fundador, 2026-11-06: «10, 10, 6» con 18 kg de ayuda; su máximo real era 6).

const claveAyuda = (day: string, exId: string) => `${day}:${exId}`;

/** La primera serie antigua sospechosa: de peso corporal, sin carga, y 2 reps o más por sobre tu mejor marca anotada después. */
export function assistOffer(s: ForgeState): { day: string; exId: string; toId: string; reps: number[]; best: number } | null {
  const cat = catalog(s);
  const dias = Object.keys(s.sessions || {}).sort();
  for (const day of dias) {
    for (const [exId, sets] of Object.entries(s.sessions[day] || {})) {
      const ex = cat[exId];
      if (ex?.eq !== 'bw' || (s.assistChecked || []).includes(claveAyuda(day, exId))) continue;
      const toId = (ex.alt || []).find((id) => cat[id]?.eq === 'asist');
      const viejas = workSets(sets).filter((x) => x.legacy && !x.kg && !x.assist);
      if (!toId || !viejas.length) continue;
      let best = 0;
      for (const d of dias) for (const x of workSets(s.sessions[d][exId])) if (!x.legacy && x.reps > best) best = x.reps;
      if (best && Math.max(...viejas.map((x) => x.reps)) >= best + 2) return { day, exId, toId, reps: viejas.map((x) => x.reps), best };
    }
  }
  return null;
}

/** «Sí, fueron con ayuda»: esas series pasan al ejercicio asistido, con su ayuda. El XP de entonces no cambia. */
export function markAssisted(s: ForgeState, day: string, exId: string, toId: string, assist: number): ForgeState {
  const dia = (s.sessions || {})[day];
  if (!dia?.[exId]) return s;
  const esVieja = (x: FSet) => !x.warmup && !!x.legacy && !x.kg && !x.assist;
  const movidas = dia[exId].filter(esVieja).map((x) => ({ ...x, assist }));
  const quedan = dia[exId].filter((x) => !esVieja(x));
  const nuevo: Record<string, FSet[]> = { ...dia, [toId]: [...(dia[toId] || []), ...movidas] };
  if (quedan.length) nuevo[exId] = quedan; else delete nuevo[exId];
  return syncLegacyDay({ ...s, sessions: { ...s.sessions, [day]: nuevo }, assistChecked: [...(s.assistChecked || []), claveAyuda(day, exId)] }, day);
}

/** «No, fueron sin ayuda»: no se vuelve a preguntar por ese día. */
export const dismissAssist = (s: ForgeState, day: string, exId: string): ForgeState => ({ ...s, assistChecked: [...(s.assistChecked || []), claveAyuda(day, exId)] });

/** Une A con B (sin descanso entre ellos), o los separa si ya estaban unidos. */
export function toggleLink(s: ForgeState, a: string, b: string): ForgeState {
  const links = { ...(s.planLinks || {}) };
  if (links[a] === b) delete links[a];
  else {
    for (const k of Object.keys(links)) if (links[k] === b) delete links[k];
    links[a] = b;
  }
  return { ...s, planLinks: links };
}

/** Los ejercicios unidos con este, en orden (solo los que están en el plan). Sin unir: él solo. */
export function linkChain(s: ForgeState, exId: string): string[] {
  const links = s.planLinks || {};
  const plan = s.plan || {};
  if (plan[exId] == null) return [exId];
  let first = exId;
  const vistos = new Set([exId]);
  for (;;) {
    const prev = Object.keys(links).find((k) => links[k] === first && plan[k] != null);
    if (!prev || vistos.has(prev)) break;
    vistos.add(prev);
    first = prev;
  }
  const out = [first];
  let cur = first;
  while (links[cur] && plan[links[cur]] != null && !out.includes(links[cur])) { cur = links[cur]; out.push(cur); }
  return out;
}

/** El plan que arma Eris (TrainingPlanTool): idempotente, no duplica ejercicios. Igual que el puente del HTML. */
export function applyPlan(s: ForgeState, payload: any): ForgeState {
  if (!payload) return s;
  const customExercises = [...(s.customExercises || [])];
  const plan = { ...(s.plan || {}) };
  for (const ex of payload.newExercises || []) {
    if (!ex || !ex.name) continue;
    const existing = customExercises.find((c: any) => (c.name || '').trim().toLowerCase() === ex.name.trim().toLowerCase());
    let targetId = ex.id;
    if (existing) targetId = existing.id; else customExercises.push(ex);
    if (ex.targetSets) plan[targetId] = Math.max(1, Math.min(12, ex.targetSets));
  }
  for (const e of payload.exercises || []) {
    if (!e || !e.id) continue;
    plan[e.id] = Math.max(1, Math.min(12, e.targetSets || 3));
  }
  return { ...s, customExercises, plan };
}

type BodyField = 'bodyKg' | 'heightCm' | 'age' | 'sex';
export function setBody(s: ForgeState, field: BodyField, v: any): ForgeState {
  if (field === 'sex') return { ...s, sex: v };
  if (v == null) return { ...s, [field]: null };
  const lim: Record<string, [number, number]> = { bodyKg: [30, 250], heightCm: [100, 250], age: [12, 100] };
  const [lo, hi] = lim[field];
  return { ...s, [field]: Math.min(hi, Math.max(lo, Number(v))) };
}
export const setActivity = (s: ForgeState, v: number): ForgeState => ({ ...s, activity: v, activityMode: 'manual' });
export const setActivityAuto = (s: ForgeState): ForgeState => ({ ...s, activityMode: 'auto' });
export const setGoal = (s: ForgeState, v: any): ForgeState => ({ ...s, goal: v });

export const addCustomExercise = (s: ForgeState, ex: any): ForgeState => ({ ...s, customExercises: [...(s.customExercises || []), ex] });
export function removeCustomExercise(s: ForgeState, id: string): ForgeState {
  const sessions: Sessions = {};
  for (const [d, exs] of Object.entries(s.sessions)) {
    const { [id]: _gone, ...rest } = exs;
    if (Object.keys(rest).length) sessions[d] = rest;
  }
  const tr = { ...(s.training || {}) };
  for (const d of Object.keys(tr)) if (tr[d][id]) { const nd = { ...tr[d] }; delete nd[id]; tr[d] = nd; }
  return { ...s, sessions, training: tr, customExercises: (s.customExercises || []).filter((c: any) => c.id !== id) };
}

/** Pasos, sueño, actividad del reloj y nivel automático que manda el teléfono (applyLiveData del HTML). */
export function applyLiveData(s: ForgeState, data: any): ForgeState {
  const steps = data?.steps ?? 0;
  const sleep = data?.sleep ?? 0;
  const watch = data && data.activity ? data.activity : s.today.watch || null;
  const autoLevel = data && data.activityLevel !== undefined ? data.activityLevel : s.autoLevel || null;
  if (s.today.steps === steps && s.today.sleep === sleep && JSON.stringify(s.today.watch || null) === JSON.stringify(watch)
    && JSON.stringify(s.autoLevel || null) === JSON.stringify(autoLevel)) return s;
  // Si con los pasos o el sueño ya se cumplen las misiones, el día queda conquistado (en el HTML solo se reclamaba al
  // tocar una misión, así que «2/3» podía quedar sin conquistar y cortar la racha; 2026-10-17)
  return L.applyClaim({ ...s, autoLevel, today: { ...s.today, steps, sleep, watch } }) as ForgeState;
}

export const setGym = (s: ForgeState, gym: Gym): ForgeState => ({ ...s, gym });
const DEFAULT_GYM = defaultGym();
/** «Mi gimnasio» (sin configurar: un gimnasio típico; siempre el mismo objeto, para no recalcular selectores). */
export const gymOf = (s: ForgeState): Gym => s.gym ?? DEFAULT_GYM;

// ─── Lo que muestra la pantalla (el RPG con las fórmulas del HTML) ───

export interface RpgSummary {
  totalXp: number; level: number; xpInLevel: number; xpForNext: number; rank: { name: string; tag: string };
  tier: string; missionsDone: number; claimed: boolean; mastered: number;
}
export function rpgSummary(s: ForgeState): RpgSummary {
  const v = rpgView(s);
  const totalXp = L.getTotalXp(v);
  const { level, xpInLevel, xpForNext } = L.computeLevel(totalXp);
  return {
    totalXp, level, xpInLevel, xpForNext, rank: L.rankFor(level), tier: L.tierFor(level),
    missionsDone: L.missionsDone(s.today), claimed: !!s.today.claimed,
    mastered: L.SKILLS.filter((sk: any) => L.isMastered(s, sk.id)).length + extMastered(s),
  };
}

export const groupLevels = (s: ForgeState) => L.groupLevels(rpgView(s));
/** Cuántas habilidades hay en total (las 79 del HTML y las nuevas). */
export const SKILL_COUNT: number = L.SKILLS.length + EXT_SKILLS.length;
export { skillById, isMasteredAny };
export const combatStats = (s: ForgeState) => L.combatStats(rpgView(s));
export const routineIntensity = (s: ForgeState) => L.routineIntensity(rpgView(s));
export const earnedTitles = (s: ForgeState) => L.earnedTitles(rpgView(s));

/** XP que suma una serie (el aviso «+N»): lo que sube el XP de entrenamiento al anotarla. */
export function setXpGain(before: ForgeState, after: ForgeState): number {
  return Math.max(1, L.trainXpOf(rpgView(after)) - L.trainXpOf(rpgView(before)));
}

// ─── Arena (las mismas peleas del HTML; el azar entra como parámetro para poder probarlo) ───

export interface Fight {
  mode: 'dungeon' | 'enemy'; dungeonId?: string; idx?: number; enemy?: any;
  enemyHp: number; enemyMax: number; playerHp: number; playerMax: number;
  log: string[]; cooldowns: Record<string, number>; over: boolean; win: boolean; turn: 'player' | 'enemy';
}
export interface FightStep { fight: Fight | null; xp: number; dungeonDone?: string }

export function startDungeon(s: ForgeState, dgId: string): Fight | null {
  const dg = L.DUNGEONS.find((d: any) => d.id === dgId);
  if (!dg) return null;
  const cs = combatStats(s);
  const m = dg.monsters[0];
  return { mode: 'dungeon', dungeonId: dgId, idx: 0, enemyHp: m.hp, enemyMax: m.hp, playerHp: cs.maxHp, playerMax: cs.maxHp, log: [`Entras a ${dg.name}. Aparece ${m.name}.`], cooldowns: {}, over: false, win: false, turn: 'player' };
}

export function startEnemy(s: ForgeState, en: any): Fight {
  const cs = combatStats(s);
  return { mode: 'enemy', enemy: en, enemyHp: en.hp, enemyMax: en.hp, playerHp: cs.maxHp, playerMax: cs.maxHp, log: [`¡Aparece ${en.name}!`], cooldowns: {}, over: false, win: false, turn: 'player' };
}

function enemyTurn(f: Fight, cs: any, rnd: () => number): Fight {
  const m = L.monsterOf(f);
  if (rnd() < cs.eva) return { ...f, log: [`🌀 ¡Esquivaste el golpe de ${m.name}! (EVA)`, ...f.log].slice(0, 6), turn: 'player' };
  const dmg = Math.max(1, Math.round(m.atk * (0.8 + rnd() * 0.4)) - cs.def);
  let php = Math.max(0, f.playerHp - dmg);
  const log = [`${m.name} te golpea: -${dmg} HP.`, ...f.log].slice(0, 6);
  if (php <= 0) return { ...f, playerHp: 0, log: [`Caíste ante ${m.name}. Entrena y vuelve más fuerte.`, ...log].slice(0, 6), over: true, win: false, turn: 'player' };
  if (cs.vigor > 0 && php < f.playerMax) {
    const healed = Math.min(cs.vigor, f.playerMax - php);
    php += healed;
    return { ...f, playerHp: php, log: [`💚 Recuperas +${healed} HP (Vigor).`, ...log].slice(0, 6), turn: 'player' };
  }
  return { ...f, playerHp: php, log, turn: 'player' };
}

function afterKill(f: Fight, extraLog: string[]): FightStep {
  if (f.mode === 'enemy') {
    const rw = f.enemy.xp != null ? f.enemy.xp : 20;
    return { fight: { ...f, enemyHp: 0, log: [`¡Victoria! Ganas +${rw} XP.`, ...extraLog].slice(0, 6), over: true, win: true }, xp: rw };
  }
  const dg = L.DUNGEONS.find((d: any) => d.id === f.dungeonId);
  const nextIdx = (f.idx ?? 0) + 1;
  if (nextIdx >= dg.monsters.length) {
    return { fight: { ...f, enemyHp: 0, log: [`¡Derrotaste al jefe! Mazmorra conquistada (+60 XP).`, ...extraLog].slice(0, 6), over: true, win: true }, xp: 60, dungeonDone: dg.id };
  }
  const nm = dg.monsters[nextIdx];
  return { fight: { ...f, idx: nextIdx, enemyHp: nm.hp, enemyMax: nm.hp, log: [`¡Derrotado! Aparece ${nm.name}.`, ...extraLog].slice(0, 6), turn: 'player' }, xp: 0 };
}

/** Un ataque (normal o especial) y la respuesta del enemigo. `rnd` = Math.random en la app. */
export function attack(s: ForgeState, fight: Fight, special: any | null, rnd: () => number = Math.random): FightStep {
  if (!fight || fight.over || fight.turn !== 'player') return { fight, xp: 0 };
  const cs = combatStats(s);
  const f: Fight = { ...fight, cooldowns: { ...fight.cooldowns } };
  let dmg: number, label: string, dodge = false;
  const isCrit = rnd() < cs.crit;
  if (special) {
    if ((f.cooldowns[special.skill] || 0) > 0) return { fight, xp: 0 };
    const base = cs.atk * special.mult * (0.5 + special.power / 20);
    const hits = special.hits || 1;
    dmg = Math.round(base * hits * (isCrit ? cs.critDmg : 1));
    label = `${special.emoji} ${special.name}${hits > 1 ? ` x${hits}` : ''}: -${dmg}${isCrit ? ' ¡CRÍTICO!' : ''}`;
    f.cooldowns[special.skill] = 3;
    dodge = !!special.dodge;
  } else {
    dmg = Math.round(cs.atk * (0.85 + rnd() * 0.3) * (isCrit ? cs.critDmg : 1));
    label = `Golpeas: -${dmg}${isCrit ? ' ¡CRÍTICO!' : ''}`;
  }
  const ehp = Math.max(0, f.enemyHp - dmg);
  f.log = [label, ...f.log].slice(0, 6);
  f.enemyHp = ehp;
  for (const k of Object.keys(f.cooldowns)) if (k !== (special && special.skill)) f.cooldowns[k] = Math.max(0, (f.cooldowns[k] || 0) - 1);
  if (ehp <= 0) return afterKill(f, f.log);
  if (dodge) return { fight: { ...f, log: [`Esquivas el contraataque.`, ...f.log].slice(0, 6), turn: 'player' }, xp: 0 };
  return { fight: enemyTurn(f, cs, rnd), xp: 0 };
}

/** Lo que gana la pelea va al estado (XP y mazmorra conquistada). */
export function applyFightReward(s: ForgeState, step: FightStep): ForgeState {
  if (!step.xp && !step.dungeonDone) return s;
  const dungeons = step.dungeonDone ? { ...(s.dungeons || {}), [step.dungeonDone]: true } : s.dungeons;
  return { ...s, bankedXp: (s.bankedXp || 0) + step.xp, dungeons };
}

// ─── Guardar y respaldar con las claves del HTML ───

/** Las claves que entiende el HTML y el respaldo del PC (`toji-rpg-v1`, `toji-routine-md`). */
export function toTojiKeys(s: ForgeState, routine: { md: string; name: string } | null): Record<string, string> {
  const keys: Record<string, string> = { 'toji-rpg-v1': JSON.stringify(s) };
  if (routine?.md) keys['toji-routine-md'] = JSON.stringify(routine);
  return keys;
}

export function fromTojiKeys(keys: Record<string, string>): { state: ForgeState; routine: { md: string; name: string } | null } {
  let raw: any = null;
  try { raw = JSON.parse(keys['toji-rpg-v1'] ?? 'null'); } catch {}
  let routine: { md: string; name: string } | null = null;
  try { const r = JSON.parse(keys['toji-routine-md'] ?? 'null'); if (r?.md) routine = { md: String(r.md), name: String(r.name || 'Mi rutina') }; } catch {}
  return { state: hydrate(raw), routine };
}

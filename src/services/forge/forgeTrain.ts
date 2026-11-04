// ============================================================
// Eris Mobile — Forge 2.0: el gasto según la carga, el entreno planificado y la fuerza (F3, 2026-10-17)
//
// Puro; se copia tal cual al servidor (scripts/sync_forge_core.ts) para que las metas del chat y de la app den lo mismo.
//
// GASTO POR SERIE (el usuario: «no es lo mismo 3 ejercicios livianos 3×12 que 5×12 al fallo»):
//   - MET según qué tan cerca del fallo quedó (Compendio de Actividades Físicas 2024, entrenamiento con pesas):
//     3,5 liviano (RIR 3 o más) · 5,0 duro (RIR 1–2, o sin dato) · 6,0 al fallo o pesado (≥ 80 % de tu máximo);
//     +0,5 en los multiarticulares grandes (sentadilla, peso muerto, prensa, dominadas…).
//   - Tiempo: reps × ~3 s + el descanso típico de ese esfuerzo (60 / 90 / 120 s), o el que mediste. Los MET del
//     Compendio son de la sesión completa (con descansos), por eso se cuenta el descanso.
//   - Neto (sobre el reposo, como el reloj): (MET − 1) × 0,0175 × peso × minutos. Sin «afterburn» (conservador).
//   Con 85 kg: 3×12 liviano en 3 ejercicios ≈ 55 kcal; 5×12 al fallo en 5 ejercicios ≈ 480 kcal.
// ENTRENO PLANIFICADO («¿entrenas hoy?»): lo que vas a gastar (el plan del día con tus últimas cargas, o una actividad
//   con su MET) y el «fantasma» = lo planificado que todavía no hiciste. Las metas «según el día» solo si respondiste.
// FUERZA: 1RM estimado (Epley con las reps en reserva), solo con series de 10 reps o menos y RIR 3 o menos.
// ============================================================

import { L, catalog, effKg, lastSetOf, type ForgeState, type FSet } from './forgeCore';
import type { ForgeExercise } from './forgeCatalog';

const r0 = (n: number) => Math.round(n);
const SET_SECONDS_PER_REP = 3;

/** MET de máquinas de cardio a ritmo moderado (Compendio 2024). */
const CARDIO_MET: Record<string, number> = { trotadora: 7.0, bici: 6.8, eliptica: 5.0, escaladora: 8.8, remo_ergo: 7.0, cardio_z2: 6.0 };
/** MET de lo que se mide en segundos (planchas, saltar la cuerda, sprints…). */
const TIMED_MET: Record<string, number> = {
  cuerda: 11.8, sprint: 10.0, mountain: 8.0, movilidad: 2.5, balance_ej: 2.5, gripper: 2.5, farmer: 6.0,
  // combate (fase I9; Compendio 2024: saco 5,5 · artes marciales a ritmo moderado ~10, se toma un punto medio para patadas y
  // rodillazos al saco · agilidad vigorosa 8,0). Sin esto quedaban en 3,8 y el gasto de un round de saco salía a la mitad.
  sombra: 5.5, saco: 5.5, patadas_saco: 6.5, rodillazos: 6.5, escalera: 8.0,
};

/** 1RM estimado de una serie (Epley, contando las reps que quedaban). null si no sirve para estimar. */
export function e1rmOf(load: number, reps: number, rir: number | null | undefined): number | null {
  if (!load || load <= 0 || reps < 1 || reps > 10 || rir == null || rir > 3) return null;
  return Math.round(load * (1 + (reps + rir) / 30) * 10) / 10;
}

/** El mejor 1RM estimado reciente de un ejercicio (últimos 90 días). */
export function bestE1rm(s: ForgeState, exId: string, beforeDay?: string, days = 90): number | null {
  const ex = catalog(s)[exId];
  if (!ex || ex.eq === 'iso' || ex.eq === 'cardio') return null;
  const from = (() => { const d = new Date(); d.setDate(d.getDate() - days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  let best: number | null = null;
  for (const [day, exs] of Object.entries(s.sessions || {})) {
    if (day < from || (beforeDay && day >= beforeDay)) continue;
    for (const set of exs[exId] || []) {
      if (set.warmup) continue;
      const v = e1rmOf(effKg(s, ex, set), set.reps, set.rir);
      if (v != null && (best == null || v > best)) best = v;
    }
  }
  return best;
}

/** El MET de una serie según su esfuerzo (y su peso, si se conoce tu máximo). */
export function setMet(ex: ForgeExercise, set: FSet, e1rm?: number | null, loadKg?: number): number {
  if (ex.eq === 'cardio') return CARDIO_MET[ex.id] ?? 6.0;
  if (ex.unit === 'seg') return TIMED_MET[ex.id] ?? (ex.pattern === 'cardio' ? 8.0 : 3.8);
  if (set.warmup) return 3.0;
  let met = set.rir == null ? 5.0 : set.rir <= 0 ? 6.0 : set.rir >= 3 ? 3.5 : 5.0;
  if (e1rm && loadKg && loadKg > 0) {
    const pct = loadKg / e1rm;
    if (pct >= 0.8) met = Math.max(met, 6.0);
    else if (pct < 0.6 && set.rir == null) met = 3.5;
  }
  return met + (ex.big ? 0.5 : 0);
}

/** Descanso típico después de una serie según su esfuerzo (s). */
export function restOf(ex: ForgeExercise, set: FSet): number {
  if (set.rest != null) return set.rest;
  if (ex.eq === 'cardio') return 0;
  if (set.warmup) return 45;
  if (ex.unit === 'seg') return 45;
  return set.rir == null ? 90 : set.rir <= 0 ? 120 : set.rir >= 3 ? 60 : 90;
}

/** Minutos de una serie (trabajo + descanso). */
export function setMinutes(ex: ForgeExercise, set: FSet): number {
  const work = ex.unit === 'min' ? set.reps * 60 : ex.unit === 'seg' ? set.reps : set.reps * SET_SECONDS_PER_REP;
  return (work + restOf(ex, set)) / 60;
}

/** kcal netas de una serie (sobre el reposo). */
export function setKcal(s: ForgeState, ex: ForgeExercise, set: FSet, e1rm?: number | null): number {
  const body = set.body ?? s.bodyKg ?? 70;
  const met = setMet(ex, set, e1rm, effKg(s, ex, set));
  return Math.max(0, (met - 1) * 0.0175 * body * setMinutes(ex, set));
}

/** El gasto de un día de entreno (todas sus series). */
export function dayEnergy(s: ForgeState, day: string): { kcal: number; minutes: number; sets: number } {
  const cat = catalog(s);
  let kcal = 0, minutes = 0, sets = 0;
  for (const [exId, list] of Object.entries((s.sessions || {})[day] || {})) {
    const ex = cat[exId];
    if (!ex) continue;
    const e1 = bestE1rm(s, exId, day);
    for (const set of list) {
      kcal += setKcal(s, ex, set, e1);
      minutes += setMinutes(ex, set);
      if (!set.warmup) sets++;
    }
  }
  return { kcal: r0(kcal), minutes: r0(minutes), sets };
}

/**
 * Lo que vas a gastar con el plan de hoy: cada ejercicio del plan × sus series objetivo, con tu última serie de ese
 * ejercicio (carga, reps y RIR) o, si es nuevo, sus reps típicas a RIR 2.
 */
export function planProjection(s: ForgeState): { kcal: number; minutes: number; sets: number } | null {
  const plan = s.plan || {};
  const ids = Object.keys(plan);
  if (!ids.length) return null;
  const cat = catalog(s);
  let kcal = 0, minutes = 0, sets = 0;
  for (const id of ids) {
    const ex = cat[id];
    if (!ex) continue;
    const last = lastSetOf(s, id);
    const set: FSet = last ? { ...last, warmup: false } : { reps: ex.reps, rir: 2 };
    const n = Math.max(1, plan[id] || 3);
    kcal += n * setKcal(s, ex, set, bestE1rm(s, id));
    minutes += n * setMinutes(ex, set);
    sets += n;
  }
  return { kcal: r0(kcal), minutes: r0(minutes), sets };
}

/** Tu sesión típica (mediana de tus últimos 8 entrenos): para «hoy entreno» sin un plan cargado. */
export function typicalSession(s: ForgeState): { kcal: number; minutes: number } | null {
  const days = Object.keys(s.sessions || {}).sort().slice(-8);
  const list = days.map((d) => dayEnergy(s, d)).filter((e) => e.sets > 0);
  if (!list.length) return null;
  const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  return { kcal: r0(med(list.map((e) => e.kcal))), minutes: r0(med(list.map((e) => e.minutes))) };
}

// ─── Otras actividades (lo que no se anota en Forge) ───

export interface ActivityType { id: string; name: string; met: number; words: string[] }
/** MET a ritmo moderado/juego recreativo (Compendio de Actividades Físicas 2024). */
export const ACTIVITY_TYPES: ActivityType[] = [
  { id: 'basquet', name: 'básquet', met: 7.0, words: ['basquet', 'basket', 'basketball', 'baloncesto'] },
  { id: 'futbol', name: 'fútbol', met: 7.0, words: ['futbol', 'pichanga', 'baby futbol', 'futbolito', 'soccer'] },
  { id: 'trote', name: 'trote', met: 8.0, words: ['trote', 'trotar', 'correr', 'running', 'carrera'] },
  { id: 'caminata', name: 'caminata', met: 3.8, words: ['caminata', 'caminar', 'paseo', 'trekking'] },
  { id: 'cerro', name: 'cerro', met: 6.0, words: ['cerro', 'senderismo', 'hiking', 'montana'] },
  { id: 'bici', name: 'bici', met: 7.0, words: ['bici', 'bicicleta', 'ciclismo', 'pedalear'] },
  { id: 'spinning', name: 'spinning', met: 8.5, words: ['spinning', 'spin', 'cycling'] },
  { id: 'natacion', name: 'natación', met: 6.0, words: ['natacion', 'nadar', 'piscina'] },
  { id: 'tenis', name: 'tenis', met: 7.3, words: ['tenis'] },
  { id: 'padel', name: 'pádel', met: 6.0, words: ['padel'] },
  { id: 'voley', name: 'vóleibol', met: 4.0, words: ['voley', 'voleibol', 'volley'] },
  { id: 'baile', name: 'baile', met: 5.0, words: ['baile', 'bailar', 'zumba', 'danza'] },
  { id: 'yoga', name: 'yoga', met: 2.5, words: ['yoga'] },
  { id: 'pilates', name: 'pilates', met: 3.0, words: ['pilates'] },
  { id: 'marcial', name: 'artes marciales', met: 7.8, words: ['boxeo', 'box', 'karate', 'taekwondo', 'judo', 'jiu jitsu', 'jiujitsu', 'mma', 'kickboxing', 'muay thai'] },
  { id: 'crossfit', name: 'crossfit', met: 8.0, words: ['crossfit', 'hiit', 'funcional'] },
  { id: 'escalada', name: 'escalada', met: 7.0, words: ['escalada', 'escalar', 'boulder'] },
];

/** Una actividad que no es de Forge: su MET por los minutos y tu peso (neto, como el reloj). */
export function activityProjection(typeId: string, minutes: number, bodyKg: number | null | undefined): { kcal: number; minutes: number; waterMl: number } {
  const t = ACTIVITY_TYPES.find((x) => x.id === typeId) ?? { met: 6.0 };
  const kcal = r0((t.met - 1) * 0.0175 * (bodyKg || 70) * minutes);
  return { kcal, minutes: r0(minutes), waterMl: r0(minutes * (t.met >= 7 ? 13 : 8)) };
}

// ─── El entreno del día («¿entrenas hoy?») ───

export interface TrainingIntent {
  /** YYYY-MM-DD */
  day: string;
  answer: 'si' | 'no';
  /** tu rutina de Forge u otra actividad */
  kind?: 'rutina' | 'otra';
  /** «Pierna», «básquet» */
  label?: string;
  /** id de ACTIVITY_TYPES (otra actividad) */
  activity?: string;
  minutes?: number;
  /** «19:00» */
  time?: string;
  /** lo que se proyecta gastar (kcal netas) y tomar de más (ml) */
  kcal?: number;
  waterMl?: number;
  source: 'app' | 'chat' | 'forge' | 'aviso';
  at: string;
}

/** Valida lo que llega del teléfono o del chat (entrada externa). */
export function sanitizeIntent(raw: unknown, today: string): TrainingIntent | null {
  const r = raw as any;
  if (!r || typeof r !== 'object' || (r.answer !== 'si' && r.answer !== 'no')) return null;
  const day = typeof r.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : today;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : undefined);
  const time = typeof r.time === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time.padStart(5, '0') : undefined;
  const out: TrainingIntent = {
    day, answer: r.answer, source: ['app', 'chat', 'forge', 'aviso'].includes(r.source) ? r.source : 'app',
    at: typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at)) ? r.at : new Date().toISOString(),
  };
  if (r.answer === 'si') {
    out.kind = r.kind === 'otra' ? 'otra' : 'rutina';
    if (typeof r.label === 'string' && r.label.trim()) out.label = r.label.trim().slice(0, 40);
    if (typeof r.activity === 'string' && ACTIVITY_TYPES.some((t) => t.id === r.activity)) out.activity = r.activity;
    const minutes = num(r.minutes, 5, 600); if (minutes) out.minutes = minutes;
    if (time) out.time = time;
    const kcal = num(r.kcal, 0, 3000); if (kcal != null) out.kcal = kcal;
    const water = num(r.waterMl, 0, 3000); if (water != null) out.waterMl = water;
  }
  return out;
}

/** «19:00» → minutos desde medianoche */
const hhmm = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/**
 * El «fantasma»: lo planificado que todavía no hiciste (kcal). Lo que entrenas lo reemplaza. Si pasaron 2 horas desde el
 * final previsto (o son las 23:00 sin hora) y casi no hubo entreno, se apaga sin reproche: la meta vuelve a lo normal.
 */
export function ghostKcal(intent: TrainingIntent | null | undefined, doneKcal: number, now: Date, today: string): { ghost: number; expired: boolean } {
  if (!intent || intent.day !== today || intent.answer !== 'si' || !intent.kcal) return { ghost: 0, expired: false };
  const mins = now.getHours() * 60 + now.getMinutes();
  const limit = intent.time ? hhmm(intent.time) + (intent.minutes ?? 60) + 120 : 23 * 60;
  const expired = mins > Math.min(limit, 23 * 60 + 30) && doneKcal < intent.kcal * 0.3;
  if (expired) return { ghost: 0, expired: true };
  return { ghost: Math.max(0, r0(intent.kcal - doneKcal)), expired: false };
}

/** Minutos que faltan para el entreno (negativo = ya pasó la hora). null sin hora. */
export function minutesToWorkout(intent: TrainingIntent | null | undefined, now: Date, today: string): number | null {
  if (!intent || intent.day !== today || intent.answer !== 'si' || !intent.time) return null;
  return hhmm(intent.time) - (now.getHours() * 60 + now.getMinutes());
}

/** «tu pierna de las 19:00», «básquet a las 20:00», «tu entreno» */
export function intentPhrase(intent: TrainingIntent): string {
  const what = intent.kind === 'otra' ? (intent.label || ACTIVITY_TYPES.find((t) => t.id === intent.activity)?.name || 'tu actividad') : intent.label ? (/^D[ií]a /.test(intent.label) ? `tu ${intent.label}` : `tu ${intent.label.toLowerCase()}`) : 'tu entreno';
  return intent.time ? `${what} de las ${intent.time}` : what;
}

/**
 * La meta de calorías «según el día» (solo si respondiste la pregunta): lo que gastas sin ejercicio (basal × 1,2 más lo
 * que te mueves fuera del ejercicio, del nivel automático) + el ejercicio de HOY (lo hecho, o lo planificado si es más).
 * Un día de descanso baja y uno de entreno sube. Sin respuesta se usa la meta de siempre (nivel + lo que pase del día típico).
 */
export function byDaySpend(bmr: number, neatKcal: number, doneKcal: number, plannedKcal: number): { spend: number; exercise: number } {
  const exercise = Math.max(r0(doneKcal), r0(plannedKcal));
  return { spend: r0(bmr * 1.2 + Math.max(0, neatKcal)) + exercise, exercise };
}

/** ¿A quién se le pregunta si entrena hoy? (decisión 2: rutina en Forge, objetivo de ganar/recomp, o 1+ día/semana entrenando) */
export function shouldAskIntent(input: { hasRoutine: boolean; hasPlan: boolean; goal?: string | null; trainedDays28: number }): boolean {
  return input.hasRoutine || input.hasPlan || input.goal === 'ganar' || input.goal === 'recomp' || input.trainedDays28 >= 4;
}

/** Todo lo gastado entrenando (el «acumulado» de Personaje). */
export function totalTrainKcal(s: ForgeState): number {
  return Object.keys(s.sessions || {}).reduce((a, d) => a + dayEnergy(s, d).kcal, 0);
}

/**
 * El cuerpo y el entreno de hoy que se mandan al servidor (TOJI_BODY_SYNC del HTML): con esto DailyTargets calcula las
 * metas de toda la app. El gasto ahora sale de la carga real de cada serie (dayEnergy), no de un MET fijo por ejercicio.
 */
export function bodySync(s: ForgeState) {
  const tk = L.todayKey();
  const e = dayEnergy(s, tk);
  return {
    weightKg: s.bodyKg || null, heightCm: s.heightCm || null, age: s.age || null, sex: s.sex || null,
    activity: L.effActivity(s) || null, activityAuto: L.isAutoLevel(s), goal: s.goal || null, date: tk,
    trainingKcal: e.kcal, trainingSets: e.sets, trainingMin: e.minutes,
  };
}

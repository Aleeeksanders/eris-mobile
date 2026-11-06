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

import { L, catalog, effKg, lastSetOf, linkChain, tailText, type ForgeState, type FSet } from './forgeCore';
import type { ForgeExercise } from './forgeCatalog';

const r0 = (n: number) => Math.round(n);
const SET_SECONDS_PER_REP = 3;
/** Una negativa dura más que una repetición normal (baja lenta, 3–5 s); el resto del remate, como una repetición */
const NEG_SECONDS = 4;
/** Una negativa gasta cerca de 4 veces menos energía que levantar lo mismo (Hody 2019; Krzysztofik 2019): sus segundos cuentan ¼ */
const NEG_ENERGY = 0.25;
/** Lo que se le suma al descanso de una serie con remate: cansa más (Ahtiainen 2003: −56 % vs −38 % de fuerza al terminar) */
const TAIL_REST = 60;
const tailSeconds = (set: FSet) => (set.tail ? set.tail.reps * (set.tail.kind === 'neg' ? NEG_SECONDS : SET_SECONDS_PER_REP) : 0);

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
  return (set.rir == null ? 90 : set.rir <= 0 ? 120 : set.rir >= 3 ? 60 : 90) + (set.tail ? TAIL_REST : 0);
}

/** Minutos de una serie (trabajo + descanso). */
export function setMinutes(ex: ForgeExercise, set: FSet): number {
  return (setWorkSeconds(ex, set) + restOf(ex, set)) / 60;
}

/** Lo que dura la serie misma, sin el descanso: por tiempo, lo anotado; con repeticiones, ~3 s por cada una. */
export function setWorkSeconds(ex: ForgeExercise, set: FSet): number {
  return ex.unit === 'min' ? set.reps * 60 : ex.unit === 'seg' ? set.reps : set.reps * SET_SECONDS_PER_REP + tailSeconds(set);
}

// ─── La barra de descanso (2026-11-05) ───────────────────────────────────────────────────────────────────────────────
// Pedido del usuario: anota al TERMINAR la serie, así que el descanso parte al anotar. «A mí me sirve mucho más esperar de
// 120 a 150 segundos en algunos casos»: cada ejercicio recuerda el descanso que le dejaste con −15/+15; sin eso, la regla.

const REST_MIN = 15, REST_MAX = 600;
const de5 = (x: number) => Math.round(x / 5) * 5;

/**
 * Cuánto descansar después de esta serie (s). 0 = sin descanso (cardio). Calentamiento, siempre 45 s. Lo guardado para el
 * ejercicio manda; si no hay, según el esfuerzo (como restOf) y 30 s más en los ejercicios grandes: en multiarticulares
 * pesados, descansar 2 min o más rinde mejor.
 */
export function restTarget(s: ForgeState, ex: ForgeExercise, set: FSet): number {
  if (ex.eq === 'cardio') return 0;
  if (set.warmup) return 45;
  const guardado = s.restPrefs?.[ex.id];
  if (typeof guardado === 'number' && guardado >= REST_MIN) return guardado;
  if (ex.unit === 'seg') return 60;
  const base = set.rir == null ? 90 : set.rir <= 0 ? 120 : set.rir >= 3 ? 60 : 90;
  return base + (ex.big ? 30 : 0) + (set.tail ? TAIL_REST : 0);
}

// ─── Entre ejercicios y ejercicios unidos (2026-11-06) ───────────────────────────────────────────────────────────────
// El usuario descansa ~2:30 entre series y más entre ejercicios. NO hay un estudio directo sobre el descanso entre ejercicios:
// lo más cercano dice que importa si el siguiente usa los mismos músculos (Willardson 2006; Ratamess 2012). Por eso la regla es
// solo un punto de partida (3 min con músculos en común, 2 sin) y lo que dejes con −15/+15 queda guardado aparte.

export const BETWEEN_KEY = '__entre';
/** Unidos: solo lo que tardas en cambiar de ejercicio */
export const LINK_SECS = 15;

/** Cuánto descansar al cambiar de ejercicio (s). Lo que dejaste manda; si no, según si comparten músculos principales. */
export function betweenRest(s: ForgeState, ex: ForgeExercise, next?: ForgeExercise | null): number {
  const guardado = s.restPrefs?.[BETWEEN_KEY];
  if (typeof guardado === 'number' && guardado >= REST_MIN) return guardado;
  const principales = (e?: ForgeExercise | null) => Object.entries((e?.m ?? {}) as Record<string, number>).filter(([, p]) => p >= 2).map(([k]) => k);
  const comparten = principales(ex).some((k) => principales(next).includes(k));
  return comparten ? 180 : 120;
}

export type RestKind = 'serie' | 'cambio' | 'enlace' | 'calent';
export interface AfterSet { secs: number; text: string; fin: boolean; kind: RestKind; /** dónde se guarda lo que ajustes (null = no se guarda) */ saveAs: string | null }

/** Qué pasa después de anotar: cuánto descansar, qué viene y dónde queda lo que ajustes con −15/+15. */
export function afterSetPlan(s: ForgeState, day: string, ex: ForgeExercise, set: FSet): AfterSet {
  const cat = catalog(s);
  const nx = nextAfterSet(s, day, ex.id);
  const plan = s.plan || {};
  const hechas = (id: string) => (((s.sessions || {})[day] || {})[id] || []).filter((x) => !x.warmup).length;
  if (set.warmup) return { secs: restTarget(s, ex, set), text: nx.text, fin: nx.fin, kind: 'calent', saveAs: null };
  const base = restTarget(s, ex, set);
  if (!base) return { secs: 0, text: nx.text, fin: nx.fin, kind: 'serie', saveAs: null };
  const chain = linkChain(s, ex.id).filter((id) => cat[id]);
  if (chain.length > 1) {
    const sig = chain[chain.indexOf(ex.id) + 1];
    if (sig && hechas(sig) < hechas(ex.id) && hechas(sig) < plan[sig]) return { secs: LINK_SECS, text: `Sigue: ${cat[sig].name}, sin descanso`, fin: false, kind: 'enlace', saveAs: null };
    const falta = chain.find((id) => hechas(id) < plan[id]);
    if (falta) {
      const g = s.restPrefs?.[chain[0]];
      const secs = typeof g === 'number' && g >= REST_MIN ? g : Math.max(...chain.map((id) => restTarget(s, cat[id], set)));
      return { secs, text: `Ronda ${Math.min(...chain.map(hechas)) + 1}: ${cat[falta].name}`, fin: false, kind: 'serie', saveAs: chain[0] };
    }
  }
  if (nx.fin) return { secs: 0, text: nx.text, fin: true, kind: 'serie', saveAs: null };
  if (plan[ex.id] != null && hechas(ex.id) >= plan[ex.id]) {
    const otro = Object.keys(plan).find((id) => cat[id] && hechas(id) < plan[id]);
    return { secs: betweenRest(s, ex, otro ? cat[otro] : null), text: nx.text, fin: false, kind: 'cambio', saveAs: BETWEEN_KEY };
  }
  return { secs: base, text: nx.text, fin: false, kind: 'serie', saveAs: ex.id };
}

/** Tus descansos reales (lo que anotaste en los últimos `days` días): entre series y entre ejercicios, sin contar la serie. */
export function restStats(s: ForgeState, days = 60, now: Date = L.forgeNow()): { sets: { n: number; med: number }; between: { n: number; med: number } } {
  const cat = catalog(s);
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const desde = key(new Date(now.getTime() - days * 86_400_000));
  const sets: number[] = [], between: number[] = [];
  const esNeg = (id: string) => /negativ/i.test(id);
  for (const [day, exs] of Object.entries(s.sessions || {})) {
    if (day < desde) continue;
    const filas = Object.entries(exs).flatMap(([id, list]) => (list || []).filter((x) => !x.warmup && x.at && key(new Date(x.at)) === day).map((x) => ({ id, x })));
    filas.sort((a, b) => a.x.at! - b.x.at!);
    for (let i = 1; i < filas.length; i++) {
      const a = filas[i - 1], b = filas[i];
      if (!cat[b.id] || (esNeg(b.id) && !esNeg(a.id))) continue; // pronas → negativas: era la misma serie, sin descanso
      const g = (b.x.at! - a.x.at!) / 1000 - setWorkSeconds(cat[b.id], b.x);
      if (g < 30 || g > 1200) continue; // anotar de golpe o irse a otra cosa no es descanso
      (a.id === b.id || (esNeg(a.id) && !esNeg(b.id) && cat[a.id]?.pattern === cat[b.id].pattern) ? sets : between).push(g);
    }
  }
  const med = (xs: number[]) => (xs.length ? r0([...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)]) : 0);
  return { sets: { n: sets.length, med: med(sets) }, between: { n: between.length, med: med(between) } };
}

// ─── Tu avance con remate ────────────────────────────────────────────────────────────────────────────────────────────

export interface TailSession { day: string; rounds: Array<{ strict: number; tail: number }> }

/** Las sesiones con remate de un ejercicio, también las de antes, cuando las negativas iban en otra línea del mismo día. */
export function tailHistory(s: ForgeState, exId: string, n = 6): TailSession[] {
  const cat = catalog(s);
  const ex = cat[exId];
  if (!ex) return [];
  const out: TailSession[] = [];
  for (const day of Object.keys(s.sessions || {}).sort()) {
    const sess = s.sessions[day] || {};
    const w = (sess[exId] || []).filter((x) => !x.warmup);
    if (!w.length) continue;
    const negId = /negativ/i.test(exId) ? null : Object.keys(sess).find((id) => id !== exId && /negativ/i.test(id) && cat[id]?.pattern === ex.pattern);
    const negs = negId ? (sess[negId] || []).filter((x) => !x.warmup) : [];
    const rounds = w.map((x, i) => ({ strict: x.reps, tail: x.tail?.reps ?? negs[i]?.reps ?? 0 }));
    if (rounds.some((r) => r.tail > 0)) out.push({ day, rounds });
  }
  return out.slice(-n);
}

/** «Estrictas en la primera ronda: 3 → 5 → 6 · Total por ronda: 8 → 8 → 10». null si no hay remates. */
export function tailLine(s: ForgeState, exId: string): string | null {
  const h = tailHistory(s, exId, 3);
  if (!h.length) return null;
  const total = (r: { strict: number; tail: number }) => r.strict + r.tail;
  const mejor = (x: TailSession) => Math.max(...x.rounds.map(total));
  if (h.length === 1) return `La última: ${h[0].rounds.map((r) => `${r.strict}+${r.tail}`).join(' · ')}`;
  return `Estrictas en la primera ronda: ${h.map((x) => x.rounds[0].strict).join(' → ')} · Total por ronda: ${h.map(mejor).join(' → ')}`;
}

/** Guarda el descanso de un ejercicio (de 5 en 5 s, entre 15 s y 10 min). */
export function setRestPref(s: ForgeState, exId: string, secs: number): ForgeState {
  const v = Math.max(REST_MIN, Math.min(REST_MAX, de5(secs)));
  if (s.restPrefs?.[exId] === v) return s;
  return { ...s, restPrefs: { ...(s.restPrefs || {}), [exId]: v } };
}

/**
 * La serie con el descanso que de verdad hubo antes de ella. Como se anota al TERMINAR, entre dos anotaciones está el
 * descanso MÁS la serie nueva: se le resta lo que dura. Solo hoy, y solo si da algo creíble (anotar varias de una vez o
 * irse a otra cosa no cuenta como descanso). Lo que se mide reemplaza al descanso supuesto en el gasto (restOf).
 */
export function withMeasuredRest(s: ForgeState, day: string, ex: ForgeExercise, set: FSet, now: number = L.forgeNow().getTime()): FSet {
  const { rest: _antes, ...limpia } = set;
  if (day !== L.todayKey()) return limpia;
  let ultima = 0;
  for (const series of Object.values((s.sessions || {})[day] || {})) for (const x of series) if ((x.at ?? 0) > ultima) ultima = x.at!;
  if (!ultima) return limpia;
  const r = de5((now - ultima) / 1000 - setWorkSeconds(ex, set));
  return r >= REST_MIN && r <= REST_MAX ? { ...limpia, rest: r } : limpia;
}

const cargaTxt = (ex: ForgeExercise, x: FSet): string => {
  if (ex.eq === 'asist') return x.assist ? `asistida ${x.assist} ${x.unit ?? 'kg'}` : '';
  if (ex.eq === 'banda') return '';
  if (!x.kg) return '';
  return ex.eq === 'bw' ? `+${x.kg} kg` : `${x.kg} ${x.unit ?? 'kg'}`;
};
const repsTxt = (ex: ForgeExercise, reps: number, conCarga: boolean) => (ex.unit === 'seg' ? `${reps} s` : ex.unit === 'min' ? `${reps} min` : conCarga ? `× ${reps}` : `${reps} ${reps === 1 ? 'rep' : 'reps'}`);

/** Lo que sigue después de anotar: otra serie de este, el próximo del plan, o `fin` si ya está todo el plan de hoy. */
export function nextAfterSet(s: ForgeState, day: string, exId: string): { text: string; fin: boolean } {
  const cat = catalog(s);
  const ex = cat[exId];
  const hechas = (id: string) => (((s.sessions || {})[day] || {})[id] || []).filter((x) => !x.warmup);
  const plan = s.plan || {};
  const ids = Object.keys(plan).filter((id) => cat[id]);
  const propia = hechas(exId);
  const ultima = ((s.sessions || {})[day] || {})[exId]?.slice(-1)[0];
  const esta = () => {
    const carga = cargaTxt(ex, ultima!);
    const tail = ultima!.tail;
    if (tail) return `${carga ? `${carga} ` : ''}${ultima!.reps} + ${tail.kind === 'neg' ? `${tail.reps} neg.` : tailText(tail)}`; // cabe en la barra
    return [carga, repsTxt(ex, ultima!.reps, !!carga)].filter(Boolean).join(' ');
  };
  if (plan[exId] == null) return { text: ultima ? `Otra serie: ${esta()}` : 'Otra serie', fin: false };
  if (propia.length < plan[exId]) return { text: `Serie ${propia.length + 1} de ${plan[exId]}${ultima ? ` · ${esta()}` : ''}`, fin: false };
  const otro = ids.find((id) => hechas(id).length < plan[id]);
  return otro ? { text: `Sigue: ${cat[otro].name}`, fin: false } : { text: 'Plan de hoy listo', fin: true };
}

/** La primera serie de trabajo de la última vez que hiciste este ejercicio (antes de `day`). */
export function firstSetLastTime(s: ForgeState, exId: string, day: string): FSet | null {
  for (const d of Object.keys(s.sessions || {}).filter((x) => x < day).sort().reverse()) {
    const w = (s.sessions[d][exId] || []).filter((x) => !x.warmup);
    if (w.length) return w[0];
  }
  return lastSetOf(s, exId);
}

/** Para el cronómetro de un ejercicio por tiempo: el objetivo de la rutina o tu última marca (en segundos). */
export function timedGoal(s: ForgeState, day: string, ex: ForgeExercise): { secs: number; label: string } | null {
  const k = ex.unit === 'min' ? 60 : 1;
  const t = s.planDay?.day === day ? s.planDay?.targets?.[ex.id] : null;
  if (t?.repMin) return { secs: t.repMin * k, label: 'Objetivo' };
  const u = lastSetOf(s, ex.id);
  return u?.reps ? { secs: u.reps * k, label: 'Tu última' } : null;
}

/** kcal netas de una serie (sobre el reposo). */
export function setKcal(s: ForgeState, ex: ForgeExercise, set: FSet, e1rm?: number | null): number {
  const body = set.body ?? s.bodyKg ?? 70;
  const met = setMet(ex, set, e1rm, effKg(s, ex, set));
  // Las negativas pesan harto en el músculo y poco en la energía
  const descuento = set.tail?.kind === 'neg' ? (tailSeconds(set) * (1 - NEG_ENERGY)) / 60 : 0;
  return Math.max(0, (met - 1) * 0.0175 * body * (setMinutes(ex, set) - descuento));
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

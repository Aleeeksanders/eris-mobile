// ============================================================
// Eris Mobile — Forge 2.0: el progreso (F6, 2026-10-17)
//
// Puro; se copia al servidor (scripts/sync_forge_core.ts) para que Eris hable de tus récords con las mismas cifras.
//
// El usuario: «gráficos como Smart Fit: 1 año, 6 meses, 3 meses, 1 mes. El mes es básicamente para que no abandone;
// recién al 3er mes debería haber una buena curva». Por eso:
//   - 1 mes: constancia (sesiones por semana, racha) y las primeras marcas (lo que hiciste por primera vez, récords).
//   - 3 meses o más: la curva de fuerza (máximo estimado por ejercicio y el score de fuerza semana a semana) y el volumen.
//   - «Tú hace 3 meses»: lo de hoy contra lo de entonces.
//   - Récords: el mejor máximo estimado, el más pesado y la serie con más reps de cada ejercicio (y cuándo).
// ============================================================

import { L, catalog, effKg, type ForgeState, type FSet } from './forgeCore';
import { e1rmOf } from './forgeTrain';
import { strengthScore, liftRatings, weeklySets, LIFT_NAMES } from './forgeStrength';
import { athleticParams } from './forgeAthletic';

export type Range = '1m' | '3m' | '6m' | '1a';
export const RANGE_DAYS: Record<Range, number> = { '1m': 30, '3m': 91, '6m': 182, '1a': 365 };
export const RANGE_NAME: Record<Range, string> = { '1m': '1 mes', '3m': '3 meses', '6m': '6 meses', '1a': '1 año' };

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromNow = (days: number) => { const d = L.forgeNow(); d.setDate(d.getDate() - days); return keyOf(d); };
const work = (sets: FSet[] | undefined) => (sets || []).filter((x) => !x.warmup);
const num = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
/** El peso como lo marca el equipo: lb en la máquina que es en libras; en mancuernas, una («22 kg c/u»). */
const shown = (x: FSet, ex: { pair?: boolean; eq: string }) => `${num(x.kg ?? 0)} ${x.unit ?? 'kg'}${ex.pair ? ' c/u' : ''}`;

/** Desde qué día cuenta el rango. */
export const rangeStart = (r: Range) => fromNow(RANGE_DAYS[r]);

/** El rango con que se abre: 1 mes hasta tener ~2,5 meses de historia (antes la curva de fuerza no dice mucho). */
export function defaultRange(s: ForgeState): Range {
  const first = trainingDays(s, '0000-00-00')[0];
  return first && first <= fromNow(75) ? '3m' : '1m';
}

/** Los días con entreno (series de trabajo) desde `from`. */
export function trainingDays(s: ForgeState, from: string): string[] {
  return Object.keys(s.sessions || {}).filter((d) => d >= from && Object.values(s.sessions[d]).some((x) => work(x).length)).sort();
}

export interface ExercisePoint { day: string; e1rm: number | null; topLoad: number; topReps: number; maxReps: number; volume: number; sets: number; best: FSet }

/** Cada sesión de un ejercicio: su mejor máximo estimado, el peso más alto, las reps y el volumen (kg × reps). */
export function exerciseHistory(s: ForgeState, exId: string, from = '0000-00-00'): ExercisePoint[] {
  const ex = catalog(s)[exId];
  if (!ex) return [];
  const out: ExercisePoint[] = [];
  for (const day of Object.keys(s.sessions || {}).sort()) {
    if (day < from) continue;
    const w = work(s.sessions[day][exId]);
    if (!w.length) continue;
    let e1: number | null = null, topLoad = 0, topReps = 0, volume = 0, best = w[0];
    for (const x of w) {
      const load = effKg(s, ex, x);
      const v = e1rmOf(load, x.reps, x.rir);
      if (v != null && (e1 == null || v > e1)) e1 = v;
      if (load > topLoad || (load === topLoad && x.reps > topReps)) { topLoad = load; topReps = x.reps; best = x; }
      volume += x.reps * load * (ex.pair ? 2 : 1);
      // El remate suma al volumen con la carga que tuvo; la fuerza y los récords siguen saliendo solo de lo estricto
      if (x.tail) volume += x.tail.reps * (x.tail.kind === 'peso' ? effKg(s, ex, { ...x, kg: x.tail.kg, unit: x.tail.unit }) : x.tail.kind === 'ayuda' ? effKg(s, ex, { ...x, assist: x.tail.assist, band: x.tail.band }) : load) * (ex.pair ? 2 : 1);
    }
    out.push({ day, e1rm: e1, topLoad, topReps, maxReps: Math.max(...w.map((x) => x.reps)), volume: Math.round(volume), sets: w.length, best });
  }
  return out;
}

/** Los ejercicios que más hiciste en el rango (para elegir qué graficar). */
export function topExercises(s: ForgeState, range: Range, n = 6): string[] {
  const from = fromNow(RANGE_DAYS[range]);
  const count: Record<string, number> = {};
  const cat = catalog(s);
  for (const d of trainingDays(s, from)) for (const [id, sets] of Object.entries(s.sessions[d])) {
    const ex = cat[id];
    if (!ex || ex.eq === 'cardio' || !work(sets).length) continue;
    count[id] = (count[id] || 0) + 1 + (ex.std ? 0.5 : 0);
  }
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}

/** Semanas (lunes a domingo) del rango, de la más antigua a la actual. */
export function weeksOf(range: Range): Array<{ start: string; end: string; label: string }> {
  const now = L.forgeNow();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const n = Math.ceil(RANGE_DAYS[range] / 7);
  const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const out: Array<{ start: string; end: string; label: string }> = [];
  for (let k = n - 1; k >= 0; k--) {
    const a = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * k);
    const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6);
    out.push({ start: keyOf(a), end: keyOf(b), label: `${a.getDate()} ${MON[a.getMonth()]}` });
  }
  return out;
}

/** Sesiones por semana (la constancia). */
export function sessionsPerWeek(s: ForgeState, range: Range): Array<{ label: string; value: number }> {
  const days = trainingDays(s, fromNow(RANGE_DAYS[range] + 7));
  return weeksOf(range).map((w) => ({ label: w.label, value: days.filter((d) => d >= w.start && d <= w.end).length }));
}

/** Series por semana de un músculo (contra 10–20). */
export function muscleWeeks(s: ForgeState, sub: string, range: Range): Array<{ label: string; value: number }> {
  return weeksOf(range).map((w) => ({ label: w.label, value: weeklySets(s, 7, w.end)[sub] ?? 0 }));
}

/** El score de fuerza al cierre de cada semana (necesita series con peso y RIR). */
export function strengthWeeks(s: ForgeState, range: Range): Array<{ label: string; value: number | null }> {
  return weeksOf(range).map((w) => ({ label: w.label, value: strengthScore(s, w.end)?.score ?? null }));
}

export interface PR { exId: string; name: string; kind: 'e1rm' | 'peso' | 'reps'; value: number; reps?: number; day: string; text: string }

const BW_LIKE = ['bw', 'iso', 'asist', 'banda'];

/**
 * Tus récords por ejercicio (todo el historial), con lo que tiene sentido en cada uno:
 *   - con carga (barra, mancuernas, máquina): el peso más alto (como lo marca el equipo) y, en los levantamientos con
 *     estándar, el máximo estimado;
 *   - peso corporal: la serie con más reps (o segundos) y el lastre más pesado;
 *   - asistidos: la menor asistencia (lo más cerca de hacerla sola).
 */
export function records(s: ForgeState): PR[] {
  const cat = catalog(s);
  const out: PR[] = [];
  const ids = new Set(Object.values(s.sessions || {}).flatMap((d) => Object.keys(d)));
  for (const id of ids) {
    const ex = cat[id];
    if (!ex || ex.eq === 'cardio') continue;
    const h = exerciseHistory(s, id);
    if (!h.length) continue;
    const bwLike = BW_LIKE.includes(ex.eq);
    const e1 = h.filter((p) => p.e1rm != null).sort((a, b) => b.e1rm! - a.e1rm! || a.day.localeCompare(b.day))[0];
    if (e1 && ex.std && !bwLike) out.push({ exId: id, name: ex.name, kind: 'e1rm', value: e1.e1rm!, day: e1.day, text: `~${num(e1.e1rm!)} kg${ex.pair ? ' c/u' : ''} de máximo estimado` });
    const load = [...h].sort((a, b) => b.topLoad - a.topLoad || b.topReps - a.topReps || a.day.localeCompare(b.day))[0];
    if (!bwLike && load.topLoad > 0) out.push({ exId: id, name: ex.name, kind: 'peso', value: load.topLoad, reps: load.topReps, day: load.day, text: `${shown(load.best, ex)} × ${load.topReps}` });
    if (ex.eq === 'bw' && (load.best.kg ?? 0) > 0) out.push({ exId: id, name: ex.name, kind: 'peso', value: load.best.kg!, reps: load.topReps, day: load.day, text: `+${num(load.best.kg!)} kg de lastre × ${load.topReps}` });
    if (ex.eq === 'asist' && load.best.assist != null) out.push({ exId: id, name: ex.name, kind: 'peso', value: load.topLoad, reps: load.topReps, day: load.day, text: `asistencia de ${num(load.best.assist)} ${load.best.unit ?? 'kg'} × ${load.topReps}` });
    if (ex.eq !== 'asist' && bwLike) {
      const most = h.map((p) => ({ day: p.day, reps: p.maxReps })).sort((a, b) => b.reps - a.reps || a.day.localeCompare(b.day))[0];
      out.push({ exId: id, name: ex.name, kind: 'reps', value: most.reps, day: most.day, text: `${most.reps}${ex.unit === 'seg' ? ' s' : ' reps'} en una serie` });
    }
  }
  return out.sort((a, b) => b.day.localeCompare(a.day));
}

/** ¿Esta serie es un récord? (para el aviso al anotarla) — compara contra todo lo anterior del ejercicio. */
export function setRecord(s: ForgeState, exId: string, set: FSet, day: string): string | null {
  const ex = catalog(s)[exId];
  if (!ex || set.warmup || ex.eq === 'cardio') return null;
  const prev = exerciseHistory({ ...s, sessions: Object.fromEntries(Object.entries(s.sessions || {}).map(([d, e]) => [d, d === day ? { ...e, [exId]: (e[exId] || []).filter((x) => x !== set) } : e])) } as ForgeState, exId);
  if (!prev.length) return null; // la primera vez no es récord (es una primera marca)
  const load = effKg(s, ex, set);
  const NAME = ex.name.toUpperCase();
  if (!BW_LIKE.includes(ex.eq)) {
    const e1 = ex.std ? e1rmOf(load, set.reps, set.rir) : null;
    const bestE1 = Math.max(0, ...prev.map((p) => p.e1rm ?? 0));
    if (e1 != null && bestE1 > 0 && e1 > bestE1 + 0.01) return `¡RÉCORD! MÁXIMO ESTIMADO ~${num(e1)} KG${ex.pair ? ' C/U' : ''}`;
    const bestLoad = Math.max(0, ...prev.map((p) => p.topLoad));
    if (load > bestLoad + 0.01) return `¡RÉCORD! ${shown(set, ex).toUpperCase()} EN ${NAME}`;
    return null;
  }
  if (ex.eq === 'asist') {
    const bestLoad = Math.max(0, ...prev.map((p) => p.topLoad));
    return load > bestLoad + 0.01 && set.reps >= 3 ? `¡RÉCORD! MENOS ASISTENCIA EN ${NAME}` : null;
  }
  if (ex.eq === 'bw' && (set.kg ?? 0) > 0) {
    const bestLastre = Math.max(0, ...prev.map((p) => p.best.kg ?? 0));
    if (set.kg! > bestLastre + 0.01) return `¡RÉCORD! +${num(set.kg!)} KG DE LASTRE EN ${NAME}`;
  }
  const bestReps = Math.max(0, ...prev.map((p) => p.maxReps));
  return set.reps > bestReps ? `¡RÉCORD! ${set.reps}${ex.unit === 'seg' ? ' S' : ' REPS'} EN ${NAME}` : null;
}

/** «Tú hace 3 meses»: el score de fuerza y cada levantamiento, hoy contra entonces. */
export function versusAgo(s: ForgeState, days = 91): { scoreNow: number | null; scoreThen: number | null; lifts: Array<{ lift: string; name: string; now: number; then: number }>; sessionsNow: number; sessionsThen: number } | null {
  const thenKey = fromNow(days);
  const before = { ...s, sessions: Object.fromEntries(Object.entries(s.sessions || {}).filter(([d]) => d <= thenKey)) } as ForgeState;
  if (!Object.keys(before.sessions).length) return null;
  const now = liftRatings(s);
  const then = liftRatings(s, { until: thenKey });
  const lifts = now.map((r) => { const t = then.find((x) => x.lift === r.lift); return t ? { lift: r.lift, name: LIFT_NAMES[r.lift] ?? r.lift, now: r.e1rm, then: t.e1rm } : null; }).filter(Boolean) as any;
  const scoreThen = strengthScore(s, thenKey)?.score ?? null;
  return {
    scoreNow: strengthScore(s)?.score ?? null, scoreThen, lifts,
    sessionsNow: trainingDays(s, fromNow(28)).length,
    sessionsThen: trainingDays(before, fromNow(days + 28)).filter((d) => d <= thenKey).length,
  };
}

/** Primeras marcas del rango: ejercicios que hiciste por primera vez y récords nuevos (para el mes: que nadie abandone). */
export function firsts(s: ForgeState, range: Range): Array<{ day: string; text: string }> {
  const from = fromNow(RANGE_DAYS[range]);
  const cat = catalog(s);
  const firstDay: Record<string, string> = {};
  for (const d of Object.keys(s.sessions || {}).sort()) for (const [id, sets] of Object.entries(s.sessions[d])) if (work(sets).length && !firstDay[id]) firstDay[id] = d;
  const out: Array<{ day: string; text: string }> = [];
  for (const [id, d] of Object.entries(firstDay)) if (d >= from && cat[id]) out.push({ day: d, text: `Primera vez: ${cat[id].name}` });
  // un récord por ejercicio (el de peso, que es el que se siente; si no hay, el máximo estimado)
  const seen = new Set<string>();
  const prs = records(s).filter((pr) => pr.day >= from && pr.kind !== 'reps' && firstDay[pr.exId] < pr.day).sort((a, b) => (a.kind === 'peso' ? 0 : 1) - (b.kind === 'peso' ? 0 : 1));
  for (const pr of prs) if (!seen.has(pr.exId)) { seen.add(pr.exId); out.push({ day: pr.day, text: `Récord en ${pr.name}: ${pr.text}` }); }
  return out.sort((a, b) => b.day.localeCompare(a.day)).slice(0, 12);
}

/** Lo del mes (constancia): sesiones, contra el mes anterior, la semana más activa y los últimos 7 días («¿cómo vengo esta semana?»). */
export function monthSummary(s: ForgeState): { sessions: number; prev: number; bestWeek: number; streak: number; week: number } {
  const d30 = trainingDays(s, fromNow(30)).length;
  const prev = trainingDays(s, fromNow(60)).filter((d) => d < fromNow(30)).length;
  const weeks = sessionsPerWeek(s, '1m');
  return { sessions: d30, prev, bestWeek: Math.max(0, ...weeks.map((w) => w.value)), streak: s.streak || 0, week: trainingDays(s, fromNow(7)).length };
}

/** Lo que el teléfono le cuenta al servidor (en `forge_projection`) para que Eris hable de tu progreso con estas cifras. */
export interface ProgressContext {
  score: number | null; scoreTrend: number | null; missing: string[];
  month: { sessions: number; prev: number; bestWeek: number; streak: number; week?: number };
  records: Array<{ name: string; kind: PR['kind']; text: string; day: string }>;
  vs3m: { scoreThen: number | null; scoreNow: number | null; lifts: Array<{ name: string; then: number; now: number }>; sessionsThen: number; sessionsNow: number } | null;
  lifts: Array<{ name: string; e1rm: number; level: string; pct: number }>;
  /** los parámetros atléticos con el bono de sus clases (fase I9) */
  athletic?: { params: Array<{ label: string; value: number; boost: number }>; classes: string[] };
}
export function progressContext(s: ForgeState): ProgressContext {
  const sc = strengthScore(s);
  const v = versusAgo(s);
  return {
    score: sc?.score ?? null, scoreTrend: sc?.trend ?? null, missing: sc?.missing ?? [],
    month: monthSummary(s),
    records: records(s).slice(0, 10).map(({ name, kind, text, day }) => ({ name, kind, text, day })),
    vs3m: v ? { scoreThen: v.scoreThen, scoreNow: v.scoreNow, lifts: v.lifts.map(({ name, then, now }) => ({ name, then, now })), sessionsThen: v.sessionsThen, sessionsNow: v.sessionsNow } : null,
    lifts: liftRatings(s).map((r) => ({ name: r.name, e1rm: r.e1rm, level: r.levelName, pct: r.pct })),
    athletic: (() => { const a = athleticParams(s); return { params: a.params.map(({ label, value, boost }) => ({ label, value, boost })), classes: a.classes }; })(),
  };
}

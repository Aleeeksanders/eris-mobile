// ============================================================
// Eris Mobile — Forge 2.0: rutinas que arma Eris, progresión sin lesiones y el «score de entrenamiento» (F5, 2026-10-17)
//
// Puro; se copia tal cual al servidor (scripts/sync_forge_core.ts): el chat (training_plan → build_routine) arma la MISMA
// rutina que el botón de la app. La IA conversa; el código decide.
//
// GENERADOR (buildRoutine):
//   - División: 2–3 días cuerpo completo · 4 días torso/pierna · 5–6 días empuje/tirón/pierna.
//   - Cubre todos los patrones (empuje y tirón horizontal y vertical, sentadilla, bisagra, zancada, core) con equilibrio
//     empuje/tirón, y apunta a ≥ 10 series por músculo principal a la semana (ACSM 2026), partiendo bajo.
//   - Reps según el objetivo: fuerza 4–6 en los básicos (≥ 80 % del máximo) · hipertrofia 6–12 · salud 10–15.
//     RIR 2–3; al fallo solo en accesorios, nunca en los básicos ni con presión alta.
//   - Equipo: el de «Mi gimnasio» (o en casa: peso corporal, mancuernas, kettlebell, bandas). Lesiones: evita lo que carga
//     esa zona y usa su alternativa. Nivel: sin ejercicios de técnica avanzada si recién empiezas.
//   - Carga inicial: sale de tu máximo estimado para esas reps y ese RIR, al peso REAL de abajo que existe en tu gimnasio;
//     un ejercicio nuevo no lleva peso (eliges uno con el que te queden 2–3).
// PROGRESIÓN (nextTarget, doble progresión): si todas las series llegaron al tope de reps con el RIR planeado o mejor, sube
// al SIGUIENTE peso real del equipo (nunca más de un escalón) y vuelve al piso de reps; si no, el mismo peso y +1 rep.
// DESCARGA: si te estancaste 2 sesiones, o quedaste 2+ reps más cerca del fallo que lo planeado, o dormiste mal varios días:
// ~10 % menos de peso y una serie menos esa vez.
// SCORE DE ENTRENAMIENTO 0–100 (como el de nutrición): constancia 30 · progresión 25 · equilibrio 20 · RIR anotado 15 ·
// recuperación (sueño) 10.
// ============================================================

import { L, BASE_BY_ID, TAIL_NAMES, catalog, dropJoined, effKg, gymOf, lastSetOf, type ForgeState, type FSet } from './forgeCore';
import { pickerFor, nearest, stepFrom, type Care, type ForgeExercise, type Pattern } from './forgeCatalog';
import { e1rmOf, bestE1rm } from './forgeTrain';
import { weeklySets, WEEKLY_MIN } from './forgeStrength';
import { recoverySummary } from './forgeRecovery';

export type RoutineGoal = 'fuerza' | 'hipertrofia' | 'salud';
export interface RoutineItem {
  exId: string; sets: number; repMin: number; repMax: number; rir: number; kg?: number; unit?: 'kg' | 'lb'; note?: string;
  // Lo que trae una rutina escrita (fase I8, forgeMdRoutine): cómo lo escribiste, qué se mide, por lado, al fallo, opcional, bloque
  /** el nombre como lo escribiste («Anillas - Ring Dips»), si no es el del catálogo */
  label?: string;
  /** lo que se mide si no son reps ni el tiempo del ejercicio: segundos o metros */
  measure?: 'seg' | 'm';
  perSide?: 'lado' | 'brazo' | 'pierna';
  /** al fallo, sin número de reps */
  amrap?: boolean;
  optional?: boolean;
  /** el bloque del día («Gym (Fuerza Bruta)», «Casa») */
  block?: string;
}
export interface RoutineDay {
  id: string; name: string; focus: string; items: RoutineItem[];
  /** 0 = domingo … 6 = sábado (si la rutina dice qué día de la semana) */
  weekday?: number;
  warmup?: string;
  notes?: string[];
}
export interface Routine {
  id: string; name: string; goal: RoutineGoal; daysPerWeek: number; minutes: number; split: 'full' | 'torso_pierna' | 'ppl' | 'propia';
  where: 'gym' | 'casa'; days: RoutineDay[]; notes: string[]; createdAt: string;
  /** eris = la armó Eris por chat · app = el botón «Armar mi rutina» · md = tu rutina escrita, revisada */
  source: 'eris' | 'app' | 'md';
}
export interface BuildOptions {
  goal?: RoutineGoal;
  /** días por semana (2–6) */
  days: number;
  /** minutos por sesión (30–120) */
  minutes?: number;
  where?: 'gym' | 'casa';
  /** zonas a cuidar (lesión o molestia) */
  care?: Care[];
  hypertension?: boolean;
  diabetes?: boolean;
  /** máximo estimado por ejercicio (si no viene, se calcula con las series del estado) */
  e1rm?: Record<string, number>;
  /** experiencia (si no viene, sale del historial del estado) */
  experience?: 'principiante' | 'intermedio';
  /** de dónde viene (el chat o la app) */
  source?: 'eris' | 'app';
  now?: Date;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Lo que hay en cada tipo de día, en orden. Cada hueco: patrones aceptados y si es un básico. */
type Slot = { pats: Pattern[]; muscle?: string; big?: boolean; tag: string };
const FULL_A: Slot[] = [
  { pats: ['sentadilla'], big: true, tag: 'sentadilla' }, { pats: ['emp_h'], big: true, tag: 'empuje horizontal' }, { pats: ['tir_v'], big: true, tag: 'tirón vertical' },
  { pats: ['bisagra'], tag: 'bisagra' }, { pats: ['aislado'], muscle: 'delt_lat', tag: 'hombro lateral' }, { pats: ['core'], tag: 'core' },
];
const FULL_B: Slot[] = [
  { pats: ['bisagra'], big: true, tag: 'bisagra' }, { pats: ['emp_v'], big: true, tag: 'empuje vertical' }, { pats: ['tir_h'], big: true, tag: 'tirón horizontal' },
  { pats: ['zancada'], tag: 'zancada' }, { pats: ['aislado'], muscle: 'biceps', tag: 'bíceps' }, { pats: ['aislado'], muscle: 'triceps', tag: 'tríceps' },
];
const FULL_C: Slot[] = [
  { pats: ['sentadilla'], big: true, tag: 'sentadilla' }, { pats: ['tir_h'], big: true, tag: 'tirón horizontal' }, { pats: ['emp_h'], big: true, tag: 'empuje horizontal' },
  { pats: ['aislado'], muscle: 'femoral', tag: 'femoral' }, { pats: ['aislado'], muscle: 'delt_post', tag: 'hombro posterior' }, { pats: ['core'], tag: 'core' },
];
const TORSO: Slot[] = [
  { pats: ['emp_h'], big: true, tag: 'empuje horizontal' }, { pats: ['tir_v'], big: true, tag: 'tirón vertical' }, { pats: ['emp_v'], tag: 'empuje vertical' },
  { pats: ['tir_h'], tag: 'tirón horizontal' }, { pats: ['aislado'], muscle: 'delt_lat', tag: 'hombro lateral' }, { pats: ['aislado'], muscle: 'biceps', tag: 'bíceps' }, { pats: ['aislado'], muscle: 'triceps', tag: 'tríceps' },
];
const PIERNA: Slot[] = [
  { pats: ['sentadilla'], big: true, tag: 'sentadilla' }, { pats: ['bisagra'], big: true, tag: 'bisagra' }, { pats: ['zancada'], tag: 'zancada' },
  { pats: ['aislado'], muscle: 'cuadriceps', tag: 'cuádriceps' }, { pats: ['aislado'], muscle: 'femoral', tag: 'femoral' }, { pats: ['aislado'], muscle: 'gemelos', tag: 'gemelos' }, { pats: ['core'], tag: 'core' },
];
const EMPUJE: Slot[] = [
  { pats: ['emp_h'], big: true, tag: 'empuje horizontal' }, { pats: ['emp_v'], big: true, tag: 'empuje vertical' }, { pats: ['emp_h'], muscle: 'pec_sup', tag: 'pecho superior' },
  { pats: ['aislado'], muscle: 'pec_med', tag: 'aperturas' }, { pats: ['aislado'], muscle: 'delt_lat', tag: 'hombro lateral' }, { pats: ['aislado'], muscle: 'triceps', tag: 'tríceps' },
];
const TIRON: Slot[] = [
  { pats: ['tir_v'], big: true, tag: 'tirón vertical' }, { pats: ['tir_h'], big: true, tag: 'tirón horizontal' }, { pats: ['tir_v', 'tir_h'], tag: 'tirón (variante)' },
  { pats: ['aislado'], muscle: 'delt_post', tag: 'hombro posterior' }, { pats: ['aislado'], muscle: 'biceps', tag: 'bíceps' }, { pats: ['aislado'], muscle: 'trapecio', tag: 'trapecio' },
];

const SPLITS: Record<Exclude<Routine['split'], 'propia'>, (n: number) => Array<{ id: string; name: string; focus: string; slots: Slot[] }>> = {
  full: (n) => [
    { id: 'A', name: 'Día A — Cuerpo completo', focus: 'sentadilla, empuje y tirón', slots: FULL_A },
    { id: 'B', name: 'Día B — Cuerpo completo', focus: 'bisagra, hombros y remo', slots: FULL_B },
    ...(n >= 3 ? [{ id: 'C', name: 'Día C — Cuerpo completo', focus: 'pierna, remo y pecho', slots: FULL_C }] : []),
  ],
  torso_pierna: () => [
    { id: 'A', name: 'Día A — Torso', focus: 'pecho, espalda, hombros y brazos', slots: TORSO },
    { id: 'B', name: 'Día B — Pierna', focus: 'cuádriceps, femoral, glúteo y core', slots: PIERNA },
    { id: 'C', name: 'Día C — Torso', focus: 'pecho, espalda, hombros y brazos', slots: TORSO },
    { id: 'D', name: 'Día D — Pierna', focus: 'cuádriceps, femoral, glúteo y core', slots: PIERNA },
  ],
  ppl: (n) => {
    const base = [
      { id: 'A', name: 'Día A — Empuje', focus: 'pecho, hombros y tríceps', slots: EMPUJE },
      { id: 'B', name: 'Día B — Tirón', focus: 'espalda y bíceps', slots: TIRON },
      { id: 'C', name: 'Día C — Pierna', focus: 'pierna completa y core', slots: PIERNA },
    ];
    return n >= 6 ? [...base, { ...base[0], id: 'D' }, { ...base[1], id: 'E' }, { ...base[2], id: 'F' }] : n === 5 ? [...base, { ...base[0], id: 'D', name: 'Día D — Empuje' }, { ...base[1], id: 'E', name: 'Día E — Tirón' }] : base;
  },
};

const HOME_EQ = new Set(['bw', 'db', 'kb', 'iso', 'banda']);

/** ¿Este ejercicio se puede hacer dónde entrenas? */
function available(ex: ForgeExercise, where: 'gym' | 'casa', s: ForgeState): boolean {
  if (ex.eq === 'cardio') return false;
  if (where === 'casa') {
    if (!HOME_EQ.has(ex.eq) || !ex.home) return false;
    const g = gymOf(s);
    if (ex.eq === 'db' && (g.dbSet === 'propias' && !(g.dbList ?? []).length)) return false;
    if (ex.eq === 'kb' && !g.kb.length) return false;
  }
  return true;
}

/** Experiencia: principiante si casi no hay historial (sin ejercicios de técnica avanzada). */
export function experienceOf(s: ForgeState): 'principiante' | 'intermedio' {
  const days = Object.keys(s.sessions || {}).length;
  return days >= 24 ? 'intermedio' : 'principiante';
}

/** El peso de arranque: tu máximo para esas reps y ese RIR, al peso real de abajo. null = ejercicio nuevo. */
export function startLoad(s: ForgeState, ex: ForgeExercise, reps: number, rir: number, e1rm: number | null): { kg: number; unit?: 'kg' | 'lb' } | null {
  if (!e1rm || ['bw', 'iso', 'cardio', 'banda'].includes(ex.eq)) return null;
  const p = pickerFor(ex, gymOf(s));
  if (!p.values.length || p.kind === 'none' || p.kind === 'lastre' || p.kind === 'band') return null;
  const targetKg = e1rm / (1 + (reps + rir) / 30);
  if (p.kind === 'assist') {
    // asistida: la asistencia que deja la carga efectiva en ese objetivo
    const body = s.bodyKg || 70;
    const want = Math.max(0, body * (ex.bw ?? 1) - targetKg);
    const inUnit = p.unit === 'lb' ? want / 0.45359237 : want;
    return { kg: nearest(p.values, inUnit), unit: p.unit === 'lb' ? 'lb' : undefined };
  }
  const inUnit = p.unit === 'lb' ? targetKg / 0.45359237 : targetKg;
  const below = [...p.values].filter((v) => v <= inUnit + 1e-6).pop() ?? p.values[0];
  return { kg: below, unit: p.unit === 'lb' ? 'lb' : undefined };
}

function chooseExercise(s: ForgeState, slot: Slot, used: Set<string>, o: Required<Pick<BuildOptions, 'where'>> & BuildOptions, lvl: 'principiante' | 'intermedio', weekUsed: Map<string, number>): ForgeExercise | null {
  const cat = catalog(s);
  const done = new Set(Object.values(s.sessions || {}).flatMap((d) => Object.keys(d)));
  const care = new Set(o.care ?? []);
  const cands = Object.values(cat).filter((e) => {
    if (used.has(e.id) || (e as any).custom || !slot.pats.includes(e.pattern) || !available(e, o.where, s)) return false;
    if (slot.muscle && !((e.m as any)[slot.muscle] >= 2)) return false;
    if (lvl === 'principiante' && e.level >= 3) return false;
    if ((e.care ?? []).some((c) => care.has(c)) && slot.big) return false; // un básico que carga la zona lesionada: no
    if (e.unit === 'seg' && slot.pats[0] !== 'core') return false;
    return true;
  });
  const score = (e: ForgeExercise) =>
    (done.has(e.id) ? 3 : 0)                                     // lo que ya haces (técnica conocida)
    + (e.std ? 2 : 0)                                             // se puede medir tu fuerza
    + (slot.big && e.big ? 2 : 0)
    + (lvl === 'principiante' && ['maq', 'polea', 'asist', 'disc', 'db'].includes(e.eq) ? 2 : 0) // máquinas y mancuernas: más seguras al empezar
    - (lvl === 'principiante' && ['bb', 'ez'].includes(e.eq) ? 1.5 : 0)
    + (lvl === 'intermedio' && ['bb', 'db'].includes(e.eq) && slot.big ? 1 : 0)
    - (weekUsed.get(e.id) ?? 0) * 2.5                              // variedad entre días
    - ((e.care ?? []).some((c) => care.has(c)) ? 4 : 0)
    - (e.level - 1) * 0.5;
  cands.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  return cands[0] ?? null;
}

/** Reps, RIR y series según el objetivo y si es un básico. */
function prescription(goal: RoutineGoal, big: boolean, ex: ForgeExercise, hypertension: boolean): { repMin: number; repMax: number; rir: number; sets: number } {
  if (ex.unit === 'seg') return { repMin: ex.range[0], repMax: ex.range[1], rir: 2, sets: 3 };
  if (goal === 'fuerza') return big ? { repMin: 4, repMax: 6, rir: 2, sets: 4 } : { repMin: 8, repMax: 12, rir: 2, sets: 3 };
  if (goal === 'salud') return { repMin: 10, repMax: 15, rir: 3, sets: big ? 3 : 2 };
  // hipertrofia: al fallo solo en accesorios (nunca con presión alta)
  return big ? { repMin: 6, repMax: 10, rir: 2, sets: 3 } : { repMin: 10, repMax: 15, rir: hypertension ? 2 : 1, sets: 3 };
}

/** Arma una rutina completa con tu equipo, tu fuerza y tus cuidados. */
export function buildRoutine(s: ForgeState, opts: BuildOptions): Routine {
  const days = Math.max(2, Math.min(6, Math.round(opts.days || 3)));
  const minutes = Math.max(30, Math.min(120, Math.round(opts.minutes || 60)));
  const goal: RoutineGoal = opts.goal ?? (s.goal === 'ganar' || s.goal === 'recomp' ? 'hipertrofia' : s.goal === 'perder' ? 'hipertrofia' : 'salud');
  const where = opts.where ?? (gymOf(s).preset === 'casa' ? 'casa' : 'gym');
  const split: Exclude<Routine['split'], 'propia'> = days <= 3 ? 'full' : days === 4 ? 'torso_pierna' : 'ppl';
  const lvl = opts.experience ?? experienceOf(s);
  const o = { ...opts, where };
  // Series por sesión que caben: ~2,5 min por serie con descanso (los básicos un poco más)
  const budget = Math.floor(minutes / 2.6);
  const tmpl = SPLITS[split](days);
  const out: RoutineDay[] = [];
  const weekUsed = new Map<string, number>();
  for (const d of tmpl) {
    const used = new Set<string>();
    const items: RoutineItem[] = [];
    for (const slot of d.slots) {
      const ex = chooseExercise(s, slot, used, o, lvl, weekUsed);
      if (!ex) continue;
      used.add(ex.id);
      weekUsed.set(ex.id, (weekUsed.get(ex.id) ?? 0) + 1);
      const p = prescription(goal, !!slot.big, ex, !!opts.hypertension);
      const e1 = opts.e1rm?.[ex.id] ?? bestE1rm(s, ex.id);
      const load = startLoad(s, ex, p.repMax, p.rir, e1);
      items.push({ exId: ex.id, sets: p.sets, repMin: p.repMin, repMax: p.repMax, rir: p.rir, ...(load ? { kg: load.kg, ...(load.unit ? { unit: load.unit } : {}) } : {}) });
    }
    // Que quepa en los minutos: se sacan series a los accesorios primero (mínimo 2) y después ejercicios del final
    let total = items.reduce((a, i) => a + i.sets, 0);
    for (let k = items.length - 1; total > budget && k >= 0; k--) { while (items[k].sets > 2 && total > budget) { items[k].sets--; total--; } }
    while (total > budget && items.length > 3) { total -= items.pop()!.sets; }
    out.push({ id: d.id, name: d.name, focus: d.focus, items });
  }
  // ≥ 10 series semanales por músculo principal (ACSM): si falta y hay tiempo, +1 serie a quien lo trabaja
  const weekly = routineWeeklySets(s, { days: out, daysPerWeek: days } as any);
  for (const m of ['pec_med', 'dorsal', 'cuadriceps', 'femoral', 'delt_lat']) {
    let guard = 0;
    while ((weekly[m] ?? 0) < WEEKLY_MIN && guard++ < 6) {
      const day = out.find((d) => d.items.reduce((a, i) => a + i.sets, 0) < budget && d.items.some((i) => (catalog(s)[i.exId]?.m as any)?.[m] >= 2));
      if (!day) break;
      const it = day.items.find((i) => (catalog(s)[i.exId]?.m as any)?.[m] >= 2 && i.sets < 4)!;
      if (!it) break;
      it.sets++;
      Object.assign(weekly, routineWeeklySets(s, { days: out, daysPerWeek: days } as any));
    }
  }
  const notes: string[] = [];
  notes.push(goal === 'fuerza' ? 'Básicos pesados (4–6 reps) dejando 2 en reserva; accesorios a 8–12.' : goal === 'salud' ? 'Reps cómodas (10–15) dejando 3 en reserva: constancia antes que intensidad.' : 'Básicos a 6–10 reps dejando 2 en reserva; accesorios a 10–15, la última serie cerca del fallo.');
  notes.push('Progresión: cuando todas las series lleguen al tope de reps, sube al siguiente peso de tu gimnasio; si no, el mismo peso y una rep más.');
  if (opts.hypertension) notes.push('Con presión alta: no aguantes la respiración (exhala al hacer fuerza) y no llegues al fallo en los pesados.');
  if (opts.diabetes) notes.push('Con diabetes: deja un día entre los días que repiten músculos y controla tu glucosa antes y después.');
  if ((opts.care ?? []).length) notes.push(`Cuidando: ${(opts.care ?? []).join(', ')}. Si algo duele (no es solo cansancio), avísame y lo cambio.`);
  if (out.some((d) => d.items.some((i) => i.kg == null && !['bw', 'iso'].includes(catalog(s)[i.exId]?.eq ?? 'bw')))) notes.push('Donde no hay peso: elige uno con el que te queden 2–3 reps en la última serie.');
  return {
    id: `r${(opts.now ?? new Date()).getTime()}`, name: `Rutina de ${days} días · ${goal}`, goal, daysPerWeek: days, minutes, split, where,
    days: out, notes, createdAt: (opts.now ?? new Date()).toISOString(), source: opts.source ?? 'app',
  };
}

/** Series semanales por músculo que da la rutina (para revisar el equilibrio). */
export function routineWeeklySets(s: ForgeState, r: Pick<Routine, 'days' | 'daysPerWeek'>): Record<string, number> {
  const out: Record<string, number> = {};
  const cat = catalog(s);
  const reps = r.daysPerWeek / Math.max(1, r.days.length);
  for (const d of r.days) for (const it of d.items) {
    for (const [m, pts] of Object.entries(cat[it.exId]?.m ?? {})) out[m] = (out[m] || 0) + it.sets * ((pts as number) >= 2 ? 1 : 0.5) * reps;
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 2) / 2;
  return out;
}

export const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** El texto (pestaña Rutina y el chat). */
export function routineToMd(s: ForgeState, r: Routine): string {
  const cat = catalog(s);
  const lines = [`# ${r.name}`, '', r.source === 'md' ? `> ${r.daysPerWeek} días` : `> ${r.daysPerWeek} días por semana · ~${r.minutes} min · ${r.where === 'casa' ? 'en casa' : 'gimnasio'}`, ''];
  const head = ['| Ejercicio | Series | Reps | RIR | Peso |', '|---|---|---|---|---|'];
  for (const d of r.days) {
    lines.push(`## ${d.name}${d.weekday != null ? ` (${WEEKDAY_NAMES[d.weekday]})` : ''}`, '');
    if (d.warmup) lines.push(`Calentamiento: ${d.warmup}`, '');
    let block: string | undefined = '\u0000';
    for (const it of d.items) {
      if (it.block !== block) {
        if (block !== '\u0000') lines.push('');
        if (it.block) lines.push(`### ${it.block}`, '');
        lines.push(...head);
        block = it.block;
      }
      const ex = cat[it.exId];
      const unit = it.measure === 'm' ? ' m' : it.measure === 'seg' || ex?.unit === 'seg' ? ' s' : '';
      const reps = it.amrap ? 'al fallo' : `${it.repMin}–${it.repMax}${unit}${it.perSide ? ` por ${it.perSide}` : ''}`;
      const kg = it.kg != null ? `${ex?.eq === 'bw' ? '+' : ''}${String(it.kg).replace('.', ',')} ${it.unit ?? 'kg'}${ex?.eq === 'asist' ? ' de ayuda' : ex?.eq === 'bw' ? ' de lastre' : ''}` : '—';
      lines.push(`| ${ex?.name ?? it.exId}${it.optional ? ' (opcional)' : ''} | ${it.sets} | ${reps} | ${it.rir === 0 ? 'fallo' : it.rir} | ${kg} |`);
    }
    lines.push('');
  }
  if (r.notes.length) lines.push('## Notas', '', ...r.notes.map((n) => `- ${n}`));
  return lines.join('\n');
}

/** ¿La rutina dice qué día de la semana va cada día? (la mitad o más) */
export const hasWeekdays = (r: Pick<Routine, 'days'>): boolean => r.days.filter((d) => d.weekday != null).length >= Math.ceil(r.days.length / 2);
/** Hoy no toca ninguno de los días de la rutina (con días de la semana): descanso. */
export function isRestDay(r: Pick<Routine, 'days'>, now: Date = L.forgeNow()): boolean {
  return hasWeekdays(r) && !r.days.some((d) => d.weekday === now.getDay());
}

/** El día de la rutina que toca: el de hoy (o el próximo) si dice días de la semana; si no, el siguiente al último que entrenaste. */
export function nextRoutineDay(s: ForgeState, r: Routine, now: Date = L.forgeNow()): RoutineDay {
  if (hasWeekdays(r)) {
    for (let k = 0; k < 7; k++) {
      const hit = r.days.find((d) => d.weekday === (now.getDay() + k) % 7);
      if (hit) return hit;
    }
  }
  const days = Object.keys(s.sessions || {}).sort().reverse();
  const tk = L.todayKey();
  for (const d of days) {
    if (d === tk) continue;
    const ids = new Set(Object.keys(s.sessions[d] || {}));
    let best: { idx: number; hits: number } | null = null;
    r.days.forEach((rd, idx) => {
      const hits = rd.items.filter((i) => ids.has(i.exId)).length;
      if (hits >= 2 && (!best || hits > best.hits)) best = { idx, hits };
    });
    if (best) return r.days[((best as any).idx + 1) % r.days.length];
  }
  return r.days[0];
}

export interface Target { exId: string; sets: number; repMin: number; repMax: number; rir: number; kg?: number; unit?: 'kg' | 'lb'; why: string; deload?: boolean }

/** Las últimas sesiones de un ejercicio (las series de trabajo de cada día, del más reciente al más antiguo). */
function lastSessions(s: ForgeState, exId: string, n: number, before?: string): FSet[][] {
  const out: FSet[][] = [];
  for (const d of Object.keys(s.sessions || {}).sort().reverse()) {
    if (before && d >= before) continue;
    const w = ((s.sessions[d] || {})[exId] || []).filter((x) => !x.warmup);
    if (w.length) out.push(w);
    if (out.length >= n) break;
  }
  return out;
}

/** Doble progresión con los pesos REALES del equipo, y descarga si hace falta. */
export function nextTarget(s: ForgeState, it: RoutineItem, opts: { sleepPoor?: boolean } = {}): Target {
  const ex = catalog(s)[it.exId];
  const tk = L.todayKey();
  const hist = lastSessions(s, it.exId, 3, tk);
  const base: Target = { ...it, why: 'peso de arranque de la rutina' };
  // Al fallo o en metros (rutina escrita): se hace lo que dice, y se compara con la última vez
  if (it.amrap || it.measure === 'm') {
    const u = it.measure === 'm' ? ' m' : it.measure === 'seg' || ex?.unit === 'seg' ? ' s' : ' reps';
    const best = hist.length ? Math.max(...hist[0].map((x) => x.reps)) : null;
    return { ...base, why: it.amrap ? (best != null ? `al fallo: la última vez ${best}${u}, busca superarla` : 'al fallo: anota cuántas lograste') : 'como dice tu rutina' };
  }
  if (!ex || !hist.length) {
    // sin peso que elegir (peso corporal, tiempo): no se habla de pesos
    const loadable = !!ex && ['kg', 'assist'].includes(pickerFor(ex, gymOf(s)).kind);
    return { ...base, why: it.kg != null ? (it.note ? 'arranque: lo de tu rutina, desde abajo' : 'arranque: debería quedarte 2–3 en reserva') : loadable ? 'nuevo: elige un peso con el que te queden 2–3 reps' : 'nuevo: con buena técnica, dejando ~2 en reserva' };
  }
  const last = hist[0];
  const lastLoad = last[last.length - 1];
  const p = pickerFor(ex, gymOf(s));
  const isLoaded = p.kind === 'kg' || p.kind === 'assist';
  const loadOf = (x: FSet) => (p.kind === 'assist' ? x.assist ?? 0 : x.kg ?? 0);
  const cur = loadOf(lastLoad);
  const allTop = last.length >= it.sets && last.every((x) => x.reps >= it.repMax && (x.rir == null || x.rir >= it.rir - 0));
  const tooHard = last.some((x) => x.rir != null && x.rir <= it.rir - 2 && x.reps < it.repMin);
  // estancado: las 3 últimas sesiones sin subir reps ni peso
  const progress = (a: FSet[], b: FSet[]) => loadOf(a[0]) !== loadOf(b[0]) ? (p.kind === 'assist' ? loadOf(a[0]) < loadOf(b[0]) : loadOf(a[0]) > loadOf(b[0])) : a.reduce((t, x) => t + x.reps, 0) > b.reduce((t, x) => t + x.reps, 0);
  const stalled = hist.length >= 3 && !progress(hist[0], hist[1]) && !progress(hist[1], hist[2]);
  if (isLoaded && (stalled || tooHard || opts.sleepPoor)) {
    // Descarga: ~10 % menos (o un escalón más de ayuda en las asistidas) y una serie menos esta vez
    let kg = cur;
    if (p.values.length) {
      if (p.kind === 'assist') kg = stepFrom(p.values, nearest(p.values, cur), 1);
      else { const want = cur * 0.9; kg = [...p.values].filter((v) => v <= want + 1e-6).pop() ?? stepFrom(p.values, nearest(p.values, cur), -1); }
    }
    return { ...it, sets: Math.max(2, it.sets - 1), kg, unit: lastLoad.unit, deload: true, why: stalled ? 'descarga: llevas 2 sesiones sin avanzar' : tooHard ? 'descarga: la última vez quedaste más cerca del fallo que lo planeado' : 'descarga: dormiste mal estos días' };
  }
  if (isLoaded && allTop && p.values.length) {
    const nextKg = p.kind === 'assist' ? stepFrom(p.values, nearest(p.values, cur), -1) : stepFrom(p.values, nearest(p.values, cur), 1);
    if (nextKg !== cur) return { ...it, kg: nextKg, unit: lastLoad.unit, why: `llegaste al tope de reps: ${p.kind === 'assist' ? 'menos ayuda' : 'siguiente peso'}` };
  }
  const repsNow = Math.min(it.repMax, Math.max(it.repMin, Math.min(...last.map((x) => x.reps)) + 1));
  return { ...it, kg: isLoaded ? cur : it.kg, unit: lastLoad.unit, repMin: repsNow, why: allTop ? 'mantén y suma reps' : `mismo peso, busca ${repsNow}+ reps` };
}

/** El plan de hoy a partir de la rutina: los ejercicios con sus series (lo que muestra ENTRENAR). */
export function planFromRoutine(s: ForgeState, r: Routine, day?: RoutineDay, opts: { sleepPoor?: boolean } = {}): { plan: Record<string, number>; targets: Record<string, Target>; day: RoutineDay } {
  const d = day ?? nextRoutineDay(s, r);
  const plan: Record<string, number> = {};
  const targets: Record<string, Target> = {};
  for (const it of d.items) {
    const t = nextTarget(s, it, opts);
    plan[it.exId] = t.sets;
    targets[it.exId] = t;
  }
  dropJoined(s, plan, targets);
  return { plan, targets, day: d };
}

/** Carga el día de la rutina como plan de hoy (guarda qué día es y los objetivos de cada ejercicio). */
export function loadRoutineDay(s: ForgeState, dayId?: string, opts: { sleepPoor?: boolean } = {}): ForgeState {
  const r: Routine | undefined = s.routinePlan;
  if (!r || !r.days?.length) return s;
  const d = dayId ? r.days.find((x) => x.id === dayId) : undefined;
  const p = planFromRoutine(s, r, d, opts);
  return { ...s, plan: p.plan, planDay: { day: L.todayKey(), id: p.day.id, name: p.day.name, targets: p.targets } };
}

/** El paso de día con una rutina: lo que toca hoy, o un día de descanso (rutina con días de la semana) sin el plan de ayer. */
export function routineDayStart(s: ForgeState, now: Date = L.forgeNow()): ForgeState {
  const r: Routine | undefined = s.routinePlan;
  if (!r) return s;
  if (isRestDay(r, now)) return { ...s, plan: {}, planDay: { day: L.todayKey(), id: '', name: 'Descanso', targets: {}, rest: true } };
  return loadRoutineDay(s);
}

/** Guarda una rutina estructurada en el estado (y la carga como plan de hoy si hoy no hay series). */
export function setRoutinePlan(s: ForgeState, r: Routine | null): ForgeState {
  // una rutina sin días no es una rutina (no se guarda: el plan de hoy no tendría de dónde salir)
  if (r && !r.days?.length) r = null;
  const next: ForgeState = { ...s, routinePlan: r ?? undefined };
  if (!r) return { ...next, planDay: undefined };
  const today = (s.sessions || {})[L.todayKey()];
  // igual que el paso de día: con días de la semana, hoy puede ser de descanso (no se carga el día siguiente como «hoy»)
  return today && Object.keys(today).length ? next : routineDayStart(next);
}

/** Cambiar un ejercicio de la rutina (dolor, no te gusta, no hay la máquina): su alternativa disponible. */
export function swapExercise(s: ForgeState, r: Routine, exId: string, where: 'gym' | 'casa' = r.where, avoid: Care[] = []): { routine: Routine; to: string | null } {
  const cat = catalog(s);
  const ex = cat[exId];
  if (!ex) return { routine: r, to: null };
  const inRoutine = new Set(r.days.flatMap((d) => d.items.map((i) => i.exId)));
  const pool = [...(ex.alt ?? []), ...Object.values(cat).filter((e) => e.pattern === ex.pattern && e.id !== ex.id).map((e) => e.id)];
  const to = pool.find((id) => {
    const e = cat[id];
    return e && !inRoutine.has(id) && available(e, where, s) && !(e.care ?? []).some((c) => avoid.includes(c)) && !(e as any).custom;
  }) ?? null;
  if (!to) return { routine: r, to: null };
  const days = r.days.map((d) => ({ ...d, items: d.items.map((i) => (i.exId === exId ? { ...i, exId: to, kg: undefined, unit: undefined } : i)) }));
  return { routine: { ...r, days }, to };
}

/**
 * «¿Me conviene ir al gym o entreno en casa?» (chat, revisión 2026-11-04): cada ejercicio de hoy, si se puede hacer en casa con
 * lo que tienes y, si no, su reemplazo para casa (null = no hay uno parecido).
 */
export function enCasa(s: ForgeState, r: Routine, exIds: string[]): Array<{ exId: string; ok: boolean; to: string | null }> {
  const cat = catalog(s);
  return exIds.map((id) => {
    const ex = cat[id];
    if (!ex) return { exId: id, ok: false, to: null };
    if (available(ex, 'casa', s)) return { exId: id, ok: true, to: null };
    return { exId: id, ok: false, to: swapExercise(s, r, id, 'casa').to };
  });
}

// ─── Score de entrenamiento (0–100, como el de nutrición) ───

export interface TrainingScore { score: number; parts: Array<{ key: string; label: string; pts: number; max: number; note: string }> }

export function trainingScore(s: ForgeState, opts: { sleepAvgH?: number | null; now?: Date } = {}): TrainingScore | null {
  const now = opts.now ?? L.forgeNow();
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const back = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return key(d); };
  const days28 = Object.keys(s.sessions || {}).filter((d) => d > back(28) && d <= key(now) && Object.values(s.sessions[d]).some((x) => x.some((y) => !y.warmup)));
  if (!days28.length) return null;
  const parts: TrainingScore['parts'] = [];
  // 1) Constancia: sesiones de 4 semanas contra lo planeado (rutina) o 3 por semana
  const target = (s.routinePlan?.daysPerWeek ?? 3) * 4;
  const cons = Math.min(1, days28.length / target);
  parts.push({ key: 'constancia', label: 'Constancia', pts: Math.round(cons * 30), max: 30, note: `${days28.length} de ${target} sesiones en 4 semanas` });
  // 2) Progresión: ejercicios con más máximo estimado (o más reps al mismo peso) que hace 4 semanas
  const cat = catalog(s);
  const ids = [...new Set(days28.flatMap((d) => Object.keys(s.sessions[d])))].filter((id) => cat[id]?.eq !== 'cardio');
  let up = 0, comparable = 0;
  for (const id of ids) {
    const nowBest = bestE1rm(s, id, undefined, 28);
    const before = bestE1rm(s, id, back(28), 56); // la ventana de hace 4–8 semanas
    if (nowBest != null && before != null) { comparable++; if (nowBest > before) up++; }
  }
  const prog = comparable ? up / comparable : 0.5;
  parts.push({ key: 'progresion', label: 'Progresión', pts: Math.round(prog * 25), max: 25, note: comparable ? `${up} de ${comparable} ejercicios subieron en 4 semanas` : 'faltan semanas para comparar' });
  // 3) Equilibrio: empuje vs tirón (2 semanas) y músculos principales en 10–20 series
  const w = weeklySets(s, 14);
  const push = (w.pec_med ?? 0) + (w.pec_sup ?? 0) + (w.delt_ant ?? 0);
  const pull = (w.dorsal ?? 0) + (w.trapecio ?? 0) + (w.delt_post ?? 0);
  const ratio = push + pull ? Math.min(push, pull) / Math.max(push, pull) : 0;
  const week = weeklySets(s, 7);
  const main = ['pec_med', 'dorsal', 'cuadriceps', 'femoral', 'delt_lat'];
  const inRange = main.filter((m) => (week[m] ?? 0) >= WEEKLY_MIN).length / main.length;
  parts.push({ key: 'equilibrio', label: 'Equilibrio', pts: Math.round((ratio * 0.5 + inRange * 0.5) * 20), max: 20, note: `empuje/tirón ${Math.round(ratio * 100)} % · ${Math.round(inRange * main.length)} de ${main.length} músculos con 10+ series esta semana` });
  // 4) RIR anotado (sin él no se puede estimar fuerza ni gasto bien)
  const sets28 = days28.flatMap((d) => Object.values(s.sessions[d]).flat()).filter((x) => !x.warmup && !x.legacy);
  const withRir = sets28.length ? sets28.filter((x) => x.rir != null).length / sets28.length : 0;
  parts.push({ key: 'rir', label: 'RIR anotado', pts: Math.round(withRir * 15), max: 15, note: `${Math.round(withRir * 100)} % de tus series dicen cuántas te quedaban` });
  // 5) Recuperación: sueño promedio (7 h o más = completo)
  const sl = opts.sleepAvgH;
  const rec = sl == null ? 0.5 : Math.max(0, Math.min(1, (sl - 5) / 2));
  parts.push({ key: 'recuperacion', label: 'Recuperación', pts: Math.round(rec * 10), max: 10, note: sl == null ? 'sin datos de sueño' : `${String(Math.round(sl * 10) / 10).replace('.', ',')} h de sueño promedio` });
  return { score: parts.reduce((a, p) => a + p.pts, 0), parts };
}

/** Un ejercicio de la rutina con su objetivo en palabras («3×8–10 · RIR 2 · 26 kg», «3×45 s», «6×30 m», «3 series al fallo»). */
export function targetText(s: ForgeState, t: Pick<Target, 'exId' | 'sets' | 'repMin' | 'repMax' | 'rir' | 'kg' | 'unit'> & Partial<Pick<RoutineItem, 'measure' | 'perSide' | 'amrap'>>): string {
  const ex = catalog(s)[t.exId] ?? BASE_BY_ID[t.exId];
  const unit = t.measure === 'm' ? ' m' : t.measure === 'seg' || ex?.unit === 'seg' ? ' s' : '';
  const reps = t.repMin === t.repMax ? `${t.repMin}` : `${t.repMin}–${t.repMax}`;
  const lastre = ex?.eq === 'bw';
  const kg = t.kg != null ? ` · ${lastre ? '+' : ''}${String(r2(t.kg)).replace('.', ',')} ${t.unit ?? 'kg'}${ex?.eq === 'asist' ? ' de ayuda' : lastre ? ' de lastre' : ''}` : '';
  if (t.amrap) return `${t.sets} series al fallo${unit === ' s' ? ' (tiempo)' : ''}${kg}`;
  const side = t.perSide ? ` por ${t.perSide}` : '';
  const effort = t.measure ? '' : ` · ${t.rir === 0 ? 'al fallo' : `RIR ${t.rir}`}`;
  return `${t.sets}×${reps}${unit}${side}${effort}${kg}`;
}

/** Valida una rutina que llega de afuera (chat o respaldo): solo ejercicios que existen. */
export function sanitizeRoutine(s: ForgeState, raw: any): Routine | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.days)) return null;
  const cat = catalog(s);
  const txt = (v: any, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
  const days: RoutineDay[] = raw.days.slice(0, 7).map((d: any, k: number) => {
    const weekday = Number.isInteger(d?.weekday) && d.weekday >= 0 && d.weekday <= 6 ? d.weekday : undefined;
    const notes = Array.isArray(d?.notes) ? d.notes.map((n: any) => txt(n, 160)).filter(Boolean).slice(0, 4) : [];
    return {
      id: String(d?.id ?? String.fromCharCode(65 + k)).slice(0, 3), name: String(d?.name ?? `Día ${String.fromCharCode(65 + k)}`).slice(0, 60), focus: String(d?.focus ?? '').slice(0, 80),
      ...(weekday != null ? { weekday } : {}), ...(txt(d?.warmup, 160) ? { warmup: txt(d?.warmup, 160) } : {}), ...(notes.length ? { notes } : {}),
      items: (Array.isArray(d?.items) ? d.items : []).filter((i: any) => i && cat[i.exId]).slice(0, 14).map((i: any) => ({
        exId: i.exId, sets: Math.max(1, Math.min(10, Math.round(Number(i.sets) || 3))), repMin: Math.max(1, Math.round(Number(i.repMin) || 8)), repMax: Math.max(1, Math.round(Number(i.repMax) || 12)),
        rir: Math.max(0, Math.min(4, Math.round(Number(i.rir ?? 2)))), ...(Number(i.kg) > 0 ? { kg: Number(i.kg) } : {}), ...(i.unit === 'lb' ? { unit: 'lb' } : {}),
        ...(txt(i.note, 160) ? { note: txt(i.note, 160) } : {}), ...(txt(i.label, 60) ? { label: txt(i.label, 60) } : {}), ...(txt(i.block, 60) ? { block: txt(i.block, 60) } : {}),
        ...(i.measure === 'seg' || i.measure === 'm' ? { measure: i.measure } : {}), ...(['lado', 'brazo', 'pierna'].includes(i.perSide) ? { perSide: i.perSide } : {}),
        ...(i.amrap === true ? { amrap: true } : {}), ...(i.optional === true ? { optional: true } : {}),
      })),
    };
  }).filter((d: RoutineDay) => d.items.length);
  if (!days.length) return null;
  return {
    id: String(raw.id ?? `r${Date.now()}`), name: String(raw.name ?? 'Mi rutina').slice(0, 60), goal: ['fuerza', 'hipertrofia', 'salud'].includes(raw.goal) ? raw.goal : 'hipertrofia',
    daysPerWeek: Math.max(1, Math.min(7, Number(raw.daysPerWeek) || days.length)), minutes: Math.max(20, Math.min(180, Number(raw.minutes) || 60)),
    split: ['full', 'torso_pierna', 'ppl', 'propia'].includes(raw.split) ? raw.split : 'full', where: raw.where === 'casa' ? 'casa' : 'gym',
    days, notes: Array.isArray(raw.notes) ? raw.notes.map(String).slice(0, 8) : [], createdAt: String(raw.createdAt ?? new Date().toISOString()),
    source: raw.source === 'eris' || raw.source === 'md' ? raw.source : 'app',
  };
}

/**
 * Lo que toca hoy, para «¿qué me toca hoy?» y «¿cuándo me toca tirón?» por chat (2026-10-23): el día cargado en ENTRENAR (o el
 * que tocaría), cada ejercicio con su objetivo en palabras, cuántas series lleva hoy y el orden de la rutina desde el que toca
 * (para las rutinas sin días de la semana, donde el servidor no ve las sesiones).
 */
export interface RoutineToday { day: string; rest: boolean; dayId: string | null; name: string | null; doneSets: number; items: Array<{ name: string; text: string }>; order: string[] }
export function routineToday(s: ForgeState, now: Date = L.forgeNow()): RoutineToday | null {
  const r: Routine | undefined = s.routinePlan;
  if (!r?.days?.length) return null;
  const tk = L.todayKey();
  const doneSets = Object.values((s.sessions || {})[tk] || {}).reduce((a, xs) => a + (xs || []).filter((x) => !x.warmup).length, 0);
  const cat = catalog(s);
  const nameOf = (id: string) => (cat[id] ?? BASE_BY_ID[id])?.name ?? id;
  const next = nextRoutineDay(s, r, now);
  const i0 = Math.max(0, r.days.findIndex((d) => d.id === next.id));
  const order = r.days.map((_, k) => r.days[(i0 + k) % r.days.length].id);
  const textOf = (d: RoutineDay | undefined, t: Target) => {
    const it = d?.items.find((i) => i.exId === t.exId);
    const remate = s.tailPlan?.[t.exId];
    return `${targetText(s, { ...t, measure: it?.measure, perSide: it?.perSide, amrap: it?.amrap })}${remate ? ` + remate: ${TAIL_NAMES[remate.kind].many}` : ''}`;
  };
  const rest = (): RoutineToday => ({ day: tk, rest: true, dayId: null, name: null, doneSets, items: [], order });
  const pd = s.planDay;
  if (pd && pd.day === tk) {
    if (pd.rest) return rest();
    const d = r.days.find((x) => x.id === pd.id);
    const items = Object.values((pd.targets || {}) as Record<string, Target>).map((t) => ({ name: nameOf(t.exId), text: textOf(d, t) }));
    if (items.length) return { day: tk, rest: false, dayId: pd.id || null, name: pd.name ?? d?.name ?? null, doneSets, items, order };
  }
  if (isRestDay(r, now)) return rest();
  const p = planFromRoutine(s, r, next);
  return { day: tk, rest: false, dayId: next.id, name: next.name, doneSets, items: Object.values(p.targets).map((t) => ({ name: nameOf(t.exId), text: textOf(next, t) })), order };
}

/** Lo que el servidor necesita para armar o ajustar la rutina por chat (lo manda el teléfono en sync_forge_projection). */
export function routineContext(s: ForgeState): { gym: ForgeState['gym']; e1rm: Record<string, number>; experience: 'principiante' | 'intermedio'; routine: Routine | null; today: RoutineToday | null; recent: DiaResumen[]; recovery: ReturnType<typeof recoverySummary> | null } {
  const e1rm: Record<string, number> = {};
  for (const id of new Set(Object.values(s.sessions || {}).flatMap((d) => Object.keys(d)))) {
    const v = bestE1rm(s, id);
    if (v != null) e1rm[id] = v;
  }
  let today: RoutineToday | null = null;
  try { today = routineToday(s); } catch {}
  let recent: DiaResumen[] = [];
  try { recent = diasRecientes(s); } catch {}
  let recovery: ReturnType<typeof recoverySummary> | null = null;
  try { recovery = recoverySummary(s); } catch {}
  return { gym: s.gym, e1rm, experience: experienceOf(s), routine: s.routinePlan ?? null, today, recent, recovery };
}

// ─── Lo que entrenaste cada día, para el chat (2026-11-05) ──────────────────────────────────────────────────────────
// Chat real: «puedo mirar mi rutina de ayer» → Eris dijo que la app no guardaba lo de ayer (el servidor solo tenía el
// progreso), y «50 kilos de esta huea que se empuja» no supo que era el press de pecho en máquina (110 lb).

export interface DiaResumen {
  day: string; label: string;
  /** cada ejercicio: «3 series: 12, 12, 11 reps · 110 lb (~50 kg)»; `kg` = la carga más alta en kilos (null sin carga) */
  items: Array<{ name: string; group: string; text: string; kg: number | null }>;
}

const LB = 0.45359237;
const kgTxt = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

/** El resumen de un día entrenado (null si no hay series de trabajo) */
export function resumenDia(s: ForgeState, day: string): DiaResumen | null {
  const ej = ejerciciosDelDia(s, day);
  if (!ej.length) return null;
  const cat = catalog(s);
  const items = ej.map(({ exId, work }) => {
    const ex = cat[exId];
    const asist = ex.eq === 'asist';
    const cargas = work.map((x) => (asist ? x.assist : x.kg)).filter((c): c is number => typeof c === 'number' && c > 0);
    const lb = work.some((x) => x.unit === 'lb');
    const top = cargas.length ? Math.max(...cargas) : null;
    const reps = work.filter((x) => x.reps > 0).map((x) => (x.tail ? `${x.reps}+${x.tail.reps}` : String(x.reps)));
    const seg = ex.unit === 'seg' ? ' s' : ex.unit === 'min' ? ' min' : '';
    const remate = work.find((x) => x.tail)?.tail;
    const repsTxt = reps.length ? `${reps.join(', ')}${seg || ' reps'}${remate ? ` (la 2.ª cifra: ${TAIL_NAMES[remate.kind].many}, sin descanso)` : ''}` : '';
    const cargaTxt = top == null ? (ex.eq === 'bw' ? 'con tu peso' : '')
      : asist ? `asistida −${kgTxt(top)} ${lb ? 'lb' : 'kg'}`
        : lb ? `${kgTxt(top)} lb (~${kgTxt(top * LB)} kg)`
          : ex.eq === 'db' ? `${kgTxt(top)} kg cada mancuerna` : ex.eq === 'bw' ? `con tu peso + ${kgTxt(top)} kg` : `${kgTxt(top)} kg`;
    const text = [`${work.length} ${work.length === 1 ? 'serie' : 'series'}${repsTxt ? `: ${repsTxt}` : ''}`, cargaTxt].filter(Boolean).join(' · ');
    return { name: ex.name, group: ex.group, text, kg: top == null || asist ? null : Math.round((lb ? top * LB : top) * 10) / 10 };
  });
  return { day, label: diaTexto(day), items };
}

/** Los últimos días entrenados (hoy incluido), del más reciente al más antiguo */
export function diasRecientes(s: ForgeState, n = 14): DiaResumen[] {
  const out: DiaResumen[] = [];
  const tk = L.todayKey();
  for (const day of Object.keys(s.sessions || {}).sort().reverse()) {
    if (day > tk) continue;
    const d = resumenDia(s, day);
    if (d) out.push(d);
    if (out.length >= n) break;
  }
  return out;
}

// ─── Repetir un día (pedido del usuario, 2026-11-04) ─────────────────────────────────────────────────────────────────
// «Un botón en Forge que me permita tomar los ejercicios del día y repetir esa rutina en el hoy: lo que hice el domingo,
// importarlo al entrenamiento de hoy.» Nada se anota como hecho: pasa a ser el PLAN de hoy.

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** «domingo 2 nov» */
export function diaTexto(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${DIAS_SEMANA[new Date(y, m - 1, d).getDay()]} ${d} ${MESES_CORTOS[m - 1]}`;
}

export interface DiaEntrenado { day: string; label: string; exIds: string[]; names: string[]; sets: number }

/** Las series de trabajo de cada ejercicio de ese día, en el orden en que se hicieron (sin calentamiento). */
function ejerciciosDelDia(s: ForgeState, day: string): Array<{ exId: string; work: FSet[] }> {
  const cat = catalog(s);
  const sess = (s.sessions || {})[day] || {};
  return Object.entries(sess)
    .map(([exId, sets], k) => ({ exId, work: (sets || []).filter((x) => !x.warmup), first: Math.min(...(sets || []).map((x) => x.at ?? Infinity), Infinity), k }))
    .filter((e) => e.work.length && cat[e.exId])
    .sort((a, b) => (a.first === b.first ? a.k - b.k : a.first - b.first))
    .map(({ exId, work }) => ({ exId, work }));
}

/** Los días entrenados antes de hoy, del más reciente al más antiguo: para elegir cuál repetir. */
export function trainedDays(s: ForgeState, n = 14, before: string = L.todayKey()): DiaEntrenado[] {
  const out: DiaEntrenado[] = [];
  for (const day of Object.keys(s.sessions || {}).sort().reverse()) {
    if (day >= before) continue;
    const d = diaEntrenado(s, day);
    if (d) out.push(d);
    if (out.length >= n) break;
  }
  return out;
}

/** Lo que se entrenó ese día (null si no hay series de trabajo) */
export function diaEntrenado(s: ForgeState, day: string): DiaEntrenado | null {
  const ej = ejerciciosDelDia(s, day);
  if (!ej.length) return null;
  const cat = catalog(s);
  return { day, label: diaTexto(day), exIds: ej.map((e) => e.exId), names: ej.map((e) => cat[e.exId].name), sets: ej.reduce((a, e) => a + e.work.length, 0) };
}

/**
 * Los ejercicios de ese día pasan al plan de hoy, en el mismo orden y con las mismas series de trabajo. El objetivo de cada
 * uno es lo que hiciste ese día: la carga que más usaste (a igualdad, la más alta) y tu rango de repeticiones, así el registro
 * de la serie arranca con eso. «sumar» los agrega al plan que ya tenías hoy (no quita nada).
 */
export function repeatDay(s: ForgeState, day: string, modo: 'reemplazar' | 'sumar' = 'reemplazar'): ForgeState {
  const tk = L.todayKey();
  if (!day || day >= tk) return s;
  const ej = ejerciciosDelDia(s, day);
  if (!ej.length) return s;
  const cat = catalog(s);
  const pd = s.planDay && s.planDay.day === tk && !s.planDay.rest ? s.planDay : null;
  const plan: Record<string, number> = modo === 'sumar' ? { ...(s.plan || {}) } : {};
  const targets: Record<string, Target> = modo === 'sumar' && pd ? { ...(pd.targets || {}) } : {};
  const why = `como el ${diaTexto(day)}`;
  for (const { exId, work } of ej) {
    const ex = cat[exId];
    const cargaDe = (x: FSet) => (ex.eq === 'asist' ? x.assist : x.kg);
    // La carga que más se repitió ese día (series rectas: la de todas; en pirámide, la más alta de las más usadas)
    const veces = new Map<number, number>();
    for (const x of work) { const c = cargaDe(x); if (c != null) veces.set(c, (veces.get(c) ?? 0) + 1); }
    const carga = [...veces.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
    const conEsa = carga != null ? work.filter((x) => cargaDe(x) === carga) : work;
    const reps = conEsa.map((x) => x.reps).filter((r) => r > 0);
    const rir = conEsa.map((x) => x.rir).filter((r): r is number => typeof r === 'number');
    plan[exId] = Math.max(1, Math.min(12, work.length));
    targets[exId] = {
      exId, sets: plan[exId], repMin: reps.length ? Math.min(...reps) : 8, repMax: reps.length ? Math.max(...reps) : 8,
      rir: rir.length ? Math.round(rir.reduce((a, b) => a + b, 0) / rir.length) : 2,
      ...(carga != null ? { kg: carga } : {}), ...(conEsa.some((x) => x.unit === 'lb') ? { unit: 'lb' as const } : {}), why,
    };
  }
  dropJoined(s, plan, targets);
  const name = modo === 'sumar' && pd ? `${pd.name} + ${diaTexto(day)}` : `Repite el ${diaTexto(day)}`;
  return { ...s, plan, planDay: { day: tk, id: '', name, targets, repetido: day } };
}

export { effKg, e1rmOf };

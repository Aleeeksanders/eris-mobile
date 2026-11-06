// ============================================================
// Eris Mobile — qué recordar y cuándo (lógica pura, sin React Native, para poder probarla)
//
// Antes el único aviso proactivo era el consejo del día de la IA: uno cada 20 horas y solo al abrir la app. Esto decide
// por CÓDIGO qué recordar hoy y mañana. ReminderPlanner los deja programados en el teléfono (Android los entrega aunque
// la app esté cerrada) y los recalcula cada vez que algo cambia: lo que ya hiciste se cancela solo.
//
// La guía NO es copiar tus hábitos (si comes mal, eso solo los reforzaría): parte de una pauta saludable de referencia
// (3 comidas a horas regulares, colación si pasan muchas horas, agua repartida en el día, actividad semanal) con las
// metas de TU cuerpo (DailyTargets: peso, actividad, entreno, condiciones). Tus hábitos solo la afinan: si ya comes a
// buena hora, Eris te pregunta qué comiste; si te saltas una comida o la haces muy tarde, te empuja hacia lo óptimo.
// ============================================================

import type { Tone } from './tone';

export type ReminderKind = 'meal' | 'water' | 'training' | 'finance' | 'summary' | 'sleep' | 'focus';
export interface ReminderSettings { meal: boolean; water: boolean; training: boolean; finance: boolean; summary: boolean; sleep: boolean }
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { meal: true, water: true, training: true, finance: true, summary: true, sleep: true };

/**
 * Sueño 2.0 · S4: lo que necesitan los avisos de sueño (horas locales; pueden pasar de 24 = después de medianoche).
 * Sale de las 2 semanas del reloj (sleepCore), la misma hora para acostarse de la pantalla de Sueño y del chat.
 */
export interface SleepReminderInfo {
  bedFrom: number; bedTo: number; caffeineUntil: number;
  /** la hora de dormirse se viene corriendo o el horario es irregular */
  drifting: boolean;
  debtH: number;
  /** su plan de sueño en curso (pantalla de Sueño) */
  plan?: { title: string; text: string } | null;
  /** toma café (o algo con cafeína) de tarde: solo a quien lo hace se le avisa la hora límite */
  coffeeAfternoon: boolean;
  /** hoy ya anotó cafeína después de la hora límite (no se insiste) */
  lateCaffeineToday?: boolean;
}

export interface FinanceInfo {
  /** YYYY-MM-DD del último movimiento anotado (no cuenta los fijos que se aplican solos) */
  ultimoMovimiento?: string | null;
  proximos?: Array<{ desc: string; monto: number; fecha: string; tipo: string; enDias: number }>;
  pendientes?: Array<{ desc: string; monto: number; fecha: string }>;
  comida?: { gastado: number; presup: number } | null;
  /** Finanzas 2.0 (núcleo nativo): el presupuesto de cada categoría «al día del mes» (solo si el resumen es de este mes) */
  presupuesto?: Array<{ cat: string; estado: string; queda: number; porDia: number; presup: number; gastado: number }> | null;
  /** lo que queda para gastar hasta el próximo ingreso, ya descontados los fijos que vienen antes (solo si el resumen es reciente) */
  libre?: number | null;
  proximoIngreso?: { desc: string; enDias: number } | null;
}

const CAT_AVISO: Record<string, string> = { vivienda: 'vivienda', alimentacion: 'comida', transporte: 'transporte', salud: 'salud', entretenimiento: 'ocio', deuda: 'deudas', educacion: 'educación', hogar: 'hogar', otros: 'otros' };

export interface PlanInput {
  now: Date;
  /** cómo habla Eris (lo elige la persona); sin dato, cercano y directo */
  tone?: Tone;
  name: string;
  settings: ReminderSettings;
  modules: { nutri: boolean; forge: boolean; finanzas: boolean };
  /** comidas de los últimos 14 días (sin hoy): día, comida y minuto del día en que se anotó */
  mealHistory: Array<{ day: string; slot: string; minutes: number }>;
  /** comidas de hoy */
  todayMeals: Array<{ slot: string; minutes: number }>;
  kcalToday: number;
  proteinToday: number;
  kcalGoal: number | null;
  proteinGoal: number | null;
  /** fibra de hoy y su meta (DailyTargets); sin datos no hay aviso de fibra */
  fiberToday?: number;
  fiberGoal?: number | null;
  /** con enfermedad renal la proteína es un tope: no se empuja a comer más */
  proteinIsCap: boolean;
  waterToday: number;
  /** null = sin meta de agua (enfermedad renal): no hay avisos de agua */
  waterGoal: number | null;
  /** día (YYYY-MM-DD) → series registradas en Forge */
  trainingDays: Record<string, number>;
  /** día (YYYY-MM-DD) → minutos de ejercicio en Health Connect (el reloj: básquet, gimnasio, bici…) */
  exerciseDays?: Record<string, number>;
  /** pasos de hoy (Health Connect); null = sin reloj */
  stepsToday?: number | null;
  /** racha de Forge (días seguidos reclamando las misiones): en juego si ayer se reclamó y hoy todavía no */
  forgeStreak?: { streak: number; atStake: boolean } | null;
  finance?: FinanceInfo | null;
  /** «¿Entrenas hoy?» (Forge 2.0): lo respondido hoy, y si a esta persona se le pregunta (entrena) */
  intentToday?: { answer: 'si' | 'no'; time?: string; minutes?: number; phrase?: string } | null;
  askIntent?: boolean;
  /** usa insulina o sulfonilureas: el ejercicio puede bajarle la glucosa de más (ADA 2016) */
  glucoseCaution?: boolean;
  /** Sueño 2.0 · S4: sin reloj (o sin 4 noches medidas) no hay avisos de sueño */
  sleep?: SleepReminderInfo | null;
  /** Eris al timón (T2): las comidas del plan de hoy que faltan (hora local; > 24 = pasada la medianoche) */
  planMeals?: Array<{ pasoId: string; slot: string; hora: number; titulo: string; detalle: string }> | null;
  /** el borrador de mañana del piloto automático (T3): sus comidas avisan mañana con «Lo comí ✓» */
  planMealsTomorrow?: Array<{ pasoId: string; slot: string; hora: number; titulo: string; detalle: string }> | null;
  /** ⚡ Modo Rendimiento (R1): los pasos del día exigente con hora (café, siesta-café, bloques, respirar) que faltan */
  planCues?: Array<{ pasoId: string; cue: string; hora: number; titulo: string; detalle: string }> | null;
}

export type ReminderCategory = 'meal' | 'meal_ideas' | 'water' | 'training' | 'finance' | 'intent' | 'plan_meal' | 'plan_cue';
export interface PlannedReminder {
  id: string;
  kind: ReminderKind;
  at: Date;
  title: string;
  body: string;
  /** botones de la notificación (ver ErisNotifications) */
  category?: ReminderCategory;
  /** lo que se le pregunta a Eris al tocar "Pedir ideas" */
  prompt?: string;
  /**
   * El aviso puede traer una comida concreta: ReminderPlanner se la pide al servidor (services/nudgeSuggest.ts) y, si llega,
   * reemplaza el cuerpo. Sin conexión queda el texto de siempre.
   */
  suggest?: { need: 'fibra' | 'proteina' | 'colacion'; gapG?: number; forDinner?: boolean };
  /** el paso del plan de Eris (para «Lo comí ✓» sin abrir la app) */
  pasoId?: string;
}

// ─── Pauta de referencia ──────────────────────────────────────────────────────
// Comer a horas regulares (sin pasar más de ~4 h despierto sin comer) ayuda a llegar con menos hambre a la siguiente
// comida, a no picotear y a tener energía pareja. La porción de cada comida sale de TU meta del día.
const IDEAL: Record<string, { at: number; share: number }> = {
  desayuno: { at: 8 * 60 + 45, share: 0.25 },
  almuerzo: { at: 13 * 60 + 30, share: 0.35 },
  cena: { at: 20 * 60 + 30, share: 0.25 },
  once: { at: 19 * 60, share: 0.25 },
};
const MAIN_SHARE = 0.85;             // el resto (15 %) va en colaciones
const ADAPT_MIN = 60;                // hasta cuánto más tarde que lo ideal se considera "buena hora"
const LATE_NUDGE_MIN = 45;           // si comes más tarde que eso, se te empuja a esta distancia de lo ideal
const CHECK_DELAY_MIN = 75;          // si comes a buena hora, se pregunta qué comiste 75 min después
const MAX_GAP_MIN = 4 * 60;          // horas sin comer antes de sugerir una colación
const SNACK_LATEST = 19 * 60;
const PROTEIN_AT = 18 * 60 + 30;
const FIBER_AT = 16 * 60 + 30;         // a media tarde, cuando todavía cabe en una colación
const FIBER_BEHIND = 0.4;            // avisa si a esa hora vas bajo el 40 % de tu meta de fibra
const FIBER_ON_TRACK = 0.6;          // lo esperable a esa hora (desayuno + almuerzo)
const WATER_CHECKS = [11 * 60, 15 * 60, 19 * 60];
const WATER_BEHIND = 0.6;            // avisa si vas bajo el 60 % de lo esperado a esa hora
const TRAIN_AT = 18 * 60 + 30;
/** Si no respondió «¿entrenas hoy?» en la mañana: se insiste a mediodía y a media tarde (decisión del usuario: «hay gente muy despistada») */
export const INTENT_NAGS = [12 * 60 + 30, 16 * 60 + 30];
const PRE_WORKOUT_MIN = 75;   // comer algo ~1 h antes de entrenar
const POST_WORKOUT_MIN = 20;  // después de terminar, la comida con proteína
/** Minutos de ejercicio (Health Connect) para que un día cuente como entrenado */
export const EXERCISE_MIN = 20;
/** Pasos con los que ya no se pide moverse ese día */
export const MOVED_STEPS = 7000;
const STREAK_AT = 20 * 60 + 15;
const WEEKLY_SESSIONS = 2;           // mínimo razonable de sesiones por semana (150 min de actividad moderada, OMS)
const FINANCE_AT = 20 * 60 + 30;
const FINANCE_IDLE_DAYS = 3;
const DUE_AT = 19 * 60;
const PENDING_AT = 12 * 60;
const BUDGET_AT = 13 * 60 + 15;
const MONTH_AT = 10 * 60 + 30;

// ─── Para que ayude y no moleste ──────────────────────────────────────────────
export const QUIET_START = 22 * 60 + 30; // nada de noche
export const QUIET_END = 8 * 60;
export const MORNING_AT = 8 * 60;        // resumen de la mañana
export const CLOSE_AT = 22 * 60;         // cierre del día
const MAX_PER_DAY = 8;                   // sin contar los resúmenes
const MIN_GAP_MIN = 45;                  // separación mínima entre dos avisos
const KIND_CAP: Record<string, number> = { meal: 5, water: 2, training: 2, finance: 3, sleep: 2, focus: 3 };
const PRIORITY: Record<string, number> = { meal: 1, focus: 1, protein: 2, snack: 2, fiber: 2, water: 2, due: 3, pending: 3, coffee: 3, winddown: 3, training: 4, streak: 4, budget: 5, idle: 6, month: 7 };
/** «A acostarse»: 45 min antes de su ventana. Es lo único que puede llegar pasadas las 22:30 (hasta las 00:30), nunca después de su hora */
const WINDDOWN_MIN = 45;
/**
 * El día exigente (Modo Rendimiento): lo que cae junto (≤ 45 min desde el primero) va en UN aviso («café; después, a las
 * 9:00, tu mejor rato»), y estos avisos solo piden 20 min de separación con los demás: el café tiene que llegar a su hora.
 */
const CUE_GROUP_MIN = 45;
const FOCUS_GAP_MIN = 20;
const NIGHT_LIMIT = 30; // 00:30

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const atMinutes = (base: Date, minutes: number) => { const d = new Date(base); d.setHours(0, 0, 0, 0); d.setMinutes(minutes); return d; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const fmtInt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const clp = (n: number) => `$${fmtInt(n)}`;
const liters = (n: number) => `${(Math.round(n * 10) / 10).toString().replace('.', ',')} L`;
const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86400000);
const WEEKDAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MAIN_SLOTS = new Set(['desayuno', 'almuerzo', 'cena', 'once']);

const NEXT_LABEL: Record<string, string> = { desayuno: 'el desayuno', almuerzo: 'el almuerzo', cena: 'la cena', once: 'la once' };

// ─── El tono (lo elige la persona: services/tone.ts) ──────────────────────────
// Los datos son los mismos en los tres; cambia la forma. "usted" sin emojis ni jerga; "humor" con algún remate y emoji.
export interface Voice {
  usted: boolean;
  humor: boolean;
  /** la frase en tú o en usted */
  s: (tu: string, ud: string) => string;
  /** un emoji al final (nunca de usted) */
  e: (emoji: string) => string;
  /** tono «brígida» (2026-11-05): sin emojis, con su propio remate */
  brigida: boolean;
  /** un remate: el de humor, o el brígido si se da */
  h: (extra: string, brigido?: string) => string;
}
export function voice(tone: Tone = 'directo'): Voice {
  const usted = tone === 'usted', humor = tone === 'humor', brigida = tone === 'brigida';
  return {
    usted, humor, brigida, s: (tu, ud) => (usted ? ud : tu), e: (emoji) => (usted || brigida ? '' : ` ${emoji}`),
    h: (extra, brigido) => (humor ? ` ${extra}` : brigida && brigido ? ` ${brigido}` : ''),
  };
}
const checkTitle = (v: Voice, slot: string): string => {
  const t: Record<string, string> = {
    desayuno: v.s('¿Ya desayunaste?', '¿Ya desayunó?'), almuerzo: v.s('¿Qué almorzaste hoy?', '¿Qué almorzó hoy?'),
    cena: v.s('¿Qué cenaste?', '¿Qué cenó?'), once: v.s('¿Tomaste once?', '¿Tomó once?'),
  };
  const emoji: Record<string, string> = { desayuno: '☕', almuerzo: '🍽️', cena: '🌙', once: '🫖' };
  return `${t[slot]}${v.humor ? ` ${emoji[slot]}` : ''}`;
};
const nudgeTitle = (v: Voice, slot: string): string =>
  ({ desayuno: `¿Desayunamos?${v.e('☀️')}`, almuerzo: `Hora de almorzar${v.e('🍽️')}`, cena: `Hora de cenar${v.e('🌙')}`, once: `Hora de once${v.e('🫖')}` } as Record<string, string>)[slot];

// ─── Tus hábitos (solo para afinar la pauta) ─────────────────────────────────
export interface MealHabits {
  /** días con algo anotado de los últimos 14 */
  loggedDays: number;
  slots: Record<string, { days: number; median: number }>;
  /** la última comida del día: cena, o once si es lo que haces */
  dinnerSlot: 'cena' | 'once';
  /** horas típicas sin comer entre comidas (mediana del hueco más largo de cada día), en minutos */
  typicalMaxGap: number | null;
  /** el hábito a mejorar primero (uno a la vez), en palabras */
  focus: string | null;
}

export function analyzeHabits(history: PlanInput['mealHistory'], tone: Tone = 'directo'): MealHabits {
  const v = voice(tone);
  const first = new Map<string, number>(); // "día|comida" → primer minuto (una comida tiene varios alimentos)
  for (const h of history) { const k = `${h.day}|${h.slot}`; first.set(k, Math.min(first.get(k) ?? Infinity, h.minutes)); }
  const acc: Record<string, number[]> = {};
  const byDay = new Map<string, number[]>();
  for (const [k, m] of first) {
    const [day, slot] = k.split('|');
    (acc[slot] = acc[slot] ?? []).push(m);
    byDay.set(day, [...(byDay.get(day) ?? []), m]);
  }
  const slots: MealHabits['slots'] = {};
  for (const [slot, mins] of Object.entries(acc)) slots[slot] = { days: mins.length, median: median(mins) };
  const loggedDays = byDay.size;
  const dinnerSlot = (slots.once?.days ?? 0) >= 3 && (slots.once?.days ?? 0) > (slots.cena?.days ?? 0) ? 'once' : 'cena';
  const gaps = [...byDay.values()].filter((d) => d.length >= 2).map((d) => {
    const s = [...d].sort((a, b) => a - b);
    return Math.max(...s.slice(1).map((m, k) => m - s[k]));
  });
  const typicalMaxGap = gaps.length >= 3 ? median(gaps) : null;

  let focus: string | null = null;
  if (loggedDays >= 4) {
    const bf = slots.desayuno?.days ?? 0;
    const dinner = slots[dinnerSlot];
    if (bf / loggedDays < 0.4) focus = v.s(`Desayunaste ${bf} de los últimos ${loggedDays} días que anotaste: hoy parte con un desayuno con proteína.`,
      `Desayunó ${bf} de los últimos ${loggedDays} días que anotó: hoy parta con un desayuno con proteína.`);
    else if (dinner && dinner.days >= 3 && dinner.median >= 22 * 60) focus = `${v.s('Sueles', 'Suele')} cenar tarde (${hhmm(dinner.median)}); cenar 2-3 h antes de dormir ayuda a descansar mejor.`;
    else if (typicalMaxGap && typicalMaxGap >= 6 * 60) focus = `${v.s('Sueles', 'Suele')} pasar ~${Math.round(typicalMaxGap / 60)} h sin comer entre comidas; una colación al medio ${v.s('te', 'le')} ayuda a no llegar con tanta hambre.`;
    else if (slots.almuerzo && slots.almuerzo.days >= 3 && slots.almuerzo.median >= 15 * 60 + 30) focus = `${v.s('Sueles', 'Suele')} almorzar tarde (${hhmm(slots.almuerzo.median)}); adelantarlo reparte mejor ${v.s('tu', 'su')} energía del día.`;
  }
  return { loggedDays, slots, dinnerSlot, typicalMaxGap, focus };
}

interface MainMeal { slot: string; anchor: number; share: number; mode: 'check' | 'nudge'; reason: 'ok' | 'nodata' | 'skips' | 'late'; habit?: number; days?: number }

/** Las 3 comidas principales: a qué hora y si se pregunta (vas bien) o se empuja hacia lo óptimo. */
export function mainMeals(h: MealHabits): MainMeal[] {
  return ['desayuno', 'almuerzo', h.dinnerSlot].map((slot) => {
    const ideal = IDEAL[slot];
    const s = h.slots[slot];
    if (s && s.days >= 3) {
      if (s.median > ideal.at + ADAPT_MIN) return { slot, anchor: ideal.at + LATE_NUDGE_MIN, share: ideal.share, mode: 'nudge', reason: 'late', habit: s.median };
      return { slot, anchor: s.median, share: ideal.share, mode: 'check', reason: 'ok', habit: s.median };
    }
    if (h.loggedDays >= 4) return { slot, anchor: ideal.at, share: ideal.share, mode: 'nudge', reason: 'skips', days: s?.days ?? 0 };
    return { slot, anchor: ideal.at, share: ideal.share, mode: 'nudge', reason: 'nodata' };
  });
}

/** ¿Ya comió esa comida hoy? (la misma, cena↔once, o una colación anotada cerca de esa hora) */
function mealDone(m: MainMeal, meals: PlanInput['todayMeals']): boolean {
  const dinner = m.slot === 'cena' || m.slot === 'once';
  return meals.some((x) => x.slot === m.slot || (dinner && (x.slot === 'cena' || x.slot === 'once'))
    || (!MAIN_SLOTS.has(x.slot) && Math.abs(x.minutes - m.anchor) <= 60));
}

/** ¿Suele entrenar este día de la semana? (al menos 2 de las últimas 4 semanas) */
export function trainsOnWeekday(days: Record<string, number>, weekday: number, ref: Date): boolean {
  let hits = 0;
  for (let w = 1; w <= 4; w++) { const d = addDays(ref, -7 * w); if (d.getDay() === weekday && (days[dayKey(d)] ?? 0) > 0) hits++; }
  return hits >= 2;
}

/** Fracción del día "activo" (08:00 → 22:00) transcurrida a esa hora: para saber cuánta agua deberías llevar. */
const dayFraction = (minutes: number) => Math.max(0, Math.min(1, (minutes - 8 * 60) / (14 * 60)));

interface Candidate extends PlannedReminder { prio: number; shiftable: boolean; early?: boolean; night?: boolean }

/**
 * Los avisos de hoy (con lo que ya hiciste) y de mañana (desde cero), respetando horario, tope y separación.
 * `raw`: todo lo que las reglas piden, sin topes (para saber si un aviso ya mostrado sigue vigente).
 */
export function planReminders(i: PlanInput, opts: { raw?: boolean } = {}): PlannedReminder[] {
  const out: Candidate[] = [];
  const v = voice(i.tone);
  const nowMin = i.now.getHours() * 60 + i.now.getMinutes();
  const habits = analyzeHabits(i.mealHistory, i.tone);
  const mains = mainMeals(habits);
  const fin = i.finance ?? null;
  // Días con entreno: series en Forge O 20 min o más de ejercicio en Health Connect. Antes solo contaba Forge, y quien
  // entrenaba sin anotarlo ahí («hoy me hice cagar») recibía «Muévete un poco hoy» (2026-10-16).
  const activeDays: Record<string, number> = { ...i.trainingDays };
  for (const [k, min] of Object.entries(i.exerciseDays ?? {})) if (min >= EXERCISE_MIN) activeDays[k] = Math.max(activeDays[k] ?? 0, 1);
  const trainedDays = Object.keys(activeDays).filter((k) => activeDays[k] > 0).sort();
  const lastTrain = trainedDays[trainedDays.length - 1] ?? null;
  // Las frases que se repiten, en el tono de la persona
  const tu = v.s('tu', 'su'), tus = v.s('tus', 'sus'), te = v.s('te', 'le');
  const llevas = v.s('Llevas', 'Lleva'), cuentame = v.s('cuéntame', 'cuénteme'), comiste = v.s('comiste', 'comió');

  for (const offset of [0, 1]) {
    const day = addDays(i.now, offset);
    const dk = dayKey(day);
    const isToday = offset === 0;
    const meals = isToday ? i.todayMeals : [];
    const kcal = isToday ? i.kcalToday : 0;
    const protein = isToday ? i.proteinToday : 0;
    const water = isToday ? i.waterToday : 0;
    const trained = (activeDays[dk] ?? 0) > 0;
    // Ya se movió harto hoy (pasos): tampoco se le pide moverse
    const movedEnough = isToday && (i.stepsToday ?? 0) >= MOVED_STEPS;
    const reachedKcal = !!i.kcalGoal && kcal >= i.kcalGoal;
    const push = (c: Omit<Candidate, 'at'> & { minutes: number }) => {
      if (isToday && c.minutes <= nowMin + 5) return; // ya pasó
      out.push({ ...c, at: atMinutes(day, c.minutes) });
    };
    const mealTarget = (share: number) => {
      if (!i.kcalGoal) return '';
      const k = roundTo(i.kcalGoal * share, 50);
      const p = i.proteinGoal && !i.proteinIsCap ? roundTo((i.proteinGoal * share) / MAIN_SHARE, 5) : 0;
      return ` Para ${tu} meta, ${v.s('apunta', 'apunte')} a ~${fmtInt(k)} kcal${p ? ` con ~${p} g de proteína` : ''}.`;
    };

    // ── Comidas
    // Con plan de Eris (hoy), sus comidas avisan a su hora con lo que toca comer y «Lo comí ✓»; esas no llevan el aviso de siempre
    const planned = (isToday ? i.planMeals : i.planMealsTomorrow) ?? [];
    const enPlan = (slot: string) => planned.some((p) => p.slot === slot || ((slot === 'cena' || slot === 'once') && (p.slot === 'cena' || p.slot === 'once')));
    if (i.settings.meal && i.modules.nutri) {
      for (const pm of planned) {
        if (meals.some((x) => x.slot === pm.slot)) continue;
        push({ id: `plan-${pm.slot}`, kind: 'meal', category: 'plan_meal', prio: PRIORITY.meal, shiftable: true, minutes: Math.round(pm.hora * 60),
          title: `${pm.titulo}: lo del plan`, body: pm.detalle, pasoId: pm.pasoId });
      }
      for (const m of mains) {
        if (mealDone(m, meals) || enPlan(m.slot)) continue;
        if (m.mode === 'check' || reachedKcal) {
          const minutes = Math.max(QUIET_END + 15, m.anchor + CHECK_DELAY_MIN);
          if (m.slot !== 'desayuno' && i.settings.summary && minutes >= CLOSE_AT - 45) continue; // el cierre del día pregunta por la cena
          const progress = isToday && i.kcalGoal ? ` ${llevas} ${fmtInt(kcal)} de ${fmtInt(i.kcalGoal)} kcal hoy.` : '';
          push({ id: `meal-${m.slot}`, kind: 'meal', category: 'meal', prio: PRIORITY.meal, shiftable: true, minutes,
            title: checkTitle(v, m.slot), body: `${v.s('Cuéntame qué comiste y lo anoto al tiro', 'Cuénteme qué comió y lo anoto de inmediato')}${v.humor ? ' 📝' : '.'}${progress}` });
        } else {
          const why = m.reason === 'late'
            ? `${v.s('Sueles', 'Suele')} comer cerca de las ${hhmm(m.habit!)}; un poco antes reparte mejor ${tu} energía.`
            : m.reason === 'skips'
              ? (m.slot === 'desayuno'
                ? (i.settings.summary ? '' : v.s(`Desayunaste ${m.days} de los últimos ${habits.loggedDays} días que anotaste. `, `Desayunó ${m.days} de los últimos ${habits.loggedDays} días que anotó. `))
                  + `Partir el día comiendo ${te} ayuda a no llegar con tanta hambre al almuerzo.`
                : `Últimamente casi no ${v.s('anotas', 'anota')} ${NEXT_LABEL[m.slot]}. Comer a horas regulares ${te} ayuda a no picotear ni llegar con tanta hambre.`)
              : `Comer a horas regulares ${te} ayuda a tener energía pareja y a no llegar con tanta hambre a la siguiente comida.`;
          push({ id: `meal-${m.slot}`, kind: 'meal', category: 'meal', prio: PRIORITY.meal, shiftable: true, early: true, minutes: m.anchor,
            title: nudgeTitle(v, m.slot), body: `${why}${mealTarget(m.share)} Después ${cuentame} qué ${comiste}.` });
        }
      }
      // Fibra: a media tarde vas muy atrás (sin meta o sin nada anotado, no se sabe)
      const fiber = isToday ? i.fiberToday ?? 0 : 0;
      const fiberLow = isToday && !!i.fiberGoal && kcal > 0 && !reachedKcal && fiber < i.fiberGoal * FIBER_BEHIND;
      const fiberGap = i.fiberGoal ? Math.max(3, Math.round(i.fiberGoal * FIBER_ON_TRACK - fiber)) : undefined;
      // Colación: muchas horas desde tu última comida de hoy y todavía falta para la siguiente
      let snackAt: number | null = null;
      if (isToday && meals.length && !reachedKcal) {
        const last = Math.max(...meals.map((x) => x.minutes));
        const gapAt = last + MAX_GAP_MIN;
        const next = mains.find((m) => !mealDone(m, meals) && m.anchor > last);
        if (gapAt <= SNACK_LATEST && (!next || gapAt <= next.anchor - 90)) {
          snackAt = gapAt;
          push({ id: 'snack', kind: 'meal', category: 'meal_ideas', prio: PRIORITY.snack, shiftable: true, minutes: gapAt,
            title: `${llevas} ${MAX_GAP_MIN / 60} h sin comer${v.humor ? ' 👀' : ''}`, prompt: '¿Qué colación me recomiendas ahora con lo que tengo?',
            body: `Una colación liviana ${te} da energía${next ? ` hasta ${NEXT_LABEL[next.slot]}` : ''} y evita llegar con mucha hambre. ${v.s('¿Te sugiero algo con lo que tengas?', '¿Le sugiero algo con lo que tenga?')}`,
            // Si además vas corto de fibra, la colación es la oportunidad: un solo aviso que resuelve las dos cosas
            suggest: fiberLow && Math.abs(gapAt - FIBER_AT) <= 120 ? { need: 'fibra', gapG: fiberGap } : { need: 'colacion' } });
        }
      }
      if (fiberLow && !(snackAt !== null && Math.abs(snackAt - FIBER_AT) <= 120)) {
        push({ id: 'fiber', kind: 'meal', category: 'meal_ideas', prio: PRIORITY.fiber, shiftable: true, minutes: FIBER_AT,
          title: `${v.s('Te', 'Le')} falta fibra a esta hora${v.humor ? ' 👀' : ''}`, prompt: '¿Qué como para sumar fibra hoy?',
          body: `Sumar algo de fibra en la colación ${te} ayuda a llegar mejor a la cena. ${v.s('¿Te doy una idea con lo que tengas?', '¿Le doy una idea con lo que tenga?')}`,
          suggest: { need: 'fibra', gapG: fiberGap } });
      }
      // Proteína: a media tarde vas bajo la mitad de tu meta (no con enfermedad renal, donde es un tope, ni si ya llegaste a tus kcal)
      if (isToday && !i.proteinIsCap && !reachedKcal && i.proteinGoal && kcal > 0 && protein < i.proteinGoal * 0.5) {
        push({ id: 'protein', kind: 'meal', category: 'meal_ideas', prio: PRIORITY.protein, shiftable: true, minutes: PROTEIN_AT,
          title: `${v.s('Te', 'Le')} faltan ~${roundTo(i.proteinGoal - protein, 5)} g de proteína hoy${v.humor ? ' 💪' : ''}`, prompt: '¿Qué como en la cena para completar mi proteína de hoy?',
          body: `${llevas} ${Math.round(protein)} de ${Math.round(i.proteinGoal)} g. Que ${tu} próxima comida tenga una buena fuente de proteína. ${v.s('¿Te doy opciones con lo que tengas?', '¿Le doy opciones con lo que tenga?')}`,
          suggest: { need: 'proteina', gapG: roundTo(i.proteinGoal - protein, 5), forDinner: true } });
      }
    }

    // ── ⚡ El día exigente (lo eligió la persona hoy): el café, la siesta-café y los bloques, a su hora, con «Hecho ✓»
    const cues = isToday ? [...(i.planCues ?? [])].sort((a, b) => a.hora - b.hora) : [];
    for (let k = 0; k < cues.length;) {
      const g = [cues[k]];
      while (++k < cues.length && cues[k].hora - g[0].hora <= CUE_GROUP_MIN / 60) g.push(cues[k]);
      const [first, ...rest] = g;
      const despues = rest.map((c) => `${hhmm(Math.round(c.hora * 60) % 1440)} ${c.titulo.replace(/^\S+\s/, '').replace(/^./, (x) => x.toLowerCase())}`);
      push({ id: `focus-${first.pasoId}`, kind: 'focus', category: 'plan_cue', prio: PRIORITY.focus, shiftable: true, minutes: Math.round(first.hora * 60),
        title: first.titulo, body: `${first.detalle.split(/(?<=\.)\s/)[0]}${despues.length ? ` Después: ${despues.join(' · ')}.` : ''}`, pasoId: first.pasoId });
    }

    // ── Agua: a las 11, 15 y 19 h, solo si vas bajo el 60 % de lo esperado a esa hora (sin meta: nunca)
    if (i.settings.water && i.modules.nutri && i.waterGoal && i.waterGoal > 0) {
      for (const t of WATER_CHECKS) {
        const expected = i.waterGoal * dayFraction(t);
        if (water >= expected * WATER_BEHIND) continue;
        push({ id: `water-${t}`, kind: 'water', category: 'water', prio: PRIORITY.water, shiftable: true, minutes: t,
          title: water > 0 ? `${v.s('Vas', 'Va')} en ${liters(water)} de agua${v.humor ? ' 💧' : ''}` : `Aún no ${v.s('anotas', 'anota')} agua hoy${v.humor ? ' 🌵' : ''}`,
          body: `A esta hora lo ideal es ir en ~${liters(expected)} de ${tus} ${liters(i.waterGoal)}. ¿Un vaso ahora?${v.h('Tu cuerpo te lo va a agradecer 💧', 'Sin cuento.')}` });
      }
    }

    // ── Entreno / movimiento
    if (i.settings.training && i.modules.forge) {
      const intent = isToday ? i.intentToday ?? null : null;
      // «¿Entrenas hoy?» sin responder: se insiste dos veces (se corta al responder o al detectar entreno)
      if (isToday && i.askIntent && !intent && !trained && !movedEnough) {
        INTENT_NAGS.forEach((m, k) => push({ id: `intent-${k + 1}`, kind: 'training', category: 'intent', prio: PRIORITY.protein, shiftable: true, minutes: m,
          title: k === 0 ? `¿Hoy ${v.s('entrenas', 'entrena')}?${v.e('🏋️')}` : `${v.s('Cuéntame', 'Cuénteme')}: ¿hoy ${v.s('entrenas', 'entrena')} o ${v.s('descansas', 'descansa')}?`,
          body: `Así ${tu}s calorías y ${tu} agua de hoy calzan con lo que ${v.s('vas', 'va')} a hacer. Si ${v.s('descansas', 'descansa')}, también cuenta.` }));
      }
      // Entreno declarado: comer antes (con una comida concreta) y la proteína después; nada de «muévete»
      if (intent?.answer === 'si' && intent.time) {
        const [hh, mm] = intent.time.split(':').map(Number);
        const t = hh * 60 + mm;
        if (!trained) push({ id: 'meal-pre-workout', kind: 'training', category: 'meal_ideas', prio: PRIORITY.meal, shiftable: false, minutes: Math.max(QUIET_END, t - PRE_WORKOUT_MIN),
          title: `${v.s('Entrenas', 'Entrena')} a las ${intent.time}: ${v.s('come', 'coma')} algo ahora${v.e('🍌')}`,
          body: 'Algo con carbohidratos y un poco de proteína (fruta con yogur, pan con huevo) para llegar con energía.'
            + (i.glucoseCaution ? ` Con ${tu} tratamiento, ${v.s('mide tu', 'mida su')} glucosa antes y después, y ${v.s('ten', 'tenga')} algo dulce a mano.` : ''),
          prompt: `Entreno a las ${intent.time}, ¿qué como ahora?`, suggest: { need: 'colacion' } });
        push({ id: 'meal-post-workout', kind: 'training', category: 'meal', prio: PRIORITY.meal, shiftable: false, minutes: Math.min(QUIET_START - 10, t + (intent.minutes ?? 60) + POST_WORKOUT_MIN),
          title: `¿Cómo ${v.s('te', 'le')} fue el entreno?${v.e('💪')}`,
          body: `Una comida con ~30 g de proteína ${te} ayuda a recuperar${v.s('te', 'se')}. ${v.s('Anota', 'Anote')} tus series en Forge si no lo ${v.s('hiciste', 'hizo')}.` });
      }
      if (intent) {
        // Ya dijo qué hace hoy: ni «hoy toca entrenar» ni «muévete»
      } else if (!trained && !movedEnough && trainsOnWeekday(activeDays, day.getDay(), i.now)) {
        push({ id: 'training', kind: 'training', category: 'training', prio: PRIORITY.training, shiftable: true, minutes: TRAIN_AT,
          title: `Hoy ${te} toca entrenar${v.e('💪')}`,
          body: `${v.s('Sueles', 'Suele')} entrenar los ${WEEKDAYS[day.getDay()]}. Después, una comida con ~30 g de proteína ${te} ayuda a recuperar${v.s('te', 'se')}. ${v.s('Registra tu', 'Registre su')} sesión en Forge${v.humor ? ' y sube de nivel 🔥' : '.'}` });
      } else if (!trained && !movedEnough) {
        // Lo óptimo no es lo que haces: si casi no entrenas, Eris te empuja (día por medio, no todos los días)
        const since = lastTrain ? daysBetween(lastTrain, dk) : null;
        const week = trainedDays.filter((k) => { const d = daysBetween(k, dk); return d >= 0 && d < 7; }).length;
        const due = since === null ? [1, 3, 5].includes(day.getDay()) : since >= 3 && week < WEEKLY_SESSIONS;
        if (due) {
          push({ id: 'move', kind: 'training', category: 'training', prio: PRIORITY.training, shiftable: true, minutes: TRAIN_AT,
            title: since === null ? `${v.s('Muévete', 'Muévase')} un poco hoy${v.e('🏃')}` : `${llevas} ${since} días sin entrenar`,
            body: 'Lo recomendado son al menos 150 min de actividad moderada a la semana. Una sesión corta en Forge o 30 min de caminata cuentan.' });
        }
      }
      if (isToday && i.forgeStreak?.atStake && i.forgeStreak.streak >= 3) {
        push({ id: 'streak', kind: 'training', category: 'training', prio: PRIORITY.streak, shiftable: true, minutes: STREAK_AT,
          title: `${v.s('Tu', 'Su')} racha de ${i.forgeStreak.streak} días está en juego${v.e('🔥')}`,
          body: `${v.s('Completa tus', 'Complete sus')} misiones de hoy en Forge y ${v.s('reclama', 'reclame')} el día para no perderla.` });
      }
    }

    // ── Finanzas
    if (i.settings.finance && i.modules.finanzas && fin) {
      if (fin.ultimoMovimiento) {
        const idle = daysBetween(fin.ultimoMovimiento, dk);
        if (idle >= FINANCE_IDLE_DAYS) {
          push({ id: 'finance-idle', kind: 'finance', category: 'finance', prio: PRIORITY.idle, shiftable: true, minutes: FINANCE_AT,
            title: `${v.s('Tus', 'Sus')} finanzas llevan ${idle} días sin movimientos`,
            body: `${v.s('¿Compraste algo? Cuéntamelo', '¿Compró algo? Cuéntemelo')} ("gasté 5 lucas en almuerzo") y lo anoto.${v.h('Tu yo del futuro te lo agradece 🫡', 'Plata que no se anota, plata que se pierde.')}` });
        }
      }
      for (const p of fin.proximos ?? []) {
        const daysAhead = p.enDias - offset; // días desde ESTE día hasta esa fecha
        if (p.tipo === 'gasto' && daysAhead === 1) {
          push({ id: `due-${p.desc}`, kind: 'finance', category: 'finance', prio: PRIORITY.due, shiftable: true, minutes: DUE_AT,
            title: `Mañana vence ${p.desc}`, body: `${clp(p.monto)}. ${v.s('Revisa que tengas', 'Revise que tenga')} saldo en la cuenta de pago.` });
        }
        if (p.tipo === 'ingreso' && daysAhead === 0) {
          push({ id: `income-${p.desc}`, kind: 'finance', category: 'finance', prio: PRIORITY.pending, shiftable: true, minutes: DUE_AT,
            title: `Hoy debería llegar ${p.desc}`, body: `${clp(p.monto)}. Cuando llegue, ${v.s('confírmalo', 'confírmelo')} en Finanzas para que ${tus} saldos cuadren.` });
        }
      }
      if (isToday) {
        for (const p of (fin.pendientes ?? []).slice(0, 1)) {
          push({ id: `pending-${p.desc}`, kind: 'finance', category: 'finance', prio: PRIORITY.pending, shiftable: true, minutes: PENDING_AT,
            title: `¿${v.s('Te', 'Le')} llegó ${p.desc}?`, body: `Debía llegar el ${p.fecha.slice(8)}/${p.fecha.slice(5, 7)} (${clp(p.monto)}). ${v.s('Confírmalo', 'Confírmelo')} en Finanzas.` });
        }
        // Presupuesto al día del mes (núcleo nativo): UN aviso, la categoría más pasada; si va al día, nada
        const pres = (fin.presupuesto ?? []).filter((l) => l.presup > 0 && (l.estado === 'sobre' || l.estado === 'apurado'));
        const peor = [...pres].sort((a, b) => (a.estado === b.estado ? (b.gastado - b.presup) - (a.gastado - a.presup) : a.estado === 'sobre' ? -1 : 1))[0];
        if (peor) {
          const nombre = CAT_AVISO[peor.cat] ?? peor.cat, esComida = peor.cat === 'alimentacion';
          push({ id: `budget-${peor.cat}`, kind: 'finance', category: 'finance', prio: PRIORITY.budget, shiftable: true, minutes: BUDGET_AT,
            ...(peor.estado === 'sobre'
              ? { title: `${v.s('Te pasaste', 'Se pasó')} del presupuesto de ${nombre}`,
                  body: `${clp(peor.gastado)} de ${clp(peor.presup)} este mes. No pasa nada: ${v.s('mira en Finanzas', 'mire en Finanzas')} si el tope era muy bajo${esComida ? ` o ${v.s('pídeme', 'pídame')} opciones económicas` : ''}.` }
              : { title: `${nombre.charAt(0).toUpperCase() + nombre.slice(1)}: ≤ ${clp(peor.porDia)} al día para cerrar en presupuesto`,
                  body: `${v.s('Te quedan', 'Le quedan')} ${clp(peor.queda)} de ${clp(peor.presup)} este mes.${esComida ? ` ${v.s('Si quieres, te propongo', 'Si quiere, le propongo')} opciones económicas.` : ''}` }) });
        }
        // Lo que viene antes del sueldo no alcanza: los lunes, para alcanzar a ordenarse (no todos los días)
        if (fin.libre != null && fin.libre < 0 && day.getDay() === 1) {
          push({ id: 'short', kind: 'finance', category: 'finance', prio: PRIORITY.budget, shiftable: true, minutes: BUDGET_AT,
            title: `Ojo con los fijos que vienen`,
            body: `Con lo que ${v.s('tienes', 'tiene')} y lo que se cobra antes de${fin.proximoIngreso ? ` ${tu} ${fin.proximoIngreso.desc.replace(/\s*\([^)]*\)/g, '').toLowerCase()}` : ' fin de mes'}, faltarían ${clp(-fin.libre)}. ¿Lo revisamos en Finanzas?` });
        }
        const c = fin.comida;
        if (!fin.presupuesto && c && c.presup > 0 && c.gastado / c.presup >= 0.85) {
          push({ id: 'budget-food', kind: 'finance', category: 'finance', prio: PRIORITY.budget, shiftable: true, minutes: BUDGET_AT,
            title: `${llevas} el ${Math.round((c.gastado / c.presup) * 100)} % de ${tu} presupuesto de comida`,
            body: `${clp(c.gastado)} de ${clp(c.presup)} este mes. ${v.s('Si quieres, te propongo', 'Si quiere, le propongo')} opciones económicas.` });
        }
      }
      if (day.getDate() === 1) {
        push({ id: 'month', kind: 'finance', category: 'finance', prio: PRIORITY.month, shiftable: true, minutes: MONTH_AT,
          title: `Empezó ${MONTHS[day.getMonth()]}`, body: `Buen momento para revisar cómo cerró el mes pasado y ajustar ${tu} presupuesto en Finanzas.` });
      }
    }

    // ── Sueño (Sueño 2.0 · S4): sin culpa y nunca de madrugada
    const sl = i.sleep;
    if (i.settings.sleep && sl) {
      const fmt = (h: number) => { const m = ((Math.round(h * 60) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }; // «00:45», como en Sueño
      // La hora límite del café (acostarse − 6 h; Drake 2013), media hora antes, solo a quien toma café de tarde
      const cafMin = Math.round((sl.caffeineUntil - 0.5) * 60);
      const cafePlan = cues.some((c) => c.cue === 'cafe' || c.cue === 'siesta_cafe');
      if (sl.coffeeAfternoon && !(isToday && (sl.lateCaffeineToday || cafePlan)) && cafMin >= 12 * 60) {
        push({ id: 'sleep-coffee', kind: 'sleep', prio: PRIORITY.coffee, shiftable: true, minutes: cafMin,
          title: `Último café${v.e('☕')}`, body: `Hasta las ${fmt(sl.caffeineUntil)} ${v.s('puedes', 'puede')} tomar café; después, mejor sin cafeína para dormir bien.${v.h('Tu yo de mañana lo agradece 😴', 'Sin excepciones.')}` });
      }
      // A acostarse: solo si el horario se viene corriendo, hay deuda o un plan en curso (si duerme bien, no se le molesta)
      if (sl.drifting || sl.debtH >= 3 || sl.plan) {
        push({ id: 'sleep-winddown', kind: 'sleep', prio: PRIORITY.winddown, shiftable: false, night: true, minutes: Math.round(sl.bedFrom * 60) - WINDDOWN_MIN,
          title: `En 45 min, a acostarse${v.e('🌙')}`,
          body: `${v.s('Tu', 'Su')} hora: entre las ${fmt(sl.bedFrom)} y las ${fmt(sl.bedTo)}. Luz baja y menos pantalla desde ahora${sl.plan ? ` (${v.s('tu', 'su')} meta: ${sl.plan.title.toLowerCase()})` : ''}.` });
      }
    }

    // ── Resúmenes (fuera del tope diario)
    if (i.settings.summary) {
      const parts: string[] = [];
      if (i.modules.nutri && i.kcalGoal) parts.push(`meta de ${fmtInt(i.kcalGoal)} kcal${i.waterGoal ? ` y ${liters(i.waterGoal)} de agua` : ''}`);
      const askToday = isToday && i.askIntent && !i.intentToday && i.modules.forge && i.settings.training;
      if (i.modules.forge && !trained && !askToday && trainsOnWeekday(activeDays, day.getDay(), i.now)) parts.push(`${te} toca entrenar`);
      const dueToday = (fin?.proximos ?? []).filter((p) => p.tipo === 'gasto' && p.enDias - offset === 0);
      if (i.modules.finanzas && dueToday.length) parts.push(`hoy vence ${dueToday[0].desc} (${clp(dueToday[0].monto)})`);
      const focus = i.modules.nutri ? habits.focus : null;
      // Sueño (S4): la meta del plan o, si el horario se corre, luz de mañana; y cómo durmió (se ve al abrir la app)
      // Piloto automático (T3): el día de mañana ya lo armó Eris
      const pm0 = !isToday && i.planMealsTomorrow?.length ? i.planMealsTomorrow[0] : null;
      const armado = pm0 ? `${v.s('Tu', 'Su')} día ya lo armó Eris: ${pm0.titulo.replace(/^\S+\s/, '').toLowerCase()} a las ${hhmm(Math.round(pm0.hora * 60) % 1440)}.` : '';
      const sueno = i.settings.sleep && i.sleep
        ? [i.sleep.plan ? `${v.s('Tu', 'Su')} meta de sueño: ${i.sleep.plan.title.toLowerCase()} (${i.sleep.plan.text.replace(/\.$/, '')}).`
          : i.sleep.drifting ? `Luz de mañana apenas ${v.s('puedas', 'pueda')}: es lo que más ordena ${tu} horario de sueño.` : '',
          `${v.s('Abre la app y te cuento cómo dormiste', 'Abra la app y le cuento cómo durmió')}.`].filter(Boolean).join(' ')
        : '';
      if ((parts.length || focus || sueno || armado) && !(isToday && MORNING_AT <= nowMin)) {
        out.push({ id: 'morning', kind: 'summary', prio: 0, shiftable: false, at: atMinutes(day, MORNING_AT),
          ...(askToday ? { category: 'intent' as const } : {}),
          title: `Buenos días${i.name ? `, ${i.name}` : ''}${v.e('☀️')}`, body: [parts.length ? `Hoy: ${parts.join(' · ')}.` : '', askToday ? `¿Hoy ${v.s('entrenas', 'entrena')}?` : '', armado, focus ?? '', sueno].filter(Boolean).join(' ') });
      }
      if (i.modules.nutri && !(isToday && CLOSE_AT <= nowMin)) {
        const dinner = mains[2];
        const dinnerDone = mealDone(dinner, meals);
        let title: string, body: string;
        if (kcal <= 0) {
          title = `Hoy no ${v.s('anotaste', 'anotó')} comidas`;
          body = `${v.s('¿Me cuentas qué comiste?', '¿Me cuenta qué comió?')} Con ${tu} día completo ${te} puedo ayudar de verdad, no solo adivinar.`;
        } else {
          const bits = [`${fmtInt(kcal)}${i.kcalGoal ? ` de ${fmtInt(i.kcalGoal)}` : ''} kcal`];
          if (i.proteinGoal && !i.proteinIsCap) bits.push(`${Math.round(protein)} de ${Math.round(i.proteinGoal)} g de proteína`);
          if (i.waterGoal) bits.push(`${liters(water)} de ${liters(i.waterGoal)} de agua`);
          title = dinnerDone ? `Cierre del día${v.humor ? ' 🌙' : ''}` : checkTitle(v, dinner.slot);
          body = `Hoy ${llevas.toLowerCase()} ${bits.join(', ')}. ${dinnerDone ? `¿${v.s('Te', 'Le')} faltó anotar algo?${v.h('Sin juicio, prometido 🤞', 'Sin juicio, pero sin mentiras.')}` : `${v.s('Cuéntame', 'Cuénteme')} y cierro ${tu} día.`}`;
        }
        out.push({ id: 'close', kind: 'summary', category: 'meal', prio: 0, shiftable: false, at: atMinutes(day, CLOSE_AT), title, body });
      }
    }
  }

  return (opts.raw ? out : applyLimits(out, i.now)).map(({ prio: _p, shiftable: _s, ...r }) => ({ ...r, id: `eris-plan-${dayKey(r.at)}-${r.id}` }));
}

const MAX_SHIFT_MIN = 90; // cuánto puede moverse un aviso (antes o después) para no chocar con otro

/** Horario permitido, tope por día y por tipo, y separación mínima (si choca, se mueve al hueco libre más cercano o se descarta). */
function applyLimits(cands: Candidate[], now: Date): Candidate[] {
  const gap = MIN_GAP_MIN * 60000, maxShift = MAX_SHIFT_MIN * 60000, notBefore = now.getTime() + 5 * 60000;
  const inWindow = (d: Date, night = false) => { const m = d.getHours() * 60 + d.getMinutes(); return (m >= QUIET_END && m <= QUIET_START) || (night && (m > QUIET_START || m <= NIGHT_LIMIT)); };
  const byDay = new Map<string, Candidate[]>();
  for (const c of cands) {
    if (!inWindow(c.at, c.night)) continue;
    // lo de pasada la medianoche (el «a acostarse» de las 00:15) cuenta en el día anterior
    const k = dayKey(c.night && c.at.getHours() < 12 ? new Date(c.at.getTime() - 12 * 3_600_000) : c.at);
    byDay.set(k, [...(byDay.get(k) ?? []), c]);
  }
  const kept: Candidate[] = [];
  for (const list of byDay.values()) {
    const summaries = list.filter((c) => c.kind === 'summary');
    // Variedad: primero lo más importante de cada tipo, después lo segundo de cada tipo, y así. Las 3 comidas principales
    // van siempre en la primera vuelta: son la base del día y lo demás se acomoda alrededor.
    const seen: Record<string, number> = {};
    const rest = list.filter((c) => c.kind !== 'summary')
      .sort((a, b) => a.prio - b.prio || a.at.getTime() - b.at.getTime())
      .map((c) => { const k = c.id.startsWith('meal-') ? c.id : c.kind; return { c, rank: (seen[k] = (seen[k] ?? -1) + 1) }; })
      .sort((a, b) => a.rank - b.rank || a.c.prio - b.c.prio || a.c.at.getTime() - b.c.at.getTime())
      .map((x) => x.c);
    const accepted: Candidate[] = [...summaries];
    const perKind: Record<string, number> = {};
    for (const c of rest) {
      if (accepted.length - summaries.length >= MAX_PER_DAY) break;
      if ((perKind[c.kind] ?? 0) >= (KIND_CAP[c.kind] ?? 2)) continue;
      const want = c.at.getTime();
      const gapOf = (a: Candidate) => (a.kind === 'focus' || c.kind === 'focus' ? FOCUS_GAP_MIN * 60000 : gap);
      const free = (t: number) => !accepted.some((a) => Math.abs(a.at.getTime() - t) < gapOf(a));
      // La hora pedida, o justo antes/después de cada aviso ya puesto; gana la más cercana (a igual distancia, la más tarde,
      // salvo si es para ir a comer: ahí antes)
      const options = c.shiftable
        ? [want, ...accepted.flatMap((a) => [a.at.getTime() - gapOf(a), a.at.getTime() + gapOf(a)])]
          .filter((t) => Math.abs(t - want) <= maxShift)
          .sort((x, y) => Math.abs(x - want) - Math.abs(y - want) || (c.early ? x - y : y - x))
        : [want];
      const t = options.find((t) => free(t) && t > notBefore && inWindow(new Date(t), c.night));
      if (t === undefined) continue;
      accepted.push({ ...c, at: new Date(t) });
      perKind[c.kind] = (perKind[c.kind] ?? 0) + 1;
    }
    kept.push(...accepted);
  }
  return kept.sort((a, b) => a.at.getTime() - b.at.getTime());
}

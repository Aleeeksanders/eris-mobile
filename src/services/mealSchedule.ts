// ============================================================
// Eris — el horario de cada persona: a qué comida corresponde una hora y a qué día cuenta lo que se come
//
// 2026-10-10 (pedido del usuario): 'el desayuno no es desayuno a las 12 pm, sería una colación mañanera'. Lo que manda es
// la hora en que se COMIÓ, no la hora en que se anotó. Antes había cuatro tablas distintas (el selector de Nutrición, la
// sincronización con el chat, el chat y la evaluación de calidad) y una ponía la once DESPUÉS de la cena.
//
// 2026-10-10, segunda parte ('¿y la gente que trasnocha?'):
// - El horario se arma sobre el día de cada uno. Quien despierta entre las 5 y las 9 sigue el horario chileno de siempre
//   (ancla 7:30: desayuno 5:00–10:30 · colación 10:30–12:30 · almuerzo 12:30–15:30 · colación 15:30–17:30 · once 17:30–20:00
//   · cena 20:00–5:00). Quien despierta más tarde (o antes de las 5, en turnos) corre la tabla: ¾ de lo que se corrió el
//   despertar (despertar a las 13:00 → almuerzo 15:30–18:30, cena desde las 23:00).
// - El día de COMIDA termina cuando te duermes, no a medianoche: lo comido a las 2 AM sin haber dormido cuenta para el día
//   anterior (antes ese día quedaba corto y el siguiente partía con comida que no era suya). El día nuevo empieza al
//   despertar de un sueño de 3 h o más, o a la hora habitual de partida (5:00 si no se sabe).
// - 'Más o menos': ±45 min de tolerancia entre comidas.
//
// La hora de despertar sale del reloj (Health Connect: hoy, y la habitual de las últimas semanas) o de Perfil.
// El servidor (eris/src/services/MealSchedule.ts) es COPIA EXACTA de este archivo: se edita acá y se copia con
// `bun scripts/sync_copias.ts` (--revisar avisa si difieren).
// ============================================================

export const MEAL_ORDER = ['desayuno', 'colacion_am', 'almuerzo', 'colacion_pm', 'once', 'cena'] as const;

type Win = [number, number];
/** Ventanas desde el ancla del día (horas). Con el ancla de siempre (7:30) es la tabla chilena de arriba. */
const OFFSETS: Record<string, Win> = {
  desayuno: [-2.5, 3], colacion_am: [3, 5], almuerzo: [5, 8], colacion_pm: [8, 10], once: [10, 12.5], cena: [12.5, 21.5],
};
/** Hora representativa de cada comida desde el ancla (para lo que se anota después de comerlo). */
const TYPICAL: Record<string, number> = { desayuno: 0.75, colacion_am: 3.5, almuerzo: 6, colacion_pm: 9, once: 11, cena: 13.5 };
/** La merienda es la colación de la tarde. */
const ALIAS: Record<string, string> = { merienda: 'colacion_pm' };
export const MEAL_NAME: Record<string, string> = {
  desayuno: 'desayuno', colacion_am: 'colación de media mañana', almuerzo: 'almuerzo', colacion_pm: 'colación de la tarde',
  merienda: 'merienda', once: 'once', cena: 'cena',
};
/** 'Más o menos': cuánto puede correrse una comida de su ventana y seguir siendo esa comida. */
export const TOLERANCE_H = 0.75;
const DEFAULT_ANCHOR = 7.5;

const known = (slot: string) => ALIAS[slot] ?? slot;
const okHour = (w: unknown): w is number => typeof w === 'number' && Number.isFinite(w) && w >= 0 && w < 24;

/** Hora local con decimales (8:30 → 8,5). */
export const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60;

/** Ancla del día según la hora de despertar: 7:30 entre 5 y 9; fuera de eso se corre ¾ de lo que se corrió el despertar. */
export function anchorHour(wakeHour?: number | null): number {
  if (!okHour(wakeHour)) return DEFAULT_ANCHOR;
  // Pasadas las 15:00 la tabla se corre entera: con ¾ el desayuno quedaba antes de despertar (a las 23:50 tocaba «almuerzo»).
  // El almuerzo nunca antes de 2 h después de despertar.
  if (wakeHour > 9) return Math.max(DEFAULT_ANCHOR + 0.75 * (wakeHour - 9), wakeHour - 3);
  if (wakeHour < 5) return DEFAULT_ANCHOR - 0.75 * (5 - wakeHour);
  return DEFAULT_ANCHOR;
}

/** Las ventanas de cada comida (horas desde la medianoche; la cena pasa de 24). El desayuno dura hasta 3 h después de despertar. */
export function mealWindows(wakeHour?: number | null): Record<string, Win> {
  const A = anchorHour(wakeHour);
  const w: Record<string, Win> = {};
  for (const s of MEAL_ORDER) w[s] = [A + OFFSETS[s][0], A + OFFSETS[s][1]];
  if (okHour(wakeHour)) {
    // Despertó antes del inicio del desayuno (turno temprano): el desayuno empieza al despertar
    if (wakeHour < w.desayuno[0]) w.desayuno[0] = wakeHour;
    // Despertó tarde: el desayuno dura hasta 3 h después (sin pasar al almuerzo)
    if (wakeHour + 3 > w.desayuno[1]) {
      const end = Math.min(w.almuerzo[0], wakeHour + 3);
      w.desayuno[1] = end;
      w.colacion_am = [end, Math.max(end, w.colacion_am[1])];
    }
  }
  w.cena[1] = w.desayuno[0] + 24; // el ciclo se cierra donde empieza el desayuno del día siguiente
  return w;
}

/** Horas desde que empieza el ciclo del día (el inicio del desayuno), de 0 a 24. */
const relTo = (start: number, h: number) => (((h - start) % 24) + 24) % 24;
const inWin = (rel: number, start: number, [a, b]: Win, tol = 0) =>
  [rel, rel + 24, rel - 24].some((r) => r >= a - start - tol && r < b - start + tol);

/** La comida que corresponde a esa hora, entre las que el usuario usa (`available`; sin lista, las 6). */
export function slotAt(at: Date | number, opts: { wakeHour?: number | null; available?: string[] } = {}): string {
  const h = typeof at === 'number' ? at : hourOf(at);
  const win = mealWindows(opts.wakeHour);
  const start = win.desayuno[0];
  const rel = relTo(start, h);
  const ideal = MEAL_ORDER.find((s) => inWin(rel, start, win[s])) ?? 'cena';
  const avail = opts.available;
  if (!avail?.length || avail.includes(ideal)) return ideal;
  if (ideal === 'colacion_pm' && avail.includes('merienda')) return 'merienda';
  // Si no usa esa comida: la más cercana entre las que sí usa
  const dist = (s: string) => {
    const w = win[known(s)];
    if (!w) return Infinity;
    const a = w[0] - start, b = w[1] - start;
    return rel < a ? a - rel : rel >= b ? rel - b : 0;
  };
  return [...avail].filter((s) => win[known(s)]).sort((a, b) => dist(a) - dist(b))[0] ?? avail[0];
}

/** ¿Esa hora calza con esa comida (con la tolerancia)? Las comidas propias del usuario (sin ventana conocida) siempre calzan. */
export function fitsSlot(slot: string, at: Date | number, wakeHour?: number | null): boolean {
  const win = mealWindows(wakeHour);
  const w = win[known(slot)];
  if (!w) return true;
  const start = win.desayuno[0];
  return inWin(relTo(start, typeof at === 'number' ? at : hourOf(at)), start, w, TOLERANCE_H);
}

/** La comida que cuenta para los cálculos: la anotada si calza con la hora en que se comió; si no, la de esa hora. */
export function effectiveSlot(slot: string, at: Date, opts: { wakeHour?: number | null; available?: string[] } = {}): string {
  if (!slot) return slotAt(at, opts);
  return Number.isNaN(at.getTime()) || fitsSlot(slot, at, opts.wakeHour) ? slot : slotAt(at, opts);
}

/** ¿Ya pasó esa comida en el día de hoy (terminó su ventana, con la tolerancia)? Anotarla ahora = se comió antes. */
export function slotIsPast(slot: string, now: Date, wakeHour?: number | null): boolean {
  const win = mealWindows(wakeHour);
  const w = win[known(slot)];
  if (!w) return false;
  const start = win.desayuno[0];
  return relTo(start, hourOf(now)) >= w[1] - start + TOLERANCE_H;
}

/**
 * Una hora representativa de esa comida en ese día de comida (`day`, ver nutritionDayOf), sin pasar de `notAfter`. Puede
 * caer el día calendario siguiente (la cena de quien trasnocha). Lleva los segundos del momento en que se anota: dos
 * alimentos anotados a la misma hora no comparten identidad.
 */
export function typicalTimeOf(slot: string, day: Date, opts: { wakeHour?: number | null; notAfter?: Date } = {}): Date {
  const A = anchorHour(opts.wakeHour);
  let h = A + (TYPICAL[known(slot)] ?? 4.5);
  if (known(slot) === 'desayuno' && okHour(opts.wakeHour)) h = opts.wakeHour + 0.75;
  const now = new Date();
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(Math.round(h * 60));
  d.setSeconds(now.getSeconds(), now.getMilliseconds());
  return opts.notAfter && d.getTime() > opts.notAfter.getTime() ? new Date(opts.notAfter) : d;
}

/** La hora típica de esa comida (horas desde la medianoche; la cena de quien trasnocha puede pasar de 24). null si no es de la tabla. */
export function typicalHour(slot: string, wakeHour?: number | null): number | null {
  const k = known(slot);
  if (TYPICAL[k] === undefined) return null;
  if (k === 'desayuno' && okHour(wakeHour)) return wakeHour + 0.75;
  return anchorHour(wakeHour) + TYPICAL[k];
}

/** '8:15' */
export const hhmm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

// ─── El día de comida ─────────────────────────────────────────────

/** Lo que se sabe del sueño: cuándo despertó del sueño principal más reciente y la hora habitual de despertar. */
export interface DayCtx {
  wakeAt?: Date | string | null; usualWake?: number | null;
  /**
   * Cuándo se abrió el día de comida, si no es wakeAt: despertó de madrugada, comió y volvió a dormir (sleepCore.dayOpen). Los
   * límites del día (qué es de hoy) salen de aquí; el horario de las comidas, de wakeAt. 2026-11-17: con el día desde las 7:25,
   * el cereal de las 3:13 quedaba en el día de ayer y Métricas mostraba solo el agua.
   */
  openAt?: Date | string | null;
}

const dateOf = (v: Date | string | null | undefined) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
/** Desde cuándo cuenta el día de comida: openAt si es de esa misma noche (antes del despertar y a menos de 12 h), si no wakeAt */
const abreDia = (ctx: DayCtx): Date | null => {
  const w = dateOf(ctx.wakeAt), o = dateOf(ctx.openAt);
  return o && (!w || (o.getTime() <= w.getTime() && w.getTime() - o.getTime() <= 12 * 3_600_000)) ? o : w;
};

/** A qué hora parte habitualmente el día de comida (el inicio del desayuno con el despertar habitual; 5:00 si no se sabe). */
export function dayStartHour(usualWake?: number | null): number {
  return Math.min(15, Math.max(2, mealWindows(usualWake).desayuno[0]));
}

/** Desde esta hora, un despertar abre el día de comida SIGUIENTE (igual que sleepCore.EVENING_END_H) */
const EVENING_WAKE_H = 18;

/** El día de comida que abre un despertar (a medianoche): el de su fecha; desde las 18:00, el siguiente. */
function wakeDayOf(wa: Date): Date {
  const d = new Date(wa);
  d.setHours(0, 0, 0, 0);
  if (hourOf(wa) >= EVENING_WAKE_H) d.setDate(d.getDate() + 1);
  return d;
}

/** El día de comida al que pertenece ese instante (a medianoche): termina cuando la persona se duerme, no a las 0:00. */
export function nutritionDayOf(t: Date, ctx: DayCtx = {}): Date {
  const cal = new Date(t);
  cal.setHours(0, 0, 0, 0);
  const wa = abreDia(ctx);
  // Ya despertó (antes de t) de un sueño de 3 h o más: el día nuevo empezó. Si fue en la tarde-noche, ese día ya es el de mañana:
  // lo que comas al despertar a las 23:50 no se junta con lo que comiste antes de dormirte.
  if (wa && wa.getTime() <= t.getTime()) {
    const abre = wakeDayOf(wa);
    if (abre.getTime() === cal.getTime() || (wa.toDateString() === t.toDateString() && hourOf(wa) >= EVENING_WAKE_H)) return abre;
  }
  // Antes de la hora habitual de partida y sin haber dormido: sigue siendo el día anterior
  if (hourOf(t) < dayStartHour(ctx.usualWake)) cal.setDate(cal.getDate() - 1);
  return cal;
}

/** 'Sat Oct 10 2026': la clave del día de comida (registro de comidas, agua, borrados). */
export const nutritionDayKey = (t: Date, ctx: DayCtx = {}) => nutritionDayOf(t, ctx).toDateString();

/** '2026-10-10': el mismo día en el formato del historial diario. */
export const isoDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Cuándo empieza ese día de comida (para leer lo comido y bebido 'hoy' de Health Connect). */
export function nutritionDayStart(day: Date, ctx: DayCtx = {}): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  const start = new Date(d);
  start.setMinutes(Math.round(dayStartHour(ctx.usualWake) * 60));
  const wa = abreDia(ctx);
  return wa && wakeDayOf(wa).getTime() === d.getTime() && wa.getTime() < start.getTime() ? wa : start;
}

/**
 * La hora de despertar que arma el horario de HOY: la de hoy si el reloj la midió dentro de este día de comida (no una
 * siesta: el teléfono manda el fin del sueño más largo), si no la habitual.
 */
export function wakeHourFor(ctx: DayCtx = {}, now: Date = new Date()): number | undefined {
  const wa = dateOf(ctx.wakeAt);
  if (wa && wa.getTime() <= now.getTime() && nutritionDayKey(wa, ctx) === nutritionDayKey(now, ctx)) return hourOf(wa);
  return okHour(ctx.usualWake) ? ctx.usualWake : undefined;
}

/** El contexto del día según el snapshot del teléfono (fin del sueño principal y el despertar habitual que calculó). */
export function dayCtxFrom(snap: any): DayCtx {
  const usual = snap?.schedule?.usualWake;
  return { wakeAt: snap?.dayWakeTime ?? snap?.wakeTime ?? null, usualWake: okHour(usual) ? usual : null, openAt: snap?.dayOpenTime ?? null };
}

/** La hora de despertar de HOY según el snapshot del teléfono (sueño de 3 h o más), o la habitual. */
export function wakeHourFrom(snap: any, now: Date = new Date()): number | undefined {
  return wakeHourFor(dayCtxFrom(snap), now);
}

/** Cuánto se corre el día de esta persona respecto del horario de siempre (horas): 0 entre las 5 y las 9. */
export const dayShiftHours = (wakeHour?: number | null) => anchorHour(wakeHour) - DEFAULT_ANCHOR;

/**
 * Dónde va el día de la persona, en horas de un día "normal" (como si hubiera despertado a las 7:30): 7,5 + horas que lleva
 * despierta, sin dar la vuelta (de 7,5 a ~31). Es lo que mide "lo esperable a esta hora" (comida, agua, pasos).
 * 2026-10-11: antes se usaba el reloj corrido ¾ (el corrimiento de las ventanas de comida) y a quien despertó a las 13:04,
 * 33 minutos después se le exigía el 23 % de su día ("~31 g de proteína a esta hora"): Eris le habló de desnutrición.
 * Sin hora de despertar conocida, la hora del reloj (las 0–5 cuentan como el final del día anterior).
 */
export function normDayHour(now: Date, wakeHour?: number | null): number {
  const h = hourOf(now);
  if (!okHour(wakeHour)) return h < 5 ? h + 24 : h;
  return DEFAULT_ANCHOR + ((((h - wakeHour) % 24) + 24) % 24);
}

/** La hora de tu día (0–24): como si hubieras despertado a las 7:30. */
export const internalHour = (now: Date, wakeHour?: number | null) => normDayHour(now, wakeHour) % 24;

/** En qué parte de su día está, por las horas que lleva despierta (no por el reloj). */
export function dayPhase(now: Date, wakeHour?: number | null, awakeHours = 16): 'mañana' | 'mediodía' | 'tarde' | 'noche' | 'hora de dormir' {
  const rel = normDayHour(now, wakeHour) - DEFAULT_ANCHOR;
  if (rel > awakeHours) return 'hora de dormir';
  if (rel < 4.5) return 'mañana';
  if (rel < 7) return 'mediodía';
  if (rel < 11) return 'tarde';
  return 'noche';
}

/** 20.33 → '20:20' */
export const fmtHour = (h: number) => { const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

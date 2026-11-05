// ============================================================
// Eris Mobile — desde cuándo cuenta la actividad de «hoy» (pedido del usuario, 2026-11-05: «guardar los pasos y las
// calorías hasta que uno se duerma»)
//
// Antes los pasos, la distancia, las calorías activas y el ejercicio se cortaban a medianoche, mientras la comida y el agua
// ya seguían el DÍA DE COMIDA (termina al dormir; services/mealSchedule.ts). A la 1:30 sin haber dormido, lo comido iba a
// «ayer» y lo gastado empezaba de cero: las metas de esa noche no calzaban y los pasos de después de medianoche se perdían
// del historial. Ahora la actividad usa el mismo día: desde que despertaste (si fue dentro de ese día) o desde que empieza
// el día de comida. Puro: se prueba con bun.
// ============================================================
import { nutritionDayOf, nutritionDayStart, isoDayKey, type DayCtx } from './mealSchedule';

export interface DiaActivo {
  /** desde cuándo se suman pasos, distancia, calorías activas y ejercicio */
  desde: Date;
  /** el día (de comida) al que pertenece lo de ahora */
  dia: Date;
  /** «2026-11-04»: la clave de ese día (la actividad detectada y el historial) */
  clave: string;
}

export function diaActivo(now: Date, ctx: DayCtx, dayWake?: string | number | Date | null): DiaActivo {
  const dia = nutritionDayOf(now, ctx);
  const inicio = nutritionDayStart(dia, ctx);
  const w = dayWake != null ? new Date(dayWake) : null;
  // El despertar de la noche, si cayó dentro de este día: antes de eso estabas durmiendo (y lo de la madrugada sin dormir
  // fue del día anterior)
  let desde = w && !Number.isNaN(w.getTime()) && w.getTime() > inicio.getTime() && w.getTime() <= now.getTime() ? w : inicio;
  // Nunca después de ahora (un reloj raro): desde la medianoche, como antes
  if (desde.getTime() > now.getTime()) { desde = new Date(now); desde.setHours(0, 0, 0, 0); }
  return { desde, dia, clave: isoDayKey(dia) };
}

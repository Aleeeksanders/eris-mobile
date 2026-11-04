/**
 * activityLevel — el nivel de actividad SEGÚN LO QUE HACES DE VERDAD, no lo que uno estima: lógica PURA, con pruebas.
 *
 * Pedido del usuario (2026-10-16): «sería interesante que se moviera la barra metabólica según tu actividad real y no un
 * estimado por el usuario». Forge pedía elegir Sedentario / Ligero / Moderado… a ojo; ahora el factor sale de las últimas
 * 4 semanas:
 *   - el ejercicio de cada día (lo anotado en Forge o lo que el reloj detectó sin modo entrenamiento: activityDetect.ts);
 *   - lo que te mueves fuera del ejercicio (los pasos del día que no son de un entreno), sobre ~3.500 pasos, que es lo que ya
 *     trae el nivel «Sedentario» (1,2).
 * nivel = 1,2 + gasto de actividad promedio por día ÷ basal. Es continuo (1,48 = entre Ligero y Moderado), entre 1,2 y 1,9.
 * El día de hoy no cuenta (está a medias). Con menos de 14 días con datos no hay nivel automático (se usa el elegido).
 *
 * Cada paso fuera del ejercicio: caminar ~3,5 MET a ~100 pasos/min → 2,5 MET netos × 0,0175 kcal/kg/min ÷ 100 pasos
 * ≈ 0,00044 kcal por kg por paso (~0,037 kcal por paso con 85 kg).
 */

export interface DayActivity {
  /** YYYY-MM-DD */
  day: string;
  /** kcal de ejercicio (el mayor entre Forge y lo detectado por el reloj) */
  exKcal: number;
  /** minutos de ejercicio */
  exMin: number;
  /** pasos del día (null = el reloj no midió) */
  steps: number | null;
  /** pasos dentro de los bloques de ejercicio (no se cuentan dos veces) */
  boutSteps?: number;
}

export interface AutoLevel {
  factor: number;
  /** gasto de actividad de un día típico (kcal): basal × (factor − 1,2) */
  typicalKcal: number;
  /** días con datos que se usaron */
  days: number;
  /** días con ejercicio (20 min o más) por semana */
  perWeek: number;
  /** el nivel con nombre más cercano */
  label: string;
  /** promedio diario de lo que gastas moviéndote FUERA del ejercicio (pasos), y del ejercicio (kcal) */
  neatKcal: number;
  exKcal: number;
}

export const SEDENTARY = 1.2;
export const MIN_DAYS = 14;
export const WINDOW_DAYS = 28;
const BASE_STEPS = 3500;
const KCAL_PER_KG_STEP = 0.00044;
const NAMED: Array<[number, string]> = [[1.2, 'Sedentario'], [1.375, 'Ligero'], [1.55, 'Moderado'], [1.725, 'Activo'], [1.9, 'Muy activo']];

/** Lo que gastaste moviéndote fuera del ejercicio (sobre lo que ya trae «Sedentario»). */
export const neatKcal = (steps: number | null, boutSteps: number, weightKg: number) =>
  steps == null ? 0 : Math.max(0, steps - Math.max(0, boutSteps) - BASE_STEPS) * KCAL_PER_KG_STEP * weightKg;

const dayKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** El nombre más cercano a un factor («1,48» → Moderado está más cerca que Ligero). */
export function levelLabel(factor: number): string {
  return NAMED.reduce((best, x) => (Math.abs(x[0] - factor) < Math.abs(best[0] - factor) ? x : best), NAMED[0])[1];
}

/** El nivel de actividad de las últimas 4 semanas (sin hoy). null si hay menos de 14 días con datos o no hay basal. */
export function autoLevel(days: DayActivity[], bmr: number | null, weightKg: number | null, now: Date = new Date()): AutoLevel | null {
  if (!bmr || bmr < 800 || !weightKg) return null;
  const today = dayKeyOf(now);
  const from = new Date(now); from.setDate(from.getDate() - WINDOW_DAYS);
  const fromKey = dayKeyOf(from);
  const inWindow = days.filter((d) => d.day >= fromKey && d.day < today && (d.steps != null || d.exKcal > 0));
  if (inWindow.length < MIN_DAYS) return null;
  const neat = inWindow.map((d) => neatKcal(d.steps, d.boutSteps ?? 0, weightKg));
  const exer = inWindow.map((d) => Math.max(0, d.exKcal));
  const typical = (neat.reduce((a, b) => a + b, 0) + exer.reduce((a, b) => a + b, 0)) / inWindow.length;
  const factor = Math.round(Math.min(1.9, Math.max(SEDENTARY, SEDENTARY + typical / bmr)) * 100) / 100;
  const exDays = inWindow.filter((d) => d.exMin >= 20).length;
  return {
    factor, typicalKcal: Math.round(bmr * (factor - SEDENTARY)), days: inWindow.length,
    perWeek: Math.round((exDays / (inWindow.length / 7)) * 10) / 10, label: levelLabel(factor),
    // Para las metas «según el día» (Forge 2.0): lo de todos los días por un lado y el ejercicio por otro
    neatKcal: Math.round(neat.reduce((a, b) => a + b, 0) / inWindow.length),
    exKcal: Math.round(exer.reduce((a, b) => a + b, 0) / inWindow.length),
  };
}

/** El agua extra de un nivel (120 ml por cada «escalón» de 0,175 sobre Sedentario; continuo para el nivel automático). */
export const levelWaterBonusMl = (factor: number) => Math.round(Math.max(0, (factor - SEDENTARY) / 0.175) * 120);

// ============================================================
// Eris Mobile — el agua que trae la comida
//
// 2026-10-10: una jalea quedó anotada solo como comida, y es ~85 % agua. La meta de agua (35 ml/kg + actividad + entreno)
// es de agua TOTAL, igual que la referencia europea (EFSA: ~20–30 % del agua del día viene de la comida), así que el agua
// de los alimentos también cuenta. Las bebidas ya suman aparte (como toma de agua): acá no entran.
//
// Cuánta agua tiene un alimento sale de su composición: lo que no es proteína, carbohidratos, grasa, fibra ni minerales
// (~1 %) es agua. Contra la tabla USDA: jalea 84 % (USDA 85), arroz cocido 67 (68), pan 31 (30–36), huevo duro 75 (75).
// Si los macros no calzan con las calorías (falta un dato, trae alcohol o edulcorantes), no se suma nada.
//
// Misma regla que el servidor (eris/src/services/FoodWater.ts): el mismo número en el teléfono y en el chat.
// ============================================================

import type { FoodItem, LoggedFood } from './FoodSearchService';
import { isBeverage } from './beverage';

/** Minerales (ceniza) por 100 g: ~1 g en promedio. */
const ASH_G = 1;

const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Fracción de agua (0–1) según la composición por 100 g; null si los datos no alcanzan o no calzan con las calorías. */
export function waterFraction(per100: { calories?: number; protein?: number; carbs?: number; fat?: number; fiber?: number }): number | null {
  const { calories: kcal, protein: p, carbs: c, fat: f } = per100;
  if (!ok(kcal) || !ok(p) || !ok(c) || !ok(f)) return null;
  if (kcal <= 0 && p + c + f <= 0) return null; // sin datos
  const macroKcal = 4 * p + 4 * c + 9 * f;
  if (Math.abs(kcal - macroKcal) > Math.max(25, 0.3 * Math.max(kcal, macroKcal))) return null;
  const solids = p + c + f + (ok(per100.fiber) ? per100.fiber : 0) + ASH_G;
  return solids >= 100 ? 0 : (100 - solids) / 100;
}

/** Litros de agua de un alimento (valores por 100 g) en esos gramos. Bebidas: 0 (ya suman como toma de agua). */
export function foodWaterL(food: FoodItem, grams: number): number {
  if (!food || !(grams > 0) || isBeverage(food)) return 0;
  const fr = waterFraction(food);
  return fr === null ? 0 : (grams * fr) / 1000;
}

/** Lo mismo para un alimento que viene del servidor (valores de la PORCIÓN). */
export function servingWaterL(item: { name: string; grams: number; calories: number; protein: number; carbs: number; fat: number; fiber?: number }): number {
  if (!item || !(item.grams > 0)) return 0;
  const k = 100 / item.grams;
  return foodWaterL({
    name: item.name, calories: item.calories * k, protein: item.protein * k, carbs: item.carbs * k, fat: item.fat * k, fiber: (item.fiber ?? 0) * k,
  } as FoodItem, item.grams);
}

/** Litros de agua de lo anotado (2 decimales). */
export function logWaterL(log: LoggedFood[]): number {
  return Math.round(log.reduce((a, e) => a + foodWaterL(e.food, e.grams), 0) * 100) / 100;
}

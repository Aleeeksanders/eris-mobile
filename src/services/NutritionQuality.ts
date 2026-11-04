/**
 * NutritionQuality — ¿lo que comiste te ALIMENTA? Calidad de cada alimento, de cada comida según su HORA, y del día
 * hasta ahora (no del día completo: a las 10 no se te pide lo mismo que a las 21), junto con la hidratación.
 *
 * Alimento (0-100):
 *   - Base estilo Nutri-Score (Santé publique France, umbrales por 100 g / 100 ml): resta energía, azúcares, grasas
 *     saturadas y sodio; suma fibra, proteína y frutas/verduras/legumbres. Si el producto trae su Nutri-Score de
 *     Open Food Facts, se usa ese.
 *   - Procesamiento (NOVA 1-4): un ultraprocesado (4) pierde puntos aunque sus números no sean terribles.
 *   - Sellos "ALTO EN" chilenos (Ley 20.606): cada sello resta.
 * Comida: calidad promedio ponderada por calorías + composición (¿trae proteína? ¿fibra/verdura/fruta?) + si
 *   calza con su horario (pizza al desayuno ≠ pizza al almuerzo) + cuánto pesa en el día.
 * Día hasta ahora: lo comido vs lo esperable A ESTA HORA (proteína, fibra, energía —ni muy poco ni de más—),
 *   calidad de lo comido y comidas saltadas. Hidratación: litros vs lo esperable a esta hora, y bebidas azucaradas.
 *
 * Todo es determinista (sin modelo): los mismos datos dan el mismo resultado, y cada número tiene su porqué.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LoggedFood } from './FoodSearchService';
import { STORAGE_KEY_LOG, STORAGE_KEY_GOALS } from './nutritionSync';
import { daySchedule } from './daySchedule';
import { evaluateDay, simulateAdd, toQualityItem, type DayQuality, type QualityItem, type QualitySim } from './nutritionQualityCore';
import { aporteDelDia, microDia, microRef, type MicroDia } from './supplements/supplementCore';

// El cálculo vive en nutritionQualityCore.ts (puro, compartido con el servidor); acá queda lo que lee el teléfono
export * from './nutritionQualityCore';

// ─── Cargar lo de hoy desde el teléfono ───────────────────────────────────

/** Un registro del teléfono → ítem evaluable (completa grupo/sodio/procesamiento con la base local si faltan). */
export function fromLogged(e: LoggedFood, wakeHour?: number): QualityItem {
  const f: any = e.food;
  return toQualityItem({
    name: f.name, grams: e.grams, mealType: e.mealType, at: new Date(e.loggedAt),
    per100: { kcal: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, sugar: f.sugar, sodium: f.sodium, satFat: f.satFat },
    group: f.group, nova: f.nova, nutriscore: f.nutriscore, micros: f.micros,
  }, wakeHour);
}

/**
 * Calidad de hoy a partir del snapshot ya combinado (Health Connect + servidor): mismo cálculo en Inicio y Métricas.
 * Incluye lo anotado por chat que aún no llegó al registro del teléfono.
 */
export async function evaluateFromSnapshot(snap: { hydration: number | null; wakeTime?: string; sleep?: { endTime?: string } | null }): Promise<DayQuality> {
  // import diferido: NutritionBackend importa MetricsService, que no debe depender de este módulo
  const { nutritionBackend } = await import('./NutritionBackend');
  const pending = await nutritionBackend.pendingLogged().catch(() => [] as LoggedFood[]);
  return evaluateToday({ waterLiters: snap.hydration, wakeTime: snap.wakeTime ?? snap.sleep?.endTime, pending });
}

/** Lo de hoy en el teléfono (registro + lo del chat aún no copiado), sus metas y la hora de despertar. */
async function loadToday(extra: { waterLiters?: number | null; wakeTime?: string; pending?: LoggedFood[] }) {
  const day = daySchedule.todayKey();
  let log: LoggedFood[] = [];
  let goals: any = {};
  try { log = JSON.parse((await AsyncStorage.getItem(`${STORAGE_KEY_LOG}_${day}`)) || '[]'); } catch {}
  try { goals = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY_GOALS)) || '{}'); } catch {}
  const all = [...log, ...(extra.pending ?? [])];
  const wake = extra.wakeTime ? new Date(extra.wakeTime) : null;
  const wakeHour = daySchedule.wakeHour() ?? (wake && wake.toDateString() === new Date().toDateString() ? wake.getHours() + wake.getMinutes() / 60 : undefined);
  // Calidad v2 (fase I6): las vitaminas y minerales cuentan según tu edad y sexo (Forge), con lo de tus suplementos de hoy.
  // import diferido: el store de suplementos lee Inventario y Forge, que no deben depender de este módulo
  const { supplementStore, supDia, persona } = await import('./supplements/supplementStore');
  const st = supplementStore.get() ?? (await supplementStore.load().catch(() => null));
  const p = persona();
  return {
    items: all.map((e) => fromLogged(e, wakeHour)),
    persona: p,
    supMicros: st ? aporteDelDia(st, supDia()) : {},
    opts: {
      goals: { kcal: goals.calories, protein: goals.proteinGGoal ?? goals.protein, fiber: goals.fiberGGoal ?? goals.fiber, water: goals.waterLiters },
      waterLiters: extra.waterLiters, wakeHour, microRef: microRef(p), supMicros: st ? aporteDelDia(st, supDia()) : {},
    },
  };
}

/**
 * Las vitaminas y minerales de hoy para Métricas: lo comido (registro + lo del chat aún no copiado) y lo de tus suplementos,
 * con el % de lo recomendado y cuánto de lo comido trae el dato. Mismos ítems que la calidad del día.
 */
export async function dayMicrosToday(extra: { pending?: LoggedFood[] } = {}): Promise<MicroDia> {
  const { nutritionBackend } = await import('./NutritionBackend');
  const pending = extra.pending ?? await nutritionBackend.pendingLogged().catch(() => [] as LoggedFood[]);
  const { items, supMicros, persona } = await loadToday({ pending });
  return microDia(items.map((it) => ({ grams: it.grams, kcal: (it.per100.kcal * it.grams) / 100, micros: it.micros })), supMicros, persona);
}

export async function evaluateToday(extra: { waterLiters?: number | null; wakeTime?: string; pending?: LoggedFood[] } = {}): Promise<DayQuality> {
  const { items, opts } = await loadToday(extra);
  return evaluateDay(items, opts);
}

/** La simulación con lo de hoy del teléfono: el mismo cálculo y los mismos datos que la tarjeta de Métricas. */
export async function simulateAddToday(entry: LoggedFood, extra: { waterLiters?: number | null } = {}): Promise<QualitySim> {
  const { nutritionBackend } = await import('./NutritionBackend');
  const pending = await nutritionBackend.pendingLogged().catch(() => [] as LoggedFood[]);
  const { items, opts } = await loadToday({ ...extra, pending });
  return simulateAdd(items, fromLogged(entry, opts.wakeHour), opts);
}

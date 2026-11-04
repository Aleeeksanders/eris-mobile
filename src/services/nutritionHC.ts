/**
 * nutritionHC — lo que Nutrición escribe y borra en Health Connect.
 *
 * Métricas e Inicio leen las cifras de Health Connect, así que si un alimento se borra en Nutrición y NO se borra
 * también acá, sigue contando en todas partes. Por eso cada registro guarda el id que Health Connect le dio
 * (`hcId`) y el borrado lo usa; para registros antiguos sin id se busca el registro por su instante y su nombre.
 * Todo es "mejor esfuerzo": si Health Connect no está disponible o sin permisos, la app sigue funcionando.
 */

import { insertRecords, readRecords, deleteRecordsByUuids } from 'react-native-health-connect';
import { foodSearchService, type LoggedFood } from './FoodSearchService';

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/**
 * La hora con que va a Health Connect: la de la comida, pero nunca en el futuro. Una cena anotada por adelantado (a las 11,
 * queda a las 21:00 en el registro) se lee «hasta ahora» en Inicio y Métricas: con su hora no se sumaba hasta la noche.
 */
export function hcTime(loggedAt: string, now: number = Date.now()): Date {
  const t = Date.parse(loggedAt);
  return new Date(Number.isNaN(t) ? now : Math.min(t, now));
}

/** Escribe una comida y devuelve el id que le asignó Health Connect (undefined si no se pudo saber). */
export async function insertNutrition(entry: LoggedFood, hcMealType: number): Promise<string | undefined> {
  const p = foodSearchService.calcPortion(entry.food, entry.grams);
  const start = hcTime(entry.loggedAt);
  const ids = await insertRecords([{
    recordType: 'Nutrition',
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 60000).toISOString(),
    name: entry.food.name,
    energy:            { value: p.calories, unit: 'kilocalories' },
    protein:           { value: p.protein,  unit: 'grams' },
    totalCarbohydrate: { value: p.carbs,    unit: 'grams' },
    totalFat:          { value: p.fat,      unit: 'grams' },
    dietaryFiber:      { value: p.fiber,    unit: 'grams' },
    sugar:             { value: p.sugar,    unit: 'grams' },
    sodium:            { value: p.sodium,   unit: 'milligrams' },
    mealType: hcMealType,
  } as any]);
  return Array.isArray(ids) && ids[0] ? String(ids[0]) : undefined;
}

/** Borra de Health Connect el registro de ESTA comida: por id si lo tiene; si no, lo busca por instante + nombre + calorías. */
export async function deleteNutrition(entry: LoggedFood): Promise<void> {
  if (entry.hcId) {
    await deleteRecordsByUuids('Nutrition', [entry.hcId], []);
    return;
  }
  const start = Date.parse(entry.loggedAt);
  if (Number.isNaN(start)) return;
  const p = foodSearchService.calcPortion(entry.food, entry.grams);
  const find = async (from: number, to: number) => {
    const res = await readRecords('Nutrition', {
      timeRangeFilter: { operator: 'between', startTime: new Date(from).toISOString(), endTime: new Date(to).toISOString() },
    });
    return (res.records as any[]).find((r) =>
      norm(r.name) === norm(entry.food.name) && Math.abs((r.energy?.inKilocalories ?? 0) - p.calories) <= 1);
  };
  // Si se anotó por adelantado, en Health Connect quedó con la hora en que se anotó (ver hcTime): se busca hasta 16 h antes
  const match = (await find(start - 2000, start + 62000)) ?? (start > Date.now() - 16 * 3_600_000 ? await find(start - 16 * 3_600_000, Math.min(start, Date.now()) + 62000) : undefined);
  const id = match?.metadata?.id;
  if (id) await deleteRecordsByUuids('Nutrition', [String(id)], []);
}

export async function insertHydration(liters: number): Promise<string | undefined> {
  const ids = await insertRecords([{
    recordType: 'Hydration',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 60000).toISOString(),
    volume: { value: liters, unit: 'liters' },
  } as any]);
  return Array.isArray(ids) && ids[0] ? String(ids[0]) : undefined;
}

export async function deleteHydration(hcId: string): Promise<void> {
  await deleteRecordsByUuids('Hydration', [hcId], []);
}

/** Borra varias tomas de agua de una vez — para "editar el total de hoy" (ver handleEditWaterTotal). */
export async function deleteHydrationBatch(hcIds: string[]): Promise<void> {
  if (hcIds.length) await deleteRecordsByUuids('Hydration', hcIds, []);
}

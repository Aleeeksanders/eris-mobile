/**
 * nutritionSync — lógica PURA (sin React Native) del registro de comidas y agua del día.
 *
 * El registro vive en tres lugares que hay que mantener alineados:
 *   · el teléfono (AsyncStorage: lo que muestra Nutrición, incluye lo registrado a mano),
 *   · Health Connect (lo que leen Métricas e Inicio; lo escribe esta app),
 *   · el servidor (lo que ve Eris: solo lo anotado por chat + el snapshot que el teléfono le empuja).
 * Estas funciones deciden qué entra, qué sale y qué NO hay que contar dos veces. Están aparte para poder probarlas.
 */

import type { FoodItem, LoggedFood } from './FoodSearchService';

export const STORAGE_KEY_LOG = 'eris_nutrition_log_v1';
export const STORAGE_KEY_WATER = 'eris_water_log_v1';
/** Tomas de agua del servidor que ya se sumaron al total local (por instante), por día. */
export const STORAGE_KEY_WATER_SEEN = 'eris_water_seen_v1';
/** Última toma manual de agua, para poder deshacerla. */
export const STORAGE_KEY_WATER_LAST = 'eris_water_last_v1';
/** Borrados que aún no llegaron al servidor (se reenvían hasta que confirme). */
export const STORAGE_KEY_PENDING_DEL = 'eris_nutrition_pending_del_v1';
/** Marca: ya se hizo la migración al modelo de "tomas vistas" de agua. */
export const STORAGE_KEY_SYNC_V2 = 'eris_nutrition_sync_v2';
/** Metas nutricionales (calorías, agua…) que leen Inicio, Nutrición y Métricas. Las fija `set_nutritional_goals` por chat. */
export const STORAGE_KEY_GOALS = 'eris_nutrition_goals_default';
/** Solo lo que el usuario FIJÓ a mano (Perfil o chat). STORAGE_KEY_GOALS tiene las metas efectivas: lo fijado o lo
 * calculado por el servidor con Forge y el perfil médico. Perfil muestra esto para no confundir una meta calculada
 * con una puesta por el usuario. */
export const STORAGE_KEY_GOALS_SET = 'eris_nutrition_goals_set';
/**
 * Id de Health Connect de CADA toma de agua de hoy que Eris insertó (no el total, la lista). El total en sí no
 * se puede "editar" en Health Connect — es un registro de tomas, no un número — así que para corregirlo a un
 * valor exacto hay que borrar justo lo que Eris puso y volver a insertar uno solo con el total corregido. Sin
 * esta lista solo se podía borrar la ÚLTIMA toma (undoWater), nunca corregir a un número cualquiera; y sin ella
 * tampoco se podría hacerlo sin arriesgarse a borrar tomas de OTRA app que también escriba en Health Connect.
 */
export const STORAGE_KEY_WATER_HCIDS = 'eris_water_hcids_v1';
/**
 * Tomas de agua del chat ya SUMADAS al total del teléfono (`STORAGE_KEY_WATER`), estén o no en Health Connect. Antes solo
 * existía "vista" (= ya en Health Connect): si Health Connect fallaba, la toma se sumaba otra vez en cada sincronización.
 */
export const STORAGE_KEY_WATER_APPLIED = 'eris_water_applied_v1';

/** Tipo de comida de Health Connect (enum numérico) para cada slot propio. Compartido entre Nutrición (al
 * registrar) y NutritionBackend (al reintentar lo que no llegó a Health Connect). */
export const HC_MEAL_MAP: Record<string, number> = {
  desayuno: 1, almuerzo: 2, cena: 3,
  colacion_am: 4, colacion_pm: 4, once: 4, merienda: 4,
};

/** Identidad de un ítem del registro local (mismo instante + alimento + porción). */
export const logKey = (e: LoggedFood) => `${e.loggedAt}_${e.food.name}_${e.grams}`;
/** La misma identidad, vista desde un ítem que viene del servidor. */
export const serverItemKey = (timestamp: string, item: { name: string; grams: number }) => `${timestamp}_${item.name}_${item.grams}`;

export interface ServerItem { name: string; grams: number; calories: number; protein: number; carbs: number; fat: number; fiber: number }
export interface ServerEntry { timestamp: string; mealType?: string; approxTime?: boolean; items?: ServerItem[]; totals?: { calories?: number; protein?: number; carbs?: number; fat?: number; fiber?: number } }
export interface ServerWater { timestamp: string; liters: number }
/** Decide en qué comida configurada cae un registro del servidor (tipo de comida + instante). */
export type SlotResolver = (serverMealType: string, timestamp: string) => string;
export interface PendingDelete { date: string; timestamp: string; name: string; grams: number }

const r1 = (n: number) => Math.round(n * 10) / 10;
export const pendingKey = (p: { timestamp: string; name: string; grams: number }) => `${p.timestamp}_${p.name}_${p.grams}`;

/** Una comida del servidor → ítems del registro local (macros por 100 g, como usa el resto de la app). */
export function serverEntryToLogged(entry: ServerEntry, slotOf: SlotResolver, newId: () => string): LoggedFood[] {
  const slotId = slotOf(entry.mealType ?? '', entry.timestamp);
  return (entry.items ?? []).map((item) => {
    const f = item.grams > 0 ? 100 / item.grams : 1;
    const food: FoodItem = {
      id: newId(),
      name: item.name,
      calories: Math.round(item.calories * f),
      protein: r1(item.protein * f),
      carbs: r1(item.carbs * f),
      fat: r1(item.fat * f),
      fiber: r1(item.fiber * f),
      sugar: 0, sodium: 0,
      servingSize: item.grams,
      servings: [{ description: `${item.grams}g`, grams: item.grams }],
      source: 'chat',
    };
    return { food, grams: item.grams, mealType: slotId, loggedAt: entry.timestamp, ...(entry.approxTime ? { approxTime: true } : {}) };
  });
}

/** Suma lo que llega del servidor al registro, sin duplicar lo que ya está (ni repetidos dentro del mismo lote). */
export function mergeServerEntries(
  prev: LoggedFood[], entries: ServerEntry[], slotOf: SlotResolver, newId: () => string, skip?: Set<string>,
): { next: LoggedFood[]; added: LoggedFood[] } {
  const seen = new Set(prev.map(logKey));
  const added: LoggedFood[] = [];
  for (const e of entries) {
    for (const item of serverEntryToLogged(e, slotOf, newId)) {
      const k = logKey(item);
      if (seen.has(k) || skip?.has(k)) continue;
      seen.add(k);
      added.push(item);
    }
  }
  return { next: added.length ? [...prev, ...added] : prev, added };
}

/** Quita del registro un ítem concreto (por referencia; si no está, por identidad). Nunca por posición. */
export function removeEntry(log: LoggedFood[], target: LoggedFood): LoggedFood[] {
  const byRef = log.indexOf(target);
  const i = byRef >= 0 ? byRef : log.findIndex((e) => logKey(e) === logKey(target));
  return i < 0 ? log : log.filter((_, k) => k !== i);
}

/** Quita todo lo registrado en esos instantes (lo que hace Eris al borrar una comida por chat). */
export function removeByTimestamps(log: LoggedFood[], timestamps: string[]): { next: LoggedFood[]; removed: LoggedFood[] } {
  const t = new Set(timestamps);
  const removed = log.filter((e) => t.has(e.loggedAt));
  return { next: removed.length ? log.filter((e) => !t.has(e.loggedAt)) : log, removed };
}

export interface ItemRef { timestamp: string; name: string; grams: number }
const sameItem = (e: LoggedFood, r: ItemRef) =>
  e.loggedAt === r.timestamp && e.food.name.trim().toLowerCase() === String(r.name).trim().toLowerCase() && Math.abs(e.grams - Number(r.grams)) < 0.05;

/**
 * Quita SOLO los alimentos indicados (instante + nombre + gramos). Eris ahora borra por alimento ("borra el queso" ya no se
 * lleva la hallulla de la misma once) y también puede borrar lo anotado a mano acá.
 */
export function removeByItems(log: LoggedFood[], refs: ItemRef[]): { next: LoggedFood[]; removed: LoggedFood[] } {
  const list = refs.filter((r) => r && typeof r.timestamp === 'string' && typeof r.name === 'string');
  const removed = log.filter((e) => list.some((r) => sameItem(e, r)));
  return { next: removed.length ? log.filter((e) => !removed.includes(e)) : log, removed };
}

/** Un aviso de borrado de Eris: por alimento si lo trae (servidor nuevo), si no por comida completa. */
export function applyServerDeletion(log: LoggedFood[], msg: { items?: unknown; timestamps?: unknown }): { next: LoggedFood[]; removed: LoggedFood[] } {
  if (Array.isArray(msg.items) && msg.items.length) return removeByItems(log, msg.items as ItemRef[]);
  return removeByTimestamps(log, Array.isArray(msg.timestamps) ? (msg.timestamps as string[]) : []);
}

/**
 * La lista de alimentos del día para el servidor. Antes Eris solo recibía el TOTAL del teléfono: lo anotado a mano (búsqueda,
 * código de barras) no existía para "¿qué he comido hoy?" ni para saber a qué hora fue la última comida.
 */
export function foodLogForServer(
  day: string, log: LoggedFood[],
  calc: (food: FoodItem, grams: number) => { calories: number; protein: number; carbs: number; fat: number; fiber?: number },
) {
  return {
    date: day,
    items: log.slice(0, 200).map((e) => {
      const p = calc(e.food, e.grams);
      const f = e.food;
      // `q`: los valores por 100 g con que el teléfono calcula la calidad (nutritionQualityCore), para que el chat
      // («¿y si me como…?») parta del mismo día y dé la misma nota
      const q = { kcal: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, sugar: f.sugar, sodium: f.sodium,
        satFat: f.satFat, nova: f.nova, nutriscore: f.nutriscore, group: f.group,
        // vitaminas y minerales por 100 g (fase I6): los de Open Food Facts; los de la base el servidor los saca por el nombre
        ...(f.micros && !String(f.id).startsWith('cl:') ? { micros: f.micros } : {}) };
      return { t: e.loggedAt, meal: e.mealType, name: e.food.name, grams: e.grams, kcal: Math.round(p.calories), protein: r1(p.protein), carbs: r1(p.carbs), fat: r1(p.fat), fiber: r1(p.fiber ?? 0), q };
    }),
  };
}

/**
 * De lo que tiene el servidor, solo los ítems que TODAVÍA no están en Health Connect (que es lo que suman Inicio y
 * Métricas). "Estar en el registro local" no basta: si `insertNutrition` falló (Health Connect sin permiso, no
 * disponible, etc.) el ítem queda marcado como local sin haber llegado nunca a Health Connect — sin el filtro por
 * `hcId` desaparecía del resumen del día para siempre, aunque Nutrición sí lo mostrara.
 */
export function backendNotInLocal(entries: ServerEntry[], local: LoggedFood[]): ServerEntry[] {
  const have = new Set(local.filter((e) => e.hcId).map(logKey));
  const out: ServerEntry[] = [];
  for (const e of entries) {
    const items = (e.items ?? []).filter((i) => !have.has(serverItemKey(e.timestamp, i)));
    if (items.length) out.push({ ...e, items });
  }
  return out;
}

export function sumItems(entries: ServerEntry[]) {
  const t = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const e of entries) for (const i of e.items ?? []) {
    t.calories += i.calories || 0; t.protein += i.protein || 0; t.carbs += i.carbs || 0; t.fat += i.fat || 0; t.fiber += i.fiber || 0;
  }
  return { calories: Math.round(t.calories), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat), fiber: r1(t.fiber) };
}

/** Tomas de agua del servidor que todavía no se sumaron al total local. */
export function waterNotSeen(waters: ServerWater[], seen: Iterable<string>): ServerWater[] {
  const s = new Set(seen);
  const out: ServerWater[] = [];
  for (const w of waters) {
    if (!w?.timestamp || !(w.liters > 0) || s.has(w.timestamp)) continue;
    s.add(w.timestamp);
    out.push(w);
  }
  return out;
}

/**
 * Combina las metas guardadas localmente con lo que acaba de mandar el servidor (`nutrition_today.goals`).
 * El servidor es la verdad para lo que trae; lo que no trae (p. ej. proteína si solo se fijó agua) se conserva.
 * Devuelve `null` si no hay nada nuevo que guardar (evita escrituras y notificaciones de más).
 */
export function mergeGoals(
  prev: Record<string, number>,
  incoming: Record<string, unknown> | null | undefined,
): Record<string, number> | null {
  if (!incoming || typeof incoming !== 'object') return null;
  const next = { ...prev };
  let changed = false;
  for (const [k, v] of Object.entries(incoming)) {
    // null = esa meta ya no aplica (p. ej. agua con enfermedad renal): se borra en vez de quedar la vieja
    if (v === null) { if (k in next) { delete next[k]; changed = true; } continue; }
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
    if (next[k] !== v) { next[k] = v; changed = true; }
  }
  return changed ? next : null;
}

/** Nombre legible de una comida que ya no está entre las configuradas (antes salía «meal_1727…» o «colacion_am»). */
export function prettySlot(id: string): string {
  if (/^meal_\d+$/.test(id)) return 'Otra comida';
  const known: Record<string, string> = {
    desayuno: 'Desayuno', colacion_am: 'Colación mañana', almuerzo: 'Almuerzo', colacion_pm: 'Colación tarde',
    cena: 'Cena', once: 'Once', merienda: 'Merienda',
  };
  if (known[id]) return known[id];
  const t = id.replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Otra comida';
}

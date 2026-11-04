/**
 * FoodSearchService — Búsqueda de alimentos
 *
 * Prioridad:
 *   0. Lo que ya anotaste (últimas 4 semanas)
 *   1. DB local Chile (alimentos y platos típicos, instant, offline)
 *   2. Envasados chilenos del servidor de Eris (≈4.500, con alérgenos) junto con Open Food Facts (>3M productos)
 *
 * Todo con la normalización estándar de foodText.ts (la misma del servidor): no importan tildes, mayúsculas, símbolos,
 * espacios ("cocacola"), el orden de las palabras ni un error de tipeo ("chocapig"); mientras se escribe, la última
 * palabra puede ir a medias ("empan" → Empanada). A Open Food Facts va el texto estándar y ya corregido.
 *
 * Código de barras (lookupBarcode), en cascada: caché del teléfono → servidor de Eris (base chilena importada de OFF
 * + productos cargados a mano + USDA) en paralelo con Open Food Facts directo (variantes EAN-13/UPC-A) → si nada,
 * el usuario carga la tabla nutricional del envase (contributeBarcode) y queda para la próxima vez.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import localFoodsRaw from '../data/chilean-foods.json';
import { plausibleSodiumMg, sanitizePer100 } from './nutrientSanity';
import { FoodIndex, nameKeys, normText, correctText, naturalBoost, sameFood, type FoodKey } from './foodText';
/** = STORAGE_KEY_LOG de nutritionSync (el registro de cada día): se repite acá para no importar en círculo */
const RECENT_LOG_KEY = 'eris_nutrition_log_v1';
import { wsManager } from './WebSocketManager';
import type { Micros } from './supplements/supplementCore';

export interface Serving {
  description: string;  // "1 pechuga (150g)", "½ palta (75g)", "1 taza (150g cocido)"
  grams: number;
}

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  calories: number;       // kcal por 100g
  protein: number;        // g por 100g
  carbs: number;          // g por 100g
  fat: number;            // g por 100g
  fiber: number;          // g por 100g
  sugar: number;          // g por 100g
  sodium: number;         // mg por 100g
  servingSize: number;    // g — tamaño de porción sugerido (compat)
  servings: Serving[];    // porciones nombradas de la base de datos
  imageUrl?: string;
  // ─ Calidad (opcionales: los registros viejos no los tienen y NutritionQuality los completa por nombre) ─
  satFat?: number;        // g grasas saturadas por 100g
  /** procesamiento NOVA 1 (natural) … 4 (ultraprocesado) */
  nova?: number;
  /** Nutri-Score de Open Food Facts (a…e) */
  nutriscore?: string;
  /** grupo de alimento (verdura, legumbre, comida_rapida…) — ver NutritionQuality.FoodGroup */
  group?: string;
  /** es bebida (los sellos se miden por 100 ml) */
  liquid?: boolean;
  /** ya lo anotaste antes (sale primero al buscar si es exactamente lo buscado) */
  recent?: boolean;
  /** de dónde salen sus valores (los registros viejos no lo tienen: ver foodDetail.sourceOf) */
  source?: FoodSource;
  /** alérgenos declarados en el envase (Open Food Facts / base de envasados de Eris) y trazas */
  allergens?: string[];
  traces?: string[];
  /** «tu versión»: valores que corregiste tú; reemplaza al original (`baseKey`) al buscar y en el chat */
  mine?: boolean;
  baseKey?: string;
  /** vitaminas y minerales por 100 g (base de Eris con USDA, Open Food Facts si los trae); falta = no se sabe */
  micros?: Micros;
}

export type FoodSource = 'base' | 'eris' | 'off' | 'etiqueta' | 'chat' | 'mia';

export interface LoggedFood {
  food: FoodItem;
  grams: number;
  mealType: string;       // slot id configurable por el usuario
  loggedAt: string;
  /** Id del registro en Health Connect (para poder borrar exactamente ese al eliminar el alimento). */
  hcId?: string;
  /** La hora (`loggedAt`) es la típica de esa comida: se anotó después de comerla sin decir a qué hora (ver mealSchedule). */
  approxTime?: boolean;
  /** Una bebida también suma como toma de agua: cuánto y con qué id de Health Connect, para restarla si se borra la bebida. */
  drinkWater?: { liters: number; hcId?: string };
}

// ─── DB local Chile ───────────────────────────────────────────

interface LocalServing { description: string; grams: number; calories: number; carbs: number; protein: number; fat: number; fiber: number; sugar?: number; sodium?: number; satFat?: number }
interface LocalFood {
  id: string;
  name: string;
  aliases?: string[];
  category: string;
  group?: string;
  nova?: number;
  liquid?: boolean;
  serving: LocalServing;
  alt?: LocalServing[];
  /** vitaminas y minerales por 100 g (USDA, ver eris/scripts/build_food_db.ts) */
  micro?: Micros;
}

const localFoods = localFoodsRaw as unknown as LocalFood[];

function localFoodToFoodItem(lf: LocalFood): FoodItem {
  // Prefer explicit 100g alt serving for accurate per-100g macros
  const ref100 = lf.alt?.find(a => a.grams === 100);
  const ref = ref100 ?? lf.serving;
  const factor = 100 / ref.grams;

  // Named servings: primary + non-100g alts (e.g. "½ palta", "jugo de 1 limón")
  const servings: Serving[] = [
    { description: lf.serving.description, grams: lf.serving.grams },
    ...(lf.alt ?? [])
      .filter(a => a.grams !== 100)
      .map(a => ({ description: a.description, grams: a.grams })),
  ];

  return {
    id: lf.id,
    name: lf.name,
    calories: Math.round(ref.calories * factor),
    protein:  Math.round(ref.protein  * factor * 10) / 10,
    carbs:    Math.round(ref.carbs    * factor * 10) / 10,
    fat:      Math.round(ref.fat      * factor * 10) / 10,
    fiber:    Math.round(ref.fiber    * factor * 10) / 10,
    sugar:    Math.round((ref.sugar ?? 0) * factor * 10) / 10,
    // Antes iba 0 fijo: el sodio de los alimentos de la base local nunca contaba
    sodium:   Math.round((ref.sodium ?? lf.serving.sodium ?? 0) * (ref.sodium != null ? factor : 100 / lf.serving.grams)),
    satFat:   (ref.satFat ?? lf.serving.satFat) != null ? Math.round((ref.satFat ?? lf.serving.satFat)! * (ref.satFat != null ? factor : 100 / lf.serving.grams) * 10) / 10 : undefined,
    nova: lf.nova,
    group: lf.group,
    liquid: lf.liquid,
    servingSize: lf.serving.grams,
    servings,
    source: 'base',
    ...(lf.micro ? { micros: lf.micro } : {}),
  };
}

/** Nombre (cada sinónimo de "Palta / Aguacate" por separado), alias y, con poco peso, la categoría. */
const localKeys = (f: LocalFood): FoodKey[] => [
  ...nameKeys(f.name),
  ...(f.aliases ?? []).map((a) => ({ text: a })),
  { text: f.category, weight: 0.4 },
];
let LOCAL_INDEX: FoodIndex<LocalFood> | null = null;
const localIndex = (): FoodIndex<LocalFood> => {
  if (!LOCAL_INDEX) LOCAL_INDEX = new FoodIndex(localFoods, localKeys);
  return LOCAL_INDEX;
};

/** Mismo texto estándar = mismo alimento ("Coca-Cola Zero" = "coca cola zero"). */
const sameKey = (f: { name: string; brand?: string }) => normText(`${f.name} ${f.brand ?? ''}`);

/** Un resultado con su calce (FoodIndex): `exact` = calzaron todas las palabras sin errores de tipeo. */
type Hit = { food: FoodItem; score: number; exact?: boolean };

/** Base local: desde la primera letra, sin importar cómo se escriba; si nada calza con todo, vale que falte una palabra. */
function searchLocalScored(query: string): Hit[] {
  return localIndex()
    .search(query, { limit: 12, prefix: true, partial: true })
    .map((h) => ({ food: localFoodToFoodItem(h.item), score: h.score, exact: h.exact }));
}

/**
 * Ordena por qué tan bien calzan con lo buscado (mismo estándar); lo que no calza queda al final, en su orden (Open Food
 * Facts a veces encuentra por el nombre genérico o en otro idioma).
 */
function rankByText(items: FoodItem[], query: string): FoodItem[] {
  if (items.length < 2) return items;
  // Con lo natural primero: «manzana» trae la manzana antes que el jugo de manzana (foodText.naturalBoost)
  const hits = new FoodIndex(items, (f) => nameKeys(f.name).map((k) => ({ ...k, extra: f.brand })))
    .search(query, { limit: items.length, prefix: true, partial: true })
    .map((h) => ({ item: h.item, score: h.score + naturalBoost(query, h.item.name, h.item.brand) }))
    .sort((a, b) => b.score - a.score);
  const matched = new Set(hits.map((h) => h.item));
  return [...hits.map((h) => h.item), ...items.filter((f) => !matched.has(f))];
}

// ─── Open Food Facts ──────────────────────────────────────────

const OFF_URL = 'https://world.openfoodfacts.org';

const OFF_FIELDS = 'code,product_name,product_name_es,generic_name,brands,nutriments,serving_quantity,serving_size,image_front_thumb_url,nova_group,nutrition_grades,categories_tags,allergens_tags,traces_tags';
/** Etiquetas de alérgenos de Open Food Facts → las de Eris (= OFF_TAG_TO_OURS del servidor, PackagedFoods.ts). */
const OFF_ALLERGEN: Record<string, string> = {
  'en:milk': 'lactosa', 'en:gluten': 'gluten', 'en:soybeans': 'soya', 'en:nuts': 'frutos_secos', 'en:peanuts': 'mani',
  'en:eggs': 'huevo', 'en:fish': 'pescado', 'en:crustaceans': 'mariscos', 'en:molluscs': 'mariscos',
  'en:sesame-seeds': 'sesamo', 'en:mustard': 'mostaza', 'en:celery': 'apio',
  'en:sulphur-dioxide-and-sulphites': 'sulfitos', 'en:lupin': 'lupino',
};
const offTags = (tags: unknown): string[] => [...new Set((Array.isArray(tags) ? tags : []).map((t) => OFF_ALLERGEN[String(t)]).filter(Boolean))];
const OFF_UA = 'Eris-Health-App/1.0 (contact@axs-eris.app)';
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Vitaminas y minerales que trae Open Food Facts (sus valores `_100g` van en gramos): a mg o µg como el resto de Eris.
 * Solo lo que el producto declara; null si no trae nada.
 */
const OFF_MICRO: Array<[keyof Micros, string, number]> = [
  ['vA', 'vitamin-a_100g', 1e6], ['vC', 'vitamin-c_100g', 1e3], ['vD', 'vitamin-d_100g', 1e6], ['vE', 'vitamin-e_100g', 1e3],
  ['vK', 'vitamin-k_100g', 1e6], ['b1', 'vitamin-b1_100g', 1e3], ['b2', 'vitamin-b2_100g', 1e3], ['b3', 'vitamin-pp_100g', 1e3],
  ['b6', 'vitamin-b6_100g', 1e3], ['b12', 'vitamin-b12_100g', 1e6], ['fol', 'vitamin-b9_100g', 1e6], ['ca', 'calcium_100g', 1e3],
  ['fe', 'iron_100g', 1e3], ['mg', 'magnesium_100g', 1e3], ['k', 'potassium_100g', 1e3], ['zn', 'zinc_100g', 1e3], ['p', 'phosphorus_100g', 1e3],
];
function offMicros(n: any): Micros | null {
  const out: Micros = {};
  for (const [k, field, f] of OFF_MICRO) {
    const v = num(n?.[field]) ?? (k === 'fol' ? num(n?.['folates_100g']) : undefined);
    // Valores imposibles (cargados en la unidad equivocada) se descartan: nada trae más de 10 g de un micronutriente por 100 g
    if (v !== undefined && v >= 0 && v < 10) out[k] = Math.round(v * f * 100) / 100;
  }
  return Object.keys(out).length ? out : null;
}

function parseProduct(p: any): FoodItem | null {
  const n = p.nutriments;
  if (!n) return null;
  const protein = num(n.proteins_100g), carbs = num(n.carbohydrates_100g), fat = num(n.fat_100g);
  // Muchos productos chilenos traen la energía solo en kJ, o sin energía pero con los macros: antes eso era
  // "producto no encontrado". kcal → kJ/4,184 → 4·P + 4·C + 9·G (Atwater)
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
  const cal = num(n['energy-kcal_100g'])
    ?? (kj !== undefined ? kj / 4.184 : undefined)
    ?? (protein !== undefined && carbs !== undefined && fat !== undefined ? 4 * protein + 4 * carbs + 9 * fat : undefined);
  if (cal === undefined || (cal <= 0 && !(protein || carbs || fat))) return null;
  const name = p.product_name_es || p.product_name || p.generic_name || 'Sin nombre';

  const servQty = p.serving_quantity ? parseFloat(p.serving_quantity) || 0 : 0;
  const servDesc = p.serving_size || (servQty > 0 ? `${Math.round(servQty)}g` : null);
  const sodium = num(n.sodium_100g) ?? (num(n.salt_100g) !== undefined ? num(n.salt_100g)! / 2.5 : 0);
  const cats: string[] = Array.isArray(p.categories_tags) ? p.categories_tags : [];
  const liquid = cats.some(c => /beverages|bebidas|drinks|milks|leches|juices|jugos/.test(c));
  const allergens = offTags(p.allergens_tags);
  const micros = offMicros(n);
  const traces = offTags(p.traces_tags).filter((t) => !allergens.includes(t));
  // Lo imposible fuera, con la MISMA regla que el servidor (revisión N1: antes la app solo miraba el sodio y las kcal; un
  // macro de 250 g por 100 g, un azúcar mayor que los carbohidratos o una grasa saturada mayor que la grasa pasaban)
  const v = sanitizePer100({ kcal: cal, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0, fiber: num(n.fiber_100g) ?? 0,
    sugar: num(n.sugars_100g), satFat: num(n['saturated-fat_100g']), sodiumMg: Math.round(sodium * 1000) }, name);

  return {
    id: p.code || p._id || String(Math.random()),
    name,
    brand: p.brands ? String(p.brands).split(',')[0].trim() : undefined,
    // Más de 900 kcal por 100 g es imposible: venía en kJ (ver nutrientSanity.ts)
    calories: Math.round(v.kcal),
    protein:  r1(v.protein),
    carbs:    r1(v.carbs),
    fat:      r1(v.fat),
    fiber:    r1(v.fiber),
    sugar:    r1(v.sugar ?? 0),
    // Sodio imposible para ese alimento (cargado en la unidad equivocada): se descarta
    sodium:   v.sodiumMg ?? 0,
    satFat:   v.satFat !== undefined ? r1(v.satFat) : undefined,
    nova:     num(p.nova_group),
    nutriscore: /^[a-e]$/.test(String(p.nutrition_grades || '')) ? String(p.nutrition_grades) : undefined,
    liquid:   liquid || undefined,
    servingSize: servQty || 100,
    servings: servQty > 0 && servDesc
      ? [{ description: `1 porción (${servDesc})`, grams: servQty }]
      : [],
    imageUrl: p.image_front_thumb_url || p.image_thumb_url || undefined,
    source: 'off',
    ...(micros ? { micros } : {}),
    ...(allergens.length ? { allergens } : {}),
    ...(traces.length ? { traces } : {}),
  };
}

/** Producto de la base del servidor (PackagedFoods) → FoodItem. */
function fromPackaged(p: any): FoodItem | null {
  const c = p?.per100;
  if (!p?.name || !c || typeof c.kcal !== 'number') return null;
  const servG = typeof p.servingG === 'number' && p.servingG > 0 ? p.servingG : 0;
  return {
    id: String(p.code), name: p.name, brand: p.brand || undefined,
    calories: Math.round(c.kcal), protein: r1(c.protein || 0), carbs: r1(c.carbs || 0), fat: r1(c.fat || 0),
    fiber: r1(c.fiber || 0), sugar: r1(c.sugar || 0), sodium: plausibleSodiumMg(c.sodiumMg || 0, p.name) ?? 0,
    satFat: typeof c.satFat === 'number' ? c.satFat : undefined, nova: p.nova, nutriscore: p.nutriscore,
    servingSize: servG || 100,
    servings: servG ? [{ description: `1 porción (${p.servingText || `${servG}g`})`, grams: servG }] : [],
    source: p.source === 'usuario' ? 'etiqueta' : 'eris',
    ...(Array.isArray(p.allergens) && p.allergens.length ? { allergens: p.allergens.map(String) } : {}),
    ...(Array.isArray(p.traces) && p.traces.length ? { traces: p.traces.map(String) } : {}),
  };
}

/** Variantes del mismo código: EAN-13 / UPC-A (12) / GTIN-14 (el lector a veces agrega o quita el 0 inicial). */
export function codeVariants(raw: string): string[] {
  const c = String(raw || '').replace(/\D/g, '');
  if (!c) return [];
  const out = new Set<string>([c]);
  const stripped = c.replace(/^0+/, '');
  if (stripped.length >= 8) out.add(stripped);
  for (const len of [12, 13]) if (stripped.length < len) out.add(stripped.padStart(len, '0'));
  return [...out];
}

export interface BarcodeResult {
  food: FoodItem | null;
  /** solo se conoce el nombre: el usuario completa la tabla nutricional */
  nameOnly?: { name: string; brand?: string };
  code: string;
  source?: 'telefono' | 'eris' | 'off';
}

const BARCODE_CACHE_KEY = 'eris_barcode_cache_v1';
const BARCODE_CACHE_MAX = 400;
/** Tus versiones de alimentos (por cuenta: ScopedStorage) */
const MY_FOODS_KEY = 'eris_my_foods_v1';
const MY_FOODS_MAX = 300;

// ─── Servicio ─────────────────────────────────────────────────

class FoodSearchService {
  private cache = new Map<string, FoodItem[]>();

  // ─── Tu versión de un alimento ─────────────────────────────
  // «Editar información nutricional» en lo anotado (2026-10-23): tus valores reemplazan al original desde ahí, al buscar
  // y en el chat (el servidor recibe la lista con `my_foods_sync`). Una versión por alimento; se guarda por cuenta.
  private mine: FoodItem[] | null = null;
  private mineIndex: FoodIndex<FoodItem> | null = null;

  /** Al cambiar de cuenta (lo llama App: este archivo no importa React Native, para poder probarlo): «mis versiones» son de
   * cada uno; antes se subían a la cuenta nueva al conectar (revisión D4) */
  olvidarCuenta() { this.mine = null; this.mineIndex = null; }

  async myFoods(): Promise<FoodItem[]> {
    if (!this.mine) {
      try { this.mine = JSON.parse((await AsyncStorage.getItem(MY_FOODS_KEY)) || '[]'); } catch { this.mine = []; }
      if (!Array.isArray(this.mine)) this.mine = [];
    }
    return this.mine!;
  }

  /** Guarda tu versión de `original` con estos valores por 100 g y la devuelve (lista para anotar). */
  async saveMyVersion(original: FoodItem, per100: Pick<FoodItem, 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar' | 'sodium' | 'satFat'>): Promise<FoodItem> {
    const baseKey = original.baseKey ?? sameKey(original);
    const mine: FoodItem = {
      ...original, ...per100, id: `mia_${Date.now()}`, source: 'mia', mine: true, baseKey,
      recent: undefined, nutriscore: undefined, imageUrl: undefined,
    };
    const list = (await this.myFoods()).filter((f) => f.baseKey !== baseKey && sameKey(f) !== sameKey(mine));
    this.mine = [mine, ...list].slice(0, MY_FOODS_MAX);
    this.mineIndex = null;
    this.cache.clear();
    await AsyncStorage.setItem(MY_FOODS_KEY, JSON.stringify(this.mine)).catch(() => {});
    this.syncMyFoods();
    return mine;
  }

  /** Vuelve a los valores de la base: borra tu versión de ese alimento. */
  async removeMyVersion(food: FoodItem): Promise<void> {
    const key = food.baseKey ?? sameKey(food);
    this.mine = (await this.myFoods()).filter((f) => f.baseKey !== key && f.id !== food.id);
    this.mineIndex = null;
    this.cache.clear();
    await AsyncStorage.setItem(MY_FOODS_KEY, JSON.stringify(this.mine)).catch(() => {});
    this.syncMyFoods();
  }

  /** Al servidor, para que el chat use tus valores («me comí una hallulla» con los de tu panadería). */
  async syncMyFoods(): Promise<void> {
    if (wsManager.getStatus() !== 'connected') return;
    const foods = (await this.myFoods()).map((f) => ({
      name: f.name, brand: f.brand, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber,
      sugar: f.sugar, sodium: f.sodium, satFat: f.satFat, servingSize: f.servingSize, servings: f.servings, liquid: f.liquid,
    }));
    wsManager.sendMessage({ type: 'my_foods_sync', foods });
  }

  private async searchMine(query: string): Promise<Hit[]> {
    const list = await this.myFoods();
    if (!list.length || !normText(query)) return [];
    if (!this.mineIndex) this.mineIndex = new FoodIndex(list, (f) => nameKeys(f.name).map((k) => ({ ...k, extra: f.brand })));
    return this.mineIndex.search(query, { limit: 5, prefix: true }).map((h) => ({ food: h.item, score: h.score, exact: h.exact }));
  }

  /**
   * Lo que ya anotaste en las últimas 4 semanas y calza con TODAS las palabras buscadas (lo más reciente primero).
   * Lo que uno come se repite: así aparece al tiro, sin depender de Open Food Facts.
   */
  async searchRecent(query: string, days = 28): Promise<Hit[]> {
    if (!normText(query)) return [];
    const keys = Array.from({ length: days }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return `${RECENT_LOG_KEY}_${d.toDateString()}`; });
    // Lo anotado, sin repetir, de lo más reciente a lo más antiguo
    const pool: FoodItem[] = [];
    const seen = new Set<string>();
    try {
      for (const [, raw] of await AsyncStorage.multiGet(keys)) {
        if (!raw) continue;
        let log: LoggedFood[] = [];
        try { log = JSON.parse(raw); } catch { continue; }
        for (const e of [...log].reverse()) {
          const f = e?.food;
          // Tus versiones salen de su propia lista (searchMine): la de un registro viejo puede ser una que ya cambiaste o dejaste de usar
          if (!f?.name || f.mine) continue;
          const k = sameKey(f);
          if (seen.has(k)) continue;
          seen.add(k);
          pool.push(f);
        }
      }
    } catch {}
    if (!pool.length) return [];
    // Mismo estándar que la base: a igual calce, lo más reciente primero
    const order = new Map(pool.map((f, i) => [f, i]));
    return new FoodIndex(pool, (f) => nameKeys(f.name).map((k) => ({ ...k, extra: f.brand })))
      .search(query, { limit: 20, prefix: true })
      .sort((a, b) => b.score - a.score || order.get(a.item)! - order.get(b.item)!)
      .slice(0, 5)
      .map((h) => ({ food: { ...h.item, recent: true }, score: h.score, exact: h.exact }));
  }

  /** Con menos de 3 letras no vale la pena salir a internet: basta lo anotado y la base local. */
  wantsNetwork(query: string): boolean {
    return normText(query).replace(/ /g, '').length >= 3;
  }

  /** Lo que se puede mostrar al instante, sin red: lo ya anotado y la base local (desde la primera letra). */
  async searchQuick(query: string): Promise<FoodItem[]> {
    const [recent, mine] = await Promise.all([this.searchRecent(query), this.searchMine(query)]);
    return this.merge(query, recent, searchLocalScored(query), [], [], mine);
  }

  /** Envasados chilenos del servidor de Eris (con su calce) y la corrección del texto con TODAS sus bases. */
  private askErisSearch(query: string, ms = 2500): Promise<{ hits: Hit[]; corrected: string | null } | null> {
    if (wsManager.getStatus() !== 'connected') return Promise.resolve(null);
    return new Promise((resolve) => {
      const requestId = `fs_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      let done = false;
      const finish = (r: { hits: Hit[]; corrected: string | null } | null) => {
        if (done) return; done = true; clearTimeout(timer); unsub(); resolve(r);
      };
      const timer = setTimeout(() => finish(null), ms);
      const unsub = wsManager.subscribeMessage((d: any) => {
        if (d?.type !== 'food_search_result' || d.requestId !== requestId) return;
        const hits = (Array.isArray(d.hits) ? d.hits : [])
          .map((h: any) => ({ food: fromPackaged(h?.product), score: Number(h?.score) || 0, exact: h?.exact === true }))
          .filter((h: { food: FoodItem | null }) => h.food) as Hit[];
        finish({ hits, corrected: typeof d.corrected === 'string' && d.corrected ? d.corrected : null });
      });
      wsManager.sendMessage({ type: 'food_search', requestId, query });
    });
  }

  /** Una consulta a Open Food Facts. `ok` = respondió (aunque sea sin resultados); si falló, no se guarda en caché. */
  private async searchOff(terms: string): Promise<{ ok: boolean; items: FoodItem[] }> {
    try {
      const url = `${OFF_URL}/cgi/search.pl?` + new URLSearchParams({
        search_terms: terms, search_simple: '1', action: 'process', json: '1', page_size: '15', lc: 'es', fields: OFF_FIELDS,
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return { ok: false, items: [] };
      const data = await res.json();
      return { ok: true, items: (data.products || []).map(parseProduct).filter((x: FoodItem | null): x is FoodItem => x !== null) };
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.warn('[FoodSearch] OFF error:', e?.message);
      return { ok: false, items: [] };
    }
  }

  async search(query: string): Promise<FoodItem[]> {
    // "Coca-Cola Zero", "coca cola zero " y "COCA COLA ZERO" son la misma búsqueda (y el mismo caché)
    const key = normText(query);
    if (!key) return [];
    if (this.cache.has(key)) return this.cache.get(key)!;

    // 0. Lo que ya anotaste antes y tus versiones — 1. DB local (al instante, sin red)
    const [recent, mine] = await Promise.all([this.searchRecent(query), this.searchMine(query)]);
    const local = searchLocalScored(query);
    if (!this.wantsNetwork(query)) return this.merge(query, recent, local, [], [], mine);

    // 2. Envasados del servidor de Eris y Open Food Facts, en paralelo. A OFF va el texto estándar, corregido contra la
    //    base local ("chocapig" → "chocapic"); si no trae nada y el servidor (que conoce más palabras) lo corrige
    //    distinto, se prueba con esa corrección.
    const offQuery = correctText(query, [localIndex() as FoodIndex<unknown>]) ?? key;
    const [eris, first] = await Promise.all([this.askErisSearch(query), this.searchOff(offQuery)]);
    let r = first;
    const better = eris?.corrected && eris.corrected !== offQuery ? eris.corrected : null;
    if (r.ok && !r.items.length && better) r = await this.searchOff(better);
    const want = better ?? offQuery;
    // Su búsqueda por texto es irregular: "Crocata huevo tocino" a veces no trae nada y "crocata" sí (2026-10-07). Si una
    // búsqueda de varias palabras vuelve vacía, se busca la palabra más distintiva y se deja lo que calce con todas.
    const words = want.split(' ').filter((w) => w.length >= 3);
    if (r.ok && !r.items.length && words.length >= 2) {
      const longest = [...words].sort((a, b) => b.length - a.length)[0];
      const r2 = await this.searchOff(longest);
      if (r2.ok) {
        const all = new FoodIndex(r2.items, (f) => nameKeys(f.name).map((k) => ({ ...k, extra: f.brand }))).search(want, { limit: r2.items.length });
        r = { ok: true, items: all.map((h) => h.item) };
      }
    }
    const combined = this.merge(query, recent, local, eris?.hits ?? [], r.ok ? rankByText(r.items, want) : [], mine);
    // Si Open Food Facts no respondió, NO se guarda: antes un fallo quedaba como "Sin resultados" toda la sesión
    if (r.ok) this.cache.set(key, combined);
    return combined;
  }

  /**
   * Junta las fuentes sin repetir (mismo texto estándar = mismo alimento), con lo natural primero (2026-10-23: «manzana»
   * daba el jugo de manzana anotado la semana pasada, o la «Manzana» de Watt's, antes que la fruta):
   *   1. tu versión o lo ya anotado, solo si es EXACTAMENTE lo buscado (foodText.sameFood; con marca, si se nombró la marca);
   *   2. el alimento base de la base local con ese nombre («Manzana», «Palta / Aguacate»);
   *   3. el resto por calce (lo que calza entero antes), con lo natural arriba y los derivados abajo (foodText.naturalBoost);
   *      lo ya anotado y tus versiones suben apenas, para desempatar;
   *   4. Open Food Facts al final.
   * Tu versión de un alimento reemplaza al original: el mismo alimento no sale dos veces con valores distintos.
   */
  private merge(query: string, recent: Hit[], local: Hit[], eris: Hit[], off: FoodItem[], mine: Hit[] = []): FoodItem[] {
    const out: FoodItem[] = [];
    const seenKey = new Set<string>();
    const seenId = new Set<string>();
    const replaced = new Set(mine.map((m) => m.food.baseKey).filter(Boolean) as string[]);
    const push = (f: FoodItem) => {
      const k = sameKey(f);
      // OFF es colaborativo: el mismo producto suele estar repetido con el mismo nombre (distinto contribuidor). Solo se
      // sacan los iguales; "empanada de carne" y "de pino" se quedan, porque de verdad pueden ser distintos.
      if (seenKey.has(k) || seenKey.has(normText(f.name)) || seenId.has(f.id)) return;
      if (!f.mine && (replaced.has(k) || (f.baseKey && replaced.has(f.baseKey)))) return;
      seenKey.add(k); seenKey.add(normText(f.name)); seenId.add(f.id);
      out.push(f);
    };
    const exactly = (f: FoodItem) => sameFood(query, f.name, f.brand);
    [...mine, ...recent].filter((h) => exactly(h.food)).forEach((h) => push(h.food));
    local.filter((h) => h.exact && exactly(h.food)).forEach((h) => push(h.food));
    const adj = (x: Hit & { bonus: number }) => x.score + x.bonus + naturalBoost(query, x.food.name, x.food.brand);
    [...mine.map((x) => ({ ...x, src: 0, bonus: 0.5 })), ...recent.map((x) => ({ ...x, src: 0, bonus: 0.5 })),
      ...local.map((x) => ({ ...x, src: 1, bonus: 0 })), ...eris.map((x) => ({ ...x, src: 2, bonus: 0 }))]
      .sort((a, b) => Number(!!b.exact) - Number(!!a.exact) || adj(b) - adj(a) || a.src - b.src)
      .forEach((x) => push(x.food));
    off.forEach(push);
    return out;
  }

  async getByBarcode(barcode: string): Promise<FoodItem | null> {
    return (await this.lookupBarcode(barcode)).food;
  }

  // ─── Código de barras ──────────────────────────────────────

  private async readBarcodeCache(): Promise<Record<string, FoodItem>> {
    try { return JSON.parse((await AsyncStorage.getItem(BARCODE_CACHE_KEY)) || '{}'); } catch { return {}; }
  }
  private async writeBarcodeCache(code: string, food: FoodItem) {
    try {
      const cache = await this.readBarcodeCache();
      delete cache[code];
      cache[code] = food;
      const keys = Object.keys(cache);
      for (const k of keys.slice(0, Math.max(0, keys.length - BARCODE_CACHE_MAX))) delete cache[k];
      await AsyncStorage.setItem(BARCODE_CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }

  /** Servidor de Eris: base chilena (OFF importado + cargados a mano) y su propia cascada OFF/USDA/nombre. */
  private askEris(code: string, ms = 16000): Promise<BarcodeResult | null> {
    if (wsManager.getStatus() !== 'connected') return Promise.resolve(null);
    return new Promise((resolve) => {
      const requestId = `bc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      let done = false;
      const finish = (r: BarcodeResult | null) => { if (done) return; done = true; clearTimeout(timer); unsub(); resolve(r); };
      const timer = setTimeout(() => finish(null), ms);
      const unsub = wsManager.subscribeMessage((d: any) => {
        if (d?.type !== 'food_barcode_result' || d.requestId !== requestId) return;
        const food = d.found ? fromPackaged(d.product) : null;
        finish({ food, code, source: food ? 'eris' : undefined, nameOnly: d.nameOnly });
      });
      wsManager.sendMessage({ type: 'food_barcode', requestId, code });
    });
  }

  /** Open Food Facts directo (por si el servidor no está): prueba las variantes del código en paralelo. */
  private async askOff(code: string): Promise<BarcodeResult | null> {
    const one = async (v: string): Promise<{ food: FoodItem | null; name?: string; brand?: string } | null> => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        // /api/v2/ es el único endpoint que todavía sirve "nutriments" en el formato plano que usa parseProduct
        const res = await fetch(`${OFF_URL}/api/v2/product/${v}.json?fields=${OFF_FIELDS}`, { signal: controller.signal, headers: { 'User-Agent': OFF_UA } });
        clearTimeout(timer);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.status !== 1 || !data.product) return null;
        const p = { ...data.product, code: data.product.code || v };
        return { food: parseProduct(p), name: p.product_name_es || p.product_name, brand: p.brands?.split(',')[0]?.trim() };
      } catch { return null; }
    };
    const results = await Promise.all(codeVariants(code).map(one));
    const hit = results.find(r => r?.food);
    if (hit?.food) return { food: hit.food, code, source: 'off' };
    const named = results.find(r => r?.name);
    return named?.name ? { food: null, code, nameOnly: { name: named.name, brand: named.brand } } : null;
  }

  /**
   * Busca un código de barras en todo lo que hay. Devuelve el alimento o, si nadie tiene la tabla nutricional, lo
   * que se sepa del nombre (para que el usuario cargue la etiqueta). Nunca lanza.
   */
  async lookupBarcode(raw: string): Promise<BarcodeResult> {
    const variants = codeVariants(raw);
    const code = variants[0] ?? String(raw);
    if (!variants.length) return { food: null, code };
    const cache = await this.readBarcodeCache();
    for (const v of variants) if (cache[v]) return { food: cache[v], code, source: 'telefono' };

    // Eris y OFF en paralelo: gana el primero que tenga la tabla nutricional; si ninguno, el nombre que haya
    const eris = this.askEris(code);
    const off = this.askOff(code);
    const first = await new Promise<BarcodeResult | null>((resolve) => {
      let pending = 2;
      const take = (r: BarcodeResult | null) => { if (r?.food) resolve(r); else if (--pending === 0) resolve(null); };
      eris.then(take, () => take(null));
      off.then(take, () => take(null));
    });
    if (first?.food) {
      this.writeBarcodeCache(code, first.food);
      return first;
    }
    const [e, o] = await Promise.all([eris, off]);
    return { food: null, code, nameOnly: e?.nameOnly ?? o?.nameOnly };
  }

  /**
   * Producto cargado a mano (tabla del envase): queda en el teléfono al tiro y se manda al servidor para que la
   * próxima vez lo reconozca cualquiera (y Eris también, al registrar por chat).
   */
  async contributeBarcode(code: string, food: FoodItem): Promise<void> {
    const c = codeVariants(code)[0] ?? code;
    const item: FoodItem = { ...food, id: c };
    await this.writeBarcodeCache(c, item);
    if (wsManager.getStatus() === 'connected') {
      wsManager.sendMessage({
        type: 'food_barcode_contribute', requestId: `bcs_${Date.now()}`,
        product: {
          code: c, name: item.name, brand: item.brand, servingG: item.servingSize !== 100 ? item.servingSize : undefined,
          per100: { kcal: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat, fiber: item.fiber, sugar: item.sugar, sodiumMg: item.sodium, satFat: item.satFat },
        },
      });
    }
  }

  calcPortion(food: FoodItem, grams: number): Omit<FoodItem, 'id' | 'name' | 'brand' | 'servingSize' | 'servings' | 'imageUrl'> {
    const factor = grams / 100;
    return {
      calories: Math.round(food.calories * factor),
      protein:  Math.round(food.protein  * factor * 10) / 10,
      carbs:    Math.round(food.carbs    * factor * 10) / 10,
      fat:      Math.round(food.fat      * factor * 10) / 10,
      fiber:    Math.round(food.fiber    * factor * 10) / 10,
      sugar:    Math.round(food.sugar    * factor * 10) / 10,
      // También lo ya guardado (recientes, caché de códigos, registros viejos) pasa por el filtro de valores posibles
      sodium:   Math.round((plausibleSodiumMg(food.sodium, food.name) ?? 0) * factor),
    };
  }
}

export const foodSearchService = new FoodSearchService();

/**
 * Las vitaminas y minerales de un alimento por 100 g: los suyos, o los del alimento de la base con ese mismo nombre (lo
 * anotado por chat o antes de la 1.58 no los traía). `estimated` = salen de la base por el nombre.
 */
export function microsFor(food: FoodItem): { micros: Micros; estimated: boolean } | null {
  if (food.micros && Object.keys(food.micros).length) return { micros: food.micros, estimated: false };
  const byId = localFoods.find((x) => x.id === food.id);
  if (byId?.micro) return { micros: byId.micro, estimated: false };
  const key = normText(food.name);
  const lf = localFoods.find((x) => normText(x.name) === key || nameKeys(x.name).some((k) => normText(k.text) === key) || (x.aliases ?? []).some((a) => normText(a) === key));
  return lf?.micro ? { micros: lf.micro, estimated: true } : null;
}
// Al conectarse (o reconectarse), el servidor recibe tus versiones: pueden haberse guardado sin conexión
wsManager.subscribeMessage((d: any) => { if (d?.type === 'connected') foodSearchService.syncMyFoods().catch(() => {}); });

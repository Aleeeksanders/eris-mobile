/**
 * FoodSearchService — Búsqueda de alimentos
 *
 * Prioridad:
 *   1. DB local Chile (107 alimentos típicos, instant, offline)
 *   2. Open Food Facts (>3M productos, productos envasados, barcodes)
 */

import localFoodsRaw from '../data/chilean-foods.json';

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
}

export interface LoggedFood {
  food: FoodItem;
  grams: number;
  mealType: string;       // slot id configurable por el usuario
  loggedAt: string;
}

// ─── DB local Chile ───────────────────────────────────────────

interface LocalFood {
  id: string;
  name: string;
  aliases?: string[];
  category: string;
  serving: { description: string; grams: number; calories: number; carbs: number; protein: number; fat: number; fiber: number; sugar?: number };
  alt?: Array<{ description: string; grams: number; calories: number; carbs: number; protein: number; fat: number; fiber: number; sugar?: number }>;
}

const localFoods = localFoodsRaw as LocalFood[];

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
    sodium:   0,
    servingSize: lf.serving.grams,
    servings,
  };
}

function searchLocal(query: string): FoodItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return localFoods
    .filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.aliases?.some(a => a.toLowerCase().includes(q)) ||
      f.category.toLowerCase().includes(q)
    )
    .slice(0, 8)
    .map(localFoodToFoodItem);
}

// ─── Open Food Facts ──────────────────────────────────────────

const OFF_URL = 'https://world.openfoodfacts.org';

function parseProduct(p: any): FoodItem | null {
  const n = p.nutriments;
  if (!n) return null;
  const cal = n['energy-kcal_100g'] ??
    (n['energy_100g'] ? Math.round(n['energy_100g'] / 4.184) : 0);
  if (!cal) return null;

  const servQty = p.serving_quantity ? parseFloat(p.serving_quantity) || 0 : 0;
  const servDesc = p.serving_size || (servQty > 0 ? `${Math.round(servQty)}g` : null);

  return {
    id: p.code || p._id || String(Math.random()),
    name: p.product_name_es || p.product_name || p.generic_name || 'Sin nombre',
    brand: p.brands || undefined,
    calories: Math.round(cal),
    protein:  Math.round((n.proteins_100g       || 0) * 10) / 10,
    carbs:    Math.round((n.carbohydrates_100g   || 0) * 10) / 10,
    fat:      Math.round((n.fat_100g             || 0) * 10) / 10,
    fiber:    Math.round((n.fiber_100g           || 0) * 10) / 10,
    sugar:    Math.round((n.sugars_100g          || 0) * 10) / 10,
    sodium:   Math.round((n.sodium_100g          || 0) * 1000),
    servingSize: servQty || 100,
    servings: servQty > 0 && servDesc
      ? [{ description: `1 porción (${servDesc})`, grams: servQty }]
      : [],
    imageUrl: p.image_front_thumb_url || p.image_thumb_url || undefined,
  };
}

// ─── Servicio ─────────────────────────────────────────────────

class FoodSearchService {
  private cache = new Map<string, FoodItem[]>();

  async search(query: string): Promise<FoodItem[]> {
    const key = query.toLowerCase().trim();
    if (this.cache.has(key)) return this.cache.get(key)!;

    // 1. DB local — instant, sin red
    const local = searchLocal(query);

    // 2. Open Food Facts para lo que no está en el DB local
    let off: FoodItem[] = [];
    try {
      const url = `${OFF_URL}/cgi/search.pl?` + new URLSearchParams({
        search_terms: query,
        search_simple: '1',
        action: 'process',
        json: '1',
        page_size: '15',
        lc: 'es',
        fields: 'code,product_name,product_name_es,brands,nutriments,serving_quantity,serving_size,image_front_thumb_url',
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        off = (data.products || [])
          .map(parseProduct)
          .filter((x: FoodItem | null): x is FoodItem => x !== null)
          .filter((o: FoodItem) => !local.some(l => l.name.toLowerCase() === o.name.toLowerCase()));
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.warn('[FoodSearch] OFF error:', e.message);
    }

    const combined = [...local, ...off];
    this.cache.set(key, combined);
    return combined;
  }

  async getByBarcode(barcode: string): Promise<FoodItem | null> {
    try {
      const url = `${OFF_URL}/product/${barcode}.json?fields=code,product_name,product_name_es,brands,nutriments,serving_quantity,serving_size,image_front_thumb_url`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      const data = await res.json();
      if (data.status !== 1 || !data.product) return null;
      return parseProduct(data.product);
    } catch {
      return null;
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
      sodium:   Math.round(food.sodium   * factor),
    };
  }
}

export const foodSearchService = new FoodSearchService();

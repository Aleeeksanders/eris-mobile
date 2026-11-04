// ============================================================
// Eris — valores nutricionales posibles
//
// Open Food Facts lo llena cualquiera: hay sodio cargado en la unidad equivocada ("Fresh Toppings" 974.000 mg por 100 g,
// una "leche vegetal" 17.600 mg). El 2026-10-08 Métricas mostró 84.977 mg de sodio en un día. Un valor imposible no se
// adivina (¿×100? ¿×1000?): se descarta, como si el producto no lo informara.
//
// COPIA EXACTA en el servidor (eris/src/services/NutrientSanity.ts; bun scripts/sync_copias.ts). Revisión N1 (2026-11-04):
// antes la app solo corregía el sodio y las kcal, y el servidor además los macros > 100 g, el azúcar mayor que los
// carbohidratos y la grasa saturada mayor que la grasa: el mismo producto valía distinto en la app y en el chat.
// ============================================================

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Alimentos que de verdad llevan mucho sodio (la sal pura tiene ~39.300 mg por 100 g). */
const SALTY = /\b(sal|salt|caldo|caldos|cubo|cubito|consome|consomme|soya|soja|hornear|bicarbonato|levadura|aceitunas?|anchoas?|condimentos?|sazonador|alino|miso|glutamato|ajinomoto|bouillon|stock)\b/;

/** Máximo posible de sodio (mg por 100 g) para ese alimento. */
export const maxSodiumMg = (name: string) => (SALTY.test(fold(name)) ? 40000 : 6000);

/** Sodio en mg por 100 g, o undefined si es imposible para ese alimento. */
export function plausibleSodiumMg(mg: unknown, name: string): number | undefined {
  if (typeof mg !== 'number' || !Number.isFinite(mg) || mg < 0) return undefined;
  return mg <= maxSodiumMg(name) ? Math.round(mg) : undefined;
}

export interface Per100 { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sugar?: number; sodiumMg?: number; satFat?: number }

/** Valores por 100 g dentro de lo posible: macros ≤ 100 g, energía ≤ 900 kcal (si no, venía en kJ), sodio plausible. */
export function sanitizePer100<T extends Per100>(p: T, name: string): T {
  const ok = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
  const g = (v: number | undefined) => (ok(v) ? v : v === undefined ? undefined : 0);
  let kcal = p.kcal;
  if (kcal > 900) kcal = Math.round(kcal / 4.184); // kJ en el campo de kcal
  if (kcal > 900) kcal = Math.round(4 * (g(p.protein) ?? 0) + 4 * (g(p.carbs) ?? 0) + 9 * (g(p.fat) ?? 0));
  return {
    ...p, kcal,
    protein: g(p.protein) ?? 0, carbs: g(p.carbs) ?? 0, fat: g(p.fat) ?? 0, fiber: g(p.fiber) ?? 0,
    // Un azúcar o una grasa saturada imposible queda como desconocido (no como 0, que escondería un sello «ALTO EN»)
    sugar: ok(p.sugar) ? Math.min(p.sugar!, ok(p.carbs) ? p.carbs : 100) : undefined,
    satFat: ok(p.satFat) ? Math.min(p.satFat!, ok(p.fat) ? p.fat : 100) : undefined,
    sodiumMg: plausibleSodiumMg(p.sodiumMg, name),
  };
}

// ============================================================
// Eris Mobile — bebidas
//
// Una Coca-Cola Zero buscada en Nutrición se anotaba en gramos, con porción de 100 g, y no sumaba a la meta de agua
// (2026-10-09). Las bebidas se miden en ml, con porciones reales (vaso, lata, botella), y al registrarlas también suman
// al agua del día. Misma clasificación que el servidor (eris/src/tools/NutritionTool.ts → beverageTypeOf).
// ============================================================

import type { FoodItem } from './FoodSearchService';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Tipo de bebida, o null si no es una (la leche, el yogur y la sopa cuentan como comida). */
export function beverageTypeOf(name: string): string | null {
  const t = fold(name);
  if (/\b(leche|yogur|yoghurt|yogurt|batido|smoothie|sopa|caldo|cazuela)\b/.test(t)) return null;
  if (/\b(cerveza|vino|pisco|piscola|ron|whisky|vodka|trago)\b/.test(t)) return 'alcohol';
  if (/\b(isotonic\w*|gatorade|powerade)\b/.test(t)) return 'bebida_isotonica';
  if (/\b(jugo|nectar)\b/.test(t)) return 'jugo';
  if (/\b(cafe|te|infusion|mate)\b/.test(t)) return 'te_cafe';
  if (/\b(coca|cola|bebida|gaseosa|fanta|sprite|pepsi|energetica|red ?bull|monster|limonada|kombucha)\b/.test(t)) return 'bebida';
  if (/\bagua\b/.test(t)) return 'agua';
  return null;
}

/** ¿Suma a la meta de agua? Toda bebida salvo el alcohol (hidratan prácticamente igual que el agua). */
export const countsAsWater = (food: FoodItem) => {
  const t = beverageTypeOf(food.name);
  return t !== null && t !== 'alcohol';
};

export const isBeverage = (food: FoodItem) => beverageTypeOf(food.name) !== null;

const DRINK_SERVINGS = [
  { description: '1 vaso (250 ml)', grams: 250 },
  { description: '1 lata (350 ml)', grams: 350 },
  { description: '1 botella (500 ml)', grams: 500 },
  { description: '1 botella (591 ml)', grams: 591 },
];

/** La bebida con porciones en ml (las que ya traía van primero, si no están repetidas). */
export function withDrinkServings(food: FoodItem): FoodItem {
  if (!isBeverage(food)) return food;
  const own = (food.servings ?? []).filter((s) => s.grams > 0 && !DRINK_SERVINGS.some((d) => d.grams === s.grams));
  return { ...food, liquid: true, servings: [...own, ...DRINK_SERVINGS] };
}

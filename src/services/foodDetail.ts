// ============================================================
// Eris — el detalle de un alimento anotado (fase I4, 2026-10-23)
//
// Al tocar algo anotado en Nutrición se ve todo lo que se sabe de esa porción:
// - macros, fibra, azúcar, sodio y grasa saturada;
// - el agua que trae, la calidad (letra, sellos «ALTO EN», NOVA y grupo) y los alérgenos;
// - de dónde salen los datos.
// Lo que falta se completa con la base local, igual que la calidad del día (nutritionQualityCore.toQualityItem), y se
// marca como estimado. Nada de esto juzga: la calidad se muestra como dato, sin culpa («medir sin obsesión»).
// ============================================================

import { microsFor, type FoodItem, type FoodSource, type LoggedFood } from './FoodSearchService';
import { scaleMicros, MICROS, dri, type Micros, type MicroKey, type Persona } from './supplements/supplementCore';
import { itemQuality, toQualityItem, type FoodGroup, type Letter } from './nutritionQualityCore';
import { foodWaterL } from './foodWater';
import { isBeverage } from './beverage';
import { plausibleSodiumMg } from './nutrientSanity';

export const SOURCE_LABEL: Record<FoodSource, string> = {
  base: 'Base de alimentos de Eris (Chile)',
  eris: 'Envasados de Eris (Open Food Facts revisado)',
  off: 'Open Food Facts',
  etiqueta: 'Tabla del envase que cargaste',
  chat: 'Anotado por chat con Eris',
  mia: 'Tu versión (valores que corregiste)',
};

/** De dónde salen los valores. Los registros de antes de 1.58 no lo guardaban: se deduce por el id. */
export function sourceOf(food: FoodItem): FoodSource {
  if (food.source) return food.source;
  if (food.mine || food.id.startsWith('mia_')) return 'mia';
  if (food.id.startsWith('cl:')) return 'base';
  if (food.id.startsWith('eris_')) return 'chat';
  return /^\d{6,}$/.test(food.id) ? 'off' : 'base';
}

export const ALLERGEN_LABEL: Record<string, string> = {
  gluten: 'Gluten', lactosa: 'Lactosa', huevo: 'Huevo', soya: 'Soya', frutos_secos: 'Frutos secos', mani: 'Maní',
  pescado: 'Pescado', mariscos: 'Mariscos', sesamo: 'Sésamo', mostaza: 'Mostaza', apio: 'Apio', sulfitos: 'Sulfitos',
  lupino: 'Lupino', cerdo: 'Cerdo', alcohol: 'Alcohol', gelatina: 'Gelatina', alto_mercurio: 'Alto en mercurio',
  higado: 'Hígado', crudo_ahumado: 'Crudo o ahumado',
};

// Por el NOMBRE (lo que se ve en un plato, no en una lista de ingredientes): avisar de más antes que de menos.
// Mismas etiquetas que el servidor (PackagedFoods.TEXT_RULES).
const NAME_RULES: Array<[string, RegExp]> = [
  ['gluten', /\b(pan|panes|marraqueta|hallulla|amasado|dobladita|fideos?|tallarin(es)?|pastas?|lasana|ravioles|noquis|galletas?|queque|kuchen|torta|pie|empanadas?|pizza|sopaipillas?|churros?|berlin|donas?|medialunas?|croissant|wraps?|tortilla de trigo|trigo|cebada|centeno|avena|semola|harina|cerveza|apanad[oa]s?|hamburguesas?|completos?|churrasco|barros|chacarero|italiano|sandwich|cereal(es)?|choripan)\b/],
  ['lactosa', /\b(leche|quesos?|quesillo|yogu?rt?|mantequilla|crema|manjar|helados?|flan|cuajada|kefir|ricotta|mozzarella|parmesano|gauda|mantecoso|cottage|chantilly)\b/],
  ['huevo', /\b(huevos?|clara|yema|mayo|mayonesa|panqueques?|queque|flan|omelette|tortilla de huevo|merengue|pino)\b/],
  ['soya', /\b(soya|soja|tofu|edamame)\b/],
  ['frutos_secos', /\b(nuez|nueces|almendras?|avellanas?|pistachos?|castanas?|maranon(es)?|pecanas?|macadamia|frutos secos|mix de frutos)\b/],
  ['mani', /\b(mani|cacahuate|cacahuete)\b/],
  ['pescado', /\b(pescados?|atun|salmon|merluza|reineta|congrio|jurel|sardinas?|anchoas?|caballa|corvina|tilapia|bacalao)\b/],
  ['mariscos', /\b(mariscos?|camarones?|langostinos?|choros?|cholgas?|almejas?|machas?|ostiones?|ostras?|pulpo|calamar(es)?|jaiba|centolla|locos?|erizos?)\b/],
  ['sesamo', /\b(sesamo|ajonjoli|tahini|hummus)\b/],
  ['mostaza', /\bmostaza\b/],
  ['cerdo', /\b(cerdo|chancho|jamon|tocino|panceta|chorizo|longaniza|mortadela|salame|salami|pernil|costillar|prieta|arrollado)\b/],
  ['alcohol', /\b(vino|cerveza|pisco|ron|licor|whisky|vodka|piscola|chela|terremoto|cola de mono|navegado)\b/],
];
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface AllergenInfo {
  /** declarados en el envase (Open Food Facts / base de envasados) */
  declared: string[];
  /** «puede contener trazas de» */
  traces: string[];
  /** posibles por el nombre (sin etiqueta que lo confirme) */
  byName: string[];
}

export function allergensOf(food: FoodItem): AllergenInfo {
  const declared = food.allergens ?? [];
  const traces = (food.traces ?? []).filter((t) => !declared.includes(t));
  const n = fold(`${food.name} ${food.brand ?? ''}`);
  const byName = NAME_RULES.filter(([tag, re]) => re.test(n) && !declared.includes(tag) && !traces.includes(tag)).map(([tag]) => tag);
  return { declared, traces, byName };
}

export const NOVA_LABEL: Record<number, string> = {
  1: 'Natural o mínimamente procesado',
  2: 'Ingrediente culinario',
  3: 'Procesado',
  4: 'Ultraprocesado',
};

export const GROUP_LABEL: Record<FoodGroup, string> = {
  verdura: 'Verdura', fruta: 'Fruta', legumbre: 'Legumbre', cereal_integral: 'Cereal integral', cereal_refinado: 'Cereal refinado',
  pan: 'Pan', lacteo: 'Lácteo', proteina_magra: 'Proteína magra', carne_roja: 'Carne roja', embutido: 'Embutido',
  pescado: 'Pescado', huevo: 'Huevo', frutos_secos: 'Frutos secos', grasa: 'Grasa', dulce: 'Dulce', snack_salado: 'Snack salado',
  bebida_azucarada: 'Bebida con azúcar', bebida_sin_azucar: 'Bebida sin azúcar', agua: 'Agua', alcohol: 'Alcohol',
  comida_rapida: 'Comida rápida', plato_casero: 'Plato casero', suplemento: 'Suplemento', otro: 'Otro',
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export interface FoodDetail {
  grams: number;
  unit: 'g' | 'ml';
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  /** null = no se sabe; `estimated` = sale de la base local por el nombre */
  sugar: number | null;
  sodiumMg: number | null;
  satFat: number | null;
  estimated: Array<'sodio' | 'grasa saturada'>;
  /** litros de agua que trae (por composición); las bebidas suman como toma de agua */
  waterL: number;
  drinkWaterL: number;
  letter: Letter;
  sellos: string[];
  nova: number;
  group: FoodGroup;
  source: FoodSource;
  allergens: AllergenInfo;
  /** vitaminas y minerales de la porción, con el % de lo recomendado al día; null = esta fuente no los trae */
  micros: Array<{ key: MicroKey; nombre: string; valor: number; pct: number }> | null;
  /** salen del alimento de la base con ese nombre (no de lo anotado) */
  microsEstimated: boolean;
}

/** Todo lo que se sabe de lo anotado, ya en la porción. */
export function detailOf(entry: LoggedFood, wakeHour?: number, persona: Persona = {}): FoodDetail {
  const f = entry.food;
  const g = entry.grams;
  const k = g / 100;
  const src = sourceOf(f);
  // El chat no manda azúcar ni sodio (llegan en 0): no son «0», son «no se sabe»
  const unknownByChat = src === 'chat';
  const qi = toQualityItem({
    name: f.name, grams: g, mealType: entry.mealType, at: new Date(entry.loggedAt),
    per100: {
      kcal: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber,
      sugar: unknownByChat && !f.sugar ? undefined : f.sugar,
      sodium: unknownByChat && !f.sodium ? undefined : f.sodium,
      satFat: f.satFat,
    },
    group: f.group, nova: f.nova, nutriscore: f.nutriscore,
  }, wakeHour);
  const q = itemQuality({ ...qi, liquid: f.liquid ?? qi.liquid });
  const ownSodium = unknownByChat && !f.sodium ? undefined : plausibleSodiumMg(f.sodium, f.name);
  const estimated: FoodDetail['estimated'] = [];
  const sodium100 = ownSodium ?? qi.per100.sodiumMg;
  if (ownSodium === undefined && sodium100 !== undefined) estimated.push('sodio');
  if (f.satFat == null && qi.per100.satFat != null) estimated.push('grasa saturada');
  const sugar100 = unknownByChat && !f.sugar ? null : f.sugar;
  return {
    grams: g,
    unit: isBeverage(f) ? 'ml' : 'g',
    kcal: Math.round(f.calories * k),
    protein: r1(f.protein * k), carbs: r1(f.carbs * k), fat: r1(f.fat * k), fiber: r1((f.fiber || 0) * k),
    sugar: sugar100 == null ? null : r1(sugar100 * k),
    sodiumMg: sodium100 == null ? null : Math.round(sodium100 * k),
    satFat: qi.per100.satFat == null ? null : r1(qi.per100.satFat * k),
    estimated,
    waterL: foodWaterL(f, g),
    drinkWaterL: entry.drinkWater?.liters ?? 0,
    letter: q.letter, sellos: q.sellos, nova: q.nova, group: q.group,
    source: src,
    allergens: allergensOf(f),
    ...microsOf(f, g, persona),
  };
}

/** Las vitaminas y minerales de la porción, en el orden de siempre (vitaminas, después minerales). */
function microsOf(f: FoodItem, grams: number, persona: Persona): Pick<FoodDetail, 'micros' | 'microsEstimated'> {
  const m = microsFor(f);
  if (!m) return { micros: null, microsEstimated: false };
  const portion: Micros = scaleMicros(m.micros, grams);
  const list = MICROS.filter((x) => portion[x.key] !== undefined)
    .map((x) => ({ key: x.key, nombre: x.nombre, valor: portion[x.key]!, pct: Math.round((portion[x.key]! / dri(x.key, persona)) * 100) }));
  return { micros: list.length ? list : null, microsEstimated: m.estimated };
}

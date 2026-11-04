/**
 * nutritionQualityCore — el cálculo de la calidad de lo que comes (alimento, comida, día) sin nada del teléfono: puro,
 * los mismos datos dan el mismo resultado. Lo usan la app (NutritionQuality.ts: tarjeta, cuadros y simulación) y el
 * servidor: eris/src/services/NutritionQualityCore.ts es COPIA EXACTA de este archivo (salvo las rutas de los import), así
 * el chat («¿y si me como un completo?») da la misma nota que la app. Si cambia acá, cambia allá: la prueba
 * eris/scripts/quality_parity_test.ts compara los dos archivos y sus resultados.
 *
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
import localFoodsRaw from '../data/chilean-foods.json';
import { plausibleSodiumMg } from './nutrientSanity';
import { effectiveSlot, slotIsPast, normDayHour } from './mealSchedule';


// ─── Tipos ────────────────────────────────────────────────────────────────

export type FoodGroup =
  | 'verdura' | 'fruta' | 'legumbre' | 'cereal_integral' | 'cereal_refinado' | 'pan' | 'lacteo' | 'proteina_magra'
  | 'carne_roja' | 'embutido' | 'pescado' | 'huevo' | 'frutos_secos' | 'grasa' | 'dulce' | 'snack_salado'
  | 'bebida_azucarada' | 'bebida_sin_azucar' | 'agua' | 'alcohol' | 'comida_rapida' | 'plato_casero' | 'suplemento' | 'otro';

export interface Per100 { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sugar?: number; sodiumMg?: number; satFat?: number }

export interface QualityItem {
  name: string;
  grams: number;
  /** id de la comida (desayuno, almuerzo, once, cena, colacion_am…) */
  slot: string;
  at: Date;
  per100: Per100;
  group?: FoodGroup;
  nova?: number;
  nutriscore?: string;
  liquid?: boolean;
  /** vitaminas y minerales por 100 g (claves de supplementCore: vC, fe, ca…); falta = no se sabe */
  micros?: Record<string, number>;
}

export type Letter = 'A' | 'B' | 'C' | 'D' | 'E';
export interface ItemQuality { score: number; letter: Letter; sellos: string[]; nova: number; group: FoodGroup; kcal: number }
export interface MealQuality {
  slot: string; label: string; score: number; letter: Letter; kcal: number; protein: number; fiber: number;
  sellos: number; ultraShare: number; notes: string[];
}
export interface DayQuality {
  /** null = todavía es muy temprano y no hay nada anotado: no se evalúa */
  foodScore: number | null;
  hydrationScore: number | null;
  letter: Letter | null;
  meals: MealQuality[];
  /** fracción del día que ya debería estar comida a esta hora (0-1) */
  expectedShare: number;
  kcal: number; protein: number; fiber: number; sugar: number; sodiumMg: number;
  /** grasa saturada y carbohidratos de hoy (g): para los «cuánto te pasaste» de Métricas */
  satFatG: number; carbsG: number;
  goals: { kcal: number; protein: number; fiber: number; water: number };
  water: { liters: number; expected: number; sugaryMl: number };
  sellos: number;
  ultraShare: number;
  headline: string;
  tips: string[];
  /**
   * Calidad v2 (fase I6): de qué sale la nota, cada parte de 0 a 100. `micros` es null si no se evaluaron (sin
   * recomendaciones, o muy poco de lo comido trae vitaminas y minerales): entonces la nota es la de siempre (v1).
   */
  parts?: { quality: number; coverage: number; micros: number | null; timing: number };
  /** las vitaminas y minerales que van más bajos a esta hora (claves de supplementCore) */
  microLow?: string[];
}

// ─── Utilidades ───────────────────────────────────────────────────────────

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const letterOf = (score: number): Letter => (score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'E');
const LETTER_SCORE: Record<Letter, number> = { A: 92, B: 78, C: 60, D: 38, E: 18 };

// ─── Grupo, procesamiento y sellos ────────────────────────────────────────

/** Palabras del nombre → grupo y NOVA (cuando el alimento no trae esos datos). El orden importa: lo más específico primero. */
const KW: Array<[RegExp, FoodGroup, number]> = [
  [/\b(agua|agua mineral|agua con gas)\b(?!.*(sabor|saborizada))/, 'agua', 1],
  [/\b(bebida|gaseosa|coca|fanta|sprite|pepsi|bilz|pap|kem|jugo en polvo|nectar|néctar|energetica|redbull|monster|te helado)\b(?!.*(zero|light|sin azucar))/, 'bebida_azucarada', 4],
  [/\b(zero|light|sin azucar|diet)\b/, 'bebida_sin_azucar', 4],
  [/\b(cerveza|vino|pisco|piscola|ron|whisky|vodka|chela|terremoto|trago)\b/, 'alcohol', 3],
  [/\b(pizza|hamburguesa|completo|italiano|hot ?dog|papas fritas|salchipapa|chorrillana|nuggets|kfc|mcdonald|burger|shawarma|churrasco|barros|chacarero|as |sandwich|sanguche|empanada frita|sopaipilla|tacos?|burrito)\b/, 'comida_rapida', 4],
  [/\b(vienesa|salchicha|longaniza|chorizo|mortadela|salame|jamon|tocino|pate|prieta|nugget)\b/, 'embutido', 4],
  [/\b(galleta|chocolate|alfajor|torta|kuchen|queque|berlin|dona|donut|helado|manjar|mermelada|caramelo|gomita|dulce|pastel(?! de)|brownie|cereal azucarado|chocapic|zucaritas|azucar|miel|flan|leche asada|arroz con leche|calzones rotos|picarones|churro)\b/, 'dulce', 4],
  [/\b(papas fritas|ramitas|sufle|doritos|cheetos|nachos|snack|chips|mani salado|palomitas|cabritas)\b/, 'snack_salado', 4],
  [/\b(lenteja|poroto|garbanzo|arveja|haba|soya|tofu|hummus)\b/, 'legumbre', 1],
  [/\b(nuez|nueces|almendra|mani|avellana|pistacho|castana|semillas|chia|linaza|maravilla)\b/, 'frutos_secos', 1],
  [/\b(salmon|merluza|atun|jurel|reineta|congrio|corvina|sardina|pescado|camaron|marisco|chorito|almeja|macha|ostion|pulpo|calamar)\b/, 'pescado', 1],
  [/\b(huevo|clara|omelette|tortilla de huevo)\b/, 'huevo', 1],
  [/\b(pechuga|pollo|pavo|lomo de cerdo|filete)\b/, 'proteina_magra', 1],
  [/\b(vacuno|carne|bife|posta|lomo|plateada|asado|costilla|cordero|cerdo|molida)\b/, 'carne_roja', 1],
  [/\b(leche|yogur|yogurt|queso|quesillo|kefir|cottage|leche cultivada)\b/, 'lacteo', 1],
  [/\b(integral|avena|quinoa|arroz integral|mote|trigo|centeno)\b/, 'cereal_integral', 1],
  [/\b(marraqueta|hallulla|pan|tostada|dobladita|amasado|pita|baguette)\b/, 'pan', 3],
  [/\b(arroz|fideo|pasta|tallarin|espagueti|noqui|cuscus|polenta|semola|harina)\b/, 'cereal_refinado', 1],
  [/\b(manzana|platano|naranja|pera|uva|sandia|melon|frutilla|kiwi|durazno|chirimoya|lucuma|mango|pina|cereza|arandano|frambuesa|mandarina|ciruela|damasco|fruta)\b/, 'fruta', 1],
  [/\b(lechuga|tomate|zanahoria|palta|pepino|cebolla|pimenton|brocoli|espinaca|acelga|zapallo|choclo|betarraga|repollo|coliflor|apio|champinon|porotos verdes|ensalada|verdura|papa|camote|alcachofa|esparrago)\b/, 'verdura', 1],
  [/\b(cazuela|charquican|porotos con|pastel de choclo|humita|carbonada|guiso|estofado|caldillo|sopa|crema de|pure)\b/, 'plato_casero', 2],
  [/\b(aceite|mantequilla|margarina|mayonesa|crema)\b/, 'grasa', 2],
  [/\b(whey|proteina en polvo|suplemento)\b/, 'suplemento', 3],
];

const CATEGORY_GROUP: Record<string, FoodGroup> = {
  verduras: 'verdura', frutas: 'fruta', legumbres: 'legumbre', lacteos: 'lacteo', panes: 'pan', cereales: 'cereal_refinado',
  carnes: 'carne_roja', platos: 'plato_casero', snacks: 'snack_salado', bebidas: 'bebida_azucarada', aderezos: 'grasa',
  pescados: 'pescado', huevos: 'huevo', dulces: 'dulce', frutos_secos: 'frutos_secos', comida_rapida: 'comida_rapida',
};

interface LocalFoodQ { name: string; aliases?: string[]; category: string; group?: FoodGroup; nova?: number; serving: { grams: number; sodium?: number; satFat?: number }; micro?: Record<string, number> }
const LOCAL = (localFoodsRaw as unknown as LocalFoodQ[]).map((f) => ({ f, keys: [f.name, ...(f.aliases ?? [])].map(fold) }));

/** El alimento de la base con ese nombre o alias exacto (sin buscar por parecido). */
function localExact(name: string): LocalFoodQ | undefined {
  const n = fold(name);
  return LOCAL.find((x) => x.keys.some((k) => k === n))?.f;
}

/** Busca el alimento en la base local por nombre/alias (para registros del chat, que llegan sin grupo ni sodio). */
function localMatch(name: string): LocalFoodQ | undefined {
  const n = fold(name);
  return LOCAL.find((x) => x.keys.some((k) => k === n))?.f ?? LOCAL.find((x) => x.keys.some((k) => n.includes(k) && k.length >= 5))?.f;
}

export function classify(name: string, hint?: { group?: FoodGroup; nova?: number; category?: string }): { group: FoodGroup; nova: number } {
  if (hint?.group && hint.nova) return { group: hint.group, nova: hint.nova };
  const n = fold(name);
  // Manda la palabra que aparece PRIMERO ("avena con leche" es avena, no leche; "cazuela de vacuno" es un plato
  // casero); en empate, el orden de la lista (lo más específico primero)
  let best: { i: number; g: FoodGroup; nova: number } | null = null;
  for (const [re, g, nova] of KW) {
    const m = re.exec(n);
    if (m && (!best || m.index < best.i)) best = { i: m.index, g, nova };
  }
  if (best) return { group: hint?.group ?? best.g, nova: hint?.nova ?? best.nova };
  const cg = hint?.category ? CATEGORY_GROUP[hint.category] : undefined;
  return { group: hint?.group ?? cg ?? 'otro', nova: hint?.nova ?? (cg === 'dulce' || cg === 'snack_salado' ? 4 : 2) };
}

/** Sellos "ALTO EN" (Ley 20.606, límites de la etapa final). Sólidos por 100 g; líquidos por 100 ml. */
export function sellos(p: Per100, liquid: boolean): string[] {
  const out: string[] = [];
  if (p.kcal > (liquid ? 70 : 275)) out.push('calorías');
  if ((p.sugar ?? 0) > (liquid ? 5 : 10)) out.push('azúcares');
  if ((p.satFat ?? 0) > (liquid ? 3 : 4)) out.push('grasas saturadas');
  if ((p.sodiumMg ?? 0) > (liquid ? 100 : 400)) out.push('sodio');
  return out;
}

const steps = (v: number, th: number[]) => th.filter((t) => v > t).length;
const FVL: Partial<Record<FoodGroup, number>> = { verdura: 100, fruta: 100, legumbre: 100, frutos_secos: 100, plato_casero: 40 };

/** Puntos estilo Nutri-Score (más bajo = mejor). */
function nutriPoints(p: Per100, group: FoodGroup, liquid: boolean): number {
  const kj = p.kcal * 4.184;
  const sugar = p.sugar ?? 0, sat = p.satFat ?? (group === 'carne_roja' || group === 'embutido' || group === 'comida_rapida' ? p.fat * 0.4 : p.fat * 0.25);
  const sodium = p.sodiumMg ?? 0;
  const fvl = FVL[group] ?? 0;
  if (liquid) {
    if (group === 'agua') return -10;
    const n = steps(kj, [0, 30, 60, 90, 120, 150, 180, 210, 240, 270]) + steps(sugar, [0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5, 12, 13.5]);
    const pos = fvl >= 80 ? 10 : fvl >= 60 ? 4 : fvl >= 40 ? 2 : 0;
    return n - pos;
  }
  const n = steps(kj, [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350])
    + steps(sugar, [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45])
    + steps(sat, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    + steps(sodium, [90, 180, 270, 360, 450, 540, 630, 720, 810, 900]);
  const fiberP = steps(p.fiber, [0.9, 1.9, 2.8, 3.7, 4.7]);
  const protP = steps(p.protein, [1.6, 3.2, 4.8, 6.4, 8.0]);
  const fvlP = fvl > 80 ? 5 : fvl > 60 ? 2 : fvl > 40 ? 1 : 0;
  return n >= 11 && fvlP < 5 ? n - fiberP - fvlP : n - fiberP - protP - fvlP;
}

function letterFromPoints(points: number, liquid: boolean, group: FoodGroup): Letter {
  if (liquid) {
    if (group === 'agua') return 'A';
    return points <= 1 ? 'B' : points <= 5 ? 'C' : points <= 9 ? 'D' : 'E';
  }
  return points <= -1 ? 'A' : points <= 2 ? 'B' : points <= 10 ? 'C' : points <= 18 ? 'D' : 'E';
}

export function itemQuality(it: QualityItem): ItemQuality {
  const { group, nova } = classify(it.name, { group: it.group, nova: it.nova });
  const liquid = it.liquid ?? (group === 'agua' || group === 'bebida_azucarada' || group === 'bebida_sin_azucar' || group === 'alcohol'
    || /^(jugo|leche|bebida|batido|cafe|te|nectar|agua|yogur bebible|kefir|energetica)\b/.test(fold(it.name)));
  const ns = it.nutriscore && /^[a-e]$/.test(it.nutriscore) ? (it.nutriscore.toUpperCase() as Letter) : null;
  // La leche y los lácteos bebibles se evalúan como alimento (su azúcar es lactosa); los sellos sí van por 100 ml
  const beverageAlgo = liquid && group !== 'lacteo';
  const letter = ns ?? letterFromPoints(nutriPoints(it.per100, group, beverageAlgo), beverageAlgo, group);
  // Los sellos son para productos con azúcar, sal o grasa AGREGADAS (Ley 20.606): un alimento natural (NOVA 1) no los
  // lleva. Antes una manzana salía «ALTO EN azúcares» por su azúcar propia (2026-10-15).
  const sl = nova === 1 ? [] : sellos(it.per100, liquid);
  let score = LETTER_SCORE[letter];
  score += nova === 1 ? 5 : nova === 3 ? -5 : nova >= 4 ? -15 : 0;
  score -= Math.min(24, sl.length * 6);
  if (group === 'alcohol') score -= 15;
  return { score: Math.round(clamp(score, 0, 100)), letter: letterOf(clamp(score, 0, 100)), sellos: sl, nova, group, kcal: (it.per100.kcal * it.grams) / 100 };
}

// ─── Comidas y horarios ───────────────────────────────────────────────────

/** Cuánto del día suele pesar cada comida (fracción de la energía diaria) y su ventana horaria habitual en Chile. */
const SLOT_INFO: Record<string, { label: string; share: [number, number]; window: [number, number]; main: boolean }> = {
  // Ventanas: las de services/mealSchedule.ts (la tabla única de horarios)
  desayuno: { label: 'Desayuno', share: [0.15, 0.3], window: [5, 10.5], main: true },
  colacion_am: { label: 'Colación mañana', share: [0.03, 0.12], window: [10.5, 12.5], main: false },
  almuerzo: { label: 'Almuerzo', share: [0.25, 0.42], window: [12.5, 15.5], main: true },
  colacion_pm: { label: 'Colación tarde', share: [0.03, 0.12], window: [15.5, 17.5], main: false },
  merienda: { label: 'Merienda', share: [0.03, 0.12], window: [15.5, 17.5], main: false },
  once: { label: 'Once', share: [0.1, 0.25], window: [17.5, 20], main: true },
  cena: { label: 'Cena', share: [0.15, 0.3], window: [20, 23], main: true },
};

/** Fracción del día que debería estar comida a la hora h (curva por comidas: desayuno, almuerzo, once/cena). */
export function expectedShareAt(h: number): number {
  const pts: Array<[number, number]> = [[6, 0], [7.5, 0.02], [10, 0.22], [12.5, 0.27], [15, 0.6], [17, 0.64], [19.5, 0.8], [21.5, 0.98], [23, 1]];
  if (h <= pts[0][0]) return 0;
  for (let i = 1; i < pts.length; i++) {
    const [h1, v1] = pts[i], [h0, v0] = pts[i - 1];
    if (h <= h1) return v0 + ((h - h0) / (h1 - h0)) * (v1 - v0);
  }
  return 1;
}

/** Fracción del agua del día que debería llevar a la hora h: desde que despertó (7:30 en la hora de su día) hasta ~2 h antes de dormir. */
export function waterShareAt(h: number): number {
  return clamp((h - 7.5) / (21.5 - 7.5));
}

// ─── A la hora: lo que llevas contra lo esperable a esta hora (no contra el día completo) ──────────────────────────
// 2026-10-15, pedido del usuario: en Métricas el agua aparecía en rojo a media mañana por ir en 0,8 de 2,8 L, y eso se
// malentiende. La tarjeta de calidad ya medía "a esta hora"; los cuadros de nutrición ahora usan lo mismo.

export interface Pace { hour: number; foodShare: number; waterShare: number }

/** Cuánto del día ya debería ir a esta hora (en la hora de SU día: services/mealSchedule.ts → normDayHour). */
export function paceAt(now: Date, wakeHour?: number): Pace {
  const hour = normDayHour(now, wakeHour);
  return { hour, foodShare: expectedShareAt(hour), waterShare: waterShareAt(hour) };
}

export type PaceState = 'temprano' | 'cumplida' | 'al_dia' | 'algo_atras' | 'atras' | 'de_mas';

/**
 * Cómo va una META (proteína, fibra, agua) o la energía (`over`: pasarse también cuenta) contra lo esperable a esta hora.
 * Muy temprano (casi nada esperable todavía) no se juzga: "temprano".
 */
export function paceState(got: number, goal: number, share: number, over = false): PaceState {
  if (!(goal > 0)) return 'temprano';
  if (!over && got >= goal) return 'cumplida';
  if (share < 0.08) return over && got > goal * 0.5 ? 'de_mas' : 'temprano';
  const ratio = got / (goal * share);
  if (over) return ratio > 1.35 ? 'de_mas' : ratio < 0.6 ? 'algo_atras' : 'al_dia';
  return ratio >= 0.9 ? 'al_dia' : ratio >= 0.6 ? 'algo_atras' : 'atras';
}

// ─── Seguimiento de una meta, en palabras ──────────────────────────────────
// 2026-10-15, el usuario: "debería tener una referencia de la meta del día e ir monitoreando por hora… ver que vas bien
// sin los números rojos pero saber qué te falta; no me basta un cambio de color… que Eris trabaje para que el usuario
// no lo tenga que hacer". La meta del día sigue siendo la referencia; Eris calcula dónde deberías ir ahora, cuánto te
// falta para ir al día (en vasos, si es agua), cuánto queda del día y el próximo control. Sin rojos: verde o dorado.

export interface GoalTrack {
  /** cómo vas a esta hora */
  state: PaceState | 'adelantado' | 'sin_meta';
  /** lo esperable a esta hora */
  expectedNow: number;
  /** cuánto falta para ir al día (0 si vas al día) */
  toCatchUp: number;
  /** cuánto falta para la meta del día (0 si ya llegaste) */
  leftToday: number;
  /** el próximo control (hora del reloj) y lo esperable ahí */
  next: { clock: string; expected: number } | null;
  /** en palabras, corto: "Al día ✓", "Para ir al día: +2 vasos (~0,5 L)" */
  status: string;
  /** la referencia del día: "Faltan 2,0 L hoy · a las 15:00, ~1,3 L" */
  detail: string;
  /**
   * verde (vas bien), dorado (algo atrás para la hora), rojo (muy atrás para la hora, o bastante sobre la meta de
   * energía) o neutro (temprano, sin meta). El rojo es A LA HORA: nunca solo porque el día todavía no termina.
   */
  tone: 'ok' | 'behind' | 'far' | 'neutral';
  /** agua atrasada: los vasos de 250 ml para ir al día */
  vasos?: number;
}

/** Controles del día, en la hora de SU día (7:30 = al despertar): media mañana, almuerzo, tarde, once y noche. */
const CHECKPOINTS = [10, 13, 15, 17, 19, 21.5];

const fmtAmount = (n: number, unit: string) => unit === 'L'
  ? `${(Math.round(n * 10) / 10).toString().replace('.', ',')} L`
  : `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ${unit}`;

/** La hora del reloj de un momento de SU día (con el despertar corrido, la misma pauta se corre). */
function clockOf(dayHour: number, wakeHour?: number): string {
  const real = (((wakeHour ?? 7.5) + (dayHour - 7.5)) % 24 + 24) % 24;
  const q = Math.round(real * 4) / 4; // al cuarto de hora
  return `${Math.floor(q) % 24}:${String(Math.round((q % 1) * 60)).padStart(2, '0')}`;
}

/**
 * El seguimiento de una meta a lo largo del día. `kind`: agua (curva del agua), comida (proteína, fibra: metas a
 * alcanzar) o energía (pasarse también cuenta).
 */
export function trackGoal(got: number, goal: number, opts: { now: Date; wakeHour?: number; kind: 'agua' | 'comida' | 'energia'; unit: 'L' | 'g' | 'kcal' }): GoalTrack {
  const { unit, kind } = opts;
  const f = (n: number) => fmtAmount(n, unit);
  if (!(goal > 0)) {
    return { state: 'sin_meta', expectedNow: 0, toCatchUp: 0, leftToday: 0, next: null, status: 'Sin meta', detail: '', tone: 'neutral' };
  }
  const hour = normDayHour(opts.now, opts.wakeHour);
  const shareAt = (h: number) => (kind === 'agua' ? waterShareAt(h) : expectedShareAt(h));
  const share = shareAt(hour);
  const expectedNow = goal * share;
  const leftToday = Math.max(0, goal - got);
  const cp = CHECKPOINTS.find((c) => c > hour + 0.25);
  const next = cp !== undefined ? { clock: clockOf(cp, opts.wakeHour), expected: goal * shareAt(cp) } : null;
  const toCatchUp = Math.max(0, expectedNow * 0.9 - got);
  const nextTxt = next && next.expected > got ? ` · a las ${next.clock}, ~${f(next.expected)}` : '';

  if (kind === 'energia') {
    const st = paceState(got, goal, share, true);
    const detail = got < goal ? `Quedan ${f(leftToday)} hoy${nextTxt}` : `Meta del día: ${f(goal)}`;
    if (got > goal * 1.1) return { state: 'de_mas', expectedNow, toCatchUp: 0, leftToday: 0, next, status: `Sobre la meta: +${f(got - goal)}`, detail, tone: 'far' };
    if (st === 'temprano') return { state: st, expectedNow, toCatchUp: 0, leftToday, next, status: 'Recién empieza el día', detail, tone: 'neutral' };
    if (st === 'de_mas') return { state: st, expectedNow, toCatchUp: 0, leftToday, next, status: `Sobre lo esperable: +${f(got - expectedNow)}`, detail, tone: 'behind' };
    if (st === 'algo_atras') return { state: st, expectedNow, toCatchUp: 0, leftToday, next, status: 'Bajo lo esperable a esta hora', detail, tone: 'neutral' };
    return { state: 'al_dia', expectedNow, toCatchUp: 0, leftToday, next, status: 'Al día ✓', detail, tone: 'ok' };
  }

  const st = paceState(got, goal, share);
  const detail = got >= goal ? `Meta del día: ${f(goal)} ✓` : `Faltan ${f(leftToday)} hoy${nextTxt}`;
  if (st === 'cumplida') return { state: st, expectedNow, toCatchUp: 0, leftToday: 0, next, status: 'Meta cumplida ✓', detail, tone: 'ok' };
  if (st === 'temprano') return { state: st, expectedNow, toCatchUp: 0, leftToday, next, status: 'Recién empieza el día', detail, tone: 'neutral' };
  if (st === 'al_dia') {
    const ahead = got >= expectedNow * 1.15;
    return { state: ahead ? 'adelantado' : 'al_dia', expectedNow, toCatchUp: 0, leftToday, next, status: ahead ? 'Adelantado ✓' : 'Al día ✓', detail, tone: 'ok' };
  }
  // Atrás: cuánto falta para ir al día, en algo que se pueda hacer (vasos de 250 ml si es agua). 2026-10-18: en vasos
  // enteros y sus litros («+2 vasos (~0,5 L)»); antes decía «+0,4 L (2 vasos)», y 2 vasos son 0,5 L.
  if (unit === 'L') {
    const vasos = Math.max(1, Math.ceil(toCatchUp / 0.25 - 1e-9));
    const litros = `${(Math.round(vasos * 25) / 100).toString().replace('.', ',')} L`;
    return { state: st, expectedNow, toCatchUp, leftToday, next, status: `Para ir al día: +${vasos} vaso${vasos > 1 ? 's' : ''} (~${litros})`, detail, tone: st === 'atras' ? 'far' : 'behind', vasos };
  }
  const shown = Math.max(1, toCatchUp); // nunca "+0 g"
  return { state: st, expectedNow, toCatchUp, leftToday, next, status: `Para ir al día: +${f(shown)}`, detail, tone: st === 'atras' ? 'far' : 'behind' };
}

function mealQuality(slot: string, items: QualityItem[], q: ItemQuality[], dayKcalGoal: number, wakeHour?: number): MealQuality {
  const info = SLOT_INFO[slot] ?? { label: slot, share: [0.05, 0.35] as [number, number], window: [0, 24] as [number, number], main: false };
  const kcal = q.reduce((a, x) => a + x.kcal, 0);
  const protein = items.reduce((a, it) => a + (it.per100.protein * it.grams) / 100, 0);
  const fiber = items.reduce((a, it) => a + (it.per100.fiber * it.grams) / 100, 0);
  const sugar = items.reduce((a, it) => a + ((it.per100.sugar ?? 0) * it.grams) / 100, 0);
  // Calidad promedio ponderada por energía (lo que más calorías aporta, más pesa); el agua y lo light cuentan poco
  const w = q.map((x) => Math.max(15, x.kcal));
  let score = q.reduce((a, x, i) => a + x.score * w[i], 0) / Math.max(1, w.reduce((a, b) => a + b, 0));
  const notes: string[] = [];
  const ultraKcal = q.filter((x) => x.nova >= 4).reduce((a, x) => a + x.kcal, 0);
  const ultraShare = kcal > 0 ? ultraKcal / kcal : 0;
  const hasPlant = q.some((x) => x.group === 'verdura' || x.group === 'fruta' || x.group === 'legumbre');
  const fast = q.some((x) => x.group === 'comida_rapida');
  // Una comida principal se evalúa como tal aunque sea chica (una marraqueta sola también es "el desayuno")
  const isMain = info.main && kcal >= 150;

  if (isMain) {
    const protMin = slot === 'desayuno' || slot === 'once' ? 10 : 20;
    if (protein >= protMin) score += 4; else { score -= 12; notes.push(`poca proteína (${Math.round(protein)} g)`); }
    if (fiber >= (slot === 'desayuno' || slot === 'once' ? 3 : 6) || hasPlant) score += 4; else { score -= 12; notes.push('sin verduras, fruta ni fibra'); }
  }
  if (ultraShare > 0.6) { score -= 10; notes.push('casi todo ultraprocesado'); }
  if ((slot === 'desayuno' || slot === 'once') && sugar > 25) { score -= 8; notes.push(`mucha azúcar (${Math.round(sugar)} g)`); }
  // El horario importa: comida rápida al desayuno o una cena muy pesada tarde no son lo mismo que al almuerzo
  if (fast && slot === 'desayuno') { score -= 12; notes.push('comida rápida al desayuno'); }
  else if (fast && (slot === 'colacion_am' || slot === 'colacion_pm' || slot === 'merienda')) { score -= 6; notes.push('comida rápida como colación'); }
  const share = dayKcalGoal > 0 ? kcal / dayKcalGoal : 0;
  if (share > info.share[1] + 0.12) { score -= 8; notes.push(`muy abundante para un ${info.label.toLowerCase()} (${Math.round(share * 100)} % del día)`); }
  if (slot === 'cena' && share > 0.35) { score -= 5; notes.push('cena pesada'); }
  const lateHour = Math.max(...items.map((it) => normDayHour(it.at, wakeHour)));
  if (lateHour >= 23 && kcal > 400) { score -= 5; notes.push('comida pesada muy tarde'); }
  const s = Math.round(clamp(score, 0, 100));
  return {
    slot, label: info.label, score: s, letter: letterOf(s), kcal: Math.round(kcal), protein: Math.round(protein),
    fiber: Math.round(fiber), sellos: q.reduce((a, x) => a + x.sellos.length, 0), ultraShare, notes,
  };
}

// ─── Día hasta ahora ──────────────────────────────────────────────────────

/** Los nombres de los que cuentan para la nota (supplementCore.SCORE_KEYS), para los consejos */
const MICRO_NOMBRE: Record<string, string> = {
  vA: 'vitamina A', vC: 'vitamina C', vE: 'vitamina E', b12: 'vitamina B12', fol: 'folato', ca: 'calcio', fe: 'hierro', mg: 'magnesio', k: 'potasio', zn: 'zinc',
};

export function evaluateDay(items: QualityItem[], opts: {
  now?: Date; goals?: { kcal?: number; protein?: number; fiber?: number; water?: number };
  waterLiters?: number | null; wakeHour?: number;
  /**
   * Calidad v2 (fase I6): la recomendación diaria de las vitaminas y minerales que cuentan (supplementCore.microRef, según
   * edad y sexo) y lo que sumaron hoy los suplementos tomados. Sin `microRef`, la nota es la de siempre.
   */
  microRef?: Record<string, number>;
  supMicros?: Record<string, number>;
}): DayQuality {
  const now = opts.now ?? new Date();
  // La hora de SU día: 7,5 + horas despierta (services/mealSchedule.ts → normDayHour). 2026-10-11: con el reloj corrido,
  // 33 minutos después de despertar a las 13:04 le pedía ~31 g de proteína "a esta hora".
  const h = normDayHour(now, opts.wakeHour);
  const goals = {
    kcal: opts.goals?.kcal && opts.goals.kcal > 800 ? opts.goals.kcal : 2000,
    protein: opts.goals?.protein && opts.goals.protein > 20 ? opts.goals.protein : 0,
    fiber: opts.goals?.fiber && opts.goals.fiber > 5 ? opts.goals.fiber : 28,
    water: opts.goals?.water && opts.goals.water > 0.5 ? opts.goals.water : 2.5,
  };
  if (!goals.protein) goals.protein = Math.round((goals.kcal * 0.18) / 4); // ~18 % de la energía si no hay meta

  const q = items.map(itemQuality);
  const sum = (f: (it: QualityItem) => number) => items.reduce((a, it) => a + (f(it) * it.grams) / 100, 0);
  const kcal = q.reduce((a, x) => a + x.kcal, 0);
  const protein = sum((it) => it.per100.protein), fiber = sum((it) => it.per100.fiber);
  const sugar = sum((it) => it.per100.sugar ?? 0), sodiumMg = sum((it) => it.per100.sodiumMg ?? 0);
  const satFatG = sum((it) => it.per100.satFat ?? 0), carbsG = sum((it) => it.per100.carbs);

  // Comidas, en el orden del día
  const bySlot = new Map<string, number[]>();
  items.forEach((it, i) => { const l = bySlot.get(it.slot) ?? []; l.push(i); bySlot.set(it.slot, l); });
  const meals = [...bySlot.entries()]
    .map(([slot, idx]) => mealQuality(slot, idx.map((i) => items[i]), idx.map((i) => q[i]), goals.kcal, opts.wakeHour))
    .sort((a, b) => (SLOT_INFO[a.slot]?.window[0] ?? 25) - (SLOT_INFO[b.slot]?.window[0] ?? 25));

  const expectedShare = expectedShareAt(h);
  const ultraShare = kcal > 0 ? q.filter((x) => x.nova >= 4).reduce((a, x) => a + x.kcal, 0) / kcal : 0;
  const sellosN = q.reduce((a, x) => a + x.sellos.length, 0);
  const tips: string[] = [];

  // Hidratación: lo esperable a esta hora (desde que despertaste hasta ~2 h antes de dormir), y las bebidas azucaradas
  const waterExpected = goals.water * waterShareAt(h); // en la hora de su día, despertó a las 7:30
  const sugaryMl = items.filter((it, i) => q[i].group === 'bebida_azucarada' || q[i].group === 'alcohol').reduce((a, it) => a + it.grams, 0);
  let hydrationScore: number | null = null;
  // Recién despierto no se evalúa (todavía no toca haber tomado casi nada)
  if (opts.waterLiters != null && waterExpected >= 0.3) {
    const ratio = waterExpected > 0 ? (opts.waterLiters ?? 0) / waterExpected : 1;
    hydrationScore = Math.round(clamp(ratio >= 0.9 ? 1 : ratio / 0.9) * 100 - Math.min(30, (sugaryMl / 250) * 6));
    hydrationScore = Math.max(0, hydrationScore);
    if (ratio < 0.7) tips.push(`Vas con ${String((opts.waterLiters ?? 0).toFixed(1)).replace('.', ',')} L de agua; a esta hora lo esperable es ~${String(waterExpected.toFixed(1)).replace('.', ',')} L.`);
    if (sugaryMl >= 500) tips.push(`Llevas ${Math.round(sugaryMl)} ml de bebidas azucaradas o alcohol: no hidratan igual que el agua.`);
  }

  // Nada anotado y todavía es temprano → no se evalúa (no se castiga lo que aún no toca)
  if (!items.length && expectedShare < 0.2) {
    return { foodScore: null, hydrationScore, letter: null, meals, expectedShare, kcal: 0, protein: 0, fiber: 0, sugar: 0, sodiumMg: 0,
      satFatG: 0, carbsG: 0, goals, water: { liters: opts.waterLiters ?? 0, expected: waterExpected, sugaryMl }, sellos: 0, ultraShare: 0,
      headline: 'Todavía no hay comidas anotadas hoy.', tips };
  }

  // 1) Calidad de lo comido: comidas ponderadas por su energía
  const mw = meals.map((m) => Math.max(80, m.kcal));
  const quality = meals.length ? meals.reduce((a, m, i) => a + m.score * mw[i], 0) / mw.reduce((a, b) => a + b, 0) : 0;

  // 2) Cobertura hasta ahora: proteína, fibra y energía contra lo esperable a esta hora
  const exp = Math.max(0.05, expectedShare);
  const cov = (got: number, goal: number) => clamp(got / (goal * exp));
  const protCov = cov(protein, goals.protein), fiberCov = cov(fiber, goals.fiber);
  const kRatio = kcal / (goals.kcal * exp);
  // Energía: lo ideal es ir cerca de lo esperado; muy poco (saltarse comidas) o mucho de más bajan
  const energyOk = kRatio < 0.6 ? kRatio / 0.6 * 0.7 : kRatio <= 1.2 ? 1 : kRatio <= 1.5 ? 1 - (kRatio - 1.2) * 1.5 : 0.4;
  const coverage = (protCov * 0.4 + fiberCov * 0.3 + energyOk * 0.3);

  // 3) Horarios: comidas principales cuya ventana ya pasó sin nada anotado
  const missed = (['desayuno', 'almuerzo'] as const).filter((s) => slotIsPast(s, now, opts.wakeHour) && !bySlot.has(s));
  const dinnerMissing = h > 22.5 && !bySlot.has('cena') && !bySlot.has('once');
  const timing = clamp(1 - missed.length * 0.35 - (dinnerMissing ? 0.3 : 0));

  // 4) Vitaminas y minerales (calidad v2, fase I6): lo comido + los suplementos contra lo recomendado A ESTA HORA. Solo si
  //    la mayor parte de lo comido (60 % de la energía) trae el dato: si no, no se sabe y no se castiga.
  let microScore: number | null = null;
  let microLow: string[] = [];
  const ref = opts.microRef && Object.keys(opts.microRef).length ? opts.microRef : null;
  const kcalCon = items.reduce((a, it, i) => a + (it.micros && Object.keys(it.micros).length ? q[i].kcal : 0), 0);
  if (ref && kcal > 0 && kcalCon / kcal >= 0.6) {
    const ratios = Object.entries(ref).filter(([, r]) => r > 0).map(([k, r]) => {
      const got = items.reduce((a, it) => a + ((it.micros?.[k] ?? 0) * it.grams) / 100, 0) + (opts.supMicros?.[k] ?? 0);
      return [k, clamp(got / (r * exp))] as const;
    });
    if (ratios.length) {
      microScore = Math.round((ratios.reduce((a, [, v]) => a + v, 0) / ratios.length) * 100);
      microLow = ratios.filter(([, v]) => v < 0.5).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k]) => k);
    }
  }

  // Lo que más pesa es QUÉ comiste; después si va alcanzando para lo que toca a esta hora (y, si se sabe, las vitaminas y
  // minerales); después los horarios
  const foodScore = microScore == null
    ? Math.round(clamp(quality / 100 * 0.6 + coverage * 0.25 + timing * 0.15) * 100)
    : Math.round(clamp(quality / 100 * 0.55 + coverage * 0.2 + (microScore / 100) * 0.1 + timing * 0.15) * 100);

  // Lo más importante primero, en palabras
  const worst = [...meals].sort((a, b) => a.score - b.score)[0];
  if (worst && worst.score < 50 && worst.notes.length) tips.push(`${worst.label}: ${worst.notes.slice(0, 2).join(', ')}.`);
  if (protCov < 0.7) tips.push(`Proteína: llevas ${Math.round(protein)} g; a esta hora lo esperable es ~${Math.round(goals.protein * exp)} g.`);
  if (fiberCov < 0.6) tips.push(`Fibra: ${Math.round(fiber)} g de ~${Math.round(goals.fiber * exp)} g esperables a esta hora (verduras, fruta, legumbres, integrales).`);
  if (kRatio > 1.35) tips.push(`Energía: ${Math.round(kcal)} kcal, bastante más de lo esperable a esta hora (~${Math.round(goals.kcal * exp)}).`);
  if (missed.length) tips.push(`Sin ${missed.join(' ni ')} anotado${missed.length > 1 ? 's' : ''}.`);
  if (ultraShare > 0.5) tips.push(`El ${Math.round(ultraShare * 100)} % de tus calorías de hoy viene de ultraprocesados.`);
  if (microScore != null && microScore < 70 && microLow.length) {
    const n = microLow.map((k) => MICRO_NOMBRE[k] ?? k);
    tips.push(`Vitaminas y minerales: lo que menos llevas a esta hora es ${n.length > 1 ? `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}` : n[0]}.`);
  }

  const letter = letterOf(foodScore);
  const headline = foodScore >= 80 ? 'Estás comiendo bien: nutritivo y a su hora.'
    : foodScore >= 65 ? 'Vas bien, con algo por mejorar.'
    : foodScore >= 50 ? 'Regular: comiste, pero no todo te está alimentando.'
    : 'Lo de hoy alimenta poco: hay que compensar en la próxima comida.';

  return { foodScore, hydrationScore, letter, meals, expectedShare, kcal: Math.round(kcal), protein: Math.round(protein), fiber: Math.round(fiber),
    sugar: Math.round(sugar), sodiumMg: Math.round(sodiumMg), satFatG: Math.round(satFatG * 10) / 10, carbsG: Math.round(carbsG),
    goals, water: { liters: opts.waterLiters ?? 0, expected: waterExpected, sugaryMl },
    sellos: sellosN, ultraShare, headline, tips: tips.slice(0, 4),
    parts: { quality: Math.round(quality), coverage: Math.round(coverage * 100), micros: microScore, timing: Math.round(timing * 100) },
    ...(microLow.length ? { microLow } : {}) };
}

// ─── Simular un alimento antes de anotarlo ─────────────────────────────────
// 2026-10-15, pedido del usuario: "una simulación de ingreso de alimento: cuánto va a afectar en la tabla de calidad de
// la alimentación". Es el MISMO cálculo de la tarjeta de Métricas, con y sin el alimento: nada se guarda.

export interface QualitySim {
  before: DayQuality;
  after: DayQuality;
  /** el alimento solo: su letra, sus sellos y su procesamiento (el primero, si son varios) */
  item: ItemQuality;
  /** cada alimento, si son varios ("un completo y una bebida") */
  items: ItemQuality[];
  /** la comida donde cae, antes (null si es la primera cosa de esa comida) y después */
  meal: { slot: string; label: string; before: MealQuality | null; after: MealQuality | null };
  /** lo que mejora y lo que empeora, en palabras (máximo 2 de cada uno) */
  better: string[];
  worse: string[];
}

/** Compara el día con y sin lo que se va a comer (uno o varios alimentos de la misma comida). Puro: los mismos datos dan lo mismo. */
export function simulateAdd(items: QualityItem[], candidate: QualityItem | QualityItem[], opts: Parameters<typeof evaluateDay>[1]): QualitySim {
  const cands = Array.isArray(candidate) ? candidate : [candidate];
  const before = evaluateDay(items, opts);
  const after = evaluateDay([...items, ...cands], opts);
  const each = cands.map(itemQuality);
  const item = each[0];
  const slot = cands[0].slot;
  const mb = before.meals.find((m) => m.slot === slot) ?? null;
  const ma = after.meals.find((m) => m.slot === slot) ?? null;
  const label = ma?.label ?? SLOT_INFO[slot]?.label ?? slot;
  const better: string[] = [], worse: string[] = [];
  const exp = Math.max(0.05, after.expectedShare);
  const atHour = (goal: number) => goal * exp;

  // Metas que este alimento deja al día a esta hora
  const crossed = (g: number, b: number, a: number) => b < atHour(g) * 0.9 && a >= atHour(g) * 0.9;
  if (crossed(after.goals.protein, before.protein, after.protein)) better.push('Proteína: quedas al día para esta hora');
  if (crossed(after.goals.fiber, before.fiber, after.fiber)) better.push('Fibra: quedas al día para esta hora');
  // Lo que la comida deja de tener en contra, o pasa a tener
  const fixed = (n: string) => /^sin verduras/.test(n) ? 'ahora trae verdura, fruta o fibra'
    : /^poca prote/.test(n) ? 'ahora trae buena proteína'
      : /^casi todo ultra/.test(n) ? 'deja de ser casi todo ultraprocesado'
        : `deja de tener: ${n}`;
  for (const n of mb?.notes ?? []) if (!(ma?.notes ?? []).includes(n)) better.push(`${label}: ${fixed(n)}`);
  for (const n of ma?.notes ?? []) if (!(mb?.notes ?? []).includes(n)) worse.push(`${label}: ${n}`);
  // Energía: si con esto te pasas bastante de lo esperable a esta hora
  if (before.kcal <= atHour(after.goals.kcal) * 1.35 && after.kcal > atHour(after.goals.kcal) * 1.35) {
    worse.push(`Energía: ${after.kcal} kcal, bastante más de lo esperable a esta hora (~${Math.round(atHour(after.goals.kcal))})`);
  }
  // (los sellos del alimento van junto a su letra: `item.sellos`)
  return { before, after, item, items: each, meal: { slot, label, before: mb, after: ma }, better: better.slice(0, 2), worse: worse.slice(0, 2) };
}

// ─── Un alimento anotado → ítem evaluable ─────────────────────────────────

/** Lo que se sabe de un alimento anotado: sus valores por 100 g (pueden faltar el azúcar, el sodio…) y cuándo se comió. */
export interface FoodFacts {
  name: string;
  grams: number;
  /** la comida con que se anotó (desayuno, almuerzo…) */
  mealType: string;
  at: Date;
  per100: { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sugar?: number; sodium?: number; satFat?: number };
  group?: string;
  nova?: number;
  nutriscore?: string;
  /** vitaminas y minerales por 100 g, si el alimento los trae */
  micros?: Record<string, number>;
}

/**
 * Completa lo que falte (grupo, sodio, grasas saturadas, procesamiento) con la base local. La comida que cuenta es la de la
 * hora en que se comió ("Desayuno" a las 12 es colación de media mañana). Lo usan el teléfono (su registro) y el servidor
 * (lo del chat y la lista que manda el teléfono): el mismo alimento da la misma nota en los dos.
 */
export function toQualityItem(f: FoodFacts, wakeHour?: number): QualityItem {
  const local = localMatch(f.name);
  const factor = local ? 100 / local.serving.grams : 1;
  const p = f.per100;
  // Las vitaminas y minerales, del alimento o de la base con ESE nombre (no por parecido: «pan con palta» no es la palta)
  const micros = f.micros && Object.keys(f.micros).length ? f.micros : localExact(f.name)?.micro;
  return {
    name: f.name, grams: f.grams, slot: effectiveSlot(f.mealType, f.at, { wakeHour }), at: f.at,
    per100: {
      kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, fiber: p.fiber, sugar: p.sugar,
      sodiumMg: plausibleSodiumMg(p.sodium, f.name) || (local?.serving.sodium != null ? local.serving.sodium * factor : undefined),
      satFat: p.satFat ?? (local?.serving.satFat != null ? local.serving.satFat * factor : undefined),
    },
    group: (f.group as FoodGroup | undefined) ?? local?.group, nova: f.nova ?? local?.nova, nutriscore: f.nutriscore,
    ...(micros ? { micros } : {}),
  };
}

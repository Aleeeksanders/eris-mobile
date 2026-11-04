// ============================================================
// Eris — vitaminas, minerales y suplementos (fase I5, 2026-10-23)
//
// Núcleo PURO (sin imports): el servidor tiene una COPIA EXACTA (eris/src/services/SupplementCore.ts, vía
// scripts/sync_supplement_core.ts; scripts/supplement_parity_test.ts revisa que den lo mismo). Tiene tres partes:
//   1. Vitaminas y minerales: qué son, la recomendación diaria por sexo y edad (DRI del NIH/IOM) y el límite superior.
//   2. Fichas de suplementos: qué hace, qué tan estudiado está, la dosis que usan los estudios como REFERENCIA con su
//      fuente, y los cuidados según las condiciones y los remedios de la persona.
//   3. «Mis suplementos»: lo que toma cada persona (su dosis, como la escribió), cuándo, si ya lo tomó hoy y cuánto
//      aporta a sus vitaminas y minerales.
// «Cuida, no trata» (decisión del usuario): la dosis de los estudios es una referencia con fuente, nunca una indicación;
// Eris no le dice a nadie que empiece, suba o deje un suplemento, y con una condición o un remedio que choca, lo dice y
// manda a conversarlo con su médico. Textos escritos con IA a partir de las fuentes: necesitan revisión de un profesional
// antes de abrir la app a más gente (igual que la guía de síntomas).
// ============================================================

// ─── 1. Vitaminas y minerales ────────────────────────────────────────────────

export type MicroKey = 'vA' | 'vC' | 'vD' | 'vE' | 'vK' | 'b1' | 'b2' | 'b3' | 'b6' | 'b12' | 'fol' | 'ca' | 'fe' | 'mg' | 'k' | 'zn' | 'p';
/** Cantidades por 100 g (en un alimento) o en total (una porción, un día). Falta la clave = no se sabe. */
export type Micros = Partial<Record<MicroKey, number>>;

export interface MicroInfo {
  key: MicroKey;
  nombre: string;
  unidad: 'mg' | 'µg';
  tipo: 'vitamina' | 'mineral';
  /** para qué sirve, en una línea */
  para: string;
  /** dónde está en la comida (para sugerir, no para indicar) */
  fuentes: string;
}

export const MICROS: MicroInfo[] = [
  { key: 'vA', nombre: 'Vitamina A', unidad: 'µg', tipo: 'vitamina', para: 'la vista, la piel y las defensas', fuentes: 'zanahoria, zapallo, espinaca, camote' },
  { key: 'vC', nombre: 'Vitamina C', unidad: 'mg', tipo: 'vitamina', para: 'las defensas, la cicatrización y absorber el hierro', fuentes: 'kiwi, naranja, pimentón, frutillas, brócoli' },
  { key: 'vD', nombre: 'Vitamina D', unidad: 'µg', tipo: 'vitamina', para: 'los huesos (absorber calcio) y los músculos', fuentes: 'el sol, pescados grasos (salmón, jurel), huevo' },
  { key: 'vE', nombre: 'Vitamina E', unidad: 'mg', tipo: 'vitamina', para: 'proteger las células (antioxidante)', fuentes: 'almendras, semillas de maravilla, palta, aceite de oliva' },
  { key: 'vK', nombre: 'Vitamina K', unidad: 'µg', tipo: 'vitamina', para: 'la coagulación y los huesos', fuentes: 'espinaca, acelga, brócoli, lechuga' },
  { key: 'b1', nombre: 'Vitamina B1 (tiamina)', unidad: 'mg', tipo: 'vitamina', para: 'sacar energía de los carbohidratos', fuentes: 'pan y cereales integrales, legumbres, cerdo' },
  { key: 'b2', nombre: 'Vitamina B2 (riboflavina)', unidad: 'mg', tipo: 'vitamina', para: 'sacar energía de la comida', fuentes: 'leche, yogur, huevo, champiñones' },
  { key: 'b3', nombre: 'Vitamina B3 (niacina)', unidad: 'mg', tipo: 'vitamina', para: 'la energía, la piel y los nervios', fuentes: 'pollo, atún, maní, carnes' },
  { key: 'b6', nombre: 'Vitamina B6', unidad: 'mg', tipo: 'vitamina', para: 'las proteínas y los nervios', fuentes: 'plátano, pollo, papa, garbanzos' },
  { key: 'b12', nombre: 'Vitamina B12', unidad: 'µg', tipo: 'vitamina', para: 'los glóbulos rojos y los nervios', fuentes: 'carnes, pescados, huevo, lácteos' },
  { key: 'fol', nombre: 'Folato (B9)', unidad: 'µg', tipo: 'vitamina', para: 'formar células nuevas (clave en el embarazo)', fuentes: 'lentejas, porotos, espinaca, palta' },
  { key: 'ca', nombre: 'Calcio', unidad: 'mg', tipo: 'mineral', para: 'los huesos, los dientes y los músculos', fuentes: 'leche, yogur, queso, sardinas' },
  { key: 'fe', nombre: 'Hierro', unidad: 'mg', tipo: 'mineral', para: 'llevar oxígeno en la sangre', fuentes: 'carnes rojas, lentejas, porotos, espinaca (con vitamina C se absorbe mejor)' },
  { key: 'mg', nombre: 'Magnesio', unidad: 'mg', tipo: 'mineral', para: 'los músculos, los nervios y la glucosa', fuentes: 'frutos secos, legumbres, avena, chocolate amargo' },
  { key: 'k', nombre: 'Potasio', unidad: 'mg', tipo: 'mineral', para: 'el corazón, los músculos y la presión', fuentes: 'plátano, papa, legumbres, palta' },
  { key: 'zn', nombre: 'Zinc', unidad: 'mg', tipo: 'mineral', para: 'las defensas y la cicatrización', fuentes: 'carnes, legumbres, semillas de zapallo, frutos secos' },
  { key: 'p', nombre: 'Fósforo', unidad: 'mg', tipo: 'mineral', para: 'los huesos y la energía', fuentes: 'lácteos, carnes, legumbres' },
];
export const MICRO_KEYS = MICROS.map((m) => m.key);
export const microInfo = (k: MicroKey) => MICROS.find((m) => m.key === k)!;

export interface Persona { sex?: 'h' | 'm' | null; age?: number | null }

// Recomendación diaria (RDA, o AI donde no hay RDA: vitamina K y potasio) del NIH Office of Dietary Supplements / IOM,
// por tramo de edad: 14–18, 19–30, 31–50, 51–70, 71+; cada uno [hombre, mujer]. Embarazo y lactancia no están modelados.
type Tramo = [number, number];
const T5 = (h: number, m: number): Tramo[] => [[h, m], [h, m], [h, m], [h, m], [h, m]];
const DRI: Record<MicroKey, Tramo[]> = {
  vA: T5(900, 700),
  vC: [[75, 65], [90, 75], [90, 75], [90, 75], [90, 75]],
  vD: [[15, 15], [15, 15], [15, 15], [15, 15], [20, 20]],
  vE: T5(15, 15),
  vK: [[75, 75], [120, 90], [120, 90], [120, 90], [120, 90]],
  b1: [[1.2, 1.0], [1.2, 1.1], [1.2, 1.1], [1.2, 1.1], [1.2, 1.1]],
  b2: [[1.3, 1.0], [1.3, 1.1], [1.3, 1.1], [1.3, 1.1], [1.3, 1.1]],
  b3: T5(16, 14),
  b6: [[1.3, 1.2], [1.3, 1.3], [1.3, 1.3], [1.7, 1.5], [1.7, 1.5]],
  b12: T5(2.4, 2.4),
  fol: T5(400, 400),
  ca: [[1300, 1300], [1000, 1000], [1000, 1000], [1000, 1200], [1200, 1200]],
  fe: [[11, 15], [8, 18], [8, 18], [8, 8], [8, 8]],
  mg: [[410, 360], [400, 310], [420, 320], [420, 320], [420, 320]],
  k: [[3000, 2300], [3400, 2600], [3400, 2600], [3400, 2600], [3400, 2600]],
  zn: [[11, 9], [11, 8], [11, 8], [11, 8], [11, 8]],
  p: [[1250, 1250], [700, 700], [700, 700], [700, 700], [700, 700]],
};
const tramo = (age?: number | null) => (age == null ? 2 : age < 19 ? 0 : age < 31 ? 1 : age < 51 ? 2 : age < 71 ? 3 : 4);

/** La recomendación diaria para esa persona. Sin sexo, la mayor de las dos (así el % no se infla). */
export function dri(key: MicroKey, p: Persona = {}): number {
  const [h, m] = DRI[key][tramo(p.age)];
  return p.sex === 'h' ? h : p.sex === 'm' ? m : Math.max(h, m);
}

// Límite superior tolerable (UL, adultos) del NIH/IOM. En vitamina A es la retinol preformada; en magnesio, niacina,
// folato y vitamina E cuenta solo lo de suplementos y alimentos fortificados (no lo natural de la comida).
const UL: Partial<Record<MicroKey, number>> = { vA: 3000, vC: 2000, vD: 100, vE: 1000, b3: 35, b6: 100, fol: 1000, ca: 2500, fe: 45, mg: 350, zn: 40, p: 4000 };
export const UL_SOLO_SUPLEMENTOS: MicroKey[] = ['mg', 'b3', 'fol', 'vE'];
export function ul(key: MicroKey, p: Persona = {}): number | null {
  const v = UL[key];
  if (v == null) return null;
  if (key === 'ca' && (p.age ?? 30) >= 51) return 2000;
  if (key === 'p' && (p.age ?? 30) >= 71) return 3000;
  return v;
}

const rnd = (n: number) => (n >= 100 ? Math.round(n) : n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100);

/** Los micronutrientes de `grams` gramos de un alimento con estos valores por 100 g. */
export function scaleMicros(per100: Micros | undefined | null, grams: number): Micros {
  const out: Micros = {};
  if (!per100 || !(grams > 0)) return out;
  for (const k of MICRO_KEYS) { const v = per100[k]; if (typeof v === 'number' && Number.isFinite(v)) out[k] = rnd((v * grams) / 100); }
  return out;
}

export function addMicros(...list: Array<Micros | undefined | null>): Micros {
  const out: Micros = {};
  for (const m of list) {
    if (!m) continue;
    for (const k of MICRO_KEYS) { const v = m[k]; if (typeof v === 'number' && Number.isFinite(v)) out[k] = rnd((out[k] ?? 0) + v); }
  }
  return out;
}

/** «0,8 mg», «120 µg», «1.200 mg» (formato chileno). */
export function fmtMicro(key: MicroKey, v: number): string {
  return `${fmtNum(rnd(v))} ${microInfo(key).unidad}`;
}

/** 1.200 / 0,8 (formato chileno, sin depender de Intl) */
export function fmtNum(n: number): string {
  if (Math.abs(n) >= 1000) return String(Math.round(n)).replace(/(\d)(?=(\d{3})+$)/g, '$1.');
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** % de la recomendación diaria (entero). */
export const pctDri = (key: MicroKey, v: number, p: Persona = {}) => Math.round((v / dri(key, p)) * 100);

// ─── El día (fase I6, 2026-10-23) ────────────────────────────────────────────

/**
 * Los que cuentan para la nota de calidad del día: los que más suelen faltar. La vitamina D no (sale sobre todo del sol: con
 * comida casi nadie llega y castigaría a todos), ni la K, las B1, B2, B3 ni el fósforo (rara vez faltan: inflarían la nota).
 */
export const SCORE_KEYS: MicroKey[] = ['vA', 'vC', 'vE', 'b12', 'fol', 'ca', 'fe', 'mg', 'k', 'zn'];

/** La recomendación diaria de los que cuentan para la nota, para el núcleo de calidad (que no importa nada). */
export function microRef(p: Persona = {}): Record<string, number> {
  return Object.fromEntries(SCORE_KEYS.map((k) => [k, dri(k, p)]));
}

export interface MicroRow {
  key: MicroKey;
  nombre: string;
  unidad: 'mg' | 'µg';
  comida: number;
  suplementos: number;
  total: number;
  dri: number;
  /** % de la recomendación del día (comida + suplementos) */
  pct: number;
  /** el límite superior que pasa hoy, si pasa alguno (para los de UL_SOLO_SUPLEMENTOS cuenta solo lo de suplementos) */
  sobreUL: number | null;
}

export interface MicroDia {
  rows: MicroRow[];
  /** qué parte de la energía de hoy viene de alimentos con vitaminas y minerales conocidos (0–1) */
  cobertura: number;
  /** los que van más bajos (de SCORE_KEYS), con dónde encontrarlos */
  bajos: Array<{ key: MicroKey; nombre: string; pct: number; fuentes: string }>;
}

/**
 * Las vitaminas y minerales del día: lo comido (cada alimento con sus valores por 100 g, si se conocen) más lo de los
 * suplementos tomados. `kcal` de cada alimento da la cobertura: un día con mucho de lo anotado sin datos se avisa.
 */
export function microDia(items: Array<{ grams: number; kcal: number; micros?: Micros | null }>, sup: Micros, p: Persona = {}): MicroDia {
  const comida = addMicros(...items.map((it) => scaleMicros(it.micros ?? undefined, it.grams)));
  const kcal = items.reduce((a, it) => a + Math.max(0, it.kcal), 0);
  const kcalCon = items.reduce((a, it) => a + (it.micros && Object.keys(it.micros).length ? Math.max(0, it.kcal) : 0), 0);
  const rows: MicroRow[] = MICROS.map((m) => {
    const c = comida[m.key] ?? 0, s = sup[m.key] ?? 0, total = rnd(c + s);
    const lim = ul(m.key, p);
    const medido = UL_SOLO_SUPLEMENTOS.includes(m.key) ? s : total;
    return { key: m.key, nombre: m.nombre, unidad: m.unidad, comida: rnd(c), suplementos: rnd(s), total, dri: dri(m.key, p), pct: pctDri(m.key, total, p), sobreUL: lim != null && medido > lim ? lim : null };
  });
  const bajos = rows.filter((r) => SCORE_KEYS.includes(r.key)).sort((a, b) => a.pct - b.pct).slice(0, 3)
    .map((r) => ({ key: r.key, nombre: r.nombre, pct: r.pct, fuentes: microInfo(r.key).fuentes }));
  return { rows, cobertura: kcal > 0 ? Math.round((kcalCon / kcal) * 100) / 100 : 0, bajos };
}

// ─── 2. Fichas de suplementos ────────────────────────────────────────────────

export type Evidencia = 'fuerte' | 'moderada' | 'limitada';
export interface Fuente { nombre: string; url: string }

export interface Cuidado {
  /** condiciones del perfil (ids: ckd, heart_failure, hypertension…) */
  cond?: string[];
  /** nombre de un remedio que tome la persona */
  med?: RegExp;
  /** texto de alergias o restricciones del perfil */
  alergia?: RegExp;
  texto: string;
}

export interface Ficha {
  id: string;
  nombre: string;
  alias: string[];
  que: string;
  evidencia: Evidencia;
  evidenciaTexto: string;
  /** la dosis que usan los estudios (REFERENCIA, no indicación) */
  dosis: string;
  fuentes: Fuente[];
  /** unidad típica de una toma */
  unidad: string;
  /** a qué vitamina o mineral suma (y cómo se convierte desde la unidad de la toma) */
  micro?: MicroKey;
  cuidados: Cuidado[];
  /** cuidados para todos */
  general: string[];
}

const ODS = (tema: string, archivo: string): Fuente => ({ nombre: `NIH Office of Dietary Supplements — ${tema}`, url: `https://ods.od.nih.gov/factsheets/${archivo}-HealthProfessional/` });

// Remedios que cambian algo (nombres genéricos y marcas comunes en Chile)
const ANTICOAG = /warfarin|acenocumarol|neosintrom|apixab|eliquis|rivaroxab|xarelto|dabigatr|pradaxa|clopidogrel|plavix|ticagrelor|aspirina|[aá]cido acetilsalic/i;
const METFORMINA = /metformin|glafornil|glucophage|janumet|jalra[\s-]?m|galvus[\s-]?met|eucreas|xigduo|synjardy|velmetia/i;
const IBP = /omeprazol|esomeprazol|lansoprazol|pantoprazol|rabeprazol|nexium/i;
const LEVOTIROXINA = /levotiroxin|eutirox|synthroid|euthyrox/i;
const ANTIBIOTICO = /ciprofloxac|levofloxac|moxifloxac|doxiciclin|tetraciclin|minociclin/i;
const BIFOSFONATO = /alendron|risedron|ibandron/i;
const TIAZIDA = /hidroclorotiazid|clortalidon|indapamid/i;
const SUBE_POTASIO = /enalapril|captopril|lisinopril|ramipril|losart|valsart|irbesart|candesart|telmisart|olmesart|espironolact|eplerenon|sacubitril/i;
const DIURETICO_ASA = /furosemid|lasix|torasemid/i;

export const FICHAS: Ficha[] = [
  {
    id: 'creatina', nombre: 'Creatina monohidratada', alias: ['creatina', 'creatine', 'creatina monohidrato'],
    que: 'Llena las reservas de fosfocreatina del músculo: ayuda en esfuerzos cortos e intensos (pesas, sprints) y, junto con el entrenamiento de fuerza, a ganar fuerza y masa muscular.',
    evidencia: 'fuerte', evidenciaTexto: 'Es de los suplementos más estudiados: cientos de estudios en personas sanas muestran beneficio en fuerza y potencia, y buena seguridad a largo plazo.',
    dosis: 'Los estudios usan 3 a 5 g al día. Algunos parten con una «carga» de ~0,3 g/kg al día (unos 20 g en 4 tomas) por 5 a 7 días, que no es necesaria: con 3 a 5 g diarios se llega igual en unas 4 semanas.',
    fuentes: [{ nombre: 'International Society of Sports Nutrition (Kreider et al., 2017)', url: 'https://doi.org/10.1186/s12970-017-0173-z' }, ODS('Exercise and Athletic Performance', 'ExerciseAndAthleticPerformance')],
    unidad: 'g',
    cuidados: [
      { cond: ['ckd'], texto: 'Con enfermedad renal no se recomienda sin el visto bueno de tu nefrólogo.' },
    ],
    general: [
      'Puede subir la creatinina en los exámenes de sangre sin que signifique daño renal: si te haces exámenes, cuéntale a tu médico que la tomas.',
      'Suele subir 1 a 2 kg de peso por el agua que guarda el músculo.',
    ],
  },
  {
    id: 'omega3', nombre: 'Omega-3 (EPA y DHA)', alias: ['omega 3', 'omega-3', 'omega3', 'aceite de pescado', 'fish oil', 'epa', 'dha', 'aceite de krill'],
    que: 'Las grasas del pescado azul. Bajan los triglicéridos y son parte del corazón, el cerebro y la retina.',
    evidencia: 'moderada', evidenciaTexto: 'Fuerte para bajar triglicéridos altos (en dosis altas, con control médico). Para prevenir enfermedades del corazón en la población general, los estudios no coinciden. Comer pescado 2 veces por semana es la recomendación más sólida.',
    dosis: 'Para la salud en general, la referencia es 250 a 500 mg al día de EPA + DHA (lo que suma una cápsula típica; mira la etiqueta: «1.000 mg de aceite» no son 1.000 mg de EPA + DHA). Para triglicéridos altos se usan 2 a 4 g al día, siempre indicados por un médico.',
    fuentes: [ODS('Omega-3 Fatty Acids', 'Omega3FattyAcids'), { nombre: 'EFSA — valores de referencia para grasas (2010)', url: 'https://doi.org/10.2903/j.efsa.2010.1461' }],
    unidad: 'mg',
    cuidados: [
      { med: ANTICOAG, texto: 'Tomas un anticoagulante o antiagregante: en dosis altas el omega-3 puede aumentar el riesgo de sangrado. Conversa con tu médico antes de tomarlo.' },
      { alergia: /pescado|marisco/i, texto: 'Tienes alergia a pescados o mariscos: busca uno de algas o pregúntale a tu médico.' },
    ],
    general: ['Sobre 3 g al día se asocia a más riesgo de fibrilación auricular (arritmia).'],
  },
  {
    id: 'vitamina_d', nombre: 'Vitamina D', alias: ['vitamina d', 'vitamina d3', 'd3', 'colecalciferol', 'vit d'],
    que: 'Ayuda a absorber el calcio (huesos) y participa en los músculos y las defensas. La piel la produce con el sol; en invierno o con poca luz suele faltar.',
    evidencia: 'fuerte', evidenciaTexto: 'Fuerte para corregir un déficit medido en un examen y para la salud ósea en quien le falta. Con niveles normales, tomar más no ha mostrado beneficios en otras enfermedades.',
    dosis: 'La recomendación diaria es 15 µg (600 UI) hasta los 70 años y 20 µg (800 UI) después. El límite superior es 100 µg (4.000 UI) al día. Las dosis mayores, o semanales, son tratamientos que indica el médico según tu examen.',
    fuentes: [ODS('Vitamin D', 'VitaminD')],
    unidad: 'UI', micro: 'vD',
    cuidados: [
      { med: TIAZIDA, texto: 'Tomas un diurético tiazídico: junto con vitamina D puede subir mucho el calcio. Conversa la dosis con tu médico.' },
      { cond: ['ckd'], texto: 'Con enfermedad renal la vitamina D y sus formas activas las maneja tu nefrólogo.' },
    ],
    general: ['No pases de 4.000 UI al día sin indicación médica: en exceso sube el calcio (náuseas, cálculos renales).'],
  },
  {
    id: 'magnesio', nombre: 'Magnesio', alias: ['magnesio', 'citrato de magnesio', 'bisglicinato de magnesio', 'cloruro de magnesio', 'oxido de magnesio', 'magnesium'],
    que: 'Participa en los músculos, los nervios, el ritmo del corazón y el manejo de la glucosa.',
    evidencia: 'moderada', evidenciaTexto: 'Sirve para corregir un déficit (más común con diabetes, algunos diuréticos y omeprazol). Para el sueño o los calambres, los estudios son pocos y no coinciden.',
    dosis: 'Lo recomendado al día, sumando la comida, es 310 a 420 mg según edad y sexo. Lo que viene de suplementos no debería pasar de 350 mg al día (límite superior).',
    fuentes: [ODS('Magnesium', 'Magnesium')],
    unidad: 'mg', micro: 'mg',
    cuidados: [
      { cond: ['ckd'], texto: 'Con enfermedad renal el magnesio se puede acumular: no lo tomes sin indicación de tu nefrólogo.' },
      { med: ANTIBIOTICO, texto: 'Con ese antibiótico, toma el magnesio al menos 2 horas antes o 4 a 6 horas después: si no, el antibiótico se absorbe peor.' },
      { med: BIFOSFONATO, texto: 'Con alendronato o similares, sepáralos al menos 2 horas.' },
      { med: new RegExp(`${DIURETICO_ASA.source}|${TIAZIDA.source}|${IBP.source}`, 'i'), texto: 'Tu remedio puede bajar el magnesio con el tiempo: vale la pena preguntarle a tu médico si conviene medirlo.' },
    ],
    general: ['Las dosis altas (sobre todo óxido y citrato) pueden dar diarrea.'],
  },
  {
    id: 'b12', nombre: 'Vitamina B12', alias: ['vitamina b12', 'b12', 'cobalamina', 'cianocobalamina', 'metilcobalamina'],
    que: 'Necesaria para formar glóbulos rojos y para los nervios. Solo viene en alimentos de origen animal.',
    evidencia: 'fuerte', evidenciaTexto: 'Fuerte para prevenir y corregir el déficit: en veganos, mayores de 50 años y quienes toman metformina u omeprazol por años.',
    dosis: 'La recomendación diaria es 2,4 µg. Los suplementos suelen traer 250 a 1.000 µg porque se absorbe una parte pequeña. No tiene límite superior: el exceso se elimina.',
    fuentes: [ODS('Vitamin B12', 'VitaminB12')],
    unidad: 'µg', micro: 'b12',
    cuidados: [
      { med: METFORMINA, texto: 'Tomas metformina: con los años baja la B12. Pregúntale a tu médico por medirla (es un examen de sangre).' },
      { med: IBP, texto: 'El omeprazol y similares, tomados por años, bajan la absorción de B12: conversa con tu médico si conviene medirla.' },
    ],
    general: ['Si comes vegano, la B12 tiene que venir de un suplemento o de alimentos fortificados: la comida vegetal no la trae.'],
  },
  {
    id: 'hierro', nombre: 'Hierro', alias: ['hierro', 'sulfato ferroso', 'fumarato ferroso', 'bisglicinato de hierro', 'iron'],
    que: 'Forma la hemoglobina, que lleva el oxígeno en la sangre.',
    evidencia: 'fuerte', evidenciaTexto: 'Fuerte para tratar la anemia por falta de hierro. Sin déficit no aporta nada y el exceso se acumula y hace daño.',
    dosis: 'La recomendación diaria es 8 mg (hombres y mujeres después de la menopausia) y 18 mg (mujeres de 19 a 50 años). El límite superior es 45 mg al día. Tratar una anemia es otra dosis, que indica el médico según tus exámenes.',
    fuentes: [ODS('Iron', 'Iron')],
    unidad: 'mg', micro: 'fe',
    cuidados: [
      { med: LEVOTIROXINA, texto: 'Con levotiroxina, sepáralos al menos 4 horas: el hierro le quita efecto.' },
      { med: new RegExp(`${ANTIBIOTICO.source}|${BIFOSFONATO.source}`, 'i'), texto: 'Ese remedio se absorbe peor con hierro: sepáralos al menos 2 horas.' },
      { med: IBP, texto: 'El omeprazol y similares bajan la absorción del hierro.' },
    ],
    general: [
      'Tómalo solo con un déficit confirmado en un examen.',
      'Se absorbe mejor con vitamina C y peor con té, café o lácteos.',
      'Guárdalo lejos de los niños: es una causa común de intoxicación infantil.',
    ],
  },
  {
    id: 'zinc', nombre: 'Zinc', alias: ['zinc', 'gluconato de zinc', 'picolinato de zinc'],
    que: 'Participa en las defensas, la cicatrización, el gusto y el olfato.',
    evidencia: 'moderada', evidenciaTexto: 'Las pastillas para chupar, empezadas apenas parte un resfrío, lo acortan un poco. Para corregir un déficit, sí; para lo demás, poca evidencia.',
    dosis: 'La recomendación diaria es 8 mg (mujeres) y 11 mg (hombres). El límite superior es 40 mg al día.',
    fuentes: [ODS('Zinc', 'Zinc')],
    unidad: 'mg', micro: 'zn',
    cuidados: [
      { med: ANTIBIOTICO, texto: 'Con ese antibiótico, toma el zinc 2 horas antes o 4 a 6 horas después.' },
      { med: TIAZIDA, texto: 'Tu diurético aumenta la pérdida de zinc por la orina.' },
    ],
    general: ['Sobre 40 mg al día por meses baja el cobre (anemia, problemas en los nervios).'],
  },
  {
    id: 'proteina', nombre: 'Proteína en polvo', alias: ['proteina', 'proteina en polvo', 'whey', 'proteina whey', 'proteína', 'protein', 'proteina vegetal', 'caseina', 'isolate'],
    que: 'Una forma práctica de llegar a tu meta de proteína. No hace nada que no haga la proteína de la comida.',
    evidencia: 'fuerte', evidenciaTexto: 'Fuerte como fuente de proteína para ganar o mantener músculo con entrenamiento, cuando con la comida no se llega a la meta.',
    dosis: 'Los estudios usan 20 a 40 g de proteína por toma (unos 0,25 a 0,4 g por kilo). En quienes entrenan, el total del día (comida + polvo) suele estar entre 1,4 y 2,0 g por kilo: tu meta de proteína en Eris ya lo calcula.',
    fuentes: [{ nombre: 'International Society of Sports Nutrition (Jäger et al., 2017)', url: 'https://doi.org/10.1186/s12970-017-0177-8' }],
    unidad: 'g',
    cuidados: [
      { cond: ['ckd'], texto: 'Con enfermedad renal, tu proteína del día es un tope que define tu nefrólogo: no sumes proteína en polvo sin conversarlo.' },
      { alergia: /lactosa|leche|l[aá]cteo/i, texto: 'Si la lactosa te cae mal, el «aislado» (isolate) o una proteína vegetal tienen poca o nada.' },
    ],
    general: ['Es comida: anótala en Nutrición para que sume a tus calorías y proteína.', 'Revisa la etiqueta: algunas traen bastante azúcar.'],
  },
  {
    id: 'cafeina', nombre: 'Cafeína', alias: ['cafeina', 'cafeína', 'pre entreno', 'preentreno', 'pre-entreno', 'caffeine'],
    que: 'Da más alerta y mejora el rendimiento en ejercicios de resistencia y de fuerza.',
    evidencia: 'fuerte', evidenciaTexto: 'Fuerte para el rendimiento deportivo, con respuestas que cambian mucho de una persona a otra.',
    dosis: 'Los estudios usan 3 a 6 mg por kilo de peso, unos 60 minutos antes del ejercicio. En adultos sanos, hasta 400 mg al día en total se considera seguro (en el embarazo, hasta 200 mg). Un café de grano tiene unos 80 a 100 mg.',
    fuentes: [{ nombre: 'International Society of Sports Nutrition (Guest et al., 2021)', url: 'https://doi.org/10.1186/s12970-020-00383-4' }, { nombre: 'EFSA — seguridad de la cafeína (2015)', url: 'https://doi.org/10.2903/j.efsa.2015.4102' }],
    unidad: 'mg',
    cuidados: [
      { cond: ['hypertension'], texto: 'Con presión alta, la cafeína la sube un rato: conversa con tu médico cuánta te conviene.' },
      { cond: ['anxiety'], texto: 'Con ansiedad, la cafeína puede empeorar el nerviosismo y las palpitaciones.' },
      { cond: ['heart_failure'], texto: 'Con una enfermedad del corazón, conversa con tu cardiólogo antes de tomar suplementos con cafeína.' },
    ],
    general: ['Suma todo: café, té, bebidas cola y energéticas.', 'Evítala 6 horas antes de dormir: empeora el sueño aunque te quedes dormido.'],
  },
  {
    id: 'electrolitos', nombre: 'Electrolitos (sales de hidratación)', alias: ['electrolitos', 'sales de hidratacion', 'sales de rehidratacion', 'suero oral', 'hidratante', 'bebida isotonica', 'sodio y potasio'],
    que: 'Reponen el sodio (y algo de potasio) que se pierde con el sudor o con diarrea.',
    evidencia: 'moderada', evidenciaTexto: 'Útiles en ejercicio de más de 60 a 90 minutos, con mucho calor o mucho sudor, y las sales de rehidratación oral en la diarrea. Para el día a día no hacen falta.',
    dosis: 'En ejercicio largo, las guías usan unos 300 a 600 mg de sodio por hora junto con 400 a 800 ml de líquido, según cuánto sudes.',
    fuentes: [{ nombre: 'American College of Sports Medicine — reposición de líquidos (Sawka et al., 2007)', url: 'https://doi.org/10.1249/mss.0b013e31802ca597' }],
    unidad: 'sobre',
    cuidados: [
      { cond: ['hypertension'], texto: 'Con presión alta, el sodio extra cuenta: úsalos solo en ejercicio largo o con indicación médica.' },
      { cond: ['ckd', 'heart_failure'], texto: 'Con tu condición, el sodio y el potasio los define tu médico: no tomes electrolitos sin su indicación.' },
      { med: SUBE_POTASIO, texto: 'Tu remedio sube el potasio: evita los electrolitos con potasio sin conversarlo con tu médico.' },
    ],
    general: ['Las bebidas isotónicas también traen azúcar: cuentan como comida.'],
  },
  {
    id: 'calcio', nombre: 'Calcio', alias: ['calcio', 'carbonato de calcio', 'citrato de calcio', 'calcium'],
    que: 'El mineral de los huesos y los dientes; también participa en los músculos y los nervios.',
    evidencia: 'moderada', evidenciaTexto: 'Sirve si con la comida no llegas (pocos lácteos), junto con vitamina D, sobre todo en mujeres después de la menopausia. Lo ideal es que venga de la comida.',
    dosis: 'La recomendación diaria es 1.000 mg (1.200 mg en mujeres desde los 51 años y en todos desde los 71), sumando la comida. Se absorbe mejor en tomas de 500 mg o menos. El límite superior es 2.500 mg (2.000 mg desde los 51 años).',
    fuentes: [ODS('Calcium', 'Calcium')],
    unidad: 'mg', micro: 'ca',
    cuidados: [
      { med: LEVOTIROXINA, texto: 'Con levotiroxina, sepáralos al menos 4 horas.' },
      { med: new RegExp(`${ANTIBIOTICO.source}|${BIFOSFONATO.source}`, 'i'), texto: 'Ese remedio se absorbe peor con calcio: sepáralos al menos 2 horas.' },
      { med: TIAZIDA, texto: 'Tu diurético guarda calcio: conversa con tu médico antes de sumar un suplemento.' },
      { cond: ['ckd'], texto: 'Con enfermedad renal, el calcio lo maneja tu nefrólogo.' },
    ],
    general: ['En exceso (con suplementos) puede dar cálculos renales y estreñimiento.'],
  },
  {
    id: 'vitamina_c', nombre: 'Vitamina C', alias: ['vitamina c', 'acido ascorbico', 'ácido ascórbico', 'vit c'],
    que: 'Participa en las defensas, la cicatrización y ayuda a absorber el hierro de los vegetales.',
    evidencia: 'limitada', evidenciaTexto: 'Con una dieta con frutas y verduras se llega de sobra. Tomarla todos los días acorta un poco los resfríos, pero no los previene.',
    dosis: 'La recomendación diaria es 75 mg (mujeres) y 90 mg (hombres), unos 35 mg más si fumas. Una naranja trae unos 70 mg. El límite superior es 2.000 mg al día.',
    fuentes: [ODS('Vitamin C', 'VitaminC')],
    unidad: 'mg', micro: 'vC',
    cuidados: [{ cond: ['ckd'], texto: 'Con enfermedad renal, las dosis altas de vitamina C pueden favorecer cálculos: conversa con tu nefrólogo.' }],
    general: ['Sobre 2.000 mg al día puede dar diarrea y cálculos renales.'],
  },
];

const fold = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** La ficha que corresponde a un nombre («creatina monohidratada Optimum», «vitamina D3 1000 UI»), o null. */
export function fichaPara(texto: string): Ficha | null {
  const t = ` ${fold(texto)} `;
  let best: { f: Ficha; len: number } | null = null;
  for (const f of FICHAS) {
    for (const a of [f.nombre, ...f.alias]) {
      const k = fold(a);
      if (k && t.includes(` ${k} `) && (!best || k.length > best.len)) best = { f, len: k.length };
    }
  }
  return best?.f ?? null;
}
export const fichaPorId = (id?: string | null) => FICHAS.find((f) => f.id === id) ?? null;

export interface PerfilMedico {
  conditions?: Array<{ id?: string; notes?: string }>;
  medications?: Array<{ name?: string; active?: boolean }>;
  allergies?: string;
  dietaryRestrictions?: string[];
}

/** Los cuidados de esa ficha que aplican a esta persona (por sus condiciones, remedios activos y alergias). */
export function cuidadosPara(f: Ficha, m: PerfilMedico | null | undefined): string[] {
  const conds = new Set((m?.conditions ?? []).map((c) => c?.id).filter(Boolean) as string[]);
  const meds = (m?.medications ?? []).filter((x) => x?.active !== false).map((x) => String(x?.name ?? ''));
  const alergias = `${m?.allergies ?? ''} ${(m?.dietaryRestrictions ?? []).join(' ')}`;
  return f.cuidados.filter((c) =>
    (c.cond && c.cond.some((id) => conds.has(id)))
    || (c.med && meds.some((n) => c.med!.test(n)))
    || (c.alergia && c.alergia.test(alergias)),
  ).map((c) => c.texto);
}

// ─── 3. Mis suplementos ──────────────────────────────────────────────────────

export interface MiSup {
  id: string;
  /** la ficha (creatina, vitamina D…) o null si es otro */
  fichaId: string | null;
  nombre: string;
  /** por toma, como la escribió la persona */
  cantidad: number;
  unidad: string;
  /** tomas al día */
  tomasDia: number;
  /** a qué hora (0–23, de a media hora: 8.5 = 8:30), una por toma */
  horas: number[];
  aviso: boolean;
  /** el ítem del Botiquín (Inventario) que lleva su stock */
  invId?: number | null;
  /** cuánto baja el stock del Botiquín por toma (en la unidad del ítem: 1 cápsula, 5 g…) */
  porToma?: number | null;
  activo: boolean;
  creado: string;
}

export interface SupState {
  version: 1;
  items: MiSup[];
  /** día (AAAA-MM-DD) → id → tomas hechas */
  log: Record<string, Record<string, number>>;
}

export const emptySupState = (): SupState => ({ version: 1, items: [], log: {} });

export interface SupCtx { now: Date; newId: () => string }

const pad = (n: number) => String(n).padStart(2, '0');
/** AAAA-MM-DD en hora local */
export const diaKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const LOG_DIAS = 60;

/** Conversión de la toma a la unidad del micronutriente (null = no se puede: «1 cápsula» sin saber cuánto trae). */
export function aMicro(key: MicroKey, cantidad: number, unidad: string): number | null {
  const u = String(unidad ?? '').trim().toLowerCase();
  const target = microInfo(key).unidad;
  const ug = /^(µg|μg|ug|mcg|microgramos?)$/.test(u);
  const mgU = /^(mg|miligramos?)$/.test(u);
  const gU = /^(g|gr|grs|gramos?)$/.test(u);
  const ui = /^(ui|iu)$/.test(u);
  if (ui) {
    // 1 µg de vitamina D = 40 UI; 1 UI de vitamina A (retinol) = 0,3 µg; 1 UI de vitamina E (natural) = 0,67 mg
    if (key === 'vD') return cantidad / 40;
    if (key === 'vA') return cantidad * 0.3;
    if (key === 'vE') return cantidad * 0.67;
    return null;
  }
  const inMg = mgU ? cantidad : ug ? cantidad / 1000 : gU ? cantidad * 1000 : null;
  if (inMg == null) return null;
  return target === 'mg' ? inMg : inMg * 1000;
}

/** Lo que aporta una toma a vitaminas y minerales. */
export function aporteToma(s: Pick<MiSup, 'fichaId' | 'cantidad' | 'unidad'>): Micros {
  const f = fichaPorId(s.fichaId);
  if (!f?.micro) return {};
  const v = aMicro(f.micro, s.cantidad, s.unidad);
  return v == null || !(v > 0) ? {} : { [f.micro]: rnd(v) };
}

/** «5 g», «1.000 UI», «1 cápsula», «2 cápsulas». */
export function fmtDosis(cantidad: number, unidad: string): string {
  const plural = cantidad !== 1 && /^(capsula|cápsula|tableta|comprimido|sobre|medida|scoop|gota|pastilla|unidad)$/i.test(unidad) ? (/(unidad)$/i.test(unidad) ? 'es' : 's') : '';
  return `${fmtNum(cantidad)} ${unidad}${plural}`;
}

export interface SupInput {
  nombre: string;
  fichaId?: string | null;
  cantidad: number;
  unidad?: string;
  tomasDia?: number;
  horas?: number[];
  aviso?: boolean;
  invId?: number | null;
  porToma?: number | null;
}

export interface SupResult { ok: boolean; msg: string; id?: string; aviso?: string }

const horasPorDefecto = (n: number): number[] => ([[8], [8, 20], [8, 14, 20], [8, 12, 16, 20]][Math.max(0, Math.min(3, n - 1))]);

/** ¿La dosis del día pasa el límite superior de los estudios? (solo un aviso: la dosis la decide la persona con su médico) */
export function sobreLimite(s: Pick<MiSup, 'fichaId' | 'cantidad' | 'unidad' | 'tomasDia'>, p: Persona = {}): string | null {
  const f = fichaPorId(s.fichaId);
  if (!f?.micro) return null;
  const v = aMicro(f.micro, s.cantidad, s.unidad);
  const lim = ul(f.micro, p);
  if (v == null || lim == null) return null;
  const dia = v * Math.max(1, s.tomasDia);
  if (dia <= lim) return null;
  return `Al día suman ${fmtMicro(f.micro, dia)}: pasa el límite superior de ${fmtMicro(f.micro, lim)} de los estudios (NIH). Si te lo indicó tu médico, está bien; si no, conversa la dosis con él.`;
}

export function agregarSup(S: SupState, inp: SupInput, ctx: SupCtx, p: Persona = {}): SupResult {
  const nombre = String(inp.nombre ?? '').trim().slice(0, 60);
  if (!nombre) return { ok: false, msg: 'Falta el nombre del suplemento.' };
  if (!(inp.cantidad > 0) || inp.cantidad > 100000) return { ok: false, msg: 'Escribe cuánto tomas por vez (por ejemplo 5 g o 1.000 UI).' };
  const ficha = inp.fichaId !== undefined ? fichaPorId(inp.fichaId) : fichaPara(nombre);
  const tomasDia = Math.max(1, Math.min(6, Math.round(inp.tomasDia ?? 1)));
  const horas = (inp.horas && inp.horas.length ? inp.horas : horasPorDefecto(tomasDia)).slice(0, tomasDia).map((h) => Math.max(0, Math.min(23.5, Math.round(h * 2) / 2)));
  while (horas.length < tomasDia) horas.push(horasPorDefecto(tomasDia)[horas.length] ?? 20);
  const ya = S.items.find((x) => x.activo && fold(x.nombre) === fold(nombre));
  if (ya) return { ok: false, msg: `Ya tienes ${ya.nombre} en tus suplementos: edítalo ahí.`, id: ya.id };
  const item: MiSup = {
    id: ctx.newId(), fichaId: ficha?.id ?? null, nombre, cantidad: inp.cantidad, unidad: (inp.unidad || ficha?.unidad || 'unidad').trim().slice(0, 20),
    tomasDia, horas: horas.sort((a, b) => a - b), aviso: inp.aviso ?? true, invId: inp.invId ?? null, porToma: inp.porToma ?? null,
    activo: true, creado: ctx.now.toISOString(),
  };
  S.items.push(item);
  const aviso = sobreLimite(item, p) ?? undefined;
  return { ok: true, msg: `${item.nombre}: ${fmtDosis(item.cantidad, item.unidad)}, ${item.tomasDia === 1 ? '1 vez' : `${item.tomasDia} veces`} al día.`, id: item.id, aviso };
}

export function editarSup(S: SupState, id: string, cambios: Partial<SupInput>, p: Persona = {}): SupResult {
  const it = S.items.find((x) => x.id === id);
  if (!it) return { ok: false, msg: 'No encontré ese suplemento.' };
  if (cambios.nombre !== undefined) { const n = String(cambios.nombre).trim().slice(0, 60); if (n) it.nombre = n; }
  if (cambios.fichaId !== undefined) it.fichaId = fichaPorId(cambios.fichaId)?.id ?? null;
  if (cambios.cantidad !== undefined) { if (!(cambios.cantidad > 0)) return { ok: false, msg: 'La cantidad tiene que ser mayor que cero.' }; it.cantidad = cambios.cantidad; }
  if (cambios.unidad !== undefined && cambios.unidad.trim()) it.unidad = cambios.unidad.trim().slice(0, 20);
  if (cambios.tomasDia !== undefined) {
    it.tomasDia = Math.max(1, Math.min(6, Math.round(cambios.tomasDia)));
    if (!cambios.horas) it.horas = horasPorDefecto(it.tomasDia);
  }
  if (cambios.horas) it.horas = cambios.horas.slice(0, it.tomasDia).map((h) => Math.max(0, Math.min(23.5, Math.round(h * 2) / 2))).sort((a, b) => a - b);
  while (it.horas.length < it.tomasDia) it.horas.push(horasPorDefecto(it.tomasDia)[it.horas.length] ?? 20);
  if (cambios.aviso !== undefined) it.aviso = !!cambios.aviso;
  if (cambios.invId !== undefined) it.invId = cambios.invId;
  if (cambios.porToma !== undefined) it.porToma = cambios.porToma;
  return { ok: true, msg: `${it.nombre} actualizado.`, id: it.id, aviso: sobreLimite(it, p) ?? undefined };
}

/** Lo deja de tomar: sale de la lista, pero lo ya tomado queda en el historial (la constancia de la semana). */
export function quitarSup(S: SupState, id: string): SupResult {
  const it = S.items.find((x) => x.id === id);
  if (!it || !it.activo) return { ok: false, msg: 'No encontré ese suplemento.' };
  it.activo = false;
  return { ok: true, msg: `Quitado: ${it.nombre}. Lo ya tomado queda en tu historial.`, id };
}

export const tomasDe = (S: SupState, dia: string, id: string) => S.log[dia]?.[id] ?? 0;

/** «Tomado» en un toque. Una toma de más se anota igual, avisando (la persona sabe lo que tomó). */
export function tomar(S: SupState, id: string, dia: string): SupResult {
  const it = S.items.find((x) => x.id === id && x.activo);
  if (!it) return { ok: false, msg: 'No encontré ese suplemento.' };
  const n = tomasDe(S, dia, id) + 1;
  S.log[dia] = { ...(S.log[dia] ?? {}), [id]: n };
  const dias = Object.keys(S.log).sort();
  for (const d of dias.slice(0, Math.max(0, dias.length - LOG_DIAS))) delete S.log[d];
  const extra = n > it.tomasDia ? ` Llevas ${n} tomas hoy y lo tuyo son ${it.tomasDia}.` : '';
  return { ok: true, msg: `${it.nombre}: ${n === it.tomasDia ? 'listo por hoy' : `${n} de ${it.tomasDia}`}.${extra}`, id };
}

export function destomar(S: SupState, id: string, dia: string): SupResult {
  const n = tomasDe(S, dia, id);
  const it = S.items.find((x) => x.id === id);
  if (!it || n <= 0) return { ok: false, msg: 'No había una toma que deshacer.' };
  const day = { ...(S.log[dia] ?? {}) };
  if (n - 1 > 0) day[id] = n - 1; else delete day[id];
  S.log[dia] = day;
  return { ok: true, msg: `${it.nombre}: quité una toma (${n - 1} de ${it.tomasDia}).`, id };
}

export interface EstadoSup { sup: MiSup; tomadas: number; faltan: number; /** la próxima hora que toca hoy, o null */ proxima: number | null; atrasada: boolean }

/** Cómo va cada suplemento hoy: tomadas, las que faltan y si alguna ya pasó su hora (más de 1 h). */
export function estadoHoy(S: SupState, dia: string, horaDelDia: number): EstadoSup[] {
  return S.items.filter((x) => x.activo).map((sup) => {
    const tomadas = tomasDe(S, dia, sup.id);
    const faltan = Math.max(0, sup.tomasDia - tomadas);
    const pendientes = sup.horas.slice(tomadas);
    const proxima = pendientes.length ? pendientes[0] : null;
    return { sup, tomadas, faltan, proxima, atrasada: proxima != null && horaDelDia >= proxima + 1 };
    // Orden fijo (por su primera hora del día): al tocar «Tomado» la lista no se reordena bajo el dedo
  }).sort((a, b) => (a.sup.horas[0] ?? 99) - (b.sup.horas[0] ?? 99) || a.sup.nombre.localeCompare(b.sup.nombre));
}

/** Constancia de los últimos `dias` días (sin contar hoy si aún no termina): tomas hechas / esperadas, por suplemento. */
export function constancia(S: SupState, hasta: Date, dias = 7): Array<{ id: string; nombre: string; hechas: number; esperadas: number; pct: number }> {
  const keys: string[] = [];
  for (let i = 0; i < dias; i++) { const d = new Date(hasta); d.setDate(d.getDate() - i); keys.push(diaKey(d)); }
  return S.items.filter((x) => x.activo).map((s) => {
    const desde = diaKey(new Date(s.creado));
    const validos = keys.filter((k) => k >= desde);
    const esperadas = validos.length * s.tomasDia;
    const hechas = validos.reduce((acc, k) => acc + Math.min(s.tomasDia, tomasDe(S, k, s.id)), 0);
    return { id: s.id, nombre: s.nombre, hechas, esperadas, pct: esperadas ? Math.round((hechas / esperadas) * 100) : 0 };
  });
}

/** Lo que sumaron los suplementos de ese día a vitaminas y minerales (las tomas hechas, incluidos los que ya se quitaron). */
export function aporteDelDia(S: SupState, dia: string): Micros {
  const day = S.log[dia] ?? {};
  return addMicros(...Object.entries(day).map(([id, n]) => {
    const s = S.items.find((x) => x.id === id);
    if (!s) return {};
    const t = aporteToma(s);
    return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, (v as number) * n])) as Micros;
  }));
}

/** Busca entre MIS suplementos por lo dicho («la creatina», «vitamina d», «el omega»). */
export function buscarMio(S: SupState, texto: string): MiSup | null {
  const t = fold(texto);
  if (!t) return null;
  const activos = S.items.filter((x) => x.activo);
  const exact = activos.find((x) => fold(x.nombre) === t || t.includes(fold(x.nombre)) || fold(x.nombre).includes(t));
  if (exact) return exact;
  const f = fichaPara(texto);
  return f ? activos.find((x) => x.fichaId === f.id) ?? null : null;
}

const fmtHora = (h: number) => `${Math.floor(h)}:${h % 1 ? '30' : '00'}`;

/** Lo que Eris sabe de tus suplementos (contexto del chat) y los números. */
export function extract(S: SupState, now: Date): { context: string; summary: { activos: number; hoy: Array<{ nombre: string; tomadas: number; tomasDia: number }> } } {
  const dia = diaKey(now);
  const est = estadoHoy(S, dia, now.getHours() + now.getMinutes() / 60);
  if (!est.length) return { context: '', summary: { activos: 0, hoy: [] } };
  const lines = est.map((e) => `${e.sup.nombre} ${fmtDosis(e.sup.cantidad, e.sup.unidad)}, ${e.sup.tomasDia === 1 ? '1 vez' : `${e.sup.tomasDia} veces`} al día (${e.sup.horas.map(fmtHora).join(' y ')}): hoy ${e.faltan === 0 ? 'listo' : `${e.tomadas} de ${e.sup.tomasDia}`}`);
  const sem = constancia(S, now).filter((c) => c.esperadas > 0).map((c) => `${c.nombre} ${c.pct} %`);
  return {
    context: `Sus suplementos (los anota él; Eris no indica dosis):\n${lines.map((l) => `- ${l}`).join('\n')}${sem.length ? `\n- Constancia de los últimos 7 días: ${sem.join(', ')}` : ''}`,
    summary: { activos: est.length, hoy: est.map((e) => ({ nombre: e.sup.nombre, tomadas: e.tomadas, tomasDia: e.sup.tomasDia })) },
  };
}

// ─── Operaciones desde el chat («me tomé la creatina») ────────────────────────

export interface SupOp { action: 'tomar' | 'deshacer' | 'estado'; sup?: string }
export interface SupOpResult { ok: boolean; code?: string; msg: string; opciones?: string[]; /** el suplemento tocado */ id?: string; /** todos los tocados («me tomé mis suplementos») */ ids?: string[] }

/** `dia`: el día de comida de la app (trasnochadores: termina al dormir); por defecto, el del reloj. */
export function applyOp(S: SupState, op: SupOp, ctx: SupCtx, dia = diaKey(ctx.now)): { state: SupState; result: SupOpResult } {
  const W: SupState = JSON.parse(JSON.stringify(S));
  if (op.action === 'estado') {
    const est = estadoHoy(W, dia, ctx.now.getHours() + ctx.now.getMinutes() / 60);
    if (!est.length) return { state: S, result: { ok: true, code: 'vacio', msg: 'No tienes suplementos anotados. Se agregan en Nutrición → Suplementos.' } };
    const t = est.map((e) => `${e.sup.nombre}: ${e.faltan === 0 ? 'listo ✓' : `${e.tomadas} de ${e.sup.tomasDia}${e.proxima != null ? ` (toca a las ${fmtHora(e.proxima)})` : ''}`}`);
    return { state: S, result: { ok: true, msg: t.join('\n') } };
  }
  // «Me tomé mis suplementos»: una toma de cada uno de los que faltan hoy
  if (op.action === 'tomar' && /^(\*|todos?|todo|mis suplementos|los suplementos)$/.test(fold(op.sup ?? ''))) {
    const pend = estadoHoy(W, dia, ctx.now.getHours() + ctx.now.getMinutes() / 60).filter((e) => e.faltan > 0);
    if (!pend.length) return { state: S, result: { ok: true, code: 'nada_pendiente', msg: W.items.some((x) => x.activo) ? 'Ya tenías todo tomado hoy.' : 'No tienes suplementos anotados. Se agregan en Nutrición → Suplementos.' } };
    const msgs = pend.map((e) => tomar(W, e.sup.id, dia).msg);
    return { state: W, result: { ok: true, msg: msgs.join('\n'), ids: pend.map((e) => e.sup.id) } };
  }
  const mio = buscarMio(W, op.sup ?? '');
  if (!mio) {
    const activos = W.items.filter((x) => x.activo).map((x) => x.nombre);
    return { state: S, result: { ok: false, code: activos.length ? 'no_encontrado' : 'vacio', msg: activos.length ? `No encontré «${op.sup ?? ''}» en tus suplementos.` : 'No tienes suplementos anotados. Se agregan en Nutrición → Suplementos.', opciones: activos } };
  }
  const r = op.action === 'tomar' ? tomar(W, mio.id, dia) : destomar(W, mio.id, dia);
  return r.ok ? { state: W, result: { ok: true, msg: r.msg, id: mio.id } } : { state: S, result: { ok: false, code: 'nada_que_deshacer', msg: r.msg, id: mio.id } };
}

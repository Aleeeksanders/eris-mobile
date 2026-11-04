// ============================================================
// Eris Mobile — Forge: tu rutina escrita → plan por días (fase I8, 2026-10-23)
//
// Puro; se copia tal cual al servidor (scripts/sync_forge_core.ts): «carga mi rutina» por chat arma el MISMO plan que la
// revisión de la app. La IA conversa; el código decide.
//
// LEE lo que la gente escribe de verdad (la rutina real del usuario es así, con emojis y todo):
//   - días: «## Día A — Empuje», «🗓️ DÍA 1: EMPUJE (Domingo)», «Lunes: pierna», o títulos con ejercicios debajo;
//   - bloques dentro del día: «Sesión A: Gym (Fuerza Bruta)», «🏠 Sesión B: Casa (Anillas y Control)»;
//   - ejercicios en listas (-, *, ·, 1.) o tablas (| Ejercicio | Series | Reps |…), y dos en una línea («A 3x10 + B 3x12»);
//   - series: «4 series x 6-8 reps», «3x10», «3-4 series», «x10/lado», «3 series x 45 segundos», «4 rounds de 1 minuto»,
//     «6 series de 30 metros», «3 series al fallo (de tiempo)»; «por brazo/lado/pierna», «(opcional)», «si tienes…»;
//   - esfuerzo: «RIR 2», «RPE 8-9» (también en las reglas: «Gym: … RPE 8-9» vale para los bloques del gimnasio);
//   - pesos en las notas: «busca los 65-75 kg en barra o 24-26 kg por mancuerna», «+10-15 kg de lastre»: se toma el que
//     corresponde al equipo del ejercicio, desde abajo y al peso REAL de tu gimnasio. La nota queda tal cual.
// EMPAREJA cada ejercicio con el catálogo: nombre exacto (también tus ejercicios propios) → sinónimos en español e inglés
// («ring rows», «ab wheel», «RDL», «Pendlay») con el equipo que nombra → palabras en común. Una variante que el catálogo no
// tiene («ring dips», «flexiones con palmada») queda como «¿es X?» para confirmarla; lo que no existe se propone como
// ejercicio PROPIO (músculos por palabras clave) y se crea solo si se acepta en la revisión (o en el chat).
// ============================================================

import { catalog, gymOf, type ForgeState } from './forgeCore';
import { pickerFor, type Equip, type ForgeExercise, type Pattern, type SubId } from './forgeCatalog';
import { setRoutinePlan, type Routine, type RoutineDay, type RoutineItem } from './forgeRoutine';

export type Measure = 'reps' | 'seg' | 'm';
export type Confidence = 'exacto' | 'probable' | 'ninguno';
export type Side = 'lado' | 'brazo' | 'pierna';
export type HintCtx = 'mancuerna' | 'barra' | 'polea' | 'maquina' | 'lastre' | 'ayuda' | null;
/** Un peso que nombra la rutina («65-75 kg en barra»), con a qué equipo se refiere. */
export interface KgHint { min: number; max: number; unit: 'kg' | 'lb'; ctx: HintCtx }
export interface MdMatch { exId: string | null; confidence: Confidence; options: string[] }
export interface MdLine {
  /** estable dentro del texto («0-3»: día 0, ejercicio 3) */
  key: string;
  /** el ejercicio como lo escribiste */
  name: string;
  sets: number;
  setsMax?: number;
  /** null = sin número (al fallo, o solo «3 series») */
  repMin: number | null;
  repMax: number | null;
  measure: Measure;
  perSide?: Side;
  /** «al fallo» (sin número de reps) */
  amrap?: boolean;
  optional?: boolean;
  rir?: number;
  kg: KgHint[];
  note?: string;
  block?: string;
  /** el equipo que nombra, en orden («Barra o Mancuernas» → bb, db) */
  equip: Equip[];
  /** no decía las series (se asumieron 3) */
  assumed?: boolean;
  match: MdMatch;
}
export interface MdDay { id: string; label: string; name: string; weekday?: number; blocks: string[]; warmup?: string; notes: string[]; lines: MdLine[] }
export interface MdRoutine { title: string | null; rules: string[]; days: MdDay[] }
/** Lo que se decide por línea en la revisión: un id del catálogo, «propio» (crear) o «quitar». */
export type MdChoice = string;

// ─── Texto ───

const EMOJI = /(?:[\uD83C-\uD83E][\uDC00-\uDFFF]|[☀-➿⬀-⯿⌀-⏿️‍⃣])/g;
/** Sin emojis ni marcas de negrita, espacios simples. */
export const stripDeco = (t: string): string => t.replace(EMOJI, ' ').replace(/\*\*|__|`/g, '').replace(/[ \t]+/g, ' ').trim();

/** minúsculas, sin tildes, «×» → «x», rayas → «-», del MISMO largo (los índices sirven para cortar el texto original) */
function foldSame(t: string): string {
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '×' || c === '✕') { out += 'x'; continue; }
    if (c === '–' || c === '—' || c === '−') { out += '-'; continue; }
    const f = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    out += f.length === 1 ? f : ' ';
  }
  return out;
}
/** Para comparar nombres: solo letras y números. */
export const foldMd = (t: string): string => foldSame(t).replace(/[^a-z0-9]+/g, ' ').trim();
/** El contenido entre paréntesis queda en blanco (mismo largo): el esquema se busca en el texto principal. */
const blankParens = (f: string): string => {
  let depth = 0, out = '';
  for (const c of f) {
    if (c === '(') { depth++; out += ' '; continue; }
    if (c === ')') { depth = Math.max(0, depth - 1); out += ' '; continue; }
    out += depth ? ' ' : c;
  }
  return out;
};
const parensOf = (t: string): string[] => [...t.matchAll(/\(([^()]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
const withoutParens = (t: string): string => t.replace(/\([^()]*\)/g, ' ').replace(/\s+/g, ' ').trim();
const num = (x: string | undefined): number => Number(String(x ?? '').replace(',', '.'));

/** «EMPUJE» → «Empuje», «TIRÓN Y AGARRE» → «Tirón y agarre» (lo escrito con mayúsculas normales queda igual). */
export function prettyName(t: string, titleCase = false): string {
  const letters = t.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, '').length;
  if (letters.length < 3 || upper / letters.length < 0.7) return t.trim();
  const low = t.toLowerCase().trim();
  // en un título, las palabras cortas («de», «y», «la») van en minúscula salvo al comienzo
  if (titleCase) return low.replace(/(^|[\s"«(/-])([a-záéíóúñü]+)/g, (m, a, w, i) => (i > 0 && /^(de|del|la|las|el|los|y|o|a|en|con|para|por|al)$/.test(w) ? m : a + w.charAt(0).toUpperCase() + w.slice(1)));
  return low.charAt(0).toUpperCase() + low.slice(1);
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
export const WEEKDAY_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WD_ANY = new RegExp(`\\b(${WEEKDAYS.join('|')})\\b`);

// ─── Series y repeticiones ───

const UNIT = '(repeticiones|reps?|segundos|segs?|s|minutos?|mins?|metros|mts?|m)';
const SETW = '(?:series|serie|sets?|rondas?|rounds?|vueltas?|tandas?)';
const NUMR = '(\\d{1,3}(?:[.,]\\d+)?)';
const RX_FAIL = new RegExp(`(^|[^\\d.,])(\\d{1,2})(?:\\s*-\\s*(\\d{1,2}))?\\s*${SETW}\\s*(?:al|hasta el|hasta al)\\s*fallo(\\s*de\\s*tiempo)?`);
const RX_SR = new RegExp(`(^|[^\\d.,])(\\d{1,2})(?:\\s*-\\s*(\\d{1,2}))?\\s*${SETW}?\\s*(?:x|de)\\s*${NUMR}(?:\\s*(?:-|a)\\s*${NUMR})?\\s*${UNIT}?(?![a-z])`);
const RX_SETS = new RegExp(`(^|[^\\d.,])(\\d{1,2})(?:\\s*-\\s*(\\d{1,2}))?\\s*${SETW}(?![a-z])`);
const RX_X = new RegExp(`(^|[^a-z\\d])x\\s*(\\d{1,3})(?:\\s*-\\s*(\\d{1,3}))?\\s*${UNIT}?(?![a-z])`);
const RX_TIME = /(^|[^\d.,])(\d{1,3})\s*(segundos|segs?|s|minutos?|mins?)(?![a-z])/;

interface Scheme { start: number; end: number; sets: number; setsMax?: number; repMin: number | null; repMax: number | null; measure: Measure; amrap?: boolean; assumed?: boolean }

function measureOf(u: string | undefined): { measure: Measure; k: number } {
  if (!u) return { measure: 'reps', k: 1 };
  if (/^(segundos|segs?|s)$/.test(u)) return { measure: 'seg', k: 1 };
  if (/^(minutos?|mins?)$/.test(u)) return { measure: 'seg', k: 60 };
  if (/^(metros|mts?|m)$/.test(u)) return { measure: 'm', k: 1 };
  return { measure: 'reps', k: 1 };
}

/** Busca el esquema (series × reps) en el texto principal (sin lo de los paréntesis). */
function findScheme(f: string): Scheme | null {
  let m = RX_FAIL.exec(f);
  if (m) {
    const start = m.index + m[1].length;
    return { start, end: m.index + m[0].length, sets: Number(m[2]), ...(m[3] ? { setsMax: Number(m[3]) } : {}), repMin: null, repMax: null, measure: m[4] ? 'seg' : 'reps', amrap: true };
  }
  m = RX_SR.exec(f);
  if (m) {
    const { measure, k } = measureOf(m[6]);
    const a = num(m[4]) * k, b = m[5] ? num(m[5]) * k : a;
    return { start: m.index + m[1].length, end: m.index + m[0].length, sets: Number(m[2]), ...(m[3] ? { setsMax: Number(m[3]) } : {}), repMin: Math.round(Math.min(a, b)), repMax: Math.round(Math.max(a, b)), measure };
  }
  m = RX_SETS.exec(f);
  if (m) return { start: m.index + m[1].length, end: m.index + m[0].length, sets: Number(m[2]), ...(m[3] ? { setsMax: Number(m[3]) } : {}), repMin: null, repMax: null, measure: 'reps' };
  m = RX_X.exec(f);
  if (m) {
    const { measure, k } = measureOf(m[4]);
    const a = Number(m[2]) * k, b = m[3] ? Number(m[3]) * k : a;
    return { start: m.index + m[1].length, end: m.index + m[0].length, sets: 3, repMin: Math.min(a, b), repMax: Math.max(a, b), measure, assumed: true };
  }
  m = RX_TIME.exec(f);
  if (m) {
    const { k } = measureOf(m[3]);
    const v = Number(m[2]) * k;
    return { start: m.index + m[1].length, end: m.index + m[0].length, sets: 3, repMin: v, repMax: v, measure: 'seg', assumed: true };
  }
  return null;
}

// ─── Pesos y equipo nombrados ───

const RX_KG = /(\d{1,3}(?:[.,]\d{1,2})?)(?:\s*(?:-|a)\s*(\d{1,3}(?:[.,]\d{1,2})?))?\s*(kg|kilos?|lbs?|libras?)(?![a-z])/g;

function kgHints(f: string): KgHint[] {
  const out: KgHint[] = [];
  RX_KG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RX_KG.exec(f))) {
    const after = f.slice(m.index + m[0].length, m.index + m[0].length + 24);
    const before = f.slice(Math.max(0, m.index - 26), m.index);
    let ctx: HintCtx = null;
    if (/^\s*(?:de |en )?(?:ayuda|asistencia)/.test(after)) ctx = 'ayuda';
    else if (/^\s*(?:de )?lastre/.test(after) || /lastre\s*(?:de\s*)?$/.test(before)) ctx = 'lastre';
    else if (/^\s*(?:por|cada|en cada)\s+mancuerna/.test(after) || /mancuernas?(?: de cemento)?\s*(?:de|con)?\s*\(?\s*$/.test(before)) ctx = 'mancuerna';
    else if (/^\s*(?:en|de|con)\s+(?:la\s+)?barra/.test(after) || /barra\s*(?:con|de)\s*$/.test(before)) ctx = 'barra';
    else if (/^\s*(?:en|de)\s+(?:la\s+)?polea/.test(after) || /polea\s*(?:con|de)\s*$/.test(before)) ctx = 'polea';
    else if (/^\s*(?:en|de)\s+(?:la\s+)?maquina/.test(after) || /maquina\s*(?:con|de)\s*$/.test(before)) ctx = 'maquina';
    const a = num(m[1]), b = m[2] ? num(m[2]) : a;
    out.push({ min: Math.min(a, b), max: Math.max(a, b), unit: /^l/.test(m[3]) ? 'lb' : 'kg', ctx });
  }
  return out;
}

const EQ_WORDS: Array<[RegExp, Equip]> = [
  [/\bbarra (z|ez)\b/, 'ez'], [/\bsmith\b/, 'smith'], [/\bbarra\b|\bbarbell\b/, 'bb'], [/\bmancuernas?\b|\bdumbbells?\b/, 'db'],
  [/\bpoleas?\b|\bcable\b/, 'polea'], [/\bmaquina\b|\bmachine\b/, 'maq'], [/\bkettlebells?\b|\bpesa rusa\b/, 'kb'], [/\bbandas?\b|\belasticos?\b/, 'banda'],
];
/** El equipo que nombra el texto, en el orden en que aparece. */
function equipOf(f: string): Equip[] {
  return EQ_WORDS.map(([rx, eq]) => ({ eq, i: f.search(rx) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i).map((x) => x.eq)
    .filter((eq, i, arr) => arr.indexOf(eq) === i && !(eq === 'bb' && arr.includes('ez')));
}

// ─── Emparejar con el catálogo ───

/** Sinónimos (texto sin tildes, guiones como espacio) → ids candidatos, el primero es el de siempre. Lo específico antes. */
const SYN: Array<[RegExp, string[]]> = [
  // empuje
  [/\bpress (de )?banca inclinad[oa]\b|\bpress inclinado\b|\bincline (bench )?press\b/, ['press_incl', 'press_incl_db', 'press_incl_maq']],
  [/\bpress (de )?banca (agarre )?cerrad[oa]\b|\bpress cerrado\b|\bclose grip bench\b/, ['press_cerrado']],
  [/\bpress (de )?banca\b|\bpress plano\b|\bbench press\b|\bpress de pecho\b|\bchest press\b/, ['press_banca', 'press_banca_db', 'smith_banca', 'press_pecho_maq']],
  [/\bpress en (el )?suelo\b|\bfloor press\b/, ['press_suelo']],
  [/\bpress arnold\b|\barnold press\b/, ['press_arnold']],
  [/\bpress militar\b|\bmilitary press\b|\boverhead press\b|\bohp\b|\bpress (de )?hombros?\b|\bshoulder press\b/, ['press_mil', 'press_hombro_bb', 'press_hombro_maq']],
  [/\belevacion(es)? laterales?\b|\blateral raises?\b|\blaterales\b/, ['elev_lat', 'elev_lat_polea', 'elev_lat_maq']],
  [/\belevacion(es)? frontal(es)?\b|\bfront raises?\b/, ['elev_front']],
  [/\bfondos? (en|de) banco\b|\bbench dips?\b/, ['fondos_banco']],
  [/\bfondos? asistid\w*|\bassisted dips?\b/, ['fondos_asist']],
  [/\bfondos?\b|\bdips?\b|\bparalelas\b/, ['dips_ej', 'fondos_asist', 'fondos_banco']],
  [/\bflexiones? diamante\b|\bdiamond push ?ups?\b/, ['flex_diamante']],
  [/\bflexiones? declinadas?\b|\bdecline push ?ups?\b/, ['flex_decl']],
  [/\bflexiones? inclinadas?\b|\bincline push ?ups?\b/, ['flex_inclinadas']],
  [/\bflexiones? (de )?rodillas\b|\bknee push ?ups?\b/, ['flex_rodillas']],
  [/\barcher push ?ups?\b|\bflexiones? archer\b/, ['flex_archer']],
  [/\bpseudo planche\b/, ['pseudo_planche']],
  [/\bpike( push ?ups?)?\b/, ['pike']],
  [/\bhspu\b|\bhandstand push ?ups?\b|\bflexiones? (en|de) (pino|vertical)\b/, ['hspu']],
  [/\bflexiones?\b|\bpush ?ups?\b|\blagartijas?\b|\bpress ups?\b/, ['flexiones']],
  [/\bextension(es)? de triceps (en )?polea\b|\bpushdowns?\b|\bjalon de triceps\b/, ['ext_tri_polea']],
  [/\bpress frances\b|\bskull ?crushers?\b/, ['frances']],
  [/\bpatada de triceps\b|\bkickbacks?\b/, ['patada_tri']],
  [/\bextension(es)? de triceps\b|\btriceps extensions?\b/, ['ext_tri', 'ext_tri_polea', 'ext_tri_cabeza', 'ext_tri_maq']],
  [/\baperturas? inversas?\b|\bpajaros?\b|\breverse fl(y|ies)\b|\brear delt fl(y|ies)\b/, ['pajaro', 'pec_deck_inv']],
  [/\bpec deck\b|\bmariposa\b/, ['pec_deck']],
  [/\bcruces? de poleas?\b|\bcable (cross\w*|fl(y|ies))\b/, ['cruce_poleas']],
  [/\baperturas?\b|\bchest fl(y|ies)\b|\bflyes\b/, ['aperturas_db', 'pec_deck', 'cruce_poleas']],
  // tirón
  [/\bdominadas? asistidas?\b|\bassisted pull ?ups?\b/, ['dom_asist']],
  [/\bdominadas? con banda\b|\bband(ed)? pull ?ups?\b/, ['dom_banda']],
  [/\bdominadas? negativas?\b|\bnegative pull ?ups?\b/, ['dom_negativa']],
  [/\bdominadas? archer\b|\barcher pull ?ups?\b/, ['dom_archer']],
  [/\bdominadas? supinas?\b|\bchin ?ups?\b/, ['dom_supina']],
  [/\bdominadas? neutras?\b|\bneutral grip pull ?ups?\b/, ['dom_neutra']],
  [/\bdominadas?\b|\bpull ?ups?\b/, ['dom_prona', 'dom_asist', 'dom_banda']],
  [/\bjalon (al pecho )?(agarre )?(estrecho|neutro|cerrado)\b/, ['jalon_estrecho']],
  [/\bjalon\b|\blat pull ?downs?\b|\bpulldowns?\b/, ['jalon', 'jalon_estrecho']],
  [/\bremo invertido\b|\bring rows?\b|\binverted rows?\b|\bremo (en|con) anillas\b|\baustralian pull ?ups?\b|\bremo australiano\b/, ['remo_prono', 'remo_supino']],
  [/\bremo pendlay\b|\bpendlay( rows?)?\b|\bremo con barra\b|\bbarbell rows?\b|\bbent over rows?\b/, ['remo_bb']],
  [/\bremo sentado\b|\bseated (cable )?rows?\b|\bremo en polea\b|\bremo gironda\b|\bcable rows?\b/, ['remo_sentado']],
  [/\bremo con mancuernas?\b|\bdumbbell rows?\b|\bremo a una mano\b/, ['remo_db']],
  [/\bremo en t\b|\bt bar rows?\b/, ['remo_t']],
  [/\bremo (en )?maquina\b|\bmachine rows?\b/, ['remo_maq']],
  [/\bremo\b|\brows?\b/, ['remo_bb', 'remo_sentado', 'remo_db', 'remo_maq']],
  [/\bface ?pulls?\b/, ['facepull_polea', 'facepull']],
  [/\bpull ?overs?\b/, ['pullover_db', 'pullover_polea']],
  [/\bencogimientos?\b|\bshrugs?\b/, ['encogim', 'encogim_bb']],
  [/\bcurl martillo\b|\bhammer curls?\b/, ['curl_martillo']],
  [/\bcurl (de biceps )?inclinado\b|\bincline curls?\b/, ['curl_inclinado']],
  [/\bcurl concentrado\b|\bconcentration curls?\b/, ['curl_concentrado']],
  [/\bcurl (en )?(banco )?predicador\b|\bpreacher curls?\b/, ['curl_maq']],
  [/\bcurl (con )?barra (z|ez)\b|\bez (bar )?curls?\b/, ['curl_ez']],
  [/\bcurl femoral\b|\bleg curls?\b|\bhamstring curls?\b/, ['curl_fem']],
  [/\bcurl nordico\b|\bnordic( curls?)?\b/, ['nordic']],
  [/\bcurls?\b/, ['curl_supino', 'curl_bb', 'curl_ez', 'curl_polea', 'curl_maq']],
  // pierna
  [/\bsentadillas? bulgaras?\b|\bbulgaras?\b|\bbulgarian split squats?\b|\bsplit squats?\b/, ['bulgara']],
  [/\bsentadillas? frontal(es)?\b|\bfront squats?\b/, ['sentadilla_front']],
  [/\bsentadillas? hack\b|\bhack squats?\b/, ['hack']],
  [/\bsentadillas? goblet\b|\bgoblet( squats?)?\b/, ['goblet']],
  [/\bpistol( squats?)?\b|\bsentadillas? a una pierna\b/, ['pistol_ej']],
  [/\bwall sit\b|\bsentadillas? isometricas?\b|\bsilla (en la |contra la )?pared\b/, ['wallsit']],
  [/\bsentadillas? (en )?smith\b/, ['smith_sentadilla']],
  [/\bsentadillas? (con )?peso corporal\b|\bair squats?\b|\bsentadillas? libres?\b/, ['sentadilla_pc']],
  [/\bsentadillas?\b|\bsquats?\b/, ['sentadilla_bb', 'goblet', 'smith_sentadilla', 'sentadilla_pc']],
  [/\bpeso muerto rumano\b|\brdl\b|\bromanian deadlifts?\b|\bpeso muerto (con )?piernas? rigidas?\b/, ['rdl_bb', 'pmuerto']],
  [/\bpeso muerto\b|\bdeadlifts?\b/, ['peso_muerto', 'rdl_bb']],
  [/\bhip thrusts?\b|\bempuje de cadera\b/, ['hip_thrust_bb', 'hipthrust']],
  [/\bpuente (de )?gluteos? a una pierna\b|\bsingle leg glute bridges?\b/, ['puente_unipodal']],
  [/\bpuente (de )?gluteos?\b|\bglute bridges?\b/, ['hipthrust']],
  [/\bprensa horizontal\b/, ['prensa_h']],
  [/\bprensa\b|\bleg press\b/, ['prensa', 'prensa_h']],
  [/\bextension(es)? de cuadriceps\b|\bleg extensions?\b|\bsillon de cuadriceps\b/, ['ext_cuad']],
  [/\bzancadas?\b|\bestocadas?\b|\blunges?\b/, ['zancadas_ej']],
  [/\bsubidas? al cajon\b|\bstep ups?\b/, ['step_up']],
  [/\bgemelos? sentado\b|\bseated calf\b/, ['gemelos_sent']],
  [/\bgemelos?\b|\bpantorrillas?\b|\bcalf raises?\b/, ['gemelos_ej', 'gemelos_maq']],
  [/\babductor(es)?\b/, ['abductor']],
  [/\baductor(es)?\b/, ['aductor']],
  [/\bhiperextension(es)?\b|\bback extensions?\b|\bbanco romano\b/, ['hiperext']],
  // core
  [/\bplancha lateral\b|\bside planks?\b/, ['plancha_lat']],
  [/\bplancha\b|\bplanks?\b/, ['plancha_ej']],
  [/\bhollow( body)?( hold)?\b/, ['hollow']],
  [/\bl ?sit\b/, ['lsit_ej']],
  [/\bdragon flags?\b/, ['dragon']],
  [/\belevacion(es)? de piernas\b|\b(hanging )?leg raises?\b|\btoes to bar\b/, ['elev_piernas']],
  [/\belevacion(es)? de rodillas\b|\bknee raises?\b/, ['elev_rodillas']],
  [/\brueda abdominal\b|\bab wheel\b|\bab roller\b|\brueda\b/, ['rueda']],
  [/\bcrunch(es)? (en )?polea\b|\bcable crunch(es)?\b/, ['crunch_polea']],
  [/\bcrunch(es)?\b|\babdominales\b|\bsit ?ups?\b/, ['crunch', 'crunch_maq']],
  [/\bgiros? rusos?\b|\brussian twists?\b/, ['oblicuos_ej']],
  [/\bdead ?bugs?\b|\bbicho muerto\b/, ['dead_bug']],
  [/\bpallof\b/, ['pallof']],
  [/\blenador\b|\bwood ?chops?\b/, ['lenador']],
  [/\bsuperman\b/, ['superman']],
  [/\bescaladores?\b|\bmountain climbers?\b/, ['mountain']],
  // combate (fase I9: rounds de sombra, saco, patadas, rodillazos y escalera)
  [/\bshadow ?boxing\b|\bpelea de sombra\b|\bsombra\b/, ['sombra']],
  [/\blow kicks?\b|\bpatadas?( (medias|bajas|altas|circulares))? al saco\b|\bpatadas? (medias|bajas|circulares)\b|\bkicks? al saco\b/, ['patadas_saco']],
  [/\brodillazos?\b|\bknees? al saco\b/, ['rodillazos']],
  [/\bescalera( de agilidad)?\b|\bagility ladder\b/, ['escalera']],
  [/\bsaco( de boxeo)?\b|\bheavy bag\b|\bbolsa de boxeo\b/, ['saco']],
  // atlético y cardio
  [/\bbox jumps?\b|\bsaltos? al cajon\b|\bjump squats?\b|\bsaltos?\b|\bpliometria\b/, ['saltos']],
  [/\bburpees?\b/, ['burpees']],
  [/\bsprints?\b|\bpiques?\b/, ['sprint']],
  [/\bcomba\b|\bsaltar (la )?cuerda\b|\bjump rope\b/, ['cuerda']],
  [/\b(kettlebell|kb|pesa rusa) swings?\b|\bswings? (con )?(kettlebell|pesa rusa)\b/, ['kb_swing']],
  [/\bpaseo del granjero\b|\bfarmers? (walk|carry)\b/, ['farmer']],
  [/\bdead ?hang\b|\bcolgad[oa]s?\b|\bcolgarse\b|\bhangs?\b|\bhandgripper\b|\bgripper\b/, ['gripper']],
  [/\bequilibrio\b|\bbalance\b/, ['balance_ej']],
  [/\bmovilidad\b|\bestiramientos?\b|\bstretching\b/, ['movilidad']],
  [/\bcardio (zona 2|z2)\b|\bzona 2\b/, ['cardio_z2']],
  [/\btrotadora\b|\bcaminadora\b|\btreadmill\b|\btrotar\b|\bcorrer\b/, ['trotadora']],
  [/\bbicicleta\b|\bbici\b|\bspinning\b/, ['bici']],
  [/\beliptica\b/, ['eliptica']],
  [/\bescaladora\b|\bstair ?master\b/, ['escaladora']],
  [/\bremo ergometro\b|\bergometro\b|\browing machine\b/, ['remo_ergo']],
];

/** Lo que hace OTRA variante de un ejercicio del catálogo («ring dips» no son los fondos de siempre): se confirma. */
const VARIANTS: Array<{ rx: RegExp; also: RegExp; only?: Pattern[] }> = [
  { rx: /\b(anillas?|rings?|aros)\b/, also: /\banillas\b/, only: ['emp_h', 'emp_v'] },
  { rx: /\brto\b/, also: /\brto\b/ },
  { rx: /\bpliometric\w*|\bpalmadas?\b|\bclap\b|\bexplosiv\w*/, also: /\bpliometr/ },
  { rx: /\btoallas?\b|\btowel\b/, also: /\btoalla/ },
  { rx: /\bfalse grip\b|\bagarre falso\b/, also: /\bagarre falso\b/ },
  { rx: /\bdeficit\b/, also: /\bdeficit\b/ },
  { rx: /\btempo\b|\bpausa\b/, also: /\bpausa\b/ },
];
const STOP = new Set(['de', 'la', 'el', 'los', 'las', 'con', 'en', 'del', 'por', 'para', 'y', 'o', 'a', 'al', 'un', 'una', 'the', 'with', 'and', 'or']);
const tokens = (f: string): string[] => f.split(' ').filter((w) => w.length > 2 && !STOP.has(w));
/** «Anillas - Ring Dips», «Saco de Boxeo - Low Kicks»: lo de la izquierda es el equipo. */
const EQUIP_PREFIX = /^(anillas?|aros|saco( de boxeo)?|mancuernas?( de cemento)?|barra( casera)?|kettlebell|pesa rusa|bandas?|trx|poleas?|maquina|paralelas|caja|cajon|bal[oó]n( medicinal)?)$/;

function splitEquipPrefix(name: string): { equip: string | null; rest: string } {
  const parts = name.split(/\s+-\s+/);
  if (parts.length < 2) return { equip: null, rest: name.trim() };
  const left = withoutParens(parts[0]).trim();
  return EQUIP_PREFIX.test(foldMd(left)) ? { equip: parts[0].trim(), rest: parts.slice(1).join(' - ').trim() } : { equip: null, rest: name.trim() };
}

/** Elige entre candidatos según el equipo que nombra la rutina (o el primero, el de siempre). */
function byEquip(ids: string[], cat: Record<string, ForgeExercise>, equip: Equip[]): string[] {
  const ok = ids.filter((id) => cat[id]);
  for (const eq of equip) {
    const hit = ok.find((id) => cat[id].eq === eq);
    if (hit) return [hit, ...ok.filter((id) => id !== hit)];
  }
  return ok;
}

/** Empareja un nombre escrito con el catálogo. */
export function matchExercise(s: Pick<ForgeState, 'customExercises'>, rawName: string, equip: Equip[] = []): MdMatch {
  const cat = catalog(s);
  const { equip: prefix, rest } = splitEquipPrefix(stripDeco(rawName));
  const alts = withoutParens(rest).split(/\s+o\s+/i).map((x) => x.trim()).filter(Boolean);
  const main = foldMd(alts[0] ?? rest);
  const whole = foldMd(`${prefix ?? ''} ${rest}`);
  if (!main) return { exId: null, confidence: 'ninguno', options: [] };
  // 1) El nombre exacto (también tus ejercicios propios). Sin lo de los paréntesis, solo si el equipo que nombra calza:
  //    «Peso muerto rumano (barra)» no es el de mancuerna
  const full = foldMd(alts.length > 1 ? alts[0] : rest);
  const byName = Object.values(cat).find((e) => foldMd(e.name) === full)
    ?? Object.values(cat).find((e) => foldMd(withoutParens(e.name)) === main && (!equip.length || equip.includes(e.eq)));
  if (byName) return { exId: byName.id, confidence: 'exacto', options: [byName.id] };
  // 2) Sinónimos: el primero que calce, con la primera alternativa («Remo Pendlay o Seated Row»), después las otras y lo de los paréntesis
  const tries = [main, ...alts.slice(1).map(foldMd), ...parensOf(rest).map(foldMd)];
  const options: string[] = [];
  let found: string[] | null = null;
  for (const t of tries) {
    for (const [rx, ids] of SYN) {
      if (!rx.test(t)) continue;
      const ranked = byEquip(ids, cat, equip);
      if (!found && ranked.length) found = ranked;
      for (const id of ranked) if (!options.includes(id)) options.push(id);
      break;
    }
  }
  if (found) {
    const exId = found[0];
    const ex = cat[exId];
    const exName = foldMd(ex.name);
    const variant = VARIANTS.some((v) => v.rx.test(whole) && !v.also.test(exName) && (!v.only || v.only.includes(ex.pattern)));
    return { exId, confidence: variant ? 'probable' : 'exacto', options: options.slice(0, 4) };
  }
  // 3) Palabras en común con un nombre del catálogo (sin lo de los paréntesis: «Pino contra la pared» no es «HSPU contra pared»)
  const tk = tokens(main);
  if (tk.length >= 2) {
    const scored = Object.values(cat).map((e) => {
      const et = new Set(tokens(foldMd(withoutParens(e.name))));
      const hits = tk.filter((w) => et.has(w)).length;
      return { id: e.id, hits, score: hits / tk.length };
    }).filter((x) => x.hits >= 2 && x.score >= 0.6).sort((a, b) => b.score - a.score || b.hits - a.hits);
    if (scored.length) return { exId: scored[0].id, confidence: 'probable', options: scored.slice(0, 4).map((x) => x.id) };
  }
  return { exId: null, confidence: 'ninguno', options: [] };
}

// ─── Leer el texto ───

const BULLET = /^\s*(?:[-*•·+▪►]|\d{1,2}[.)])\s+/;
const HEADING = /^\s*(#{1,6})\s*(.*)$/;
const SEPARATOR = /^\s*(?:[-*_=]\s*){3,}$/;
const DAY_RX = /^(?:d[i]a|day)\s*([0-9]{1,2}|[a-g])(?=$|[\s:.)\-])\s*[:.)\-]*\s*(.*)$/;
const WD_HEAD = new RegExp(`^(${WEEKDAYS.join('|')})\\b\\s*(?:[:.)\\-]|$)\\s*(.*)$`);
const BLOCK_RX = /^(?:sesion|bloque|parte|circuito|tanda)\s*([a-z0-9]{1,2})?(?=$|[\s:.)\-])\s*[:.)\-]*\s*(.*)$/;
const PLACE_RX = /^(gym|gimnasio|casa|en casa|outdoor|al aire libre|exterior|parque)\b/;
const NOTES_HEAD = /^(notas?|reglas|como usarla|observaciones|consejos|indicaciones)\b/;
/** «## 🏠 Si no puedes ir al gimnasio» (la versión para la casa que agrega Eris), «Plan B»: alternativas, no más días */
const ALT_HEAD = /\b(si no puedes ir|version (de |para )?(la )?casa|alternativas?|plan b)\b/;
const LABEL_PREFIX = /^(core|calentamiento|cardio|finisher|accesorios?|movilidad|abdominales|abs|extra|enfriamiento|vuelta a la calma)\s*:\s*/;

/** La rutina del texto, con cada ejercicio emparejado (sin tocar el estado). */
export function parseRoutineMd(s: Pick<ForgeState, 'customExercises'>, md: string): MdRoutine {
  const rawLines = String(md ?? '').replace(/\r/g, '').split('\n');
  const folded = rawLines.map((l) => foldSame(stripDeco(l)).replace(/^#+\s*/, '').replace(BULLET, ''));
  // ¿Usa «Día 1/A» o días de la semana? Entonces «Sesión A» es un bloque del día; si no, cada sesión o título es un día.
  const hasDayWords = folded.some((f) => DAY_RX.test(f) || WD_HEAD.test(f));
  const out: MdRoutine = { title: null, rules: [], days: [] };
  // El estado de la lectura en un objeto (TypeScript no sigue lo que se asigna dentro de las funciones de abajo)
  const cur: { day: MdDay | null; block: string | null; inNotes: boolean; table: Record<string, number> | null } = { day: null, block: null, inNotes: false, table: null };
  const newDay = (label: string, rest: string, original: string) => {
    const wdM = foldSame(rest).match(WD_ANY) ?? foldSame(original).match(WD_ANY);
    const clean = rest.replace(/\(\s*(lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)\s*\)/i, '').replace(/^[\s:.\-—–]+|[\s:.\-—–]+$/g, '').trim();
    const d: MdDay = { id: String.fromCharCode(65 + out.days.length), label, name: prettyName(clean), ...(wdM ? { weekday: WEEKDAYS.indexOf(wdM[1]) } : {}), blocks: [], notes: [], lines: [] };
    out.days.push(d);
    cur.day = d; cur.block = null; cur.inNotes = false; cur.table = null;
  };
  const addItems = (text: string) => {
    if (!cur.day) newDay(String(out.days.length + 1), '', '');
    const d = cur.day!;
    for (const it of parseItemText(s, text)) {
      if ('warmup' in it) { d.warmup = it.warmup; continue; }
      d.lines.push({ ...it, key: `${out.days.indexOf(d)}-${d.lines.length}`, ...(cur.block ? { block: cur.block } : {}) });
    }
  };

  for (let i = 0; i < rawLines.length; i++) {
    const original = stripDeco(rawLines[i]);
    if (!original || SEPARATOR.test(original)) { cur.table = null; continue; }
    const head = original.match(HEADING);
    const isHeading = !!head;
    const isBullet = BULLET.test(original);
    const quote = /^>/.test(original);
    const text = (head ? head[2] : original.replace(BULLET, '').replace(/^>\s*/, '')).trim();
    if (!text) continue;
    const f = foldSame(text);
    if (isHeading && out.days.length && ALT_HEAD.test(f)) break; // lo que sigue es la alternativa, no más días
    const hasScheme = !!findScheme(blankParens(f));

    // Tablas: | Ejercicio | Series | Reps | RIR | Peso |
    if (/^\|.*\|\s*$/.test(text)) {
      const cells = text.replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c) || !c)) continue;
      const fc = cells.map((c) => foldMd(c));
      if (!cur.table && fc.some((c) => /^(ejercicios?|exercises?|movimientos?)$/.test(c))) {
        const cols: Record<string, number> = {};
        fc.forEach((c, k) => {
          if (/^(ejercicios?|exercises?|movimientos?)$/.test(c)) cols.name = k;
          else if (/^(series|sets?)$/.test(c)) cols.sets = k;
          else if (/^(reps|repeticiones|rep|tiempo)$/.test(c)) cols.reps = k;
          else if (/^(rir|rpe)$/.test(c)) cols[c] = k;
          else if (/^(peso|kg|carga)$/.test(c)) cols.kg = k;
          else if (/^(notas?|descanso|observaciones?)$/.test(c)) cols.note = k;
        });
        cur.table = cols;
        continue;
      }
      const c = cur.table;
      if (c && c.name != null) {
        const get = (k: string) => (c[k] != null ? (cells[c[k]] ?? '').trim() : '');
        const rir = get('rir'), rpe = get('rpe'), kg = get('kg'), note = get('note');
        const synth = `${get('name')}: ${get('sets') || '3'} series x ${get('reps') || ''}`.trim()
          + (rir ? ` RIR ${/fallo/i.test(rir) ? '0' : rir}` : '') + (rpe ? ` RPE ${rpe}` : '')
          + (kg && kg !== '—' && kg !== '-' ? ` (${kg})` : '') + (note ? ` (${note})` : '');
        addItems(synth);
      }
      continue;
    }
    cur.table = null;

    // Día: «Día 1», «Día A» (la letra en mayúscula o seguida de «:», para no confundir «día a día»), «Lunes: …»
    const dm = f.match(DAY_RX);
    const afterWord = text.replace(/^\s*(d[ií]a|day)\s*/i, '');
    const dayOk = !!dm && (/^\d/.test(dm[1]) || /^[A-G](?![a-záéíóúñ])/.test(afterWord) || /^[a-g]\s*[:.)\-—–]/.test(afterWord));
    if (dm && dayOk && !(isBullet && hasScheme)) { newDay(dm[1].toUpperCase(), text.slice(text.length - dm[2].length), original); continue; }
    const wm = f.match(WD_HEAD);
    if (wm && !hasScheme) { newDay(String(out.days.length + 1), text.slice(text.length - wm[2].length), original); continue; }
    if (!hasDayWords && (isHeading || (!isBullet && BLOCK_RX.test(f))) && !hasScheme) {
      if (NOTES_HEAD.test(f)) { cur.inNotes = true; continue; }
      if (isHeading && head![1].length === 1 && !out.title && !cur.day) { out.title = prettyName(text, true); continue; }
      const bm = f.match(BLOCK_RX);
      newDay(String(out.days.length + 1), bm && bm[2] ? text.slice(text.length - bm[2].length) : text, original);
      continue;
    }

    // Bloque dentro del día: «Sesión A: Gym (Fuerza Bruta)», «Casa:», un subtítulo
    if (cur.day && !isBullet && !quote && !hasScheme) {
      if (isHeading && NOTES_HEAD.test(f)) { cur.inNotes = true; continue; }
      const bm = f.match(BLOCK_RX);
      const place = PLACE_RX.test(f) && text.length <= 60;
      if (bm || place || isHeading) {
        const name = prettyName((bm && bm[2] ? text.slice(text.length - bm[2].length) : text).replace(/:\s*$/, '').trim());
        cur.block = name; cur.inNotes = false;
        cur.day.blocks.push(name);
        continue;
      }
    }
    if (isHeading && NOTES_HEAD.test(f)) { cur.inNotes = true; continue; }

    // Ejercicios: en listas, o en líneas sueltas dentro de un día (nunca en una cita «> …»)
    if (!cur.inNotes && !quote && (isBullet || cur.day)) {
      const scheme = findScheme(blankParens(f.replace(LABEL_PREFIX, (m) => ' '.repeat(m.length))));
      if ((scheme && (isBullet || !scheme.assumed)) || /^calentamiento\b/.test(f)) { addItems(text); continue; }
      // «- Dominadas» sin series: solo si es un ejercicio claro
      if (cur.day && isBullet && text.length <= 40 && matchExercise(s, text).confidence === 'exacto') { addItems(`${text}: 3 series`); continue; }
    }

    // Notas: antes del primer día son las reglas (o el título); dentro de un día, notas del día
    if (!cur.day) {
      if (!out.title && !isBullet && !quote && !/:\s*$/.test(text)) { out.title = prettyName(text, true); continue; }
      if (/:\s*$/.test(text) && !isBullet) continue;
      out.rules.push(text);
      continue;
    }
    if (/:\s*$/.test(text) && !isBullet) continue;
    if (cur.inNotes) { out.rules.push(text); continue; }
    cur.day.notes.push(text);
  }
  out.days = out.days.filter((d) => d.lines.length);
  out.days.forEach((d, k) => { d.id = String.fromCharCode(65 + k); d.lines.forEach((l, j) => { l.key = `${k}-${j}`; }); });
  return out;
}

type ParsedItem = Omit<MdLine, 'key'> | { warmup: string };

/** Una línea de ejercicio (o dos con «+»). */
function parseItemText(s: Pick<ForgeState, 'customExercises'>, text: string): ParsedItem[] {
  let t = stripDeco(text);
  const ft = foldSame(t);
  if (/^calentamiento\b/.test(ft)) return [{ warmup: t.replace(/^calentamiento\s*:?\s*/i, '').trim() }];
  const lp = ft.match(LABEL_PREFIX);
  if (lp) t = t.slice(lp[0].length);
  // «Ab Wheel 3x10 + Elevación de Piernas Colgado 3x12»: dos ejercicios si cada parte trae su esquema
  const parts = splitOutsideParens(t, /\s\+\s/);
  const list = parts.length > 1 && parts.every((p) => findScheme(blankParens(foldSame(p)))) ? parts : [t];
  const out: ParsedItem[] = [];
  for (const part of list) {
    const f = foldSame(part);
    const sc = findScheme(blankParens(f));
    if (!sc) continue;
    let name = part.slice(0, sc.start).replace(/[\s:,;.\-—–]+$/, '').trim();
    let rest = part.slice(sc.end);
    if (!name) { const after = rest.replace(/^[\s:,;.\-—–]+/, ''); name = after.split(/[.(]/)[0].trim(); rest = after.slice(name.length); }
    if (!name) continue;
    const whole = foldSame(part);
    const side = whole.match(/(?:\bpor\b|\bcada\b|\/)\s*(lado|brazo|pierna)s?\b/);
    // «(opcional)» en cualquier parte; «si tienes cajón…» solo en el nombre («si tienes lastre, úsalo» no lo hace opcional)
    const optional = /\bopcional\b/.test(whole) || /\bsi (tienes|puedes|hay|te da)\b/.test(foldSame(name));
    const rirM = whole.match(/\brir\s*(\d)(?:\s*-\s*(\d))?/);
    const rpeM = whole.match(/\brpe\s*(\d{1,2})(?:[.,]5)?(?:\s*-\s*(\d{1,2}))?/);
    // RIR 0–4 (más que eso no sirve para progresar: «RIR 9» nunca subiría de peso); RPE solo de 5 a 10
    const rpeOk = rpeM && Number(rpeM[1]) >= 5 && Number(rpeM[1]) <= 10;
    const rir = rirM ? Math.min(4, Number(rirM[2] ?? rirM[1])) : rpeOk ? Math.max(0, Math.min(4, 10 - Number(rpeM![1]))) : undefined;
    let note = rest.replace(/(?:\bpor\b|\bcada\b|\/)\s*(lado|brazo|pierna)s?\b/i, '').replace(/^[\s.,;:]+|[\s.,;:]+$/g, '').trim();
    if (/^\(.*\)$/.test(note) && !/\)\s*.*\(/.test(note)) note = note.slice(1, -1).trim();
    note = note.replace(/\s+/g, ' ');
    const nameParens = parensOf(name).join(' ');
    const equip = equipOf(foldSame(`${name} ${nameParens} ${rest}`));
    // «0x0» o «99999 reps»: sin número creíble se usa el rango del ejercicio
    const okReps = sc.repMax != null && sc.repMax > 0 && sc.repMax <= (sc.measure === 'reps' ? 100 : 3600);
    out.push({
      name, sets: Math.max(1, Math.min(10, sc.sets || 3)), ...(sc.setsMax ? { setsMax: Math.min(10, sc.setsMax) } : {}),
      repMin: okReps ? Math.max(1, sc.repMin ?? 1) : null, repMax: okReps ? sc.repMax : null, measure: sc.measure,
      ...(side ? { perSide: side[1] as Side } : {}), ...(sc.amrap ? { amrap: true } : {}), ...(optional ? { optional: true } : {}),
      ...(rir != null ? { rir } : {}), kg: kgHints(foldSame(part)), ...(note ? { note } : {}), equip, ...(sc.assumed ? { assumed: true } : {}),
      match: matchExercise(s, name, equip),
    });
  }
  return out;
}

function splitOutsideParens(t: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0, last = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '(') depth++;
    else if (t[i] === ')') depth = Math.max(0, depth - 1);
    else if (!depth) {
      const m = sep.exec(t.slice(i, i + 4));
      if (m && m.index === 0) { out.push(t.slice(last, i).trim()); last = i + m[0].length; i += m[0].length - 1; }
    }
  }
  out.push(t.slice(last).trim());
  return out.filter(Boolean);
}

// ─── Ejercicios propios ───

/** El nombre limpio de un ejercicio propio: «Anillas - Skin the Cat» → «Skin the Cat (anillas)». */
export function customName(raw: string): string {
  const { equip, rest } = splitEquipPrefix(stripDeco(raw));
  // la primera alternativa, sin lo de los paréntesis: «Shadowboxing con mancuernas (4-5 kg) o golpes…» → «Shadowboxing con mancuernas»
  const base = withoutParens(rest).split(/\s+o\s+/)[0].replace(/\s+/g, ' ').trim() || rest.trim();
  const eq = equip ? withoutParens(equip).toLowerCase() : null;
  return (eq ? `${base} (${eq})` : base).slice(0, 60);
}

/** Músculos, grupo y patrón de un ejercicio que no está en el catálogo, por palabras clave (se puede corregir después). */
export function guessMuscles(name: string): { group: ForgeExercise['group']; m: Partial<Record<SubId, number>>; pattern: Pattern } {
  const f = foldMd(name);
  if (/\b(kicks?|patadas?|rodillazos?|knees?)\b/.test(f)) return { group: 'atletico', m: { coordinacion: 2, cuadriceps: 1, oblicuos: 1 }, pattern: 'potencia' };
  if (/\b(shadow\w*|sombra|golpes?|punch\w*|jabs?|boxeo|combos?)\b/.test(f)) return { group: 'atletico', m: { coordinacion: 2, delt_ant: 1, oblicuos: 1 }, pattern: 'potencia' };
  if (/\b(handstand|pino|parada de manos|vertical)\b/.test(f)) return { group: 'empuje', m: { delt_ant: 2, triceps: 1, equilibrio: 1 }, pattern: 'emp_v' };
  if (/\b(mace|maza|clava|espada)\b/.test(f)) return { group: 'atletico', m: { delt_ant: 2, oblicuos: 1, antebrazo: 1 }, pattern: 'potencia' };
  if (/\b(wrist|muneca|levers?|palanca)\b/.test(f)) return { group: 'tiron', m: { antebrazo: 2 }, pattern: 'aislado' };
  if (/\b(hangs?|colgad\w*|false grip|agarre falso)\b/.test(f)) return { group: 'tiron', m: { antebrazo: 2, dorsal: 1 }, pattern: 'aislado' };
  if (/\b(skin the cat|piel de gato)\b/.test(f)) return { group: 'core_ej', m: { core_prof: 2, dorsal: 1, delt_post: 1 }, pattern: 'movilidad' };
  if (/\b(support|soporte|hold)\b/.test(f)) return { group: 'empuje', m: { triceps: 2, delt_ant: 1, core_prof: 1 }, pattern: 'emp_v' };
  if (/\b(flexion\w*|push\w*|press|dips?|fondos?)\b/.test(f)) return { group: 'empuje', m: { pec_med: 2, triceps: 1, delt_ant: 1 }, pattern: 'emp_h' };
  if (/\b(remo|rows?|dominad\w*|pull\w*|jalon|muscle up)\b/.test(f)) {
    const grip = /\b(toallas?|towel|agarre)\b/.test(f);
    return { group: 'tiron', m: grip ? { dorsal: 2, antebrazo: 1, biceps: 1 } : { dorsal: 2, biceps: 1 }, pattern: /\b(remo|rows?)\b/.test(f) ? 'tir_h' : 'tir_v' };
  }
  if (/\b(agarre|grip|toallas?|towel|antebrazo)\b/.test(f)) return { group: 'tiron', m: { antebrazo: 2, biceps: 1 }, pattern: 'aislado' };
  if (/\b(peso muerto|deadlift|bisagra|hip|gluteo)\b/.test(f)) return { group: 'pierna', m: { femoral: 2, lumbar: 1 }, pattern: 'bisagra' };
  if (/\b(sentadilla|squat|zancada|lunge|pierna|step)\b/.test(f)) return { group: 'pierna', m: { cuadriceps: 2, femoral: 1 }, pattern: 'sentadilla' };
  if (/\b(salto|jump|sprint|pliometr\w*|carrera)\b/.test(f)) return { group: 'atletico', m: { pliometria: 2, cuadriceps: 1 }, pattern: 'potencia' };
  if (/\b(core|abs|abdominal\w*|plancha|crunch|sit|leg raise|l sit)\b/.test(f)) return { group: 'core_ej', m: { abs: 2, core_prof: 1 }, pattern: 'core' };
  return { group: 'atletico', m: { coordinacion: 2, core_prof: 1 }, pattern: 'aislado' };
}

const slug = (t: string) => foldMd(t).replace(/\s+/g, '_').slice(0, 32);

/** El ejercicio propio que se crea desde una línea (mismo formato que los que crea Eris o la app). */
export function customFromLine(line: Pick<MdLine, 'name' | 'measure' | 'repMin' | 'repMax' | 'equip' | 'kg'>): any {
  const name = customName(line.name);
  const g = guessMuscles(`${line.name}`);
  const seg = line.measure === 'seg';
  const db = line.equip.includes('db') || line.equip.includes('kb') || /cemento/.test(foldMd(line.name));
  const reps = Math.max(1, Math.round(line.repMax ?? line.repMin ?? (seg ? 30 : 10)));
  return {
    id: `md_${slug(name)}`, name, group: g.group, m: g.m, pattern: g.pattern,
    load: db ? { db: true } : { bw: seg ? 0.35 : 0.6 }, reps, ...(seg ? { unit: 'seg' } : {}),
    eq: seg ? 'iso' : db ? 'db' : 'bw', range: [Math.max(1, Math.round(line.repMin ?? reps)), reps], level: 2,
    met: g.group === 'atletico' ? 8 : 6, min: 2.5, fromMd: true,
  };
}

// ─── De la revisión al plan ───

/** El peso de arranque que nombra la rutina para este ejercicio, al peso real del gimnasio (desde abajo). */
function startKg(s: ForgeState, ex: ForgeExercise, hints: KgHint[]): { kg: number; unit?: 'lb' } | null {
  if (!hints.length) return null;
  const want: HintCtx[] = ex.eq === 'db' || ex.eq === 'kb' ? ['mancuerna'] : ex.eq === 'bb' || ex.eq === 'ez' || ex.eq === 'smith' ? ['barra']
    : ex.eq === 'polea' ? ['polea', 'maquina'] : ex.eq === 'maq' || ex.eq === 'disc' ? ['maquina', 'polea'] : ex.eq === 'asist' ? ['ayuda'] : ex.eq === 'bw' && ex.weighted ? ['lastre'] : [];
  if (!want.length) return null;
  const h = hints.find((x) => want.includes(x.ctx)) ?? (hints.length === 1 && hints[0].ctx == null && ex.eq !== 'bw' && ex.eq !== 'asist' ? hints[0] : null);
  if (!h) return null;
  const p = pickerFor(ex, gymOf(s));
  if (p.kind === 'lastre' || p.kind === 'none' || p.kind === 'band' || !p.values.length) return { kg: h.min };
  const inUnit = p.unit === 'lb' && h.unit === 'kg' ? h.min / 0.45359237 : p.unit !== 'lb' && h.unit === 'lb' ? h.min * 0.45359237 : h.min;
  const sorted = [...p.values].sort((a, b) => a - b);
  const below = sorted.filter((v) => v <= inUnit + 1e-6).pop() ?? sorted[0];
  return { kg: below, ...(p.unit === 'lb' ? { unit: 'lb' as const } : {}) };
}

/** RIR por bloque desde las reglas: «Gym: … RPE 8-9» → los bloques del gimnasio van con RIR 2. */
function rulesRir(rules: string[]): Record<'gym' | 'casa', number | undefined> {
  const out: Record<'gym' | 'casa', number | undefined> = { gym: undefined, casa: undefined };
  for (const r of rules) {
    const f = foldSame(r);
    const where = /^(gym|gimnasio)\b/.test(f) ? 'gym' : /^(casa|en casa)\b/.test(f) ? 'casa' : null;
    if (!where) continue;
    const rpe = f.match(/\brpe\s*(\d{1,2})/), rir = f.match(/\brir\s*(\d)(?:\s*-\s*(\d))?/);
    if (rpe) out[where] = Math.max(0, Math.min(4, 10 - Number(rpe[1])));
    else if (rir) out[where] = Number(rir[2] ?? rir[1]);
  }
  return out;
}
const whereOf = (block: string | undefined): 'gym' | 'casa' | null => {
  const f = foldSame(block ?? '');
  return /\b(gym|gimnasio)\b/.test(f) ? 'gym' : /\b(casa|hogar|aire libre|outdoor|parque)\b/.test(f) ? 'casa' : null;
};

/**
 * Lo que se elige por defecto en cada línea: el emparejado (exacto o probable) o crear el propio. Un mismo ejercicio no puede
 * ir dos veces en un día (el plan de hoy tendría una sola fila): se lo queda la línea exacta (o la primera) y la otra variante
 * («Towel Pull-ups» junto a las dominadas lastradas) pasa a ser un ejercicio propio.
 */
export function defaultChoices(md: MdRoutine): Record<string, MdChoice> {
  const out: Record<string, MdChoice> = {};
  for (const d of md.days) {
    const owner = new Map<string, string>();
    for (const l of d.lines) {
      const id = l.match.exId;
      if (!id) continue;
      const prev = owner.get(id);
      const prevLine = prev ? d.lines.find((x) => x.key === prev) : null;
      if (!prevLine || (l.match.confidence === 'exacto' && prevLine.match.confidence !== 'exacto')) owner.set(id, l.key);
    }
    for (const l of d.lines) out[l.key] = l.match.exId && owner.get(l.match.exId) === l.key ? l.match.exId : 'propio';
  }
  return out;
}

/** La rutina (y los ejercicios propios que hay que crear) con lo decidido en la revisión. */
export function mdToRoutine(s: ForgeState, md: MdRoutine, choices: Record<string, MdChoice> = defaultChoices(md), opts: { name?: string; now?: Date } = {}): { routine: Routine; newExercises: any[] } {
  const now = opts.now ?? new Date();
  const known = catalog(s);
  const byName = new Map(Object.values(known).map((e) => [foldMd(e.name), e.id]));
  const created = new Map<string, any>();
  const rr = rulesRir(md.rules);
  const days: RoutineDay[] = [];
  for (const d of md.days) {
    const items: RoutineItem[] = [];
    const usedToday = new Set<string>();
    for (const l of d.lines) {
      const choice = choices[l.key] ?? l.match.exId ?? 'propio';
      if (choice === 'quitar') continue;
      let exId = choice;
      // un ejercicio va una sola vez por día: la segunda variante queda como propia
      if (choice === 'propio' || !known[choice] || usedToday.has(choice)) {
        const c = customFromLine(l);
        const existing = byName.get(foldMd(c.name));
        if (existing && !usedToday.has(existing)) exId = existing;
        else { if (!created.has(c.id)) created.set(c.id, c); exId = c.id; }
      }
      if (usedToday.has(exId)) continue;
      usedToday.add(exId);
      const isNew = !known[exId];
      const ex: ForgeExercise | undefined = known[exId] ?? (created.has(exId) ? (created.get(exId) as ForgeExercise) : undefined);
      const range = ex?.range ?? [8, 12];
      const where = whereOf(l.block);
      const rir = l.rir ?? (where ? rr[where] : undefined) ?? (l.amrap ? 0 : 2);
      // El peso que nombra la rutina: al peso real del gimnasio; en un ejercicio propio, tal cual («mancuerna de cemento (20 kg)»)
      const kg = ex ? (isNew ? ((ex.eq === 'db' && l.kg.find((h) => h.ctx === 'mancuerna' || h.ctx == null)) ? { kg: l.kg.find((h) => h.ctx === 'mancuerna' || h.ctx == null)!.min } : null) : startKg(s, ex, l.kg)) : null;
      const seg = l.measure === 'seg';
      items.push({
        exId, sets: Math.max(1, Math.min(10, l.sets)), repMin: l.repMin ?? range[0], repMax: l.repMax ?? range[1], rir,
        ...(kg ? { kg: kg.kg, ...((kg as { unit?: 'lb' }).unit ? { unit: 'lb' as const } : {}) } : {}),
        ...(l.note ? { note: l.note.slice(0, 160) } : {}),
        ...(ex && !isNew && foldMd(ex.name) !== foldMd(l.name) ? { label: stripDeco(l.name).slice(0, 60) } : {}),
        ...(l.measure === 'm' ? { measure: 'm' as const } : seg ? { measure: 'seg' as const } : {}),
        ...(l.perSide ? { perSide: l.perSide } : {}), ...(l.amrap ? { amrap: true } : {}), ...(l.optional ? { optional: true } : {}),
        ...(l.block ? { block: l.block } : {}),
      });
    }
    if (!items.length) continue;
    const focus = d.blocks.length ? d.blocks.join(' · ') : d.name;
    const dayName = d.name && !/^d[ií]a\b/i.test(d.name) ? `Día ${d.label} — ${d.name}` : d.name || `Día ${d.label}`;
    days.push({
      id: String.fromCharCode(65 + days.length), name: dayName.slice(0, 60), focus: focus.slice(0, 80), items,
      ...(d.weekday != null ? { weekday: d.weekday } : {}), ...(d.warmup ? { warmup: d.warmup.slice(0, 160) } : {}),
      ...(d.notes.length ? { notes: d.notes.map((n) => n.slice(0, 160)).slice(0, 4) } : {}),
    });
  }
  const allText = foldSame(`${md.title ?? ''} ${md.rules.join(' ')}`);
  const gym = days.some((d) => d.items.some((i) => whereOf(i.block) === 'gym')) || /\b(gym|gimnasio)\b/.test(allText);
  const routine: Routine = {
    id: `md${now.getTime()}`, name: (md.title ?? opts.name ?? 'Mi rutina').slice(0, 60), goal: /\bfuerza\b/.test(allText) ? 'fuerza' : 'hipertrofia',
    daysPerWeek: days.length, minutes: 60, split: 'propia', where: gym ? 'gym' : 'casa', days, notes: md.rules.slice(0, 8).map((r) => r.slice(0, 200)),
    createdAt: now.toISOString(), source: 'md',
  };
  return { routine, newExercises: [...created.values()] };
}

/** Agrega ejercicios propios sin duplicar (por id ni por nombre). */
export function mergeCustom(s: ForgeState, newExercises: any[]): ForgeState {
  const custom = [...(s.customExercises || [])];
  for (const c of Array.isArray(newExercises) ? newExercises : []) {
    if (!c?.id || !c?.name || typeof c.id !== 'string') continue;
    if (custom.some((x: any) => x?.id === c.id || foldMd(x?.name ?? '') === foldMd(String(c.name)))) continue;
    custom.push(c);
  }
  return custom.length === (s.customExercises || []).length ? s : { ...s, customExercises: custom };
}

/** Guarda el plan: crea los ejercicios propios y deja la rutina cargada. */
export function applyMdRoutine(s: ForgeState, routine: Routine, newExercises: any[]): ForgeState {
  return setRoutinePlan(mergeCustom(s, newExercises), routine);
}

/** Resumen para la revisión y el chat. */
export function mdSummary(md: MdRoutine, choices: Record<string, MdChoice> = defaultChoices(md)): { days: number; lines: number; exactos: number; probables: number; propios: number; quitados: number } {
  let lines = 0, exactos = 0, probables = 0, propios = 0, quitados = 0;
  for (const d of md.days) for (const l of d.lines) {
    lines++;
    const c = choices[l.key] ?? l.match.exId ?? 'propio';
    if (c === 'quitar') quitados++;
    else if (c === 'propio') propios++;
    else if (c === l.match.exId && l.match.confidence === 'probable') probables++;
    else exactos++;
  }
  return { days: md.days.length, lines, exactos, probables, propios, quitados };
}

/** «4×6–8», «3×45 s», «6×30 m», «3 al fallo», «3×8–10 por brazo». */
export function lineScheme(l: Pick<MdLine, 'sets' | 'setsMax' | 'repMin' | 'repMax' | 'measure' | 'perSide' | 'amrap'>): string {
  const sets = l.setsMax ? `${l.sets}–${l.setsMax}` : `${l.sets}`;
  const u = l.measure === 'seg' ? ' s' : l.measure === 'm' ? ' m' : '';
  if (l.amrap) return `${sets} al fallo${l.measure === 'seg' ? ' (tiempo)' : ''}`;
  if (l.repMin == null) return `${sets} series`;
  const reps = l.repMin === l.repMax ? `${l.repMin}` : `${l.repMin}–${l.repMax}`;
  return `${sets}×${reps}${u}${l.perSide ? ` por ${l.perSide}` : ''}`;
}


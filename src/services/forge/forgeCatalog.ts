// ============================================================
// Eris Mobile — Forge 2.0: catálogo de ejercicios, equipos y «Mi gimnasio» (F1, 2026-10-17)
//
// Sin imports: se copia tal cual al servidor (eris/src/services/forge/, scripts/sync_forge_core.ts) para que el chat
// (TrainingPlanTool) conozca el mismo catálogo y valide los ids.
//
// - Los 48 ejercicios de siempre (forgeLegacy.EX_GROUPS) mantienen su id, músculos y carga: el RPG los cuenta igual.
//   Acá solo se les agrega lo nuevo (equipo, patrón, rango de reps, alternativas, cuidados).
// - Los nuevos (máquinas, barras, poleas, asistidos, cardio) llevan además su forma «legacy» (m, load, reps) para que
//   el RPG (XP, músculos) los cuente con las mismas fórmulas.
// - Pesos con sentido: cada equipo da SOLO los pesos que existen en tu gimnasio (mancuernas de 7 kg, no de 7,5 si no
//   hay), con la unidad de cada máquina (kg o lb) y su escalón.
// - Los asistidos llevan la asistencia aparte (nunca pesos negativos): carga efectiva = peso corporal − asistencia.
// ============================================================

export type SubId =
  | 'delt_ant' | 'delt_lat' | 'delt_post' | 'pec_sup' | 'pec_med' | 'dorsal' | 'trapecio' | 'lumbar'
  | 'biceps' | 'triceps' | 'antebrazo' | 'abs' | 'oblicuos' | 'core_prof' | 'cuadriceps' | 'femoral' | 'gemelos'
  | 'pliometria' | 'reactividad' | 'equilibrio' | 'aereo' | 'coordinacion';

/** Equipo: define qué pesos se pueden elegir y cómo se calcula la carga efectiva. */
export type Equip =
  | 'bw'      // peso corporal (admite lastre)
  | 'asist'   // peso corporal con asistencia de máquina (contrapeso)
  | 'banda'   // peso corporal con asistencia de banda (niveles)
  | 'db'      // mancuernas (el peso es de UNA)
  | 'bb'      // barra olímpica + discos (el peso es el total)
  | 'ez'      // barra Z + discos
  | 'smith'   // máquina Smith (barra guiada) + discos
  | 'maq'     // máquina de placas (selector con pasador)
  | 'disc'    // máquina de discos (se cargan discos)
  | 'polea'   // polea (placas)
  | 'kb'      // kettlebell
  | 'iso'     // isométrico (tiempo)
  | 'cardio'; // máquina de cardio (minutos)

export type Pattern =
  | 'emp_h' | 'emp_v' | 'tir_h' | 'tir_v' | 'sentadilla' | 'bisagra' | 'zancada' | 'core' | 'acarreo'
  | 'aislado' | 'potencia' | 'cardio' | 'movilidad';

export type Care = 'lumbar' | 'hombro' | 'rodilla' | 'muneca' | 'codo';

/** Levantamientos con estándares de fuerza (F4). */
export type StdLift = 'bench' | 'squat' | 'deadlift' | 'ohp' | 'row' | 'pullup' | 'dip' | 'curl' | 'legpress' | 'db_bench' | 'db_press' | 'db_curl' | 'pushup' | 'lat_pd';

/** Máquinas que se configuran en «Mi gimnasio» (unidad y escalón de cada una). */
export type MachineId =
  | 'press_pecho' | 'press_incl' | 'pec_deck' | 'press_hombro' | 'elev_lat' | 'jalon' | 'remo_polea' | 'remo_maq'
  | 'polea' | 'asistida' | 'ext_cuad' | 'curl_fem' | 'prensa_h' | 'gemelos' | 'abductor' | 'aductor' | 'crunch'
  | 'curl_maq' | 'ext_tri' | 'prensa' | 'hack' | 'remo_t' | 'gemelos_sent' | 'otra';

export interface ForgeExercise {
  id: string;
  name: string;
  group: 'empuje' | 'tiron' | 'pierna' | 'core_ej' | 'atletico';
  /** músculos con puntos (2 = principal, 1 = secundario), los mismos 22 subgrupos del RPG */
  m: Partial<Record<SubId, number>>;
  /** forma «legacy» de la carga (para el RPG): % del peso corporal o un peso aparte */
  load: { bw?: number; db?: boolean };
  /** reps por defecto (o segundos/minutos según unit) */
  reps: number;
  unit?: 'seg' | 'min';
  grip?: string;
  eq: Equip;
  pattern: Pattern;
  /** rango de reps sugerido */
  range: [number, number];
  /** dificultad técnica 1–3 */
  level: 1 | 2 | 3;
  /** % del peso corporal que se mueve (peso corporal, asistidos y bandas) */
  bw?: number;
  machine?: MachineId;
  /** multiarticular grande (gasta más: +0,5 MET) */
  big?: boolean;
  /** se hace con dos mancuernas a la vez (el volumen cuenta las dos) */
  pair?: boolean;
  /** admite lastre (cinturón, mochila, mancuerna entre las piernas) */
  weighted?: boolean;
  alt?: string[];
  care?: Care[];
  std?: StdLift;
  /** se puede en casa */
  home?: boolean;
  /** escala de la carga para el RPG (prensas de trineo mueven mucho más que una sentadilla) */
  rpgK?: number;
  /** ejercicio nuevo de Forge 2.0 (no estaba en el HTML) */
  isNew?: boolean;
}

// ─── Lo nuevo de los 48 de siempre (por id; los datos del RPG vienen de forgeLegacy.EX_GROUPS) ───
type Extra = Pick<ForgeExercise, 'eq' | 'pattern' | 'range' | 'level'> & Partial<ForgeExercise>;
export const LEGACY_EXTRA: Record<string, Extra> = {
  flexiones: { eq: 'bw', pattern: 'emp_h', range: [8, 20], level: 1, weighted: true, home: true, std: 'pushup', alt: ['flex_inclinadas', 'press_pecho_maq', 'press_banca_db'], care: ['muneca'] },
  flex_diamante: { eq: 'bw', pattern: 'emp_h', range: [6, 15], level: 2, home: true, alt: ['flexiones', 'ext_tri_polea'], care: ['muneca', 'codo'] },
  flex_decl: { eq: 'bw', pattern: 'emp_h', range: [6, 15], level: 2, home: true, alt: ['press_incl_db', 'flexiones'] },
  flex_archer: { eq: 'bw', pattern: 'emp_h', range: [4, 10], level: 3, home: true, alt: ['flexiones', 'press_banca_db'] },
  dips_ej: { eq: 'bw', pattern: 'emp_v', range: [5, 12], level: 2, big: true, weighted: true, std: 'dip', alt: ['fondos_asist', 'fondos_banco', 'press_cerrado'], care: ['hombro'] },
  pike: { eq: 'bw', pattern: 'emp_v', range: [5, 12], level: 2, home: true, alt: ['press_mil', 'press_hombro_maq'], care: ['hombro', 'muneca'] },
  pseudo_planche: { eq: 'bw', pattern: 'emp_h', range: [4, 10], level: 3, home: true, alt: ['flexiones'], care: ['muneca', 'hombro'] },
  hspu: { eq: 'bw', pattern: 'emp_v', range: [3, 8], level: 3, home: true, alt: ['pike', 'press_mil'], care: ['hombro', 'muneca'] },
  press_mil: { eq: 'db', pattern: 'emp_v', range: [6, 12], level: 1, pair: true, home: true, std: 'db_press', alt: ['press_hombro_maq', 'press_hombro_bb', 'pike'], care: ['hombro'] },
  elev_lat: { eq: 'db', pattern: 'aislado', range: [10, 20], level: 1, pair: true, home: true, alt: ['elev_lat_polea', 'elev_lat_maq'], care: ['hombro'] },
  ext_tri: { eq: 'db', pattern: 'aislado', range: [8, 15], level: 1, home: true, alt: ['ext_tri_polea', 'frances'], care: ['codo'] },
  dom_prona: { eq: 'bw', pattern: 'tir_v', range: [3, 12], level: 2, big: true, weighted: true, std: 'pullup', alt: ['dom_asist', 'dom_banda', 'jalon'] },
  dom_supina: { eq: 'bw', pattern: 'tir_v', range: [3, 12], level: 2, big: true, weighted: true, std: 'pullup', alt: ['dom_asist', 'jalon_estrecho'] },
  dom_neutra: { eq: 'bw', pattern: 'tir_v', range: [3, 12], level: 2, big: true, weighted: true, std: 'pullup', alt: ['dom_asist', 'jalon_estrecho'] },
  dom_archer: { eq: 'bw', pattern: 'tir_v', range: [2, 8], level: 3, alt: ['dom_prona'] },
  remo_prono: { eq: 'bw', pattern: 'tir_h', range: [8, 15], level: 1, home: true, alt: ['remo_sentado', 'remo_db'] },
  remo_supino: { eq: 'bw', pattern: 'tir_h', range: [8, 15], level: 1, home: true, alt: ['remo_sentado', 'remo_db'] },
  remo_db: { eq: 'db', pattern: 'tir_h', range: [6, 12], level: 1, home: true, alt: ['remo_maq', 'remo_sentado', 'remo_bb'] },
  curl_supino: { eq: 'db', pattern: 'aislado', range: [8, 15], level: 1, pair: true, home: true, std: 'db_curl', alt: ['curl_bb', 'curl_polea'], care: ['codo'] },
  curl_martillo: { eq: 'db', pattern: 'aislado', range: [8, 15], level: 1, pair: true, home: true, alt: ['curl_polea'], care: ['codo'] },
  facepull: { eq: 'bw', pattern: 'aislado', range: [12, 20], level: 1, home: true, alt: ['facepull_polea', 'pajaro'] },
  encogim: { eq: 'db', pattern: 'aislado', range: [10, 20], level: 1, pair: true, home: true, alt: ['encogim_bb'] },
  gripper: { eq: 'iso', pattern: 'aislado', range: [20, 60], level: 1, home: true, alt: ['farmer'] },
  sentadilla_pc: { eq: 'bw', pattern: 'sentadilla', range: [12, 30], level: 1, home: true, alt: ['goblet', 'prensa'], care: ['rodilla'] },
  goblet: { eq: 'db', pattern: 'sentadilla', range: [8, 15], level: 1, home: true, alt: ['sentadilla_bb', 'prensa', 'hack'], care: ['rodilla'] },
  bulgara: { eq: 'db', pattern: 'zancada', range: [6, 12], level: 2, pair: true, home: true, alt: ['zancadas_ej', 'step_up', 'prensa'], care: ['rodilla'] },
  pmuerto: { eq: 'db', pattern: 'bisagra', range: [6, 12], level: 2, pair: true, home: true, big: true, alt: ['rdl_bb', 'curl_fem', 'hiperext'], care: ['lumbar'] },
  zancadas_ej: { eq: 'db', pattern: 'zancada', range: [8, 14], level: 1, pair: true, home: true, alt: ['bulgara', 'step_up'], care: ['rodilla'] },
  pistol_ej: { eq: 'bw', pattern: 'sentadilla', range: [3, 8], level: 3, home: true, alt: ['bulgara', 'step_up'], care: ['rodilla'] },
  hipthrust: { eq: 'db', pattern: 'bisagra', range: [8, 15], level: 1, home: true, alt: ['hip_thrust_bb', 'puente_unipodal'] },
  gemelos_ej: { eq: 'bw', pattern: 'aislado', range: [12, 25], level: 1, home: true, weighted: true, alt: ['gemelos_maq', 'gemelos_sent'] },
  wallsit: { eq: 'iso', pattern: 'sentadilla', range: [30, 90], level: 1, home: true, alt: ['sentadilla_pc'], care: ['rodilla'] },
  plancha_ej: { eq: 'iso', pattern: 'core', range: [20, 90], level: 1, home: true, alt: ['plancha_lat', 'dead_bug'] },
  hollow: { eq: 'iso', pattern: 'core', range: [15, 60], level: 2, home: true, alt: ['plancha_ej', 'dead_bug'] },
  lsit_ej: { eq: 'iso', pattern: 'core', range: [5, 30], level: 3, alt: ['elev_rodillas'] },
  elev_piernas: { eq: 'bw', pattern: 'core', range: [6, 15], level: 2, alt: ['elev_rodillas', 'crunch_polea'] },
  crunch: { eq: 'bw', pattern: 'core', range: [12, 25], level: 1, home: true, alt: ['crunch_polea', 'crunch_maq'] },
  rueda: { eq: 'bw', pattern: 'core', range: [5, 15], level: 2, home: true, alt: ['plancha_ej'], care: ['lumbar'] },
  oblicuos_ej: { eq: 'bw', pattern: 'core', range: [12, 30], level: 1, home: true, alt: ['lenador', 'pallof'] },
  superman: { eq: 'bw', pattern: 'core', range: [10, 20], level: 1, home: true, alt: ['hiperext'] },
  dragon: { eq: 'bw', pattern: 'core', range: [3, 8], level: 3, alt: ['elev_piernas'], care: ['lumbar'] },
  saltos: { eq: 'bw', pattern: 'potencia', range: [6, 12], level: 2, home: true, alt: ['kb_swing'], care: ['rodilla'] },
  burpees: { eq: 'bw', pattern: 'potencia', range: [8, 20], level: 1, home: true },
  sprint: { eq: 'iso', pattern: 'cardio', range: [10, 40], level: 2 },
  cuerda: { eq: 'iso', pattern: 'cardio', range: [30, 180], level: 1, home: true },
  balance_ej: { eq: 'iso', pattern: 'movilidad', range: [20, 60], level: 1, home: true },
  cardio_z2: { eq: 'cardio', pattern: 'cardio', range: [20, 60], level: 1, home: true, alt: ['trotadora', 'bici', 'eliptica'] },
  movilidad: { eq: 'iso', pattern: 'movilidad', range: [5, 20], level: 1, home: true },
};

// ─── Ejercicios nuevos (gimnasio y casa) ───
const N = (id: string, name: string, group: ForgeExercise['group'], eq: Equip, pattern: Pattern, m: ForgeExercise['m'], range: [number, number], level: 1 | 2 | 3, extra: Partial<ForgeExercise> = {}): ForgeExercise => {
  const reps = extra.reps ?? Math.round((range[0] + range[1]) / 2);
  const bwShare = extra.bw;
  // Forma «legacy» para el RPG: peso corporal puro → % del cuerpo; todo lo demás → un peso aparte (el último usado)
  const load = eq === 'bw' && bwShare != null ? { bw: bwShare } : eq === 'iso' || eq === 'cardio' ? { bw: bwShare ?? 0.4 } : { db: true };
  return { id, name, group, m, load, reps, eq, pattern, range, level, isNew: true, ...(eq === 'iso' ? { unit: 'seg' as const } : eq === 'cardio' ? { unit: 'min' as const } : {}), ...extra };
};

export const NEW_EXERCISES: ForgeExercise[] = [
  // Empuje
  N('press_banca', 'Press de banca (barra)', 'empuje', 'bb', 'emp_h', { pec_med: 2, triceps: 1, delt_ant: 1 }, [5, 10], 2, { big: true, std: 'bench', care: ['hombro'], alt: ['press_banca_db', 'press_pecho_maq', 'smith_banca'] }),
  N('press_banca_db', 'Press de banca con mancuernas', 'empuje', 'db', 'emp_h', { pec_med: 2, triceps: 1, delt_ant: 1 }, [6, 12], 1, { pair: true, std: 'db_bench', care: ['hombro'], alt: ['press_banca', 'press_pecho_maq'] }),
  N('press_incl', 'Press inclinado (barra)', 'empuje', 'bb', 'emp_h', { pec_sup: 2, delt_ant: 1, triceps: 1 }, [6, 10], 2, { big: true, care: ['hombro'], alt: ['press_incl_db', 'press_incl_maq'] }),
  N('press_incl_db', 'Press inclinado con mancuernas', 'empuje', 'db', 'emp_h', { pec_sup: 2, delt_ant: 1, triceps: 1 }, [6, 12], 1, { pair: true, care: ['hombro'], alt: ['press_incl', 'press_incl_maq'] }),
  N('press_pecho_maq', 'Press de pecho en máquina', 'empuje', 'maq', 'emp_h', { pec_med: 2, triceps: 1, delt_ant: 1 }, [8, 12], 1, { machine: 'press_pecho', alt: ['press_banca_db', 'flexiones'] }),
  N('press_incl_maq', 'Press inclinado en máquina', 'empuje', 'maq', 'emp_h', { pec_sup: 2, delt_ant: 1, triceps: 1 }, [8, 12], 1, { machine: 'press_incl', alt: ['press_incl_db'] }),
  N('smith_banca', 'Press de banca en Smith', 'empuje', 'smith', 'emp_h', { pec_med: 2, triceps: 1, delt_ant: 1 }, [6, 12], 1, { care: ['hombro'], alt: ['press_banca', 'press_pecho_maq'] }),
  N('pec_deck', 'Pec deck (aperturas en máquina)', 'empuje', 'maq', 'aislado', { pec_med: 2, delt_ant: 1 }, [10, 15], 1, { machine: 'pec_deck', alt: ['aperturas_db', 'cruce_poleas'], care: ['hombro'] }),
  N('aperturas_db', 'Aperturas con mancuernas', 'empuje', 'db', 'aislado', { pec_med: 2, delt_ant: 1 }, [10, 15], 1, { pair: true, care: ['hombro'], alt: ['pec_deck', 'cruce_poleas'] }),
  N('cruce_poleas', 'Cruce de poleas', 'empuje', 'polea', 'aislado', { pec_med: 2, pec_sup: 1 }, [10, 15], 1, { machine: 'polea', alt: ['pec_deck', 'aperturas_db'] }),
  N('press_suelo', 'Press en el suelo con mancuernas', 'empuje', 'db', 'emp_h', { pec_med: 2, triceps: 1 }, [8, 12], 1, { pair: true, home: true, alt: ['press_banca_db', 'flexiones'] }),
  N('flex_inclinadas', 'Flexiones inclinadas (manos en banco)', 'empuje', 'bw', 'emp_h', { pec_med: 2, triceps: 1, delt_ant: 1 }, [8, 20], 1, { bw: 0.5, home: true, alt: ['flexiones', 'press_pecho_maq'], care: ['muneca'] }),
  N('flex_rodillas', 'Flexiones de rodillas', 'empuje', 'bw', 'emp_h', { pec_med: 2, triceps: 1, delt_ant: 1 }, [8, 20], 1, { bw: 0.49, home: true, alt: ['flex_inclinadas', 'flexiones'], care: ['muneca'] }),
  N('fondos_asist', 'Fondos asistidos (máquina)', 'empuje', 'asist', 'emp_v', { pec_med: 2, triceps: 2 }, [6, 12], 1, { bw: 0.95, machine: 'asistida', std: 'dip', care: ['hombro'], alt: ['dips_ej', 'fondos_banco', 'press_cerrado'] }),
  N('fondos_banco', 'Fondos en banco', 'empuje', 'bw', 'emp_v', { triceps: 2, pec_med: 1, delt_ant: 1 }, [8, 15], 1, { bw: 0.6, home: true, care: ['hombro'], alt: ['ext_tri_polea', 'dips_ej'] }),
  N('press_hombro_bb', 'Press militar con barra (de pie)', 'empuje', 'bb', 'emp_v', { delt_ant: 2, delt_lat: 1, triceps: 1 }, [5, 10], 2, { big: true, std: 'ohp', care: ['hombro', 'lumbar'], alt: ['press_mil', 'press_hombro_maq'] }),
  N('press_hombro_maq', 'Press de hombros en máquina', 'empuje', 'maq', 'emp_v', { delt_ant: 2, delt_lat: 1, triceps: 1 }, [8, 12], 1, { machine: 'press_hombro', alt: ['press_mil', 'press_hombro_bb'] }),
  N('press_arnold', 'Press Arnold', 'empuje', 'db', 'emp_v', { delt_ant: 2, delt_lat: 1, triceps: 1 }, [8, 12], 2, { pair: true, care: ['hombro'], alt: ['press_mil'] }),
  N('elev_lat_polea', 'Elevación lateral en polea', 'empuje', 'polea', 'aislado', { delt_lat: 2 }, [10, 20], 1, { machine: 'polea', alt: ['elev_lat', 'elev_lat_maq'] }),
  N('elev_lat_maq', 'Elevación lateral en máquina', 'empuje', 'maq', 'aislado', { delt_lat: 2 }, [10, 20], 1, { machine: 'elev_lat', alt: ['elev_lat', 'elev_lat_polea'] }),
  N('elev_front', 'Elevación frontal', 'empuje', 'db', 'aislado', { delt_ant: 2 }, [10, 15], 1, { pair: true, home: true, alt: ['press_mil'] }),
  N('ext_tri_polea', 'Extensión de tríceps en polea (pushdown)', 'empuje', 'polea', 'aislado', { triceps: 2 }, [10, 15], 1, { machine: 'polea', alt: ['ext_tri', 'frances', 'fondos_banco'], care: ['codo'] }),
  N('ext_tri_cabeza', 'Extensión de tríceps sobre la cabeza (polea)', 'empuje', 'polea', 'aislado', { triceps: 2 }, [10, 15], 1, { machine: 'polea', alt: ['ext_tri', 'frances'], care: ['codo', 'hombro'] }),
  N('frances', 'Press francés (barra Z)', 'empuje', 'ez', 'aislado', { triceps: 2 }, [8, 12], 2, { care: ['codo'], alt: ['ext_tri_polea', 'ext_tri'] }),
  N('patada_tri', 'Patada de tríceps', 'empuje', 'db', 'aislado', { triceps: 2 }, [10, 15], 1, { home: true, alt: ['ext_tri_polea', 'ext_tri'] }),
  N('ext_tri_maq', 'Extensión de tríceps en máquina', 'empuje', 'maq', 'aislado', { triceps: 2 }, [10, 15], 1, { machine: 'ext_tri', alt: ['ext_tri_polea'] }),
  N('press_cerrado', 'Press de banca agarre cerrado', 'empuje', 'bb', 'emp_h', { triceps: 2, pec_med: 1, delt_ant: 1 }, [6, 10], 2, { big: true, care: ['codo', 'hombro'], alt: ['dips_ej', 'flex_diamante'] }),
  // Tirón
  N('dom_asist', 'Dominada asistida (máquina)', 'tiron', 'asist', 'tir_v', { dorsal: 2, biceps: 1, antebrazo: 1 }, [6, 12], 1, { bw: 1, machine: 'asistida', std: 'pullup', alt: ['dom_banda', 'jalon', 'dom_negativa'] }),
  N('dom_banda', 'Dominada con banda', 'tiron', 'banda', 'tir_v', { dorsal: 2, biceps: 1, antebrazo: 1 }, [5, 12], 1, { bw: 1, home: true, std: 'pullup', alt: ['dom_asist', 'dom_negativa', 'jalon'] }),
  N('dom_negativa', 'Dominada negativa (bajada lenta)', 'tiron', 'bw', 'tir_v', { dorsal: 2, biceps: 1, antebrazo: 1 }, [3, 6], 1, { bw: 0.7, home: true, alt: ['dom_asist', 'dom_banda'] }),
  N('jalon', 'Jalón al pecho', 'tiron', 'polea', 'tir_v', { dorsal: 2, biceps: 1, trapecio: 1 }, [8, 12], 1, { machine: 'jalon', std: 'lat_pd', alt: ['dom_asist', 'dom_prona'] }),
  N('jalon_estrecho', 'Jalón agarre estrecho / neutro', 'tiron', 'polea', 'tir_v', { dorsal: 2, biceps: 1 }, [8, 12], 1, { machine: 'jalon', alt: ['jalon', 'dom_neutra'] }),
  N('remo_sentado', 'Remo sentado en polea', 'tiron', 'polea', 'tir_h', { dorsal: 2, trapecio: 1, biceps: 1, delt_post: 1 }, [8, 12], 1, { machine: 'remo_polea', alt: ['remo_maq', 'remo_db'] }),
  N('remo_maq', 'Remo en máquina (pecho apoyado)', 'tiron', 'maq', 'tir_h', { dorsal: 2, trapecio: 1, biceps: 1 }, [8, 12], 1, { machine: 'remo_maq', alt: ['remo_sentado', 'remo_db'] }),
  N('remo_bb', 'Remo con barra', 'tiron', 'bb', 'tir_h', { dorsal: 2, trapecio: 1, biceps: 1, lumbar: 1 }, [6, 10], 2, { big: true, std: 'row', care: ['lumbar'], alt: ['remo_maq', 'remo_db', 'remo_t'] }),
  N('remo_t', 'Remo en T', 'tiron', 'disc', 'tir_h', { dorsal: 2, trapecio: 1, biceps: 1 }, [6, 12], 2, { machine: 'remo_t', care: ['lumbar'], alt: ['remo_bb', 'remo_maq'] }),
  N('pullover_polea', 'Pullover en polea (brazos rectos)', 'tiron', 'polea', 'aislado', { dorsal: 2 }, [10, 15], 1, { machine: 'polea', alt: ['pullover_db'] }),
  N('pullover_db', 'Pullover con mancuerna', 'tiron', 'db', 'aislado', { dorsal: 1, pec_med: 1 }, [10, 15], 1, { home: true, care: ['hombro'], alt: ['pullover_polea'] }),
  N('facepull_polea', 'Face pull en polea', 'tiron', 'polea', 'aislado', { delt_post: 2, trapecio: 1 }, [12, 20], 1, { machine: 'polea', alt: ['facepull', 'pajaro'] }),
  N('pajaro', 'Pájaros (aperturas inversas)', 'tiron', 'db', 'aislado', { delt_post: 2, trapecio: 1 }, [12, 20], 1, { pair: true, home: true, alt: ['pec_deck_inv', 'facepull_polea'] }),
  N('pec_deck_inv', 'Aperturas inversas en máquina', 'tiron', 'maq', 'aislado', { delt_post: 2, trapecio: 1 }, [12, 20], 1, { machine: 'pec_deck', alt: ['pajaro', 'facepull_polea'] }),
  N('curl_bb', 'Curl con barra', 'tiron', 'bb', 'aislado', { biceps: 2, antebrazo: 1 }, [8, 12], 1, { std: 'curl', care: ['codo', 'muneca'], alt: ['curl_supino', 'curl_polea', 'curl_ez'] }),
  N('curl_ez', 'Curl con barra Z', 'tiron', 'ez', 'aislado', { biceps: 2, antebrazo: 1 }, [8, 12], 1, { care: ['codo'], alt: ['curl_bb', 'curl_supino'] }),
  N('curl_polea', 'Curl en polea', 'tiron', 'polea', 'aislado', { biceps: 2 }, [10, 15], 1, { machine: 'polea', alt: ['curl_supino', 'curl_bb'] }),
  N('curl_maq', 'Curl en máquina (predicador)', 'tiron', 'maq', 'aislado', { biceps: 2 }, [10, 15], 1, { machine: 'curl_maq', alt: ['curl_supino', 'curl_polea'] }),
  N('curl_inclinado', 'Curl inclinado con mancuernas', 'tiron', 'db', 'aislado', { biceps: 2 }, [8, 12], 1, { pair: true, alt: ['curl_supino'], care: ['hombro'] }),
  N('curl_concentrado', 'Curl concentrado', 'tiron', 'db', 'aislado', { biceps: 2 }, [10, 15], 1, { home: true, alt: ['curl_supino'] }),
  N('encogim_bb', 'Encogimientos con barra', 'tiron', 'bb', 'aislado', { trapecio: 2 }, [10, 15], 1, { alt: ['encogim'] }),
  // Pierna
  N('sentadilla_bb', 'Sentadilla con barra', 'pierna', 'bb', 'sentadilla', { cuadriceps: 2, femoral: 2, lumbar: 1 }, [4, 10], 2, { big: true, std: 'squat', care: ['rodilla', 'lumbar'], alt: ['smith_sentadilla', 'goblet', 'prensa', 'hack'] }),
  N('sentadilla_front', 'Sentadilla frontal', 'pierna', 'bb', 'sentadilla', { cuadriceps: 2, core_prof: 1, femoral: 1 }, [4, 8], 3, { big: true, care: ['rodilla', 'muneca'], alt: ['goblet', 'sentadilla_bb'] }),
  N('smith_sentadilla', 'Sentadilla en Smith', 'pierna', 'smith', 'sentadilla', { cuadriceps: 2, femoral: 1 }, [6, 12], 1, { big: true, care: ['rodilla'], alt: ['sentadilla_bb', 'prensa', 'hack'] }),
  N('prensa', 'Prensa de piernas 45°', 'pierna', 'disc', 'sentadilla', { cuadriceps: 2, femoral: 1 }, [8, 15], 1, { big: true, machine: 'prensa', std: 'legpress', rpgK: 0.45, care: ['rodilla'], alt: ['prensa_h', 'hack', 'goblet'] }),
  N('prensa_h', 'Prensa horizontal (de placas)', 'pierna', 'maq', 'sentadilla', { cuadriceps: 2, femoral: 1 }, [10, 15], 1, { big: true, machine: 'prensa_h', rpgK: 0.6, care: ['rodilla'], alt: ['prensa', 'goblet'] }),
  N('hack', 'Sentadilla hack', 'pierna', 'disc', 'sentadilla', { cuadriceps: 2, femoral: 1 }, [8, 12], 1, { big: true, machine: 'hack', rpgK: 0.6, care: ['rodilla'], alt: ['prensa', 'sentadilla_bb'] }),
  N('ext_cuad', 'Extensión de cuádriceps (máquina)', 'pierna', 'maq', 'aislado', { cuadriceps: 2 }, [10, 15], 1, { machine: 'ext_cuad', care: ['rodilla'], alt: ['sentadilla_pc', 'bulgara'] }),
  N('curl_fem', 'Curl femoral (máquina)', 'pierna', 'maq', 'aislado', { femoral: 2 }, [8, 15], 1, { machine: 'curl_fem', alt: ['pmuerto', 'nordic'] }),
  N('rdl_bb', 'Peso muerto rumano con barra', 'pierna', 'bb', 'bisagra', { femoral: 2, lumbar: 1 }, [6, 10], 2, { big: true, care: ['lumbar'], alt: ['pmuerto', 'curl_fem', 'hiperext'] }),
  N('peso_muerto', 'Peso muerto con barra', 'pierna', 'bb', 'bisagra', { femoral: 2, lumbar: 2, trapecio: 1, cuadriceps: 1, antebrazo: 1 }, [3, 8], 2, { big: true, std: 'deadlift', care: ['lumbar'], alt: ['rdl_bb', 'pmuerto', 'hip_thrust_bb'] }),
  N('hip_thrust_bb', 'Hip thrust con barra', 'pierna', 'bb', 'bisagra', { femoral: 2 }, [8, 12], 1, { big: true, alt: ['hipthrust', 'puente_unipodal'] }),
  N('abductor', 'Abductores (máquina)', 'pierna', 'maq', 'aislado', { femoral: 1 }, [12, 20], 1, { machine: 'abductor' }),
  N('aductor', 'Aductores (máquina)', 'pierna', 'maq', 'aislado', { femoral: 1 }, [12, 20], 1, { machine: 'aductor' }),
  N('gemelos_maq', 'Gemelos de pie (máquina)', 'pierna', 'maq', 'aislado', { gemelos: 2 }, [10, 20], 1, { machine: 'gemelos', rpgK: 0.5, alt: ['gemelos_ej', 'gemelos_sent'] }),
  N('gemelos_sent', 'Gemelos sentado', 'pierna', 'disc', 'aislado', { gemelos: 2 }, [12, 20], 1, { machine: 'gemelos_sent', rpgK: 0.5, alt: ['gemelos_maq', 'gemelos_ej'] }),
  N('step_up', 'Subida al cajón con mancuernas', 'pierna', 'db', 'zancada', { cuadriceps: 2, femoral: 1, equilibrio: 1 }, [8, 12], 1, { pair: true, home: true, care: ['rodilla'], alt: ['bulgara', 'zancadas_ej'] }),
  N('puente_unipodal', 'Puente de glúteo a una pierna', 'pierna', 'bw', 'bisagra', { femoral: 2 }, [10, 20], 1, { bw: 0.5, home: true, alt: ['hipthrust'] }),
  N('nordic', 'Curl nórdico', 'pierna', 'bw', 'aislado', { femoral: 2 }, [3, 8], 3, { bw: 0.7, alt: ['curl_fem'], care: ['rodilla'] }),
  N('hiperext', 'Hiperextensiones (banco romano)', 'pierna', 'bw', 'bisagra', { lumbar: 2, femoral: 1 }, [10, 20], 1, { bw: 0.5, weighted: true, alt: ['superman', 'rdl_bb'], care: ['lumbar'] }),
  N('kb_swing', 'Swing con kettlebell', 'pierna', 'kb', 'potencia', { femoral: 2, lumbar: 1, pliometria: 1 }, [10, 20], 2, { big: true, home: true, care: ['lumbar'], alt: ['hip_thrust_bb', 'saltos'] }),
  // Core
  N('crunch_polea', 'Crunch en polea (de rodillas)', 'core_ej', 'polea', 'core', { abs: 2 }, [10, 20], 1, { machine: 'polea', alt: ['crunch', 'crunch_maq'] }),
  N('crunch_maq', 'Crunch en máquina', 'core_ej', 'maq', 'core', { abs: 2 }, [10, 20], 1, { machine: 'crunch', alt: ['crunch', 'crunch_polea'] }),
  N('pallof', 'Press Pallof (antirrotación)', 'core_ej', 'polea', 'core', { core_prof: 2, oblicuos: 1 }, [10, 15], 1, { machine: 'polea', alt: ['plancha_lat'] }),
  N('lenador', 'Leñador en polea', 'core_ej', 'polea', 'core', { oblicuos: 2, core_prof: 1 }, [10, 15], 1, { machine: 'polea', alt: ['oblicuos_ej'] }),
  N('elev_rodillas', 'Elevación de rodillas (paralelas o colgado)', 'core_ej', 'bw', 'core', { abs: 2, core_prof: 1 }, [8, 15], 1, { bw: 0.35, alt: ['elev_piernas', 'crunch'] }),
  N('plancha_lat', 'Plancha lateral', 'core_ej', 'iso', 'core', { oblicuos: 2, core_prof: 1 }, [20, 60], 1, { bw: 0.3, home: true, alt: ['plancha_ej', 'pallof'] }),
  N('dead_bug', 'Dead bug', 'core_ej', 'bw', 'core', { core_prof: 2, abs: 1 }, [8, 16], 1, { bw: 0.3, home: true, alt: ['plancha_ej', 'hollow'] }),
  N('mountain', 'Escaladores (mountain climbers)', 'core_ej', 'iso', 'core', { core_prof: 1, abs: 1, reactividad: 1 }, [20, 60], 1, { bw: 0.3, home: true }),
  // Acarreo y cardio
  N('farmer', 'Paseo del granjero', 'atletico', 'db', 'acarreo', { antebrazo: 2, trapecio: 1, core_prof: 1 }, [30, 60], 1, { pair: true, unit: 'seg', reps: 40, alt: ['gripper'] }),
  N('trotadora', 'Trotadora / caminadora', 'atletico', 'cardio', 'cardio', { reactividad: 1 }, [10, 45], 1, { reps: 20, alt: ['bici', 'eliptica'] }),
  N('bici', 'Bicicleta estática', 'atletico', 'cardio', 'cardio', { reactividad: 1 }, [10, 45], 1, { reps: 20, alt: ['trotadora', 'eliptica'] }),
  N('eliptica', 'Elíptica', 'atletico', 'cardio', 'cardio', { reactividad: 1 }, [10, 45], 1, { reps: 20, alt: ['trotadora', 'bici'] }),
  N('escaladora', 'Escaladora (escaleras)', 'atletico', 'cardio', 'cardio', { reactividad: 1, gemelos: 1 }, [10, 30], 1, { reps: 15, alt: ['trotadora'] }),
  N('remo_ergo', 'Remo ergómetro', 'atletico', 'cardio', 'cardio', { dorsal: 1, reactividad: 1 }, [10, 30], 1, { reps: 15, alt: ['bici'] }),
  // Combate (fase I9): rounds en segundos; con ellos se marcan solos los pasos de las disciplinas (forgeStrength.EXT_CRITERIA)
  N('sombra', 'Sombra (shadowboxing)', 'atletico', 'iso', 'potencia', { coordinacion: 2, delt_ant: 1, oblicuos: 1 }, [60, 180], 1, { bw: 0.3, home: true, reps: 120, alt: ['saco', 'cuerda'] }),
  N('saco', 'Saco de boxeo (rounds)', 'atletico', 'iso', 'potencia', { delt_ant: 2, oblicuos: 1, coordinacion: 1, triceps: 1 }, [60, 180], 1, { bw: 0.4, reps: 120, alt: ['sombra'] }),
  N('patadas_saco', 'Patadas al saco (rounds)', 'atletico', 'iso', 'potencia', { coordinacion: 2, cuadriceps: 1, oblicuos: 1, femoral: 1 }, [60, 180], 1, { bw: 0.4, reps: 60, alt: ['saco', 'sombra'] }),
  N('rodillazos', 'Rodillazos al saco (rounds)', 'atletico', 'iso', 'potencia', { abs: 1, oblicuos: 1, cuadriceps: 1, coordinacion: 1 }, [60, 180], 1, { bw: 0.4, reps: 60, alt: ['patadas_saco'] }),
  N('escalera', 'Escalera de agilidad', 'atletico', 'iso', 'potencia', { reactividad: 2, coordinacion: 1, gemelos: 1 }, [20, 90], 1, { bw: 0.3, home: true, reps: 45, alt: ['cuerda'] }),
];

// ─── «Mi gimnasio»: qué pesos existen de verdad ───

export type DbSet = 'uno_dos' | 'dos_y_medio' | 'uno_dos_y_medio' | 'propias';
export interface MachineCfg { unit: 'kg' | 'lb'; step: number; min: number; max: number; /** plaquita de medio escalón */ half?: boolean }
export interface Gym {
  preset: 'smartfit' | 'sportlife' | 'upgrade' | 'otro' | 'casa';
  dbSet: DbSet;
  /** mancuernas propias (en casa): los pesos que tienes */
  dbList?: number[];
  bar: number; ez: number; smith: number;
  /** discos que hay (kg) */
  plates: number[];
  kb: number[];
  machines: Partial<Record<MachineId, MachineCfg>>;
  /** la persona ya revisó cada máquina (unidad y escalón): no se vuelve a preguntar */
  checked?: Partial<Record<MachineId, boolean>>;
}

export const GYM_PRESETS: Array<{ id: Gym['preset']; name: string; note: string }> = [
  { id: 'smartfit', name: 'Smart Fit', note: 'Valores típicos de gimnasio; ajusta lo que sea distinto en tu sede.' },
  { id: 'sportlife', name: 'Sportlife', note: 'Valores típicos de gimnasio; ajusta lo que sea distinto en tu sede.' },
  { id: 'upgrade', name: 'Upgrade (ex Pacific)', note: 'Valores típicos de gimnasio; ajusta lo que sea distinto en tu sede.' },
  { id: 'otro', name: 'Otro gimnasio', note: 'Valores típicos de gimnasio; ajusta lo que sea distinto.' },
  { id: 'casa', name: 'En casa', note: 'Solo lo que tengas: dime qué mancuernas y kettlebells hay.' },
];

export const DB_SETS: Array<{ id: DbSet; name: string }> = [
  { id: 'uno_dos', name: 'De 1 en 1 hasta 10 kg, después de 2 en 2' },
  { id: 'dos_y_medio', name: 'De 2,5 en 2,5 kg' },
  { id: 'uno_dos_y_medio', name: 'De 1 en 1 hasta 10 kg, después de 2,5 en 2,5' },
  { id: 'propias', name: 'Las mías (elijo cuáles tengo)' },
];

const MACHINE_DEFAULT: MachineCfg = { unit: 'kg', step: 5, min: 5, max: 100 };
const MACHINE_DEFAULTS: Partial<Record<MachineId, MachineCfg>> = {
  asistida: { unit: 'kg', step: 5, min: 5, max: 70 },
  prensa: { unit: 'kg', step: 5, min: 0, max: 400 },
  hack: { unit: 'kg', step: 5, min: 0, max: 300 },
  remo_t: { unit: 'kg', step: 5, min: 0, max: 150 },
  gemelos_sent: { unit: 'kg', step: 5, min: 0, max: 200 },
  prensa_h: { unit: 'kg', step: 5, min: 10, max: 150 },
  gemelos: { unit: 'kg', step: 5, min: 10, max: 150 },
  polea: { unit: 'kg', step: 2.5, min: 2.5, max: 80 },
  jalon: { unit: 'kg', step: 5, min: 5, max: 110 },
  remo_polea: { unit: 'kg', step: 5, min: 5, max: 110 },
  elev_lat: { unit: 'kg', step: 2.5, min: 2.5, max: 60 },
};

export const MACHINE_NAMES: Record<MachineId, string> = {
  press_pecho: 'Press de pecho', press_incl: 'Press inclinado', pec_deck: 'Pec deck', press_hombro: 'Press de hombros',
  elev_lat: 'Elevación lateral', jalon: 'Jalón', remo_polea: 'Remo en polea', remo_maq: 'Remo en máquina', polea: 'Polea',
  asistida: 'Asistida (dominadas y fondos)', ext_cuad: 'Extensión de cuádriceps', curl_fem: 'Curl femoral', prensa_h: 'Prensa horizontal',
  gemelos: 'Gemelos de pie', abductor: 'Abductores', aductor: 'Aductores', crunch: 'Crunch', curl_maq: 'Curl en máquina',
  ext_tri: 'Extensión de tríceps', prensa: 'Prensa 45°', hack: 'Hack', remo_t: 'Remo en T', gemelos_sent: 'Gemelos sentado',
  otra: 'Otra máquina (mis ejercicios)',
};

export function defaultGym(preset: Gym['preset'] = 'otro'): Gym {
  if (preset === 'casa') return { preset, dbSet: 'propias', dbList: [], bar: 20, ez: 10, smith: 15, plates: [], kb: [], machines: {} };
  return { preset, dbSet: 'uno_dos', bar: 20, ez: 10, smith: 15, plates: [25, 20, 15, 10, 5, 2.5, 1.25], kb: [4, 6, 8, 10, 12, 16, 20, 24, 28, 32], machines: {} };
}

export const LB = 0.45359237;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Las mancuernas que hay (kg, de UNA), de menor a mayor. */
export function dbWeights(g: Gym): number[] {
  if (g.dbSet === 'propias') return [...new Set((g.dbList ?? []).filter((n) => n > 0))].sort((a, b) => a - b);
  const out: number[] = [];
  if (g.dbSet === 'dos_y_medio') { for (let k = 2.5; k <= 50; k += 2.5) out.push(k); return out; }
  for (let k = 1; k <= 10; k++) out.push(k);
  const step = g.dbSet === 'uno_dos' ? 2 : 2.5;
  for (let k = 10 + step; k <= 50 + 1e-9; k += step) out.push(r2(k));
  return out;
}

/** Configuración de una máquina (lo guardado o lo típico). */
export function machineCfg(g: Gym, id: MachineId | undefined): MachineCfg {
  if (!id) return MACHINE_DEFAULT;
  return g.machines[id] ?? MACHINE_DEFAULTS[id] ?? MACHINE_DEFAULT;
}

/** Los valores del selector de una máquina (en SU unidad: lo que dice la placa). */
export function machineValues(c: MachineCfg): number[] {
  const out: number[] = [];
  const step = c.half ? c.step / 2 : c.step;
  for (let v = c.min; v <= c.max + 1e-9; v += step) out.push(r2(v));
  return out;
}

/** Totales posibles con barra y discos (por lado, el disco más chico manda el escalón). */
export function barWeights(bar: number, plates: number[], max = 300): number[] {
  const small = Math.min(...plates.filter((p) => p > 0));
  if (!Number.isFinite(small)) return [bar];
  const out: number[] = [];
  for (let t = bar; t <= max + 1e-9; t += small * 2) out.push(r2(t));
  return out;
}

/** «2 × 20 + 1 × 5 por lado»: los discos por lado para llegar a un total (de mayor a menor). null = no se puede exacto. */
export function platesFor(total: number, bar: number, plates: number[]): Array<{ kg: number; n: number }> | null {
  let side = r2((total - bar) / 2);
  if (side < 0) return null;
  const out: Array<{ kg: number; n: number }> = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    const n = Math.floor((side + 1e-9) / p);
    if (n > 0) { out.push({ kg: p, n }); side = r2(side - n * p); }
  }
  return side > 1e-6 ? null : out;
}

export function platesText(total: number, bar: number, plates: number[]): string {
  const p = platesFor(total, bar, plates);
  if (!p) return '';
  if (!p.length) return 'solo la barra';
  return p.map((x) => `${x.n} × ${String(x.kg).replace('.', ',')}`).join(' + ') + ' por lado';
}

/** Discos sueltos (máquinas de discos): cualquier suma de discos, en escalones del más chico ×2 (uno por lado). */
export function discWeights(plates: number[], max = 400): number[] {
  const small = Math.min(...plates.filter((p) => p > 0));
  const step = Number.isFinite(small) ? small * 2 : 5;
  const out: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) out.push(r2(t));
  return out;
}

/** Bandas de asistencia: niveles con su ayuda aproximada (varía con la marca y el largo). */
export const BANDS: Array<{ id: string; name: string; kg: number }> = [
  { id: 'xl', name: 'Extra liviana', kg: 5 },
  { id: 'l', name: 'Liviana', kg: 10 },
  { id: 'm', name: 'Media', kg: 20 },
  { id: 'f', name: 'Fuerte', kg: 30 },
  { id: 'xf', name: 'Extra fuerte', kg: 40 },
];

/** Lastre posible (cinturón con discos o mancuerna): 0 y los pesos que hay. */
export function lastreWeights(g: Gym): number[] {
  const set = new Set<number>([0]);
  for (const d of dbWeights(g)) set.add(d);
  const small = Math.min(...g.plates.filter((p) => p > 0));
  if (Number.isFinite(small)) for (let t = small; t <= 60 + 1e-9; t += small) set.add(r2(t));
  return [...set].sort((a, b) => a - b);
}

export type PickerKind = 'kg' | 'lastre' | 'assist' | 'band' | 'none';
export interface LoadPicker {
  kind: PickerKind;
  /** valores elegibles, en la unidad que se muestra */
  values: number[];
  unit: 'kg' | 'lb';
  /** texto bajo el número («por mancuerna», «total con barra de 20», «asistencia») */
  hint: string;
}

/** Qué se elige en cada serie y con qué valores posibles (SOLO pesos que existen). */
export function pickerFor(ex: ForgeExercise, g: Gym): LoadPicker {
  switch (ex.eq) {
    case 'db': return { kind: 'kg', values: dbWeights(g), unit: 'kg', hint: ex.pair ? 'cada mancuerna' : 'la mancuerna' };
    case 'bb': return { kind: 'kg', values: barWeights(g.bar, g.plates), unit: 'kg', hint: `total con barra de ${String(g.bar).replace('.', ',')}` };
    case 'ez': return { kind: 'kg', values: barWeights(g.ez, g.plates, 120), unit: 'kg', hint: `total con barra Z de ${String(g.ez).replace('.', ',')}` };
    case 'smith': return { kind: 'kg', values: barWeights(g.smith, g.plates), unit: 'kg', hint: `total (barra Smith de ${String(g.smith).replace('.', ',')})` };
    case 'disc': return { kind: 'kg', values: discWeights(g.plates), unit: 'kg', hint: 'discos cargados (los dos lados)' };
    case 'maq': case 'polea': { const c = machineCfg(g, ex.machine); return { kind: 'kg', values: machineValues(c), unit: c.unit, hint: 'lo que marca la máquina' }; }
    case 'kb': return { kind: 'kg', values: g.kb.length ? [...g.kb].sort((a, b) => a - b) : [8, 12, 16, 20, 24], unit: 'kg', hint: 'la kettlebell' };
    case 'asist': { const c = machineCfg(g, ex.machine ?? 'asistida'); return { kind: 'assist', values: machineValues(c), unit: c.unit, hint: 'asistencia (te quita peso)' }; }
    case 'banda': return { kind: 'band', values: BANDS.map((b) => b.kg), unit: 'kg', hint: 'banda (ayuda aprox.)' };
    case 'bw': return ex.weighted ? { kind: 'lastre', values: lastreWeights(g), unit: 'kg', hint: 'lastre (0 = sin peso extra)' } : { kind: 'none', values: [], unit: 'kg', hint: '' };
    default: return { kind: 'none', values: [], unit: 'kg', hint: '' };
  }
}

/** El valor real más cercano (para no mostrar nunca un peso que no existe). */
export function nearest(values: number[], v: number): number {
  if (!values.length) return v;
  let best = values[0];
  for (const x of values) if (Math.abs(x - v) < Math.abs(best - v)) best = x;
  return best;
}

/** El siguiente peso real hacia arriba o abajo (progresión: nunca más de un escalón). */
export function stepFrom(values: number[], v: number, dir: 1 | -1): number {
  const sorted = [...values].sort((a, b) => a - b);
  const i = sorted.findIndex((x) => Math.abs(x - v) < 1e-6);
  if (i < 0) return nearest(sorted, v);
  return sorted[Math.max(0, Math.min(sorted.length - 1, i + dir))];
}

/** kg de un valor de la máquina (las de lb se pasan a kg para calcular). */
export const toKg = (v: number, unit: 'kg' | 'lb' | undefined) => (unit === 'lb' ? r2(v * LB) : v);

export const fmtLoad = (v: number) => String(r2(v)).replace('.', ',');

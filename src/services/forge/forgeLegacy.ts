// @ts-nocheck
// ============================================================
// Eris Mobile — Forge: la lógica del RPG, portada TAL CUAL desde assets/toji.html (Forge 2.0, F1, 2026-10-17)
//
// ARCHIVO GENERADO (eris/scripts/gen_forge_legacy.py): no se edita a mano. Es el mismo código del HTML (XP, niveles,
// rangos, misiones, árbol de 79 habilidades, 22 subgrupos con su decaimiento, títulos, Arena, metas del cuerpo), con
// cambios mecánicos: íconos → nombre, window.__ERIS_*__ → forgeEnv, new Date() → forgeNow(). Así la migración compara
// «al peso» contra el HTML y el RPG no cambia ni un punto. Lo nuevo de Forge 2.0 vive en forgeCore.ts.
// ============================================================

/** La rutina de ejemplo del HTML (window.__RUTINA_MD__): siempre existe, y las metas de proteína la miran. */
export const SAMPLE_ROUTINE_MD: string = "# Rutina Mes 1 \u2014 FORGE\n\n> \ud83c\udfaf Volver con cabeza. Sesiones cortas (3-4 ejercicios), 3 d\u00edas a la semana. **Constancia > intensidad.** Deja 1-2 reps en el tanque y enf\u00f3cate en ganarle a la semana pasada.\n\n> \ud83e\uddf0 Equipo: **anillas** \u00b7 barra de dominadas multi-agarre \u00b7 torre (fondos + silla romana para colgar) \u00b7 bandas el\u00e1sticas \u00b7 mancuernas 12.5 kg \u00b7 handgripper.\n\n> \u2695\ufe0f Si tienes alguna condici\u00f3n m\u00e9dica (ej. diabetes), valida esta rutina con tu doctor antes de empezar y ajusta seg\u00fan tu propio seguimiento.\n\n## C\u00f3mo repartir la semana\n\n| D\u00eda | Sesi\u00f3n |\n|---|---|\n| Lun | A \u2014 Jal\u00f3n + b\u00edceps |\n| Mi\u00e9 | B \u2014 Empuje + hombros |\n| Vie | C \u2014 Piernas + core |\n\nOrden libre, lo importante es tocar A, B y C cada semana. Descanso ~90 s entre series.\n\n## \ud83d\udd35 D\u00eda A \u2014 Jal\u00f3n + b\u00edceps\n\n| Ejercicio | Series \u00b7 reps |\n|---|---|\n| Dominadas en barra (estrictas primero) | 3-4 series; estrictas + al fallo **asistidas con banda** (rango completo) |\n| **Remo en anillas** (cuerpo inclinado, pies adelante) | 3 \u00d7 8-12 (jala el pecho a las manos, aprieta la espalda) |\n| Curl martillo 12.5 kg | 3 \u00d7 6-8 **empezando por el izquierdo** |\n| *(opcional)* Skin the cat / German hang en anillas | 2-3 reps lentas (movilidad de hombro, base de habilidades) |\n\n## \ud83d\udfe2 D\u00eda B \u2014 Empuje + hombros\n\n| Ejercicio | Series \u00b7 reps |\n|---|---|\n| **Fondos en anillas** (o en la torre si quieres menos inestabilidad) | 3 \u00d7 6-10; al fallo, negativas lentas |\n| Press militar de pie con mancuernas 12.5 | 3 \u00d7 8-10 |\n| Flexiones (en anillas o declinadas pies 35 cm) | 3 \u00d7 8-12 |\n| *(opcional)* Elevaciones laterales con banda o mancuerna | 2-3 \u00d7 12-15 (hombros en V) |\n\n> \ud83d\udca1 Las **anillas** en fondos y flexiones suman exigencia de estabilidad = m\u00e1s m\u00fasculo y hombros m\u00e1s sanos que en superficie fija. Si te cuesta, empieza en la torre/suelo y pasa a anillas cuando domines.\n\n## \ud83d\udfe0 D\u00eda C \u2014 Piernas + core\n\n| Ejercicio | Series \u00b7 reps |\n|---|---|\n| Sentadilla goblet (abraza la mancuerna) | 3 \u00d7 10-12 |\n| Zancadas con mancuernas | 3 \u00d7 8-10 por pierna |\n| Elevaci\u00f3n de piernas/rodillas colgado (silla romana o anillas) | 3 \u00d7 8-12 |\n| *(opcional)* Puente de gl\u00fateo a una pierna o curl femoral con banda | 2-3 \u00d7 10-12 |\n\n## \ud83d\udcc8 Progresi\u00f3n semanal (lo que te hace avanzar)\n\nCada semana **g\u00e1nale a la anterior en algo.** No agregues ejercicios, sube el rendimiento.\n\n- **Sem 1:** registra tus n\u00fameros base.\n- **Sem 2:** +1-2 reps en algo, o **menos banda** en las dominadas.\n- **Sem 3:** sube reps en el resto o acorta el descanso.\n- **Sem 4:** una serie extra en tu ejercicio fuerte, o sube dificultad (fondos en anillas m\u00e1s profundos, dominadas con menos asistencia).\n\nReglas de oro:\n- **Dominadas:** baja la asistencia de banda mes a mes hasta hacerlas solo.\n- **Anillas:** empieza con apoyo y progresa a versiones m\u00e1s inestables/profundas. Son tu camino al muscle-up y a las palancas del \u00e1rbol.\n- **Poca energ\u00eda o glucosa baja:** baja a 2 series o salta un ejercicio. Sumar > rendir al 100 %.\n- **Cuando A/B/C te queden f\u00e1ciles (sem 4-5):** subimos volumen, cargas o 4\u00ba d\u00eda.\n\n## Lo que se viene (mes 2+)\n\nM\u00e1s volumen de hombro (laterales), gemelos, dominadas sin banda, fondos en anillas con peso, y empezar progresiones de anillas (RTO, muscle-up). Sin apuro \u2014 primero el h\u00e1bito.\n\n---\n\n*Edita este archivo y c\u00e1rgalo en la pesta\u00f1a RUTINA. Usa `#` para t\u00edtulos, `-` para listas, `**negrita**` y tablas con `|`.*\n";

/** Lo que TojiScreen inyectaba en el WebView (reglas del servidor y días con ejercicio del reloj). */
export const forgeEnv: { isDiabetic: boolean; proteinRule: any; waterRule: any; watchDays: Record<string, number>; routineMd: string | null } = {
  isDiabetic: false, proteinRule: null, waterRule: null, watchDays: {}, routineMd: SAMPLE_ROUTINE_MD,
};
let _now: (() => Date) | null = null;
/** El reloj de Forge (las pruebas lo fijan con setForgeNow). */
export const forgeNow = () => (_now ? _now() : new Date());
export function setForgeNow(fn: (() => Date) | null) { _now = fn; }

const MISSIONS_TO_CLAIM = 2; // 2 de 3 — mismo criterio "aprox. mitad" que antes (3 de 6)
const MAX_LEVEL = 80;
const todayKey = () => {
  const d = forgeNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const prevKey = k => {
  const [y, m, d] = k.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
// Misiones genéricas de acondicionamiento — comida e hidratación viven en el
// módulo Nutrición (Health Connect); el control de glucosa vive en GlucoTrack
// (tracking real por sensor, no un contador manual). Forge no asume que el
// usuario tenga una condición médica.
//
// 'steps'/'sleep' son type:'auto' — no se marcan a mano, se autocompletan con
// datos reales de Health Connect (Métricas/Nutrición) inyectados en vivo por
// TojiScreen (ver window.__ERIS_UPDATE_DATA__ más abajo). 'workout' sigue
// siendo manual porque Forge es la única fuente de esa información.
const STEPS_THRESHOLD = 8000;
const SLEEP_THRESHOLD = 7; // horas
const MISSIONS = [{
  key: 'workout',
  type: 'toggle',
  icon: 'Dumbbell',
  label: 'Entrenamiento',
  sub: 'La misión principal del día',
  xp: 50
}, {
  key: 'steps',
  type: 'auto',
  threshold: STEPS_THRESHOLD,
  icon: 'Footprints',
  label: '8.000 pasos',
  sub: 'Automático · Health Connect',
  xp: 20
}, {
  key: 'sleep',
  type: 'auto',
  threshold: SLEEP_THRESHOLD,
  icon: 'Moon',
  label: 'Dormir 7h+',
  sub: 'Automático · Health Connect',
  xp: 20
}];
const CATS = [{
  id: 'fund',
  label: 'FUNDAMENTOS',
  color: '#9b93a5'
}, {
  id: 'fuerza',
  label: 'FUERZA · CALISTENIA',
  color: '#ff3b4e'
}, {
  id: 'parkour',
  label: 'PARKOUR',
  color: '#56b3ff'
}, {
  id: 'acro',
  label: 'ACROBACIA · FLIPS',
  color: '#f5a623'
}, {
  id: 'final',
  label: 'FORMA FINAL',
  color: '#f5c542'
}];
const CLASSES = [{
  id: 'calistenia',
  name: 'Calistenia',
  emoji: '🤸',
  color: '#ff3b4e',
  cats: ['fuerza', 'fund'],
  boosts: {
    atk: 0.10,
    hp: 0.08,
    def: 0.05
  },
  desc: 'Fuerza y dominio del propio cuerpo.'
}, {
  id: 'taekwondo',
  name: 'Taekwondo',
  emoji: '🦵',
  color: '#56b3ff',
  cats: ['acro'],
  boosts: {
    eva: 0.12,
    crit: 0.06,
    vigor: 0.10
  },
  desc: 'Patadas, distancia y explosividad.'
}, {
  id: 'karate',
  name: 'Karate',
  emoji: '🥋',
  color: '#f5c542',
  cats: ['fund', 'acro'],
  boosts: {
    crit: 0.08,
    critDmg: 0.10,
    def: 0.06
  },
  desc: 'Golpes precisos y disciplina.'
}, {
  id: 'boxeo',
  name: 'Boxeo',
  emoji: '🥊',
  color: '#ff7a4e',
  cats: ['fuerza'],
  boosts: {
    atk: 0.12,
    crit: 0.06,
    vigor: 0.06
  },
  desc: 'Manos rápidas y pesadas.'
}];
const CLASS_BY_ID = Object.fromEntries(CLASSES.map(c => [c.id, c]));
const CAT_STATS = {
  fund: ['HP', 'DEFENSA'],
  fuerza: ['ATK', 'HP'],
  parkour: ['EVASIÓN', 'CRÍTICO', 'VIGOR'],
  acro: ['DAÑO CRÍT', 'CRÍTICO', 'ATK'],
  final: ['TODO (bono enorme)']
};
const S = (id, cat, emoji, name, lvl, prereq, xp, why, steps, safety) => ({
  id,
  cat,
  emoji,
  name,
  lvl,
  prereq,
  xp,
  why,
  steps,
  safety
});
const SKILLS = [S('f_mob', 'fund', '🧘', 'Movilidad Base', 1, [], 80, 'El cimiento. Sin esto te lesionas.', ['Rutina de muñecas, hombros y caderas 3 días seguidos', 'Sentadilla profunda cómoda 30 s', 'Puente de glúteo y gato-vaca a diario']), S('f_core', 'fund', '🔥', 'Core de Hierro', 1, ['f_mob'], 90, 'Abdomen estable: base de todo y del six-pack.', ['Plancha 45 s', 'Hollow hold 30 s', 'Arch (superman) 30 s']), S('f_grip', 'fund', '✊', 'Agarre de Acero', 2, ['f_mob'], 90, 'Usa tu handgripper. Manos fuertes = todo lo demás mejora.', ['Handgripper 3x15 por mano', 'Dead hang (colgado) 30 s', 'Dead hang 60 s']), S('f_squat', 'fund', '🦵', 'Sentadilla Sólida', 1, ['f_mob'], 80, 'Piernas y patrón básico.', ['Sentadilla peso corporal 3x20', 'Sentadilla goblet con mancuerna 3x12']), S('f_push', 'fund', '🤜', 'Flexiones Sólidas', 1, ['f_mob'], 80, 'Base de todo el empuje.', ['5 flexiones limpias', '15 flexiones limpias', '25 flexiones limpias']), S('f_land', 'fund', '🛬', 'Aterrizajes', 2, ['f_mob'], 100, 'La base del parkour: caer bien evita lesiones.', ['Aterrizaje suave desde altura baja x20', 'Aterrizaje "en silencio" x10', 'Aterrizaje desde altura media x10'], 'Empieza desde alturas bajas, rodillas alineadas con los pies.'), S('f_roll', 'fund', '🤸', 'Rol de Seguridad', 3, ['f_land'], 120, 'Disipa el impacto. Lo primero del traceur.', ['Rol adelante sobre el hombro x10/lado', 'Rol desde paso x10', 'Rol tras pequeño salto x5'], 'Practícalo en pasto o colchoneta antes que en suelo duro.'), S('s_row', 'fuerza', '🚣', 'Remo en Anillas', 3, ['f_mob'], 120, 'Tracción horizontal: espalda y postura.', ['Remo invertido 3x12 (pies adelante)', 'Remo más horizontal 3x10']), S('s_pull', 'fuerza', '💪', 'Dominadas Estrictas', 4, ['s_row', 'f_grip'], 160, 'El ejercicio nº1 para la espalda en V de Toji.', ['Negativa lenta (5 s) x5', '3 dominadas estrictas', '8 dominadas estrictas']), S('s_dip', 'fuerza', '🔻', 'Fondos (Dips)', 4, ['f_push'], 130, 'Empuje vertical, pecho y tríceps.', ['Fondo negativo lento x5', '5 fondos completos', '12 fondos completos']), S('s_lsit', 'fuerza', '📐', 'L-Sit', 6, ['f_core'], 160, 'Core de acero y compresión.', ['L-sit en tuck 20 s', 'L-sit una pierna 10 s', 'L-sit completo 10 s']), S('s_pistol', 'fuerza', '🦿', 'Sentadilla Pistol', 10, ['f_squat'], 180, 'Fuerza y equilibrio a una pierna.', ['Sentadilla a banco a 1 pierna x5', 'Pistol asistida x5', 'Pistol completa x3/pierna']), S('s_jump', 'fuerza', '⚡', 'Salto Explosivo', 8, ['f_squat'], 150, 'Potencia: base de saltos y flips.', ['Saltos al cajón 3x8', 'Sentadilla con salto 3x10', 'Broad jump (salto largo) x10']), S('s_hand', 'fuerza', '🤸‍♂️', 'Parada de Manos', 12, ['f_core', 'f_push'], 220, 'Control total. Puerta a planche y wall flip.', ['Parada contra pared 45 s', 'Parada pecho-a-pared 30 s', 'Kick-up libre consistente', 'Parada libre 10 s'], 'Aprende a salir (girar) antes de intentar libre.'), S('s_mu', 'fuerza', '🚀', 'Muscle-Up', 16, ['s_pull', 's_dip'], 250, 'El santo grial: tracción + empuje explosivo.', ['10 dominadas estrictas', 'Dominada al esternón x3', 'Muscle-up negativo x3', '1 muscle-up limpio']), S('s_fl', 'fuerza', '➖', 'Front Lever', 18, ['s_pull', 's_lsit'], 350, 'EL rey del dorsal. La silueta en V de Toji.', ['Tuck front lever 15 s', 'Advanced tuck 15 s', 'Straddle/1 pierna 10 s', 'Front lever completo 5 s']), S('s_bl', 'fuerza', '🔙', 'Back Lever', 20, ['s_pull'], 300, 'Fuerza y control en posición invertida.', ['Tuck back lever 15 s', 'Advanced tuck 15 s', 'Back lever completo 5 s']), S('s_dragon', 'fuerza', '🐉', 'Dragon Flag', 28, ['f_core', 's_pull'], 300, 'Core nivel Bruce Lee.', ['Negativa de dragon flag x5', 'Dragon flag con piernas dobladas x5', 'Dragon flag completo x3']), S('s_flag', 'fuerza', '🚩', 'Bandera Humana', 35, ['s_pull', 's_dip'], 400, 'Fuerza lateral brutal. Puro estilo.', ['Soporte vertical en barra 15 s', 'Bandera en tuck 8 s', 'Bandera completa 5 s'], 'Necesitas oblicuos y agarre muy fuertes. Progresa sin prisa.'), S('s_hspu', 'fuerza', '⬇️', 'HSPU (flexión invertida)', 30, ['s_hand', 's_dip'], 300, 'Hombros 3D, anchos como los de Toji.', ['HSPU pared parcial x3', 'HSPU pared completa x5', 'HSPU libre x1']), S('s_planche', 'fuerza', '✈️', 'Planche', 42, ['s_hand', 's_dip'], 450, 'Fuerza de empuje sobrehumana.', ['Planche lean 20 s', 'Pseudo planche push-up x8', 'Tuck planche 15 s', 'Advanced tuck 10 s', 'Straddle planche 5 s']), S('s_vsit', 'fuerza', '✌️', 'V-Sit', 45, ['s_lsit'], 380, 'Compresión y core de élite.', ['L-sit elevado 10 s', 'L-sit a tuck planche transición', 'V-sit 5 s']), S('s_oac', 'fuerza', '☝️', 'Dominada a 1 Brazo', 60, ['s_mu', 's_fl'], 550, 'El pináculo de la tracción.', ['Dominada con agarre desigual x3', 'Negativa a 1 brazo lenta x3', 'Dominada arquero x5', '1 dominada a un brazo']), S('s_scap', 'fuerza', '🪝', 'Dominada Escapular', 3, ['f_grip'], 100, 'Activa la espalda antes de tirar. Hombros sanos y base del tirón.', ['Active hang (hombros activos) 20 s', 'Encogimientos colgado x10', 'Escapular pulls x12']), S('s_ringdip', 'fuerza', '💍', 'Fondos en Anillas', 10, ['s_dip'], 190, 'Fondos con inestabilidad: control y fuerza extra de pecho/tríceps.', ['Soporte en anillas 20 s', 'Fondo en anillas x3', 'Fondo en anillas x10', 'Soporte con anillas girando (RTO) 15 s']), S('s_handwalk', 'fuerza', '🙌', 'Caminar en Manos', 16, ['s_hand'], 240, 'Control de la parada en movimiento.', ['Parada libre 20 s', '3 pasos en manos', '5 m caminando en manos']), S('s_flpull', 'fuerza', '⬇️', 'Front Lever Pull', 28, ['s_fl'], 360, 'Dominadas en posición de front lever. Dorsal brutal.', ['Tuck front lever raise x5', 'Advanced tuck pull x3', 'Straddle front lever pull x3']), S('s_wmu', 'fuerza', '💍', 'Muscle-Up en Anillas', 24, ['s_mu', 's_ringdip'], 320, 'Muscle-up estricto y limpio en anillas.', ['Muscle-up en anillas con impulso x1', 'Transición lenta controlada', 'Muscle-up en anillas estricto x1', 'x3 seguidos']), S('s_planchepu', 'fuerza', '✈️', 'Planche Push-Up', 50, ['s_planche'], 500, 'Flexiones en planche: empuje sobrehumano.', ['Tuck planche push-up x3', 'Straddle planche hold 8 s', 'Straddle planche push-up x1']), S('s_manna', 'fuerza', '🌟', 'Manna', 58, ['s_vsit'], 600, 'Compresión y fuerza extrema; pocos en el mundo lo logran.', ['V-sit sólido 10 s', 'Reverse press progresión', 'Manna progresión x1'], 'Años de trabajo. Disfruta el camino.'), S('p_bal', 'parkour', '🧗', 'Equilibrio en Barandilla', 5, ['f_mob'], 130, 'Control fino que se traslada a todo.', ['Caminar 10 m sobre barandilla baja', 'Equilibrio estático 30 s', 'Giro 180° sobre barandilla']), S('p_drop', 'parkour', '⬇️', 'Caída Controlada (Drop)', 6, ['f_land', 'f_roll'], 120, 'Bajar de alturas sin destrozarte las rodillas.', ['Drop desde altura baja + aterrizaje x10', 'Drop + rol de salida x10'], 'Sube la altura solo cuando domines la anterior.'), S('p_prec', 'parkour', '🎯', 'Salto de Precisión', 6, ['f_land'], 150, 'Saltar a un punto exacto y clavar.', ['Salto a 2 pies a marca ancha x10', 'Precisión a barandilla baja', 'Precisión + aterrizaje firme x10']), S('p_safety', 'parkour', '🧱', 'Safety Vault', 8, ['f_land'], 140, 'Tu primer salto sobre obstáculos.', ['Safety vault obstáculo bajo x10', 'Obstáculo medio x10']), S('p_lazy', 'parkour', '😎', 'Lazy Vault', 9, ['p_safety'], 130, 'Vault lateral fluido y rápido.', ['Lazy vault obstáculo bajo x10', 'Lazy vault con carrera x10']), S('p_speed', 'parkour', '💨', 'Speed Vault', 12, ['p_safety'], 160, 'Pasar el obstáculo a toda velocidad.', ['Speed vault obstáculo bajo x10', 'Speed vault en carrera x10']), S('p_underbar', 'parkour', '🚪', 'Underbar (paso bajo barra)', 14, ['p_safety'], 160, 'Atravesar huecos lanzándote por debajo.', ['Underbar estático a colchoneta', 'Underbar con carrera x10']), S('p_precspin', 'parkour', '🌀', 'Precisión con Giro', 18, ['p_prec', 'p_bal'], 190, 'Precisión + 180° en el aire.', ['Precisión con giro 90°', 'Precisión con giro 180° y aterrizaje firme']), S('p_cat', 'parkour', '🐈', 'Salto de Gato + Subida', 12, ['f_land', 's_pull'], 200, 'Saltar a una pared, agarrarte y subir.', ['Posición de gato (colgado) 20 s', 'Cat leap a pared cercana', 'Cat leap + climb-up fluido'], 'Empieza con paredes a tu altura, no en altura real.'), S('p_stride', 'parkour', '🏃', 'Salto de Zancada (Stride)', 16, ['p_prec'], 180, 'Cruzar huecos de una pierna a la otra.', ['Stride sobre hueco pequeño', 'Stride sobre hueco medio']), S('p_dash', 'parkour', '🦅', 'Dash Vault', 22, ['p_speed'], 200, 'Vault con las piernas primero, manos atrás.', ['Dash vault a colchoneta', 'Dash vault sobre obstáculo medio']), S('p_kong', 'parkour', '🦍', 'Kong / Monkey Vault', 20, ['p_speed'], 220, 'El vault icónico: te lanzas con las manos.', ['Dive a colchoneta con manos al frente', 'Kong obstáculo bajo', 'Kong fluido obstáculo medio'], 'Practica el "dive" a colchoneta antes de hacerlo sobre obstáculos.'), S('p_wallrun', 'parkour', '🧱', 'Wall Run (Tac)', 24, ['p_cat'], 240, 'Correr por la pared para alcanzar un borde alto.', ['2 pasos en pared + agarre', 'Wall run a borde alto', 'Wall run + subida fluida'], 'Necesitas cat leap + subida sólidos primero.'), S('p_kongprec', 'parkour', '🎯', 'Kong to Precision', 30, ['p_kong', 'p_prec'], 260, 'Combo: kong y clavar una precisión al salir.', ['Kong + precisión a marca ancha', 'Kong + precisión a barandilla']), S('a_cart', 'acro', '☀️', 'Rueda (Cartwheel)', 16, ['f_core', 's_hand'], 160, 'Primera inversión dinámica. Base de todo.', ['Rueda con apoyo de pared', 'Rueda limpia x10/lado']), S('a_cond', 'acro', '🔋', 'Acondicionamiento Acrobático', 22, ['f_roll', 's_lsit', 's_jump'], 200, 'Potencia y core para girar sin lesionarte.', ['Hollow + arch 60 s total', 'Pliométricos 3x10', 'Tuck jumps en el sitio x15']), S('a_roundoff', 'acro', '🌪️', 'Rondó (Round-off)', 24, ['a_cart'], 220, 'Conexión potente para flips hacia atrás.', ['Rondó técnico en suelo blando x10', 'Rondó potente + aterrizaje firme x10'], 'Idealmente con entrenador y superficie blanda.'), S('a_macaco', 'acro', '🐒', 'Macaco', 28, ['a_cond', 'a_cart'], 240, 'El flip de parkour por excelencia (kick-back).', ['Macaco a colchoneta x10', 'Macaco en superficie firme'], 'Colchoneta al inicio.'), S('a_fhs', 'acro', '➡️', 'Front Handspring', 38, ['a_cart', 'a_cond'], 320, 'Volteo de manos hacia adelante.', ['Front handspring con apoyo/colchoneta', 'Front handspring con spotter', 'Front handspring solo a blando'], '⚠️ Con entrenador y colchoneta al inicio.'), S('a_back', 'acro', '🔄', 'Backflip (mortal atrás)', 45, ['a_cond'], 450, 'El flip por excelencia.', ['Tuck en cama elástica/foam', 'Backflip a foso de espuma con spotter', 'Backflip a colchoneta gruesa solo', 'Backflip controlado a superficie firme'], '⚠️ Foso de espuma o colchoneta gruesa + entrenador/spotter OBLIGATORIO. Nunca en concreto sin experiencia.'), S('a_front', 'acro', '↩️', 'Frontflip (mortal adelante)', 45, ['a_cond', 'f_roll'], 450, 'Rotación hacia adelante.', ['Front tuck a foso de espuma', 'Front a colchoneta con spotter', 'Front controlado a firme'], '⚠️ Foso de espuma o colchoneta + spotter al inicio.'), S('a_side', 'acro', '↔️', 'Sideflip (mortal lateral)', 48, ['a_cond'], 440, 'Mortal de costado, muy visual.', ['Side tuck a foso/colchoneta', 'Side flip con spotter', 'Side flip controlado'], '⚠️ Colchoneta + spotter al inicio.'), S('a_bhs', 'acro', '🤾', 'Back Handspring (flic flac)', 50, ['a_roundoff'], 350, 'Flexibilidad y técnica pura.', ['Puente + caída atrás a colchoneta con apoyo', 'Back handspring con spotter x10', 'Back handspring solo a blando'], '⚠️ SIEMPRE con entrenador y colchoneta. De las habilidades de mayor riesgo.'), S('a_webster', 'acro', '🦶', 'Webster', 52, ['a_front'], 440, 'Frontflip impulsado con una sola pierna.', ['Webster a foso de espuma', 'Webster con spotter', 'Webster controlado'], '⚠️ Domina el frontflip primero.'), S('a_wallflip', 'acro', '🧱', 'Wall Flip', 58, ['p_wallrun', 'a_back'], 480, 'Mortal impulsándote desde una pared.', ['Wall flip a colchoneta con spotter', 'Wall flip controlado'], '⚠️ Wall run y backflip dominados. Colchoneta + spotter.'), S('a_gainer', 'acro', '🌟', 'Gainer', 60, ['a_back'], 500, 'Mortal atrás mientras avanzas hacia adelante.', ['Backflip con paso de aproximación', 'Gainer a foso de espuma', 'Gainer con spotter', 'Gainer controlado'], '⚠️ Domina el backflip estático primero. Foso/colchoneta + spotter.'), S('a_btwist', 'acro', '🌀', 'B-Twist (540)', 66, ['a_back', 'a_side'], 520, 'Giro horizontal con torsión. Tricking clásico.', ['B-twist a foso de espuma', 'B-twist con spotter', 'B-twist controlado'], '⚠️ Avanzado. Foso/colchoneta + entrenador.'), S('a_cheat', 'acro', '💫', 'Cheat Gainer', 70, ['a_gainer'], 550, 'El "cheat" permite la rotación desde carrera frontal.', ['Paso de "cheat" + gainer a foso', 'Cheat gainer con spotter', 'Cheat gainer limpio'], '⚠️ Solo con gainer sólido. Foso/colchoneta + spotter al inicio.'), S('f_hollow', 'fund', '🌙', 'Hollow Body', 2, ['f_core'], 90, 'La base de todo lever y del control de core.', ['Hollow hold 20 s', 'Hollow rocks x15', 'Hollow 45 s firme']), S('f_arch', 'fund', '🌉', 'Arco / Superman', 2, ['f_core'], 90, 'El opuesto al hollow: cadena posterior fuerte.', ['Superman hold 20 s', 'Arch rocks x15', 'Arco 40 s']), S('f_wrist', 'fund', '🖐️', 'Muñecas a Prueba', 1, ['f_mob'], 70, 'Muñecas sólidas para parado de manos y planche.', ['Movilidad de muñeca diaria', 'Apoyos progresivos x10', 'Carga sin molestias']), S('s_germanhang', 'fuerza', '🙃', 'German Hang', 8, ['s_scap'], 180, 'Movilidad de hombro bajo carga; abre el camino a las palancas.', ['German hang asistido 15 s', 'German hang 30 s', 'Entrada/salida controlada']), S('s_skincat', 'fuerza', '🐈', 'Skin the Cat', 10, ['s_germanhang'], 200, 'Control total de la rotación de hombro en anillas.', ['Skin the cat x5', 'Negativas lentas', 'Continuo x8']), S('s_ringsupport', 'fuerza', '💍', 'Soporte RTO en Anillas', 14, ['s_ringdip'], 230, 'Soporte con manos giradas: hombros de acero.', ['Soporte en anillas 30 s', 'RTO parcial 15 s', 'RTO completo 20 s']), S('s_pseudo', 'fuerza', '🛩️', 'Pseudo Planche Push-up', 20, ['s_dip', 's_hand'], 260, 'El puente real hacia la planche.', ['Lean 15 s', 'Pseudo planche push-up x5', 'Lean profundo x8']), S('s_archer', 'fuerza', '🏹', 'Dominada Archer', 30, ['s_pull'], 320, 'Dominada arquera: el paso previo al brazo único.', ['Archer asistida x3', 'Archer x5/lado', 'Archer limpia x8']), S('s_oapush', 'fuerza', '🤛', 'Flexión a Un Brazo', 26, ['s_dip'], 320, 'Empuje unilateral brutal.', ['Flexión a un brazo elevada x3', 'Negativa a un brazo', 'A un brazo x3']), S('s_nordic', 'fuerza', '🦿', 'Curl Nórdico', 20, ['s_pistol'], 260, 'Femorales blindados, rodilla protegida.', ['Nórdico asistido x5', 'Negativa lenta x5', 'Nórdico completo x3']), S('s_shrimp', 'fuerza', '🦐', 'Sentadilla Shrimp', 16, ['s_pistol'], 240, 'Equilibrio y fuerza unilateral de pierna.', ['Shrimp asistida x5', 'Shrimp x5/pierna', 'Shrimp profunda x8']), S('p_climbup', 'parkour', '🧗', 'Climb-up (salida de muro)', 14, ['p_wallrun'], 200, 'Sube lo que trepas: la salida del muro.', ['Climb-up asistido', 'Climb-up x3', 'Climb-up explosivo x5']), S('p_reverse', 'parkour', '↩️', 'Reverse Vault', 16, ['p_speed'], 210, 'Girar sobre el obstáculo de espaldas.', ['Reverse a baja altura', 'Reverse fluido', 'Reverse en carrera']), S('p_palmspin', 'parkour', '🔄', 'Palm Spin', 18, ['p_lazy'], 220, 'Giro sobre las manos en el obstáculo.', ['Palm spin lento', 'Palm spin completo', 'Palm spin en flujo']), S('p_doublekong', 'parkour', '🐒', 'Doble Kong', 24, ['p_kong'], 280, 'Dos apoyos, más distancia.', ['Kong largo', 'Doble kong a colchoneta', 'Doble kong en exterior']), S('a_raiz', 'acro', '🌱', 'Raiz', 40, ['a_macaco'], 360, 'Kick-back potente y muy estético.', ['Raiz a colchoneta', 'Raiz con spotter', 'Raiz a firme'], '⚠️ Colchoneta + spotter al inicio.'), S('a_540', 'acro', '🌀', 'Patada 540', 46, ['a_btwist'], 420, 'Giro y medio con patada en el aire.', ['540 a colchoneta', '540 con altura', '540 aterrizaje firme'], '⚠️ Superficie blanda al inicio.'), S('a_arabian', 'acro', '🜨', 'Arabian', 50, ['a_front', 'a_roundoff'], 460, 'Medio giro enlazado a frontflip.', ['Arabian a foso', 'Arabian con spotter', 'Arabian limpio'], '⚠️ Foso de espuma + spotter.'), S('a_cork', 'acro', '🌪️', 'Corkscrew', 55, ['a_btwist', 'a_back'], 520, 'Mortal inclinado con giro completo.', ['Cork a foso', 'Cork con spotter', 'Cork controlado'], '⚠️ Foso + entrenador obligatorio.'), S('a_dblback', 'acro', '💥', 'Doble Mortal Atrás', 68, ['a_back', 'a_cork'], 620, 'Élite absoluta del backflip.', ['Doble a foso profundo', 'Doble con spotter experto', 'Doble controlado'], '⚠️ Solo avanzados. Foso profundo + entrenador.'), S('c_toji', 'final', '🥷', 'FORMA TOJI', 80, ['s_fl', 's_mu', 'a_back', 'a_gainer'], 1000, 'El destino: seco, fuerte, ágil y letal. Lo lograste.', ['Físico seco y definido conseguido (foto)', '14 habilidades dominadas', 'Racha de 30 días alcanzada'])];
const SKILL_BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));
const MUSCLE_GROUPS = [{
  id: 'hombros',
  emoji: '🔺',
  name: 'Hombros',
  region: 'Tren superior',
  desc: 'Los deltoides dan la anchura del torso, el efecto "percha".',
  subs: [{
    id: 'delt_ant',
    name: 'Deltoide anterior',
    desc: 'Frente del hombro. Empuje por encima de la cabeza.'
  }, {
    id: 'delt_lat',
    name: 'Deltoide lateral',
    desc: 'El lado del hombro. ESTE da la anchura de Toji.'
  }, {
    id: 'delt_post',
    name: 'Deltoide posterior',
    desc: 'Parte trasera. Postura y equilibrio del hombro.'
  }]
}, {
  id: 'pecho',
  emoji: '🛡️',
  name: 'Pecho',
  region: 'Tren superior',
  desc: 'Pectorales: empuje y volumen frontal del torso.',
  subs: [{
    id: 'pec_sup',
    name: 'Pecho superior',
    desc: 'Parte alta, hacia la clavícula. Llena el escote de la camiseta.'
  }, {
    id: 'pec_med',
    name: 'Pecho medio/inferior',
    desc: 'El grueso del pectoral. Fuerza de empuje.'
  }]
}, {
  id: 'espalda',
  emoji: '🦅',
  name: 'Espalda',
  region: 'Tren superior',
  desc: 'La V de Toji nace aquí.',
  subs: [{
    id: 'dorsal',
    name: 'Dorsal ancho',
    desc: 'El "ala". Ensancha desde las axilas: el músculo nº1 de la V.'
  }, {
    id: 'trapecio',
    name: 'Trapecio',
    desc: 'Entre cuello y hombros. Densidad de la espalda alta.'
  }, {
    id: 'lumbar',
    name: 'Espalda baja (lumbar)',
    desc: 'Sostén de la columna. Protege en cargas y aterrizajes.'
  }]
}, {
  id: 'brazos',
  emoji: '💪',
  name: 'Brazos',
  region: 'Tren superior',
  desc: 'Lo que más se nota en camiseta.',
  subs: [{
    id: 'biceps',
    name: 'Bíceps',
    desc: 'Cara frontal del brazo. Tracción y el "pico" clásico.'
  }, {
    id: 'triceps',
    name: 'Tríceps',
    desc: '2/3 del tamaño del brazo. Empuje y grosor.'
  }, {
    id: 'antebrazo',
    name: 'Antebrazos',
    desc: 'Agarre y muñeca. Tu handgripper vive aquí.'
  }]
}, {
  id: 'core',
  emoji: '🔥',
  name: 'Core',
  region: 'Centro',
  desc: 'Estabiliza todo; con poca grasa, marca el six-pack.',
  subs: [{
    id: 'abs',
    name: 'Recto abdominal',
    desc: 'El six-pack. Flexión del tronco.'
  }, {
    id: 'oblicuos',
    name: 'Oblicuos',
    desc: 'Los costados. Giros y la "V" baja del abdomen.'
  }, {
    id: 'core_prof',
    name: 'Core profundo',
    desc: 'Transverso/estabilizadores. Sostén en planchas y palancas.'
  }]
}, {
  id: 'piernas',
  emoji: '🦵',
  name: 'Piernas',
  region: 'Tren inferior',
  desc: 'Tu motor de fuerza, salto y aterrizaje.',
  subs: [{
    id: 'cuadriceps',
    name: 'Cuádriceps',
    desc: 'Frente del muslo. Sentadilla y empuje de salto.'
  }, {
    id: 'femoral',
    name: 'Femoral/Glúteo',
    desc: 'Parte trasera y cadera. Potencia y velocidad.'
  }, {
    id: 'gemelos',
    name: 'Gemelos',
    desc: 'Pantorrilla. Rebote, salto y aterrizaje elástico.'
  }]
}, {
  id: 'explosivo',
  emoji: '⚡',
  name: 'Potencia',
  region: 'Atlético',
  desc: 'Fibra explosiva: salto, sprint y todo flip o vault.',
  subs: [{
    id: 'pliometria',
    name: 'Pliometría',
    desc: 'Fuerza-velocidad. Cuánto explotas en un salto.'
  }, {
    id: 'reactividad',
    name: 'Reactividad',
    desc: 'Rebote elástico: usar el suelo a tu favor.'
  }]
}, {
  id: 'agilidad',
  emoji: '🌀',
  name: 'Agilidad',
  region: 'Atlético',
  desc: 'Coordinación, equilibrio y control aéreo.',
  subs: [{
    id: 'equilibrio',
    name: 'Equilibrio',
    desc: 'Control del centro de masa. Barandillas y paradas.'
  }, {
    id: 'aereo',
    name: 'Control aéreo',
    desc: 'Orientarte girando en el aire. Flips y giros.'
  }, {
    id: 'coordinacion',
    name: 'Coordinación',
    desc: 'Manos-pies-vista juntos. Fluidez de movimiento.'
  }]
}];
const ALL_SUBS = MUSCLE_GROUPS.flatMap(g => g.subs.map(s => ({
  ...s,
  group: g.id,
  groupName: g.name,
  region: g.region
})));
const SUB_BY_ID = Object.fromEntries(ALL_SUBS.map(s => [s.id, s]));
const GROUP_BY_ID = Object.fromEntries(MUSCLE_GROUPS.map(g => [g.id, g]));
const GROUP_OF_SUB = Object.fromEntries(ALL_SUBS.map(s => [s.id, s.group]));
const EX_GROUPS = [{
  id: 'empuje',
  name: 'Empuje',
  items: [{
    id: 'flexiones',
    name: 'Flexiones',
    m: {
      pec_med: 2,
      triceps: 1,
      delt_ant: 1
    },
    load: {
      bw: 0.64
    },
    reps: 12
  }, {
    id: 'flex_diamante',
    name: 'Flexiones diamante',
    m: {
      triceps: 2,
      pec_med: 1
    },
    load: {
      bw: 0.64
    },
    reps: 10
  }, {
    id: 'flex_decl',
    name: 'Flexiones declinadas (pies arriba)',
    m: {
      pec_sup: 2,
      delt_ant: 1,
      triceps: 1
    },
    load: {
      bw: 0.7
    },
    reps: 10
  }, {
    id: 'flex_archer',
    name: 'Flexiones archer',
    m: {
      pec_med: 2,
      triceps: 1
    },
    load: {
      bw: 0.8
    },
    reps: 8
  }, {
    id: 'dips_ej',
    name: 'Fondos / Dips (agarre neutro)',
    m: {
      pec_med: 2,
      triceps: 2
    },
    load: {
      bw: 0.95
    },
    reps: 8,
    grip: 'neutro'
  }, {
    id: 'pike',
    name: 'Pike push-up',
    m: {
      delt_ant: 2,
      delt_lat: 1,
      triceps: 1
    },
    load: {
      bw: 0.66
    },
    reps: 8
  }, {
    id: 'pseudo_planche',
    name: 'Pseudo planche push-up',
    m: {
      delt_ant: 2,
      pec_sup: 1,
      core_prof: 1
    },
    load: {
      bw: 0.78
    },
    reps: 6
  }, {
    id: 'hspu',
    name: 'HSPU contra pared',
    m: {
      delt_ant: 2,
      delt_lat: 1,
      triceps: 1
    },
    load: {
      bw: 0.9
    },
    reps: 5
  }, {
    id: 'press_mil',
    name: 'Press militar (mancuerna)',
    m: {
      delt_ant: 2,
      delt_lat: 1,
      triceps: 1
    },
    load: {
      db: true
    },
    reps: 10
  }, {
    id: 'elev_lat',
    name: 'Elevaciones laterales (mancuerna)',
    m: {
      delt_lat: 2
    },
    load: {
      db: true
    },
    reps: 15
  }, {
    id: 'ext_tri',
    name: 'Extensión de tríceps (mancuerna)',
    m: {
      triceps: 2
    },
    load: {
      db: true
    },
    reps: 12
  }]
}, {
  id: 'tiron',
  name: 'Tirón',
  items: [{
    id: 'dom_prona',
    name: 'Dominada prona (pronador)',
    m: {
      dorsal: 2,
      biceps: 1,
      antebrazo: 1
    },
    load: {
      bw: 1.0
    },
    reps: 8,
    grip: 'prono'
  }, {
    id: 'dom_supina',
    name: 'Dominada supina / chin-up',
    m: {
      biceps: 2,
      dorsal: 1,
      antebrazo: 1
    },
    load: {
      bw: 1.0
    },
    reps: 8,
    grip: 'supino'
  }, {
    id: 'dom_neutra',
    name: 'Dominada neutra',
    m: {
      dorsal: 2,
      biceps: 1,
      antebrazo: 1
    },
    load: {
      bw: 1.0
    },
    reps: 8,
    grip: 'neutro'
  }, {
    id: 'dom_archer',
    name: 'Dominada archer',
    m: {
      dorsal: 2,
      biceps: 1
    },
    load: {
      bw: 1.0
    },
    reps: 5,
    grip: 'prono'
  }, {
    id: 'remo_prono',
    name: 'Remo invertido prono (anillas)',
    m: {
      dorsal: 2,
      trapecio: 1,
      biceps: 1
    },
    load: {
      bw: 0.6
    },
    reps: 12,
    grip: 'prono'
  }, {
    id: 'remo_supino',
    name: 'Remo invertido supino (anillas)',
    m: {
      dorsal: 2,
      biceps: 1
    },
    load: {
      bw: 0.6
    },
    reps: 12,
    grip: 'supino'
  }, {
    id: 'remo_db',
    name: 'Remo con mancuerna',
    m: {
      dorsal: 2,
      trapecio: 1,
      biceps: 1
    },
    load: {
      db: true
    },
    reps: 10,
    grip: 'neutro'
  }, {
    id: 'curl_supino',
    name: 'Curl bíceps supino (mancuerna)',
    m: {
      biceps: 2,
      antebrazo: 1
    },
    load: {
      db: true
    },
    reps: 12,
    grip: 'supino'
  }, {
    id: 'curl_martillo',
    name: 'Curl martillo neutro (mancuerna)',
    m: {
      biceps: 1,
      antebrazo: 2
    },
    load: {
      db: true
    },
    reps: 12,
    grip: 'neutro'
  }, {
    id: 'facepull',
    name: 'Face pull / aperturas atrás',
    m: {
      delt_post: 2,
      trapecio: 1
    },
    load: {
      bw: 0.4
    },
    reps: 15
  }, {
    id: 'encogim',
    name: 'Encogimientos / shrugs (mancuerna)',
    m: {
      trapecio: 2
    },
    load: {
      db: true
    },
    reps: 15
  }, {
    id: 'gripper',
    name: 'Handgripper / dead hang',
    m: {
      antebrazo: 2
    },
    load: {
      bw: 0.3
    },
    reps: 30,
    unit: 'seg'
  }]
}, {
  id: 'pierna',
  name: 'Pierna',
  items: [{
    id: 'sentadilla_pc',
    name: 'Sentadilla peso corporal',
    m: {
      cuadriceps: 2,
      femoral: 1
    },
    load: {
      bw: 0.65
    },
    reps: 18
  }, {
    id: 'goblet',
    name: 'Goblet squat (mancuerna)',
    m: {
      cuadriceps: 2,
      femoral: 1
    },
    load: {
      db: true
    },
    reps: 12
  }, {
    id: 'bulgara',
    name: 'Sentadilla búlgara (mancuerna)',
    m: {
      cuadriceps: 2,
      femoral: 1
    },
    load: {
      db: true
    },
    reps: 10
  }, {
    id: 'pmuerto',
    name: 'Peso muerto rumano (mancuerna)',
    m: {
      femoral: 2,
      lumbar: 1
    },
    load: {
      db: true
    },
    reps: 10
  }, {
    id: 'zancadas_ej',
    name: 'Zancadas (mancuerna)',
    m: {
      cuadriceps: 1,
      femoral: 2
    },
    load: {
      db: true
    },
    reps: 10
  }, {
    id: 'pistol_ej',
    name: 'Pistol squat',
    m: {
      cuadriceps: 2,
      femoral: 1,
      equilibrio: 1
    },
    load: {
      bw: 0.85
    },
    reps: 6
  }, {
    id: 'hipthrust',
    name: 'Puente de glúteo (mancuerna)',
    m: {
      femoral: 2,
      lumbar: 1
    },
    load: {
      db: true
    },
    reps: 12
  }, {
    id: 'gemelos_ej',
    name: 'Elevación de gemelos',
    m: {
      gemelos: 2
    },
    load: {
      bw: 0.6
    },
    reps: 20
  }, {
    id: 'wallsit',
    name: 'Sentadilla isométrica (wall sit)',
    m: {
      cuadriceps: 2
    },
    load: {
      bw: 0.5
    },
    reps: 45,
    unit: 'seg'
  }]
}, {
  id: 'core_ej',
  name: 'Core',
  items: [{
    id: 'plancha_ej',
    name: 'Plancha',
    m: {
      core_prof: 2,
      abs: 1
    },
    load: {
      bw: 0.4
    },
    reps: 40,
    unit: 'seg'
  }, {
    id: 'hollow',
    name: 'Hollow hold',
    m: {
      abs: 2,
      core_prof: 1
    },
    load: {
      bw: 0.4
    },
    reps: 30,
    unit: 'seg'
  }, {
    id: 'lsit_ej',
    name: 'L-sit',
    m: {
      abs: 2,
      core_prof: 1
    },
    load: {
      bw: 0.55
    },
    reps: 20,
    unit: 'seg'
  }, {
    id: 'elev_piernas',
    name: 'Elevación de piernas colgado',
    m: {
      abs: 2,
      core_prof: 1
    },
    load: {
      bw: 0.5
    },
    reps: 12
  }, {
    id: 'crunch',
    name: 'Crunch',
    m: {
      abs: 2
    },
    load: {
      bw: 0.3
    },
    reps: 18
  }, {
    id: 'rueda',
    name: 'Rueda abdominal',
    m: {
      abs: 2,
      core_prof: 1
    },
    load: {
      bw: 0.6
    },
    reps: 10
  }, {
    id: 'oblicuos_ej',
    name: 'Giros rusos / oblicuos',
    m: {
      oblicuos: 2
    },
    load: {
      bw: 0.3
    },
    reps: 20
  }, {
    id: 'superman',
    name: 'Superman / extensión lumbar',
    m: {
      lumbar: 2
    },
    load: {
      bw: 0.3
    },
    reps: 15
  }, {
    id: 'dragon',
    name: 'Dragon flag',
    m: {
      abs: 2,
      core_prof: 1
    },
    load: {
      bw: 0.8
    },
    reps: 5
  }]
}, {
  id: 'atletico',
  name: 'Atlético / Cardio',
  items: [{
    id: 'saltos',
    name: 'Saltos / pliometría',
    m: {
      pliometria: 2,
      reactividad: 1,
      gemelos: 1
    },
    load: {
      bw: 0.5
    },
    reps: 12
  }, {
    id: 'burpees',
    name: 'Burpees',
    m: {
      pliometria: 1,
      reactividad: 1,
      pec_med: 1
    },
    load: {
      bw: 0.5
    },
    reps: 12
  }, {
    id: 'sprint',
    name: 'Sprints',
    m: {
      reactividad: 2,
      femoral: 1
    },
    load: {
      bw: 0.5
    },
    reps: 30,
    unit: 'seg'
  }, {
    id: 'cuerda',
    name: 'Comba / saltar cuerda',
    m: {
      reactividad: 2,
      gemelos: 1
    },
    load: {
      bw: 0.4
    },
    reps: 60,
    unit: 'seg'
  }, {
    id: 'balance_ej',
    name: 'Equilibrio / barandilla',
    m: {
      equilibrio: 2,
      coordinacion: 1
    },
    load: {
      bw: 0.3
    },
    reps: 30,
    unit: 'seg'
  }, {
    id: 'cardio_z2',
    name: 'Cardio Zona 2',
    m: {
      reactividad: 1
    },
    load: {
      bw: 0.4
    },
    reps: 20,
    unit: 'seg'
  }, {
    id: 'movilidad',
    name: 'Movilidad / estiramiento',
    m: {
      coordinacion: 1,
      equilibrio: 1
    },
    load: {
      bw: 0.2
    },
    reps: 8,
    unit: 'seg'
  }]
}];
const EX_BY_ID = Object.fromEntries(EX_GROUPS.flatMap(g => g.items).map(e => [e.id, e]));
const EX_GROUP_OF = Object.fromEntries(EX_GROUPS.flatMap(g => g.items.map(e => [e.id, g.id])));
const repsOf = (s, ex) => s.reps && s.reps[ex.id] != null ? s.reps[ex.id] : ex.reps || 10;
const effLoadKg = (s, ex) => {
  if (!ex || !ex.load) return Math.max(1, (s.bodyKg || 70) * 0.4);
  if (ex.load.db) return Math.max(1, s.weights && s.weights[ex.id] || 0);
  return Math.max(1, (s.bodyKg || 70) * ex.load.bw);
};
const REF_WORK = 500;
const workOfSet = (s, ex) => {
  if (!ex) return 0;
  const load = effLoadKg(s, ex);
  const r = repsOf(s, ex);
  return ex.unit === 'seg' ? r * load * 0.18 : r * load;
};
const dayWork = (s, day) => {
  let w = 0;
  const {
    byId
  } = exCatalog(s);
  Object.entries(day || {}).forEach(([id, sets]) => {
    const ex = byId[id];
    if (ex) w += (sets || 0) * workOfSet(s, ex);
  });
  return w;
};
const GROUP_ENERGY = {
  empuje: {
    met: 6,
    min: 2.5
  },
  tiron: {
    met: 6,
    min: 2.5
  },
  pierna: {
    met: 6,
    min: 2.5
  },
  core_ej: {
    met: 5,
    min: 2
  },
  atletico: {
    met: 8,
    min: 3
  }
};
const EX_ENERGY = {
  elev_lat: {
    met: 4,
    min: 2
  },
  ext_tri: {
    met: 4,
    min: 2
  },
  curl_ej: {
    met: 4,
    min: 2
  },
  gripper: {
    met: 3,
    min: 2
  },
  encogim: {
    met: 4,
    min: 2
  },
  facepull: {
    met: 4,
    min: 2
  },
  gemelos_ej: {
    met: 4,
    min: 2
  },
  hipthrust: {
    met: 5,
    min: 2
  },
  pmuerto: {
    met: 6,
    min: 2.5
  },
  sentadilla_ej: {
    met: 6,
    min: 2.5
  },
  pistol_ej: {
    met: 7,
    min: 2.5
  },
  plancha_ej: {
    met: 4,
    min: 2
  },
  superman: {
    met: 3.5,
    min: 2
  },
  hollow: {
    met: 4,
    min: 2
  },
  saltos: {
    met: 8,
    min: 2
  },
  sprint: {
    met: 11,
    min: 2
  },
  cuerda: {
    met: 11,
    min: 4
  },
  balance_ej: {
    met: 3.5,
    min: 3
  },
  cardio_z2: {
    met: 7,
    min: 20
  },
  movilidad: {
    met: 2.5,
    min: 8
  },
  dips_ej: {
    met: 7,
    min: 2.5
  },
  dominadas_ej: {
    met: 7,
    min: 2.5
  },
  pike: {
    met: 7,
    min: 2.5
  },
  flex_decl: {
    met: 7,
    min: 2.5
  }
};
const INTENSITY = {
  baja: {
    met: 3.5,
    min: 3
  },
  media: {
    met: 6,
    min: 2.5
  },
  alta: {
    met: 8,
    min: 2
  },
  cardio: {
    met: 9,
    min: 15
  }
};
const exCatalog = s => {
  const custom = (s.customExercises || []).map(c => ({
    ...c,
    custom: true
  }));
  return {
    byId: {
      ...EX_BY_ID,
      ...Object.fromEntries(custom.map(c => [c.id, c]))
    },
    custom
  };
};
const exEnergy = (s, exId) => {
  const cust = (s.customExercises || []).find(c => c.id === exId);
  if (cust) return {
    met: cust.met || 6,
    min: cust.min || 2.5
  };
  return EX_ENERGY[exId] || GROUP_ENERGY[EX_GROUP_OF[exId]] || {
    met: 6,
    min: 2.5
  };
};
const kcalForDay = (s, day) => {
  if (!day) return 0;
  const kg = s.bodyKg || 77;
  let k = 0;
  Object.entries(day).forEach(([exId, cnt]) => {
    const e = exEnergy(s, exId);
    k += (cnt || 0) * e.met * kg * (e.min / 60);
  });
  return Math.round(k);
};
const kcalTotal = s => Object.values(s.training || {}).reduce((a, day) => a + kcalForDay(s, day), 0);
const bmrOf = s => {
  if (!s.bodyKg || !s.heightCm || !s.age || !s.sex) return null;
  const base = 10 * s.bodyKg + 6.25 * s.heightCm - 5 * s.age;
  return Math.round(base + (s.sex === 'h' ? 5 : -161));
};
const ACTIVITY_LEVELS = [{
  v: 1.2,
  label: 'Sedentario',
  desc: 'Poco o nada de ejercicio'
}, {
  v: 1.375,
  label: 'Ligero',
  desc: '1-3 días/sem'
}, {
  v: 1.55,
  label: 'Moderado',
  desc: '3-5 días/sem'
}, {
  v: 1.725,
  label: 'Activo',
  desc: '6-7 días/sem'
}, {
  v: 1.9,
  label: 'Muy activo',
  desc: 'Físico intenso / 2x día'
}];
// Objetivos (CUERPO → Tu objetivo). Misma tabla que el servidor (eris/src/services/DailyTargets.ts → GOALS): si cambia allá,
// cambia acá. Proteína con respaldo: con entrenamiento de fuerza, sobre ~1,6 g/kg casi no se gana más músculo y el margen llega
// a 2,2 (Morton 2018; ISSN 2017); en déficit, más alta para no perder músculo. Calorías: déficit/superávit moderados, con tope.
const GOALS = [{
  v: 'perder', label: 'Perder grasa', desc: 'Déficit moderado', kcalPct: -0.15, kcalCap: 500, prot: [1.8, 2.2], protTarget: 2.2,
  why: 'En déficit, la proteína alta protege tu músculo.'
}, {
  v: 'recomp', label: 'Recomposición', desc: 'Bajar grasa y subir músculo', kcalPct: -0.05, kcalCap: 250, prot: [1.8, 2.2], protTarget: 2.0,
  why: 'Bajar grasa y subir músculo a la vez pide proteína alta.'
}, {
  v: 'mantener', label: 'Mantener', desc: 'Salud y rendimiento', kcalPct: 0, kcalCap: 0, prot: [1.6, 2.0], protTarget: 1.6,
  why: '1,6 g/kg ya cubre lo que tu músculo aprovecha.'
}, {
  v: 'ganar', label: 'Ganar músculo', desc: 'Superávit leve', kcalPct: 0.10, kcalCap: 350, prot: [1.6, 2.2], protTarget: 1.8,
  why: 'Sobre 1,6 g/kg casi no se gana más músculo; 1,8 deja margen.'
}];
const fmtKg = n => n.toFixed(1).replace('.', ',');
const goalTargetsOf = (s, spend) => {
  const g = GOALS.find(x => x.v === s.goal) || null;
  const bmr = bmrOf(s);
  let kcal = spend || null,
    delta = 0;
  if (spend && g && g.kcalPct) {
    const d = Math.round(Math.max(-g.kcalCap, Math.min(g.kcalCap, spend * g.kcalPct)));
    const floor = Math.max(bmr || 0, s.sex === 'm' ? 1200 : 1500);
    kcal = Math.max(floor, spend + d);
    delta = kcal - spend;
  }
  // Enfermedad renal (inyectado por la app, misma regla que el servidor): la proteína es un TOPE, manda sobre el objetivo
  const rule = forgeEnv.proteinRule || {};
  const h = s.heightCm ? s.heightCm / 100 : null;
  const bmi = s.bodyKg && h ? s.bodyKg / (h * h) : null;
  const refKg = bmi && bmi >= 30 ? Math.round(25 * h * h) : s.bodyKg;
  let prot = null;
  if (refKg) {
    if (rule.cap) prot = { cap: true, target: Math.round(refKg * 0.8), perKg: 0.8, note: rule.note || '' };
    else {
      const trains = !!forgeEnv.routineMd || effActivity(s) >= 1.55 || !!g && (g.v === 'ganar' || g.v === 'recomp');
      const range = g ? g.prot : trains ? [1.6, 2.2] : [1.0, 1.2];
      const perKg = g ? g.protTarget : trains ? 1.6 : 1.2;
      prot = { cap: false, perKg, lo: Math.round(refKg * range[0]), hi: Math.round(refKg * range[1]), target: Math.round(refKg * perKg), refKg, usedRef: refKg !== s.bodyKg };
    }
  }
  return { goal: g, kcal, delta, prot };
};
const tdeeOf = s => {
  const b = bmrOf(s);
  return b == null ? null : Math.round(b * effActivity(s));
};
// Misma regla que el servidor (eris/src/services/DailyTargets.ts → extraExerciseKcal): los niveles se eligen por días de
// ejercicio a la semana, así que el mantenimiento YA trae el ejercicio de un día típico: basal × (nivel − 1,2). Un día suma
// solo lo que su ejercicio pasa de eso (antes se sumaba entero y se contaba dos veces). El ejercicio del día es el MAYOR entre
// lo anotado en Forge y lo que el reloj detectó sin modo entrenamiento (la app lo manda en los datos en vivo).
const SEDENTARY = 1.2;
// Nivel de actividad efectivo (2026-10-16, «que se moviera la barra metabólica según tu actividad real y no un estimado»):
// el AUTOMÁTICO, que la app calcula con tus últimas 4 semanas (eris-mobile/src/services/activityLevel.ts), salvo que hayas
// elegido un nivel a mano. Sin 2 semanas de datos, el elegido.
const autoLevelOf = s => s && s.autoLevel && s.autoLevel.factor >= 1.1 && s.autoLevel.factor <= 2 ? s.autoLevel : null;
const isAutoLevel = s => s.activityMode !== 'manual' && !!autoLevelOf(s);
const effActivity = s => isAutoLevel(s) ? autoLevelOf(s).factor : (s.activity || 1.375);
const typicalExerciseOf = s => {
  const b = bmrOf(s);
  return b == null ? 0 : Math.round(b * Math.max(0, effActivity(s) - SEDENTARY));
};
const watchToday = s => {
  const w = s && s.today && s.today.watch;
  return w && w.day === todayKey() && w.kcal > 0 ? w : null;
};
const watchWaterMl = w => {
  if (!w) return 0;
  const vig = Math.min(w.vigorousMin || 0, w.minutes || 0);
  return Math.min(2500, Math.round(vig * 13 + ((w.minutes || 0) - vig) * 8));
};
// Cuántos días por semana entrenas de verdad (Forge + reloj, últimas 4 semanas) y el nivel que calza. null si no hay
// al menos 2 semanas de datos o si ya calza con el elegido.
const activitySuggestion = s => {
  if (isAutoLevel(s)) return null; // el automático ya sigue lo que haces
  const active = {}, seen = {};
  Object.entries(s.training || {}).forEach(([k, d]) => {
    seen[k] = 1;
    if (Object.values(d || {}).reduce((a, b) => a + (b || 0), 0) > 0) active[k] = 1;
  });
  const wd = forgeEnv.watchDays || {};
  Object.entries(wd).forEach(([k, m]) => { seen[k] = 1; if ((m || 0) >= 20) active[k] = 1; });
  const today = todayKey();
  const from = forgeNow(); from.setDate(from.getDate() - 28);
  const fromK = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
  const first = Object.keys(seen).sort()[0];
  if (!first) return null;
  const [y, m, d] = first.split('-').map(Number);
  const covered = Math.round((forgeNow() - new Date(y, m - 1, d)) / 86400000);
  if (covered < 14) return null;
  const n = Object.keys(active).filter(k => k >= fromK && k <= today).length;
  const perWeek = n / Math.min(4, covered / 7);
  const v = perWeek < 0.75 ? 1.2 : perWeek < 3 ? 1.375 : perWeek < 5.5 ? 1.55 : 1.725;
  if (v === (s.activity || 1.375)) return null;
  const lvl = ACTIVITY_LEVELS.find(a => a.v === v);
  return lvl ? { v, label: lvl.label, perWeek: Math.round(perWeek * 10) / 10 } : null;
};
const hydrationOf = (s, todaySets, watch) => {
  if (!s.bodyKg) return null;
  // Condiciones y medicamentos (inyectado por la app, misma regla que el servidor): enfermedad renal = sin meta,
  // SGLT2 = +30 %. Antes Forge mostraba 3,2 L aunque el perfil dijera enfermedad renal.
  const rule = forgeEnv.waterRule || {};
  if (rule.off) return { off: true, note: rule.note || '' };
  // 120 ml por cada escalón de 0,175 sobre Sedentario (continuo para el nivel automático; igual en el servidor)
  const actBonusMl = Math.round(Math.max(0, (effActivity(s) - SEDENTARY) / 0.175) * 120);
  const baseMl = s.bodyKg * 35 + actBonusMl;
  const trainMin = (todaySets || 0) * 2.5;
  const setsMl = Math.round(trainMin / 60 * 600);
  const trainMl = Math.max(0, Math.max(setsMl, watchWaterMl(watch)) - actBonusMl);
  const totalMl = Math.round((baseMl + trainMl) * (rule.multiplier || 1) / 50) * 50;
  return {
    base: Math.round(baseMl / 50) * 50,
    train: trainMl,
    total: totalMl,
    cups: Math.round(totalMl / 250),
    note: rule.note || null
  };
};
const TREE_WEIGHT = 0.2;
const XP_HALFLIFE = 18;
const ageInDays = dayKey => {
  const [y, m, d] = dayKey.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const now = forgeNow();
  now.setHours(0, 0, 0, 0);
  then.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now - then) / 86400000));
};
const decayW = dayKey => Math.pow(0.5, ageInDays(dayKey) / XP_HALFLIFE);
const subgroupXp = s => {
  const acc = Object.fromEntries(ALL_SUBS.map(x => [x.id, 0]));
  const {
    byId
  } = exCatalog(s);
  const tr = s.training || {};
  Object.entries(tr).forEach(([dayKey, day]) => {
    const w = decayW(dayKey);
    Object.entries(day).forEach(([exId, cnt]) => {
      const ex = byId[exId];
      if (!ex || !cnt) return;
      const workMult = workOfSet(s, ex) / REF_WORK;
      Object.entries(ex.m).forEach(([sub, pts]) => {
        if (acc[sub] != null) acc[sub] += pts * cnt * workMult * 22 * w;
      });
    });
  });
  const TREE_TO_SUB = {
    hombros: 'delt_lat',
    pecho: 'pec_med',
    espalda: 'dorsal',
    brazos: 'biceps',
    core: 'abs',
    piernas: 'cuadriceps',
    explosivo: 'pliometria',
    agilidad: 'aereo'
  };
  SKILLS.forEach(sk => {
    const map = SKILL_MUSCLES[sk.id];
    if (!map) return;
    const steps = s.skills?.[sk.id]?.steps || [];
    const frac = steps.length ? steps.filter(Boolean).length / sk.steps.length : 0;
    if (frac <= 0) return;
    Object.entries(map).forEach(([g, pts]) => {
      const sub = TREE_TO_SUB[g];
      if (sub != null && acc[sub] != null) acc[sub] += pts * frac * 30 * TREE_WEIGHT;
    });
  });
  return acc;
};
const subLevel = xp => {
  let lvl = 1,
    rem = xp,
    need = 50;
  while (rem >= need && lvl < 30) {
    rem -= need;
    lvl++;
    need = 50 + (lvl - 1) * 10;
  }
  return {
    level: lvl,
    inLevel: Math.round(rem),
    forNext: need
  };
};
const groupLevels = s => {
  const sx = subgroupXp(s);
  const subL = {};
  ALL_SUBS.forEach(x => {
    subL[x.id] = subLevel(sx[x.id]);
  });
  const grp = {};
  MUSCLE_GROUPS.forEach(g => {
    const ls = g.subs.map(su => subL[su.id].level);
    grp[g.id] = ls.reduce((a, b) => a + b, 0) / ls.length;
  });
  return {
    subL,
    grp
  };
};
const skillPower = (grp, sk) => {
  const map = SKILL_MUSCLES[sk.id];
  if (!map) return 0;
  let num = 0,
    den = 0;
  Object.entries(map).forEach(([g, pts]) => {
    num += (grp[g] || 0) * pts;
    den += pts;
  });
  return den ? num / den : 0;
};
const TITLES = [{
  id: 't_wake',
  name: 'El que Despierta',
  desc: 'Diste el primer paso.',
  req: c => c.avg >= 2
}, {
  id: 't_const',
  name: 'Hijo de la Constancia',
  desc: 'Racha de 7 días.',
  req: c => c.bestStreak >= 7
}, {
  id: 't_iron',
  name: 'Voluntad de Hierro',
  desc: 'Racha de 21 días.',
  req: c => c.bestStreak >= 21
}, {
  id: 't_vback',
  name: 'Espalda de Halcón',
  desc: 'Espalda nivel 10+.',
  req: c => c.grp.espalda >= 10
}, {
  id: 't_delts',
  name: 'Hombros de Titán',
  desc: 'Hombros nivel 10+.',
  req: c => c.grp.hombros >= 10
}, {
  id: 't_core',
  name: 'Núcleo de Acero',
  desc: 'Core nivel 10+.',
  req: c => c.grp.core >= 10
}, {
  id: 't_athlete',
  name: 'Cuerpo Atlético',
  desc: 'Promedio nivel 8+.',
  req: c => c.avg >= 8
}, {
  id: 't_skiller',
  name: 'Aprendiz de Hechicero',
  desc: 'Domina 3 habilidades.',
  req: c => c.mastered >= 3
}, {
  id: 't_acro',
  name: 'Sombra Acrobática',
  desc: 'Domina un mortal (flip).',
  req: c => c.flips >= 1
}, {
  id: 't_machine',
  name: 'Máquina Imparable',
  desc: 'Promedio nivel 15+.',
  req: c => c.avg >= 15
}, {
  id: 't_toji',
  name: 'TOJI FUSHIGURO',
  desc: 'Promedio 20+ y 8 habilidades.',
  req: c => c.avg >= 20 && c.mastered >= 8
}];
const FLIP_IDS = ['a_back', 'a_front', 'a_side', 'a_gainer', 'a_webster', 'a_btwist', 'a_cheat', 'a_wallflip'];
const titleCtx = s => {
  const {
    grp
  } = groupLevels(s);
  const avg = MUSCLE_GROUPS.reduce((a, g) => a + grp[g.id], 0) / MUSCLE_GROUPS.length;
  const mastered = SKILLS.filter(sk => {
    const st = s.skills?.[sk.id]?.steps || [];
    return st.length && st.every(Boolean);
  }).length;
  const flips = FLIP_IDS.filter(id => {
    const st = s.skills?.[id]?.steps || [];
    return st.length && st.every(Boolean);
  }).length;
  return {
    grp,
    avg,
    mastered,
    flips,
    bestStreak: s.bestStreak || 0
  };
};
const earnedTitles = s => {
  const c = titleCtx(s);
  return TITLES.filter(t => t.req(c));
};
const SPECIALS = [{
  skill: 's_mu',
  name: 'Muscle-Up Ascendente',
  emoji: '🚀',
  mult: 1.8,
  desc: 'Golpe explosivo de tracción.'
}, {
  skill: 's_fl',
  name: 'Front Lever',
  emoji: '🦅',
  mult: 1.7,
  hits: 2,
  desc: 'Doble corte con la espalda.'
}, {
  skill: 's_planche',
  name: 'Planche Imperial',
  emoji: '✈️',
  mult: 2.0,
  desc: 'Fuerza pura de hombros.'
}, {
  skill: 'a_back',
  name: 'Mortal Atrás',
  emoji: '🔄',
  mult: 1.9,
  dodge: true,
  desc: 'Golpea y esquiva el contraataque.'
}, {
  skill: 'a_gainer',
  name: 'Gainer',
  emoji: '💫',
  mult: 2.2,
  dodge: true,
  desc: 'Acrobacia letal.'
}, {
  skill: 'p_kong',
  name: 'Kong Vault',
  emoji: '🐒',
  mult: 1.6,
  desc: 'Embiste atravesando la guardia.'
}, {
  skill: 's_wmu',
  name: 'Muscle-Up Anular',
  emoji: '💍',
  mult: 1.9,
  hits: 2,
  desc: 'Tracción y empuje en anillas.'
}, {
  skill: 's_planchepu',
  name: 'Planche Push',
  emoji: '✈️',
  mult: 2.4,
  desc: 'Empuje imposible.'
}, {
  skill: 's_oac',
  name: 'Tracción Fantasma',
  emoji: '☝️',
  mult: 2.3,
  desc: 'Un solo brazo, daño brutal.'
}, {
  skill: 's_oapush',
  name: 'Pistón de Un Brazo',
  emoji: '🤛',
  mult: 2.2,
  desc: 'Empuje unilateral demoledor.'
}, {
  skill: 's_archer',
  name: 'Tracción Arquera',
  emoji: '🏹',
  mult: 1.8,
  hits: 2,
  desc: 'Dispara desde ambos flancos.'
}, {
  skill: 'a_540',
  name: 'Patada 540',
  emoji: '🌀',
  mult: 2.1,
  dodge: true,
  desc: 'Giro letal con esquiva.'
}, {
  skill: 'a_cork',
  name: 'Tornado',
  emoji: '🌪️',
  mult: 2.5,
  dodge: true,
  desc: 'Mortal con giro, imposible de seguir.'
}, {
  skill: 'a_dblback',
  name: 'Doble Mortal',
  emoji: '💥',
  mult: 2.8,
  dodge: true,
  desc: 'Élite: golpe y desaparición.'
}, {
  skill: 'c_toji',
  name: 'Técnica Prohibida',
  emoji: '🥷',
  mult: 3.0,
  dodge: true,
  desc: 'El golpe definitivo de Toji.'
}];
const DUNGEONS = [{
  id: 'd1',
  name: 'Gimnasio Abandonado',
  need: 0,
  color: '#7a8a99',
  monsters: [{
    name: 'Sedentarismo',
    emoji: '🛋️',
    hp: 60,
    atk: 6
  }, {
    name: 'Excusa Matutina',
    emoji: '😴',
    hp: 90,
    atk: 9
  }, {
    name: 'JEFE: El Sofá Eterno',
    emoji: '👑',
    hp: 160,
    atk: 13,
    boss: true
  }]
}, {
  id: 'd2',
  name: 'Cripta del Azúcar',
  need: 90,
  color: '#c77dff',
  monsters: [{
    name: 'Antojo Nocturno',
    emoji: '🍩',
    hp: 120,
    atk: 12
  }, {
    name: 'Bajón de Energía',
    emoji: '📉',
    hp: 150,
    atk: 15
  },  {
    name: 'JEFE: Antojo Descontrolado',
    emoji: '🌀',
    hp: 260,
    atk: 19,
    boss: true
  }]
}, {
  id: 'd3',
  name: 'Torre de la Constancia',
  need: 150,
  color: '#4ea8de',
  monsters: [{
    name: 'Procrastinación',
    emoji: '⏳',
    hp: 180,
    atk: 16
  }, {
    name: 'Meseta',
    emoji: '🗿',
    hp: 230,
    atk: 20
  }, {
    name: 'Desmotivación',
    emoji: '🥀',
    hp: 270,
    atk: 22
  }, {
    name: 'JEFE: El Yo del Pasado',
    emoji: '👤',
    hp: 360,
    atk: 25,
    boss: true
  }]
}, {
  id: 'd4',
  name: 'Dominio Maldito',
  need: 240,
  color: '#ff7a4e',
  monsters: [{
    name: 'Duda',
    emoji: '🌫️',
    hp: 280,
    atk: 22
  }, {
    name: 'Fatiga Crónica',
    emoji: '😵',
    hp: 360,
    atk: 27
  }, {
    name: 'Lesión Acechante',
    emoji: '🤕',
    hp: 420,
    atk: 29
  }, {
    name: 'JEFE: El Saboteador',
    emoji: '🃏',
    hp: 540,
    atk: 33,
    boss: true
  }]
}, {
  id: 'd5',
  name: 'Sombra Interior',
  need: 350,
  color: '#ff3b4e',
  monsters: [{
    name: 'Miedo al Fracaso',
    emoji: '🕳️',
    hp: 460,
    atk: 30
  }, {
    name: 'Comodidad',
    emoji: '🛏️',
    hp: 520,
    atk: 33
  }, {
    name: 'Viejo Hábito',
    emoji: '⛓️',
    hp: 600,
    atk: 36
  }, {
    name: 'JEFE: Sombra de Toji',
    emoji: '🥷',
    hp: 820,
    atk: 42,
    boss: true
  }]
}];
const ENEMY_TIERS = {
  bicho: {
    label: 'BICHOS',
    color: '#3ddc97',
    desc: 'Pequeños. Pan comido entrenando.'
  },
  persona: {
    label: 'PERSONAS',
    color: '#f5c542',
    desc: 'Humanos. Pelea pareja según tu nivel.'
  },
  bestia: {
    label: 'BESTIAS · letales',
    color: '#ff3b4e',
    desc: 'La ciencia dice que desarmado no ganas. Pruébalo igual.'
  },
  comun: {
    label: 'COMUNES',
    color: '#56b3ff',
    desc: 'Carne de cañón de la fantasía.'
  },
  elite: {
    label: 'ÉLITE',
    color: '#c77dff',
    desc: 'Ya muerden. Reto parejo.'
  },
  jefe: {
    label: 'JEFES',
    color: '#ff7a4e',
    desc: 'El lujo de la fantasía: túmbalos y eres leyenda.'
  }
};
const REAL_TIERS = ['bicho', 'persona', 'bestia'];
const FANTASY_TIERS = ['comun', 'elite', 'jefe'];
const REAL_ENEMIES = [{
  id: 'r1',
  tier: 'bicho',
  name: 'Gato',
  emoji: '🐱',
  hp: 22,
  atk: 4,
  need: 0,
  xp: 10,
  note: '~4 kg. Lo controlas con las manos.'
}, {
  id: 'r2',
  tier: 'bicho',
  name: 'Gallo',
  emoji: '🐓',
  hp: 30,
  atk: 5,
  need: 0,
  xp: 12,
  note: '~3 kg. Espolones molestos.'
}, {
  id: 'r3',
  tier: 'bicho',
  name: 'Rata gigante',
  emoji: '🐀',
  hp: 40,
  atk: 7,
  need: 15,
  xp: 16,
  note: 'Muerde y huye. Asquerosa.'
}, {
  id: 'r4',
  tier: 'bicho',
  name: 'Ganso',
  emoji: '🪿',
  hp: 55,
  atk: 9,
  need: 25,
  xp: 20,
  note: '~5 kg, territorial.'
}, {
  id: 'r5',
  tier: 'bicho',
  name: 'Perro callejero',
  emoji: '🐕',
  hp: 80,
  atk: 14,
  need: 45,
  xp: 26,
  note: '~10 kg. Con técnica lo reduces.'
}, {
  id: 'r6',
  tier: 'persona',
  name: 'Borracho',
  emoji: '🥴',
  hp: 120,
  atk: 18,
  need: 70,
  xp: 32,
  note: 'Sin coordinación. Tú estás sobrio.'
}, {
  id: 'r7',
  tier: 'persona',
  name: 'Carterista',
  emoji: '🏃',
  hp: 140,
  atk: 20,
  need: 95,
  xp: 38,
  note: 'Rápido y escurridizo.'
}, {
  id: 'r8',
  tier: 'persona',
  name: 'Adulto promedio',
  emoji: '🧑',
  hp: 200,
  atk: 30,
  need: 120,
  xp: 48,
  note: 'Tu peso, sin entrenar. Pelea pareja.'
}, {
  id: 'r9',
  tier: 'persona',
  name: 'Matón de barrio',
  emoji: '🧔',
  hp: 250,
  atk: 36,
  need: 165,
  xp: 60,
  note: 'Sabe pelear y pega fuerte.'
}, {
  id: 'r10',
  tier: 'bestia',
  name: 'Perro grande (pitbull)',
  emoji: '🐕‍🦺',
  hp: 320,
  atk: 46,
  need: 210,
  xp: 78,
  note: '~30 kg, mordida ~1100 N. Muy peligroso.'
}, {
  id: 'r11',
  tier: 'bestia',
  name: 'Chimpancé',
  emoji: '🦧',
  hp: 950,
  atk: 92,
  need: 260,
  xp: 0,
  impossible: true,
  note: '~1.5× tu fuerza, sin control de daño.'
}, {
  id: 'r12',
  tier: 'bestia',
  name: 'Lobo',
  emoji: '🐺',
  hp: 850,
  atk: 82,
  need: 300,
  xp: 0,
  impossible: true,
  note: 'Mordida ~400 PSI, cazador.'
}, {
  id: 'r13',
  tier: 'bestia',
  name: 'Jabalí',
  emoji: '🐗',
  hp: 1050,
  atk: 90,
  need: 340,
  xp: 0,
  impossible: true,
  note: '~90 kg. Embiste y corta.'
}, {
  id: 'r14',
  tier: 'bestia',
  name: 'Puma',
  emoji: '🐆',
  hp: 1150,
  atk: 108,
  need: 400,
  xp: 0,
  impossible: true,
  note: 'Te derriba por el cuello.'
}, {
  id: 'r15',
  tier: 'bestia',
  name: 'Toro',
  emoji: '🐂',
  hp: 1400,
  atk: 115,
  need: 460,
  xp: 0,
  impossible: true,
  note: '~700 kg de embestida.'
}, {
  id: 'r16',
  tier: 'bestia',
  name: 'Gorila',
  emoji: '🦍',
  hp: 2100,
  atk: 155,
  need: 540,
  xp: 0,
  impossible: true,
  note: 'Fuerza varias veces la humana.'
}, {
  id: 'r17',
  tier: 'bestia',
  name: 'Oso pardo',
  emoji: '🐻',
  hp: 2700,
  atk: 195,
  need: 640,
  xp: 0,
  impossible: true,
  note: '~400 kg, zarpazo que abre carne.'
}];
const FANTASY_ENEMIES = [{
  id: 'f1',
  tier: 'comun',
  name: 'Slime',
  emoji: '🟢',
  hp: 70,
  atk: 9,
  need: 0,
  xp: 16,
  note: 'Buen calentamiento.'
}, {
  id: 'f2',
  tier: 'comun',
  name: 'Murciélago',
  emoji: '🦇',
  hp: 95,
  atk: 12,
  need: 30,
  xp: 20,
  note: 'Errático y molesto.'
}, {
  id: 'f3',
  tier: 'comun',
  name: 'Goblin',
  emoji: '👺',
  hp: 120,
  atk: 14,
  need: 50,
  xp: 24,
  note: 'Pequeño y traicionero.'
}, {
  id: 'f4',
  tier: 'comun',
  name: 'Esqueleto',
  emoji: '☠️',
  hp: 160,
  atk: 19,
  need: 80,
  xp: 30,
  note: 'Sin carne, sin miedo.'
}, {
  id: 'f5',
  tier: 'comun',
  name: 'Araña gigante',
  emoji: '🕷️',
  hp: 200,
  atk: 23,
  need: 110,
  xp: 36,
  note: 'Veneno y patas rápidas.'
}, {
  id: 'f6',
  tier: 'elite',
  name: 'Orco',
  emoji: '🧌',
  hp: 255,
  atk: 28,
  need: 140,
  xp: 44,
  note: 'Fuerza bruta y mal genio.'
}, {
  id: 'f7',
  tier: 'elite',
  name: 'Huargo',
  emoji: '🐺',
  hp: 320,
  atk: 35,
  need: 185,
  xp: 56,
  note: 'Lobo gigante de las sombras.'
}, {
  id: 'f8',
  tier: 'elite',
  name: 'Gólem de piedra',
  emoji: '🗿',
  hp: 400,
  atk: 44,
  need: 235,
  xp: 70,
  note: 'Lento pero durísimo.'
}, {
  id: 'f9',
  tier: 'elite',
  name: 'Vampiro',
  emoji: '🧛',
  hp: 480,
  atk: 54,
  need: 295,
  xp: 86,
  note: 'Roba vida con cada golpe.'
}, {
  id: 'f10',
  tier: 'elite',
  name: 'Ogro',
  emoji: '👹',
  hp: 580,
  atk: 64,
  need: 360,
  xp: 102,
  note: 'Garrote y mal aliento.'
}, {
  id: 'f11',
  tier: 'jefe',
  name: 'Troll',
  emoji: '🧟',
  hp: 700,
  atk: 74,
  need: 430,
  xp: 122,
  note: 'Se regenera si lo dejas respirar.'
}, {
  id: 'f12',
  tier: 'jefe',
  name: 'Demonio',
  emoji: '😈',
  hp: 850,
  atk: 88,
  need: 510,
  xp: 144,
  note: 'Llamas y malicia pura.'
}, {
  id: 'f13',
  tier: 'jefe',
  name: 'Dragón',
  emoji: '🐉',
  hp: 1050,
  atk: 104,
  need: 610,
  xp: 175,
  note: 'Derrótalo y eres leyenda.'
}, {
  id: 'f14',
  tier: 'jefe',
  name: 'Liche',
  emoji: '💀',
  hp: 1300,
  atk: 124,
  need: 730,
  xp: 210,
  note: 'Hechicero no-muerto. Magia letal.'
}, {
  id: 'f15',
  tier: 'jefe',
  name: 'Señor del Inframundo',
  emoji: '👑',
  hp: 1600,
  atk: 145,
  need: 870,
  xp: 260,
  note: 'El jefe final absoluto.'
}];
const monsterOf = f => f.mode === 'enemy' ? f.enemy : (DUNGEONS.find(d => d.id === f.dungeonId) || {
  monsters: []
}).monsters[f.idx];
const combatStats = s => {
  const {
    grp
  } = groupLevels(s);
  const avg = MUSCLE_GROUPS.reduce((a, g) => a + grp[g.id], 0) / MUSCLE_GROUPS.length;
  const tb = {
    atk: 0,
    hp: 0,
    def: 0,
    crit: 0,
    critDmg: 0,
    eva: 0,
    vigor: 0
  };
  let mastered = 0;
  SKILLS.forEach(sk => {
    if (!isMastered(s, sk.id)) return;
    mastered++;
    const w = 0.5 + sk.lvl * 0.04;
    if (sk.cat === 'fuerza') {
      tb.atk += 1.0 * w;
      tb.hp += 1.5 * w;
    } else if (sk.cat === 'fund') {
      tb.hp += 2.5 * w;
      tb.def += 0.5 * w;
    } else if (sk.cat === 'parkour') {
      tb.eva += 0.008 * w;
      tb.crit += 0.004 * w;
      tb.vigor += 0.25 * w;
    } else if (sk.cat === 'acro') {
      tb.critDmg += 0.025 * w;
      tb.crit += 0.006 * w;
      tb.atk += 0.4 * w;
    } else if (sk.cat === 'final') {
      tb.atk += 18;
      tb.hp += 70;
      tb.def += 5;
      tb.crit += 0.1;
      tb.critDmg += 0.5;
      tb.eva += 0.08;
      tb.vigor += 6;
    }
  });
  const lvlNow = computeLevel(getTotalXp(s)).level;
  const ex = {
    atk: lvlNow * 0.6,
    hp: lvlNow * 2.5,
    def: lvlNow * 0.25
  };
  const cm = {
    atk: 0,
    hp: 0,
    def: 0,
    eva: 0,
    crit: 0,
    critDmg: 0,
    vigor: 0
  };
  (s.classes || []).forEach(id => {
    const c = CLASS_BY_ID[id];
    if (c) Object.entries(c.boosts).forEach(([k, v]) => {
      cm[k] += v;
    });
  });
  const titlesN = earnedTitles(s).length;
  const bestByEx = {};
  const tmAll = s.trainMeta || {};
  Object.values(tmAll).forEach(day => Object.entries(day).forEach(([id, info]) => {
    const sets = Array.isArray(info.sets) ? info.sets : info.reps != null ? [info.reps] : [];
    const kg = info.kg || 0;
    sets.forEach(r => {
      const sc = r * (1 + kg * 0.04);
      if (sc > (bestByEx[id] || 0)) bestByEx[id] = sc;
    });
  }));
  const prScore = Object.values(bestByEx).reduce((a, b) => a + b, 0);
  const rec = {
    atk: titlesN * 1.5 + prScore * 0.03,
    hp: titlesN * 6 + prScore * 0.05,
    def: titlesN * 0.5
  };
  const records = {
    titles: titlesN,
    pr: Math.round(prScore),
    atk: Math.round(rec.atk),
    hp: Math.round(rec.hp),
    def: Math.round(rec.def)
  };
  const atk = Math.round(6 + avg * 1.5 + (grp.brazos + grp.hombros + grp.pecho) * 0.35 + tb.atk + ex.atk + rec.atk);
  const baseHp = 80 + grp.core * 6 + avg * 4 + tb.hp + ex.hp + rec.hp;
  const t = s.today || {};
  let frac = 0;
  const condActive = [];
  // Solo sueño y pasos: comida/hidratación se trackean en Nutrición (no hay
  // contador propio en Forge) y glucosa es específico de GlucoTrack. Pesos
  // repartidos 50/50 entre las dos condiciones que Forge sí sigue.
  // t.sleep/t.steps ahora son números reales (Health Connect), no booleanos
  // — hay que compararlos contra el threshold, no solo truthy.
  const sleepOk = (t.sleep || 0) >= SLEEP_THRESHOLD;
  const stepsOk = (t.steps || 0) >= STEPS_THRESHOLD;
  if (sleepOk) {
    frac += 0.50;
    condActive.push('sueño');
  }
  if (stepsOk) {
    frac += 0.50;
    condActive.push('pasos');
  }
  const habitPct = Math.min(0.15, frac * 0.15);
  const streakPct = Math.min(0.10, (s.streak || 0) * 0.005);
  const condHp = Math.round(baseHp * (habitPct + streakPct));
  const condVigor = (sleepOk ? 1 : 0) + (stepsOk ? 1 : 0);
  const maxHp = Math.round(baseHp + condHp);
  const crit = Math.min(0.6, 0.05 + grp.agilidad * 0.012 + tb.crit);
  const critDmg = Math.round((1.5 + grp.explosivo * 0.06 + tb.critDmg) * 100) / 100;
  const def = Math.round(grp.core * 0.5 + grp.espalda * 0.4 + tb.def + ex.def + rec.def);
  const eva = Math.min(0.5, grp.agilidad * 0.01 + grp.piernas * 0.006 + tb.eva);
  const vigor = Math.round(grp.piernas * 0.5 + grp.core * 0.2 + tb.vigor + condVigor);
  const cond = {
    hp: condHp,
    vigor: condVigor,
    pct: Math.round((habitPct + streakPct) * 100),
    streakPct: Math.round(streakPct * 100),
    active: condActive
  };
  const exp = {
    lvl: lvlNow,
    atk: Math.round(ex.atk),
    hp: Math.round(ex.hp),
    def: Math.round(ex.def)
  };
  const tree = {
    atk: Math.round(tb.atk),
    hp: Math.round(tb.hp),
    def: Math.round(tb.def),
    crit: Math.round(tb.crit * 100),
    critDmg: Math.round(tb.critDmg * 100) / 100,
    eva: Math.round(tb.eva * 100),
    vigor: Math.round(tb.vigor),
    mastered
  };
  const specials = SPECIALS.filter(sp => {
    const st = s.skills?.[sp.skill]?.steps || [];
    return st.length && st.every(Boolean);
  }).map(sp => ({
    ...sp,
    power: skillPower(grp, SKILL_BY_ID[sp.skill])
  }));
  const classBoost = {
    atk: Math.round(cm.atk * 100),
    hp: Math.round(cm.hp * 100),
    def: Math.round(cm.def * 100),
    eva: Math.round(cm.eva * 100),
    crit: Math.round(cm.crit * 100),
    critDmg: Math.round(cm.critDmg * 100),
    vigor: Math.round(cm.vigor * 100),
    list: (s.classes || []).map(id => CLASS_BY_ID[id]).filter(Boolean)
  };
  const fAtk = Math.round(atk * (1 + cm.atk)),
    fHp = Math.round(maxHp * (1 + cm.hp)),
    fDef = Math.round(def * (1 + cm.def)),
    fVigor = Math.round(vigor * (1 + cm.vigor));
  const power = Math.round(fAtk * 2 + fHp * 0.25 + fDef + fVigor);
  return {
    atk: fAtk,
    maxHp: fHp,
    crit: Math.min(0.7, crit * (1 + cm.crit)),
    critDmg: Math.round(critDmg * (1 + cm.critDmg) * 100) / 100,
    def: fDef,
    eva: Math.min(0.55, eva * (1 + cm.eva)),
    vigor: fVigor,
    avg,
    grp,
    specials,
    tree,
    cond,
    exp,
    classBoost,
    records,
    power
  };
};
const SKILL_BY_ID2 = SKILL_BY_ID;
const SKILL_MUSCLES = {
  f_mob: {
    core: 1,
    agilidad: 1
  },
  f_core: {
    core: 2
  },
  f_grip: {
    brazos: 2
  },
  f_squat: {
    piernas: 2
  },
  f_push: {
    pecho: 2,
    brazos: 1
  },
  f_land: {
    piernas: 1,
    agilidad: 2
  },
  f_roll: {
    agilidad: 2,
    core: 1
  },
  s_row: {
    espalda: 2,
    brazos: 1
  },
  s_pull: {
    espalda: 2,
    brazos: 2
  },
  s_dip: {
    pecho: 2,
    brazos: 2
  },
  s_lsit: {
    core: 2,
    brazos: 1
  },
  s_pistol: {
    piernas: 2,
    agilidad: 1
  },
  s_jump: {
    piernas: 1,
    explosivo: 2
  },
  s_hand: {
    hombros: 2,
    core: 1,
    agilidad: 1
  },
  s_mu: {
    espalda: 2,
    pecho: 1,
    brazos: 2,
    explosivo: 1
  },
  s_fl: {
    espalda: 2,
    core: 2
  },
  s_bl: {
    espalda: 2,
    hombros: 1
  },
  s_dragon: {
    core: 2,
    espalda: 1
  },
  s_flag: {
    core: 2,
    espalda: 1,
    hombros: 1
  },
  s_hspu: {
    hombros: 2,
    brazos: 1
  },
  s_planche: {
    hombros: 2,
    pecho: 1,
    core: 1,
    brazos: 1
  },
  s_vsit: {
    core: 2,
    piernas: 1
  },
  s_oac: {
    espalda: 2,
    brazos: 2
  },
  p_bal: {
    agilidad: 2,
    piernas: 1
  },
  p_drop: {
    piernas: 1,
    agilidad: 1
  },
  p_prec: {
    piernas: 1,
    explosivo: 1,
    agilidad: 1
  },
  p_safety: {
    agilidad: 1,
    piernas: 1
  },
  p_lazy: {
    agilidad: 2
  },
  p_speed: {
    explosivo: 1,
    agilidad: 1
  },
  p_underbar: {
    agilidad: 2,
    core: 1
  },
  p_precspin: {
    agilidad: 2,
    explosivo: 1
  },
  p_cat: {
    espalda: 1,
    brazos: 1,
    explosivo: 1,
    agilidad: 1
  },
  p_stride: {
    piernas: 1,
    explosivo: 1
  },
  p_dash: {
    explosivo: 1,
    agilidad: 2
  },
  p_kong: {
    hombros: 1,
    explosivo: 2,
    agilidad: 1
  },
  p_wallrun: {
    piernas: 1,
    explosivo: 2,
    agilidad: 1
  },
  p_kongprec: {
    explosivo: 2,
    agilidad: 2
  },
  a_cart: {
    agilidad: 2,
    hombros: 1
  },
  a_cond: {
    explosivo: 2,
    core: 1
  },
  a_roundoff: {
    explosivo: 2,
    agilidad: 1
  },
  a_macaco: {
    explosivo: 1,
    agilidad: 2
  },
  a_fhs: {
    explosivo: 1,
    agilidad: 2
  },
  a_back: {
    explosivo: 2,
    agilidad: 2
  },
  f_hollow: {
    core: 2
  },
  f_arch: {
    core: 1,
    espalda: 1
  },
  f_wrist: {
    brazos: 1
  },
  s_germanhang: {
    espalda: 1,
    hombros: 1
  },
  s_skincat: {
    espalda: 1,
    core: 1
  },
  s_ringsupport: {
    hombros: 2,
    brazos: 1
  },
  s_pseudo: {
    hombros: 2,
    pecho: 1
  },
  s_archer: {
    espalda: 2,
    brazos: 1
  },
  s_oapush: {
    pecho: 2,
    brazos: 2
  },
  s_nordic: {
    piernas: 2
  },
  s_shrimp: {
    piernas: 2
  },
  p_climbup: {
    espalda: 1,
    brazos: 1,
    explosivo: 1
  },
  p_reverse: {
    agilidad: 2
  },
  p_palmspin: {
    agilidad: 2
  },
  p_doublekong: {
    explosivo: 2,
    agilidad: 1
  },
  a_raiz: {
    explosivo: 2,
    agilidad: 1
  },
  a_540: {
    explosivo: 2,
    agilidad: 2
  },
  a_arabian: {
    explosivo: 2,
    agilidad: 2
  },
  a_cork: {
    explosivo: 2,
    agilidad: 2
  },
  a_dblback: {
    explosivo: 2,
    agilidad: 2
  },
  a_front: {
    explosivo: 2,
    agilidad: 2
  },
  a_side: {
    explosivo: 2,
    agilidad: 2
  },
  a_bhs: {
    explosivo: 1,
    agilidad: 2,
    espalda: 1
  },
  a_webster: {
    explosivo: 2,
    agilidad: 1
  },
  a_wallflip: {
    explosivo: 2,
    agilidad: 2
  },
  a_gainer: {
    explosivo: 2,
    agilidad: 2
  },
  a_btwist: {
    explosivo: 2,
    agilidad: 2
  },
  a_cheat: {
    explosivo: 2,
    agilidad: 2
  },
  c_toji: {
    hombros: 2,
    espalda: 2,
    core: 2,
    explosivo: 2,
    agilidad: 2
  },
  s_scap: {
    espalda: 2
  },
  s_ringdip: {
    pecho: 2,
    brazos: 2
  },
  s_handwalk: {
    hombros: 2,
    core: 1,
    agilidad: 1
  },
  s_flpull: {
    espalda: 2,
    core: 1
  },
  s_wmu: {
    espalda: 2,
    brazos: 2,
    pecho: 1,
    explosivo: 1
  },
  s_planchepu: {
    hombros: 2,
    pecho: 2,
    core: 1
  },
  s_manna: {
    core: 2,
    hombros: 1
  }
};
const NODE = 56,
  COLW = 84,
  ROWH = 122,
  PADX = 38,
  PADY = 34;
const LAYOUT = (() => {
  const depth = {};
  const calc = id => {
    if (depth[id] != null) return depth[id];
    const sk = SKILL_BY_ID[id];
    if (!sk.prereq.length) {
      depth[id] = 0;
      return 0;
    }
    let d = 0;
    sk.prereq.forEach(p => {
      d = Math.max(d, 1 + calc(p));
    });
    depth[id] = d;
    return d;
  };
  SKILLS.forEach(s => calc(s.id));
  const maxD = Math.max(...Object.values(depth));
  const rows = Array.from({
    length: maxD + 1
  }, () => []);
  SKILLS.forEach(s => rows[depth[s.id]].push(s.id));
  const catOrder = Object.fromEntries(CATS.map((c, i) => [c.id, i]));
  rows.forEach(r => r.sort((a, b) => catOrder[SKILL_BY_ID[a].cat] - catOrder[SKILL_BY_ID[b].cat] || SKILL_BY_ID[a].lvl - SKILL_BY_ID[b].lvl));
  const pos = {};
  rows.forEach(r => r.forEach((id, i) => {
    pos[id] = i;
  }));
  for (let s = 0; s < 4; s++) {
    for (let d = 1; d < rows.length; d++) {
      rows[d].sort((a, b) => {
        const pa = SKILL_BY_ID[a].prereq,
          pb = SKILL_BY_ID[b].prereq;
        const ba = pa.length ? pa.reduce((x, p) => x + pos[p], 0) / pa.length : pos[a];
        const bb = pb.length ? pb.reduce((x, p) => x + pos[p], 0) / pb.length : pos[b];
        return ba - bb;
      });
      rows[d].forEach((id, i) => {
        pos[id] = i;
      });
    }
  }
  const maxRow = Math.max(...rows.map(r => r.length));
  const width = PADX * 2 + (maxRow - 1) * COLW + NODE;
  const height = PADY * 2 + (rows.length - 1) * ROWH + NODE;
  const coord = {};
  rows.forEach((r, d) => {
    const rowW = (r.length - 1) * COLW;
    const startX = (width - NODE) / 2 - rowW / 2;
    r.forEach((id, i) => {
      coord[id] = {
        x: startX + i * COLW,
        y: PADY + d * ROWH
      };
    });
  });
  return {
    coord,
    width,
    height
  };
})();
const center = id => ({
  cx: LAYOUT.coord[id].x + NODE / 2,
  cy: LAYOUT.coord[id].y + NODE / 2
});
const freshToday = k => ({
  dayKey: k,
  workout: false,
  // steps/sleep: número real (pasos del día, horas dormidas), no booleano —
  // los llena el puente de datos en vivo, no un tap manual.
  steps: 0,
  sleep: 0,
  claimed: false
});
const defaultState = () => ({
  version: 4,
  bankedXp: 0,
  streak: 0,
  bestStreak: 0,
  lastClaimedDay: null,
  today: freshToday(todayKey()),
  counters: {
    workouts: 0,
    
    sleepDays: 0,
    stepDays: 0,
    mealsLogged: 0,
    waterDays: 0,
    daysActive: 0
  },
  skills: {},
  training: {},
  customExercises: [],
  weights: {},
  bodyKg: null,
  heightCm: null,
  age: null,
  sex: null,
  activity: 1.375,
  goal: null,
  title: null,
  dungeons: {},
  reps: {},
  plan: {},
  log: [],
  classes: [],
  trainMeta: {}
});
// Calculadas a partir del array MISSIONS (fuente única de verdad, también
// usado por el render y por mToggle/mSetCount) — así quitar/agregar una
// misión no requiere tocar esta lógica aparte.
// 'auto' se completa solo al cruzar el threshold (igual que 'toggle': todo o
// nada), la diferencia es que el valor lo pone el puente de datos en vivo,
// no un tap del usuario.
const missionIsDone = (m, t) => {
  if (m.type === 'count') return (t[m.key] || 0) >= m.max;
  if (m.type === 'auto') return (t[m.key] || 0) >= m.threshold;
  return !!t[m.key];
};
const missionsDone = t => {
  if (!t) return 0;
  return MISSIONS.filter(m => missionIsDone(m, t)).length;
};
const allDone = t => !!t && missionsDone(t) >= MISSIONS.length;
const todayXp = t => {
  if (!t) return 0;
  let xp = 0;
  MISSIONS.forEach(m => {
    if (m.type === 'count') xp += Math.min(t[m.key] || 0, m.max) * m.xp;
    else if (missionIsDone(m, t)) xp += m.xp;
  });
  if (allDone(t)) xp += 30; // bonus por completar el 100% del día
  return xp;
};
const isMastered = (s, id) => {
  const st = s.skills?.[id]?.steps;
  const sk = SKILL_BY_ID[id];
  return !!st && st.length === sk.steps.length && st.every(Boolean);
};
const skillXpOf = s => SKILLS.reduce((a, sk) => a + (isMastered(s, sk.id) ? sk.xp : 0), 0);
const GEN_WORK_FACTOR = 0.02;
const routineIntensity = s => {
  const {
    byId
  } = exCatalog(s);
  let sumLoadW = 0,
    sumW = 0;
  Object.entries(s.training || {}).forEach(([dk, day]) => {
    const w = decayW(dk);
    Object.entries(day).forEach(([id, sets]) => {
      const ex = byId[id];
      if (!ex || !sets) return;
      sumLoadW += effLoadKg(s, ex) * sets * w;
      sumW += sets * w;
    });
  });
  const avgLoad = sumW ? sumLoadW / sumW : 0;
  const base = (s.bodyKg || 70) * 0.55;
  const factor = sumW ? Math.max(0.5, Math.min(2.2, avgLoad / base)) : 1;
  const label = !sumW ? 'Sin datos' : factor < 0.85 ? 'Suave' : factor < 1.15 ? 'Estándar' : factor < 1.6 ? 'Intensa' : 'Brutal';
  return {
    factor,
    label,
    avgLoad: Math.round(avgLoad)
  };
};
const intensityMult = s => {
  const f = routineIntensity(s).factor;
  return Math.max(0.8, Math.min(1.7, 1 + (f - 1) * 0.5));
};
let trainXpOf = s => Math.round(Object.values(s.training || {}).reduce((a, day) => a + dayWork(s, day), 0) * GEN_WORK_FACTOR * intensityMult(s));
const getTotalXp = s => s.bankedXp + todayXp(s.today) + skillXpOf(s) + trainXpOf(s);
const xpThreshold = lvl => 90 + (lvl - 1) * 30;
const computeLevel = total => {
  let level = 1,
    rem = total;
  while (level < MAX_LEVEL && rem >= xpThreshold(level)) {
    rem -= xpThreshold(level);
    level++;
  }
  return {
    level,
    xpInLevel: level >= MAX_LEVEL ? 0 : rem,
    xpForNext: level >= MAX_LEVEL ? 0 : xpThreshold(level)
  };
};
const rankFor = lvl => {
  if (lvl >= 80) return {
    name: 'TOJI FUSHIGURO',
    tag: 'Forma final · sin límites'
  };
  if (lvl >= 70) return {
    name: 'Sin Cadenas',
    tag: 'Cuerpo y movimiento libres'
  };
  if (lvl >= 60) return {
    name: 'Depredador',
    tag: 'Acrobacia y poder'
  };
  if (lvl >= 50) return {
    name: 'Sombra Ágil',
    tag: 'Te mueves como el agua'
  };
  if (lvl >= 40) return {
    name: 'Movimiento Fluido',
    tag: 'Fuerza en movimiento'
  };
  if (lvl >= 30) return {
    name: 'Cuerpo Forjado',
    tag: 'Fuerza real y control'
  };
  if (lvl >= 20) return {
    name: 'Atleta',
    tag: 'Ya no eres principiante'
  };
  if (lvl >= 10) return {
    name: 'Guerrero en Ascenso',
    tag: 'La grasa retrocede'
  };
  if (lvl >= 5) return {
    name: 'Aspirante',
    tag: 'El hábito echa raíces'
  };
  return {
    name: 'El Despertar',
    tag: 'Todo gran físico empieza aquí'
  };
};
const TIER_PHYS = {
  T1: {
    sw: 32,
    ww: 27,
    aw: 5.5,
    lw: 9,
    def: 0.0,
    glow: 0
  },
  T2: {
    sw: 35,
    ww: 26,
    aw: 6.5,
    lw: 10,
    def: 0.25,
    glow: 0
  },
  T3: {
    sw: 39,
    ww: 24,
    aw: 7.5,
    lw: 11,
    def: 0.55,
    glow: 4
  },
  T4: {
    sw: 42,
    ww: 22,
    aw: 9,
    lw: 12,
    def: 0.80,
    glow: 8
  },
  T5: {
    sw: 45,
    ww: 21,
    aw: 10,
    lw: 13,
    def: 1.0,
    glow: 13
  }
};
const tierFor = lvl => lvl >= 70 ? 'T5' : lvl >= 50 ? 'T4' : lvl >= 30 ? 'T3' : lvl >= 10 ? 'T2' : 'T1';
const applyClaim = s => {
  const t = s.today;
  if (t.claimed || missionsDone(t) < MISSIONS_TO_CLAIM) return s;
  const tk = t.dayKey;
  let streak;
  if (s.lastClaimedDay === prevKey(tk)) streak = s.streak + 1;else if (s.lastClaimedDay === tk) streak = s.streak;else streak = 1;
  return {
    ...s,
    today: {
      ...t,
      claimed: true
    },
    streak,
    bestStreak: Math.max(s.bestStreak, streak),
    lastClaimedDay: tk
  };
};
/** Forge 2.0: reemplaza el cálculo del XP de entrenamiento (forgeCore lo hace por serie). */
const setTrainXpOf = fn => { trainXpOf = fn; };


export {
  ACTIVITY_LEVELS,
  ALL_SUBS,
  CATS,
  CAT_STATS,
  CLASSES,
  CLASS_BY_ID,
  DUNGEONS,
  ENEMY_TIERS,
  EX_BY_ID,
  EX_ENERGY,
  EX_GROUPS,
  EX_GROUP_OF,
  FANTASY_ENEMIES,
  FANTASY_TIERS,
  FLIP_IDS,
  GEN_WORK_FACTOR,
  GOALS,
  GROUP_BY_ID,
  GROUP_ENERGY,
  GROUP_OF_SUB,
  INTENSITY,
  LAYOUT,
  MAX_LEVEL,
  MISSIONS,
  MISSIONS_TO_CLAIM,
  MUSCLE_GROUPS,
  NODE,
  REAL_ENEMIES,
  REAL_TIERS,
  REF_WORK,
  S,
  SEDENTARY,
  SKILLS,
  SKILL_BY_ID,
  SKILL_BY_ID2,
  SKILL_MUSCLES,
  SLEEP_THRESHOLD,
  SPECIALS,
  STEPS_THRESHOLD,
  SUB_BY_ID,
  TIER_PHYS,
  TITLES,
  TREE_WEIGHT,
  XP_HALFLIFE,
  activitySuggestion,
  ageInDays,
  allDone,
  applyClaim,
  autoLevelOf,
  bmrOf,
  center,
  combatStats,
  computeLevel,
  dayWork,
  decayW,
  defaultState,
  earnedTitles,
  effActivity,
  effLoadKg,
  exCatalog,
  exEnergy,
  fmtKg,
  freshToday,
  getTotalXp,
  goalTargetsOf,
  groupLevels,
  hydrationOf,
  intensityMult,
  isAutoLevel,
  isMastered,
  kcalForDay,
  kcalTotal,
  missionIsDone,
  missionsDone,
  monsterOf,
  prevKey,
  rankFor,
  repsOf,
  routineIntensity,
  setTrainXpOf,
  skillPower,
  skillXpOf,
  subLevel,
  subgroupXp,
  tdeeOf,
  tierFor,
  titleCtx,
  todayKey,
  todayXp,
  trainXpOf,
  typicalExerciseOf,
  watchToday,
  watchWaterMl,
  workOfSet,
  xpThreshold,
};

// ============================================================
// Eris Mobile — Forge: más disciplinas y su árbol (fase I9, 2026-10-23)
//
// Puro; se copia tal cual al servidor (scripts/sync_forge_core.ts). Es una EXTENSIÓN: lo generado desde el HTML
// (forgeLegacy: 79 habilidades, 4 clases, el árbol y sus posiciones) no se toca y sus ids no cambian.
//   - Clases nuevas: Parkour, Tricking y Muay Thai (más Calistenia, Taekwondo, Karate y Boxeo). Sus bonos de combate se
//     registran en la tabla de clases del RPG (CLASS_BY_ID), así la Arena los suma con la misma fórmula; la lista que se
//     compara con el HTML (CLASSES) queda igual.
//   - Ramas nuevas: golpeo, patadas, clinch y rodillas, defensa y pies, combinaciones y tricks. Cada habilidad tiene
//     nivel, prerrequisitos (también del árbol del HTML), pasos reales y XP como las del HTML; los pasos que se pueden
//     medir con lo anotado se marcan solos (forgeStrength.EXT_CRITERIA).
//   - El XP de lo dominado entra al RPG por la vista (forgeCore.rpgView), así nivel, rango y Arena lo ven igual.
// Cada clase potencia ramas (CLASS_BRANCHES) y parámetros atléticos (forgeAthletic).
// ============================================================

import { S as legacySkill, CLASS_BY_ID, CATS, SKILL_BY_ID, CLASSES } from './forgeLegacy';
import type { ForgeState } from './forgeCore';

export interface ExtCat { id: string; label: string; color: string; stats: string[] }
export const EXT_CATS: ExtCat[] = [
  { id: 'golpeo', label: 'GOLPEO', color: '#ff7a4e', stats: ['ATK', 'CRÍTICO'] },
  { id: 'patadas', label: 'PATADAS', color: '#56b3ff', stats: ['ATK', 'EVASIÓN'] },
  { id: 'clinch', label: 'CLINCH Y RODILLAS', color: '#ff6b78', stats: ['ATK', 'HP'] },
  { id: 'defensa', label: 'DEFENSA Y PIES', color: '#3ddc97', stats: ['DEFENSA', 'EVASIÓN'] },
  { id: 'combos', label: 'COMBINACIONES', color: '#f5c542', stats: ['CRÍTICO', 'DAÑO CRÍT'] },
  { id: 'tricks', label: 'TRICKS', color: '#c77dff', stats: ['DAÑO CRÍT', 'EVASIÓN'] },
];

export interface ForgeClass { id: string; name: string; emoji: string; color: string; cats: string[]; boosts: Record<string, number>; desc: string; isNew?: boolean }
export const EXT_CLASSES: ForgeClass[] = [
  { id: 'parkour', name: 'Parkour', emoji: '🏃', color: '#3ddc97', cats: ['parkour', 'fund'], boosts: { eva: 0.10, vigor: 0.08, crit: 0.04 }, desc: 'Moverte por donde sea: aterrizajes, precisión y fluidez.', isNew: true },
  { id: 'tricking', name: 'Tricking', emoji: '🌀', color: '#c77dff', cats: ['tricks', 'acro'], boosts: { critDmg: 0.12, eva: 0.08, crit: 0.04 }, desc: 'Patadas, giros y flips enlazados.', isNew: true },
  { id: 'muay_thai', name: 'Muay Thai', emoji: '💥', color: '#ff6b78', cats: ['golpeo', 'patadas', 'clinch'], boosts: { atk: 0.10, def: 0.08, hp: 0.06 }, desc: 'El arte de las 8 armas: puños, codos, rodillas y patadas.', isNew: true },
];

/** Las ramas que potencia cada clase (las 4 del HTML y las nuevas). */
export const CLASS_BRANCHES: Record<string, string[]> = {
  calistenia: ['fuerza', 'fund'],
  taekwondo: ['patadas', 'tricks', 'defensa'],
  karate: ['golpeo', 'patadas', 'defensa'],
  boxeo: ['golpeo', 'defensa', 'combos'],
  parkour: ['parkour', 'fund', 'acro'],
  tricking: ['tricks', 'acro', 'patadas'],
  muay_thai: ['golpeo', 'patadas', 'clinch', 'defensa', 'combos'],
};

// Las clases nuevas entran a la tabla del RPG (la Arena suma sus bonos); la lista del HTML no cambia
for (const c of EXT_CLASSES) if (!(CLASS_BY_ID as Record<string, unknown>)[c.id]) (CLASS_BY_ID as Record<string, unknown>)[c.id] = c;

/** Todas las clases: las 4 del HTML y las nuevas. */
export const ALL_CLASSES: ForgeClass[] = [...(CLASSES as unknown as ForgeClass[]), ...EXT_CLASSES];
export const classById = (id: string): ForgeClass | undefined => ALL_CLASSES.find((c) => c.id === id);

// ─── Las habilidades nuevas (mismo formato que el HTML: id, rama, emoji, nombre, nivel, prerrequisitos, XP, por qué,
//     pasos, seguridad) ───
const SAFE_SPAR = 'Con protecciones (bucal, guantes, canilleras) y alguien que sepa supervisando. Al 30–50 % de fuerza.';
/** El mismo constructor del HTML (la seguridad es opcional, como allá). */
const skill = legacySkill as (...args: any[]) => any;
export const EXT_SKILLS: any[] = [
  // Golpeo
  skill('g_guardia', 'golpeo', '🛡️', 'Guardia y Postura', 1, ['f_mob'], 80, 'Todo empieza aquí: manos arriba, mentón abajo, peso repartido.', ['3 rounds de sombra de 2 min sin bajar la guardia', 'Moverte en guardia sin cruzar los pies 3 min', 'Volver a la guardia después de cada golpe']),
  skill('g_jab', 'golpeo', '👊', 'Jab y Directo', 2, ['g_guardia'], 100, 'Los golpes que más se usan: rápidos, rectos y con la cadera.', ['Jab-directo en sombra 3 rounds de 2 min', '100 jab-directo al saco con técnica', 'Doble jab + directo fluido']),
  skill('g_gancho', 'golpeo', '🪝', 'Gancho y Uppercut', 5, ['g_jab'], 130, 'Golpes curvos y de abajo: la potencia sale del giro.', ['Gancho y uppercut en sombra 3 rounds', 'Al saco 3 rounds de 2 min', 'Gancho al cuerpo + a la cara']),
  skill('g_saco', 'golpeo', '🥊', 'Rounds al Saco', 8, ['g_jab', 'f_core'], 160, 'Potencia y aguante: golpear fuerte cuando ya estás cansado.', ['3 rounds de 2 min al saco', '5 rounds de 3 min al saco', '6 rounds de 3 min al saco']),
  skill('g_velocidad', 'golpeo', '⚡', 'Manos Rápidas', 12, ['g_saco'], 180, 'Velocidad y ritmo: la comba es la amiga del boxeador.', ['Comba 3 rounds de 3 min', 'Ráfagas de 10 s al máximo x6 al saco', 'Comba 10 min seguidos']),
  skill('g_codo', 'golpeo', '💢', 'Codazos', 14, ['g_gancho'], 190, 'Arma corta del Muay Thai: horizontal, de arriba y ascendente.', ['Codazo horizontal en sombra x20/lado', 'Codazos al saco 3 rounds', 'Codazo tras clinch fluido'], 'Al saco o a paos con alguien que sepa; nunca en sparring sin protección.'),
  // Patadas
  skill('k_teep', 'patadas', '🦶', 'Patada Frontal (Teep)', 3, ['f_mob'], 100, 'Empuja y controla la distancia. La más útil para empezar.', ['Teep en sombra x20/pierna', 'Teep al saco 3 rounds de 1 min', 'Teep con salto (cambio de pierna)']),
  skill('k_round', 'patadas', '🌀', 'Patada Circular', 5, ['k_teep', 'f_core'], 140, 'El giro de cadera y el pie de apoyo hacen la patada.', ['Circular baja x20/pierna con giro del pie de apoyo', 'Al saco 3 rounds de 1 min', 'Circular media x20/pierna']),
  skill('k_low', 'patadas', '🦵', 'Low Kick', 6, ['k_round'], 150, 'La patada al muslo del Muay Thai: con la tibia y toda la cadera.', ['Low kick en sombra x20/pierna', 'Low kicks al saco 3 rounds de 1 min', 'Low kick tras jab-directo']),
  skill('k_side', 'patadas', '➡️', 'Patada Lateral', 8, ['k_teep'], 150, 'Recta y potente, con el canto del pie.', ['Lateral lenta y controlada x10/pierna', 'Lateral al saco 3 rounds', 'Lateral a la altura del pecho x10/pierna']),
  skill('k_high', 'patadas', '🎯', 'Patada Alta', 16, ['k_round', 's_pistol'], 220, 'A la cabeza: flexibilidad de cadera y equilibrio.', ['Patada circular a la altura del hombro x10/pierna', 'Mantener la pierna arriba 5 s', 'Patada alta con control x10/pierna'], 'Calienta y estira la cadera antes. Sube la altura de a poco.'),
  skill('k_axe', 'patadas', '🪓', 'Patada de Hacha', 18, ['k_high'], 230, 'Taekwondo: la pierna sube recta y cae como un hacha.', ['Hacha lenta x10/pierna', 'Hacha a paos x10/pierna', 'Hacha con paso adelante']),
  skill('k_spin', 'patadas', '🔄', 'Patada Giratoria', 20, ['k_side', 'f_core'], 260, 'Back kick y spinning hook: mirar antes de soltar.', ['Back kick lento x10/lado', 'Back kick al saco x10', 'Spinning hook kick x5/lado']),
  skill('k_tornado', 'patadas', '🌪️', 'Tornado Kick', 26, ['k_spin', 's_jump'], 320, 'Giro de 360° en el aire con patada circular.', ['Giro de 360° saltando y cayendo firme', 'Tornado a paos x5', 'Tornado limpio x5/lado'], 'Superficie que no resbale y espacio libre alrededor.'),
  // Clinch y rodillas
  skill('cl_plum', 'clinch', '🤼', 'Clinch (Plum)', 6, ['g_guardia', 'f_grip'], 140, 'Controlar la cabeza del rival con las dos manos.', ['Posición de plum con compañero 3 rounds de 1 min', 'Romper el clinch del otro x10', 'Girar al rival desde el clinch x10']),
  skill('cl_knee', 'clinch', '🦿', 'Rodillazos', 8, ['cl_plum'], 160, 'Rodilla recta y a las costillas, con la cadera adelante.', ['Rodillazos en sombra x20/pierna', 'Rodillazos al saco 3 rounds de 1 min', 'Rodillazos desde el clinch 3 rounds']),
  skill('cl_sweep', 'clinch', '🍃', 'Barridos', 14, ['cl_knee', 'd_footwork'], 200, 'Desequilibrar desde el clinch, sin fuerza bruta.', ['Barrido lento con compañero x10/lado', 'Barrido tras rodillazo x10', 'Barrido en rounds de clinch']),
  skill('cl_flyknee', 'clinch', '🚀', 'Rodilla Voladora', 22, ['cl_knee', 's_jump'], 280, 'Saltar y conectar la rodilla. Espectacular y potente.', ['Salto con rodilla al saco x10', 'Rodilla voladora con paso x10', 'Al saco con potencia 3 rounds'], 'Al saco o a paos; aterriza con las dos piernas.'),
  // Defensa y pies
  skill('d_footwork', 'defensa', '👣', 'Juego de Piernas', 2, ['g_guardia'], 100, 'Entrar, salir y girar sin perder la guardia.', ['Escalera de agilidad 3 rounds', 'Entrar-salir en sombra 3 rounds de 2 min', 'Comba 3 rounds de 3 min']),
  skill('d_block', 'defensa', '🧱', 'Bloqueos y Chequeos', 5, ['d_footwork'], 130, 'Parar con los antebrazos y chequear las patadas bajas con la canilla.', ['Bloqueo alto y al cuerpo con compañero x20', 'Chequeo de low kick x20/pierna', 'Bloqueo + contragolpe x10']),
  skill('d_slip', 'defensa', '🌫️', 'Esquivas', 7, ['d_footwork', 'f_core'], 150, 'Esquivar con la cintura y las piernas, no con la espalda.', ['Esquiva lateral en sombra 3 rounds', 'Rolling bajo una cuerda 3 rounds', 'Esquivar golpes lentos de un compañero']),
  skill('d_counter', 'defensa', '↩️', 'Contragolpe', 14, ['d_slip', 'g_jab'], 210, 'Defender y responder en el mismo movimiento.', ['Esquiva + directo x20', 'Bloqueo + gancho x20', 'Contragolpe en sparring controlado'], SAFE_SPAR),
  // Combinaciones
  skill('m_123', 'combos', '3️⃣', 'Combo 1-2-3', 6, ['g_gancho'], 140, 'Jab, directo y gancho: la combinación de base.', ['1-2-3 en sombra 3 rounds', '1-2-3 al saco 3 rounds', '1-2-3 + salida lateral']),
  skill('m_mix', 'combos', '🔗', 'Puño + Patada', 10, ['m_123', 'k_round'], 180, 'Enlazar manos y piernas: 1-2 + patada circular.', ['1-2 + circular en sombra x20', 'Al saco 3 rounds', 'Puño-patada-puño fluido']),
  skill('m_sombra', 'combos', '👤', 'Pelea de Sombra Completa', 16, ['m_mix', 'd_slip'], 220, 'Pelear contra nadie con todo: ataques, defensa y pies.', ['3 rounds de 3 min de sombra', '5 rounds de 3 min de sombra', '5 rounds con 1 min de descanso a buen ritmo']),
  skill('m_spar', 'combos', '🥋', 'Sparring Controlado', 24, ['m_sombra', 'd_counter'], 320, 'Aplicar todo con alguien enfrente, sin hacerse daño.', ['3 rounds de sparring técnico', '5 rounds de sparring técnico', 'Sparring de 5 rounds sin perder la guardia'], SAFE_SPAR),
  // Tricks
  skill('t_pop360', 'tricks', '🔁', 'Pop 360', 12, ['k_round', 's_jump'], 180, 'Saltar y girar 360° con impulso de las dos piernas.', ['Giro de 360° saltando y cayendo firme x10', 'Pop 360 con patada x5', 'Pop 360 enlazado a una patada']),
  skill('t_butterfly', 'tricks', '🦋', 'Butterfly Kick', 18, ['a_cond', 'k_round'], 240, 'Cuerpo horizontal y piernas en tijera: la base del tricking.', ['Butterfly kick bajo x10', 'Butterfly kick con altura x10', 'Butterfly kick enlazado x3'], 'Superficie blanda al inicio.'),
  skill('t_aerial', 'tricks', '🤸', 'Aerial', 34, ['a_cart', 'a_cond'], 380, 'Rueda sin manos.', ['Rueda con una mano x10', 'Aerial a colchoneta con spotter', 'Aerial limpio a superficie firme'], '⚠️ Colchoneta y alguien que sepa al inicio.'),
  skill('t_720', 'tricks', '💫', 'Kick 720', 44, ['a_540'], 450, 'Dos giros en el aire con patada.', ['540 sólido x5', '720 a colchoneta', '720 limpio'], '⚠️ Avanzado. Superficie blanda y alguien que sepa.'),
  skill('t_combo', 'tricks', '🎬', 'Combo de Tricks', 50, ['t_butterfly', 'a_540', 't_aerial'], 500, 'Tres tricks enlazados sin pausa: el lenguaje del tricking.', ['2 tricks enlazados', '3 tricks enlazados', 'Combo de 3 limpio en superficie firme'], '⚠️ Solo con cada trick dominado por separado.'),
];
/** Músculos por grupo del HTML (para su «poder» y la hoja), como SKILL_MUSCLES. */
export const EXT_SKILL_MUSCLES: Record<string, Record<string, number>> = {
  g_guardia: { hombros: 1, agilidad: 1 }, g_jab: { hombros: 2, brazos: 1 }, g_gancho: { hombros: 1, core: 1, brazos: 1 },
  g_saco: { hombros: 2, core: 1, explosivo: 1 }, g_velocidad: { agilidad: 2, hombros: 1 }, g_codo: { hombros: 1, core: 1, brazos: 1 },
  k_teep: { piernas: 2, core: 1 }, k_round: { piernas: 2, core: 1 }, k_low: { piernas: 2, core: 1 }, k_side: { piernas: 2, core: 1 },
  k_high: { piernas: 2, agilidad: 1 }, k_axe: { piernas: 2, agilidad: 1 }, k_spin: { piernas: 2, agilidad: 2 }, k_tornado: { explosivo: 2, piernas: 1, agilidad: 2 },
  cl_plum: { brazos: 2, espalda: 1 }, cl_knee: { piernas: 1, core: 2 }, cl_sweep: { piernas: 1, agilidad: 2 }, cl_flyknee: { explosivo: 2, core: 1 },
  d_footwork: { agilidad: 2, piernas: 1 }, d_block: { brazos: 1, core: 1 }, d_slip: { core: 2, agilidad: 1 }, d_counter: { agilidad: 2, hombros: 1 },
  m_123: { hombros: 2, core: 1 }, m_mix: { piernas: 1, hombros: 1, core: 1 }, m_sombra: { agilidad: 2, hombros: 1 }, m_spar: { agilidad: 2, core: 1, hombros: 1 },
  t_pop360: { explosivo: 2, agilidad: 1 }, t_butterfly: { explosivo: 2, agilidad: 2 }, t_aerial: { agilidad: 2, core: 1 }, t_720: { explosivo: 2, agilidad: 2 }, t_combo: { explosivo: 2, agilidad: 2 },
};
export const EXT_SKILL_BY_ID: Record<string, any> = Object.fromEntries(EXT_SKILLS.map((s) => [s.id, s]));

/** Una habilidad del árbol del HTML o de las nuevas. */
export const skillById = (id: string): any => (SKILL_BY_ID as Record<string, any>)[id] ?? EXT_SKILL_BY_ID[id];
/** Una rama del HTML o de las nuevas. */
export const catById = (id: string): { id: string; label: string; color: string } | undefined => (CATS as any[]).find((c) => c.id === id) ?? EXT_CATS.find((c) => c.id === id);

/** ¿Dominada? (todos sus pasos marcados) — sirve para las del HTML y las nuevas. */
export function isMasteredAny(s: Pick<ForgeState, 'skills'>, id: string): boolean {
  const sk = skillById(id);
  const st = (s.skills as any)?.[id]?.steps;
  return !!sk && !!st && st.length === sk.steps.length && st.every(Boolean);
}
/** El XP de las habilidades nuevas dominadas (entra al RPG por la vista). */
export const extSkillXp = (s: Pick<ForgeState, 'skills'>): number => EXT_SKILLS.reduce((a, sk) => a + (isMasteredAny(s, sk.id) ? sk.xp : 0), 0);
export const extMastered = (s: Pick<ForgeState, 'skills'>): number => EXT_SKILLS.filter((sk) => isMasteredAny(s, sk.id)).length;

/** El poder de una habilidad nueva según los grupos que entrena (como skillPower del HTML). */
export function extSkillPower(grp: Record<string, number>, id: string): number {
  const map = EXT_SKILL_MUSCLES[id];
  if (!map) return 0;
  let num = 0, den = 0;
  for (const [g, pts] of Object.entries(map)) { num += (grp[g] || 0) * pts; den += pts; }
  return den ? num / den : 0;
}

/** Las ramas de tus clases (sin clase: todas). */
export function branchesOf(classes: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const c of classes ?? []) for (const b of CLASS_BRANCHES[c] ?? []) out.add(b);
  return out.size ? [...out] : [...(CATS as any[]).map((c) => c.id), ...EXT_CATS.map((c) => c.id)];
}

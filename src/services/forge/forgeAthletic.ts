// ============================================================
// Eris Mobile — Forge: tus parámetros atléticos (fase I9, 2026-10-23)
//
// Puro; se copia tal cual al servidor (scripts/sync_forge_core.ts). Siete parámetros de 0 a 100, calculados con lo que
// entrenas DE VERDAD (las series de Forge de las últimas 4 semanas, los niveles de tus músculos y lo atlético, lo que
// llevas del árbol, y los pasos del reloj), y potenciados por tus clases (+5 a +12 %, como los bonos de la Arena):
//   - Potencia: series explosivas (saltos, burpees, sprints, swings, saco…) + pliometría y reactividad.
//   - Velocidad: minutos de trabajo rápido (sprints, comba, sombra, saco, escalera) + reactividad y coordinación.
//   - Agilidad: equilibrio, control aéreo y coordinación + pasos de parkour, acrobacia, tricks y defensa.
//   - Resistencia: minutos de cardio por semana (OMS: 150) + pasos diarios (10.000) + sesiones.
//   - Flexibilidad: minutos de movilidad por semana + pasos de habilidades de movilidad (German hang, patada alta…).
//   - Técnica: lo que llevas del árbol en las ramas de tus clases (pasos y habilidades dominadas).
//   - Fuerza relativa: tu score de fuerza (percentil de quienes entrenan) o tus mejores reps a peso corporal.
// No es una medición de laboratorio: es una foto de lo que entrenas, para ver qué te falta según tu disciplina.
// ============================================================

import { L, catalog, groupLevels, isStrict, type ForgeState } from './forgeCore';
import { strengthScore } from './forgeStrength';
import { EXT_SKILLS, isMasteredAny, branchesOf } from './forgeSkillsExt';

export type ParamKey = 'potencia' | 'velocidad' | 'agilidad' | 'resistencia' | 'flexibilidad' | 'tecnica' | 'fuerza';
export const PARAMS: Array<{ key: ParamKey; label: string; short: string; desc: string }> = [
  { key: 'potencia', label: 'Potencia', short: 'POT', desc: 'Fuerza rápida: saltar, golpear, patear fuerte.' },
  { key: 'velocidad', label: 'Velocidad', short: 'VEL', desc: 'Moverte y soltar golpes rápido.' },
  { key: 'agilidad', label: 'Agilidad', short: 'AGI', desc: 'Cambiar de dirección, equilibrio y control en el aire.' },
  { key: 'resistencia', label: 'Resistencia', short: 'RES', desc: 'Aguantar el ritmo: cardio y actividad diaria.' },
  { key: 'flexibilidad', label: 'Flexibilidad', short: 'FLX', desc: 'Rango de movimiento: caderas, hombros, columna.' },
  { key: 'tecnica', label: 'Técnica', short: 'TEC', desc: 'Lo que dominas de tu disciplina en el árbol.' },
  { key: 'fuerza', label: 'Fuerza relativa', short: 'FUE', desc: 'Fuerza para tu peso.' },
];

/** Lo que potencia cada clase (se suma si tienes dos). */
export const CLASS_PARAM_BOOST: Record<string, Partial<Record<ParamKey, number>>> = {
  calistenia: { fuerza: 0.12, tecnica: 0.05 },
  taekwondo: { flexibilidad: 0.12, agilidad: 0.08, velocidad: 0.05 },
  karate: { tecnica: 0.12, velocidad: 0.06, flexibilidad: 0.05 },
  boxeo: { velocidad: 0.12, resistencia: 0.08, potencia: 0.05 },
  parkour: { agilidad: 0.12, potencia: 0.06, resistencia: 0.05 },
  tricking: { flexibilidad: 0.08, potencia: 0.08, agilidad: 0.08 },
  muay_thai: { potencia: 0.08, resistencia: 0.08, tecnica: 0.06 },
};

export interface Param { key: ParamKey; label: string; short: string; base: number; boost: number; value: number; why: string }
export interface Athletic { params: Param[]; best: Param; weakest: Param; classes: string[] }

const EXPLOSIVE = new Set(['saltos', 'burpees', 'kb_swing', 'sprint', 'cuerda', 'sombra', 'saco', 'patadas_saco', 'rodillazos', 'escalera', 'mountain']);
const FAST = new Set(['sprint', 'cuerda', 'sombra', 'saco', 'patadas_saco', 'rodillazos', 'escalera']);
const MOBILITY_EX = new Set(['movilidad', 'balance_ej']);
const MOBILITY_SKILLS = new Set(['f_mob', 'f_wrist', 'f_arch', 's_germanhang', 's_skincat', 's_vsit', 'k_high', 'k_axe', 'a_cart', 'a_bhs', 't_aerial', 'p_bal']);
const AGILITY_CATS = new Set(['parkour', 'acro', 'tricks', 'defensa']);

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ago = (now: Date, n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return keyOf(d); };
/** Un nivel de músculo (1–30) a 0–1: el nivel 10 ya es ~60 %, el 20 ~85 %. */
const lv01 = (lvl: number | undefined) => 1 - Math.exp(-Math.max(0, (lvl ?? 1) - 1) / 10);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const cap = (x: number) => Math.max(0, Math.min(1, x));
const n0 = (x: number) => Math.round(x);

/** Tus parámetros atléticos (0–100), con por qué y el bono de tus clases. */
export function athleticParams(s: ForgeState, now: Date = L.forgeNow()): Athletic {
  const cat = catalog(s);
  const from = ago(now, 27), today = keyOf(now);
  let explosiveSets = 0, fastSec = 0, cardioMin = 0, mobilityMin = 0;
  const days = new Set<string>();
  for (const [day, exs] of Object.entries(s.sessions || {})) {
    if (day < from || day > today) continue;
    for (const [exId, sets] of Object.entries(exs)) {
      const ex = cat[exId];
      const work = (sets || []).filter((x) => !x.warmup);
      if (!ex || !work.length) continue;
      days.add(day);
      const seconds = (r: number) => (ex.unit === 'min' ? r * 60 : ex.unit === 'seg' ? r : 0);
      if (EXPLOSIVE.has(exId) || ex.pattern === 'potencia') explosiveSets += work.length;
      if (FAST.has(exId)) fastSec += work.reduce((a, x) => a + seconds(x.reps), 0);
      if (ex.eq === 'cardio' || FAST.has(exId)) cardioMin += work.reduce((a, x) => a + seconds(x.reps), 0) / 60;
      // movilidad: lo anotado en minutos (≤ 30) o en segundos
      if (MOBILITY_EX.has(exId) || ex.pattern === 'movilidad') mobilityMin += work.reduce((a, x) => a + (x.reps <= 30 ? x.reps : x.reps / 60), 0);
    }
  }
  const { subL } = groupLevels(s);
  const lv = (id: string) => subL?.[id]?.level as number | undefined;
  // pasos del árbol (las del HTML y las nuevas)
  const allSkills: any[] = [...L.SKILLS, ...EXT_SKILLS];
  const stepsDone = (pred: (sk: any) => boolean) => allSkills.filter(pred).reduce((a, sk) => a + ((s.skills as any)?.[sk.id]?.steps || []).filter(Boolean).length, 0);
  const agilitySteps = stepsDone((sk) => AGILITY_CATS.has(sk.cat));
  const mobilitySteps = stepsDone((sk) => MOBILITY_SKILLS.has(sk.id));
  const branches = new Set(branchesOf(s.classes));
  const branchSteps = stepsDone((sk) => branches.has(sk.cat));
  const branchMastered = allSkills.filter((sk) => branches.has(sk.cat) && isMasteredAny(s, sk.id)).length;
  // pasos diarios: el registro de días y hoy (reloj)
  const stepDays = [...(s.log || []).filter((e: any) => e?.day >= ago(now, 13) && (e.steps || 0) > 0).map((e: any) => e.steps as number), ...((s.today?.steps || 0) > 0 ? [s.today.steps as number] : [])];
  const avgSteps = avg(stepDays);
  // fuerza: el score (percentil) o las reps a peso corporal más altas (8 semanas)
  const sc = strengthScore(s)?.score ?? null;
  const best = (ids: string[]) => {
    let b = 0;
    for (const [day, exs] of Object.entries(s.sessions || {})) {
      if (day < ago(now, 55) || day > today) continue;
      for (const id of ids) for (const x of (exs[id] || [])) if (!x.warmup && (!cat[id] || isStrict(cat[id], x)) && x.reps > b) b = x.reps;
    }
    return b;
  };
  const pull = best(['dom_prona', 'dom_supina', 'dom_neutra']), push = best(['flexiones']), dips = best(['dips_ej']);
  const bw = Math.min(100, Math.max(pull * 6.5, push * 2.2, dips * 4.5));

  const base: Record<ParamKey, { v: number; why: string }> = {
    potencia: { v: 100 * (0.5 * avg([lv01(lv('pliometria')), lv01(lv('reactividad'))]) + 0.5 * cap(explosiveSets / 30)), why: `${explosiveSets} series explosivas en 4 semanas · pliometría Nv ${lv('pliometria') ?? 1}` },
    velocidad: { v: 100 * (0.4 * avg([lv01(lv('reactividad')), lv01(lv('coordinacion'))]) + 0.6 * cap(fastSec / 3600)), why: `${n0(fastSec / 60)} min de trabajo rápido (sprints, comba, sombra, saco) en 4 semanas` },
    agilidad: { v: 100 * (0.5 * avg([lv01(lv('equilibrio')), lv01(lv('aereo')), lv01(lv('coordinacion'))]) + 0.5 * cap(agilitySteps / 25)), why: `${agilitySteps} pasos de parkour, acrobacia, tricks y defensa · equilibrio Nv ${lv('equilibrio') ?? 1}` },
    resistencia: { v: 100 * (0.45 * cap(cardioMin / 4 / 150) + 0.35 * cap(avgSteps / 10000) + 0.2 * cap(days.size / 16)), why: `${n0(cardioMin / 4)} min de cardio por semana · ${stepDays.length ? `${n0(avgSteps).toLocaleString('es-CL')} pasos al día` : 'sin pasos del reloj'} · ${days.size} sesiones en 4 semanas` },
    flexibilidad: { v: 100 * (0.6 * cap(mobilityMin / 4 / 30) + 0.4 * cap(mobilitySteps / 12)), why: `${n0(mobilityMin / 4)} min de movilidad por semana · ${mobilitySteps} pasos de movilidad en el árbol` },
    tecnica: { v: 100 * cap((branchSteps + 4 * branchMastered) / 60), why: `${branchSteps} pasos y ${branchMastered} habilidades dominadas en ${s.classes?.length ? 'las ramas de tus clases' : 'el árbol'}` },
    fuerza: { v: Math.max(sc ?? 0, bw), why: sc != null ? `score de fuerza ${sc}/100${bw > sc ? ` · a peso corporal: ${pull} dominadas, ${push} flexiones` : ''}` : pull || push || dips ? `a peso corporal: ${pull} dominadas, ${push} flexiones, ${dips} fondos` : 'sin series para estimarla' },
  };
  const boosts: Record<ParamKey, number> = { potencia: 0, velocidad: 0, agilidad: 0, resistencia: 0, flexibilidad: 0, tecnica: 0, fuerza: 0 };
  for (const c of s.classes || []) for (const [k, b] of Object.entries(CLASS_PARAM_BOOST[c] ?? {})) boosts[k as ParamKey] += b as number;
  const params: Param[] = PARAMS.map((p) => {
    const b = n0(base[p.key].v);
    return { key: p.key, label: p.label, short: p.short, base: b, boost: boosts[p.key], value: Math.min(100, n0(b * (1 + boosts[p.key]))), why: base[p.key].why };
  });
  const sorted = [...params].sort((a, b) => b.value - a.value);
  return { params, best: sorted[0], weakest: sorted[sorted.length - 1], classes: s.classes || [] };
}

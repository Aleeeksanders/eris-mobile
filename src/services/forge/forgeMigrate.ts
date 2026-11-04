// ============================================================
// Eris Mobile — pasar Forge del HTML a la versión nativa, sin perder un punto (Forge 2.0, F1, 2026-10-17)
//
// El HTML (assets/toji.html) se abre invisible con el mismo origen y perfil, carga su estado como siempre (con el paso
// de día) y lo entrega (TOJI_STATE_SYNC). Después se le pide que calcule con SUS funciones el XP, el nivel, los niveles
// de cada músculo, la Arena, los títulos y las habilidades dominadas, y el núcleo nuevo tiene que dar exactamente lo
// mismo. Si algo no calza, no se migra y Forge sigue siendo el HTML. Los datos del HTML NO se borran (volver atrás).
// ============================================================
import * as C from './forgeCore';

export interface HtmlMetrics {
  xp: number; level: number; groups: unknown; combat: unknown; titles: string[]; mastered: number;
}
export interface WebForge { state: any; routine: { md: string; name: string } | null; metrics: HtmlMetrics }
export interface ForgeMigrationCheck { ok: boolean; state?: C.ForgeState; diffs: string[] }

/** Lo que calcula el núcleo nuevo, en la misma forma que lo del HTML. */
export function nativeMetrics(s: C.ForgeState): HtmlMetrics {
  const sum = C.rpgSummary(s);
  return {
    xp: sum.totalXp, level: sum.level, groups: C.groupLevels(s), combat: C.combatStats(s),
    titles: C.earnedTitles(s).map((t: any) => t.id), mastered: sum.mastered,
  };
}

/** ¿Forge nunca se usó? (sin entrenos, sin habilidades, sin XP, sin cuerpo) */
export function isEmptyForge(st: any): boolean {
  if (!st || typeof st !== 'object') return true;
  const trained = Object.values(st.training || {}).some((d: any) => d && Object.values(d).some((n) => Number(n) > 0));
  const skills = Object.values(st.skills || {}).some((v: any) => Array.isArray(v?.steps) && v.steps.some(Boolean));
  return !trained && !skills && !(Number(st.bankedXp) > 0) && !st.bodyKg && !(st.log || []).length && !(st.customExercises || []).length;
}

/** Convierte lo del HTML y revisa al peso que el núcleo nuevo diga lo mismo. Puro: no guarda nada. */
export function checkForgeMigration(web: WebForge, now = new Date()): ForgeMigrationCheck {
  const diffs: string[] = [];
  if (!web?.state || typeof web.state !== 'object') return { ok: false, diffs: ['el HTML no entregó su estado'] };
  const state = C.hydrate(JSON.parse(JSON.stringify(web.state)));
  const mine = nativeMetrics(state);
  const theirs = web.metrics || ({} as HtmlMetrics);
  for (const k of ['xp', 'level', 'groups', 'combat', 'titles', 'mastered'] as const) {
    const a = JSON.stringify(mine[k]), b = JSON.stringify(theirs[k]);
    if (a !== b) diffs.push(`${k}: html ${b?.slice(0, 160)} · nativo ${a?.slice(0, 160)}`);
  }
  // Las series: tantas como contaba el HTML, día por día
  for (const [day, exs] of Object.entries(web.state.training || {})) {
    for (const [id, n] of Object.entries((exs as Record<string, number>) || {})) {
      const got = (state.sessions[day]?.[id] || []).length;
      if (Math.round(Number(n) || 0) !== got) diffs.push(`series ${day} ${id}: html ${n} · nativo ${got}`);
    }
  }
  return { ok: diffs.length === 0, state: { ...state, migratedAt: now.toISOString() }, diffs };
}

/**
 * JS para el HTML invisible: con el estado que ya cargó (`S`, recibido en TOJI_STATE_SYNC) calcula con SUS funciones
 * lo que hay que comparar, y entrega también la rutina (`toji_migration`).
 */
export function migrationJS(state: any): string {
  return `(function(){try{var S=${JSON.stringify(state)};var pid=window.__ERIS_PROFILE_ID__;var suf=(pid&&pid!=='anon')?'-'+pid:'';`
    + `var routine=null;try{var r=JSON.parse(localStorage.getItem('toji-routine-md'+suf)||'null');if(r&&r.md)routine={md:String(r.md),name:String(r.name||'Mi rutina')};}catch(e){}`
    + `var xp=getTotalXp(S);var m={xp:xp,level:computeLevel(xp).level,groups:groupLevels(S),combat:combatStats(S),`
    + `titles:earnedTitles(S).map(function(t){return t.id;}),mastered:SKILLS.filter(function(sk){return isMastered(S,sk.id);}).length};`
    + `window.ReactNativeWebView.postMessage(JSON.stringify({type:'toji_migration',state:S,routine:routine,metrics:m}));}`
    + `catch(err){window.ReactNativeWebView.postMessage(JSON.stringify({type:'toji_migration',error:String(err&&err.message||err)}));}})();true;`;
}

// ============================================================
// Eris Mobile — Forge por voz (Hestia como JARVIS · L3, 2026-11-17): el entrenador en el oído.
//
// El servidor le pide a Forge lo que Hestia necesita en la llamada (ForgeBridge: forge_op / forge_op_result) y la app lo aplica
// con el mismo núcleo de siempre, así lo dicho por voz queda igual que tocado en Entrenar:
//  - `sesion`: qué toca hoy, qué serie sigue (con la carga y las reps), el descanso que corre y la última anotada;
//  - `serie`: «hice 8 con 62,5» → logSet con el descanso medido, el árbol y el récord (como SetLogger); la carga que no dijiste
//    sale de tu serie anterior de hoy, del objetivo de la rutina o de la última vez;
//  - `descanso`: cortarlo, sumarle o restarle (lo que ajustes queda aprendido, como con −15/+15);
//  - `borrar_ultima`: la última serie de hoy (el servidor ya pidió el «sí»);
//  - `terminar`: el resumen del día y se corta el descanso.
// Las funciones de acá son puras (se prueban sin el teléfono); `aplicarForgeOp` es la que toca el estado.
// ============================================================
import * as C from './forgeCore';
import * as T from './forgeTrain';
import * as Pr from './forgeProgress';
import * as Str from './forgeStrength';
import { fmtLoad, type ForgeExercise } from './forgeCatalog';
import type { RestState } from './restTimer';

type Ex = ForgeExercise;

/** «Press de Banca (Barra o Mancuernas)» → «press de banca» (para decirlo) */
export const nombreVoz = (n: string) => String(n || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const plano = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** La carga de una serie, para decirla: «62,5 kg», «110 libras», «con 10 kg de lastre», «con 20 kg de ayuda», «con banda» */
export function cargaVoz(ex: Ex, x: Pick<C.FSet, 'kg' | 'unit' | 'assist' | 'band'>): string | null {
  const u = (v: number) => `${fmtLoad(v)} ${x.unit === 'lb' ? 'libras' : 'kg'}`;
  if (ex.eq === 'asist') return x.assist ? `con ${u(x.assist)} de ayuda` : null;
  if (ex.eq === 'banda') return x.band ? 'con banda' : null;
  if (!x.kg) return null;
  if (ex.eq === 'bw') return `con ${u(x.kg)} de lastre`;
  return `${u(x.kg)}${ex.pair ? ' cada una' : ''}`;
}
/** «8», «45 segundos», «10 minutos» */
const repsVoz = (ex: Ex, n: number) => (ex.unit === 'seg' ? `${n} segundos` : ex.unit === 'min' ? `${n} minutos` : `${n}`);

/** «8 con 62,5 kg», «8 con 10 kg de lastre», «45 segundos», «6 y 3 negativas» */
export function serieVoz(ex: Ex, x: C.FSet): string {
  const carga = cargaVoz(ex, x);
  const reps = repsVoz(ex, x.reps);
  const tail = x.tail ? ` y ${C.tailText(x.tail)}` : '';
  if (!carga) return `${reps}${tail}`;
  return carga.startsWith('con ') ? `${reps} ${carga}${tail}` : `${reps} con ${carga}${tail}`;
}

/** Lo que sigue, para decirlo */
export interface SerieQueSigue {
  exId: string; nombre: string;
  /** número de esta serie y de cuántas (null = sin plan para este ejercicio) */
  serie: number; de: number | null;
  /** «62,5 kg», «con 10 kg de lastre» (null = sin carga) */
  carga: string | null;
  /** «8», «6 a 8», «45 segundos» (null = sin objetivo) */
  reps: string | null;
  /** es otro ejercicio que el de la serie anterior */
  cambio: boolean;
}

export interface SesionVoz {
  dia: string;
  hayPlan: boolean;
  /** hoy toca descanso según la rutina */
  descansoRutina: boolean;
  nombreDia: string | null;
  hechas: number;
  total: number | null;
  ejercicios: number;
  sigue: SerieQueSigue | null;
  /** todo el plan de hoy hecho */
  listo: boolean;
  /** el descanso que corre (s que quedan) */
  descanso: { quedan: number; siguiente: string } | null;
  ultima: { exId: string; nombre: string; texto: string; at: number } | null;
}

const hechasDe = (S: C.ForgeState, day: string, id: string) => (((S.sessions || {})[day] || {})[id] || []).filter((x) => !x.warmup);

/** La última serie anotada hoy (la más reciente, de cualquier ejercicio) */
export function ultimaDeHoy(S: C.ForgeState, day: string): { exId: string; idx: number; set: C.FSet } | null {
  let r: { exId: string; idx: number; set: C.FSet } | null = null;
  for (const [exId, xs] of Object.entries((S.sessions || {})[day] || {})) {
    (xs || []).forEach((set, idx) => { if (!r || (set.at ?? 0) >= (r.set.at ?? 0)) r = { exId, idx, set }; });
  }
  return r;
}

/** La carga para la próxima serie de este ejercicio: la de tu serie anterior de hoy, la del objetivo, o la de la última vez */
export function cargaBase(S: C.ForgeState, day: string, exId: string): Pick<C.FSet, 'kg' | 'unit' | 'assist' | 'band'> {
  const hoy = hechasDe(S, day, exId).slice(-1)[0];
  const pick = (x: any) => ({ ...(x?.kg != null ? { kg: x.kg } : {}), ...(x?.unit === 'lb' ? { unit: 'lb' as const } : {}), ...(x?.assist != null ? { assist: x.assist } : {}), ...(x?.band ? { band: x.band } : {}) });
  if (hoy) return pick(hoy);
  const t = S.planDay?.day === day ? S.planDay?.targets?.[exId] : null;
  if (t?.kg != null) {
    const ex = C.catalog(S)[exId];
    return ex?.eq === 'asist' ? { assist: t.kg, ...(t.unit === 'lb' ? { unit: 'lb' as const } : {}) } : { kg: t.kg, ...(t.unit === 'lb' ? { unit: 'lb' as const } : {}) };
  }
  return pick(C.lastSetOf(S, exId));
}

/** Qué serie sigue: el ejercicio a medio hacer, si no el primero del plan que falta; sin plan, otra del último que hiciste */
export function queSigue(S: C.ForgeState, day: string): SerieQueSigue | null {
  const cat = C.catalog(S);
  const plan = S.plan || {};
  const ids = Object.keys(plan).filter((id) => cat[id]);
  const ultima = ultimaDeHoy(S, day);
  const enCurso = ultima && plan[ultima.exId] != null && hechasDe(S, day, ultima.exId).length < plan[ultima.exId] ? ultima.exId : null;
  const id = enCurso ?? ids.find((x) => hechasDe(S, day, x).length < plan[x]) ?? (!ids.length && ultima ? ultima.exId : null);
  if (!id || !cat[id]) return null;
  const ex = cat[id];
  const n = hechasDe(S, day, id).length;
  const t = S.planDay?.day === day ? S.planDay?.targets?.[id] : null;
  const hoyUlt = hechasDe(S, day, id).slice(-1)[0];
  const reps = t?.repMin ? (t.repMin === t.repMax ? repsVoz(ex, t.repMin) : `${t.repMin} a ${t.repMax}${ex.unit === 'seg' ? ' segundos' : ''}`)
    : hoyUlt ? repsVoz(ex, hoyUlt.reps) : C.lastSetOf(S, id) ? repsVoz(ex, C.lastSetOf(S, id)!.reps) : null;
  return { exId: id, nombre: nombreVoz(ex.name), serie: n + 1, de: plan[id] ?? null, carga: cargaVoz(ex, cargaBase(S, day, id)), reps, cambio: !!ultima && ultima.exId !== id };
}

/** Todo lo de hoy para Hestia (op `sesion`) */
export function sesionVoz(S: C.ForgeState, day: string, rest: RestState | null, now = Date.now()): SesionVoz {
  const cat = C.catalog(S);
  const plan = S.plan || {};
  const ids = Object.keys(plan).filter((id) => cat[id]);
  const hechas = Object.values((S.sessions || {})[day] || {}).reduce((a, xs) => a + (xs || []).filter((x) => !x.warmup).length, 0);
  const total = ids.length ? ids.reduce((a, id) => a + plan[id], 0) : null;
  const pd = S.planDay?.day === day ? S.planDay : null;
  const u = ultimaDeHoy(S, day);
  const sigue = queSigue(S, day);
  return {
    dia: day, hayPlan: ids.length > 0, descansoRutina: !!pd?.rest, nombreDia: pd?.name ?? null, hechas, total, ejercicios: ids.length,
    sigue, listo: ids.length > 0 && ids.every((id) => hechasDe(S, day, id).length >= plan[id]),
    descanso: rest && !rest.ended && rest.endAt > now ? { quedan: Math.round((rest.endAt - now) / 1000), siguiente: rest.next } : null,
    ultima: u && cat[u.exId] ? { exId: u.exId, nombre: nombreVoz(cat[u.exId].name), texto: serieVoz(cat[u.exId], u.set), at: u.set.at ?? 0 } : null,
  };
}

/** Lo que pide la voz: «hice 8 con 62,5 y me quedaron 2» */
export interface PedidoSerie { ejercicio?: string | null; reps: number; kg?: number | null; rir?: number | null; neg?: number | null }

/** El ejercicio que nombró (primero los del plan de hoy, después todo el catálogo), o null */
export function ejercicioDicho(S: C.ForgeState, dicho: string): string | null {
  const q = plano(dicho);
  if (!q) return null;
  const cat = C.catalog(S);
  const enPlan = Object.keys(S.plan || {}).filter((id) => cat[id]);
  const hoy = Object.keys((S.sessions || {})[C.L.todayKey()] || {});
  const calza = (id: string) => { const n = plano(nombreVoz(cat[id].name)); return n === q || n.includes(q) || q.includes(n); };
  return [...new Set([...enPlan, ...hoy])].find((id) => cat[id] && calza(id)) ?? Object.keys(cat).find(calza) ?? null;
}

/** La serie que se anota (sin anotarla): el ejercicio, la carga dicha o la de antes, el esfuerzo y el remate */
export function armarSerie(S: C.ForgeState, day: string, p: PedidoSerie): { exId: string; set: C.FSet } | { error: 'sin_ejercicio' | 'no_encontre' | 'invalida'; msg: string } {
  const reps = Math.round(Number(p.reps));
  if (!Number.isFinite(reps) || reps < 1 || reps > 999) return { error: 'invalida', msg: 'No entendí cuántas hiciste.' };
  const cat = C.catalog(S);
  let exId: string | null = null;
  if (p.ejercicio) {
    exId = ejercicioDicho(S, p.ejercicio);
    if (!exId) return { error: 'no_encontre', msg: `No encontré «${p.ejercicio}» en Forge.` };
  } else exId = queSigue(S, day)?.exId ?? null;
  if (!exId || !cat[exId]) return { error: 'sin_ejercicio', msg: '¿De qué ejercicio? Dime, por ejemplo, «hice 8 de sentadilla con 60».' };
  const ex = cat[exId];
  const base = cargaBase(S, day, exId);
  const set: C.FSet = { reps, ...base };
  if (p.kg != null && Number.isFinite(p.kg) && p.kg >= 0 && p.kg <= 1000) {
    if (ex.eq === 'asist') { set.assist = p.kg; delete set.kg; } else { set.kg = p.kg; delete set.assist; }
    if (ex.eq === 'banda') delete set.kg;
  }
  if (ex.eq === 'cardio') set.rir = null;
  else if (p.rir != null && Number.isFinite(p.rir)) set.rir = Math.max(0, Math.min(5, Math.round(p.rir)));
  if (p.neg && p.neg > 0 && !ex.unit && ex.eq !== 'cardio') set.tail = { kind: 'neg', reps: Math.min(50, Math.round(p.neg)) };
  return { exId, set };
}

/** «¡RÉCORD! MÁXIMO ESTIMADO ~80 KG» → «máximo estimado de unos 80 kg» (para decirlo) */
export function recordVoz(r: string | null): string | null {
  if (!r) return null;
  return r.replace(/^¡RÉCORD!\s*/i, '').toLowerCase().replace(/~/g, 'unos ').replace(/ c\/u\b/g, ' cada una').replace(/máximo estimado unos/, 'máximo estimado de unos').replace(/\s+/g, ' ').trim();
}

export type ForgeOp =
  | { accion: 'sesion' }
  | ({ accion: 'serie' } & PedidoSerie)
  | { accion: 'descanso'; que: 'cortar' | 'mas' | 'menos' | 'estado'; segundos?: number }
  | { accion: 'borrar_ultima' }
  | { accion: 'terminar' };

export interface ForgeOpResult { ok: boolean; code?: string; msg?: string; data?: any }

/** El descanso (lo que necesita la voz de restTimer) */
export interface RelojDescanso {
  get(): RestState | null;
  afterSet(s: C.ForgeState, day: string, ex: Ex, set: C.FSet): void;
  adjust(delta: number): void;
  stop(): void;
}
export interface TiendaForge { load(): Promise<C.ForgeState | null>; update(fn: (s: C.ForgeState) => C.ForgeState, why?: string): Promise<C.ForgeState | null> }

/** Aplica un pedido de la voz con el estado de verdad y devuelve lo que quedó (lo que Hestia dice sale de acá) */
export async function aplicarForgeOp(op: ForgeOp, deps: { store: TiendaForge; reloj: RelojDescanso; now?: () => number }): Promise<ForgeOpResult> {
  const S = await deps.store.load();
  if (!S) return { ok: false, code: 'sin_forge', msg: 'Todavía no tienes Forge en este teléfono.' };
  const day = C.L.todayKey();
  const now = deps.now ?? Date.now;
  const cat = C.catalog(S);
  switch (op?.accion) {
    case 'sesion':
      return { ok: true, data: sesionVoz(S, day, deps.reloj.get(), now()) };
    case 'serie': {
      const a = armarSerie(S, day, op);
      if ('error' in a) return { ok: false, code: a.error, msg: a.msg };
      const ex = cat[a.exId];
      const conDescanso = T.withMeasuredRest(S, day, ex, a.set, now());
      const record = Pr.setRecord(S, a.exId, conDescanso, day);
      let tree: Str.AutoSkillResult | null = null;
      const next = await deps.store.update((s) => { tree = Str.applyAutoSkills(C.logSet(s, day, a.exId, conDescanso)); return tree.state; }, 'serie (voz)');
      if (!next) return { ok: false, code: 'error', msg: 'No pude anotarla en Forge.' };
      deps.reloj.afterSet(next, day, ex, conDescanso);
      const p = T.afterSetPlan(next, day, ex, conDescanso);
      const hechas = hechasDe(next, day, a.exId).length;
      const t = tree as Str.AutoSkillResult | null;
      return {
        ok: true,
        data: {
          anotada: { exId: a.exId, nombre: nombreVoz(ex.name), texto: serieVoz(ex, conDescanso), serie: conDescanso.warmup ? 0 : hechas, de: next.plan?.[a.exId] ?? null },
          record: recordVoz(record), arbol: t ? Str.autoSkillToast(t) : null, xp: C.setXpGain(S, next),
          descanso: { secs: p.fin ? 0 : p.secs, tipo: p.kind }, listo: p.fin,
          sigue: queSigue(next, day), sesion: sesionVoz(next, day, deps.reloj.get(), now()),
        },
      };
    }
    case 'descanso': {
      const r = deps.reloj.get();
      if (op.que === 'estado') return { ok: true, data: { descanso: r && !r.ended && r.endAt > now() ? { quedan: Math.round((r.endAt - now()) / 1000), siguiente: r.next } : null } };
      if (!r || r.ended) return { ok: false, code: 'sin_descanso', msg: 'No hay un descanso corriendo.' };
      if (op.que === 'cortar') { deps.reloj.stop(); return { ok: true, data: { cortado: true } }; }
      const secs = Math.max(5, Math.min(300, Math.round(Number(op.segundos) || 30)));
      deps.reloj.adjust(op.que === 'mas' ? secs : -secs);
      const r2 = deps.reloj.get();
      return { ok: true, data: { quedan: r2 && r2.endAt > now() ? Math.round((r2.endAt - now()) / 1000) : 0 } };
    }
    case 'borrar_ultima': {
      const u = ultimaDeHoy(S, day);
      if (!u || !cat[u.exId]) return { ok: false, code: 'sin_series', msg: 'Hoy no hay series anotadas.' };
      const texto = serieVoz(cat[u.exId], u.set);
      await deps.store.update((s) => C.removeSet(s, day, u.exId, u.idx), 'serie borrada (voz)');
      deps.reloj.stop();
      return { ok: true, data: { borrada: { nombre: nombreVoz(cat[u.exId].name), texto } } };
    }
    case 'terminar': {
      deps.reloj.stop();
      const e = T.dayEnergy(S, day);
      const nombres = Object.keys((S.sessions || {})[day] || {}).filter((id) => cat[id] && hechasDe(S, day, id).length).map((id) => nombreVoz(cat[id].name));
      return { ok: true, data: { series: e.sets, minutos: Math.round(e.minutes), kcal: Math.round(e.kcal), ejercicios: nombres } };
    }
    default:
      return { ok: false, code: 'desconocida', msg: 'Forge no sabe hacer eso todavía.' };
  }
}

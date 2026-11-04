// ============================================================
// Eris Mobile — el plan del día de Eris (Eris al timón · T1, 2026-10-29)
//
// «¿Qué recomienda Eris?»: el servidor arma el día (services/DayPlan.ts allá) y acá se guarda, se muestra y se APLICA sin
// preguntar (decisión del usuario: «que sea lo que Eris quiera»):
//   - el entreno: la rutina del día cargada en Forge (con la descarga si durmió mal, o la versión corta) y «¿entrenas hoy?»
//     respondido (las metas de kcal y agua del día se ajustan solas); caminata o descanso, igual;
//   - el tope de gasto de hoy (Finanzas lo muestra);
//   - las comidas se anotan con «Lo comí» (el servidor las registra tal cual, Nutrición las agrega y el Inventario las
//     descuenta).
// «Deshacer» (10 s) devuelve el entreno y la respuesta de «¿entrenas hoy?» como estaban y borra el plan. Lo que se arma por
// chat también llega acá (`day_plan` con `aplicar`).
// T2: «Lo comí ✓» desde el aviso funciona sin conexión (queda en cola y se manda al conectar); si anotó otra cosa en una
// comida del plan, el resto del día se rearma con lo que ya comió; lo que falta para el menú va a la lista de compras.
// ⚡ Modo Rendimiento (R1): el 4.º camino, para el día exigente. Trae su curva de alerta estimada, el tope de café en tazas y
// el check-in de mente (estrés y foco del 1 al 5, y qué pide el día). Cada pedido lleva `v: 2`: así el servidor sabe que
// esta app lo entiende (a las anteriores les llega como Óptimo).
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROFILE_CHANGED_EVENT } from '../ScopedStorage';
import { DeviceEventEmitter } from 'react-native';
import { wsManager } from '../WebSocketManager';
import { forgeStore } from '../forge/forgeStore';
import * as R from '../forge/forgeRoutine';
import * as C from '../forge/forgeCore';
import { DAY_PLAN_EVENT, capKey } from './dayPlanKeys';
export { DAY_PLAN_EVENT, capKey };
import { nutritionBackend } from '../NutritionBackend';
import { foodSearchService, type LoggedFood } from '../FoodSearchService';
import { STORAGE_KEY_LOG } from '../nutritionSync';
import { daySchedule } from '../daySchedule';
import { effectiveSlot } from '../mealSchedule';
import type { AlertCurve } from '../sleep/sleepCore';

export type PlanMode = 'estricto' | 'optimo' | 'flexible' | 'rendimiento';
export interface PlanFood { id: string; name: string; grams: number; portionText: string; kcal: number; protein: number; carbs: number; fat: number; fiber?: number }
/** Los pasos del día exigente: luz, café, siesta-café, bloques de foco, ideas caminando, pausas, respiración */
export type Cue = 'luz' | 'cafe' | 'siesta_cafe' | 'siesta' | 'bloque' | 'ideas' | 'pausa' | 'respira' | 'agua' | 'seguridad';
export type PlanAction =
  | { type: 'log_food'; slot: string; opciones: PlanFood[][]; alt: number }
  | { type: 'load_routine'; deload: boolean; shorter: boolean }
  | { type: 'walk'; minutes: number }
  | { type: 'rest' }
  | { type: 'set_cap'; clp: number }
  /** Eris administra (A2): abrir «Cuadrar» en Finanzas */
  | { type: 'cuadrar' }
  | { type: 'add_list'; items: string[] }
  | { type: 'cue'; cue: Cue; minutes?: number }
  | { type: 'info' };
export type PlanModule = 'comida' | 'entreno' | 'plata' | 'casa' | 'sueno' | 'mente';
export interface PlanStep { id: string; modulo: PlanModule; hora: number | null; titulo: string; detalle: string; accion: PlanAction; hecho?: boolean }
/** El check-in del día exigente: estrés y foco del 1 al 5, y qué pide el día (nunca se muestra como puntaje) */
export type TipoDia = 'detalle' | 'ideas' | 'todo';
export interface Mente { estres?: number; foco?: number; tipo?: TipoDia }
export interface DayPlan {
  mode: PlanMode; day: string; creado: string; kcal: number; proteinG: number | null; resumen: string; pasos: PlanStep[]; nota?: string; avisos: string[]; notas?: string[]; borrador?: boolean; auto?: boolean;
  /** Modo Rendimiento: la curva de alerta de hoy (ESTIMADA), el check-in y el tope de café */
  curva?: AlertCurve | null; mente?: Mente | null; tazas?: { max: number; llevas: number } | null;
}
export interface PlanPreview {
  mode: PlanMode; nombre: string; resumen: string; /** el día exigente se destaca si durmió poco */ destacar?: boolean;
  /** R2: lo que conviene saber antes de elegirlo (pulso en reposo alto, días exigentes de la semana) */ pista?: string;
}

export const MODE_NAME: Record<PlanMode, string> = { estricto: 'Estricto', optimo: 'Óptimo', flexible: 'Flexible', rendimiento: 'Rendimiento' };
const KEY = 'eris_day_plan_v1';
const QUEUE_KEY = 'eris_day_plan_pending_done';
const TOMORROW_KEY = 'eris_day_plan_manana_v1';
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isoTomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return isoOf(d); };
const TIMEOUT_MS = 20_000;

const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Un plan sigue siendo «de hoy» hasta las 6 de la mañana siguiente (el día de comida termina al dormir) */
const vigente = (p: DayPlan | null) => {
  if (!p) return false;
  const d = new Date(); d.setHours(d.getHours() - 6);
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return p.day === isoToday() || p.day === k;
};

/**
 * Cuánto sigue «tocando» un paso después de su hora: una comida, hora y media; un paso del día exigente (café, respirar,
 * empezar un bloque), lo que dura y a lo más media hora (casi nadie marca «Hecho» en el café).
 */
export const stepGrace = (s: PlanStep) => (s.accion.type === 'cue' ? Math.min(0.5, (s.accion.minutes ?? 15) / 60) : 1.5);

/**
 * El siguiente paso que toca (el primero pendiente con hora; si no, el primero pendiente). Lo de todo el día no cuenta.
 * Un paso del día exigente que está en su hora (la siesta-café de las 14:00) va antes que una comida que ya pasó y no se
 * marcó: el café tiene que llegar a tiempo.
 */
export function nextStep(p: DayPlan | null, now: Date = new Date()): PlanStep | null {
  if (!p) return null;
  const h = now.getHours() + now.getMinutes() / 60;
  const pend = p.pasos.filter((s) => !s.hecho && s.accion.type !== 'info' && s.accion.type !== 'set_cap' && s.accion.type !== 'cuadrar' && !(s.accion.type === 'cue' && s.hora == null));
  const enSuHora = pend.find((s) => s.accion.type === 'cue' && s.hora != null && h >= s.hora - 0.25 && h <= s.hora + stepGrace(s));
  return enSuHora ?? pend.find((s) => s.hora != null && s.hora >= h - stepGrace(s)) ?? pend.find((s) => s.hora != null) ?? pend[0] ?? null;
}

/** «Versión corta»: una serie menos por ejercicio (mínimo 2) */
function shorten(s: C.ForgeState): C.ForgeState {
  const plan = Object.fromEntries(Object.entries(s.plan || {}).map(([k, v]) => [k, Math.max(2, (Number(v) || 3) - 1)]));
  const pd: any = s.planDay;
  const targets = pd?.targets ? Object.fromEntries(Object.entries(pd.targets).map(([k, t]: [string, any]) => [k, { ...t, sets: Math.max(2, (t.sets ?? 3) - 1) }])) : undefined;
  return { ...s, plan, ...(pd ? { planDay: { ...pd, targets } } : {}) } as C.ForgeState;
}

/** La cola de «Lo comí ✓» sin conexión (un valor dañado no la rompe) */
async function leerCola(): Promise<string[]> {
  try { const v = JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}

class DayPlanStore {
  private plan: DayPlan | null = null;
  /** el borrador de mañana (piloto automático): sus comidas ya avisan en la mañana con «Lo comí ✓» */
  private tomorrow: DayPlan | null = null;
  /** piloto automático («que Eris arme mi día cada mañana»); null = todavía no se sabe */
  private auto: boolean | null = null;
  private preview: PlanPreview[] | null = null;
  private pending = new Map<string, (d: any) => void>();
  private started = false;
  private seq = 0;
  /** lo que había antes de aplicar el plan, para «Deshacer» */
  private undoSnap: { intent: any; forge: { plan: any; planDay: any } | null; at: number } | null = null;

  start() {
    if (this.started) return;
    this.started = true;
    AsyncStorage.getItem(KEY).then((raw) => {
      try { const p = raw ? JSON.parse(raw) : null; if (vigente(p) && !this.plan) { this.plan = p; this.emit(); } } catch {}
    }).catch(() => {});
    AsyncStorage.getItem(TOMORROW_KEY).then((raw) => { try { const p = raw ? JSON.parse(raw) : null; if (p) { this.tomorrow = p; this.emit(); } } catch {} }).catch(() => {});
    wsManager.subscribeMessage((d: any) => {
      if (d?.type === 'day_plan_manana' && d.plan) {
        this.tomorrow = d.plan;
        AsyncStorage.setItem(TOMORROW_KEY, JSON.stringify(d.plan)).catch(() => {});
        this.emit();
        return;
      }
      if (d?.type !== 'day_plan') return;
      if ('auto' in d && typeof d.auto === 'boolean' && !d.plan?.auto) this.auto = d.auto;
      const wait = d.requestId ? this.pending.get(d.requestId) : undefined;
      if (wait) { this.pending.delete(d.requestId); wait(d); }
      if (d.modos) this.preview = d.modos;
      if ('plan' in d && !d.error) this.setPlan(d.plan ?? null, !!d.aplicar);
    });
    // Al conectar: lo que quedó en cola («Lo comí ✓» sin conexión) y el plan de hoy que tenga el servidor
    // Con la sesión iniciada (el mensaje «connected»), no al abrirse el socket: antes del login el servidor rechaza todo y la
    // cola se perdía (revisión 2026-10-31, D2)
    wsManager.subscribeMessage((d: any) => { if (d?.type === 'connected') this.flush().then(() => this.request('get')).catch(() => {}); });
    // Anotó algo en una comida que el plan tenía pendiente (en la app o por chat): se rearma el resto del día
    nutritionBackend.subscribe(() => this.checkReplan());
  }

  private replanTimer: ReturnType<typeof setTimeout> | null = null;
  private checkReplan() {
    if (this.replanTimer) clearTimeout(this.replanTimer);
    this.replanTimer = setTimeout(() => { this.replanTimer = null; this.maybeReplan().catch(() => {}); }, 4000);
  }
  private async maybeReplan() {
    const p = this.get();
    if (!p || !this.connected()) return;
    const pend = new Set(p.pasos.filter((s) => s.accion.type === 'log_food' && !s.hecho).map((s) => (s.accion as any).slot as string));
    if (!pend.size) return;
    const local: LoggedFood[] = JSON.parse((await AsyncStorage.getItem(`${STORAGE_KEY_LOG}_${daySchedule.todayKey()}`)) || '[]');
    const all = [...local, ...(await nutritionBackend.pendingLogged().catch(() => [] as LoggedFood[]))];
    const slots = new Set<string>();
    let kcal = 0, protein = 0;
    for (const e of all) {
      try { const pr = foodSearchService.calcPortion(e.food, e.grams); kcal += pr.calories || 0; protein += pr.protein || 0; } catch {}
      const at = new Date(e.loggedAt);
      if (e.mealType && !Number.isNaN(at.getTime())) slots.add(effectiveSlot(e.mealType, at));
    }
    if (![...slots].some((s) => pend.has(s))) return;
    await this.request('replan', { ate: { slots: [...slots], kcal: Math.round(kcal), protein: Math.round(protein) } }).catch(() => {});
  }

  /** «Lo comí ✓» desde el aviso: al tiro si hay conexión; si no, en cola hasta conectar */
  async doneOrQueue(pasoId: string): Promise<void> {
    // Con conexión se intenta al tiro; si falla (sin sesión todavía, sin respuesta), queda en cola
    if (this.connected()) { try { await this.done(pasoId); return; } catch {} }
    const p = this.plan;
    if (p) { this.plan = { ...p, pasos: p.pasos.map((s) => (s.id === pasoId ? { ...s, hecho: true } : s)) }; AsyncStorage.setItem(KEY, JSON.stringify(this.plan)).catch(() => {}); this.emit(); }
    const q = await leerCola();
    if (!q.includes(pasoId)) await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...q, pasoId].slice(-10))).catch(() => {});
  }
  /** Lo que quedó en cola: cada paso sale de la cola solo cuando el servidor lo confirma (si falla, queda para la próxima). */
  private async flush() {
    for (const id of await leerCola()) {
      const ok = await this.request('done', { pasoId: id }).then(() => true, () => false);
      if (!ok) return;
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify((await leerCola()).filter((x) => x !== id))).catch(() => {});
    }
  }

  /** «Agregar a la lista»: lo que falta para el menú va a la lista de compras del Inventario */
  async addToList(pasoId: string): Promise<number> {
    const s = this.plan?.pasos.find((x) => x.id === pasoId);
    if (!s || s.accion.type !== 'add_list') return 0;
    const { inventoryStore } = require('../inventory/inventoryStore'); // diferido: el Inventario lee Nutrición
    let n = 0;
    for (const producto of s.accion.items) { const r = await inventoryStore.apply({ action: 'agregar_lista', producto }).catch(() => null); if (r?.ok) n++; }
    await this.done(pasoId);
    return n;
  }

  get(): DayPlan | null {
    if (vigente(this.plan)) return this.plan;
    // amaneció con el borrador de anoche y todavía no llega el de hoy
    return this.tomorrow && this.tomorrow.day === isoToday() ? this.tomorrow : null;
  }
  /** el borrador de mañana, si es de mañana */
  getTomorrow(): DayPlan | null { return this.tomorrow && this.tomorrow.day === isoTomorrow() ? this.tomorrow : null; }
  getAuto(): boolean | null { return this.auto; }
  /** Al cambiar de cuenta: el plan en memoria era de la otra cuenta (y no se debe guardar en esta) */
  olvidarCuenta() { this.plan = null; this.tomorrow = null; this.auto = null; this.preview = null; this.undoSnap = null; this.emit(); }
  /** «Que Eris arme mi día cada mañana» */
  async setAuto(on: boolean): Promise<boolean> {
    const d = await this.request('auto', { on });
    this.auto = !!d.auto;
    this.emit();
    return this.auto;
  }
  getPreview(): PlanPreview[] | null { return this.preview; }
  canUndo(): boolean { return !!this.undoSnap && Date.now() - this.undoSnap.at < 10_000; }
  connected(): boolean { return wsManager.getStatus() === 'connected'; }
  subscribe(fn: () => void): () => void { const s = DeviceEventEmitter.addListener(DAY_PLAN_EVENT, fn); return () => s.remove(); }

  private emit() { DeviceEventEmitter.emit(DAY_PLAN_EVENT); }

  private setPlan(p: DayPlan | null, aplicar: boolean) {
    this.plan = p;
    AsyncStorage.setItem(KEY, JSON.stringify(p)).catch(() => {});
    if (p && aplicar) this.apply(p).catch(() => {});
    this.emit();
  }

  private request(action: string, extra: Record<string, unknown> = {}): Promise<any> {
    if (!this.connected()) return Promise.reject(new Error('sin_conexion'));
    const requestId = `dp${Date.now()}_${++this.seq}`;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(requestId); reject(new Error('timeout')); }, TIMEOUT_MS);
      this.pending.set(requestId, (d) => { clearTimeout(t); d.error && !d.plan ? reject(new Error(d.error)) : resolve(d); });
      // v: 2 = esta app entiende el Modo Rendimiento (el servidor manda los planes tal cual)
      wsManager.sendMessage({ type: 'day_plan_request', requestId, action, v: 2, ...extra });
    });
  }

  /** Los 3 caminos de hoy con su resumen */
  async loadPreview(): Promise<PlanPreview[] | null> {
    const d = await this.request('preview');
    this.preview = d.modos ?? null;
    this.emit();
    return this.preview;
  }

  /**
   * Eris toma el timón: arma el día con ese camino y lo aplica (el entreno, «¿entrenas hoy?», el tope). En el día exigente,
   * el check-in (si lo hizo) ordena los bloques.
   */
  async choose(mode: PlanMode, nota?: string, mente?: Mente | null): Promise<DayPlan | null> {
    const { getIntent } = require('../forge/trainingIntent'); // diferido: trainingIntent lee las metas, que leen las métricas…
    const S = forgeStore.get();
    this.undoSnap = { intent: getIntent(), forge: S ? { plan: S.plan, planDay: S.planDay } : null, at: Date.now() };
    const m = mente ? Object.fromEntries(Object.entries(mente).filter(([, v]) => v != null)) : null;
    const d = await this.request('build', { mode, ...(nota?.trim() ? { nota: nota.trim().slice(0, 240) } : {}), ...(m && Object.keys(m).length ? { mente: m } : {}) });
    return d.plan ?? null;
  }

  /** «Deshacer» (hasta 10 s después de elegir): el entreno y «¿entrenas hoy?» como estaban, y sin plan */
  async undo(): Promise<void> {
    const snap = this.undoSnap;
    this.undoSnap = null;
    await this.request('undo').catch(() => {});
    if (!snap) return;
    const { setIntent } = require('../forge/trainingIntent');
    if (snap.forge) await forgeStore.update((s) => ({ ...s, plan: snap.forge!.plan, planDay: snap.forge!.planDay }), 'deshacer plan de Eris').catch(() => {});
    const i = snap.intent;
    await setIntent(i ? { answer: i.answer, kind: i.kind, activity: i.activity, minutes: i.minutes, time: i.time, label: i.label, source: i.source } : null).catch(() => {});
    const p = this.plan;
    if (p) AsyncStorage.removeItem(capKey(p.day)).catch(() => {});
  }

  /** Un paso hecho («Lo comí» anota la comida tal cual en el servidor) */
  async done(pasoId: string): Promise<boolean> {
    const p = this.plan;
    if (p) { this.plan = { ...p, pasos: p.pasos.map((s) => (s.id === pasoId ? { ...s, hecho: true } : s)) }; this.emit(); } // al tiro, sin esperar
    try { await this.request('done', { pasoId }); return true; }
    catch { if (p) { this.plan = p; this.emit(); } return false; }
  }

  /** Otra opción para esa comida */
  async swap(slot: string): Promise<boolean> {
    try { const d = await this.request('swap', { slot }); return !d.error; } catch { return false; }
  }

  /** Lo que se aplica sin preguntar al elegir el camino */
  private async apply(p: DayPlan): Promise<void> {
    const { setIntent, getIntent } = require('../forge/trainingIntent');
    const e = p.pasos.find((s) => s.modulo === 'entreno');
    const cur = getIntent();
    const today = C.L.todayKey();
    const trainedToday = Object.values(((forgeStore.get() as any)?.training ?? {})[today] ?? {}).some((n: any) => Number(n) > 0);
    if (e && !e.hecho && !trainedToday) {
      const hhmm = e.hora != null ? `${String(Math.floor(e.hora) % 24).padStart(2, '0')}:${String(Math.round((e.hora % 1) * 60)).padStart(2, '0')}` : cur?.time;
      if (e.accion.type === 'load_routine') {
        const a = e.accion;
        await forgeStore.update((s) => { const n = R.loadRoutineDay(s, undefined, { sleepPoor: a.deload }); return a.shorter ? shorten(n) : n; }, 'plan de Eris').catch(() => {});
        if (!(cur?.answer === 'si' && cur?.kind !== 'otra')) await setIntent({ answer: 'si', kind: 'rutina', ...(hhmm ? { time: hhmm } : {}), source: 'app' }).catch(() => {});
      } else if (e.accion.type === 'walk') {
        await setIntent({ answer: 'si', kind: 'otra', activity: 'caminata', minutes: e.accion.minutes, ...(hhmm ? { time: hhmm } : {}), source: 'app' }).catch(() => {});
      } else if (e.accion.type === 'rest' && cur?.answer !== 'no') {
        await setIntent({ answer: 'no', source: 'app' }).catch(() => {});
      }
    }
    const cap = p.pasos.find((s) => s.accion.type === 'set_cap');
    if (cap && cap.accion.type === 'set_cap') AsyncStorage.setItem(capKey(p.day), String(cap.accion.clp)).catch(() => {});
    else AsyncStorage.removeItem(capKey(p.day)).catch(() => {});
  }
}

export const dayPlanStore = new DayPlanStore();
// Otra cuenta en el teléfono: nada de la anterior queda en memoria (revisión 2026-10-31, D4) (el plan de hoy y el borrador de mañana)
DeviceEventEmitter.addListener(PROFILE_CHANGED_EVENT, () => dayPlanStore.olvidarCuenta());

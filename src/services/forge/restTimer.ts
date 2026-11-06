// ============================================================
// Forge — la barra de descanso entre series (2026-11-05)
//
// Se anota al TERMINAR la serie, así que el descanso parte solo al anotar. Al acabarse vibra (sin sonido: no corta la
// música) y muestra lo que toca; después no cuenta hacia arriba, porque a esa altura ya estás haciendo la serie.
// Se calcula con la hora de término, no con una cuenta en memoria: sobrevive a la pantalla bloqueada y a cerrar la app.
// Lo que dejas con −15/+15 queda como el descanso de ESE ejercicio (forgeTrain.setRestPref).
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, DeviceEventEmitter, Vibration } from 'react-native';
import { forgeStore } from './forgeStore';
import { L, type ForgeState, type FSet } from './forgeCore';
import type { ForgeExercise } from './forgeCatalog';
import { afterSetPlan, setRestPref, type RestKind } from './forgeTrain';
import { PROFILE_CHANGED_EVENT } from '../ScopedStorage';

const KEY = 'forge_rest_timer_v1';
export const REST_VIBRATION = [0, 300, 150, 300];
/** Cuánto queda a la vista «te toca» después de acabarse */
export const REST_HOLD_MS = 20_000;
/** Si la app recién despierta y ya se había acabado hace rato, no vibra tarde */
const VIBRA_TARDE_MS = 3_000;
const GUARDAR_MS = 1_500;

export interface RestState {
  endAt: number;
  /** el descanso completo (s): lo que queda guardado para el ejercicio */
  total: number;
  exId: string;
  exName: string;
  /** «Serie 3 de 3 · 110 lb × 12» */
  next: string;
  /** en un calentamiento no se guarda nada */
  warmup: boolean;
  ended: boolean;
  /** descanso de la serie, cambio de ejercicio, ejercicios unidos o calentamiento */
  kind?: RestKind;
  /** dónde queda lo que ajustes con −15/+15 (null = no se guarda; sin dato, en el ejercicio) */
  saveAs?: string | null;
}

/** El aviso con la pantalla bloqueada: lo conecta ForgeScreen (así la barra también se dibuja en el banco de prueba). */
export interface RestAlarm {
  schedule: (at: number, next: string) => void; cancel: () => void;
  /** el objetivo del cronómetro de un ejercicio por tiempo (aparte: no pisa al descanso) */
  goal: (at: number, body: string) => void; cancelGoal: () => void;
}

class RestTimer {
  private state: RestState | null = null;
  private listeners = new Set<(s: RestState | null) => void>();
  private endT: ReturnType<typeof setTimeout> | null = null;
  private hideT: ReturnType<typeof setTimeout> | null = null;
  private prefT: ReturnType<typeof setTimeout> | null = null;
  private pref: { exId: string; secs: number } | null = null;
  private profileSub: { remove(): void } | null = null;
  alarm: RestAlarm | null = null;

  get() { return this.state; }

  subscribe(fn: (s: RestState | null) => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() { for (const fn of [...this.listeners]) fn(this.state); }

  private clearTimers() {
    if (this.endT) clearTimeout(this.endT);
    if (this.hideT) clearTimeout(this.hideT);
    this.endT = this.hideT = null;
  }

  private persist() {
    if (this.state) AsyncStorage.setItem(KEY, JSON.stringify(this.state)).catch(() => {});
    else AsyncStorage.removeItem(KEY).catch(() => {});
  }

  private arm() {
    this.clearTimers();
    const st = this.state;
    if (!st) return;
    const falta = st.endAt - Date.now();
    if (falta > 0) { this.endT = setTimeout(() => this.finish(), falta); return; }
    this.finish();
  }

  private finish() {
    const st = this.state;
    if (!st) return;
    const tarde = Date.now() - st.endAt;
    this.state = { ...st, ended: true };
    if (tarde <= VIBRA_TARDE_MS && AppState.currentState === 'active') Vibration.vibrate(REST_VIBRATION);
    this.clearTimers();
    const queda = REST_HOLD_MS - Math.max(0, tarde);
    if (queda > 0) this.hideT = setTimeout(() => this.stop(), queda);
    else return this.stop();
    this.persist();
    this.emit();
  }

  /** Recién anotada una serie de HOY: parte su descanso (o se acaba, si ya está todo el plan). */
  afterSet(s: ForgeState, day: string, ex: ForgeExercise, set: FSet) {
    if (day !== L.todayKey()) return;
    const p = afterSetPlan(s, day, ex, set);
    if (!p.secs || p.fin) { this.stop(); return; }
    this.start({ secs: p.secs, exId: ex.id, exName: ex.name, next: p.text, warmup: !!set.warmup, kind: p.kind, saveAs: p.saveAs });
  }

  start(o: { secs: number; exId: string; exName: string; next: string; warmup?: boolean; kind?: RestKind; saveAs?: string | null }) {
    this.flushPref();
    this.state = { endAt: Date.now() + o.secs * 1000, total: o.secs, exId: o.exId, exName: o.exName, next: o.next, warmup: !!o.warmup, ended: false, kind: o.kind, saveAs: o.saveAs };
    this.watchProfile();
    this.arm();
    this.alarm?.schedule(this.state.endAt, o.next);
    this.persist();
    this.emit();
  }

  /** −15 / +15: mueve el término y queda como el descanso de este ejercicio. */
  adjust(delta: number) {
    const st = this.state;
    if (!st || st.ended) return;
    const total = Math.max(15, Math.min(600, st.total + delta));
    const real = total - st.total;
    if (!real) return;
    this.state = { ...st, total, endAt: st.endAt + real * 1000 };
    const clave = st.saveAs === undefined ? (st.warmup ? null : st.exId) : st.saveAs;
    if (clave) this.savePref(clave, total);
    this.arm();
    if (this.state && !this.state.ended) this.alarm?.schedule(this.state.endAt, st.next);
    this.persist();
    this.emit();
  }

  stop() {
    this.flushPref();
    this.clearTimers();
    const habia = !!this.state;
    this.state = null;
    if (habia) this.alarm?.cancel();
    this.persist();
    if (habia) this.emit();
  }

  /** Al abrir Forge: si seguía corriendo cuando se cerró la app, sigue con la misma hora de término. */
  async restore() {
    if (this.state) return;
    let st: RestState | null = null;
    try { st = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null'); } catch {}
    if (!st || typeof st.endAt !== 'number') return;
    if (Date.now() - st.endAt >= REST_HOLD_MS) { this.persist(); return; }
    this.state = st;
    this.watchProfile();
    this.arm();
    this.emit();
  }

  private savePref(exId: string, secs: number) {
    this.pref = { exId, secs };
    if (this.prefT) clearTimeout(this.prefT);
    this.prefT = setTimeout(() => this.flushPref(), GUARDAR_MS);
  }

  private flushPref() {
    if (this.prefT) clearTimeout(this.prefT);
    this.prefT = null;
    const p = this.pref;
    this.pref = null;
    if (p) void forgeStore.update((s) => setRestPref(s, p.exId, p.secs), 'descanso');
  }

  /** Otra cuenta en el teléfono: el descanso de la anterior no sigue corriendo. */
  private watchProfile() {
    if (this.profileSub) return;
    this.profileSub = DeviceEventEmitter.addListener(PROFILE_CHANGED_EVENT, () => { this.pref = null; this.stop(); });
  }
}

export const restTimer = new RestTimer();

export const fmtClock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.max(0, secs) % 60).padStart(2, '0')}`;

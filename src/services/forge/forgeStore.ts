// ============================================================
// Eris Mobile — Forge nativo: dónde vive Forge en el teléfono (Forge 2.0, F1, 2026-10-17)
//
// Un solo estado (forgeCore.ForgeState) y la rutina, guardados por cuenta (AsyncStorage pasa por ScopedStorage:
// `u:<perfil>:`). Todo cambio pasa por acá: se guarda, se avisa a las pantallas y a forgeSync (servidor, avisos, Métricas,
// respaldo cifrado en el PC con las mismas claves del HTML). Mientras no exista (todavía no se migra desde el HTML),
// `get()` es null y Forge sigue siendo el HTML.
// A diferencia del HTML, este estado está vivo aunque Forge no esté abierto: lo que Eris arma por chat se aplica al tiro.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { guardar, apartarDanado } from '../saveGuard';
import { DeviceEventEmitter } from 'react-native';
import * as C from './forgeCore';
import { PROFILE_CHANGED_EVENT } from '../ScopedStorage';
import { applyAutoSkills } from './forgeStrength';
import { routineDayStart } from './forgeRoutine';

export const FORGE_STATE_KEY = 'forge_state_v1';
export const FORGE_ROUTINE_KEY = 'forge_routine_v1';
export const FORGE_CHANGED_EVENT = 'forge_state_changed';

export type Routine = { md: string; name: string } | null;
type Listener = (s: C.ForgeState | null) => void;

class ForgeStore {
  private state: C.ForgeState | null = null;
  private routine: Routine = null;
  private loaded = false;
  private loading: Promise<C.ForgeState | null> | null = null;
  private listeners = new Set<Listener>();
  private saving: Promise<void> = Promise.resolve();
  private changeHooks = new Set<(s: C.ForgeState, routine: Routine, why: string) => void>();
  private autoChecked = false;

  constructor() {
    // Otra cuenta en el teléfono: otro Forge
    DeviceEventEmitter.addListener(PROFILE_CHANGED_EVENT, () => { this.state = null; this.routine = null; this.loaded = false; this.loading = null; this.autoChecked = false; this.emit(); });
  }

  async load(): Promise<C.ForgeState | null> {
    if (this.loaded) return this.state;
    if (!this.loading) {
      this.loading = AsyncStorage.multiGet([FORGE_STATE_KEY, FORGE_ROUTINE_KEY]).then((pairs) => {
        const raw = pairs.find(([k]) => k === FORGE_STATE_KEY)?.[1];
        const rr = pairs.find(([k]) => k === FORGE_ROUTINE_KEY)?.[1];
        try { this.state = raw ? C.hydrate(JSON.parse(raw)) : null; } catch { this.state = null; if (raw) void apartarDanado(FORGE_STATE_KEY, raw); }
        try { const r = rr ? JSON.parse(rr) : null; this.routine = r?.md ? { md: String(r.md), name: String(r.name || 'Mi rutina') } : null; } catch { this.routine = null; }
        this.loaded = true;
        return this.state;
      });
    }
    const s = await this.loading;
    // El paso de día del HTML (al abrir): lo de ayer al registro, la racha se corta si no se reclamó
    if (s && s.today?.dayKey !== C.L.todayKey()) await this.replace(C.rollover(s), 'día nuevo');
    // Con rutina (Forge 2.0): cada día carga lo que toca, con la progresión (siguiente peso, +1 rep o descarga). Con días de la
    // semana (rutina escrita, fase I8), un día que no toca queda de descanso, sin el plan de ayer.
    if (this.state?.routinePlan && this.state.planDay?.day !== C.L.todayKey()) await this.replace(routineDayStart(this.state), 'plan de la rutina');
    // El árbol automático (Forge 2.0): lo que ya cumpliste con tus entrenos (incluido lo migrado), una vez al cargar
    if (this.state && !this.autoChecked) {
      this.autoChecked = true;
      const r = applyAutoSkills(this.state);
      if (r.checked.length) await this.replace(r.state, 'árbol automático');
    }
    return this.state;
  }

  get(): C.ForgeState | null { return this.state; }
  getRoutine(): Routine { return this.routine; }
  /** ¿Ya existe Forge nativo en este teléfono (migrado o nuevo)? */
  async exists(): Promise<boolean> { return (await this.load()) != null; }

  subscribe(fn: Listener): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  /** forgeSync se cuelga acá: cada cambio guardado (con el motivo). */
  onChange(fn: (s: C.ForgeState, routine: Routine, why: string) => void): () => void { this.changeHooks.add(fn); return () => { this.changeHooks.delete(fn); }; }
  private emit() { for (const f of this.listeners) { try { f(this.state); } catch {} } DeviceEventEmitter.emit(FORGE_CHANGED_EVENT); }

  /** Reemplaza todo el estado (migración, restaurar o un cambio ya calculado), lo guarda y avisa. */
  async replace(S: C.ForgeState, why = 'cambio', routine?: Routine): Promise<void> {
    this.state = S;
    if (routine !== undefined) this.routine = routine;
    this.loaded = true;
    this.emit();
    const r = this.routine;
    this.saving = this.saving.then(async () => {
      await guardar(FORGE_STATE_KEY, JSON.stringify(S), 'Forge');
      if (routine !== undefined) {
        if (r) await AsyncStorage.setItem(FORGE_ROUTINE_KEY, JSON.stringify(r)); else await AsyncStorage.removeItem(FORGE_ROUTINE_KEY);
      }
    }).catch((e) => { console.warn('[Forge] no se pudo guardar:', e); });
    await this.saving;
    for (const h of this.changeHooks) { try { h(S, this.routine, why); } catch {} }
  }

  /** Un cambio con una función pura del núcleo. null = todavía no hay Forge nativo. */
  async update(fn: (s: C.ForgeState) => C.ForgeState, why = 'cambio'): Promise<C.ForgeState | null> {
    const S = await this.load();
    if (!S) return null;
    const next = fn(S);
    if (next !== S) await this.replace(next, why);
    return next;
  }

  async setRoutine(r: Routine): Promise<void> {
    const S = await this.load();
    if (!S) return;
    await this.replace(S, 'rutina', r);
  }
}

export const forgeStore = new ForgeStore();

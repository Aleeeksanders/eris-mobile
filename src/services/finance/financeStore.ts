// ============================================================
// Eris Mobile — Finanzas nativa: dónde vive la plata en el teléfono (Finanzas 2.0, F1)
//
// Un solo estado (financeCore.FinanceState) guardado por cuenta (AsyncStorage pasa por ScopedStorage: `u:<perfil>:`).
// Todo cambio pasa por acá: se guarda, se avisa a las pantallas y se respalda CIFRADO en el PC con el mismo formato que
// la versión web (claves hw*, services/financeBackup.ts), así respaldo, restaurar y migración son un solo camino.
// Mientras no exista (todavía no se migra desde la versión web), `get()` es null y Finanzas sigue siendo la web.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { applyOp, aplicarProgramados, draft, extract, limpiarEfectivoVacio, toHwKeys, fromHwKeys, type Ctx, type FinanceState, type OpResult } from './financeCore';
import { guardar, apartarDanado } from '../saveGuard';
import { onFinanceDump, type FinanceDump } from '../financeBackup';
import { PROFILE_CHANGED_EVENT } from '../ScopedStorage';

export const FINANCE_STATE_KEY = 'finance_state_v1';
export const FINANCE_CHANGED_EVENT = 'finance_state_changed';

type Listener = (s: FinanceState | null) => void;

/** El volcado que espera el respaldo del PC (el mismo de la versión web). */
export function dumpOf(S: FinanceState, profile: string, now = new Date()): FinanceDump {
  const keys = toHwKeys(S);
  return { v: 1, profile, at: now.toISOString(), keys, stats: { tx: S.tx.length, cuentas: S.cuentas.filter((c) => c.id !== 'cash').length, claves: Object.keys(keys).length } };
}

class FinanceStore {
  private state: FinanceState | null = null;
  private loaded = false;
  /** El libro nativo existía pero no se pudo leer (quedó apartado): no es «todavía no hay Finanzas nativa» */
  private ilegible = false;
  private loading: Promise<FinanceState | null> | null = null;
  private listeners = new Set<Listener>();
  private lastId = 0;
  private profile: () => Promise<string | null> = async () => null;
  private saving: Promise<void> = Promise.resolve();

  constructor() {
    // Otra cuenta en el teléfono: otro estado
    DeviceEventEmitter.addListener(PROFILE_CHANGED_EVENT, () => { this.state = null; this.loaded = false; this.loading = null; this.ilegible = false; this.emit(); });
  }

  /** De dónde sale el perfil para el respaldo (lo conecta App: AuthStorage). */
  setProfileSource(fn: () => Promise<string | null>) { this.profile = fn; }

  /** Ids nuevos: crecientes y únicos aunque se creen varios en el mismo milisegundo. */
  ctx(now = new Date()): Ctx {
    return { now, newId: () => { this.lastId = Math.max(Date.now(), this.lastId + 1); return this.lastId; } };
  }

  async load(): Promise<FinanceState | null> {
    if (this.loaded) return this.state;
    if (!this.loading) {
      this.loading = AsyncStorage.getItem(FINANCE_STATE_KEY).then((raw) => {
        // Ilegible: se aparta antes de seguir (si no, el primer uso lo pisaba con un libro vacío; revisión D5)
        try { this.state = raw ? (JSON.parse(raw) as FinanceState) : null; this.ilegible = false; } catch { this.state = null; this.ilegible = !!raw; if (raw) void apartarDanado(FINANCE_STATE_KEY, raw); }
        this.loaded = true;
        const ids = (this.state?.tx ?? []).map((t) => Number(t.id)).filter(Number.isFinite);
        this.lastId = Math.max(this.lastId, ...ids, 0);
        // Solo existe la plata de tus cuentas (2026-10-22): fuera el «Efectivo» en $0 que nunca se usó. Se guarda y se
        // respalda como cualquier cambio (el respaldo anterior del PC queda como estaba).
        const limpio = this.state ? limpiarEfectivoVacio(this.state) : null;
        if (limpio) void this.replace(limpio);
        return this.state;
      });
    }
    return this.loading;
  }

  get(): FinanceState | null { return this.state; }
  /** ¿El libro nativo estaba pero no se pudo leer? (FinanceBridge no debe caer a la versión web vieja; revisión F3) */
  danado(): boolean { return this.ilegible; }
  /** ¿Ya existe Finanzas nativa en este teléfono (migrada o nueva)? */
  async exists(): Promise<boolean> { return (await this.load()) != null; }

  subscribe(fn: Listener): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { for (const f of this.listeners) { try { f(this.state); } catch {} } DeviceEventEmitter.emit(FINANCE_CHANGED_EVENT); }

  /** Reemplaza todo el estado (migración, restaurar, o un cambio ya calculado), lo guarda y lo respalda. */
  async replace(S: FinanceState): Promise<void> {
    this.state = S;
    this.loaded = true;
    this.emit();
    this.saving = this.saving.then(() => guardar(FINANCE_STATE_KEY, JSON.stringify(S), 'Finanzas')).catch(() => {});
    await this.saving;
    void this.backup();
  }

  /**
   * Restaurar un respaldo del PC en la versión nativa (revisión 2026-10-31, D3: antes solo lo aplicaba la versión web, que
   * ya no se abre, y Perfil → Restaurar respondía siempre «Finanzas no respondió»). Lo de ahora queda aparte.
   */
  async restore(keys: Record<string, string>): Promise<{ ok: boolean; motivo?: string }> {
    let S: FinanceState;
    try { S = fromHwKeys(keys); } catch { return { ok: false, motivo: 'el respaldo no se puede leer' }; }
    if (!Array.isArray(S.tx) || !Array.isArray(S.cuentas)) return { ok: false, motivo: 'el respaldo no se puede leer' };
    // Un respaldo vacío no reemplaza lo que hay (dejaría Finanzas en blanco)
    if (!S.tx.length && !S.cuentas.length && !S.prog.length) return { ok: false, motivo: 'ese respaldo está vacío' };
    const antes = await this.load();
    if (antes) await AsyncStorage.setItem(`${FINANCE_STATE_KEY}__antes_de_restaurar`, JSON.stringify(antes)).catch(() => {});
    await this.replace({ ...S, setupDone: S.setupDone || S.tx.length > 0 || S.cuentas.length > 0 });
    return { ok: true };
  }

  /** Un cambio sobre una copia del estado (formularios de la app): `fn` recibe la copia de trabajo. */
  async update(fn: (W: FinanceState, ctx: Ctx) => void): Promise<FinanceState | null> {
    const S = await this.load();
    if (!S) return null;
    const W = draft(S);
    fn(W, this.ctx());
    await this.replace(W);
    return W;
  }

  /** Un formulario (financeCore.form*): se guarda solo si salió bien. null = todavía no hay Finanzas nativa. */
  async act<R extends { ok: boolean }>(fn: (W: FinanceState, ctx: Ctx) => R): Promise<R | null> {
    const S = await this.load();
    if (!S) return null;
    const W = draft(S);
    const r = fn(W, this.ctx());
    if (r.ok) await this.replace(W);
    return r;
  }

  /** Una operación del chat (FinanceBridge) o de la app con las mismas reglas que la web. null = todavía no hay Finanzas nativa. */
  async apply(op: unknown): Promise<OpResult | null> {
    const S = await this.load();
    if (!S) return null;
    const r = applyOp(S, op, this.ctx());
    await this.replace(r.state);
    return r.result;
  }

  /** Los fijos que ya llegaron a su día (al abrir Finanzas, como hacía la web). Devuelve cuántos anotó. */
  async applyScheduled(): Promise<number> {
    const S = await this.load();
    if (!S) return 0;
    const W = draft(S);
    const n = aplicarProgramados(W, this.ctx());
    if (n) await this.replace(W);
    return n;
  }

  /** Lo que lee Eris (contexto y resumen), igual que el `__hwExtract` de la web. */
  extract(now = new Date()) { return this.state ? extract(this.state, now) : null; }

  private async backup() {
    const S = this.state;
    const profile = await this.profile().catch(() => null);
    if (!S || !profile || profile === 'anon') return;
    onFinanceDump(dumpOf(S, profile));
  }
}

export const financeStore = new FinanceStore();

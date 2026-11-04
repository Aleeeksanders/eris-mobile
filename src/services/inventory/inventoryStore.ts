// ============================================================
// Eris Mobile — Inventario: dónde vive en el teléfono (2026-10-22, fase I2)
//
// Un solo estado (inventoryCore.InventoryState) guardado por cuenta (AsyncStorage pasa por ScopedStorage: `u:<perfil>:`).
// Todo cambio pasa por acá: se guarda, se avisa a las pantallas, se respalda CIFRADO en el PC (inventoryBackup) y se le
// manda a Eris lo que hay (update_inventory_context) para que el chat y el asesor de comida sepan qué tienes.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { guardar, apartarDanado } from '../saveGuard';
import { DeviceEventEmitter } from 'react-native';
import { applyOp, draft, emptyState, extract, normalizar, type Ctx, type InventoryState, type OpResult } from './inventoryCore';
import { onInventoryDump, pullInventoryBackup, fechaHora, INVENTORY_KEY } from '../inventoryBackup';
import { PROFILE_CHANGED_EVENT } from '../ScopedStorage';
import { wsManager } from '../WebSocketManager';
import { AuthStorage } from '../AuthStorage';

export const INVENTORY_STATE_KEY = INVENTORY_KEY;
export const INVENTORY_CHANGED_EVENT = 'inventory_state_changed';
const BEFORE_RESTORE_KEY = 'inventory_before_restore';

type Listener = (s: InventoryState) => void;

class InventoryStore {
  private state: InventoryState | null = null;
  private loaded = false;
  private loading: Promise<InventoryState> | null = null;
  private listeners = new Set<Listener>();
  private lastId = 0;
  private profile: () => Promise<string | null> = async () => null;
  private saving: Promise<void> = Promise.resolve();
  private ctxTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Otra cuenta en el teléfono: otro inventario
    DeviceEventEmitter.addListener(PROFILE_CHANGED_EVENT, () => { this.state = null; this.loaded = false; this.loading = null; });
    // Al reconectar, Eris vuelve a saber qué tienes
    wsManager.subscribeMessage((d: any) => { if (d?.type === 'connected' && this.state) this.pushContext(true); });
  }

  /** De dónde sale el perfil para el respaldo (lo conecta App: AuthStorage). */
  setProfileSource(fn: () => Promise<string | null>) { this.profile = fn; }

  /** Ids nuevos: crecientes y únicos aunque se creen varios en el mismo milisegundo. */
  ctx(now = new Date()): Ctx {
    return { now, newId: () => { this.lastId = Math.max(Date.now(), this.lastId + 1); return this.lastId; } };
  }

  async load(): Promise<InventoryState> {
    if (this.loaded && this.state) return this.state;
    if (!this.loading) {
      this.loading = AsyncStorage.getItem(INVENTORY_STATE_KEY).then((raw) => {
        let S: InventoryState;
        try { S = raw ? normalizar(JSON.parse(raw)) : emptyState(); } catch { S = emptyState(); if (raw) void apartarDanado(INVENTORY_STATE_KEY, raw); }
        this.state = S;
        this.loaded = true;
        const ids = [...S.items.map((i) => i.id), ...S.movs.map((m) => m.id), ...S.compras.map((c) => c.id)].filter(Number.isFinite);
        this.lastId = Math.max(this.lastId, ...ids, 0);
        return S;
      });
    }
    return this.loading;
  }

  get(): InventoryState | null { return this.state; }
  subscribe(fn: Listener): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { const S = this.state; if (S) for (const f of this.listeners) { try { f(S); } catch {} } DeviceEventEmitter.emit(INVENTORY_CHANGED_EVENT); }

  /** Reemplaza todo el estado (un cambio ya calculado, o restaurar), lo guarda y lo respalda. */
  async replace(S: InventoryState): Promise<void> {
    this.state = S;
    this.loaded = true;
    this.emit();
    this.saving = this.saving.then(() => guardar(INVENTORY_STATE_KEY, JSON.stringify(S), 'Inventario')).catch(() => {});
    await this.saving;
    void this.backup();
    this.pushContext();
  }

  /** Un formulario (inventoryCore): se guarda solo si salió bien. */
  async act<R extends { ok: boolean }>(fn: (W: InventoryState, ctx: Ctx) => R): Promise<R> {
    const S = await this.load();
    const W = draft(S);
    const r = fn(W, this.ctx());
    if (r.ok) await this.replace(W);
    return r;
  }

  /** Una operación del chat (inventory_tracker) con las mismas reglas que la app. */
  async apply(op: unknown): Promise<OpResult> {
    const S = await this.load();
    const r = applyOp(S, op, this.ctx());
    const escribe = ['compra', 'consumo', 'se_acabo', 'quedan', 'botar', 'agregar_lista', 'deshacer'].includes(String((op as any)?.action));
    if (r.result.ok && escribe) await this.replace(r.state);
    return r.result;
  }

  /** Trae un respaldo del PC y lo deja como el inventario (lo de ahora queda guardado aparte en el teléfono). */
  async restore(day?: string): Promise<{ ok: boolean; message: string }> {
    const dump = await pullInventoryBackup(day);
    if (!dump) return { ok: false, message: wsManager.getStatus() === 'connected' ? 'No encontré ese respaldo en el PC.' : 'Sin conexión con el servidor de Eris.' };
    let S: InventoryState;
    try { S = normalizar(JSON.parse(dump.keys[INVENTORY_KEY])); } catch { return { ok: false, message: 'El respaldo venía dañado: no lo apliqué.' }; }
    const actual = await this.load();
    await AsyncStorage.setItem(BEFORE_RESTORE_KEY, JSON.stringify(actual)).catch(() => {});
    await this.replace({ ...S, setupDone: true });
    const n = S.items.filter((i) => !i.archivado).length;
    return { ok: true, message: `Listo: tu Inventario quedó como el ${fechaHora(dump.at)} (${n} cosa${n === 1 ? '' : 's'}).` };
  }

  /** Lo que lee Eris (contexto y números). */
  extract(now = new Date()) { return this.state ? extract(this.state, now) : null; }

  private async backup() {
    const S = this.state;
    const profile = await this.profile().catch(() => null);
    if (!S || !profile || profile === 'anon') return;
    onInventoryDump({ v: 1, profile, at: new Date().toISOString(), keys: { [INVENTORY_STATE_KEY]: JSON.stringify(S) } });
  }

  /** A Eris: qué hay en casa (agrupado: muchos toques seguidos mandan una sola vez). */
  pushContext(now = false) {
    if (this.ctxTimer) clearTimeout(this.ctxTimer);
    const send = () => {
      this.ctxTimer = null;
      const ex = this.extract();
      if (ex && wsManager.getStatus() === 'connected') wsManager.sendMessage({ type: 'update_inventory_context', context: ex.context, summary: ex.summary });
    };
    if (now) send(); else this.ctxTimer = setTimeout(send, 3000);
  }
}

export const inventoryStore = new InventoryStore();

let started = false;
/** Al abrir la app (con sesión): el respaldo sabe de quién es, y Eris sabe qué tienes en casa desde el primer mensaje. */
export function startInventory() {
  if (started) return;
  started = true;
  inventoryStore.setProfileSource(async () => (await AuthStorage.getCredentials().catch(() => null))?.profileId ?? null);
  inventoryStore.load().then(() => inventoryStore.pushContext(true)).catch(() => {});
}

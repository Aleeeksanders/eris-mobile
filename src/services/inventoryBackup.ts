// ============================================================
// Eris Mobile — respaldo de Inventario (2026-10-22, fase I2)
//
// Cada vez que el Inventario cambia, inventoryStore manda su estado y acá se envía al servidor, que lo guarda CIFRADO en
// el PC (eris/src/services/InventoryBackup.ts: una copia por día, las últimas 7). Mismo camino que Finanzas y Forge.
// Restaurar: desde Inventario (⚙) o Perfil; la app lo ofrece sola si el Inventario aparece vacío y en el PC hay un respaldo.
// ============================================================
import { DeviceEventEmitter } from 'react-native';
import { wsManager } from './WebSocketManager';

export const INVENTORY_KEY = 'inventory_state_v1';
export interface InventoryStats { items: number; conStock: number; movs: number }
export interface InventoryDump { v: number; profile: string; at: string; keys: Record<string, string>; stats?: InventoryStats }
export interface InventoryBackupCopy { day: string; at: string; stats: InventoryStats; size: number }

/** El servidor no guardó un Inventario vacío porque hay un respaldo con datos: se ofrece restaurarlo. */
export const INVENTORY_RESTORE_OFFER_EVENT = 'inventory_restore_offer';

const TIMEOUT_MS = 8000;
/** Entre dos envíos al PC pasa al menos esto (una revisión de la semana son muchos toques seguidos). */
const MIN_GAP_MS = 20_000;
let installed = false;
let lastDump: InventoryDump | null = null;
let lastSentHash = '';
let lastSentAt = 0;
let confirmedHash = '';
let trailing: ReturnType<typeof setTimeout> | null = null;

/** Huella del contenido (no de la hora del volcado): si nada cambió, no se vuelve a mandar. Igual que el servidor. */
export function inventoryHashOf(d: { keys: Record<string, string> }): string {
  const s = JSON.stringify(Object.keys(d.keys).sort().map((k) => [k, d.keys[k]]));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

function isDump(x: any): x is InventoryDump {
  return !!x && typeof x === 'object' && typeof x.profile === 'string' && !!x.keys && typeof x.keys[INVENTORY_KEY] === 'string';
}

function install() {
  if (installed) return;
  installed = true;
  wsManager.subscribeMessage((d: any) => {
    // Al reconectar se manda lo último si el servidor todavía no lo confirmó
    if (d?.type === 'connected' && lastDump && confirmedHash !== inventoryHashOf(lastDump)) send(lastDump, true);
    if (d?.type === 'inventory_backup_saved') {
      if (d.ok && typeof d.hash === 'string') confirmedHash = d.hash;
      if (d.restore && typeof d.restore === 'object') DeviceEventEmitter.emit(INVENTORY_RESTORE_OFFER_EVENT, d.restore as InventoryBackupCopy);
    }
  });
}

function send(d: InventoryDump, force = false) {
  const hash = inventoryHashOf(d);
  if (!force && hash === lastSentHash) return;
  if (wsManager.getStatus() !== 'connected') return; // queda en lastDump: se manda al reconectar
  const wait = lastSentAt + MIN_GAP_MS - Date.now();
  if (!force && wait > 0) {
    if (!trailing) trailing = setTimeout(() => { trailing = null; if (lastDump) send(lastDump); }, wait);
    return;
  }
  lastSentHash = hash;
  lastSentAt = Date.now();
  wsManager.sendMessage({ type: 'inventory_backup_push', dump: d, hash });
}

/** Lo que manda inventoryStore al cambiar: se respalda si cambió algo. */
export function onInventoryDump(raw: unknown) {
  install();
  if (!isDump(raw)) return;
  lastDump = raw;
  send(raw);
}

function ask<T>(req: Record<string, unknown>, replyType: string, pick: (d: any) => T): Promise<T | null> {
  install();
  if (wsManager.getStatus() !== 'connected') return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = `ib_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let done = false;
    const finish = (r: T | null) => { if (done) return; done = true; clearTimeout(timer); unsub(); resolve(r); };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    const unsub = wsManager.subscribeMessage((d: any) => {
      if (d?.type === replyType && d.requestId === requestId) finish(pick(d));
    });
    wsManager.sendMessage({ ...req, requestId });
  });
}

/** Las copias que hay en el PC (la más nueva primero). null = sin conexión. */
export function listInventoryBackups(): Promise<InventoryBackupCopy[] | null> {
  return ask({ type: 'inventory_backup_list' }, 'inventory_backup_list', (d) => (Array.isArray(d.copies) ? (d.copies as InventoryBackupCopy[]) : []));
}

/** Trae una copia del PC (por día; sin día, la más nueva). null = no está o sin conexión. */
export function pullInventoryBackup(day?: string): Promise<InventoryDump | null> {
  return ask({ type: 'inventory_backup_pull', ...(day ? { day } : {}) }, 'inventory_backup_pull', (d) => (d.ok && isDump(d.dump) ? (d.dump as InventoryDump) : null));
}

export function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}-${d.getMonth() + 1} a las ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

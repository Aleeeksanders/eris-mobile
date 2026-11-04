// ============================================================
// Eris Mobile — respaldo de Finanzas (2026-10-15)
//
// Los datos de plata vivían SOLO en el WebView de Finanzas (localStorage): borrar los datos de la app los perdía todos.
// Ahora hunter-wallet.html manda un volcado de sus claves cada vez que algo cambia (y al abrir); acá se manda al
// servidor, que lo guarda CIFRADO en el PC (eris/src/services/FinanceBackup.ts: una copia por día, las últimas 7).
// Restaurar: desde Perfil, o la app lo ofrece sola si Finanzas aparece vacía y en el PC hay un respaldo.
// ============================================================
import { DeviceEventEmitter } from 'react-native';
import { wsManager } from './WebSocketManager';

export interface FinanceDump {
  v: number; profile: string; at: string;
  keys: Record<string, string>;
  stats: { tx: number; cuentas: number; claves: number };
}
export interface BackupCopy { day: string; at: string; stats: FinanceDump['stats']; size: number }

/** Lo escuchan las pantallas: aplicar un respaldo en el WebView de Finanzas, y su resultado. */
export const RESTORE_APPLY_EVENT = 'finance_restore_apply';
export const RESTORE_DONE_EVENT = 'finance_restore_done';
/** El servidor no guardó un Finanzas vacío porque hay un respaldo con datos: se ofrece restaurarlo. */
export const RESTORE_OFFER_EVENT = 'finance_restore_offer';

const TIMEOUT_MS = 8000;
let installed = false;
let lastDump: FinanceDump | null = null;
let lastSentHash = '';
let confirmedHash = '';

/** Huella del contenido (no de la hora del volcado): si nada cambió, no se vuelve a mandar. */
function hashOf(d: FinanceDump): string {
  const s = JSON.stringify(Object.keys(d.keys).sort().map((k) => [k, d.keys[k]]));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

function isDump(x: any): x is FinanceDump {
  return !!x && typeof x === 'object' && typeof x.profile === 'string' && !!x.keys && typeof x.keys === 'object'
    && Object.values(x.keys).every((v) => typeof v === 'string');
}

function install() {
  if (installed) return;
  installed = true;
  wsManager.subscribeMessage((d: any) => {
    // Al reconectar se manda lo último si el servidor todavía no lo confirmó
    if (d?.type === 'connected' && lastDump && confirmedHash !== hashOf(lastDump)) send(lastDump, true);
    if (d?.type === 'finance_backup_saved') {
      if (d.ok && typeof d.hash === 'string') confirmedHash = d.hash;
      if (d.restore && typeof d.restore === 'object') DeviceEventEmitter.emit(RESTORE_OFFER_EVENT, d.restore as BackupCopy);
    }
  });
}

function send(d: FinanceDump, force = false) {
  const hash = hashOf(d);
  if (!force && hash === lastSentHash) return;
  if (wsManager.getStatus() !== 'connected') return; // queda en lastDump: se manda al reconectar
  lastSentHash = hash;
  wsManager.sendMessage({ type: 'finance_backup_push', dump: d, hash });
}

/** Lo que manda Finanzas (`hw_backup`): se respalda si cambió algo. */
export function onFinanceDump(raw: unknown) {
  install();
  if (!isDump(raw)) return;
  lastDump = raw;
  send(raw);
}

function ask<T>(req: Record<string, unknown>, replyType: string, pick: (d: any) => T): Promise<T | null> {
  install();
  if (wsManager.getStatus() !== 'connected') return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = `fb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
export function listFinanceBackups(): Promise<BackupCopy[] | null> {
  return ask({ type: 'finance_backup_list' }, 'finance_backup_list', (d) => (Array.isArray(d.copies) ? (d.copies as BackupCopy[]) : []));
}

/**
 * Trae una copia del PC y la aplica en Finanzas (lo de ahora queda guardado aparte en el teléfono, hw_before_restore).
 * Necesita que Finanzas esté montada (lo está si el módulo está activo).
 */
export async function restoreFinanceBackup(day?: string): Promise<{ ok: boolean; message: string }> {
  const dump = await ask({ type: 'finance_backup_pull', ...(day ? { day } : {}) }, 'finance_backup_pull', (d) => (d.ok && isDump(d.dump) ? (d.dump as FinanceDump) : null));
  if (!dump) return { ok: false, message: wsManager.getStatus() === 'connected' ? 'No encontré ese respaldo en el PC.' : 'Sin conexión con el servidor de Eris.' };
  // Finanzas 2.0 (nativa): se aplica en el almacén del teléfono, sin esperar a la versión web (revisión D3)
  try {
    const r = await require('./finance/financeStore').financeStore.restore(dump.keys);
    return r.ok ? { ok: true, message: `Listo: Finanzas quedó como el ${fechaHora(dump.at)} (${dump.stats.tx} movimientos).` }
      : { ok: false, message: `No se pudo restaurar${r.motivo ? `: ${r.motivo}` : ''}.` };
  } catch {}
  return new Promise((resolve) => {
    const requestId = `fr_${Date.now()}`;
    const timer = setTimeout(() => { sub.remove(); resolve({ ok: false, message: 'Finanzas no respondió. Ábrela una vez y vuelve a intentar.' }); }, TIMEOUT_MS);
    const sub = DeviceEventEmitter.addListener(RESTORE_DONE_EVENT, (r: { requestId: string; ok: boolean; motivo?: string }) => {
      if (r?.requestId !== requestId) return;
      clearTimeout(timer); sub.remove();
      resolve(r.ok
        ? { ok: true, message: `Listo: Finanzas quedó como el ${fechaHora(dump.at)} (${dump.stats.tx} movimientos).` }
        : { ok: false, message: `No se pudo restaurar${r.motivo ? `: ${r.motivo}` : ''}.` });
    });
    DeviceEventEmitter.emit(RESTORE_APPLY_EVENT, { requestId, dump });
  });
}

export function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}-${d.getMonth() + 1} a las ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** JS que aplica el respaldo en el WebView de Finanzas y avisa el resultado (`hw_restored`). */
export function restoreJS(requestId: string, dump: FinanceDump): string {
  return `(function(){var r;try{r=window.__hwBackupRestore(${JSON.stringify(dump)});}catch(e){r={ok:false,motivo:String(e&&e.message||e)};}`
    + `try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'hw_restored',requestId:${JSON.stringify(requestId)},result:r}));}catch(e){}})();true;`;
}

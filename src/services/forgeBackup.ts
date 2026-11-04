// ============================================================
// Eris Mobile — respaldo de Forge (2026-10-17, Forge 2.0 F0)
//
// Forge vivía SOLO en el WebView (localStorage `toji-rpg-v1-<perfil>` y la rutina): borrar los datos de la app perdía
// nivel, XP, racha, árbol e historial. Ahora TojiScreen pide un volcado de esas claves cada vez que Forge cambia
// (`forgeDumpJS`, sin tocar el HTML) y acá se manda al servidor, que lo guarda CIFRADO en el PC
// (eris/src/services/ForgeBackup.ts: una copia por día, las últimas 7). Mismo camino que Finanzas (financeBackup.ts).
// Restaurar: desde Perfil, o Forge lo ofrece solo si aparece vacío y en el PC hay un respaldo.
// Las claves viajan sin el perfil (`toji-rpg-v1`, `toji-routine-md`); el WebView se lo agrega al restaurar.
// ============================================================
import { DeviceEventEmitter } from 'react-native';
import { wsManager } from './WebSocketManager';

export const FORGE_KEYS = ['toji-rpg-v1', 'toji-routine-md'] as const;
export interface ForgeStats { dias: number; habilidades: number; xp: number; rutina: boolean; ultimo: string | null; claves: number }
export interface ForgeDump { v: number; profile: string; at: string; keys: Record<string, string>; stats?: ForgeStats }
export interface ForgeBackupCopy { day: string; at: string; stats: ForgeStats; size: number }

/** Lo escucha TojiScreen: aplicar un respaldo en el WebView de Forge, y su resultado. */
export const FORGE_RESTORE_APPLY_EVENT = 'forge_restore_apply';
export const FORGE_RESTORE_DONE_EVENT = 'forge_restore_done';
/** El servidor no guardó un Forge vacío porque hay un respaldo con datos: se ofrece restaurarlo. */
export const FORGE_RESTORE_OFFER_EVENT = 'forge_restore_offer';

const TIMEOUT_MS = 8000;
/** Entre dos envíos al PC pasa al menos esto (Forge cambia con cada paso que llega del reloj). */
const MIN_GAP_MS = 60_000;
let installed = false;
let lastDump: ForgeDump | null = null;
let lastSentHash = '';
let lastSentAt = 0;
let confirmedHash = '';
let trailing: ReturnType<typeof setTimeout> | null = null;

/** Huella del contenido (no de la hora del volcado): si nada cambió, no se vuelve a mandar. Igual que el servidor. */
export function forgeHashOf(d: { keys: Record<string, string> }): string {
  const s = JSON.stringify(Object.keys(d.keys).sort().map((k) => [k, d.keys[k]]));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/** Lo que trae un volcado (para los textos; el servidor lo vuelve a contar). */
export function forgeStatsOf(keys: Record<string, string>): ForgeStats {
  let st: any = null;
  try { st = JSON.parse(keys['toji-rpg-v1'] ?? 'null'); } catch {}
  const training = st && typeof st.training === 'object' && st.training ? st.training : {};
  const days = Object.keys(training).filter((k) => {
    const day = training[k];
    return day && typeof day === 'object' && Object.values(day).some((n) => Number(n) > 0);
  }).sort();
  const skills = st && typeof st.skills === 'object' && st.skills ? st.skills : {};
  const habilidades = Object.values(skills).filter((v: any) => Array.isArray(v?.steps) && v.steps.some(Boolean)).length;
  let rutina = false;
  try { rutina = !!JSON.parse(keys['toji-routine-md'] ?? 'null')?.md; } catch {}
  return { dias: days.length, habilidades, xp: Math.max(0, Math.round(Number(st?.bankedXp) || 0)), rutina, ultimo: days.length ? days[days.length - 1] : null, claves: Object.keys(keys).length };
}

function isDump(x: any): x is ForgeDump {
  return !!x && typeof x === 'object' && typeof x.profile === 'string' && !!x.keys && typeof x.keys === 'object'
    && Object.values(x.keys).every((v) => typeof v === 'string');
}

function install() {
  if (installed) return;
  installed = true;
  wsManager.subscribeMessage((d: any) => {
    // Al reconectar se manda lo último si el servidor todavía no lo confirmó
    if (d?.type === 'connected' && lastDump && confirmedHash !== forgeHashOf(lastDump)) send(lastDump, true);
    if (d?.type === 'forge_backup_saved') {
      if (d.ok && typeof d.hash === 'string') confirmedHash = d.hash;
      if (d.restore && typeof d.restore === 'object') DeviceEventEmitter.emit(FORGE_RESTORE_OFFER_EVENT, d.restore as ForgeBackupCopy);
    }
  });
}

function send(d: ForgeDump, force = false) {
  const hash = forgeHashOf(d);
  if (!force && hash === lastSentHash) return;
  if (wsManager.getStatus() !== 'connected') return; // queda en lastDump: se manda al reconectar
  const wait = lastSentAt + MIN_GAP_MS - Date.now();
  if (!force && wait > 0) {
    // Muy seguido: se manda el último al cumplirse el plazo (nada se pierde, solo se agrupa)
    if (!trailing) trailing = setTimeout(() => { trailing = null; if (lastDump) send(lastDump); }, wait);
    return;
  }
  lastSentHash = hash;
  lastSentAt = Date.now();
  wsManager.sendMessage({ type: 'forge_backup_push', dump: d, hash });
}

/** Lo que manda Forge (`toji_backup`): se respalda si cambió algo. */
export function onForgeDump(raw: unknown) {
  install();
  if (!isDump(raw)) return;
  lastDump = raw;
  send(raw);
}

function ask<T>(req: Record<string, unknown>, replyType: string, pick: (d: any) => T): Promise<T | null> {
  install();
  if (wsManager.getStatus() !== 'connected') return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = `gb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
export function listForgeBackups(): Promise<ForgeBackupCopy[] | null> {
  return ask({ type: 'forge_backup_list' }, 'forge_backup_list', (d) => (Array.isArray(d.copies) ? (d.copies as ForgeBackupCopy[]) : []));
}

/**
 * Trae una copia del PC y la aplica en Forge (lo de ahora queda guardado aparte en el teléfono, `toji-before-restore`).
 * Necesita que Forge esté montado (lo está si el módulo está activo y se abrió una vez).
 */
export async function restoreForgeBackup(day?: string): Promise<{ ok: boolean; message: string }> {
  const dump = await ask({ type: 'forge_backup_pull', ...(day ? { day } : {}) }, 'forge_backup_pull', (d) => (d.ok && isDump(d.dump) ? (d.dump as ForgeDump) : null));
  if (!dump) return { ok: false, message: wsManager.getStatus() === 'connected' ? 'No encontré ese respaldo en el PC.' : 'Sin conexión con el servidor de Eris.' };
  const st = dump.stats ?? forgeStatsOf(dump.keys);
  return new Promise((resolve) => {
    const requestId = `gr_${Date.now()}`;
    const timer = setTimeout(() => { sub.remove(); resolve({ ok: false, message: 'Forge no respondió. Ábrelo una vez y vuelve a intentar.' }); }, TIMEOUT_MS);
    const sub = DeviceEventEmitter.addListener(FORGE_RESTORE_DONE_EVENT, (r: { requestId: string; ok: boolean; motivo?: string }) => {
      if (r?.requestId !== requestId) return;
      clearTimeout(timer); sub.remove();
      resolve(r.ok
        ? { ok: true, message: `Listo: Forge quedó como el ${fechaHora(dump.at)} (${st.dias} días entrenados, ${st.habilidades} habilidades).` }
        : { ok: false, message: `No se pudo restaurar${r.motivo ? `: ${r.motivo}` : ''}.` });
    });
    DeviceEventEmitter.emit(FORGE_RESTORE_APPLY_EVENT, { requestId, dump });
  });
}

export function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}-${d.getMonth() + 1} a las ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const KEYS_JS = JSON.stringify(FORGE_KEYS);
const SUFFIX_JS = `var pid=window.__ERIS_PROFILE_ID__;var suf=(pid&&pid!=='anon')?'-'+pid:'';`;

/** JS que lee las claves de Forge en su WebView y las manda (`toji_backup`). No hace falta tocar el HTML. */
export function forgeDumpJS(): string {
  return `(function(){try{${SUFFIX_JS}var keys={};${KEYS_JS}.forEach(function(b){var v=localStorage.getItem(b+suf);if(v!=null)keys[b]=v;});`
    + `window.ReactNativeWebView.postMessage(JSON.stringify({type:'toji_backup',dump:{v:1,profile:pid||'anon',at:new Date().toISOString(),keys:keys}}));}catch(e){}})();true;`;
}

/**
 * JS que aplica un respaldo en el WebView de Forge y avisa el resultado (`toji_restored`). Lo de ahora queda en
 * `toji-before-restore`; desde ese momento la página ya no escribe sus claves (si no, el estado viejo que tiene en
 * memoria pisaría lo restaurado antes de volver a montarla).
 */
export function forgeRestoreJS(requestId: string, dump: ForgeDump): string {
  return `(function(){var r;try{${SUFFIX_JS}var d=${JSON.stringify({ keys: dump.keys })};var before={};`
    + `${KEYS_JS}.forEach(function(b){var v=localStorage.getItem(b+suf);if(v!=null)before[b]=v;});`
    + `localStorage.setItem('toji-before-restore'+suf,JSON.stringify({at:new Date().toISOString(),keys:before}));`
    + `if(window.storage&&!window.__tojiRestoring){window.__tojiRestoring=true;var _set=window.storage.set;window.storage.set=function(k,v){if(String(k).indexOf('toji-')===0)return Promise.resolve(null);return _set(k,v);};}`
    + `${KEYS_JS}.forEach(function(b){if(typeof d.keys[b]==='string')localStorage.setItem(b+suf,d.keys[b]);else localStorage.removeItem(b+suf);});r={ok:true};`
    + `}catch(e){r={ok:false,motivo:String(e&&e.message||e)};}`
    + `try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'toji_restored',requestId:${JSON.stringify(requestId)},result:r}));}catch(e){}})();true;`;
}

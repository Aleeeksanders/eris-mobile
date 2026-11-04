// ============================================================
// Eris — lo guardado en el teléfono, separado por cuenta
//
// 2026-10-12: al entrar con otra cuenta de Google en el mismo teléfono, la cuenta nueva veía las comidas, el agua, las
// metas y el horario de la anterior. Casi todo se guardaba con claves globales (eris_nutrition_log_v1, eris_water_log_v1,
// eris_usual_wake_v1…) y cerrar sesión no las borra. Para quien comparte el teléfono con su familia, eso es mostrar datos
// de salud de otra persona.
//
// Esta capa separa por cuenta TODO lo que se guarda con AsyncStorage, sin tocar cada pantalla: cada clave queda bajo
// `u:<perfil>:`. Solo lo que es del teléfono sigue global (la sesión, la posición de la burbuja, la voz, el caché de
// códigos de barras). Sin sesión, se usa un espacio vacío.
//
// Lo que ya estaba guardado sin cuenta se COPIA una sola vez a la primera cuenta que abre la app después de actualizar
// (en un teléfono personal, su dueño, que es quien tenía la sesión abierta) y queda como respaldo; no se borra. Otra
// cuenta que entre después parte vacía. Se instala antes que todo lo demás (index.ts).
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

const PROFILE_KEY = 'eris_profile_id'; // la escribe AuthStorage al iniciar sesión
const DEVICE_KEYS = new Set([PROFILE_KEY, 'eris_session_token', 'eris_display_name', 'eris_pin', 'eris_bubble_pos', 'eris_tts_enabled', 'eris_barcode_cache_v1']);
const DEVICE_PREFIXES = ['eris_pin_', 'u:', 'scoped_'];
const OWNER_KEY = 'scoped_legacy_owner';
const NONE = '__sin_cuenta__';
export const PROFILE_CHANGED_EVENT = 'eris_profile_changed';

type Pair = [string, string | null];
const S: any = AsyncStorage;
const raw = {
  getItem: S.getItem.bind(S) as (k: string) => Promise<string | null>,
  setItem: S.setItem.bind(S) as (k: string, v: string) => Promise<void>,
  removeItem: S.removeItem.bind(S) as (k: string) => Promise<void>,
  multiGet: S.multiGet.bind(S) as (k: readonly string[]) => Promise<readonly Pair[]>,
  multiSet: S.multiSet.bind(S) as (p: ReadonlyArray<readonly [string, string]>) => Promise<void>,
  multiRemove: S.multiRemove.bind(S) as (k: readonly string[]) => Promise<void>,
  getAllKeys: S.getAllKeys.bind(S) as () => Promise<readonly string[]>,
  mergeItem: S.mergeItem?.bind(S) as ((k: string, v: string) => Promise<void>) | undefined,
};

/** undefined = todavía no se leyó la sesión guardada */
let profile: string | null | undefined;
let ready: Promise<void> | null = null;

const isDevice = (k: string) => DEVICE_KEYS.has(k) || DEVICE_PREFIXES.some((p) => k.startsWith(p));
const prefix = () => `u:${profile || NONE}:`;
const scoped = (k: string) => (isDevice(k) ? k : prefix() + k);

/** La primera cuenta después de actualizar se queda con lo que estaba guardado sin cuenta (copia; lo antiguo queda de respaldo). */
async function migrateLegacy(pid: string): Promise<void> {
  if (await raw.getItem(OWNER_KEY)) return; // ya se repartió
  const all = await raw.getAllKeys();
  const legacy = all.filter((k) => !isDevice(k));
  await raw.setItem(OWNER_KEY, pid);
  if (!legacy.length) return;
  const mine = new Set(all.filter((k) => k.startsWith(`u:${pid}:`)));
  const pairs = await raw.multiGet(legacy);
  const toWrite = pairs
    .filter(([k, v]) => v != null && !mine.has(`u:${pid}:${k}`))
    .map(([k, v]) => [`u:${pid}:${k}`, v as string] as [string, string]);
  if (toWrite.length) await raw.multiSet(toWrite);
  console.log(`[ScopedStorage] ${toWrite.length} datos guardados sin cuenta pasaron a la cuenta ${pid}`);
}

function activate(pid: string | null): Promise<void> {
  const changed = profile !== undefined && profile !== (pid || null);
  profile = pid || null;
  ready = (async () => {
    if (profile) { try { await migrateLegacy(profile); } catch (e) { console.warn('[ScopedStorage] No se pudo copiar lo anterior:', e); } }
    if (changed) DeviceEventEmitter.emit(PROFILE_CHANGED_EVENT, profile);
  })();
  return ready;
}

async function ensure(): Promise<void> {
  if (profile === undefined && !ready) {
    ready = (async () => {
      let pid: string | null = null;
      try { pid = await raw.getItem(PROFILE_KEY); } catch {}
      await activate(pid);
    })();
  }
  await ready;
}

// Después de escribir o borrar la sesión, la cuenta activa cambia
function watchProfile(writes: ReadonlyArray<readonly [string, string | null]>): Promise<void> | null {
  const hit = writes.find(([k]) => k === PROFILE_KEY);
  return hit ? activate(hit[1]) : null;
}

let installed = false;
export function installScopedStorage(): void {
  if (installed) return;
  installed = true;
  S.getItem = async (k: string) => { await ensure(); return raw.getItem(scoped(k)); };
  S.setItem = async (k: string, v: string) => {
    if (k !== PROFILE_KEY) await ensure();
    await raw.setItem(scoped(k), v);
    await watchProfile([[k, v]]);
  };
  S.removeItem = async (k: string) => {
    if (k !== PROFILE_KEY) await ensure();
    await raw.removeItem(scoped(k));
    await watchProfile([[k, null]]);
  };
  S.multiGet = async (keys: readonly string[]) => {
    await ensure();
    const res = await raw.multiGet(keys.map(scoped));
    return res.map(([, v], i) => [keys[i], v] as Pair);
  };
  S.multiSet = async (pairs: ReadonlyArray<readonly [string, string]>) => {
    if (!pairs.some(([k]) => k === PROFILE_KEY)) await ensure();
    await raw.multiSet(pairs.map(([k, v]) => [scoped(k), v] as [string, string]));
    await watchProfile(pairs);
  };
  S.multiRemove = async (keys: readonly string[]) => {
    if (!keys.includes(PROFILE_KEY)) await ensure();
    await raw.multiRemove(keys.map(scoped));
    await watchProfile(keys.map((k) => [k, null] as Pair));
  };
  // Solo se ven las claves de la cuenta activa (sin su prefijo) y las del teléfono
  S.getAllKeys = async () => {
    await ensure();
    const p = prefix();
    return (await raw.getAllKeys()).flatMap((k) => (k.startsWith(p) ? [k.slice(p.length)] : isDevice(k) && !k.startsWith('u:') ? [k] : []));
  };
  if (raw.mergeItem) S.mergeItem = async (k: string, v: string) => { await ensure(); return raw.mergeItem!(scoped(k), v); };
  // "Borrar todo" borra solo lo de la cuenta activa
  S.clear = async () => {
    await ensure();
    const p = prefix();
    const mine = (await raw.getAllKeys()).filter((k) => k.startsWith(p));
    if (mine.length) await raw.multiRemove(mine);
  };
}

installScopedStorage();

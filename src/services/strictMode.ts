// ============================================================
// Eris Mobile — modo estricto con los antojos (fase I7, 2026-10-23)
//
// Decisión del usuario: «contrapartida por defecto + modo estricto opcional». Apagado (por defecto), ante un antojo que no
// calza Eris muestra el impacto y una contrapartida concreta como sugerencia. Encendido, se lo recomienda SOLO si acepta la
// contrapartida. Se elige en Perfil y lo guarda el teléfono (por cuenta); el servidor lo recibe al conectar y al cambiarlo.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { wsManager } from './WebSocketManager';

const KEY = 'eris_strict_mode';

export async function getStrictMode(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEY)) === '1'; } catch { return false; }
}

export async function setStrictMode(on: boolean): Promise<void> {
  try { await AsyncStorage.setItem(KEY, on ? '1' : '0'); } catch {}
  if (wsManager.getStatus() === 'connected') wsManager.sendMessage({ type: 'set_strict_mode', on });
}

let started = false;
/** Al conectar, el servidor recibe lo elegido en el teléfono (otro teléfono, cuenta nueva en el servidor…). */
export function startStrictModeSync(): void {
  if (started) return;
  started = true;
  wsManager.subscribeMessage((d: any) => {
    if (d?.type !== 'connected') return;
    AsyncStorage.getItem(KEY).then((v) => { if (v === '1' || v === '0') wsManager.sendMessage({ type: 'set_strict_mode', on: v === '1' }); }).catch(() => {});
  });
}

// ============================================================
// Eris Mobile — guardar sin perder en silencio (revisión 2026-10-31, D5)
//
// Los almacenes de Finanzas, Inventario, Forge y Suplementos guardaban con `.catch(() => {})`: si el teléfono no podía
// escribir (memoria llena, un error del almacenamiento), la pantalla mostraba el cambio y al reiniciar no estaba. Ahora se
// reintenta dos veces y, si igual falla, se avisa una vez (App muestra el mensaje) en vez de callar.
// Lo que no se puede leer (dañado) se guarda aparte antes de empezar de cero, para no pisarlo.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

/** { modulo }: no se pudo guardar en el teléfono (App lo avisa una vez por sesión) */
export const SAVE_FAILED_EVENT = 'eris_save_failed';

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** setItem con 2 reintentos; si igual falla, avisa (y lanza, por si quien llama quiere saberlo). */
export async function guardar(key: string, value: string, modulo: string): Promise<void> {
  let ultimo: unknown = null;
  for (let i = 0; i < 3; i++) {
    try { await AsyncStorage.setItem(key, value); return; } catch (e) { ultimo = e; await espera(400 * (i + 1)); }
  }
  console.warn(`[${modulo}] no se pudo guardar:`, ultimo);
  DeviceEventEmitter.emit(SAVE_FAILED_EVENT, { modulo });
  throw ultimo instanceof Error ? ultimo : new Error('no se pudo guardar');
}

/** Un valor que no se puede leer: se copia aparte (con la fecha) antes de que algo lo reemplace. */
export async function apartarDanado(key: string, raw: string): Promise<void> {
  await AsyncStorage.setItem(`${key}__danado_${Date.now()}`, raw).catch(() => {});
}

// ============================================================
// Eris Mobile — lo viejo del día a día se borra (revisión 2026-10-31, D6)
//
// Cada día deja sus claves (lo comido, el agua, lo visto en Inicio, el tope del plan…) y nada las borraba: el almacenamiento
// del teléfono se iba llenando hasta el tope y, lleno, todo lo que se guarda falla. Una vez al día se borran las de más de
// 120 días (el servidor guarda el historial diario; lo de la semana o el mes sigue acá). Solo claves con fecha.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_LOG, STORAGE_KEY_WATER, STORAGE_KEY_WATER_SEEN, STORAGE_KEY_WATER_APPLIED, STORAGE_KEY_WATER_HCIDS } from './nutritionSync';

/** Prefijos de las claves que llevan una fecha al final (`<prefijo>_<fecha>`; la fecha como `toDateString` o AAAA-MM-DD) */
const POR_DIA = [STORAGE_KEY_LOG, STORAGE_KEY_WATER, STORAGE_KEY_WATER_SEEN, STORAGE_KEY_WATER_APPLIED, STORAGE_KEY_WATER_HCIDS,
  'eris_mood_logged', 'eris_sleeptip_seen', 'eris_manual_sleep', 'eris_day_cap'];
const ULTIMA_KEY = 'eris_prune_ultima';
export const DIAS_GUARDADOS = 120;

/** Las claves con fecha de más de `dias` días (puro: lo usan las pruebas). */
export function clavesViejas(keys: readonly string[], now: Date, dias = DIAS_GUARDADOS): string[] {
  const lim = now.getTime() - dias * 86_400_000;
  return keys.filter((k) => {
    const pre = POR_DIA.find((p) => k.startsWith(`${p}_`));
    if (!pre) return false;
    const t = Date.parse(k.slice(pre.length + 1));
    return Number.isFinite(t) && t < lim;
  });
}

/** Una vez al día (al abrir la app): borra lo viejo de la cuenta activa. */
export async function limpiarViejos(now = new Date()): Promise<number> {
  const hoy = now.toDateString();
  try {
    if ((await AsyncStorage.getItem(ULTIMA_KEY)) === hoy) return 0;
    const viejas = clavesViejas(await AsyncStorage.getAllKeys(), now);
    if (viejas.length) await AsyncStorage.multiRemove(viejas);
    await AsyncStorage.setItem(ULTIMA_KEY, hoy);
    return viejas.length;
  } catch { return 0; }
}

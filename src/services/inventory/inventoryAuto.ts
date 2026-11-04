// ============================================================
// Eris Mobile — Inventario que se mantiene solo (2026-10-22, fase I3)
//
// Para que el inventario siga «fiel a la realidad» sin anotar todo dos veces:
//   - lo que comes en casa (Nutrición, a mano o por chat) sale de Alimentos y Despensa (inventoryCore.procesarComidas):
//     si borras la comida, vuelve; si fue fuera de casa, «Lo comí fuera» lo devuelve;
//   - lo de todos los días (remedios, suplementos) baja solo cada día con las tomas que anotaste (aplicarTomas).
// Corre al abrir la app, al volver a ella y cada vez que cambia el registro de comidas.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, DeviceEventEmitter } from 'react-native';
import { inventoryStore } from './inventoryStore';
import { procesarComidas, aplicarTomas, type ComidaEntrada } from './inventoryCore';
import { nutritionBackend, NUTRITION_DAY_UPDATED } from '../NutritionBackend';
import { STORAGE_KEY_LOG, STORAGE_KEY_PENDING_DEL, logKey, pendingKey, serverItemKey, type PendingDelete } from '../nutritionSync';
import { daySchedule } from '../daySchedule';
import type { LoggedFood } from '../FoodSearchService';
import { modulosOn } from '../modulosOn';

const parse = <T,>(raw: string | null, fb: T): T => { try { return raw ? (JSON.parse(raw) as T) : fb; } catch { return fb; } };

/** Las comidas de hoy: lo del teléfono + lo que Eris anotó por chat y Nutrición aún no trae (sin lo que borraste). */
async function comidasDeHoy(day: string): Promise<ComidaEntrada[]> {
  const [rawLog, rawDel] = await Promise.all([AsyncStorage.getItem(`${STORAGE_KEY_LOG}_${day}`), AsyncStorage.getItem(STORAGE_KEY_PENDING_DEL)]);
  const local = parse<LoggedFood[]>(rawLog, []);
  const borradas = new Set(parse<PendingDelete[]>(rawDel, []).map(pendingKey));
  const out = new Map<string, ComidaEntrada>();
  for (const e of local) out.set(logKey(e), { key: logKey(e), name: e.food.name, grams: e.grams, at: e.loggedAt });
  for (const entry of nutritionBackend.serverEntriesToday()) {
    for (const it of entry.items ?? []) {
      const key = serverItemKey(entry.timestamp, it);
      if (!out.has(key) && !borradas.has(key)) out.set(key, { key, name: it.name, grams: it.grams, at: entry.timestamp });
    }
  }
  return [...out.values()];
}

let running: Promise<void> = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Una pasada (de a una a la vez): descuenta lo comido y las tomas del día; guarda solo si cambió algo. */
export function revisarInventario(): Promise<void> {
  running = running.then(async () => {
    if (!modulosOn.on('inventario')) return; // apagado en Perfil: la despensa no se toca (revisión A2)
    // el día de comida (el de quien trasnocha sigue hasta que duerme): las comidas y lo que se devuelve son de ese día
    const day = daySchedule.todayKey();
    const comidas = await comidasDeHoy(day).catch(() => null);
    await inventoryStore.act((W, ctx) => {
      const antes = !!W.nutri;
      const tomas = aplicarTomas(W, ctx);
      const r = comidas ? procesarComidas(W, comidas, ctx, day) : { descontadas: [], pendientes: 0, devueltas: 0 };
      const cambio = tomas > 0 || r.descontadas.length > 0 || r.pendientes > 0 || r.devueltas > 0 || (!antes && !!W.nutri);
      return { ok: cambio, msg: '' };
    });
  }).catch(() => {});
  return running;
}

const pronto = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; void revisarInventario(); }, 1500); };

let started = false;
export function startInventoryAuto() {
  if (started) return;
  started = true;
  nutritionBackend.subscribe(pronto);
  DeviceEventEmitter.addListener(NUTRITION_DAY_UPDATED, pronto);
  AppState.addEventListener('change', (st) => { if (st === 'active') pronto(); });
  pronto();
}

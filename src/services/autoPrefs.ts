// ============================================================
// Eris Mobile — «Así manejo tu…»: lo que Eris hace sola en cada módulo (Eris administra, A3)
//
// Cada interruptor vive donde ya actuaba (Finanzas en automático, el ajuste del Inventario, el piloto automático del Plan,
// los avisos de Perfil); acá se guardan los que eran nuevos (el tope del día en el Plan, el entreno según el sueño, el
// resumen del domingo) y se manda al servidor la FOTO de todo, para que el chat lo sepa («¿qué haces sola?») y el Plan de
// Eris lo respete. Solo preferencias: nada de datos.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { wsManager } from './WebSocketManager';
import { AuthStorage } from './AuthStorage';

const KEY = 'eris_auto_v1';
export const AUTO_PREFS_EVENT = 'eris_auto_prefs_changed';

/** Lo nuevo de A3 (lo demás vive en su módulo) */
export interface AutoPrefs {
  /** el Plan de Eris pone un tope para gastar hoy */
  topeDia: boolean;
  /** el entreno del Plan se ajusta según cómo dormiste */
  segunSueno: boolean;
  /** los domingos, lo que Eris hizo sola en la semana */
  domingo: boolean;
}
export const AUTO_PREFS_DEFAULT: AutoPrefs = { topeDia: true, segunSueno: true, domingo: true };

/** La foto de todo lo que Eris hace sola (lo que recibe el servidor) */
export interface AutoSnapshot extends AutoPrefs {
  v: 1;
  plata: { anota: boolean; sueldo: boolean; cuadre: boolean; tope: number };
  casa: { comidas: boolean; prevision: boolean };
  piloto: boolean | null;
  sueno: boolean;
  /** los módulos encendidos en Perfil (null = todos, o Modo AXS): el chat no toca lo apagado (revisión A2) */
  modulos: string[] | null;
}

async function read(): Promise<AutoPrefs> {
  try { const v = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null'); return { ...AUTO_PREFS_DEFAULT, ...(v && typeof v === 'object' ? v : {}) }; } catch { return { ...AUTO_PREFS_DEFAULT }; }
}

export const autoPrefs = {
  get: read,
  set: async (patch: Partial<AutoPrefs>): Promise<AutoPrefs> => {
    const next = { ...(await read()), ...patch };
    await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    DeviceEventEmitter.emit(AUTO_PREFS_EVENT);
    void autoPrefs.sync();
    return next;
  },

  /** Lo de cada módulo, leído de donde vive (require: evita ciclos con Finanzas, Inventario y el Plan) */
  snapshot: async (): Promise<AutoSnapshot> => {
    const p = await read();
    const fin = await require('./finance/financeAuto').financeAuto.getConfig().catch(() => null);
    const inv = await require('./inventory/inventoryStore').inventoryStore.load().catch(() => null);
    const piloto: boolean | null = require('./dayPlan/dayPlanStore').dayPlanStore.getAuto();
    const creds = await AuthStorage.getCredentials().catch(() => null);
    const rem = creds?.profileId ? await require('./ErisNotifications').erisNotifications.reminderSettings(creds.profileId).catch(() => null) : null;
    return {
      v: 1, ...p,
      plata: { anota: fin?.on === true && fin?.allowed === true, sueldo: fin?.sueldo !== false, cuadre: fin?.cuadre !== false, tope: Number(fin?.tope ?? 100_000) },
      casa: { comidas: inv?.ajustes?.descontarComida !== false, prevision: inv?.ajustes?.prevision !== false },
      piloto, sueno: rem ? rem.sleep !== false : true,
      modulos: require('./modulosOn').modulosOn.get(),
    };
  },

  /** Al servidor (la preferencia `auto_prefs`): el chat lo sabe y el Plan lo respeta. Solo si cambió algo (o `forzar`). */
  sync: async (forzar = true) => {
    if (wsManager.getStatus() !== 'connected') return;
    try {
      const snap = await autoPrefs.snapshot();
      const k = JSON.stringify(snap);
      if (!forzar && k === ultimoEnviado) return;
      wsManager.sendMessage({ type: 'save_preference', key: 'auto_prefs', value: snap });
      ultimoEnviado = k;
    } catch {}
  },
};

let ultimoEnviado = '';
let started = false;
/** Se arranca una vez en App: al conectarse, el servidor recibe la foto de nuevo (por si cambió algo sin conexión). */
export function startAutoPrefs() {
  if (started) return;
  started = true;
  wsManager.subscribeMessage((d: any) => { if (d?.type === 'connected') setTimeout(() => { void autoPrefs.sync(); }, 3000); });
  // Revisión A1 (2026-11-04): un interruptor cambiado en Finanzas, Inventario, el Plan o los avisos de Perfil no llegaba al
  // servidor hasta reconectar (el chat decía lo de antes). Se escuchan sus cambios y se manda la foto si cambió, con un
  // respiro de 1,5 s (Inventario avisa en cada movimiento).
  let t: ReturnType<typeof setTimeout> | null = null;
  const pronto = () => { if (t) clearTimeout(t); t = setTimeout(() => { t = null; void autoPrefs.sync(false); }, 1500); };
  for (const ev of ['finance_auto_changed', 'inventory_state_changed', 'ERIS_DAY_PLAN_CHANGED', 'ERIS_PLAN_REFRESH', 'MODULES_CHANGED']) DeviceEventEmitter.addListener(ev, pronto);
}

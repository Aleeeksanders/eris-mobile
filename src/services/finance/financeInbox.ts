// ============================================================
// Eris Mobile — «por confirmar» de Finanzas (Finanzas 2.0, F4)
//
// Lo que llega solo (avisos del banco, la cartola) y Eris no anotó sola queda acá como PROPUESTA hasta que la persona lo
// anota o lo descarta. Desde «Eris administra» (2026-10-30) la cola del módulo nativo la recoge financeAuto (que decide
// qué se anota solo); acá queda lo dudoso. Vive en el teléfono, por cuenta (AsyncStorage → ScopedStorage).
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import type { Propuesta } from './bankNotif';
import type { Ref } from './financeCore';

const KEY = 'finance_inbox_v1';
const CUENTAS_KEY = 'finance_notif_cuentas';
export const INBOX_CHANGED_EVENT = 'finance_inbox_changed';
// Revisión F5 (2026-11-04): antes se cortaba en 120 sin decir nada y lo más antiguo se perdía (ya había salido de la cola
// del teléfono). Ahora caben 250 y, si igual sobran, lo que sale queda contado en `fuera` y la pantalla lo dice.
const MAX_ITEMS = 250;
const DONE_DAYS = 45;

interface Inbox { items: Propuesta[]; done: Record<string, number>; fuera?: { n: number; at: number } }

async function read(): Promise<Inbox> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
    return v && Array.isArray(v.items) ? { items: v.items, done: v.done && typeof v.done === 'object' ? v.done : {}, ...(v.fuera && Number(v.fuera.n) > 0 ? { fuera: { n: Number(v.fuera.n), at: Number(v.fuera.at) || Date.now() } } : {}) } : { items: [], done: {} };
  } catch { return { items: [], done: {} }; }
}
async function write(x: Inbox) {
  const lim = Date.now() - DONE_DAYS * 86_400_000;
  const done = Object.fromEntries(Object.entries(x.done).filter(([, at]) => at > lim));
  let fuera = x.fuera;
  if (x.items.length > MAX_ITEMS) {
    const sobran = x.items.slice(0, x.items.length - MAX_ITEMS);
    for (const p of sobran) done[p.clave] = Date.now();
    fuera = { n: (fuera?.n ?? 0) + sobran.length, at: Date.now() };
  }
  await AsyncStorage.setItem(KEY, JSON.stringify({ items: x.items.slice(-MAX_ITEMS), done, ...(fuera ? { fuera } : {}) }));
  DeviceEventEmitter.emit(INBOX_CHANGED_EVENT);
}

const DESC_KEY = 'finance_inbox_descartados_v1';
const MAX_DESC = 60;
async function leerDescartados(): Promise<Propuesta[]> {
  try { const v = JSON.parse((await AsyncStorage.getItem(DESC_KEY)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

let chain: Promise<unknown> = Promise.resolve();
const serial = <T,>(fn: () => Promise<T>): Promise<T> => { const r = chain.then(fn, fn); chain = r.catch(() => {}); return r; };

export const financeInbox = {
  list: async (): Promise<Propuesta[]> => (await read()).items,
  /** Cuántos avisos antiguos ya no cupieron en «Por confirmar» (0 = ninguno) */
  fuera: async (): Promise<number> => (await read()).fuera?.n ?? 0,
  /** «Entendido» en el aviso de los que no cupieron */
  olvidarFuera: () => serial(async () => { const x = await read(); delete x.fuera; await write(x); }),

  /** Las claves que ya pasaron por acá (pendientes o resueltas): un aviso no se procesa dos veces */
  vistos: async (): Promise<Set<string>> => { const x = await read(); return new Set([...x.items.map((p) => p.clave), ...Object.keys(x.done)]); },

  /** Propuestas (los avisos dudosos, la cartola): se agregan las que no están ni se resolvieron antes. */
  add: (ps: Propuesta[]) => serial(async () => {
    const x = await read();
    const ya = new Set([...x.items.map((p) => p.clave), ...Object.keys(x.done)]);
    let n = 0;
    for (const p of ps) if (!ya.has(p.clave)) { x.items.push(p); ya.add(p.clave); n++; }
    if (n) await write(x);
    return n;
  }),

  /** Anotada o descartada: sale de la lista y no vuelve. */
  resolve: (clave: string) => serial(async () => {
    const x = await read();
    x.items = x.items.filter((p) => p.clave !== clave);
    x.done[clave] = Date.now();
    await write(x);
  }),

  /**
   * ✕ en «Por confirmar»: sale de la lista y no vuelve, pero se guarda un tiempo (Eris administra, A2): si después el
   * banco no calza por ese monto, el cuadre dice «lo descartaste, pero el banco lo cuenta».
   */
  descartar: (clave: string) => serial(async () => {
    const x = await read();
    const p = x.items.find((q) => q.clave === clave);
    x.items = x.items.filter((q) => q.clave !== clave);
    x.done[clave] = Date.now();
    await write(x);
    if (p) {
      const lim = Date.now() - DONE_DAYS * 86_400_000;
      const ds = (await leerDescartados()).filter((q) => q.clave !== clave && (q.at ?? Date.parse(`${q.fecha}T12:00:00`)) > lim);
      await AsyncStorage.setItem(DESC_KEY, JSON.stringify([...ds, p].slice(-MAX_DESC))).catch(() => {});
    }
  }),
  /** Lo que la persona descartó (los últimos 45 días) */
  descartados: leerDescartados,
  /** Un descartado que al final se anotó (por el cuadre) */
  olvidarDescartado: async (clave: string) => {
    const ds = await leerDescartados();
    if (ds.some((q) => q.clave === clave)) await AsyncStorage.setItem(DESC_KEY, JSON.stringify(ds.filter((q) => q.clave !== clave))).catch(() => {});
  },

  /** «Deshacer» de lo que Eris anotó sola: vuelve a «Por confirmar» por si era otra cosa (se anota distinto o se descarta). */
  devolver: (p: Propuesta) => serial(async () => {
    const x = await read();
    delete x.done[p.clave];
    x.items = [...x.items.filter((q) => q.clave !== p.clave), p];
    await write(x);
  }),

  /** Lo aprendido: app + tarjeta → la cuenta que eligió la persona */
  aprendido: async (): Promise<Record<string, Ref | null>> => {
    try { const m = JSON.parse((await AsyncStorage.getItem(CUENTAS_KEY)) || '{}'); return m && typeof m === 'object' ? m : {}; } catch { return {}; }
  },

  /** La cuenta que usó la última vez con esa tarjeta (app + últimos 4) */
  cuentaPara: async (p: Propuesta): Promise<Ref | null | undefined> => {
    try { const m = JSON.parse((await AsyncStorage.getItem(CUENTAS_KEY)) || '{}'); return m[`${p.pkg}:${p.last4 ?? ''}`]; } catch { return undefined; }
  },
  recordarCuenta: async (pkg: string, last4: string | undefined, cuenta: Ref | null) => {
    try {
      const m = JSON.parse((await AsyncStorage.getItem(CUENTAS_KEY)) || '{}');
      m[`${pkg}:${last4 ?? ''}`] = cuenta;
      await AsyncStorage.setItem(CUENTAS_KEY, JSON.stringify(m));
    } catch {}
  },
};

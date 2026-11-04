// ============================================================
// Eris Mobile — importar la cartola del banco (Finanzas 2.0, F4)
//
// La persona elige el archivo que descargó de su banco (Excel .xlsx o CSV). Se lee en el PC de Eris
// (eris/src/services/FinanceStatement.ts, en memoria, sin guardarlo) y acá se concilia con lo anotado con el núcleo
// (conciliarCartola): lo que ya está no se toca; lo que falta queda en «por confirmar». Nada se anota solo.
// ============================================================
import { File } from 'expo-file-system';
import { wsManager } from '../WebSocketManager';
import { conciliarCartola, saldoFinalCartola, estado, type Conciliacion, type FinanceState, type MovExterno, type Ref } from './financeCore';
import { comercioDe } from './receiptTed';
import type { Propuesta } from './bankNotif';

const MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 45_000;

export type CartolaLeida = { ok: true; nombre: string; movimientos: MovExterno[]; desde?: string; hasta?: string; omitidas: number };
export type CartolaFallo = { ok: false; cancelado?: boolean; msg: string; pideClave?: boolean };
/** El archivo elegido (en memoria), para volver a mandarlo con la clave si el PDF la pide */
export interface ArchivoCartola { nombre: string; data: string }

/** Abre el selector de archivos del sistema. */
export async function elegirCartola(): Promise<ArchivoCartola | CartolaFallo> {
  // (el File que devuelve el selector es el nativo; se usa por sus métodos: name, size, base64)
  let f: { name?: string; size?: number | null; base64(): Promise<string> } | null = null;
  try {
    const r: any = await File.pickFileAsync();
    f = Array.isArray(r) ? r[0] ?? null : r;
  } catch { return { ok: false, cancelado: true, msg: '' }; }
  if (!f) return { ok: false, cancelado: true, msg: '' };
  if ((f.size ?? 0) > MAX_BYTES) return { ok: false, msg: 'El archivo es muy grande (máximo 6 MB).' };
  if (wsManager.getStatus() !== 'connected') return { ok: false, msg: 'Para leer la cartola necesito conexión con el PC de Eris.' };
  let data: string;
  try { data = await f.base64(); } catch { return { ok: false, msg: 'No pude abrir ese archivo.' }; }
  return { nombre: f.name || 'cartola', data };
}

/**
 * La cartola se lee en el PC. `clave`: la del PDF si la pide (la escribe la persona; viaja solo para abrir este archivo
 * en memoria y no se guarda en ninguna parte).
 */
export function leerEnPC(a: ArchivoCartola, clave?: string): Promise<CartolaLeida | CartolaFallo> {
  const { nombre, data } = a;
  if (wsManager.getStatus() !== 'connected') return Promise.resolve({ ok: false, msg: 'Para leer la cartola necesito conexión con el PC de Eris.' });
  return new Promise((resolve) => {
    const requestId = `cart_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let done = false;
    const finish = (r: CartolaLeida | CartolaFallo) => { if (done) return; done = true; clearTimeout(timer); unsub(); resolve(r); };
    const timer = setTimeout(() => finish({ ok: false, msg: 'El PC no respondió a tiempo. Intenta de nuevo.' }), TIMEOUT_MS);
    const unsub = wsManager.subscribeMessage((d: any) => {
      if (d?.type !== 'finance_statement_parsed' || d.requestId !== requestId) return;
      if (d.ok && Array.isArray(d.movimientos)) finish({ ok: true, nombre, movimientos: d.movimientos, desde: d.desde, hasta: d.hasta, omitidas: Number(d.omitidas) || 0 });
      else finish({ ok: false, msg: String(d.msg || 'No pude leer la cartola.'), ...(d.code === 'clave' ? { pideClave: true } : {}) });
    });
    wsManager.sendMessage({ type: 'finance_statement_parse', requestId, name: nombre, data, ...(clave ? { clave } : {}) });
  });
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Lo que falta de la cartola, como propuestas de gasto de esa cuenta (con una clave estable: reimportar no repite). */
export function propuestasDeCartola(S: FinanceState, c: Conciliacion, cuenta: Ref | null): Propuesta[] {
  const nombre = cuenta != null ? estado(S).nombre(cuenta) : 'Cartola';
  return c.faltan.map((m) => {
    const x = comercioDe(m.desc);
    return {
      clave: `cartola:${String(cuenta)}:${m.fecha}:${Math.abs(m.monto)}:${fold(m.desc).slice(0, 24)}`,
      fuente: 'cartola', app: nombre, pkg: `cartola:${String(cuenta)}`, tipo: 'compra', monto: Math.abs(m.monto),
      comercio: m.desc, desc: x.comercio === 'Boleta' ? m.desc.slice(0, 40) : x.comercio, cat: x.cat, fecha: m.fecha, hora: '',
      texto: m.desc, cuenta,
    } as Propuesta;
  });
}

export { conciliarCartola, saldoFinalCartola };

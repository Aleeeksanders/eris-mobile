// ============================================================
// K3 (2026-11-16): una llamada con Hestia pedida desde fuera del chat (el botón del asistente de Hestia Manos, el de los ajustes
// rápidos, el atajo del ícono). Puede llegar antes de que el chat esté montado (Eris recién abierta, o el rol aún sin cargar):
// queda pendiente unos segundos y el chat la toma al montarse. Sin datos: solo de dónde vino y si el teléfono está bloqueado.
// ============================================================
import { DeviceEventEmitter } from 'react-native';

export type OpcionesLlamada = { origen?: string; bloqueado?: boolean };

const VIGENCIA_MS = 30_000;
let pendiente: (OpcionesLlamada & { t: number }) | null = null;

/** Pide abrir la llamada (el chat la abre si es tu cuenta de Hestia) */
export function pedirLlamada(o: OpcionesLlamada = {}): void {
  pendiente = { ...o, t: Date.now() };
  DeviceEventEmitter.emit('HESTIA_LLAMAR', o);
}

/** La llamada pedida hace poco (una sola vez), o null */
export function tomarLlamadaPendiente(): OpcionesLlamada | null {
  const p = pendiente;
  pendiente = null;
  if (!p || Date.now() - p.t > VIGENCIA_MS) return null;
  const { t: _t, ...o } = p;
  return o;
}

/** ¿Hay una llamada abierta? (la marca la pantalla de la llamada; App.tsx la mira para no dejar Eris sobre el bloqueo) */
let abierta = false;
export const llamadaAbierta = (): boolean => abierta;
export function marcarLlamada(on: boolean): void { abierta = on; }

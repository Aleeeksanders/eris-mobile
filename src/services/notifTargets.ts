// ============================================================
// Eris Mobile — a dónde lleva un botón de notificación (revisión I2, 2026-11-04)
//
// «Ver» de un suplemento y «Elegir hora» de «¿Entrenas hoy?» abrían la app y no llevaban a ningún lado. App navega a la
// pestaña o al módulo y acá deja el pedido: la pantalla lo atiende al recibir el evento o, si todavía no estaba montada,
// al montarse (se atiende una sola vez).
// ============================================================
import { DeviceEventEmitter } from 'react-native';

/** (y el escáner por voz, 2026-11-17: «Hestia, escanea el código de barras» → la cámara de comida, gastos o inventario) */
export type Destino = 'suplementos' | 'entreno_hora' | 'escanear_comida' | 'escanear_gasto' | 'escanear_inventario';
/** Hestia pidió abrir un escáner (lo atiende App: abre el módulo y deja el destino) */
export const ABRIR_ESCANER_EVENT = 'eris_abrir_escaner';
export const NOTIF_TARGET_EVENT = 'eris_notif_target';

const pendientes = new Set<Destino>();

/** App: «abre esto» (la pantalla puede estar montada o no). */
export function pedirDestino(d: Destino) {
  pendientes.add(d);
  DeviceEventEmitter.emit(NOTIF_TARGET_EVENT, d);
}

/** La pantalla: ¿hay un pedido para mí? Lo consume. */
export function tomarDestino(d: Destino): boolean {
  const hay = pendientes.has(d);
  pendientes.delete(d);
  return hay;
}

/** Escucha los pedidos de un destino (y atiende el que quedó antes de montarse). Devuelve cómo dejar de escuchar. */
export function escucharDestino(d: Destino, fn: () => void): () => void {
  if (tomarDestino(d)) setTimeout(fn, 0);
  const sub = DeviceEventEmitter.addListener(NOTIF_TARGET_EVENT, (x: Destino) => { if (x === d && tomarDestino(d)) fn(); });
  return () => sub.remove();
}

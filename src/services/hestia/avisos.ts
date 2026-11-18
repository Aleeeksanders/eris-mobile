// ============================================================
// Hestia como JARVIS · L2 (2026-11-17): lo que pasa en el teléfono, al servidor (hestia_evento), para que Hestia te lo diga:
//  - una llamada que entra (Hestia Manos la ve en su notificación): «Te llama Mamá»;
//  - un mensaje nuevo: SOLO de quién, el chat y la app (el servidor avisa solo de tus importantes; el texto nunca sale);
//  - un cargo del banco fuera de lo común (Finanzas, cargoRaro): «¿lo reconoces?».
// Solo Ikaros en Modo AXS con Hestia Manos (lo arranca presencia.ts). Si el servidor no está (sin conexión o con la app en
// segundo plano), el cargo queda como notificación con sus botones igual.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { HestiaManos, type EventoManos } from '../../../modules/hestia-manos';
import { wsManager } from '../WebSocketManager';
import { callarHestia } from './altavoz';
import type { CargoRaro } from '../finance/cargoRaro';

/** Hestia está activa en este teléfono (lo lee también la tarea de Finanzas con la app cerrada) */
const CLAVE_ACTIVA = 'hestia_activa';
/** Contestaste una llamada de teléfono con la de Hestia abierta: la de Hestia se cuelga (el teléfono necesita el micrófono, y
 *  la voz de Hestia no puede colarse en tu llamada). Lo escucha HestiaLlamada. */
export const COLGAR_HESTIA_EVENT = 'hestia_colgar_por_llamada';

let activo = false;
let sub: { remove(): void } | null = null;

const txt = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

function reenviar(e: EventoManos) {
  if (!activo || !e || typeof e !== 'object') return;
  if (e.tipo === 'llamada') {
    // (la contestaste o terminó: si Hestia estaba diciendo «Te llama…», que se calle)
    if (e.estado !== 'sonando') callarHestia();
    if (e.estado === 'en_curso') DeviceEventEmitter.emit(COLGAR_HESTIA_EVENT);
    wsManager.sendMessage({ type: 'hestia_evento', evento: { tipo: 'llamada', estado: e.estado, de: txt(e.de, 40) || null, conocido: e.conocido === true, app: txt(e.app, 30), spam: e.spam === true, final4: txt(e.final4, 4) || null, clave: txt(e.clave, 40), t: Date.now() } });
    return;
  }
  if (e.tipo === 'mensaje') {
    // solo de quién: el texto nunca viene de Hestia Manos ni sale del teléfono
    wsManager.sendMessage({ type: 'hestia_evento', evento: { tipo: 'mensaje', de: txt(e.de, 40), chat: txt(e.chat, 60), grupo: e.grupo === true, app: txt(e.app, 30), t: Date.now() } });
  }
}

/** Empieza a escuchar a Hestia Manos (lo llama iniciarPresencia) */
export function iniciarAvisos(): void {
  if (activo) return;
  activo = true;
  AsyncStorage.setItem(CLAVE_ACTIVA, '1').catch(() => {});
  sub = HestiaManos.onManos(reenviar);
  HestiaManos.escucharManos(true);
}

/** Para (pasaste a Eris o cerraste sesión) */
export function detenerAvisos(): void {
  AsyncStorage.removeItem(CLAVE_ACTIVA).catch(() => {});
  if (!activo) return;
  activo = false;
  HestiaManos.escucharManos(false);
  try { sub?.remove(); } catch {}
  sub = null;
}

/**
 * Finanzas encontró cargos raros (financeAuto.process). Con la app conectada, al servidor (Hestia decide si lo dice: con
 * audífonos y sin la plata si está bloqueado); si no, la notificación con «Sí, era yo» / «No, revisar» de una.
 */
export async function avisarCargos(xs: CargoRaro[]): Promise<void> {
  if (!xs?.length) return;
  const activa = activo || (await AsyncStorage.getItem(CLAVE_ACTIVA).catch(() => null)) === '1';
  if (!activa) return;
  for (const c of xs.slice(0, 3)) {
    if (activo && wsManager.getStatus() === 'connected') {
      wsManager.sendMessage({ type: 'hestia_evento', evento: { tipo: 'cargo', id: c.id, txId: c.txId, monto: c.monto, comercio: c.comercio, razon: c.razon, porConfirmar: c.porConfirmar, t: Date.now() } });
      continue;
    }
    // require: ErisNotifications importa el WS y la persona
    try {
      const { clp } = require('../finance/financeCore');
      await require('../ErisNotifications').erisNotifications.hestiaCargo({
        titulo: '¿Reconoces este cargo?', texto: `${clp(c.monto)} en ${c.comercio}${c.razon ? ` · ${c.razon}` : ''}.${c.porConfirmar ? ' Quedó en «Por confirmar».' : ''}`,
        clave: `cargo-${c.id}`, datos: { id: c.id, txId: c.txId, porConfirmar: c.porConfirmar },
      });
    } catch {}
  }
}

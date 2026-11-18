// ============================================================
// Hestia como JARVIS · C4 (L1, 2026-11-17): los sensores del teléfono, al servidor (hestia_sensor). Solo Ikaros en Modo AXS y con
// Hestia Manos (el teléfono de Alex). Con eso el servidor sabe:
//  - si tienes los audífonos puestos (si no, Hestia nunca habla sola en voz alta),
//  - si estás en casa: el teléfono alcanza al PC por la red de la casa (la IP LAN; sin ubicación),
//  - «no molestar», si estás en una llamada y el modo «solo si digo Hestia».
// Se manda al cambiar algo y cada 10 minutos (si no, el servidor deja de confiar en lo último: 30 min).
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HestiaManos, type SensoresTel } from '../../../modules/hestia-manos';
import { NetworkConfig } from '../../config/env';
import { wsManager } from '../WebSocketManager';
import { iniciarAvisos, detenerAvisos } from './avisos';

const CLAVE_DIRIGIDO = 'hestia_solo_si_la_nombran';
const CADA_MS = 10 * 60_000;
const ESPERA_CASA_MS = 2500;

/** La dirección del PC en la red de la casa (la misma IP LAN de la conexión local), a la ruta que solo responde «casa» */
export const urlCasa = (): string => NetworkConfig.LOCAL_URL.replace(/^ws(s?):/, 'http$1:').replace(/\/ws\/?$/, '/api/casa');

let activo = false;
let quitar: Array<() => void> = [];
let reloj: ReturnType<typeof setInterval> | null = null;
let ultimo = '';
let enCasa: boolean | null = null;
let revisadoEn = 0;
let enCurso: Promise<void> | null = null;

/** ¿Alcanza al PC por la red de la casa? (sin wifi, no; si no responde en 2,5 s, no) */
async function revisarCasa(s: SensoresTel): Promise<boolean> {
  if (!s.wifi) return false;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ESPERA_CASA_MS);
  try {
    const r = await fetch(urlCasa(), { signal: ac.signal, headers: { 'Cache-Control': 'no-cache' } });
    const j = await r.json().catch(() => null);
    return j?.eris === 'casa';
  } catch { return false; } finally { clearTimeout(t); }
}

async function mandar(o: { revisarCasa?: boolean; forzar?: boolean } = {}): Promise<void> {
  if (!activo) return;
  const s = HestiaManos.sensores();
  if (!s) return;
  if (o.revisarCasa || enCasa === null || Date.now() - revisadoEn > CADA_MS) {
    enCasa = await revisarCasa(s);
    revisadoEn = Date.now();
  }
  if (!activo) return;
  const dirigido = (await AsyncStorage.getItem(CLAVE_DIRIGIDO).catch(() => null)) === '1';
  const sensores = { audifonos: !!s.audifonos, audifonosNombre: s.audifonosNombre ?? null, enCasa, noMolestar: !!s.noMolestar, llamadaTel: !!s.llamadaTel, dirigido,
    // L2: sonando ≠ en una llamada; bloqueado = la plata no se dice en voz alta
    sonando: !!s.sonando, enCurso: !!s.enCurso, bloqueado: s.bloqueado !== false };
  const firma = JSON.stringify(sensores);
  if (firma === ultimo && !o.forzar) return;
  ultimo = firma;
  wsManager.sendMessage({ type: 'hestia_sensor', sensores: { ...sensores, t: Date.now() } });
}

/** Uno a la vez (dos cambios seguidos de la red no hacen dos revisiones en paralelo) */
function pedir(o: { revisarCasa?: boolean; forzar?: boolean }) {
  const run = (enCurso ?? Promise.resolve()).then(() => mandar(o)).catch(() => {});
  enCurso = run;
}

/** Empieza (Ikaros en Modo AXS con Hestia Manos). Repetirlo no hace nada. */
export function iniciarPresencia(): void {
  if (activo || !HestiaManos.disponible()) return;
  activo = true;
  HestiaManos.vigilarSensores(true);
  const sub = HestiaManos.onSensor((s) => pedir({ revisarCasa: s?.motivo === 'red', forzar: false }));
  // el servidor se reinició o se reconectó: que sepa de nuevo dónde estás
  const off = wsManager.subscribeMessage((m: any) => { if (m?.type === 'connected') pedir({ forzar: true }); });
  quitar = [() => sub.remove(), () => { off(); }];
  reloj = setInterval(() => pedir({ forzar: true }), CADA_MS);
  pedir({ revisarCasa: true, forzar: true });
  // L2: las llamadas que entran y los mensajes nuevos (Hestia Manos), y los cargos raros de Finanzas
  iniciarAvisos();
}

/** Lo dirigido cambió en la llamada («solo si digo Hestia»): que el servidor lo sepa */
export function presenciaCambio(): void { if (activo) pedir({}); }

/** Para (pasaste a Eris o cerraste sesión): el servidor olvida lo último y Hestia no habla sola */
export function detenerPresencia(): void {
  detenerAvisos();
  if (!activo) return;
  activo = false;
  HestiaManos.vigilarSensores(false);
  for (const q of quitar) { try { q(); } catch {} }
  quitar = [];
  if (reloj) clearInterval(reloj);
  reloj = null;
  ultimo = '';
  enCasa = null;
  wsManager.sendMessage({ type: 'hestia_sensor', sensores: { apagado: true } });
}

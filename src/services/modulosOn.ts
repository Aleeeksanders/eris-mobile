// ============================================================
// Eris Mobile — qué módulos están encendidos ahora (revisión A2, 2026-11-04)
//
// Apagar un módulo en Perfil solo escondía la pestaña: lo de fondo seguía andando (la despensa se descontaba con cada
// comida, los avisos del banco se anotaban en Finanzas y el chat podía leer y anotar en ellos). App fija la lista al
// cargar el perfil y al cambiarla; los servicios de fondo preguntan acá. El servidor la recibe con «Así manejo tu…»
// (autoPrefs) y el chat tampoco toca lo apagado.
// ============================================================
import { DeviceEventEmitter } from 'react-native';

export const MODULOS_EVENT = 'MODULES_CHANGED';

/** null = todavía no se sabe o Modo AXS (todo encendido) */
let actuales: string[] | null = null;

export const modulosOn = {
  set(m: string[] | null) { actuales = m ? [...m] : null; },
  get(): string[] | null { return actuales ? [...actuales] : null; },
  /** ¿Ese módulo está encendido? (sin saber: sí) */
  on(id: string): boolean { return !actuales || actuales.includes(id); },
};

/** Lo que el chat pidió en un módulo apagado: se responde sin tocar nada */
export const respuestaApagado = (nombre: string) => ({
  ok: false, code: 'modulo_apagado',
  msg: `${nombre} está apagado en este teléfono (Perfil → Módulos): no anoté nada. Si lo enciendes, lo hago.`,
});

// Para que los servicios que se cargan antes que App también lo sepan
DeviceEventEmitter.addListener(MODULOS_EVENT, (m: unknown) => { if (Array.isArray(m)) modulosOn.set(m as string[]); });

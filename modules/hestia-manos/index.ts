import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Hestia Manos (K0, 2026-11-16): la app aparte que le da a Hestia las manos en el teléfono (solo el teléfono de Alex).
 * Sin la app, o sin el módulo nativo en el APK, todo responde «no disponible» sin romper nada.
 */
type Native = {
  disponible(): boolean;
  pedir(op: string): Promise<string>;
  // K3
  consumirDespertar(): Despertar | null;
  bloqueado(): boolean;
  sobreBloqueo(on: boolean): void;
  pedirDesbloqueo(): Promise<boolean>;
  avisarLlamada(estado: 'inicio' | 'fin'): void;
  // L1 (C4)
  sensores(): SensoresTel;
  vigilarSensores(on: boolean): void;
  // L2
  escucharManos(on: boolean): void;
  // L6
  frasesLimpiar(): void;
  vozDeFrase(ms: number): Promise<string>;
  addListener(event: 'onDespertar' | 'onDesbloqueo' | 'onSensor' | 'onManos', cb: (e: any) => void): { remove(): void };
};

/** L1 (C4): lo que el teléfono sabe sin permisos nuevos: audífonos, «no molestar», si estás en una llamada y si va por wifi */
export type SensoresTel = { audifonos: boolean; audifonosNombre?: string; noMolestar: boolean; llamadaTel: boolean; wifi: boolean; motivo?: string;
  /** L2: sonando (una llamada entrante), en una llamada ya contestada, pantalla bloqueada */
  sonando?: boolean; enCurso?: boolean; bloqueado?: boolean };

/** L6: lo que dijo Hestia Manos del audio de una frase de la llamada (¿la dijiste tú?) */
export type VozDeFrase = { clase: 'tuya' | 'dudosa' | 'otra' | 'corta' | 'sin'; puntaje?: number; ms?: number; voz_s?: number; motivo?: string };

/** L2: lo que avisa Hestia Manos (de quién, nunca el texto de un mensaje) */
export type EventoManos =
  | { tipo: 'llamada'; estado: 'sonando' | 'en_curso' | 'fin'; de?: string; conocido?: boolean; app?: string; spam?: boolean; final4?: string; clave?: string; t?: number }
  | { tipo: 'mensaje'; de: string; chat?: string; grupo?: boolean; app?: string; t?: number };

/**
 * K3 (2026-11-16): Hestia Manos abrió la llamada (el botón del asistente, el de los ajustes rápidos o el atajo del ícono), con la
 * clave que Eris le dio. `bloqueado`: el teléfono estaba bloqueado y la llamada se ve sobre la pantalla de bloqueo.
 */
export type Despertar = { origen: string; bloqueado: boolean };

const native: Native | null = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('HestiaManos') : null;

export interface ResultadoManos { ok: boolean; code?: string; msg?: string; data?: any; opciones?: string[] }

const NADA = { remove() {} };

export const HestiaManos = {
  disponible: (): boolean => { try { return native?.disponible() ?? false; } catch { return false; } },
  /** Un pedido del servidor (telefono_op) → lo que hizo Hestia Manos */
  pedir: async (op: unknown): Promise<ResultadoManos> => {
    if (!native) return { ok: false, code: 'sin_manos', msg: 'Hestia Manos no está en este teléfono.' };
    try {
      const r = JSON.parse(await native.pedir(JSON.stringify(op ?? {})));
      return r && typeof r.ok === 'boolean' ? r : { ok: false, code: 'error', msg: 'Respuesta que no entendí.' };
    } catch {
      return { ok: false, code: 'error', msg: 'No pude hablar con Hestia Manos.' };
    }
  },
  // ─── K3: abrir la llamada desde Hestia Manos, también con el teléfono bloqueado ───
  /** La apertura pendiente (una sola vez) o null */
  consumirDespertar: (): Despertar | null => { try { return native?.consumirDespertar() ?? null; } catch { return null; } },
  onDespertar: (cb: () => void) => { try { return native?.addListener('onDespertar', cb) ?? NADA; } catch { return NADA; } },
  /** Desbloqueaste el teléfono (Android avisa al quitar el bloqueo) */
  onDesbloqueo: (cb: () => void) => { try { return native?.addListener('onDesbloqueo', cb) ?? NADA; } catch { return NADA; } },
  bloqueado: (): boolean => { try { return native?.bloqueado() ?? false; } catch { return false; } },
  /** Mostrar Eris sobre la pantalla de bloqueo SOLO durante la llamada (al colgar: false, siempre) */
  sobreBloqueo: (on: boolean): void => { try { native?.sobreBloqueo(on); } catch {} },
  /** Pide desbloquear (huella, cara o PIN, en la pantalla de Android). true = desbloqueado */
  pedirDesbloqueo: async (): Promise<boolean> => { try { return (await native?.pedirDesbloqueo()) ?? false; } catch { return false; } },
  avisarLlamada: (estado: 'inicio' | 'fin'): void => { try { native?.avisarLlamada(estado); } catch {} },
  // ─── L1 (C4): los sensores (viven en el módulo de Eris: Hestia Manos sigue sin internet) ───
  sensores: (): SensoresTel | null => { try { return native?.sensores() ?? null; } catch { return null; } },
  vigilarSensores: (on: boolean): void => { try { native?.vigilarSensores(on); } catch {} },
  onSensor: (cb: (s: SensoresTel) => void) => { try { return native?.addListener('onSensor', cb) ?? NADA; } catch { return NADA; } },
  // ─── L2: lo que pasa en el teléfono (llamadas que entran, mensajes nuevos) ───
  escucharManos: (on: boolean): void => { try { native?.escucharManos(on); } catch {} },
  onManos: (cb: (e: EventoManos) => void) => { try { return native?.addListener('onManos', cb) ?? NADA; } catch { return NADA; } },
  // ─── L6: en la llamada, ¿cada frase es tuya? ───
  /** Borra el audio de la llamada que haya quedado (al empezar y al colgar) */
  frasesLimpiar: (): void => { try { native?.frasesLimpiar(); } catch {} },
  /** La frase que se acaba de cerrar (`ms`: lo que duró, con margen) → tuya, dudosa, otra, corta o sin (no se pudo revisar) */
  vozDeFrase: async (ms: number): Promise<VozDeFrase> => {
    if (!native) return { clase: 'sin', motivo: 'sin_manos' };
    try {
      const r = JSON.parse(await native.vozDeFrase(Math.round(ms)));
      const c = r?.data?.clase;
      return r?.ok && ['tuya', 'dudosa', 'otra', 'corta', 'sin'].includes(c) ? r.data : { clase: 'sin', motivo: r?.code ?? 'error' };
    } catch {
      return { clase: 'sin', motivo: 'error' };
    }
  },
};

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
  addListener(event: 'onDespertar' | 'onDesbloqueo', cb: (e: any) => void): { remove(): void };
};

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
};

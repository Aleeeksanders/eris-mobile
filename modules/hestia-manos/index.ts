import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Hestia Manos (K0, 2026-11-16): la app aparte que le da a Hestia las manos en el teléfono (solo el teléfono de Alex).
 * Sin la app, o sin el módulo nativo en el APK, todo responde «no disponible» sin romper nada.
 */
type Native = {
  disponible(): boolean;
  pedir(op: string): Promise<string>;
};

const native: Native | null = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('HestiaManos') : null;

export interface ResultadoManos { ok: boolean; code?: string; msg?: string; data?: any; opciones?: string[] }

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
};

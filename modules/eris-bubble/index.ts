import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Burbuja de Eris sobre otras apps (solo Android). Ver android/.../BubbleService.kt.
 * En otras plataformas, o si el módulo nativo no está en el APK, todo responde "no disponible" sin romper nada.
 */
/** idle · thinking (anillo que late: Eris está respondiendo) · reply (punto: la respuesta quedó lista mientras estabas fuera) */
export type BubbleState = 'idle' | 'thinking' | 'reply';

type Native = {
  canDrawOverlays(): boolean;
  openOverlaySettings(): void;
  isEnabled(): boolean;
  enable(): boolean;
  disable(): void;
  setAppForeground(foreground: boolean, centerX?: number | null, centerY?: number | null): void;
  setState(state: BubbleState): void;
  setPersona?(persona: string): void;
  consumePendingOpen(): boolean;
  consumePendingCall?(): boolean;
  startCall?(): boolean;
  stopCall?(): void;
  addListener(event: 'onBubbleTap' | 'onBubbleClosed' | 'onCallHangup', cb: () => void): { remove(): void };
};

const native: Native | null = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('ErisBubble') : null;

export const ErisBubble = {
  available: !!native,
  canDrawOverlays: () => { try { return native?.canDrawOverlays() ?? false; } catch { return false; } },
  openOverlaySettings: () => { try { native?.openOverlaySettings(); } catch {} },
  isEnabled: () => { try { return native?.isEnabled() ?? false; } catch { return false; } },
  enable: () => { try { return native?.enable() ?? false; } catch { return false; } },
  disable: () => { try { native?.disable(); } catch {} },
  setAppForeground: (foreground: boolean, center?: { x: number; y: number }) => {
    try { native?.setAppForeground(foreground, center?.x ?? null, center?.y ?? null); } catch {}
  },
  setState: (state: BubbleState) => { try { native?.setState(state); } catch {} },
  /** "eris" o "hestia" (Modo AXS Executive): ícono y notificación de la burbuja de fuera de la app. */
  setPersona: (persona: 'eris' | 'hestia') => { try { native?.setPersona?.(persona); } catch {} },
  /** Modo burbuja listo para usarse: encendido (por defecto sí) y con el permiso "Mostrar sobre otras apps". */
  isActive: () => { try { return !!native && native.isEnabled() && native.canDrawOverlays(); } catch { return false; } },
  consumePendingOpen: () => { try { return native?.consumePendingOpen() ?? false; } catch { return false; } },
  /** J3: se mantuvo presionada la burbuja de Hestia (una sola vez true): abrir la llamada. */
  consumePendingCall: () => { try { return native?.consumePendingCall?.() ?? false; } catch { return false; } },
  /** J3: la llamada sigue con la pantalla apagada (servicio de micrófono). Llamarlo con la llamada a la vista. */
  startCall: () => { try { return native?.startCall?.() ?? false; } catch { return false; } },
  stopCall: () => { try { native?.stopCall?.(); } catch {} },
  /** «Colgar» desde la notificación de la llamada */
  onCallHangup: (cb: () => void) => { try { return native?.addListener('onCallHangup', cb) ?? { remove() {} }; } catch { return { remove() {} }; } },
  onClosed: (cb: () => void) => { try { return native?.addListener('onBubbleClosed', cb) ?? { remove() {} }; } catch { return { remove() {} }; } },
};

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Avisos del banco para Finanzas (solo Android). Ver android/.../BankNotificationService.kt.
 * Sin el módulo nativo (otra plataforma, APK viejo) todo responde "no disponible" sin romper nada.
 */
/** `via`: llegó por correo o SMS del banco (solo con «correos y SMS» encendido) */
export interface BankNotice { pkg: string; app: string; title: string; text: string; at: number; key: string; via?: 'correo' | 'sms' }
export interface SeenApp { pkg: string; app: string; count: number; last: number }

type Native = {
  hasAccess(): boolean;
  openAccessSettings(): void;
  rebind(): void;
  getAllowed(): string[];
  setAllowed(pkgs: string[]): void;
  seenApps(): string;
  takeQueue(): string;
  setProfile?(p: string | null): void;
  getMail?(): boolean;
  setMail?(on: boolean): void;
  addListener(event: 'onBankNotification', cb: () => void): { remove(): void };
};

const native: Native | null = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('ErisBankNotifications') : null;
const json = <T,>(s: string | undefined, def: T): T => { try { return s ? (JSON.parse(s) as T) : def; } catch { return def; } };

export const BankNotifications = {
  available: !!native,
  hasAccess: () => { try { return native?.hasAccess() ?? false; } catch { return false; } },
  openAccessSettings: () => { try { native?.openAccessSettings(); } catch {} },
  rebind: () => { try { native?.rebind(); } catch {} },
  getAllowed: (): string[] => { try { return native?.getAllowed() ?? []; } catch { return []; } },
  setAllowed: (pkgs: string[]) => { try { native?.setAllowed(pkgs); } catch {} },
  /** Apps que mostraron montos (sin guardar su texto), la más frecuente primero */
  seenApps: (): SeenApp[] => {
    try {
      const o = json<Record<string, { app: string; count: number; last: number }>>(native?.seenApps(), {});
      return Object.entries(o).map(([pkg, v]) => ({ pkg, app: v.app || pkg, count: Number(v.count) || 0, last: Number(v.last) || 0 })).sort((a, b) => b.count - a.count);
    } catch { return []; }
  },
  /** Los avisos guardados desde la última vez (la cola queda vacía) */
  takeQueue: (): BankNotice[] => { try { return json<BankNotice[]>(native?.takeQueue(), []); } catch { return []; } },
  /** ¿También los correos y SMS del banco? (Gmail, Outlook, Mensajes: solo si el remitente es un banco conocido). Apagado por defecto. */
  /** La cuenta activa (revisión D4): sin sesión no se lee nada, y cada cuenta tiene sus apps y su cola */
  setProfile: (p: string | null) => { try { native?.setProfile?.(p); } catch {} },
  getMail: (): boolean => { try { return native?.getMail?.() ?? false; } catch { return false; } },
  setMail: (on: boolean) => { try { native?.setMail?.(on); } catch {} },
  onNotice: (cb: () => void) => { try { return native?.addListener('onBankNotification', cb) ?? { remove() {} }; } catch { return { remove() {} }; } },
};

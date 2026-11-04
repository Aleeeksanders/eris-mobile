// ============================================================
// Eris Mobile — en qué modo está la app: Eris, Hestia o Empresa
//
//   eris    → modo personal con Eris (todos los perfiles), tal cual siempre.
//   hestia  → Modo AXS Executive: el mismo modo personal (mismas vistas y permisos), atendido por Hestia, con AXS y el PC.
//   empresa → dentro del Modo AXS Executive, el menú AXS (Panel, Proyectos, Pendientes, Sistema), también con Hestia.
//             Forge y Finanzas siguen a mano desde el Panel.
// Hestia y AXS son del mismo perfil y solo para administradores (rol ikaros). El Modo AXS Executive se prende y apaga en
// Perfil (Eris ↔ Hestia); dentro de él, el Dashboard de Hestia y el Panel tienen el selector Hestia · AXS (ModeSwitch).
// App aplica el cambio, lo guarda por perfil y le avisa al servidor (los chats de Eris y de Hestia van separados).
// ============================================================
import { useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { wsManager } from '../services/WebSocketManager';

export type AppMode = 'eris' | 'hestia' | 'empresa';

/** Pedido de cambio de modo (lo atiende App). */
export const APP_MODE_EVENT = 'APP_MODE_CHANGE';
export const requestAppMode = (m: AppMode) => DeviceEventEmitter.emit(APP_MODE_EVENT, m);

let current: AppMode = 'eris';
const listeners = new Set<(m: AppMode) => void>();
export const AppModeStore = {
  get: (): AppMode => current,
  /** Lo fija App. */
  set(m: AppMode) {
    if (m === current) return;
    current = m;
    for (const l of [...listeners]) { try { l(m); } catch {} }
  },
  subscribe(cb: (m: AppMode) => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; },
};

export function useAppMode(): AppMode {
  const [m, setM] = useState<AppMode>(AppModeStore.get());
  useEffect(() => AppModeStore.subscribe(setM), []);
  return m;
}

/** Hestia y el modo Empresa: solo administradores. */
// Solo «ikaros»: Hestia es la asistente del Modo AXS, no un rol del servidor (que trata un «hestia» viejo como usuario normal; revisión A3)
export const isAdminRole = (role?: string | null) => role === 'ikaros';

/** El rol del perfil según el servidor (llega al conectar). */
export function useSysRole(): string | null {
  const [role, setRole] = useState<string | null>(wsManager.getLastConnectedPayload()?.role ?? null);
  useEffect(() => {
    const off = wsManager.subscribeMessage((d: any) => { if (d?.type === 'connected' && d.role) setRole(d.role); });
    return () => { off(); };
  }, []);
  return role;
}

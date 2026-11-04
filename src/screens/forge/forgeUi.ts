// Forge 2.0 — lo que comparten las pestañas: la pestaña actual, el día que se edita, el aviso de XP y abrir una habilidad.
import { createContext, useContext } from 'react';
import type { Readiness } from '../../services/sleep/sleepCore';

export type Tab = 'hoy' | 'entrenar' | 'personaje' | 'arbol' | 'arena' | 'progreso' | 'rutina';

export interface ForgeUi {
  tab: Tab; setTab: (t: Tab) => void;
  /** día pasado que se está editando (null = hoy) */
  viewDay: string | null; setViewDay: (d: string | null) => void;
  toast: (amount: number, label?: string) => void;
  openSkill: (id: string) => void;
  level: number;
  /** cómo llega a entrenar según el sueño (Sueño 2.0 · S3): 3 noches + deuda; null sin datos del reloj */
  ready: Readiness | null;
}
export const ForgeUiCtx = createContext<ForgeUi | null>(null);
export const useForgeUi = () => useContext(ForgeUiCtx)!;

// ============================================================
// Eris Mobile — lo que el recorrido guiado puede iluminar
//
// Cada parte de la app que el recorrido explica se registra acá con un nombre ('home.clock', 'tabbar'…). El recorrido
// mide dónde está en pantalla (measureInWindow) justo antes de iluminarla, así funciona en cualquier tamaño de teléfono.
// ============================================================

import { Platform, StatusBar, type View } from 'react-native';

/** Pide empezar el recorrido (Inicio lo escucha; App lo manda al terminar la bienvenida, Perfil desde su enlace). */
export const TOUR_EVENT = 'ERIS_START_TOUR';

export interface Rect { x: number; y: number; w: number; h: number }

const refs = new Map<string, View | null>();
const setters = new Map<string, (r: View | null) => void>();

/** ref={tourRef('home.clock')} — el mismo callback en cada render (no ensucia el registro). */
export function tourRef(id: string) {
  let f = setters.get(id);
  if (!f) { f = (r: View | null) => { refs.set(id, r); }; setters.set(id, f); }
  return f;
}

/** Dónde está en pantalla, o null si no está montado o no se ve. */
export function measureTarget(id: string): Promise<Rect | null> {
  const r = refs.get(id);
  if (!r) return Promise.resolve(null);
  return new Promise((res) => {
    // En Android measureInWindow resta la barra de estado (getWindowVisibleDisplayFrame), pero la app y el recorrido dibujan
    // desde el borde de arriba de la pantalla: se le suma de vuelta (sin esto lo iluminado quedaba ~50 dp más arriba).
    const top = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;
    try { r.measureInWindow((x, y, w, h) => res(w > 0 && h > 0 ? { x, y: y + top, w, h } : null)); } catch { res(null); }
  });
}

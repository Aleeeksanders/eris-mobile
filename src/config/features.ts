// ============================================================
// Eris Mobile — módulos con visto bueno del administrador
// El servidor dice qué módulos están liberados (al conectar y cuando cambian en el panel de administración). Mientras
// no lo diga —sin conexión, app recién abierta— todo lo que necesita visto bueno queda APAGADO: nunca se muestra un
// módulo en revisión por error.
// ============================================================
import { useEffect, useState } from 'react';

export interface Features {
  /** Módulo de glucosa (sensor LibreLinkUp/Linx, alertas, pestaña). En revisión desde el 2026-10-07. */
  glucose: boolean;
  /**
   * «Eris administra» Finanzas: anota sola lo que avisa el banco (2026-10-30). Primero solo Ikaros; el público, cuando se
   * encienda en el panel de administración.
   */
  finanzasAuto: boolean;
}

const DEFAULTS: Features = { glucose: false, finanzasAuto: false };
let current: Features = { ...DEFAULTS };
/** El rol de la cuenta (llega al conectar; `features_updated` no lo trae) */
let role: string | null = null;
const listeners = new Set<(f: Features) => void>();

export const FeatureStore = {
  get: (): Features => current,
  /** Lo que mande el servidor (y el rol, al conectar); cualquier campo ausente o raro = apagado. */
  set(raw: unknown, rol?: string | null) {
    if (rol !== undefined) role = rol;
    const r = (raw ?? {}) as Partial<Record<keyof Features, unknown>>;
    const next: Features = { glucose: r.glucose === true, finanzasAuto: r.finanzasAuto === true || role === 'ikaros' };
    if (next.glucose === current.glucose && next.finanzasAuto === current.finanzasAuto) return;
    current = next;
    for (const l of [...listeners]) { try { l(next); } catch {} }
  },
  /** Al cerrar sesión: todo vuelve a apagado hasta que el servidor diga otra cosa. */
  reset() { this.set(DEFAULTS, null); },
  subscribe(cb: (f: Features) => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  },
};

/** ¿Este módulo tiene visto bueno? Se actualiza solo cuando el administrador lo cambia. */
export function useFeature(name: keyof Features): boolean {
  const [on, setOn] = useState(FeatureStore.get()[name]);
  useEffect(() => FeatureStore.subscribe((f) => setOn(f[name])), [name]);
  return on;
}

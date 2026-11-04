// ============================================================
// Eris Mobile — quién te habla: Eris o Hestia
// En el Modo AXS Executive (solo perfiles Ikaros) la asistente es Hestia: otro nombre, otro ícono (núcleo de brasa en
// una nube azul AXS) y su propia personalidad en el servidor. Fuera de ese modo es Eris. Lo que es de la APP (permisos
// de Android, "Busca Eris en Health Connect", la versión) sigue diciendo Eris: así se llama la app en el teléfono.
// ============================================================
import { useEffect, useState } from 'react';
import { ErisBubble } from '../../modules/eris-bubble';

export type PersonaId = 'eris' | 'hestia';

export interface Persona {
  id: PersonaId;
  name: string;
  /** Núcleo del ícono (claro → medio → oscuro) y su halo */
  core: [string, string, string];
  glow: string;
  /** Átomos cercanos al núcleo */
  inner: string;
  /** Nube del chat (los módulos tiñen igual para ambas) */
  chat: { mid: string; outer: string };
  /** Borde, anillo y destellos de la burbuja */
  accent: string;
}

// Mismos valores que ErisMarkDrawer.kt (ERIS / HESTIA) para el ícono estático cuando no hay módulo nativo
export const PERSONAS: Record<PersonaId, Persona> = {
  eris: {
    id: 'eris', name: 'Eris',
    core: ['#ecfdf5', '#34d399', '#047857'], glow: '#34d399', inner: '#a7f3d0',
    chat: { mid: '#67e8f9', outer: '#22d3ee' }, accent: '#22d3ee',
  },
  hestia: {
    id: 'hestia', name: 'Hestia',
    core: ['#fffbeb', '#f59e0b', '#b45309'], glow: '#f59e0b', inner: '#fde68a',
    chat: { mid: '#7dd3fc', outer: '#3b82f6' }, accent: '#3b82f6',
  },
};

let current: PersonaId = 'eris';
const listeners = new Set<(p: PersonaId) => void>();

export const PersonaStore = {
  get: (): PersonaId => current,
  /** Lo fija App según el Modo AXS Executive. Avisa a las pantallas y a la burbuja de fuera de la app. */
  set(id: PersonaId) {
    ErisBubble.setPersona(id);
    if (id === current) return;
    current = id;
    for (const l of [...listeners]) { try { l(id); } catch {} }
  },
  subscribe(cb: (p: PersonaId) => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  },
};

/** La asistente actual (se actualiza sola al entrar o salir del Modo AXS Executive). */
export function usePersona(): Persona {
  const [id, setId] = useState<PersonaId>(PersonaStore.get());
  useEffect(() => PersonaStore.subscribe(setId), []);
  return PERSONAS[id];
}

/** Para textos fuera de React (alertas, avisos). */
export const personaName = () => PERSONAS[current].name;

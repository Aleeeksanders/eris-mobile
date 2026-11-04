// ============================================================
// Eris Mobile — ErisPresence
// Qué está haciendo Eris ahora ("idle" | "thinking" | "reply"), para que la burbuja de DENTRO de la app (ErisFAB) y
// la de FUERA (módulo eris-bubble) muestren lo mismo. ChatScreen lo actualiza; antes solo se avisaba a la de fuera.
// ============================================================
import { ErisBubble, type BubbleState } from '../../modules/eris-bubble';

type Listener = (s: BubbleState) => void;
let current: BubbleState = 'idle';
const listeners = new Set<Listener>();

export const ErisPresence = {
  get: () => current,
  set(s: BubbleState) {
    ErisBubble.setState(s);
    if (s === current) return;
    current = s;
    listeners.forEach((l) => { try { l(s); } catch {} });
  },
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
};

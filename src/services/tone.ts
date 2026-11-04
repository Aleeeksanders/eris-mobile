// ============================================================
// Eris Mobile — el tono con que te habla Eris (lo eliges tú)
//
// Pedido del usuario (2026-10-14): "que el lenguaje sea según la generación de la persona, para que se sientan mejor
// acompañados". La edad SOLO sugiere uno (la que Forge conoce, vía el servidor); la persona elige en la bienvenida o en
// Perfil. Los datos son los mismos en los tres: cambia la forma, nunca el contenido. Se usa en los avisos del día
// (reminderRules.ts), en la comida concreta de los avisos (servidor: NudgeSuggest.ts) y en el chat (servidor: Tone.ts).
// La clave se guarda por cuenta (ScopedStorage) y se manda al servidor al conectar.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { wsManager } from './WebSocketManager';

export type Tone = 'humor' | 'directo' | 'usted';
export const DEFAULT_TONE: Tone = 'directo';
const KEY = 'eris_tone';
export const TONE_CHANGED_EVENT = 'ERIS_TONE_CHANGED';

/** El mismo aviso en los tres tonos: para que la persona elija viendo cómo suena. */
export const TONE_OPTIONS: Array<{ id: Tone; label: string; sub: string; example: string }> = [
  { id: 'humor', label: 'Cercano y con humor', sub: 'Te tutea, con chispa y algún emoji',
    example: 'Te falta fibra a esta hora 👀 Un puñado de almendras te da ~3,5 g. Eso sí, acompáñalo con agua, que por algo se llaman frutos secos 🫰🏻' },
  { id: 'directo', label: 'Cercano y directo', sub: 'Te tutea, al grano',
    example: 'Te falta fibra a esta hora. Un puñado de almendras te da ~3,5 g. Acompáñalo con un vaso de agua.' },
  { id: 'usted', label: 'De usted', sub: 'Respetuoso, sin emojis',
    example: 'Le falta fibra a esta hora. Un puñado de almendras le aporta ~3,5 g. Acompáñelo con un vaso de agua.' },
];

export const isTone = (x: unknown): x is Tone => x === 'humor' || x === 'directo' || x === 'usted';

/** El tono elegido; null si la persona todavía no eligió. */
export async function getTone(): Promise<Tone | null> {
  try { const t = await AsyncStorage.getItem(KEY); return isTone(t) ? t : null; } catch { return null; }
}

/** Guarda el tono, se lo dice al servidor (chat y sugerencias) y recalcula los avisos del día. */
export async function setTone(t: Tone): Promise<void> {
  try { await AsyncStorage.setItem(KEY, t); } catch {}
  if (wsManager.getStatus() === 'connected') wsManager.sendMessage({ type: 'set_tone', tone: t });
  DeviceEventEmitter.emit(TONE_CHANGED_EVENT, t);
}

/** El tono que sugiere el servidor según la edad que conoce Forge (null sin conexión o sin respuesta). */
export function askSuggestedTone(ms = 1500): Promise<Tone | null> {
  if (wsManager.getStatus() !== 'connected') return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = `tn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let done = false;
    const finish = (t: Tone | null) => { if (done) return; done = true; clearTimeout(timer); unsub(); resolve(t); };
    const timer = setTimeout(() => finish(null), ms);
    const unsub = wsManager.subscribeMessage((d: any) => {
      if (d?.type === 'tone' && d.requestId === requestId) finish(isTone(d.suggested) ? d.suggested : null);
    });
    wsManager.sendMessage({ type: 'get_tone', requestId });
  });
}

/** Al conectar, el servidor recibe el tono guardado en el teléfono (cuenta nueva en el servidor, otro teléfono…). */
export function startToneSync(): () => void {
  const push = async () => { const t = await getTone(); if (t) wsManager.sendMessage({ type: 'set_tone', tone: t }); };
  // Con la sesión iniciada (el mensaje «connected»): al abrirse el socket todavía no hay sesión y el servidor lo rechazaba
  // (revisión 2026-10-31, D2)
  const unsub = wsManager.subscribeMessage((d: any) => { if (d?.type === 'connected') void push(); });
  return () => { unsub(); };
}

// ============================================================
// Hestia como JARVIS · C3 (L1, 2026-11-17): el altavoz de Hestia en el teléfono. El servidor ya decidió que puede hablarte (con
// audífonos, sin «no molestar», sin reunión, de día) y manda el audio de Piper (hestia_decir); acá suena con el mismo reproductor
// de la llamada, bajando la música mientras habla. En una llamada abierta no suena aparte (la llamada lo dice).
// ============================================================
import { setAudioModeAsync } from 'expo-audio';
import { Reproductor } from '../voz/reproductor';
import { llamadaAbierta } from '../voz/despertar';

let rep: Reproductor | null = null;
let turno = 0;
let hablando = false;

/** Lo dice. false = no pudo (una llamada abierta, o sin audio): que quede como notificación. */
export async function decirHestia(m: { wav: string; texto: string }): Promise<boolean> {
  if (!m?.wav || llamadaAbierta()) return false;
  try {
    await setAudioModeAsync({ shouldPlayInBackground: true, playsInSilentMode: true, interruptionMode: 'duckOthers' });
    if (!rep) {
      rep = new Reproductor((h) => {
        hablando = h;
        // terminó de hablar: lo de siempre (si mientras tanto se abrió una llamada, la llamada manda)
        if (!h && !llamadaAbierta()) setAudioModeAsync({ shouldPlayInBackground: false }).catch(() => {});
      });
    }
    rep.agregar({ turno: ++turno, seq: 1, wav: m.wav, texto: m.texto });
    return true;
  } catch {
    return false;
  }
}

/** ¿Está hablando ahora? */
export const hestiaHablando = (): boolean => hablando;

/** Callarla (se abrió la llamada) */
export function callarHestia(): void { try { rep?.callar(turno); } catch {} }

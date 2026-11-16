// ============================================================
// Hestia por voz (J1, 2026-11-16): el reconocimiento de voz del propio teléfono, en el aparato (sin internet: el audio no sale
// del teléfono). Continuo, con texto en vivo mientras hablas y la frase cerrada cuando terminas (Android 13+).
// Decisión del usuario: todo local, nada en la nube. Si el paquete de español sin conexión no está, se le dice cómo bajarlo.
// ============================================================
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export interface EscuchaEventos {
  /** lo que va diciendo (se corrige mientras habla) */
  parcial: (texto: string) => void;
  /** una frase terminada (silencio al final) */
  frase: (texto: string) => void;
  /** empezó a sonar algo (antes de que haya texto) */
  inicioHabla?: () => void;
  /** nivel del micrófono, de -2 a 10 (para el ícono) */
  volumen?: (v: number) => void;
  error?: (codigo: string, mensaje: string) => void;
}

const PREFERIDOS = ['es-CL', 'es-US', 'es-419', 'es-MX', 'es-ES'];
const SERVICIO_EN_APARATO = 'com.google.android.as';

export type Preparacion = { ok: true; idioma: string } | { ok: false; motivo: string; accion?: 'permiso' | 'paquete' | 'android' };

/** ¿Se puede escuchar en el aparato y en español? (permiso, Android 13+, paquete sin conexión) */
export async function prepararEscucha(): Promise<Preparacion> {
  try {
    const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!p.granted) return { ok: false, motivo: 'Necesito el permiso del micrófono para conversar.', accion: 'permiso' };
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      return { ok: false, motivo: 'Este teléfono no tiene reconocimiento de voz en el aparato (Android 13 o más nuevo).', accion: 'android' };
    }
    const { installedLocales, locales } = await ExpoSpeechRecognitionModule.getSupportedLocales({ androidRecognitionServicePackage: SERVICIO_EN_APARATO })
      .catch(() => ({ installedLocales: [] as string[], locales: [] as string[] }));
    const instalados = installedLocales.map((l) => l.replace('_', '-'));
    const idioma = PREFERIDOS.find((l) => instalados.includes(l)) ?? instalados.find((l) => l.toLowerCase().startsWith('es'));
    if (!idioma) {
      const hay = locales.some((l) => l.toLowerCase().startsWith('es'));
      return {
        ok: false, accion: 'paquete',
        motivo: hay
          ? 'Falta el paquete de español sin conexión. En Ajustes → Google → Todos los servicios → Voz → Idiomas sin conexión, descarga «Español». Después vuelve a llamar.'
          : 'El reconocimiento en el aparato no tiene español todavía. Revisa Ajustes → Google → Voz → Idiomas sin conexión.',
      };
    }
    return { ok: true, idioma };
  } catch (e: any) {
    return { ok: false, motivo: `No pude preparar el micrófono (${e?.message ?? e}).` };
  }
}

/** Una escucha continua: se reinicia sola si Android la corta (silencio largo, error pasajero) mientras esté activa */
export class Escucha {
  private activa = false;
  private subs: Array<{ remove: () => void }> = [];
  private idioma = 'es-CL';
  constructor(private readonly ev: EscuchaEventos) {}

  iniciar(idioma: string): void {
    this.idioma = idioma;
    if (this.activa) return;
    this.activa = true;
    const M: any = ExpoSpeechRecognitionModule;
    this.subs = [
      M.addListener('result', (e: any) => {
        const texto = String(e?.results?.[0]?.transcript ?? '').trim();
        if (!texto) return;
        if (e.isFinal) this.ev.frase(texto); else this.ev.parcial(texto);
      }),
      M.addListener('speechstart', () => this.ev.inicioHabla?.()),
      M.addListener('volumechange', (e: any) => this.ev.volumen?.(Number(e?.value ?? -2))),
      M.addListener('error', (e: any) => {
        // «no-speech» y «speech-timeout» son silencios: se vuelve a escuchar sin molestar
        if (e?.error !== 'no-speech' && e?.error !== 'speech-timeout' && e?.error !== 'aborted') this.ev.error?.(String(e?.error ?? 'error'), String(e?.message ?? ''));
      }),
      M.addListener('end', () => { if (this.activa) setTimeout(() => this.arrancar(), 150); }),
    ];
    this.arrancar();
  }

  private arrancar(): void {
    if (!this.activa) return;
    try {
      ExpoSpeechRecognitionModule.start({
        lang: this.idioma,
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: true,
        addsPunctuation: true,
        maxAlternatives: 1,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
        // fin de frase con ~0,8 s de silencio (lo que tarda en darse cuenta de que terminaste, antes de mandarle el turno a Hestia)
        androidIntentOptions: {
          EXTRA_SEGMENTED_SESSION: 'android.speech.extras.SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS',
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 800,
        },
      } as any);
    } catch (e: any) {
      this.ev.error?.('start', String(e?.message ?? e));
    }
  }

  detener(): void {
    this.activa = false;
    for (const s of this.subs) { try { s.remove(); } catch {} }
    this.subs = [];
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
  }
}

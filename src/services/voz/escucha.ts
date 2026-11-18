// ============================================================
// Hestia por voz (J1, 2026-11-16): el reconocimiento de voz del propio teléfono, en el aparato (sin internet: el audio no sale
// del teléfono). Continuo, con texto en vivo mientras hablas y la frase cerrada cuando terminas (Android 13+).
// Decisión del usuario: todo local, nada en la nube. Si el paquete de español sin conexión no está, se le dice cómo bajarlo.
// ============================================================
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface EscuchaEventos {
  /** lo que va diciendo (se corrige mientras habla) */
  parcial: (texto: string) => void;
  /** una frase terminada (silencio al final). `ms`: desde que empezó a oírla (0 si no se supo) */
  frase: (texto: string, ms: number) => void;
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

/**
 * Las formas de usar el reconocimiento de Android (2026-11-17: en su Pixel 7, la de J1 daba «client» una y otra vez y la llamada
 * no oía nada; sin el teléfono a mano no se pudo ver por qué). Se prueba en orden y se queda con la primera que entrega texto:
 *  - «continuo»: el modo continuo tal como lo arma expo-speech-recognition (la sesión dura mientras dura el micrófono);
 *  - «frase»: una frase por sesión, y se vuelve a escuchar al terminar (lo clásico de Android);
 *  - «j1»: lo de J1 (continuo, pero la sesión termina con 0,8 s de silencio).
 * Todas en el aparato (sin internet: decisión del usuario).
 */
export const MODOS_ESCUCHA = ['continuo', 'frase', 'j1'] as const;
export type ModoEscucha = (typeof MODOS_ESCUCHA)[number];
/** Errores que, repetidos sin oír nada entre medio, dicen que esa forma no sirve en este teléfono */
const DUROS = new Set(['client', 'busy', 'audio-capture', 'network', 'service-not-allowed', 'start', 'interrupted']);
const CLAVE_MODO = 'hestia_modo_escucha';

/** Una escucha continua: se reinicia sola si Android la corta (silencio largo, error pasajero) mientras esté activa */
export class Escucha {
  private activa = false;
  private subs: Array<{ remove: () => void }> = [];
  private idioma = 'es-CL';
  private modo: ModoEscucha = 'continuo';
  private seguidos = 0;
  private oyo = false;
  private reintento: ReturnType<typeof setTimeout> | null = null;
  /** L6: cuándo empezó a oír la frase que está en curso (para saber cuánto audio es de ella) */
  private inicioFrase = 0;
  /**
   * L6: guardar el audio mientras reconoce (recordingOptions.persist: un PCM temporal en el caché de Eris), para que Hestia
   * Manos revise si cada frase la dijiste tú. Solo en el modo continuo y Android 13+ (en las otras formas cambia cómo se cierra
   * la frase); se borra al colgar (HestiaManos.frasesLimpiar).
   */
  grabar = false;
  /** ¿Se está guardando el audio de las frases? */
  get grabando(): boolean { return this.grabar && this.modo === 'continuo' && Number(Platform.Version) >= 33; }
  constructor(private readonly ev: EscuchaEventos & {
    /** lo que pasa con el reconocimiento (va al registro del servidor: así se ve qué falla sin el teléfono conectado) */
    diag?: (d: Record<string, unknown>) => void;
    /** ninguna forma sirvió */
    rendida?: (codigo: string, mensaje: string) => void;
  }) {}

  async iniciar(idioma: string): Promise<void> {
    this.idioma = idioma;
    if (this.activa) return;
    this.activa = true;
    // la forma que funcionó la última vez
    try { const m = await AsyncStorage.getItem(CLAVE_MODO); if (m && (MODOS_ESCUCHA as readonly string[]).includes(m)) this.modo = m as ModoEscucha; } catch {}
    if (!this.activa) return;
    const M: any = ExpoSpeechRecognitionModule;
    this.subs = [
      M.addListener('result', (e: any) => {
        const texto = String(e?.results?.[0]?.transcript ?? '').trim();
        if (!texto) return;
        this.funciona();
        if (e.isFinal) {
          const ms = this.inicioFrase ? Date.now() - this.inicioFrase : 0;
          this.inicioFrase = 0;
          this.ev.frase(texto, ms);
        } else {
          if (!this.inicioFrase) this.inicioFrase = Date.now();
          this.ev.parcial(texto);
        }
      }),
      M.addListener('speechstart', () => this.ev.inicioHabla?.()),
      M.addListener('volumechange', (e: any) => this.ev.volumen?.(Number(e?.value ?? -2))),
      M.addListener('error', (e: any) => {
        const codigo = String(e?.error ?? 'error'), mensaje = String(e?.message ?? '');
        // «no-speech» y «speech-timeout» son silencios: se vuelve a escuchar sin molestar
        if (codigo === 'no-speech' || codigo === 'speech-timeout' || codigo === 'aborted') return;
        this.fallo(codigo, mensaje, e?.code);
      }),
      M.addListener('end', () => this.programar(this.modo === 'frase' ? 250 : 150)),
    ];
    this.ev.diag?.({ evento: 'inicio', modo: this.modo, idioma });
    this.arrancar();
  }

  /** Oyó algo: esta forma sirve (se recuerda) */
  private funciona(): void {
    this.seguidos = 0;
    if (this.oyo) return;
    this.oyo = true;
    this.ev.diag?.({ evento: 'oye', modo: this.modo });
    AsyncStorage.setItem(CLAVE_MODO, this.modo).catch(() => {});
  }

  private fallo(codigo: string, mensaje: string, num?: unknown): void {
    this.ev.error?.(codigo, mensaje);
    if (!DUROS.has(codigo) || this.oyo) { this.ev.diag?.({ evento: 'error', modo: this.modo, codigo, mensaje, num }); return; }
    this.seguidos++;
    this.ev.diag?.({ evento: 'error', modo: this.modo, codigo, mensaje, num, seguidos: this.seguidos });
    if (this.seguidos < 2) return;
    // dos seguidos sin oír nada: la forma siguiente
    const i = MODOS_ESCUCHA.indexOf(this.modo);
    const prob = MODOS_ESCUCHA.slice(i + 1);
    if (!prob.length) {
      this.ev.diag?.({ evento: 'rendida', codigo, mensaje });
      this.activa = false;
      this.ev.rendida?.(codigo, mensaje);
      AsyncStorage.removeItem(CLAVE_MODO).catch(() => {});
      return;
    }
    this.modo = prob[0];
    this.seguidos = 0;
    this.ev.diag?.({ evento: 'cambio', modo: this.modo });
  }

  private programar(ms: number): void {
    if (!this.activa) return;
    if (this.reintento) clearTimeout(this.reintento);
    // después de varios errores, más calma (Android no se recupera si se le pide de nuevo al tiro)
    this.reintento = setTimeout(() => { this.reintento = null; this.arrancar(); }, this.seguidos ? 700 : ms);
  }

  private arrancar(): void {
    if (!this.activa) return;
    const base = {
      lang: this.idioma, interimResults: true, requiresOnDeviceRecognition: true, addsPunctuation: true, maxAlternatives: 1,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
    };
    const porModo: Record<ModoEscucha, Record<string, unknown>> = {
      continuo: {
        continuous: true, androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 800 },
        // L6: el audio de las frases, para revisar que sean tuyas (ver `grabar`)
        ...(this.grabando ? { recordingOptions: { persist: true, outputFileName: 'hestia_llamada.wav' } } : {}),
      },
      frase: { continuous: false },
      // fin de frase con ~0,8 s de silencio (lo que tarda en darse cuenta de que terminaste, antes de mandarle el turno a Hestia)
      j1: {
        continuous: true,
        androidIntentOptions: {
          EXTRA_SEGMENTED_SESSION: 'android.speech.extras.SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS',
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 800,
        },
      },
    };
    try {
      ExpoSpeechRecognitionModule.start({ ...base, ...porModo[this.modo] } as any);
    } catch (e: any) {
      this.fallo('start', String(e?.message ?? e));
    }
  }

  detener(): void {
    this.activa = false;
    if (this.reintento) clearTimeout(this.reintento);
    this.reintento = null;
    for (const s of this.subs) { try { s.remove(); } catch {} }
    this.subs = [];
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
  }
}

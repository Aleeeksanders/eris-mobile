// ============================================================
// Hestia por voz (J1, 2026-11-16): lo que dice Hestia llega frase por frase (`voz_audio`) y suena uno tras otro, en el orden en
// que llega. «Callar» (la interrumpiste) para lo que suena, vacía la cola y descarta lo que todavía llegue de ese turno.
// ============================================================
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

export interface PiezaVoz { turno: number; seq: number; wav: string; texto: string }

export class Reproductor {
  private cola: PiezaVoz[] = [];
  private player: AudioPlayer | null = null;
  private sub: { remove: () => void } | null = null;
  private archivo: File | null = null;
  /** lo de este turno o anteriores ya no suena (se cortó) */
  private cortadoHasta = 0;
  constructor(private readonly alCambiar: (hablando: boolean, texto?: string) => void) {}

  get hablando(): boolean { return !!this.player || this.cola.length > 0; }

  agregar(p: PiezaVoz): void {
    if (p.turno <= this.cortadoHasta) return;
    this.cola.push(p);
    if (!this.player) this.siguiente();
  }

  /** Para todo lo que suena y lo que viene de `turno` (y de antes) */
  callar(turno: number): void {
    this.cortadoHasta = Math.max(this.cortadoHasta, turno);
    this.cola = [];
    this.soltar();
    this.alCambiar(false);
  }

  /**
   * Para lo que suena y lo que está en cola, SIN descartar lo que todavía llegue de este turno (J2: contestaste «sí» encima de
   * la pregunta de una aprobación; la respuesta que viene después igual tiene que sonar).
   */
  saltar(): void {
    this.cola = [];
    this.soltar();
    this.alCambiar(false);
  }

  private siguiente(): void {
    const p = this.cola.shift();
    if (!p) { this.soltar(); this.alCambiar(false); return; }
    try {
      const f = new File(Paths.cache, `hestia_voz_${p.turno}_${p.seq}_${Date.now()}.wav`);
      f.write(p.wav, { encoding: 'base64' });
      this.soltar();
      this.archivo = f;
      this.player = createAudioPlayer({ uri: f.uri });
      this.sub = (this.player as any).addListener('playbackStatusUpdate', (s: any) => {
        if (s?.didJustFinish) this.siguiente();
      });
      this.player.play();
      this.alCambiar(true, p.texto);
    } catch {
      // un trozo que no se pudo reproducir no detiene el resto
      this.soltar();
      this.siguiente();
    }
  }

  private soltar(): void {
    try { this.sub?.remove(); } catch {}
    try { this.player?.pause(); this.player?.remove(); } catch {}
    try { this.archivo?.delete(); } catch {}
    this.sub = null; this.player = null; this.archivo = null;
  }

  cerrar(): void { this.cola = []; this.soltar(); }
}

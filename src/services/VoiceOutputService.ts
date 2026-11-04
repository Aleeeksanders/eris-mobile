import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wsManager } from './WebSocketManager';

const TTS_ENABLED_KEY = 'eris_tts_enabled';

// La voz de Eris NO es la del teléfono (expo-speech, robótica) — es Piper,
// un motor neuronal que corre en el backend junto a Ollama/Whisper. Este
// servicio solo pide la síntesis por WS y reproduce el WAV que vuelve;
// toda la generación de audio pasa por PiperProvider.ts en el backend.
// Una sola voz (Daniela, Argentina, femenina) — Eris es la diosa del caos,
// no le entra una voz masculina, así que no hay selector.
class VoiceOutputService {
  private player: AudioPlayer | null = null;

  async isEnabled(): Promise<boolean> {
    return (await AsyncStorage.getItem(TTS_ENABLED_KEY)) === 'true';
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(TTS_ENABLED_KEY, enabled ? 'true' : 'false');
    if (!enabled) this.stop();
  }

  /** Pide al backend que sintetice `text` — la respuesta llega como mensaje WS 'tts_audio'. */
  requestSpeak(text: string): void {
    const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/[*_#`]/g, '').trim();
    if (!clean) return;
    wsManager.sendMessage({ type: 'tts_request', text: clean });
  }

  /** Recibe el WAV en base64 (mensaje 'tts_audio') y lo reproduce. */
  async playAudioBase64(audioBase64: string): Promise<void> {
    try {
      const file = new File(Paths.cache, `eris_tts_${Date.now()}.wav`);
      file.write(audioBase64, { encoding: 'base64' });
      this.stop();
      this.player = createAudioPlayer({ uri: file.uri });
      this.player.play();
    } catch {
      // Reproducción best-effort — si falla, el texto ya está visible en el chat.
    }
  }

  stop(): void {
    try {
      this.player?.pause();
      this.player?.remove();
    } catch {}
    this.player = null;
  }
}

export const voiceOutputService = new VoiceOutputService();

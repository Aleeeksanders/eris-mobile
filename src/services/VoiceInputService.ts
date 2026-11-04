import { File } from 'expo-file-system';
import { requestRecordingPermissionsAsync, getRecordingPermissionsAsync } from 'expo-audio';
import { wsManager } from './WebSocketManager';

// La grabación en sí vive en ChatScreen.tsx vía el hook useAudioRecorder
// (expo-audio exige que el AudioRecorder se cree con un hook para manejar
// su ciclo de vida — no hay una API de "crear grabador" fuera de un
// componente). Este módulo cubre lo que SÍ es lógica pura: permisos y el
// empaquetado/envío del archivo grabado al backend.

export async function ensureMicPermission(): Promise<boolean> {
  const current = await getRecordingPermissionsAsync();
  if (current.granted) return true;
  const res = await requestRecordingPermissionsAsync();
  return res.granted;
}

/**
 * Lee el archivo grabado como base64 y lo manda al backend por el WS ya
 * abierto. El texto transcripto vuelve como mensaje 'voice_transcribed' y,
 * si hay algo que decir, Eris responde por el mismo camino de siempre
 * ('thinking' → 'token'* → 'stream_end') — indistinguible de un mensaje tipeado.
 */
export async function sendRecordingForTranscription(uri: string, mode: string): Promise<void> {
  const file = new File(uri);
  const audioBase64 = await file.base64();
  wsManager.sendMessage({
    type: 'voice_message',
    audioBase64,
    mimeType: 'audio/m4a',
    mode,
  });
}

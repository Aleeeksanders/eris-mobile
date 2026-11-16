import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, StatusBar,
  Animated, Easing, Pressable, Modal,
  Vibration, Clipboard, Alert, AppState, DeviceEventEmitter,
} from 'react-native';
import { KeyboardLiftView } from '../components/KeyboardLift';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon, Path, Line, Rect, Circle } from 'react-native-svg';
import Markdown from 'react-native-markdown-display';
import { useAudioRecorder, RecordingPresets, setAudioModeAsync } from 'expo-audio';
import { wsManager } from '../services/WebSocketManager';
import { queryForegroundService } from '../services/QueryForegroundService';
import { ErisPresence } from '../services/ErisPresence'; // la burbuja de dentro y la de fuera de la app muestran lo mismo
import { ensureMicPermission, sendRecordingForTranscription } from '../services/VoiceInputService';
import { voiceOutputService } from '../services/VoiceOutputService';
import { T } from '../config/design';
import { usePersona, personaName } from '../config/persona';
import { parseActionChips, ActionChips } from '../utils/actionChips';
import { tablesToLists, friendlyThinking } from '../utils/chatFormat';
import ChatStarters, { placeholderExamples } from '../components/ChatStarters';
import { AuthStorage } from '../services/AuthStorage';
import { ModuleStorage } from '../services/ModuleStorage';
import HestiaLlamada from './HestiaLlamada';

type Mode = 'auto' | 'flash' | 'deep';

const PROJECT_EMOJIS = ['📁', '💼', '🎯', '🚀', '💡', '📚', '🏋️', '💰', '🎨', '🧠'];

// Instrucciones fijas por proyecto: Eris las recibe en CADA mensaje de cualquier chat del proyecto
// (no se pierden cuando la conversación se resume). Mismo límite que el backend.
const MAX_INSTRUCTIONS = 1500;
const INSTRUCTION_TEMPLATES: Array<{ label: string; text: string }> = [
  {
    label: '💰 Experto en finanzas',
    text: 'Actúa como un experto en finanzas personales chilenas: presupuesto, ahorro, deudas e inversión básica. Explica con ejemplos en pesos chilenos, pregunta lo que falte antes de aconsejar y advierte los riesgos. No prometas rentabilidades.',
  },
  {
    label: '🏋️ Entrenador',
    text: 'Actúa como un entrenador personal: propone rutinas claras con series y repeticiones, adapta todo a mi nivel y mis lesiones, y prioriza la técnica y la recuperación por sobre la intensidad.',
  },
  {
    label: '🥗 Nutricionista',
    text: 'Actúa como una nutricionista: da opciones concretas con porciones, respeta siempre mis restricciones y explica en simple por qué cada opción me conviene. No hagas diagnósticos ni ajustes de medicamentos.',
  },
];

// Ícono dibujado (no emoji) para el toggle de voz — algunos Android no
// traen el glifo 🔇 en su fuente del sistema y lo muestran como un cuadrito
// vacío/roto. Un SVG nunca depende de la fuente del teléfono.
function SpeakerIcon({ on, color = T.text, size = 18 }: { on: boolean; color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {on ? (
        <>
          <Path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke={color} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Line x1="22" x2="16" y1="9" y2="15" stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Line x1="16" x2="22" y1="9" y2="15" stroke={color} strokeWidth={2} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

// Llamar a Hestia por voz (J1, 2026-11-16): un teléfono dibujado, por lo mismo que SpeakerIcon
function PhoneIcon({ color = T.text, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Mismo problema que SpeakerIcon: "⏻" (símbolo Unicode de standby, no es
// un emoji real) no está en la fuente de muchos Android y se veía como un
// cuadrito vacío.
function PowerIcon({ color = T.textMuted, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2v10" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M18.4 6.6a9 9 0 1 1-12.77.04" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// El resto de estos íconos usaba símbolos del bloque Unicode "Miscellaneous
// Technical" (☰ ↓ ⏺ ⏹, U+2300-23FF) — el mismo bloque que "⏻", que ya
// resultó no tener glifo en este teléfono. Se pasan todos a SVG de una vez
// en vez de esperar a que se reporten uno por uno.
function HamburgerIcon({ color = T.text, size = 22 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="3" y1="6" x2="21" y2="6" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1="3" y1="18" x2="21" y2="18" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function ChevronDownIcon({ color = T.text, size = 24 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function RecordIcon({ color = '#000', size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="7" fill={color} />
    </Svg>
  );
}

function StopIcon({ color = '#000', size = 16 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="6" y="6" width="12" height="12" rx="2" fill={color} />
    </Svg>
  );
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  modeUsed?: string;
  isComplete: boolean;
  /** dictado: lo que Whisper oyó, si Eris lo corrigió (se muestra chico debajo, para ver qué cambió) */
  heard?: string;
}

// ─── Typing Indicator ───────────────────────────────────────
function TypingDots() {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      )
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={s.dotsRow}>
      {dots.map((dot, i) => (
        <Animated.View key={i} style={[s.dot, { opacity: dot, transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]} />
      ))}
    </View>
  );
}

// ─── Message Bubble ─────────────────────────────────────────
function MessageBubble({ msg, onSendText }: { msg: ChatMessage, onSendText?: (txt: string) => void }) {
  const isUser = msg.role === 'user';
  const [thinkExpanded, setThinkExpanded] = useState(false);
  const thinkAnim = useRef(new Animated.Value(0)).current;

  const toggleThink = () => {
    const toVal = thinkExpanded ? 0 : 1;
    Animated.timing(thinkAnim, {
      toValue: toVal, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    setThinkExpanded(!thinkExpanded);
  };

  const handleLongPress = () => {
    Vibration.vibrate(40);
    Clipboard.setString(msg.content);
    Alert.alert('Copiado', 'Mensaje copiado al portapapeles.', [{ text: 'OK' }]);
  };

  return (
    <View style={[s.msgWrap, isUser ? s.msgWrapUser : s.msgWrapBot]}>
      {!isUser && (
        <View style={s.botAvatar}>
          <Text style={s.botAvatarText}>⚡</Text>
        </View>
      )}
      <Pressable
        style={[s.bubble, isUser ? s.bubbleUser : s.bubbleBot]}
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
        {/* Bloque de pensamiento colapsable */}
        {msg.thinking ? (
          <View style={s.thinkBlock}>
            <TouchableOpacity onPress={toggleThink} style={s.thinkHeader}>
              <Text style={s.thinkLabel}>
                {msg.isComplete ? `🧠 Razón interna` : '🧠 Pensando...'}
              </Text>
              <Text style={s.thinkChevron}>{thinkExpanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {thinkExpanded && (
              <Text style={s.thinkText}>{friendlyThinking(msg.thinking)}</Text>
            )}
          </View>
        ) : null}

        {/* Contenido */}
        {!msg.isComplete && !msg.content && !msg.thinking ? (
          <TypingDots />
        ) : (() => {
          let text = msg.content || '';
          let actions: string[] = [];
          if (!isUser) {
            const parsed = parseActionChips(text);
            text = parsed.cleanText;
            actions = parsed.actions;
          }

          return (
            <>
              {isUser ? (
                <>
                  <Text style={[s.msgText, s.msgTextUser]}>{text}</Text>
                  {msg.heard ? <Text style={s.heardText}>🎙 Oí «{msg.heard}»</Text> : null}
                </>
              ) : (
                <Markdown style={mdStyles}>{tablesToLists(text)}</Markdown>
              )}
              {onSendText && <ActionChips actions={actions} onSendText={onSendText} />}
            </>
          );
        })()}

        {/* Badge de modo */}
        {msg.modeUsed && !isUser && (
          <View style={[s.modeBadge, msg.modeUsed === 'flash' ? s.modeBadgeFlash : s.modeBadgeDeep]}>
            <Text style={s.modeBadgeText}>{msg.modeUsed === 'flash' ? '⚡ Flash' : '🧠 Deep'}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────
export default function ChatScreen({
  route,
  onLogout,
  onClose,
  pendingMessage: pendingMessageProp,
  axsMode = false,
}: {
  route?: any;
  onLogout?: () => void;
  onClose?: () => void;
  pendingMessage?: string;
  /** Modo AXS Executive (Perfil): solo ahí aparecen los atajos de AXS (reporte, recursos, tareas). */
  axsMode?: boolean;
}) {
  const persona = usePersona(); // Eris, o Hestia en el Modo AXS Executive
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // onLogout puede venir directo (props) o dentro de route.params (navigation)
  const handleLogout = onLogout || route?.params?.onLogout;
  const [status, setStatus] = useState<string>('disconnected');
  const [mode, setMode] = useState<Mode>('auto');
  const [processing, setProcessing] = useState(false);
  
  // Proyectos y Conversaciones
  const [showDrawer, setShowDrawer] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState('');
  const [role, setRole] = useState<string>('eris');
  const isAdmin = role === 'ikaros';
  // Hestia por voz (J1): la llamada a pantalla completa
  const [llamada, setLlamada] = useState(false);
  // J3: mantener presionada la burbuja de Hestia (fuera de la app) llama, si está en Modo AXS
  const llamarRef = useRef({ axsMode, isAdmin });
  llamarRef.current = { axsMode, isAdmin };
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('HESTIA_LLAMAR', () => {
      if (llamarRef.current.axsMode && llamarRef.current.isAdmin) setLlamada(true);
    });
    return () => sub.remove();
  }, []);

  // Ejemplos del chat vacío y del cuadro de texto: solo de los módulos que usa (paso 4 del plan para hacerla digerible)
  const [usedModules, setUsedModules] = useState({ finanzas: false, toji: false });
  useEffect(() => {
    const apply = (m: string[]) => setUsedModules({ finanzas: m.includes('finanzas'), toji: m.includes('toji') });
    AuthStorage.getCredentials().then((c) => (c?.profileId ? ModuleStorage.get(c.profileId) : null)).then((m) => { if (m) apply(m); }).catch(() => {});
    const sub = DeviceEventEmitter.addListener('MODULES_CHANGED', (m: string[]) => apply(Array.isArray(m) ? m : []));
    return () => sub.remove();
  }, []);
  const inputRef = useRef<TextInput>(null);
  // El cuadro vacío va mostrando ejemplos ("Prueba: «anota 2 huevos revueltos»")
  const [phIdx, setPhIdx] = useState(0);
  useEffect(() => {
    if (axsMode || inputText) return;
    const id = setInterval(() => setPhIdx((i) => i + 1), 4500);
    return () => clearInterval(id);
  }, [axsMode, inputText]);
  const examples = placeholderExamples(usedModules);
  const placeholder = axsMode ? 'Comando ejecutivo...' : phIdx % (examples.length + 1) === 0 ? `Escríbele a ${persona.name}...` : examples[(phIdx % (examples.length + 1)) - 1];

  // Crear/renombrar/borrar/mover proyectos y chats
  const [newProjectModal, setNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectEmoji, setNewProjectEmoji] = useState(PROJECT_EMOJIS[0]);
  const [newProjectInstructions, setNewProjectInstructions] = useState('');
  // Editor de las instrucciones de un proyecto existente
  const [instructionsModal, setInstructionsModal] = useState<{ id: string; name: string; value: string } | null>(null);
  const [actionSheet, setActionSheet] = useState<{ kind: 'chat' | 'project'; id: string; name: string } | null>(null);
  const [renameModal, setRenameModal] = useState<{ kind: 'chat' | 'project'; id: string; value: string } | null>(null);
  const [moveModal, setMoveModal] = useState<{ conversationId: string } | null>(null);
  // Carpeta "Chats temporales": cerrada por defecto (son los chats cortos; ver el servidor, convList)
  const [tempOpen, setTempOpen] = useState(false);

  // Voz — dictado (STT vía Whisper en el backend) y respuesta hablada (TTS vía
  // Piper en el backend, voz Daniela — NO es la voz robótica del teléfono).
  const [isRecording, setIsRecording] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // Ref espejo de ttsEnabled — el listener del WS se suscribe una sola vez
  // (useEffect con deps []), así que leer el state directo ahí adentro
  // capturaría el valor inicial para siempre. El ref siempre está al día.
  const ttsEnabledRef = useRef(false);
  useEffect(() => {
    voiceOutputService.isEnabled().then(v => { setTtsEnabled(v); ttsEnabledRef.current = v; });
  }, []);

  const scrollRef = useRef<ScrollView>(null);
  
  // Combina prop directa (overlay persistente) con route.params (navegación legacy)
  const pendingMessage = pendingMessageProp ?? route?.params?.pendingMessage;
  const lastSentMsg = useRef<string | undefined>(undefined);

  useEffect(() => {
    const unsubStatus = wsManager.subscribeStatus((st) => setStatus(st));

    const unsubMsg = wsManager.subscribeMessage((payload) => {
      switch (payload.type) {
        case 'connected':
        case 'chat_switched':
          // Conexión nueva (se cortó la red, se reinició el servidor…): la respuesta que se esperaba nunca va a llegar por
          // este socket. Antes la app quedaba en "procesando" para siempre (micrófono deshabilitado, "Detener" sin efecto y la
          // notificación "Pensando…" pegada). La conversación completa llega en `history`, más abajo.
          if (payload.type === 'connected') { setProcessing(false); queryForegroundService.stopThinking(); }
          if (payload.sessionId) setActiveSession(payload.sessionId);
          if (payload.projects) setProjects(payload.projects);
          if (payload.conversations) setConversations(payload.conversations);
          if (payload.role) setRole(payload.role);

          if (payload.history) {
            const loaded = payload.history
              .filter((m: any) => m.role === 'user' || m.role === 'assistant')
              .map((m: any) => ({
                id: m.id || Math.random().toString(),
                role: m.role,
                content: m.content?.replace(/<think>[\s\S]*?<\/think>/g, '').trim() || '',
                isComplete: true,
              }));
            setMessages(loaded);
          }
          break;
          
        case 'conversations_updated':
        case 'project_created':
          if (payload.projects) setProjects(payload.projects);
          if (payload.conversations) setConversations(payload.conversations);
          break;

        case 'thinking':
          setProcessing(true);
          queryForegroundService.startThinking();
          ErisPresence.set('thinking'); // fuera de la app: la burbuja late mientras Eris responde
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && !last.isComplete) return prev;
            return [...prev, { id: Math.random().toString(), role: 'assistant', content: '', isComplete: false }];
          });
          break;

        case 'thinking_token':
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && !last.isComplete) {
              last.thinking = (last.thinking || '') + payload.content;
              return [...updated];
            }
            return [...prev, { id: Math.random().toString(), role: 'assistant', content: '', thinking: payload.content, isComplete: false }];
          });
          break;

        case 'token':
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && !last.isComplete) {
              last.content += payload.content;
              return [...updated];
            }
            return [...prev, { id: Math.random().toString(), role: 'assistant', content: payload.content, isComplete: false }];
          });
          break;

        case 'stream_end':
        case 'done':
          setProcessing(false);
          queryForegroundService.stopThinking();
          // Si estás fuera de la app, la burbuja muestra un punto: la respuesta quedó lista (al tocarla, vas al chat)
          ErisPresence.set(AppState.currentState === 'active' ? 'idle' : 'reply');
          if (ttsEnabledRef.current && payload.content) voiceOutputService.requestSpeak(payload.content);
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last) {
              last.isComplete = true;
              last.modeUsed = payload.modeUsed;
              if (payload.content) {
                last.content = payload.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
              }
            }
            return [...updated];
          });
          break;

        case 'voice_transcribed':
          // Texto reconocido por Whisper — se muestra como si el usuario lo
          // hubiera tipeado. Si viene vacío, no se detectó habla; no mostramos nada.
          // Si Eris corrigió lo oído ("Te distra… chocopiqui" → "Registra… Chocapic"), llega también `heard`.
          if (payload.text) {
            setMessages(prev => [...prev, {
              id: Math.random().toString(), role: 'user', content: payload.text, isComplete: true,
              ...(typeof payload.heard === 'string' && payload.heard ? { heard: payload.heard } : {}),
            }]);
          }
          break;

        case 'tts_audio':
          if (payload.audioBase64) voiceOutputService.playAudioBase64(payload.audioBase64);
          break;

        case 'stopped':
          // Consulta cancelada por el usuario — cerramos la burbuja con lo que
          // ya se alcanzó a generar (los tokens ya llegaron vía 'token' antes
          // del stop, así que no pisamos con contenido vacío salvo que el
          // servidor mande contenido parcial explícito).
          setProcessing(false);
          queryForegroundService.stopThinking();
          ErisPresence.set('idle');
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last) {
              last.isComplete = true;
              if (payload.content) {
                last.content = payload.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
              }
            }
            return [...updated];
          });
          break;

        case 'error':
          // Antes esto se ignoraba silenciosamente — un error de transcripción
          // de voz (u otro) dejaba la app sin responder nada, sin ninguna pista
          // de qué pasó. Ahora al menos se ve un aviso y se libera el estado.
          setProcessing(false);
          queryForegroundService.stopThinking();
          ErisPresence.set('idle');
          if (payload.message) Alert.alert(personaName(), payload.message);
          break;
      }
    });

    wsManager.connect();

    // Si la conexión ya estaba activa al montar (ej: reboot con sesión existente),
    // el evento 'connected' ya fue emitido antes de que suscribiéramos.
    // Solicitamos un refresh para recibir el estado de sesión actual.
    if (wsManager.getStatus() === 'connected') {
      wsManager.sendMessage({ type: 'refresh' });
    }

    return () => { unsubStatus(); unsubMsg(); };
  }, []);

  // Enviar mensaje de coaching de Toji (o de HomeScreen) cuando el prop cambia
  useEffect(() => {
    if (pendingMessage && pendingMessage !== lastSentMsg.current) {
      lastSentMsg.current = pendingMessage;
      const msg = pendingMessage;
      const timer = setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Math.random().toString(),
          role: 'user',
          content: msg,
          isComplete: true,
        }]);
        wsManager.sendMessage({ type: 'message', content: msg, mode });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [pendingMessage]);

  // Sin conexión, el mensaje se descartaba en silencio (wsManager.sendMessage solo avisaba en consola) pero la burbuja
  // aparecía como enviada: "Eris no responde". Ahora queda escrito en el cuadro y se avisa.
  const ensureOnline = (): boolean => {
    if (wsManager.getStatus() === 'connected') return true;
    Alert.alert(personaName(), 'Sin conexión con el servidor. Estoy reintentando; tu mensaje quedó escrito para que lo envíes apenas vuelva.');
    return false;
  };

  const sendMessage = () => {
    const text = inputText.trim();
    if (!text || processing || !ensureOnline()) return;
    Vibration.vibrate(30);
    setMessages(prev => [...prev, { id: Math.random().toString(), role: 'user', content: text, isComplete: true }]);
    wsManager.sendMessage({ type: 'message', content: text, mode });
    setInputText('');
  };

  const sendText = (text: string) => {
    if (!text.trim() || processing || !ensureOnline()) return;
    Vibration.vibrate(30);
    setMessages(prev => [...prev, { id: Math.random().toString(), role: 'user', content: text.trim(), isComplete: true }]);
    wsManager.sendMessage({ type: 'message', content: text.trim(), mode });
  };

  const stopQuery = () => {
    Vibration.vibrate(30);
    wsManager.sendMessage({ type: 'stop' });
  };

  const toggleRecording = async () => {
    if (isRecording) {
      Vibration.vibrate(30);
      setIsRecording(false);
      await recorder.stop();
      if (recorder.uri) {
        sendRecordingForTranscription(recorder.uri, mode).catch(() => {
          Alert.alert(personaName(), 'No pude enviar el audio grabado.');
        });
      }
      return;
    }

    const granted = await ensureMicPermission();
    if (!granted) {
      Alert.alert('Micrófono', 'Eris necesita acceso al micrófono para el dictado por voz.');
      return;
    }

    try {
      await setAudioModeAsync({ allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      Vibration.vibrate(30);
      setIsRecording(true);
    } catch {
      Alert.alert(personaName(), 'No pude iniciar la grabación.');
    }
  };

  const toggleTts = () => {
    Vibration.vibrate(20);
    const next = !ttsEnabled;
    setTtsEnabled(next);
    ttsEnabledRef.current = next;
    voiceOutputService.setEnabled(next);
  };

  const switchChat = (id: string) => {
    wsManager.sendMessage({ type: 'switch_chat', conversationId: id });
    setShowDrawer(false);
  };

  const newChat = (projectId?: string) => {
    wsManager.sendMessage({ type: 'new_chat', ...(projectId ? { projectId } : {}) });
    setShowDrawer(false);
  };

  // ─── Proyectos y chats — crear/renombrar/borrar/mover ────
  const createProject = () => {
    if (!newProjectName.trim()) return;
    wsManager.sendMessage({
      type: 'create_project', name: newProjectName.trim(), emoji: newProjectEmoji,
      ...(newProjectInstructions.trim() ? { instructions: newProjectInstructions.trim() } : {}),
    });
    setNewProjectModal(false);
    setNewProjectName('');
    setNewProjectInstructions('');
    setNewProjectEmoji(PROJECT_EMOJIS[0]);
  };

  const saveInstructions = () => {
    if (!instructionsModal) return;
    // "" borra las instrucciones (el backend interpreta el string vacío como "quitar")
    wsManager.sendMessage({ type: 'update_project', projectId: instructionsModal.id, instructions: instructionsModal.value.trim() });
    setInstructionsModal(null);
  };

  const confirmRename = () => {
    if (!renameModal || !renameModal.value.trim()) { setRenameModal(null); return; }
    if (renameModal.kind === 'project') {
      wsManager.sendMessage({ type: 'rename_project', projectId: renameModal.id, name: renameModal.value.trim() });
    } else {
      wsManager.sendMessage({ type: 'rename_chat', conversationId: renameModal.id, title: renameModal.value.trim() });
    }
    setRenameModal(null);
  };

  const moveChatToProject = (conversationId: string, projectId: string | null) => {
    wsManager.sendMessage({ type: 'assign_to_project', conversationId, projectId });
    setMoveModal(null);
  };

  const confirmDeleteFromSheet = () => {
    if (!actionSheet) return;
    const { kind, id, name } = actionSheet;
    setActionSheet(null);
    Alert.alert(
      kind === 'project' ? 'Borrar proyecto' : 'Borrar chat',
      kind === 'project'
        ? `¿Seguro que querés borrar "${name}"? Los chats adentro quedan sin proyecto, no se borran.`
        : `¿Seguro que querés borrar "${name}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar', style: 'destructive', onPress: () => {
            if (kind === 'project') wsManager.sendMessage({ type: 'delete_project', projectId: id });
            else wsManager.sendMessage({ type: 'delete_chat', conversationId: id });
          },
        },
      ]
    );
  };

  const statusColor = status === 'connected' ? '#22c55e' : status === 'connecting' ? '#f59e0b' : '#ef4444';

  const insets = useSafeAreaInsets();

  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          {/* App.tsx siempre monta el chat como overlay (con onClose), así que antes
              el menú de proyectos/chats nunca era alcanzable — se muestran los dos. */}
          {onClose && (
            <TouchableOpacity onPress={onClose} style={s.menuBtn}>
              <ChevronDownIcon />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowDrawer(true)} style={s.menuBtn}>
            <HamburgerIcon />
          </TouchableOpacity>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={s.headerTitle}>{persona.name.toUpperCase()}</Text>
        </View>
        <View style={s.headerRight}>
          <View style={[s.modeTag, mode === 'auto' ? s.modeTagAuto : mode === 'flash' ? s.modeTagFlash : s.modeTagDeep]}>
            <Text style={s.modeTagText}>
              {mode === 'auto' ? '🔮 AUTO' : mode === 'flash' ? '⚡ FLASH' : '🧠 DEEP'}
            </Text>
          </View>
          {/* Hestia por voz: solo en el Modo AXS Executive y para el rol ikaros (J1) */}
          {axsMode && isAdmin && (
            <TouchableOpacity onPress={() => setLlamada(true)} style={s.ttsBtn} accessibilityRole="button" accessibilityLabel="Llamar a Hestia por voz">
              <PhoneIcon color={T.accent} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={toggleTts} style={s.ttsBtn}>
            <SpeakerIcon on={ttsEnabled} color={ttsEnabled ? T.accent : T.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                'Cerrar sesión',
                '¿Seguro que quieres cerrar sesión?',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Cerrar sesión', style: 'destructive', onPress: handleLogout },
                ],
              );
            }}
            style={s.logoutBtn}
          >
            <PowerIcon />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={s.messageList}
          contentContainerStyle={s.messageListContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        >
          {/* Chat vacío: ejemplos para tocar (las preguntas se envían; lo que anota queda escrito para ajustarlo) */}
          {messages.length === 0 && !axsMode && (
            <ChatStarters
              personaName={persona.name}
              modules={usedModules}
              onSend={(t) => sendText(t)}
              onPrefill={(t) => { setInputText(t); setTimeout(() => inputRef.current?.focus(), 50); }}
            />
          )}
          {messages.length === 0 && axsMode && (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>⚡</Text>
              <Text style={s.emptyTitle}>{persona.name} lista</Text>
              <Text style={s.emptySubtitle}>
                {axsMode ? `Tu Jefa de Gabinete Soberana\nesperando órdenes` : `Pregúntame lo que quieras o anota\ncomida, agua, gastos y entrenos`}
              </Text>
              <View style={s.quickChips}>
                {/* Atajos de AXS solo en Modo AXS Executive; antes salían por rol, también en Eris normal */}
                {(axsMode && role === 'ikaros' ? [
                  { label: '📊 Reporte AXS', msg: `${persona.name}, genera un Reporte de Estatus AXS.` },
                  { label: '⚡ Recursos', msg: `${persona.name}, cómo están mis recursos del sistema?` },
                  { label: '📝 Nueva tarea', msg: `${persona.name}, abre el log de hoy y déjame anotar una tarea.` },
                ] : [
                  { label: '📊 Analizar métricas', msg: `${persona.name}, analiza mis métricas de hoy.` },
                  { label: '🥗 Registrar comida', msg: `${persona.name}, ayúdame a registrar lo que acabo de comer.` },
                  { label: '📝 Recordatorio', msg: `${persona.name}, crea un recordatorio para mí.` },
                ]).map(chip => (
                  <TouchableOpacity
                    key={chip.label}
                    style={s.chip}
                    onPress={() => { setInputText(chip.msg); }}
                  >
                    <Text style={s.chipText}>{chip.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={msg.id || i} msg={msg} onSendText={sendText} />
          ))}
        </ScrollView>

        {/* Auto / Flash / Deep: solo para administradores; para el resto "Auto" decide solo (menos cosas que entender) */}
        {isAdmin && (
        <View style={s.modeRow}>
          {(['auto', 'flash', 'deep'] as Mode[]).map(m => (
            <Pressable
              key={m}
              style={[s.modeBtn, mode === m && s.modeBtnActive, mode === m && (m === 'auto' ? s.modeBtnAutoActive : m === 'flash' ? s.modeBtnFlashActive : s.modeBtnDeepActive)]}
              onPress={() => setMode(m)}
            >
              <Text style={[s.modeBtnText, mode === m && s.modeBtnTextActive]}>
                {m === 'auto' ? '🔮 Auto' : m === 'flash' ? '⚡ Flash' : '🧠 Deep'}
              </Text>
            </Pressable>
          ))}
        </View>
        )}

        {/* Quick actions — registro rápido de comida/agua */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.quickRow}
          contentContainerStyle={s.quickRowContent}
        >
          <TouchableOpacity
            style={s.quickChip}
            onPress={() => setInputText('Registra: ')}
          >
            <Text style={s.quickChipText}>🍽️ Anotar comida</Text>
          </TouchableOpacity>
          {([250, 500, 750, 1000, 1500] as const).map(ml => (
            <TouchableOpacity
              key={ml}
              style={[s.quickChip, s.quickChipWater]}
              onPress={() => sendText(`Registra ${ml < 1000 ? `${ml}ml` : `${ml / 1000}L`} de agua`)}
              disabled={processing}
            >
              <Text style={s.quickChipText}>💧 {ml < 1000 ? `${ml}ml` : `${ml / 1000}L`}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={s.quickChip}
            onPress={() => sendText('¿Qué he comido hoy? Muéstrame mi log nutricional')}
            disabled={processing}
          >
            <Text style={s.quickChipText}>📋 Ver log</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Input */}
        <View style={[s.inputRow, processing && s.inputRowProcessing, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TextInput
            ref={inputRef}
            style={s.input}
            placeholder={placeholder}
            placeholderTextColor={T.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={4000}
            returnKeyType="default"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[s.sendBtn, s.micBtn, isRecording && s.micBtnActive]}
            onPress={toggleRecording}
            disabled={processing && !isRecording}
          >
            {isRecording ? <RecordIcon /> : <Text style={s.sendBtnText}>🎙️</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.sendBtn, processing && s.sendBtnStop]}
            onPress={processing ? stopQuery : sendMessage}
          >
            {processing ? <StopIcon /> : <Text style={s.sendBtnText}>⚡</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Drawer Móvil de Proyectos */}
      <Modal visible={showDrawer} animationType="fade" transparent={true} onRequestClose={() => setShowDrawer(false)}>
        <View style={s.drawerOverlay}>
          <TouchableOpacity style={s.drawerCloseArea} onPress={() => setShowDrawer(false)} />
          <View style={s.drawerContent}>
            <View style={[s.drawerHeader, { paddingTop: Math.max(insets.top + 12, 30) }]}>
              <TouchableOpacity style={s.logoutBtn} onPress={() => {
                setShowDrawer(false);
                handleLogout();
              }}>
                <Text style={s.logoutText}>Cerrar Sesión Segura</Text>
              </TouchableOpacity>
              {/* Eris y Hestia tienen cada una su lista de chats; los datos (comida, agua, Finanzas) son los mismos */}
              <Text style={s.drawerTitle}>CHATS DE {persona.name.toUpperCase()}</Text>
              <View style={s.drawerHeaderRow}>
                <TouchableOpacity onPress={() => newChat()} style={[s.newChatBtn, { flex: 1 }]}>
                  <Text style={s.newChatText}>+ NUEVA SESIÓN</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setNewProjectModal(true)} style={s.newProjectBtn}>
                  <Text style={s.newChatText}>+ 📁</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={s.drawerScroll}>
              {projects.map(proj => (
                <View key={proj.id} style={s.projFolder}>
                  <View style={s.projHeaderRow}>
                    <Text style={s.projName} numberOfLines={1}>{proj.emoji} {proj.name}{proj.instructions ? '  🧭' : ''}</Text>
                    <View style={s.projHeaderActions}>
                      <TouchableOpacity onPress={() => newChat(proj.id)} style={s.rowMenuBtn}>
                        <Text style={s.rowMenuText}>+</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setActionSheet({ kind: 'project', id: proj.id, name: proj.name })} style={s.rowMenuBtn}>
                        <Text style={s.rowMenuText}>⋮</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {conversations.filter(c => c.projectId === proj.id).map(conv => (
                    <View key={conv.id} style={s.convRow}>
                      <TouchableOpacity
                        style={[s.convItem, activeSession === conv.id && s.convItemActive, { flex: 1 }]}
                        onPress={() => switchChat(conv.id)}
                      >
                        <Text style={[s.convText, activeSession === conv.id && s.convTextActive]} numberOfLines={1}>
                          💬 {conv.title || 'Nueva conversación'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setActionSheet({ kind: 'chat', id: conv.id, name: conv.title || 'Nueva conversación' })} style={s.rowMenuBtn}>
                        <Text style={s.rowMenuText}>⋮</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ))}

              <View style={s.projFolder}>
                <Text style={s.projName}>📁 Sin Proyecto</Text>
                {!conversations.some(c => !c.projectId && !c.temporary) && (
                  <Text style={s.tempHint}>Aquí quedan tus chats largos con {persona.name}. Los cortos están en Chats temporales.</Text>
                )}
                {conversations.filter(c => !c.projectId && !c.temporary).map(conv => (
                  <View key={conv.id} style={s.convRow}>
                    <TouchableOpacity
                      style={[s.convItem, activeSession === conv.id && s.convItemActive, { flex: 1 }]}
                      onPress={() => switchChat(conv.id)}
                    >
                      <Text style={[s.convText, activeSession === conv.id && s.convTextActive]} numberOfLines={1}>
                        💬 {conv.title || 'Nueva conversación'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setActionSheet({ kind: 'chat', id: conv.id, name: conv.title || 'Nueva conversación' })} style={s.rowMenuBtn}>
                      <Text style={s.rowMenuText}>⋮</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Chats temporales: los cortos se guardan aquí solos (no se borran) para que la lista quede limpia */}
              {conversations.some(c => c.temporary) && (
                <View style={s.projFolder}>
                  <TouchableOpacity style={s.projHeaderRow} onPress={() => setTempOpen(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: tempOpen }}>
                    <Text style={s.projName} numberOfLines={1}>🕓 Chats temporales ({conversations.filter(c => c.temporary).length})</Text>
                    <Text style={s.rowMenuText}>{tempOpen ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  <Text style={s.tempHint}>
                    Los chats cortos (5 respuestas o menos) se guardan aquí solos para que tu lista quede limpia; no se borran. Si sigues uno y pasa de 5 respuestas, vuelve a tu lista. Para dejar uno fijo, muévelo a un proyecto (⋮).
                  </Text>
                  {tempOpen && conversations.filter(c => c.temporary).map(conv => (
                    <View key={conv.id} style={s.convRow}>
                      <TouchableOpacity
                        style={[s.convItem, activeSession === conv.id && s.convItemActive, { flex: 1 }]}
                        onPress={() => switchChat(conv.id)}
                      >
                        <Text style={[s.convText, activeSession === conv.id && s.convTextActive]} numberOfLines={1}>
                          🕓 {conv.title || 'Nueva conversación'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setActionSheet({ kind: 'chat', id: conv.id, name: conv.title || 'Nueva conversación' })} style={s.rowMenuBtn}>
                        <Text style={s.rowMenuText}>⋮</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Nuevo proyecto */}
      <Modal visible={newProjectModal} transparent animationType="fade" onRequestClose={() => setNewProjectModal(false)}>
        <KeyboardLiftView style={s.sheetOverlay}>
          <View style={s.sheetCard}>
            <Text style={s.sheetTitle}>Nuevo proyecto</Text>
            <TextInput
              style={s.sheetInput}
              value={newProjectName}
              onChangeText={setNewProjectName}
              placeholder="Nombre del proyecto..."
              placeholderTextColor={T.textMuted}
              autoFocus
              maxLength={40}
            />
            <View style={s.emojiPickRow}>
              {PROJECT_EMOJIS.map(e => (
                <TouchableOpacity key={e} onPress={() => setNewProjectEmoji(e)} style={[s.emojiPickBtn, newProjectEmoji === e && s.emojiPickBtnActive]}>
                  <Text style={s.emojiPickText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[s.sheetInput, s.instrInput]}
              value={newProjectInstructions}
              onChangeText={(v) => setNewProjectInstructions(v.slice(0, MAX_INSTRUCTIONS))}
              placeholder={`Instrucciones para ${persona.name} en este proyecto (opcional). Ej: actúa como experto en finanzas…`}
              placeholderTextColor={T.textMuted}
              multiline
            />
            <View style={s.sheetRow}>
              <TouchableOpacity style={s.sheetCancelBtn} onPress={() => setNewProjectModal(false)}>
                <Text style={s.sheetCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.sheetSaveBtn} onPress={createProject}>
                <Text style={s.sheetSaveText}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardLiftView>
      </Modal>

      {/* Menú de acciones — proyecto o chat */}
      <Modal visible={!!actionSheet} transparent animationType="fade" onRequestClose={() => setActionSheet(null)}>
        <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={() => setActionSheet(null)}>
          <View style={s.sheetCard}>
            <Text style={s.sheetTitle} numberOfLines={1}>{actionSheet?.name}</Text>
            <TouchableOpacity
              style={s.sheetActionBtn}
              onPress={() => {
                if (!actionSheet) return;
                setRenameModal({ kind: actionSheet.kind, id: actionSheet.id, value: actionSheet.name });
                setActionSheet(null);
              }}
            >
              <Text style={s.sheetActionText}>✏️ Renombrar</Text>
            </TouchableOpacity>
            {actionSheet?.kind === 'project' && (
              <TouchableOpacity
                style={s.sheetActionBtn}
                onPress={() => {
                  if (!actionSheet) return;
                  const proj = projects.find(p => p.id === actionSheet.id);
                  setInstructionsModal({ id: actionSheet.id, name: actionSheet.name, value: proj?.instructions || '' });
                  setActionSheet(null);
                }}
              >
                <Text style={s.sheetActionText}>🧭 Instrucciones del proyecto</Text>
              </TouchableOpacity>
            )}
            {actionSheet?.kind === 'chat' && (
              <TouchableOpacity
                style={s.sheetActionBtn}
                onPress={() => { if (actionSheet) setMoveModal({ conversationId: actionSheet.id }); setActionSheet(null); }}
              >
                <Text style={s.sheetActionText}>📁 Mover a proyecto</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.sheetActionBtn} onPress={confirmDeleteFromSheet}>
              <Text style={[s.sheetActionText, { color: T.red }]}>🗑️ Borrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Instrucciones fijas del proyecto */}
      <Modal visible={!!instructionsModal} transparent animationType="fade" onRequestClose={() => setInstructionsModal(null)}>
        <KeyboardLiftView style={s.sheetOverlay}>
          <View style={s.sheetCard}>
            <Text style={s.sheetTitle} numberOfLines={1}>Instrucciones · {instructionsModal?.name}</Text>
            <Text style={s.instrHint}>
              Eris las recibe en cada mensaje de cualquier chat de este proyecto, sin que tengas que repetirlas. No cambian sus reglas de seguridad (alergias, medicamentos).
            </Text>
            <View style={s.tplRow}>
              {INSTRUCTION_TEMPLATES.map(t => (
                <TouchableOpacity key={t.label} style={s.tplChip} onPress={() => setInstructionsModal(prev => prev ? { ...prev, value: t.text } : prev)}>
                  <Text style={s.tplChipText}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[s.sheetInput, s.instrInput]}
              value={instructionsModal?.value || ''}
              onChangeText={(v) => setInstructionsModal(prev => prev ? { ...prev, value: v.slice(0, MAX_INSTRUCTIONS) } : prev)}
              placeholder="Ej: Actúa como experto en finanzas personales chilenas…"
              placeholderTextColor={T.textMuted}
              multiline
              autoFocus
            />
            <Text style={s.instrCount}>{(instructionsModal?.value || '').length}/{MAX_INSTRUCTIONS}</Text>
            <View style={s.sheetRow}>
              <TouchableOpacity style={s.sheetCancelBtn} onPress={() => setInstructionsModal(null)}>
                <Text style={s.sheetCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.sheetSaveBtn} onPress={saveInstructions}>
                <Text style={s.sheetSaveText}>{instructionsModal?.value.trim() ? 'Guardar' : 'Quitar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardLiftView>
      </Modal>

      {/* Renombrar proyecto o chat */}
      <Modal visible={!!renameModal} transparent animationType="fade" onRequestClose={() => setRenameModal(null)}>
        <KeyboardLiftView style={s.sheetOverlay}>
          <View style={s.sheetCard}>
            <Text style={s.sheetTitle}>Renombrar {renameModal?.kind === 'project' ? 'proyecto' : 'chat'}</Text>
            <TextInput
              style={s.sheetInput}
              value={renameModal?.value || ''}
              onChangeText={(v) => setRenameModal(prev => prev ? { ...prev, value: v } : prev)}
              placeholder="Nuevo nombre..."
              placeholderTextColor={T.textMuted}
              autoFocus
              maxLength={60}
            />
            <View style={s.sheetRow}>
              <TouchableOpacity style={s.sheetCancelBtn} onPress={() => setRenameModal(null)}>
                <Text style={s.sheetCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.sheetSaveBtn} onPress={confirmRename}>
                <Text style={s.sheetSaveText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardLiftView>
      </Modal>

      {/* Mover chat a otro proyecto */}
      <Modal visible={!!moveModal} transparent animationType="fade" onRequestClose={() => setMoveModal(null)}>
        <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={() => setMoveModal(null)}>
          <View style={s.sheetCard}>
            <Text style={s.sheetTitle}>Mover a...</Text>
            <TouchableOpacity style={s.sheetActionBtn} onPress={() => moveModal && moveChatToProject(moveModal.conversationId, null)}>
              <Text style={s.sheetActionText}>📁 Sin proyecto</Text>
            </TouchableOpacity>
            {projects.map(p => (
              <TouchableOpacity key={p.id} style={s.sheetActionBtn} onPress={() => moveModal && moveChatToProject(moveModal.conversationId, p.id)}>
                <Text style={s.sheetActionText} numberOfLines={1}>{p.emoji} {p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Hestia por voz (J1): la llamada; solo se monta mientras está abierta */}
      {llamada && <HestiaLlamada visible onClose={() => setLlamada(false)} />}
    </View>
  );
}

// ─── Markdown styles para respuestas del bot ─────────────────
const mdStyles = {
  body:        { color: T.text, fontSize: 15, lineHeight: 22 },
  heading1:    { color: T.text, fontSize: 19, fontWeight: '800' as const, marginTop: 8, marginBottom: 4 },
  heading2:    { color: T.text, fontSize: 17, fontWeight: '800' as const, marginTop: 6, marginBottom: 4 },
  heading3:    { color: T.textLight, fontSize: 15, fontWeight: '700' as const, marginTop: 4, marginBottom: 2 },
  strong:      { fontWeight: '700' as const, color: T.text },
  em:          { fontStyle: 'italic' as const, color: T.textLight },
  code_inline: { backgroundColor: 'rgba(34,211,238,0.1)', color: T.accent, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 13, borderRadius: 4, paddingHorizontal: 4 },
  fence:       { backgroundColor: '#0d1117', borderRadius: 8, padding: 12, marginVertical: 6 },
  code_block:  { backgroundColor: '#0d1117', borderRadius: 8, padding: 12, marginVertical: 6 },
  blockquote:  { backgroundColor: 'rgba(168,85,247,0.08)', borderLeftColor: T.purple, borderLeftWidth: 3, paddingLeft: 10, marginVertical: 4 },
  bullet_list_icon: { color: T.accent, marginRight: 6 },
  ordered_list_icon: { color: T.accent, marginRight: 6 },
  hr:          { borderBottomColor: T.border, borderBottomWidth: 1, marginVertical: 8 },
  link:        { color: T.accent, textDecorationLine: 'underline' as const },
  paragraph:   { marginTop: 0, marginBottom: 4 },
};

// ─── Styles ─────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: T.border,
    backgroundColor: T.bgCard,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: T.text, letterSpacing: 3 },
  headerSub: { fontSize: 10, color: T.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  modeTag: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1,
  },
  modeTagAuto: { borderColor: T.purple, backgroundColor: T.purpleGlow },
  modeTagFlash: { borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)' },
  modeTagDeep: { borderColor: T.accent, backgroundColor: T.accentGlow },
  modeTagText: { fontSize: 10, fontWeight: '800', color: T.text, letterSpacing: 1 },

  // Messages
  messageList: { flex: 1 },
  messageListContent: { padding: 16, paddingBottom: 8, flexGrow: 1 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: T.text, letterSpacing: -0.5 },
  emptySubtitle: { fontSize: 13, color: T.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20, marginBottom: 28 },
  tempHint: { fontSize: 11, color: T.textMuted, lineHeight: 16, marginTop: 2, marginBottom: 6 },
  quickChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: T.bgCard, borderRadius: 20,
    borderWidth: 1, borderColor: T.border,
  },
  chipText: { color: T.textMuted, fontSize: 13, fontWeight: '600' },

  // Bubbles

  msgWrap: { marginBottom: 16, maxWidth: '88%' },
  msgWrapUser: { alignSelf: 'flex-end' },
  msgWrapBot: { alignSelf: 'flex-start', flexDirection: 'row', gap: 8, alignItems: 'flex-end' },

  botAvatar: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: T.bgCard, borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center',
  },
  botAvatarText: { fontSize: 12 },

  bubble: { borderRadius: 18, padding: 14, maxWidth: '100%' },
  bubbleUser: {
    backgroundColor: T.userBg,
    borderWidth: 1, borderColor: T.userBorder,
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    backgroundColor: T.bgCard,
    borderWidth: 1, borderColor: T.border,
    borderBottomLeftRadius: 4,
  },

  msgText: { fontSize: 15, lineHeight: 22 },
  msgTextUser: { color: T.text },
  heardText: { fontSize: 11, lineHeight: 15, color: T.textMuted, marginTop: 4, fontStyle: 'italic' },
  msgTextBot: { color: T.text },

  // Thinking
  thinkBlock: {
    backgroundColor: 'rgba(168,85,247,0.08)',
    borderLeftWidth: 2, borderLeftColor: T.purple,
    borderRadius: 8, padding: 10, marginBottom: 10,
  },
  thinkHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  thinkChevron: { fontSize: 10, color: T.purple },
  thinkLabel: { fontSize: 10, fontWeight: '800', color: T.purple, letterSpacing: 1 },
  thinkText: { fontSize: 11, color: T.textMuted, fontStyle: 'italic', lineHeight: 16 },

  // Mode badge
  modeBadge: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  modeBadgeFlash: { backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  modeBadgeDeep: { backgroundColor: T.accentGlow, borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)' },
  modeBadgeText: { fontSize: 10, fontWeight: '700', color: T.text },

  // Typing dots
  dotsRow: { flexDirection: 'row', gap: 5, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.accent },

  // Mode selector
  modeRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  modeBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: T.border,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  modeBtnActive: { borderColor: T.accent },
  modeBtnAutoActive: { backgroundColor: T.purpleGlow, borderColor: T.purple },
  modeBtnFlashActive: { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: '#f59e0b' },
  modeBtnDeepActive: { backgroundColor: T.accentGlow, borderColor: T.accent },
  modeBtnText: { fontSize: 11, fontWeight: '700', color: T.textMuted, letterSpacing: 0.5 },
  modeBtnTextActive: { color: T.text },

  // Quick actions
  quickRow:        { backgroundColor: T.bgCard, borderTopWidth: 1, borderTopColor: T.border, maxHeight: 46 },
  quickRowContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row', alignItems: 'center' },
  quickChip:       { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: T.border, borderWidth: 1, borderColor: T.border },
  quickChipWater:  { borderColor: '#164e63', backgroundColor: 'rgba(34,211,238,0.06)' },
  quickChipText:   { color: T.textLight, fontSize: 12, fontWeight: '600' },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16,
    borderTopWidth: 1, borderTopColor: T.border,
    backgroundColor: T.bgCard,
  },
  inputRowProcessing: { opacity: 0.8 },
  input: {
    flex: 1,
    backgroundColor: T.bgInput,
    color: T.text,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: T.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: T.accent, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  sendBtnDisabled: { backgroundColor: T.textMuted, shadowOpacity: 0 },
  sendBtnStop: { backgroundColor: T.red, shadowColor: T.red },
  micBtn: { backgroundColor: T.bgElevated, shadowOpacity: 0, marginRight: 8 },
  micBtnActive: { backgroundColor: T.red, shadowColor: T.red, shadowOpacity: 0.4 },
  sendBtnText: { fontSize: 18 },

  // Drawer / Menu
  menuBtn: { padding: 4, marginRight: 8 },
  menuIcon: { color: T.text, fontSize: 20 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoutBtn: { padding: 6 },
  logoutText: { fontSize: 18, color: T.textMuted },
  ttsBtn: { padding: 6 },
  drawerOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.7)' },
  drawerCloseArea: { flex: 1 },
  drawerContent: { width: '80%', maxWidth: 320, backgroundColor: T.bgCard, borderRightWidth: 1, borderRightColor: T.border },
  drawerHeader: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 30, borderBottomWidth: 1, borderBottomColor: T.border },
  drawerTitle: { color: T.textMuted, fontSize: 13, fontWeight: '800', letterSpacing: 2, marginBottom: 15 },
  drawerHeaderRow: { flexDirection: 'row', gap: 8 },
  newChatBtn: { backgroundColor: T.purpleGlow, padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: T.purple },
  newChatText: { color: T.purple, fontWeight: '800', fontSize: 12 },
  newProjectBtn: { backgroundColor: T.purpleGlow, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: T.purple },
  drawerScroll: { flex: 1, padding: 15 },
  projFolder: { marginBottom: 20 },
  projHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingLeft: 5 },
  projName: { flex: 1, color: T.text, fontSize: 14, fontWeight: '700' },
  projHeaderActions: { flexDirection: 'row' },
  convRow: { flexDirection: 'row', alignItems: 'center' },
  convItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4 },
  convItemActive: { backgroundColor: T.accentGlow, borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)' },
  convText: { color: T.textMuted, fontSize: 13 },
  convTextActive: { color: T.text, fontWeight: '600' },
  rowMenuBtn: { paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  rowMenuText: { color: T.textMuted, fontSize: 16, fontWeight: '700' },

  // ── Modales de acción (nuevo proyecto / renombrar / mover / menú) ──
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheetCard: { backgroundColor: '#0e0e18', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: T.border, width: '100%', maxWidth: 380 },
  sheetTitle: { color: T.text, fontSize: 16, fontWeight: '800', marginBottom: 14 },
  sheetInput: { backgroundColor: '#1a1a24', color: T.text, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderColor: T.border, marginBottom: 14 },
  instrInput: { minHeight: 110, maxHeight: 220, textAlignVertical: 'top', fontSize: 14, lineHeight: 20, marginBottom: 6 },
  instrCount: { color: T.textMuted, fontSize: 11, textAlign: 'right', marginBottom: 10 },
  instrHint: { color: T.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  tplRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tplChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: T.border, backgroundColor: '#1a1a24' },
  tplChipText: { color: T.textLight, fontSize: 12, fontWeight: '600' },
  sheetRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  sheetCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: T.border, alignItems: 'center' },
  sheetCancelText: { color: T.textLight, fontSize: 13, fontWeight: '700' },
  sheetSaveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: T.accent, alignItems: 'center' },
  sheetSaveText: { color: '#000', fontSize: 13, fontWeight: '800' },
  sheetActionBtn: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: T.border },
  sheetActionText: { color: T.text, fontSize: 14, fontWeight: '600' },
  emojiPickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  emojiPickBtn: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#1a1a24', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
  emojiPickBtnActive: { borderColor: T.accent, backgroundColor: T.accentGlow },
  emojiPickText: { fontSize: 20 },
});

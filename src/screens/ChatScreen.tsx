import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, StatusBar,
  Animated, Easing, Pressable, Modal,
  Vibration, Clipboard, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { wsManager } from '../services/WebSocketManager';
import { AuthStorage } from '../services/AuthStorage';
import { T } from '../config/design';

type Mode = 'auto' | 'flash' | 'deep';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  modeUsed?: string;
  isComplete: boolean;
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
function MessageBubble({ msg }: { msg: ChatMessage }) {
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
              <Text style={s.thinkText}>{msg.thinking}</Text>
            )}
          </View>
        ) : null}

        {/* Contenido */}
        {!msg.isComplete && !msg.content && !msg.thinking ? (
          <TypingDots />
        ) : isUser ? (
          <Text style={[s.msgText, s.msgTextUser]}>{msg.content || ''}</Text>
        ) : (
          <Markdown style={mdStyles}>{msg.content || ''}</Markdown>
        )}

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
}: {
  route?: any;
  onLogout?: () => void;
  onClose?: () => void;
  pendingMessage?: string;
}) {
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

  const scrollRef = useRef<ScrollView>(null);
  
  // Combina prop directa (overlay persistente) con route.params (navegación legacy)
  const pendingMessage = pendingMessageProp ?? route?.params?.pendingMessage;
  const lastSentMsg = useRef<string | undefined>(undefined);

  useEffect(() => {
    const unsubStatus = wsManager.subscribeStatus((st) => setStatus(st));

    const unsubMsg = wsManager.subscribeMessage((payload) => {
      // When Toji panel is active, it owns the WS stream — skip conversational messages here
      if (wsManager.isTojiPanelActive() && ['thinking', 'thinking_token', 'token', 'stream_end', 'done'].includes(payload.type)) return;
      switch (payload.type) {
        case 'connected':
        case 'chat_switched':
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

  const sendMessage = () => {
    const text = inputText.trim();
    if (!text || processing) return;
    Vibration.vibrate(30);
    setMessages(prev => [...prev, { id: Math.random().toString(), role: 'user', content: text, isComplete: true }]);
    wsManager.sendMessage({ type: 'message', content: text, mode });
    setInputText('');
  };

  const sendText = (text: string) => {
    if (!text.trim() || processing) return;
    Vibration.vibrate(30);
    setMessages(prev => [...prev, { id: Math.random().toString(), role: 'user', content: text.trim(), isComplete: true }]);
    wsManager.sendMessage({ type: 'message', content: text.trim(), mode });
  };

  const switchChat = (id: string) => {
    wsManager.sendMessage({ type: 'switch_chat', conversationId: id });
    setShowDrawer(false);
  };

  const newChat = () => {
    wsManager.sendMessage({ type: 'new_chat' });
    setShowDrawer(false);
  };

  const statusColor = status === 'connected' ? '#22c55e' : status === 'connecting' ? '#f59e0b' : '#ef4444';

  const insets = useSafeAreaInsets();

  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          {onClose ? (
            <TouchableOpacity onPress={onClose} style={s.menuBtn}>
              <Text style={[s.menuIcon, { fontSize: 26, lineHeight: 28 }]}>↓</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setShowDrawer(true)} style={s.menuBtn}>
              <Text style={s.menuIcon}>☰</Text>
            </TouchableOpacity>
          )}
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={s.headerTitle}>ERIS</Text>
        </View>
        <View style={s.headerRight}>
          <View style={[s.modeTag, mode === 'auto' ? s.modeTagAuto : mode === 'flash' ? s.modeTagFlash : s.modeTagDeep]}>
            <Text style={s.modeTagText}>
              {mode === 'auto' ? '🔮 AUTO' : mode === 'flash' ? '⚡ FLASH' : '🧠 DEEP'}
            </Text>
          </View>
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
            <Text style={s.logoutText}>⏻</Text>
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
          {messages.length === 0 && (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>⚡</Text>
              <Text style={s.emptyTitle}>Eris lista</Text>
              <Text style={s.emptySubtitle}>Tu Jefa de Gabinete Soberana{`\n`}esperando órdenes</Text>
              <View style={s.quickChips}>
                {(role === 'ikaros' || role === 'hestia' ? [
                  { label: '📊 Reporte AXS', msg: 'Eris, genera un Reporte de Estatus AXS.' },
                  { label: '⚡ Recursos', msg: 'Eris, cómo están mis recursos del sistema?' },
                  { label: '📝 Nueva tarea', msg: 'Eris, abre el log de hoy y déjame anotar una tarea.' },
                ] : [
                  { label: '📊 Analizar métricas', msg: 'Eris, analiza mis métricas de hoy.' },
                  { label: '🥗 Registrar comida', msg: 'Eris, ayúdame a registrar lo que acabo de comer.' },
                  { label: '📝 Recordatorio', msg: 'Eris, crea un recordatorio para mí.' },
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
            <MessageBubble key={msg.id || i} msg={msg} />
          ))}
        </ScrollView>

        {/* Mode Selector */}
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
            style={s.input}
            placeholder="Comando ejecutivo..."
            placeholderTextColor={T.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={4000}
            returnKeyType="default"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[s.sendBtn, processing && s.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={processing}
          >
            <Text style={s.sendBtnText}>{processing ? '⏳' : '⚡'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Drawer Móvil de Proyectos */}
      <Modal visible={showDrawer} animationType="fade" transparent={true} onRequestClose={() => setShowDrawer(false)}>
        <View style={s.drawerOverlay}>
          <TouchableOpacity style={s.drawerCloseArea} onPress={() => setShowDrawer(false)} />
          <View style={s.drawerContent}>
            <View style={s.drawerHeader}>
              <TouchableOpacity style={s.logoutBtn} onPress={() => {
                setShowDrawer(false);
                handleLogout();
              }}>
                <Text style={s.logoutText}>Cerrar Sesión Segura</Text>
              </TouchableOpacity>
              <Text style={s.drawerTitle}>PROYECTOS</Text>
              <TouchableOpacity onPress={newChat} style={s.newChatBtn}>
                <Text style={s.newChatText}>+ NUEVA SESIÓN</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={s.drawerScroll}>
              {projects.map(proj => (
                <View key={proj.id} style={s.projFolder}>
                  <Text style={s.projName}>{proj.emoji} {proj.name}</Text>
                  {conversations.filter(c => c.projectId === proj.id).map(conv => (
                    <TouchableOpacity 
                      key={conv.id} 
                      style={[s.convItem, activeSession === conv.id && s.convItemActive]}
                      onPress={() => switchChat(conv.id)}
                    >
                      <Text style={[s.convText, activeSession === conv.id && s.convTextActive]} numberOfLines={1}>
                        💬 {conv.title || 'Nueva conversación'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

              <View style={s.projFolder}>
                <Text style={s.projName}>📁 Sin Proyecto</Text>
                {conversations.filter(c => !c.projectId).map(conv => (
                  <TouchableOpacity 
                    key={conv.id} 
                    style={[s.convItem, activeSession === conv.id && s.convItemActive]}
                    onPress={() => switchChat(conv.id)}
                  >
                    <Text style={[s.convText, activeSession === conv.id && s.convTextActive]} numberOfLines={1}>
                      💬 {conv.title || 'Nueva conversación'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  sendBtnText: { fontSize: 18 },

  // Drawer / Menu
  menuBtn: { padding: 4, marginRight: 8 },
  menuIcon: { color: T.text, fontSize: 20 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoutBtn: { padding: 6 },
  logoutText: { fontSize: 18, color: T.textMuted },
  drawerOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.7)' },
  drawerCloseArea: { flex: 1 },
  drawerContent: { width: '80%', maxWidth: 320, backgroundColor: T.bgCard, borderRightWidth: 1, borderRightColor: T.border },
  drawerHeader: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 30, borderBottomWidth: 1, borderBottomColor: T.border },
  drawerTitle: { color: T.textMuted, fontSize: 13, fontWeight: '800', letterSpacing: 2, marginBottom: 15 },
  newChatBtn: { backgroundColor: T.purpleGlow, padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: T.purple },
  newChatText: { color: T.purple, fontWeight: '800', fontSize: 12 },
  drawerScroll: { flex: 1, padding: 15 },
  projFolder: { marginBottom: 20 },
  projName: { color: T.text, fontSize: 14, fontWeight: '700', marginBottom: 10, paddingLeft: 5 },
  convItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4 },
  convItemActive: { backgroundColor: T.accentGlow, borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)' },
  convText: { color: T.textMuted, fontSize: 13 },
  convTextActive: { color: T.text, fontWeight: '600' },
});

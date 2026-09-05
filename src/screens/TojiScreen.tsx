import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator, StatusBar, Animated, BackHandler,
  ScrollView, TextInput, KeyboardAvoidingView, Dimensions, Platform, Vibration,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { type HealthSnapshot } from '../services/MetricsService';
import { wsManager } from '../services/WebSocketManager';
import { AuthStorage } from '../services/AuthStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T, R } from '../config/design';

const { height: H } = Dimensions.get('window');
const PANEL_H = Math.round(H * 0.67);

type PanelMode = 'auto' | 'flash' | 'deep';

interface PanelMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  modeUsed?: string;
  isComplete: boolean;
}

interface Props {
  snapshot: HealthSnapshot;
  onNavigateToChat: (msg: string) => void;
  onExit?: () => void;
  onGoToEris?: () => void;
}

function buildCoachingPrompt(snapshot: HealthSnapshot, tojiState: any): string {
  const lines: string[] = [];

  lines.push('Analízame para el entrenamiento de hoy. Objetivo: Cuerpo de Restricción Celestial — acondicionamiento nivel Toji Fushiguro (JJK).');
  lines.push('');
  lines.push('## Biometría actual');

  if (snapshot.sleep) {
    const q = snapshot.sleep.durationHours >= 7.5 ? 'óptimo' : snapshot.sleep.durationHours >= 6 ? 'corto' : 'insuficiente';
    lines.push(`- Sueño: ${snapshot.sleep.durationHours}h (${q})`);
    if (snapshot.sleep.stages) {
      const { light, deep, rem } = snapshot.sleep.stages;
      lines.push(`  └ Profundo: ${deep}h · REM: ${rem}h · Ligero: ${light}h`);
    }
  }
  if (snapshot.heartRate?.resting != null)
    lines.push(`- FC en reposo: ${snapshot.heartRate.resting} bpm`);
  if (snapshot.spo2 !== null)
    lines.push(`- SpO2: ${snapshot.spo2}%`);
  if (snapshot.steps !== null)
    lines.push(`- Pasos hoy: ${snapshot.steps.toLocaleString()}`);
  if (snapshot.calories !== null)
    lines.push(`- Calorías activas: ${snapshot.calories} kcal`);
  if (snapshot.activeMinutes !== null)
    lines.push(`- Minutos activos: ${snapshot.activeMinutes} min`);
  if (snapshot.glucose)
    lines.push(`- Glucosa: ${snapshot.glucose.valueMgdl} mg/dL (${snapshot.glucose.valueMmol} mmol/L)`);

  lines.push('');
  lines.push('## Estado Proyecto Toji');

  if (tojiState) {
    if (tojiState.level)   lines.push(`- Nivel: ${tojiState.level}`);
    if (tojiState.classes?.length)
      lines.push(`- Clase: ${tojiState.classes.join(', ')}`);
    if (tojiState.streak)  lines.push(`- Streak: ${tojiState.streak} días`);
    if (tojiState.xp)      lines.push(`- XP: ${tojiState.xp}`);

    const doneMissions = Object.entries(tojiState.missions || {})
      .filter(([, v]: any) => v === true || (typeof v === 'number' && v > 0))
      .map(([k]) => k);
    if (doneMissions.length)
      lines.push(`- Misiones completadas hoy: ${doneMissions.join(', ')}`);

    const unlockedSkills = Object.entries(tojiState.skills || {})
      .filter(([, v]: any) => v === 'done' || v === 'active')
      .map(([k]) => k);
    if (unlockedSkills.length > 0)
      lines.push(`- Skills desbloqueados: ${unlockedSkills.slice(0, 6).join(', ')}${unlockedSkills.length > 6 ? '…' : ''}`);
  }

  lines.push('');
  lines.push('¿Puedo entrenar al 100% hoy o debo ajustar volumen/intensidad? Dame una recomendación concreta para la sesión de hoy incluyendo series, reps y qué priorizar o proteger según mi estado biométrico.');

  return lines.join('\n');
}

export default function TojiScreen({ snapshot, onNavigateToChat, onExit, onGoToEris }: Props) {
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const btnAnim = useRef(new Animated.Value(0)).current;

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMessages, setPanelMessages] = useState<PanelMessage[]>([]);
  const [panelInput, setPanelInput] = useState('');
  const [panelProcessing, setPanelProcessing] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('auto');
  const panelAnim = useRef(new Animated.Value(0)).current;
  const panelScrollRef = useRef<ScrollView>(null);
  const panelOpenRef = useRef(false);
  const panelSlide = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [PANEL_H, 0] });
  const tojiStateRef = useRef<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [creds, html] = await Promise.all([
          AuthStorage.getCredentials(),
          (async () => {
            const asset = Asset.fromModule(require('../../assets/toji.html'));
            await asset.downloadAsync();
            const res = await fetch(asset.localUri!);
            return res.text();
          })(),
        ]);
        setProfileId(creds?.profileId ?? 'anon');
        setHtmlContent(html);
      } catch (e) {
        console.warn('[Toji] Error loading HTML:', e);
        setProfileId('anon');
      }
    };
    load();
  }, []);

  // WebSocket subscription — rutea mensajes al panel nativo
  useEffect(() => {
    const unsub = wsManager.subscribeMessage((payload) => {
      if (!panelOpenRef.current) return;
      switch (payload.type) {
        case 'thinking':
          setPanelProcessing(true);
          setPanelMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && !last.isComplete) return prev;
            return [...prev, { id: Math.random().toString(), role: 'assistant', content: '', isComplete: false }];
          });
          break;
        case 'thinking_token':
          setPanelMessages(prev => {
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
          setPanelMessages(prev => {
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
          setPanelProcessing(false);
          setPanelMessages(prev => {
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
    return () => { unsub(); };
  }, []);

  const handleLoadEnd = useCallback(() => {
    setLoading(false);
    Animated.spring(btnAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }).start();
  }, [btnAnim]);

  const openPanel = useCallback(() => {
    panelOpenRef.current = true;
    wsManager.setTojiPanelActive(true);
    setPanelOpen(true);
    Animated.spring(panelAnim, { toValue: 1, tension: 65, friction: 11, useNativeDriver: true }).start();
  }, [panelAnim]);

  const closePanel = useCallback(() => {
    Animated.timing(panelAnim, { toValue: 0, duration: 230, useNativeDriver: true }).start(() => {
      setPanelOpen(false);
      panelOpenRef.current = false;
      wsManager.setTojiPanelActive(false);
    });
  }, [panelAnim]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (panelOpenRef.current) {
        closePanel();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [closePanel]);

  const sendPanelMessage = useCallback((text: string) => {
    if (!text.trim() || panelProcessing) return;
    const msg = text.trim();
    Vibration.vibrate(25);
    setPanelMessages(prev => [...prev, { id: Math.random().toString(), role: 'user', content: msg, isComplete: true }]);
    setPanelProcessing(true);
    setPanelInput('');
    wsManager.sendMessage({ type: 'message', content: msg, mode: panelMode });
  }, [panelProcessing, panelMode]);

  const injectedJS = `
    (function() {
      try {
        window.__ERIS_PROFILE_ID__ = ${JSON.stringify(profileId || 'anon')};
        window.__ERIS_DATA__ = ${JSON.stringify({
          steps: snapshot.steps,
          sleep: snapshot.sleep?.durationHours ?? null,
          sleepDeep: snapshot.sleep?.stages?.deep ?? null,
          sleepRem: snapshot.sleep?.stages?.rem ?? null,
          hr: snapshot.heartRate?.resting ?? null,
          hrAvg: snapshot.heartRate?.average ?? null,
          spo2: snapshot.spo2,
          calories: snapshot.calories,
          distance: snapshot.distance,
          activeMinutes: snapshot.activeMinutes,
          glucose: snapshot.glucose?.valueMgdl ?? null,
        })};
        window.__ERIS_MISSIONS__ = {
          steps: (window.__ERIS_DATA__.steps || 0) >= 8000,
          sleep: (window.__ERIS_DATA__.sleep || 0) >= 7,
        };
      } catch(e) {}
      true;
    })();
  `;

  const handleErisPress = useCallback(() => {
    webViewRef.current?.injectJavaScript(`
      (function() {
        try {
          var pid = window.__ERIS_PROFILE_ID__;
          var key = pid && pid !== 'anon' ? 'toji-rpg-v1-' + pid : 'toji-rpg-v1';
          var raw = localStorage.getItem(key);
          var state = raw ? JSON.parse(raw) : {};
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CONSULT_ERIS',
            tojiState: state,
          }));
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CONSULT_ERIS', tojiState: {} }));
        }
      })();
      true;
    `);
  }, []);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'CONSULT_ERIS') {
        tojiStateRef.current = data.tojiState;
        openPanel();
      } else if (data.type === 'TOJI_WORKOUT_SYNC') {
        AsyncStorage.setItem('toji_last_workout', data.lastWorkout).catch(() => {});
      }
    } catch {}
  }, [openPanel]);

  if (!htmlContent || profileId === null) {
    return (
      <View style={s.loader}>
        <StatusBar barStyle="light-content" backgroundColor="#0c0b0e" />
        <ActivityIndicator color={T.accent} size="large" />
        <Text style={s.loaderText}>INICIANDO FORGE…</Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0c0b0e" />

      <WebView
        ref={webViewRef}
        source={{ html: htmlContent, baseUrl: 'file:///android_asset/' }}
        style={s.webview}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowsInlineMediaPlayback
        mixedContentMode="always"
        scrollEnabled
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        onError={(e) => console.warn('[Toji WebView]', e.nativeEvent)}
      />

      {loading && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator color={T.accent} size="large" />
          <Text style={s.loaderText}>ENTRANDO EN FORGE…</Text>
        </View>
      )}

      {/* Botón volver a Eris (solo sale del portal) */}
      {onExit && (
        <TouchableOpacity
          style={[s.exitBtn, { top: insets.top + 10 }]}
          onPress={onExit}
          activeOpacity={0.75}
        >
          <Text style={s.exitBtnText}>← Eris</Text>
        </TouchableOpacity>
      )}

      {/* Botón consultar Eris — abre panel dentro de Toji */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          s.erisBtnWrap,
          { bottom: insets.bottom + 80 },
          {
            opacity: btnAnim,
            transform: [{ scale: btnAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
          },
        ]}>
        <TouchableOpacity style={s.erisBtn} onPress={handleErisPress} activeOpacity={0.85}>
          <Text style={s.erisBtnIcon}>⚡</Text>
          <Text style={s.erisBtnText}>Consultar Eris</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Panel de chat dentro de Toji */}
      {panelOpen && (
        <Animated.View style={[s.panel, { transform: [{ translateY: panelSlide }] }]}>
          {/* Handle drag */}
          <View style={s.panelHandle} />

          {/* Header */}
          <View style={s.panelHeader}>
            <View style={s.panelHeaderLeft}>
              <Text style={s.panelHeaderIcon}>⚡</Text>
              <Text style={s.panelHeaderTitle}>Eris Coach</Text>
            </View>
            <View style={s.panelHeaderRight}>
              {onGoToEris && (
                <TouchableOpacity
                  style={s.panelGoErisBtn}
                  onPress={onGoToEris}
                  activeOpacity={0.8}
                >
                  <Text style={s.panelGoErisBtnText}>Ir a Eris →</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.panelCloseBtn} onPress={closePanel} activeOpacity={0.7}>
                <Text style={s.panelCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Mensajes */}
          <ScrollView
            ref={panelScrollRef}
            style={s.panelMessages}
            contentContainerStyle={s.panelMessagesContent}
            onContentSizeChange={() => panelScrollRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
          >
            {panelMessages.length === 0 && (
              <View style={s.panelEmptyState}>
                <Text style={s.panelEmptyHint}>Pregunta sobre tu entrenamiento, recuperación o progreso.</Text>
                {tojiStateRef.current && (
                  <TouchableOpacity
                    style={s.analyzeChip}
                    onPress={() => sendPanelMessage(buildCoachingPrompt(snapshot, tojiStateRef.current))}
                    activeOpacity={0.8}
                  >
                    <Text style={s.analyzeChipText}>📊 Analizar mi día de entrenamiento</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {panelMessages.map(msg => (
              <View
                key={msg.id}
                style={[s.panelBubbleWrap, msg.role === 'user' ? s.panelBubbleWrapUser : s.panelBubbleWrapBot]}
              >
                {msg.role === 'assistant' && (
                  <View style={s.panelAvatar}>
                    <Text style={s.panelAvatarText}>⚡</Text>
                  </View>
                )}
                <View style={[s.panelBubble, msg.role === 'user' ? s.panelBubbleUser : s.panelBubbleBot]}>
                  {/* Bloque de pensamiento colapsado */}
                  {msg.thinking ? (
                    <View style={s.panelThinkBlock}>
                      <Text style={s.panelThinkLabel}>
                        {msg.isComplete ? '🧠 Razón interna' : '🧠 Pensando...'}
                      </Text>
                    </View>
                  ) : null}
                  {/* Contenido */}
                  {!msg.isComplete && !msg.content && !msg.thinking ? (
                    <Text style={s.panelTyping}>· · ·</Text>
                  ) : msg.role === 'user' ? (
                    <Text style={s.panelBubbleTextUser}>{msg.content}</Text>
                  ) : (
                    <Markdown style={panelMdStyles}>{msg.content || ''}</Markdown>
                  )}
                  {/* Badge de modo */}
                  {msg.modeUsed && msg.role === 'assistant' && (
                    <View style={[s.panelModeBadge, msg.modeUsed === 'flash' ? s.panelModeBadgeFlash : s.panelModeBadgeDeep]}>
                      <Text style={s.panelModeBadgeText}>
                        {msg.modeUsed === 'flash' ? '⚡ Flash' : '🧠 Deep'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Selector de modo */}
          <View style={s.panelModeRow}>
            {(['auto', 'flash', 'deep'] as PanelMode[]).map(m => (
              <TouchableOpacity
                key={m}
                style={[s.panelModeBtn, panelMode === m && (m === 'auto' ? s.panelModeBtnAutoActive : m === 'flash' ? s.panelModeBtnFlashActive : s.panelModeBtnDeepActive)]}
                onPress={() => setPanelMode(m)}
                activeOpacity={0.7}
              >
                <Text style={[s.panelModeBtnText, panelMode === m && s.panelModeBtnTextActive]}>
                  {m === 'auto' ? '🔮 Auto' : m === 'flash' ? '⚡ Flash' : '🧠 Deep'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Input */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[s.panelInputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <TextInput
                style={s.panelInputField}
                value={panelInput}
                onChangeText={setPanelInput}
                placeholder="Pregunta sobre tu entrenamiento…"
                placeholderTextColor={T.textMuted}
                multiline
                maxLength={1000}
                onSubmitEditing={() => sendPanelMessage(panelInput)}
              />
              <TouchableOpacity
                style={[s.panelSendBtn, (panelProcessing || !panelInput.trim()) && s.panelSendBtnDisabled]}
                onPress={() => sendPanelMessage(panelInput)}
                disabled={panelProcessing || !panelInput.trim()}
                activeOpacity={0.8}
              >
                <Text style={s.panelSendBtnText}>{panelProcessing ? '⏳' : '⚡'}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0c0b0e' },
  webview: { flex: 1, backgroundColor: '#0c0b0e' },

  loader: {
    flex: 1, backgroundColor: '#0c0b0e',
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0c0b0e',
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  loaderText: { color: T.textMuted, fontSize: 13, letterSpacing: 1 },

  // Botón "← Eris"
  exitBtn: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(12,11,14,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.4)',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  exitBtnText: { color: T.accent, fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },

  // Botón "⚡ Consultar Eris" flotante
  erisBtnWrap: {
    position: 'absolute',
    right: 20,
    width: 140, // Explicit width
    height: 48, // Explicit height
  },
  erisBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: T.bgCard,
    borderWidth: 1, borderColor: T.borderActive,
    borderRadius: R.full,
    paddingVertical: 12, paddingHorizontal: 18,
    shadowColor: T.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  erisBtnIcon: { fontSize: 16 },
  erisBtnText: { color: T.accent, fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },

  // Panel de chat
  panel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: PANEL_H,
    backgroundColor: T.bgCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: T.borderActive,
    shadowColor: T.accent,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 24,
  },
  panelHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: T.textMuted,
    alignSelf: 'center',
    marginTop: 10, marginBottom: 2,
    opacity: 0.4,
  },
  panelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  panelHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelHeaderIcon: { fontSize: 16 },
  panelHeaderTitle: { color: T.text, fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },
  panelHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  panelGoErisBtn: {
    backgroundColor: T.accentGlow,
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.45)',
    borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12,
  },
  panelGoErisBtnText: { color: T.accent, fontWeight: '700', fontSize: 12, letterSpacing: 0.3 },
  panelCloseBtn: { padding: 4 },
  panelCloseBtnText: { color: T.textMuted, fontSize: 20, fontWeight: '300' },

  // Mensajes
  panelMessages: { flex: 1 },
  panelMessagesContent: { padding: 16, paddingBottom: 8, gap: 12 },
  panelBubbleWrap: { maxWidth: '88%' },
  panelBubbleWrapUser: { alignSelf: 'flex-end' },
  panelBubbleWrapBot: { alignSelf: 'flex-start', flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  panelAvatar: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: T.bg, borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center',
  },
  panelAvatarText: { fontSize: 11 },
  panelBubble: { borderRadius: 16, padding: 12 },
  panelBubbleUser: {
    backgroundColor: T.userBg,
    borderWidth: 1, borderColor: T.userBorder,
    borderBottomRightRadius: 4,
  },
  panelBubbleBot: {
    backgroundColor: T.bg,
    borderWidth: 1, borderColor: T.border,
    borderBottomLeftRadius: 4,
  },
  panelBubbleText: { fontSize: 14, lineHeight: 20 },
  panelBubbleTextUser: { color: T.text },
  panelBubbleTextBot: { color: T.text },
  panelTyping: { color: T.accent, fontSize: 18, letterSpacing: 4, paddingVertical: 2 },
  panelEmptyState: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 12, gap: 16 },
  panelEmptyHint: { color: T.textMuted, fontFamily: undefined, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  analyzeChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.accentGlow,
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.45)',
    borderRadius: 20, paddingVertical: 10, paddingHorizontal: 18,
  },
  analyzeChipText: { color: T.accent, fontWeight: '700', fontSize: 13 },

  // Mode selector
  panelModeRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: T.border,
  },
  panelModeBtn: {
    flex: 1, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: T.border,
    alignItems: 'center', backgroundColor: 'transparent',
  },
  panelModeBtnAutoActive: { backgroundColor: 'rgba(168,85,247,0.15)', borderColor: '#a855f7' },
  panelModeBtnFlashActive: { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: '#f59e0b' },
  panelModeBtnDeepActive: { backgroundColor: T.accentGlow, borderColor: T.accent },
  panelModeBtnText: { fontSize: 10, fontWeight: '700', color: T.textMuted, letterSpacing: 0.3 },
  panelModeBtnTextActive: { color: T.text },

  // Thinking block
  panelThinkBlock: {
    backgroundColor: 'rgba(168,85,247,0.08)',
    borderLeftWidth: 2, borderLeftColor: '#a855f7',
    borderRadius: 6, padding: 8, marginBottom: 8,
  },
  panelThinkLabel: { fontSize: 10, fontWeight: '800', color: '#a855f7', letterSpacing: 1 },

  // Mode badge
  panelModeBadge: {
    marginTop: 6, alignSelf: 'flex-start',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
  },
  panelModeBadgeFlash: { backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  panelModeBadgeDeep: { backgroundColor: T.accentGlow, borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)' },
  panelModeBadgeText: { fontSize: 9, fontWeight: '700', color: T.text },

  // Input
  panelInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
  },
  panelInputField: {
    flex: 1,
    backgroundColor: T.bg,
    color: T.text,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 80,
    lineHeight: 18,
  },
  panelSendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: T.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: T.accent, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  panelSendBtnDisabled: { backgroundColor: T.textMuted, shadowOpacity: 0, elevation: 0 },
  panelSendBtnText: { fontSize: 16 },
});

const panelMdStyles = {
  body:        { color: T.text, fontSize: 14, lineHeight: 20 },
  heading1:    { color: T.text, fontSize: 17, fontWeight: '800' as const, marginTop: 6, marginBottom: 3 },
  heading2:    { color: T.text, fontSize: 15, fontWeight: '700' as const, marginTop: 4, marginBottom: 2 },
  heading3:    { color: T.textLight, fontSize: 14, fontWeight: '700' as const, marginTop: 3, marginBottom: 2 },
  strong:      { fontWeight: '700' as const, color: T.text },
  em:          { fontStyle: 'italic' as const, color: T.textLight },
  code_inline: { backgroundColor: 'rgba(34,211,238,0.1)', color: T.accent, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, borderRadius: 3, paddingHorizontal: 3 },
  fence:       { backgroundColor: '#0d1117', borderRadius: 6, padding: 10, marginVertical: 4 },
  code_block:  { backgroundColor: '#0d1117', borderRadius: 6, padding: 10, marginVertical: 4 },
  blockquote:  { backgroundColor: 'rgba(168,85,247,0.08)', borderLeftColor: '#a855f7', borderLeftWidth: 3, paddingLeft: 8, marginVertical: 3 },
  bullet_list_icon: { color: T.accent, marginRight: 4 },
  ordered_list_icon: { color: T.accent, marginRight: 4 },
  hr:          { borderBottomColor: T.border, borderBottomWidth: 1, marginVertical: 6 },
  link:        { color: T.accent, textDecorationLine: 'underline' as const },
  paragraph:   { marginTop: 0, marginBottom: 3 },
};

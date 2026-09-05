import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator, StatusBar, Animated, BackHandler, Dimensions,
  ScrollView, TextInput, KeyboardAvoidingView, Platform, Vibration,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { T, R } from '../config/design';
import { wsManager } from '../services/WebSocketManager';

// Extrae datos de localStorage de Hunter Wallet y construye un resumen de contexto para Eris.
// Se inyecta después de que la app React haya montado (via injectJavaScript en onLoadEnd).
const HW_EXTRACT_JS = `
(function() {
  try {
    var SM = (function(){ try { var v=localStorage.getItem('hw_sm'); return v?JSON.parse(v):510000; } catch(e){ return 510000; } })();
    var now = new Date();
    var mes = now.getMonth();
    var ano = now.getFullYear();
    var ls = function(k, d) {
      try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e) { return d; }
    };

    var gastos  = ls('hw_gastos',  []);
    var presup  = ls('hw_presup',  {});
    var ahorros = ls('hw_ahorros', []);
    var meDeban = ls('hw_medeban', []);
    var ingresos = ls('hw_ingresos', []);

    var ingresoActual = ingresos.length
      ? ingresos.slice().sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); })[0].monto
      : 800000;

    var gastosMes = gastos.filter(function(g) {
      var d = new Date(g.fecha + 'T12:00:00');
      return d.getMonth() === mes && d.getFullYear() === ano;
    });

    var totalGasto = gastosMes.reduce(function(a,g){ return a+g.monto; }, 0);
    var ahorroAcum = ahorros.reduce(function(a,x){ return a+x.monto; }, 0);
    var pendiente  = meDeban.filter(function(d){ return !d.cobrado; }).reduce(function(a,d){ return a+d.monto; }, 0);
    var disponible = Math.max(0, ingresoActual - totalGasto);
    var savingsRate = ingresoActual > 0 ? Math.max(0, Math.min(100, ((ingresoActual - totalGasto) / ingresoActual) * 100)) : 0;

    var porCat = {};
    gastosMes.forEach(function(g){ porCat[g.cat] = (porCat[g.cat]||0) + g.monto; });

    var SALARY_TIERS = [
      {id:'F',min:0},{id:'E',min:SM},{id:'D',min:SM*2},{id:'C',min:SM*3.5},
      {id:'B',min:SM*5},{id:'A',min:SM*6},{id:'S',min:SM*8},{id:'SS',min:SM*10}
    ];
    var SAVINGS_TIERS = [
      {id:'F',min:0},{id:'E',min:1},{id:'D',min:SM*0.5},{id:'C',min:SM*2},
      {id:'B',min:SM*6},{id:'A',min:SM*15},{id:'S',min:SM*30},{id:'SS',min:SM*50}
    ];
    var getTier = function(tiers, val) {
      return tiers.slice().reverse().filter(function(t){ return val >= t.min; })[0] || tiers[0];
    };
    var tierIdx = function(tiers, val) { return tiers.indexOf(getTier(tiers, val)); };

    var salaryTier  = getTier(SALARY_TIERS,  ingresoActual);
    var savingsTier = getTier(SAVINGS_TIERS, ahorroAcum);
    var si = tierIdx(SALARY_TIERS,  ingresoActual);
    var vi = tierIdx(SAVINGS_TIERS, ahorroAcum);
    var hunterRank = ['F','E','D','C','B','A','S','SS'][Math.min(7, Math.floor(si*0.35 + vi*0.65 + 0.1))];

    var clp = function(n) { return '$' + Math.round(n).toLocaleString('es-CL'); };
    var MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    var CATS = {vivienda:'Vivienda',alimentacion:'Alimentacion',transporte:'Transporte',salud:'Salud',entretenimiento:'Entretenimiento',deuda:'Deuda',educacion:'Educacion',otros:'Otros'};

    var ctx = '\\n\\n## Finanzas del Usuario (Hunter Wallet):\\n';
    ctx += '- Sueldo: ' + clp(ingresoActual) + ' (' + (ingresoActual/SM).toFixed(1) + 'x SM)\\n';
    ctx += '- Hunter Rank: ' + hunterRank + ' | Sueldo: R.' + salaryTier.id + ' | Ahorro: R.' + savingsTier.id + '\\n';
    ctx += '- Gastos ' + MESES_ES[mes] + ' ' + ano + ': ' + clp(totalGasto) + '\\n';

    var cats = Object.keys(porCat).sort(function(a,b){ return porCat[b]-porCat[a]; });
    cats.forEach(function(cat) {
      var monto = porCat[cat];
      var p = presup[cat] || 0;
      ctx += '  · ' + (CATS[cat]||cat) + ': ' + clp(monto);
      if (p > 0) ctx += ' / ' + clp(p) + ' presup (' + Math.round((monto/p)*100) + '%)';
      ctx += '\\n';
    });

    ctx += '- Disponible: ' + clp(disponible) + '\\n';
    ctx += '- Tasa ahorro: ' + savingsRate.toFixed(0) + '%\\n';
    ctx += '- Ahorro acumulado: ' + clp(ahorroAcum) + '\\n';
    if (pendiente > 0) ctx += '- Me deben (pendiente): ' + clp(pendiente) + '\\n';

    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'hw_context', context: ctx }));
  } catch(e) {}
})();
true;
`;

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
  onExit?: () => void;
  onGoToEris?: () => void;
}

export default function HunterWalletScreen({ onExit, onGoToEris }: Props) {
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const btnAnim = useRef(new Animated.Value(0)).current;
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  // Panel state
  const hwContextRef = useRef<string>('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMessages, setPanelMessages] = useState<PanelMessage[]>([]);
  const [panelInput, setPanelInput] = useState('');
  const [panelProcessing, setPanelProcessing] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('auto');
  const panelAnim = useRef(new Animated.Value(0)).current;
  const panelScrollRef = useRef<ScrollView>(null);
  const panelOpenRef = useRef(false);
  const panelSlide = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [PANEL_H, 0] });

  useEffect(() => {
    (async () => {
      try {
        const asset = Asset.fromModule(require('../../assets/hunter-wallet.html'));
        await asset.downloadAsync();
        const res = await fetch(asset.localUri!);
        setHtmlContent(await res.text());
      } catch (e) {
        console.warn('[HunterWallet] Error loading HTML:', e);
      }
    })();
  }, []);

  // WebSocket subscription — rutea mensajes al panel
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
    return () => unsub();
  }, []);

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

  const sendPanelMessage = useCallback((text: string) => {
    if (!text.trim() || panelProcessing) return;
    Vibration.vibrate(25);
    setPanelMessages(prev => [...prev, { id: Math.random().toString(), role: 'user', content: text.trim(), isComplete: true }]);
    setPanelProcessing(true);
    setPanelInput('');
    wsManager.sendMessage({ type: 'message', content: text.trim(), mode: panelMode });
  }, [panelProcessing, panelMode]);

  const handleErisPress = useCallback(() => {
    webViewRef.current?.injectJavaScript(HW_EXTRACT_JS);
    openPanel();
  }, [openPanel]);

  const handleLoadEnd = useCallback(() => {
    setLoading(false);
    Animated.spring(btnAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }).start();
    // Extrae el contexto financiero después de que React monte completamente
    setTimeout(() => {
      webViewRef.current?.injectJavaScript(HW_EXTRACT_JS);
    }, 800);
  }, [btnAnim]);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'hw_context' && msg.context) {
        hwContextRef.current = msg.context;
        wsManager.sendMessage({ type: 'update_financial_context', context: msg.context });
      }
    } catch {}
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (panelOpenRef.current) { closePanel(); return true; }
      exitRef.current?.();
      return true;
    });
    return () => sub.remove();
  }, [closePanel]);

  const btnScale = btnAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const btnOpacity = btnAnim;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {htmlContent ? (
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent, baseUrl: 'about:blank' }}
          style={s.webview}
          onLoadEnd={handleLoadEnd}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mixedContentMode="always"
          originWhitelist={['*']}
          scrollEnabled
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={s.loadingFull}>
          <ActivityIndicator size="large" color={T.accent} />
        </View>
      )}

      {loading && htmlContent && (
        <View style={s.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={T.accent} />
        </View>
      )}

      {/* Botón ⚡ Consultar Eris */}
      <Animated.View
        style={[s.erisBtnWrap, { bottom: insets.bottom + 82, opacity: btnOpacity, transform: [{ scale: btnScale }] }]}
        pointerEvents={loading ? 'none' : 'box-none'}
      >
        <TouchableOpacity style={s.erisBtn} onPress={handleErisPress} activeOpacity={0.85}>
          <Text style={s.erisBtnIcon}>⚡</Text>
          <Text style={s.erisBtnText}>Consultar Eris</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Botón salir */}
      <Animated.View
        style={[
          s.exitBtn,
          { bottom: insets.bottom + 28, opacity: btnOpacity, transform: [{ scale: btnScale }] },
        ]}
        pointerEvents={loading ? 'none' : 'box-none'}
      >
        <TouchableOpacity onPress={onExit} style={s.exitTouch} activeOpacity={0.75}>
          <Text style={s.exitText}>✕</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Panel de chat */}
      {panelOpen && (
        <Animated.View style={[s.panel, { transform: [{ translateY: panelSlide }] }]}>
          <View style={s.panelHandle} />
          <View style={s.panelHeader}>
            <View style={s.panelHeaderLeft}>
              <Text style={s.panelHeaderIcon}>⚡</Text>
              <Text style={s.panelHeaderTitle}>Eris Finanzas</Text>
            </View>
            <View style={s.panelHeaderRight}>
              {onGoToEris && (
                <TouchableOpacity style={s.panelGoErisBtn} onPress={onGoToEris} activeOpacity={0.8}>
                  <Text style={s.panelGoErisBtnText}>Ir a Eris →</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.panelCloseBtn} onPress={closePanel} activeOpacity={0.7}>
                <Text style={s.panelCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            ref={panelScrollRef}
            style={s.panelMessages}
            contentContainerStyle={s.panelMessagesContent}
            onContentSizeChange={() => panelScrollRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
          >
            {panelMessages.length === 0 && (
              <View style={s.panelEmptyState}>
                <Text style={s.panelEmptyHint}>Pregunta sobre tus finanzas, gastos, ahorro o rango Hunter.</Text>
                <TouchableOpacity
                  style={s.analyzeChip}
                  onPress={() => sendPanelMessage(hwContextRef.current
                    ? `Analiza mi situación financiera actual y dame recomendaciones concretas.${hwContextRef.current}`
                    : '¿Puedes analizar mis finanzas y darme recomendaciones?'
                  )}
                  activeOpacity={0.8}
                >
                  <Text style={s.analyzeChipText}>📊 Analizar mis finanzas</Text>
                </TouchableOpacity>
              </View>
            )}
            {panelMessages.map(msg => (
              <View key={msg.id} style={[s.panelBubbleWrap, msg.role === 'user' ? s.panelBubbleWrapUser : s.panelBubbleWrapBot]}>
                {msg.role === 'assistant' && (
                  <View style={s.panelAvatar}><Text style={s.panelAvatarText}>⚡</Text></View>
                )}
                <View style={[s.panelBubble, msg.role === 'user' ? s.panelBubbleUser : s.panelBubbleBot]}>
                  {msg.thinking ? (
                    <View style={s.panelThinkBlock}>
                      <Text style={s.panelThinkLabel}>{msg.isComplete ? '🧠 Razón interna' : '🧠 Pensando...'}</Text>
                    </View>
                  ) : null}
                  {!msg.isComplete && !msg.content && !msg.thinking
                    ? <Text style={s.panelTyping}>· · ·</Text>
                    : msg.role === 'user'
                      ? <Text style={s.panelBubbleTextUser}>{msg.content}</Text>
                      : <Markdown style={panelMdStyles}>{msg.content || ''}</Markdown>
                  }
                  {msg.modeUsed && msg.role === 'assistant' && (
                    <View style={[s.panelModeBadge, msg.modeUsed === 'flash' ? s.panelModeBadgeFlash : s.panelModeBadgeDeep]}>
                      <Text style={s.panelModeBadgeText}>{msg.modeUsed === 'flash' ? '⚡ Flash' : '🧠 Deep'}</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>

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

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[s.panelInputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <TextInput
                style={s.panelInputField}
                value={panelInput}
                onChangeText={setPanelInput}
                placeholder="Pregunta sobre tus finanzas…"
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
  root: { flex: 1, backgroundColor: '#04040f' },
  webview: { flex: 1, backgroundColor: '#04040f' },
  loadingFull: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#04040f' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#04040f',
  },
  exitBtn: { position: 'absolute', right: 20 },
  exitTouch: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(10,8,30,0.92)',
    borderWidth: 1, borderColor: 'rgba(120,80,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7c3aed', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  exitText: { color: '#8080c0', fontSize: 16, fontWeight: '700' },

  // Botón ⚡ Consultar Eris
  erisBtnWrap: { position: 'absolute', right: 20 },
  erisBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: T.bgCard,
    borderWidth: 1, borderColor: T.borderActive,
    borderRadius: R.full,
    paddingVertical: 12, paddingHorizontal: 18,
    shadowColor: T.accent, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  erisBtnIcon: { fontSize: 16 },
  erisBtnText: { color: T.accent, fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },

  // Panel de chat
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: PANEL_H,
    backgroundColor: T.bgCard,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: T.borderActive,
    shadowColor: T.accent, shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 24,
  },
  panelHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: T.textMuted, alignSelf: 'center',
    marginTop: 10, marginBottom: 2, opacity: 0.4,
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
    backgroundColor: T.accentGlow, borderWidth: 1, borderColor: 'rgba(34,211,238,0.45)',
    borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12,
  },
  panelGoErisBtnText: { color: T.accent, fontWeight: '700', fontSize: 12, letterSpacing: 0.3 },
  panelCloseBtn: { padding: 4 },
  panelCloseBtnText: { color: T.textMuted, fontSize: 20, fontWeight: '300' },
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
  panelBubbleUser: { backgroundColor: T.userBg, borderWidth: 1, borderColor: T.userBorder, borderBottomRightRadius: 4 },
  panelBubbleBot: { backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, borderBottomLeftRadius: 4 },
  panelBubbleTextUser: { color: T.text },
  panelTyping: { color: T.accent, fontSize: 18, letterSpacing: 4, paddingVertical: 2 },
  panelEmptyState: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 12, gap: 16 },
  panelEmptyHint: { color: T.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  analyzeChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.accentGlow, borderWidth: 1, borderColor: 'rgba(34,211,238,0.45)',
    borderRadius: 20, paddingVertical: 10, paddingHorizontal: 18,
  },
  analyzeChipText: { color: T.accent, fontWeight: '700', fontSize: 13 },
  panelModeRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: T.border,
  },
  panelModeBtn: { flex: 1, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
  panelModeBtnAutoActive: { backgroundColor: 'rgba(168,85,247,0.15)', borderColor: '#a855f7' },
  panelModeBtnFlashActive: { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: '#f59e0b' },
  panelModeBtnDeepActive: { backgroundColor: T.accentGlow, borderColor: T.accent },
  panelModeBtnText: { fontSize: 10, fontWeight: '700', color: T.textMuted, letterSpacing: 0.3 },
  panelModeBtnTextActive: { color: T.text },
  panelThinkBlock: {
    backgroundColor: 'rgba(168,85,247,0.08)', borderLeftWidth: 2, borderLeftColor: '#a855f7',
    borderRadius: 6, padding: 8, marginBottom: 8,
  },
  panelThinkLabel: { fontSize: 10, fontWeight: '800', color: '#a855f7', letterSpacing: 1 },
  panelModeBadge: { marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  panelModeBadgeFlash: { backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  panelModeBadgeDeep: { backgroundColor: T.accentGlow, borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)' },
  panelModeBadgeText: { fontSize: 9, fontWeight: '700', color: T.text },
  panelInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
  },
  panelInputField: {
    flex: 1, backgroundColor: T.bg, color: T.text, borderRadius: 16,
    borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 80,
  },
  panelSendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: T.accent,
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

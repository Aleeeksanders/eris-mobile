import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator, StatusBar, Animated, BackHandler, Alert, DeviceEventEmitter,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../config/design';
import { AuthStorage } from '../services/AuthStorage';
import { HW_EXTRACT_JS, publishFinanceContext } from '../services/hwExtract';
import { financeBridge, applyOpsJS } from '../services/FinanceBridge';
import { moduleHtml } from '../services/ModuleHtml';
import {
  onFinanceDump, restoreJS, restoreFinanceBackup, fechaHora,
  RESTORE_APPLY_EVENT, RESTORE_DONE_EVENT, RESTORE_OFFER_EVENT, type BackupCopy, type FinanceDump,
} from '../services/financeBackup';
import { ErisMarkView } from '../../modules/eris-bubble/ErisMarkView';
import { PersonaStore } from '../config/persona';

interface Props {
  onExit?: () => void;
  /**
   * false mientras Finanzas está montada pero oculta (se mantiene viva tras la primera apertura para que volver a
   * entrar sea instantáneo): no captura el botón atrás.
   */
  active?: boolean;
  /** Avisa si la app web está lista: el portal de entrada espera esto antes de abrirse. */
  onReadyChange?: (ready: boolean) => void;
}

const dayKeyNow = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/** La carga de los módulos: el ícono de Eris "pensando" en el color de Finanzas (antes, una ruedita genérica). */
function Loader() {
  return (
    <ErisMarkView size={72} state="thinking" tint="finanzas" persona={PersonaStore.get()} disc={false}
      fallback={<ActivityIndicator size="large" color={T.accent} />} />
  );
}

export default function HunterWalletScreen({ onExit, active = true, onReadyChange }: Props) {
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  // La app web calcula "hoy" y aplica los recurrentes del mes al montar: si quedó viva de un día para otro, se
  // vuelve a montar al entrar (cambia la key del WebView).
  const [dayKey, setDayKey] = useState(dayKeyNow);
  // Después de restaurar un respaldo también se vuelve a montar
  const [reloads, setReloads] = useState(0);
  const btnAnim = useRef(new Animated.Value(0)).current;
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const readyRef = useRef<(r: boolean) => void>(() => {});
  readyRef.current = (r: boolean) => onReadyChange?.(r);

  useEffect(() => {
    (async () => {
      try {
        // El HTML ya viene precargado (ModuleHtml): no se espera al disco en cada apertura
        const [creds, html] = await Promise.all([AuthStorage.getCredentials(), moduleHtml('wallet')]);
        setProfileId(creds?.profileId ?? 'anon');
        setHtmlContent(html);
      } catch (e) {
        console.warn('[HunterWallet] Error loading HTML:', e);
        setProfileId('anon');
        readyRef.current(true); // que el portal no quede esperando
      }
    })();
  }, []);

  const handleLoadEnd = useCallback(() => {
    setLoading(false);
    readyRef.current(true);
    Animated.spring(btnAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }).start();
    // Extrae el contexto financiero después de que la app web monte completamente
    setTimeout(() => {
      webViewRef.current?.injectJavaScript(HW_EXTRACT_JS);
    }, 800);
  }, [btnAnim]);

  // Al volver a entrar (la vista quedó viva): si cambió el día se vuelve a montar; si no, se refresca lo que
  // Eris sabe de Finanzas
  useEffect(() => {
    if (!active || loading) return;
    if (dayKeyNow() !== dayKey) { setLoading(true); readyRef.current(false); setDayKey(dayKeyNow()); return; }
    webViewRef.current?.injectJavaScript(HW_EXTRACT_JS);
  }, [active]);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      // Finanzas avisa (con debounce) cada vez que guarda algo: se vuelve a
      // extraer el resumen para que Eris vea el gasto recién anotado.
      if (msg.type === 'hw_changed') {
        webViewRef.current?.injectJavaScript(HW_EXTRACT_JS);
        return;
      }
      // Resultado de algo que Eris anotó por chat (ver FinanceBridge)
      if (msg.type === 'hw_ops_result') {
        financeBridge.onResults(msg.reqId, msg.results);
        return;
      }
      // Respaldo: todo lo de Finanzas, cifrado en el PC (services/financeBackup.ts)
      if (msg.type === 'hw_backup') { onFinanceDump(msg.dump); return; }
      // Se aplicó un respaldo: se avisa y se vuelve a montar para que se vea lo restaurado
      if (msg.type === 'hw_restored') {
        const r = msg.result || {};
        DeviceEventEmitter.emit(RESTORE_DONE_EVENT, { requestId: msg.requestId, ok: r.ok === true, motivo: r.motivo });
        if (r.ok) { setLoading(true); readyRef.current(false); setReloads((n) => n + 1); }
        return;
      }
      publishFinanceContext(msg, profileId);
    } catch {}
  }, [profileId]);

  // Con Finanzas cargada (visible u oculta), lo que Eris anote por chat se aplica aquí mismo
  useEffect(() => {
    if (loading) return;
    financeBridge.setVisible((reqId, ops) => {
      if (!webViewRef.current) return false;
      webViewRef.current.injectJavaScript(applyOpsJS(reqId, ops));
      return true;
    });
    return () => financeBridge.setVisible(null);
  }, [loading]);

  // Restaurar un respaldo (desde Perfil o desde el aviso de abajo): se aplica en este mismo WebView
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(RESTORE_APPLY_EVENT, (p: { requestId: string; dump: FinanceDump }) => {
      if (!webViewRef.current || loading) {
        DeviceEventEmitter.emit(RESTORE_DONE_EVENT, { requestId: p.requestId, ok: false, motivo: 'Finanzas todavía está cargando' });
        return;
      }
      webViewRef.current.injectJavaScript(restoreJS(p.requestId, p.dump));
    });
    return () => sub.remove();
  }, [loading]);

  // Finanzas vacía en este teléfono pero con un respaldo en el PC (reinstalaste, borraste los datos de la app): se
  // ofrece restaurarlo al entrar, una vez por sesión
  const [offer, setOffer] = useState<BackupCopy | null>(null);
  const offered = useRef(false);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(RESTORE_OFFER_EVENT, (c: BackupCopy) => { if (!offered.current) setOffer(c); });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!offer || !active || loading || offered.current) return;
    offered.current = true;
    Alert.alert(
      'Tienes un respaldo de tus finanzas',
      `En el PC hay una copia del ${fechaHora(offer.at)} con ${offer.stats.tx} movimientos y ${offer.stats.cuentas} cuentas, y Finanzas está vacía en este teléfono. ¿La restauro?`,
      [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Restaurar', onPress: async () => { const r = await restoreFinanceBackup(offer.day); Alert.alert(r.ok ? 'Finanzas restaurada' : 'No se pudo restaurar', r.message); } },
      ],
    );
  }, [offer, active, loading]);

  // El botón atrás cierra Finanzas solo mientras está en pantalla (oculta no debe tragarse el "atrás" de la app)
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      exitRef.current?.();
      return true;
    });
    return () => sub.remove();
  }, [active]);

  const btnScale = btnAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const btnOpacity = btnAnim;

  // Inyecta el perfil ANTES de que corra el JS del HTML, para que el scoping
  // por perfil de localStorage (ver PROFILE_ID en hunter-wallet.html) esté
  // disponible desde el primer render — mismo patrón que TojiScreen.
  const injectedJS = `
    window.__ERIS_PROFILE_ID__ = ${JSON.stringify(profileId || 'anon')};
    true;
  `;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {active && <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />}

      {htmlContent && profileId !== null ? (
        <WebView
          key={`${dayKey}:${reloads}`}
          ref={webViewRef}
          // baseUrl estable: 'about:blank' no da un origen persistente en Android
          // WebView, así que localStorage (hw_setup_done, hw_ingresos, etc.) no
          // sobrevive entre aperturas — la pantalla siempre volvía al onboarding.
          source={{ html: htmlContent, baseUrl: 'file:///android_asset/' }}
          style={s.webview}
          injectedJavaScriptBeforeContentLoaded={injectedJS}
          onLoadEnd={handleLoadEnd}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowsInlineMediaPlayback
          mixedContentMode="always"
          originWhitelist={['*']}
          scrollEnabled
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={s.loadingFull}><Loader /></View>
      )}

      {loading && htmlContent && (
        <View style={s.loadingOverlay} pointerEvents="none"><Loader /></View>
      )}

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
});

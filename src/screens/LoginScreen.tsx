import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Animated, Easing, StatusBar, KeyboardAvoidingView,
  Platform, ScrollView, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthStorage } from '../services/AuthStorage';
import { wsManager } from '../services/WebSocketManager';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
// Antes esta pantalla redefinía sus propios colores en vez de usar el sistema de diseño compartido — cualquier
// ajuste de paleta (config/design.ts) no le llegaba, y con el tiempo podían divergir sin que nadie lo notara
// (era la primera pantalla que ve cualquiera, así que el riesgo de "se ve distinta" era justo el peor lugar).
import { T } from '../config/design';

interface Props {
  onLogin: (profileId: string, pin: string) => void | Promise<void>;
}

// WEB CLIENT ID de Google Cloud Console — Proyecto: AXS-Eris. El servidor exige que el token venga de ESTE cliente.
const GOOGLE_WEB_CLIENT_ID = '860030727214-nqc6sm8o3v1fl5d2l2h63932an47r6dv.apps.googleusercontent.com';

/**
 * Acceso SOLO con Google. El servidor verifica tu cuenta con Google y te entrega un perfil cifrado que solo esa cuenta
 * puede abrir; no hay ID ni PIN que escribir. Si ya tenías un perfil creado con el acceso anterior, la primera vez se
 * vincula a tu cuenta (con el PIN que este teléfono ya tenía guardado, o pidiéndotelo una sola vez).
 */
export default function LoginScreen({ onLogin }: Props) {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);

  // Vincular un perfil anterior: el servidor encontró uno con tu alias (o el PIN guardado ya no sirve)
  const [linkModal, setLinkModal] = useState<null | { candidate: string; idToken: string; name: string; pin: string; error: string }>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const formSlide = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const animateIn = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(formSlide, { toValue: 0, duration: 600, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, offlineAccess: false });
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ─── Sesión guardada: reconectar sin volver a pasar por Google ──────────────
  useEffect(() => {
    const tryAutoLogin = async () => {
      const session = await AuthStorage.getSession();
      if (!session) {
        if (mountedRef.current) { setIsConnecting(false); animateIn(); }
        return;
      }
      // Si App.tsx ya conectó antes de que montáramos, se usa esa conexión
      if (wsManager.getStatus() === 'connected' && wsManager.getLastConnectedPayload()) {
        if (mountedRef.current) { setIsConnecting(false); onLogin(session.profileId, ''); }
        return;
      }
      wsManager.setCredentials(session.profileId);
      wsManager.setAuth({ session: session.token });
      wsManager.connect();

      const timeout = setTimeout(() => {
        unsub();
        if (mountedRef.current) { setIsConnecting(false); animateIn(); }
      }, 10000);

      const unsub = wsManager.subscribeMessage(async (data) => {
        if (!mountedRef.current) return;
        if (data.type === 'connected') {
          clearTimeout(timeout); unsub();
          onLogin(data.profileId || session.profileId, '');
        } else if (data.type === 'auth_error' || data.type === 'error') {
          clearTimeout(timeout); unsub();
          if (data.type === 'auth_error') await AuthStorage.clearCredentials(); // sesión vencida o revocada
          if (mountedRef.current) { setIsConnecting(false); animateIn(); }
        }
      });
    };
    tryAutoLogin();
  }, []);

  // ─── Conectar con el ID token de Google ─────────────────────────────────────
  const connectWithGoogle = (params: { idToken: string; name: string; link?: { profileId: string; pin: string }; forceNew?: boolean }) => {
    setBusy(true);
    setError('');
    wsManager.disconnect();
    wsManager.setAuth({ google: { idToken: params.idToken, link: params.link, forceNew: params.forceNew } });
    wsManager.connect();

    const timeout = setTimeout(() => {
      unsub();
      if (mountedRef.current) { setBusy(false); setError('No pude conectar con el servidor. Revisa que Eris esté encendida.'); }
    }, 20000);

    const unsub = wsManager.subscribeMessage(async (data) => {
      if (!mountedRef.current) return;
      if (data.type === 'connected') {
        clearTimeout(timeout); unsub();
        setBusy(false);
        setLinkModal(null);
        await AuthStorage.clearLegacy(); // el PIN viejo ya no sirve para nada (el perfil quedó ligado a tu cuenta)
        // Cuenta nueva: guardar el nombre de Google como nombre del perfil
        if (!data.userProfile?.displayName && params.name) {
          wsManager.sendMessage({ type: 'save_profile', profile: { displayName: params.name, language: 'es' } });
        }
        onLogin(data.profileId, '');
      } else if (data.type === 'auth_error') {
        clearTimeout(timeout); unsub();
        setBusy(false);
        wsManager.disconnect();
        if (data.code === 'link_required' && data.candidate) {
          // Existe un perfil anterior con tu alias: hay que vincularlo (o crear uno nuevo a propósito)
          setLinkModal({ candidate: String(data.candidate), idToken: params.idToken, name: params.name, pin: '', error: '' });
        } else if (data.code === 'link_failed' && params.link) {
          // El PIN guardado en el teléfono ya no coincide: pedirlo una vez
          setLinkModal({ candidate: params.link.profileId, idToken: params.idToken, name: params.name, pin: '', error: data.message || 'El PIN no coincide.' });
        } else {
          setError(data.message || 'No se pudo iniciar sesión.');
        }
      } else if (data.type === 'error') {
        clearTimeout(timeout); unsub();
        setBusy(false);
        setError(data.message || 'Error al conectar.');
      }
    });
  };

  const handleGoogleSignIn = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signOut().catch(() => {}); // fuerza el selector de cuenta
      const response = await GoogleSignin.signIn();
      const user = response.data?.user;
      const idToken = response.data?.idToken;
      if (!user?.email || !idToken) throw new Error('Google no entregó tu identidad. Intenta de nuevo.');
      const name = user.name || user.givenName || user.email.split('@')[0];
      await AuthStorage.setDisplayName(name);

      // Migración silenciosa: si este teléfono ya tenía el PIN del perfil anterior, se manda una vez para vincularlo
      const candidates = await AuthStorage.getLegacyCandidates(user.email.split('@')[0]);
      connectWithGoogle({ idToken, name, link: candidates[0] });
    } catch (err: any) {
      if (!mountedRef.current) return;
      setBusy(false);
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (err.code === statusCodes.IN_PROGRESS) setError('Inicio de sesión en progreso.');
      else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) setError('Google Play Services no disponible.');
      else setError(err.message || 'Error con Google Sign-In.');
    }
  };

  // ─── Pantalla de conexión automática ──────────────────────
  if (isConnecting) {
    return (
      <View style={[s.safe, s.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <Animated.View style={[s.logoGlow, { transform: [{ scale: pulseAnim }] }]} />
        <Text style={s.logoIcon}>⚡</Text>
        <Text style={s.logoTitle}>ERIS</Text>
        <Text style={[s.logoSub, { marginTop: 8 }]}>Conectando...</Text>
      </View>
    );
  }

  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fadeAnim }}>
            <Animated.View style={[s.logoSection, { transform: [{ scale: logoScale }] }]}>
              <Animated.View style={[s.logoGlow, { transform: [{ scale: pulseAnim }] }]} />
              <Text style={s.logoIcon}>⚡</Text>
              <Text style={s.logoTitle}>ERIS</Text>
              <Text style={s.logoSub}>Sovereign Intelligence Feed</Text>
              <View style={s.logoTag}>
                <Text style={s.logoTagText}>🛡️ ZERO-KNOWLEDGE</Text>
              </View>
            </Animated.View>

            <Animated.View style={[s.form, { transform: [{ translateY: formSlide }] }]}>
              <Text style={s.formTitle}>Bienvenido a Eris</Text>
              <Text style={s.formSub}>
                Entra con tu cuenta de Google. Tu perfil queda cifrado y solo esa cuenta puede abrirlo: no hay ID ni PIN que recordar.
              </Text>

              {error ? <Text style={s.error}>{error}</Text> : null}

              <TouchableOpacity style={[s.btnGoogle, busy && s.btnLoading]} onPress={handleGoogleSignIn} disabled={busy}>
                <Text style={s.btnGoogleIcon}>G</Text>
                <Text style={s.btnGoogleText}>{busy ? 'Conectando...' : 'Continuar con Google'}</Text>
              </TouchableOpacity>

              <Text style={s.hint}>🔒 Tus datos de salud y finanzas se guardan cifrados</Text>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Vincular el perfil que ya tenías (creado con el acceso anterior) */}
      <Modal visible={!!linkModal} transparent animationType="fade" onRequestClose={() => setLinkModal(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Vincula tu perfil anterior</Text>
            <Text style={s.modalSub}>
              Encontré el perfil «{linkModal?.candidate}». Si es tuyo, escribe su PIN (o su Llave de Recuperación) una sola vez para vincularlo a tu cuenta de Google. Después no volverás a usar PIN.
            </Text>
            <TextInput
              style={s.input}
              placeholder="PIN o Llave de Recuperación"
              placeholderTextColor={T.textMuted}
              value={linkModal?.pin || ''}
              onChangeText={(v) => setLinkModal(prev => prev ? { ...prev, pin: v, error: '' } : prev)}
              autoCapitalize="characters"
              autoCorrect={false}
              secureTextEntry
            />
            {linkModal?.error ? <Text style={s.error}>{linkModal.error}</Text> : null}
            <TouchableOpacity
              style={[s.btnPrimary, (!linkModal?.pin.trim() || busy) && s.btnLoading]}
              disabled={!linkModal?.pin.trim() || busy}
              onPress={() => linkModal && connectWithGoogle({ idToken: linkModal.idToken, name: linkModal.name, link: { profileId: linkModal.candidate, pin: linkModal.pin.trim() } })}
            >
              <Text style={s.btnPrimaryText}>{busy ? 'VINCULANDO...' : 'VINCULAR'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.aliasSkip}
              onPress={() => linkModal && connectWithGoogle({ idToken: linkModal.idToken, name: linkModal.name, forceNew: true })}
            >
              <Text style={s.aliasSkipText}>No es mío: crear un perfil nuevo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.aliasSkip} onPress={() => setLinkModal(null)}>
              <Text style={s.aliasSkipText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { flexGrow: 1, padding: 28, justifyContent: 'center' },

  logoSection: { alignItems: 'center', marginBottom: 40, position: 'relative' },
  logoGlow: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: T.accent, opacity: 0.07,
  },
  logoIcon: { fontSize: 52, marginBottom: 12 },
  logoTitle: { fontSize: 42, fontWeight: '900', color: T.text, letterSpacing: 12, marginBottom: 6 },
  logoSub: { fontSize: 12, color: T.textMuted, letterSpacing: 2, marginBottom: 14 },
  logoTag: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
    backgroundColor: T.accentGlow, borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)',
  },
  logoTagText: { fontSize: 10, fontWeight: '800', color: T.accent, letterSpacing: 1.5 },

  form: { backgroundColor: T.bgCard, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: T.border },

  formTitle: { fontSize: 22, fontWeight: '800', color: T.text, marginBottom: 8 },
  formSub: { fontSize: 13, color: T.textMuted, lineHeight: 20, marginBottom: 20 },

  input: {
    backgroundColor: T.bgInput, color: T.text,
    borderRadius: 12, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, marginBottom: 12,
  },

  error: {
    color: T.red, fontSize: 13, marginBottom: 12,
    backgroundColor: T.redGlow, padding: 10, borderRadius: 8,
  },

  btnPrimary: {
    backgroundColor: T.accent, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: T.accent, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  btnLoading: { backgroundColor: T.textMuted, shadowOpacity: 0 },
  btnPrimaryText: { color: '#000', fontWeight: '900', fontSize: 14, letterSpacing: 1.5 },

  // ─── Google Button ───────────────────────────────────────
  btnGoogle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ffffff', borderRadius: 14,
    paddingVertical: 14, marginBottom: 4, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  btnGoogleIcon: {
    fontSize: 16, fontWeight: '900', color: '#4285F4',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  btnGoogleText: { color: '#1a1a1a', fontWeight: '700', fontSize: 14 },

  // ─── Divider ─────────────────────────────────────────────
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: T.border },
  dividerText: { color: T.textMuted, fontSize: 11, fontWeight: '600' },

  hint: { color: T.textMuted, fontSize: 11, textAlign: 'center', marginTop: 14 },
  footer: { color: T.textMuted, fontSize: 11, textAlign: 'center', marginTop: 32, letterSpacing: 1 },

  // ─── Login manual ────────────────────────────────────────
  pinToggle: { marginTop: 20, alignItems: 'center', paddingVertical: 8 },
  pinToggleText: { color: T.textMuted, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
  pinForm: { marginTop: 12, gap: 10 },

  rkToggle: { marginTop: 8, alignItems: 'center', paddingVertical: 6 },
  rkToggleText: { color: '#22d3ee', fontSize: 11, fontWeight: '600', textDecorationLine: 'underline', opacity: 0.8 },
  rkForm: { marginTop: 10, gap: 10 },
  rkHint: { color: T.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },

  // ─── Modal de Alias ──────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: '#0e0e18',
    borderRadius: 20, padding: 28,
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.2)',
    shadowColor: T.accent, shadowOpacity: 0.15, shadowRadius: 24, elevation: 20,
  },
  modalHeader: { alignItems: 'center', marginBottom: 24 },
  modalEmoji: { fontSize: 36, marginBottom: 12 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: T.text, marginBottom: 8 },
  modalSub: { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },

  aliasInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.bgInput, borderRadius: 12,
    borderWidth: 1, borderColor: T.accent,
    paddingHorizontal: 14, marginBottom: 8,
  },
  aliasAt: { fontSize: 18, fontWeight: '700', color: T.accent, marginRight: 4 },
  aliasInput: {
    flex: 1, color: T.text, fontSize: 18, fontWeight: '600',
    paddingVertical: 14, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  aliasHint: { fontSize: 12, marginBottom: 12, fontWeight: '600' },
  aliasHintOk: { color: '#4ade80' },
  aliasHintError: { color: T.red },
  aliasTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  aliasTag: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20, borderWidth: 1, borderColor: T.border,
  },
  aliasTagText: { fontSize: 10, color: T.textMuted, fontWeight: '600' },
  aliasSkip: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  aliasSkipText: { fontSize: 13, color: T.textMuted },
});


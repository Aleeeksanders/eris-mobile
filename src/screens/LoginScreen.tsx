import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Animated, Easing, StatusBar, KeyboardAvoidingView,
  Platform, ScrollView, Modal, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthStorage } from '../services/AuthStorage';
import { wsManager } from '../services/WebSocketManager';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { NetworkConfig } from '../config/env';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Palabras reservadas que no pueden usarse como alias ────
const RESERVED_IDS = ['ikaros', 'hestia', 'eris', 'admin', 'root', 'system', 'axs', 'god', 'default'];

function validateAlias(alias: string): string | null {
  if (alias.length < 3) return 'Mínimo 3 caracteres';
  if (alias.length > 20) return 'Máximo 20 caracteres';
  if (!/^[a-z0-9_]+$/.test(alias)) return 'Solo letras minúsculas, números y guion bajo';
  if (RESERVED_IDS.includes(alias)) return 'Este ID está reservado';
  return null;
}

// ─── Design Tokens ──────────────────────────────────────────
const T = {
  bg: '#08080a',
  bgCard: '#0e0e12',
  bgInput: '#12121a',
  accent: '#22d3ee',
  accentGlow: 'rgba(34,211,238,0.18)',
  purple: '#a855f7',
  purpleGlow: 'rgba(168,85,247,0.15)',
  text: '#f8fafc',
  muted: '#64748b',
  border: 'rgba(255,255,255,0.07)',
  error: '#f43f5e',
  errorBg: 'rgba(244,63,94,0.1)',
};

interface Props {
  onLogin: (profileId: string, pin: string) => void | Promise<void>;
}

function generateSecurePin(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return Math.random().toString(36).slice(2, 6).toUpperCase() +
         Math.random().toString(36).slice(2, 6).toUpperCase();
}

// WEB CLIENT ID de Google Cloud Console — Proyecto: AXS-Eris
const GOOGLE_WEB_CLIENT_ID = '860030727214-nqc6sm8o3v1fl5d2l2h63932an47r6dv.apps.googleusercontent.com';

export default function LoginScreen({ onLogin }: Props) {
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);

  // ─── Estado del modal de alias ─────────────────────────────
  const [aliasModal, setAliasModal] = useState<{
    visible: boolean;
    email: string;
    name: string;
    suggestedId: string;
    onConfirm: (alias: string) => void;
  } | null>(null);
  const [aliasInput, setAliasInput] = useState('');
  const [aliasError, setAliasError] = useState('');

  // ─── Login manual con ID + PIN ─────────────────────────────
  const [showPinLogin, setShowPinLogin] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [loginPin, setLoginPin] = useState('');

  // ─── Reset PIN con Llave de Recuperación ─────────────────
  const [showRkForm, setShowRkForm] = useState(false);
  const [rkInput, setRkInput] = useState('');
  const [rkLoading, setRkLoading] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const formSlide = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // BUG-08: ref para evitar setState en componente desmontado
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // ─── Pulso inmediato al montar (visible en pantalla de "Conectando...") ────
  useEffect(() => {
    // Inicializar Google Sign-In
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
    });

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Auto-login: intenta conectar con credenciales guardadas.
  // Si no hay credenciales, muestra el formulario inmediatamente.
  useEffect(() => {
    const tryAutoLogin = async () => {
      const creds = await AuthStorage.initializeIfNeeded();

      // Sin credenciales guardadas — mostrar formulario directo (BUG-07)
      if (!creds) {
        if (mountedRef.current) {
          setIsConnecting(false);
          animateIn();
        }
        return;
      }

      const { profileId, pin } = creds;

      const savedName = await AuthStorage.getDisplayName();
      if (savedName && mountedRef.current) setDisplayName(savedName);

      // Si App.tsx ya estableció la conexión antes de que montáramos, usarla directamente
      if (wsManager.getStatus() === 'connected' && wsManager.getLastConnectedPayload()) {
        if (mountedRef.current) {
          setIsConnecting(false);
          onLogin(profileId, pin);
        }
        return;
      }

      wsManager.setCredentials(profileId, pin);
      wsManager.connect();

      // BUG-05: timeout no desconecta el WS — solo deja de esperar y muestra formulario
      const timeout = setTimeout(() => {
        unsub();
        if (mountedRef.current) {
          setIsConnecting(false);
          animateIn();
        }
      }, 10000);

      const unsub = wsManager.subscribeMessage(async (data) => {
        if (!mountedRef.current) return; // BUG-08
        if (data.type === 'connected') {
          clearTimeout(timeout);
          unsub();
          onLogin(profileId, pin);
        } else if (data.type === 'error') {
          clearTimeout(timeout);
          unsub();
          const isAuthError = data.message && (
            data.message.toLowerCase().includes('pin') ||
            data.message.toLowerCase().includes('bloqueado') ||
            data.message.toLowerCase().includes('incorrecto') ||
            data.message.toLowerCase().includes('cifrado')
          );
          if (isAuthError) await AuthStorage.clearCredentials();
          if (mountedRef.current) {
            setIsConnecting(false);
            animateIn();
          }
        }
      });
    };

    tryAutoLogin();
  }, []);

  const animateIn = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(formSlide, { toValue: 0, duration: 600, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  };

  // ─── Conectar con Google después de elegir alias ─────────
  const connectGoogleProfile = async (params: {
    finalProfileId: string;
    googleName: string;
    googleEmail: string;
    isNew: boolean;
  }) => {
    const { finalProfileId, googleName, googleEmail, isNew } = params;

    const creds = await AuthStorage.initializeIfNeeded(finalProfileId);
    if (!creds) throw new Error('No se pudo inicializar el perfil.');
    const { pin } = creds;

    if (isNew) {
      try {
        // Usar la misma IP base que el WebSocket (sin /ws)
        const serverBase = NetworkConfig.CLOUD_URL.replace('ws://', 'http://').replace('/ws', '');
        await fetch(`${serverBase}/api/auth/notify-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: googleEmail, name: googleName, profileId: finalProfileId, pin }),
        });
      } catch (_) { /* fallo silencioso */ }
    }

    wsManager.setCredentials(finalProfileId, pin);
    wsManager.connect();

    const timeout = setTimeout(() => {
      unsub();
      if (mountedRef.current) {
        setGoogleLoading(false);
        setError('No se pudo conectar con el servidor. Verifica que Eris esté activo.');
      }
    }, 12000);

    const unsub = wsManager.subscribeMessage(async (data) => {
      if (!mountedRef.current) return;
      if (data.type === 'connected') {
        clearTimeout(timeout);
        unsub();
        wsManager.sendMessage({
          type: 'save_profile',
          profile: { displayName: googleName, language: 'es', customContext: `Google Account: ${googleEmail}` },
        });
        setGoogleLoading(false);
        onLogin(finalProfileId, pin);
      } else if (data.type === 'error') {
        clearTimeout(timeout);
        unsub();
        wsManager.disconnect();
        // El PIN local no coincide con el servidor (datos locales perdidos).
        // Limpiar el PIN incorrecto que se generó para no seguir bloqueando la cuenta.
        const isPinMismatch = data.message && (
          data.message.toLowerCase().includes('pin') ||
          data.message.toLowerCase().includes('incorrecto') ||
          data.message.toLowerCase().includes('bloqueado') ||
          data.message.toLowerCase().includes('llave')
        );
        if (isPinMismatch) {
          await AsyncStorage.removeItem(`eris_pin_${finalProfileId}`);
          setGoogleLoading(false);
          setShowPinLogin(true);
          setLoginId(finalProfileId);
          setError(
            `Acceso local perdido para "${finalProfileId}". Ingresa tu PIN (te lo enviamos por email al crear la cuenta) o usa tu Llave de Recuperación.`
          );
        } else {
          setGoogleLoading(false);
          setError(data.message || 'Error al conectar.');
        }
      }
    });
  };

  // ─── Google Sign-In ─────────────────────────────────
  const handleGoogleSignIn = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    setError('');
    try {
      await GoogleSignin.hasPlayServices();
      // Forzar selector de cuenta: signOut limpia la sesión cacheada
      // para que el usuario pueda elegir cuenta en cada acceso
      await GoogleSignin.signOut().catch(() => {});
      const response = await GoogleSignin.signIn();
      const userInfo = response.data?.user;

      if (!userInfo?.email) throw new Error('No se pudo obtener el email de Google.');

      const suggestedId = userInfo.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
      const googleName = userInfo.name || userInfo.givenName || suggestedId;

      await AuthStorage.setDisplayName(googleName);

      // Verificar si ya existe el perfil por su pin almacenado localmente
      const storedPin = await AsyncStorage.getItem(`eris_pin_${suggestedId}`);
      const isNewUser = !storedPin;

      if (isNewUser) {
        // Usuario nuevo → mostrar modal de alias
        setGoogleLoading(false);
        setAliasInput(suggestedId);
        setAliasError('');
        setAliasModal({
          visible: true,
          email: userInfo.email,
          name: googleName,
          suggestedId,
          onConfirm: async (chosenAlias: string) => {
            setAliasModal(null);
            setGoogleLoading(true);
            await connectGoogleProfile({
              finalProfileId: chosenAlias,
              googleName,
              googleEmail: userInfo.email,
              isNew: true,
            });
          },
        });
      } else {
        // Usuario existente → conectar directo
        await connectGoogleProfile({
          finalProfileId: suggestedId,
          googleName,
          googleEmail: userInfo.email,
          isNew: false,
        });
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      setGoogleLoading(false);
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        // Usuario canceló
      } else if (err.code === statusCodes.IN_PROGRESS) {
        setError('Inicio de sesión en progreso.');
      } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError('Google Play Services no disponible.');
      } else {
        setError(err.message || 'Error con Google Sign-In.');
      }
    }
  };

  // ─── Ingresar con ID + PIN existente ─────────────────────
  const handleManualLogin = async () => {
    const id = loginId.trim().toLowerCase();
    const pin = loginPin.trim().toUpperCase();
    if (!id || !pin) { setError('Ingresa tu ID y PIN.'); return; }
    if (loading) return;
    setLoading(true);
    setError('');

    wsManager.setCredentials(id, pin);
    wsManager.connect();

    const timeout = setTimeout(() => {
      unsub();
      if (mountedRef.current) {
        setLoading(false);
        setError('No se pudo conectar. Verifica que el servidor esté activo.');
      }
    }, 12000);

    const unsub = wsManager.subscribeMessage(async (data) => {
      if (!mountedRef.current) return;
      if (data.type === 'connected') {
        clearTimeout(timeout);
        unsub();
        await AuthStorage.saveCredentials(id, pin);
        setLoading(false);
        onLogin(id, pin);
      } else if (data.type === 'error') {
        clearTimeout(timeout);
        unsub();
        wsManager.disconnect();
        setLoading(false);
        const isAuthErr = data.message && (
          data.message.toLowerCase().includes('pin') ||
          data.message.toLowerCase().includes('incorrecto') ||
          data.message.toLowerCase().includes('bloqueado')
        );
        setError(isAuthErr ? 'ID o PIN incorrecto.' : (data.message || 'Error al conectar.'));
      }
    });
  };

  // ─── Reset PIN con Llave de Recuperación ─────────────────
  const handleResetWithRK = async () => {
    const id = loginId.trim().toLowerCase();
    const rk = rkInput.trim().toUpperCase();
    if (!id || !rk) { setError('Ingresa tu ID de perfil y tu Llave de Recuperación.'); return; }
    if (rkLoading) return;
    setRkLoading(true);
    setError('');
    try {
      const serverBase = NetworkConfig.CLOUD_URL.replace('ws://', 'http://').replace('/ws', '');
      const res = await fetch(`${serverBase}/api/auth/reset-pin-with-rk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: id, recoveryKey: rk }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Llave de Recuperación inválida.');
        setRkLoading(false);
        return;
      }
      // PIN nuevo asignado por el servidor — guardarlo y conectar
      const newPin: string = json.newPin;
      await AsyncStorage.setItem(`eris_pin_${id}`, newPin);
      setLoginPin(newPin);
      setShowRkForm(false);
      wsManager.setCredentials(id, newPin);
      wsManager.connect();
      const timeout = setTimeout(() => {
        unsub();
        if (mountedRef.current) {
          setRkLoading(false);
          setError('No se pudo conectar luego del reset. Usa el PIN que te enviamos por email.');
        }
      }, 12000);
      const unsub = wsManager.subscribeMessage(async (data) => {
        if (!mountedRef.current) return;
        if (data.type === 'connected') {
          clearTimeout(timeout);
          unsub();
          await AuthStorage.saveCredentials(id, newPin);
          setRkLoading(false);
          onLogin(id, newPin);
        } else if (data.type === 'error') {
          clearTimeout(timeout);
          unsub();
          wsManager.disconnect();
          setRkLoading(false);
          setError(data.message || 'Error al conectar con el nuevo PIN.');
        }
      });
    } catch (e: any) {
      setError('No se pudo contactar el servidor. Verifica tu conexión.');
      setRkLoading(false);
    }
  };

  // ─── Conectar sin cuenta Google (flujo manual) ────────────
  const handleConnect = async () => {
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      let creds = await AuthStorage.initializeIfNeeded();
      let newlyCreatedPin: string | null = null;

      if (!creds) {
        // Primera vez — crear perfil desde el nombre ingresado
        const nameRaw = displayName.trim();
        const nameId = nameRaw
          .toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]/g, '').slice(0, 16);
        const newProfileId = nameId.length >= 2 ? nameId : `user_${Date.now().toString(36).slice(-5)}`;
        const newPin = generateSecurePin();
        await AuthStorage.saveCredentials(newProfileId, newPin);
        await AsyncStorage.setItem(`eris_pin_${newProfileId}`, newPin);
        if (nameRaw) await AuthStorage.setDisplayName(nameRaw);
        creds = { profileId: newProfileId, pin: newPin, isNew: true };
        newlyCreatedPin = newPin;
      }

      const { profileId, pin } = creds!;

      if (displayName.trim()) {
        await AuthStorage.setDisplayName(displayName.trim());
      }

      wsManager.setCredentials(profileId, pin);
      wsManager.connect();

      const timeout = setTimeout(() => {
        unsub();
        wsManager.disconnect();
        setLoading(false);
        setError('No se pudo conectar con el servidor. Verifica que Eris esté activo en tu red.');
      }, 12000);

      const unsub = wsManager.subscribeMessage(async (data) => {
        if (data.type === 'connected') {
          clearTimeout(timeout);
          unsub();
          if (displayName.trim()) {
            wsManager.sendMessage({
              type: 'save_profile',
              profile: { displayName: displayName.trim(), language: 'es' },
            });
          }
          setLoading(false);
          if (newlyCreatedPin) {
            Alert.alert(
              'Perfil creado',
              `Tu ID es: ${profileId}\nTu PIN es: ${newlyCreatedPin}\n\nGuárdalos para poder iniciar sesión la próxima vez.`,
              [{ text: 'Entendido', onPress: () => onLogin(profileId, pin) }]
            );
          } else {
            onLogin(profileId, pin);
          }
        } else if (data.type === 'error') {
          clearTimeout(timeout);
          unsub();
          wsManager.disconnect();
          setLoading(false);
          setError(data.message || 'Error al conectar. Intenta de nuevo.');
        }
      });
    } catch (e) {
      setLoading(false);
      setError('Error inesperado. Intenta de nuevo.');
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

  // ─── Pantalla de bienvenida (si auto-login falla) ──────────
  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeAnim }}>

            {/* Logo Section */}
            <Animated.View style={[s.logoSection, { transform: [{ scale: logoScale }] }]}>
              <Animated.View style={[s.logoGlow, { transform: [{ scale: pulseAnim }] }]} />
              <Text style={s.logoIcon}>⚡</Text>
              <Text style={s.logoTitle}>ERIS</Text>
              <Text style={s.logoSub}>Sovereign Intelligence Feed</Text>
              <View style={s.logoTag}>
                <Text style={s.logoTagText}>🛡️ ZERO-KNOWLEDGE</Text>
              </View>
            </Animated.View>

            {/* Form Section */}
            <Animated.View style={[s.form, { transform: [{ translateY: formSlide }] }]}>
              <Text style={s.formTitle}>Bienvenido a Eris</Text>
              <Text style={s.formSub}>
                Tu sesión está cifrada y es completamente privada.{'\n'}
                Opcionalmente, ingresa un nombre para personalizar tu experiencia.
              </Text>

              <TextInput
                style={s.input}
                placeholder="Tu nombre (opcional)"
                placeholderTextColor={T.muted}
                value={displayName}
                onChangeText={(v) => { setDisplayName(v); setError(''); }}
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
                onSubmitEditing={handleConnect}
                returnKeyType="done"
              />

              {error ? <Text style={s.error}>{error}</Text> : null}

              {/* Boton Google */}
              <TouchableOpacity
                style={[s.btnGoogle, googleLoading && s.btnLoading]}
                onPress={handleGoogleSignIn}
                disabled={googleLoading || loading}
              >
                <Text style={s.btnGoogleIcon}>G</Text>
                <Text style={s.btnGoogleText}>
                  {googleLoading ? 'Conectando...' : 'Continuar con Google'}
                </Text>
              </TouchableOpacity>

              {/* Divisor */}
              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>o continúa sin cuenta</Text>
                <View style={s.dividerLine} />
              </View>

              <TouchableOpacity
                style={[s.btnPrimary, loading && s.btnLoading]}
                onPress={handleConnect}
                disabled={loading || googleLoading}
              >
                <Text style={s.btnPrimaryText}>{loading ? 'CONECTANDO...' : 'COMENZAR →'}</Text>
              </TouchableOpacity>

              <Text style={s.hint}>🔒 Tus datos nunca salen de tu dispositivo</Text>

              {/* ─── Ya tengo cuenta ─────────────────────── */}
              <TouchableOpacity
                style={s.pinToggle}
                onPress={() => { setShowPinLogin(v => !v); setError(''); }}
              >
                <Text style={s.pinToggleText}>
                  {showPinLogin ? '▲ Ocultar' : '¿Ya tienes cuenta? Ingresar con ID y PIN'}
                </Text>
              </TouchableOpacity>

              {showPinLogin && (
                <View style={s.pinForm}>
                  <TextInput
                    style={s.input}
                    placeholder="ID de perfil (ej: alexander)"
                    placeholderTextColor={T.muted}
                    value={loginId}
                    onChangeText={(v) => { setLoginId(v.toLowerCase().replace(/[^a-z0-9_]/g, '')); setError(''); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={s.input}
                    placeholder="PIN (ej: 6LFSKXRB)"
                    placeholderTextColor={T.muted}
                    value={loginPin}
                    onChangeText={(v) => { setLoginPin(v.toUpperCase()); setError(''); }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleManualLogin}
                  />
                  <TouchableOpacity
                    style={[s.btnPrimary, (loading || !loginId || !loginPin) && s.btnLoading]}
                    onPress={handleManualLogin}
                    disabled={loading || !loginId || !loginPin}
                  >
                    <Text style={s.btnPrimaryText}>{loading ? 'CONECTANDO...' : 'INGRESAR →'}</Text>
                  </TouchableOpacity>

                  {/* Llave de Recuperación */}
                  <TouchableOpacity
                    style={s.rkToggle}
                    onPress={() => { setShowRkForm(v => !v); setError(''); }}
                  >
                    <Text style={s.rkToggleText}>
                      {showRkForm ? '▲ Ocultar' : '¿Olvidaste tu PIN? Usa tu Llave de Recuperación'}
                    </Text>
                  </TouchableOpacity>

                  {showRkForm && (
                    <View style={s.rkForm}>
                      <Text style={s.rkHint}>
                        Usa el ID de perfil de arriba. Ingresa tu Llave de Recuperación (formato XXXX-XXXX-XXXX).
                      </Text>
                      <TextInput
                        style={s.input}
                        placeholder="Llave de Recuperación (ej: A1B2-C3D4-E5F6)"
                        placeholderTextColor={T.muted}
                        value={rkInput}
                        onChangeText={(v) => {
                          // Auto-format con guiones
                          const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
                          const parts = raw.match(/.{1,4}/g) || [];
                          setRkInput(parts.join('-').slice(0, 14));
                          setError('');
                        }}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={handleResetWithRK}
                      />
                      <TouchableOpacity
                        style={[s.btnPrimary, (rkLoading || !loginId || !rkInput) && s.btnLoading]}
                        onPress={handleResetWithRK}
                        disabled={rkLoading || !loginId || !rkInput}
                      >
                        <Text style={s.btnPrimaryText}>
                          {rkLoading ? 'VERIFICANDO...' : 'RESET Y CONECTAR →'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </Animated.View>

            <Text style={s.footer}>AXS Ecosystem · Zero-Knowledge Auth</Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ─── Modal: Elige tu alias ─────────────────────────── */}
      <Modal
        visible={!!aliasModal?.visible}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            {/* Header */}
            <View style={s.modalHeader}>
              <Text style={s.modalEmoji}>🏷️</Text>
              <Text style={s.modalTitle}>Elige tu alias</Text>
              <Text style={s.modalSub}>
                Hola, <Text style={{ color: T.accent }}>{aliasModal?.name}</Text>.{'\n'}
                Este será tu identificador único en Eris.{'\n'}
                <Text style={{ color: T.muted }}>Puedes usar letras, números y guion bajo.</Text>
              </Text>
            </View>

            {/* Input de alias */}
            <View style={s.aliasInputWrap}>
              <Text style={s.aliasAt}>@</Text>
              <TextInput
                style={s.aliasInput}
                value={aliasInput}
                onChangeText={(v) => {
                  const clean = v.toLowerCase().replace(/[^a-z0-9_]/g, '');
                  setAliasInput(clean);
                  setAliasError(validateAlias(clean) || '');
                }}
                placeholder={aliasModal?.suggestedId || 'tu_alias'}
                placeholderTextColor={T.muted}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                autoFocus
              />
            </View>

            {/* Feedback de validación */}
            {aliasInput.length > 0 && (
              <Text style={[s.aliasHint, aliasError ? s.aliasHintError : s.aliasHintOk]}>
                {aliasError || `✓ @${aliasInput} disponible`}
              </Text>
            )}

            {/* Reglas */}
            <View style={s.aliasTags}>
              {['3–20 caracteres', 'sin espacios', 'único y permanente'].map(tag => (
                <View key={tag} style={s.aliasTag}>
                  <Text style={s.aliasTagText}>{tag}</Text>
                </View>
              ))}
            </View>

            {/* Botones */}
            <TouchableOpacity
              style={[s.btnPrimary, (!!aliasError || aliasInput.length < 3) && s.btnLoading]}
              disabled={!!aliasError || aliasInput.length < 3}
              onPress={() => aliasModal?.onConfirm(aliasInput)}
            >
              <Text style={s.btnPrimaryText}>CONFIRMAR ALIAS →</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.aliasSkip}
              onPress={() => aliasModal?.onConfirm(aliasModal.suggestedId)}
            >
              <Text style={s.aliasSkipText}>
                Usar sugerido: <Text style={{ color: T.accent }}>@{aliasModal?.suggestedId}</Text>
              </Text>
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
  logoSub: { fontSize: 12, color: T.muted, letterSpacing: 2, marginBottom: 14 },
  logoTag: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
    backgroundColor: T.accentGlow, borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)',
  },
  logoTagText: { fontSize: 10, fontWeight: '800', color: T.accent, letterSpacing: 1.5 },

  form: { backgroundColor: T.bgCard, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: T.border },

  formTitle: { fontSize: 22, fontWeight: '800', color: T.text, marginBottom: 8 },
  formSub: { fontSize: 13, color: T.muted, lineHeight: 20, marginBottom: 20 },

  input: {
    backgroundColor: T.bgInput, color: T.text,
    borderRadius: 12, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, marginBottom: 12,
  },

  error: {
    color: T.error, fontSize: 13, marginBottom: 12,
    backgroundColor: T.errorBg, padding: 10, borderRadius: 8,
  },

  btnPrimary: {
    backgroundColor: T.accent, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: T.accent, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  btnLoading: { backgroundColor: T.muted, shadowOpacity: 0 },
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
  dividerText: { color: T.muted, fontSize: 11, fontWeight: '600' },

  hint: { color: T.muted, fontSize: 11, textAlign: 'center', marginTop: 14 },
  footer: { color: T.muted, fontSize: 11, textAlign: 'center', marginTop: 32, letterSpacing: 1 },

  // ─── Login manual ────────────────────────────────────────
  pinToggle: { marginTop: 20, alignItems: 'center', paddingVertical: 8 },
  pinToggleText: { color: T.muted, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
  pinForm: { marginTop: 12, gap: 10 },

  rkToggle: { marginTop: 8, alignItems: 'center', paddingVertical: 6 },
  rkToggleText: { color: '#22d3ee', fontSize: 11, fontWeight: '600', textDecorationLine: 'underline', opacity: 0.8 },
  rkForm: { marginTop: 10, gap: 10 },
  rkHint: { color: T.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },

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
  aliasHintError: { color: T.error },
  aliasTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  aliasTag: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20, borderWidth: 1, borderColor: T.border,
  },
  aliasTagText: { fontSize: 10, color: T.muted, fontWeight: '600' },
  aliasSkip: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  aliasSkipText: { fontSize: 13, color: T.muted },
});


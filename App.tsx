import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, Platform, DeviceEventEmitter, Animated, Dimensions, AppState } from 'react-native';
import Svg, { Path, Rect, Circle, Line, Polyline } from 'react-native-svg';

const SCREEN_H = Dimensions.get('window').height;
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Notifications from 'expo-notifications';
import { AuthStorage } from './src/services/AuthStorage';
import { wsManager } from './src/services/WebSocketManager';
import { metricsService } from './src/services/MetricsService';
import { proactiveService } from './src/services/ProactiveService';
import { ModuleStorage } from './src/services/ModuleStorage';
import { DEFAULT_MODULES } from './src/config/modules';
import { T } from './src/config/design';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import MetricsScreen from './src/screens/MetricsScreen';
import ChatScreen from './src/screens/ChatScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import GlucoTrackScreen from './src/screens/GlucoTrackScreen';
import NutritionScreen from './src/screens/NutritionScreen';
import TojiScreen from './src/screens/TojiScreen';
import HunterWalletScreen from './src/screens/HunterWalletScreen';
import { PortalOverlay, type PortalPhase } from './src/components/PortalOverlay';
import { ErisFAB } from './src/components/ErisFAB';

// ─── Tab Navigator ──────────────────────────────────────────
const Tab = createBottomTabNavigator();

// ─── SVG Tab Icons ──────────────────────────────────────────
const IC = 20; // icon size
const SW = 1.7; // stroke width

function SvgTabIcon({ name, focused }: { name: string; focused: boolean }) {
  const c = focused ? '#22d3ee' : '#4b5563';
  switch (name) {
    // ── Pulso / SYS — ECG heartbeat ─────────────────────────
    case 'Pulso':
    case 'SYS':
      return (
        <Svg width={IC} height={IC} viewBox="0 0 24 24" fill="none">
          <Polyline points="2,12 6,12 8,5.5 10,18.5 12,10 14,14.5 16,12 22,12"
            stroke={c} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    // ── Métricas / DATA — ascending bars ────────────────────
    case 'Métricas':
    case 'DATA':
      return (
        <Svg width={IC} height={IC} viewBox="0 0 24 24" fill="none">
          <Rect x="3" y="14" width="4" height="7" rx="1.5" stroke={c} strokeWidth={SW} />
          <Rect x="10" y="8" width="4" height="13" rx="1.5" stroke={c} strokeWidth={SW} />
          <Rect x="17" y="3" width="4" height="18" rx="1.5" stroke={c} strokeWidth={SW} />
        </Svg>
      );
    // ── Forge / FORGE — barbell ──────────────────────────────
    case 'Forge':
    case 'FORGE':
      return (
        <Svg width={IC} height={IC} viewBox="0 0 24 24" fill="none">
          <Line x1="9" y1="12" x2="15" y2="12" stroke={c} strokeWidth={SW + 0.3} strokeLinecap="round" />
          <Rect x="6" y="8.5" width="3" height="7" rx="1" stroke={c} strokeWidth={SW} />
          <Rect x="15" y="8.5" width="3" height="7" rx="1" stroke={c} strokeWidth={SW} />
          <Rect x="2.5" y="9.5" width="3.5" height="5" rx="0.8" stroke={c} strokeWidth={SW} />
          <Rect x="18" y="9.5" width="3.5" height="5" rx="0.8" stroke={c} strokeWidth={SW} />
        </Svg>
      );
    // ── Glucosa / SEC — blood drop ───────────────────────────
    case 'Glucosa':
    case 'SEC':
      return (
        <Svg width={IC} height={IC} viewBox="0 0 24 24" fill="none">
          <Path d="M12 3C12 3 5 10 5 15a7 7 0 0 0 14 0C19 10 12 3 12 3Z"
            stroke={c} strokeWidth={SW} strokeLinejoin="round" />
          <Line x1="9.5" y1="14" x2="14.5" y2="14" stroke={c} strokeWidth={SW} strokeLinecap="round" />
          <Line x1="12" y1="11.5" x2="12" y2="16.5" stroke={c} strokeWidth={SW} strokeLinecap="round" />
        </Svg>
      );
    // ── Nutri / NUT — leaf ───────────────────────────────────
    case 'Nutri':
    case 'NUT':
      return (
        <Svg width={IC} height={IC} viewBox="0 0 24 24" fill="none">
          <Path d="M12 2.5C9 6 6.5 10 8 14.5C9.5 19 15 19.5 17.5 16C20 12.5 17.5 6.5 12 2.5Z"
            stroke={c} strokeWidth={SW} strokeLinejoin="round" />
          <Path d="M10 21.5 C10 21.5 11 16 12 2.5" stroke={c} strokeWidth={SW} strokeLinecap="round" />
        </Svg>
      );
    // ── Finanzas / FIN — wallet ──────────────────────────────
    case 'Finanzas':
    case 'FIN':
      return (
        <Svg width={IC} height={IC} viewBox="0 0 24 24" fill="none">
          <Path d="M3 7C3 5.9 3.9 5 5 5H19C20.1 5 21 5.9 21 7V17C21 18.1 20.1 19 19 19H5C3.9 19 3 18.1 3 17V7Z"
            stroke={c} strokeWidth={SW} />
          <Path d="M3 10H21" stroke={c} strokeWidth={SW} strokeLinecap="round" />
          <Circle cx="16.5" cy="14.5" r="1.5" fill={c} />
        </Svg>
      );
    // ── Perfil / ID — person ─────────────────────────────────
    case 'Perfil':
    case 'ID':
      return (
        <Svg width={IC} height={IC} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="8" r="3.5" stroke={c} strokeWidth={SW} />
          <Path d="M4 20C4 17.2 7.6 15 12 15C16.4 15 20 17.2 20 20"
            stroke={c} strokeWidth={SW} strokeLinecap="round" />
        </Svg>
      );
    default:
      return (
        <Svg width={IC} height={IC} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="3" stroke={c} strokeWidth={SW} />
        </Svg>
      );
  }
}

const tabS = StyleSheet.create({
  iconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: 'rgba(34,211,238,0.12)' },
});

// ─── Main App ───────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [snapshot, setSnapshot] = useState(metricsService.getEmptySnapshot());
  const [axsMode, setAxsMode] = useState(false);
  const [enabledModules, setEnabledModules] = useState<string[]>(DEFAULT_MODULES);
  const pendingChatMsg = useRef<string | undefined>(undefined);
  const pendingTojiMsg = useRef<string | null>(null);
  const walletPendingMsg = useRef<string | undefined>(undefined);
  const tojiExitAction = useRef<'exit' | 'chat' | 'eris'>('exit');
  const [tojiPhase, setTojiPhase] = useState<PortalPhase>('hidden');
  const [walletPhase, setWalletPhase] = useState<PortalPhase>('hidden');
  const [erisOpen, setErisOpen] = useState(false);
  const [erisEverOpened, setErisEverOpened] = useState(false);
  const [erisInitMsg, setErisInitMsg] = useState<string | undefined>(undefined);
  const erisSlide = useRef(new Animated.Value(SCREEN_H)).current;

  // Portal de inicio (se dispara la primera vez que authed=true por sesión)
  const [introPhase, setIntroPhase] = useState<PortalPhase>('hidden');
  const introFired = useRef(false);
  // Portal Toji→Eris (se dispara al navegar de Toji a Eris)
  const [erisIntroPhase, setErisIntroPhase] = useState<PortalPhase>('hidden');

  useEffect(() => {
    // Restaurar sesión guardada y verificar con el servidor
    AuthStorage.getCredentials().then(creds => {
      if (creds) {
        // Conectamos para verificar que las credenciales siguen siendo válidas
        wsManager.setCredentials(creds.profileId, creds.pin);
        wsManager.connect();

        // Esperar confirmación del servidor
        const timeout = setTimeout(() => {
          unsub();
          // Si no hay respuesta en 8s, mostramos login (servidor apagado)
          setChecking(false);
        }, 8000);

        const unsub = wsManager.subscribeMessage((data) => {
          if (data.type === 'connected') {
            clearTimeout(timeout);
            unsub();
            setAuthed(true);
            setChecking(false);
          } else if (
            // El servidor siempre envía 'error' para fallos de auth (nunca 'auth_error' ni 'auth_blocked')
            data.type === 'auth_error' ||
            data.type === 'auth_blocked' ||
            (data.type === 'error' && data.message && (
              data.message.toLowerCase().includes('pin') ||
              data.message.toLowerCase().includes('bloqueado') ||
              data.message.toLowerCase().includes('incorrecto')
            ))
          ) {
            clearTimeout(timeout);
            unsub();
            AuthStorage.clearCredentials();
            wsManager.disconnect();
            setChecking(false);
          }
        });
      } else {
        setChecking(false);
      }
    });

    // Escuchar expulsiones de sesión en tiempo real y alertas de glucosa
    const unsubGlobal = wsManager.subscribeMessage((data) => {
      if (
        data.type === 'auth_error' ||
        data.type === 'session_expired' ||
        (data.type === 'error' && data.message && (
          data.message.toLowerCase().includes('pin') ||
          data.message.toLowerCase().includes('bloqueado')
        ))
      ) {
        AuthStorage.clearCredentials();
        wsManager.disconnect();
        setAuthed(false);
        return;
      }

      if (data.type === 'glucose_alert') {
        const { alertType, value, valueInMmol, trend } = data;
        const isUrgent = alertType === 'urgent_low' || alertType === 'urgent_high';
        const emoji = alertType === 'urgent_low' ? '🔴' : alertType === 'urgent_high' ? '🔴' : '🟡';
        const label = alertType === 'urgent_low' ? 'GLUCOSA CRÍTICA BAJA'
          : alertType === 'urgent_high' ? 'GLUCOSA CRÍTICA ALTA'
          : alertType === 'low' ? 'Glucosa baja'
          : 'Glucosa alta';
        Notifications.scheduleNotificationAsync({
          content: {
            title: `${emoji} ${label}`,
            body: `${value} mg/dL (${valueInMmol} mmol/L) ${trend ?? ''}`,
            sound: true,
            priority: isUrgent
              ? Notifications.AndroidNotificationPriority.MAX
              : Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: null,
        }).catch(() => {});
      }
    });

    // Inicializar métricas y servicio proactivo en background
    metricsService.init().then(async () => {
      const snap = await metricsService.getSnapshot();
      setSnapshot(snap);
      wsManager.sendMessage({ type: 'update_health_snapshot', snapshot: snap });
    });
    proactiveService.init();

    // Re-verificar permisos HC y disparar reglas proactivas al volver al foreground
    const appStateSub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        const restored = await metricsService.refreshPermissions();
        const snap = restored ? await metricsService.getSnapshot() : null;
        if (restored && snap) {
          setSnapshot(snap);
          wsManager.sendMessage({ type: 'update_health_snapshot', snapshot: snap });
        }
        proactiveService.check(snap ?? metricsService.getEmptySnapshot());
      }
    });

    // Cargar AXS Mode y módulos — se recargarán por perfil en handleLogin
    const subAxs = DeviceEventEmitter.addListener('AXS_MODE_CHANGED', (val: boolean) => {
      setAxsMode(val);
    });
    const subModules = DeviceEventEmitter.addListener('MODULES_CHANGED', (val: string[]) => {
      setEnabledModules(val);
    });

    return () => { unsubGlobal(); appStateSub.remove(); subAxs.remove(); subModules.remove(); };
  }, []);

  // Disparar portal de inicio la primera vez que authed=true en esta sesión
  useEffect(() => {
    if (authed && !introFired.current) {
      introFired.current = true;
      setIntroPhase('entering');
    }
  }, [authed]);

  // Login: la conexión ya fue establecida y verificada por LoginScreen
  const handleLogin = async (profileId: string, _pin: string) => {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const [axsVal, modules] = await Promise.all([
      AsyncStorage.getItem(`eris_axs_mode_${profileId}`),
      ModuleStorage.get(profileId),
    ]);
    setAxsMode(axsVal !== null ? JSON.parse(axsVal) : false);
    setEnabledModules(modules);
    setAuthed(true);
  };

  const handleLogout = async () => {
    introFired.current = false;
    setIntroPhase('hidden');
    setErisIntroPhase('hidden');
    setAxsMode(false);
    setEnabledModules(DEFAULT_MODULES);
    setErisOpen(false);
    setErisEverOpened(false);
    setTojiPhase('hidden');
    setWalletPhase('hidden');
    erisSlide.setValue(SCREEN_H);
    await AuthStorage.clearCredentials();
    wsManager.disconnect();
    setAuthed(false);
  };

  const handleSwitchAccount = () => {
    introFired.current = false;
    setIntroPhase('hidden');
    setErisIntroPhase('hidden');
    setAxsMode(false);
    setEnabledModules(DEFAULT_MODULES);
    setErisEverOpened(false);
    setTojiPhase('hidden');
    setWalletPhase('hidden');
    erisSlide.setValue(SCREEN_H);
    wsManager.disconnect();
    setAuthed(false);
  };

  const openEris = useCallback((msg?: string) => {
    if (msg !== undefined) setErisInitMsg(msg);
    setErisEverOpened(true);
    setErisOpen(true);
    Animated.spring(erisSlide, { toValue: 0, tension: 65, friction: 12, useNativeDriver: true }).start();
  }, [erisSlide]);

  const closeEris = useCallback(() => {
    setErisOpen(false);
    Animated.timing(erisSlide, { toValue: SCREEN_H, duration: 270, useNativeDriver: true }).start();
  }, [erisSlide]);

  const navigateToChat = (msg?: string) => openEris(msg);

  if (checking) {
    return (
      <View style={[s.splash, s.splashCenter]}>
        <StatusBar barStyle="light-content" backgroundColor={T.bg} />
        <Text style={s.splashIcon}>⚡</Text>
        <Text style={s.splashLabel}>ERIS</Text>
      </View>
    );
  }

  if (!authed) {
    return (
      <SafeAreaProvider>
        <View style={s.root}>
          <StatusBar barStyle="light-content" backgroundColor={T.bg} />
          <LoginScreen onLogin={handleLogin} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <TabLayout
        onLogout={handleLogout}
        onSwitchAccount={handleSwitchAccount}
        onNavigateToChat={navigateToChat}
        snapshot={snapshot}
        axsMode={axsMode}
        enabledModules={enabledModules}
        onTojiPress={() => {
          if (tojiPhase === 'hidden') setTojiPhase('entering');
        }}
        onWalletPress={() => {
          if (walletPhase === 'hidden') setWalletPhase('entering');
        }}
        erisOpen={erisOpen}
        tojiOpen={tojiPhase !== 'hidden'}
        walletOpen={walletPhase !== 'hidden'}
        onOpenEris={openEris}
      />

      {/* Portal de inicio — se dispara una vez al autenticar, presenta AXS/ERIS */}
      {introPhase !== 'hidden' && (
        <PortalOverlay
          phase={introPhase}
          label="ERIS"
          presentOnly
          onEnterComplete={() => setIntroPhase('exiting')}
          onExitComplete={() => setIntroPhase('hidden')}
        >
          <View />
        </PortalOverlay>
      )}

      {/* Toji: monta el WebView solo mientras el portal está activo */}
      {tojiPhase !== 'hidden' && (
        <PortalOverlay
          phase={tojiPhase}
          onEnterComplete={() => setTojiPhase('open')}
          onExitComplete={() => {
            setTojiPhase('hidden');
            const action = tojiExitAction.current;
            const msg = pendingTojiMsg.current;
            tojiExitAction.current = 'exit';
            pendingTojiMsg.current = null;
            if (action === 'chat' && msg) openEris(msg);
            else if (action === 'eris') {
              // Snap ChatScreen a posición y disparar portal Eris intro encima
              erisSlide.setValue(0);
              setErisEverOpened(true);
              setErisOpen(true);
              setErisIntroPhase('entering');
            }
          }}
        >
          <TojiScreen
            snapshot={snapshot}
            onNavigateToChat={(msg) => {
              tojiExitAction.current = 'chat';
              pendingTojiMsg.current = msg;
              setTojiPhase('exiting');
            }}
            onExit={() => {
              tojiExitAction.current = 'exit';
              setTojiPhase('exiting');
            }}
            onGoToEris={() => {
              tojiExitAction.current = 'eris';
              setTojiPhase('exiting');
            }}
          />
        </PortalOverlay>
      )}

      {/* Hunter Wallet: monta WebView solo mientras el portal está activo */}
      {walletPhase !== 'hidden' && (
        <PortalOverlay
          phase={walletPhase}
          label="FINANZAS"
          onEnterComplete={() => setWalletPhase('open')}
          onExitComplete={() => {
            setWalletPhase('hidden');
            const msg = walletPendingMsg.current;
            walletPendingMsg.current = undefined;
            if (msg !== undefined) msg ? openEris(msg) : openEris();
          }}
        >
          <HunterWalletScreen
            onExit={() => setWalletPhase('exiting')}
            onGoToEris={() => {
              walletPendingMsg.current = '';
              setWalletPhase('exiting');
            }}
          />
        </PortalOverlay>
      )}

      {/* ⚡ Eris siempre montado tras primera apertura — sesión y estado nunca se resetean */}
      {erisEverOpened && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ translateY: erisSlide }] }]}
          pointerEvents={erisOpen ? 'box-none' : 'none'}
        >
          <ChatScreen
            onLogout={handleLogout}
            onClose={closeEris}
            pendingMessage={erisInitMsg}
          />
        </Animated.View>
      )}

      {/* Portal Toji→Eris — encima del ChatScreen para taparlo mientras la transición juega */}
      {erisIntroPhase !== 'hidden' && (
        <PortalOverlay
          phase={erisIntroPhase}
          label="ERIS"
          presentOnly
          onEnterComplete={() => setErisIntroPhase('exiting')}
          onExitComplete={() => setErisIntroPhase('hidden')}
        >
          <View />
        </PortalOverlay>
      )}
    </SafeAreaProvider>
  );
}

// TabLayout separado para que useSafeAreaInsets esté siempre dentro de SafeAreaProvider
function TabLayout({
  onLogout, onSwitchAccount, onNavigateToChat, snapshot, axsMode, enabledModules,
  onTojiPress, onWalletPress, erisOpen, tojiOpen, walletOpen, onOpenEris
}: {
  onLogout: () => void;
  onSwitchAccount: () => void;
  onNavigateToChat: (msg?: string) => void;
  snapshot: any;
  axsMode: boolean;
  enabledModules: string[];
  onTojiPress: () => void;
  onWalletPress: () => void;
  erisOpen: boolean;
  tojiOpen: boolean;
  walletOpen: boolean;
  onOpenEris: (msg?: string) => void;
}) {
  const has = (id: string) => enabledModules.includes(id);
  const insets = useSafeAreaInsets();
  const TAB_BAR_HEIGHT = 56 + insets.bottom;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <NavigationContainer>
        <Tab.Navigator
          key={[...enabledModules].sort().join('_')}
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: [
              s.tabBar,
              {
                height: TAB_BAR_HEIGHT,
                paddingBottom: Math.max(insets.bottom, 8),
              }
            ],
            tabBarActiveTintColor: T.accent,
            tabBarInactiveTintColor: T.textMuted,
            tabBarLabelStyle: s.tabLabel,
            tabBarItemStyle: s.tabItem,
            tabBarBackground: () => <View style={s.tabBarBg} />,
            tabBarLabel: route.name,
            tabBarIcon: ({ focused }) => (
              <View style={[tabS.iconWrap, focused && tabS.iconActive]}>
                <SvgTabIcon name={route.name} focused={focused} />
              </View>
            ),
          })}
        >
          {axsMode ? (
            <>
              {/* AXS EXECUTIVE TABS */}
              <Tab.Screen name="SYS">
                {() => <HomeScreen onNavigateToChat={onNavigateToChat} />}
              </Tab.Screen>
              <Tab.Screen name="DATA">
                {() => <MetricsScreen snapshot={snapshot} onAskEris={onNavigateToChat} />}
              </Tab.Screen>
              <Tab.Screen
                name="FORGE"
                listeners={{ tabPress: (e) => { e.preventDefault(); onTojiPress(); } }}
              >
                {() => <View style={{ flex: 1, backgroundColor: T.bg }} />}
              </Tab.Screen>
              <Tab.Screen name="SEC" component={GlucoTrackScreen} />
              <Tab.Screen name="NUT" component={NutritionScreen} />
              <Tab.Screen
                name="FIN"
                listeners={{ tabPress: (e) => { e.preventDefault(); onWalletPress(); } }}
              >
                {() => <View style={{ flex: 1, backgroundColor: T.bg }} />}
              </Tab.Screen>
              <Tab.Screen name="ID">
                {() => <ProfileScreen onLogout={onLogout} onSwitchAccount={onSwitchAccount} />}
              </Tab.Screen>
            </>
          ) : (
            <>
              {/* PUBLIC TABS — filtrados por módulos activos del perfil */}
              <Tab.Screen name="Pulso">
                {() => <HomeScreen onNavigateToChat={onNavigateToChat} />}
              </Tab.Screen>
              <Tab.Screen name="Métricas">
                {() => <MetricsScreen snapshot={snapshot} onAskEris={onNavigateToChat} />}
              </Tab.Screen>
              {has('toji') && (
                <Tab.Screen
                  name="Forge"
                  listeners={{ tabPress: (e) => { e.preventDefault(); onTojiPress(); } }}
                >
                  {() => <View style={{ flex: 1, backgroundColor: T.bg }} />}
                </Tab.Screen>
              )}
              {has('glucosa') && (
                <Tab.Screen name="Glucosa" component={GlucoTrackScreen} />
              )}
              {has('nutri') && (
                <Tab.Screen name="Nutri" component={NutritionScreen} />
              )}
              {has('finanzas') && (
                <Tab.Screen
                  name="Finanzas"
                  listeners={{ tabPress: (e) => { e.preventDefault(); onWalletPress(); } }}
                >
                  {() => <View style={{ flex: 1, backgroundColor: T.bg }} />}
                </Tab.Screen>
              )}
              <Tab.Screen name="Perfil">
                {() => <ProfileScreen onLogout={onLogout} onSwitchAccount={onSwitchAccount} />}
              </Tab.Screen>
            </>
          )}
        </Tab.Navigator>
      </NavigationContainer>

      {/* ⚡ Burbuja flotante de Eris — oculta cuando Toji, Wallet o Eris están abiertos */}
      {!erisOpen && !tojiOpen && !walletOpen && (
        <ErisFAB
          onOpen={() => onOpenEris(undefined)}
          bottomOffset={TAB_BAR_HEIGHT + 14}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  splash: { flex: 1, backgroundColor: T.bg },
  splashCenter: { alignItems: 'center', justifyContent: 'center' },
  splashIcon: { fontSize: 48, marginBottom: 16 },
  splashLabel: { color: '#64748b', fontSize: 11, letterSpacing: 4, fontWeight: '800' },

  tabBar: {
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 8,
    elevation: 0,
    // Sin position:absolute — el contenido NO se ocultará bajo la tab bar
  },
  tabBarBg: {
    flex: 1,
    backgroundColor: T.bgCard,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  tabLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  tabItem: { gap: 4 },
});

// Cache invalidate 2

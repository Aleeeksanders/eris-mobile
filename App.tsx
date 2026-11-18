import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet, StatusBar, DeviceEventEmitter, Animated, Dimensions, AppState, Easing, Keyboard, BackHandler, InteractionManager, Alert } from 'react-native';
import { SAVE_FAILED_EVENT } from './src/services/saveGuard';
import Svg, { Path, Rect, Circle, Line, Polyline } from 'react-native-svg';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Material "emphasized": arranca rápido y se posa suave al abrir; al cerrar acelera hacia la burbuja.
const EASE_OPEN = Easing.bezier(0.2, 0, 0, 1);
const EASE_CLOSE = Easing.bezier(0.3, 0, 0.8, 0.15);
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { pedirDestino, ABRIR_ESCANER_EVENT } from './src/services/notifTargets';
import { modulosOn, respuestaApagado } from './src/services/modulosOn';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthStorage } from './src/services/AuthStorage';
import { wsManager, setCapsExtra } from './src/services/WebSocketManager';
import { metricsService } from './src/services/MetricsService';
import { nutritionBackend } from './src/services/NutritionBackend';
import { proactiveService } from './src/services/ProactiveService';
import { ModuleStorage } from './src/services/ModuleStorage';
import WelcomeFlow, { WELCOME_EVENT } from './src/screens/WelcomeFlow';
import { tourRef, TOUR_EVENT } from './src/components/tour/tourTargets';
import { DEFAULT_MODULES } from './src/config/modules';
import { T } from './src/config/design';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import MetricsScreen from './src/screens/MetricsScreen';
import ChatScreen from './src/screens/ChatScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import GlucoTrackScreen from './src/screens/GlucoTrackScreen';
import NutritionScreen from './src/screens/NutritionScreen';
import ForgeScreen from './src/screens/forge/ForgeScreen';
// Finanzas 2.0 (nativa); la versión web (HunterWalletScreen) queda adentro como respaldo si la migración no calza
import FinanceScreen from './src/screens/finance/FinanceScreen';
import { FinanceHeadlessHost } from './src/components/FinanceHeadlessHost';
// Inventario (2026-10-22, fase I2): lo que tienes en casa, con su portal propio como Forge y Finanzas
import InventoryScreen from './src/screens/inventory/InventoryScreen';
import SleepScreen from './src/screens/sleep/SleepScreen';
import { inventoryStore, startInventory } from './src/services/inventory/inventoryStore';
import { startInventoryAuto } from './src/services/inventory/inventoryAuto';
import { startFinanceAuto } from './src/services/finance/financeAuto';
import { startAutoPrefs } from './src/services/autoPrefs';
import { limpiarViejos } from './src/services/storagePrune';
import { supplementStore, startSupplements } from './src/services/supplements/supplementStore';
import { startStrictModeSync } from './src/services/strictMode';
import { financeBridge } from './src/services/FinanceBridge';
import { PortalOverlay, type PortalPhase } from './src/components/PortalOverlay';
import { ErisFAB, getErisBubbleCenter, BUBBLE_SIZE } from './src/components/ErisFAB';
import { preloadModuleHtml } from './src/services/ModuleHtml';
import { tintForTab } from './src/config/moduleTheme';
import { ErisBubble } from './modules/eris-bubble';
import { HestiaManos } from './modules/hestia-manos';
import { iniciarPresencia, detenerPresencia } from './src/services/hestia/presencia';
import { decirHestia } from './src/services/hestia/altavoz';
import { aplicarForgeOp } from './src/services/forge/forgeVoz';
import { forgeStore } from './src/services/forge/forgeStore';
import { restTimer } from './src/services/forge/restTimer';
import { pedirLlamada, llamadaAbierta } from './src/services/voz/despertar';
// Hestia Manos (K0): con la app aparte instalada, Eris anuncia que puede hacer cosas en el teléfono (se revisa en cada conexión)
setCapsExtra(() => (HestiaManos.disponible() ? ['telefono_ops'] : []));
import { ApprovalHost } from './src/components/ApprovalHost';
import { evaluateFromSnapshot } from './src/services/NutritionQuality';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PersonaStore, usePersona } from './src/config/persona';
import { AppModeStore, APP_MODE_EVENT, isAdminRole, type AppMode } from './src/config/appMode';
import { EnterprisePanel, EnterpriseProjects, EnterprisePending, EnterpriseSystem } from './src/screens/EnterpriseScreens';
import { FeatureStore, useFeature } from './src/config/features';
import { erisNotifications, NOTIFICATION_OPEN_EVENT, PLAN_REFRESH_EVENT, ERIS_ASK_EVENT, type NotificationOpen } from './src/services/ErisNotifications';
import { reminderPlanner } from './src/services/ReminderPlanner';
import { dayPlanStore } from './src/services/dayPlan/dayPlanStore';
import { startToneSync } from './src/services/tone';
import { startFinanceNative } from './src/services/finance/financeContext';
import { installForgeSync } from './src/services/forge/forgeSync';
import { installTrainingIntent } from './src/services/forge/trainingIntent';
import { daySchedule, DAY_SCHEDULE_EVENT } from './src/services/daySchedule';
import { SLEEP_EDITS_EVENT } from './src/services/sleep/sleepStore';
import { foodSearchService } from './src/services/FoodSearchService';
import { PROFILE_CHANGED_EVENT } from './src/services/ScopedStorage';

// Otra cuenta en el teléfono: «mis versiones» de comidas son de cada cuenta (revisión 2026-10-31, D4; acá y no en el
// servicio, que no importa React Native para poder probarlo)
DeviceEventEmitter.addListener(PROFILE_CHANGED_EVENT, () => foodSearchService.olvidarCuenta());

// El horario de la persona (día de comida que termina al dormir, comidas según su hora de despertar): lo antes posible
daySchedule.load();

/**
 * Manda el snapshot de salud a Eris junto con la calidad de lo comido hoy según la hora de cada comida (NutritionQuality):
 * así Eris puede decir "tu almuerzo fue D: sin verduras" en vez de solo sumar calorías. Si la evaluación falla, igual
 * se manda el snapshot.
 */
async function sendHealthSnapshot(snap: any) {
  let foodQuality: any;
  try {
    const q = await evaluateFromSnapshot(snap);
    foodQuality = {
      at: new Date().toISOString(), score: q.foodScore, letter: q.letter, hydrationScore: q.hydrationScore,
      expectedSharePct: Math.round(q.expectedShare * 100), headline: q.headline, tips: q.tips,
      meals: q.meals.map((m) => ({ label: m.label, letter: m.letter, kcal: m.kcal, notes: m.notes })),
    };
  } catch {}
  // Los alimentos de hoy uno por uno (lo anotado a mano incluido): antes Eris solo veía el total y no qué fue
  let foodLog: any;
  try { foodLog = await nutritionBackend.todayFoodLog(); } catch {}
  // Qué tomas de agua del chat ya están en `hydration`: el servidor suma solo las que faltan (una sola cuenta del agua)
  let chatWaterCounted: string[] | undefined;
  try { chatWaterCounted = await nutritionBackend.chatWaterCounted(snap); } catch {}
  // `hydration` del snapshot combinado trae el agua de la comida; al servidor va solo lo bebido: él suma el agua de la comida
  // con la lista de alimentos (si no, se contaría dos veces) y su historial diario guarda solo lo bebido
  const drank = typeof snap?.hydration === 'number' ? Math.round((snap.hydration - (snap.foodWaterL ?? 0)) * 100) / 100 : snap?.hydration;
  wsManager.sendMessage({ type: 'update_health_snapshot', snapshot: {
    // El despertar habitual (Perfil o reloj): con esto y el fin del sueño (dayWakeTime) el servidor calcula el mismo día
    ...snap, hydration: drank, schedule: { usualWake: daySchedule.usualWake(), sleepHours: daySchedule.sleepHours() }, ...(foodQuality ? { foodQuality } : {}), ...(foodLog ? { foodLog } : {}), ...(chatWaterCounted ? { chatWaterCounted } : {}),
  } });
}

// ─── Tab Navigator ──────────────────────────────────────────
/** Lo que se lee en la barra de abajo (2026-10-10: "Dashboard" y "Nutri" eran nombres de creador, no de usuario). */
const TAB_LABELS: Record<string, string> = { Dashboard: 'Inicio', Nutri: 'Nutrición' };
const Tab = createBottomTabNavigator();
/** Para que una notificación lleve a una pestaña (revisión I2: antes «Ver mi día» o «Ver» solo abrían la app) */
const navRef = createNavigationContainerRef<any>();

// ─── SVG Tab Icons ──────────────────────────────────────────
const IC = 20; // icon size
const SW = 1.7; // stroke width

function SvgTabIcon({ name, focused }: { name: string; focused: boolean }) {
  const c = focused ? '#22d3ee' : '#4b5563';
  switch (name) {
    // ── Dashboard / SYS — ECG heartbeat ─────────────────────
    case 'Dashboard':
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
    // ── Inventario / INV — caja ──────────────────────────────
    case 'Inventario':
    case 'INV':
      return (
        <Svg width={IC} height={IC} viewBox="0 0 24 24" fill="none">
          <Path d="M3 7.8L12 3.5L21 7.8V16.4L12 20.6L3 16.4V7.8Z" stroke={c} strokeWidth={SW} strokeLinejoin="round" />
          <Path d="M3 7.8L12 12L21 7.8" stroke={c} strokeWidth={SW} strokeLinejoin="round" />
          <Line x1="12" y1="12" x2="12" y2="20.6" stroke={c} strokeWidth={SW} />
          <Line x1="7.5" y1="5.6" x2="16.5" y2="10" stroke={c} strokeWidth={SW - 0.4} strokeLinecap="round" />
        </Svg>
      );
    // ── Modo Empresa ─────────────────────────────────────────
    case 'Panel':
      return (
        <Svg width={IC} height={IC} viewBox="0 0 24 24" fill="none">
          <Rect x="3" y="3" width="8" height="8" rx="2" stroke={c} strokeWidth={SW} />
          <Rect x="13" y="3" width="8" height="5" rx="2" stroke={c} strokeWidth={SW} />
          <Rect x="13" y="10" width="8" height="11" rx="2" stroke={c} strokeWidth={SW} />
          <Rect x="3" y="13" width="8" height="8" rx="2" stroke={c} strokeWidth={SW} />
        </Svg>
      );
    case 'Proyectos':
      return (
        <Svg width={IC} height={IC} viewBox="0 0 24 24" fill="none">
          <Path d="M3 7C3 5.9 3.9 5 5 5H9.5L11.5 7H19C20.1 7 21 7.9 21 9V17C21 18.1 20.1 19 19 19H5C3.9 19 3 18.1 3 17V7Z"
            stroke={c} strokeWidth={SW} strokeLinejoin="round" />
        </Svg>
      );
    case 'Pendientes':
      return (
        <Svg width={IC} height={IC} viewBox="0 0 24 24" fill="none">
          <Rect x="3.5" y="4" width="5" height="5" rx="1.2" stroke={c} strokeWidth={SW} />
          <Line x1="11.5" y1="6.5" x2="20.5" y2="6.5" stroke={c} strokeWidth={SW} strokeLinecap="round" />
          <Rect x="3.5" y="14" width="5" height="5" rx="1.2" stroke={c} strokeWidth={SW} />
          <Line x1="11.5" y1="16.5" x2="20.5" y2="16.5" stroke={c} strokeWidth={SW} strokeLinecap="round" />
        </Svg>
      );
    case 'Sistema':
      return (
        <Svg width={IC} height={IC} viewBox="0 0 24 24" fill="none">
          <Rect x="3" y="4" width="18" height="12" rx="2" stroke={c} strokeWidth={SW} />
          <Line x1="8" y1="20" x2="16" y2="20" stroke={c} strokeWidth={SW} strokeLinecap="round" />
          <Line x1="12" y1="16" x2="12" y2="20" stroke={c} strokeWidth={SW} />
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
  // Modo Empresa (solo administradores): el menú de trabajo de AXS, con Hestia. Implica axsMode. Ver config/appMode.ts
  const [enterprise, setEnterprise] = useState(false);
  const [enabledModules, setEnabledModules] = useState<string[]>(DEFAULT_MODULES);
  // Bienvenida de 1 minuto (la primera vez de cada perfil; el creador la ve desde Perfil)
  const [welcome, setWelcome] = useState(false);
  // En el Modo AXS Executive la asistente es Hestia (nombre, ícono, colores); fuera de él, Eris. Ver config/persona.ts
  const persona = usePersona();
  const [tojiPhase, setTojiPhase] = useState<PortalPhase>('hidden');
  const [walletPhase, setWalletPhase] = useState<PortalPhase>('hidden');
  // Forge y Finanzas quedan montados (ocultos) después de la primera apertura —o de la precarga tras el inicio—
  // para que entrar sea instantáneo; el portal espera a que avisen que están listos.
  const [tojiMounted, setTojiMounted] = useState(false);
  const [walletMounted, setWalletMounted] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [tojiReady, setTojiReady] = useState(false);
  const [walletReady, setWalletReady] = useState(false);
  // Inventario: igual que Finanzas (montado y oculto tras la primera apertura)
  const [invPhase, setInvPhase] = useState<PortalPhase>('hidden');
  const [invMounted, setInvMounted] = useState(false);
  const [invReady, setInvReady] = useState(false);
  // Pestaña en pantalla → color de la nube del ícono de Eris (ver moduleTheme)
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const [erisOpen, setErisOpen] = useState(false);
  const [erisEverOpened, setErisEverOpened] = useState(false);
  const [erisInitMsg, setErisInitMsg] = useState<string | undefined>(undefined);
  // 0 = chat cerrado (dentro de la burbuja), 1 = chat a pantalla completa.
  // Un solo valor maneja el círculo, el fondo, el contenido y la propia burbuja,
  // así todo queda sincronizado sin timers.
  const erisProgress = useRef(new Animated.Value(0)).current;
  const [morphAnchor, setMorphAnchor] = useState(getErisBubbleCenter());
  const [morphing, setMorphing] = useState(false);

  // Portal de inicio (se dispara la primera vez que authed=true por sesión)
  const [introPhase, setIntroPhase] = useState<PortalPhase>('hidden');
  const introFired = useRef(false);

  useEffect(() => {
    // Restaurar sesión guardada y verificar con el servidor
    AuthStorage.getSession().then(async creds => {
      if (creds) {
        // Reconectamos con el token de sesión de Google para verificar que sigue vigente
        wsManager.setCredentials(creds.profileId);
        wsManager.setAuth({ session: creds.token });
        wsManager.connect();

        // Se entra AL TIRO con la sesión guardada; la verificación corre por detrás. Antes se esperaba al servidor
        // y, si no respondía en 8 s (PC apagado o lejos), se mostraba el login como si te hubiera deslogueado.
        // Sin servidor la app funciona igual (Finanzas, Forge y Nutrición son locales) y se reconecta sola.
        try {
          const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
          const [axsVal, modules, entVal] = await Promise.all([
            AsyncStorage.getItem(`eris_axs_mode_${creds.profileId}`),
            ModuleStorage.get(creds.profileId),
            AsyncStorage.getItem(`eris_enterprise_mode_${creds.profileId}`),
          ]);
          setAxsMode(axsVal !== null ? JSON.parse(axsVal) : false);
          setEnterprise(entVal === 'true');
          setEnabledModules(modules);
        } catch {}
        setAuthed(true);
        setChecking(false);

        // Solo un rechazo EXPLÍCITO de la sesión devuelve al login
        const unsub = wsManager.subscribeMessage(async (data) => {
          if (data.type === 'connected') {
            unsub();
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
            unsub();
            AuthStorage.clearCredentials();
            wsManager.disconnect();
            setAuthed(false);
          }
        });
      } else {
        setChecking(false);
      }
    });

    // No se pudo guardar en el teléfono (memoria llena, almacenamiento con error): se avisa una vez por módulo y sesión, en
    // vez de mostrar un cambio que al reiniciar no estaría (revisión 2026-10-31, D5)
    const avisados = new Set<string>();
    const subSave = DeviceEventEmitter.addListener(SAVE_FAILED_EVENT, (e: { modulo?: string }) => {
      const m = String(e?.modulo ?? 'la app');
      if (avisados.has(m)) return;
      avisados.add(m);
      Alert.alert('No pude guardar en el teléfono', `Tus últimos cambios de ${m} no quedaron guardados en este teléfono (¿poco espacio?). Libera espacio y vuelve a intentarlo; mientras, no cierres la app.`);
    });

    // Escuchar expulsiones de sesión en tiempo real y alertas de glucosa
    const unsubGlobal = wsManager.subscribeMessage((data) => {
      if (
        data.type === 'auth_error' ||
        data.type === 'session_expired' ||
        // Solo con el código del servidor (revisión 2026-10-31, S3): antes bastaba que un error dijera «pin» o «bloqueado»
        // (también «opinión» o un error de una herramienta) para borrar la sesión
        (data.type === 'error' && data.code === 'auth_failed')
      ) {
        AuthStorage.clearCredentials();
        wsManager.disconnect();
        setAuthed(false);
        return;
      }

      // Módulos con visto bueno del administrador (p. ej. glucosa): al conectar y cuando él los cambia
      if ((data.type === 'connected' || data.type === 'features_updated') && data.features) FeatureStore.set(data.features, data.type === 'connected' ? (data.role ?? null) : undefined);

      // Alerta del sensor: canal propio (urgente o normal), qué hacer ya y un botón para pedirle ayuda a Eris.
      // Solo con el módulo de glucosa aprobado (el servidor tampoco las manda sin él).
      if (data.type === 'glucose_alert' && FeatureStore.get().glucose) {
        erisNotifications.glucose({ alertType: data.alertType, value: data.value, trend: data.trend }).catch(() => {});
      }

      // Eris anota algo en Finanzas por chat: se aplica en el teléfono y vuelve el resultado real (FinanceBridge)
      if (data.type === 'finance_op' && data.requestId) {
        // Apagado en Perfil (revisión A2): no se anota nada y Eris lo dice
        if (!modulosOn.on('finanzas') && data.op?.action !== 'cuadre') { wsManager.sendMessage({ type: 'finance_op_result', requestId: data.requestId, result: respuestaApagado('Finanzas') }); return; }
        financeBridge.run(data.op).then((result) => {
          wsManager.sendMessage({ type: 'finance_op_result', requestId: data.requestId, result });
        });
      }
      // …y lo mismo con el Inventario (InventoryBridge): «compré 2 L de leche», «¿tengo arroz?»
      if (data.type === 'inventory_op' && data.requestId) {
        if (!modulosOn.on('inventario')) { wsManager.sendMessage({ type: 'inventory_op_result', requestId: data.requestId, result: respuestaApagado('Inventario') }); return; }
        inventoryStore.apply(data.op)
          .catch((e) => ({ ok: false, code: 'error', msg: `Inventario no pudo: ${String(e?.message ?? e)}` }))
          .then((result) => { wsManager.sendMessage({ type: 'inventory_op_result', requestId: data.requestId, result }); });
      }
      // Hestia como JARVIS · L3: el entrenador en el oído. Lo que Hestia pide a Forge en la llamada («hice 8 con 62,5», qué sigue,
      // el descanso) se aplica con el mismo núcleo de Entrenar y vuelve lo que de verdad quedó (forgeVoz.ts)
      if (data.type === 'forge_op' && data.requestId) {
        const responder = (result: unknown) => wsManager.sendMessage({ type: 'forge_op_result', requestId: data.requestId, result });
        if (!modulosOn.on('toji')) { responder(respuestaApagado('Forge')); return; }
        aplicarForgeOp(data.op, { store: forgeStore, reloj: restTimer })
          .catch((e) => ({ ok: false, code: 'error', msg: `Forge no pudo: ${String(e?.message ?? e)}` }))
          .then(responder);
      }
      // Hestia como JARVIS · L0: el vigía del PC avisa (RAM, disco, temperatura) — el servidor solo se lo manda a Ikaros
      if (data.type === 'hestia_alerta' && typeof data.texto === 'string') {
        erisNotifications.hestiaEquipo({ texto: data.texto, nivel: String(data.nivel ?? 'aviso'), clave: String(data.clave ?? 'equipo') }).catch(() => {});
      }
      // L1 (C3): Hestia te habla sin la llamada (el servidor ya vio que tienes audífonos y que puede). Si no suena, queda escrito.
      if (data.type === 'hestia_decir' && typeof data.texto === 'string') {
        // (L2: lo escrito puede ser distinto de lo dicho: el cargo con su monto aunque no se diga en voz alta)
        const aviso = { titulo: String(data.titulo ?? 'Hestia'), texto: String(data.escrito ?? data.texto), clave: String(data.clave ?? 'aviso') };
        decirHestia({ wav: String(data.wav ?? ''), texto: String(data.texto) }).then((ok) => {
          // L2: el cargo queda siempre con sus botones (para contestarlo); una llamada que no se pudo decir, nada (ya suena)
          if (data.botones === 'cargo') erisNotifications.hestiaCargo({ ...aviso, datos: data.datos ?? {} }).catch(() => {});
          else if (!ok) { if (data.soloVoz !== true) erisNotifications.hestiaAviso(aviso).catch(() => {}); }
          else if (data.nota === true) erisNotifications.hestiaEquipo({ texto: aviso.texto, nivel: 'aviso', clave: aviso.clave }).catch(() => {});
        });
      }
      // …y lo que no pudo decirte en voz alta (sin audífonos, «no molestar», una reunión, de noche): la bienvenida a casa…
      if (data.type === 'hestia_aviso' && typeof data.texto === 'string') {
        const aviso = { titulo: String(data.titulo ?? 'Hestia'), texto: String(data.texto), clave: String(data.clave ?? 'aviso') };
        if (data.botones === 'cargo') erisNotifications.hestiaCargo({ ...aviso, datos: data.datos ?? {} }).catch(() => {});
        else erisNotifications.hestiaAviso(aviso).catch(() => {});
      }
      // L2: contestaste el cargo por voz en la llamada («sí, era yo»): la notificación ya no hace falta
      if (data.type === 'hestia_cargo_resp' && data.era === true && data.id) erisNotifications.cerrarCargo(String(data.id));
      // Hestia Manos (K0): lo que Hestia hace en el teléfono (alarma, linterna, abrir una app…) lo hace la app aparte;
      // acá solo se reenvía y vuelve el resultado real. Las aprobaciones ya las pidió el servidor.
      if (data.type === 'telefono_op' && data.requestId) {
        HestiaManos.pedir(data.op).then((result) => {
          wsManager.sendMessage({ type: 'telefono_op_result', requestId: data.requestId, result });
        });
      }
      // …y al conectar, las apps que se pueden abrir por su nombre («abre Spotify» va al teléfono si la app está acá)
      if (data.type === 'connected' && HestiaManos.disponible()) {
        HestiaManos.pedir({ accion: 'apps' }).then((r) => {
          const apps = Array.isArray(r?.data?.apps) ? r.data.apps.map((a: any) => String(a?.etiqueta ?? '')).filter(Boolean) : [];
          if (r.ok) wsManager.sendMessage({ type: 'telefono_apps', apps: apps.slice(0, 300) });
        });
      }
      // …y con «Mis suplementos» (SupplementBridge): «me tomé la creatina», «¿me tomé la vitamina D?»
      if (data.type === 'supplement_op' && data.requestId) {
        supplementStore.apply(data.op)
          .catch((e) => ({ ok: false, code: 'error', msg: `Suplementos no pudo: ${String(e?.message ?? e)}` }))
          .then((result) => { wsManager.sendMessage({ type: 'supplement_op_result', requestId: data.requestId, result }); });
      }
    });

    // Inicializar métricas y servicio proactivo en background
    metricsService.init().then(async () => {
      // Una vez al día: a qué hora despiertas normalmente según el reloj (para quien trasnocha o trabaja de noche)
      daySchedule.refreshUsual(() => metricsService.readUsualWake(21)).catch(() => {});
      const snap = await nutritionBackend.merge(await metricsService.getSnapshot());
      setSnapshot(snap);
      sendHealthSnapshot(snap);
      proactiveService.requestTip();
    });
    erisNotifications.init().catch(() => {});
    proactiveService.init().then(() => DeviceEventEmitter.emit(PLAN_REFRESH_EVENT));

    // Re-verificar permisos HC y disparar reglas proactivas al volver al foreground
    const appStateSub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        const restored = await metricsService.refreshPermissions();
        const snap = restored ? await nutritionBackend.merge(await metricsService.getSnapshot()) : null;
        if (restored && snap) {
          setSnapshot(snap);
          sendHealthSnapshot(snap);
        }
        proactiveService.requestTip();
      }
    });

    // Cargar AXS Mode y módulos — se recargarán por perfil en handleLogin
    const subAxs = DeviceEventEmitter.addListener('AXS_MODE_CHANGED', (val: boolean) => {
      setAxsMode(val);
      // Al prender o apagar el Modo AXS Executive se llega a Hestia (o a Eris); el menú AXS se elige en el Dashboard de Hestia
      setEnterprise(false);
      AuthStorage.getCredentials().then((c) => { if (c?.profileId) AsyncStorage.setItem(`eris_enterprise_mode_${c.profileId}`, 'false'); }).catch(() => {});
    });
    const subModules = DeviceEventEmitter.addListener('MODULES_CHANGED', (val: string[]) => {
      setEnabledModules(val);
    });

    return () => { unsubGlobal(); appStateSub.remove(); subAxs.remove(); subModules.remove(); subSave.remove(); };
  }, []);

  // Lo de nutrición que sabe el servidor (chat) se combina con Health Connect sin contar doble; ver services/NutritionBackend.ts
  useEffect(() => {
    if (!authed) { nutritionBackend.stop(); reminderPlanner.stop(); return; }
    nutritionBackend.start();
    reminderPlanner.start(); // avisos del día: comidas, agua, entreno, Finanzas y resúmenes (services/reminderRules.ts)
    dayPlanStore.start(); // «¿Qué recomienda Eris?»: el plan del día que arma Eris (Inicio y chat)
    const offTone = startToneSync(); // el tono elegido (services/tone.ts) llega al servidor al conectar: chat y sugerencias
    startFinanceNative(); // Finanzas 2.0: lo que sabe Eris sale del núcleo nativo, y los fijos del día se anotan al abrir
    startInventory(); // Inventario: Eris sabe qué tienes en casa, y cada cambio se respalda en el PC
    startInventoryAuto(); // …y se mantiene solo: lo que comes sale de la despensa y los remedios bajan con sus tomas
    startFinanceAuto(); // Eris administra: lo que avisa tu banco se anota solo (o queda «Por confirmar»), sin abrir Finanzas
    startAutoPrefs(); // Eris administra (A3): lo que Eris hace sola en cada módulo llega al servidor (el chat y el Plan lo respetan)
    void limpiarViejos(); // revisión D6: lo del día a día de hace más de 120 días se borra (una vez al día)
    startSupplements(); // «Mis suplementos»: Eris sabe qué tomas hoy, y los avisos de cada toma quedan programados
    startStrictModeSync(); // el modo estricto con los antojos (Perfil) llega al servidor al conectar
    installTrainingIntent(); // Forge 2.0: «¿entrenas hoy?» y las metas según el día
    installForgeSync(); // Forge 2.0: lo de Forge nativo llega al servidor, a los avisos y al respaldo; lo que arma Eris se aplica al tiro
    const off = nutritionBackend.subscribe(async () => {
      const snap = await nutritionBackend.merge(await metricsService.getSnapshot());
      setSnapshot(snap);
      // El total completo del día (Health Connect + chat) vuelve al servidor: su "Análisis del Día" se armaba con lo
      // que escribiera último, y un registro por chat lo dejaba viendo solo lo del chat (sin lo anotado a mano).
      sendHealthSnapshot(snap);
    });
    // Cambió el horario (despertó, o lo fijó en Perfil): los avisos del día y el servidor se ponen al día
    const offDay = DeviceEventEmitter.addListener(DAY_SCHEDULE_EVENT, async () => {
      reminderPlanner.schedule();
      try { const snap = await nutritionBackend.merge(await metricsService.getSnapshot()); sendHealthSnapshot(snap); } catch {}
    });
    // Corrigió el sueño en la pantalla de Sueño («no estaba durmiendo» / «anotar a mano»): el día y el servidor se rehacen
    const offSleep = DeviceEventEmitter.addListener(SLEEP_EDITS_EVENT, async () => {
      try { const snap = await nutritionBackend.merge(await metricsService.getSnapshot()); setSnapshot(snap); sendHealthSnapshot(snap); } catch {}
    });
    return () => { off(); offDay.remove(); offSleep.remove(); offTone(); };
  }, [authed]);

  // La bienvenida: solo para quien recién empieza (lo decide el servidor: nunca la vio y aún no conversa con Eris), una
  // vez, cuando terminó el portal de inicio. A los administradores no se les muestra sola. Se marca vista AL MOSTRARLA (en
  // el teléfono y en el perfil del servidor): antes se marcaba al terminarla y, si se cerraba a medias, salía de nuevo, y a
  // quien ya usaba la app le salía al actualizar (2026-10-11).
  useEffect(() => {
    if (!authed || introPhase !== 'hidden' || !introFired.current) return;
    let cancelled = false;
    let off: (() => void) | null = null;
    (async () => {
      const pid = (await AuthStorage.getCredentials())?.profileId;
      const key = `eris_welcome_done_${pid}`;
      if (!pid || (await AsyncStorage.getItem(key))) return;
      const decide = (d: any) => {
        if (cancelled) return;
        // Servidor anterior sin el dato: como antes (por teléfono)
        const show = typeof d?.showWelcome === 'boolean' ? d.showWelcome : true;
        if (!show || isAdminRole(d?.role)) { if (!show) AsyncStorage.setItem(key, '1').catch(() => {}); return; }
        setWelcome(true);
        AsyncStorage.setItem(key, '1').catch(() => {});
        wsManager.sendMessage({ type: 'welcome_done' });
      };
      const last = wsManager.getLastConnectedPayload();
      if (last?.role) { decide(last); return; }
      // Sin conexión todavía: se espera. Sin saber si es nuevo, no se muestra (se decide la próxima vez que abra).
      off = wsManager.subscribeMessage((d: any) => { if (d?.type === 'connected') decide(d); }) as any;
    })().catch(() => {});
    return () => { cancelled = true; off?.(); };
  }, [authed, introPhase]);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(WELCOME_EVENT, () => setWelcome(true));
    return () => sub.remove();
  }, []);
  const finishWelcome = useCallback(async (modules: string[]) => {
    setWelcome(false);
    setEnabledModules(modules);
    DeviceEventEmitter.emit('MODULES_CHANGED', modules);
    const pid = (await AuthStorage.getCredentials())?.profileId;
    if (pid) { await ModuleStorage.set(pid, modules).catch(() => {}); await AsyncStorage.setItem(`eris_welcome_done_${pid}`, '1').catch(() => {}); }
    // Y enseguida, el recorrido guiado por la app (las pestañas se rearman con los módulos elegidos: se espera un poco)
    setTimeout(() => DeviceEventEmitter.emit(TOUR_EVENT), 1200);
  }, []);

  // Disparar portal de inicio la primera vez que authed=true en esta sesión
  useEffect(() => {
    if (authed && !introFired.current) {
      introFired.current = true;
      setIntroPhase('entering');
    }
  }, [authed]);

  // Al cerrar sesión o cambiar de cuenta, Forge y Finanzas (vivos y ocultos) se desmontan: eran del perfil anterior
  const resetModules = useCallback(() => {
    setTojiMounted(false); setWalletMounted(false); setInvMounted(false);
    setTojiReady(false); setWalletReady(false); setInvReady(false);
  }, []);
  useEffect(() => { if (!authed) resetModules(); }, [authed]);

  // Terminada la animación de inicio: se precarga el HTML de los módulos y, con la app ya quieta, se montan Forge y
  // Finanzas ocultos. Así la PRIMERA apertura también es instantánea (el portal ni siquiera tiene que esperar).
  useEffect(() => {
    if (!authed || introPhase !== 'hidden' || !introFired.current) return;
    preloadModuleHtml();
    const t = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        if (axsMode || enabledModules.includes('finanzas')) setWalletMounted(true);
        if (axsMode || enabledModules.includes('toji')) setTojiMounted(true);
        if (axsMode || enabledModules.includes('inventario')) setInvMounted(true);
      });
    }, 2500);
    return () => clearTimeout(t);
  }, [authed, introPhase, axsMode, enabledModules]);

  // Login: la conexión ya fue establecida y verificada por LoginScreen
  const handleLogin = async (profileId: string, _pin: string) => {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const [axsVal, modules, entVal] = await Promise.all([
      AsyncStorage.getItem(`eris_axs_mode_${profileId}`),
      ModuleStorage.get(profileId),
      AsyncStorage.getItem(`eris_enterprise_mode_${profileId}`),
    ]);
    setAxsMode(axsVal !== null ? JSON.parse(axsVal) : false);
    setEnterprise(entVal === 'true');
    setEnabledModules(modules);
    setAuthed(true);
  };

  const handleLogout = async () => {
    FeatureStore.reset();
    introFired.current = false;
    setIntroPhase('hidden');
    setAxsMode(false);
    setEnterprise(false);
    setEnabledModules(DEFAULT_MODULES);
    setErisOpen(false);
    setErisEverOpened(false);
    setTojiPhase('hidden');
    setWalletPhase('hidden');
    resetModules();
    erisProgress.setValue(0);
    // Cerrar sesión de verdad: el token deja de valer en el servidor y se olvida la cuenta de Google del teléfono
    const token = wsManager.getSessionToken();
    if (token) {
      try { wsManager.sendMessage({ type: 'logout', token }); } catch {}
      await new Promise(r => setTimeout(r, 300));
    }
    wsManager.setAuth({});
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      await GoogleSignin.signOut();
    } catch {}
    await AuthStorage.clearCredentials();
    wsManager.disconnect();
    setAuthed(false);
  };

  const handleSwitchAccount = () => {
    introFired.current = false;
    setIntroPhase('hidden');
    setAxsMode(false);
    setEnterprise(false);
    setEnabledModules(DEFAULT_MODULES);
    setErisEverOpened(false);
    setTojiPhase('hidden');
    setWalletPhase('hidden');
    resetModules();
    erisProgress.setValue(0);
    wsManager.disconnect();
    setAuthed(false);
  };

  const openEris = useCallback((msg?: string) => {
    if (msg !== undefined) setErisInitMsg(msg);
    setMorphAnchor(getErisBubbleCenter());
    setErisEverOpened(true);
    setErisOpen(true);
    setMorphing(true);
    // Un frame de espera: el círculo necesita renderizarse ya ubicado en la
    // burbuja actual antes de que el valor empiece a moverse.
    requestAnimationFrame(() => {
      Animated.timing(erisProgress, { toValue: 1, duration: 520, easing: EASE_OPEN, useNativeDriver: true })
        .start(({ finished }) => { if (finished) setMorphing(false); });
    });
  }, [erisProgress]);

  // Tocar una notificación (o uno de sus botones) lleva a donde corresponde. Antes solo abría la app.
  const handleNotificationOpen = useCallback((o: NotificationOpen | null) => {
    if (!o || o.kind === 'approval') return; // la tarjeta de aprobación aparece sola al abrir la app
    // "Pedir ayuda a Eris" (glucosa) y "Pedir ideas" (colación, proteína): manda la pregunta ya escrita
    if ((o.action === 'ayuda' || o.action === 'ideas') && o.message) { openEris(o.message); return; }
    // Revisión I2 (2026-11-04): «Ver mi día», «Ver» (suplemento) y «Elegir hora» llevan a su lugar, aunque haya otra
    // cosa abierta encima (el chat, Forge, Finanzas, Inventario, Sueño)
    const cerrarCapas = () => {
      if (erisOpenRef.current) {
        Keyboard.dismiss();
        setErisOpen(false);
        setMorphing(true);
        Animated.timing(erisProgress, { toValue: 0, duration: 380, easing: EASE_CLOSE, useNativeDriver: true }).start(({ finished }) => { if (finished) setMorphing(false); });
      }
      setTojiPhase((p) => (p === 'hidden' ? p : 'exiting'));
      setWalletPhase((p) => (p === 'hidden' ? p : 'exiting'));
      setInvPhase((p) => (p === 'hidden' ? p : 'exiting'));
      setSleepOpen(false);
    };
    const ir = (ruta: string) => { try { if (navRef.isReady()) navRef.navigate(ruta); } catch {} };
    const inicio = enterprise && axsMode ? 'Panel' : axsMode ? 'SYS' : 'Dashboard';
    const nutricion = enterprise && axsMode ? null : axsMode ? 'NUT' : enabledModules.includes('nutri') ? 'Nutri' : null;
    if (o.action === 'sup_abrir' || (o.kind === 'supplement' && !o.action.startsWith('sup_'))) {
      cerrarCapas();
      ir(nutricion ?? inicio);
      if (nutricion) pedirDestino('suplementos');
      return;
    }
    // El escáner por voz (Hestia, 2026-11-17): comida → Nutrición, gastos → la foto de la boleta, inventario → agregar con el escáner
    if (o.action === 'escaner_comida') { cerrarCapas(); ir(nutricion ?? inicio); if (nutricion) pedirDestino('escanear_comida'); return; }
    if (o.action === 'escaner_gastos') { cerrarCapas(); setWalletMounted(true); setWalletPhase((p) => (p === 'hidden' || p === 'exiting' ? 'entering' : p)); pedirDestino('escanear_gasto'); return; }
    if (o.action === 'escaner_inventario') { cerrarCapas(); setInvMounted(true); setInvPhase((p) => (p === 'hidden' || p === 'exiting' ? 'entering' : p)); pedirDestino('escanear_inventario'); return; }
    if (o.action === 'intent_hora') {
      // La tarjeta «¿Entrenas hoy?» abre directo en la hora; está en Forge → Hoy (y en Inicio)
      cerrarCapas();
      setTojiMounted(true);
      setTojiPhase((p) => (p === 'hidden' || p === 'exiting' ? 'entering' : p));
      pedirDestino('entreno_hora');
      return;
    }
    // Botones (o el toque) de los avisos del día: llevan al módulo que corresponde
    const button = o.action === 'forge' || o.action === 'finanzas' || o.action === 'anotar' || o.action === 'anotar_gasto';
    const target = button ? (o.action === 'forge' ? 'forge' : o.action === 'finanzas' ? 'finanzas' : 'eris') : o.action === 'plan_ver' ? 'home' : (o.tap ?? 'eris');
    if (target === 'forge') { setTojiMounted(true); setTojiPhase((p) => (p === 'hidden' ? 'entering' : p)); return; }
    if (target === 'finanzas') { setWalletMounted(true); setWalletPhase((p) => (p === 'hidden' ? 'entering' : p)); return; }
    if (target === 'home') { cerrarCapas(); ir(inicio); return; } // el resumen de la mañana, el plan del día, lo de la semana
    if (target === 'sleep') { setSleepOpen(true); return; }
    openEris();
  }, [openEris, erisProgress, axsMode, enterprise, enabledModules]);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(NOTIFICATION_OPEN_EVENT, handleNotificationOpen);
    // Cualquier pantalla puede abrir el chat con una pregunta lista ("Díselo a Eris" en el buscador de Nutrición)
    const ask = DeviceEventEmitter.addListener(ERIS_ASK_EVENT, (msg: string) => { if (typeof msg === 'string' && msg.trim()) openEris(msg); });
    // Hestia pidió abrir un escáner (la llamada ya colgó)
    const esc = DeviceEventEmitter.addListener(ABRIR_ESCANER_EVENT, (que: string) => {
      if (que === 'comida' || que === 'gastos' || que === 'inventario') handleNotificationOpen({ action: `escaner_${que}` } as NotificationOpen);
    });
    return () => { sub.remove(); ask.remove(); esc.remove(); };
  }, [handleNotificationOpen, openEris]);
  // La app estaba cerrada y se abrió desde una notificación: se atiende cuando ya hay sesión y terminó el portal
  useEffect(() => {
    if (!authed || !introFired.current || introPhase !== 'hidden') return; // espera a que el portal de inicio termine
    handleNotificationOpen(erisNotifications.takeLaunchAction());
  }, [authed, introPhase, handleNotificationOpen]);

  // El servidor necesita saber si estás en Modo AXS Executive: fuera de él, Eris no usa las herramientas de AXS
  useEffect(() => {
    wsManager.setAxsMode(axsMode);
    PersonaStore.set(axsMode ? 'hestia' : 'eris');
    AppModeStore.set(axsMode && enterprise ? 'empresa' : axsMode ? 'hestia' : 'eris');
  }, [axsMode, enterprise]);

  // Hestia como JARVIS · C4 (L1): los sensores del teléfono (audífonos, red de la casa, «no molestar»), solo Ikaros en Modo AXS y con
  // Hestia Manos. En Eris (o con otra cuenta) no corre nada de esto.
  useEffect(() => {
    if (!authed) { detenerPresencia(); return; }
    const decide = () => {
      const esIkaros = wsManager.getLastConnectedPayload()?.role === 'ikaros';
      if (axsMode && esIkaros && HestiaManos.disponible()) iniciarPresencia(); else detenerPresencia();
    };
    decide();
    const off = wsManager.subscribeMessage((d: any) => { if (d?.type === 'connected') decide(); });
    return () => { off(); };
  }, [authed, axsMode]);

  // Eris · Hestia · Empresa desde el Dashboard (ModeSwitch). Hestia y Empresa solo para administradores.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(APP_MODE_EVENT, async (m: AppMode) => {
      if (m !== 'eris' && !isAdminRole(wsManager.getLastConnectedPayload()?.role)) return;
      const axs = m !== 'eris';
      const ent = m === 'empresa';
      setAxsMode(axs);
      setEnterprise(ent);
      setErisOpen(false); // el chat abierto era de la otra asistente
      try {
        const pid = (await AuthStorage.getCredentials())?.profileId;
        if (pid) {
          await AsyncStorage.setItem(`eris_axs_mode_${pid}`, JSON.stringify(axs));
          await AsyncStorage.setItem(`eris_enterprise_mode_${pid}`, String(ent));
        }
      } catch {}
    });
    return () => sub.remove();
  }, []);

  // Burbuja de Eris sobre otras apps (modules/eris-bubble): fuera de la app la dibuja Android donde estaba la burbuja
  // de acá; tocarla vuelve a la app y abre el chat.
  const erisOpenRef = useRef(false);
  useEffect(() => { erisOpenRef.current = erisOpen; }, [erisOpen]);
  // Los servicios de fondo y el servidor saben qué módulos están encendidos (revisión A2); en Modo AXS se ven todos
  useEffect(() => { modulosOn.set(axsMode ? null : enabledModules); DeviceEventEmitter.emit('ERIS_PLAN_REFRESH'); }, [enabledModules, axsMode]);
  useEffect(() => {
    if (!ErisBubble.available) return;
    // Modo burbuja: con la app en pantalla el servicio queda listo (escondido); al minimizar, salir o cambiar de app,
    // Eris pasa a burbuja y el proceso sigue vivo (sin el servicio, Android congela la app a los segundos y Eris deja
    // de escuchar). Se relanza en cada regreso porque la ✕ de la burbuja la cierra solo "por ahora".
    const ensureService = () => { if (authed && ErisBubble.isActive()) ErisBubble.enable(); };
    ensureService();
    ErisBubble.setAppForeground(AppState.currentState === 'active');
    const openIfTapped = () => {
      // J3: mantener presionada la burbuja de Hestia abre la llamada (el chat la abre si está en Modo AXS)
      const llamar = ErisBubble.consumePendingCall();
      const abrir = ErisBubble.consumePendingOpen() || llamar;
      if (authed && abrir && !erisOpenRef.current) setTimeout(() => openEris(), 250);
      if (authed && llamar) setTimeout(() => DeviceEventEmitter.emit('HESTIA_LLAMAR'), 700);
    };
    openIfTapped();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        ErisBubble.setAppForeground(true);
        ErisBubble.setState('idle'); // ya estás acá: la respuesta pendiente se ve en el chat
        ensureService();
        openIfTapped();
      } else if (st === 'background') ErisBubble.setAppForeground(false, getErisBubbleCenter());
    });
    return () => sub.remove();
  }, [authed, openEris]);

  // K3: la llamada abierta desde Hestia Manos (el botón del asistente, el de los ajustes rápidos, el atajo del ícono), también con
  // el teléfono bloqueado. Llega con la clave de Eris (la revisa el módulo nativo); se abre el chat y la llamada, como la burbuja.
  useEffect(() => {
    if (!authed) return;
    const tomar = () => {
      const d = HestiaManos.consumirDespertar();
      if (!d) return;
      if (!erisOpenRef.current) setTimeout(() => openEris(), d.bloqueado ? 0 : 250);
      setTimeout(() => pedirLlamada({ origen: d.origen, bloqueado: d.bloqueado }), d.bloqueado ? 300 : 700);
      // Nunca dejar Eris sobre la pantalla de bloqueo sin la llamada (si no se abrió: otra cuenta, o falló algo)
      if (d.bloqueado) setTimeout(() => { if (!llamadaAbierta()) HestiaManos.sobreBloqueo(false); }, 15_000);
    };
    tomar();
    const sub = HestiaManos.onDespertar(tomar);
    const subApp = AppState.addEventListener('change', (st) => { if (st === 'active') tomar(); });
    return () => { sub.remove(); subApp.remove(); };
  }, [authed, openEris]);

  const closeEris = useCallback(() => {
    Keyboard.dismiss();
    setErisOpen(false);
    setMorphing(true);
    Animated.timing(erisProgress, { toValue: 0, duration: 380, easing: EASE_CLOSE, useNativeDriver: true })
      .start(({ finished }) => { if (finished) setMorphing(false); });
  }, [erisProgress]);

  // Botón "atrás" de Android cierra el chat en vez de sacarte de la app. Se
  // registra al abrir (no al montar) para quedar por delante del handler de
  // Finanzas, que si no se comería el gesto y cerraría la billetera debajo.
  useEffect(() => {
    if (!erisOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { closeEris(); return true; });
    return () => sub.remove();
  }, [erisOpen, closeEris]);

  // Montar el chat en un momento ocioso tras entrar, no recién al primer toque:
  // montar la pantalla entera a la vez que corre la animación la hacía tartamudear.
  useEffect(() => {
    if (!authed) return;
    const t = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => setErisEverOpened(true));
    }, 2500);
    return () => clearTimeout(t);
  }, [authed]);

  const morph = useMemo(() => {
    const ax = morphAnchor.x, ay = morphAnchor.y;
    // Radio justo para cubrir la esquina más lejana desde la burbuja.
    const r = Math.ceil(Math.hypot(Math.max(ax, SCREEN_W - ax), Math.max(ay, SCREEN_H - ay))) + 24;
    const clamp = 'clamp' as const;
    const p = erisProgress;
    return {
      circleFrame: { left: ax - r, top: ay - r, width: r * 2, height: r * 2, borderRadius: r },
      circleScale: p.interpolate({ inputRange: [0, 0.78], outputRange: [BUBBLE_SIZE / (r * 2), 1], extrapolate: clamp }),
      circleOpacity: p.interpolate({ inputRange: [0, 0.02], outputRange: [0, 1], extrapolate: clamp }),
      edgeOpacity: p.interpolate({ inputRange: [0, 0.08, 0.7], outputRange: [0, 0.9, 0], extrapolate: clamp }),
      backdropOpacity: p.interpolate({ inputRange: [0, 0.5], outputRange: [0, 1], extrapolate: clamp }),
      // El chat entra cuando el círculo ya cubrió ~3/4 de la pantalla (y al
      // cerrar se va primero), para no tapar el revelado.
      contentOpacity: p.interpolate({ inputRange: [0.6, 0.95], outputRange: [0, 1], extrapolate: clamp }),
      contentTransform: [
        { translateX: p.interpolate({ inputRange: [0.6, 1], outputRange: [(ax - SCREEN_W / 2) * 0.08, 0], extrapolate: clamp }) },
        { translateY: p.interpolate({ inputRange: [0.6, 1], outputRange: [(ay - SCREEN_H / 2) * 0.08, 0], extrapolate: clamp }) },
        { scale: p.interpolate({ inputRange: [0.6, 1], outputRange: [0.95, 1], extrapolate: clamp }) },
      ],
    };
  }, [morphAnchor, erisProgress]);

  const navigateToChat = (msg?: string) => openEris(msg);

  // Se llama tras loguear comida/agua en NutritionScreen — salta la caché de 5 min
  // de MetricsService para que el bloque de macros/hidratación en Métricas se
  // actualice de inmediato en vez de esperar al TTL o a un foreground.
  const refreshSnapshot = useCallback(async () => {
    const snap = await nutritionBackend.merge(await metricsService.getSnapshot(true));
    setSnapshot(snap);
    sendHealthSnapshot(snap);
  }, []);

  // Mientras se lee la sesión guardada (unos milisegundos): el mismo fondo de la pantalla de carga nativa y del
  // portal de inicio, para que el paso de uno a otro sea continuo (antes aparecía un ⚡ con "ERIS" en medio).
  if (checking) {
    return (
      <View style={s.splash}>
        <StatusBar barStyle="light-content" backgroundColor={T.bg} />
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
      {/* Tarjeta "Eris pide permiso": vive fuera de las pantallas para verse siempre */}
      <ApprovalHost />
      {/* Finanzas invisible: aplica lo que Eris anota por chat cuando Finanzas no está abierta */}
      <FinanceHeadlessHost />
      <TabLayout
        onLogout={handleLogout}
        onSwitchAccount={handleSwitchAccount}
        onNavigateToChat={navigateToChat}
        snapshot={snapshot}
        onNutritionLogged={refreshSnapshot}
        axsMode={axsMode}
        enterprise={axsMode && enterprise}
        enabledModules={enabledModules}
        onTojiPress={() => {
          if (tojiPhase === 'hidden') { setTojiMounted(true); setTojiPhase('entering'); }
        }}
        onWalletPress={() => {
          if (walletPhase === 'hidden') { setWalletMounted(true); setWalletPhase('entering'); }
        }}
        onInventoryPress={() => {
          if (invPhase === 'hidden') { setInvMounted(true); setInvPhase('entering'); }
        }}
        onTabChange={setActiveTab}
      />

      {/* Bienvenida (1 minuto, la primera vez): qué quieres mejorar, a qué hora te levantas, reloj y cómo se usa */}
      {welcome && introPhase === 'hidden' && <WelcomeFlow initialModules={enabledModules} onDone={finishWelcome} />}

      {/* Portal de inicio — se dispara una vez al autenticar, presenta AXS/ERIS */}
      {introPhase !== 'hidden' && (
        <PortalOverlay
          phase={introPhase}
          label={persona.name.toUpperCase()}
          presentOnly
          onEnterComplete={() => setIntroPhase('exiting')}
          onExitComplete={() => setIntroPhase('hidden')}
        >
          <View />
        </PortalOverlay>
      )}

      {/* Forge: tras la primera apertura (o la precarga) queda montado y oculto; el portal espera a que esté listo */}
      {tojiMounted && (
        <PortalOverlay
          phase={tojiPhase}
          label="FORGE"
          theme="forge"
          ready={tojiReady}
          tint="forge"
          onEnterComplete={() => setTojiPhase('open')}
          onExitComplete={() => setTojiPhase('hidden')}
        >
          <ForgeScreen
            snapshot={snapshot}
            active={tojiPhase !== 'hidden'}
            onReadyChange={setTojiReady}
            onExit={() => setTojiPhase('exiting')}
          />
        </PortalOverlay>
      )}

      {/* Finanzas: igual que Forge */}
      {walletMounted && (
        <PortalOverlay
          phase={walletPhase}
          label="FINANZAS"
          theme="finanzas"
          ready={walletReady}
          tint="finanzas"
          onEnterComplete={() => setWalletPhase('open')}
          onExitComplete={() => setWalletPhase('hidden')}
        >
          <FinanceScreen
            active={walletPhase !== 'hidden'}
            onReadyChange={setWalletReady}
            onExit={() => setWalletPhase('exiting')}
          />
        </PortalOverlay>
      )}

      {/* Inventario: igual que Finanzas */}
      {invMounted && (
        <PortalOverlay
          phase={invPhase}
          label="INVENTARIO"
          theme="inventario"
          ready={invReady}
          tint="nutricion"
          onEnterComplete={() => setInvPhase('open')}
          onExitComplete={() => setInvPhase('hidden')}
        >
          <InventoryScreen
            active={invPhase !== 'hidden'}
            onReadyChange={setInvReady}
            onExit={() => setInvPhase('exiting')}
          />
        </PortalOverlay>
      )}

      {/* Sueño 2.0 · S4: un aviso de sueño («último café», «a acostarse») abre la pantalla de Sueño */}
      <SleepScreen visible={sleepOpen} onClose={() => setSleepOpen(false)} />

      {/* ⚡ Eris siempre montado — sesión y estado nunca se resetean. Al abrir,
          un círculo nace desde la burbuja y cubre la pantalla; el chat aparece
          encima. Al cerrar, todo se recoge de vuelta hacia la burbuja. */}
      {erisEverOpened && (
        <View style={StyleSheet.absoluteFill} pointerEvents={erisOpen ? 'box-none' : 'none'}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.morphBackdrop, { opacity: morph.backdropOpacity }]} />
          <Animated.View
            pointerEvents="none"
            style={[s.morphCircle, morph.circleFrame, { opacity: morph.circleOpacity, transform: [{ scale: morph.circleScale }] }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[s.morphEdge, morph.circleFrame, { borderColor: persona.accent, opacity: morph.edgeOpacity, transform: [{ scale: morph.circleScale }] }]}
          />
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: morph.contentOpacity, transform: morph.contentTransform }]}
            renderToHardwareTextureAndroid={morphing}
            shouldRasterizeIOS={morphing}
          >
            <ChatScreen
              onLogout={handleLogout}
              onClose={closeEris}
              pendingMessage={erisInitMsg}
              axsMode={axsMode}
            />
          </Animated.View>
        </View>
      )}

      {/* ⚡ Burbuja flotante global de Eris — arrastrable, se pega al borde más
          cercano y recuerda su posición. Se esconde mientras juega una
          transición de portal (no debe flotar sobre el logo AXS) y se funde en
          el chat al abrirlo. */}
      <ErisFAB
        onOpen={() => openEris(undefined)}
        interactive={!erisOpen}
        hidden={
          introPhase !== 'hidden' ||
          tojiPhase === 'entering' || tojiPhase === 'exiting' ||
          walletPhase === 'entering' || walletPhase === 'exiting' ||
          invPhase === 'entering' || invPhase === 'exiting'
        }
        morphProgress={erisProgress}
        // La nube del ícono toma el color del módulo en pantalla (el núcleo menta es siempre Eris)
        tint={walletPhase !== 'hidden' ? 'finanzas' : tojiPhase !== 'hidden' ? 'forge' : invPhase !== 'hidden' ? 'nutricion' : tintForTab(activeTab)}
      />
    </SafeAreaProvider>
  );
}

// TabLayout separado para que useSafeAreaInsets esté siempre dentro de SafeAreaProvider
function TabLayout({
  onLogout, onSwitchAccount, onNavigateToChat, snapshot, onNutritionLogged, axsMode, enterprise, enabledModules,
  onTojiPress, onWalletPress, onInventoryPress, onTabChange,
}: {
  onLogout: () => void;
  onSwitchAccount: () => void;
  onNavigateToChat: (msg?: string) => void;
  snapshot: any;
  onNutritionLogged: () => void;
  axsMode: boolean;
  /** Modo Empresa: menú de trabajo de AXS (Panel, Proyectos, Pendientes, Sistema) */
  enterprise: boolean;
  enabledModules: string[];
  onTojiPress: () => void;
  onWalletPress: () => void;
  onInventoryPress: () => void;
  /** Pestaña en pantalla (nombre de la ruta): define el color del ícono de Eris */
  onTabChange?: (route?: string) => void;
}) {
  // Glucosa en revisión: sin visto bueno del administrador no aparece, aunque el perfil la tuviera activada
  const glucoseOn = useFeature('glucose');
  const has = (id: string) => enabledModules.includes(id) && (id !== 'glucosa' || glucoseOn);
  const insets = useSafeAreaInsets();
  const TAB_BAR_HEIGHT = 56 + insets.bottom;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <NavigationContainer ref={navRef} onStateChange={(st) => onTabChange?.(st?.routes?.[st.index ?? 0]?.name)}>
        <Tab.Navigator
          key={[...enabledModules].sort().join('_') + (enterprise ? '#empresa' : axsMode ? '#hestia' : '#eris')}
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
            // La barra se registra para el recorrido guiado (que ilumina cada pestaña)
            tabBarBackground: () => <View style={s.tabBarBg} ref={tourRef('tabbar')} collapsable={false} />,
            // Nombres simples a la vista (las rutas siguen igual: la navegación y los íconos las usan)
            tabBarLabel: TAB_LABELS[route.name] ?? route.name,
            tabBarIcon: ({ focused }) => (
              <View style={[tabS.iconWrap, focused && tabS.iconActive]}>
                <SvgTabIcon name={route.name} focused={focused} />
              </View>
            ),
          })}
        >
          {enterprise ? (
            <>
              {/* MODO EMPRESA: el trabajo de AXS. Forge y Finanzas siguen a un toque desde el Panel; Hestia, en la burbuja */}
              <Tab.Screen name="Panel">
                {() => <EnterprisePanel onNavigateToChat={onNavigateToChat} onTojiPress={onTojiPress} onWalletPress={onWalletPress} />}
              </Tab.Screen>
              <Tab.Screen name="Proyectos">
                {() => <EnterpriseProjects onNavigateToChat={onNavigateToChat} />}
              </Tab.Screen>
              <Tab.Screen name="Pendientes">
                {() => <EnterprisePending onNavigateToChat={onNavigateToChat} />}
              </Tab.Screen>
              <Tab.Screen name="Sistema">
                {() => <EnterpriseSystem />}
              </Tab.Screen>
              <Tab.Screen name="ID">
                {() => <ProfileScreen onLogout={onLogout} onSwitchAccount={onSwitchAccount} />}
              </Tab.Screen>
            </>
          ) : axsMode ? (
            <>
              {/* AXS EXECUTIVE TABS (Hestia): las mismas vistas y permisos que Eris */}
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
              {glucoseOn && <Tab.Screen name="SEC" component={GlucoTrackScreen} />}
              <Tab.Screen name="NUT">
                {() => <NutritionScreen onDataLogged={onNutritionLogged} />}
              </Tab.Screen>
              <Tab.Screen
                name="FIN"
                listeners={{ tabPress: (e) => { e.preventDefault(); onWalletPress(); } }}
              >
                {() => <View style={{ flex: 1, backgroundColor: T.bg }} />}
              </Tab.Screen>
              <Tab.Screen
                name="INV"
                listeners={{ tabPress: (e) => { e.preventDefault(); onInventoryPress(); } }}
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
              <Tab.Screen name="Dashboard">
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
                <Tab.Screen name="Nutri">
                  {() => <NutritionScreen onDataLogged={onNutritionLogged} />}
                </Tab.Screen>
              )}
              {has('finanzas') && (
                <Tab.Screen
                  name="Finanzas"
                  listeners={{ tabPress: (e) => { e.preventDefault(); onWalletPress(); } }}
                >
                  {() => <View style={{ flex: 1, backgroundColor: T.bg }} />}
                </Tab.Screen>
              )}
              {has('inventario') && (
                <Tab.Screen
                  name="Inventario"
                  listeners={{ tabPress: (e) => { e.preventDefault(); onInventoryPress(); } }}
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

  morphBackdrop: { backgroundColor: 'rgba(2,2,5,0.62)' },
  // Mismo color que el fondo del chat: cuando el círculo termina de crecer, el
  // chat aparece encima sin ningún corte de color.
  morphCircle: { position: 'absolute', backgroundColor: T.bg },
  // Borde cian que viaja con el frente del círculo y se apaga antes de llegar a las esquinas.
  morphEdge: { position: 'absolute', borderWidth: 2.5, borderColor: T.accent },
});

// Cache invalidate 2

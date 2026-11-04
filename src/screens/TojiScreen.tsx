import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator, StatusBar, DeviceEventEmitter, Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { moduleHtml } from '../services/ModuleHtml';
import { ErisMarkView } from '../../modules/eris-bubble/ErisMarkView';
import { PersonaStore, usePersona } from '../config/persona';
import { waterRule, proteinRule } from '../config/targetRules';
import { type HealthSnapshot, metricsService, ACTIVITY_DAYS_KEY } from '../services/MetricsService';
import { forgeActivity } from '../services/activityDetect';
import { wsManager } from '../services/WebSocketManager';
import { AuthStorage } from '../services/AuthStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '../config/design';
import { publishForgeState, publishForgeBody, publishRoutine } from '../services/forge/forgeSync';
import {
  onForgeDump, forgeDumpJS, forgeRestoreJS, restoreForgeBackup, fechaHora,
  FORGE_RESTORE_APPLY_EVENT, FORGE_RESTORE_DONE_EVENT, FORGE_RESTORE_OFFER_EVENT,
  type ForgeDump, type ForgeBackupCopy,
} from '../services/forgeBackup';

const todayKeyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface Props {
  snapshot: HealthSnapshot;
  onExit?: () => void;
  /** false mientras Forge está montado pero oculto (queda vivo tras la primera apertura: volver a entrar es instantáneo). */
  active?: boolean;
  /** Avisa si la app web está lista: el portal de entrada espera esto antes de abrirse. */
  onReadyChange?: (ready: boolean) => void;
}

/** La carga de Forge: el ícono de Eris "pensando" en el color de Forge (antes, una ruedita genérica). */
function Loader({ label }: { label: string }) {
  return (
    <>
      <ErisMarkView size={72} state="thinking" tint="forge" persona={PersonaStore.get()} disc={false}
        fallback={<ActivityIndicator color={T.accent} size="large" />} />
      <Text style={s.loaderText}>{label}</Text>
    </>
  );
}

export default function TojiScreen({ snapshot, onExit, active = true, onReadyChange }: Props) {
  const persona = usePersona(); // Eris, o Hestia en el Modo AXS Executive
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  // Forge arma "hoy" (misiones, racha) al montar: si quedó vivo de un día para otro, se vuelve a montar al entrar.
  const [dayKey, setDayKey] = useState(todayKeyLocal);
  // Se suma al restaurar un respaldo: vuelve a montar el WebView para que lea lo restaurado
  const [reloads, setReloads] = useState(0);
  const readyRef = useRef<(r: boolean) => void>(() => {});
  readyRef.current = (r: boolean) => onReadyChange?.(r);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  // Plan/rutina que Eris generó mientras Forge estaba cerrado — se
  // inyectan una sola vez al montar (ver useEffect de sync más abajo).
  const [pendingPlan, setPendingPlan] = useState<any>(null);
  const [pendingRoutine, setPendingRoutine] = useState<any>(null);
  // El WebView no debe montar hasta que la lectura de AsyncStorage termine
  // — si no, injectedJavaScriptBeforeContentLoaded se evalúa con pendingPlan
  // todavía en null (se fija async, después de profileId/htmlContent) y un
  // plan encolado se perdería en ese primer render.
  const [pendingChecked, setPendingChecked] = useState(false);
  // Respaldo en el PC (services/forgeBackup.ts): se pide el volcado unos segundos después de cada cambio
  const dumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestDump = useCallback((ms = 5000) => {
    if (dumpTimer.current) clearTimeout(dumpTimer.current);
    dumpTimer.current = setTimeout(() => { dumpTimer.current = null; webViewRef.current?.injectJavaScript(forgeDumpJS()); }, ms);
  }, []);
  useEffect(() => () => { if (dumpTimer.current) clearTimeout(dumpTimer.current); }, []);
  const profileIdRef = useRef<string | null>(null);
  useEffect(() => { profileIdRef.current = profileId; }, [profileId]);

  useEffect(() => {
    const load = async () => {
      let pid = 'anon';
      try {
        // El HTML ya viene precargado (ModuleHtml): no se espera al disco en cada apertura
        const [creds, html] = await Promise.all([AuthStorage.getCredentials(), moduleHtml('toji')]);
        pid = creds?.profileId ?? 'anon';
        setProfileId(pid);
        setHtmlContent(html);
      } catch (e) {
        console.warn('[Toji] Error loading HTML:', e);
        setProfileId('anon');
        readyRef.current(true); // que el portal no quede esperando
      }

      // Cola por perfil (mismo dispositivo puede tener otra cuenta activa
      // luego, y ni logout ni switch-account limpian AsyncStorage).
      try {
        const [planRaw, routineRaw] = await Promise.all([
          AsyncStorage.getItem(`pending_toji_plan_${pid}`),
          AsyncStorage.getItem(`pending_toji_routine_${pid}`),
        ]);
        if (planRaw) {
          setPendingPlan(JSON.parse(planRaw));
          AsyncStorage.removeItem(`pending_toji_plan_${pid}`).catch(() => {});
        }
        if (routineRaw) {
          setPendingRoutine(JSON.parse(routineRaw));
          AsyncStorage.removeItem(`pending_toji_routine_${pid}`).catch(() => {});
        }
      } catch {}
      setPendingChecked(true);
    };
    load();
  }, []);

  const handleLoadEnd = useCallback(() => {
    setLoading(false);
    readyRef.current(true);
    requestDump(3000);
  }, [requestDump]);

  // Restaurar un respaldo (desde Perfil o desde el aviso de abajo): se aplica en este mismo WebView y se vuelve a montar
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(FORGE_RESTORE_APPLY_EVENT, (p: { requestId: string; dump: ForgeDump }) => {
      if (!webViewRef.current || loading) {
        DeviceEventEmitter.emit(FORGE_RESTORE_DONE_EVENT, { requestId: p.requestId, ok: false, motivo: 'Forge todavía está cargando' });
        return;
      }
      webViewRef.current.injectJavaScript(forgeRestoreJS(p.requestId, p.dump));
    });
    return () => sub.remove();
  }, [loading]);

  // Forge vacío en este teléfono pero con un respaldo en el PC (reinstalaste, borraste los datos de la app): se ofrece
  // restaurarlo al entrar, una vez por sesión
  const [offer, setOffer] = useState<ForgeBackupCopy | null>(null);
  const offered = useRef(false);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(FORGE_RESTORE_OFFER_EVENT, (c: ForgeBackupCopy) => { if (!offered.current) setOffer(c); });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!offer || !active || loading || offered.current) return;
    offered.current = true;
    Alert.alert(
      'Tienes un respaldo de Forge',
      `En el PC hay una copia del ${fechaHora(offer.at)} con ${offer.stats.dias} días entrenados y ${offer.stats.habilidades} habilidades, y Forge está vacío en este teléfono. ¿La restauro?`,
      [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Restaurar', onPress: async () => { const r = await restoreForgeBackup(offer.day); Alert.alert(r.ok ? 'Forge restaurado' : 'No se pudo restaurar', r.message); } },
      ],
    );
  }, [offer, active, loading]);

  // Empuja pasos/sueño reales (Health Connect) al WebView ya cargado.
  // Reemplaza los antiguos toggles manuales de esas dos misiones — el HTML
  // los recibe vía window.__ERIS_UPDATE_DATA__ y se autocompletan solas.
  // + la actividad que el reloj detectó hoy sin modo entrenamiento y los días con ejercicio (para sugerir el nivel en Forge)
  const watchDaysRef = useRef<Record<string, number>>({});
  const pushLiveData = useCallback((data: { steps: number; sleep: number; activity?: ReturnType<typeof forgeActivity>; activityLevel?: HealthSnapshot['activityLevel'] }) => {
    const payload = { ...data, watchDays: watchDaysRef.current };
    webViewRef.current?.injectJavaScript(`
      if (window.__ERIS_UPDATE_DATA__) { window.__ERIS_UPDATE_DATA__(${JSON.stringify(payload)}); }
      true;
    `);
  }, []);
  useEffect(() => {
    Promise.all([metricsService.readExerciseDays(35).catch(() => ({} as Record<string, number>)), AsyncStorage.getItem(ACTIVITY_DAYS_KEY).catch(() => null)])
      .then(([hc, raw]) => {
        let det: Record<string, number> = {};
        try { det = raw ? JSON.parse(raw) : {}; } catch {}
        const out: Record<string, number> = { ...hc };
        for (const [k, v] of Object.entries(det)) out[k] = Math.max(out[k] ?? 0, Number(v) || 0);
        watchDaysRef.current = out;
      }).catch(() => {});
  }, []);

  // Reacciona de inmediato si App.tsx ya tiene un snapshot más fresco
  // (p.ej. justo después de loguear en Nutrición).
  useEffect(() => {
    if (loading) return;
    pushLiveData({ steps: snapshot.steps ?? 0, sleep: snapshot.sleep?.durationHours ?? 0, activity: forgeActivity(snapshot.activity), activityLevel: snapshot.activityLevel ?? null });
  }, [loading, snapshot.steps, snapshot.sleep, snapshot.activity, snapshot.activityLevel, pushLiveData]);

  // Polling propio mientras Forge está EN PANTALLA — no depende de que App.tsx
  // decida refrescar; da progreso real mientras el usuario lo mira (oculto no gasta batería).
  useEffect(() => {
    if (loading || !active) return;
    const interval = setInterval(async () => {
      const fresh = await metricsService.getSnapshot(true);
      pushLiveData({ steps: fresh.steps ?? 0, sleep: fresh.sleep?.durationHours ?? 0, activity: forgeActivity(fresh.activity), activityLevel: fresh.activityLevel ?? null });
    }, 60000);
    return () => clearInterval(interval);
  }, [loading, active, pushLiveData]);

  // Al volver a entrar (la vista quedó viva): si cambió el día se vuelve a montar; si no, datos frescos al tiro
  useEffect(() => {
    if (!active || loading) return;
    if (todayKeyLocal() !== dayKey) { setLoading(true); readyRef.current(false); setDayKey(todayKeyLocal()); return; }
    metricsService.getSnapshot().then((fresh) => {
      pushLiveData({ steps: fresh.steps ?? 0, sleep: fresh.sleep?.durationHours ?? 0, activity: forgeActivity(fresh.activity), activityLevel: fresh.activityLevel ?? null });
    }).catch(() => {});
  }, [active]);

  // Eris puede aplicar un plan de entrenamiento o guardar una rutina en
  // cualquier momento. Si el WebView ya cargó se aplica de inmediato; si no,
  // se encola por perfil para la próxima apertura de Forge (ver el useEffect
  // de carga inicial más arriba).
  useEffect(() => {
    const unsub = wsManager.subscribeMessage((payload) => {
      if (payload.type === 'toji_apply_plan') {
        const data = { dayLabel: payload.dayLabel, exercises: payload.exercises, newExercises: payload.newExercises };
        if (!loading) {
          webViewRef.current?.injectJavaScript(`
            if (window.__ERIS_APPLY_PLAN__) { window.__ERIS_APPLY_PLAN__(${JSON.stringify(data)}); }
            true;
          `);
        } else if (profileId) {
          AsyncStorage.setItem(`pending_toji_plan_${profileId}`, JSON.stringify(data)).catch(() => {});
        }
      } else if (payload.type === 'toji_save_routine') {
        const data = { md: payload.md, name: payload.name };
        if (!loading) {
          webViewRef.current?.injectJavaScript(`
            if (window.__ERIS_SAVE_ROUTINE__) { window.__ERIS_SAVE_ROUTINE__(${JSON.stringify(data)}); }
            true;
          `);
        } else if (profileId) {
          AsyncStorage.setItem(`pending_toji_routine_${profileId}`, JSON.stringify(data)).catch(() => {});
        }
      }
    });
    return () => { unsub(); };
  }, [loading, profileId]);

  // Solo true si el perfil declaró diabetes/prediabetes en su ficha médica
  // (Perfil → Salud). Forge no asume esto para nadie — es la única forma en
  // que la pantalla sabe si mostrar los avisos condicionales de glucosa.
  const medicalConditions = wsManager.getLastConnectedPayload()?.userProfile?.medical?.conditions ?? [];
  const isDiabetic = medicalConditions.some((c: any) => c?.id === 'diabetes_t1' || c?.id === 'diabetes_t2' || c?.id === 'prediabetes');
  // Agua según condiciones/medicamentos (misma regla que el servidor): enfermedad renal = sin meta, SGLT2 = +30 %
  const waterRuleJs = waterRule(wsManager.getLastConnectedPayload()?.userProfile?.medical);
  // Proteína: con enfermedad renal es un tope (manda sobre el objetivo que elijas en Forge)
  const proteinRuleJs = proteinRule(wsManager.getLastConnectedPayload()?.userProfile?.medical);

  const injectedJS = `
    (function() {
      try {
        window.__ERIS_PROFILE_ID__ = ${JSON.stringify(profileId || 'anon')};
        window.__ERIS_IS_DIABETIC__ = ${JSON.stringify(isDiabetic)};
        window.__ERIS_WATER_RULE__ = ${JSON.stringify(waterRuleJs)};
        window.__ERIS_PROTEIN_RULE__ = ${JSON.stringify(proteinRuleJs)};
        window.__ERIS_PENDING_PLAN__ = ${JSON.stringify(pendingPlan)};
        window.__ERIS_PENDING_ROUTINE__ = ${JSON.stringify(pendingRoutine)};
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
          activity: forgeActivity(snapshot.activity),
          activityLevel: snapshot.activityLevel ?? null,
        })};
        window.__ERIS_MISSIONS__ = {
          steps: (window.__ERIS_DATA__.steps || 0) >= 8000,
          sleep: (window.__ERIS_DATA__.sleep || 0) >= 7,
        };
      } catch(e) {}
      true;
    })();
  `;

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      // Respaldo: el volcado que pidió requestDump, y el resultado de restaurar uno
      if (data.type === 'toji_backup') { onForgeDump(data.dump); return; }
      if (data.type === 'toji_restored') {
        const r = data.result || {};
        DeviceEventEmitter.emit(FORGE_RESTORE_DONE_EVENT, { requestId: data.requestId, ok: r.ok === true, motivo: r.motivo });
        if (r.ok) { setLoading(true); readyRef.current(false); setReloads((n) => n + 1); }
        return;
      }
      if (data.type === 'TOJI_WORKOUT_SYNC') {
        AsyncStorage.setItem('toji_last_workout', data.lastWorkout).catch(() => {});
        // Señal real de "entrenó hoy" para el rollup de baselines del backend —
        // toji_last_workout es la fuente de verdad ya usada en DaySummaryCard,
        // pero es 100% local; esto la sube al servidor sin crear un tipo de
        // mensaje nuevo (reusa el mismo handler que ya mergea health snapshots).
        // `trainedDay`: el servidor solo cree lo de HOY (`trained` a secas quedaba en true para siempre, 2026-10-16)
        if (data.lastWorkout === todayKeyLocal()) {
          wsManager.sendMessage({ type: 'update_health_snapshot', snapshot: { trained: true, trainedDay: todayKeyLocal() } });
        }
      } else if (data.type === 'TOJI_STATE_SYNC') {
        // Caché para la burbuja, series por día para los avisos y Métricas, «entrenó hoy» y los ejercicios
        // personalizados para el servidor: lo mismo que hace Forge nativo (services/forge/forgeSync.ts)
        publishForgeState(data.tojiState || {}, profileIdRef.current);
        requestDump();
      } else if (data.type === 'TOJI_BODY_SYNC') {
        // Peso, altura, edad, sexo, actividad y entreno de hoy → el servidor calcula las metas de TODOS los módulos con esto
        publishForgeBody(data.body);
      } else if (data.type === 'TOJI_ROUTINE_SYNC') {
        publishRoutine(data.md, data.name);
        requestDump();
      }
    } catch {}
  }, [requestDump]);

  if (!htmlContent || profileId === null || !pendingChecked) {
    return (
      <View style={s.loader}>
        {active && <StatusBar barStyle="light-content" backgroundColor="#0c0b0e" />}
        <Loader label="INICIANDO FORGE…" />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {active && <StatusBar barStyle="light-content" backgroundColor="#0c0b0e" />}

      {/* Botón volver a Eris (solo sale del portal). Va en su propia franja, sobre Forge: flotando encima tapaba el
          título «FORGE» (2026-10-12). */}
      {onExit && (
        <View style={s.topBar}>
          <TouchableOpacity style={s.exitBtn} onPress={onExit} activeOpacity={0.75}>
            <Text style={s.exitBtnText}>← {persona.name}</Text>
          </TouchableOpacity>
        </View>
      )}

      <WebView
        key={`${dayKey}-${reloads}`}
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
          <Loader label="ENTRANDO EN FORGE…" />
        </View>
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

  // Botón "← Eris", en su franja sobre Forge
  topBar: { height: 46, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#0c0b0e' },
  exitBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(12,11,14,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.4)',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  exitBtnText: { color: T.accent, fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },
});

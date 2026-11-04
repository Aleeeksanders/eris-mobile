// ============================================================
// Forge 2.0 — Forge nativo (reemplaza al HTML toji.html con las mismas reglas: services/forge/forgeCore.ts).
//   - Primera vez con datos en el HTML: se migran comparando al peso (ForgeMigrator). Si algo no calza, sigue el HTML.
//   - Nunca usó Forge: parte nativo de cero (la bienvenida pide el cuerpo).
// Pestañas: Hoy · Entrenar · Personaje · Árbol · Arena · Progreso · Rutina (todo lo del HTML, más el registro por serie
// con carga real y RIR, «Mi gimnasio» y el catálogo con máquinas).
// ============================================================
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, StatusBar, ActivityIndicator, Alert, DeviceEventEmitter } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthStorage } from '../../services/AuthStorage';
import { forgeStore } from '../../services/forge/forgeStore';
import * as C from '../../services/forge/forgeCore';
import { refreshForgeEnv, setWatchDays } from '../../services/forge/forgeSync';
import { FORGE_RESTORE_OFFER_EVENT, restoreForgeBackup, fechaHora, type ForgeBackupCopy } from '../../services/forgeBackup';
import { type HealthSnapshot, metricsService, ACTIVITY_DAYS_KEY } from '../../services/MetricsService';
import { forgeActivity } from '../../services/activityDetect';
import { usePersona } from '../../config/persona';
import TojiScreen from '../TojiScreen';
import ForgeMigrator, { type ForgeMigrationOutcome } from './ForgeMigrator';
import { sleepReadiness, lastSleepFrom } from '../../services/sleep/sleepCore';
import ForgeShell from './ForgeShell';
import { FG } from './theme';
import { useForgeAct } from './useForge';
export { useForgeUi, type Tab } from './forgeUi';

interface Props {
  snapshot: HealthSnapshot;
  onExit?: () => void;
  active?: boolean;
  onReadyChange?: (ready: boolean) => void;
}
type Phase = 'loading' | 'migrating' | 'native' | 'web';

export default function ForgeScreen({ snapshot, onExit, active = true, onReadyChange }: Props) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('loading');
  const [profileId, setProfileId] = useState<string | null>(null);
  const readyRef = useRef(onReadyChange); readyRef.current = onReadyChange;

  useEffect(() => {
    (async () => {
      const creds = await AuthStorage.getCredentials().catch(() => null);
      setProfileId(creds?.profileId ?? 'anon');
      setPhase((await forgeStore.exists()) ? 'native' : 'migrating');
    })();
  }, []);
  useEffect(() => { if (phase === 'native') readyRef.current?.(true); }, [phase]);

  const onMigrated = useCallback((o: ForgeMigrationOutcome) => {
    setPhase(o.kind === 'migrated' || o.kind === 'empty' ? 'native' : 'web');
  }, []);

  if (phase === 'web') return <TojiScreen snapshot={snapshot} onExit={onExit} active={active} onReadyChange={onReadyChange} />;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {active && <StatusBar barStyle="light-content" backgroundColor={FG.bg} />}
      {phase === 'migrating' && profileId && <ForgeMigrator profileId={profileId} onDone={onMigrated} />}
      {(phase === 'loading' || phase === 'migrating') && (
        <View style={st.center}><ActivityIndicator color={FG.red} /><Text style={st.loading}>{phase === 'migrating' ? 'Pasando Forge a la nueva versión…' : ''}</Text></View>
      )}
      {phase === 'native' && <NativeForge snapshot={snapshot} onExit={onExit} active={active} />}
    </View>
  );
}

/** Forge nativo: los datos del reloj, las reglas del servidor y el respaldo, alrededor de la interfaz (ForgeShell). */
function NativeForge({ snapshot, onExit, active }: { snapshot: HealthSnapshot; onExit?: () => void; active: boolean }) {
  const act = useForgeAct();
  const persona = usePersona();

  // Reglas del servidor y días con ejercicio del reloj (lo que TojiScreen inyectaba)
  useEffect(() => {
    refreshForgeEnv();
    Promise.all([metricsService.readExerciseDays(35).catch(() => ({} as Record<string, number>)), AsyncStorage.getItem(ACTIVITY_DAYS_KEY).catch(() => null)])
      .then(([hc, raw]) => {
        let det: Record<string, number> = {};
        try { det = raw ? JSON.parse(raw) : {}; } catch {}
        const out: Record<string, number> = { ...hc };
        for (const [k, v] of Object.entries(det)) out[k] = Math.max(out[k] ?? 0, Number(v) || 0);
        setWatchDays(out);
      }).catch(() => {});
  }, []);

  // Pasos, sueño, actividad del reloj y nivel automático → misiones y metas (applyLiveData del HTML)
  useEffect(() => {
    const data = { steps: snapshot.steps ?? 0, sleep: snapshot.sleep?.durationHours ?? 0, activity: forgeActivity(snapshot.activity), activityLevel: snapshot.activityLevel ?? null };
    act((s) => C.applyLiveData(s, data), 'datos del reloj');
  }, [snapshot.steps, snapshot.sleep, snapshot.activity, snapshot.activityLevel]);

  // Al volver a entrar: día nuevo → el paso de día del HTML (forgeStore.load lo hace)
  useEffect(() => { if (active) forgeStore.load().catch(() => {}); }, [active]);

  // Forge vacío en este teléfono y un respaldo con datos en el PC: se ofrece restaurarlo (una vez)
  const offered = useRef(false);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(FORGE_RESTORE_OFFER_EVENT, (c: ForgeBackupCopy) => {
      if (offered.current) return;
      offered.current = true;
      Alert.alert('Tienes un respaldo de Forge', `En el PC hay una copia del ${fechaHora(c.at)} con ${c.stats.dias} días entrenados y ${c.stats.habilidades} habilidades, y Forge está vacío en este teléfono. ¿La restauro?`, [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Restaurar', onPress: async () => { const r = await restoreForgeBackup(c.day); Alert.alert(r.ok ? 'Forge restaurado' : 'No se pudo restaurar', r.message); } },
      ]);
    });
    return () => sub.remove();
  }, []);

  // Sueño 2.0 · S3: cómo llega a entrenar (las 3 últimas noches + la deuda), lo mismo que dice Eris en el chat
  const ready = useMemo(() => sleepReadiness(snapshot.sleepInsights, lastSleepFrom(snapshot.sleep)), [snapshot.sleepInsights, snapshot.sleep]);
  return <ForgeShell onExit={onExit} exitLabel={persona.name} active={active} ready={ready} />;
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: FG.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: FG.bg },
  loading: { color: FG.muted, fontSize: 13 },
});

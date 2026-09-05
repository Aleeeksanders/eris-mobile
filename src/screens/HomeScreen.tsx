import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, RefreshControl, StatusBar, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { metricsService, type HealthSnapshot } from '../services/MetricsService';
import { wsManager } from '../services/WebSocketManager';
import { T, R, S } from '../config/design';

// ─── Score Ring ─────────────────────────────────────────────
function ScoreRing({ score, size = 160 }: { score: number; size?: number }) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: score / 100,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [score]);

  const color = score >= 75 ? T.green : score >= 50 ? T.gold : T.red;
  const label = score >= 75 ? 'Óptimo' : score >= 50 ? 'Aceptable' : score >= 25 ? 'Bajo' : 'Crítico';

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Track */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} fill="none"
        />
        {/* Progress */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference * (1 - score / 100)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ alignItems: 'center' }}>
        <Text style={[scoreRingS.number, { color }]}>{score}</Text>
        <Text style={scoreRingS.label}>{label}</Text>
      </View>
    </View>
  );
}
const scoreRingS = StyleSheet.create({
  number: { fontSize: 38, fontWeight: '900', letterSpacing: -2 },
  label: { fontSize: 11, color: T.textMuted, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
});

// ─── Metric Card ────────────────────────────────────────────
function MetricCard({
  icon, label, value, unit, color, sublabel,
}: {
  icon: string; label: string; value: string | number | null; unit: string; color: string; sublabel?: string;
}) {
  const glow = color + '20';
  return (
    <View style={[mc.card, { borderColor: color + '30', backgroundColor: T.bgCard }]}>
      <View style={[mc.iconBox, { backgroundColor: glow }]}>
        <Text style={mc.icon}>{icon}</Text>
      </View>
      <Text style={mc.label}>{label}</Text>
      {value !== null ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <Text style={[mc.value, { color }]}>{value}</Text>
          <Text style={mc.unit}>{unit}</Text>
        </View>
      ) : (
        <Text style={mc.noData}>Sin datos</Text>
      )}
      {sublabel ? <Text style={mc.sublabel}>{sublabel}</Text> : null}
    </View>
  );
}
const mc = StyleSheet.create({
  card: {
    flex: 1, minWidth: '47%', padding: 16,
    borderRadius: R.lg, borderWidth: 1, marginBottom: 10,
  },
  iconBox: { width: 36, height: 36, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  icon: { fontSize: 18 },
  label: { fontSize: 11, color: T.textMuted, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  value: { fontSize: 24, fontWeight: '900' },
  unit: { fontSize: 12, color: T.textMuted, fontWeight: '600' },
  noData: { fontSize: 13, color: T.textMuted, fontStyle: 'italic' },
  sublabel: { fontSize: 10, color: T.textMuted, marginTop: 4 },
});

// ─── Eris Insight Card ──────────────────────────────────────
function ErisInsightCard({ snapshot, score, onChat }: { snapshot: HealthSnapshot; score: number; onChat: (msg: string) => void }) {
  const getInsight = () => {
    if (!snapshot.sleep && !snapshot.heartRate) {
      return { text: 'Conecta Google Health para que pueda analizar tu sueño y frecuencia cardíaca y darte recomendaciones personalizadas.', action: null };
    }

    const sleep = snapshot.sleep?.durationHours ?? 0;
    const resting = snapshot.heartRate?.resting ?? null;
    const steps = snapshot.steps ?? 0;

    if (sleep < 6) return {
      text: `Dormiste ${sleep}h anoche — bajo tu óptimo. Evitaría decisiones de alto impacto hoy. ¿Quieres estrategias para recuperarte?`,
      action: 'Sí, dame estrategias de recuperación para hoy',
    };
    if (resting !== null && resting > 75) return {
      text: `Tu FC en reposo de ${resting} bpm está elevada. Puede indicar fatiga acumulada, poco descanso o deshidratación.`,
      action: `Mi FC en reposo es ${resting} bpm, ¿qué puede estar causando esto y qué hago?`,
    };
    if (steps > 0 && steps < 3000 && new Date().getHours() >= 18) return {
      text: `Solo ${steps.toLocaleString()} pasos hoy y ya es tarde. Incluso una caminata de 20 min marca diferencia en tu recuperación nocturna.`,
      action: '¿Cuántos pasos mínimos necesito para impactar mi salud con mi rutina actual?',
    };
    if (score >= 75) return {
      text: `Tus métricas de hoy son sólidas (score ${score}/100). Buen día para trabajo profundo o decisiones importantes.`,
      action: '¿Cómo optimizo mi jornada dado mi estado biométrico de hoy?',
    };

    return {
      text: `Score del día: ${score}/100. Hay margen de mejora. ¿Quieres un análisis de tus patrones?`,
      action: 'Analiza mis métricas y dame recomendaciones',
    };
  };

  const { text, action } = getInsight();

  return (
    <View style={ins.card}>
      <View style={ins.header}>
        <View style={ins.avatar}><Text style={ins.avatarText}>⚡</Text></View>
        <Text style={ins.title}>Eris — Análisis del Día</Text>
      </View>
      <Text style={ins.text}>{text}</Text>
      {action && (
        <TouchableOpacity style={ins.btn} onPress={() => onChat(action)}>
          <Text style={ins.btnText}>Analizar con Eris →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const ins = StyleSheet.create({
  card: {
    backgroundColor: T.bgCard, borderRadius: R.xl, padding: 20,
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.2)',
    marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: T.accentGlow, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.borderActive,
  },
  avatarText: { fontSize: 14 },
  title: { color: T.accent, fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  text: { color: T.textLight, fontSize: 14, lineHeight: 22 },
  btn: {
    marginTop: 14, backgroundColor: T.accentGlow, borderRadius: R.md,
    paddingVertical: 10, paddingHorizontal: 16,
    borderWidth: 1, borderColor: T.borderActive, alignSelf: 'flex-start',
  },
  btnText: { color: T.accent, fontWeight: '700', fontSize: 13 },
});

// ─── Main HomeScreen ─────────────────────────────────────────
export default function HomeScreen({ onNavigateToChat }: { onNavigateToChat?: (msg?: string) => void }) {
  const insets = useSafeAreaInsets();
  const [snapshot, setSnapshot] = useState<HealthSnapshot>(metricsService.getEmptySnapshot());
  const [score, setScore] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [healthAvailable, setHealthAvailable] = useState(false);

  const loadMetrics = async () => {
    const data = await metricsService.getSnapshot();
    setSnapshot(data);
    setScore(metricsService.calcDayScore(data));
  };

  useEffect(() => {
    metricsService.init().then(ok => {
      setHealthAvailable(ok === true);
      loadMetrics();
    });
  }, []);

  const healthNeedsAuth = healthAvailable && !metricsService.isPermissionsGranted();

  const handleReconnectHealth = async () => {
    await metricsService.openPermissionsScreen();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMetrics();
    setRefreshing(false);
  };

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';

  const sleepVal = snapshot.sleep ? snapshot.sleep.durationHours : null;
  const sleepSub = sleepVal
    ? sleepVal >= 7.5 ? 'Óptimo' : sleepVal >= 6 ? 'Aceptable' : 'Insuficiente'
    : undefined;

  const handleErisChat = (msg: string) => {
    // Enviar el mensaje al chat con contexto biométrico
    const contextMsg = `${msg}\n\n[Contexto biométrico: ${metricsService.toErisContext(snapshot)}]`;
    onNavigateToChat?.(contextMsg);
  };

  return (
    <View style={[s.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>{greeting}</Text>
            <Text style={s.date}>{now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          </View>
          {!healthAvailable && (
            <View style={s.noHealthBadge}>
              <Text style={s.noHealthText}>Demo</Text>
            </View>
          )}
        </View>

        {/* Banner permisos HC revocados (pasa al actualizar APK sideloaded) */}
        {healthNeedsAuth && (
          <TouchableOpacity style={s.hcBanner} onPress={handleReconnectHealth} activeOpacity={0.8}>
            <Text style={s.hcBannerIcon}>🔗</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.hcBannerTitle}>Health Connect necesita reconectarse</Text>
              <Text style={s.hcBannerDesc}>Los permisos se revocaron al actualizar la app. Toca para restaurarlos.</Text>
            </View>
            <Text style={s.hcBannerArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Score del Día */}
        <View style={s.scoreCard}>
          <ScoreRing score={score} size={156} />
          <View style={s.scoreRight}>
            <Text style={s.scoreTitle}>Score Ejecutivo</Text>
            <Text style={s.scoreDesc}>Basado en sueño, HRV,{'\n'}actividad y biometría</Text>
            <TouchableOpacity style={s.scoreBtn} onPress={() => onNavigateToChat?.()}>
              <Text style={s.scoreBtnText}>Consultar a Eris ⚡</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Eris Insight */}
        <ErisInsightCard snapshot={snapshot} score={score} onChat={handleErisChat} />

        {/* Métricas Grid */}
        <Text style={s.sectionTitle}>MÉTRICAS DE HOY</Text>
        <View style={s.grid}>
          <MetricCard
            icon="😴" label="SUEÑO" value={sleepVal} unit="h"
            color={T.purple} sublabel={sleepSub}
          />
          <MetricCard
            icon="❤️" label="FC REPOSO" value={snapshot.heartRate?.resting ?? null} unit="bpm"
            color={T.red}
            sublabel={snapshot.heartRate?.resting != null ? (snapshot.heartRate.resting <= 60 ? 'Excelente' : snapshot.heartRate.resting <= 70 ? 'Normal' : 'Elevado') : undefined}
          />
          <MetricCard
            icon="🏃" label="PASOS" value={snapshot.steps !== null ? snapshot.steps.toLocaleString() : null} unit=""
            color={T.green}
            sublabel={snapshot.steps !== null ? `${Math.round((snapshot.steps / 10000) * 100)}% del objetivo` : undefined}
          />
          <MetricCard
            icon="🔥" label="CALORÍAS" value={snapshot.calories} unit="kcal"
            color={T.gold}
            sublabel={[
              snapshot.distance !== null ? `${snapshot.distance} km` : '',
              snapshot.activeMinutes !== null ? `${snapshot.activeMinutes} min activos` : '',
            ].filter(Boolean).join(' · ') || undefined}
          />
          {snapshot.respiratoryRate !== null && (
            <MetricCard
              icon="🌬️" label="RESPIRACIÓN" value={snapshot.respiratoryRate} unit="resp/min"
              color={T.accent}
              sublabel={snapshot.respiratoryRate >= 12 && snapshot.respiratoryRate <= 20 ? 'Normal' : 'Fuera de rango'}
            />
          )}
          {snapshot.vo2Max !== null && (
            <MetricCard
              icon="🫁" label="VO₂ MÁX" value={snapshot.vo2Max} unit="ml/kg/min"
              color={T.green}
              sublabel={snapshot.vo2Max >= 45 ? 'Bueno' : snapshot.vo2Max >= 35 ? 'Promedio' : 'Por mejorar'}
            />
          )}
          {snapshot.spo2 !== null && (
            <MetricCard
              icon="🫀" label="SpO2" value={snapshot.spo2} unit="%"
              color={snapshot.spo2 >= 97 ? T.accent : snapshot.spo2 >= 95 ? T.gold : T.red}
              sublabel={snapshot.spo2 >= 97 ? 'Óptimo' : snapshot.spo2 >= 95 ? 'Aceptable' : 'Bajo'}
            />
          )}
          {snapshot.glucose !== null && (
            <MetricCard
              icon="🩸" label="GLUCOSA" value={snapshot.glucose.valueMgdl} unit="mg/dL"
              color={snapshot.glucose.valueMgdl > 180 ? T.red : snapshot.glucose.valueMgdl < 70 ? T.gold : T.green}
              sublabel={snapshot.glucose.valueMgdl > 180 ? 'Alto' : snapshot.glucose.valueMgdl < 70 ? 'Bajo' : 'En rango'}
            />
          )}
        </View>

        <Text style={s.updated}>
          Actualizado {new Date(snapshot.lastUpdated).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  scroll: { flex: 1 },
  content: { padding: S.md, paddingBottom: S.xl * 2 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingTop: 8 },
  greeting: { fontSize: 22, fontWeight: '800', color: T.text },
  date: { fontSize: 13, color: T.textMuted, marginTop: 2, textTransform: 'capitalize' },
  noHealthBadge: { backgroundColor: T.goldGlow, paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.full, borderWidth: 1, borderColor: T.gold + '40' },
  noHealthText: { color: T.gold, fontSize: 11, fontWeight: '700' },

  scoreCard: {
    flexDirection: 'row', alignItems: 'center', gap: 24,
    backgroundColor: T.bgCard, borderRadius: R.xl, padding: S.lg,
    borderWidth: 1, borderColor: T.border, marginBottom: 16,
  },
  scoreRight: { flex: 1 },
  scoreTitle: { fontSize: 16, fontWeight: '800', color: T.text, marginBottom: 6 },
  scoreDesc: { fontSize: 12, color: T.textMuted, lineHeight: 18, marginBottom: 14 },
  scoreBtn: {
    backgroundColor: T.accentGlow, borderRadius: R.md,
    paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: T.borderActive, alignSelf: 'flex-start',
  },
  scoreBtnText: { color: T.accent, fontWeight: '700', fontSize: 12 },

  sectionTitle: { color: T.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 12, marginTop: 8 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  weightCard: {
    backgroundColor: T.bgCard, borderRadius: R.lg, padding: 16,
    borderWidth: 1, borderColor: T.border, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', marginTop: 4,
  },
  weightLabel: { fontSize: 13, color: T.textMuted, fontWeight: '600' },
  weightValue: { fontSize: 22, fontWeight: '900', color: T.text },
  weightUnit: { fontSize: 14, color: T.textMuted, fontWeight: '600' },

  updated: { color: T.textMuted, fontSize: 11, textAlign: 'center', marginTop: 20 },

  hcBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#7c2d12', borderRadius: R.lg,
    padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: '#f97316' + '60',
  },
  hcBannerIcon: { fontSize: 20 },
  hcBannerTitle: { color: '#fed7aa', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  hcBannerDesc: { color: '#fdba74', fontSize: 11, lineHeight: 15 },
  hcBannerArrow: { color: '#f97316', fontSize: 24, fontWeight: '300' },
});

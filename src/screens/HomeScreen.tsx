import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, RefreshControl, StatusBar, TextInput, DeviceEventEmitter, LayoutAnimation, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrainingIntentCard from '../components/TrainingIntentCard';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle } from 'react-native-svg';
import { metricsService, computeMacroPercents, type HealthSnapshot, type DayScores } from '../services/MetricsService';
import { freshSavingsRate } from '../services/hwExtract';
import { wsManager } from '../services/WebSocketManager';
import { nutritionBackend } from '../services/NutritionBackend';
import { evaluateFromSnapshot } from '../services/NutritionQuality';
import { AuthStorage } from '../services/AuthStorage';
import { HealthSyncBanner } from '../components/HealthSyncStatus';
import { T, R, S } from '../config/design';
import { usePersona } from '../config/persona';
import ModeSwitch from '../components/ModeSwitch';
import InternalClock from '../components/InternalClock';
import SleepScreen from './sleep/SleepScreen';
import WakeCard from '../components/home/WakeCard';
import { sleepDayTip, lastSleepFrom } from '../services/sleep/sleepCore';
import { usePerfilMedico } from './inventory/useMedical';
import NowCard from '../components/home/NowCard';
import ErisPlan, { useDayPlan } from '../components/home/ErisPlan';
import { dayPlanStore, nextStep } from '../services/dayPlan/dayPlanStore';
import DayChips from '../components/home/DayChips';
import TipCard from '../components/home/TipCard';
import type { TipAction } from '../services/tips';
import GuidedTour, { type TourStep } from '../components/tour/GuidedTour';
import { tourRef, measureTarget, TOUR_EVENT, type Rect } from '../components/tour/tourTargets';
import { getErisBubbleCenter, BUBBLE_SIZE } from '../components/ErisFAB';
import { useDayModel } from '../components/home/dayModel';
import { NOTIFICATION_OPEN_EVENT } from '../services/ErisNotifications';
import { coma } from '../services/fmtNum';

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

// Lo anotado por chat vive en el servidor; se suma a Health Connect SOLO lo que aún no está copiado allí
// (ver services/NutritionBackend.ts). Antes se sumaba siempre y se contaba doble.

// ─── Score Ring ─────────────────────────────────────────────
// score null = todavía no hay datos para calcularlo (no es un 0 ni "Crítico")
function ScoreRing({ score, size = 160 }: { score: number | null; size?: number }) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: (score ?? 0) / 100,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [score]);

  const color = score === null ? T.textMuted : score >= 75 ? T.green : score >= 50 ? T.gold : T.red;
  const label = score === null ? 'Sin datos' : score >= 75 ? 'Óptimo' : score >= 50 ? 'Aceptable' : score >= 25 ? 'Bajo' : 'Crítico';

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
          strokeDashoffset={circumference * (1 - (score ?? 0) / 100)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ alignItems: 'center' }}>
        <Text style={[scoreRingS.number, { color }]}>{score ?? '—'}</Text>
        <Text style={scoreRingS.label}>{label}</Text>
      </View>
    </View>
  );
}
const scoreRingS = StyleSheet.create({
  number: { fontSize: 38, fontWeight: '900', letterSpacing: -2 },
  label: { fontSize: 11, color: T.textMuted, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
});

// ─── Macro Donut (multi-segmento) ──────────────────────────
const MACRO_COLORS = { protein: T.accent, carbs: T.gold, fat: T.red };

function MacroDonut({ nutrition, size = 92 }: { nutrition: HealthSnapshot['nutrition']; size?: number }) {
  const strokeWidth = 13;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const { proteinPct, carbsPct, fatPct } = computeMacroPercents(nutrition);
  const hasData = proteinPct + carbsPct + fatPct > 0;
  const segments = [
    { pct: proteinPct, color: MACRO_COLORS.protein },
    { pct: carbsPct, color: MACRO_COLORS.carbs },
    { pct: fatPct, color: MACRO_COLORS.fat },
  ];
  let acc = 0;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} fill="none"
        />
        {hasData && segments.map((seg, i) => {
          if (seg.pct <= 0) return null;
          const len = (seg.pct / 100) * circumference;
          const offset = -(acc / 100) * circumference;
          acc += seg.pct;
          return (
            <Circle
              key={i}
              cx={size / 2} cy={size / 2} r={radius}
              stroke={seg.color} strokeWidth={strokeWidth} fill="none"
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
        })}
      </Svg>
      {hasData ? (
        // Como FatSecret/MyFitnessPal: el total al centro, no solo el anillo — ahorra mirar la tarjeta de al lado.
        <View style={{ alignItems: 'center' }}>
          <Text style={donutS.calories}>{nutrition!.calories}</Text>
          <Text style={donutS.caloriesLabel}>kcal</Text>
        </View>
      ) : (
        <Text style={{ fontSize: 9, color: T.textMuted, textAlign: 'center', paddingHorizontal: 6 }}>Sin datos</Text>
      )}
    </View>
  );
}
const donutS = StyleSheet.create({
  calories: { fontSize: 18, fontWeight: '900', color: T.text, letterSpacing: -0.5 },
  caloriesLabel: { fontSize: 9, color: T.textMuted, fontWeight: '700', marginTop: -2 },
});

// ─── Metric Card ────────────────────────────────────────────
function MetricCard({
  icon, label, value, unit, color, sublabel, onPress,
}: {
  icon: string; label: string; value: string | number | null; unit: string; color: string; sublabel?: string; onPress?: () => void;
}) {
  const glow = color + '20';
  const Box: any = onPress ? TouchableOpacity : View;
  return (
    <Box style={[mc.card, { borderColor: color + '30', backgroundColor: T.bgCard }]} {...(onPress ? { onPress, activeOpacity: 0.7, accessibilityRole: 'button' } : {})}>
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
    </Box>
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
// El texto ya NO es una cascada local de umbrales genéricos — se le pide
// al backend, que compara contra el patrón histórico PERSONAL del usuario
// (BaselineEngine) y redacta un diagnóstico aislado a la variable que más
// se desvía. Ver plan "Eris — motor de baselines personales".
const INSIGHT_CACHE_TTL_MS = 15 * 60 * 1000;
const INSIGHT_TIMEOUT_MS = 15_000;

interface InsightReadiness { unlocked: boolean; daysTracked: number; daysRemaining: number }

function ErisInsightCard({ onChat }: { onChat: (msg: string) => void }) {
  const persona = usePersona(); // Eris, o Hestia en el Modo AXS Executive
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<InsightReadiness | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const creds = await AuthStorage.getCredentials();
      const pid = creds?.profileId ?? null;
      if (!pid) { if (!cancelled) setLoading(false); return; }

      // v2: la tarjeta guardada antes del 2026-10-10 hablaba de una "mejora del 4869 %" (era el saldo de Finanzas): se descarta
      const cacheKey = `eris_daily_insight_v2_${pid}`;
      const cachedRaw = await AsyncStorage.getItem(cacheKey);
      const cached = cachedRaw ? JSON.parse(cachedRaw) : null;
      if (cached?.text && !cancelled) {
        setText(cached.text);
        setLoading(false);
        if (cached.readiness) setReadiness(cached.readiness);
      }

      if (cached?.updatedAt && Date.now() - cached.updatedAt < INSIGHT_CACHE_TTL_MS) return;

      const timer = setTimeout(() => { if (!cancelled) setLoading(false); }, INSIGHT_TIMEOUT_MS);
      const unsub = wsManager.subscribeMessage((data: any) => {
        if (cancelled || data?.type !== 'daily_insight') return;
        clearTimeout(timer);
        unsub();
        setText(data.text);
        setLoading(false);
        const nextReadiness: InsightReadiness | null = typeof data.unlocked === 'boolean'
          ? { unlocked: data.unlocked, daysTracked: data.daysTracked ?? 0, daysRemaining: data.daysRemaining ?? 0 }
          : null;
        if (nextReadiness) setReadiness(nextReadiness);
        AsyncStorage.setItem(cacheKey, JSON.stringify({ text: data.text, readiness: nextReadiness, updatedAt: Date.now() })).catch(() => {});
      });
      wsManager.sendMessage({ type: 'request_daily_insight' });
    })();

    return () => { cancelled = true; };
  }, []);

  const displayText = text ?? (loading ? 'Analizando tu día…' : `No pude conectar con ${persona.name} para el análisis de hoy. Intenta más tarde.`);

  return (
    <View style={ins.card}>
      <View style={ins.header}>
        <View style={ins.avatar}><Text style={ins.avatarText}>⚡</Text></View>
        <Text style={ins.title}>{persona.name} — Análisis del Día</Text>
      </View>

      {readiness && (
        <TouchableOpacity
          style={[ins.readinessPill, readiness.unlocked ? ins.readinessPillUnlocked : ins.readinessPillLocked]}
          onPress={() => onChat(
            readiness.unlocked
              ? '¿Qué significa que ya tengas mi perfil de baselines desbloqueado? ¿Qué cambia en tus análisis ahora?'
              : `¿Cuánto historial llevas de mí y qué falta para que tus análisis sean 100% personalizados en vez de referencias generales?`
          )}
          activeOpacity={0.75}
        >
          <Text style={[ins.readinessPillText, { color: readiness.unlocked ? T.green : T.textMuted }]}>
            {readiness.unlocked
              ? `✓ ${persona.name} te conoce — asistente sin filtros`
              : `🔒 Datos genéricos · faltan ${readiness.daysRemaining} día${readiness.daysRemaining === 1 ? '' : 's'} para tu perfil personal`}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={ins.text}>{displayText}</Text>
      <TouchableOpacity style={ins.btn} onPress={() => onChat('Profundiza en tu análisis de hoy: ¿qué variable está fuera de mi patrón habitual y qué puedo hacer?')}>
        <Text style={ins.btnText}>Analizar con {persona.name} →</Text>
      </TouchableOpacity>
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
  readinessPill: {
    alignSelf: 'flex-start', borderRadius: R.full,
    paddingVertical: 5, paddingHorizontal: 12,
    borderWidth: 1, marginBottom: 12,
  },
  readinessPillLocked: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' },
  readinessPillUnlocked: { backgroundColor: T.green + '1a', borderColor: T.green + '50' },
  readinessPillText: { fontSize: 11, fontWeight: '700' },
});

// ─── Resumen del Día (agua, macros, entrenamiento, finanzas) ──
function DaySummaryCard({
  snapshot, waterGoal, trainedToday, finance,
}: {
  snapshot: HealthSnapshot;
  waterGoal: number;
  trainedToday: boolean;
  finance: { hunterRank?: string; rating?: { nota: string } | null; libre?: number | null; plata?: number | null; ahorroAcum?: number; savingsRate?: number } | null;
}) {
  const { proteinPct, carbsPct, fatPct } = computeMacroPercents(snapshot.nutrition);
  const hasMacros = proteinPct + carbsPct + fatPct > 0;
  const hydration = snapshot.hydration ?? 0;
  const hydrationPct = waterGoal > 0 ? Math.min(100, Math.round((hydration / waterGoal) * 100)) : 0;

  return (
    <View style={dsc.card}>
      <Text style={dsc.title}>RESUMEN DEL DÍA</Text>
      <View style={dsc.row}>
        <MacroDonut nutrition={snapshot.nutrition} />
        <View style={dsc.legend}>
          {hasMacros ? (
            <>
              <View style={dsc.legendItem}>
                <View style={[dsc.dot, { backgroundColor: MACRO_COLORS.protein }]} />
                <Text style={dsc.legendText}>Proteína</Text>
                <Text style={dsc.legendPct}>{proteinPct}%</Text>
              </View>
              <View style={dsc.legendItem}>
                <View style={[dsc.dot, { backgroundColor: MACRO_COLORS.carbs }]} />
                <Text style={dsc.legendText}>Carbos</Text>
                <Text style={dsc.legendPct}>{carbsPct}%</Text>
              </View>
              <View style={dsc.legendItem}>
                <View style={[dsc.dot, { backgroundColor: MACRO_COLORS.fat }]} />
                <Text style={dsc.legendText}>Grasa</Text>
                <Text style={dsc.legendPct}>{fatPct}%</Text>
              </View>
            </>
          ) : (
            <Text style={dsc.noMacros}>Sin registro de nutrición hoy</Text>
          )}
        </View>
      </View>

      <View style={dsc.divider} />

      <View style={dsc.statRow}>
        <Text style={dsc.statIcon}>💧</Text>
        <Text style={dsc.statLabel}>Hidratación</Text>
        <Text style={dsc.statValue}>{waterGoal > 0 ? `${coma(hydration ?? 0, 2)} L / ${coma(waterGoal, 2)} L` : `${coma(hydration ?? 0, 2)} L · sin meta`}</Text>
        <Text style={[dsc.statBadge, { color: hydrationPct >= 100 ? T.green : hydrationPct >= 60 ? T.gold : T.red }]}>{hydrationPct}%</Text>
      </View>

      <View style={dsc.statRow}>
        <Text style={dsc.statIcon}>🏋️</Text>
        <Text style={dsc.statLabel}>Entrenamiento</Text>
        <Text style={dsc.statValue}>{trainedToday ? 'Hoy entrenaste' : 'Sin entrenar hoy'}</Text>
        <Text style={[dsc.statBadge, { color: trainedToday ? T.green : T.textMuted }]}>{trainedToday ? '✓' : '—'}</Text>
      </View>

      <View style={dsc.statRow}>
        <Text style={dsc.statIcon}>💰</Text>
        <Text style={dsc.statLabel}>Finanzas</Text>
        {finance ? (
          <>
            <Text style={dsc.statValue}>{typeof finance.libre === 'number' ? `${clp(finance.libre)} para gastar` : typeof finance.plata === 'number' ? `Tu plata: ${clp(finance.plata)}` : 'Agrega tus cuentas'}</Text>
            <Text style={[dsc.statBadge, { color: T.gold }]}>{finance.rating?.nota ?? finance.hunterRank ?? '—'}</Text>
          </>
        ) : (
          <Text style={dsc.statValueMuted}>Abre Finanzas para sincronizar</Text>
        )}
      </View>
    </View>
  );
}
const dsc = StyleSheet.create({
  card: {
    backgroundColor: T.bgCard, borderRadius: R.xl, padding: 18,
    borderWidth: 1, borderColor: T.border, marginBottom: 16,
  },
  title: { color: T.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 4 },
  legend: { flex: 1, gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { flex: 1, color: T.textLight, fontSize: 13, fontWeight: '600' },
  legendPct: { color: T.text, fontSize: 13, fontWeight: '800' },
  noMacros: { color: T.textMuted, fontSize: 12, fontStyle: 'italic' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 14 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  statIcon: { fontSize: 16, width: 22 },
  statLabel: { color: T.textMuted, fontSize: 12, fontWeight: '600', width: 92 },
  statValue: { flex: 1, color: T.text, fontSize: 13, fontWeight: '700' },
  statValueMuted: { flex: 1, color: T.textMuted, fontSize: 12, fontStyle: 'italic' },
  statBadge: { fontSize: 13, fontWeight: '800' },
});

// ─── Bloc de notas (ánimo + texto libre) ───────────────────────
// No existía ningún lugar en la app para capturar cómo se siente el
// usuario más allá de lo inferible de sueño/HR — esto alimenta el
// mismo daily_rollup_log/BaselineEngine que las demás métricas.
const MOOD_OPTIONS: { score: number; emoji: string }[] = [
  { score: 1, emoji: '😞' }, { score: 2, emoji: '😕' }, { score: 3, emoji: '😐' },
  { score: 4, emoji: '🙂' }, { score: 5, emoji: '😄' },
];

function JournalCard() {
  const [todayEntry, setTodayEntry] = useState<{ moodScore?: number; note?: string } | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = wsManager.subscribeMessage((data: any) => {
      if (data?.type === 'about_me' && Array.isArray(data.journal)) {
        const today = todayKey();
        const mine = data.journal.find((e: any) => e.date === today);
        if (mine) {
          setTodayEntry({ moodScore: mine.moodScore, note: mine.note });
          setShowForm(false);
        }
      }
      if (data?.type === 'journal_entry_added') {
        setTodayEntry({ moodScore: data.entry?.moodScore, note: data.entry?.note });
        setShowForm(false);
        setSaving(false);
        setSelectedMood(null);
        setNote('');
      }
      if (data?.type === 'journal_entry_error') {
        setSaving(false);
      }
    });
    wsManager.sendMessage({ type: 'request_about_me' });
    return () => { unsub(); };
  }, []);

  const handleSave = () => {
    if (selectedMood === null && !note.trim()) return;
    setSaving(true);
    wsManager.sendMessage({ type: 'add_journal_entry', moodScore: selectedMood ?? undefined, note: note.trim() || undefined });
  };

  const moodEmoji = (score?: number) => MOOD_OPTIONS.find(m => m.score === score)?.emoji ?? '📝';

  return (
    <View style={jc.card}>
      <Text style={jc.title}>BLOC DE NOTAS</Text>

      {!showForm && todayEntry ? (
        <View>
          <View style={jc.summaryRow}>
            <Text style={jc.summaryEmoji}>{moodEmoji(todayEntry.moodScore)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={jc.summaryLabel}>Hoy anotaste{todayEntry.moodScore ? ` — ánimo ${todayEntry.moodScore}/5` : ''}</Text>
              {todayEntry.note ? <Text style={jc.summaryNote}>{todayEntry.note}</Text> : null}
            </View>
          </View>
          <TouchableOpacity onPress={() => setShowForm(true)}>
            <Text style={jc.addMore}>+ Agregar otra nota</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <Text style={jc.prompt}>¿Cómo te sientes hoy?</Text>
          <View style={jc.moodRow}>
            {MOOD_OPTIONS.map(m => (
              <TouchableOpacity
                key={m.score}
                style={[jc.moodBtn, selectedMood === m.score && jc.moodBtnOn]}
                onPress={() => setSelectedMood(m.score)}
                activeOpacity={0.75}
              >
                <Text style={jc.moodEmoji}>{m.emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={jc.input}
            value={note}
            onChangeText={setNote}
            placeholder="Escribe algo si quieres (opcional)"
            placeholderTextColor={T.textMuted}
            multiline
          />
          <TouchableOpacity
            style={[jc.saveBtn, (selectedMood === null && !note.trim()) && jc.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || (selectedMood === null && !note.trim())}
          >
            <Text style={jc.saveBtnText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
const jc = StyleSheet.create({
  card: {
    backgroundColor: T.bgCard, borderRadius: R.xl, padding: 18,
    borderWidth: 1, borderColor: T.border, marginBottom: 16,
  },
  title: { color: T.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 14 },
  prompt: { color: T.text, fontSize: 14, fontWeight: '600', marginBottom: 12 },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  moodBtn: {
    width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.border, backgroundColor: T.bg,
  },
  moodBtnOn: { borderColor: T.accent, backgroundColor: T.accentGlow },
  moodEmoji: { fontSize: 22 },
  input: {
    backgroundColor: T.bgInput, color: T.text, borderRadius: R.md, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, minHeight: 44, textAlignVertical: 'top', marginBottom: 12,
  },
  saveBtn: { backgroundColor: T.accent, borderRadius: R.md, paddingVertical: 12, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },
  summaryRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  summaryEmoji: { fontSize: 28 },
  summaryLabel: { color: T.text, fontSize: 13, fontWeight: '700' },
  summaryNote: { color: T.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  addMore: { color: T.accent, fontSize: 12, fontWeight: '700', marginTop: 12 },
});

// ─── Main HomeScreen ─────────────────────────────────────────
export default function HomeScreen({ onNavigateToChat }: { onNavigateToChat?: (msg?: string) => void }) {
  const persona = usePersona(); // Eris, o Hestia en el Modo AXS Executive
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [snapshot, setSnapshot] = useState<HealthSnapshot>(metricsService.getEmptySnapshot());
  const [scores, setScores] = useState<DayScores>({ fixed: null, dynamic: null, total: null });
  const [refreshing, setRefreshing] = useState(false);
  const [healthAvailable, setHealthAvailable] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [waterGoal, setWaterGoal] = useState(2.5);
  const [kcalGoal, setKcalGoal] = useState(0);
  const [proteinGoal, setProteinGoal] = useState(60); // = FALLBACK_PROTEIN_G del servidor hasta que lleguen tus metas (revisión M1)
  // Inicio más simple: el detalle (análisis, resumen, bloc de notas, pasos y sueño) queda en "Ver más"
  const day = useDayModel(snapshot.sleepInsights);
  const dayPlan = useDayPlan();
  // Sueño 2.0 · S3: la recomendación del día según cómo dormiste (con diabetes, el azúcar primero)
  const medical = usePerfilMedico();
  const diabetic = !!medical?.conditions?.some((c) => c?.id === 'diabetes_t1' || c?.id === 'diabetes_t2' || c?.id === 'prediabetes');
  const sleepTip = useMemo(() => sleepDayTip(snapshot.sleepInsights, lastSleepFrom(snapshot.sleep), { diabetic }), [snapshot.sleepInsights, snapshot.sleep, diabetic]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  useEffect(() => { AsyncStorage.getItem('eris_home_more_open').then((v) => setMoreOpen(v === '1')).catch(() => {}); }, []);
  const toggleMore = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMoreOpen((o) => { AsyncStorage.setItem('eris_home_more_open', o ? '0' : '1').catch(() => {}); return !o; });
  };
  const [trainedToday, setTrainedToday] = useState(false);
  const [financeSummary, setFinanceSummary] = useState<{ hunterRank?: string; rating?: { nota: string } | null; libre?: number | null; plata?: number | null; ahorroAcum?: number; savingsRate?: number } | null>(null);

  // Snapshot "crudo" de Health Connect + lo último que mandó el backend sobre
  // nutrición/agua del día — se recombinan en cada cambio de cualquiera de
  // los dos para no perder uno cuando el otro se refresca (ver
  // mergeBackendNutrition arriba).
  const rawSnapshotRef = useRef<HealthSnapshot>(metricsService.getEmptySnapshot());
  const recomputeSeq = useRef(0);
  // Mismo motivo que rawSnapshotRef: recomputeSnapshot se llama también desde un listener registrado una sola
  // vez al montar (nutritionBackend.subscribe), así que leer el estado directo daría un valor viejo — la ref
  // siempre tiene el último valor real, la actualiza el efecto de abajo.
  const scoreExtrasRef = useRef<{ trainedToday?: boolean; savingsRate?: number }>({});
  // Sin movimientos recientes en Finanzas, la tasa de ahorro sale 100 % (no hay gastos anotados): no suma al puntaje
  useEffect(() => { scoreExtrasRef.current = { trainedToday, savingsRate: freshSavingsRate(financeSummary) }; }, [trainedToday, financeSummary]);

  const recomputeSnapshot = async () => {
    const seq = ++recomputeSeq.current;
    const merged = await nutritionBackend.merge(rawSnapshotRef.current);
    // Calidad de lo comido a esta hora + hidratación esperable a esta hora (NutritionQuality): mismo cálculo que Métricas
    const quality = await evaluateFromSnapshot(merged).catch(() => null);
    if (seq !== recomputeSeq.current) return; // ya hay un recálculo más nuevo
    setSnapshot(merged);
    // Entrenamiento (Forge) y tasa de ahorro (Finanzas) ahora pesan de verdad en el Score, no solo se muestran
    // aparte — usan los mismos datos que ya carga loadExtras().
    const calculated = metricsService.calcDayScore(merged, 0.6, {
      ...scoreExtrasRef.current, foodScore: quality?.foodScore, hydrationScore: quality?.hydrationScore,
    });
    setScores(calculated);
  };

  const loadMetrics = async () => {
    const data = await metricsService.getSnapshot();
    rawSnapshotRef.current = data;
    recomputeSnapshot();
  };

  const loadExtras = async () => {
    try {
      let pid = profileId;
      if (!pid) {
        pid = (await AuthStorage.getCredentials())?.profileId ?? 'anon';
        setProfileId(pid);
      }

      const [goalsRaw, lastWk, financeRaw] = await Promise.all([
        AsyncStorage.getItem('eris_nutrition_goals_default'),
        AsyncStorage.getItem('toji_last_workout'),
        AsyncStorage.getItem(`finance_summary_${pid}`),
      ]);

      if (goalsRaw) {
        // waterTargetOff: el servidor no fija meta de agua (enfermedad renal: la define su nefrólogo) → 0 = sin meta
        try {
          const g = JSON.parse(goalsRaw);
          setWaterGoal(g.waterTargetOff ? 0 : (g.waterLiters || 2.5));
          setKcalGoal(g.calories > 0 ? g.calories : 0);
          setProteinGoal(g.proteinGGoal > 0 ? g.proteinGGoal : g.protein > 0 ? g.protein : 0);
        } catch {}
      }

      setTrainedToday(lastWk === todayKey());

      if (financeRaw) {
        try { setFinanceSummary(JSON.parse(financeRaw)); } catch {}
      }
    } catch {}
  };

  useEffect(() => {
    metricsService.init().then(ok => {
      setHealthAvailable(ok === true);
      loadMetrics();
    });
    loadExtras();

    // Nutrición/hidratación (por chat O anotada a mano en la pantalla de Nutrición): el servicio compartido avisa
    // en ambos casos (ver NutritionBackend.refreshLocal). Se relee Health Connect de cero, no solo se re-mergea el
    // snapshot en caché: lo anotado a mano nunca pasa por el servidor, así que la única forma de verlo es una
    // lectura fresca (antes esto solo re-mergeaba `rawSnapshotRef` viejo y un registro manual nunca aparecía).
    nutritionBackend.start();
    const unsub = nutritionBackend.subscribe(() => { loadMetrics(); });
    return () => { unsub(); };
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMetrics();
      loadExtras();
      // Refresco automático mientras Dashboard está en pantalla — sin esto el score
      // (y su ritmo esperado según la hora) solo se recalculaba al enfocar la
      // pestaña o con pull-to-refresh manual, nunca mientras la mirabas.
      const interval = setInterval(() => {
        loadMetrics();
        loadExtras();
      }, 15 * 60 * 1000);
      return () => clearInterval(interval);
    }, [profileId])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMetrics();
    setRefreshing(false);
  };

  const now = new Date();
  const hour = day.inner; // la hora de TU día (reloj interno)
  const greeting = hour >= 5 && hour < 12 ? 'Buenos días' : hour >= 12 && hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  // A dónde llevan los chips y la tarjeta "Ahora" (las pestañas se llaman distinto en el Modo AXS Executive)
  const goTab = (names: string[]) => {
    const rn: string[] = (navigation.getState() as any)?.routeNames ?? [];
    const t = names.find((n) => rn.includes(n));
    if (t) navigation.navigate(t as never);
    return !!t;
  };
  const goFood = () => { if (!goTab(['Nutri', 'NUT'])) onNavigateToChat?.('Quiero anotar lo que comí'); };
  const goMetrics = () => { goTab(['Métricas', 'DATA']); };
  const hasFinance = (((navigation.getState() as any)?.routeNames ?? []) as string[]).some((n) => n === 'Finanzas' || n === 'FIN');
  const goFinance = () => DeviceEventEmitter.emit(NOTIFICATION_OPEN_EVENT, { kind: 'home', action: 'finanzas' });
  // Qué módulos usa (las pestañas que tiene): los tips solo hablan de lo que existe para esta persona
  const routeNames = (((navigation.getState() as any)?.routeNames ?? []) as string[]);
  const usedModules = {
    nutri: routeNames.some((n) => n === 'Nutri' || n === 'NUT'),
    toji: routeNames.some((n) => n === 'Forge' || n === 'FORGE'),
    finanzas: hasFinance,
  };
  // ─── Recorrido guiado (components/tour) ───
  // Se pide con TOUR_EVENT (al terminar la bienvenida, o desde Perfil). Si Inicio no está en pantalla, primero se viene acá.
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const [touring, setTouring] = useState(false);
  const pendingTour = useRef(false);
  const startTour = () => { scrollRef.current?.scrollTo({ y: 0, animated: false }); setTimeout(() => setTouring(true), 450); };
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TOUR_EVENT, () => {
      if (navigation.isFocused()) { startTour(); return; }
      pendingTour.current = true;
      goTab(['Dashboard', 'SYS']);
    });
    return () => sub.remove();
  }, []);
  useFocusEffect(useCallback(() => {
    if (pendingTour.current) { pendingTour.current = false; startTour(); }
  }, []));
  /** Una parte de Inicio: si no se ve entera, se hace scroll hasta ella antes de iluminarla. */
  const locateHome = (id: string) => async (): Promise<Rect | null> => {
    let r = await measureTarget(id);
    const scrH = Dimensions.get('screen').height;
    const bottomLimit = scrH - (56 + insets.bottom) - 24;
    if (r && (r.y < insets.top + 30 || r.y + r.h > bottomLimit)) {
      scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + r.y - (insets.top + 80)), animated: true });
      await new Promise((res) => setTimeout(res, 420));
      r = await measureTarget(id);
    }
    return r;
  };
  /** Una pestaña de abajo (la barra se mide; cada pestaña ocupa lo mismo). */
  const locateTab = (name: string) => async (): Promise<Rect | null> => {
    const tb = await measureTarget('tabbar');
    const i = routeNames.indexOf(name);
    if (!tb || i < 0) return null;
    const w = tb.w / routeNames.length;
    return { x: tb.x + i * w + 3, y: tb.y + 3, w: w - 6, h: 52 };
  };
  const TAB_HELP: Record<string, [string, string]> = {
    'Métricas': ['Métricas', 'Tu cuerpo en números: sueño, pulso, pasos y tu puntaje del día, fijo y dinámico.'],
    DATA: ['DATA · Métricas', 'Tu cuerpo en números: sueño, pulso, pasos y tu puntaje del día, fijo y dinámico.'],
    Forge: ['Forge', 'Entrena como en un juego: misiones del día, niveles, racha y tu rutina.'],
    FORGE: ['FORGE', 'Entrena como en un juego: misiones del día, niveles, racha y tu rutina.'],
    Nutri: ['Nutrición', 'Tu comida y tu agua: busca, escanea el envase o díselo a Eris.'],
    NUT: ['NUT · Nutrición', 'Tu comida y tu agua: busca, escanea el envase o díselo a Hestia.'],
    Glucosa: ['Glucosa', 'Tu sensor de glucosa y sus alertas.'],
    SEC: ['SEC · Glucosa', 'Tu sensor de glucosa y sus alertas.'],
    Finanzas: ['Finanzas', 'Tu plata: gastos, sueldo, cuentas por pagar y ahorro.'],
    FIN: ['FIN · Finanzas', 'Tu plata: gastos, sueldo, cuentas por pagar y ahorro.'],
    Perfil: ['Perfil', 'Tu horario, tus metas, tu salud y tus avisos. Acá también vuelves a ver este recorrido.'],
    ID: ['ID · Perfil', 'Tu horario, tus metas, tu salud y tus avisos. Acá también vuelves a ver este recorrido.'],
  };
  const tourSteps: TourStep[] = [
    { id: 'intro', title: 'Un recorrido rápido', text: `Te muestro dónde está cada cosa en menos de un minuto. Si prefieres, lo ves después desde Perfil.`, locate: async () => null },
    { id: 'clock', title: 'Tu día', text: 'Parte cuando despiertas. Los colores son tus comidas, el punto cian eres tú ahora y arriba está tu puntaje del día.', locate: locateHome('home.clock') },
    { id: 'now', title: 'Ahora', text: 'Una cosa a la vez: lo más importante en este momento, con su botón para hacerlo.', locate: locateHome('home.now') },
    { id: 'chips', title: 'Tus números', text: 'Agua, comida, sueño y pasos de hoy. Toca uno para ver el detalle.', locate: locateHome('home.chips') },
    { id: 'more', title: 'Ver más', text: 'Tu análisis personal, el resumen del día y tu bloc de notas, para cuando quieras profundizar.', locate: locateHome('home.more') },
    {
      id: 'chat', title: `Habla con ${persona.name}`,
      text: 'Este es tu acceso al chat: anota, pregunta o pide ideas, por escrito o por voz. Lo puedes arrastrar a donde te acomode.',
      locate: async () => { const c = getErisBubbleCenter(); return { x: c.x - BUBBLE_SIZE / 2, y: c.y - BUBBLE_SIZE / 2, w: BUBBLE_SIZE, h: BUBBLE_SIZE }; },
    },
    ...routeNames.filter((n) => TAB_HELP[n]).map((n) => ({ id: `tab_${n}`, title: TAB_HELP[n][0], text: TAB_HELP[n][1], locate: locateTab(n) })),
    { id: 'end', title: '¡Listo!', text: 'Eso es todo. Si te pierdes, el recorrido está en Perfil. Y cuando dudes, pregúntale a ' + persona.name + '.', locate: async () => null },
  ];

  const onTipAction = (a: TipAction) => {
    if (a.kind === 'chat') onNavigateToChat?.(a.message);
    else if (a.kind === 'nutri') goFood();
    else if (a.kind === 'forge') DeviceEventEmitter.emit(NOTIFICATION_OPEN_EVENT, { kind: 'home', action: 'forge' });
    else if (a.kind === 'profile') goTab(['Perfil', 'ID']);
    else if (a.kind === 'more' && !moreOpen) toggleMore();
  };

  const sleepVal = snapshot.sleep ? Math.round(snapshot.sleep.durationHours * 10) / 10 : null; // el total viene con 2 decimales (sleepCore)
  const sleepSub = sleepVal
    ? sleepVal >= 7.5 ? 'Óptimo' : sleepVal >= 6 ? 'Aceptable' : 'Insuficiente'
    : undefined;

  const handleErisChat = (msg: string) => {
    // Solo la pregunta: el servidor ya tiene tus datos de hoy (los manda la app aparte). Antes se pegaba todo el contexto
    // biométrico al texto: el turno tardaba 85-192 s y quedaba guardado como si lo hubieras escrito (revisión 2026-11-04, R1)
    onNavigateToChat?.(msg);
  };

  return (
    <View style={[s.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView
        ref={scrollRef}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={32}
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

        {/* Eris · Hestia · Empresa (solo administradores): antes era un interruptor escondido en Perfil */}
        <ModeSwitch />

        {/* Falta el permiso de ESCRITURA de Health Connect (Nutrición/Hidratación): antes esto era invisible —
            "tener algún permiso" (sueño, pasos) no significa que lo anotado en Nutrición llegue hasta acá. */}
        <HealthSyncBanner />

        {/* Inicio más simple (2026-10-10): una sola pregunta — ¿cómo voy y qué hago ahora? Tu día (reloj interno con el
            puntaje), una cosa que hacer ahora, los números en una fila y el detalle en "Ver más". */}
        <View ref={tourRef('home.clock')} collapsable={false}>
          <InternalClock m={day} score={scores.total} onScorePress={goMetrics} />
        </View>

        {/* «¿Qué recomienda Eris?» (Eris al timón): sin plan, el botón; con plan, la tarjeta con lo que viene y un toque por paso */}
        <ErisPlan />

        <WakeCard wakeTime={snapshot.wakeTime} pendingWake={snapshot.sleep?.pendingWake} usualOnset={snapshot.sleepInsights?.usualOnset} need={snapshot.sleepInsights?.need} />

        <View ref={tourRef('home.now')} collapsable={false}>
        <NowCard
          m={day}
          planStep={nextStep(dayPlan)}
          onPlanDone={(id) => dayPlanStore.done(id)}
          onPlanSwap={(slot) => dayPlanStore.swap(slot)}
          sleepTip={sleepTip}
          sleepIns={snapshot.sleepInsights}
          onOpenSleep={() => setSleepOpen(true)}
          hydration={snapshot.hydration}
          waterGoal={waterGoal}
          protein={snapshot.nutrition?.protein ?? 0}
          proteinGoal={proteinGoal}
          personaName={persona.name}
          onAsk={(msg) => onNavigateToChat?.(msg)}
          onLogFood={goFood}
        />
        </View>

        {/* «¿Entrenas hoy?» (Forge 2.0): las metas de hoy según el día, con el entreno planificado («fantasma») */}
        <TrainingIntentCard eatenKcal={snapshot.nutrition?.calories ?? null} goalKcal={kcalGoal} sleepIns={snapshot.sleepInsights} />

        <View ref={tourRef('home.chips')} collapsable={false}>
        <DayChips
          m={day}
          hydration={snapshot.hydration}
          waterGoal={waterGoal}
          kcal={snapshot.nutrition?.calories ?? null}
          kcalGoal={kcalGoal}
          sleepHours={sleepVal}
          activityMin={snapshot.activity?.minutes ?? null}
          steps={snapshot.steps}
          paraGastar={hasFinance && financeSummary && typeof financeSummary.libre === 'number' ? financeSummary.libre : null}
          go={{ food: goFood, metrics: goMetrics, finance: hasFinance ? goFinance : undefined }}
        />
        </View>

        {/* Una función por día, solo de lo que usa (services/tips.ts) */}
        <TipCard modules={usedModules} onAction={onTipAction} />

        <View ref={tourRef('home.more')} collapsable={false}>
          <TouchableOpacity style={s.moreBtn} onPress={toggleMore} activeOpacity={0.7}>
            <Text style={s.moreText}>{moreOpen ? 'Ver menos' : 'Ver más de tu día'}</Text>
            <Text style={s.moreArrow}>{moreOpen ? '▴' : '▾'}</Text>
          </TouchableOpacity>
        </View>

        {moreOpen && (
          <View>
            {/* Eris Insight */}
            <ErisInsightCard onChat={handleErisChat} />

            {/* Resumen del Día: agua, macros, entrenamiento, finanzas */}
            <DaySummaryCard
              snapshot={snapshot}
              waterGoal={waterGoal}
              trainedToday={trainedToday}
              finance={financeSummary}
            />

            {/* Bloc de notas: ánimo + texto libre del día */}
            <JournalCard />

            {/* Dos vitales del día — no toda la grilla: hidratación y nutrición ya están arriba en "Resumen del
                día", y cardio/glucosa/sueño en detalle viven en Métricas. Repetirlas acá era la misma información
                dos (o tres) veces en pantallas distintas. */}
            <Text style={s.sectionTitle}>HOY</Text>
            <View style={s.grid}>
              <MetricCard
                icon="🏃" label="PASOS" value={snapshot.steps !== null ? snapshot.steps.toLocaleString() : null} unit=""
                color={T.green}
                sublabel={snapshot.steps !== null ? `${Math.round((snapshot.steps / 10000) * 100)}% del objetivo` : undefined}
              />
              <MetricCard
                icon="😴" label="SUEÑO" value={sleepVal} unit="h"
                color={T.purple} sublabel={sleepSub} onPress={() => setSleepOpen(true)}
              />
            </View>
            <SleepScreen visible={sleepOpen} onClose={() => setSleepOpen(false)} />
            {/* En el Modo AXS Executive (Hestia) la pestaña se llama DATA: navegar a 'Métricas' no hacía nada */}
            <TouchableOpacity
              style={s.metricsLink}
              onPress={() => {
                const names: string[] = (navigation.getState() as any)?.routeNames ?? [];
                navigation.navigate((names.includes('DATA') ? 'DATA' : 'Métricas') as never);
              }}
              activeOpacity={0.7}
            >
              <Text style={s.metricsLinkText}>Ver todas las métricas</Text>
              <Text style={s.metricsLinkArrow}>→</Text>
            </TouchableOpacity>

          </View>
        )}

        {touring && <GuidedTour steps={tourSteps} onDone={() => setTouring(false)} />}

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
  scoreSubs: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  scoreSubItem: { alignItems: 'center' },
  scoreSubLabel: { fontSize: 10, color: T.textMuted, fontWeight: '600', letterSpacing: 0.5 },
  scoreSubValue: { fontSize: 18, fontWeight: '800' },
  nowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: T.accentGlow, borderRadius: R.lg,
    borderWidth: 1, borderColor: T.borderActive,
    paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12,
  },
  nowBtnTitle: { fontSize: 15, fontWeight: '800', color: T.accent },
  nowBtnSub: { fontSize: 12, color: T.textMuted, marginTop: 2, lineHeight: 16 },
  nowBtnArrow: { fontSize: 24, color: T.accent, fontWeight: '300' },
  scoreBtn: {
    backgroundColor: T.accentGlow, borderRadius: R.md,
    paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: T.borderActive, alignSelf: 'flex-start',
  },
  scoreBtnText: { color: T.accent, fontWeight: '700', fontSize: 12 },

  sectionTitle: { color: T.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 12, marginTop: 8 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  updated: { color: T.textMuted, fontSize: 11, textAlign: 'center', marginTop: 20 },
  moreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, marginBottom: 12, borderRadius: R.lg,
    borderWidth: 1, borderColor: T.border, backgroundColor: 'rgba(255,255,255,0.02)',
  },
  moreText: { color: T.textLight, fontSize: 13, fontWeight: '700' },
  moreArrow: { color: T.accent, fontSize: 12, fontWeight: '800' },

  metricsLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, marginTop: 4,
  },
  metricsLinkText: { color: T.accent, fontSize: 13, fontWeight: '700' },
  metricsLinkArrow: { color: T.accent, fontSize: 15, fontWeight: '700' },
});
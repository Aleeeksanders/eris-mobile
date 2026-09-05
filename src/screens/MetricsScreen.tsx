import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  StatusBar, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, R, S } from '../config/design';
import { metricsService, type HealthSnapshot } from '../services/MetricsService';

interface Props {
  snapshot: HealthSnapshot;
  onAskEris?: (msg: string) => void;
}

const fmtHours = (h: number) => {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
};

// ─── Metric tile (2-col grid) ────────────────────────────────
function MetricTile({ icon, value, unit, label, color, progress, note }: {
  icon: string; value: string | number; unit?: string; label: string;
  color: string; progress?: number; note?: string;
}) {
  return (
    <View style={[t.tile, { borderTopColor: color }]}>
      <Text style={t.icon}>{icon}</Text>
      <View style={t.valueRow}>
        <Text style={[t.value, { color }]}>{value}</Text>
        {unit && <Text style={t.unit}>{unit}</Text>}
      </View>
      <Text style={t.label}>{label}</Text>
      {progress !== undefined && (
        <View style={t.bar}>
          <View style={[t.fill, { width: `${Math.min(progress, 100)}%` as any, backgroundColor: color }]} />
        </View>
      )}
      {note ? <Text style={[t.note, { color }]}>{note}</Text> : null}
    </View>
  );
}

// ─── Sleep card (full-width, special treatment) ───────────────
function SleepCard({ sleep }: { sleep: NonNullable<HealthSnapshot['sleep']> }) {
  const h = sleep.durationHours;
  const color = h >= 7.5 ? T.green : h >= 6 ? T.gold : T.red;
  const glow  = h >= 7.5 ? T.greenGlow : h >= 6 ? T.goldGlow : T.redGlow;
  const label = h >= 7.5 ? 'Óptimo' : h >= 6 ? 'Aceptable' : 'Insuficiente';
  const pct   = Math.min((h / 8) * 100, 100);

  return (
    <View style={[s.card, { borderTopWidth: 3, borderTopColor: color }]}>
      <View style={s.sleepTop}>
        <View>
          <Text style={s.sleepDuration}>{fmtHours(h)}</Text>
          <Text style={s.sleepSub}>sueño esta noche</Text>
        </View>
        <View style={[s.badge, { backgroundColor: glow, borderColor: color + '55' }]}>
          <Text style={[s.badgeText, { color }]}>{label}</Text>
        </View>
      </View>
      <View style={s.bigBar}>
        <View style={[s.bigBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={s.barCap}>{h.toFixed(1)} / 8h objetivo</Text>

      {sleep.stages && (
        <View style={s.stages}>
          <View style={s.stage}>
            <Text style={[s.stageVal, { color: T.textLight }]}>{fmtHours(sleep.stages.light)}</Text>
            <Text style={s.stageLbl}>Ligero</Text>
          </View>
          <View style={s.stageSep} />
          <View style={s.stage}>
            <Text style={[s.stageVal, { color: T.purple }]}>{fmtHours(sleep.stages.deep)}</Text>
            <Text style={s.stageLbl}>Profundo</Text>
          </View>
          <View style={s.stageSep} />
          <View style={s.stage}>
            <Text style={[s.stageVal, { color: T.accent }]}>{fmtHours(sleep.stages.rem)}</Text>
            <Text style={s.stageLbl}>REM</Text>
          </View>
          {sleep.efficiency != null && (
            <>
              <View style={s.stageSep} />
              <View style={s.stage}>
                <Text style={[s.stageVal, { color: T.green }]}>{sleep.efficiency}%</Text>
                <Text style={s.stageLbl}>Eficiencia</Text>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────
export default function MetricsScreen({ snapshot: initialSnapshot, onAskEris }: Props) {
  const [snapshot, setSnapshot] = useState<HealthSnapshot>(initialSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const insets = useSafeAreaInsets();

  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const hasActivity = snapshot.steps !== null || snapshot.calories !== null || snapshot.distance !== null;
  const hasCardio   = snapshot.heartRate !== null || snapshot.spo2 !== null || snapshot.vo2Max !== null;
  const hasBody     = snapshot.weight !== null || snapshot.bmi !== null;
  const hasAnyData  = hasActivity || hasCardio || !!snapshot.sleep || !!snapshot.glucose;

  useEffect(() => {
    if (!hasAnyData) metricsService.diagnose().then(setHealthStatus);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await metricsService.getSnapshot();
      setSnapshot(fresh);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleAskEris = () => {
    if (!onAskEris) return;
    const parts: string[] = [];
    if (snapshot.steps)              parts.push(`${snapshot.steps.toLocaleString()} pasos`);
    if (snapshot.sleep)              parts.push(`${fmtHours(snapshot.sleep.durationHours)} de sueño`);
    if (snapshot.heartRate?.resting) parts.push(`FC en reposo ${snapshot.heartRate.resting} bpm`);
    if (snapshot.calories)           parts.push(`${snapshot.calories} kcal activas`);
    if (snapshot.spo2)               parts.push(`SpO₂ ${snapshot.spo2}%`);
    if (snapshot.distance)           parts.push(`${snapshot.distance} km recorridos`);
    const msg = parts.length > 0
      ? `Eris, analiza mis métricas de hoy: ${parts.join(', ')}. Dame un resumen de cómo estoy y qué puedo mejorar.`
      : 'Eris, ¿qué me puedes decir sobre mis métricas de salud hoy?';
    onAskEris(msg);
  };

  return (
    <View style={[s.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={s.header}>
        <Text style={s.title}>Métricas</Text>
        <Text style={s.date}>{today}</Text>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
      >
        {/* Sin datos — guía de activación */}
        {!hasAnyData && (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📵</Text>
            <Text style={s.emptyTitle}>Sin datos de salud</Text>
            <Text style={s.emptyDesc}>
              {healthStatus?.steps?.join('\n') ?? 'Activa los permisos de Health Connect para ver tus métricas.'}
            </Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => metricsService.openPermissionsScreen()}>
              <Text style={s.emptyBtnText}>Abrir Health Connect</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ACTIVIDAD */}
        {hasActivity && (
          <>
            <Text style={s.section}>ACTIVIDAD HOY</Text>
            <View style={s.grid}>
              {snapshot.steps !== null && (
                <MetricTile
                  icon="👟"
                  value={snapshot.steps!.toLocaleString()}
                  label="pasos"
                  color={snapshot.steps! >= 10000 ? T.green : snapshot.steps! >= 5000 ? T.gold : T.red}
                  progress={(snapshot.steps! / 10000) * 100}
                  note={`${Math.round((snapshot.steps! / 10000) * 100)}% del objetivo`}
                />
              )}
              {snapshot.distance !== null && (
                <MetricTile icon="📍" value={snapshot.distance!} unit="km" label="distancia" color={T.green} />
              )}
              {snapshot.calories !== null && (
                <MetricTile icon="🔥" value={snapshot.calories!} unit="kcal" label="cal. activas" color={T.gold} />
              )}
              {snapshot.activeMinutes !== null && (
                <MetricTile
                  icon="⏱"
                  value={snapshot.activeMinutes!}
                  unit="min"
                  label="activos"
                  color={snapshot.activeMinutes! >= 30 ? T.green : T.gold}
                  note={snapshot.activeMinutes! >= 30 ? '✓ objetivo' : `${30 - snapshot.activeMinutes!} min más`}
                />
              )}
            </View>
          </>
        )}

        {/* SUEÑO */}
        {snapshot.sleep && (
          <>
            <Text style={s.section}>SUEÑO</Text>
            <SleepCard sleep={snapshot.sleep} />
          </>
        )}

        {/* CARDIOVASCULAR */}
        {hasCardio && (
          <>
            <Text style={s.section}>CARDIOVASCULAR</Text>
            <View style={s.grid}>
              {snapshot.heartRate?.resting != null && (
                <MetricTile
                  icon="❤️"
                  value={snapshot.heartRate.resting}
                  unit="bpm"
                  label="FC reposo"
                  color={snapshot.heartRate.resting <= 55 ? T.green : snapshot.heartRate.resting <= 65 ? T.gold : T.red}
                  note={snapshot.heartRate.resting <= 55 ? 'Atlético' : snapshot.heartRate.resting <= 65 ? 'Normal' : 'Elevado'}
                />
              )}
              {snapshot.heartRate?.average != null && (
                <MetricTile icon="💓" value={snapshot.heartRate.average} unit="bpm" label="FC promedio" color={T.textLight} />
              )}
              {snapshot.spo2 !== null && (
                <MetricTile
                  icon="🫁"
                  value={snapshot.spo2!}
                  unit="%"
                  label="SpO₂"
                  color={snapshot.spo2! >= 97 ? T.green : snapshot.spo2! >= 95 ? T.gold : T.red}
                  note={snapshot.spo2! >= 97 ? 'Óptimo' : snapshot.spo2! >= 95 ? 'Normal' : 'Bajo'}
                />
              )}
              {snapshot.vo2Max !== null && (
                <MetricTile
                  icon="💨"
                  value={snapshot.vo2Max!}
                  unit="ml/kg"
                  label="VO₂ máx"
                  color={snapshot.vo2Max! >= 45 ? T.green : snapshot.vo2Max! >= 35 ? T.gold : T.red}
                  note={snapshot.vo2Max! >= 55 ? 'Superior' : snapshot.vo2Max! >= 45 ? 'Bueno' : 'Promedio'}
                />
              )}
              {snapshot.respiratoryRate !== null && (
                <MetricTile
                  icon="🌬"
                  value={snapshot.respiratoryRate!}
                  unit="/min"
                  label="respiración"
                  color={snapshot.respiratoryRate! >= 12 && snapshot.respiratoryRate! <= 20 ? T.green : T.gold}
                  note={snapshot.respiratoryRate! >= 12 && snapshot.respiratoryRate! <= 20 ? 'Normal' : 'Revisar'}
                />
              )}
            </View>
          </>
        )}

        {/* GLUCOSA */}
        {snapshot.glucose && (
          <>
            <Text style={s.section}>GLUCOSA</Text>
            <View style={s.grid}>
              <MetricTile
                icon="🩸"
                value={snapshot.glucose.valueMgdl}
                unit="mg/dL"
                label="glucosa CGM"
                color={snapshot.glucose.valueMgdl > 180 ? T.red : snapshot.glucose.valueMgdl < 70 ? T.gold : T.green}
                note={snapshot.glucose.valueMgdl > 180 ? 'Alto' : snapshot.glucose.valueMgdl < 70 ? 'Bajo' : 'En rango'}
              />
              <MetricTile
                icon="🧪"
                value={snapshot.glucose.valueMmol}
                unit="mmol/L"
                label="glucosa"
                color={T.textLight}
              />
            </View>
          </>
        )}

        {/* CUERPO */}
        {hasBody && (
          <>
            <Text style={s.section}>CUERPO</Text>
            <View style={s.grid}>
              {snapshot.weight !== null && (
                <MetricTile icon="⚖️" value={snapshot.weight!} unit="kg" label="peso" color={T.accent} />
              )}
              {snapshot.bmi !== null && (
                <MetricTile
                  icon="📐"
                  value={snapshot.bmi!}
                  label="IMC"
                  color={snapshot.bmi! < 18.5 ? T.gold : snapshot.bmi! < 25 ? T.green : snapshot.bmi! < 30 ? T.gold : T.red}
                  note={snapshot.bmi! < 18.5 ? 'Bajo peso' : snapshot.bmi! < 25 ? 'Normal' : snapshot.bmi! < 30 ? 'Sobrepeso' : 'Obesidad'}
                />
              )}
            </View>
          </>
        )}

        {/* ⚡ CTA — Pedir análisis a Eris */}
        {hasAnyData && onAskEris && (
          <TouchableOpacity style={s.erisBtn} onPress={handleAskEris} activeOpacity={0.75}>
            <Text style={s.erisBtnIcon}>⚡</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.erisBtnTitle}>Pedir análisis a Eris</Text>
              <Text style={s.erisBtnDesc}>Interpretación personalizada de tus métricas de hoy</Text>
            </View>
            <Text style={s.erisBtnArrow}>›</Text>
          </TouchableOpacity>
        )}

        <Text style={s.updated}>
          {new Date(snapshot.lastUpdated).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Tile styles ─────────────────────────────────────────────
const t = StyleSheet.create({
  tile: {
    width: '48%',
    backgroundColor: T.bgCard,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: T.border,
    borderTopWidth: 3,
    padding: 14,
    gap: 4,
  },
  icon:     { fontSize: 22, marginBottom: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  value:    { fontSize: 22, fontWeight: '800' },
  unit:     { fontSize: 12, color: T.textMuted, fontWeight: '600' },
  label:    { fontSize: 12, color: T.textMuted },
  bar:      { height: 5, backgroundColor: T.border, borderRadius: R.full, overflow: 'hidden', marginTop: 8 },
  fill:     { height: '100%', borderRadius: R.full },
  note:     { fontSize: 11, fontWeight: '700', marginTop: 4 },
});

// ─── Screen styles ───────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: T.bg },
  scroll:  { flex: 1 },
  content: { padding: S.md, paddingBottom: 80 },

  header: { paddingHorizontal: S.md, paddingTop: 16, paddingBottom: 8 },
  title:  { fontSize: 26, fontWeight: '900', color: T.text, letterSpacing: -0.5 },
  date:   { fontSize: 13, color: T.textMuted, marginTop: 2, textTransform: 'capitalize' },

  section: {
    fontSize: 11, color: T.textMuted, fontWeight: '800',
    letterSpacing: 2, marginBottom: 10, marginTop: 24,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  card: {
    backgroundColor: T.bgCard, borderRadius: R.xl,
    padding: S.md, borderWidth: 1, borderColor: T.border,
  },

  // Sleep card
  sleepTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  sleepDuration:{ fontSize: 32, fontWeight: '900', color: T.text, letterSpacing: -1 },
  sleepSub:     { fontSize: 12, color: T.textMuted, marginTop: 2 },
  badge:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.full, borderWidth: 1 },
  badgeText:    { fontSize: 12, fontWeight: '800' },
  bigBar:       { height: 8, backgroundColor: T.border, borderRadius: R.full, overflow: 'hidden' },
  bigBarFill:   { height: '100%', borderRadius: R.full },
  barCap:       { fontSize: 11, color: T.textMuted, marginTop: 6, marginBottom: 14 },
  stages:       { flexDirection: 'row', borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14 },
  stage:        { flex: 1, alignItems: 'center' },
  stageVal:     { fontSize: 15, fontWeight: '800' },
  stageLbl:     { fontSize: 10, color: T.textMuted, marginTop: 2, fontWeight: '600' },
  stageSep:     { width: 1, backgroundColor: T.border, marginVertical: 4 },

  // Empty state
  emptyCard:  {
    backgroundColor: T.bgCard, borderRadius: R.xl, padding: S.lg,
    borderWidth: 1, borderColor: T.border, alignItems: 'center', gap: 10,
  },
  emptyIcon:  { fontSize: 36 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: T.text },
  emptyDesc:  { fontSize: 13, color: T.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyBtn:   {
    marginTop: 4, paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: T.accentGlow, borderRadius: R.full,
    borderWidth: 1, borderColor: T.borderActive,
  },
  emptyBtnText: { color: T.accent, fontWeight: '700', fontSize: 13 },

  // Eris CTA
  erisBtn: {
    marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: T.bgCard, borderRadius: R.xl, padding: S.md,
    borderWidth: 1, borderColor: T.borderActive,
  },
  erisBtnIcon:  { fontSize: 28 },
  erisBtnTitle: { fontSize: 15, fontWeight: '800', color: T.accent },
  erisBtnDesc:  { fontSize: 12, color: T.textMuted, marginTop: 2 },
  erisBtnArrow: { color: T.accent, fontSize: 22, fontWeight: '300' },

  updated: { color: T.textMuted, fontSize: 11, textAlign: 'center', marginTop: 20, marginBottom: 8 },
});

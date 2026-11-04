import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  StatusBar, RefreshControl, TouchableOpacity, useWindowDimensions,
  Pressable,
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, R, S } from '../config/design';
import { usePersona } from '../config/persona';
import { useFeature } from '../config/features';
import { metricsService, computeMacroPercents, type HealthSnapshot, type DayScores } from '../services/MetricsService';
import { freshSavingsRate } from '../services/hwExtract';
import { nutritionBackend } from '../services/NutritionBackend';
import { evaluateFromSnapshot, paceAt, trackGoal, type DayQuality, type GoalTrack } from '../services/NutritionQuality';
import { daySchedule } from '../services/daySchedule';
import FoodQualityCard, { LetterChip } from '../components/FoodQualityCard';
import MicrosCard from '../components/MicrosCard';
import SupplementsSummary from '../components/supplements/SupplementsSummary';
import { useSupplements } from '../components/supplements/SupplementsCard';
import { dayMicrosToday } from '../services/NutritionQuality';
import { estadoHoy, SCORE_KEYS, type MicroDia } from '../services/supplements/supplementCore';
import { supDia } from '../services/supplements/supplementStore';
import { forgeStore } from '../services/forge/forgeStore';
import ActivityCard from '../components/ActivityCard';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthStorage } from '../services/AuthStorage';
import { useFocusEffect } from '@react-navigation/native';
import InfoTip from '../components/InfoTip';
import SleepScreen from './sleep/SleepScreen';
import { fmtSleep, clock as sleepClock, sleepReading, insightsText, bedtimeText, type SleepInsights } from '../services/sleep/sleepCore';

interface Props {
  snapshot: HealthSnapshot;
  onAskEris?: (msg: string) => void;
}

const fmtHours = (h: number) => {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${mins}m`;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
};

// ─── Tu puntaje del día ───────────────────────────────────────
// Pedido del usuario (2026-10-10): "muestra el score fijo y el dinámico en Métricas, creo que es necesario". Antes era
// una línea chica ("Fijo 82 · Dinámico 68") que nadie entendía. Ahora cada uno dice qué mide, cuánto pesa y con qué se
// calcula (lo que no tiene datos se ve apagado: sin reloj no hay sueño ni pulso). Mismos pesos que calcDayScore.
const scoreColor = (v: number | null) => (v == null ? T.textMuted : v >= 75 ? T.green : v >= 50 ? T.gold : T.red);
const scoreWord = (v: number | null) => (v == null ? 'sin datos aún' : v >= 75 ? 'muy bien' : v >= 50 ? 'bien' : v >= 25 ? 'regular' : 'bajo');

function ScorePart({ title, weight, value, desc, parts }: {
  title: string; weight: string; value: number | null; desc: string; parts: Array<{ label: string; on: boolean }>;
}) {
  const c = scoreColor(value);
  return (
    <View style={ss.part}>
      <View style={ss.partHead}>
        <Text style={ss.partTitle}>{title}</Text>
        <Text style={ss.partWeight}>{weight}</Text>
        <Text style={[ss.partValue, { color: c }]}>{value ?? '—'}</Text>
      </View>
      <View style={ss.bar}><View style={[ss.barFill, { width: `${Math.max(0, Math.min(100, value ?? 0))}%`, backgroundColor: c }]} /></View>
      <Text style={ss.partDesc}>{desc}</Text>
      <View style={ss.chips}>
        {parts.map((x) => (
          <View key={x.label} style={[ss.chip, !x.on && ss.chipOff]}>
            <Text style={[ss.chipText, !x.on && ss.chipTextOff]}>{x.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ScoreCard({ scores, snapshot, extras }: {
  scores: DayScores; snapshot: HealthSnapshot;
  extras: { trainedToday?: boolean; savingsRate?: number | null; foodScore?: number | null; hydrationScore?: number | null };
}) {
  const t = scores.total;
  return (
    <View style={ss.card}>
      <View style={ss.head}>
        <Text style={ss.label}>TU PUNTAJE DEL DÍA</Text>
        <View style={[ss.pill, { borderColor: scoreColor(t) + '55', backgroundColor: scoreColor(t) + '18' }]}>
          <Text style={[ss.pillNum, { color: scoreColor(t) }]}>{t ?? '—'}</Text>
          <Text style={[ss.pillWord, { color: scoreColor(t) }]}>{scoreWord(t)}</Text>
        </View>
      </View>
      <ScorePart
        title="Fijo" weight="60 % del puntaje" value={scores.fixed}
        desc="Tu base: cómo dormiste y cómo está tu cuerpo. Cambia poco de un día a otro."
        parts={[
          { label: 'Sueño', on: !!snapshot.sleep },
          { label: 'Pulso en reposo', on: snapshot.heartRate?.resting != null },
          { label: 'VO₂ máx', on: !!snapshot.vo2Max },
          { label: 'Minutos activos', on: snapshot.activeMinutes != null },
          { label: 'IMC', on: snapshot.bmi != null },
        ]}
      />
      <ScorePart
        title="Dinámico" weight="40 % del puntaje" value={scores.dynamic}
        desc="Lo que haces hoy, comparado con lo esperable a esta hora. Sube a medida que avanzas en el día."
        parts={[
          { label: 'Comida', on: extras.foodScore != null },
          { label: 'Pasos', on: snapshot.steps != null },
          { label: 'Agua', on: snapshot.hydration != null || extras.hydrationScore != null },
          { label: 'Calorías activas', on: snapshot.calories != null },
          { label: 'Entreno (Forge)', on: extras.trainedToday != null },
          { label: 'Ahorro', on: extras.savingsRate != null },
          { label: 'Pulso del día', on: snapshot.heartRate?.average != null },
        ]}
      />
      {scores.fixed == null && <Text style={ss.note}>Sin datos de sueño ni pulso, el puntaje sale solo del dinámico.</Text>}
    </View>
  );
}

const ss = StyleSheet.create({
  card: { backgroundColor: T.bgCard, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: T.border, marginBottom: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  label: { color: T.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  pill: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  pillNum: { fontSize: 15, fontWeight: '900' },
  pillWord: { fontSize: 11, fontWeight: '700' },
  part: { marginBottom: 14 },
  partHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 6 },
  partTitle: { color: T.text, fontSize: 15, fontWeight: '800' },
  partWeight: { flex: 1, color: T.textMuted, fontSize: 11, fontWeight: '600' },
  partValue: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  bar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  partDesc: { color: T.textLight, fontSize: 12, fontWeight: '500', marginTop: 7, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(34,211,238,0.1)', borderWidth: 1, borderColor: 'rgba(34,211,238,0.25)' },
  chipOff: { backgroundColor: 'transparent', borderColor: T.border },
  chipText: { color: T.accent, fontSize: 11, fontWeight: '700' },
  chipTextOff: { color: T.textMuted, fontWeight: '600' },
  note: { color: T.textMuted, fontSize: 11, fontStyle: 'italic' },
});

// ─── Íconos dibujados (no emoji) ──────────────────────────────
// ⏱ y ⚖️ son del mismo bloque Unicode viejo (Miscellaneous Technical / Symbols) que ⏻ ☰ ⏺ ⏹, que ya resultaron
// sin glifo en ciertas fuentes de Android y se veían como un cuadrito roto (ver los íconos de Chat). El resto de
// los emoji de esta pantalla son pictogramas modernos con cobertura completa — no hace falta tocarlos.
function StopwatchIcon({ color = T.gold, size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="9" y1="2" x2="15" y2="2" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1="12" y1="2" x2="12" y2="5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx="12" cy="14" r="8" stroke={color} strokeWidth={2} />
      <Line x1="12" y1="14" x2="12" y2="10" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function ScaleIcon({ color = T.accent, size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="8" width="18" height="13" rx="3" stroke={color} strokeWidth={2} />
      <Circle cx="12" cy="14.5" r="2.6" stroke={color} strokeWidth={1.6} />
      <Path d="M12 14.5 L14 12.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1="8" y1="5" x2="16" y2="5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Metric tile (2‑col grid) ────────────────────────────────
// ─── Seguimiento a la hora (services/NutritionQuality.ts → trackGoal): sin rojos, en palabras ───
const TRACK_COLOR: Record<GoalTrack['tone'], string> = { ok: T.green, behind: T.gold, far: T.red, neutral: T.accent };

function MetricTile({ icon, value, unit, label, color, progress, note, marker, status, detail, infoId }: {
  icon: React.ReactNode; value: string | number; unit?: string; label: string;
  color: string; progress?: number; note?: string;
  /** dónde deberías ir a esta hora, en % de la meta del día (la marca vertical de la barra) */
  marker?: number;
  /** cómo vas a esta hora, en palabras ("Al día ✓", "Para ir al día: +2 vasos (~0,5 L)") */
  status?: string;
  /** la referencia del día ("Faltan 2,0 L hoy · a las 15:00, ~1,3 L") */
  detail?: string;
  /** el ⓘ con su explicación (config/infoTexts.ts) */
  infoId?: string;
}) {
  return (
    <View style={[t.tile, { borderTopColor: color }]}>
      {typeof icon === 'string' ? <Text style={t.icon}>{icon}</Text> : <View style={t.iconSvg}>{icon}</View>}
      <View style={t.valueRow}>
        <Text style={[t.value, { color }]}>{value}</Text>
        {unit && <Text style={t.unit}>{unit}</Text>}
      </View>
      <View style={t.labelRow}>
        <Text style={[t.label, { flexShrink: 1 }]}>{label}</Text>
        {infoId ? <InfoTip id={infoId} color={color} size={16} /> : null}
      </View>
      {progress !== undefined && (
        // Con seguimiento por hora: la barra fantasma (translúcida, punteada) es la META DEL DÍA completa; la sólida, lo
        // que llevas; la marca blanca, dónde deberías ir a esta hora. Sin seguimiento (límites: grasas, azúcar, sodio),
        // la barra de siempre.
        <View style={[t.bar, marker !== undefined && [t.ghost, { backgroundColor: `${color}26`, borderColor: `${color}80` }]]}>
          <View style={[t.fill, { width: `${Math.min(progress, 100)}%` as any, backgroundColor: color }]} />
          {marker !== undefined && marker > 0 && marker < 100 && <View style={[t.marker, { left: `${marker}%` as any }]} />}
        </View>
      )}
      {status ? <Text style={[t.status, { color }]}>{status}</Text> : null}
      {detail ? <Text style={t.detail}>{detail}</Text> : null}
      {note ? <Text style={[t.note, { color }]}>{note}</Text> : null}
    </View>
  );
}

// ─── Sleep card (Multifase y WASO / Evidencia Científica) ───
function SleepCard({ sleep, insights }: { sleep: NonNullable<HealthSnapshot['sleep']>; insights?: SleepInsights }) {
  const h = sleep.durationHours;
  const stages = sleep.stages;

  // Extracción de horas por fase incluyendo tiempo Despierto (WASO)
  const deepH = stages?.deep ?? 0;
  const remH = stages?.rem ?? 0;
  const lightH = stages?.light ?? 0;
  const awakeH = stages?.awake ?? 0;

  const totalTracked = deepH + remH + lightH + awakeH || h;

  // Porcentajes de arquitectura de sueño
  const deepPct = Math.round((deepH / totalTracked) * 100);
  const remPct = Math.round((remH / totalTracked) * 100);
  const lightPct = Math.round((lightH / totalTracked) * 100);
  const awakePct = Math.round((awakeH / totalTracked) * 100);

  // Algoritmo de evaluación científica de arquitectura
  const isDeepOptimal = deepPct >= 15;
  const isRemOptimal = remPct >= 18;
  const isDurationGood = h >= 7;
  const isEffGood = (sleep.efficiency ?? 85) >= 85;

  let qualityPoints = 0;
  if (isDeepOptimal) qualityPoints += 30;
  if (isRemOptimal) qualityPoints += 30;
  if (isDurationGood) qualityPoints += 20;
  if (isEffGood) qualityPoints += 20;

  // Sin fases (sueño anotado por chat, o un reloj que no las mide) no se puede juzgar la arquitectura: se evalúa solo
  // la duración. Antes un "dormí 7 horas" salía "Poco Reparador" por tener 0 % de sueño profundo "medido".
  const tier = stages ? (qualityPoints >= 80 ? 2 : qualityPoints >= 50 ? 1 : 0) : (h >= 7 ? 2 : h >= 6 ? 1 : 0);
  const color = tier === 2 ? T.green : tier === 1 ? T.gold : T.red;
  const glow = tier === 2 ? T.greenGlow : tier === 1 ? T.goldGlow : T.redGlow;
  let label = stages
    ? (tier === 2 ? 'Reparador' : tier === 1 ? 'Aceptable' : 'Poco Reparador')
    : (tier === 2 ? 'Suficiente' : tier === 1 ? 'Justo' : 'Corto');
  // Partido (Sueño 2.0 · S0): mucho en total no es dormir bien si la noche fue corta y cortada. En dorado, sin alarma.
  const eps = sleep.episodes ?? [];
  const partido = !!sleep.split && !sleep.manual;
  let badgeColor = color, badgeGlow = glow;
  if (partido && tier > 0) { label = 'Partido'; badgeColor = T.gold; badgeGlow = T.goldGlow; }
  // El puntaje de la noche (Sueño 2.0 · S1): pesa la duración, el horario y los despertares más que las etapas. Sin rojo:
  // «Corta», «Partida» e «Irregular» van en dorado («medir sin obsesión»).
  const sc0 = !sleep.manual ? insights?.score : null;
  if (sc0) { label = `${sc0.word} · ${sc0.total}`; badgeColor = sc0.word === 'Buena' ? T.green : T.gold; badgeGlow = sc0.word === 'Buena' ? T.greenGlow : T.goldGlow; }
  const reading = partido ? sleepReading({ totalH: h, nightH: sleep.nightHours ?? null, split: true, night: eps.find((e) => e.kind === 'noche') ?? null }) : null;
  const KIND: Record<string, string> = { noche: 'Noche', segundo: 'Segundo sueño', siesta: 'Siesta' };

  return (
    <View style={[sc.card, { borderTopWidth: 3, borderTopColor: color }]}>
      <View style={sc.sleepTop}>
        <View>
          <Text style={sc.sleepDuration}>{fmtHours(h)}</Text>
          <Text style={sc.sleepSub}>{sleep.manual ? 'anotado por ti · el reloj no lo midió' : eps.length > 1 ? `en ${eps.length} partes · total del día` : 'sueño total esta noche'}</Text>
        </View>
        <View style={[sc.badge, { backgroundColor: badgeGlow, borderColor: badgeColor + '55' }]}>
          <Text style={[sc.badgeText, { color: badgeColor }]}>{label}</Text>
        </View>
      </View>

      {/* Las partes del día, como en el reloj: la noche (aunque se haya despertado un rato), un segundo sueño, siestas */}
      {!sleep.manual && eps.length > 1 && (
        <View style={sc.parts}>
          {eps.map((e) => (
            <View key={e.start} style={sc.partRow}>
              <View style={[sc.partDot, { backgroundColor: e.kind === 'noche' ? T.purple : e.kind === 'segundo' ? T.accent : T.textMuted }]} />
              <Text style={sc.partKind}>{KIND[e.kind]}</Text>
              <Text style={sc.partTime}>{sleepClock(e.start)}–{sleepClock(e.end)}</Text>
              <Text style={sc.partHours}>{fmtSleep(e.asleepH)}</Text>
            </View>
          ))}
          {eps.some((e) => e.kind === 'noche' && e.awakeMin >= 20) && (
            <Text style={sc.partNote}>La noche tuvo {fmtSleep((eps.find((e) => e.kind === 'noche')?.awakeMin ?? 0) / 60)} despierto en medio.</Text>
          )}
          {reading && <Text style={sc.partNote}>{reading}</Text>}
        </View>
      )}

      {/* Las 2 semanas y la hora para acostarse (sleepCore · S1) */}
      {!!insights && insights.nights >= 4 && (
        <View style={sc.parts}>
          <Text style={sc.partNote}>{insightsText(insights)}</Text>
          <Text style={[sc.partNote, { color: T.textLight }]}>{bedtimeText(insights)}</Text>
        </View>
      )}

      {/* Durante la noche (solo lo que manda el reloj) */}
      {!!sleep.during && (
        <View style={sc.during}>
          {sleep.during.hr != null && <Text style={sc.duringItem}>♥ {sleep.during.hr} lpm dormido</Text>}
          {sleep.during.spo2 != null && <Text style={sc.duringItem}>O₂ {sleep.during.spo2} %{sleep.during.spo2Min != null && sleep.during.spo2Min < sleep.during.spo2 - 1 ? ` (mín. ${sleep.during.spo2Min} %)` : ''}</Text>}
          {sleep.during.resp != null && <Text style={sc.duringItem}>{String(sleep.during.resp).replace('.', ',')} resp/min</Text>}
        </View>
      )}

      {/* Barra Multicapa de Arquitectura del Sueño */}
      {stages && (
        <>
          <View style={sc.multiBar}>
            <View style={{ width: `${deepPct}%`, backgroundColor: T.purple, height: '100%' }} />
            <View style={{ width: `${remPct}%`, backgroundColor: T.accent, height: '100%' }} />
            <View style={{ width: `${lightPct}%`, backgroundColor: T.textLight, height: '100%' }} />
            <View style={{ width: `${awakePct}%`, backgroundColor: T.red, height: '100%' }} />
          </View>

          <View style={sc.barLegend}>
            <Text style={sc.barCap}>{h.toFixed(1)}h dormido</Text>
            <Text style={sc.barCap}>Objetivo 7.5 - 8h</Text>
          </View>

          {/* Desglose Cuantitativo de Fases */}
          <View style={sc.stages}>
            <View style={sc.stage}>
              <Text style={[sc.stageVal, { color: T.purple }]}>{fmtHours(deepH)}</Text>
              <Text style={sc.stageLbl}>Profundo</Text>
              <Text style={sc.stageSub}>{deepPct}% {isDeepOptimal ? '✓' : '⚠️'}</Text>
            </View>

            <View style={sc.stageSep} />

            <View style={sc.stage}>
              <Text style={[sc.stageVal, { color: T.accent }]}>{fmtHours(remH)}</Text>
              <Text style={sc.stageLbl}>REM</Text>
              <Text style={sc.stageSub}>{remPct}% {isRemOptimal ? '✓' : '⚠️'}</Text>
            </View>

            <View style={sc.stageSep} />

            <View style={sc.stage}>
              <Text style={[sc.stageVal, { color: T.textLight }]}>{fmtHours(lightH)}</Text>
              <Text style={sc.stageLbl}>Ligero</Text>
              <Text style={sc.stageSub}>{lightPct}%</Text>
            </View>

            <View style={sc.stageSep} />

            <View style={sc.stage}>
              <Text style={[sc.stageVal, { color: awakeH > 0.5 ? T.red : T.textMuted }]}>{fmtHours(awakeH)}</Text>
              <Text style={sc.stageLbl}>Despierto</Text>
              <Text style={sc.stageSub}>{awakePct}%</Text>
            </View>

            {sleep.efficiency != null && (
              <>
                <View style={sc.stageSep} />
                <View style={sc.stage}>
                  <Text style={[sc.stageVal, { color: sleep.efficiency >= 85 ? T.green : T.gold }]}>
                    {sleep.efficiency}%
                  </Text>
                  <Text style={sc.stageLbl}>Eficiencia</Text>
                  <Text style={sc.stageSub}>{sleep.efficiency >= 85 ? 'Óptima' : 'Baja'}</Text>
                </View>
              </>
            )}
          </View>
        </>
      )}
    </View>
  );
}

// ─── Déficit y superávit de calorías (como el gráfico de FatSecret) ──────────
// Verde = te quedaste bajo la meta ese día (déficit), rojo = te pasaste (superávit), gris = sin registros ese
// día (no es lo mismo que "déficit": no hay dato, no fue una elección).
function CalorieHistoryChart({ history, goal, width }: {
  history: Array<{ date: string; label: string; consumed: number }>;
  goal: number;
  width: number;
}) {
  const H = 120, padTop = 8, padBottom = 20, gap = 5;
  const chartH = H - padTop - padBottom;
  const maxVal = Math.max(goal * 1.15, ...history.map((h) => h.consumed), 1);
  const barW = Math.max(4, (width - gap * (history.length - 1)) / history.length);
  const goalY = padTop + chartH - (goal / maxVal) * chartH;

  return (
    <Svg width={width} height={H}>
      <Line x1={0} y1={goalY} x2={width} y2={goalY} stroke={T.textMuted} strokeWidth={1} strokeDasharray="4,3" />
      {history.map((h, i) => {
        const has = h.consumed > 0;
        const barH = has ? Math.max(3, (h.consumed / maxVal) * chartH) : 2;
        const x = i * (barW + gap);
        const y = padTop + chartH - barH;
        const color = !has ? T.border : h.consumed <= goal ? T.green : T.red;
        return (
          <React.Fragment key={h.date}>
            <Rect x={x} y={y} width={barW} height={barH} rx={2} fill={color} opacity={has ? 1 : 0.6} />
            {history.length <= 7 && (
              <SvgText x={x + barW / 2} y={H - 6} fontSize={9} fill={T.textMuted} textAnchor="middle">{h.label}</SvgText>
            )}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ─── Main screen ─────────────────────────────────────────────
export default function MetricsScreen({ snapshot: initialSnapshot, onAskEris }: Props) {
  const persona = usePersona(); // Eris, o Hestia en el Modo AXS Executive
  const glucoseOn = useFeature('glucose'); // módulo de glucosa en revisión: sin visto bueno no se muestra
  const [snapshot, setSnapshot] = useState<HealthSnapshot>(initialSnapshot);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [scores, setScores] = useState<DayScores>({ fixed: null, dynamic: null, total: null });
  const [refreshing, setRefreshing] = useState(false);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [tojiState, setTojiState] = useState<any>(null);
  const [trainedToday, setTrainedToday] = useState<boolean | undefined>(undefined);
  const [savingsRate, setSavingsRate] = useState<number | undefined>(undefined);
  // sodiumMgLimit/sugarGLimit/fiberGGoal/fatGLimit: no los edita el usuario (ver Perfil) — el servidor los
  // recalcula de su perfil médico y viajan en el mismo `goals` que calories/waterLiters (mergeGoals ya los toma
  // sin cambios, es genérico). Los valores de acá son el mismo default general que usa el servidor sin perfil.
  const [nutriGoals, setNutriGoals] = useState<{ calories: number; waterLiters: number; sodiumMgLimit: number; sugarGLimit: number; fiberGGoal: number; fatGLimit: number; proteinGGoal: number; proteinGMin?: number; proteinGMax?: number }>({ calories: 2000, waterLiters: 2.5, sodiumMgLimit: 2000, sugarGLimit: 50, fiberGGoal: 28, fatGLimit: 70, proteinGGoal: 60 }); // 60 g = FALLBACK_PROTEIN_G del servidor, mientras no lleguen tus metas (revisión M1)
  // Cuánto del día ya debería ir a esta hora (en la hora de SU día: despertar → services/daySchedule.ts). Se recalcula en
  // cada render: la pantalla se refresca con cada dato nuevo y al volver a ella.
  const wakeH = daySchedule.wakeHour() ?? undefined;
  const pace = paceAt(new Date(), wakeH);
  const track = (got: number, goal: number, kind: 'agua' | 'comida' | 'energia', unit: 'L' | 'g' | 'kcal') =>
    trackGoal(got, goal, { now: new Date(), wakeHour: wakeH, kind, unit });
  const thousands = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const [calorieHistory, setCalorieHistory] = useState<Array<{ date: string; label: string; consumed: number }>>([]);
  const [historyDays, setHistoryDays] = useState<7 | 30>(7);
  const historyDaysRef = useRef(historyDays);
  useEffect(() => { historyDaysRef.current = historyDays; }, [historyDays]);
  // Antes se copiaba el snapshot de App solo al montar la pestaña: si se montaba antes de leer Health Connect (o App
  // lo refrescaba al volver a la app), Métricas se quedaba con el vacío o el viejo.
  useEffect(() => { setSnapshot(initialSnapshot); }, [initialSnapshot]);
  // Al entrar a la pestaña (Métricas o DATA en Hestia): lo de ahora, sin esperar a un pull-to-refresh
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      const fresh = await nutritionBackend.merge(await metricsService.getSnapshot());
      if (alive) setSnapshot(fresh);
    })().catch(() => {});
    return () => { alive = false; };
  }, []));
  const insets = useSafeAreaInsets();
  const { width: winWidth } = useWindowDimensions();

  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const hasActivity = snapshot.steps !== null || snapshot.calories !== null || snapshot.distance !== null || !!snapshot.activity?.bouts.length;
  // Minutos activos: la actividad detectada (incluye las sesiones del reloj) o, sin ella, las sesiones
  const actMin = snapshot.activity ? snapshot.activity.minutes : snapshot.activeMinutes;
  const hasCardio   = snapshot.heartRate !== null || snapshot.spo2 !== null || snapshot.vo2Max !== null;
  const hasBody     = snapshot.weight !== null || snapshot.bmi !== null;
  const hasNutrition = snapshot.nutrition !== null || snapshot.hydration !== null;
  const hasAnyData  = hasActivity || hasCardio || !!snapshot.sleep || !!snapshot.glucose || hasNutrition;

  // Calidad de lo comido hoy, según la hora de cada comida y lo esperable a esta hora (+ hidratación a esta hora)
  const [quality, setQuality] = useState<DayQuality | null>(null);
  // Vitaminas y minerales de hoy (comida + suplementos), fase I6
  const [microDay, setMicroDay] = useState<MicroDia | null>(null);
  const sups = useSupplements(); // al marcar un suplemento, se recalcula
  useEffect(() => {
    let alive = true;
    evaluateFromSnapshot(snapshot).then((q) => { if (alive) setQuality(q); }).catch(() => {});
    dayMicrosToday().then((d) => { if (alive) setMicroDay(d); }).catch(() => {});
    return () => { alive = false; };
  }, [snapshot, nutriGoals, sups]);

  // Vista simple (tu día en pocas cosas) o completa (todo el detalle): se recuerda la que elijas
  const [view, setView] = useState<'simple' | 'completa'>('completa');
  useEffect(() => { AsyncStorage.getItem('eris_metrics_view').then((v) => { if (v === 'simple' || v === 'completa') setView(v); }).catch(() => {}); }, []);
  const chooseView = (v: 'simple' | 'completa') => { setView(v); AsyncStorage.setItem('eris_metrics_view', v).catch(() => {}); };
  const fs = forgeStore.get();
  const conPerfil = !!(fs?.sex && fs?.age);

  useEffect(() => {
    // Mismos extras que usa Inicio (entrenamiento de Forge, tasa de ahorro, calidad de la comida) para que el Score
    // sea el mismo número en las dos pestañas, no una versión distinta por pantalla.
    const calculated = metricsService.calcDayScore(snapshot, 0.6, {
      trainedToday, savingsRate, foodScore: quality?.foodScore, hydrationScore: quality?.hydrationScore,
    });
    setScores(calculated);
  }, [snapshot, trainedToday, savingsRate, quality]);

  // Entrenamiento de hoy (Forge) y tasa de ahorro (Finanzas) — mismas claves que ya usa Inicio.
  useEffect(() => {
    (async () => {
      try {
        const pid = (await AuthStorage.getCredentials())?.profileId ?? 'anon';
        const [lastWk, financeRaw] = await Promise.all([
          AsyncStorage.getItem('toji_last_workout'),
          AsyncStorage.getItem(`finance_summary_${pid}`),
        ]);
        const d = new Date();
        const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        setTrainedToday(lastWk === todayKey);
        if (financeRaw) { try { setSavingsRate(freshSavingsRate(JSON.parse(financeRaw))); } catch {} }
      } catch {}
    })();
  }, [refreshing]);

  useEffect(() => {
    if (!hasAnyData) metricsService.diagnose().then(setHealthStatus);
  }, []);

  useEffect(() => {
    // Resumen de Forge que guarda TojiScreen en cada cambio (antes se leía `toji_state_sync`, que nadie escribía)
    AuthStorage.getCredentials().then((c) => AsyncStorage.getItem(`eris_forge_training_${c?.profileId ?? 'anon'}`)).then(val => {
      if (!val) return;
      try {
        const t = JSON.parse(val);
        const cut = new Date(); cut.setDate(cut.getDate() - 28);
        const cutKey = `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, '0')}-${String(cut.getDate()).padStart(2, '0')}`;
        const days4w = Object.keys(t.days || {}).filter((k) => k > cutKey).length;
        setTojiState({ streak: t.streak || 0, bestStreak: t.bestStreak || 0, days4w });
      } catch {}
    }).catch(() => {});
    
    // Asumimos profileId = 'default' por ahora si no está en props
    AsyncStorage.getItem('eris_nutrition_goals_default').then(val => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          setNutriGoals(prev => ({
            calories: parsed.calories || prev.calories,
            waterLiters: parsed.waterTargetOff ? 0 : (parsed.waterLiters || prev.waterLiters),
            sodiumMgLimit: parsed.sodiumMgLimit || prev.sodiumMgLimit,
            sugarGLimit: parsed.sugarGLimit || prev.sugarGLimit,
            fiberGGoal: parsed.fiberGGoal || prev.fiberGGoal,
            fatGLimit: parsed.fatGLimit || prev.fatGLimit,
            proteinGGoal: parsed.proteinGGoal || prev.proteinGGoal, proteinGMin: parsed.proteinGMin, proteinGMax: parsed.proteinGMax,
          }));
        } catch {}
      }
    });
  }, [refreshing]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('NUTRITION_GOALS_UPDATED', () => {
      AsyncStorage.getItem('eris_nutrition_goals_default').then(val => {
        if (val) {
          try {
            const parsed = JSON.parse(val);
            setNutriGoals(prev => ({
              calories: parsed.calories || prev.calories,
              waterLiters: parsed.waterTargetOff ? 0 : (parsed.waterLiters || prev.waterLiters),
              sodiumMgLimit: parsed.sodiumMgLimit || prev.sodiumMgLimit,
              sugarGLimit: parsed.sugarGLimit || prev.sugarGLimit,
              fiberGGoal: parsed.fiberGGoal || prev.fiberGGoal,
              fatGLimit: parsed.fatGLimit || prev.fatGLimit,
              proteinGGoal: parsed.proteinGGoal || prev.proteinGGoal, proteinGMin: parsed.proteinGMin, proteinGMax: parsed.proteinGMax,
            }));
          } catch {}
        }
      });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Antes escuchaba 'NUTRITION_UPDATED', un evento que nadie emitía: esta pantalla nunca se refrescaba sola tras
    // registrar comida/agua por chat (quedaba con el snapshot del momento en que se montó, hasta un refresh manual
    // que además ignoraba lo anotado por chat que aún no estaba en Health Connect — ver nutritionBackend.merge).
    nutritionBackend.start(); // idempotente
    const unsub = nutritionBackend.subscribe(async () => {
      setSnapshot(await nutritionBackend.merge(await metricsService.getSnapshot()));
      setCalorieHistory(await metricsService.getCalorieHistory(historyDaysRef.current));
    });
    return unsub;
  }, []);

  const loadCalorieHistory = useCallback(async (days: 7 | 30) => {
    setCalorieHistory(await metricsService.getCalorieHistory(days));
  }, []);
  useEffect(() => { loadCalorieHistory(historyDays); }, [historyDays, loadCalorieHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await nutritionBackend.merge(await metricsService.getSnapshot(true));
      setSnapshot(fresh);
      await loadCalorieHistory(historyDaysRef.current);
    } finally {
      setRefreshing(false);
    }
  }, [loadCalorieHistory]);

  // Las tarjetas que comparten la vista simple y la completa (el mismo cálculo «a la hora» en las dos)
  const tileKcal = () => {
    const cal = snapshot.nutrition!.calories, goal = nutriGoals.calories;
    const tr = track(cal, goal, 'energia', 'kcal');
    return (
      <MetricTile
        icon="🍽️" value={cal} unit="kcal" label={`meta ${thousands(goal)} kcal`} infoId="calorias"
        color={TRACK_COLOR[tr.tone]}
        progress={Math.min((cal / goal) * 100, 100)}
        marker={pace.foodShare * 100}
        status={tr.status} detail={tr.detail}
      />
    );
  };
  const tileProtein = () => {
    const protein = snapshot.nutrition!.protein, proteinGoal = nutriGoals.proteinGGoal;
    const tr = track(protein, proteinGoal, 'comida', 'g');
    return (
      <MetricTile
        icon="🥩" value={protein} unit="g" label={`proteína · meta ${Math.round(proteinGoal)} g`} infoId="proteina"
        color={TRACK_COLOR[tr.tone]}
        progress={Math.min(Math.round((protein / proteinGoal) * 100), 100)}
        marker={pace.foodShare * 100}
        status={tr.status} detail={tr.detail}
      />
    );
  };
  const tileWater = () => {
    const water = snapshot.hydration!, goal = nutriGoals.waterLiters;
    const tr = track(water, goal, 'agua', 'L');
    const fromFood = (snapshot.foodWaterL ?? 0) >= 0.05 ? `${String(snapshot.foodWaterL).replace('.', ',')} L vienen de la comida` : '';
    return (
      <MetricTile
        icon="💧" value={water} unit="L" label={goal > 0 ? `agua · meta ${String(goal).replace('.', ',')} L` : 'agua'} infoId="agua"
        color={TRACK_COLOR[tr.tone]}
        progress={goal > 0 ? (water / goal) * 100 : undefined}
        marker={goal > 0 ? pace.waterShare * 100 : undefined}
        status={goal > 0 ? tr.status : 'Sin meta de agua'} detail={[tr.detail, fromFood].filter(Boolean).join(' · ')}
      />
    );
  };

  const handleAskEris = () => {
    if (!onAskEris) return;
    // Solo el pedido: el servidor ya tiene tus datos de hoy. Con todo el estado pegado al texto, el análisis tardaba 85-192 s
    // y quedaba guardado como si lo hubieras escrito (revisión 2026-11-04, R1)
    onAskEris(`${persona.name}, analiza mis métricas de hoy: dame un resumen de cómo estoy y recomendaciones concretas.`);
  };

  return (
    <View style={[m.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={[m.header, m.headerRow]}>
        <View style={{ flex: 1 }}>
          <Text style={m.title}>Métricas</Text>
          <Text style={m.date}>{today}</Text>
        </View>
        {hasAnyData && (
          <View style={m.viewToggle}>
            {(['simple', 'completa'] as const).map((v) => (
              <TouchableOpacity key={v} onPress={() => chooseView(v)} style={[m.viewBtn, view === v && m.viewBtnOn]} accessibilityLabel={`Vista ${v}`}>
                <Text style={[m.viewText, view === v && m.viewTextOn]}>{v === 'simple' ? 'Simple' : 'Completa'}</Text>
              </TouchableOpacity>
            ))}
            <InfoTip id="vista_simple" size={15} color={T.textMuted} />
          </View>
        )}
      </View>

      <ScrollView
        style={m.scroll}
        contentContainerStyle={m.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
      >
        {!hasAnyData && (
          <View style={m.emptyCard}>
            <Text style={m.emptyIcon}>📵</Text>
            <Text style={m.emptyTitle}>Sin datos de salud</Text>
            <Text style={m.emptyDesc}>
              {healthStatus?.steps?.join('\n') ?? 'Activa los permisos de Health Connect para ver tus métricas.'}
            </Text>
            <TouchableOpacity style={m.emptyBtn} onPress={() => metricsService.openPermissionsScreen()}>
              <Text style={m.emptyBtnText}>Abrir Health Connect</Text>
            </TouchableOpacity>
          </View>
        )}

        {hasAnyData && <ScoreCard scores={scores} snapshot={snapshot} extras={{ trainedToday, savingsRate, foodScore: quality?.foodScore, hydrationScore: quality?.hydrationScore }} />}

        {/* VISTA SIMPLE (fase I6): tu día en pocas cosas, con colores y UNA acción; el detalle, en «Completa» */}
        {hasAnyData && view === 'simple' && (() => {
          const accion = quality?.tips[0]
            ?? (quality?.foodScore != null ? 'Vas bien: sigue así.' : 'Anota tu próxima comida en Nutrición y aquí verás cómo vas.');
          const enRango = microDay ? microDay.rows.filter((r) => SCORE_KEYS.includes(r.key) && r.pct >= 50).length : 0;
          const bajo = microDay?.bajos[0] && microDay.bajos[0].pct < 50 ? microDay.bajos[0] : null;
          const supHoy = sups ? estadoHoy(sups, supDia(), new Date().getHours()) : [];
          const sleepH = snapshot.sleep?.durationHours;
          return (
            <>
              <Text style={m.section}>TU DÍA</Text>
              <View style={m.grid}>
                {snapshot.nutrition && tileKcal()}
                {snapshot.nutrition && tileProtein()}
                {snapshot.hydration !== null && tileWater()}
                {typeof sleepH === 'number' && (
                  <MetricTile icon="😴" value={Math.round(sleepH * 10) / 10} unit="h" label="sueño de anoche" color={sleepH >= 7 ? T.green : sleepH >= 6 ? T.gold : T.red} />
                )}
              </View>
              <View style={m.simpleCard}>
                <Text style={m.simpleLabel}>AHORA</Text>
                <Text style={m.simpleAction}>{accion}</Text>
              </View>
              {quality?.letter && quality.foodScore != null && (
                <TouchableOpacity style={m.simpleRow} onPress={() => chooseView('completa')} accessibilityLabel="Ver la calidad en detalle">
                  <LetterChip letter={quality.letter} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={m.simpleTitle}>Calidad de lo que comes · {quality.foodScore}/100</Text>
                    <Text style={m.simpleText}>{quality.headline}</Text>
                  </View>
                  <Text style={m.chev}>›</Text>
                </TouchableOpacity>
              )}
              {microDay && microDay.rows.some((r) => r.total > 0) && (
                <TouchableOpacity style={m.simpleRow} onPress={() => chooseView('completa')} accessibilityLabel="Ver vitaminas y minerales">
                  <Text style={m.simpleIcon}>🥦</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={m.simpleTitle}>Vitaminas y minerales</Text>
                    <Text style={m.simpleText}>
                      {enRango} de {SCORE_KEYS.length} sobre la mitad de lo recomendado
                      {bajo ? ` · lo que menos llevas: ${bajo.nombre.charAt(0).toLowerCase() + bajo.nombre.slice(1)} (${bajo.fuentes.split(', ').slice(0, 2).join(', ')})` : ''}
                    </Text>
                  </View>
                  <Text style={m.chev}>›</Text>
                </TouchableOpacity>
              )}
              {supHoy.length > 0 && (
                <View style={m.simpleRow}>
                  <Text style={m.simpleIcon}>💊</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={m.simpleTitle}>Suplementos</Text>
                    <Text style={m.simpleText}>{supHoy.filter((e) => e.faltan === 0).length} de {supHoy.length} listos hoy</Text>
                  </View>
                </View>
              )}
              <TouchableOpacity onPress={() => chooseView('completa')} style={m.simpleMore}>
                <Text style={m.simpleMoreText}>Ver todo el detalle</Text>
              </TouchableOpacity>
            </>
          );
        })()}

        {view === 'completa' && (<>
        {/* ACTIVIDAD */}
        {hasActivity && (
          <>
            <Text style={m.section}>ACTIVIDAD HOY</Text>
            <View style={m.grid}>
              {snapshot.steps !== null && (
                <MetricTile
                  icon="👟"
                  value={snapshot.steps!.toLocaleString()}
                  label="pasos"
                  color={snapshot.steps! >= 10000 ? T.green : snapshot.steps! >= 5000 ? T.gold : T.red}
                  progress={(snapshot.steps! / 10000) * 100}
                  note={`${Math.round((snapshot.steps! / 10000) * 100)}%`}
                />
              )}
              {snapshot.distance !== null && (
                <MetricTile icon="📍" value={snapshot.distance!} unit="km" label="distancia" color={T.green} />
              )}
              {snapshot.calories !== null && (
                <MetricTile icon="🔥" value={snapshot.calories!} unit="kcal" label="cal. activas" color={T.gold} />
              )}
              {actMin != null && (
                <MetricTile
                  icon={<StopwatchIcon color={actMin >= 30 ? T.green : T.gold} />}
                  value={actMin}
                  unit="min"
                  label="activos"
                  color={actMin >= 30 ? T.green : T.gold}
                  note={actMin >= 30 ? '✓' : `${30 - actMin} min más`}
                />
              )}
            </View>
            {/* Lo detectado sin «modo entrenamiento»: se confirma qué fue con un toque */}
            {!!snapshot.activity?.bouts.length && (
              <ActivityCard
                activity={snapshot.activity}
                onLabel={async (bout, type) => {
                  await metricsService.labelActivity(bout, type).catch(() => {});
                  const fresh = await nutritionBackend.merge(await metricsService.getSnapshot(true));
                  setSnapshot(fresh);
                  nutritionBackend.refreshLocal(); // App vuelve a mandar el resumen: Eris y las metas se enteran
                }}
              />
            )}
          </>
        )}

        {/* SUEÑO */}
        {snapshot.sleep && (
          <>
            <Text style={m.section}>SUEÑO</Text>
            <Pressable onPress={() => setSleepOpen(true)} accessibilityRole="button" accessibilityLabel="Abrir Sueño">
              <SleepCard sleep={snapshot.sleep} insights={snapshot.sleepInsights} />
            </Pressable>
            <SleepScreen visible={sleepOpen} onClose={() => setSleepOpen(false)} />
          </>
        )}

        {/* CARDIOVASCULAR */}
        {hasCardio && (
          <>
            <Text style={m.section}>CARDIOVASCULAR</Text>
            <View style={m.grid}>
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

        {/* GLUCOSA (solo con el módulo aprobado por el administrador) */}
        {glucoseOn && snapshot.glucose && (
          <>
            <Text style={m.section}>GLUCOSA</Text>
            <View style={m.grid}>
              <MetricTile
                icon="🩸"
                value={snapshot.glucose.valueMgdl}
                unit="mg/dL"
                label="glucosa"
                color={snapshot.glucose.valueMgdl > 180 ? T.red : snapshot.glucose.valueMgdl < 70 ? T.gold : T.green}
                note={snapshot.glucose.valueMgdl > 180 ? 'Alto' : snapshot.glucose.valueMgdl < 70 ? 'Bajo' : 'En rango'}
              />
            </View>
          </>
        )}

        {/* NUTRICIÓN E HIDRATACIÓN */}
        {hasNutrition && (
          <>
            <Text style={m.section}>NUTRICIÓN</Text>
            <View style={m.grid}>
              {snapshot.nutrition && (
                <>
                  {/* Energía, proteína, fibra y agua se juzgan A LA HORA (lo esperable a esta hora, la marca de la barra),
                      no contra el día completo: a media mañana, 0,8 de 2,8 L de agua va bien (antes salía en rojo). */}
                  {tileKcal()}
                  {tileProtein()}
                  {(() => {
                    // Carbohidratos contra una referencia: el 45 % de la meta de calorías (el reparto del asesor de comida)
                    const { carbsPct } = computeMacroPercents(snapshot.nutrition);
                    const carbs = snapshot.nutrition!.carbs, ref = Math.round((nutriGoals.calories * 0.45) / 4);
                    const pct = ref > 0 ? Math.round((carbs / ref) * 100) : 0;
                    return (
                      <MetricTile
                        icon="🍞" value={carbs} unit="g" label={`carbos · referencia ${ref} g`} infoId="carbos"
                        color={carbs <= ref ? T.green : carbs <= ref * 1.15 ? T.gold : T.red}
                        progress={Math.min(pct, 100)}
                        note={carbs <= ref ? `${carbsPct}% de la energía` : `+${Math.round(carbs - ref)} g sobre tu referencia (${ref} g)`}
                      />
                    );
                  })()}
                  {/* Grasas, azúcar y sodio: antes solo mostraban cuánto consumiste, nunca si eso era mucho —
                      ahora comparan contra un límite saludable (ajustado según condiciones médicas conocidas,
                      igual que hace el asesor al recomendar comida). Fibra y proteína son al revés: una meta a
                      alcanzar, no un límite a no pasar — los carbos se dejan como % del total: no hay un techo
                      diario universal (depende del tipo de dieta), a diferencia de sodio/azúcar. */}
                  {(() => {
                    const fat = snapshot.nutrition!.fat, fatLim = nutriGoals.fatGLimit;
                    const fatPct = Math.round((fat / fatLim) * 100);
                    return (
                      <MetricTile
                        icon="🧈" value={fat} unit="g" label="grasas" infoId="grasas"
                        color={fat <= fatLim * 0.85 ? T.green : fat <= fatLim ? T.gold : T.red}
                        progress={Math.min(fatPct, 100)}
                        note={fat <= fatLim ? `${fatPct}% del límite` : `+${Math.round(fat - fatLim)} g sobre el límite (${Math.round(fatLim)} g)`}
                      />
                    );
                  })()}
                  {/* Grasa saturada (fase I6): menos del 10 % de la meta de calorías (OMS). Sale del registro (con lo estimado) */}
                  {quality && quality.satFatG > 0 && (() => {
                    const sat = quality.satFatG, lim = Math.round((nutriGoals.calories * 0.1) / 9);
                    const pct = lim > 0 ? Math.round((sat / lim) * 100) : 0;
                    return (
                      <MetricTile
                        icon="🥓" value={Math.round(sat * 10) / 10} unit="g" label="grasa saturada" infoId="grasa_saturada"
                        color={sat <= lim * 0.85 ? T.green : sat <= lim ? T.gold : T.red}
                        progress={Math.min(pct, 100)}
                        note={sat <= lim ? `${pct}% del límite` : `+${Math.round(sat - lim)} g sobre el límite (${lim} g)`}
                      />
                    );
                  })()}
                  {snapshot.nutrition.fiber > 0 && (() => {
                    const fiber = snapshot.nutrition!.fiber, goal = nutriGoals.fiberGGoal;
                    const pct = Math.round((fiber / goal) * 100);
                    const tr = track(fiber, goal, 'comida', 'g');
                    return (
                      <MetricTile
                        icon="🌾" value={fiber} unit="g" label={`fibra · meta ${Math.round(goal)} g`} infoId="fibra"
                        color={TRACK_COLOR[tr.tone]}
                        progress={Math.min(pct, 100)}
                        marker={pace.foodShare * 100}
                        status={tr.status} detail={tr.detail}
                      />
                    );
                  })()}
                  {snapshot.nutrition.sugar > 0 && (() => {
                    const sugar = snapshot.nutrition!.sugar, lim = nutriGoals.sugarGLimit;
                    const pct = Math.round((sugar / lim) * 100);
                    return (
                      <MetricTile
                        icon="🍬" value={sugar} unit="g" label="azúcar" infoId="azucar"
                        color={sugar <= lim * 0.7 ? T.green : sugar <= lim ? T.gold : T.red}
                        progress={Math.min(pct, 100)}
                        note={sugar <= lim ? `${pct}% del límite` : `+${Math.round(sugar - lim)} g sobre el límite (${Math.round(lim)} g)`}
                      />
                    );
                  })()}
                  {snapshot.nutrition.sodium > 0 && (() => {
                    const sodium = snapshot.nutrition!.sodium, lim = nutriGoals.sodiumMgLimit;
                    const pct = Math.round((sodium / lim) * 100);
                    return (
                      <MetricTile
                        icon="🧂" value={sodium} unit="mg" label="sodio" infoId="sodio"
                        color={sodium <= lim * 0.7 ? T.green : sodium <= lim ? T.gold : T.red}
                        progress={Math.min(pct, 100)}
                        note={sodium <= lim ? `${pct}% del límite` : `+${Math.round(sodium - lim).toLocaleString('es-CL')} mg sobre el límite (${Math.round(lim).toLocaleString('es-CL')} mg)`}
                      />
                    );
                  })()}
                </>
              )}
              {snapshot.hydration !== null && tileWater()}
            </View>

            {quality && <FoodQualityCard q={quality} />}
            {microDay && <MicrosCard md={microDay} conPerfil={conPerfil} />}
            <SupplementsSummary />

            {/* Déficit y superávit de calorías */}
            <View style={hc.card}>
              <View style={hc.header}>
                <Text style={hc.title}>DÉFICIT Y SUPERÁVIT</Text>
                <View style={hc.toggle}>
                  {([7, 30] as const).map((d) => (
                    <TouchableOpacity key={d} onPress={() => setHistoryDays(d)} style={[hc.toggleBtn, historyDays === d && hc.toggleBtnActive]}>
                      <Text style={[hc.toggleText, historyDays === d && hc.toggleTextActive]}>{d === 7 ? '7 días' : '30 días'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {calorieHistory.length > 0 ? (
                <>
                  <CalorieHistoryChart history={calorieHistory} goal={nutriGoals.calories} width={winWidth - S.md * 2 - 20 * 2} />
                  <View style={hc.legendRow}>
                    <View style={hc.legendItem}><View style={[hc.dot, { backgroundColor: T.green }]} /><Text style={hc.legendText}>Déficit</Text></View>
                    <View style={hc.legendItem}><View style={[hc.dot, { backgroundColor: T.red }]} /><Text style={hc.legendText}>Superávit</Text></View>
                    <View style={hc.legendItem}><View style={[hc.dot, { backgroundColor: T.border }]} /><Text style={hc.legendText}>Sin datos</Text></View>
                    <Text style={hc.goalText}>Meta: {nutriGoals.calories} kcal</Text>
                  </View>
                </>
              ) : (
                <Text style={hc.empty}>Cargando historial…</Text>
              )}
            </View>
          </>
        )}

        {/* CUERPO */}
        {hasBody && (
          <>
            <Text style={m.section}>CUERPO</Text>
            <View style={m.grid}>
              {snapshot.weight !== null && (
                <MetricTile icon={<ScaleIcon color={T.accent} />} value={snapshot.weight!} unit="kg" label="peso" color={T.accent} />
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

        {/* ESTADO FORGE (TOJI) */}
        {tojiState && (
          <>
            <Text style={m.section}>ESTADO FORGE</Text>
            <View style={m.grid}>
              <MetricTile icon="🔥" value={tojiState.streak || 0} unit="días" label="racha actual" color={T.accent} />
              <MetricTile icon="💪" value={tojiState.days4w || 0} unit="días" label="entrenados en 4 semanas" color={T.gold} />
              {tojiState.bestStreak > 0 && (
                <MetricTile icon="🏆" value={tojiState.bestStreak} unit="días" label="mejor racha" color={T.gold} />
              )}
            </View>
          </>
        )}

        </>)}

        {/* ⚡ CTA — Pedir análisis a Eris */}
        {hasAnyData && onAskEris && (
          <TouchableOpacity style={m.erisBtn} onPress={handleAskEris} activeOpacity={0.75}>
            <Text style={m.erisBtnIcon}>⚡</Text>
            <View style={{ flex: 1 }}>
              <Text style={m.erisBtnTitle}>Pedir análisis a {persona.name}</Text>
              <Text style={m.erisBtnDesc}>Interpretación personalizada de tus métricas de hoy</Text>
            </View>
            <Text style={m.erisBtnArrow}>›</Text>
          </TouchableOpacity>
        )}

        <Text style={m.updated}>
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
  iconSvg:  { marginBottom: 4 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  value:    { fontSize: 22, fontWeight: '800' },
  unit:     { fontSize: 12, color: T.textMuted, fontWeight: '600' },
  label:    { fontSize: 12, color: T.textMuted },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bar:      { height: 5, backgroundColor: T.border, borderRadius: R.full, overflow: 'hidden', marginTop: 8 },
  fill:     { height: '100%', borderRadius: R.full },
  ghost:    { height: 9, borderWidth: 1, borderStyle: 'dashed' },
  marker:   { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: T.text, opacity: 0.9 },
  status:   { fontSize: 12, fontWeight: '800', marginTop: 5 },
  detail:   { fontSize: 11, color: T.textMuted, lineHeight: 15 },
  note:     { fontSize: 11, fontWeight: '700', marginTop: 4 },
});

// ─── Calorie history chart styles ────────────────────────────
const hc = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: T.bgCard,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: T.border,
    padding: 20,
    marginTop: 12,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 12, fontWeight: '800', color: T.textMuted, letterSpacing: 0.8 },
  toggle: { flexDirection: 'row', backgroundColor: T.bgInput, borderRadius: R.full, padding: 2 },
  toggleBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: R.full },
  toggleBtnActive: { backgroundColor: T.accentGlow },
  toggleText: { fontSize: 11, fontWeight: '700', color: T.textMuted },
  toggleTextActive: { color: T.accent },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: T.textMuted },
  goalText: { fontSize: 11, color: T.textLight, fontWeight: '700', marginLeft: 'auto' },
  empty: { fontSize: 12, color: T.textMuted, textAlign: 'center', paddingVertical: 20 },
});

// ─── Sleep card styles ──────────────────────────────────────
const sc = StyleSheet.create({
  card: {
    backgroundColor: T.bgCard,
    borderRadius: R.xl,
    padding: S.md,
    borderWidth: 1,
    borderColor: T.border,
  },
  sleepTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  sleepDuration: { fontSize: 32, fontWeight: '900', color: T.text, letterSpacing: -1 },
  sleepSub:      { fontSize: 12, color: T.textMuted, marginTop: 2 },
  parts:         { gap: 6, marginBottom: 14 },
  partRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partDot:       { width: 8, height: 8, borderRadius: 4 },
  partKind:      { fontSize: 13, color: T.text, fontWeight: '700', width: 110 },
  partTime:      { fontSize: 12, color: T.textMuted, flex: 1 },
  partHours:     { fontSize: 13, color: T.text, fontWeight: '800' },
  partNote:      { fontSize: 12, color: T.textMuted, lineHeight: 17 },
  during:        { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  duringItem:    { fontSize: 12, color: T.textLight, fontWeight: '600' },
  badge:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.full, borderWidth: 1 },
  badgeText:     { fontSize: 12, fontWeight: '800' },
  
  multiBar: {
    height: 10,
    backgroundColor: T.border,
    borderRadius: R.full,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  barLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 14,
  },
  barCap: { fontSize: 11, color: T.textMuted },

  stages:   { flexDirection: 'row', borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14 },
  stage:    { flex: 1, alignItems: 'center' },
  stageVal: { fontSize: 14, fontWeight: '800' },
  stageLbl: { fontSize: 10, color: T.textMuted, marginTop: 2, fontWeight: '600' },
  stageSub: { fontSize: 9, color: T.textMuted, marginTop: 1, fontWeight: '700' },
  stageSep: { width: 1, backgroundColor: T.border, marginVertical: 4 },
});

// ─── Main styles ─────────────────────────────────────────────
const m = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: T.bg },
  scroll:  { flex: 1 },
  content: { padding: S.md, paddingBottom: 80 },

  header: { paddingHorizontal: S.md, paddingTop: 16, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.full, backgroundColor: T.bgCard, borderWidth: 1, borderColor: T.border },
  viewBtnOn: { backgroundColor: T.accentGlow, borderColor: T.accent },
  viewText: { color: T.textMuted, fontSize: 11, fontWeight: '700' },
  viewTextOn: { color: T.accent },
  simpleCard: { backgroundColor: T.bgCard, borderRadius: R.lg, borderWidth: 1, borderColor: T.borderActive, padding: 16, marginTop: 12, gap: 6 },
  simpleLabel: { color: T.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  simpleAction: { color: T.text, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  simpleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.bgCard, borderRadius: R.lg, borderWidth: 1, borderColor: T.border, padding: 14, marginTop: 10 },
  simpleIcon: { fontSize: 24, width: 34, textAlign: 'center' },
  simpleTitle: { color: T.text, fontSize: 14, fontWeight: '700' },
  simpleText: { color: T.textLight, fontSize: 12, marginTop: 2, lineHeight: 17 },
  chev: { color: T.textMuted, fontSize: 22, fontWeight: '700' },
  simpleMore: { alignSelf: 'center', paddingVertical: 14 },
  simpleMoreText: { color: T.accent, fontSize: 13, fontWeight: '700' },
  title:  { fontSize: 26, fontWeight: '900', color: T.text, letterSpacing: -0.5 },
  date:   { fontSize: 13, color: T.textMuted, marginTop: 2, textTransform: 'capitalize' },

  section: {
    fontSize: 11, color: T.textMuted, fontWeight: '800',
    letterSpacing: 2, marginBottom: 10, marginTop: 24,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

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
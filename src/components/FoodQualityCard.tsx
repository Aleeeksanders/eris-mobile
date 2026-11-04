/**
 * FoodQualityCard — "¿lo que comí hoy me alimenta?" en Métricas: nota del día hasta ahora, cada comida con su letra
 * y su porqué, lo comido vs lo esperable A ESTA HORA, e hidratación vs lo esperable a esta hora.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { T, R } from '../config/design';
import InfoTip from './InfoTip';
import type { DayQuality, Letter } from '../services/NutritionQuality';
import { coma } from '../services/fmtNum';

export const LETTER_COLOR: Record<Letter, string> = { A: '#22c55e', B: '#84cc16', C: '#f59e0b', D: '#f97316', E: '#f43f5e' };

export function LetterChip({ letter, size = 26 }: { letter: Letter; size?: number }) {
  const c = LETTER_COLOR[letter];
  return (
    <View style={[st.chip, { width: size, height: size, borderRadius: size / 3.2, borderColor: c, backgroundColor: `${c}22` }]}>
      <Text style={[st.chipText, { color: c, fontSize: size * 0.55 }]}>{letter}</Text>
    </View>
  );
}

/** Barra de lo que llevas, con una marca en lo esperable a esta hora (y la meta del día al final). */
function PaceBar({ label, got, goal, expected, unit, over = false }: { label: string; got: number; goal: number; expected: number; unit: string; over?: boolean }) {
  const pct = goal > 0 ? Math.min(1.15, got / goal) : 0;
  const exp = Math.min(1, expected);
  const ratio = exp > 0 ? (got / goal) / exp : 1;
  // Energía: pasarse también cuenta; proteína y fibra: mientras más cerca de lo esperado, mejor. El color es A LA HORA
  // (rojo solo si vas muy atrás para la hora); la barra fantasma es la meta del día y la marca, lo esperable ahora.
  const color = over
    ? (ratio > 1.35 ? T.red : ratio < 0.6 ? T.gold : T.green)
    : (ratio >= 0.9 ? T.green : ratio >= 0.6 ? T.gold : T.red);
  return (
    <View style={st.pace}>
      <View style={st.paceHead}>
        <Text style={st.paceLabel}>{label}</Text>
        <Text style={st.paceVal}>
          <Text style={{ color: T.text }}>{Math.round(got)}</Text> de {Math.round(goal)} {unit} · ~{Math.round(goal * exp)} a esta hora
        </Text>
      </View>
      <View style={st.track}>
        {/* fantasma: la meta del día (hasta el 100 %; la barra deja un margen por si te pasas) */}
        <View style={[st.ghost, { width: `${100 / 1.15}%`, backgroundColor: `${color}26`, borderColor: `${color}80` }]} />
        <View style={[st.fill, { width: `${Math.min(100, pct * 100 / 1.15)}%`, backgroundColor: color }]} />
        <View style={[st.marker, { left: `${(exp * 100) / 1.15}%` }]} />
      </View>
    </View>
  );
}

/**
 * De qué sale la nota (calidad v2, fase I6): cada parte de 0 a 100 con su peso. Sin vitaminas y minerales evaluables, esa
 * parte no cuenta y se dice por qué.
 */
function ScoreParts({ parts }: { parts: NonNullable<DayQuality['parts']> }) {
  const v2 = parts.micros != null;
  const rows: Array<[string, number | null, number]> = [
    ['Qué comiste', parts.quality, v2 ? 55 : 60],
    ['Si va alcanzando', parts.coverage, v2 ? 20 : 25],
    ['Vitaminas y minerales', parts.micros, v2 ? 10 : 0],
    ['Horarios', parts.timing, 15],
  ];
  return (
    <View style={st.parts}>
      {rows.map(([label, v, peso]) => {
        const c = v == null ? T.textMuted : v >= 75 ? T.green : v >= 50 ? T.gold : '#f97316';
        return (
          <View key={label} style={st.partRow}>
            <Text style={st.partLabel}>{label}</Text>
            <View style={st.partTrack}>{v != null && <View style={[st.partFill, { width: `${v}%`, backgroundColor: c }]} />}</View>
            <Text style={[st.partVal, { color: c }]}>{v == null ? 'sin datos' : v}</Text>
            <Text style={st.partW}>{peso ? `${peso} %` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function FoodQualityCard({ q }: { q: DayQuality }) {
  const water = q.water;
  const hydColor = q.hydrationScore == null ? T.textMuted : q.hydrationScore >= 85 ? T.green : T.gold;
  return (
    <View style={st.card}>
      <View style={st.head}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={st.title}>CALIDAD DE LA ALIMENTACIÓN</Text>
            <InfoTip id="calidad_dia" size={16} color={T.textMuted} />
          </View>
          <Text style={st.headline}>{q.headline}</Text>
        </View>
        {q.letter && q.foodScore != null ? (
          <View style={{ alignItems: 'center' }}>
            <LetterChip letter={q.letter} size={44} />
            <Text style={st.score}>{q.foodScore}/100</Text>
          </View>
        ) : null}
      </View>

      {q.foodScore != null && q.parts && <ScoreParts parts={q.parts} />}

      {q.foodScore != null && (
        <>
          <Text style={st.sub}>Lo esperable a esta hora: ~{Math.round(q.expectedShare * 100)} % de lo del día</Text>
          <PaceBar label="Proteína" got={q.protein} goal={q.goals.protein} expected={q.expectedShare} unit="g" />
          <PaceBar label="Fibra" got={q.fiber} goal={q.goals.fiber} expected={q.expectedShare} unit="g" />
          <PaceBar label="Energía" got={q.kcal} goal={q.goals.kcal} expected={q.expectedShare} unit="kcal" over />
        </>
      )}

      {q.meals.length > 0 && (
        <View style={st.meals}>
          {q.meals.map((ml) => (
            <View key={ml.slot} style={st.meal}>
              <LetterChip letter={ml.letter} />
              <View style={{ flex: 1 }}>
                <View style={st.mealHead}>
                  <Text style={st.mealName}>{ml.label}</Text>
                  <Text style={st.mealKcal}>{ml.kcal} kcal · {ml.protein} g prot</Text>
                </View>
                {ml.notes.length > 0 ? (
                  <Text style={st.mealNote}>{ml.notes.join(' · ')}</Text>
                ) : (
                  <Text style={[st.mealNote, { color: T.green }]}>{ml.score >= 65 ? 'bien armada' : 'sin observaciones'}</Text>
                )}
                {ml.sellos > 0 && <Text style={st.sellos}>{ml.sellos} sello{ml.sellos > 1 ? 's' : ''} «ALTO EN»</Text>}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={st.hyd}>
        <Text style={st.hydIcon}>💧</Text>
        <View style={{ flex: 1 }}>
          <Text style={st.hydText}>
            <Text style={{ color: T.text, fontWeight: '700' }}>{coma(water.liters)} L</Text> de ~{coma(water.expected)} L esperables a esta hora
            <Text style={{ color: T.textMuted }}> (meta {coma(q.goals.water, 2)} L)</Text>
          </Text>
          {water.sugaryMl > 0 && <Text style={st.hydWarn}>{Math.round(water.sugaryMl)} ml de bebidas azucaradas o alcohol (no cuentan como agua)</Text>}
        </View>
        {q.hydrationScore != null && <Text style={[st.hydScore, { color: hydColor }]}>{q.hydrationScore}</Text>}
      </View>

      {q.tips.length > 0 && (
        <View style={st.tips}>
          {q.tips.map((t, i) => <Text key={i} style={st.tip}>• {t}</Text>)}
        </View>
      )}

      <Text style={st.foot}>
        Calidad estilo Nutri-Score + procesamiento (NOVA) + sellos «ALTO EN», según la hora de cada comida, con tus vitaminas y minerales. Pesa 30 % del Score dinámico.
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: { width: '100%', backgroundColor: T.bgCard, borderRadius: R.lg, borderWidth: 1, borderColor: T.border, padding: 18, marginTop: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 12, fontWeight: '800', color: T.textMuted, letterSpacing: 0.8 },
  headline: { color: T.text, fontSize: 15, fontWeight: '600', marginTop: 6, lineHeight: 20 },
  score: { color: T.textLight, fontSize: 11, marginTop: 4, fontVariant: ['tabular-nums'] },
  chip: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontWeight: '900' },
  sub: { color: T.textMuted, fontSize: 11, marginTop: 14, marginBottom: 2 },
  parts: { marginTop: 14, gap: 7, padding: 12, borderRadius: R.md, backgroundColor: T.bgInput },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partLabel: { color: T.textLight, fontSize: 12, width: 138 },
  partTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: T.border, overflow: 'hidden' },
  partFill: { height: 6, borderRadius: 3 },
  partVal: { fontSize: 12, fontWeight: '800', width: 54, textAlign: 'right', fontVariant: ['tabular-nums'] },
  partW: { color: T.textMuted, fontSize: 10, width: 32, textAlign: 'right', fontVariant: ['tabular-nums'] },
  pace: { marginTop: 10 },
  paceHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  paceLabel: { color: T.textLight, fontSize: 12, fontWeight: '700' },
  paceVal: { color: T.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] },
  track: { height: 9, borderRadius: 5, backgroundColor: T.bgInput, overflow: 'visible' },
  ghost: { position: 'absolute', top: 0, left: 0, height: 9, borderRadius: 5, borderWidth: 1, borderStyle: 'dashed' },
  fill: { height: 9, borderRadius: 5 },
  marker: { position: 'absolute', top: -3, width: 2, height: 13, borderRadius: 1, backgroundColor: T.text, opacity: 0.8 },
  meals: { marginTop: 16, gap: 10 },
  meal: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  mealHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  mealName: { color: T.text, fontSize: 14, fontWeight: '700' },
  mealKcal: { color: T.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] },
  mealNote: { color: T.textLight, fontSize: 12, marginTop: 2 },
  sellos: { color: '#f97316', fontSize: 11, marginTop: 2, fontWeight: '700' },
  hyd: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, padding: 12, borderRadius: R.md, backgroundColor: T.bgInput },
  hydIcon: { fontSize: 18 },
  hydText: { color: T.textLight, fontSize: 12, lineHeight: 17 },
  hydWarn: { color: T.gold, fontSize: 11, marginTop: 3 },
  hydScore: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  tips: { marginTop: 14, gap: 5 },
  tip: { color: T.textLight, fontSize: 12, lineHeight: 17 },
  foot: { color: T.textMuted, fontSize: 10, marginTop: 14, lineHeight: 14 },
});

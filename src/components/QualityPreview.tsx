/**
 * QualityPreview — "si lo anotas, ¿cómo queda tu día?": la simulación antes de registrar un alimento.
 * Pedido del usuario (2026-10-15): ver cuánto afecta un alimento a la calidad de la alimentación ANTES de anotarlo.
 * Es el mismo cálculo de la tarjeta de Métricas (services/NutritionQuality.ts → simulateAddToday), con y sin el alimento;
 * no se guarda nada hasta tocar "Registrar".
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { T, R } from '../config/design';
import { LetterChip } from './FoodQualityCard';
import type { QualitySim, Letter } from '../services/NutritionQuality';

const ITEM_WORD: Record<Letter, string> = { A: 'muy nutritivo', B: 'nutritivo', C: 'regular', D: 'poco nutritivo', E: 'muy poco nutritivo' };

function Score({ letter, score }: { letter: Letter | null; score: number | null }) {
  if (!letter || score == null) return <Text style={st.none}>sin nota aún</Text>;
  return (
    <View style={st.score}>
      <LetterChip letter={letter} size={30} />
      <Text style={st.scoreNum}>{score}</Text>
    </View>
  );
}

export default function QualityPreview({ sim }: { sim: QualitySim }) {
  const { before, after, item, meal } = sim;
  const delta = after.foodScore != null && before.foodScore != null ? after.foodScore - before.foodScore : null;
  const deltaColor = delta == null || delta === 0 ? T.textMuted : delta > 0 ? T.green : T.red;
  const mealChanged = meal.after && (!meal.before || meal.before.letter !== meal.after.letter);
  return (
    <View style={st.box}>
      <Text style={st.title}>SI LO ANOTAS · CALIDAD DE TU DÍA</Text>

      <View style={st.row}>
        <Score letter={before.letter} score={before.foodScore} />
        <Text style={st.arrow}>→</Text>
        <Score letter={after.letter} score={after.foodScore} />
        <View style={{ flex: 1 }} />
        {delta != null && (
          <Text style={[st.delta, { color: deltaColor }]}>{delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : 'sin cambio'}</Text>
        )}
      </View>

      <View style={st.line}>
        <LetterChip letter={item.letter} size={22} />
        <Text style={st.lineText}>
          Este alimento: <Text style={st.strong}>{ITEM_WORD[item.letter]}</Text>
          {item.nova >= 4 ? ' · ultraprocesado' : ''}
        </Text>
      </View>
      {item.sellos.length > 0 && <Text style={st.sellos}>{item.sellos.join(' · ')}</Text>}

      {meal.after && (
        <View style={st.line}>
          {meal.before ? <LetterChip letter={meal.before.letter} size={22} /> : null}
          {meal.before && mealChanged ? <Text style={st.arrowSmall}>→</Text> : null}
          {(!meal.before || mealChanged) && <LetterChip letter={meal.after.letter} size={22} />}
          <Text style={st.lineText}>
            {meal.label}{!meal.before ? ' (sería lo primero)' : mealChanged ? '' : ': se mantiene'}
          </Text>
        </View>
      )}

      {sim.better.map((t, i) => <Text key={`b${i}`} style={st.good}>✓ {t}</Text>)}
      {sim.worse.map((t, i) => <Text key={`w${i}`} style={st.bad}>⚠ {t}</Text>)}
    </View>
  );
}

const st = StyleSheet.create({
  box: { marginTop: 12, padding: 14, borderRadius: R.lg, backgroundColor: T.bgInput, borderWidth: 1, borderColor: T.border, gap: 8 },
  title: { color: T.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreNum: { color: T.text, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  none: { color: T.textMuted, fontSize: 12 },
  arrow: { color: T.textMuted, fontSize: 18 },
  arrowSmall: { color: T.textMuted, fontSize: 13 },
  delta: { fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { color: T.textLight, fontSize: 13, flexShrink: 1 },
  strong: { color: T.text, fontWeight: '700' },
  sellos: { color: '#f97316', fontSize: 11, fontWeight: '700', marginLeft: 30 },
  good: { color: T.green, fontSize: 12, lineHeight: 17 },
  bad: { color: T.gold, fontSize: 12, lineHeight: 17 },
});

// ============================================================
// Eris Mobile — los números del día en una fila (Inicio)
//
// Inicio más simple (2026-10-10): antes el agua salía en tres lugares y la comida en dos. Acá van una sola vez, cortos,
// y tocar uno lleva a su detalle (Nutrición, Métricas o Finanzas). El color del agua es contra lo esperable a esta
// hora de TU día (reloj interno), no contra la meta del día entero.
// ============================================================

import React from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { T, R } from '../../config/design';
import { expectedWater, type DayModel } from './dayModel';

const fmtL = (l: number) => `${(Math.round(l * 10) / 10).toString().replace('.', ',')}`;
const fmtN = (n: number) => Math.round(n).toLocaleString('es-CL');
const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

export interface ChipTargets { food: () => void; metrics: () => void; finance?: () => void }

export default function DayChips({
  m, hydration, waterGoal, kcal, kcalGoal, sleepHours, steps, activityMin, paraGastar, go,
}: {
  m: DayModel; hydration: number | null; waterGoal: number; kcal: number | null; kcalGoal: number;
  sleepHours: number | null; steps: number | null;
  /** minutos de actividad detectada hoy (pulso + pasos del reloj, sin modo entrenamiento) */
  activityMin?: number | null;
  /** lo que puedes gastar hasta el sueldo, desde tus cuentas (sin cuentas no hay chip) */
  paraGastar?: number | null; go: ChipTargets;
}) {
  const water = hydration ?? 0;
  const expW = expectedWater(m, waterGoal);
  const waterColor = waterGoal <= 0 ? T.text : water >= expW * 0.9 ? T.green : water >= expW * 0.6 ? T.gold : T.red;
  const chips: Array<{ key: string; icon: string; value: string; unit: string; color?: string; onPress?: () => void }> = [
    { key: 'agua', icon: '💧', value: waterGoal > 0 ? `${fmtL(water)}/${fmtL(waterGoal)}` : fmtL(water), unit: 'L', color: waterColor, onPress: go.food },
    { key: 'comida', icon: '🍽️', value: kcal != null ? fmtN(kcal) : '—', unit: kcalGoal > 0 ? `/${fmtN(kcalGoal)} kcal` : 'kcal', onPress: go.food },
    // Sin reloj no hay sueño ni pasos: no se muestran chips vacíos ("—")
    ...(sleepHours != null ? [{ key: 'sueño', icon: '😴', value: fmtL(sleepHours), unit: 'h', onPress: go.metrics }] : []),
    ...(steps != null ? [{ key: 'pasos', icon: '👟', value: fmtN(steps), unit: 'pasos', onPress: go.metrics }] : []),
    // Lo que los pasos no cuentan (un partido, pesas, bici): la actividad detectada del día
    ...(activityMin != null && activityMin >= 10 ? [{ key: 'actividad', icon: '⚡', value: activityMin >= 60 ? `${Math.floor(activityMin / 60)} h${activityMin % 60 ? ` ${activityMin % 60}` : ''}` : String(activityMin), unit: activityMin >= 60 && activityMin % 60 ? 'min activo' : activityMin >= 60 ? 'activo' : 'min activo', color: activityMin >= 30 ? T.green : undefined, onPress: go.metrics }] : []),
    ...(paraGastar != null && go.finance ? [{ key: 'plata', icon: '💰', value: clp(paraGastar), unit: 'p/ gastar', color: paraGastar < 0 ? T.red : undefined, onPress: go.finance }] : []),
  ];
  return (
    <View style={st.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.row}>
        {chips.map((c) => (
          <TouchableOpacity key={c.key} onPress={c.onPress} activeOpacity={0.7} style={st.chip}>
            <Text style={st.icon}>{c.icon}</Text>
            <Text style={[st.value, c.color ? { color: c.color } : null]}>{c.value}</Text>
            <Text style={st.unit}>{c.unit}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginBottom: 14, marginHorizontal: -2 },
  row: { gap: 8, paddingHorizontal: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'baseline', gap: 5,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: R.full,
    backgroundColor: T.bgCard, borderWidth: 1, borderColor: T.border,
  },
  icon: { fontSize: 13 },
  value: { color: T.text, fontSize: 14, fontWeight: '800' },
  unit: { color: T.textMuted, fontSize: 11, fontWeight: '600' },
});

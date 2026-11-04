/**
 * ActivityCard — la actividad de hoy que Eris detectó con el reloj, sin «modo entrenamiento» (services/activityDetect.ts).
 * Cada bloque dice cuándo fue, cuánto duró, qué tan intenso y cuánto gastó; la persona confirma qué fue con un toque
 * («🏀 Básquet») y eso queda para Eris, las metas del día y los avisos.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { T, R, S } from '../config/design';
import { ACTIVITY_TYPES, boutName, fmtMinutes, type ActivityBout, type ActivitySummary, type ActivityType } from '../services/activityDetect';

const hhmm = (iso: string) => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const KCAL_FROM: Record<ActivityBout['kcalFrom'], string> = { reloj: 'del reloj', pulso: 'por tu pulso', pasos: 'por tus pasos', tipo: 'por el tipo de actividad' };

export default function ActivityCard({ activity, onLabel }: { activity: ActivitySummary; onLabel: (bout: ActivityBout, type: ActivityType) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (!activity.bouts.length) return null;
  return (
    <View style={st.card}>
      <View style={st.head}>
        <Text style={st.total}>{fmtMinutes(activity.minutes)}</Text>
        <Text style={st.totalSub}>de actividad · ~{activity.kcal.toLocaleString('es-CL')} kcal{activity.vigorousMin ? ` · ${fmtMinutes(activity.vigorousMin)} intensa` : ''}</Text>
      </View>
      {activity.bouts.map((b) => {
        const n = boutName(b);
        const open = !b.label || editing === b.start;
        return (
          <View key={b.start} style={st.bout}>
            <View style={st.row}>
              <Text style={st.emoji}>{n.emoji}</Text>
              <View style={st.flex}>
                <Text style={st.name}>{n.name}{b.label ? ' ✓' : ''}</Text>
                <Text style={st.meta}>
                  {hhmm(b.start)}–{hhmm(b.end)} · {fmtMinutes(b.minutes)} · {b.intensity}{b.avgHr ? ` · ${b.avgHr} lpm` : ''}
                </Text>
              </View>
              <View style={st.kcalBox}>
                <Text style={st.kcal}>~{b.kcal.toLocaleString('es-CL')}</Text>
                <Text style={st.kcalUnit}>kcal</Text>
              </View>
            </View>
            {open ? (
              <View>
                <Text style={st.ask}>{b.label ? '¿Qué fue?' : b.fromSession ? '¿Qué fue? (lo registró tu reloj)' : '¿Qué fue? Lo detecté con tu pulso y tus pasos'}</Text>
                <View style={st.chips}>
                  {ACTIVITY_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[st.chip, b.label === t.id && st.chipOn]}
                      onPress={() => { setEditing(null); onLabel(b, t.id); }}
                      accessibilityLabel={`Fue ${t.label}`}
                    >
                      <Text style={[st.chipText, b.label === t.id && st.chipTextOn]}>{t.emoji} {t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setEditing(b.start)} accessibilityLabel={`Cambiar qué fue la actividad de las ${hhmm(b.start)}`}>
                <Text style={st.change}>Cambiar</Text>
              </TouchableOpacity>
            )}
            <Text style={st.src}>Gasto {KCAL_FROM[b.kcalFrom]}</Text>
          </View>
        );
      })}
      <Text style={st.foot}>Sin modo entrenamiento: lo leo del pulso, los pasos y las calorías del reloj. Suma a tu meta de calorías y de agua de hoy.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: T.bgCard, borderRadius: R.xl, padding: S.md, borderWidth: 1, borderColor: T.border, marginTop: 10, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  total: { color: T.text, fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  totalSub: { color: T.textMuted, fontSize: 12 },
  bout: { borderTopWidth: 1, borderTopColor: T.border, paddingTop: 10, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  emoji: { fontSize: 24 },
  name: { color: T.text, fontSize: 14, fontWeight: '800' },
  meta: { color: T.textMuted, fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  kcalBox: { alignItems: 'flex-end' },
  kcal: { color: T.gold, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  kcalUnit: { color: T.textMuted, fontSize: 10 },
  ask: { color: T.textLight, fontSize: 12, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.full, backgroundColor: T.border },
  chipOn: { backgroundColor: T.accentGlow, borderWidth: 1, borderColor: T.accent },
  chipText: { color: T.textLight, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: T.accent },
  change: { color: T.accent, fontSize: 12, fontWeight: '700' },
  src: { color: T.textMuted, fontSize: 10 },
  foot: { color: T.textMuted, fontSize: 11, lineHeight: 16 },
});

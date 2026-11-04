// ============================================================
// Eris Mobile — suplementos en Métricas (fase I6, 2026-10-23)
//
// Los de hoy (listo, o cuántas tomas van) y la constancia de los últimos 7 días, contada desde que se agregó cada uno. Sin
// rachas ni rojos: es para saber cómo vas, no para culparse («medir sin obsesión»). Se anotan en Nutrición.
// ============================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { T, R } from '../../config/design';
import InfoTip from '../InfoTip';
import { useSupplements, SUP } from './SupplementsCard';
import { supDia } from '../../services/supplements/supplementStore';
import { constancia, estadoHoy } from '../../services/supplements/supplementCore';

export default function SupplementsSummary() {
  const st = useSupplements();
  if (!st) return null;
  const now = new Date();
  const hoy = estadoHoy(st, supDia(), now.getHours() + now.getMinutes() / 60);
  if (!hoy.length) return null;
  const cons = new Map(constancia(st, now).map((c) => [c.id, c]));
  const listos = hoy.filter((e) => e.faltan === 0).length;
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>SUPLEMENTOS</Text>
        <InfoTip id="suplementos" size={16} color={T.textMuted} />
        <View style={{ flex: 1 }} />
        <Text style={s.count}>{listos} de {hoy.length} listos hoy</Text>
      </View>
      {hoy.map((e) => {
        const c = cons.get(e.sup.id);
        return (
          <View key={e.sup.id} style={s.row}>
            <Text style={[s.state, { color: e.faltan === 0 ? T.green : T.textMuted }]}>{e.faltan === 0 ? '✓' : `${e.tomadas}/${e.sup.tomasDia}`}</Text>
            <Text style={s.name} numberOfLines={1}>{e.sup.nombre}</Text>
            {c && c.esperadas > 0 && (
              <View style={s.weekWrap}>
                <View style={s.week}><View style={[s.weekFill, { width: `${Math.min(100, c.pct)}%` }]} /></View>
                <Text style={s.weekText}>{e.sup.tomasDia === 1 ? `${c.hechas} de ${c.esperadas} días` : `${c.hechas} de ${c.esperadas} tomas`}</Text>
              </View>
            )}
          </View>
        );
      })}
      <Text style={s.foot}>Los últimos 7 días, desde que agregaste cada uno. Se marcan en Nutrición → Suplementos de hoy.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { width: '100%', backgroundColor: T.bgCard, borderRadius: R.lg, borderWidth: 1, borderColor: T.border, padding: 18, marginTop: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  title: { fontSize: 12, fontWeight: '800', color: T.textMuted, letterSpacing: 0.8 },
  count: { color: SUP, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  state: { width: 30, fontSize: 13, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  name: { flex: 1, color: T.text, fontSize: 13, fontWeight: '600' },
  weekWrap: { alignItems: 'flex-end', gap: 3, width: 96 },
  week: { width: 96, height: 5, borderRadius: 3, backgroundColor: T.bgInput, overflow: 'hidden' },
  weekFill: { height: 5, backgroundColor: SUP },
  weekText: { color: T.textMuted, fontSize: 10, fontVariant: ['tabular-nums'] },
  foot: { color: T.textMuted, fontSize: 10, marginTop: 8, lineHeight: 14 },
});

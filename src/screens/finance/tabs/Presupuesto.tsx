// Finanzas 2.0 — Topes por categoría (presupuesto al día del mes), dentro de Plan: barra fantasma (el tope), la barra
// (lo gastado) y la marca (lo esperable hoy).
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FX, clp, catOf, CAT_ORDER } from '../fx';
import { Panel, Label, GhostBar, Empty } from '../parts';
import { presupuestoAlDia } from '../../../services/finance/financeCore';
import type { TabProps } from '../types';

export default function Presupuesto({ S, V, open }: TabProps) {
  const lineas = useMemo(() => presupuestoAlDia(S, V.now), [S, V.now]);
  const con = lineas.filter((l) => l.presup > 0), sin = lineas.filter((l) => !(l.presup > 0));
  const total = con.reduce((a, l) => a + l.presup, 0), gastado = con.reduce((a, l) => a + l.gastado, 0), esperado = con.reduce((a, l) => a + l.esperado, 0);
  const libres = CAT_ORDER.filter((c) => !lineas.some((l) => l.cat === c));

  return (
    <View>
      {total > 0 && (
        <Panel glow={FX.violetDeep}>
          <Label>TODOS TUS TOPES JUNTOS</Label>
          <Text style={s.big}>{clp(gastado)} <Text style={s.of}>de {clp(total)}</Text></Text>
          <GhostBar gastado={gastado} presup={total} esperado={esperado} color={FX.violet} />
          <Text style={s.caption}>Punteado: el tope del mes · marca blanca: lo esperable a hoy (con los fijos en su día). Toca una categoría para cambiar su tope.</Text>
        </Panel>
      )}
      {!con.length && <Empty icon="🎯" text="Ponle un tope mensual a tus categorías: te muestro día a día si vas bien, cuánto te queda por día y te aviso antes de pasarte." />}
      {con.map((l) => {
        const m = catOf(l.cat);
        const tono = l.estado === 'sobre' ? FX.down : l.estado === 'apurado' ? FX.gold : FX.up;
        return (
          <TouchableOpacity key={l.cat} onPress={() => open({ k: 'presup', cat: l.cat })} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${m.label}: ${l.texto}`}>
            <Panel>
              <View style={s.head}>
                <Text style={s.name}>{m.icon} {m.label}</Text>
                <Text style={s.amt}>{clp(l.gastado)}<Text style={s.of}> / {clp(l.presup)}</Text></Text>
              </View>
              <GhostBar gastado={l.gastado} presup={l.presup} esperado={l.esperado} color={m.color} />
              <Text style={[s.state, { color: tono }]}>{l.texto}</Text>
            </Panel>
          </TouchableOpacity>
        );
      })}
      {sin.length > 0 && (
        <Panel>
          <Label>SIN PRESUPUESTO ESTE MES</Label>
          {sin.map((l) => (
            <TouchableOpacity key={l.cat} style={s.line} onPress={() => open({ k: 'presup', cat: l.cat })} accessibilityRole="button">
              <Text style={s.lineName}>{catOf(l.cat).icon} {catOf(l.cat).label}</Text>
              <Text style={s.lineAmt}>{clp(l.gastado)}</Text>
              <Text style={s.add}>+ tope</Text>
            </TouchableOpacity>
          ))}
        </Panel>
      )}
      {libres.length > 0 && (
        <View style={s.chips}>
          {libres.map((c) => (
            <TouchableOpacity key={c} style={s.chip} onPress={() => open({ k: 'presup', cat: c })} accessibilityRole="button">
              <Text style={s.chipText}>+ {catOf(c).icon} {catOf(c).label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  big: { color: FX.text, fontFamily: FX.mono, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  of: { color: FX.muted, fontSize: 13, fontFamily: FX.mono },
  caption: { color: FX.dim, fontSize: 11, marginTop: 8, lineHeight: 15 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  name: { color: FX.text, fontSize: 15, fontWeight: '700', flex: 1 },
  amt: { color: FX.text, fontFamily: FX.mono, fontSize: 14, fontVariant: ['tabular-nums'] },
  state: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 42, borderTopWidth: 1, borderTopColor: FX.lineSoft },
  lineName: { color: FX.text, fontSize: 14, flex: 1 },
  lineAmt: { color: FX.text, fontFamily: FX.mono, fontSize: 13 },
  add: { color: FX.violet, fontSize: 12, fontWeight: '800', marginLeft: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: FX.lineSoft, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  chipText: { color: FX.muted, fontSize: 12, fontWeight: '700' },
});

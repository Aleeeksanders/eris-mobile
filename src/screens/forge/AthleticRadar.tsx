// ============================================================
// Forge — tus parámetros atléticos (fase I9, 2026-10-23): el radar de 7 ejes (lo de base punteado, con el bono de tus
// clases relleno) y la lista con de dónde sale cada uno. Se ve en el avatar (PERSONAJE) y, compacto, en la ARENA.
// ============================================================
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText } from 'react-native-svg';
import * as A from '../../services/forge/forgeAthletic';
import { FG, FONT } from './theme';
import { Bar, Label, P, Row } from './ui';

const valColor = (v: number) => (v >= 75 ? FG.gold : v >= 50 ? FG.green : v >= 25 ? FG.blue : FG.dim);

export function AthleticRadar({ data, color = FG.red, size = 230 }: { data: A.Athletic; color?: string; size?: number }) {
  const [sel, setSel] = useState<A.ParamKey | null>(null);
  const n = data.params.length;
  const R = 80, c = 110;
  const at = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(a) * R * (v / 100), c + Math.sin(a) * R * (v / 100)] as [number, number];
  };
  const poly = (vals: number[]) => vals.map((v, i) => at(i, Math.max(4, v)).join(',')).join(' ');
  const p = sel ? data.params.find((x) => x.key === sel)! : null;
  const boosted = data.params.some((x) => x.boost > 0);
  return (
    <View>
      <View style={{ alignItems: 'center' }}>
        <Svg width={size} height={size} viewBox="0 0 220 220" accessibilityLabel={`Parámetros atléticos: ${data.params.map((x) => `${x.label} ${x.value}`).join(', ')}`}>
          {[25, 50, 75, 100].map((g) => <Polygon key={g} points={poly(Array(n).fill(g))} fill="none" stroke={FG.line2} strokeWidth={1} />)}
          {data.params.map((_, i) => { const [x, y] = at(i, 100); return <Line key={i} x1={c} y1={c} x2={x} y2={y} stroke={FG.line} strokeWidth={1} />; })}
          {boosted && <Polygon points={poly(data.params.map((x) => x.base))} fill="none" stroke={FG.muted} strokeWidth={1.2} strokeDasharray="3 3" />}
          <Polygon points={poly(data.params.map((x) => x.value))} fill={color} fillOpacity={0.28} stroke={color} strokeWidth={2} strokeLinejoin="round" />
          {data.params.map((x, i) => { const [px, py] = at(i, Math.max(4, x.value)); return <Circle key={x.key} cx={px} cy={py} r={sel === x.key ? 4.5 : 3} fill={color} />; })}
          {data.params.map((x, i) => {
            const [lx, ly] = at(i, 122);
            return (
              <SvgText key={x.key} x={lx} y={ly + 4} fontSize={10.5} fontWeight="bold" fill={sel === x.key ? FG.white : FG.muted} textAnchor="middle" onPress={() => setSel(sel === x.key ? null : x.key)}>
                {x.short} {x.value}
              </SvgText>
            );
          })}
        </Svg>
      </View>
      <View style={{ gap: 6 }}>
        {data.params.map((x) => (
          <TouchableOpacity key={x.key} onPress={() => setSel(sel === x.key ? null : x.key)} activeOpacity={0.8} accessibilityLabel={`${x.label}: ${x.value} de 100`}>
            <Row gap={8}>
              <Text style={[st.name, sel === x.key && { color: FG.white }]}>{x.label}</Text>
              <View style={{ flex: 1 }}><Bar pct={x.value} color={valColor(x.value)} height={6} /></View>
              <Text style={[st.val, { color: valColor(x.value) }]}>{x.value}</Text>
            </Row>
            {sel === x.key && (
              <View style={st.detail}>
                <P size={12} color={FG.text}>{A.PARAMS.find((q) => q.key === x.key)!.desc}</P>
                <P size={11.5} color={FG.dim}>Sale de: {x.why}.</P>
                {x.boost > 0 && <P size={11.5} color={color}>Tus clases lo potencian +{Math.round(x.boost * 100)} % (base {x.base}).</P>}
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
      {p == null && <P size={11} color={FG.dim} style={{ marginTop: 8 }}>Toca uno para ver de dónde sale. Es una foto de lo que entrenas en las últimas 4 semanas (series de Forge y pasos del reloj), no una prueba de laboratorio.</P>}
    </View>
  );
}

/** Compacto (para la Arena): 7 barras finas. */
export function AthleticBars({ data, color = FG.red }: { data: A.Athletic; color?: string }) {
  return (
    <View style={{ gap: 5 }}>
      {data.params.map((x) => (
        <Row key={x.key} gap={6}>
          <Label size={10} style={{ width: 30 }}>{x.short}</Label>
          <View style={{ flex: 1 }}><Bar pct={x.value} color={x.boost > 0 ? color : valColor(x.value)} height={5} /></View>
          <Text style={[st.val, { fontSize: 13, color: x.boost > 0 ? color : FG.muted }]}>{x.value}</Text>
        </Row>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  name: { fontFamily: FONT.bodyBold, fontSize: 12.5, color: FG.muted, width: 104 },
  val: { fontFamily: FONT.display, fontSize: 16, width: 30, textAlign: 'right' },
  detail: { marginTop: 4, marginBottom: 4, marginLeft: 4, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: FG.line2, gap: 2 },
});

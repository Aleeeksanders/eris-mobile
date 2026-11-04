// ============================================================
// Forge 2.0 — gráficos (F6): la curva y las barras de Finanzas (parts.tsx) con la cara de Forge.
// La curva no parte de cero (en fuerza lo que importa es el cambio) y salta las semanas sin dato.
// ============================================================
import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Line, Defs, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import { FG } from './theme';
import { P, Row } from './ui';

export function ForgeCurve({ id, values, color = FG.gold, height = 92, labels }: { id: string; values: Array<number | null>; color?: string; height?: number; labels?: string[] }) {
  const W = 320;
  const pts = values.map((v, i) => (v == null ? null : { i, v })).filter(Boolean) as Array<{ i: number; v: number }>;
  const lo0 = Math.min(...pts.map((p) => p.v)), hi0 = Math.max(...pts.map((p) => p.v));
  const pad = Math.max((hi0 - lo0) * 0.15, hi0 === lo0 ? Math.max(1, hi0 * 0.05) : 0);
  const lo = lo0 - pad, hi = hi0 + pad;
  const n = Math.max(2, values.length);
  const x = (i: number) => (i / (n - 1)) * (W - 10) + 5;
  const y = (v: number) => height - 5 - ((v - lo) / Math.max(1e-6, hi - lo)) * (height - 12);
  const line = pts.length ? `M${pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' L')}` : '';
  const area = pts.length > 1 ? `${line} L${x(pts[pts.length - 1].i).toFixed(1)},${height} L${x(pts[0].i).toFixed(1)},${height} Z` : '';
  const last = pts[pts.length - 1];
  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`fg-${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.32" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {[0.25, 0.5, 0.75].map((g) => <Line key={g} x1="0" x2={W} y1={height * g} y2={height * g} stroke={FG.line} strokeWidth="1" />)}
        {!!area && <Path d={area} fill={`url(#fg-${id})`} />}
        {!!line && pts.length > 1 && <Path d={line} stroke={color} strokeWidth="2.2" fill="none" strokeLinejoin="round" />}
        {pts.length > 0 && <Circle cx={x(pts[0].i)} cy={y(pts[0].v)} r="2.6" fill={FG.panel} stroke={color} strokeWidth="1.5" />}
        {last && <Circle cx={x(last.i)} cy={y(last.v)} r="4" fill={color} />}
      </Svg>
      {labels && <Axis labels={labels} />}
    </View>
  );
}

/** Barras por semana; `band` = la zona buena (10–20 series por músculo). La última (la actual) va encendida. */
export function ForgeBars({ data, height = 84, color = FG.red, band, max: maxIn }: { data: Array<{ label: string; value: number }>; height?: number; color?: string; band?: [number, number]; max?: number }) {
  const W = 320, slot = W / Math.max(1, data.length), bw = Math.max(3, slot * 0.58);
  const max = Math.max(1, maxIn ?? 0, band ? band[1] * 1.15 : 0, ...data.map((d) => d.value)) * 1.08;
  const y = (v: number) => height - 2 - (v / max) * (height - 6);
  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        {band && <Rect x="0" width={W} y={y(band[1])} height={Math.max(1, y(band[0]) - y(band[1]))} fill={FG.green} opacity={0.09} />}
        {band && <Line x1="0" x2={W} y1={y(band[0])} y2={y(band[0])} stroke={FG.green} strokeOpacity={0.45} strokeWidth="1" strokeDasharray="4,4" />}
        {data.map((d, i) => {
          const cx = slot * i + slot / 2, top = y(d.value);
          return <Rect key={i} x={cx - bw / 2} y={d.value > 0 ? top : height - 4} width={bw} height={d.value > 0 ? Math.max(2, height - 2 - top) : 2} rx={Math.min(3, bw / 3)}
            fill={d.value > 0 ? color : FG.line2} opacity={i === data.length - 1 ? 1 : 0.62} />;
        })}
      </Svg>
      <Axis labels={data.map((d) => d.label)} />
    </View>
  );
}

/** Primera, del medio y última etiqueta bajo el gráfico (texto normal: el SVG estirado deformaría las letras). */
function Axis({ labels }: { labels: string[] }) {
  if (!labels.length) return null;
  const mid = labels.length > 2 ? labels[Math.floor((labels.length - 1) / 2)] : null;
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
      <P size={10.5} color={FG.dim}>{labels[0]}</P>
      {mid ? <P size={10.5} color={FG.dim}>{mid}</P> : null}
      {labels.length > 1 ? <P size={10.5} color={FG.dim}>{labels[labels.length - 1]}</P> : null}
    </Row>
  );
}

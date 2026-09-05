// ============================================================
// Eris Mobile — GlucoseChart
// Gráfica SVG de glucosa con zona de rango normal sombreada
// Usa react-native-svg (ya disponible en Expo)
// ============================================================

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Rect, Line, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { T } from '../../config/design';
import type { GlucoseReading } from '../../services/GlucoService';

const WIDTH = Dimensions.get('window').width - 64;
const HEIGHT = 140;
const PAD = { top: 10, bottom: 24, left: 32, right: 8 };
const CHART_W = WIDTH - PAD.left - PAD.right;
const CHART_H = HEIGHT - PAD.top - PAD.bottom;

const LOW_MG = 70;
const HIGH_MG = 180;
const Y_MIN = 50;
const Y_MAX = 250;

function mgToY(mg: number): number {
  const ratio = 1 - (mg - Y_MIN) / (Y_MAX - Y_MIN);
  return PAD.top + ratio * CHART_H;
}

function idxToX(i: number, total: number): number {
  if (total <= 1) return PAD.left;
  return PAD.left + (i / (total - 1)) * CHART_W;
}

interface Props {
  readings: GlucoseReading[];
}

export default function GlucoseChart({ readings }: Props) {
  const sorted = useMemo(
    () => [...readings].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [readings]
  );

  const pathD = useMemo(() => {
    if (sorted.length === 0) return '';
    return sorted
      .map((r, i) => {
        const x = idxToX(i, sorted.length);
        const y = mgToY(r.value);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [sorted]);

  // Zona normal (70–180)
  const lowY = mgToY(LOW_MG);
  const highY = mgToY(HIGH_MG);

  // Etiquetas Y
  const yLabels = [50, 100, 150, 200, 250];

  // Horas para eje X (mostrar 6h / 12h / 18h / 24h)
  const xLabels = useMemo(() => {
    if (sorted.length === 0) return [];
    const first = new Date(sorted[0].timestamp).getTime();
    const last = new Date(sorted[sorted.length - 1].timestamp).getTime();
    const span = last - first;
    return [0, 0.25, 0.5, 0.75, 1].map((frac) => {
      const ts = new Date(first + frac * span);
      const x = PAD.left + frac * CHART_W;
      const label = ts.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      return { x, label };
    });
  }, [sorted]);

  if (sorted.length === 0) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyText}>Sin historial de lecturas</Text>
      </View>
    );
  }

  return (
    <View>
      <Svg width={WIDTH} height={HEIGHT}>
        <Defs>
          <LinearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={T.accent} stopOpacity="0.8" />
            <Stop offset="1" stopColor={T.accent} stopOpacity="0.1" />
          </LinearGradient>
        </Defs>

        {/* Zona normal sombreada */}
        <Rect
          x={PAD.left}
          y={highY}
          width={CHART_W}
          height={lowY - highY}
          fill={T.green}
          fillOpacity={0.07}
        />

        {/* Líneas horizontales de referencia */}
        {yLabels.map((mg) => {
          const y = mgToY(mg);
          const isRef = mg === LOW_MG || mg === HIGH_MG;
          return (
            <React.Fragment key={mg}>
              <Line
                x1={PAD.left} y1={y} x2={PAD.left + CHART_W} y2={y}
                stroke={isRef ? (mg === LOW_MG ? '#818cf8' : T.red) : T.border}
                strokeWidth={isRef ? 1 : 0.5}
                strokeDasharray={isRef ? '4,4' : undefined}
              />
              <SvgText x={PAD.left - 4} y={y + 4} fontSize={8} fill={T.textMuted} textAnchor="end">
                {mg}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Línea de glucosa */}
        <Path d={pathD} stroke={T.accent} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* Puntos altos/bajos */}
        {sorted.map((r, i) => {
          if (!r.isHigh && !r.isLow) return null;
          const x = idxToX(i, sorted.length);
          const y = mgToY(r.value);
          const col = r.isLow ? '#818cf8' : T.red;
          return <React.Fragment key={i}><Line x1={x} y1={y - 4} x2={x} y2={y + 4} stroke={col} strokeWidth={2} /></React.Fragment>;
        })}

        {/* Etiquetas eje X */}
        {xLabels.map(({ x, label }, i) => (
          <SvgText key={i} x={x} y={HEIGHT - 4} fontSize={8} fill={T.textMuted} textAnchor="middle">
            {label}
          </SvgText>
        ))}
      </Svg>

      {/* Leyenda */}
      <View style={s.legend}>
        <LegendDot color={T.green} label="En rango" />
        <LegendDot color={T.red} label=">180" />
        <LegendDot color="#818cf8" label="<70" />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={s.legendText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { height: HEIGHT, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: T.textMuted, fontSize: 13 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 8, paddingLeft: 32 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 10, color: T.textMuted },
});

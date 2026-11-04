// ============================================================
// Eris Mobile — reloj interno ("Tu día" en Inicio)
//
// Pedido del usuario (2026-10-10): "un reloj interno que se vea en la app". El dial parte cuando despertaste, no a
// medianoche, y pinta el cielo de tu día con las ventanas de comida (services/mealSchedule.ts): dorado pálido al
// despertar, dorado al mediodía, rosado al atardecer, violeta de noche y el sueño en violeta profundo. Lo que ya pasó se
// ve encendido; lo que falta, en el mismo color más tenue. Al centro, la hora de TU día: quien despierta a las 11:25, a
// las 22:10 del reloj está en sus ~20:20.
//
// Inicio más simple (mismo día): es el protagonista de Inicio y lleva el puntaje del día en su cabecera (antes era otra
// tarjeta, "Score Ejecutivo · Fijo · Dinámico"). Debajo, una sola línea: en qué comida estás y cuál sigue. Lo que toca
// hacer va en la tarjeta "Ahora" y los números del día en los chips.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { T, R } from '../config/design';
import { fmtHour, hourOf } from '../services/mealSchedule';
import { SNACK, MEAL_TITLE, type DayModel } from './home/dayModel';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** El cielo del día, de la mañana a la noche (las colaciones van más delgadas). */
export const SKY: Record<string, string> = {
  desayuno: '#fcd34d', colacion_am: '#fbbf24', almuerzo: '#f59e0b', colacion_pm: '#fb923c', once: '#fb7185', cena: '#a78bfa',
};
const SLEEP = '#6d28d9';

const SIZE = 290;
const C = SIZE / 2;
const RING = 98;
const LABEL = RING + 24;
const W = 14;
const W_SNACK = 8;
const INNER = RING - 15;

const pt = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
};
const arc = (r: number, d1: number, d2: number) => {
  const a = pt(r, d1), b = pt(r, Math.min(d2, d1 + 359.99));
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)} A${r},${r} 0 ${d2 - d1 > 180 ? 1 : 0} 1 ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
};
/** Horas desde el despertar → grados (0 arriba, en el sentido del reloj). */
const deg = (relH: number) => (relH / 24) * 360;
export const durTxt = (h: number) => {
  const m = Math.max(0, Math.round(h * 60));
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
};

/** El puntaje del día en palabras simples (antes: "Score Ejecutivo · Óptimo / Crítico"). */
const scoreWord = (s: number) => (s >= 75 ? 'muy bien' : s >= 50 ? 'bien' : s >= 25 ? 'regular' : 'bajo');
const scoreColor = (s: number) => (s >= 75 ? T.green : s >= 50 ? T.gold : T.red);

export default function InternalClock({ m, score, onScorePress }: { m: DayModel; score: number | null; onScorePress?: () => void }) {
  const sweep = useRef(new Animated.Value(0)).current;
  const [sweepV, setSweepV] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;

  // El día se "enciende" desde el despertar hasta ahora al aparecer, y el punto de ahora late suave
  useEffect(() => {
    const id = sweep.addListener(({ value }) => setSweepV(value));
    Animated.timing(sweep, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.delay(400),
      Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: false }),
    ]));
    loop.start();
    return () => { sweep.removeListener(id); loop.stop(); };
  }, []);

  const shown = Math.min(m.relNow, m.awake) * sweepV; // lo transcurrido, con la animación de entrada
  const nowPt = pt(RING, deg(m.asleepNow ? m.relNow : shown));
  const bedPt = pt(LABEL, deg(m.awake));
  const wakePt = pt(LABEL, 0);
  const mealRel = m.meals.map((x) => (((hourOf(x.at) - m.wake) % 24) + 24) % 24).filter((r) => r <= m.awake + 1);

  const line = m.asleepNow
    ? `Pasaste tu hora habitual de dormir (${fmtHour(m.wake + m.awake)})`
    : [
        m.current ? `${MEAL_TITLE[m.current.s]} ${m.current.s === 'cena' ? `desde las ${fmtHour(m.wake + m.current.a)}` : `hasta las ${fmtHour(m.wake + m.current.b)}`}` : 'Entre comidas',
        m.next ? `luego ${MEAL_TITLE[m.next.s].toLowerCase()} ${fmtHour(m.wake + m.next.a)}` : `dormir ~${fmtHour(m.wake + m.awake)}`,
      ].join(' · ');

  return (
    <View style={st.card}>
      <View style={st.header}>
        <Text style={st.title}>TU DÍA</Text>
        {score != null ? (
          <TouchableOpacity onPress={onScorePress} activeOpacity={0.7} style={[st.pill, { borderColor: scoreColor(score) + '55', backgroundColor: scoreColor(score) + '18' }]}>
            <Text style={[st.pillNum, { color: scoreColor(score) }]}>{score}</Text>
            <Text style={[st.pillText, { color: scoreColor(score) }]}>{scoreWord(score)}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={st.dialWrap}>
        <Svg width={SIZE} height={SIZE}>
          {/* Pista */}
          <Circle cx={C} cy={C} r={RING} stroke="rgba(255,255,255,0.05)" strokeWidth={W} fill="none" />
          {/* Marcas de cada hora del reloj (más largas cada 6 h) */}
          {Array.from({ length: 24 }, (_, h) => {
            const d = deg((((h - m.wake) % 24) + 24) % 24);
            const major = h % 6 === 0;
            const a = pt(RING + W / 2 + 3, d), b = pt(RING + W / 2 + (major ? 9 : 6), d);
            return <Path key={`t${h}`} d={`M${a.x},${a.y} L${b.x},${b.y}`} stroke={major ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)'} strokeWidth={major ? 1.5 : 1} />;
          })}
          {/* Sueño */}
          <Path d={arc(RING, deg(m.awake) + 0.8, 360 - 0.8)} stroke={SLEEP} strokeOpacity={0.55} strokeWidth={W} fill="none" />
          {/* Ventanas de comida: el cielo del día. Lo que ya pasó, encendido; lo que falta, en el mismo color atenuado */}
          {m.segs.map((x) => {
            const w = SNACK.has(x.s) ? W_SNACK : W;
            const a = deg(x.a) + 0.8, b = deg(x.b) - 0.8, cut = deg(shown);
            return (
              <React.Fragment key={x.s}>
                {cut > a + 0.3 && <Path d={arc(RING, a, Math.min(b, cut))} stroke={SKY[x.s]} strokeWidth={w} fill="none" />}
                {cut < b - 0.3 && <Path d={arc(RING, Math.max(a, cut), b)} stroke={SKY[x.s]} strokeOpacity={0.26} strokeWidth={w} fill="none" />}
              </React.Fragment>
            );
          })}
          {/* Tu día transcurrido y lo que comiste */}
          {shown > 0.05 && <Path d={arc(INNER, 0, deg(shown))} stroke={T.accent} strokeOpacity={0.75} strokeWidth={2} strokeLinecap="round" fill="none" />}
          <Circle cx={C} cy={C} r={INNER} stroke="rgba(255,255,255,0.04)" strokeWidth={2} fill="none" />
          {mealRel.map((r, i) => {
            const p = pt(INNER, deg(r));
            return <Circle key={`m${i}`} cx={p.x} cy={p.y} r={3.6} fill={T.text} stroke={T.bgCard} strokeWidth={1.5} />;
          })}
          {/* Despertar y dormir */}
          <SvgText x={wakePt.x} y={wakePt.y + 4} fill={T.textLight} fontSize={11} fontWeight="700" textAnchor="middle">{`☀ ${fmtHour(m.wake)}`}</SvgText>
          <SvgText x={bedPt.x} y={bedPt.y + 4} fill={T.textLight} fontSize={11} fontWeight="700" textAnchor="middle">{`☾ ${fmtHour(m.wake + m.awake)}`}</SvgText>
          {/* Ahora */}
          <AnimatedCircle
            cx={nowPt.x} cy={nowPt.y}
            r={pulse.interpolate({ inputRange: [0, 1], outputRange: [7, 17] }) as any}
            fill={T.accent}
            opacity={pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }) as any}
          />
          <Circle cx={nowPt.x} cy={nowPt.y} r={6.5} fill={T.accent} stroke={T.bgCard} strokeWidth={2.5} />
        </Svg>
        {/* Al centro, en qué parte de TU día estás (por las horas que llevas despierto) y la hora de verdad. Antes era "la hora
            de tu día" (10:20 a los 19 minutos de despertar): dos horas distintas a la vista confundían (2026-10-11). */}
        <View style={st.center} pointerEvents="none">
          <Text style={st.time}>{m.phase.charAt(0).toUpperCase() + m.phase.slice(1)}</Text>
          <Text style={st.timeLabel}>{m.phase === 'hora de dormir' ? 'según tu horario' : 'de tu día'}</Text>
          {m.known && m.wokeToday && !m.asleepNow && <Text style={st.awake}>despierto hace {durTxt(m.relNow)}</Text>}
          <Text style={st.clockTime}>son las {fmtHour(hourOf(m.now))}</Text>
        </View>
      </View>

      <View style={st.row}>
        <View style={[st.dot, { backgroundColor: m.current ? SKY[m.current.s] : SLEEP }]} />
        <Text style={st.rowText} numberOfLines={2}>{line}</Text>
      </View>

      {!m.known && (
        <Text style={st.note}>Sin datos de sueño uso un día de 7:30 a 23:30. Puedes fijar tu horario en Perfil.</Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: T.bgCard, borderRadius: R.xl, padding: 18,
    borderWidth: 1, borderColor: T.border, marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: T.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  pill: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: R.full, borderWidth: 1,
  },
  pillNum: { fontSize: 15, fontWeight: '900' },
  pillText: { fontSize: 11, fontWeight: '700' },
  dialWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  center: { position: 'absolute', alignItems: 'center' },
  time: { color: T.text, fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  timeLabel: { color: T.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: -2 },
  clockTime: { color: T.textMuted, fontSize: 11, fontWeight: '600', marginTop: 4 },
  awake: { color: '#c4b5fd', fontSize: 11, fontWeight: '600', marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, color: T.textLight, fontSize: 13, fontWeight: '600' },
  note: { color: T.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 10 },
});

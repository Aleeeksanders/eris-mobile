// ============================================================
// Forge — tu avatar vectorial (fase I9, 2026-10-23). Decisión del usuario: una figura dibujada por la app (no PixAI).
// La pose es la de tu disciplina (avatarPose.POSES). El cuerpo va en un tono neutro y cada músculo (el «vientre» de
// brazos y piernas, pectorales, abdominales y hombros) en el color de su nivel, los mismos del mapa muscular. El aura es
// la de tu rango y cada clase suma lo suyo: guantes (boxeo, muay thai), mongkol (muay thai), cinturón del color de tu
// rango (karate, taekwondo), muñequeras (calistenia), zapatillas (parkour) y la estela del movimiento.
// ============================================================
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Ellipse, Circle, Line, Path, Rect, G } from 'react-native-svg';
import * as C from '../../services/forge/forgeCore';
import { classById } from '../../services/forge/forgeSkillsExt';
import { FG } from './theme';
import { PART_SUBS, poseOf, skeleton, type Part, type Pt } from './avatarPose';
import { smooth } from './muscleGeometry';

const levelColor = (lvl: number) => (lvl >= 10 ? FG.gold : lvl >= 6 ? FG.red : lvl >= 3 ? FG.coral : '#5d5568');
const TIER_AURA: Record<string, string> = { T1: '#6f6878', T2: '#9b93a5', T3: FG.blue, T4: FG.coral, T5: FG.gold };
/** El cinturón según el rango: blanco, amarillo, verde, café y negro */
const BELT: Record<string, string> = { T1: '#f2efe9', T2: '#f5c542', T3: '#3ddc97', T4: '#8b5a2b', T5: '#111014' };
const BODY = '#3a3342', BODY_FAR = '#2b2531', OUTLINE = '#0c0b0e';
/** El torso en su propio eje (la cadera en 0,0 y el cuello en 0,−58): espalda en V. */
const TORSO_SHAPE: Pt[] = [[-15, -51], [15, -51], [17, -38], [11, -14], [10, 0], [-10, 0], [-11, -14], [-17, -38]];

export default function ForgeAvatar({ S, cls, tier, size = 200 }: { S: C.ForgeState; cls: string | null; tier: string; size?: number }) {
  const pose = poseOf(cls);
  const sk = useMemo(() => skeleton(pose), [pose]);
  const { subL } = C.groupLevels(S);
  const lvlOf = (subs: string[]) => (subs.length ? subs.reduce((a, id) => a + (subL?.[id]?.level ?? 1), 0) / subs.length : 1);
  const colorOf = (subs: string[]) => levelColor(lvlOf(subs));
  const color = (part: Part | 'torso' | 'shoulder') => colorOf(PART_SUBS[part]);
  const c = classById(cls ?? '');
  const accent = c?.color ?? FG.red;
  const aura = TIER_AURA[tier] ?? FG.dim;
  const gloves = cls === 'boxeo' || cls === 'muay_thai';
  const belt = cls === 'karate' || cls === 'taekwondo';
  const shoes = cls === 'parkour';
  const wrist = cls === 'calistenia';
  const H = (size * 240) / 200;
  const mid = (a: Pt, b: Pt, k: number): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const label = `Tu avatar${c ? ` en pose de ${c.name}` : ''}: los músculos van del gris al dorado según su nivel.`;
  const hipMid: Pt = [(sk.hipN[0] + sk.hipF[0]) / 2, (sk.hipN[1] + sk.hipF[1]) / 2];
  // rotate(180 − θ) lleva el «arriba» del torso local a la dirección del torso de la pose
  const torsoTf = `translate(${hipMid[0]} ${hipMid[1]}) rotate(${180 - pose.torso})`;

  const limb = (s: (typeof sk.segs)[number]) => {
    const foot = s.part.startsWith('foot');
    const body = s.near ? BODY : BODY_FAR;
    const [m1, m2] = [mid(s.a, s.b, 0.16), mid(s.a, s.b, 0.8)];
    return (
      <G key={s.part}>
        <Line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={OUTLINE} strokeWidth={s.w + 3} strokeLinecap="round" />
        <Line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={foot && shoes ? accent : body} strokeWidth={s.w} strokeLinecap="round" />
        {!foot && (
          <>
            <Line x1={m1[0]} y1={m1[1]} x2={m2[0]} y2={m2[1]} stroke={color(s.part)} strokeWidth={s.w * 0.64} strokeLinecap="round" opacity={s.near ? 0.95 : 0.6} />
            <Line x1={mid(s.a, s.b, 0.24)[0]} y1={mid(s.a, s.b, 0.24)[1]} x2={mid(s.a, s.b, 0.6)[0]} y2={mid(s.a, s.b, 0.6)[1]} stroke="#ffffff" strokeWidth={Math.max(1, s.w * 0.16)} strokeLinecap="round" opacity={s.near ? 0.22 : 0.1} />
          </>
        )}
      </G>
    );
  };
  const far = sk.segs.filter((s) => !s.near);
  const near = sk.segs.filter((s) => s.near);
  const ground = pose.ground;
  const cx = (sk.ankleN[0] + sk.ankleF[0]) / 2;
  const pec = colorOf(['pec_med', 'pec_sup']), abs = colorOf(['abs', 'oblicuos']), lat = colorOf(['dorsal']);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: H }}>
      <Svg width={size} height={H} viewBox="0 0 200 240">
        <Defs>
          <RadialGradient id="aura" cx="50%" cy="45%" r="50%">
            <Stop offset="0" stopColor={aura} stopOpacity="0.38" />
            <Stop offset="1" stopColor={aura} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={100} cy={118} rx={92} ry={108} fill="url(#aura)" />
        <Ellipse cx={pose.air ? sk.hipN[0] : cx} cy={ground + 2} rx={pose.air ? 26 : 38} ry={pose.air ? 3 : 4.5} fill="#000" opacity={pose.air ? 0.28 : 0.45} />
        <Line x1={20} y1={ground + 2} x2={180} y2={ground + 2} stroke={FG.line2} strokeWidth={1} opacity={0.5} />
        <Motion kind={pose.motion} sk={sk} color={accent} />
        {far.map(limb)}
        <Circle cx={sk.shoulderF[0]} cy={sk.shoulderF[1]} r={8} fill={BODY_FAR} stroke={OUTLINE} strokeWidth={1.5} />
        <Circle cx={sk.shoulderF[0]} cy={sk.shoulderF[1]} r={5.5} fill={color('shoulder')} opacity={0.6} />
        {/* cuello y cabeza */}
        <Line x1={sk.neck[0]} y1={sk.neck[1]} x2={sk.head.c[0]} y2={sk.head.c[1]} stroke={OUTLINE} strokeWidth={11} strokeLinecap="round" />
        <Line x1={sk.neck[0]} y1={sk.neck[1]} x2={sk.head.c[0]} y2={sk.head.c[1]} stroke={BODY} strokeWidth={8} strokeLinecap="round" />
        <Circle cx={sk.head.c[0]} cy={sk.head.c[1]} r={sk.head.r} fill={BODY} stroke={OUTLINE} strokeWidth={2} />
        {cls === 'muay_thai' && <Circle cx={sk.head.c[0]} cy={sk.head.c[1]} r={sk.head.r - 1.5} fill="none" stroke={accent} strokeWidth={3} strokeDasharray="12 40" />}
        {/* torso: espalda en V, dorsales, pectorales y abdominales en el color de su nivel */}
        <G transform={torsoTf}>
          <Path d={smooth(TORSO_SHAPE)} fill={BODY} stroke={OUTLINE} strokeWidth={2.5} />
          <Path d={smooth([[-16, -40], [-11, -20], [-9, -30]])} fill={lat} opacity={0.45} />
          <Path d={smooth([[16, -40], [11, -20], [9, -30]])} fill={lat} opacity={0.45} />
          <Ellipse cx={-6.5} cy={-41} rx={7} ry={5.2} fill={pec} opacity={0.92} />
          <Ellipse cx={6.5} cy={-41} rx={7} ry={5.2} fill={pec} opacity={0.92} />
          <Rect x={-5.5} y={-33} width={11} height={27} rx={3.5} fill={abs} opacity={0.92} />
          {[-24, -17, -11].map((y) => <Line key={y} x1={-5.5} y1={y} x2={5.5} y2={y} stroke={OUTLINE} strokeWidth={1} opacity={0.6} />)}
          <Line x1={0} y1={-33} x2={0} y2={-6} stroke={OUTLINE} strokeWidth={1} opacity={0.6} />
        </G>
        {near.map(limb)}
        {/* el cinturón va encima de las piernas */}
        {belt && (
          <G transform={torsoTf}>
            <Rect x={-12} y={-4} width={24} height={5.5} rx={2} fill={BELT[tier] ?? BELT.T1} stroke={OUTLINE} strokeWidth={1} />
            <Line x1={3} y1={1.5} x2={7} y2={10} stroke={BELT[tier] ?? BELT.T1} strokeWidth={3} strokeLinecap="round" />
          </G>
        )}
        <Circle cx={sk.shoulderN[0]} cy={sk.shoulderN[1]} r={9} fill={BODY} stroke={OUTLINE} strokeWidth={1.5} />
        <Circle cx={sk.shoulderN[0]} cy={sk.shoulderN[1]} r={6.5} fill={color('shoulder')} opacity={0.95} />
        {gloves && [sk.handF, sk.handN].map((h, i) => <Circle key={`g${i}`} cx={h[0]} cy={h[1]} r={7} fill={accent} stroke={OUTLINE} strokeWidth={1.5} opacity={i ? 1 : 0.65} />)}
        {wrist && [sk.handF, sk.handN].map((h, i) => <Circle key={`w${i}`} cx={h[0]} cy={h[1]} r={4.5} fill="none" stroke={accent} strokeWidth={2.5} opacity={i ? 1 : 0.65} />)}
      </Svg>
    </View>
  );
}

/** Las líneas de movimiento de cada disciplina (en el color de la clase). */
function Motion({ kind, sk, color }: { kind: string | null | undefined; sk: ReturnType<typeof skeleton>; color: string }) {
  if (!kind) return null;
  if (kind === 'golpe') {
    const [x, y] = sk.handN;
    return <G opacity={0.55}>{[-6, 0, 6].map((d) => <Line key={d} x1={x - 34} y1={y + d} x2={x - 14} y2={y + d} stroke={color} strokeWidth={2} strokeLinecap="round" />)}</G>;
  }
  if (kind === 'patada') {
    const [x, y] = sk.ankleN;
    return <Path d={`M ${x - 46} ${y + 30} Q ${x - 30} ${y - 10} ${x + 4} ${y - 6}`} stroke={color} strokeWidth={3} fill="none" opacity={0.45} strokeLinecap="round" />;
  }
  if (kind === 'giro') {
    const [x, y] = sk.hipN;
    return <G opacity={0.45}><Path d={`M ${x - 54} ${y} A 54 22 0 1 0 ${x + 54} ${y}`} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" /><Path d={`M ${x - 40} ${y - 30} A 42 16 0 0 1 ${x + 38} ${y - 34}`} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" /></G>;
  }
  // salto: la trayectoria
  const [x, y] = sk.hipN;
  return <Path d={`M ${x - 70} ${y + 70} Q ${x - 40} ${y - 10} ${x} ${y}`} stroke={color} strokeWidth={2.5} fill="none" strokeDasharray="6 6" opacity={0.5} strokeLinecap="round" />;
}

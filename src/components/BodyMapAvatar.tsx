import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect, G } from 'react-native-svg';
import { T, R, S } from '../config/design';

// ─── Avatar image map ─────────────────────────────────────────────────────────
// Agregar cada imagen generada en PixAI acá. require() necesita paths estáticos.
// Naming: {sex}_{tier}_{clase}_{vista}
// Tamaño: 768×1152 px, fondo #0c0b0e, full body centrado.
const AVATAR_IMGS: Record<string, ReturnType<typeof require>> = {
  // base masculino
  // h_T1_base_front: require('../../assets/avatars/h_T1_base_front.png'),
  // h_T1_base_back:  require('../../assets/avatars/h_T1_base_back.png'),
  // h_T2_base_front: require('../../assets/avatars/h_T2_base_front.png'),
  // h_T2_base_back:  require('../../assets/avatars/h_T2_base_back.png'),
  // h_T3_base_front: require('../../assets/avatars/h_T3_base_front.png'),
  // h_T3_base_back:  require('../../assets/avatars/h_T3_base_back.png'),
  // h_T4_base_front: require('../../assets/avatars/h_T4_base_front.png'),
  // h_T4_base_back:  require('../../assets/avatars/h_T4_base_back.png'),
  // h_T5_base_front: require('../../assets/avatars/h_T5_base_front.png'),
  // h_T5_base_back:  require('../../assets/avatars/h_T5_base_back.png'),
  // base femenino
  m_T1_base_front: require('../../assets/avatars/m_T1_base_front.png'),
  // ... etc
};

function avatarSource(sex: string, tier: string, classId: string, view: string) {
  const key = `${sex}_${tier}_${classId}_${view}`;
  return AVATAR_IMGS[key] ?? null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type BodyZone =
  | 'cabeza' | 'cuello' | 'hombros' | 'pecho'
  | 'abdomen' | 'brazos' | 'piernas' | 'espalda';

export type ZoneStatus = {
  color?: string;
  alert?: boolean;
  label?: string;
  value?: string;
};

type Props = {
  sex?: 'h' | 'm';
  tier?: 'T1' | 'T2' | 'T3' | 'T4' | 'T5';
  classId?: string;
  zones?: Partial<Record<BodyZone, ZoneStatus>>;
  onZonePress?: (zone: BodyZone) => void;
  width?: number;
  accentColor?: string;
};

// ─── Zone layout (in viewBox 0 0 100 220) ────────────────────────────────────

type ZoneDef = {
  id: BodyZone;
  label: string;
  shape: 'circle' | 'ellipse' | 'rect' | 'path';
  props: Record<string, number | string>;
};

const ZONES: ZoneDef[] = [
  {
    id: 'cabeza',
    label: 'Cabeza',
    shape: 'circle',
    props: { cx: 50, cy: 17, r: 15 },
  },
  {
    id: 'cuello',
    label: 'Cuello',
    shape: 'rect',
    props: { x: 42, y: 32, width: 16, height: 10, rx: 4 },
  },
  {
    id: 'hombros',
    label: 'Hombros',
    shape: 'path',
    props: { d: 'M27,41 Q18,38 12,46 L14,60 Q22,56 28,54 L28,41 Z M73,41 Q82,38 88,46 L86,60 Q78,56 72,54 L72,41 Z' },
  },
  {
    id: 'pecho',
    label: 'Pecho',
    shape: 'path',
    props: { d: 'M28,41 Q50,37 72,41 L70,72 Q50,78 30,72 Z' },
  },
  {
    id: 'brazos',
    label: 'Brazos',
    shape: 'path',
    props: { d: 'M12,46 L8,88 L22,90 L26,54 Z M88,46 L92,88 L78,90 L74,54 Z' },
  },
  {
    id: 'abdomen',
    label: 'Abdomen',
    shape: 'rect',
    props: { x: 31, y: 72, width: 38, height: 34, rx: 4 },
  },
  {
    id: 'piernas',
    label: 'Piernas',
    shape: 'path',
    props: { d: 'M31,108 L28,180 L46,180 L50,130 L54,180 L72,180 L69,108 Z' },
  },
];

// ─── Silhouette (background body shape) ──────────────────────────────────────

const SILHOUETTE_COLOR = 'rgba(255,255,255,0.06)';
const SILHOUETTE_STROKE = 'rgba(255,255,255,0.12)';

function Silhouette() {
  return (
    <G>
      {/* head */}
      <Circle cx={50} cy={17} r={13} fill={SILHOUETTE_COLOR} stroke={SILHOUETTE_STROKE} strokeWidth={1} />
      {/* neck */}
      <Rect x={43} y={29} width={14} height={12} rx={4} fill={SILHOUETTE_COLOR} />
      {/* torso */}
      <Path
        d="M28,40 Q18,37 12,45 L8,88 L22,90 L26,106 Q38,112 50,112 Q62,112 74,106 L78,90 L92,88 L88,45 Q82,37 72,40 Q50,35 28,40 Z"
        fill={SILHOUETTE_COLOR}
        stroke={SILHOUETTE_STROKE}
        strokeWidth={1}
      />
      {/* chest line hint */}
      <Path d="M50,42 L50,72" stroke={SILHOUETTE_STROKE} strokeWidth={0.8} />
      <Path d="M30,72 L70,72" stroke={SILHOUETTE_STROKE} strokeWidth={0.8} />
      {/* abs grid hint */}
      <Path d="M38,82 L62,82 M38,92 L62,92" stroke={SILHOUETTE_STROKE} strokeWidth={0.6} />
      <Path d="M50,72 L50,106" stroke={SILHOUETTE_STROKE} strokeWidth={0.8} />
      {/* legs */}
      <Path
        d="M26,106 L22,180 L46,182 L50,140 L54,182 L78,180 L74,106 Q50,114 26,106 Z"
        fill={SILHOUETTE_COLOR}
        stroke={SILHOUETTE_STROKE}
        strokeWidth={1}
      />
      {/* knee caps */}
      <Ellipse cx={36} cy={152} rx={7} ry={5} fill="rgba(255,255,255,0.04)" stroke={SILHOUETTE_STROKE} strokeWidth={0.6} />
      <Ellipse cx={64} cy={152} rx={7} ry={5} fill="rgba(255,255,255,0.04)" stroke={SILHOUETTE_STROKE} strokeWidth={0.6} />
      {/* feet */}
      <Ellipse cx={33} cy={182} rx={9} ry={4} fill={SILHOUETTE_COLOR} />
      <Ellipse cx={67} cy={182} rx={9} ry={4} fill={SILHOUETTE_COLOR} />
    </G>
  );
}

// ─── Zone shape renderer ──────────────────────────────────────────────────────

function ZoneShape({ zone, fill, stroke }: { zone: ZoneDef; fill: string; stroke: string }) {
  const p = zone.props;
  if (zone.shape === 'circle')
    return <Circle cx={p.cx as number} cy={p.cy as number} r={p.r as number} fill={fill} stroke={stroke} strokeWidth={1} />;
  if (zone.shape === 'ellipse')
    return <Ellipse cx={p.cx as number} cy={p.cy as number} rx={p.rx as number} ry={p.ry as number} fill={fill} stroke={stroke} strokeWidth={1} />;
  if (zone.shape === 'rect')
    return <Rect x={p.x as number} y={p.y as number} width={p.width as number} height={p.height as number} rx={p.rx as number} fill={fill} stroke={stroke} strokeWidth={1} />;
  return <Path d={p.d as string} fill={fill} stroke={stroke} strokeWidth={1} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BodyMapAvatar({
  sex = 'h',
  tier = 'T1',
  classId = 'base',
  zones = {},
  onZonePress,
  width = 160,
  accentColor = T.accent,
}: Props) {
  const height = Math.round(width * 2.1);

  const [showBack, setShowBack] = useState(false);
  const [activeZone, setActiveZone] = useState<BodyZone | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const imgSource = avatarSource(sex, tier, classId, showBack ? 'back' : 'front');

  // Pulse loop for alert zones
  useEffect(() => {
    const hasAlert = Object.values(zones).some(z => z?.alert);
    if (!hasAlert) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [zones]);

  const handlePress = (zone: BodyZone) => {
    setActiveZone(prev => (prev === zone ? null : zone));
    onZonePress?.(zone);
  };

  const activeStatus = activeZone ? zones[activeZone] : null;

  return (
    <View style={{ alignItems: 'center', gap: S.sm }}>
      {/* Body */}
      <View style={{ width, height }}>
        {/* PixAI image — se muestra cuando el asset existe */}
        {imgSource && (
          <Image
            source={imgSource}
            style={{ position: 'absolute', width, height, borderRadius: R.md }}
            resizeMode="cover"
          />
        )}

        <Svg width={width} height={height} viewBox="0 0 100 210">
          {/* silhouette sólo si no hay imagen */}
          {!imgSource && <Silhouette />

          }

          {/* coloured zones */}
          {ZONES.map(zone => {
            const status = zones[zone.id];
            const isActive = activeZone === zone.id;
            const hasAlert = status?.alert;
            const zoneColor = status?.color ?? (status ? accentColor : 'transparent');
            const fill = zoneColor === 'transparent'
              ? 'rgba(255,255,255,0.03)'
              : zoneColor + (isActive ? 'cc' : hasAlert ? '80' : '50');
            const stroke = zoneColor === 'transparent'
              ? 'rgba(255,255,255,0.06)'
              : zoneColor + (isActive ? 'ff' : '90');

            return (
              <G key={zone.id} onPress={() => handlePress(zone.id)}>
                <ZoneShape zone={zone} fill={fill} stroke={stroke} />
              </G>
            );
          })}
        </Svg>

        {/* pulse overlay for alert zones */}
        {Object.entries(zones).filter(([, s]) => s?.alert).map(([id]) => {
          const zone = ZONES.find(z => z.id === id);
          if (!zone) return null;
          const color = zones[id as BodyZone]?.color ?? T.red;
          return (
            <Animated.View
              key={id}
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { opacity: pulseAnim }]}
            >
              <Svg width={width} height={height} viewBox="0 0 100 210">
                <ZoneShape zone={zone} fill={color + '30'} stroke={color + '80'} />
              </Svg>
            </Animated.View>
          );
        })}
      </View>

      {/* frente / espalda toggle — solo si hay imagen */}
      {imgSource && (
        <View style={styles.toggleRow}>
          {(['front', 'back'] as const).map(v => (
            <Text
              key={v}
              onPress={() => { setShowBack(v === 'back'); setActiveZone(null); }}
              style={[styles.toggleBtn, (showBack ? v === 'back' : v === 'front') && { color: accentColor }]}
            >
              {v === 'front' ? 'FRENTE' : 'ESPALDA'}
            </Text>
          ))}
        </View>
      )}

      {/* zone info bar */}
      <View style={[styles.infoBar, activeStatus && { borderColor: (activeStatus.color ?? accentColor) + '60' }]}>
        {activeZone && activeStatus ? (
          <>
            <View style={[styles.dot, { backgroundColor: activeStatus.color ?? accentColor }]} />
            <Text style={styles.infoLabel}>
              {ZONES.find(z => z.id === activeZone)?.label}
              {activeStatus.label ? ` · ${activeStatus.label}` : ''}
            </Text>
            {activeStatus.value && (
              <Text style={[styles.infoValue, { color: activeStatus.color ?? accentColor }]}>
                {activeStatus.value}
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.infoHint}>Toca una zona del cuerpo</Text>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.xs,
    paddingHorizontal: S.md,
    paddingVertical: S.xs,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.bgCard,
    minWidth: 180,
    justifyContent: 'center',
    minHeight: 34,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  infoLabel: {
    fontFamily: 'System',
    fontSize: 12,
    color: T.text,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  infoHint: {
    fontFamily: 'System',
    fontSize: 11,
    color: T.textMuted,
    letterSpacing: 0.3,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: S.md,
  },
  toggleBtn: {
    fontFamily: 'System',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: T.textMuted,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
});

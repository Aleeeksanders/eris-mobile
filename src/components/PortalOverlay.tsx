import React, { useRef, useEffect, useCallback } from 'react';
import { StyleSheet, Animated, Dimensions, Easing, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('window');
const MAX = Math.ceil(Math.sqrt(W * W + H * H) * 1.08);

const CYAN   = '#22d3ee';
const VIOLET = '#7c3aed';
const WHITE  = 'rgba(255,255,255,0.95)';

// ─── AXS Logo ─────────────────────────────────────────────────
const AXS_W  = 240;
const AXS_H  = 230;
const CX     = 120;
const CY     = 105;
const R      = 82;
const CIRC   = 2 * Math.PI * R;
const DASH   = CIRC * 0.875;
const GAP    = CIRC * 0.125;
const GAP_X = 178;
const GAP_Y = 47;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Burst rings ──────────────────────────────────────────────
const N             = 5;
const RING_COLORS   = [CYAN, '#a5f3fc', WHITE, VIOLET, '#4c1d95'];
const RING_WIDTHS   = [1.2, 0.8, 1.8, 1.0, 0.6];
const RING_PEAK_A   = [0.92, 0.70, 1.0, 0.60, 0.36];
const RING_DELAY_IN = [0, 50, 95, 145, 190];
const RING_DELAY_OUT= [0, 50, 100];
const RING_TENSION  = [320, 290, 260, 240, 220];
const RING_FRICTION = [22, 19, 17, 15, 14];

// ─── Pixel constellation ──────────────────────────────────────
interface DotCfg { top: number; left: number; w: number; h: number }
const DOT_CONFIGS: DotCfg[] = [
  { top: GAP_Y - 4,  left: GAP_X + 2,  w: 15, h: 15 },
  { top: GAP_Y - 19, left: GAP_X + 16, w: 11, h: 11 },
  { top: GAP_Y - 32, left: GAP_X + 28, w:  8, h:  8 },
  { top: GAP_Y - 42, left: GAP_X + 38, w:  6, h:  6 },
  { top: GAP_Y + 12, left: GAP_X + 17, w:  5, h:  5 },
  { top: GAP_Y + 22, left: GAP_X + 28, w:  4, h:  4 },
];

interface SatCfg { top: number; left: number; w: number; h: number; maxA: number }
const SAT_CONFIGS: SatCfg[] = [
  { top: 173, left: 77,  w: 5, h: 5, maxA: 0.42 },
  { top:  61, left: 47,  w: 4, h: 4, maxA: 0.35 },
  { top: 143, left: 189, w: 4, h: 4, maxA: 0.38 },
];

interface SparkCfg { dx: number; dy: number; w: number; h: number }
const SPARK_CONFIGS: SparkCfg[] = [
  { dx: 21, dy: -27, w: 5, h: 5 },
  { dx: 34, dy:  -9, w: 4, h: 4 },
  { dx: 29, dy:  18, w: 5, h: 5 },
  { dx:  9, dy: -38, w: 3, h: 3 },
  { dx: -9, dy: -29, w: 4, h: 4 },
  { dx: 38, dy:   8, w: 3, h: 3 },
];

// Interpolation helpers
const mkDotScale = (anim: Animated.Value) =>
  anim.interpolate({ inputRange: [0, 0.55, 0.78, 0.92, 1], outputRange: [0, 1.35, 0.88, 1.07, 1] });

const mkDotOpacity = (anim: Animated.Value) =>
  anim.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0, 1, 1] });

const mkSparkOpacity = (anim: Animated.Value) =>
  anim.interpolate({ inputRange: [0, 0.12, 0.55, 1], outputRange: [0, 1, 0.6, 0] });

const mkSparkTX = (anim: Animated.Value, dx: number) =>
  anim.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });

const mkSparkTY = (anim: Animated.Value, dy: number) =>
  anim.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });

export type PortalPhase = 'hidden' | 'entering' | 'open' | 'exiting';

interface Props {
  phase: PortalPhase;
  onEnterComplete?: () => void;
  onExitComplete?: () => void;
  children: React.ReactNode;
  label?: string;
  presentOnly?: boolean;
}

export function PortalOverlay({ phase, onEnterComplete, onExitComplete, children, label, presentOnly }: Props) {
  // Burst layer
  const rScale   = useRef(Array.from({ length: N }, () => new Animated.Value(0))).current;
  const rAlpha   = useRef(Array.from({ length: N }, () => new Animated.Value(0))).current;
  const overlay  = useRef(new Animated.Value(0)).current;
  const shimmer  = useRef(new Animated.Value(0)).current;
  const scanA    = useRef(new Animated.Value(0)).current;
  const scanY    = useRef(new Animated.Value(0)).current;
  const irisA    = useRef(new Animated.Value(0)).current;
  const irisS    = useRef(new Animated.Value(0)).current;
  const flash    = useRef(new Animated.Value(0)).current;
  const contentA = useRef(new Animated.Value(0)).current;
  const contentS = useRef(new Animated.Value(0.93)).current;

  // AXS logo layer
  const logoA        = useRef(new Animated.Value(0)).current;
  const circleOffset = useRef(new Animated.Value(DASH)).current;
  const axsA         = useRef(new Animated.Value(0)).current;
  const axsS         = useRef(new Animated.Value(0.82)).current;
  const subA         = useRef(new Animated.Value(0)).current;
  const labelA       = useRef(new Animated.Value(0)).current;

  // Pixel constellation
  const dotAnims   = useRef(DOT_CONFIGS.map(() => new Animated.Value(0))).current;
  const satAnims   = useRef(SAT_CONFIGS.map(() => new Animated.Value(0))).current;
  const sparkAnims = useRef(SPARK_CONFIGS.map(() => new Animated.Value(0))).current;

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const resetAll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    rScale.forEach(v => v.setValue(0));
    rAlpha.forEach(v => v.setValue(0));
    overlay.setValue(0); shimmer.setValue(0);
    scanA.setValue(0); scanY.setValue(0);
    irisA.setValue(0); irisS.setValue(0);
    flash.setValue(0); contentA.setValue(0); contentS.setValue(0.93);
    logoA.setValue(0); circleOffset.setValue(DASH);
    axsA.setValue(0); axsS.setValue(0.82); subA.setValue(0); labelA.setValue(0);
    dotAnims.forEach(a => a.setValue(0));
    satAnims.forEach(a => a.setValue(0));
    sparkAnims.forEach(a => a.setValue(0));
  }, []);

  const schedule = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  };

  useEffect(() => {
    if (phase === 'entering') {
      resetAll();

      // ① Overlay oscuro
      Animated.timing(overlay, {
        toValue: 1, duration: 100, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }).start();

      // ② Iris central
      Animated.parallel([
        Animated.sequence([
          Animated.timing(irisA, { toValue: 1, duration: 50, useNativeDriver: true }),
          Animated.timing(irisA, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.spring(irisS, { toValue: 2.8, tension: 260, friction: 14, useNativeDriver: true }),
      ]).start();

      // ③ Flash
      schedule(() => {
        Animated.sequence([
          Animated.timing(flash, { toValue: 0.68, duration: 40, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
      }, 75);

      // ④ Rings
      rScale.forEach((sc, i) => {
        schedule(() => {
          Animated.parallel([
            Animated.spring(sc, { toValue: 1, tension: RING_TENSION[i], friction: RING_FRICTION[i], useNativeDriver: true }),
            Animated.sequence([
              Animated.timing(rAlpha[i], { toValue: RING_PEAK_A[i], duration: 48, useNativeDriver: true }),
              Animated.timing(rAlpha[i], { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
          ]).start();
        }, RING_DELAY_IN[i]);
      });

      // ⑤ Scanline
      schedule(() => {
        scanY.setValue(-H * 0.05);
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scanA, { toValue: 0.82, duration: 28, useNativeDriver: true }),
            Animated.timing(scanA, { toValue: 0, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          ]),
          Animated.timing(scanY, { toValue: H * 1.05, duration: 240, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]).start();
      }, 110);

      // ⑥ Shimmer
      schedule(() => {
        Animated.sequence([
          Animated.timing(shimmer, { toValue: 0.26, duration: 48, useNativeDriver: true }),
          Animated.timing(shimmer, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
      }, 195);

      // ⑦ Logo + círculo
      schedule(() => {
        Animated.timing(logoA, {
          toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }).start();
        Animated.timing(circleOffset, {
          toValue: 0, duration: 440, easing: Easing.out(Easing.cubic), useNativeDriver: false,
        }).start();
      }, 500);

      // ⑧ "AXS"
      schedule(() => {
        Animated.parallel([
          Animated.timing(axsA, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.spring(axsS, { toValue: 1, tension: 210, friction: 16, useNativeDriver: true }),
        ]).start();
      }, 780);

      // ⑨ Subtitle + label
      schedule(() => {
        Animated.timing(subA, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        if (label) {
          Animated.timing(labelA, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        }
      }, 830);

      // ⑩ Dots
      const DOT_DELAYS = [960, 992, 1018, 1040, 1058, 1076];
      dotAnims.forEach((anim, i) => {
        schedule(() =>
          Animated.spring(anim, { toValue: 1, tension: 300 - i * 8, friction: 18, useNativeDriver: true }).start(),
          DOT_DELAYS[i]
        );
      });

      // ⑪ Sparks
      sparkAnims.forEach((anim, i) => {
        schedule(() =>
          Animated.timing(anim, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(),
          1092 + i * 12
        );
      });

      // ⑫ Satélites
      const SAT_DELAYS = [1155, 1185, 1210];
      satAnims.forEach((anim, i) => {
        schedule(() =>
          Animated.timing(anim, { toValue: SAT_CONFIGS[i].maxA, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(),
          SAT_DELAYS[i]
        );
      });

      // ⑬ Logo sale
      schedule(() => {
        Animated.timing(logoA, {
          toValue: 0, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true,
        }).start();
        if (presentOnly) onEnterComplete?.();
      }, 1750);

      // ⑭ Contenido entra (SOLO si no es presentOnly)
      if (!presentOnly) {
        schedule(() => {
          // ⚠️ useNativeDriver: false para evitar problemas de scroll en WebView
          Animated.parallel([
            Animated.spring(contentA, { toValue: 1, tension: 200, friction: 22, useNativeDriver: false }),
            Animated.spring(contentS, { toValue: 1, tension: 200, friction: 22, useNativeDriver: false }),
          ]).start(() => onEnterComplete?.());
        }, 1820);
      }
    }

    if (phase === 'exiting') {
      timers.current.forEach(clearTimeout);
      timers.current = [];

      // ① Content recedes (useNativeDriver: false)
      Animated.parallel([
        Animated.timing(contentA, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: false }),
        Animated.spring(contentS, { toValue: 1.04, tension: 190, friction: 28, useNativeDriver: false }),
      ]).start(() => contentS.setValue(0.93));

      // ② Flash
      schedule(() => {
        Animated.sequence([
          Animated.timing(flash, { toValue: 0.52, duration: 45, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
      }, 165);

      // ③ Shimmer
      schedule(() => {
        Animated.sequence([
          Animated.timing(shimmer, { toValue: 0.20, duration: 50, useNativeDriver: true }),
          Animated.timing(shimmer, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
      }, 185);

      // ④ Scanline
      schedule(() => {
        scanY.setValue(H * 1.05);
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scanA, { toValue: 0.70, duration: 30, useNativeDriver: true }),
            Animated.timing(scanA, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          ]),
          Animated.timing(scanY, { toValue: -H * 0.05, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]).start();
      }, 205);

      // ⑤ Rings implode
      schedule(() => {
        [N - 1, N - 2, 0].forEach((ri, pos) => {
          schedule(() => {
            Animated.parallel([
              Animated.timing(rScale[ri], { toValue: 0, duration: 280, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
              Animated.sequence([
                Animated.timing(rAlpha[ri], { toValue: 0.5, duration: 60, useNativeDriver: true }),
                Animated.timing(rAlpha[ri], { toValue: 0, duration: 220, useNativeDriver: true }),
              ]),
            ]).start();
          }, RING_DELAY_OUT[pos] ?? 0);
        });

        schedule(() => {
          irisS.setValue(0.2);
          Animated.parallel([
            Animated.sequence([
              Animated.timing(irisA, { toValue: 0.88, duration: 60, useNativeDriver: true }),
              Animated.timing(irisA, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
            Animated.timing(irisS, { toValue: 0, duration: 360, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          ]).start();
        }, 185);
      }, 245);

      // ⑥ Overlay fades out
      schedule(() => {
        Animated.timing(overlay, { toValue: 0, duration: 185, easing: Easing.in(Easing.quad), useNativeDriver: true })
          .start(() => { resetAll(); onExitComplete?.(); });
      }, 565);
    }
  }, [phase]);

  // ─── RENDER ──────────────────────────────────────────────────

  // Siempre se renderiza el fondo y los elementos visuales (anillos, logo, etc.)
  // El contenido se renderiza condicionalmente para evitar animaciones en fase 'open'.

  // Contenido a mostrar (puede ser WebView u otro)
  const contentElement = (
    <View style={{ flex: 1, backgroundColor: '#07060b' }}>
      {children}
    </View>
  );

  // Fase 'open': mostrar contenido sin animación, en un contenedor estático.
  // Esto permite que el WebView tenga scroll nativo sin interferencias.
  if (phase === 'open') {
    return (
      <View style={StyleSheet.absoluteFill}>
        {contentElement}
      </View>
    );
  }

  // Fases 'entering' o 'exiting': contenido animado (con fade + scale)
  // Nota: useNativeDriver: false ya está aplicado en las animaciones de contentA/contentS.
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, s.base, { opacity: overlay }]}
      pointerEvents={phase === 'hidden' ? 'none' : 'box-none'}
    >
      {/* Burst rings */}
      {rScale.map((sc, i) => (
        <Animated.View
          key={i}
          style={[s.ring, {
            borderWidth: RING_WIDTHS[i],
            borderColor: RING_COLORS[i],
            opacity: rAlpha[i],
            transform: [{ scale: sc }],
          }]}
        />
      ))}

      {/* Iris */}
      <Animated.View style={[s.iris, { opacity: irisA, transform: [{ scale: irisS }] }]} />

      {/* Scanline */}
      <Animated.View style={[s.scanline, { opacity: scanA, transform: [{ translateY: scanY }] }]} />

      {/* Flash */}
      <Animated.View style={[StyleSheet.absoluteFill, s.flashLayer, { opacity: flash }]} />

      {/* Shimmer */}
      <Animated.View style={[StyleSheet.absoluteFill, s.shimmer, { opacity: shimmer }]} />

      {/* ─── AXS Logo ─────────────────────────────────────── */}
      <Animated.View style={[s.logoContainer, { opacity: logoA }]} pointerEvents="none">
        <Svg width={AXS_W} height={AXS_H} viewBox={`0 0 ${AXS_W} ${AXS_H}`}>
          <AnimatedCircle
            cx={CX} cy={CY} r={R}
            stroke={CYAN} strokeWidth={12} strokeOpacity={0.14}
            strokeDasharray={[DASH, GAP]}
            strokeDashoffset={circleOffset}
            fill="none"
          />
          <AnimatedCircle
            cx={CX} cy={CY} r={R}
            stroke={CYAN} strokeWidth={3.5}
            strokeDasharray={[DASH, GAP]}
            strokeDashoffset={circleOffset}
            fill="none"
          />
        </Svg>

        {/* Dots */}
        {DOT_CONFIGS.map((cfg, i) => (
          <Animated.View
            key={`dot${i}`}
            style={[s.dot, {
              width: cfg.w, height: cfg.h,
              top: cfg.top, left: cfg.left,
              opacity: mkDotOpacity(dotAnims[i]),
              transform: [{ scale: mkDotScale(dotAnims[i]) }],
            }]}
          />
        ))}

        {/* Satélites */}
        {SAT_CONFIGS.map((cfg, i) => (
          <Animated.View
            key={`sat${i}`}
            style={[s.dot, s.satellite, {
              width: cfg.w, height: cfg.h,
              top: cfg.top, left: cfg.left,
              opacity: satAnims[i],
            }]}
          />
        ))}

        {/* Sparks */}
        {SPARK_CONFIGS.map((cfg, i) => (
          <Animated.View
            key={`spark${i}`}
            style={[s.spark, {
              width: cfg.w, height: cfg.h,
              opacity: mkSparkOpacity(sparkAnims[i]),
              transform: [
                { translateX: mkSparkTX(sparkAnims[i], cfg.dx) },
                { translateY: mkSparkTY(sparkAnims[i], cfg.dy) },
              ],
            }]}
          />
        ))}

        {/* "AXS" text */}
        <Animated.View style={[s.axsWrap, { opacity: axsA, transform: [{ scale: axsS }] }]}>
          <View style={s.axsRow}>
            <Text style={[s.axsChar, s.axsWhite]}>A</Text>
            <Text style={[s.axsChar, s.axsCyan]}>X</Text>
            <Text style={[s.axsChar, s.axsWhite]}>S</Text>
          </View>
        </Animated.View>

        {label && (
          <Animated.View style={[s.labelWrap, { opacity: labelA }]}>
            <Text style={s.labelText}>{label}</Text>
          </Animated.View>
        )}

        <Animated.View style={[s.subWrap, label ? s.subWrapShifted : null, { opacity: subA }]}>
          <Text style={s.subText}>Artificial eXperience Systems</Text>
        </Animated.View>
      </Animated.View>

      {/* Contenido animado (solo en entering/exiting) */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: contentA,
            transform: [{ scale: contentS }],
            backgroundColor: '#07060b',
          },
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────
const s = StyleSheet.create({
  base: { backgroundColor: '#07060b' },

  ring: {
    position: 'absolute',
    width: MAX, height: MAX,
    borderRadius: MAX / 2,
    left: (W - MAX) / 2,
    top: (H - MAX) / 2,
    backgroundColor: 'transparent',
  },
  iris: {
    position: 'absolute',
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignSelf: 'center',
    top: H / 2 - 44,
    shadowColor: CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 40, elevation: 20,
  },
  scanline: {
    position: 'absolute',
    left: -W * 0.05, right: -W * 0.05, top: 0,
    height: 3, backgroundColor: CYAN,
    shadowColor: CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 10, elevation: 12,
  },
  flashLayer: { backgroundColor: CYAN },
  shimmer: { backgroundColor: '#0d3d4f' },

  logoContainer: {
    position: 'absolute',
    width: AXS_W,
    height: AXS_H,
    left: W / 2 - AXS_W / 2,
    top: H / 2 - AXS_H / 2,
  },

  dot: {
    position: 'absolute',
    backgroundColor: CYAN,
    borderRadius: 2,
  },
  satellite: {
    borderRadius: 1.5,
  },

  spark: {
    position: 'absolute',
    top: GAP_Y - 2,
    left: GAP_X - 2,
    backgroundColor: CYAN,
    borderRadius: 1.5,
  },

  axsWrap: {
    position: 'absolute',
    left: 0, right: 0,
    top: 77,
    alignItems: 'center',
  },
  axsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  axsChar: {
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 60,
  },
  axsWhite: { color: '#ece8e4' },
  axsCyan:  { color: CYAN },

  labelWrap: {
    position: 'absolute',
    left: 0, right: 0,
    top: 142,
    alignItems: 'center',
  },
  labelText: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.82)',
    letterSpacing: 9,
    textAlign: 'center',
  },

  subWrap: {
    position: 'absolute',
    left: 0, right: 0,
    top: 145,
    alignItems: 'center',
  },
  subWrapShifted: {
    top: 163,
  },
  subText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(34,211,238,0.60)',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
});
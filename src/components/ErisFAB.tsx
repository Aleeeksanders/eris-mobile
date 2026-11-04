import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, PanResponder, Dimensions, Easing } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Defs, RadialGradient, Stop, Path, Circle } from 'react-native-svg';
import { wsManager } from '../services/WebSocketManager';
import { ErisPresence } from '../services/ErisPresence';
import { T } from '../config/design';
import { MODULE_TINTS } from '../config/moduleTheme';
import { ErisMarkView, type MarkState, type MarkTint } from '../../modules/eris-bubble/ErisMarkView';
import { usePersona, PERSONAS, type Persona } from '../config/persona';

export const BUBBLE_SIZE = 56;
const MARGIN = 12;
const TAB_BAR = 56;          // la burbuja nunca queda encima de la barra de pestañas
const HEADER_CLEARANCE = 64; // ni encima del título de cada pantalla
const TAP_SLOP = 8;
const IDLE_MS = 4000;
const IDLE_OPACITY = 0.55;
const POS_KEY = 'eris_bubble_pos';
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Centro actual de la burbuja — App lo lee al abrir el chat para que el
// overlay nazca (y vuelva a morir) exactamente donde está la burbuja.
let currentCenter = { x: SCREEN_W - MARGIN - BUBBLE_SIZE / 2, y: SCREEN_H * 0.7 };
export const getErisBubbleCenter = () => currentCenter;

interface Props {
  onOpen: () => void;
  /** Oculta con animación (ej. mientras juega una transición de portal). */
  hidden?: boolean;
  /** false mientras el chat está abierto: la burbuja no recibe toques. */
  interactive?: boolean;
  /** Progreso 0→1 del overlay del chat — la burbuja se funde en él al abrir y reaparece al cerrar. */
  morphProgress?: Animated.Value;
  /** Color de la nube del ícono según el módulo en pantalla (el núcleo menta es siempre Eris). */
  tint?: MarkTint;
}

export function ErisFAB({ onOpen, hidden = false, interactive = true, morphProgress, tint = 'chat' }: Props) {
  const [presence, setPresence] = useState(ErisPresence.get());
  useEffect(() => ErisPresence.subscribe(setPresence), []);
  // Eris o Hestia (Modo AXS Executive): núcleo, halo, borde y destellos
  const persona = usePersona();
  const insets = useSafeAreaInsets();
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const [ready, setReady] = useState(false);
  const [wsStatus, setWsStatus] = useState<string>('disconnected');

  // Posición: JS driver (PanResponder no corre en el hilo nativo). Todo lo
  // demás va en nativo en una vista INTERNA — mezclar drivers en la misma
  // vista hace que React Native lance error al primer drag.
  const pos = useRef(new Animated.ValueXY()).current;
  const posRef = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);

  const appear = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const idle = useRef(new Animated.Value(1)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const noMorph = useRef(new Animated.Value(0)).current;
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Brillitos: un solo reloj 0→1 cada 2,6 s (en el hilo nativo); cada brillito lo lee con su propia fase
  const twinkle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(twinkle, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [twinkle]);

  const place = (p: { x: number; y: number }) => {
    posRef.current = p;
    currentCenter = { x: p.x + BUBBLE_SIZE / 2, y: p.y + BUBBLE_SIZE / 2 };
  };

  // Se atenúa tras unos segundos quieta (como AssistiveTouch) para molestar
  // menos sobre el contenido; cualquier toque la despierta.
  const wake = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    Animated.timing(idle, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    idleTimer.current = setTimeout(() => {
      Animated.timing(idle, { toValue: IDLE_OPACITY, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    }, IDLE_MS);
  };

  useEffect(() => {
    (async () => {
      const i = insetsRef.current;
      let p = snapToEdge(SCREEN_W, SCREEN_H, i);
      try {
        const raw = await AsyncStorage.getItem(POS_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') p = snapToEdge(saved.x, saved.y, i);
      } catch {}
      pos.setValue(p);
      place(p);
      setReady(true);
    })();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (hidden) {
      Animated.timing(appear, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
    } else {
      Animated.spring(appear, { toValue: 1, damping: 14, stiffness: 180, mass: 0.9, useNativeDriver: true }).start();
    }
  }, [hidden, ready]);

  useEffect(() => {
    if (ready && !hidden && interactive) wake();
  }, [ready, hidden, interactive]);

  useEffect(() => {
    const unsub = wsManager.subscribeStatus(st => setWsStatus(st));
    return () => { unsub(); };
  }, []);

  // Pulso tipo sonar mientras hay conexión — un anillo fino que se expande y se desvanece.
  useEffect(() => {
    if (wsStatus !== 'connected') { ring.stopAnimation(); ring.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(ring, { toValue: 1, duration: 1700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(2400),
    ]));
    loop.start();
    return () => loop.stop();
  }, [wsStatus]);

  const settle = (x: number, y: number, vx = 0, vy = 0) => {
    const target = snapToEdge(x + vx * 40, y + vy * 60, insetsRef.current, vx);
    place(target);
    Animated.spring(pos, { toValue: target, velocity: { x: vx, y: vy }, tension: 110, friction: 12, useNativeDriver: false }).start();
    Animated.spring(press, { toValue: 1, speed: 14, bounciness: 7, useNativeDriver: true }).start();
    AsyncStorage.setItem(POS_KEY, JSON.stringify(target)).catch(() => {});
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragging.current = false;
        // Si la agarras a mitad del rebote, parte desde donde se VE, no desde el destino.
        pos.stopAnimation(v => { dragStart.current = v; });
        wake();
        Animated.spring(press, { toValue: 0.9, speed: 40, bounciness: 0, useNativeDriver: true }).start();
      },
      onPanResponderMove: (_e, g) => {
        if (!dragging.current && Math.abs(g.dx) + Math.abs(g.dy) > TAP_SLOP) {
          dragging.current = true;
          Animated.spring(press, { toValue: 1.12, speed: 22, bounciness: 9, useNativeDriver: true }).start();
        }
        if (dragging.current) pos.setValue({ x: dragStart.current.x + g.dx, y: dragStart.current.y + g.dy });
      },
      onPanResponderRelease: (_e, g) => {
        if (!dragging.current) {
          Animated.spring(press, { toValue: 1, speed: 18, bounciness: 10, useNativeDriver: true }).start();
          onOpenRef.current();
          return;
        }
        settle(dragStart.current.x + g.dx, dragStart.current.y + g.dy, g.vx, g.vy);
        wake();
      },
      onPanResponderTerminate: (_e, g) => {
        settle(dragStart.current.x + g.dx, dragStart.current.y + g.dy);
      },
    })
  ).current;

  if (!ready) return null;

  const morph = morphProgress ?? noMorph;
  const morphFade = morph.interpolate({ inputRange: [0, 0.1], outputRange: [1, 0], extrapolate: 'clamp' });
  const morphShrink = morph.interpolate({ inputRange: [0, 0.1], outputRange: [1, 0.6], extrapolate: 'clamp' });
  const appearScale = appear.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  const opacity = Animated.multiply(Animated.multiply(appear, idle), morphFade);
  const scale = Animated.multiply(Animated.multiply(appearScale, press), morphShrink);

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.55, 0] });

  const dotColor = wsStatus === 'connected' ? T.green : wsStatus === 'connecting' ? T.gold : '#4b5563';
  // Sin servidor el ícono se congela en gris (solo "desconectado": mientras reconecta sigue normal)
  const markState: MarkState = wsStatus === 'disconnected' ? 'offline' : presence;

  return (
    <Animated.View
      {...responder.panHandlers}
      pointerEvents={interactive && !hidden ? 'box-only' : 'none'}
      style={[s.hitbox, { transform: pos.getTranslateTransform() }]}
    >
      <Animated.View style={[s.body, { opacity, transform: [{ scale }] }]}>
        <Animated.View pointerEvents="none" style={[s.ring, { borderColor: persona.accent, opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
        <View style={[s.btn, { borderColor: persona.accent + '4d', shadowColor: persona.accent }]}>
          <ErisMarkView size={BUBBLE_SIZE} state={markState} tint={tint} persona={persona.id} disc={false}
            fallback={<ErisMarkStatic size={BUBBLE_SIZE} tint={tint} persona={persona} />} />
        </View>
        {sparksFor(persona).map((sp, i) => <Sparkle key={i} t={twinkle} sp={sp} />)}
        <View style={[s.dot, { backgroundColor: dotColor }]} />
      </Animated.View>
    </Animated.View>
  );
}

// ─── Eris: el condensado (nube de átomos del color del módulo + núcleo menta) ─────────────────────────────────
// Lo anima en nativo ErisMarkView (ErisMarkDrawer.kt). Esta versión quieta es el respaldo cuando el módulo nativo no
// está (web/iOS). Misma nube que el dibujante nativo y el kit de marca: 64 átomos con la misma semilla.
const DISC = '#07060b';
const rnd = (x: number, y: number) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };
const ATOMS = Array.from({ length: 64 }, (_, i) => {
  const u1 = rnd(i, 7), u2 = rnd(i, 13), u3 = rnd(i, 29);
  const r0 = 22 + 52 * (1 - Math.exp(-2.2 * u1)) / (1 - Math.exp(-2.2)), q = (r0 - 22) / 52, a = u2 * 2 * Math.PI;
  const r = r0 + 1.5 * Math.sin(u3 * 20);
  return { x: r * Math.cos(a), y: r * Math.sin(a), s: 1.2 + 2.5 * Math.pow(1 - q, 1.3), zone: r0 < 33 ? 0 : r0 < 50 ? 1 : 2, op: 0.95 - 0.55 * q };
});

export function ErisMarkStatic({ size, tint = 'chat', persona = PERSONAS.eris }: { size: number; tint?: MarkTint; persona?: Persona }) {
  const t = tint === 'chat' ? persona.chat : MODULE_TINTS[tint];
  const zone = [persona.inner, t.mid, t.outer];
  return (
    <Svg width={size} height={size} viewBox="-100 -100 200 200">
      <Defs>
        <RadialGradient id="erCore" cx="36%" cy="32%" r="75%">
          <Stop offset="0" stopColor={persona.core[0]} />
          <Stop offset="0.4" stopColor={persona.core[1]} />
          <Stop offset="1" stopColor={persona.core[2]} />
        </RadialGradient>
      </Defs>
      {ATOMS.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={p.s} fill={zone[p.zone]} opacity={p.op} />)}
      <Circle r={25.6} fill={persona.glow} opacity={0.15} />
      <Circle r={16} fill="url(#erCore)" />
    </Svg>
  );
}

// ─── Brillitos alrededor de la burbuja (mismos valores que la burbuja fuera de la app, BubbleView.kt) ──
type Spark = { deg: number; dist: number; size: number; phase: number; color: string };
// Eris: menta (su núcleo) y cian · Hestia: brasa y azul AXS
const sparksFor = (p: Persona): Spark[] => [
  { deg: -58, dist: 1.22, size: 5.5, phase: 0.0, color: '#ffffff' },
  { deg: 22, dist: 1.28, size: 4.0, phase: 0.35, color: p.inner },
  { deg: 140, dist: 1.2, size: 4.5, phase: 0.62, color: p.accent },
  { deg: 205, dist: 1.26, size: 3.5, phase: 0.18, color: '#c4b5fd' },
];
const STAR = 'M0 -1 Q0.14 -0.14 1 0 Q0.14 0.14 0 1 Q-0.14 0.14 -1 0 Q-0.14 -0.14 0 -1 Z';
const TWINKLE_STEPS = Array.from({ length: 25 }, (_, i) => i / 24);

/** Titila con su propia fase: brillo rápido y apagado lento (misma curva que la burbuja nativa). */
function Sparkle({ t, sp }: { t: Animated.Value; sp: Spark }) {
  const r = BUBBLE_SIZE / 2;
  const a = (sp.deg * Math.PI) / 180;
  const box = sp.size * 2.6;
  const k = (u: number) => Math.pow((Math.sin(2 * Math.PI * (u + sp.phase)) + 1) / 2, 3);
  const opacity = t.interpolate({ inputRange: TWINKLE_STEPS, outputRange: TWINKLE_STEPS.map((u) => 0.1 + 0.9 * k(u)) });
  const scale = t.interpolate({ inputRange: TWINKLE_STEPS, outputRange: TWINKLE_STEPS.map((u) => 0.55 + 0.65 * k(u)) });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: r + Math.cos(a) * r * sp.dist - box / 2,
        top: r + Math.sin(a) * r * sp.dist - box / 2,
        width: box, height: box, opacity, transform: [{ scale }],
      }}
    >
      <Svg width={box} height={box} viewBox="-1.3 -1.3 2.6 2.6">
        <Path d={STAR} fill={sp.color} />
      </Svg>
    </Animated.View>
  );
}

function snapToEdge(x: number, y: number, insets: EdgeInsets, vx = 0) {
  // Un lanzamiento rápido decide el lado por la dirección; si no, el más cercano.
  const toRight = Math.abs(vx) > 0.35 ? vx > 0 : x + BUBBLE_SIZE / 2 > SCREEN_W / 2;
  const minY = insets.top + HEADER_CLEARANCE;
  const maxY = SCREEN_H - insets.bottom - TAB_BAR - BUBBLE_SIZE - MARGIN;
  return {
    x: toRight ? SCREEN_W - BUBBLE_SIZE - MARGIN : MARGIN,
    y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
  };
}

const s = StyleSheet.create({
  hitbox: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    zIndex: 999,
    elevation: 20,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    borderWidth: 1.5,
    borderColor: T.accent,
  },
  btn: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: DISC, // mismo disco que la burbuja fuera de la app (y el borde de las rayas de la órbita)
    borderWidth: 1.5,
    borderColor: 'rgba(34,211,238,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  dot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: T.bgCard,
  },
});

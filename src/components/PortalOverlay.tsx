import React, { useRef, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Easing, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ErisMarkView, type MarkTint } from '../../modules/eris-bubble/ErisMarkView';
import { PersonaStore } from '../config/persona';

// ─── AXS-P0rtal ───────────────────────────────────────────────
// Un portal hacia el futuro: el anillo (en el degradado de la X) se dibuja y
// su tramo final se deshace en píxeles; "AXS" nace como bloques de píxeles
// toscos y evoluciona a su forma nítida con la X cruzada en degradado; de la
// X salen píxeles por la apertura (cada módulo con su personalidad) y al
// final se ATRAVIESA el portal: el anillo crece y el destino aparece dentro.
//
// Toda la coreografía cuelga de UNA línea de tiempo en "ms de diseño"
// (0→1800) que corre a 0,8× (2250ms reales). Opacidad y transformaciones van
// en el hilo nativo; solo el trazo del anillo y el brillo de la X (props de
// SVG) van por JS, con una segunda línea de tiempo sincronizada.

const { width: W, height: H } = Dimensions.get('window');
const INK = '#ece8e4';
const BG = '#07060b';

export type PortalTheme = 'eris' | 'forge' | 'finanzas' | 'inventario';
const THEMES: Record<PortalTheme, { accent: string; soft: string }> = {
  eris:     { accent: '#22d3ee', soft: '#a5f3fc' },
  forge:    { accent: '#f5c542', soft: '#fde68a' },
  finanzas: { accent: '#a78bfa', soft: '#ddd6fe' },
  inventario: { accent: '#2dd4bf', soft: '#99f6e4' },
};

const SPEED = 0.8;
const T_END = 1800;
const EXIT_MS = 700;
// Justo antes de atravesar el portal (1500). Si el módulo aún no está listo, la animación se queda aquí —con el
// emblema completo y el ícono de Eris "pensando" en el color del módulo— en vez de aterrizar en una carga.
const HOLD_AT = 1480;
const HOLD_MAX_MS = 8000;

// ─── Geometría (dp, relativa al centro del emblema) ───────────
const ECX = W / 2;
const ECY = H / 2 - 30;
const R = 82;
const CIRC = 2 * Math.PI * R;
const A0 = 16, SOLID = 285, A1 = 318, SWEEP = A1 - A0;
const RING_LEN = CIRC * (SOLID - A0) / 360;
const T_RING = 200, D_RING = 560;
const RS = 2 * (R + 14);
const LT = ECY + R + 30;

// Letras vectoriales fijas (no dependen de la fuente del teléfono).
const CAP = 40, YB = 12, TOPY = YB - CAP;
const WA = 40, WX = 40, WS = 34, GP = 1.5;
const TOT = WA + WX + WS + 2 * GP;
const AX = -TOT / 2, XX = AX + WA + GP, SX = XX + WX + GP;
const SWX = 0.34 * WX;

type Pt = [number, number];
const A_OUT: Pt[] = [[0, 40], [13, 0], [27, 0], [40, 40], [29, 40], [26.1, 31], [13.9, 31], [11, 40]];
const A_HOLE: Pt[] = [[20, 12.3], [23.8, 24], [16.2, 24]];
const XP1: Pt[] = [[0, 0], [SWX, 0], [WX, CAP], [WX - SWX, CAP]];
const XP2: Pt[] = [[0, CAP], [WX - SWX, 0], [WX, 0], [SWX, CAP]];
const S_SW = 10.5, S_RX = 11.75, S_RY = 7.375, S_CX = 17, S_CYT = 12.625, S_CYB = 27.375;
const rad = (d: number) => d * Math.PI / 180;
const sP = (a: number, cy: number): Pt => [S_CX + S_RX * Math.cos(rad(a)), cy + S_RY * Math.sin(rad(a))];

const ptsStr = (P: Pt[], ox = 0) => P.map(([x, y]) => `${x + ox},${y}`).join(' ');
const A_PATH = `M${A_OUT.map(([x, y]) => `${x} ${y}`).join(' L')} Z M${A_HOLE.map(([x, y]) => `${x} ${y}`).join(' L')} Z`;
const S_PATH = (() => {
  const s = sP(-25, S_CYT), e = sP(155, S_CYB), ox = SX - AX;
  return `M${s[0] + ox} ${s[1]} A${S_RX} ${S_RY} 0 1 0 ${S_CX + ox} ${S_CYT + S_RY} A${S_RX} ${S_RY} 0 1 1 ${e[0] + ox} ${e[1]}`;
})();

// ─── Utilidades de tiempo ─────────────────────────────────────
const cl = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sg = (t: number, s: number, d: number) => cl((t - s) / d);
const eOC = (p: number) => 1 - Math.pow(1 - p, 3);
const eOQ = (p: number) => 1 - (1 - p) * (1 - p);
const eIC = (p: number) => p * p * p;
const eIOQ = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const eOB = (p: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

// El driver nativo solo interpola linealmente: las curvas se muestrean.
function track(T: Animated.Value, t0: number, t1: number, f: (t: number) => number, n = 10) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    inputRange.push(t);
    outputRange.push(f(t));
  }
  return T.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
}

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function mix(h1: string, h2: string, p: number) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const c = (s: number) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * p));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
function inPoly(x: number, y: number, P: Pt[]) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const qb = (a: Pt, b: Pt, c: Pt, p: number): Pt => {
  const q = 1 - p;
  return [q * q * a[0] + 2 * q * p * b[0] + p * p * c[0], q * q * a[1] + 2 * q * p * b[1] + p * p * c[1]];
};

// ─── Datos precalculados ──────────────────────────────────────
const J = (() => { const r = rng(11); return Array.from({ length: 12 }, () => ({ j1: r() - 0.5, j2: r() - 0.5, ph: r() * 6.28 })); })();
const XC: Pt = [XX + WX / 2, (TOPY + YB) / 2];
const CTRL: Pt = [SX + 16, TOPY - 16];

// La "forma primitiva": las letras rasterizadas en bloques de 6dp.
const CELL = 6;
const BLOCKS = (() => {
  const sLine: Pt[] = [];
  for (let i = 0; i <= 60; i++) sLine.push(sP(-25 - (245 * i) / 60, S_CYT));
  for (let i = 0; i <= 60; i++) sLine.push(sP(-90 + (245 * i) / 60, S_CYB));
  const inS = (x: number, y: number) => sLine.some(([px, py]) => Math.hypot(px - x, py - y) <= S_SW / 2);
  const r = rng(5);
  const out: { x: number; y: number; isX: boolean; col: string; d: number; o: number }[] = [];
  const x0 = AX - 4, x1 = SX + WS + 4, y0 = TOPY - 4, y1 = YB + 4;
  for (let y = y0; y <= y1; y += CELL) {
    for (let x = x0; x <= x1; x += CELL) {
      const cx = x + CELL / 2, cy = y + CELL / 2, ly = cy - TOPY;
      const isX = inPoly(cx - XX, ly, XP1) || inPoly(cx - XX, ly, XP2);
      const isA = !isX && inPoly(cx - AX, ly, A_OUT) && !inPoly(cx - AX, ly, A_HOLE);
      const isS = !isX && !isA && inS(cx - SX, ly);
      if (!isX && !isA && !isS) continue;
      const nx = (x - x0) / (x1 - x0);
      out.push({
        x: cx, y: cy, isX,
        col: isX ? mix('#22d3ee', '#2563eb', cl((cx - XX) / WX)) : '#7dd3fc',
        d: 380 + (r() * 0.55 + nx * 0.45) * 150,
        o: 540 + r() * 70,
      });
    }
  }
  return out;
})();

// Tramo final del anillo: cada píxel más chico, más separado y más claro.
const TAIL = [0.04, 0.13, 0.23, 0.35, 0.48, 0.62, 0.78, 0.95].map((f, k) => {
  const ang = SOLID + (A1 - SOLID) * f;
  const pr = (ang - A0) / SWEEP;
  return {
    ang,
    t0: T_RING + D_RING * (1 - Math.cbrt(1 - pr)),
    s: 3.6 - k * 0.24,
    j: [0, 1.1, -1, 1.5, -1.3, 1.9, -1.7, 2.3][k],
    al: 1 - k * 0.06,
    c: mix('#2563eb', '#60a5fa', k / 7),
  };
});

const STREAKS = Array.from({ length: 20 }, (_, i) => {
  const r = rng(100 + i);
  return { a: r() * 6.2832, v: 0.35 + r() * 0.5, w: 0.8 + r() * 1, d: r() * 120 };
});

const ringScaleAt = (t: number) => 1 + 6 * eIC(sg(t, 1500, 300));

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

// ─── Piezas ───────────────────────────────────────────────────
type AV = Animated.Value;

function Sq({ x, y, size, color, style, radius, children }: {
  x: number; y: number; size: number; color: string; style?: any; radius?: number; children?: React.ReactNode;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute', left: ECX + x - size / 2, top: ECY + y - size / 2,
        width: size, height: size, borderRadius: radius ?? Math.min(1.4, size / 4),
        backgroundColor: color, overflow: 'hidden',
      }, style]}
    >
      {children}
    </Animated.View>
  );
}

/** Un píxel que viaja desde detrás de la X, sale por la apertura y se posa en su destino (con estela). */
function Flight({ T, L, dur, S, target, size, color, pop, keyP, extraOpacity }: {
  T: AV; L: number; dur: number; S: Pt; target: Pt; size: number; color: string; pop: number; keyP: string;
  extraOpacity?: (t: number) => number;
}) {
  const pos = (t: number, lag = 0) => qb(S, CTRL, target, eOC(cl(sg(t, L, dur) - lag)));
  const land = L + dur;
  const ghosts = [1, 2].map(k => (
    <Sq
      key={`${keyP}g${k}`} x={target[0]} y={target[1]} size={size * (1 - k * 0.18)} color={color}
      style={{
        opacity: track(T, L, land + 10, t => { const p = sg(t, L, dur); return p < 1 && p - k * 0.06 > 0 ? (0.22 * (4 - k)) / 3 : 0; }, 14),
        transform: [
          { translateX: track(T, L, land, t => pos(t, k * 0.06)[0] - target[0], 12) },
          { translateY: track(T, L, land, t => pos(t, k * 0.06)[1] - target[1], 12) },
        ],
      }}
    />
  ));
  return (
    <>
      {ghosts}
      <Sq
        x={target[0]} y={target[1]} size={size} color={color}
        style={{
          opacity: extraOpacity
            ? track(T, L, 1640, t => (t < land ? cl(sg(t, L, dur) / 0.12) : extraOpacity(t)), 40)
            : track(T, L, L + dur * 0.2, t => cl(sg(t, L, dur) / 0.12), 4),
          transform: [
            { translateX: track(T, L, land, t => pos(t)[0] - target[0], 12) },
            { translateY: track(T, L, land, t => pos(t)[1] - target[1], 12) },
            { scale: track(T, land - 1, land + 160, t => (t < land ? 1 : 1 + pop * (1 - eOC(sg(t, land, 160)))), 8) },
          ],
        }}
      />
    </>
  );
}

function Line({ T, A, B, t0, dur, color, opacity, thickness = 1 }: {
  T: AV; A: Pt; B: Pt; t0: number; dur: number; color: string; opacity: number; thickness?: number;
}) {
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: ECX + A[0], top: ECY + A[1] - thickness / 2,
        width: len, height: thickness, backgroundColor: color, opacity,
        transformOrigin: 'left',
        transform: [{ rotate: `${ang}rad` }, { scaleX: track(T, t0, t0 + dur, t => eOC(sg(t, t0, dur)), 6) }],
      }}
    />
  );
}

function ErisPixels({ T }: { T: AV }) {
  const B0 = 780;
  const P0: Pt = [SX + 8, TOPY - 11], P2: Pt = [0.78 * R, -0.78 * R];
  const P1: Pt = [(P0[0] + P2[0]) / 2, (P0[1] + P2[1]) / 2];
  const ST: [Pt, number, string][] = [
    [P0, 7, '#22d3ee'], [P1, 7, '#1fb2f2'], [P2, 7, '#2c8cf0'],
    [[P2[0] + 12, P1[1] + 6], 3.5, '#7dd3fc'], [[P1[0] + 5, P2[1] - 12], 3.5, '#7dd3fc'],
  ];
  const land = ST.map((_, i) => B0 + i * 30 + 320);
  const edges: [number, number][] = [[0, 1], [1, 2], [1, 3], [2, 4]];
  const pulseAt = (t: number): Pt => {
    const p = sg(t, 1280, 160), seg = p * 2, si = Math.min(1, Math.floor(seg)), fr = seg - si;
    const a = ST[si][0], b = ST[si + 1][0];
    return [a[0] + (b[0] - a[0]) * fr, a[1] + (b[1] - a[1]) * fr];
  };
  return (
    <>
      {edges.map(([a, b], k) => {
        const st = Math.max(land[a], land[b]) + 10;
        return <Line key={`e${k}`} T={T} A={ST[a][0]} B={ST[b][0]} t0={st} dur={100} color="#7dd3fc" opacity={0.4} />;
      })}
      {ST.slice(0, 3).map(([p, s, c], i) => (
        <Sq key={`h${i}`} x={p[0]} y={p[1]} size={s * 2.6} color={c} radius={3}
          style={{ opacity: track(T, land[i], land[i] + 200, t => 0.22 * eOQ(sg(t, land[i], 200)), 6) }} />
      ))}
      {ST.map(([p, s, c], i) => (
        <Flight
          key={`f${i}`} keyP={`f${i}`} T={T} L={B0 + i * 30} dur={320}
          S={[XC[0] + J[i].j1 * 8, XC[1] + J[i].j2 * 8]} target={p} size={s} color={c} pop={0.3}
          extraOpacity={i > 2 ? (t => 0.75 + 0.25 * Math.sin(t / 110 + i * 1.7)) : undefined}
        />
      ))}
      <Sq x={P0[0]} y={P0[1]} size={3} color="#e0fbff" radius={1.5}
        style={{
          opacity: track(T, 1275, 1445, t => (t >= 1280 && t <= 1440 ? 1 : 0), 34),
          transform: [
            { translateX: track(T, 1280, 1440, t => pulseAt(t)[0] - P0[0], 12) },
            { translateY: track(T, 1280, 1440, t => pulseAt(t)[1] - P0[1], 12) },
          ],
        }} />
    </>
  );
}

function ForgePixels({ T }: { T: AV }) {
  const B0 = 780, hx = SX + 22, hy = TOPY - 20;
  return (
    <>
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', left: ECX + hx - 26, top: ECY + hy - 26, width: 52, height: 52,
        opacity: track(T, 760, 1640, t => eOQ(sg(t, 760, 200)) * (0.75 + 0.25 * Math.sin(t / 90)), 44),
      }}>
        <Svg width={52} height={52}>
          <Defs>
            <RadialGradient id="forgeHeat" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#f5c542" stopOpacity={0.34} />
              <Stop offset="1" stopColor="#f5c542" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={26} cy={26} r={26} fill="url(#forgeHeat)" />
        </Svg>
      </Animated.View>
      {J.map((m, i) => {
        const L = B0 + i * 48, esc = 260, life = 850;
        const S: Pt = [XC[0] + m.j1 * 8, XC[1] + m.j2 * 8];
        const X: Pt = [hx + m.j1 * 14, hy - 4 + m.j2 * 8];
        const state = (t: number) => {
          const p = sg(t, L, esc);
          if (p < 1) { const q = qb(S, CTRL, X, eOC(p)); return { x: q[0], y: q[1], s: 4.2, a: cl(p / 0.15) }; }
          const tau = t - L - esc, k = Math.min(1, tau / life);
          return {
            x: X[0] + Math.sin(tau / 140 + m.ph) * 5 + 0.018 * tau,
            y: X[1] - (0.045 * tau + 0.00004 * tau * tau),
            s: 4.2 - 2.4 * k,
            a: tau > life ? 0 : (1 - k * k) * (0.7 + 0.3 * Math.sin(tau / 32 + m.ph)),
          };
        };
        const end = L + esc + life + 10;
        const lifeP = (t: number) => cl((t - L) / (esc + life));
        return (
          <Sq key={`em${i}`} x={X[0]} y={X[1]} size={4.2} color="#f5c542"
            style={{
              opacity: track(T, L, end, t => state(t).a, 56),
              transform: [
                { translateX: track(T, L, end, t => state(t).x - X[0], 28) },
                { translateY: track(T, L, end, t => state(t).y - X[1], 28) },
                { scale: track(T, L, end, t => state(t).s / 4.2, 10) },
              ],
            }}>
            <Animated.View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#ff6a3d', opacity: track(T, L, end, t => sg(lifeP(t), 0.3, 0.7), 8) }} />
            <Animated.View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#fff4d6', opacity: track(T, L, end, t => 1 - sg(lifeP(t), 0, 0.3), 8) }} />
          </Sq>
        );
      })}
    </>
  );
}

function FinanzasPixels({ T, accent, soft }: { T: AV; accent: string; soft: string }) {
  const B0 = 780;
  const slots: Pt[] = [];
  for (let c = 0; c < 4; c++) for (let r = 0; r <= c; r++) slots.push([SX + 6 + c * 9, TOPY - 10 - r * 8]);
  const top = slots[slots.length - 1];
  const A: Pt = [SX + 6, TOPY - 20], B: Pt = [SX + 33, TOPY - 46];
  const headOp = track(T, 1340, 1370, t => sg(t, 1340, 30), 3);
  return (
    <>
      <Sq x={top[0]} y={top[1]} size={6.5 * 2.6} color={soft} radius={4}
        style={{ opacity: track(T, 1280, 1640, t => (t < 1290 ? 0 : 0.3 + 0.2 * Math.sin((t - 1290) / 70)), 30) }} />
      <Line T={T} A={A} B={B} t0={1280} dur={130} color={soft} opacity={0.85} thickness={1.2} />
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: ECX + B[0] - 5, top: ECY + B[1] - 0.6, width: 5, height: 1.2, backgroundColor: soft, opacity: headOp }} />
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: ECX + B[0] - 0.6, top: ECY + B[1], width: 1.2, height: 5, backgroundColor: soft, opacity: headOp }} />
      {slots.map((s, k) => (
        <Flight
          key={`b${k}`} keyP={`b${k}`} T={T} L={B0 + k * 22} dur={300}
          S={[XC[0] + J[k].j1 * 8, XC[1] + J[k].j2 * 8]} target={s} size={6.5}
          color={k === slots.length - 1 ? soft : accent} pop={0.4}
        />
      ))}
    </>
  );
}

/** Inventario: una repisa que se llena (2026-10-22). Las cajas caen a su fila sobre cada repisa; la última, la que agregas, en el tono claro. */
function InventarioPixels({ T, accent, soft }: { T: AV; accent: string; soft: string }) {
  const B0 = 780;
  const rows = [4, 3, 4];
  const slots: Pt[] = [];
  rows.forEach((n, r) => { for (let c = 0; c < n; c++) slots.push([SX + 6 + c * 9 + (n === 3 ? 4.5 : 0), TOPY - 10 - r * 10]); });
  const last = slots[slots.length - 1];
  return (
    <>
      {rows.map((_, r) => (
        <Line key={`r${r}`} T={T} A={[SX + 1, TOPY - 5 - r * 10]} B={[SX + 39, TOPY - 5 - r * 10]} t0={1220 + r * 40} dur={120} color={soft} opacity={0.55} thickness={1} />
      ))}
      <Sq x={last[0]} y={last[1]} size={6.5 * 2.6} color={soft} radius={4}
        style={{ opacity: track(T, 1280, 1640, t => (t < 1290 ? 0 : 0.3 + 0.2 * Math.sin((t - 1290) / 70)), 30) }} />
      {slots.map((p, k) => (
        <Flight
          key={`i${k}`} keyP={`i${k}`} T={T} L={B0 + k * 20} dur={300}
          S={[XC[0] + J[k % J.length].j1 * 8, XC[1] + J[k % J.length].j2 * 8]} target={p} size={6.5}
          color={k === slots.length - 1 ? soft : accent} pop={0.4}
        />
      ))}
    </>
  );
}

function Streaks({ T }: { T: AV }) {
  return (
    <>
      {STREAKS.map((s, i) => {
        const T0 = 1500 + s.d * 0.5;
        const head = (t: number) => { const lt = Math.max(0, t - T0); return R * 1.1 * ringScaleAt(t) + s.v * lt * (1 + lt / 150) * 1.4; };
        return (
          <Animated.View key={`s${i}`} pointerEvents="none" style={{
            position: 'absolute', left: ECX, top: ECY - s.w / 2, width: 36, height: s.w,
            backgroundColor: s.w > 1.4 ? '#ffffff' : '#7dd3fc',
            transformOrigin: 'left',
            opacity: track(T, T0, T0 + 290, t => { const l = t - T0; return (l < 50 ? l / 50 : 1) * (1 - sg(l, 60, 230)) * 0.45; }, 12),
            transform: [{ rotate: `${s.a}rad` }, { translateX: track(T, T0, T0 + 290, t => head(t) - 36, 12) }],
          }} />
        );
      })}
    </>
  );
}

function RingArt({ id, dashOffset, tailStyle }: { id: string; dashOffset: any; tailStyle: (k: number) => any }) {
  return (
    <>
      <Svg width={RS} height={RS}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor="#22d3ee" />
            <Stop offset="1" stopColor="#2563eb" />
          </LinearGradient>
        </Defs>
        <G rotation={A0} origin={`${RS / 2}, ${RS / 2}`}>
          <AnimatedCircle cx={RS / 2} cy={RS / 2} r={R} stroke={`url(#${id})`} strokeWidth={10} strokeOpacity={0.09}
            fill="none" strokeDasharray={[RING_LEN, CIRC]} strokeDashoffset={dashOffset} />
          <AnimatedCircle cx={RS / 2} cy={RS / 2} r={R} stroke={`url(#${id})`} strokeWidth={3.5}
            fill="none" strokeDasharray={[RING_LEN, CIRC]} strokeDashoffset={dashOffset} />
        </G>
      </Svg>
      {TAIL.map((k, i) => {
        const a = rad(k.ang), rr = R + k.j;
        return (
          <Animated.View key={`t${i}`} pointerEvents="none" style={[{
            position: 'absolute', left: RS / 2 + Math.cos(a) * rr - k.s / 2, top: RS / 2 + Math.sin(a) * rr - k.s / 2,
            width: k.s, height: k.s, borderRadius: 1, backgroundColor: k.c,
          }, tailStyle(i)]} />
        );
      })}
    </>
  );
}

function Lockup({ Tn, Tj, theme, label }: { Tn: AV; Tj: AV; theme: PortalTheme; label?: string }) {
  const { accent, soft } = THEMES[theme];

  const itemsOpacity = Tn.interpolate({
    inputRange: [200, 240, 280, 320, 360, 1500, 1535, 1570, 1605, 1640],
    outputRange: [0, eOQ(0.25), eOQ(0.5), eOQ(0.75), 1, 1, 1 - eOQ(0.25), 1 - eOQ(0.5), 1 - eOQ(0.75), 0],
    extrapolate: 'clamp',
  });

  const dashOffset = track(Tj, T_RING, T_RING + D_RING,
    t => RING_LEN - (CIRC * Math.min(eOC(sg(t, T_RING, D_RING)) * SWEEP, SOLID - A0)) / 360, 24);

  const w1 = track(Tn, 540, 670, t => -CAP * (1 - eIOQ(sg(t, 540, 130))), 8);
  const w2 = track(Tn, 600, 730, t => CAP * (1 - eIOQ(sg(t, 600, 130))), 8);
  const neg = (v: any) => Animated.multiply(v, -1);

  return (
    <>
      <Streaks T={Tn} />

      {/* Portal — no se desvanece: crece y te envuelve al atravesarlo */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', left: ECX - RS / 2, top: ECY - RS / 2, width: RS, height: RS,
        opacity: track(Tn, 200, 360, t => eOQ(sg(t, 200, 160)), 6),
        transform: [{ scale: track(Tn, 1500, 1800, ringScaleAt, 12) }],
      }}>
        <RingArt
          id={`ring-${theme}`}
          dashOffset={dashOffset}
          tailStyle={i => {
            const k = TAIL[i];
            return {
              opacity: track(Tn, k.t0, k.t0 + 130, t => k.al * cl(sg(t, k.t0, 130) * 2), 6),
              transform: [{ scale: track(Tn, k.t0, k.t0 + 130, t => eOB(sg(t, k.t0, 130)), 8) }],
            };
          }}
        />
      </Animated.View>

      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, opacity: itemsOpacity }}>
        {/* Resplandor azul detrás del emblema */}
        <View style={{ position: 'absolute', left: ECX - (R + 26), top: ECY - 8 - (R + 26), width: (R + 26) * 2, height: (R + 26) * 2 }}>
          <Svg width={(R + 26) * 2} height={(R + 26) * 2}>
            <Defs>
              <RadialGradient id={`glow-${theme}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#2563eb" stopOpacity={0.16} />
                <Stop offset="0.7" stopColor="#22d3ee" stopOpacity={0.05} />
                <Stop offset="1" stopColor="#22d3ee" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={R + 26} cy={R + 26} r={R + 26} fill={`url(#glow-${theme})`} />
          </Svg>
        </View>

        {/* Píxeles del módulo — debajo de las letras: nacen DETRÁS de la X */}
        {theme === 'eris' && <ErisPixels T={Tn} />}
        {theme === 'forge' && <ForgePixels T={Tn} />}
        {theme === 'finanzas' && <FinanzasPixels T={Tn} accent={accent} soft={soft} />}
        {theme === 'inventario' && <InventarioPixels T={Tn} accent={accent} soft={soft} />}

        {/* La forma primitiva: bloques que luego se disuelven */}
        {BLOCKS.map((b, i) => (
          <Sq key={`bl${i}`} x={b.x} y={b.y} size={CELL - 1} color={b.col} radius={1}
            style={{
              opacity: track(Tn, b.d, b.o + 130, t => (t < b.d ? 0 : (b.isX ? 1 : 0.85) * (1 - sg(t, b.o, 130) * 0.5) * (t >= b.o + 130 ? 0 : 1)), 10),
              transform: [{ scale: track(Tn, b.d, b.o + 130, t => eOB(sg(t, b.d, 110)) * (1 - eOC(sg(t, b.o, 130))), 12) }],
            }} />
        ))}

        {/* A y S nítidas */}
        <Animated.View style={{
          position: 'absolute', left: ECX + AX, top: ECY + TOPY, width: TOT, height: CAP,
          opacity: track(Tn, 540, 680, t => eOQ(sg(t, 540, 140)), 6),
          transform: [{ scale: track(Tn, 540, 680, t => 1.04 - 0.04 * eOC(sg(t, 540, 140)), 6) }],
        }}>
          <Svg width={TOT} height={CAP}>
            <Path d={A_PATH} fill={INK} fillRule="evenodd" />
            <Path d={S_PATH} stroke={INK} strokeWidth={S_SW} fill="none" strokeLinecap="butt" />
          </Svg>
        </Animated.View>

        {/* X: dos trazos cruzados en degradado, revelados como barrido */}
        <View style={{ position: 'absolute', left: ECX + XX, top: ECY + TOPY, width: WX, height: CAP }}>
          <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: WX, height: CAP, overflow: 'hidden', transform: [{ translateY: w1 }] }}>
            <Animated.View style={{ width: WX, height: CAP, transform: [{ translateY: neg(w1) }] }}>
              <Svg width={WX} height={CAP}>
                <Defs>
                  <LinearGradient id={`x1-${theme}`} x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#38bdf8" />
                    <Stop offset="1" stopColor="#1d4ed8" />
                  </LinearGradient>
                </Defs>
                <Polygon points={ptsStr(XP1)} fill={`url(#x1-${theme})`} />
              </Svg>
            </Animated.View>
          </Animated.View>
          <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: WX, height: CAP, overflow: 'hidden', transform: [{ translateY: w2 }] }}>
            <Animated.View style={{ width: WX, height: CAP, transform: [{ translateY: neg(w2) }] }}>
              <Svg width={WX} height={CAP}>
                <Defs>
                  <LinearGradient id={`x2-${theme}`} x1="0" y1="1" x2="1" y2="0">
                    <Stop offset="0" stopColor="#22d3ee" />
                    <Stop offset="1" stopColor="#2563eb" />
                  </LinearGradient>
                </Defs>
                <Polygon points={ptsStr(XP2)} stroke={BG} strokeWidth={2.5} strokeLinejoin="miter" fill={`url(#x2-${theme})`} />
                <Polygon points={ptsStr(XP2)} fill={`url(#x2-${theme})`} />
              </Svg>
            </Animated.View>
          </Animated.View>
          {/* Brillo que cruza la X una vez formada */}
          <Animated.View style={{
            position: 'absolute', left: 0, top: 0, width: WX, height: CAP,
            opacity: track(Tn, 760, 1060, t => 0.5 * Math.sin(Math.PI * sg(t, 760, 300)), 10),
          }}>
            <Svg width={WX} height={CAP}>
              <Defs>
                <ClipPath id={`xc-${theme}`}>
                  <Polygon points={ptsStr(XP1)} />
                  <Polygon points={ptsStr(XP2)} />
                </ClipPath>
              </Defs>
              <G clipPath={`url(#xc-${theme})`}>
                <G rotation={22} origin={`${WX / 2}, ${CAP / 2}`}>
                  <AnimatedRect
                    x={track(Tj, 760, 1060, t => -20 + (WX + 40) * eIOQ(sg(t, 760, 300)), 12)}
                    y={-12} width={7} height={CAP + 24} fill="#ffffff"
                  />
                </G>
              </G>
            </Svg>
          </Animated.View>
        </View>

        {/* Tagline dentro del portal */}
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', left: 0, right: 0, top: ECY + YB + 13, alignItems: 'center',
          opacity: track(Tn, 900, 1200, t => eOQ(sg(t, 900, 300)), 6),
          transform: [{ translateY: track(Tn, 900, 1240, t => 5 * (1 - eOC(sg(t, 900, 340))), 6) }],
        }}>
          <Text style={s.tag}>Artificial eXperience</Text>
          <Text style={s.tag}>System</Text>
        </Animated.View>

        {/* Nombre del módulo bajo el portal */}
        {label && (
          <Animated.View pointerEvents="none" style={[s.labelRow, {
            opacity: track(Tn, 980, 1260, t => eOC(sg(t, 980, 280)), 6),
            transform: [{ translateY: track(Tn, 980, 1340, t => 10 * (1 - eOC(sg(t, 980, 360))), 6) }],
          }]}>
            <Animated.View style={[s.flank, { backgroundColor: accent, transformOrigin: 'right', transform: [{ scaleX: track(Tn, 1060, 1520, t => eOC(sg(t, 1060, 460)), 6) }] }]} />
            <Text style={[s.labelText, { color: accent, textShadowColor: `${accent}59` }]}>{label}</Text>
            <Animated.View style={[s.flank, { backgroundColor: accent, transformOrigin: 'left', transform: [{ scaleX: track(Tn, 1060, 1520, t => eOC(sg(t, 1060, 460)), 6) }] }]} />
          </Animated.View>
        )}
      </Animated.View>
    </>
  );
}

// ─── Componente ───────────────────────────────────────────────
export type PortalPhase = 'hidden' | 'entering' | 'open' | 'exiting';

interface Props {
  phase: PortalPhase;
  onEnterComplete?: () => void;
  onExitComplete?: () => void;
  children: React.ReactNode;
  label?: string;
  theme?: PortalTheme;
  presentOnly?: boolean;
  /** ¿El contenido ya cargó? Si no, el portal espera antes de abrirse (ver HOLD_AT). Por defecto sí. */
  ready?: boolean;
  /** Color del ícono de Eris mientras espera (el del módulo). */
  tint?: MarkTint;
}

// Máscara: un círculo enorme con un hueco del tamaño del portal. Al escalarla
// el hueco crece y deja ver el destino — el efecto de "atravesar" el anillo.
const MASK_OUT = Math.ceil(Math.hypot(W / 2, Math.max(ECY, H - ECY))) + 40;
const HOLE = R - 3;

export function PortalOverlay({ phase, onEnterComplete, onExitComplete, children, label, theme = 'eris', presentOnly, ready = true, tint = 'chat' }: Props) {
  const Tn = useRef(new Animated.Value(0)).current;   // nativo
  const Tj = useRef(new Animated.Value(0)).current;   // JS (props de SVG y contenido)
  const En = useRef(new Animated.Value(0)).current;   // salida
  const onEnterRef = useRef(onEnterComplete);
  const onExitRef = useRef(onExitComplete);
  onEnterRef.current = onEnterComplete;
  onExitRef.current = onExitComplete;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const resumeRef = useRef<null | (() => void)>(null);
  const [holding, setHolding] = useState(false);
  const holdOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase === 'entering') {
      Tn.setValue(0); Tj.setValue(0); En.setValue(0);
      let alive = true;
      let cur: Animated.CompositeAnimation | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const seg = (from: number, to: number, done: () => void) => {
        cur = Animated.parallel([
          Animated.timing(Tn, { toValue: to, duration: (to - from) / SPEED, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(Tj, { toValue: to, duration: (to - from) / SPEED, easing: Easing.linear, useNativeDriver: false }),
        ]);
        cur.start(({ finished }) => { if (finished && alive) done(); });
      };
      // Atravesar el portal (con tope de espera: si el módulo nunca avisa, igual se abre)
      const cross = () => {
        resumeRef.current = null;
        if (timer) clearTimeout(timer);
        setHolding(false);
        seg(HOLD_AT, T_END, () => onEnterRef.current?.());
      };
      seg(0, HOLD_AT, () => {
        if (readyRef.current) { cross(); return; }
        setHolding(true);
        resumeRef.current = cross;
        timer = setTimeout(cross, HOLD_MAX_MS);
      });
      return () => { alive = false; cur?.stop(); if (timer) clearTimeout(timer); resumeRef.current = null; setHolding(false); };
    }
    if (phase === 'exiting') {
      // El de inicio ya terminó transparente (atravesaste el portal): no hay nada que cerrar.
      if (presentOnly) { onExitRef.current?.(); return; }
      En.setValue(0);
      const anim = Animated.timing(En, { toValue: 1, duration: EXIT_MS, easing: Easing.linear, useNativeDriver: true });
      anim.start(({ finished }) => { if (finished) onExitRef.current?.(); });
      return () => anim.stop();
    }
  }, [phase]);

  // El módulo avisó que está listo mientras el portal esperaba: se atraviesa
  useEffect(() => { if (ready && resumeRef.current) resumeRef.current(); }, [ready]);
  useEffect(() => {
    Animated.timing(holdOp, { toValue: holding ? 1 : 0, duration: 260, useNativeDriver: true }).start();
  }, [holding]);

  const lockup = useMemo(
    () => <Lockup Tn={Tn} Tj={Tj} theme={theme} label={label} />,
    [theme, label],
  );

  const enter = useMemo(() => ({
    // El de inicio viene de la pantalla de carga (también oscura): parte cubierto, sin dejar ver la app un instante
    backdrop: track(Tn, 0, 1620, t => (presentOnly ? 1 - eOQ(sg(t, 1500, 120)) : eOQ(sg(t, 0, 180))), 24),
    content: presentOnly ? 0 : track(Tj, 1500, 1620, t => eOQ(sg(t, 1500, 120)), 6),
    maskOpacity: track(Tn, 0, 180, t => eOQ(sg(t, 0, 180)), 6),
    maskScale: track(Tn, 1500, 1800, ringScaleAt, 12),
  }), [presentOnly]);

  // Salida de Forge/Finanzas: el portal se cierra sobre el contenido y se desvanece.
  const exit = useMemo(() => ({
    content: track(En, 0, 0.45, p => 1 - eOQ(sg(p, 0, 0.45)), 6),
    maskScale: track(En, 0, 0.5, p => 7 - 6 * eOC(sg(p, 0, 0.5)), 10),
    ringOpacity: track(En, 0, 0.12, p => sg(p, 0, 0.12), 3),
    root: track(En, 0.6, 1, p => 1 - sg(p, 0.6, 0.4) * sg(p, 0.6, 0.4), 6),
  }), []);

  // ⚠️ El nodo del contenido (con el WebView) conserva tipo y posición en
  // todas las fases — si se remontara, el WebView se destruye y puede
  // crashear. Por eso cada hijo lleva key y solo cambia su `style`.
  const isEnter = phase === 'entering';
  const isExit = phase === 'exiting';

  const contentStyle = phase === 'open'
    ? { opacity: presentOnly ? 0 : 1 }
    : { opacity: isExit ? exit.content : enter.content };

  return (
    <Animated.View
      // Oculto pero montado: Forge y Finanzas quedan vivos tras la primera apertura (volver a entrar es instantáneo).
      // Se saca de la pantalla en vez de usar display:none: con la arquitectura nueva, display:none puede desmontar
      // la vista nativa y el WebView se recargaría (o se caería), justo lo que se quiere evitar.
      style={{
        position: 'absolute', left: 0, top: 0, width: W, height: H,
        opacity: phase === 'hidden' ? 0 : isExit ? exit.root : 1,
        transform: [{ translateX: phase === 'hidden' ? W * 3 : 0 }],
      }}
      pointerEvents={phase === 'hidden' ? 'none' : 'box-none'}
    >
      <Animated.View key="backdrop" pointerEvents="none" style={{
        position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundColor: BG,
        opacity: isEnter ? enter.backdrop : (presentOnly ? 0 : 1),
      }} />

      <Animated.View key="content" style={[{ position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundColor: BG }, contentStyle]}>
        {children}
      </Animated.View>

      <Animated.View key="mask" pointerEvents="none" style={{
        position: 'absolute', left: ECX - MASK_OUT, top: ECY - MASK_OUT,
        width: MASK_OUT * 2, height: MASK_OUT * 2, borderRadius: MASK_OUT,
        borderWidth: MASK_OUT - HOLE, borderColor: BG,
        opacity: isEnter ? enter.maskOpacity : isExit ? 1 : 0,
        transform: [{ scale: isEnter ? enter.maskScale : isExit ? exit.maskScale : 1 }],
      }} />

      {isEnter && <React.Fragment key="lockup">{lockup}</React.Fragment>}

      {/* Esperando al módulo: Eris "pensando" en su color, bajo el nombre del módulo */}
      {isEnter && holding && (
        <Animated.View key="hold" pointerEvents="none" style={{ position: 'absolute', left: W / 2 - 26, top: LT + 40, width: 52, height: 52, alignItems: 'center', justifyContent: 'center', opacity: holdOp }}>
          <ErisMarkView size={52} state="thinking" tint={tint} persona={PersonaStore.get()} disc={false}
            fallback={<ActivityIndicator color={THEMES[theme].accent} />} />
        </Animated.View>
      )}

      {isExit && (
        <Animated.View key="exitRing" pointerEvents="none" style={{
          position: 'absolute', left: ECX - RS / 2, top: ECY - RS / 2, width: RS, height: RS,
          opacity: exit.ringOpacity, transform: [{ scale: exit.maskScale }],
        }}>
          <RingArt id={`exit-${theme}`} dashOffset={0} tailStyle={() => null} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

const s = {
  tag: {
    fontSize: 10, fontWeight: '500' as const, letterSpacing: 0.6, lineHeight: 14,
    color: 'rgba(236,232,228,0.62)', textAlign: 'center' as const,
  },
  labelRow: {
    position: 'absolute' as const, left: 0, right: 0, top: LT,
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  labelText: {
    fontSize: 15, fontWeight: '800' as const, letterSpacing: 8,
    // letterSpacing también agrega espacio tras la última letra: el padding lo compensa.
    paddingLeft: 8,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12,
  },
  flank: { width: 30, height: 1, opacity: 0.55, marginHorizontal: 14 },
};

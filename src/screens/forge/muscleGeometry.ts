// ============================================================
// Forge — la geometría del mapa muscular (fase I8, 2026-10-23). Pura (sin React Native): la usan MuscleMap y las pruebas.
// viewBox 0 20 200 360. Cada músculo es un polígono del lado izquierdo y su espejo; se dibuja suavizado y el toque se
// resuelve con el mismo polígono (punto dentro), o el más cercano si el dedo cae en el borde.
// ============================================================

export type Pt = [number, number];
export type Shape = { sub: string; pts: Pt[] };
const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [200 - x, y] as Pt);
const both = (sub: string, pts: Pt[]): Shape[] => [{ sub, pts }, { sub, pts: mirror(pts) }];

const SIL_LEFT: Pt[] = [
  [92, 60], [91, 70], [78, 74], [60, 78], [50, 86], [46, 100], [44, 122], [42, 146], [38, 172], [36, 200], [33, 214], [37, 228],
  [45, 224], [48, 206], [54, 176], [58, 150], [62, 128], [66, 112], [70, 140], [72, 168], [68, 190], [70, 232], [74, 276], [76, 300],
  [74, 332], [78, 364], [73, 380], [95, 384], [93, 366], [95, 330], [97, 300], [99, 250], [100, 206],
];
export const SILHOUETTE: Pt[] = [...SIL_LEFT, ...mirror(SIL_LEFT).reverse().slice(1)];

export const FRONT: Shape[] = [
  ...both('delt_lat', [[56, 81], [62, 79], [58, 100], [50, 104], [47, 94], [50, 86]]),
  ...both('delt_ant', [[63, 79], [73, 81], [74, 92], [67, 106], [58, 101], [57, 89]]),
  ...both('pec_sup', [[75, 84], [98, 82], [98, 96], [79, 99], [72, 93]]),
  ...both('pec_med', [[72, 97], [98, 99], [98, 116], [86, 121], [74, 115], [68, 106]]),
  ...both('biceps', [[52, 107], [60, 109], [62, 128], [58, 146], [50, 145], [47, 125]]),
  ...both('antebrazo', [[46, 151], [56, 151], [54, 176], [48, 201], [41, 199], [40, 176]]),
  ...both('oblicuos', [[72, 119], [86, 123], [87, 170], [78, 174], [72, 160], [70, 138]]),
  { sub: 'abs', pts: [[89, 121], [111, 121], [112, 150], [110, 176], [100, 181], [90, 176], [88, 150]] },
  { sub: 'core_prof', pts: [[80, 178], [91, 181], [100, 189], [109, 181], [120, 178], [116, 190], [100, 199], [84, 190]] },
  ...both('cuadriceps', [[72, 197], [96, 205], [96, 250], [92, 282], [80, 286], [74, 262], [70, 228]]),
  ...both('gemelos', [[76, 306], [86, 304], [88, 330], [84, 358], [78, 356], [74, 332]]),
];
export const BACK: Shape[] = [
  { sub: 'trapecio', pts: [[100, 62], [110, 66], [124, 76], [114, 87], [106, 110], [100, 118], [94, 110], [86, 87], [76, 76], [90, 66]] },
  ...both('delt_post', [[58, 80], [72, 82], [70, 96], [60, 104], [50, 98], [50, 86]]),
  ...both('triceps', [[48, 105], [58, 109], [60, 128], [56, 146], [48, 145], [45, 125]]),
  ...both('antebrazo', [[46, 151], [56, 151], [54, 176], [48, 201], [41, 199], [40, 176]]),
  ...both('dorsal', [[74, 96], [92, 113], [96, 150], [84, 160], [74, 144], [68, 118]]),
  ...both('lumbar', [[88, 152], [98, 154], [98, 184], [89, 182]]),
  ...both('femoral', [[70, 187], [98, 187], [98, 212], [86, 219], [72, 211]]),
  ...both('femoral', [[72, 215], [96, 219], [94, 262], [88, 284], [78, 284], [72, 252]]),
  ...both('gemelos', [[74, 300], [88, 298], [90, 322], [86, 350], [78, 350], [72, 326]]),
];
// Las líneas que separan (abdominales, pecho, columna): solo dibujo
export const FRONT_LINES: Array<[number, number, number, number]> = [[100, 121, 100, 178], [90, 135, 110, 135], [90, 149, 110, 149], [91, 163, 109, 163], [100, 84, 100, 116]];
export const BACK_LINES: Array<[number, number, number, number]> = [[100, 118, 100, 186]];

/** Polígono → trazo suave (Catmull-Rom cerrado). */
export function smooth(pts: Pt[]): string {
  const n = pts.length;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return `${d}Z`;
}
export const inside = ([x, y]: Pt, pts: Pt[]): boolean => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const center = (pts: Pt[]): Pt => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
/** El músculo en ese punto (o el más cercano, si el dedo cayó en el borde). Puro: lo usan las pruebas. */
export function muscleAt(x: number, y: number, back: boolean): string | null {
  const shapes = back ? BACK : FRONT;
  for (let i = shapes.length - 1; i >= 0; i--) if (inside([x, y], shapes[i].pts)) return shapes[i].sub;
  let best: { sub: string; d: number } | null = null;
  for (const sh of shapes) {
    const [cx, cy] = center(sh.pts);
    const d = Math.hypot(cx - x, cy - y);
    if (!best || d < best.d) best = { sub: sh.sub, d };
  }
  return best && best.d <= 14 ? best.sub : null;
}

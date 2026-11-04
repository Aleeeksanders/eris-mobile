// ============================================================
// Forge — el avatar vectorial: un esqueleto con ángulos por pose de cada disciplina (fase I9, 2026-10-23). Puro (sin
// React Native): lo dibuja ForgeAvatar y lo usan las pruebas. Decisión del usuario: figura vectorial dibujada por la app.
//
// Ángulos ABSOLUTOS en grados: 0 = hacia abajo, 90 = hacia la derecha (adelante), 180 = hacia arriba, −90 = atrás.
// La figura mira a la derecha. «N» = el lado cercano (se dibuja adelante), «F» = el lejano (atrás, más oscuro).
// viewBox 0 0 200 240; el suelo de cada pose va en `ground`.
// ============================================================

export type Pt = [number, number];
export interface Pose {
  hip: Pt;
  torso: number;
  head?: number;
  /** [brazo, antebrazo] */
  armN: [number, number]; armF: [number, number];
  /** [muslo, pierna] */
  legN: [number, number]; legF: [number, number];
  /** ángulo de cada pie (por defecto, adelante) */
  footN?: number; footF?: number;
  ground: number;
  /** en el aire (la sombra se achica) */
  air?: boolean;
  /** las líneas de movimiento */
  motion?: 'patada' | 'giro' | 'salto' | 'golpe' | null;
}

export const LEN = { torso: 58, neck: 7, head: 11, upper: 28, fore: 26, thigh: 38, shin: 38, foot: 11 };
/** Grosor de cada parte (lo que se ve como músculo). */
export const WIDTH = { upper: 12.5, fore: 10, thigh: 17, shin: 12.5, foot: 6.5 };

/** Las poses por disciplina (y la base, sin clase). */
export const POSES: Record<string, Pose> = {
  // De pie, relajado
  base: { hip: [100, 128], torso: 180, armN: [6, 10], armF: [-6, -2], legN: [5, 0], legF: [-6, -2], ground: 208 },
  // Guardia ortodoxa soltando el jab
  boxeo: { hip: [92, 132], torso: 172, armN: [96, 92], armF: [40, 160], legN: [22, 4], legF: [-26, -10], footF: 70, ground: 208, motion: 'golpe' },
  // Patada lateral alta, inclinado atrás
  taekwondo: { hip: [96, 130], torso: 205, armN: [60, 150], armF: [-60, -20], legN: [112, 108], legF: [-8, 2], footN: 195, ground: 208, motion: 'patada' },
  // Zenkutsu dachi con oi-zuki (puño al frente, el otro a la cadera)
  karate: { hip: [100, 150], torso: 180, armN: [90, 90], armF: [-30, 90], legN: [45, 0], legF: [-38, -38], footF: 60, ground: 217, motion: 'golpe' },
  // Rodillazo en el clinch (las manos tirando de la nuca)
  muay_thai: { hip: [96, 132], torso: 192, armN: [115, 95], armF: [125, 100], legN: [150, 20], legF: [-6, 4], footF: 60, ground: 210, motion: 'patada' },
  // Parada de manos
  calistenia: { hip: [100, 96], torso: 0, head: 0, armN: [4, 0], armF: [-4, 0], legN: [176, 178], legF: [184, 182], footN: 180, footF: 180, ground: 205 },
  // En el aire, saltando un obstáculo
  parkour: { hip: [86, 118], torso: 128, armN: [70, 60], armF: [76, 66], legN: [110, 20], legF: [95, 10], ground: 212, air: true, motion: 'salto' },
  // Patada en el aire con giro
  tricking: { hip: [104, 118], torso: 215, armN: [230, 240], armF: [100, 80], legN: [140, 135], legF: [60, 170], footN: 220, ground: 212, air: true, motion: 'giro' },
};

const rad = (d: number) => (d * Math.PI) / 180;
/** La dirección de un ángulo (0 = abajo, 90 = derecha). */
export const dir = (deg: number): Pt => [Math.sin(rad(deg)), Math.cos(rad(deg))];
const add = (p: Pt, d: Pt, k: number): Pt => [p[0] + d[0] * k, p[1] + d[1] * k];
const r1 = (p: Pt): Pt => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];

export type Part = 'upperN' | 'foreN' | 'upperF' | 'foreF' | 'thighN' | 'shinN' | 'thighF' | 'shinF' | 'footN' | 'footF';
export interface Seg { part: Part; a: Pt; b: Pt; w: number; near: boolean }
export interface Skeleton {
  segs: Seg[];
  /** el torso como polígono (hombros más anchos que la cintura) */
  torso: Pt[];
  head: { c: Pt; r: number };
  shoulderN: Pt; shoulderF: Pt; hipN: Pt; hipF: Pt; neck: Pt;
  handN: Pt; handF: Pt; ankleN: Pt; ankleF: Pt;
}

/** Los puntos del cuerpo para una pose (cinemática directa). */
export function skeleton(p: Pose): Skeleton {
  const td = dir(p.torso);
  const perp: Pt = [td[1], -td[0]]; // perpendicular al torso
  const neck = add(p.hip, td, LEN.torso);
  const shoulderBase = add(neck, td, -6);
  const shoulderN = add(shoulderBase, perp, 5), shoulderF = add(shoulderBase, perp, -5);
  const hipN = add(p.hip, perp, 4), hipF = add(p.hip, perp, -4);
  const head = { c: add(neck, dir(p.head ?? p.torso), LEN.neck + LEN.head), r: LEN.head };
  const limb = (from: Pt, [a, b]: [number, number], l1: number, l2: number) => { const mid = add(from, dir(a), l1); return [mid, add(mid, dir(b), l2)] as [Pt, Pt]; };
  const [elbowN, handN] = limb(shoulderN, p.armN, LEN.upper, LEN.fore);
  const [elbowF, handF] = limb(shoulderF, p.armF, LEN.upper, LEN.fore);
  const [kneeN, ankleN] = limb(hipN, p.legN, LEN.thigh, LEN.shin);
  const [kneeF, ankleF] = limb(hipF, p.legF, LEN.thigh, LEN.shin);
  const toeN = add(ankleN, dir(p.footN ?? 90), LEN.foot), toeF = add(ankleF, dir(p.footF ?? 90), LEN.foot);
  const segs: Seg[] = [
    { part: 'thighF', a: hipF, b: kneeF, w: WIDTH.thigh, near: false }, { part: 'shinF', a: kneeF, b: ankleF, w: WIDTH.shin, near: false }, { part: 'footF', a: ankleF, b: toeF, w: WIDTH.foot, near: false },
    { part: 'upperF', a: shoulderF, b: elbowF, w: WIDTH.upper, near: false }, { part: 'foreF', a: elbowF, b: handF, w: WIDTH.fore, near: false },
    { part: 'thighN', a: hipN, b: kneeN, w: WIDTH.thigh, near: true }, { part: 'shinN', a: kneeN, b: ankleN, w: WIDTH.shin, near: true }, { part: 'footN', a: ankleN, b: toeN, w: WIDTH.foot, near: true },
    { part: 'upperN', a: shoulderN, b: elbowN, w: WIDTH.upper, near: true }, { part: 'foreN', a: elbowN, b: handN, w: WIDTH.fore, near: true },
  ].map((s) => ({ ...s, a: r1(s.a), b: r1(s.b) })) as Seg[];
  // torso: hombros 13 de cada lado, cintura 9
  const torso: Pt[] = [add(shoulderBase, perp, 13), add(shoulderBase, perp, -13), add(p.hip, perp, -9), add(p.hip, perp, 9)].map(r1);
  return { segs, torso, head: { c: r1(head.c), r: head.r }, shoulderN: r1(shoulderN), shoulderF: r1(shoulderF), hipN: r1(hipN), hipF: r1(hipF), neck: r1(neck), handN: r1(handN), handF: r1(handF), ankleN: r1(ankleN), ankleF: r1(ankleF) };
}

/** La pose de una clase (sin clase o desconocida: de pie). */
export const poseOf = (cls: string | null | undefined): Pose => POSES[cls ?? ''] ?? POSES.base;

/** Qué subgrupos colorean cada parte (el promedio de sus niveles). */
export const PART_SUBS: Record<Part | 'torso' | 'shoulder', string[]> = {
  upperN: ['biceps', 'triceps'], upperF: ['biceps', 'triceps'], foreN: ['antebrazo'], foreF: ['antebrazo'],
  thighN: ['cuadriceps', 'femoral'], thighF: ['cuadriceps', 'femoral'], shinN: ['gemelos'], shinF: ['gemelos'], footN: [], footF: [],
  torso: ['pec_med', 'pec_sup', 'abs', 'dorsal'], shoulder: ['delt_ant', 'delt_lat', 'delt_post'],
};

/** La caja que ocupa la figura (para revisar que nada se salga del dibujo). */
export function bounds(sk: Skeleton): { minX: number; maxX: number; minY: number; maxY: number } {
  const pts: Pt[] = [...sk.segs.flatMap((s) => [s.a, s.b]), ...sk.torso, [sk.head.c[0] - sk.head.r, sk.head.c[1] - sk.head.r], [sk.head.c[0] + sk.head.r, sk.head.c[1] + sk.head.r]];
  return { minX: Math.min(...pts.map((p) => p[0])), maxX: Math.max(...pts.map((p) => p[0])), minY: Math.min(...pts.map((p) => p[1])), maxY: Math.max(...pts.map((p) => p[1])) };
}

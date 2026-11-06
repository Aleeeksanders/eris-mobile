// ============================================================
// Eris Mobile — Forge 2.0: fuerza real, músculos de la semana y árbol automático (F4, 2026-10-17)
//
// Puro; se copia tal cual al servidor (scripts/sync_forge_core.ts).
//
// FUERZA: tu 1RM estimado (forgeTrain.e1rmOf: Epley con las reps en reserva) contra los estándares de Strength Level
//   (strengthlevel.com, tablas en kg por sexo y peso corporal, consultadas el 2026-10-17). Cada nivel es un percentil de
//   quienes entrenan: Principiante 5 · Novato 20 · Intermedio 50 · Avanzado 80 · Élite 95. El «score de fuerza» 0–100 es
//   ese percentil estimado (interpolado entre niveles), el mejor de cada patrón (empuje, tirón, pierna), promediado.
//   Sin ajuste por edad (todavía). Dominadas y fondos: Strength Level los mide en repeticiones con tu peso; se pasan a
//   1RM relativo con Epley (asistidas y lastradas cuentan con su carga efectiva).
// MÚSCULOS: series de la semana por subgrupo (principal = 1 serie, secundario = ½) contra la guía del ACSM (2026):
//   al menos 10 por músculo a la semana, con techo de beneficio cerca de 18–20.
// ÁRBOL AUTOMÁTICO: los pasos que se pueden medir con lo que REALMENTE entrenaste (no con la pestaña Rutina) se marcan
//   solos: «8 dominadas estrictas» = una serie de 8+ sin asistencia; «Plancha 45 s»; «Sentadilla 3x20» = 3 series de
//   20+ el mismo día. Los pasos de técnica (parkour, acrobacia, progresiones) siguen a mano. Desmarcar uno lo respeta.
// ============================================================

import { L, catalog, effKg, isStrict, setValue, type ForgeState, type FSet } from './forgeCore';
import type { StdLift, SubId } from './forgeCatalog';
import { e1rmOf } from './forgeTrain';
import { skillById, isMasteredAny } from './forgeSkillsExt';

// ─── Estándares (kg de 1RM por peso corporal; fila = [peso, principiante, novato, intermedio, avanzado, élite]) ───
type Rows = number[][];
const M = (...r: Rows) => r;
const STD: Partial<Record<StdLift, { m: Rows; f: Rows; perDumbbell?: boolean }>> = {
  bench: {
    m: M([50, 27, 41, 58, 78, 101], [60, 37, 53, 72, 95, 119], [70, 47, 64, 85, 110, 136], [80, 56, 75, 98, 124, 151], [90, 65, 85, 109, 137, 165], [100, 73, 95, 120, 149, 179], [110, 81, 104, 131, 160, 191], [120, 89, 113, 140, 171, 203], [130, 97, 121, 150, 181, 214]),
    f: M([40, 10, 19, 33, 49, 68], [50, 14, 25, 40, 58, 79], [60, 19, 31, 47, 66, 88], [70, 22, 36, 53, 74, 96], [80, 26, 40, 59, 80, 104], [90, 30, 45, 64, 86, 111], [100, 33, 49, 69, 92, 117], [110, 36, 53, 73, 97, 123], [120, 39, 56, 77, 102, 128]),
  },
  squat: {
    m: M([50, 36, 55, 78, 106, 137], [60, 49, 71, 98, 129, 162], [70, 62, 86, 116, 149, 185], [80, 75, 101, 132, 168, 206], [90, 87, 115, 148, 186, 226], [100, 98, 128, 163, 203, 244], [110, 109, 140, 177, 218, 261], [120, 120, 152, 191, 233, 278], [130, 130, 164, 203, 247, 293]),
    f: M([40, 19, 34, 53, 76, 102], [50, 26, 42, 63, 88, 116], [60, 32, 49, 72, 99, 129], [70, 37, 56, 80, 109, 140], [80, 42, 62, 88, 117, 149], [90, 47, 68, 94, 125, 158], [100, 52, 74, 101, 132, 166], [110, 56, 79, 107, 139, 174], [120, 60, 83, 112, 145, 181]),
  },
  deadlift: {
    m: M([50, 46, 68, 96, 129, 164], [60, 61, 86, 117, 153, 191], [70, 75, 103, 137, 175, 216], [80, 89, 119, 155, 196, 239], [90, 102, 134, 172, 215, 260], [100, 114, 148, 188, 232, 279], [110, 126, 161, 203, 249, 298], [120, 137, 174, 217, 265, 315], [130, 148, 186, 231, 280, 331]),
    f: M([40, 26, 43, 65, 92, 121], [50, 34, 52, 76, 105, 136], [60, 40, 60, 86, 116, 149], [70, 46, 68, 95, 126, 160], [80, 52, 74, 102, 135, 170], [90, 57, 80, 109, 143, 180], [100, 61, 86, 116, 151, 188], [110, 66, 91, 122, 158, 196], [120, 70, 96, 128, 164, 203]),
  },
  ohp: {
    m: M([50, 15, 24, 36, 51, 67], [60, 21, 32, 45, 62, 79], [70, 27, 39, 54, 72, 90], [80, 33, 46, 62, 81, 101], [90, 38, 53, 70, 90, 111], [100, 44, 59, 77, 98, 120], [110, 49, 65, 84, 105, 128], [120, 54, 71, 90, 113, 136], [130, 59, 76, 97, 119, 144]),
    f: M([40, 7, 13, 22, 33, 45], [50, 10, 17, 27, 38, 51], [60, 12, 20, 31, 43, 57], [70, 15, 23, 34, 47, 62], [80, 17, 26, 37, 51, 66], [90, 19, 28, 40, 54, 70], [100, 21, 31, 43, 58, 74], [110, 23, 33, 46, 61, 77], [120, 24, 35, 48, 64, 80]),
  },
  row: {
    m: M([50, 23, 36, 52, 72, 94], [60, 31, 46, 65, 87, 111], [70, 40, 56, 77, 101, 127], [80, 48, 66, 88, 114, 141], [90, 56, 75, 99, 125, 154], [100, 63, 84, 108, 136, 166], [110, 70, 92, 118, 147, 178], [120, 77, 100, 127, 157, 188], [130, 84, 107, 135, 166, 199]),
    f: M([40, 12, 21, 33, 48, 65], [50, 15, 25, 38, 54, 72], [60, 18, 29, 43, 59, 78], [70, 20, 32, 46, 64, 83], [80, 23, 35, 50, 68, 87], [90, 25, 37, 53, 71, 91], [100, 27, 40, 56, 74, 95], [110, 29, 42, 58, 78, 99], [120, 30, 44, 61, 80, 102]),
  },
  lat_pd: {
    m: M([50, 29, 43, 60, 79, 101], [60, 35, 50, 69, 90, 113], [70, 42, 57, 77, 99, 123], [80, 47, 64, 85, 108, 133], [90, 52, 70, 92, 116, 142], [100, 57, 76, 98, 123, 150], [110, 62, 81, 104, 130, 157], [120, 66, 86, 110, 136, 164], [130, 70, 91, 115, 142, 171]),
    f: M([40, 17, 26, 38, 51, 66], [50, 20, 30, 42, 56, 72], [60, 23, 33, 46, 60, 76], [70, 25, 36, 49, 64, 81], [80, 27, 38, 52, 68, 85], [90, 29, 41, 55, 71, 88], [100, 30, 42, 56, 72, 90], [110, 32, 44, 58, 75, 93], [120, 34, 46, 61, 77, 95]),
  },
  legpress: {
    m: M([50, 51, 89, 141, 204, 275], [60, 71, 115, 173, 242, 319], [70, 90, 139, 202, 277, 359], [80, 109, 162, 230, 309, 395], [90, 127, 184, 255, 338, 429], [100, 144, 205, 280, 366, 460], [110, 160, 224, 302, 392, 489], [120, 176, 243, 324, 417, 516], [130, 191, 261, 344, 440, 542]),
    f: M([40, 28, 58, 102, 158, 223], [50, 39, 73, 122, 183, 252], [60, 49, 87, 140, 204, 277], [70, 58, 100, 155, 223, 299], [80, 67, 111, 170, 240, 319], [90, 76, 122, 183, 256, 337], [100, 83, 132, 195, 270, 353], [110, 91, 142, 206, 284, 369], [120, 98, 150, 217, 296, 383]),
  },
  db_bench: {
    perDumbbell: true,
    m: M([50, 9, 16, 24, 35, 47], [60, 13, 20, 30, 42, 55], [70, 16, 24, 35, 48, 62], [80, 19, 28, 40, 53, 68], [90, 22, 32, 44, 58, 74], [100, 25, 36, 48, 63, 79], [110, 28, 39, 52, 68, 84], [120, 31, 42, 56, 72, 89], [130, 33, 45, 59, 76, 93]),
    f: M([40, 4, 8, 14, 21, 30], [50, 5, 10, 16, 25, 34], [60, 7, 12, 19, 28, 38], [70, 8, 14, 21, 30, 41], [80, 9, 15, 23, 33, 44], [90, 10, 17, 25, 35, 46], [100, 12, 18, 27, 37, 48], [110, 13, 20, 28, 39, 51], [120, 14, 21, 30, 41, 53]),
  },
  db_press: {
    perDumbbell: true,
    m: M([50, 7, 12, 19, 27, 36], [60, 10, 15, 23, 32, 43], [70, 12, 19, 27, 37, 48], [80, 15, 22, 31, 42, 54], [90, 18, 25, 35, 46, 59], [100, 20, 28, 39, 50, 63], [110, 23, 31, 42, 54, 67], [120, 25, 34, 45, 58, 71], [130, 27, 37, 48, 61, 75]),
    f: M([40, 4, 7, 11, 16, 22], [50, 5, 8, 13, 18, 25], [60, 6, 10, 15, 20, 27], [70, 7, 11, 16, 22, 29], [80, 8, 12, 17, 24, 31], [90, 9, 13, 19, 25, 32], [100, 9, 14, 20, 27, 34], [110, 10, 15, 21, 28, 35], [120, 11, 16, 22, 29, 37]),
  },
  db_curl: {
    perDumbbell: true,
    m: M([50, 4, 9, 15, 23, 32], [60, 6, 11, 18, 26, 36], [70, 7, 12, 20, 29, 39], [80, 8, 14, 22, 32, 42], [90, 9, 16, 24, 34, 45], [100, 11, 17, 26, 36, 48], [110, 12, 19, 28, 38, 50], [120, 13, 20, 29, 40, 52], [130, 14, 21, 31, 42, 54]),
    f: M([40, 2, 5, 9, 14, 20], [50, 3, 6, 11, 16, 22], [60, 4, 7, 12, 18, 24], [70, 4, 8, 13, 19, 26], [80, 5, 9, 14, 20, 27], [90, 6, 10, 15, 22, 29], [100, 6, 10, 16, 23, 30], [110, 7, 11, 17, 24, 31], [120, 7, 12, 18, 25, 32]),
  },
  curl: {
    m: M([50, 11, 19, 30, 43, 58], [60, 15, 24, 36, 50, 66], [70, 18, 28, 41, 57, 74], [80, 22, 33, 46, 63, 80], [90, 25, 36, 51, 68, 87], [100, 28, 40, 55, 73, 92], [110, 31, 44, 60, 78, 97], [120, 34, 47, 63, 82, 102], [130, 36, 50, 67, 86, 107]),
    f: M([40, 4, 10, 17, 27, 38], [50, 6, 12, 20, 31, 43], [60, 8, 14, 23, 34, 47], [70, 9, 16, 26, 37, 51], [80, 11, 18, 28, 40, 54], [90, 12, 20, 30, 43, 57], [100, 13, 21, 32, 45, 59], [110, 14, 23, 34, 47, 62], [120, 15, 24, 36, 49, 64]),
  },
};
/**
 * Dominadas y fondos: Strength Level da repeticiones con tu peso (dominadas: hombre 0·6·14·24·34, mujer 0·0·6·14·23;
 * fondos, ~80 kg: hombre 4·10·20·31·42, mujer 0·1·9·19·30). Pasadas a 1RM ÷ peso corporal con Epley (1 + reps/30);
 * «no sale ni una» = 0,85 (y 0,6 la de principiante en mujeres, que en dominadas parte de cero).
 */
const REL: Partial<Record<StdLift, { m: number[]; f: number[] }>> = {
  pullup: { m: [0.85, 1.2, 1.47, 1.8, 2.13], f: [0.6, 0.85, 1.2, 1.47, 1.77] },
  dip: { m: [1.13, 1.33, 1.67, 2.03, 2.4], f: [0.85, 1.03, 1.3, 1.63, 2.0] },
};

export const LEVELS = ['Principiante', 'Novato', 'Intermedio', 'Avanzado', 'Élite'] as const;
const PCT = [5, 20, 50, 80, 95];

export const LIFT_NAMES: Record<string, string> = {
  bench: 'Press de banca', squat: 'Sentadilla', deadlift: 'Peso muerto', ohp: 'Press militar', row: 'Remo con barra',
  lat_pd: 'Jalón', legpress: 'Prensa', db_bench: 'Press con mancuernas', db_press: 'Press de hombros (mancuernas)',
  db_curl: 'Curl con mancuerna', curl: 'Curl con barra', pullup: 'Dominadas', dip: 'Fondos',
};
const LIFT_PATTERN: Record<string, 'empuje' | 'tiron' | 'pierna'> = {
  bench: 'empuje', ohp: 'empuje', db_bench: 'empuje', db_press: 'empuje', dip: 'empuje',
  row: 'tiron', lat_pd: 'tiron', pullup: 'tiron', curl: 'tiron', db_curl: 'tiron',
  squat: 'pierna', deadlift: 'pierna', legpress: 'pierna',
};

/** Los 5 cortes (kg) para tu sexo y peso, interpolando las filas de la tabla. */
export function thresholdsFor(lift: StdLift, sex: 'h' | 'm' | null | undefined, bodyKg: number): number[] | null {
  const rel = REL[lift];
  // Los fondos mueven ~95 % del cuerpo (lo mismo que cuenta la serie): el corte va contra esa carga
  if (rel) return (sex === 'm' ? rel.f : rel.m).map((r) => r * bodyKg * (lift === 'dip' ? 0.95 : 1));
  const st = STD[lift];
  if (!st) return null;
  const rows = sex === 'm' ? st.f : st.m;
  const bw = Math.max(rows[0][0], Math.min(rows[rows.length - 1][0], bodyKg));
  let i = 0;
  while (i < rows.length - 2 && rows[i + 1][0] < bw) i++;
  const [a, b] = [rows[i], rows[i + 1]];
  const t = (bw - a[0]) / (b[0] - a[0]);
  return [1, 2, 3, 4, 5].map((k) => a[k] + (b[k] - a[k]) * t);
}

/** Percentil estimado (0–100) y nivel para un 1RM. */
export function rateLift(lift: StdLift, sex: 'h' | 'm' | null | undefined, bodyKg: number, e1rm: number): { pct: number; level: number; name: string; next: { name: string; kg: number } | null } | null {
  const th = thresholdsFor(lift, sex, bodyKg);
  if (!th || !(e1rm > 0)) return null;
  let pct: number;
  if (e1rm <= th[0]) pct = Math.max(0, (e1rm / th[0]) * PCT[0]);
  else if (e1rm >= th[4]) pct = Math.min(99, PCT[4] + ((e1rm - th[4]) / th[4]) * 20);
  else {
    let k = 0;
    while (k < 3 && e1rm > th[k + 1]) k++;
    pct = PCT[k] + ((e1rm - th[k]) / (th[k + 1] - th[k])) * (PCT[k + 1] - PCT[k]);
  }
  const level = th.filter((x) => e1rm >= x).length - 1; // -1 = todavía no llega a principiante
  const nextIdx = level + 1;
  return {
    pct: Math.round(pct), level, name: level < 0 ? 'Empezando' : LEVELS[level],
    next: nextIdx <= 4 ? { name: LEVELS[nextIdx], kg: Math.round(th[nextIdx] * 2) / 2 } : null,
  };
}

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgoKey = (n: number, from = L.forgeNow()) => { const d = new Date(from); d.setDate(d.getDate() - n); return keyOf(d); };

/** 1RM estimado de una serie para su estándar (peso corporal sin tope de 10 reps: se compara con repeticiones). */
function setE1rm(s: ForgeState, exId: string, set: FSet): number | null {
  const ex = catalog(s)[exId];
  if (!ex?.std || set.warmup) return null;
  const load = effKg(s, ex, set);
  const bwLift = ex.std === 'pullup' || ex.std === 'dip';
  if (bwLift) {
    if (set.rir == null || set.rir > 3 || set.reps < 1 || set.reps > 40) return null;
    return Math.round(load * (1 + (set.reps + set.rir) / 30) * 10) / 10;
  }
  return e1rmOf(load, set.reps, set.rir);
}

export interface LiftRating { lift: StdLift; name: string; exId: string; e1rm: number; day: string; pct: number; level: number; levelName: string; next: { name: string; kg: number } | null; body: number }

/** Tu mejor 1RM estimado por levantamiento (ventana en días) y su nivel. */
export function liftRatings(s: ForgeState, opts: { days?: number; until?: string } = {}): LiftRating[] {
  const days = opts.days ?? 90;
  const until = opts.until ?? '9999-99-99';
  const from = daysAgoKey(days, opts.until ? new Date(`${opts.until}T12:00:00`) : L.forgeNow());
  const cat = catalog(s);
  const best: Record<string, { e1rm: number; exId: string; day: string; body: number }> = {};
  for (const [day, exs] of Object.entries(s.sessions || {})) {
    if (day < from || day > until) continue;
    for (const [exId, sets] of Object.entries(exs)) {
      const lift = cat[exId]?.std;
      if (!lift || (!STD[lift] && !REL[lift])) continue;
      for (const set of sets) {
        const v = setE1rm(s, exId, set);
        if (v != null && (!best[lift] || v > best[lift].e1rm)) best[lift] = { e1rm: v, exId, day, body: set.body ?? s.bodyKg ?? 70 };
      }
    }
  }
  const out: LiftRating[] = [];
  for (const [lift, b] of Object.entries(best)) {
    const body = s.bodyKg ?? b.body;
    const r = rateLift(lift as StdLift, s.sex, body, b.e1rm);
    if (r) out.push({ lift: lift as StdLift, name: LIFT_NAMES[lift] ?? lift, exId: b.exId, e1rm: b.e1rm, day: b.day, pct: r.pct, level: r.level, levelName: r.name, next: r.next, body });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

/**
 * Score de fuerza 0–100 (como el de nutrición): el mejor percentil de cada patrón (empuje, tirón, pierna), promediado.
 * `trend` = contra hace 4 semanas. null si no hay ningún levantamiento con estándar en los últimos 90 días.
 */
export function strengthScore(s: ForgeState, until?: string): { score: number; patterns: Partial<Record<'empuje' | 'tiron' | 'pierna', LiftRating>>; trend: number | null; missing: string[] } | null {
  const calc = (rs: LiftRating[]) => {
    const pat: Partial<Record<'empuje' | 'tiron' | 'pierna', LiftRating>> = {};
    for (const r of rs) { const p = LIFT_PATTERN[r.lift]; if (p && (!pat[p] || r.pct > pat[p]!.pct)) pat[p] = r; }
    const vals = Object.values(pat).map((r) => r!.pct);
    return { pat, score: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null };
  };
  // `until`: el score de ese día (para la curva semana a semana de Progreso)
  const now = calc(liftRatings(s, until ? { until } : {}));
  if (now.score == null) return null;
  const before = calc(liftRatings(s, { until: daysAgoKey(28, until ? new Date(`${until}T12:00:00`) : L.forgeNow()) }));
  const missing = (['empuje', 'tiron', 'pierna'] as const).filter((p) => !now.pat[p]);
  return { score: now.score, patterns: now.pat, trend: before.score == null ? null : now.score - before.score, missing };
}

// ─── Músculos: series de la semana (ACSM: ≥ 10 por músculo, techo ~18–20) ───

export const WEEKLY_MIN = 10;
export const WEEKLY_MAX = 20;

/** Series de los últimos 7 días por subgrupo: principal (2 pts) = 1 serie, secundario (1 pt) = ½. */
export function weeklySets(s: ForgeState, days = 7, until?: string): Record<string, number> {
  const out: Record<string, number> = {};
  const from = daysAgoKey(days - 1, until ? new Date(`${until}T12:00:00`) : L.forgeNow());
  const last = until ?? keyOf(L.forgeNow());
  const cat = catalog(s);
  for (const [day, exs] of Object.entries(s.sessions || {})) {
    if (day < from || day > last) continue;
    for (const [exId, sets] of Object.entries(exs)) {
      const ex = cat[exId];
      if (!ex) continue;
      const n = sets.reduce((a, x) => a + setValue(x), 0); // una serie con remate vale 1,5
      if (!n) continue;
      for (const [sub, pts] of Object.entries(ex.m || {})) out[sub] = (out[sub] || 0) + n * ((pts as number) >= 2 ? 1 : 0.5);
    }
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 2) / 2;
  return out;
}

export type VolumeState = 'nada' | 'bajo' | 'optimo' | 'alto';
export function volumeState(sets: number): VolumeState {
  return sets <= 0 ? 'nada' : sets < WEEKLY_MIN ? 'bajo' : sets <= WEEKLY_MAX ? 'optimo' : 'alto';
}

/** Los ejercicios que más trabajan un subgrupo (los que ya usas primero). */
export function exercisesFor(s: ForgeState, sub: SubId, n = 4): string[] {
  const cat = catalog(s);
  const used = new Set(Object.values(s.sessions || {}).flatMap((d) => Object.keys(d)));
  return Object.values(cat)
    .filter((e) => (e.m?.[sub] ?? 0) > 0)
    .sort((a, b) => (b.m[sub]! - a.m[sub]!) || (Number(used.has(b.id)) - Number(used.has(a.id))))
    .slice(0, n).map((e) => e.id);
}

// ─── Árbol automático ───

type Crit =
  | { kind: 'reps'; ex: string[]; min: number; strict?: boolean }          // una serie de N+ reps (sin asistencia si strict)
  | { kind: 'secs'; ex: string[]; min: number }                            // una serie de N+ segundos
  | { kind: 'sets'; ex: string[]; sets: number; min: number; secs?: boolean } // N series de M+ el mismo día (o rounds de M s)
  | { kind: 'state'; test: (s: ForgeState) => boolean; what: string };    // del estado (racha, habilidades)

const PULL = ['dom_prona', 'dom_supina', 'dom_neutra'];
/** skill → paso (índice) → criterio. Solo lo que se puede medir con lo anotado; lo demás sigue a mano. */
export const SKILL_CRITERIA: Record<string, Record<number, Crit>> = {
  f_core: { 0: { kind: 'secs', ex: ['plancha_ej'], min: 45 }, 1: { kind: 'secs', ex: ['hollow'], min: 30 } },
  f_grip: { 1: { kind: 'secs', ex: ['gripper'], min: 30 }, 2: { kind: 'secs', ex: ['gripper'], min: 60 } },
  f_squat: { 0: { kind: 'sets', ex: ['sentadilla_pc'], sets: 3, min: 20 }, 1: { kind: 'sets', ex: ['goblet'], sets: 3, min: 12 } },
  f_push: { 0: { kind: 'reps', ex: ['flexiones'], min: 5 }, 1: { kind: 'reps', ex: ['flexiones'], min: 15 }, 2: { kind: 'reps', ex: ['flexiones'], min: 25 } },
  f_hollow: { 0: { kind: 'secs', ex: ['hollow'], min: 20 }, 2: { kind: 'secs', ex: ['hollow'], min: 45 } },
  s_row: { 0: { kind: 'sets', ex: ['remo_prono', 'remo_supino'], sets: 3, min: 12 } },
  s_pull: { 0: { kind: 'reps', ex: ['dom_negativa'], min: 5 }, 1: { kind: 'reps', ex: PULL, min: 3, strict: true }, 2: { kind: 'reps', ex: PULL, min: 8, strict: true } },
  s_dip: { 1: { kind: 'reps', ex: ['dips_ej'], min: 5, strict: true }, 2: { kind: 'reps', ex: ['dips_ej'], min: 12, strict: true } },
  s_lsit: { 2: { kind: 'secs', ex: ['lsit_ej'], min: 10 } },
  s_pistol: { 2: { kind: 'reps', ex: ['pistol_ej'], min: 3 } },
  s_mu: { 0: { kind: 'reps', ex: PULL, min: 10, strict: true } },
  s_dragon: { 2: { kind: 'reps', ex: ['dragon'], min: 3 } },
  s_hspu: { 1: { kind: 'reps', ex: ['hspu'], min: 5 } },
  s_planche: { 1: { kind: 'reps', ex: ['pseudo_planche'], min: 8 } },
  s_pseudo: { 1: { kind: 'reps', ex: ['pseudo_planche'], min: 5 } },
  s_oac: { 2: { kind: 'reps', ex: ['dom_archer'], min: 5 } },
  s_archer: { 1: { kind: 'reps', ex: ['dom_archer'], min: 5 }, 2: { kind: 'reps', ex: ['dom_archer'], min: 8 } },
  s_nordic: { 2: { kind: 'reps', ex: ['nordic'], min: 3 } },
  a_cond: { 1: { kind: 'sets', ex: ['saltos'], sets: 3, min: 10 } },
  c_toji: {
    1: { kind: 'state', what: '14 habilidades dominadas', test: (s) => L.SKILLS.filter((sk: any) => sk.id !== 'c_toji' && L.isMastered(s, sk.id)).length >= 14 },
    2: { kind: 'state', what: 'racha de 30 días', test: (s) => Math.max(s.streak || 0, s.bestStreak || 0) >= 30 },
  },
};

/** Las disciplinas nuevas (fase I9): lo que se puede medir con los rounds anotados (sombra, saco, patadas, rodillazos,
 *  escalera, comba). Lo de técnica con compañero sigue a mano. */
export const EXT_CRITERIA: Record<string, Record<number, Crit>> = {
  g_guardia: { 0: { kind: 'sets', ex: ['sombra'], sets: 3, min: 120, secs: true } },
  g_gancho: { 1: { kind: 'sets', ex: ['saco'], sets: 3, min: 120, secs: true } },
  g_saco: { 0: { kind: 'sets', ex: ['saco'], sets: 3, min: 120, secs: true }, 1: { kind: 'sets', ex: ['saco'], sets: 5, min: 180, secs: true }, 2: { kind: 'sets', ex: ['saco'], sets: 6, min: 180, secs: true } },
  g_velocidad: { 0: { kind: 'sets', ex: ['cuerda'], sets: 3, min: 180, secs: true }, 2: { kind: 'secs', ex: ['cuerda'], min: 600 } },
  k_round: { 1: { kind: 'sets', ex: ['patadas_saco'], sets: 3, min: 60, secs: true } },
  k_low: { 1: { kind: 'sets', ex: ['patadas_saco'], sets: 3, min: 60, secs: true } },
  cl_knee: { 1: { kind: 'sets', ex: ['rodillazos'], sets: 3, min: 60, secs: true } },
  d_footwork: { 0: { kind: 'sets', ex: ['escalera'], sets: 3, min: 20, secs: true }, 2: { kind: 'sets', ex: ['cuerda'], sets: 3, min: 180, secs: true } },
  m_sombra: { 0: { kind: 'sets', ex: ['sombra'], sets: 3, min: 180, secs: true }, 1: { kind: 'sets', ex: ['sombra'], sets: 5, min: 180, secs: true } },
};
/** Los criterios de todas las habilidades (las del HTML y las nuevas). */
export const ALL_CRITERIA: Record<string, Record<number, Crit>> = { ...SKILL_CRITERIA, ...EXT_CRITERIA };

/** El criterio en palabras («una serie de 8+ sin asistencia»). */
export function critText(c: Crit): string {
  if (c.kind === 'reps') return `se marca solo con una serie de ${c.min}+${c.strict ? ' sin asistencia ni banda' : ''}`;
  if (c.kind === 'secs') return `se marca solo con una serie de ${c.min} s o más`;
  if (c.kind === 'sets') return c.secs
    ? `se marca solo con ${c.sets} rounds de ${c.min % 60 === 0 ? `${c.min / 60} min` : `${c.min} s`} o más el mismo día`
    : `se marca solo con ${c.sets} series de ${c.min}+ el mismo día`;
  return `se marca solo al llegar a ${c.what}`;
}

/** ¿Lo que entrenaste cumple el criterio? Devuelve el día en que se cumplió (o null). */
function metOn(s: ForgeState, c: Crit): string | null {
  if (c.kind === 'state') return c.test(s) ? keyOf(L.forgeNow()) : null;
  const cat = catalog(s);
  const days = Object.keys(s.sessions || {}).sort();
  for (const day of days) {
    // «5 negativas»: también cuentan las del remate de una dominada
    if (c.kind === 'reps' && c.ex.includes('dom_negativa') && Object.entries(s.sessions[day] || {}).some(([id, list]) => cat[id]?.pattern === 'tir_v' && list.some((x) => !x.warmup && x.tail?.kind === 'neg' && x.tail.reps >= c.min))) return day;
    for (const id of c.ex) {
      const ex = cat[id];
      const sets = ((s.sessions[day] || {})[id] || []).filter((x) => !x.warmup && (!('strict' in c) || !c.strict || !ex || isStrict(ex, x)));
      if (c.kind === 'sets') { if (sets.filter((x) => x.reps >= c.min).length >= c.sets) return day; }
      else if (sets.some((x) => x.reps >= c.min)) return day;
    }
  }
  return null;
}

export interface AutoSkillResult { state: ForgeState; checked: Array<{ skill: string; step: number }>; mastered: string[] }

/**
 * Marca los pasos medibles que ya cumpliste (y no desmarcaste a mano). Guarda cuáles marcó el código (`skills[id].auto`)
 * y cuáles desmarcaste (`skills[id].off`), así se puede deshacer. El HTML viejo sigue leyendo `skills[id].steps`.
 */
export function applyAutoSkills(s: ForgeState): AutoSkillResult {
  const checked: AutoSkillResult['checked'] = [];
  const mastered: string[] = [];
  let skills = s.skills || {};
  // c_toji (estado) al final: depende de lo que se domine antes
  const order = Object.keys(ALL_CRITERIA).sort((a, b) => Number(a === 'c_toji') - Number(b === 'c_toji'));
  for (const skId of order) {
    const sk = skillById(skId);
    if (!sk) continue;
    const cur = skills[skId] as any;
    const steps: boolean[] = (cur?.steps ?? sk.steps.map(() => false)).slice();
    const off: number[] = cur?.off ?? [];
    const auto: number[] = cur?.auto ?? [];
    let changed = false;
    const view = { ...s, skills };
    for (const [idxS, crit] of Object.entries(ALL_CRITERIA[skId])) {
      const idx = Number(idxS);
      if (steps[idx] || off.includes(idx)) continue;
      if (metOn(view as ForgeState, crit)) { steps[idx] = true; auto.push(idx); checked.push({ skill: skId, step: idx }); changed = true; }
    }
    if (changed) {
      const was = isMasteredAny({ skills } as any, skId);
      skills = { ...skills, [skId]: { ...(cur || {}), steps, auto: [...new Set(auto)] } };
      if (!was && isMasteredAny({ skills } as any, skId)) mastered.push(skId);
    }
  }
  return { state: checked.length ? { ...s, skills } : s, checked, mastered };
}

/**
 * Tras corregir series antiguas: los pasos que marcó el código y que ya no se cumplen vuelven a quedar pendientes. Solo los que
 * marcó el código (`auto`), nunca los marcados a mano. Se pueden volver a ganar: no quedan en `off`.
 */
export function revokeAutoSkills(s: ForgeState): ForgeState {
  let skills = s.skills || {};
  for (const [skId, cur0] of Object.entries(skills)) {
    const cur = cur0 as any;
    const auto: number[] = cur?.auto ?? [];
    if (!auto.length || !ALL_CRITERIA[skId]) continue;
    const perdidos = auto.filter((idx) => ALL_CRITERIA[skId][idx] && !metOn({ ...s, skills } as ForgeState, ALL_CRITERIA[skId][idx]));
    if (!perdidos.length) continue;
    skills = { ...skills, [skId]: { ...cur, steps: (cur.steps as boolean[]).map((v, i) => (perdidos.includes(i) ? false : v)), auto: auto.filter((i) => !perdidos.includes(i)) } };
  }
  return skills === s.skills ? s : { ...s, skills };
}

/** Desmarcar a mano un paso que se marcó solo: queda desmarcado (no se vuelve a marcar). */
export function toggleStepManual(s: ForgeState, skId: string, idx: number): ForgeState {
  const sk = skillById(skId);
  if (!sk) return s;
  const cur = (s.skills?.[skId] as any) || {};
  const steps: boolean[] = (cur.steps ?? sk.steps.map(() => false)).slice();
  steps[idx] = !steps[idx];
  const off: number[] = (cur.off ?? []).filter((i: number) => i !== idx);
  if (!steps[idx] && ALL_CRITERIA[skId]?.[idx]) off.push(idx);
  return { ...s, skills: { ...(s.skills || {}), [skId]: { ...cur, steps, off } } };
}

/** Anotar una serie y marcar lo que eso cumple del árbol (lo que usan las pantallas). */
export function logAndCheck(s: ForgeState, day: string, exId: string, set: FSet, log: (s: ForgeState, day: string, exId: string, set: FSet) => ForgeState): AutoSkillResult {
  return applyAutoSkills(log(s, day, exId, set));
}

/** «¡Dominaste Dominadas Estrictas!» / «Paso cumplido: 8 dominadas estrictas» */
export function autoSkillToast(r: AutoSkillResult): string | null {
  if (r.mastered.length) return `¡DOMINASTE ${skillById(r.mastered[0]).name.toUpperCase()}!`;
  if (r.checked.length) { const c = r.checked[0]; return `ÁRBOL: ${skillById(c.skill).steps[c.step]} ✓`; }
  return null;
}

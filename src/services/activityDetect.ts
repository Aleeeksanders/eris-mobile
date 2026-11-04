/**
 * activityDetect — actividad física SIN «modo entrenamiento» en el reloj: lógica PURA (sin React Native), con pruebas.
 *
 * Pedido del usuario (2026-10-16): «hice 2 horas de básquet… uno no se pone en modo entrenamiento con el smartwatch, hay
 * formas de leer patrones para detectar este tipo de actividades, no solo básquet». Eris solo veía las sesiones de ejercicio
 * (10 min ese día) y le decía que se moviera.
 *
 * Cómo se detecta, minuto a minuto, con lo que el reloj ya guarda en Health Connect:
 *  - Pulso: sobre el 40 % de la reserva cardíaca (Karvonen; el 40–59 % es intensidad moderada y el 60 % o más vigorosa, según
 *    el ACSM). Frecuencia máxima por edad con la fórmula de Tanaka (208 − 0,7 × edad).
 *  - Pasos: 100 o más por minuto ya es caminata enérgica (Tudor-Locke y cols., 2018).
 *  - Calorías activas del reloj: equivalentes a 3,5 MET o más.
 * Los minutos activos se juntan en bloques (una pausa de hasta 4 min no corta un partido) y un bloque cuenta desde 10 min.
 * El sueño queda fuera. Las sesiones de ejercicio que el reloj ya registró entran tal cual, sin contarlas dos veces.
 *
 * El gasto del bloque: las calorías activas del reloj si las hay; si no, por pulso (ecuación de Keytel y cols., 2005); si no,
 * por la cadencia de pasos. Si la persona dice qué fue («básquet»), se usa el MET de esa actividad (Compendio de Actividades
 * Físicas) cuando solo había pasos, porque los pasos no ven el esfuerzo de un deporte.
 */

export interface HrSample { t: number; bpm: number }
/** Un registro con duración: pasos o kcal entre `start` y `end` (ms). */
export interface Interval { start: number; end: number; value: number }
export interface Span { start: number; end: number }

export type ActivityType = 'basquet' | 'futbol' | 'gimnasio' | 'caminata' | 'trote' | 'bici' | 'otro';
export const ACTIVITY_TYPES: Array<{ id: ActivityType; label: string; emoji: string; met: number }> = [
  { id: 'basquet', label: 'Básquet', emoji: '🏀', met: 8 },
  { id: 'futbol', label: 'Fútbol', emoji: '⚽', met: 7 },
  { id: 'gimnasio', label: 'Gimnasio', emoji: '🏋️', met: 5 },
  { id: 'caminata', label: 'Caminata', emoji: '🚶', met: 3.5 },
  { id: 'trote', label: 'Trote', emoji: '🏃', met: 8 },
  { id: 'bici', label: 'Bici', emoji: '🚴', met: 7 },
  { id: 'otro', label: 'Otro', emoji: '✨', met: 5 },
];
export type ActivityGuess = 'caminata' | 'trote' | 'deporte' | 'sin_pasos' | 'actividad';
export const GUESS_LABEL: Record<ActivityGuess, string> = {
  caminata: 'Caminata', trote: 'Trote', deporte: 'Deporte (básquet, fútbol…)', sin_pasos: 'Actividad sin pasos (bici, pesas…)', actividad: 'Actividad',
};

export interface ActivityBout {
  start: string; end: string; minutes: number;
  intensity: 'moderada' | 'vigorosa';
  avgHr?: number; maxHr?: number;
  /** pasos por minuto en promedio */
  cadence?: number;
  /** pasos dentro del bloque (para no contarlos dos veces como pasos del día) */
  steps?: number;
  /** kcal activas (sobre el reposo) */
  kcal: number;
  kcalFrom: 'reloj' | 'pulso' | 'pasos' | 'tipo';
  guess: ActivityGuess;
  /** era una sesión de ejercicio que el reloj ya registró */
  fromSession?: boolean;
  /** lo que confirmó la persona */
  label?: ActivityType;
}
export interface ActivitySummary {
  /** YYYY-MM-DD */
  day: string;
  minutes: number;
  vigorousMin: number;
  kcal: number;
  bouts: ActivityBout[];
}
export interface ActivityLabel { start: string; end: string; type: ActivityType }

export interface DetectInput {
  from: number; to: number;
  hr: HrSample[]; steps: Interval[]; kcal: Interval[];
  sessions?: Span[]; sleep?: Span[];
  restingHr?: number | null; age?: number | null; weightKg?: number | null; sex?: 'h' | 'm' | null;
  labels?: ActivityLabel[];
}

const MIN = 60_000;
const GAP_MIN = 4;
const BOUT_MIN = 10;
const HR_NEAR_MIN = 5;
export const MODERATE_HRR = 0.4;
export const VIGOROUS_HRR = 0.6;

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** Reparte el valor de cada intervalo en los minutos que cubre (pasos/min, kcal/min). */
function spread(n: number, from: number, xs: Interval[]): Float64Array {
  const out = new Float64Array(n);
  for (const x of xs) {
    if (!(x.end > x.start) || !(x.value > 0)) continue;
    const a = Math.max(x.start, from), b = Math.min(x.end, from + n * MIN);
    if (!(b > a)) continue;
    const perMs = x.value / (x.end - x.start);
    for (let m = Math.floor((a - from) / MIN); m < n && from + m * MIN < b; m++) {
      const s = Math.max(a, from + m * MIN), e = Math.min(b, from + (m + 1) * MIN);
      if (e > s) out[m] += perMs * (e - s);
    }
  }
  return out;
}

/** Pulso por minuto: el promedio de las muestras de ese minuto, o la más cercana a ±5 min (relojes que miden cada 10 min). */
function hrPerMinute(n: number, from: number, hr: HrSample[]): Float64Array {
  const out = new Float64Array(n).fill(NaN);
  const sorted = hr.filter((s) => s.bpm >= 30 && s.bpm <= 230 && s.t >= from - HR_NEAR_MIN * MIN).sort((a, b) => a.t - b.t);
  if (!sorted.length) return out;
  const sum = new Float64Array(n), cnt = new Float64Array(n);
  for (const s of sorted) { const m = Math.floor((s.t - from) / MIN); if (m >= 0 && m < n) { sum[m] += s.bpm; cnt[m]++; } }
  let j = 0;
  for (let m = 0; m < n; m++) {
    if (cnt[m]) { out[m] = sum[m] / cnt[m]; continue; }
    const t = from + m * MIN + MIN / 2;
    while (j + 1 < sorted.length && sorted[j + 1].t <= t) j++;
    let best = NaN, bestD = Infinity;
    for (const k of [j, j + 1]) {
      const s = sorted[k];
      if (!s) continue;
      const d = Math.abs(s.t - t);
      if (d < bestD) { bestD = d; best = s.bpm; }
    }
    if (bestD <= HR_NEAR_MIN * MIN) out[m] = best;
  }
  return out;
}

/**
 * De las fuentes que escribieron pasos (o kcal), la que más registró: el teléfono y el reloj escriben los mismos pasos y
 * sumarlos los contaría dos veces.
 */
export function mainOrigin<T extends { origin?: string; value: number }>(xs: T[]): T[] {
  const tot = new Map<string, number>();
  for (const x of xs) tot.set(x.origin ?? '', (tot.get(x.origin ?? '') ?? 0) + x.value);
  if (tot.size <= 1) return xs;
  const best = [...tot.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return xs.filter((x) => (x.origin ?? '') === best);
}

/** Calorías por minuto según el pulso (Keytel y cols., 2005; brutas: incluye el reposo). */
function keytel(hr: number, w: number, age: number, sex?: 'h' | 'm' | null): number {
  const man = (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * age) / 4.184;
  const woman = (-20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * age) / 4.184;
  return Math.max(0, sex === 'h' ? man : sex === 'm' ? woman : (man + woman) / 2);
}

const metOfCadence = (c: number) => (c >= 150 ? 9 : c >= 130 ? 7 : c >= 100 ? 4 : c >= 60 ? 3.3 : 2.5);

/**
 * Une los tramos que se pisan. 2026-10-21: el reloj y otra app escribieron la misma caminata como dos sesiones (20:50–21:51
 * y 21:08–21:59) y cada una se contó como un bloque: 112 min y 450 kcal en vez de ~69 min, y la meta del día subía con eso.
 */
export function mergeSpans(xs: Span[]): Span[] {
  const out: Span[] = [];
  for (const x of [...xs].filter((s) => s.end > s.start).sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && x.start <= last.end) last.end = Math.max(last.end, x.end);
    else out.push({ start: x.start, end: x.end });
  }
  return out;
}

export function detectActivity(input: DetectInput, day: string): ActivitySummary {
  input = { ...input, sessions: mergeSpans(input.sessions ?? []) };
  const from = input.from;
  const n = Math.max(0, Math.min(36 * 60, Math.ceil((input.to - from) / MIN)));
  const w = input.weightKg && input.weightKg > 25 && input.weightKg < 300 ? input.weightKg : 75;
  const age = input.age && input.age >= 10 && input.age <= 100 ? input.age : 35;
  const hrMax = 208 - 0.7 * age;
  const hrMin = hrPerMinute(n, from, input.hr);
  const valid = [...hrMin].filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  const rest = input.restingHr && input.restingHr > 30 && input.restingHr < 110 ? input.restingHr : valid.length >= 20 ? valid[Math.floor(valid.length * 0.1)] : 65;
  const hrr = Math.max(30, hrMax - rest);
  const steps = spread(n, from, input.steps);
  const kcal = spread(n, from, input.kcal);
  const restKcalMin = 0.0175 * w; // 1 MET
  const minuteOf = (t: number) => Math.floor((t - from) / MIN);

  const blocked = new Uint8Array(n); // sueño o sesión registrada
  for (const s of input.sleep ?? []) for (let m = Math.max(0, minuteOf(s.start)); m < Math.min(n, minuteOf(s.end) + 1); m++) blocked[m] = 1;
  for (const s of input.sessions ?? []) for (let m = Math.max(0, minuteOf(s.start)); m < Math.min(n, minuteOf(s.end) + 1); m++) blocked[m] = 2;

  const pct = (m: number) => (Number.isNaN(hrMin[m]) ? NaN : (hrMin[m] - rest) / hrr);
  const metKcal = (m: number) => kcal[m] / restKcalMin + 1;
  const active = (m: number) => !blocked[m] && (pct(m) >= MODERATE_HRR || steps[m] >= 100 || (kcal[m] > 0 && metKcal(m) >= 3.5));

  // Bloques de minutos activos (una pausa corta no corta el bloque)
  const segs: Array<[number, number]> = [];
  let s = -1, last = -1;
  for (let m = 0; m < n; m++) {
    if (!active(m)) continue;
    if (s < 0) s = m;
    else if (m - last - 1 > GAP_MIN) { segs.push([s, last]); s = m; }
    last = m;
  }
  if (s >= 0) segs.push([s, last]);

  const boutOf = (a: number, b: number, fromSession: boolean): ActivityBout | null => {
    const mins = b - a + 1;
    const hrs: number[] = [], pcts: number[] = [];
    let stepSum = 0, kcalSum = 0, kcalMins = 0, stepAct = 0, kcalAct = 0;
    for (let m = a; m <= b; m++) {
      if (!Number.isNaN(hrMin[m])) { hrs.push(hrMin[m]); pcts.push(pct(m)); }
      stepSum += steps[m]; if (steps[m] >= 100) stepAct++;
      if (kcal[m] > 0) { kcalSum += kcal[m]; kcalMins++; if (metKcal(m) >= 3.5) kcalAct++; }
    }
    const meanPct = mean(pcts);
    const cadence = stepSum / mins;
    // Un bloque detectado tiene que ser actividad de verdad, no un rato de pulso alto por estrés o calor
    // (solo pulso, sin pasos ni calorías que lo acompañen: tiene que ser claramente alto y durar 15 min o más)
    if (!fromSession && !(stepAct / mins >= 0.5 || kcalAct / mins >= 0.5 || (meanPct >= 0.55 && mins >= 15))) return null;
    const meanMet = kcalMins ? mean(Array.from({ length: mins }, (_, k) => (kcal[a + k] > 0 ? metKcal(a + k) : NaN)).filter((x) => !Number.isNaN(x))) : 0;
    const vigorous = meanPct >= VIGOROUS_HRR || meanMet >= 6 || cadence >= 140;
    let kc: number, kcalFrom: ActivityBout['kcalFrom'];
    if (kcalMins / mins >= 0.6) { kc = kcalSum; kcalFrom = 'reloj'; }
    else if (hrs.length / mins >= 0.5) {
      const avg = mean(hrs);
      kc = 0;
      // Keytel exagera en deportes con pausas: tope de 10 MET por minuto
      for (let m = a; m <= b; m++) kc += Math.min(9 * restKcalMin, Math.max(0, keytel(Number.isNaN(hrMin[m]) ? avg : hrMin[m], w, age, input.sex) - restKcalMin));
      kcalFrom = 'pulso';
    } else { kc = (metOfCadence(cadence) - 1) * restKcalMin * mins; kcalFrom = 'pasos'; }
    // Variabilidad de los pasos: una caminata o un trote son parejos; un partido es arrancar, frenar y volver a correr
    const perMin = Array.from({ length: mins }, (_, k) => steps[a + k]);
    const cv = cadence > 0 ? Math.sqrt(mean(perMin.map((x) => (x - cadence) ** 2))) / cadence : 0;
    const guess: ActivityGuess = cadence >= 140 && cv < 0.4 ? 'trote'
      : cadence < 30 ? (meanPct >= MODERATE_HRR || meanMet >= 3.5 ? 'sin_pasos' : 'actividad')
      : cv >= 0.4 && (vigorous || meanPct >= 0.5) ? 'deporte'
      : cadence >= 95 ? 'caminata'
      : vigorous ? 'deporte' : 'actividad';
    // Caminata o trote parejos: la cadencia estima mejor que el pulso (Keytel infla el gasto con pulsos bajos)
    if (kcalFrom === 'pulso' && (guess === 'caminata' || guess === 'trote')) { kc = (metOfCadence(cadence) - 1) * restKcalMin * mins; kcalFrom = 'pasos'; }
    return {
      start: new Date(from + a * MIN).toISOString(), end: new Date(from + (b + 1) * MIN).toISOString(), minutes: mins,
      intensity: vigorous ? 'vigorosa' : 'moderada',
      ...(hrs.length ? { avgHr: Math.round(mean(hrs)), maxHr: Math.round(Math.max(...hrs)) } : {}),
      ...(stepSum > 0 ? { cadence: Math.round(cadence), steps: Math.round(stepSum) } : {}),
      kcal: Math.round(kc / 10) * 10, kcalFrom, guess,
      ...(fromSession ? { fromSession: true } : {}),
    };
  };

  const bouts: ActivityBout[] = [];
  for (const [a, b] of segs) if (b - a + 1 >= BOUT_MIN) { const x = boutOf(a, b, false); if (x) bouts.push(x); }
  for (const ss of input.sessions ?? []) {
    const a = Math.max(0, minuteOf(ss.start)), b = Math.min(n - 1, minuteOf(ss.end) - 1);
    if (b >= a) { const x = boutOf(a, b, true); if (x) bouts.push(x); }
  }
  bouts.sort((x, y) => x.start.localeCompare(y.start));

  // Lo que dijo la persona («fue básquet»): por traslape con el bloque (sus bordes se mueven un poco al llegar más datos)
  for (const bt of bouts) {
    const a = Date.parse(bt.start), b = Date.parse(bt.end);
    const lab = (input.labels ?? []).find((l) => {
      const la = Date.parse(l.start), lb = Date.parse(l.end);
      const ov = Math.min(b, lb) - Math.max(a, la);
      return ov > 0 && ov >= 0.5 * Math.min(b - a, lb - la);
    });
    if (!lab) continue;
    bt.label = lab.type;
    const t = ACTIVITY_TYPES.find((x) => x.id === lab.type);
    if (t && bt.kcalFrom === 'pasos') { bt.kcal = Math.round(((t.met - 1) * restKcalMin * bt.minutes) / 10) * 10; bt.kcalFrom = 'tipo'; }
  }

  return {
    day,
    minutes: bouts.reduce((s2, x) => s2 + x.minutes, 0),
    vigorousMin: bouts.filter((x) => x.intensity === 'vigorosa').reduce((s2, x) => s2 + x.minutes, 0),
    kcal: Math.round(bouts.reduce((s2, x) => s2 + x.kcal, 0) / 10) * 10,
    bouts,
  };
}

/** «2 h 5 min», «45 min» */
export const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

/** El nombre de un bloque: lo que dijo la persona, o lo que parece. */
export function boutName(b: ActivityBout): { emoji: string; name: string } {
  const t = b.label ? ACTIVITY_TYPES.find((x) => x.id === b.label) : null;
  if (t) return { emoji: t.emoji, name: t.label };
  const e: Record<ActivityGuess, string> = { caminata: '🚶', trote: '🏃', deporte: '🏅', sin_pasos: '💪', actividad: '⚡' };
  return { emoji: e[b.guess], name: GUESS_LABEL[b.guess] };
}

/** «básquet 2 h», «caminata 40 min»: la actividad principal del día (el mismo texto que usa el servidor). */
export function summaryLabel(a: ActivitySummary): string {
  const main = [...a.bouts].sort((x, y) => y.kcal - x.kcal)[0];
  const name = main?.label ? (ACTIVITY_TYPES.find((t) => t.id === main.label)?.label ?? 'Actividad').toLowerCase()
    : main ? ({ caminata: 'caminata', trote: 'trote', deporte: 'deporte', sin_pasos: 'actividad', actividad: 'actividad' } as Record<ActivityGuess, string>)[main.guess] : 'actividad';
  return `${name} ${fmtMinutes(a.minutes)}`;
}

/** Lo que Forge necesita de la actividad de hoy (suma al gasto si pasa de un día típico). */
export const forgeActivity = (a: ActivitySummary | null | undefined) =>
  a && a.minutes > 0 ? { day: a.day, kcal: a.kcal, minutes: a.minutes, vigorousMin: a.vigorousMin, label: summaryLabel(a) } : null;

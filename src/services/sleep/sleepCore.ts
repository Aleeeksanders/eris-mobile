// ============================================================
// Eris — sleepCore (Sueño 2.0, fase S0 · 2026-10-28)
//
// El sueño de Health Connect por partes, como lo cuenta el reloj (Mi Fitness): cada tramo del reloj, los tramos de una misma
// noche (un despertar de menos de 90 min no corta la noche) y qué es cada parte: LA NOCHE, un SEGUNDO SUEÑO (90 min o más
// fuera de la noche) o una SIESTA. Pedido del usuario el 24-10: dormió 02:33–03:18 + 04:20–09:05 + 13:51–17:54 (9 h 31 en
// Mi Fitness) y Eris dijo «8,8 h, descanso suficiente» (botaba lo de menos de 3 h y juntaba todo como una noche).
//
// Reglas (plan Sueño 2.0, con respaldo: modelo de dos procesos, regularidad, relojes buenos para dormido/despierto):
//   - el día empieza al terminar LA NOCHE, nunca al despertar de una siesta o de un segundo sueño;
//   - la noche es la parte que cae en su ventana de sueño (aprendida de su despertar habitual; si no, la madrugada) y
//     termina a una hora de despertar; si no hay ninguna así, la más larga de 3 h o más (turnos);
//   - para la recuperación cuenta el total de 24 h; para la calidad y el horario, la noche.
//
// Núcleo puro, SIN imports: el servidor tiene una COPIA EXACTA (eris/scripts/sync_sleep_core.ts + sleep_parity_test.ts).
// Las horas locales salen del reloj del equipo (Chile, en el teléfono y en el PC).
// ============================================================

/** Etapas de Health Connect: 1 despierto, 2 durmiendo, 3 fuera de la cama, 4 ligero, 5 profundo, 6 REM, 7 despierto en la cama */
export interface RawStage { start: number; end: number; stage: number }
export interface RawSession { start: number; end: number; stages?: RawStage[] }

export type EpisodeKind = 'noche' | 'segundo' | 'siesta';
/** Horas por etapa */
export interface SleepStages { light: number; deep: number; rem: number }
export interface SleepEpisode {
  kind: EpisodeKind;
  /** ISO */
  start: string;
  end: string;
  /** horas dormidas */
  asleepH: number;
  /** minutos despierto dentro (los del reloj y los ratos entre tramos) */
  awakeMin: number;
  /** veces despierto */
  wakeups: number;
  /** tramos del reloj que la forman */
  blocks: number;
  stages?: SleepStages;
}
export interface SleepDay {
  /** en orden: la noche y lo que vino después */
  episodes: SleepEpisode[];
  night: SleepEpisode | null;
  /** dormido en 24 h (todas las partes): la recuperación */
  totalH: number;
  /** dormido en la noche: la calidad y el horario */
  nightH: number | null;
  /** fin de la noche: ahí empieza el día */
  dayWake: string | null;
  /** el último despertar (de la noche, una siesta o un segundo sueño) */
  lastWake: string | null;
  /** noche con un rato despierto largo (30 min o más) o con un segundo sueño ese día */
  split: boolean;
  /** el día al que cuenta (YYYY-MM-DD; ver sleepKey) */
  day: string;
  /** el fin (ISO) de un sueño largo a hora rara que espera «¿Cómo sigues?»; null si no hay nada que preguntar */
  pendingWake: string | null;
  /** etapas de todo el día (si el reloj las midió) */
  stages?: SleepStages;
  /** eficiencia de la noche: dormido / en cama (%) */
  efficiency?: number;
}
export interface SleepOpts {
  /** despertar habitual (horas locales, 7,75 = 7:45) */
  usualWake?: number | null;
  /** cuánto duerme normalmente la noche (h) */
  usualSleepH?: number | null;
  /** un despertar más corto que esto no corta la noche (min) */
  gapMin?: number;
  /** ahora (ms). Con esto, un sueño largo a hora rara espera tu respuesta antes de correr el día; sin esto, abre el día */
  now?: number;
  /** lo que respondiste a «¿Cómo sigues?», por el fin de ese sueño (ISO) */
  decisions?: WakeDecisions;
}

/** «Vuelvo a dormir» (sueño extra: tu día sigue) o «Parto mi día ahora» (el día se cuenta desde ese despertar) */
export type WakeDecision = 'dormir' | 'partir';
export type WakeDecisions = Record<string, WakeDecision>;

const MIN = 60_000;
const H = 3_600_000;
export const GAP_MIN = 90;
/** Desde aquí un sueño fuera de la noche es un «segundo sueño», no una siesta (min) */
export const SEGUNDO_MIN = 90;
const ASLEEP = new Set([2, 4, 5, 6]);
const AWAKE = new Set([1, 3, 7]);
const r2 = (n: number) => Math.round(n * 100) / 100;
const hourOf = (ms: number) => { const d = new Date(ms); return d.getHours() + d.getMinutes() / 60; };

interface Block { start: number; end: number; asleepMin: number; awakeMin: number; wakeups: number; light: number; deep: number; rem: number; staged: boolean }

/** Los tramos del reloj: las sesiones que se pisan (dos apps con el mismo sueño) se juntan, con las etapas de la más completa. */
export function sleepBlocks(sessions: RawSession[]): Block[] {
  const ok = sessions.filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && s.end - s.start <= 20 * H)
    .sort((a, b) => a.start - b.start);
  const groups: Array<{ start: number; end: number; items: RawSession[] }> = [];
  for (const s of ok) {
    const last = groups[groups.length - 1];
    if (last && s.start < last.end) { last.end = Math.max(last.end, s.end); last.items.push(s); }
    else groups.push({ start: s.start, end: s.end, items: [s] });
  }
  return groups.map((g) => {
    const best = g.items.reduce((a, b) => ((b.stages?.length ?? 0) > (a.stages?.length ?? 0) ? b : a));
    const spanMin = (g.end - g.start) / MIN;
    const st = (best.stages ?? []).filter((x) => x.end > x.start).sort((a, b) => a.start - b.start);
    if (!st.length) return { start: g.start, end: g.end, asleepMin: spanMin, awakeMin: 0, wakeups: 0, light: 0, deep: 0, rem: 0, staged: false };
    let asleep = 0, awake = 0, light = 0, deep = 0, rem = 0, wakeups = 0, prevAwake = false;
    for (const x of st) {
      const m = (Math.min(x.end, g.end) - Math.max(x.start, g.start)) / MIN;
      if (m <= 0) continue;
      if (ASLEEP.has(x.stage)) { asleep += m; prevAwake = false; }
      if (x.stage === 4) light += m; else if (x.stage === 5) deep += m; else if (x.stage === 6) rem += m;
      if (AWAKE.has(x.stage)) { awake += m; if (!prevAwake) wakeups++; prevAwake = true; }
    }
    // Etapas incompletas (cubren menos de la mitad del tramo): lo dormido es el tramo menos lo despierto
    if (asleep < spanMin * 0.5) asleep = Math.max(0, spanMin - awake);
    return { start: g.start, end: g.end, asleepMin: asleep, awakeMin: awake, wakeups, light, deep, rem, staged: light + deep + rem > 0 };
  });
}

interface Ep { start: number; end: number; blocks: Block[]; asleepMin: number; awakeMin: number; wakeups: number }

/** Los tramos separados por menos de `gapMin` son una misma parte (la noche partida); el rato entre medio cuenta como despierto. */
function episodesOf(blocks: Block[], gapMin: number): Ep[] {
  const out: Ep[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    const gap = last ? (b.start - last.end) / MIN : Infinity;
    if (last && gap < gapMin) {
      last.blocks.push(b); last.end = Math.max(last.end, b.end);
      last.asleepMin += b.asleepMin; last.awakeMin += b.awakeMin + Math.max(0, gap); last.wakeups += b.wakeups + 1;
    } else out.push({ start: b.start, end: b.end, blocks: [b], asleepMin: b.asleepMin, awakeMin: b.awakeMin, wakeups: b.wakeups });
  }
  return out;
}

/** La ventana de la noche (horas locales; el inicio puede ser negativo = la tarde anterior) y el rango de horas de despertar. */
function nightWindow(o: SleepOpts): { from: number; to: number; wakeFrom: number; wakeTo: number } {
  const wake = typeof o.usualWake === 'number' && o.usualWake >= 0 && o.usualWake < 24 ? o.usualWake : 7.5;
  const sleepH = typeof o.usualSleepH === 'number' && o.usualSleepH >= 3 && o.usualSleepH <= 14 ? o.usualSleepH : 7.5;
  const bed = wake - sleepH;
  return { from: bed - 2, to: wake + 3, wakeFrom: wake - 5, wakeTo: wake + 6 };
}

/** Minutos de la parte que caen en la ventana de la noche (la ventana se repite cada día). */
function overlapMin(e: { start: number; end: number }, w: { from: number; to: number }): number {
  let total = 0;
  const d0 = new Date(e.start); d0.setHours(0, 0, 0, 0);
  for (let k = -1; k <= 2; k++) {
    const day = new Date(d0); day.setDate(day.getDate() + k);
    const a = day.getTime() + w.from * H, b = day.getTime() + w.to * H;
    total += Math.max(0, Math.min(e.end, b) - Math.max(e.start, a)) / MIN;
  }
  return total;
}

const inWakeRange = (ms: number, w: { wakeFrom: number; wakeTo: number }) => {
  const h = hourOf(ms);
  return [h, h + 24, h - 24].some((x) => x >= w.wakeFrom && x <= w.wakeTo);
};

/** ¿Puede ser la noche? En su ventana de sueño (1 h o más), terminando a una hora de despertar, con 1 h o más dormida. */
function nightCandidate(e: Ep, w: ReturnType<typeof nightWindow>): boolean {
  return e.asleepMin >= 60 && overlapMin(e, w) >= 60 && inWakeRange(e.end, w);
}

function toEpisode(e: Ep, kind: EpisodeKind): SleepEpisode {
  const staged = e.blocks.some((b) => b.staged);
  const sum = (k: 'light' | 'deep' | 'rem') => r2(e.blocks.reduce((a, b) => a + b[k], 0) / 60);
  return {
    kind, start: new Date(e.start).toISOString(), end: new Date(e.end).toISOString(),
    asleepH: r2(e.asleepMin / 60), awakeMin: Math.round(e.awakeMin), wakeups: e.wakeups, blocks: e.blocks.length,
    ...(staged ? { stages: { light: sum('light'), deep: sum('deep'), rem: sum('rem') } } : {}),
  };
}

const kindOf = (e: Ep): EpisodeKind => (e.asleepMin >= SEGUNDO_MIN ? 'segundo' : 'siesta');

const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ─── Un sueño fuera de horario (2026-11-07) ──────────────────────────────────────────────────────────────────────────
// El usuario durmió de 23:00 a 06:45 y otra vez de 17:30 a 23:50. Eris decía «dormiste 14 h 05» y «la noche fue partida», y a
// las 00:40 lo daba por terminando su día, recién despierto. Cada sueño cuenta en UN solo día, y si un sueño largo termina a una
// hora rara se le pregunta cómo sigue. Los cortes (3 h, 18:00, 8 h) son decisión de producto, no salen de un estudio.

/** Desde cuánto dormido un sueño es «largo» (min) */
const LONG_MIN = 180;
/** Un sueño largo que termina desde esta hora cuenta al día siguiente */
export const EVENING_END_H = 18;
/** Sin respuesta: si en estas horas no volviste a dormir largo, el día ya partió en ese despertar */
export const WAKE_WAIT_H = 8;

/** A qué día cuenta un sueño: el de la fecha en que terminó, salvo uno largo que termina desde las 18:00, que abre el siguiente. */
export function sleepKey(endMs: number, asleepMin: number): string {
  if (asleepMin < LONG_MIN || hourOf(endMs) < EVENING_END_H) return dayKey(endMs);
  const d = new Date(endMs);
  d.setDate(d.getDate() + 1);
  return dayKey(d.getTime());
}
const epDay = (e: Ep) => sleepKey(e.end, e.asleepMin);

/** ¿Despertar a esa hora es raro? Desde las 18:00, o de madrugada antes de lo que sería despertar para esta persona. */
export function wakeIsOdd(endMs: number, o: SleepOpts = {}): boolean {
  const w = nightWindow(o);
  return !inWakeRange(endMs, w) && (hourOf(endMs) >= EVENING_END_H || hourOf(endMs) < w.wakeFrom);
}

/** La parte más larga de 3 h o más */
const longest = (eps: Ep[]) => eps.filter((e) => e.asleepMin >= LONG_MIN).reduce<Ep | null>((a, b) => (!a || b.asleepMin > a.asleepMin ? b : a), null);

/** ¿Esta parte ya es de un día posterior a esa noche? Un sueño largo que cuenta a otro día (como separa sleepByDay), o cualquier sueño tras 24 h despierto. */
const laterDay = (e: Ep, night: Ep) => e.start >= night.end && epDay(e) !== epDay(night) && (e.asleepMin >= LONG_MIN || e.start - night.end >= 24 * H);

/**
 * El sueño del día: la última noche y lo que vino después (siestas, un segundo sueño). `sessions` = las sesiones de Health
 * Connect de las últimas ~36 h. null si no hay sueño.
 */
export function sleepDay(sessions: RawSession[], o: SleepOpts = {}): SleepDay | null {
  const eps = episodesOf(sleepBlocks(sessions), o.gapMin ?? GAP_MIN);
  if (!eps.length) return null;
  const w = nightWindow(o);
  const cands = eps.filter((e) => nightCandidate(e, w));
  // La noche: la última que calza con su ventana; si ninguna calza (turnos), la más larga de 3 h o más
  const pick = cands.length ? cands.reduce((a, b) => (b.end > a.end ? b : a)) : longest(eps);
  // Lo que vino después ya es otro día: esa noche es de ayer y no se suma. La noche es lo más largo de ese día, aunque termine
  // fuera de la ventana. El 1-11 (acostarse de madrugada y despertar pasadas las 14:00) sumó las 7 h 10 del 31-10 + 10 h 31: «17 h 41».
  const later = pick ? eps.filter((e) => laterDay(e, pick)) : [];
  const night = later.length ? longest(later) : pick;
  // Un sueño largo a hora rara: abre el día si dijiste «parto mi día», o si pasaron 8 h sin volver a dormir largo. Mientras no se
  // sepa, y con «vuelvo a dormir», es un sueño extra: el día sigue contado desde el despertar anterior.
  const odd = !!night && night.asleepMin >= LONG_MIN && wakeIsOdd(night.end, o);
  const endIso = night ? new Date(night.end).toISOString() : '';
  const said = odd ? o.decisions?.[endIso] : undefined;
  const waited = !night || o.now == null || o.now - night.end >= WAKE_WAIT_H * H;
  const extra = odd && (said === 'dormir' || (!said && !waited));
  const anchor = extra ? (pick && pick !== night ? pick : null) : night;
  // Lo del día: la noche, lo que vino después y lo que cuenta a ese mismo día; sin noche, lo de las últimas 24 h
  const lastEnd = eps[eps.length - 1].end;
  const nightDay = night ? epDay(night) : null;
  const day = night ? eps.filter((e) => e.start >= night.start || epDay(e) === nightDay) : eps.filter((e) => e.end > lastEnd - 24 * H);
  const episodes = day.map((e) => toEpisode(e, e === night && !extra ? 'noche' : kindOf(e)));
  const totalMin = day.reduce((a, e) => a + e.asleepMin, 0);
  const staged = episodes.filter((e) => e.stages);
  const stages = staged.length
    ? { light: r2(staged.reduce((a, e) => a + e.stages!.light, 0)), deep: r2(staged.reduce((a, e) => a + e.stages!.deep, 0)), rem: r2(staged.reduce((a, e) => a + e.stages!.rem, 0)) }
    : undefined;
  const n = episodes.find((e) => e.kind === 'noche') ?? null;
  const nightEp = night && !extra ? day.find((e) => e === night)! : null;
  return {
    episodes, night: n, totalH: r2(totalMin / 60), nightH: n ? n.asleepH : null,
    dayWake: anchor ? new Date(anchor.end).toISOString() : null, lastWake: new Date(day[day.length - 1].end).toISOString(),
    // «Partida» solo si la noche de verdad se cortó: despierto en medio, o una noche corta que siguió en otro sueño. Dormir bien de
    // noche y otro rato después no es una noche partida.
    split: !!n && (n.awakeMin >= 30 || (n.asleepH < 6 && episodes.some((e) => e.kind === 'segundo'))),
    day: nightDay ?? sleepKey(day[day.length - 1].end, day[day.length - 1].asleepMin),
    pendingWake: extra && !said ? endIso : null,
    ...(stages ? { stages } : {}),
    ...(nightEp ? { efficiency: Math.round((nightEp.asleepMin / Math.max(1, (nightEp.end - nightEp.start) / MIN)) * 100) } : {}),
  };
}

/**
 * El historial por día (el día al que cuenta cada parte, ver sleepKey): lo dormido en total y en la noche, y la hora en que terminó la
 * noche. Para el registro diario y el despertar habitual.
 */
export interface DayRecord { totalH: number; nightH: number | null; nightEnd: number | null; nightStart: number | null; nightAwakeMin: number | null }
export function sleepByDay(sessions: RawSession[], o: SleepOpts = {}): Map<string, DayRecord> {
  const eps = episodesOf(sleepBlocks(sessions), o.gapMin ?? GAP_MIN);
  const w = nightWindow(o);
  const out = new Map<string, { totalMin: number; night: Ep | null; long: Ep | null }>();
  for (const e of eps) {
    const k = epDay(e);
    const cur = out.get(k) ?? { totalMin: 0, night: null, long: null };
    cur.totalMin += e.asleepMin;
    if (nightCandidate(e, w) && (!cur.night || e.asleepMin > cur.night.asleepMin)) cur.night = e;
    if (e.asleepMin >= 180 && (!cur.long || e.asleepMin > cur.long.asleepMin)) cur.long = e;
    out.set(k, cur);
  }
  const res = new Map<string, DayRecord>();
  for (const [k, v] of out) {
    const n = v.night ?? v.long;
    res.set(k, { totalH: r2(v.totalMin / 60), nightH: n ? r2(n.asleepMin / 60) : null, nightEnd: n ? n.end : null, nightStart: n ? n.start : null, nightAwakeMin: n ? Math.round(n.awakeMin) : null });
  }
  return res;
}

// ─── Sueño 2.0 · S1 (2026-10-28): 14 días — deuda, regularidad, cronotipo, puntaje y la hora para acostarse ───────────
//
// Con respaldo (plan Sueño 2.0):
//   - adultos, 7 h o más (AASM/SRS 2015); la necesidad propia se estima con los días libres sin deuda (7–9 h);
//   - la deuda no se paga con un sueño largo (Depner 2019): se acumula noche a noche (con 15 min de tolerancia y lo antiguo
//     pesando menos) y una noche larga paga como mucho 2 h;
//   - la regularidad predice la salud más que la duración (Sleep Regularity Index, Phillips 2017; Windred 2024): SRI de −100
//     a 100 = qué tan seguido estás en el mismo estado (dormido/despierto) a la misma hora en días seguidos;
//   - cronotipo = punto medio del sueño en días libres corregido por lo que se recupera (MCTQ, Roenneberg); jet lag social =
//     diferencia entre el punto medio de días libres y de trabajo (aquí: fin de semana vs semana, aproximado);
//   - cafeína: al menos 6 h antes de acostarse (Drake 2013); una siesta larga descarga presión de sueño (modelo de dos
//     procesos, Borbély): esa noche cuesta dormirse antes.

/** Una noche del historial (horas locales en ms) */
export interface NightRecord { day: string; onset: number; wake: number; nightH: number; totalH: number; awakeMin: number; free: boolean }
export type Regularity = 'muy regular' | 'regular' | 'algo irregular' | 'irregular';
export type Chronotype = 'matutino' | 'intermedio' | 'vespertino' | 'muy vespertino';
export type NightWord = 'Buena' | 'Corta' | 'Partida' | 'Irregular';
export interface NightScore { total: number; word: NightWord; parts: { duracion: number; regularidad: number; continuidad: number; horario: number; etapas: number } }
export interface SleepInsights {
  /** noches con datos en los últimos 14 días */
  nights: number;
  /** su necesidad de sueño (h) y si salió de sus datos */
  need: number;
  needEstimated: boolean;
  avgTotalH: number | null;
  avgNightH: number | null;
  /** deuda acumulada en 14 días (h) */
  debtH: number;
  /** desviación de la hora de dormirse y de despertar en la última semana (min) */
  onsetSdMin: number | null;
  wakeSdMin: number | null;
  /** Sleep Regularity Index de la última semana (−100 a 100) */
  sri: number | null;
  regularity: Regularity | null;
  /** hora habitual de dormirse y de despertar (horas locales, mediana) */
  usualOnset: number | null;
  usualWakeH: number | null;
  /** punto medio del sueño en días libres, corregido (horas locales) */
  msf: number | null;
  socialJetlagH: number | null;
  chronotype: Chronotype | null;
  /** + = cada día se duerme más tarde (min/día, últimas 7 noches) */
  trendMinPerDay: number | null;
  /** la hora para acostarse hoy (horas locales; puede pasar de 24 = después de medianoche) */
  bedtime: { target: number; from: number; to: number; wake: number; napShiftMin: number };
  /** hasta qué hora tomar cafeína hoy (horas locales) */
  caffeineUntil: number;
  /** el puntaje de la última noche */
  score: NightScore | null;
  /** promedio (total de 24 h) de las últimas 3 noches: la recuperación para entrenar (S3) */
  last3AvgH: number | null;
}

/** Horas desde el mediodía anterior (para promediar horas de dormirse sin que 23:30 y 00:30 queden a 23 h) */
const fromNoon = (ms: number) => ((hourOf(ms) - 12 + 24) % 24);
const toClock = (h: number) => ((h + 12) % 24 + 24) % 24;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const sd = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
const lin = (x: number, good: number, bad: number) => (x <= good ? 1 : x >= bad ? 0 : 1 - (x - good) / (bad - good));

/** Las noches del historial (una por día en que terminó), con si fue día libre (sábado o domingo). */
export function nightRecords(sessions: RawSession[], o: SleepOpts = {}): NightRecord[] {
  const out: NightRecord[] = [];
  for (const [day, d] of sleepByDay(sessions, o)) {
    if (d.nightStart == null || d.nightEnd == null || d.nightH == null) continue;
    const wd = new Date(d.nightEnd).getDay();
    out.push({ day, onset: d.nightStart, wake: d.nightEnd, nightH: d.nightH, totalH: d.totalH, awakeMin: d.nightAwakeMin ?? 0, free: wd === 0 || wd === 6 });
  }
  return out.sort((a, b) => a.wake - b.wake);
}

/**
 * Sleep Regularity Index (Phillips 2017) con épocas de 5 min: el porcentaje de veces que estás en el mismo estado a la misma
 * hora en días seguidos, llevado a −100…100. Solo cuenta pares de días con sueño registrado (sin dato no es «despierto»).
 */
export function sleepRegularityIndex(sessions: RawSession[], fromMs: number, toMs: number): number | null {
  const EP = 5 * MIN, DAY = 24 * H;
  const n = Math.floor((toMs - fromMs) / EP);
  if (n < (2 * DAY) / EP) return null;
  const asleep = new Uint8Array(n);
  const mark = (a: number, b: number, v: number) => { for (let i = Math.max(0, Math.floor((a - fromMs) / EP)); i < Math.min(n, Math.ceil((b - fromMs) / EP)); i++) asleep[i] = v; };
  const blocks = sleepBlocks(sessions);
  for (const s of sessions) { if (s.end <= fromMs || s.start >= toMs) continue; mark(s.start, s.end, 1); for (const st of s.stages ?? []) if (AWAKE.has(st.stage)) mark(st.start, st.end, 0); }
  // Días con dato: de mediodía a mediodía, con algún tramo que termine dentro
  const dayIdx = (ms: number) => Math.floor((ms - fromMs) / DAY);
  const hasData = new Set(blocks.filter((b) => b.end > fromMs && b.end <= toMs).map((b) => dayIdx(b.end)));
  const perDay = DAY / EP;
  let same = 0, total = 0;
  for (let i = 0; i + perDay < n; i++) {
    const d = Math.floor(i / perDay);
    if (!hasData.has(d) || !hasData.has(d + 1)) continue;
    total++; if (asleep[i] === asleep[i + perDay]) same++;
  }
  return total >= 4 * perDay ? Math.round(-100 + (200 * same) / total) : null;
}

/** El puntaje de una noche (0–100): pesa más lo que el reloj mide bien (duración, horario, despertares) que las etapas. */
export function nightScore(n: { totalH: number; nightH: number; onset: number; wake: number; awakeMin: number; wakeups?: number; split?: boolean; stages?: SleepStages | null },
  ref: { need: number; usualOnset: number | null; usualWakeH: number | null }): NightScore {
  const duracion = Math.round(35 * lin(Math.max(0, ref.need - n.totalH), 0, ref.need / 2));
  const devWake = ref.usualWakeH == null ? 0 : Math.abs(((hourOf(n.wake) - ref.usualWakeH + 36) % 24) - 12) * 60;
  const regularidad = Math.round(25 * lin(devWake, 30, 180));
  const continuidad = Math.max(0, Math.round(20 * lin(n.awakeMin, 20, 90)) - 2 * Math.max(0, (n.wakeups ?? 0) - 2));
  const devOnset = ref.usualOnset == null ? 0 : Math.abs(fromNoon(n.onset) - ((ref.usualOnset - 12 + 24) % 24)) * 60;
  const horario = Math.round(10 * lin(devOnset, 60, 180));
  let etapas = 7; // sin etapas no se castiga ni se premia
  if (n.stages && n.nightH > 0) {
    const deep = n.stages.deep / n.nightH, rem = n.stages.rem / n.nightH;
    etapas = (deep >= 0.13 ? 5 : 2) + (rem >= 0.15 ? 5 : 2);
  }
  const total = Math.min(100, duracion + regularidad + continuidad + horario + etapas);
  const word: NightWord = n.split ? 'Partida' : n.totalH < ref.need - 1 ? 'Corta' : regularidad + horario < 18 ? 'Irregular' : 'Buena';
  return { total, word, parts: { duracion, regularidad, continuidad, horario, etapas } };
}

/**
 * El sueño de las últimas 2 semanas en números, y la hora para acostarse hoy. `sessions` = 14–15 días de Health Connect;
 * `need` = la necesidad que fijó la persona (si no, se estima o 7,5 h).
 */
export function sleepInsights(sessions: RawSession[], o: SleepOpts & { now: number; need?: number | null }): SleepInsights {
  const from = o.now - 14 * 24 * H;
  const recent = sessions.filter((s) => s.end > from);
  const nights = nightRecords(recent, o).filter((n) => n.wake > from);
  const usualOnset = nights.length >= 4 ? toClock(median(nights.map((n) => fromNoon(n.onset)))) : null;
  const usualWakeH = nights.length >= 4 ? median(nights.map((n) => hourOf(n.wake))) : (typeof o.usualWake === 'number' ? o.usualWake : null);
  // La necesidad: la que fijó; si no, la de sus días libres sin deuda (mediana, 7–9 h); si no, 7,5 h
  let need = typeof o.need === 'number' && o.need >= 6 && o.need <= 10 ? o.need : 7.5;
  let needEstimated = false;
  if (o.need == null) {
    const libres = nights.filter((n, i) => n.free && i >= 2 && nights.slice(i - 2, i).every((p) => p.totalH >= 7));
    if (libres.length >= 4) { need = Math.min(9, Math.max(7, Math.round(median(libres.map((n) => n.totalH)) * 4) / 4)); needEstimated = true; }
  }
  // Deuda: noche a noche; 15 min bajo la necesidad no cuentan (variación normal: «medir sin obsesión»), lo antiguo pesa menos
  // (la mitad a los ~10 días), lo que se duerme de más paga como mucho 2 h por noche y nunca queda «a favor»
  let debt = 0;
  for (const n of nights) {
    const diff = need - n.totalH;
    debt = Math.max(0, debt * 0.93 + (diff > 0 ? Math.max(0, diff - 0.25) : Math.max(-2, diff)));
  }
  // La regularidad, de la última semana (como el SRI original y el reloj): con 14 días una semana buena tapaba la irregular
  const week = nights.filter((n) => n.wake > o.now - 7 * 24 * H);
  const onsets = week.map((n) => fromNoon(n.onset) * 60), wakes = week.map((n) => fromNoon(n.wake) * 60);
  const onsetSdMin = week.length >= 5 ? Math.round(sd(onsets)) : null;
  const wakeSdMin = week.length >= 5 ? Math.round(sd(wakes)) : null;
  const sri = sleepRegularityIndex(recent, o.now - 7 * 24 * H, o.now);
  // Las dos señales (el SRI y cuánto varía la hora de dormirse); manda la más exigente: una semana que se corre de 22:30 a
  // 04:20 da un SRI de 75 («regular») con 82 min de variación (irregular)
  const LEVELS: Regularity[] = ['muy regular', 'regular', 'algo irregular', 'irregular'];
  const bySri = sri != null ? (sri >= 85 ? 0 : sri >= 75 ? 1 : sri >= 65 ? 2 : 3) : null;
  const bySd = onsetSdMin != null ? (onsetSdMin <= 30 ? 0 : onsetSdMin <= 45 ? 1 : onsetSdMin <= 75 ? 2 : 3) : null;
  const regularity: Regularity | null = bySri == null && bySd == null ? null : LEVELS[Math.max(bySri ?? 0, bySd ?? 0)];
  // Cronotipo (MCTQ): punto medio en días libres, corregido por lo que se recupera; jet lag social = libres vs trabajo
  const mid = (n: NightRecord) => fromNoon(n.onset) + (n.wake - n.onset) / H / 2;
  const libres = nights.filter((n) => n.free), trabajo = nights.filter((n) => !n.free);
  let msf: number | null = null, socialJetlagH: number | null = null, chronotype: Chronotype | null = null;
  if (libres.length >= 2 && trabajo.length >= 3) {
    const sdF = median(libres.map((n) => n.totalH)), sdW = median(trabajo.map((n) => n.totalH));
    const sdWeek = (5 * sdW + 2 * sdF) / 7;
    const msfRaw = median(libres.map(mid)), msw = median(trabajo.map(mid));
    const msfsc = sdF > sdW ? msfRaw - (sdF - sdWeek) / 2 : msfRaw;
    msf = Math.round(toClock(msfsc) * 4) / 4;
    socialJetlagH = Math.round(Math.abs(msfRaw - msw) * 4) / 4;
    const c = toClock(msfsc);
    const cc = c < 12 ? c : c - 24; // 23:00 = −1
    chronotype = cc < 3 ? 'matutino' : cc < 5 ? 'intermedio' : cc < 6.5 ? 'vespertino' : 'muy vespertino'; // MCTQ, punto medio
  }
  // Tendencia: la pendiente de la hora de dormirse en las últimas 7 noches (min por día)
  let trendMinPerDay: number | null = null;
  const last7 = nights.slice(-7);
  if (last7.length >= 5) {
    const xs = last7.map((n) => (n.wake - last7[0].wake) / (24 * H)), ys = last7.map((n) => fromNoon(n.onset) * 60);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    if (den > 0) trendMinPerDay = Math.round(xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den);
  }
  // Hoy: la noche y la hora para acostarse (despertar habitual − necesidad); una siesta o un segundo sueño de más de 30 min
  // corre la hora media hora por cada hora dormida (hasta 2 h): esa noche cuesta más dormirse
  const today = sleepDay(sessions.filter((s) => s.end > o.now - 36 * H), o);
  // Partiste tu día en un despertar raro: tu próxima noche se cuenta desde ahí (no desde tu hora de siempre: serían ~24 h despierto)
  const partio = today?.night && today.dayWake === today.night.end && wakeIsOdd(Date.parse(today.night.end), o);
  const wake = partio ? hourOf(Date.parse(today!.night!.end)) : typeof o.usualWake === 'number' ? o.usualWake : usualWakeH ?? 7.5;
  const naps = today ? today.episodes.filter((e) => e.kind !== 'noche' && Date.parse(e.end) > o.now - 18 * H) : [];
  const napH = naps.reduce((a, e) => a + e.asleepH, 0);
  const napShiftMin = napH > 0.5 ? Math.min(120, Math.round((napH * 30) / 15) * 15) : 0;
  let target = wake - need + napShiftMin / 60;
  if (target < 12) target += 24; // 23:30 = 23,5; 00:30 = 24,5
  const bedtime = { target: Math.round(target * 4) / 4, from: Math.round((target - 0.5) * 4) / 4, to: Math.round((target + 0.5) * 4) / 4, wake, napShiftMin };
  const caffeineUntil = Math.round((target - 6) * 4) / 4;
  const n = today?.night;
  const score = today && n ? nightScore({ totalH: today.totalH, nightH: n.asleepH, onset: Date.parse(n.start), wake: Date.parse(n.end), awakeMin: n.awakeMin, wakeups: n.wakeups, split: today.split, stages: n.stages ?? null },
    { need, usualOnset, usualWakeH }) : null;
  const avg = (xs: number[]) => (xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    nights: nights.length, need, needEstimated, avgTotalH: avg(nights.map((x) => x.totalH)), avgNightH: avg(nights.map((x) => x.nightH)),
    debtH: Math.round(debt * 4) / 4, onsetSdMin, wakeSdMin, sri, regularity,
    usualOnset: usualOnset != null ? Math.round(usualOnset * 4) / 4 : null, usualWakeH: usualWakeH != null ? Math.round(usualWakeH * 4) / 4 : null,
    msf, socialJetlagH, chronotype, trendMinPerDay, bedtime, caffeineUntil, score,
    last3AvgH: nights.length >= 3 ? avg(nights.slice(-3).map((x) => x.totalH)) : null,
  };
}

/** «23:45», «00:30» (acepta horas sobre 24) */
export const hhmmOf = (h: number) => { const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

/** Las 2 semanas en una o dos frases, sin culpa: deuda, regularidad, tendencia y cronotipo (solo lo que se sabe). */
export function insightsText(s: SleepInsights): string {
  if (s.nights < 4) return '';
  const out: string[] = [];
  out.push(`En 2 semanas promedias ${fmtSleep(s.avgTotalH ?? 0)} al día${s.debtH >= 1 ? ` y llevas ~${fmtSleep(s.debtH)} de deuda de sueño` : ', sin deuda de sueño'}.`);
  // «te duermes ~23:30» (la mediana de 2 semanas) no se dice si la hora se viene corriendo: ya no es verdad
  const corriendo = s.trendMinPerDay != null && Math.abs(s.trendMinPerDay) >= 20;
  if (s.regularity) out.push(`Tu horario es ${s.regularity}${s.usualOnset != null && !corriendo ? ` (te duermes ~${hhmmOf(s.usualOnset)})` : ''}.`);
  if (corriendo) { const tr = s.trendMinPerDay!; out.push(`Te estás durmiendo ~${Math.abs(tr)} min ${tr > 0 ? 'más tarde' : 'más temprano'} cada día.`); }
  if (s.chronotype) out.push(`Tu reloj interno es más bien ${s.chronotype}${s.socialJetlagH != null && s.socialJetlagH >= 1 ? `, con ${fmtSleep(s.socialJetlagH)} de diferencia entre semana y fin de semana` : ''}.`);
  return out.join(' ');
}

/** La hora para acostarse hoy, la de levantarse y la de la última cafeína, en una frase. */
export function bedtimeText(s: SleepInsights): string {
  const b = s.bedtime;
  // Después de dormir de día cuesta dormirse temprano: no se fuerza la hora, y se mantiene el despertar (dormir algo menos esa
  // noche está bien: ya durmió en el día)
  if (b.napShiftMin > 0) return `Hoy dormiste de día, así que te va a costar dormirte temprano: acuéstate cuando te dé sueño, desde las ${hhmmOf(b.from)}, y levántate igual a las ${hhmmOf(b.wake)} (dormirás menos que de costumbre, y está bien). Cafeína, hasta las ${hhmmOf(s.caffeineUntil)}.`;
  return `Para dormir ${fmtSleep(s.need)} y levantarte a las ${hhmmOf(b.wake)}, acuéstate entre las ${hhmmOf(b.from)} y las ${hhmmOf(b.to)}; cafeína, hasta las ${hhmmOf(s.caffeineUntil)}.`;
}

// ─── En palabras (lo mismo en la app y en el chat) ───────────────────────────

/** «5 h 29», «45 min», «4 h» */
export function fmtSleep(h: number): string {
  const m = Math.round(h * 60);
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh ? (mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`) : `${mm} min`;
}
/** «02:33» */
export const clock = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** «la tarde», «la mañana», «la noche» según cuándo empezó */
const momento = (iso: string) => { const h = new Date(iso).getHours(); return h >= 5 && h < 12 ? 'la mañana' : h >= 12 && h < 19 ? 'la tarde' : 'la noche'; };

/** Una parte en palabras: «la noche, de 02:33 a 09:05 (5 h 29, con 1 h 02 despierto en medio)» */
export function episodeText(e: SleepEpisode): string {
  const awake = e.awakeMin >= 20 ? `, con ${fmtSleep(e.awakeMin / 60)} despierto en medio` : '';
  const what = e.kind === 'noche' ? 'la noche' : e.kind === 'segundo' ? `un segundo sueño en ${momento(e.start)}` : `una siesta en ${momento(e.start)}`;
  return `${what}, de ${clock(e.start)} a ${clock(e.end)} (${fmtSleep(e.asleepH)}${awake})`;
}

/**
 * El sueño del día en una frase: «Dormiste 7 h 40 (de 23:50 a 07:30).» o, partido, «Dormiste 9 h 31 en 2 partes: la noche,
 * de 02:33 a 09:05 (5 h 29, con 1 h 02 despierto en medio), y un segundo sueño en la tarde, de 13:51 a 17:54 (4 h 02).»
 */
export function sleepSummaryText(d: Pick<SleepDay, 'episodes' | 'totalH'>): string {
  const eps = d.episodes;
  if (!eps.length) return '';
  if (eps.length === 1) {
    const e = eps[0];
    const awake = e.awakeMin >= 20 ? `, con ${fmtSleep(e.awakeMin / 60)} despierto en medio` : '';
    return `Dormiste ${fmtSleep(e.asleepH)} (de ${clock(e.start)} a ${clock(e.end)}${awake}).`;
  }
  // Una noche más siestas cortas no es un sueño «en partes»: la noche y, aparte, la siesta
  const night = eps.find((e) => e.kind === 'noche');
  const rest = eps.filter((e) => e !== night);
  if (night && rest.every((e) => e.kind === 'siesta')) {
    const awake = night.awakeMin >= 20 ? `, con ${fmtSleep(night.awakeMin / 60)} despierto en medio` : '';
    const naps = rest.map((e) => `una siesta de ${fmtSleep(e.asleepH)} en ${momento(e.start)}`);
    return `Dormiste ${fmtSleep(night.asleepH)} de noche (de ${clock(night.start)} a ${clock(night.end)}${awake}), más ${naps.join(' y ')}.`;
  }
  const parts = eps.map(episodeText);
  const list = parts.length === 2 ? `${parts[0]}, y ${parts[1]}` : `${parts.slice(0, -1).join('; ')}; y ${parts[parts.length - 1]}`;
  return `Dormiste ${fmtSleep(d.totalH)} en ${eps.length} partes: ${list}.`;
}

/**
 * Lo que significa, sin culpa (para la recuperación cuenta el total; para la calidad, la noche). null si no hay nada que decir.
 * `usualSleepH` = su necesidad (7,5 h si no se sabe).
 */
export function sleepReading(d: Pick<SleepDay, 'totalH' | 'nightH' | 'split' | 'night'>, usualSleepH = 7.5): string | null {
  const need = usualSleepH >= 6 && usualSleepH <= 10 ? usualSleepH : 7.5;
  if (!d.split) return null;
  const late = d.night ? new Date(d.night.start).getHours() : null;
  const tarde = late != null && late >= 2 && late < 12 ? ' y empezó tarde' : '';
  if (d.totalH >= need - 0.5) return `En horas recuperaste, pero la noche fue partida${tarde}: descansa menos que dormir seguido.`;
  return `La noche fue partida${tarde} y en total quedaste bajo lo que necesitas (~${fmtSleep(need)}).`;
}

// ─── Sueño 2.0 · S2 (2026-10-28): lo que necesita la pantalla de Sueño ─────────────────────────────────────────────────

/** El sueño de un día cualquiera (YYYY-MM-DD): lo que cuenta a ese día, nada más (cada sueño está en un solo día). */
export function sleepDayOn(sessions: RawSession[], day: string, o: SleepOpts = {}): SleepDay | null {
  const [y, m, d] = day.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const near = sessions.filter((s) => s.end > start - 24 * H && s.end <= start + 24 * H);
  const eps = episodesOf(sleepBlocks(near), o.gapMin ?? GAP_MIN).filter((e) => epDay(e) === day);
  const kept = near.filter((s) => eps.some((e) => s.start < e.end && s.end > e.start));
  return kept.length ? sleepDay(kept, o) : null;
}

// ─── Anotar con dos horas, sin fechas (2026-11-07) ───────────────────────────────────────────────────────────────────
// Sin reloj, lo anotado es lo único que Eris sabe de tu sueño. Antes: «Corregir» → «Anotar a mano», de a 15 min o 1 h, con fecha:
// de 15 a 38 toques para 17:30–23:50, y a las 23:50 no se llegaba. La persona dice las horas; el día lo deduce Eris.

/** La última vez, antes de `before`, que el reloj marcó esos minutos del día */
function lastClock(min: number, before: number): number {
  const d = new Date(before);
  d.setHours(0, min, 0, 0);
  if (d.getTime() > before) { d.setDate(d.getDate() - 1); d.setHours(0, min, 0, 0); }
  return d.getTime();
}

/** «17:30» + «23:50» → el tramo más reciente que ya pasó. `daysBack`: el mismo tramo, tantos días antes. null si dura menos de 15 min o más de 16 h. */
export function resolveSleepTimes(startMin: number, endMin: number, now: number, daysBack = 0): { start: number; end: number } | null {
  const end0 = lastClock(endMin, now);
  const start0 = lastClock(startMin, end0 - MIN);
  const back = (ms: number) => { const d = new Date(ms); d.setDate(d.getDate() - daysBack); return d.getTime(); };
  const start = back(start0), end = back(end0);
  return end - start >= 15 * MIN && end - start <= 16 * H ? { start, end } : null;
}

/** Una hora que dijo alguien: `amb` si puede ser de día o de noche («5:30», sin am ni pm) */
export interface SaidTime { min: number; amb: boolean }
const NIGHT_MIN_H = 3;

/**
 * El tramo de dos horas dichas, sin fecha. Si alguna puede ser am o pm: el que cubre 3 h o más de la madrugada («de 10 a 6», dicho a
 * las 20:00, es 22:00–06:00); si no hay, el más reciente («de 5:30 a 11:50», a las 00:40, es 17:30–23:50). `end` = 'ahora': recién.
 */
export function resolveSaidTimes(a: SaidTime, b: SaidTime | 'ahora', now: number): { start: number; end: number } | null {
  const opts = (t: SaidTime) => (t.amb ? [t.min, (t.min + 720) % 1440] : [t.min]);
  const ends = b === 'ahora' ? [now] : opts(b).map((m) => lastClock(m, now));
  const pairs: Array<{ start: number; end: number }> = [];
  for (const end of ends) {
    // Si hay dos opciones de inicio, la más cercana antes del fin: «de 11 a 7» son 8 h, no 20
    const start = Math.max(...opts(a).map((m) => lastClock(m, end - MIN)));
    if (end - start >= 15 * MIN && end - start <= 16 * H) pairs.push({ start, end });
  }
  if (!pairs.length) return null;
  const madrugada = (p: { start: number; end: number }) => {
    const d = new Date(p.end); d.setHours(0, 0, 0, 0);
    return (Math.min(p.end, d.getTime() + 6 * H) - Math.max(p.start, d.getTime())) / H;
  };
  const noche = pairs.filter((p) => madrugada(p) >= NIGHT_MIN_H).sort((x, y) => y.end - x.end)[0];
  return noche ?? pairs.sort((x, y) => y.end - x.end)[0];
}

/** Lo que alguien escribe: «1730», «17:30», «730», «7» → minutos del día. null si no es una hora. */
export function parseClock(raw: string): number | null {
  const s = String(raw).replace(/[^\d]/g, '');
  if (!s || s.length > 4) return null;
  const h = s.length <= 2 ? Number(s) : Number(s.slice(0, -2));
  const m = s.length <= 2 ? 0 : Number(s.slice(-2));
  return h <= 23 && m <= 59 ? h * 60 + m : null;
}
/** 1050 → «17:30» */
export const clockOfMin = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

/** «Hoy», «Ayer», «Anteayer» o «3/11» */
export function dayWord(ms: number, now: number): string {
  const cero = (x: number) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const n = Math.round((cero(now) - cero(ms)) / (24 * H));
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Ayer';
  if (n === 2) return 'Anteayer';
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** «Ayer, de 17:30 a 23:50 · 6 h 20» */
export function sleepRangeText(start: number, end: number, now: number): string {
  return `${dayWord(end, now)}, de ${clock(new Date(start).toISOString())} a ${clock(new Date(end).toISOString())} · ${fmtSleep((end - start) / H)}`;
}

/** Lo que pregunta Eris tras un sueño largo a hora rara */
export const wakeQuestionText = (endIso: string) => `Despertaste a las ${clock(endIso)}. ¿Cómo sigues?`;
export const WAKE_OPTIONS: Array<{ id: WakeDecision; label: string }> = [{ id: 'dormir', label: 'Vuelvo a dormir' }, { id: 'partir', label: 'Parto mi día ahora' }];

/**
 * ¿Se ofrece «Recién desperté» en Inicio? Sin el reloj (lo último anotado a mano), Eris no sabe que despertaste hasta que se lo dices:
 * siempre, salvo que hayas anotado hace poco. Con reloj, solo si en tu mañana no ha llegado nada del sueño de anoche.
 */
export function wakePrompt(i: { now: number; lastWake: number | null; lastIsManual: boolean; usualWake?: number | null }): boolean {
  const awakeH = i.lastWake == null ? Infinity : (i.now - i.lastWake) / H;
  if (awakeH < 3) return false;
  if (i.lastIsManual) return true;
  const usual = typeof i.usualWake === 'number' ? i.usualWake : 7.5;
  const rel = ((hourOf(i.now) - usual + 36) % 24) - 12; // horas desde tu despertar de siempre, de −12 a 12
  return awakeH >= 12 && rel >= -2 && rel <= 6;
}

/** Las etapas en el tiempo (hipnograma), como las dibuja el reloj; sin etapas, «dormido» de punta a punta. */
export type HypnoStage = 'despierto' | 'ligero' | 'profundo' | 'rem' | 'dormido';
export function hypnogram(sessions: RawSession[], from: number, to: number): Array<{ start: number; end: number; stage: HypnoStage }> {
  const ok = sessions.filter((s) => s.end > from && s.start < to && s.end > s.start).sort((a, b) => a.start - b.start);
  const groups: Array<{ start: number; end: number; items: RawSession[] }> = [];
  for (const s of ok) {
    const last = groups[groups.length - 1];
    if (last && s.start < last.end) { last.end = Math.max(last.end, s.end); last.items.push(s); } else groups.push({ start: s.start, end: s.end, items: [s] });
  }
  const KIND: Record<number, HypnoStage> = { 1: 'despierto', 3: 'despierto', 7: 'despierto', 4: 'ligero', 5: 'profundo', 6: 'rem', 2: 'dormido', 0: 'dormido' };
  const out: Array<{ start: number; end: number; stage: HypnoStage }> = [];
  for (const g of groups) {
    const a = Math.max(g.start, from), b = Math.min(g.end, to);
    const best = g.items.reduce((x, y) => ((y.stages?.length ?? 0) > (x.stages?.length ?? 0) ? y : x));
    const st = (best.stages ?? []).filter((x) => x.end > x.start).sort((p, q) => p.start - q.start);
    let t = a;
    for (const x of st) {
      const s0 = Math.max(x.start, a), e0 = Math.min(x.end, b);
      if (e0 <= s0) continue;
      if (s0 > t) out.push({ start: t, end: s0, stage: 'dormido' });
      out.push({ start: s0, end: e0, stage: KIND[x.stage] ?? 'dormido' });
      t = Math.max(t, e0);
    }
    if (t < b) out.push({ start: t, end: b, stage: 'dormido' });
  }
  return out;
}

/** Rango típico de cada etapa en adultos, como % del sueño (Ohayon 2004; el reloj las estima, no las mide) */
export const STAGE_RANGES: Record<'ligero' | 'profundo' | 'rem', [number, number]> = { ligero: [50, 60], profundo: [13, 23], rem: [20, 25] };

/**
 * Las correcciones de la persona: lo que el reloj marcó y no era sueño («no estaba durmiendo»: el sillón, el reloj cargando)
 * y lo que durmió sin el reloj («anotar a mano»). Un tramo se quita si la corrección cubre la mitad o más de él.
 */
export interface SleepEdits { excluded: Array<{ start: number; end: number }>; manual: Array<{ start: number; end: number }>; decisions?: WakeDecisions }
export function applySleepEdits(sessions: RawSession[], e: SleepEdits | null | undefined): RawSession[] {
  if (!e) return sessions;
  const kept = sessions.filter((s) => !(e.excluded ?? []).some((x) => (Math.min(s.end, x.end) - Math.max(s.start, x.start)) >= (s.end - s.start) * 0.5));
  return [...kept, ...(e.manual ?? []).filter((m) => m.end > m.start && m.end - m.start <= 16 * H).map((m) => ({ start: m.start, end: m.end }))];
}

/** UNA cosa para hoy, sin culpa (lo que más ayuda según cómo vienes) */
export function sleepAction(s: SleepInsights | null): string {
  if (!s) return 'Cuando tu reloj registre algunas noches, te digo qué es lo que más te ayuda.';
  const b = s.bedtime;
  if (b.napShiftMin > 0) return `Hoy acuéstate cuando te dé sueño y levántate igual a las ${hhmmOf(b.wake)}.`;
  if (s.trendMinPerDay != null && s.trendMinPerDay >= 20) return `Levántate a las ${hhmmOf(b.wake)} aunque te acuestes tarde, y busca luz de mañana: así vuelve tu horario.`;
  if (s.debtH >= 2) return `Esta semana suma 30–60 min por noche: acuéstate desde las ${hhmmOf(b.from)}.`;
  return `Mantén tu horario: acuéstate entre las ${hhmmOf(b.from)} y las ${hhmmOf(b.to)}.`;
}

/** El plan de mejora: UNA meta por 2 semanas, medida con sus noches */
export type PlanKind = 'despertar' | 'duracion' | 'adelantar';
export interface SleepPlan { kind: PlanKind; start: string; targetWake: number; targetH: number; startBed: number; targetBed: number }
export interface PlanInfo { kind: PlanKind; title: string; why: string; how: string; plan: SleepPlan }

/** La meta que más le sirve ahora (o null si su sueño va bien). `today` = YYYY-MM-DD. */
export function suggestPlan(s: SleepInsights, today: string): PlanInfo | null {
  if (s.nights < 5) return null;
  const wake = s.bedtime.wake, need = s.need;
  let targetBed = wake - need; if (targetBed < 12) targetBed += 24;
  let usualBed = s.usualOnset ?? targetBed; if (usualBed < 12) usualBed += 24;
  const base = { start: today, targetWake: wake, targetH: need, startBed: usualBed, targetBed };
  if (s.regularity === 'irregular' || s.regularity === 'algo irregular' || (s.trendMinPerDay != null && s.trendMinPerDay >= 20)) {
    return { kind: 'despertar', title: 'Levántate a la misma hora', why: 'Despertar a la misma hora es lo que más ordena tu reloj interno; el sueño se va acomodando solo.',
      how: `Todos los días a las ${hhmmOf(wake)} (±30 min), también el fin de semana, y luz de mañana apenas te levantes.`, plan: { kind: 'despertar', ...base } };
  }
  if (s.debtH >= 2 || (s.avgTotalH != null && s.avgTotalH < need - 0.5)) {
    return { kind: 'duracion', title: `Dormir ${fmtSleep(need)}`, why: 'La deuda baja de a poco con noches completas, no con un día largo.',
      how: `Acuéstate a las ${hhmmOf(targetBed)} para alcanzar ${fmtSleep(need)} y levantarte a las ${hhmmOf(wake)}.`, plan: { kind: 'duracion', ...base } };
  }
  if (usualBed - targetBed >= 0.75) {
    return { kind: 'adelantar', title: 'Adelantar de a poco la hora de acostarte', why: 'Mover el horario de golpe no funciona; de a 20 minutos, sí.',
      how: `Empieza a las ${hhmmOf(usualBed - 1 / 3)}; cada 3 días, 20 min antes, hasta las ${hhmmOf(targetBed)}.`, plan: { kind: 'adelantar', ...base } };
  }
  return null;
}

/** El nombre corto de la meta (pantalla de Sueño, chat y semana) */
export const planTitle = (p: Pick<SleepPlan, 'kind' | 'targetH'>) =>
  p.kind === 'despertar' ? 'Levántate a la misma hora' : p.kind === 'duracion' ? `Dormir ${fmtSleep(p.targetH)}` : 'Adelantar de a poco la hora de acostarte';

/** Cómo va el plan: el día (1–14) y cuántas noches cumplió (de las que ya pasaron desde que empezó). */
export function planProgress(p: SleepPlan, nights: NightRecord[], now: number): { day: number; hits: number; of: number; done: boolean; text: string } {
  const [y, m, d] = p.start.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const day = Math.min(14, Math.floor((now - start) / (24 * H)) + 1);
  // Cuentan las noches DESDE que empezó (la primera es la que termina al día siguiente: lo de esa mañana ya pasó)
  const ns = nights.filter((n) => n.wake >= start + 24 * H && n.wake <= now);
  const hit = (n: NightRecord) => {
    if (p.kind === 'despertar') return Math.abs(((hourOf(n.wake) - p.targetWake + 36) % 24) - 12) <= 0.5;
    if (p.kind === 'duracion') return n.totalH >= p.targetH - 0.25;
    const k = Math.max(1, Math.floor((n.wake - start) / (24 * H)));              // la noche n.º k del plan (1, 2, 3…)
    const goal = Math.max(p.targetBed, p.startBed - 1 / 3 - Math.floor((k - 1) / 3) / 3); // 20 min antes cada 3 noches
    let onset = hourOf(n.onset); if (onset < 12) onset += 24;
    return onset <= goal + 0.25;
  };
  const hits = ns.filter(hit).length;
  const done = day >= 14;
  const cuenta = `${hits} de ${ns.length} ${ns.length === 1 ? 'noche cumplida' : 'noches cumplidas'}`;
  return { day, hits, of: ns.length, done, text: done ? `Terminaste las 2 semanas: ${cuenta}.` : ns.length ? `Día ${day} de 14 · ${cuenta}.` : `Día ${day} de 14 · empieza esta noche.` };
}

// ─── Sueño 2.0 · S3 (2026-10-29): el sueño en el resto del día (Forge, Nutrición, Inicio, la agenda) ─────────────────────

/** Lo que el resto necesita de la noche: el total de 24 h (recuperación), la noche y si fue partida */
export interface LastSleep { totalH: number; nightH?: number | null; split?: boolean; secondSleep?: boolean }
/** Del `sleep` del snapshot (el mismo en la app y en el servidor) */
export function lastSleepFrom(sl: any): LastSleep | null {
  if (!sl || typeof sl.durationHours !== 'number' || !(sl.durationHours > 0)) return null;
  return { totalH: sl.durationHours, nightH: typeof sl.nightHours === 'number' ? sl.nightHours : null, split: !!sl.split,
    secondSleep: Array.isArray(sl.episodes) && sl.episodes.some((e: any) => e?.kind === 'segundo') };
}

/**
 * Para entrenar: el total de anoche, las 3 últimas noches y la deuda (no una sola noche; Mah 2011, Van Dongen 2003).
 *   normal  → entrena normal
 *   suave   → 1 repetición más en reserva y nada de récords
 *   liviano → técnica, movilidad o caminar; si va, ~10 % menos peso y una serie menos (la descarga de Forge)
 */
export type ReadyLevel = 'normal' | 'suave' | 'liviano';
export interface Readiness { level: ReadyLevel; why: string; tip: string }
export function sleepReadiness(ins: SleepInsights | null | undefined, d: LastSleep | null | undefined): Readiness | null {
  if (!d || !(d.totalH > 0)) return null;
  const need = ins?.need ?? 7.5;
  const l3 = ins?.last3AvgH ?? null, debt = ins && ins.nights >= 4 ? ins.debtH : 0;
  const partida = !!d.split && d.nightH != null && d.nightH < 6;
  const level: ReadyLevel = d.totalH < 5 || (l3 != null && l3 < need - 2) || debt >= 6 ? 'liviano'
    : d.totalH < 6 || partida || (l3 != null && l3 < need - 1) || debt >= 3 ? 'suave' : 'normal';
  const why: string[] = [];
  if (d.totalH < 6) why.push(`dormiste ${fmtSleep(d.totalH)}`);
  else if (partida) why.push(`tu noche fue partida (${fmtSleep(d.nightH!)} de noche)`);
  if (l3 != null && l3 < need - 1) why.push(`vienes de 3 noches de ~${fmtSleep(l3)}`);
  if (debt >= 3) why.push(`llevas ~${fmtSleep(debt)} de deuda de sueño`);
  const tip = level === 'liviano'
    ? 'Hoy conviene algo suave (técnica, movilidad o caminar 20–30 min). Si vas igual: ~10 % menos peso, una serie menos y nada de récords.'
    : level === 'suave' ? 'Entrena, pero deja una repetición más en reserva y nada de récords hoy.' : 'Entrena normal.';
  return { level, why: why.length ? `${why.join(' y ')}`.replace(/^./, (c) => c.toUpperCase()) + '.' : 'Dormiste bien.', tip };
}

/**
 * UNA recomendación del día por cómo dormiste (null si durmió bien). La comida va primero tras una noche corta: con poco
 * sueño sube el hambre (~385 kcal al día siguiente, más de dulce; Al Khatib 2017) y, con diabetes, el cuerpo maneja peor
 * el azúcar (Buxton 2010). Nunca dosis ni remedios.
 */
export interface DayTip { kind: 'corta' | 'partida' | 'deuda'; title: string; sub: string }
export function sleepDayTip(ins: SleepInsights | null | undefined, d: LastSleep | null | undefined, o: { diabetic?: boolean } = {}): DayTip | null {
  if (!d || !(d.totalH > 0)) return null;
  const need = ins?.need ?? 7.5;
  if (d.totalH < need - 1) {
    return o.diabetic
      ? { kind: 'corta', title: `Dormiste ${fmtSleep(d.totalH)}: hoy cuida el azúcar`, sub: 'Tras una noche corta el cuerpo maneja peor el azúcar: carbohidratos con fibra y proteína, y una caminata de 10 min después de comer.' }
      : { kind: 'corta', title: `Dormiste ${fmtSleep(d.totalH)}: adelántate al hambre`, sub: 'Con poco sueño da más hambre, sobre todo de dulce: proteína en el desayuno y una colación pensada para la tarde.' };
  }
  if (d.split && d.nightH != null && d.nightH < 6) {
    return { kind: 'partida', title: 'Tu noche fue partida', sub: d.secondSleep
      ? 'Esta noche acuéstate cuando te dé sueño (no antes) y mañana levántate a tu hora: así vuelve tu horario.'
      : 'Si te da sueño, una siesta de 20 min o menos antes de las 15:00; más larga te quita sueño en la noche.' };
  }
  if (ins && ins.nights >= 4 && ins.debtH >= 3) {
    return { kind: 'deuda', title: `Llevas ~${fmtSleep(ins.debtH)} de deuda de sueño`, sub: `Se paga de a poco: esta noche acuéstate desde las ${hhmmOf(ins.bedtime.from)}.` };
  }
  return null;
}

/** El entreno termina a menos de 1 h de acostarse: el ejercicio de noche no daña el sueño, salvo el intenso justo antes (Stutz 2019) */
export function trainingTimeNote(startH: number, ins: SleepInsights | null | undefined, durH = 1): string | null {
  if (!ins || !(startH >= 12)) return null;
  const bed = ins.bedtime.target, end = startH + durH;
  if (end <= bed - 1) return null;
  return `Tu entreno de las ${hhmmOf(startH)} terminaría cerca de tu hora de dormir (~${hhmmOf(bed)}): si es intenso, que termine al menos 1 h antes, o que sea más suave.`;
}

/** Cafeína: lo anotado con cafeína después de la hora límite (acostarse − 6 h; Drake 2013). Sin descafeinados. */
const CAFE = /\b(cafe|espresso|expreso|capuchino|cappuccino|latte|cortado|mokaccino|moca|mocha|americano|nescafe|energetica|bebida energetica|red ?bull|monster|coca[ -]?cola|pepsi|te negro|te verde|matcha|mate|pre ?-?entreno|cafeina)\b/;
const normTxt = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const isCaffeinated = (name: string) => { const n = normTxt(name); return CAFE.test(n) && !/descaf|sin cafeina/.test(n); };
export function lateCaffeine(items: Array<{ name: string; at: number }>, ins: SleepInsights | null | undefined): { name: string; at: number; text: string } | null {
  if (!ins) return null;
  const wake = ins.bedtime.wake;
  const late = items.filter((x) => {
    if (!x.name || !isCaffeinated(x.name)) return false;
    let h = hourOf(x.at);
    if (h < wake - 1) h += 24; // de madrugada, antes de despertar: es la noche anterior
    return h > ins.caffeineUntil + 0.25;
  }).sort((a, b) => b.at - a.at)[0];
  if (!late) return null;
  return { name: late.name, at: late.at, text: `Tomaste ${late.name.toLowerCase()} a las ${hhmmOf(hourOf(late.at))}, después de tu hora límite (${hhmmOf(ins.caffeineUntil)}): la cafeína dura horas y puede quitarte sueño sin que lo notes. Por hoy no pasa nada; mañana, mejor antes.` };
}

// ─── Sueño 2.0 · S4 (2026-10-29): «¿por qué duermo mal?» — lo que se repite en tus noches ─────────────────────────────────

const ALCOHOL = /\b(cerveza|chela|schop|vino|pisco|piscola|ron|whisky|whiskey|vodka|tequila|gin|fernet|champana|espumante|sidra|terremoto|navegado|cola de mono|aguardiente|licor|trago|coctel|cocktail|michelada|mojito|pipeno)\b/;
export const isAlcohol = (name: string) => { const n = normTxt(name); return ALCOHOL.test(n) && !/sin alcohol|0[.,]0/.test(n); };

/** Lo que pasó antes de dormir, con su hora (ms): lo anotado en Nutrición, el fin de cada entreno (Forge y el reloj) */
export interface HabitEvents { caffeine: number[]; alcohol: number[]; meals: number[]; training: number[]; logged: number[] }
export type PatternKey = 'cafe' | 'alcohol' | 'cena' | 'entreno' | 'siesta';
export interface SleepPattern { key: PatternKey; label: string; n: number; nOther: number; nightDiffMin: number; awakeDiffMin: number; onsetDiffMin: number; text: string }
export interface SleepPatterns { nights: number; found: SleepPattern[]; checked: PatternKey[]; general: string[]; frequentWake: boolean }

/**
 * Compara tus noches (30 días) con y sin cada cosa que suele quitar sueño, con ventanas con respaldo:
 *   café a < 6 h de dormirte (Drake 2013) · alcohol a < 4 h (fragmenta la segunda mitad de la noche; Ebrahim 2013) ·
 *   comer a < 2 h · entrenar terminando a < 1 h y media (Stutz 2019) · siesta o segundo sueño de 30 min o más ese día.
 * Cuenta solo si hay 3 noches o más de cada lado y la diferencia pesa (20 min menos de noche, 15 min más despierto o
 * 45 min más tarde al dormirse). Lo de la comida se compara solo en días con algo anotado (sin anotar no es «no comí tarde»).
 * Es asociación, no causa: así se dice.
 */
export function sleepPatterns(sessions: RawSession[], ev: HabitEvents, o: SleepOpts & { now: number }): SleepPatterns {
  const from = o.now - 30 * 24 * H;
  const byDay = sleepByDay(sessions.filter((s) => s.end > from - 2 * 24 * H), o);
  const nights = nightRecords(sessions.filter((s) => s.end > from - 2 * 24 * H), o).filter((n) => n.wake > from && n.wake <= o.now);
  const prevDay = (k: string) => { const [y, m, d] = k.split('-').map(Number); const x = new Date(y, m - 1, d - 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const within = (xs: number[], a: number, b: number) => xs.some((t) => t >= a && t <= b);
  const nap = (n: NightRecord) => { const d = byDay.get(prevDay(n.day)); return !!d && d.nightH != null && d.totalH - d.nightH >= 0.5; };
  const loggedDay = (n: NightRecord) => within(ev.logged, n.onset - 16 * H, n.onset);
  const tests: Array<{ key: PatternKey; label: string; has: (n: NightRecord) => boolean; eligible: (n: NightRecord) => boolean }> = [
    { key: 'cafe', label: 'café (o algo con cafeína) a menos de 6 h de dormirte', has: (n) => within(ev.caffeine, n.onset - 6 * H, n.onset), eligible: loggedDay },
    { key: 'alcohol', label: 'alcohol en la noche', has: (n) => within(ev.alcohol, n.onset - 4 * H, n.onset), eligible: loggedDay },
    { key: 'cena', label: 'comer a menos de 2 h de dormirte', has: (n) => within(ev.meals, n.onset - 2 * H, n.onset), eligible: loggedDay },
    { key: 'entreno', label: 'entrenar terminando a menos de 1 h y media de dormirte', has: (n) => within(ev.training, n.onset - 1.5 * H, n.onset), eligible: () => true },
    { key: 'siesta', label: 'una siesta o segundo sueño largo ese día', has: nap, eligible: () => true },
  ];
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const onsetH = (n: NightRecord) => ((hourOf(n.onset) - 12 + 24) % 24);
  const found: SleepPattern[] = [];
  const checked: PatternKey[] = [];
  for (const t of tests) {
    const el = nights.filter(t.eligible);
    const yes = el.filter(t.has), no = el.filter((n) => !t.has(n));
    if (yes.length < 3 || no.length < 3) continue;
    checked.push(t.key);
    const nightDiffMin = Math.round((mean(yes.map((n) => n.nightH)) - mean(no.map((n) => n.nightH))) * 60);
    const awakeDiffMin = Math.round(mean(yes.map((n) => n.awakeMin)) - mean(no.map((n) => n.awakeMin)));
    const onsetDiffMin = Math.round((mean(yes.map(onsetH)) - mean(no.map(onsetH))) * 60);
    if (!(nightDiffMin <= -20 || awakeDiffMin >= 15 || onsetDiffMin >= 45)) continue;
    const bits: string[] = [];
    if (nightDiffMin <= -20) bits.push(`dormiste ~${fmtSleep(-nightDiffMin / 60)} menos`);
    if (awakeDiffMin >= 15) bits.push(`estuviste ~${awakeDiffMin} min más despierto en la noche`);
    if (onsetDiffMin >= 45) bits.push(`te dormiste ~${fmtSleep(onsetDiffMin / 60)} más tarde`);
    found.push({ key: t.key, label: t.label, n: yes.length, nOther: no.length, nightDiffMin, awakeDiffMin, onsetDiffMin,
      text: `Las ${yes.length} noches con ${t.label}, ${bits.join(' y ')} que las otras ${no.length}.` });
  }
  found.sort((a, b) => a.nightDiffMin - b.nightDiffMin || b.awakeDiffMin - a.awakeDiffMin);
  const general: string[] = [];
  const recent = nights.filter((n) => n.wake > o.now - 14 * 24 * H);
  const partidas = recent.filter((n) => n.awakeMin >= 45).length;
  if (partidas >= 3) general.push(`${partidas} de tus últimas ${recent.length} noches tuvieron 45 min o más despierto en medio.`);
  return { nights: nights.length, found: found.slice(0, 2), checked, general, frequentWake: nights.filter((n) => n.awakeMin >= 45).length >= 12 };
}

/** La respuesta a «¿por qué duermo mal?»: lo que se repite (asociación), el horario y UNA cosa para probar 2 semanas */
export function patternsText(p: SleepPatterns | null | undefined, ins: SleepInsights | null | undefined): string {
  const out: string[] = [];
  if (!p || p.nights < 7) return 'Todavía tengo pocas noches medidas para ver qué se repite: con unas 2 semanas de tu reloj (y lo que anotas en Nutrición y Forge) te digo qué coincide con tus peores noches.';
  if (p.found.length) {
    out.push(`Esto es lo que se repite en tus últimas ${p.nights} noches:`);
    for (const f of p.found) out.push(`• ${f.text}`);
  } else {
    out.push(`En tus últimas ${p.nights} noches no veo que el café, el alcohol, comer o entrenar tarde, ni las siestas cambien tu sueño de forma clara.`);
  }
  if (ins && ins.trendMinPerDay != null && ins.trendMinPerDay >= 20) out.push(`• Tu hora de dormirte se viene corriendo ~${ins.trendMinPerDay} min por día: si te levantas a la misma hora, eso solo ya acorta tus noches.`);
  else if (ins && (ins.regularity === 'irregular' || ins.regularity === 'algo irregular')) out.push(`• Tu horario es ${ins.regularity}: dormirte y despertar a horas distintas cada día descansa menos, aunque sumes las mismas horas.`);
  if (ins && ins.nights >= 4 && ins.debtH >= 3) out.push(`• Llevas ~${fmtSleep(ins.debtH)} de deuda de sueño en 2 semanas.`);
  for (const g of p.general) out.push(`• ${g}`);
  const top = p.found[0]?.key;
  const prueba: Record<PatternKey, string> = {
    cafe: ins ? `deja la cafeína hasta las ${hhmmOf(ins.caffeineUntil)}` : 'deja la cafeína 6 h antes de dormir',
    alcohol: 'evita el alcohol las 3–4 h antes de dormir',
    cena: 'cena 2–3 h antes de acostarte',
    entreno: 'termina de entrenar al menos 1 h antes de acostarte (o deja lo intenso para más temprano)',
    siesta: 'si duermes de día, que sea 20 min o menos y antes de las 15:00',
  };
  const una = top ? prueba[top]
    : ins && ((ins.trendMinPerDay ?? 0) >= 20 || ins.regularity === 'irregular' || ins.regularity === 'algo irregular') ? 'levántate a la misma hora todos los días (también el fin de semana) y busca luz de mañana'
    : null;
  if (p.found.length || una) out.push(`Es lo que se repite en tus datos, no prueba que sea la causa.${una ? ` Para salir de la duda: ${una} por 2 semanas y vemos si cambian tus noches.` : ''}`);
  if (p.frequentWake) out.push('Si despertarte en la noche te pasa casi siempre y desde hace meses, coméntalo con tu médico: hay tratamientos sin remedios que funcionan muy bien (como la terapia cognitivo-conductual para el insomnio).');
  return out.join('\n');
}

// ─── ⚡ Modo Rendimiento · R0 (2026-10-29): la curva de alerta del día (ESTIMADA) ─────────────────────────────────────────

/**
 * Cómo se espera que vaya la alerta hoy, de despertar a acostarse: modelo de dos procesos simplificado (Borbély 1982).
 *   - S, la presión de sueño: parte de cómo durmió anoche y la deuda; sube despierto (τ 18,2 h) y baja durmiendo (τ 4,2 h).
 *   - C, el reloj interno: anclado a su cronotipo (punto medio en días libres) o a su despertar de siempre, con el bajón de
 *     la tarde (~7,5 h después de despertar) y el «segundo aire» de la tarde-noche.
 *   - La inercia al despertar (y al salir de una siesta).
 * SOLO para el Modo Rendimiento y marcada «estimada»: no está calibrada con la persona (eso queda para el módulo mental,
 * con la prueba de reacción). Los niveles van de 0 a 1 y sirven para comparar las horas del mismo día, no días entre sí.
 */
export type AlertLevel = 'bajo' | 'medio' | 'bueno';
export interface AlertCurve {
  wake: number;
  bed: number;
  /** [hora local (puede pasar de 24), nivel 0–1] cada media hora despierto */
  puntos: Array<[number, number]>;
  /** mejor foco (1,5 h), bajón (1,5 h) y segundo aire (2 h): [desde, hasta] en horas locales */
  foco: [number, number];
  bajon: [number, number];
  segundoAire: [number, number] | null;
  /** cómo parte el día (presión de sueño al despertar) */
  nivel: AlertLevel;
  estimado: true;
}
export function alertCurve(ins: SleepInsights | null | undefined, d: LastSleep | null | undefined, wakeH: number,
  o: { naps?: Array<{ start: number; end: number }> } = {}): AlertCurve {
  const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
  const need = ins?.need ?? 7.5;
  const debt = ins && ins.nights >= 4 ? Math.min(8, ins.debtH) : 0;
  const S0 = clamp(0.15 + (d && d.totalH > 0 ? 0.09 * Math.max(0, need - d.totalH) : 0) + 0.025 * debt, 0.1, 0.85);
  const anchor = ins?.msf != null ? ins.msf + 1.5 : (ins?.usualWakeH ?? wakeH) - 2; // el mínimo de la temperatura
  let bed = ins?.bedtime?.target ?? wakeH + 16.5;
  while (bed <= wakeH + 8) bed += 24;
  if (bed > wakeH + 20) bed = wakeH + 17;
  const naps = (o.naps ?? []).filter((n) => n.end > n.start && n.start > wakeH && n.start < bed);
  const STEP = 0.25;
  const all: Array<[number, number | null]> = [];
  let S = S0, lastWake = wakeH;
  for (let t = wakeH; t <= bed + 1e-9; t += STEP) {
    const nap = naps.find((n) => t >= n.start && t < n.end);
    if (nap) { S *= Math.exp(-STEP / 4.2); lastWake = nap.end; all.push([t, null]); continue; }
    const C = 0.25 * Math.cos((2 * Math.PI * (t - (anchor + 12))) / 24) - 0.15 * Math.cos((4 * Math.PI * (t - (anchor + 9.5))) / 24);
    const I = -0.25 * Math.exp(-(t - wakeH) / 0.4) - (lastWake !== wakeH ? 0.12 * Math.exp(-(t - lastWake) / 0.25) : 0);
    all.push([t, clamp(C - S + I + 0.75, 0.03, 1)]);
    S = 1 - (1 - S) * Math.exp(-STEP / 18.2);
  }
  const q = (h: number) => Math.round(h * 4) / 4;
  // La ventana de `len` horas con el promedio más alto (o más bajo) que empieza entre `from` y `to`
  const best = (from: number, to: number, len: number, low: boolean): { at: number; mean: number } | null => {
    const n = Math.round(len / STEP);
    let out: { at: number; mean: number } | null = null;
    for (let k = 0; k + n <= all.length; k++) {
      const t0 = all[k][0];
      if (t0 < from - 1e-9 || t0 > to + 1e-9) continue;
      const win = all.slice(k, k + n);
      if (win.some((p) => p[1] == null)) continue;
      const mean = win.reduce((a, p) => a + (p[1] as number), 0) / n;
      if (!out || (low ? mean < out.mean : mean > out.mean)) out = { at: t0, mean };
    }
    return out;
  };
  const f = best(wakeH + 1, wakeH + 6, 1.5, false) ?? { at: wakeH + 2, mean: 0 };
  const b = best(Math.max(wakeH + 5, f.at + 2.5), wakeH + 10, 1.5, true) ?? { at: wakeH + 7, mean: 0 };
  const s = best(b.at + 2.5, bed - 3, 2, false);
  return {
    wake: q(wakeH), bed: q(bed),
    puntos: all.filter((p, k) => p[1] != null && k % 2 === 0).map((p) => [q(p[0]), Math.round((p[1] as number) * 100) / 100]),
    foco: [q(f.at), q(f.at + 1.5)], bajon: [q(b.at), q(b.at + 1.5)],
    segundoAire: s && s.mean >= b.mean + 0.05 ? [q(s.at), q(s.at + 2)] : null,
    nivel: S0 < 0.25 ? 'bueno' : S0 < 0.45 ? 'medio' : 'bajo', estimado: true,
  };
}

/** «mejor foco 09:00–10:30 · bajón 13:30–15:00 · segundo aire 18:00–20:00 (estimado)» */
export function alertCurveText(c: AlertCurve): string {
  const r = (w: [number, number]) => `${hhmmOf(w[0])}–${hhmmOf(w[1])}`;
  return `mejor foco ${r(c.foco)} · bajón ${r(c.bajon)}${c.segundoAire ? ` · segundo aire ${r(c.segundoAire)}` : ''}`;
}

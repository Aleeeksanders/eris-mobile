// ============================================================
// Eris Mobile — Sueño (Sueño 2.0 · S2, 2026-10-28)
//
// Pedido del usuario (24-10): «más así el bloque de sueño e igual de preciso» que Mi Fitness, pero con la calidad de Eris.
//   - Día: lo que dice Eris (la palabra de la noche y UNA acción), las partes del día para elegir (la noche, un segundo
//     sueño, siestas), el hipnograma, las etapas con su rango típico (estimadas por el reloj), lo de durante el sueño y
//     «Corregir» (no estaba durmiendo). «Anotar sueño» va a la vista, con dos horas y sin fechas (SleepEntry, 2026-11-07).
//   - Semana y Mes: horas por día, la regularidad (de dormirse a despertar) con su ventana habitual, deuda, tendencia,
//     cronotipo, el plan de mejora (UNA meta por 2 semanas, medida con sus noches) y la hora para acostarse.
//   - «Sin números» (medir sin obsesión): palabras y barras, sin horas, porcentajes ni puntajes.
// Todo sale de sleepCore (la misma cuenta que el servidor). Lee 31 días de Health Connect al abrir.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { T, R } from '../../config/design';
import InfoTip from '../../components/InfoTip';
import { daySchedule } from '../../services/daySchedule';
import { readSleepSessions, readSleepVitals, sleepPatternsNow, type SleepVitals } from '../../services/MetricsService';
import {
  sleepDay, sleepDayOn, sleepKey, sleepInsights, sleepByDay, nightRecords, hypnogram, STAGE_RANGES, sleepSummaryText, sleepReading, sleepAction,
  insightsText, bedtimeText, suggestPlan, planProgress, planTitle, patternsText, fmtSleep, clock, hhmmOf, type SleepPatterns,
  type RawSession, type SleepEpisode, type SleepDay, type SleepPlan, type HypnoStage, type WakeDecisions,
} from '../../services/sleep/sleepCore';
import { SleepEntryForm, WakeQuestion } from './SleepEntry';
import { excludeSleep, clearSleepEdits, loadSleepEdits, loadSleepPlan, saveSleepPlan, loadNoNumbers, saveNoNumbers } from '../../services/sleep/sleepStore';

const C = {
  night: '#a78bfa', segundo: '#38bdf8', siesta: '#94a3b8',
  deep: '#6d5bd0', rem: '#38bdf8', light: '#8aa4f8', awake: '#f59e0b', asleep: '#64748b',
  card: '#0f0e17', line: 'rgba(167,139,250,0.18)',
};
const STAGE_COLOR: Record<HypnoStage, string> = { profundo: C.deep, rem: C.rem, ligero: C.light, despierto: C.awake, dormido: C.asleep };
const STAGE_LANE: Record<HypnoStage, number> = { despierto: 0, rem: 1, ligero: 2, dormido: 2, profundo: 3 };
const KIND_LABEL: Record<string, string> = { noche: 'Noche', segundo: 'Segundo sueño', siesta: 'Siesta' };
const WORD_COLOR: Record<string, string> = { Buena: T.green, Corta: T.gold, Partida: T.gold, Irregular: T.gold };

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const keyToDate = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k: string, n: number) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
const dayLabel = (k: string) => {
  const today = dayKey(new Date());
  if (k === today) return 'Hoy';
  if (k === addDays(today, -1)) return 'Ayer';
  const d = keyToDate(k);
  return `${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};

type View_ = 'dia' | 'semana' | 'mes';

export default function SleepScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [sessions, setSessions] = useState<RawSession[] | null>(null);
  const [view, setView] = useState<View_>('dia');
  const [day, setDay] = useState(dayKey(new Date()));
  const [part, setPart] = useState<number | 'todo'>('todo');
  const [noNums, setNoNums] = useState(false);
  const [plan, setPlan] = useState<SleepPlan | null>(null);
  const [hasEdits, setHasEdits] = useState(false);
  const [decisions, setDecisions] = useState<WakeDecisions>({});

  const load = useCallback(async () => {
    try { setSessions(await readSleepSessions(31)); } catch { setSessions([]); }
    setPlan(await loadSleepPlan());
    const e = await loadSleepEdits();
    setHasEdits(e.excluded.length + e.manual.length > 0);
    setDecisions(e.decisions ?? {});
  }, []);
  useEffect(() => { if (visible) { setDay(dayKey(new Date())); setPart('todo'); load(); loadNoNumbers().then(setNoNums); } }, [visible, load]);

  const opts = useMemo(() => ({ usualWake: daySchedule.usualWake(), usualSleepH: daySchedule.sleepHours(), now: Date.now(), decisions }), [sessions, decisions]);
  // El día más reciente: el de hoy, o el de mañana si un sueño largo terminó recién, pasadas las 18:00 (cuenta al día siguiente)
  const actual = useMemo(() => (sessions ? sleepDay(sessions.filter((s) => s.end > Date.now() - 36 * 3_600_000), opts) : null), [sessions, opts]);
  const maxDay = actual && actual.day > dayKey(new Date()) ? actual.day : dayKey(new Date());
  const sd = useMemo(() => (sessions ? sleepDayOn(sessions, day, opts) : null), [sessions, day, opts]);
  const endOfDay = keyToDate(day).getTime() + 86_400_000;
  // Lo de ese día se calcula como si fuera ese día (sin lo que vino después); el plan y «Hoy», siempre con lo de ahora
  const insAt = (now: number) => (sessions && sessions.length ? sleepInsights(sessions.filter((s) => s.end <= now), { ...opts, now }) : null);
  const ins = useMemo(() => insAt(Math.min(Date.now(), endOfDay)), [sessions, day, opts]);
  const insNow = useMemo(() => insAt(Date.now()), [sessions, opts]);
  const nights = useMemo(() => (sessions ? nightRecords(sessions, opts) : []), [sessions, opts]);

  const toggleNums = () => { const v = !noNums; setNoNums(v); saveNoNumbers(v); };
  const edited = async (fn: () => Promise<void>) => { await fn(); setPart('todo'); await load(); };
  const anotado = async (r: { start: number; end: number }) => { setDay(sleepKey(r.end, (r.end - r.start) / 60_000)); setPart('todo'); await load(); };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.root}>
        <View style={st.header}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver"><Text style={st.back}>‹</Text></Pressable>
          <Text style={st.title}>Sueño</Text>
          <Pressable onPress={toggleNums} hitSlop={8} accessibilityRole="switch" accessibilityState={{ checked: noNums }} style={[st.numBtn, noNums && st.numBtnOn]}>
            <Text style={[st.numBtnText, noNums && { color: C.night }]}>{noNums ? '✓ Sin números' : 'Sin números'}</Text>
          </Pressable>
        </View>

        <View style={st.seg}>
          {(['dia', 'semana', 'mes'] as View_[]).map((v) => (
            <Pressable key={v} onPress={() => setView(v)} style={[st.segBtn, view === v && st.segBtnOn]} accessibilityRole="tab" accessibilityState={{ selected: view === v }}>
              <Text style={[st.segText, view === v && st.segTextOn]}>{v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}</Text>
            </Pressable>
          ))}
        </View>

        <View style={st.dateRow}>
          <Pressable onPress={() => { setDay(addDays(day, view === 'mes' ? -30 : view === 'semana' ? -7 : -1)); setPart('todo'); }} hitSlop={10}><Text style={st.arrow}>‹</Text></Pressable>
          <Text style={st.dateText}>{view === 'dia' ? dayLabel(day) : `${dayLabel(addDays(day, view === 'mes' ? -29 : -6))} – ${dayLabel(day)}`}</Text>
          <Pressable disabled={day >= maxDay} onPress={() => { const n = addDays(day, view === 'mes' ? 30 : view === 'semana' ? 7 : 1); setDay(n > maxDay ? maxDay : n); setPart('todo'); }} hitSlop={10}>
            <Text style={[st.arrow, day >= maxDay && { opacity: 0.25 }]}>›</Text>
          </Pressable>
        </View>

        {!sessions ? (
          <View style={st.center}><ActivityIndicator color={C.night} /></View>
        ) : (
          <ScrollView contentContainerStyle={st.body}>
            {view === 'dia'
              ? <DayView sd={sd} ins={ins} part={part} setPart={setPart} noNums={noNums} sessions={sessions} day={day} hasEdits={hasEdits} edited={edited} anotado={anotado} pendingWake={actual?.pendingWake ?? null} onAnswered={load} />
              : <RangeView days={view === 'mes' ? 30 : 7} endDay={day} sessions={sessions} opts={opts} ins={ins} insNow={insNow} nights={nights} noNums={noNums} plan={plan} setPlan={(p) => { setPlan(p); saveSleepPlan(p); }} />}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── Día ─────────────────────────────────────────────────────────────────────

function DayView({ sd, ins, part, setPart, noNums, sessions, day, hasEdits, edited, anotado, pendingWake, onAnswered }: {
  sd: SleepDay | null; ins: ReturnType<typeof sleepInsights> | null; part: number | 'todo'; setPart: (p: number | 'todo') => void; noNums: boolean;
  sessions: RawSession[]; day: string; hasEdits: boolean; edited: (fn: () => Promise<void>) => Promise<void>;
  anotado: (r: { start: number; end: number }) => Promise<void>; pendingWake: string | null; onAnswered: () => void;
}) {
  const { width } = useWindowDimensions();
  const [vitals, setVitals] = useState<SleepVitals | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => { setAdding(false); }, [day]);
  const eps = sd?.episodes ?? [];
  const sel: SleepEpisode[] = part === 'todo' ? eps : eps[part] ? [eps[part]] : eps;
  const from = sel.length ? Date.parse(sel[0].start) : 0, to = sel.length ? Date.parse(sel[sel.length - 1].end) : 0;
  useEffect(() => { setVitals(null); if (from && to) readSleepVitals(from, to).then(setVitals).catch(() => {}); }, [from, to]);
  const isToday = day === dayKey(new Date());
  const score = sd?.night ? ins?.score ?? null : null;

  // Lo que va arriba de todo: la pregunta si hay una, y anotar a la vista
  const pregunta = pendingWake ? <View style={[st.card, { borderColor: `${C.night}88` }]}><WakeQuestion endIso={pendingWake} onAnswered={onAnswered} /></View> : null;
  const formulario = <SleepEntryForm targetDay={day} usualOnset={ins?.usualOnset} usualWake={daySchedule.usualWake()} need={ins?.need} onSaved={async (r) => { setAdding(false); await anotado(r); }} onCancel={sd && eps.length ? () => setAdding(false) : undefined} />;

  if (!sd || !eps.length) {
    return (
      <View style={{ gap: 14 }}>
        {pregunta}
        <View style={st.card}>
          <Text style={st.big}>Sin sueño registrado</Text>
          <Text style={st.muted}>Anótalo con dos horas: el día lo deduzco yo.</Text>
          <View style={{ marginTop: 8 }}>{formulario}</View>
        </View>
        {hasEdits && <Corregir sel={[]} day={day} hasEdits={hasEdits} edited={edited} />}
      </View>
    );
  }

  // Lo que dice Eris: la palabra de la noche, qué pasó (sin números si así lo pidió) y UNA acción
  const words = eps.length > 1
    ? `Dormiste en ${eps.length} partes: ${eps.map((e) => (e.kind === 'noche' ? 'la noche' : e.kind === 'segundo' ? 'un segundo sueño' : 'una siesta')).join(' y ')}.`
    : 'Dormiste de un tirón.';
  const reading = sleepReading(sd, ins?.need);
  const totStages = sumStages(sel);
  // El % de cada etapa, sobre lo dormido CON etapas (un tramo sin etapas, como la siesta corta, no cuenta)
  const selH = totStages ? totStages.light + totStages.deep + totStages.rem : 0;

  return (
    <View style={{ gap: 14 }}>
      {pregunta}
      {/* Eris */}
      <View style={[st.card, { borderColor: score ? `${WORD_COLOR[score.word]}55` : C.line }]}>
        <View style={st.rowBetween}>
          <Text style={[st.word, { color: score ? WORD_COLOR[score.word] : T.text }]}>{score ? score.word : noNums ? 'Tu noche' : fmtSleep(sd.totalH)}</Text>
          {!noNums && score && <Text style={st.scoreNum}>{score.total}<Text style={st.scoreOf}>/100</Text></Text>}
        </View>
        <Text style={st.text}>{noNums ? words : sleepSummaryText(sd)}</Text>
        {!!reading && !noNums && <Text style={st.muted}>{reading}</Text>}
        {isToday && <Text style={[st.text, { color: C.night, marginTop: 4 }]}>→ {sleepAction(ins)}</Text>}
        {score && !noNums && (
          <View style={st.scoreParts}>
            {(['duracion', 'regularidad', 'continuidad', 'horario', 'etapas'] as const).map((k) => (
              <Text key={k} style={st.scorePart}>{({ duracion: 'Duración', regularidad: 'Regularidad', continuidad: 'Continuidad', horario: 'Horario', etapas: 'Etapas' })[k]} {score.parts[k]}</Text>
            ))}
          </View>
        )}
      </View>

      {adding ? <View style={st.card}><Text style={st.h3}>Anotar sueño</Text>{formulario}</View>
        : <Pressable onPress={() => setAdding(true)} style={st.addBtn} accessibilityRole="button"><Text style={st.addBtnTxt}>+ Anotar sueño</Text></Pressable>}

      {/* Las partes, para elegir (como Mi Fitness) */}
      {eps.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip on={part === 'todo'} onPress={() => setPart('todo')} label={noNums ? 'Todo el día' : `Todo · ${fmtSleep(sd.totalH)}`} color={C.night} />
          {eps.map((e, i) => (
            <Chip key={e.start} on={part === i} onPress={() => setPart(i)} color={e.kind === 'noche' ? C.night : e.kind === 'segundo' ? C.segundo : C.siesta}
              label={`${KIND_LABEL[e.kind]} ${clock(e.start)}–${clock(e.end)}${noNums ? '' : ` · ${fmtSleep(e.asleepH)}`}`} />
          ))}
        </ScrollView>
      )}

      {/* Hipnograma */}
      <View style={st.card}>
        <View style={st.rowBetween}>
          <Text style={st.h3}>Etapas en el tiempo</Text>
          <InfoTip info={{ titulo: 'Etapas del sueño', corto: 'El reloj las estima con tu pulso y tus movimientos: sirven para ver cómo vas, no como un examen médico. Lo más confiable es cuánto dormiste, a qué hora y cuántas veces despertaste.', fuente: 'Health Connect (tu reloj). Validaciones con polisomnografía: los relojes miden bien dormido/despierto y las etapas solo de forma moderada (Chinoy 2021).' }} color={C.night} />
        </View>
        <Hypno sessions={sessions} from={from} to={to} width={width - 64} />
        {!noNums && sel.some((e) => e.awakeMin >= 1) && <Text style={st.muted}>Despierto: {sel.reduce((a, e) => a + e.wakeups, 0)} {sel.reduce((a, e) => a + e.wakeups, 0) === 1 ? 'vez' : 'veces'} · {fmtSleep(sel.reduce((a, e) => a + e.awakeMin, 0) / 60)}</Text>}
      </View>

      {/* Etapas con su rango típico */}
      {totStages && (
        <View style={st.card}>
          <Text style={st.h3}>Etapas</Text>
          {([['profundo', 'Profundo', totStages.deep], ['rem', 'REM', totStages.rem], ['ligero', 'Ligero', totStages.light]] as const).map(([k, label, h]) => {
            const pct = selH > 0 ? Math.round((h / selH) * 100) : 0;
            const [lo, hi] = STAGE_RANGES[k];
            return (
              <View key={k} style={{ gap: 4 }}>
                <View style={st.rowBetween}>
                  <Text style={st.text}>{label}</Text>
                  <Text style={st.muted}>{noNums ? (pct < lo ? 'algo bajo lo típico' : pct > hi ? 'algo sobre lo típico' : 'en lo típico') : `${pct} % · ${fmtSleep(h)} · típico ${lo}–${hi} %`}</Text>
                </View>
                <View style={st.track}>
                  <View style={[st.range, { left: `${lo}%`, width: `${hi - lo}%` }]} />
                  <View style={[st.fill, { width: `${Math.min(100, pct)}%`, backgroundColor: STAGE_COLOR[k] }]} />
                </View>
              </View>
            );
          })}
          <Text style={st.small}>Rango típico en adultos (Ohayon 2004). El reloj las estima: no te preocupes por un día.</Text>
        </View>
      )}

      {/* Durante el sueño */}
      {!!vitals && Object.keys(vitals).length > 0 && (
        <View style={st.card}>
          <Text style={st.h3}>Durante el sueño</Text>
          <View style={st.vitals}>
            {vitals.hr != null && <Vital label="Pulso medio" value={noNums ? '—' : `${vitals.hr} lpm`} sub={vitals.hrMin && !noNums ? `mín. ${vitals.hrMin}` : undefined} />}
            {vitals.spo2 != null && <Vital label="Oxígeno" value={noNums ? (vitals.spo2 >= 95 ? 'normal' : 'revisar') : `${vitals.spo2} %`} sub={vitals.spo2Min && !noNums ? `mín. ${vitals.spo2Min} %` : undefined} />}
            {vitals.resp != null && <Vital label="Respiración" value={noNums ? '—' : `${String(vitals.resp).replace('.', ',')}/min`} />}
          </View>
          {vitals.spo2Min != null && vitals.spo2Min < 90 && (
            <Text style={st.muted}>Tu oxígeno bajó de 90 % en algún momento. Una vez puede ser el reloj; si se repite y además roncas o despiertas cansado, coméntalo con tu médico.</Text>
          )}
        </View>
      )}

      <Corregir sel={sel} day={day} hasEdits={hasEdits} edited={edited} />
    </View>
  );
}

function sumStages(eps: SleepEpisode[]): { light: number; deep: number; rem: number } | null {
  const s = eps.filter((e) => e.stages);
  if (!s.length) return null;
  return { light: s.reduce((a, e) => a + e.stages!.light, 0), deep: s.reduce((a, e) => a + e.stages!.deep, 0), rem: s.reduce((a, e) => a + e.stages!.rem, 0) };
}

function Hypno({ sessions, from, to, width }: { sessions: RawSession[]; from: number; to: number; width: number }) {
  const segs = useMemo(() => (from && to ? hypnogram(sessions, from, to) : []), [sessions, from, to]);
  const H = 132, laneH = 26, top = 6, left = 64;
  const w = Math.max(100, width - left);
  const x = (t: number) => left + ((t - from) / Math.max(1, to - from)) * w;
  const lanes = ['Despierto', 'REM', 'Ligero', 'Profundo'];
  const ticks: number[] = [];
  const step = to - from > 10 * 3_600_000 ? 3 : to - from > 4 * 3_600_000 ? 2 : 1;
  const t0 = new Date(from); t0.setMinutes(0, 0, 0);
  for (let t = t0.getTime() + 3_600_000; t < to; t += 3_600_000) if (new Date(t).getHours() % step === 0) ticks.push(t);
  return (
    <Svg width={left + w} height={H + 18}>
      {lanes.map((l, i) => (
        <React.Fragment key={l}>
          <Line x1={left} x2={left + w} y1={top + i * laneH + laneH / 2} y2={top + i * laneH + laneH / 2} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          <SvgText x={0} y={top + i * laneH + laneH / 2 + 4} fill={T.textMuted} fontSize={10}>{l}</SvgText>
        </React.Fragment>
      ))}
      {/* Los ratos entre tramos de una misma noche: despierto (entre una parte del día y otra, en blanco) */}
      {segs.slice(1).map((s, i) => (s.start - segs[i].end > 60_000 && s.start - segs[i].end < 90 * 60_000 ? (
        <Rect key={`g${i}`} x={x(segs[i].end)} y={top + 6} width={Math.max(1, x(s.start) - x(segs[i].end))} height={laneH - 12} fill={C.awake} opacity={0.35} rx={2} />
      ) : null))}
      {segs.map((s, i) => (
        <Rect key={i} x={x(s.start)} y={top + STAGE_LANE[s.stage] * laneH + 4} width={Math.max(1, x(s.end) - x(s.start))} height={laneH - 8} fill={STAGE_COLOR[s.stage]} rx={2} />
      ))}
      {ticks.map((t) => (
        <SvgText key={t} x={x(t) - 12} y={H + 14} fill={T.textMuted} fontSize={10}>{clock(new Date(t).toISOString())}</SvgText>
      ))}
    </Svg>
  );
}

function Corregir({ sel, day, hasEdits, edited }: {
  sel: SleepEpisode[]; day: string; hasEdits: boolean; edited: (fn: () => Promise<void>) => Promise<void>;
}) {
  const base = keyToDate(day).getTime();
  if (sel.length !== 1 && !hasEdits) return null;
  return (
    <View style={st.card}>
      <Text style={st.h3}>Corregir</Text>
      <Text style={st.small}>Si el reloj marcó sueño cuando no dormías (en el sillón, o quedó cargando), o anotaste algo mal.</Text>
      <View style={st.btnRow}>
        {sel.length === 1 && (
          <Pressable style={st.btn} onPress={() => edited(() => excludeSleep(Date.parse(sel[0].start), Date.parse(sel[0].end)))}>
            <Text style={st.btnText}>No estaba durmiendo</Text>
          </Pressable>
        )}
        {hasEdits && (
          <Pressable style={st.btnGhost} onPress={() => edited(() => clearSleepEdits(base - 12 * 3_600_000, base + 24 * 3_600_000))}><Text style={st.btnGhostText}>Deshacer lo corregido</Text></Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Semana y Mes ────────────────────────────────────────────────────────────

function RangeView({ days, endDay, sessions, opts, ins, insNow, nights, noNums, plan, setPlan }: {
  days: number; endDay: string; sessions: RawSession[]; opts: { usualWake: number | null; usualSleepH: number }; ins: ReturnType<typeof sleepInsights> | null; insNow: ReturnType<typeof sleepInsights> | null;
  nights: ReturnType<typeof nightRecords>; noNums: boolean; plan: SleepPlan | null; setPlan: (p: SleepPlan | null) => void;
}) {
  const { width } = useWindowDimensions();
  const byDay = useMemo(() => sleepByDay(sessions, opts), [sessions, opts]);
  const keys = Array.from({ length: days }, (_, i) => addDays(endDay, i - days + 1));
  const rows = keys.map((k) => ({ k, d: byDay.get(k) ?? null }));
  const withData = rows.filter((r) => r.d);
  const avg = withData.length ? withData.reduce((a, r) => a + r.d!.totalH, 0) / withData.length : null;
  const need = ins?.need ?? 7.5;
  const today = dayKey(new Date());
  const suggestion = insNow ? suggestPlan(insNow, today) : null;
  const prog = plan ? planProgress(plan, nights, Date.now()) : null;

  return (
    <View style={{ gap: 14 }}>
      {/* Horas por día */}
      <View style={st.card}>
        <View style={st.rowBetween}>
          <Text style={st.h3}>Horas dormidas</Text>
          {!noNums && avg != null && <Text style={st.muted}>promedio {fmtSleep(avg)}</Text>}
        </View>
        <Bars rows={rows} need={need} width={width - 64} noNums={noNums} />
        <Text style={st.small}><Text style={{ color: C.night }}>■</Text> noche  <Text style={{ color: C.segundo }}>■</Text> siestas y segundo sueño{noNums ? '' : `  ┄ lo que necesitas (${fmtSleep(need)})`}</Text>
      </View>

      {/* Regularidad: de dormirse a despertar */}
      <View style={st.card}>
        <View style={st.rowBetween}>
          <Text style={st.h3}>Regularidad</Text>
          <InfoTip info={{ titulo: 'Regularidad del sueño', corto: 'Dormirte y despertar a horas parecidas todos los días predice tu salud incluso más que cuántas horas duermes.', calculo: 'Sleep Regularity Index de la última semana (qué tan seguido estás en el mismo estado a la misma hora en días seguidos) y cuánto varía tu hora de dormirte. Manda el más exigente.', fuente: 'Phillips 2017; Windred 2024 (SLEEP).', hacer: 'Lo que más ordena el horario es despertar a la misma hora y buscar luz de mañana temprano.' }} color={C.night} />
        </View>
        <Regularity nights={nights.filter((n) => n.day >= keys[0] && n.day <= endDay)} keys={keys} width={width - 64} usualOnset={ins?.usualOnset ?? null} usualWake={ins?.usualWakeH ?? null} />
        {!!ins?.regularity && <Text style={st.text}>Tu horario es <Text style={{ color: C.night, fontWeight: '800' }}>{ins.regularity}</Text>{!noNums && ins.sri != null ? ` (índice ${ins.sri})` : ''}.</Text>}
        {ins?.trendMinPerDay != null && Math.abs(ins.trendMinPerDay) >= 20 && <Text style={st.muted}>Te estás durmiendo {noNums ? '' : `~${Math.abs(ins.trendMinPerDay)} min `}{ins.trendMinPerDay > 0 ? 'más tarde' : 'más temprano'} cada día.</Text>}
      </View>

      {/* Deuda y cronotipo */}
      {ins && ins.nights >= 4 && (
        <View style={st.card}>
          <View style={st.rowBetween}>
            <Text style={st.h3}>Deuda y reloj interno</Text>
            <InfoTip info={{ titulo: 'Deuda de sueño', corto: 'Lo que te falta dormir, acumulado en 2 semanas. 15 min de diferencia en una noche no cuentan, y lo antiguo pesa menos.', calculo: 'Noche a noche contra lo que necesitas. Dormir de más paga como mucho 2 h por noche: la deuda no se paga con un solo día largo (Depner 2019).', hacer: 'Suma 30–60 min por noche unos días.' }} color={C.night} />
          </View>
          <Text style={st.text}>{ins.debtH >= 1 ? (noNums ? 'Llevas algo de deuda de sueño.' : `Llevas ~${fmtSleep(ins.debtH)} de deuda.`) : 'Sin deuda de sueño.'}{ins.debtH >= 1 ? ' Se paga sumando 30–60 min por noche unos días, no con un día largo.' : ''}</Text>
          {!!ins.chronotype && <Text style={st.muted}>Tu reloj interno es más bien {ins.chronotype}{!noNums && ins.socialJetlagH != null && ins.socialJetlagH >= 1 ? `, con ${fmtSleep(ins.socialJetlagH)} de diferencia entre semana y fin de semana` : ''}.</Text>}
          {!noNums && <Text style={st.small}>{ins.needEstimated ? `Lo que necesitas (${fmtSleep(ins.need)}) sale de tus días libres bien dormidos.` : `Uso ${fmtSleep(ins.need)} como lo que necesitas; con 4 fines de semana bien dormidos lo calculo con tus datos.`}</Text>}
        </View>
      )}

      {/* Lo que se repite en tus noches (Sueño 2.0 · S4, solo en Mes): asociación, no causa */}
      {days >= 30 && <Patterns insNow={insNow} noNums={noNums} />}

      {/* Plan de mejora: UNA meta por 2 semanas */}
      <View style={[st.card, { borderColor: `${C.night}55` }]}>
        <Text style={st.h3}>Plan de mejora</Text>
        {plan && prog ? (
          <>
            <Text style={st.text}>{planTitle(plan)}</Text>
            <View style={st.track}><View style={[st.fill, { width: `${(prog.day / 14) * 100}%`, backgroundColor: C.night }]} /></View>
            <Text style={st.muted}>{prog.text}</Text>
            <Pressable style={st.btnGhost} onPress={() => setPlan(null)}><Text style={st.btnGhostText}>{prog.done ? 'Cerrar el plan' : 'Dejar el plan'}</Text></Pressable>
          </>
        ) : suggestion ? (
          <>
            <Text style={[st.text, { fontWeight: '800' }]}>{suggestion.title}</Text>
            <Text style={st.muted}>{suggestion.why}</Text>
            <Text style={st.text}>{suggestion.how}</Text>
            <Pressable style={st.btnPrimary} onPress={() => setPlan(suggestion.plan)}><Text style={st.btnPrimaryText}>Empezar 2 semanas</Text></Pressable>
          </>
        ) : (
          <Text style={st.muted}>{insNow && insNow.nights >= 5 ? 'Tu sueño va bien: mantén tu horario. Si algo cambia, te propongo una meta.' : 'Con unas noches más medidas por tu reloj, te propongo una meta a tu medida.'}</Text>
        )}
      </View>

      {insNow && <View style={st.card}><Text style={st.h3}>Hoy</Text><Text style={st.text}>{noNums ? `Esta noche, a acostarse entre las ${hhmmOf(insNow.bedtime.from)} y las ${hhmmOf(insNow.bedtime.to)}.` : bedtimeText(insNow)}</Text>{!noNums && insNow.nights >= 4 && <Text style={st.small}>{insightsText(insNow)}</Text>}</View>}
    </View>
  );
}

function Patterns({ insNow, noNums }: { insNow: ReturnType<typeof sleepInsights> | null; noNums: boolean }) {
  const [p, setP] = useState<SleepPatterns | null | undefined>(undefined);
  useEffect(() => { sleepPatternsNow().then(setP).catch(() => setP(null)); }, []);
  if (p === undefined) return null;
  const lines = noNums
    ? (p && p.found.length ? [`Tus noches más cortas coinciden con: ${p.found.map((f) => f.label).join(' y ')}.`, 'Es lo que se repite en tus datos, no prueba que sea la causa.'] : ['Todavía no veo nada que se repita en tus noches.'])
    : patternsText(p, insNow).split('\n');
  return (
    <View style={st.card}>
      <View style={st.rowBetween}>
        <Text style={st.h3}>Lo que se repite</Text>
        <InfoTip info={{ titulo: 'Lo que se repite en tus noches', corto: 'Comparo tus noches de 30 días con y sin café a menos de 6 h de dormirte, alcohol, comer a menos de 2 h, entrenar justo antes o una siesta larga. Solo te muestro lo que se repite y pesa.', calculo: 'Cuenta si hay 3 noches o más de cada lado y una diferencia de 20 min menos de noche, 15 min más despierto o 45 min más tarde al dormirte. Lo de la comida se compara solo en días que anotaste.', fuente: 'Drake 2013 (cafeína); Ebrahim 2013 (alcohol); Stutz 2019 (ejercicio de noche).', hacer: 'Cambia una cosa por 2 semanas y mira si cambian tus noches.' }} color={C.night} />
      </View>
      {lines.map((l, i) => <Text key={i} style={l.startsWith('•') ? st.text : st.muted}>{l}</Text>)}
    </View>
  );
}

function Bars({ rows, need, width, noNums }: { rows: Array<{ k: string; d: { totalH: number; nightH: number | null } | null }>; need: number; width: number; noNums: boolean }) {
  const H = 130, maxH = Math.max(10, ...rows.map((r) => r.d?.totalH ?? 0));
  const bw = width / rows.length;
  const y = (h: number) => H - (h / maxH) * (H - 10);
  return (
    <Svg width={width} height={H + 16}>
      <Line x1={0} x2={width} y1={y(need)} y2={y(need)} stroke={C.night} strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />
      {rows.map((r, i) => {
        if (!r.d) return null;
        const night = r.d.nightH ?? r.d.totalH, rest = Math.max(0, r.d.totalH - night);
        const x = i * bw + bw * 0.15, w = bw * 0.7;
        return (
          <React.Fragment key={r.k}>
            <Rect x={x} y={y(night)} width={w} height={H - y(night)} fill={C.night} rx={2} />
            {rest > 0 && <Rect x={x} y={y(night + rest)} width={w} height={y(night) - y(night + rest)} fill={C.segundo} rx={2} />}
          </React.Fragment>
        );
      })}
      {rows.map((r, i) => (rows.length <= 7 || i % 5 === 0 ? (
        <SvgText key={`l${r.k}`} x={i * bw + bw / 2 - 8} y={H + 13} fill={T.textMuted} fontSize={10}>{`${keyToDate(r.k).getDate()}/${keyToDate(r.k).getMonth() + 1}`}</SvgText>
      ) : null))}
      {!noNums && <SvgText x={2} y={y(need) - 3} fill={C.night} fontSize={9}>{fmtSleep(need)}</SvgText>}
    </Svg>
  );
}

/** Barras de dormirse a despertar en un eje de 18:00 a 14:00, con la ventana habitual sombreada */
function Regularity({ nights, keys, width, usualOnset, usualWake }: { nights: ReturnType<typeof nightRecords>; keys: string[]; width: number; usualOnset: number | null; usualWake: number | null }) {
  const H = 150, left = 34, w = width - left;
  const hOf = (ms: number) => { const d = new Date(ms); let h = d.getHours() + d.getMinutes() / 60; if (h < 18) h += 24; return h - 18; }; // 0 = 18:00
  const y = (h: number) => (Math.min(20, Math.max(0, h)) / 20) * H;
  const yh = (clockH: number) => y(((clockH < 18 ? clockH + 24 : clockH) - 18));
  const bw = w / keys.length;
  return (
    <Svg width={width} height={H + 4}>
      {usualOnset != null && usualWake != null && (
        <Rect x={left} y={yh(usualOnset)} width={w} height={Math.max(2, yh(usualWake) - yh(usualOnset))} fill={C.night} opacity={0.08} />
      )}
      {[20, 0, 4, 8, 12].map((h) => (
        <React.Fragment key={h}>
          <Line x1={left} x2={width} y1={yh(h)} y2={yh(h)} stroke="rgba(255,255,255,0.05)" />
          <SvgText x={0} y={yh(h) + 4} fill={T.textMuted} fontSize={9}>{`${String(h).padStart(2, '0')}:00`}</SvgText>
        </React.Fragment>
      ))}
      {nights.map((n) => {
        const i = keys.indexOf(n.day);
        if (i < 0) return null;
        const a = y(hOf(n.onset)), b = y(hOf(n.wake));
        return <Rect key={n.day} x={left + i * bw + bw * 0.25} y={a} width={bw * 0.5} height={Math.max(2, b - a)} fill={C.night} rx={3} />;
      })}
    </Svg>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Chip({ on, onPress, label, color }: { on: boolean; onPress: () => void; label: string; color: string }) {
  return (
    <Pressable onPress={onPress} style={[st.chip, on && { borderColor: color, backgroundColor: `${color}22` }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[st.chipText, on && { color }]}>{label}</Text>
    </Pressable>
  );
}

function Vital({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={st.vital}>
      <Text style={st.vitalVal}>{value}</Text>
      <Text style={st.vitalLbl}>{label}</Text>
      {!!sub && <Text style={st.small}>{sub}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg, paddingTop: 36 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
  back: { color: T.text, fontSize: 30, fontWeight: '300', width: 24 },
  title: { flex: 1, color: T.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  numBtn: { borderWidth: 1, borderColor: T.border, borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 5 },
  numBtnOn: { borderColor: `${C.night}88`, backgroundColor: `${C.night}18` },
  numBtnText: { color: T.textLight, fontSize: 11, fontWeight: '700' },
  seg: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: T.bgCard, borderRadius: R.full, padding: 3, borderWidth: 1, borderColor: T.border },
  segBtn: { flex: 1, paddingVertical: 7, borderRadius: R.full, alignItems: 'center' },
  segBtnOn: { backgroundColor: `${C.night}26` },
  segText: { color: T.textMuted, fontSize: 13, fontWeight: '700' },
  segTextOn: { color: C.night },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingVertical: 10 },
  arrow: { color: T.textLight, fontSize: 24, fontWeight: '300' },
  dateText: { color: T.text, fontSize: 14, fontWeight: '700', minWidth: 120, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, paddingBottom: 60 },
  card: { backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 16, gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  word: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  scoreNum: { color: T.text, fontSize: 26, fontWeight: '900' },
  scoreOf: { color: T.textMuted, fontSize: 13, fontWeight: '700' },
  scoreParts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  scorePart: { color: T.textMuted, fontSize: 11, fontWeight: '600' },
  big: { color: T.text, fontSize: 18, fontWeight: '800' },
  h3: { color: T.text, fontSize: 15, fontWeight: '800' },
  text: { color: T.text, fontSize: 14, lineHeight: 20 },
  muted: { color: T.textLight, fontSize: 13, lineHeight: 19 },
  small: { color: T.textMuted, fontSize: 11, lineHeight: 16 },
  chip: { borderWidth: 1, borderColor: T.border, borderRadius: R.full, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: T.bgCard },
  chipText: { color: T.textLight, fontSize: 12, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  range: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.10)' },
  fill: { height: 8, borderRadius: 4 },
  vitals: { flexDirection: 'row', gap: 10 },
  vital: { flex: 1, backgroundColor: T.bgCard, borderRadius: R.md, padding: 10, alignItems: 'center' },
  vitalVal: { color: T.text, fontSize: 16, fontWeight: '800' },
  vitalLbl: { color: T.textMuted, fontSize: 11, marginTop: 2 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  btn: { borderWidth: 1, borderColor: `${C.night}66`, borderRadius: R.full, paddingHorizontal: 12, paddingVertical: 8 },
  btnText: { color: C.night, fontSize: 12, fontWeight: '800' },
  btnGhost: { paddingHorizontal: 4, paddingVertical: 8, alignSelf: 'flex-start' },
  btnGhostText: { color: T.textMuted, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  btnPrimary: { backgroundColor: C.night, borderRadius: R.full, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  btnPrimaryText: { color: '#0b0a12', fontSize: 14, fontWeight: '900' },
  addBtn: { borderWidth: 1, borderColor: `${C.night}66`, borderRadius: R.full, paddingVertical: 11, alignItems: 'center' },
  addBtnTxt: { color: C.night, fontSize: 14, fontWeight: '800' },
});

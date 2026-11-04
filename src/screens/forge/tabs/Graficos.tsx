// ============================================================
// Forge 2.0 — PROGRESO › Gráficos (F6, 2026-10-17)
//
// El usuario: «gráficos como Smart Fit: 1 año, 6 meses, 3 meses, 1 mes. El mes es básicamente para que el usuario no
// abandone; recién al 3er mes debería haber una buena curva». Entonces:
//   - 1 MES: la constancia (entrenos, la mejor semana, racha) y las primeras marcas. Sin curva de fuerza.
//   - 3 MESES o más: el score de fuerza semana a semana, «tú hace 3 meses» y la constancia del rango.
//   - Siempre: cada ejercicio (máximo estimado, peso, reps o volumen), las series por músculo contra 10–20 y los récords.
// Todo sale de forgeProgress.ts (puro, con copia en el servidor). Textos sin culpa («medir sin obsesión»).
// ============================================================
import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import * as C from '../../../services/forge/forgeCore';
import * as Pr from '../../../services/forge/forgeProgress';
import * as Str from '../../../services/forge/forgeStrength';
import { FG, fmtDay, dec } from '../theme';
import { Chip, H, Label, P, Panel, Row, Btn } from '../ui';
import { ForgeCurve, ForgeBars } from '../charts';
import { useForgeState } from '../useForge';

const L = C.L;
const RANGES: Pr.Range[] = ['1m', '3m', '6m', '1a'];
const BW_EQ = ['bw', 'iso', 'asist', 'banda'];
type Metric = 'e1rm' | 'peso' | 'reps' | 'volumen';
const METRIC_NAME: Record<Metric, string> = { e1rm: 'Máximo', peso: 'Peso', reps: 'Reps', volumen: 'Volumen' };

export default function Graficos() {
  const S = useForgeState()!;
  const [range, setRange] = useState<Pr.Range>(() => Pr.defaultRange(S));
  const any = useMemo(() => Pr.trainingDays(S, '0000-00-00').length > 0, [S]);

  return (
    <View>
      <Row gap={6} style={{ marginBottom: 12 }}>
        {RANGES.map((r) => <Chip key={r} label={Pr.RANGE_NAME[r].toUpperCase()} on={range === r} color={FG.gold} onPress={() => setRange(r)} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4 }} />)}
      </Row>
      {!any ? (
        <Panel>
          <H size={22} style={{ textAlign: 'center' }}>Aún no hay entrenos</H>
          <P style={{ textAlign: 'center' }}>Anota tus series en ENTRENAR y aquí vas a ver tu constancia, tus récords y, desde el 3er mes, tu curva de fuerza.</P>
        </Panel>
      ) : (
        <>
          {range === '1m' ? <Month /> : <><Strength range={range} /><Versus range={range} /><Constancy range={range} /></>}
          <Exercise range={range} />
          <Muscles range={range} />
          <Records range={range} />
        </>
      )}
    </View>
  );
}

/** El mes: que se vea lo que sí hiciste. */
function Month() {
  const S = useForgeState()!;
  const m = useMemo(() => Pr.monthSummary(S), [S]);
  const weeks = useMemo(() => Pr.sessionsPerWeek(S, '1m'), [S]);
  const firsts = useMemo(() => Pr.firsts(S, '1m'), [S]);
  const note = m.sessions === 0 ? 'Este mes todavía no hay entrenos anotados. La primera sesión es la que más cuesta.'
    : m.sessions > m.prev && m.prev > 0 ? `Más que el mes anterior (${m.prev}). Así se construye.`
    : m.prev === 0 ? 'Tu primer mes con Forge: lo importante ahora es la constancia.'
    : `El mes anterior: ${m.prev}. Cada sesión suma.`;
  return (
    <>
      <Panel>
        <Label color={FG.gold}>ESTE MES</Label>
        <Row gap={8} style={{ marginTop: 8, marginBottom: 10 }}>
          {[{ l: 'ENTRENOS', v: m.sessions, c: FG.white }, { l: 'MEJOR SEMANA', v: m.bestWeek, c: FG.green }, { l: 'RACHA', v: m.streak, c: FG.orange }].map((x) => (
            <View key={x.l} style={st.big}><H size={32} color={x.c}>{x.v}</H><Label size={9.5}>{x.l}</Label></View>
          ))}
        </Row>
        <ForgeBars data={weeks} color={FG.red} max={4} />
        <P size={12.5} color={FG.text} style={{ marginTop: 8 }}>{note}</P>
        <P size={11.5} color={FG.dim} style={{ marginTop: 4 }}>La fuerza se nota en semanas, no en días: desde el 3er mes vas a ver tu curva.</P>
      </Panel>
      {firsts.length > 0 && (
        <Panel>
          <H size={22} style={{ marginBottom: 8 }}>PRIMERAS MARCAS</H>
          <View style={{ gap: 6 }}>
            {firsts.slice(0, 8).map((f, i) => (
              <Row key={i} gap={10}>
                <View style={[st.dot, { backgroundColor: f.text.startsWith('Récord') ? FG.gold : FG.green }]} />
                <P size={13} color={FG.text} style={{ flex: 1 }}>{f.text}</P>
                <P size={11.5} color={FG.dim}>{fmtDay(f.day, false)}</P>
              </Row>
            ))}
          </View>
        </Panel>
      )}
    </>
  );
}

/** El score de fuerza semana a semana. */
function Strength({ range }: { range: Pr.Range }) {
  const S = useForgeState()!;
  const sw = useMemo(() => Pr.strengthWeeks(S, range), [S, range]);
  const vals = sw.map((w) => w.value);
  const have = vals.filter((v): v is number => v != null);
  const now = have[have.length - 1], first = have[0];
  return (
    <Panel>
      <Row style={{ marginBottom: 6 }}>
        <View style={{ flex: 1 }}><H size={22}>SCORE DE FUERZA</H><P size={11.5} color={FG.dim}>0–100 · contra gente que entrena, tu peso y sexo</P></View>
        {now != null && <H size={34} color={FG.gold}>{now}</H>}
      </Row>
      {have.length >= 2 ? (
        <>
          <ForgeCurve id={`str-${range}`} values={vals} labels={sw.map((w) => w.label)} />
          <P size={12.5} color={FG.text} style={{ marginTop: 6 }}>{now! > first ? `Subiste ${now! - first} puntos en ${Pr.RANGE_NAME[range]}.` : now === first ? 'Te mantuviste: sostener también cuenta.' : `Bajaste ${first - now!} puntos; una descarga o una pausa también se ve así.`}</P>
        </>
      ) : (
        <P size={12.5}>Para dibujar la curva: anota el peso y qué tan cerca del fallo quedaste (RIR) en press de banca, sentadilla, peso muerto, press militar, remo, jalón, prensa o dominadas, en series de hasta 10 reps.</P>
      )}
    </Panel>
  );
}

/** Tú hace 3 meses (o 6, o 1 año) contra hoy. */
function Versus({ range }: { range: Pr.Range }) {
  const S = useForgeState()!;
  const v = useMemo(() => Pr.versusAgo(S, Pr.RANGE_DAYS[range]), [S, range]);
  return (
    <Panel tint={FG.purple}>
      <H size={22} style={{ marginBottom: 8 }}>TÚ HACE {Pr.RANGE_NAME[range].toUpperCase()}</H>
      {!v ? (
        <P size={12.5}>Cuando tengas entrenos de hace {Pr.RANGE_NAME[range]}, aquí vas a ver a tu yo de entonces contra el de hoy.</P>
      ) : (
        <View style={{ gap: 6 }}>
          {v.scoreThen != null && v.scoreNow != null && <VsRow label="Score de fuerza" then={String(v.scoreThen)} now={String(v.scoreNow)} up={v.scoreNow > v.scoreThen} />}
          {v.lifts.map((x) => <VsRow key={x.lift} label={x.name} then={`${dec(x.then)} kg`} now={`${dec(x.now)} kg`} up={x.now > x.then} />)}
          <VsRow label="Entrenos en 4 semanas" then={String(v.sessionsThen)} now={String(v.sessionsNow)} up={v.sessionsNow > v.sessionsThen} />
          {v.lifts.length > 0 && <P size={11} color={FG.dim}>kg = máximo estimado (1 repetición), con las reps y el RIR que anotaste.</P>}
        </View>
      )}
    </Panel>
  );
}

function VsRow({ label, then, now, up }: { label: string; then: string; now: string; up: boolean }) {
  return (
    <Row gap={8}>
      <P size={13} color={FG.text} style={{ flex: 1 }} numberOfLines={1}>{label}</P>
      <P size={13} color={FG.dim}>{then}</P>
      <P size={13} color={FG.dim}>→</P>
      <P size={14} bold color={up ? FG.green : FG.white}>{now}</P>
    </Row>
  );
}

/** Entrenos por semana del rango. */
function Constancy({ range }: { range: Pr.Range }) {
  const S = useForgeState()!;
  const weeks = useMemo(() => Pr.sessionsPerWeek(S, range), [S, range]);
  const done = weeks.slice(0, -1);
  const avg = done.length ? done.reduce((a, w) => a + w.value, 0) / done.length : 0;
  const active = done.filter((w) => w.value > 0).length;
  return (
    <Panel>
      <Row style={{ marginBottom: 8 }}>
        <H size={22} style={{ flex: 1 }}>CONSTANCIA</H>
        <P size={12.5} color={FG.text}>{dec(avg)} por semana</P>
      </Row>
      <ForgeBars data={weeks} color={FG.red} max={4} height={70} />
      <P size={12} style={{ marginTop: 6 }}>Entrenaste {active} de {done.length} semanas.</P>
    </Panel>
  );
}

/** Un ejercicio: máximo estimado, peso, reps o volumen por sesión. */
function Exercise({ range }: { range: Pr.Range }) {
  const S = useForgeState()!;
  const cat = C.catalog(S);
  const ids = useMemo(() => { const r = Pr.topExercises(S, range); return r.length ? r : Pr.topExercises(S, '1a'); }, [S, range]);
  const [pick, setPick] = useState<string | null>(null);
  const exId = pick && ids.includes(pick) ? pick : ids[0];
  const ex = exId ? cat[exId] : null;
  const hist = useMemo(() => (exId ? Pr.exerciseHistory(S, exId, Pr.rangeStart(range)) : []), [S, exId, range]);
  const metrics: Metric[] = useMemo(() => {
    if (!ex) return [];
    const m: Metric[] = [];
    if (!BW_EQ.includes(ex.eq) && hist.some((p) => p.e1rm != null)) m.push('e1rm');
    if (!BW_EQ.includes(ex.eq)) m.push('peso');
    if (BW_EQ.includes(ex.eq)) m.push('reps');
    if (ex.eq !== 'iso') m.push('volumen');
    return m;
  }, [ex, hist]);
  const [metric, setMetric] = useState<Metric>('e1rm');
  const mt = metrics.includes(metric) ? metric : metrics[0];
  if (!ex || !mt) return null;
  const unit = mt === 'peso' ? (hist[hist.length - 1]?.best.unit ?? 'kg') + (ex.pair ? ' c/u' : '') : mt === 'reps' ? (ex.unit === 'seg' ? 's' : 'reps') : mt === 'e1rm' && ex.pair ? 'kg c/u' : 'kg';
  const val = (p: Pr.ExercisePoint): number | null => mt === 'e1rm' ? p.e1rm : mt === 'peso' ? (p.best.kg ?? p.topLoad) : mt === 'reps' ? p.maxReps : p.volume;
  const vals = hist.map(val);
  const have = vals.filter((v): v is number => v != null);
  const fmt = (n: number) => (mt === 'volumen' ? Math.round(n).toLocaleString('es-CL') : dec(n));
  const help = mt === 'e1rm' ? 'Máximo estimado a 1 repetición (series de hasta 10 reps con RIR).' : mt === 'peso' ? 'El peso más alto de cada sesión.' : mt === 'reps' ? 'La serie con más repeticiones de cada sesión.' : 'Kilos movidos en la sesión (peso × reps de todas las series).';
  return (
    <Panel>
      <H size={22} style={{ marginBottom: 8 }}>POR EJERCICIO</H>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {ids.map((id) => <Chip key={id} label={cat[id]?.name ?? id} on={id === exId} onPress={() => setPick(id)} />)}
      </View>
      <Row gap={6} style={{ marginBottom: 10 }}>
        {metrics.map((m) => <Chip key={m} label={METRIC_NAME[m]} on={m === mt} color={FG.gold} onPress={() => setMetric(m)} style={{ paddingVertical: 5 }} />)}
      </Row>
      {have.length === 0 ? (
        <P size={12.5}>No hay sesiones de {ex.name} en {Pr.RANGE_NAME[range]}.</P>
      ) : (
        <>
          <ForgeCurve id={`ex-${exId}-${mt}`} values={vals} color={FG.red} labels={hist.map((p) => fmtDay(p.day, false))} />
          <Row style={{ marginTop: 8, justifyContent: 'space-between' }}>
            <View><Label size={9.5}>PRIMERA</Label><P size={14} color={FG.text} bold>{fmt(have[0])} {unit}</P></View>
            <View style={{ alignItems: 'center' }}><Label size={9.5}>MEJOR</Label><P size={14} color={FG.gold} bold>{fmt(Math.max(...have))} {unit}</P></View>
            <View style={{ alignItems: 'flex-end' }}><Label size={9.5}>ÚLTIMA</Label><P size={14} color={FG.white} bold>{fmt(have[have.length - 1])} {unit}</P></View>
          </Row>
          {have.length === 1 && <P size={11.5} color={FG.dim} style={{ marginTop: 4 }}>Con 2 sesiones o más se dibuja la curva.</P>}
          <P size={11} color={FG.dim} style={{ marginTop: 6 }}>{help}</P>
        </>
      )}
    </Panel>
  );
}

/** Series por semana de un músculo, contra la zona de 10–20 (ACSM). */
function Muscles({ range }: { range: Pr.Range }) {
  const S = useForgeState()!;
  const subs = useMemo(() => Object.entries(Str.weeklySets(S, Pr.RANGE_DAYS[range])).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id), [S, range]);
  const [pick, setPick] = useState<string | null>(null);
  const sub = pick && subs.includes(pick) ? pick : subs[0];
  const weeks = useMemo(() => (sub ? Pr.muscleWeeks(S, sub, range) : []), [S, sub, range]);
  if (!sub) return null;
  const done = weeks.slice(0, -1);
  const inZone = done.filter((w) => w.value >= Str.WEEKLY_MIN && w.value <= Str.WEEKLY_MAX).length;
  return (
    <Panel>
      <H size={22}>SERIES POR MÚSCULO</H>
      <P size={11.5} color={FG.dim} style={{ marginBottom: 8 }}>Zona verde: {Str.WEEKLY_MIN}–{Str.WEEKLY_MAX} series a la semana (ACSM). La última barra es esta semana.</P>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {subs.map((id) => <Chip key={id} label={L.SUB_BY_ID[id]?.name ?? id} on={id === sub} color={FG.green} onPress={() => setPick(id)} style={{ paddingVertical: 5 }} />)}
      </View>
      <ForgeBars data={weeks} color={FG.blue} band={[Str.WEEKLY_MIN, Str.WEEKLY_MAX]} />
      {done.length > 0 && <P size={12} style={{ marginTop: 6 }}>En la zona {inZone} de {done.length} semanas.</P>}
    </Panel>
  );
}

/** Récords: lo mejor de cada ejercicio (los nuevos del rango marcados). */
function Records({ range }: { range: Pr.Range }) {
  const S = useForgeState()!;
  const all = useMemo(() => Pr.records(S), [S]);
  const [more, setMore] = useState(false);
  if (!all.length) return null;
  const from = Pr.rangeStart(range);
  const KIND: Record<Pr.PR['kind'], string> = { e1rm: 'MÁX', peso: 'PESO', reps: 'REPS' };
  const list = more ? all : all.slice(0, 8);
  return (
    <Panel tint={FG.gold}>
      <H size={22} style={{ marginBottom: 8 }}>RÉCORDS</H>
      <View style={{ gap: 7 }}>
        {list.map((r, i) => (
          <Row key={`${r.exId}-${r.kind}-${i}`} gap={8}>
            <View style={st.kind}><Label size={9} color={FG.gold}>{KIND[r.kind]}</Label></View>
            <View style={{ flex: 1 }}>
              <P size={13} color={FG.text} bold numberOfLines={1}>{r.name}</P>
              <P size={12}>{r.text}</P>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {r.day >= from && <Label size={9} color={FG.green}>NUEVO</Label>}
              <P size={11.5} color={FG.dim}>{fmtDay(r.day, false)}</P>
            </View>
          </Row>
        ))}
      </View>
      {all.length > 8 && <Btn title={more ? 'Ver menos' : `Ver todos (${all.length})`} kind="ghost" small onPress={() => setMore((m) => !m)} style={{ marginTop: 10 }} />}
    </Panel>
  );
}

const st = StyleSheet.create({
  big: { flex: 1, alignItems: 'center', backgroundColor: FG.panel2, borderWidth: 1, borderColor: FG.line, borderRadius: 12, paddingVertical: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  kind: { width: 42, alignItems: 'center', borderWidth: 1, borderColor: FG.gold + '55', borderRadius: 8, paddingVertical: 3 },
});

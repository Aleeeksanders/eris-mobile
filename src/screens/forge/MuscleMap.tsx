// ============================================================
// Forge 2.0 — el personaje con sus músculos (F4; rehecho en la fase I8, 2026-10-23): frente y espalda con los subgrupos
// del RPG, coloreados por las series de la semana (guía del ACSM: 10–20), por su nivel (subLevel, el mismo del HTML) o por
// su recuperación (rango estimado + lo que dices + cómo rindes: forgeRecovery). Lo atlético (pliometría, equilibrio…) va aparte.
//
// El toque se resuelve por COORDENADAS: el mapa entero recibe el toque y se busca qué músculo hay en ese punto (cada
// músculo es un polígono, en muscleGeometry.ts; se dibuja suavizado). Antes cada figura SVG tenía su `onPress`, que en Android no respondía.
// Tocar un músculo abre su hoja: nivel, series de la semana, recuperación, fuerza, en tu rutina y qué lo trabaja (+ plan).
// ============================================================
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Ellipse, Path, G, Line } from 'react-native-svg';
import * as C from '../../services/forge/forgeCore';
import * as S from '../../services/forge/forgeStrength';
import * as Rc from '../../services/forge/forgeRecovery';
import { FG, FONT, dec } from './theme';
import { Bar, Chip, H, Label, P, Row, Sheet } from './ui';
import { useForgeAct } from './useForge';
import { useForgeUi } from './forgeUi';
import { BACK, BACK_LINES, FRONT, FRONT_LINES, SILHOUETTE, muscleAt, smooth } from './muscleGeometry';

const L = C.L;
type Mode = 'semana' | 'nivel' | 'recuperacion';
const colorFor = (lvl: number) => (lvl >= 10 ? FG.gold : lvl >= 6 ? FG.red : lvl >= 3 ? FG.coral : '#5d5568');
const VOL_COLOR: Record<S.VolumeState, string> = { nada: '#2f2a37', bajo: FG.orange, optimo: FG.green, alto: FG.blue };
const VOL_TEXT: Record<S.VolumeState, string> = { nada: 'sin series', bajo: 'bajo lo recomendado', optimo: 'en el rango óptimo', alto: 'sobre 20: más no suma' };
const REC_COLOR: Record<Rc.RecoveryState, string> = { listo: FG.green, probable: FG.gold, cargado: FG.red, sin_datos: '#2f2a37' };
/** «33 h», «3 días» */
const horasTxt = (h: number) => (h < 48 ? `${h} h` : `${Math.round(h / 24)} días`);
const PALETTE = ['#2f2a37', '#5d5568', FG.coral, FG.red, FG.gold, FG.orange, FG.green, FG.blue];

const lighten = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
};
const gradId = (color: string) => `mg${Math.max(0, PALETTE.indexOf(color))}`;

const ATHLETIC = ['pliometria', 'reactividad', 'equilibrio', 'aereo', 'coordinacion'];
/** Qué levantamiento mide la fuerza de cada músculo. */
const LIFTS_OF: Record<string, string[]> = {
  pec_med: ['bench', 'db_bench', 'dip'], pec_sup: ['bench', 'db_bench'], delt_ant: ['ohp', 'db_press'], triceps: ['dip', 'bench'],
  dorsal: ['pullup', 'lat_pd', 'row'], trapecio: ['row', 'deadlift'], biceps: ['curl', 'db_curl', 'pullup'],
  cuadriceps: ['squat', 'legpress'], femoral: ['deadlift', 'squat'], lumbar: ['deadlift'],
};
const W = 200, HGT = 360;

export default function MuscleMap({ S: st }: { S: C.ForgeState }) {
  const [back, setBack] = useState(false);
  const [mode, setMode] = useState<Mode>('semana');
  const [sel, setSel] = useState<string | null>(null);
  const { subL } = useMemo(() => C.groupLevels(st), [st]);
  const week = useMemo(() => S.weeklySets(st), [st]);
  const yo = useMemo(() => Rc.personalRecovery(st), [st]);
  const rec = useMemo(() => Object.fromEntries(Object.keys(L.SUB_BY_ID).map((id) => [id, Rc.muscleRecovery(st, id, undefined, yo)])) as Record<string, Rc.Recovery>, [st, yo]);
  const fill = (sub: string) => (mode === 'nivel' ? colorFor(subL[sub]?.level ?? 1) : mode === 'recuperacion' ? REC_COLOR[rec[sub]?.state ?? 'sin_datos'] : VOL_COLOR[S.volumeState(week[sub] ?? 0)]);
  const shapes = back ? BACK : FRONT;
  const tap = (lx: number, ly: number) => { const hit = muscleAt((lx / W) * 200, (ly / HGT) * 360 + 20, back); if (hit) setSel(hit); };

  return (
    <View>
      <Row gap={6} style={{ marginBottom: 8, flexWrap: 'wrap' }}>
        <Chip label="Series de la semana" on={mode === 'semana'} onPress={() => setMode('semana')} />
        <Chip label="Nivel" on={mode === 'nivel'} onPress={() => setMode('nivel')} />
        <Chip label="Recuperación" on={mode === 'recuperacion'} onPress={() => setMode('recuperacion')} />
        <View style={{ flex: 1 }} />
        <Chip label={back ? 'Espalda' : 'Frente'} on onPress={() => setBack((b) => !b)} color={FG.blue} />
      </Row>
      <View style={st2.mapBox}>
        <View style={{ width: W, height: HGT }} onStartShouldSetResponder={() => true} onResponderRelease={(e) => tap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          accessible accessibilityRole="adjustable" accessibilityLabel={`Mapa muscular, ${back ? 'espalda' : 'frente'}. Toca un músculo para ver su detalle.`}>
          <View pointerEvents="none">
            <Svg width={W} height={HGT} viewBox="0 20 200 360">
              <Defs>
                {PALETTE.map((c, i) => (
                  <LinearGradient key={c} id={`mg${i}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={lighten(c, 0.35)} stopOpacity="1" />
                    <Stop offset="1" stopColor={c} stopOpacity="1" />
                  </LinearGradient>
                ))}
                <LinearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#231e2a" stopOpacity="1" />
                  <Stop offset="1" stopColor="#16131b" stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Ellipse cx={100} cy={384} rx={46} ry={5} fill="#000" opacity={0.35} />
              <G>
                <Ellipse cx={100} cy={40} rx={15} ry={19} fill="url(#skin)" stroke={FG.line3} strokeWidth={1.2} />
                <Path d={smooth(SILHOUETTE)} fill="url(#skin)" stroke={FG.line3} strokeWidth={1.2} />
              </G>
              {shapes.map((sh, i) => {
                const on = sel === sh.sub;
                const c = fill(sh.sub);
                return <Path key={i} d={smooth(sh.pts)} fill={`url(#${gradId(c)})`} opacity={on ? 1 : 0.88} stroke={on ? FG.white : '#0c0b0e'} strokeWidth={on ? 1.8 : 0.9} />;
              })}
              {(back ? BACK_LINES : FRONT_LINES).map(([x1, y1, x2, y2], i) => <Line key={`l${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0c0b0e" strokeWidth={0.8} opacity={0.55} />)}
            </Svg>
          </View>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          {mode === 'semana' ? (
            <>
              <Label size={10}>ESTA SEMANA</Label>
              {(['nada', 'bajo', 'optimo', 'alto'] as const).map((k) => (
                <Row key={k} gap={6}><View style={[st2.dot, { backgroundColor: VOL_COLOR[k] }]} /><P size={11.5}>{k === 'nada' ? '0 series' : k === 'bajo' ? '1–9' : k === 'optimo' ? '10–20' : 'más de 20'}</P></Row>
              ))}
              <P size={11} color={FG.dim}>Guía del ACSM: al menos 10 series por músculo a la semana; sobre ~20 ya casi no suma.</P>
            </>
          ) : mode === 'nivel' ? (
            <>
              <Label size={10}>NIVEL DEL MÚSCULO</Label>
              {[['Nv 1–2', '#5d5568'], ['Nv 3–5', FG.coral], ['Nv 6–9', FG.red], ['Nv 10+', FG.gold]].map(([t, c]) => (
                <Row key={t} gap={6}><View style={[st2.dot, { backgroundColor: c }]} /><P size={11.5}>{t}</P></Row>
              ))}
              <P size={11} color={FG.dim}>Sube con tus series (con su peso) y baja si dejas de entrenarlo.</P>
            </>
          ) : (
            <>
              <Label size={10}>DESCANSO DEL MÚSCULO</Label>
              {([['cargado', 'Recién cargado'], ['probable', 'Probablemente ya rinde'], ['listo', 'Recuperado'], ['sin_datos', 'Sin trabajo reciente']] as const).map(([k, t]) => (
                <Row key={k} gap={6}><View style={[st2.dot, { backgroundColor: REC_COLOR[k] }]} /><P size={11.5}>{t}</P></Row>
              ))}
              <P size={11} color={FG.dim}>Estimado por lo que hiciste; varía de persona a persona. Las agujetas solas no significan que no rinda.</P>
              <P size={11} color={FG.muted} style={{ marginTop: 2 }}>{yo.texto}</P>
            </>
          )}
          <P size={11} color={FG.muted} style={{ marginTop: 4 }}>Toca un músculo.</P>
        </View>
      </View>

      <MuscleSheet st={st} sub={sel} onClose={() => setSel(null)} subL={subL} week={week} rec={sel ? rec[sel] : null} />

      <Label size={10} style={{ marginTop: 12, marginBottom: 6 }}>ATLÉTICO</Label>
      <View style={{ gap: 6 }}>
        {ATHLETIC.map((id) => (
          <Row key={id} gap={8}>
            <P size={12} color={FG.text} style={{ width: 100 }}>{L.SUB_BY_ID[id].name}</P>
            <View style={{ flex: 1 }}><Bar pct={(subL[id].inLevel / subL[id].forNext) * 100} color={colorFor(subL[id].level)} height={6} /></View>
            <Text style={{ fontFamily: FONT.display, fontSize: 16, color: colorFor(subL[id].level), width: 44, textAlign: 'right' }}>Nv {subL[id].level}</Text>
          </Row>
        ))}
      </View>
    </View>
  );
}

/** «Hace 2 días», «hoy», «ayer». */
const agoText = (d: number | null) => (d == null ? '' : d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`);

/** La hoja del músculo: nivel, series de la semana, recuperación, fuerza, en tu rutina y qué lo trabaja. */
function MuscleSheet({ st, sub, onClose, subL, week, rec }: { st: C.ForgeState; sub: string | null; onClose: () => void; subL: any; week: Record<string, number>; rec: Rc.Recovery | null }) {
  const act = useForgeAct();
  const ui = useForgeUi();
  const info = sub ? L.SUB_BY_ID[sub] : null;
  const cat = C.catalog(st);
  const ratings = useMemo(() => (sub ? S.liftRatings(st) : []), [st, sub]);
  if (!sub || !info) return null;
  const lv = subL[sub];
  const sets = week[sub] ?? 0;
  const vs = S.volumeState(sets);
  const pts = (id: string) => ((cat[id]?.m ?? {}) as Record<string, number>)[sub] ?? 0;
  const inRoutine = (st.routinePlan?.days ?? []).flatMap((d: any) => d.items.filter((i: any) => pts(i.exId) >= 1).map((i: any) => ({ exId: i.exId, day: d.name, main: pts(i.exId) >= 2 })));
  const seen = new Set<string>();
  const routineList = inRoutine.filter((x: any) => (seen.has(x.exId) ? false : (seen.add(x.exId), true)));
  const work = S.exercisesFor(st, sub as any, 5);
  const plan: Record<string, number> = st.plan || {};
  const recText = !rec || rec.state === 'sin_datos'
    ? 'Sin trabajo reciente.'
    : `Lo trabajaste hace ${horasTxt(rec.hoursAgo ?? 0)}: ${dec(rec.sets)} series${rec.fallo >= 0.5 ? ', casi todas cerca del fallo' : ''}${rec.habitual ? '' : ' y no lo entrenas tan seguido'}. Estimado: rinde normal entre ${horasTxt(rec.range![0])} y ${horasTxt(rec.range![1])}.`;
  const decir = (nivel: Rc.Soreness) => {
    void act((x) => Rc.recordSoreness(x, nivel, [sub], rec?.lastDay ?? C.L.todayKey()), 'agujetas');
    ui.toast(0, 'ANOTADO');
  };

  return (
    <Sheet visible onClose={onClose} title={info.name.toUpperCase()}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <P size={12.5} style={{ flex: 1 }}>{info.desc}</P>
        <H size={26} color={colorFor(lv.level)}>Nv {lv.level}</H>
      </Row>
      <Bar pct={(lv.inLevel / lv.forNext) * 100} color={colorFor(lv.level)} height={7} />
      <P size={11} color={FG.dim}>Sube con tus series (con su peso) y baja si dejas de entrenarlo.</P>

      <Label size={10} style={{ marginTop: 12, marginBottom: 4 }}>ESTA SEMANA</Label>
      <Row gap={8}>
        <View style={{ flex: 1 }}><Bar pct={Math.min(100, (sets / S.WEEKLY_MAX) * 100)} color={VOL_COLOR[vs]} height={8} /></View>
        <Text style={{ fontFamily: FONT.display, fontSize: 18, color: VOL_COLOR[vs] === '#2f2a37' ? FG.dim : VOL_COLOR[vs] }}>{dec(sets)} series</Text>
      </Row>
      <P size={12}>{VOL_TEXT[vs]}{vs === 'bajo' ? ` · te faltan ~${dec(Math.max(0, S.WEEKLY_MIN - sets))} para las 10` : ''}</P>

      <Label size={10} style={{ marginTop: 12, marginBottom: 4 }}>RECUPERACIÓN</Label>
      <Row gap={8}>
        <View style={[st2.dot, { backgroundColor: REC_COLOR[rec?.state ?? 'sin_datos'], marginTop: 4 }]} />
        <P size={12.5} color={FG.text} style={{ flex: 1 }}>{recText}</P>
      </Row>
      {rec && rec.state !== 'sin_datos' && (rec.hoursAgo ?? 0) >= 12 && (
        <>
          <P size={12} style={{ marginTop: 6 }}>¿Cómo lo sientes hoy?</P>
          <Row gap={6} style={{ marginTop: 4, flexWrap: 'wrap' }}>
            <Chip label="Sin molestia" on={rec.soreness === 'nada'} onPress={() => decir('nada')} />
            <Chip label="Agujetas" on={rec.soreness === 'molesta'} onPress={() => decir('molesta')} />
            <Chip label="Me limita" on={rec.soreness === 'limita'} onPress={() => decir('limita')} />
          </Row>
          {rec.soreness === 'molesta' && <P size={11.5} color={FG.dim} style={{ marginTop: 4 }}>Es normal y no significa que no rinda: en gente entrenada la fuerza vuelve antes que el dolor. Calienta y mira tu primera serie.</P>}
          {rec.soreness === 'limita' && <P size={11.5} color={FG.dim} style={{ marginTop: 4 }}>Hoy mejor otro músculo o baja la carga. Si el dolor es muy fuerte, hay mucha hinchazón u orina oscura, consulta: eso ya no son agujetas normales.</P>}
        </>
      )}

      {(LIFTS_OF[sub] ?? []).map((lift) => ratings.find((r) => r.lift === lift)).filter(Boolean).slice(0, 2).length > 0 && (
        <>
          <Label size={10} style={{ marginTop: 12, marginBottom: 4 }}>FUERZA</Label>
          {(LIFTS_OF[sub] ?? []).map((lift) => ratings.find((r) => r.lift === lift)).filter(Boolean).slice(0, 2).map((r) => (
            <P key={r!.lift} size={12.5}>{r!.name}: ~{dec(r!.e1rm)} kg de máximo estimado · <Text style={{ color: FG.gold }}>{r!.levelName}</Text> (más fuerte que ~{r!.pct} % de quienes entrenan)</P>
          ))}
        </>
      )}

      {routineList.length > 0 && (
        <>
          <Label size={10} style={{ marginTop: 12, marginBottom: 4 }}>EN TU RUTINA</Label>
          {routineList.slice(0, 6).map((x: any) => (
            <P key={x.exId} size={12.5}><Text style={{ color: FG.white }}>{cat[x.exId]?.name ?? x.exId}</Text> · {x.day}{x.main ? '' : ' (secundario)'}</P>
          ))}
        </>
      )}

      <Label size={10} style={{ marginTop: 12, marginBottom: 4 }}>LO TRABAJAN</Label>
      {work.map((id) => {
        const inPlan = plan[id] != null;
        return (
          <Row key={id} gap={8} style={{ paddingVertical: 4 }}>
            <View style={{ flex: 1 }}>
              <P size={13} color={FG.white}>{cat[id]?.name}</P>
              <P size={11} color={FG.dim}>{pts(id) >= 2 ? 'principal' : 'secundario'}</P>
            </View>
            <TouchableOpacity onPress={() => { act((s) => C.togglePlan(s, id), 'plan'); if (!inPlan) ui.toast(0, `${cat[id]?.name.toUpperCase()} AL PLAN ✓`); }} style={[st2.planBtn, inPlan && { borderColor: FG.green + '88' }]} accessibilityLabel={inPlan ? `Quitar ${cat[id]?.name} del plan` : `Agregar ${cat[id]?.name} al plan de hoy`}>
              <Text style={[st2.planTxt, inPlan && { color: FG.green }]}>{inPlan ? 'En el plan' : '+ Plan'}</Text>
            </TouchableOpacity>
          </Row>
        );
      })}
    </Sheet>
  );
}

const st2 = StyleSheet.create({
  mapBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0f0d15', borderRadius: 12, padding: 8 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  planBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: FG.line2 },
  planTxt: { fontFamily: FONT.bodyBold, fontSize: 12, color: FG.muted },
});

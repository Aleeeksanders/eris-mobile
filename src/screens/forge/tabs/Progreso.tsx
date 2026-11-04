// ============================================================
// Forge 2.0 — PROGRESO: los Gráficos (F6: 1 mes / 3 / 6 / 1 año, curva de fuerza, «tú hace 3 meses», récords; en
// Graficos.tsx), el Diario (racha, calendario de 8 semanas, historial para corregir días y añadir uno que se pasó) y el
// Libro de entrenos (cada día con sus ejercicios y cada serie con su peso y RIR). Diario y Libro son los del HTML.
// ============================================================
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as C from '../../../services/forge/forgeCore';
import * as T from '../../../services/forge/forgeTrain';
import * as R from '../../../services/forge/forgeRoutine';
import { Bar } from '../ui';
import { FG, FONT, fmtDay, fmtFull, dayKeyOf, n0 } from '../theme';
import { Icon } from '../icons';
import { Btn, Chip, H, Label, P, Panel, Row, Sheet, Stepper } from '../ui';
import { useForgeState, useForgeAct } from '../useForge';
import { useForgeUi } from '../forgeUi';
import { setText } from '../SetLogger';
import Graficos from './Graficos';

const L = C.L;

export default function Progreso() {
  const [sec, setSec] = useState<'graficos' | 'diario' | 'libro'>('graficos');
  return (
    <View>
      <Row gap={6} style={{ marginBottom: 12 }}>
        <Chip label="Gráficos" on={sec === 'graficos'} onPress={() => setSec('graficos')} style={{ flex: 1, alignItems: 'center' }} />
        <Chip label="Diario" on={sec === 'diario'} onPress={() => setSec('diario')} style={{ flex: 1, alignItems: 'center' }} />
        <Chip label="Libro" on={sec === 'libro'} onPress={() => setSec('libro')} style={{ flex: 1, alignItems: 'center' }} />
      </Row>
      {sec === 'graficos' ? <Graficos /> : sec === 'diario' ? <Diario /> : <Libro />}
    </View>
  );
}

function Diario() {
  const S = useForgeState()!;
  const act = useForgeAct();
  const ui = useForgeUi();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [ago, setAgo] = useState(1);
  const v = C.rpgView(S);
  const tdK = L.todayKey();
  const logMap: Record<string, any> = Object.fromEntries((S.log || []).map((e: any) => [e.day, e]));
  logMap[tdK] = { day: tdK, xp: L.todayXp(S.today), missions: L.missionsDone(S.today), claimed: S.today.claimed };
  const end = L.forgeNow(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - (7 * 8 - 1)); start.setDate(start.getDate() - start.getDay());
  const cells: Array<{ k: string; entry: any }> = [];
  // Día por día por fecha (no sumando 24 h): con el cambio de horario de verano el HTML perdía el día de hoy
  for (let i = 0; i < 70; i++) {
    const k = dayKeyOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    if (k > tdK) break;
    cells.push({ k, entry: logMap[k] });
  }
  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const recent = Object.values(logMap).sort((a: any, b: any) => b.day.localeCompare(a.day)).slice(0, 14);
  const totalDays = (S.counters.daysActive || 0) + (S.today.claimed ? 1 : 0);
  const mult = L.intensityMult(v);
  const dayTrainXp = (k: string) => C.dayTrainXp(S, k);
  const daySets = (k: string) => Object.values((S.training || {})[k] || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
  const cellColor = (c: { entry: any }) => (!c.entry ? FG.panel3 : c.entry.claimed ? (c.entry.missions === L.MISSIONS.length ? FG.green : FG.greenDeep) : c.entry.missions >= 1 ? '#5a4a2a' : FG.line);
  const open = (k: string) => { ui.setViewDay(k === tdK ? null : k); ui.setTab('hoy'); };
  const pastKey = (() => { const d = L.forgeNow(); d.setDate(d.getDate() - ago); return dayKeyOf(d); })();
  const cat = C.catalog(S);

  // Score de entrenamiento (como el de nutrición): el sueño sale del registro de las misiones de la última semana
  const sleeps = [S.today, ...(S.log || []).slice(0, 6)].map((e: any) => Number(e?.sleep) || 0).filter((h) => h > 0);
  const tscore = R.trainingScore(S, { sleepAvgH: sleeps.length ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : null });

  return (
    <View>
      {tscore && (
        <Panel>
          <Row style={{ marginBottom: 8 }}>
            <H size={22} style={{ flex: 1 }}>SCORE DE ENTRENAMIENTO</H>
            <H size={30} color={tscore.score >= 70 ? FG.green : tscore.score >= 40 ? FG.gold : FG.orange}>{tscore.score}</H>
          </Row>
          <View style={{ gap: 8 }}>
            {tscore.parts.map((p) => (
              <View key={p.key}>
                <Row style={{ justifyContent: 'space-between', marginBottom: 3 }}><P size={12.5} color={FG.text} bold>{p.label}</P><P size={12}>{p.pts}/{p.max}</P></Row>
                <Bar pct={(p.pts / p.max) * 100} color={p.pts / p.max >= 0.7 ? FG.green : p.pts / p.max >= 0.4 ? FG.gold : FG.orange} height={6} />
                <P size={11} color={FG.dim} style={{ marginTop: 2 }}>{p.note}</P>
              </View>
            ))}
          </View>
        </Panel>
      )}
      <Row gap={8} style={{ marginBottom: 14 }}>
        {[{ l: 'RACHA', v: S.streak, c: FG.orange }, { l: 'MEJOR', v: S.bestStreak, c: FG.red }, { l: 'DÍAS', v: totalDays, c: FG.green }].map((x) => (
          <View key={x.l} style={st.big}><H size={34} color={x.c}>{x.v}</H><Label size={10}>{x.l}</Label></View>
        ))}
      </Row>

      <Panel>
        <H size={22} style={{ marginBottom: 10 }}>ÚLTIMAS 8 SEMANAS</H>
        <View style={{ alignSelf: 'center' }}>
          <Row gap={5} style={{ marginBottom: 5 }}>{['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => <Text key={i} style={st.dow}>{d}</Text>)}</Row>
          {weeks.map((wk, wi) => (
            <Row key={wi} gap={5} style={{ marginBottom: 5 }}>
              {Array.from({ length: 7 }).map((_, di) => {
                const c = wk[di];
                if (!c) return <View key={di} style={{ width: 30, height: 30 }} />;
                return (
                  <TouchableOpacity key={di} onPress={() => open(c.k)} style={[st.cell, { backgroundColor: cellColor(c), borderColor: c.k === tdK ? FG.gold : 'transparent' }]} accessibilityLabel={fmtDay(c.k)}>
                    {c.entry?.claimed && <Icon name="Check" size={12} color="#0c0b0e" strokeWidth={3} />}
                  </TouchableOpacity>
                );
              })}
            </Row>
          ))}
        </View>
        <Row gap={12} style={{ justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          {[[FG.green, `Día perfecto (${L.MISSIONS.length}/${L.MISSIONS.length})`], [FG.greenDeep, 'Conquistado'], ['#5a4a2a', 'Parcial']].map(([c, t]) => (
            <Row key={t} gap={5}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c }} /><P size={11.5}>{t}</P></Row>
          ))}
        </Row>
      </Panel>

      <Panel>
        <H size={22}>HISTORIAL RECIENTE</H>
        <P size={12} style={{ marginBottom: 10 }}>Toca un día para corregirlo (sus misiones o sus series).</P>
        {recent.length === 0 ? <P>Aún no hay días registrados. ¡Completa misiones hoy!</P> : (
          <View style={{ gap: 8 }}>
            {recent.map((e: any) => {
              const tx = dayTrainXp(e.day);
              const setsN = daySets(e.day);
              const isExp = expanded === e.day;
              return (
                <View key={e.day} style={st.hist}>
                  <Row>
                    <TouchableOpacity onPress={() => open(e.day)}>{e.claimed ? <Icon name="Check" size={16} color={FG.green} strokeWidth={3} /> : <Icon name="X" size={15} color={FG.dim} />}</TouchableOpacity>
                    <TouchableOpacity onPress={() => open(e.day)} style={{ flex: 1 }}>
                      <P color={FG.white} bold>{fmtDay(e.day, false)}{e.day === tdK ? ' · HOY' : ''}</P>
                      <P size={12}>{e.missions}/{L.MISSIONS.length} misiones{setsN > 0 ? ` · ${setsN} series` : ''}</P>
                    </TouchableOpacity>
                    <View style={{ alignItems: 'flex-end' }}>
                      <H size={18} color={FG.gold}>+{n0((e.xp || 0) + tx)} XP</H>
                      {tx > 0 && <P size={11}>{e.xp} mis · {tx} ej</P>}
                    </View>
                    {setsN > 0 && <TouchableOpacity onPress={() => setExpanded(isExp ? null : e.day)} style={{ padding: 4 }}><Icon name="ChevronDown" size={16} color={FG.green} /></TouchableOpacity>}
                  </Row>
                  {isExp && (
                    <View style={st.expand}>
                      <P size={12.5} color={FG.text}>🏋️ {Object.keys((S.training || {})[e.day] || {}).length} ejercicios · {setsN} series · ~{T.dayEnergy(S, e.day).kcal} kcal</P>
                      {Object.entries(S.sessions[e.day] || {}).map(([exId, sets]) => (
                        <P key={exId} size={12}><Text style={{ color: FG.text }}>{cat[exId]?.name || exId}</Text> — {sets.filter((x) => !x.warmup).map((x) => setText(cat[exId], x)).join(' | ')}</P>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
        <Btn title="Añadir día pasado" kind="ghost" icon="Plus" onPress={() => setAdding(true)} style={{ marginTop: 12 }} />
      </Panel>

      <Sheet visible={adding} onClose={() => setAdding(false)} center title="AÑADIR DÍA PASADO">
        <P style={{ marginBottom: 12 }}>Elige un día que se te pasó registrar. Luego marcas sus misiones y anotas sus series.</P>
        <Stepper label="HACE" size="lg" value={`${ago} d`} onMinus={() => setAgo((a) => Math.max(1, a - 1))} onPlus={() => setAgo((a) => Math.min(60, a + 1))} />
        <H size={26} color={FG.gold} style={{ textAlign: 'center', marginTop: 8 }}>{fmtFull(pastKey).dn} {fmtFull(pastKey).label}</H>
        <Btn title="Crear y editar" onPress={() => { act((s) => C.addPastDay(s, pastKey), 'día pasado'); setAdding(false); ui.setViewDay(pastKey); ui.setTab('hoy'); }} style={{ marginTop: 14 }} />
      </Sheet>
    </View>
  );
}

function Libro() {
  const S = useForgeState()!;
  const ui = useForgeUi();
  const v = C.rpgView(S);
  const cat = C.catalog(S);
  const tr = S.training || {};
  const days = Object.keys(S.sessions).filter((k) => Object.keys(tr[k] || {}).length > 0).sort((a, b) => b.localeCompare(a));
  const totalSets = days.reduce((a, k) => a + Object.values(tr[k]).reduce((x: number, y: any) => x + (Number(y) || 0), 0), 0);
  const tdK = L.todayKey();
  const mult = L.intensityMult(v);
  const [limit, setLimit] = useState(20);

  return (
    <View>
      <Panel>
        <Row gap={12}>
          <Icon name="FileText" size={22} color={FG.gold} />
          <View style={{ flex: 1 }}><H size={24}>LIBRO DE REGISTROS</H><P size={12}>{days.length} {days.length === 1 ? 'día entrenado' : 'días entrenados'} · {n0(totalSets)} series en total</P></View>
        </Row>
      </Panel>
      {days.length === 0 && (
        <Panel><Text style={{ fontSize: 30, textAlign: 'center' }}>📖</Text><H size={22} style={{ textAlign: 'center' }}>Aún no hay registros</H><P style={{ textAlign: 'center' }}>Registra series en ENTRENAR y tu historial aparecerá aquí, día por día.</P></Panel>
      )}
      {days.slice(0, limit).map((k) => {
        const day = tr[k];
        const ids = Object.keys(S.sessions[k] || {}).filter((id) => day[id]).sort((a, b) => (day[b] || 0) - (day[a] || 0));
        const sets = ids.reduce((a, id) => a + (day[id] || 0), 0);
        const xp = C.dayTrainXp(S, k);
        const f = fmtFull(k);
        return (
          <TouchableOpacity key={k} activeOpacity={0.85} onPress={() => { ui.setViewDay(k === tdK ? null : k); ui.setTab('entrenar'); }} style={st.book}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <View><H size={22} color={k === tdK ? FG.gold : FG.white}>{k === tdK ? 'Hoy' : f.dn}</H><P size={12}>{f.label}</P></View>
              <View style={{ alignItems: 'flex-end' }}><P color={FG.text} bold>{sets} {sets === 1 ? 'serie' : 'series'}</P>{xp > 0 && <P size={12} color={FG.gold}>+{n0(xp)} XP</P>}</View>
            </Row>
            {ids.map((id) => {
              const ex = cat[id];
              const ss = (S.sessions[k][id] || []).filter((x) => !x.warmup);
              return (
                <View key={id} style={st.bookRow}>
                  <View style={st.dot} />
                  <View style={{ flex: 1 }}>
                    <P color={FG.text} bold size={13}>{ex?.name ?? id}</P>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 3 }}>
                      {ss.map((x, i) => <Text key={i} style={st.setTag}>{setText(ex, x)}</Text>)}
                    </View>
                  </View>
                </View>
              );
            })}
            <P size={11.5} color={FG.dim} style={{ marginTop: 6 }}>toca para ver/editar este día →</P>
          </TouchableOpacity>
        );
      })}
      {days.length > limit && <Btn title={`Ver más (${days.length - limit})`} kind="ghost" onPress={() => setLimit((l) => l + 20)} />}
    </View>
  );
}

const st = StyleSheet.create({
  big: { flex: 1, alignItems: 'center', backgroundColor: FG.panel, borderWidth: 1, borderColor: FG.line, borderRadius: 14, paddingVertical: 10 },
  dow: { width: 30, textAlign: 'center', fontFamily: FONT.bodyBold, fontSize: 11, color: FG.dim },
  cell: { width: 30, height: 30, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  hist: { borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel2, borderRadius: 12, padding: 10 },
  expand: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: FG.line, gap: 4 },
  book: { borderWidth: 1, borderColor: FG.line, backgroundColor: FG.panel, borderRadius: 14, padding: 14, marginBottom: 10 },
  bookRow: { flexDirection: 'row', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: FG.line },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: FG.red, marginTop: 7 },
  setTag: { fontFamily: FONT.body, fontSize: 11.5, color: FG.muted, borderWidth: 1, borderColor: FG.line2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
});

// ============================================================
// Forge 2.0 — PERSONAJE: el avatar (con los músculos coloreados por nivel), clases, títulos, intensidad y los 22
// subgrupos; y «Cuerpo y metas»: peso, altura, edad, gasto del día, nivel de actividad, objetivo y agua (lo de CUERPO
// del HTML, con las mismas fórmulas).
// Fase I9: el avatar es una figura vectorial con la pose de tu disciplina (ForgeAvatar), tus parámetros atléticos
// (AthleticRadar) y 7 clases (las 4 del HTML + Parkour, Tricking y Muay Thai), cada una con sus ramas y lo que potencia.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Ellipse, Rect, G } from 'react-native-svg';
import * as C from '../../../services/forge/forgeCore';
import * as T from '../../../services/forge/forgeTrain';
import { useTrainingIntent } from '../../../services/forge/trainingIntent';
import { aguaForge } from '../../../services/forge/forgeWater';
import * as Str from '../../../services/forge/forgeStrength';
import MuscleMap from '../MuscleMap';
import ForgeAvatar from '../ForgeAvatar';
import { AthleticRadar } from '../AthleticRadar';
import * as X from '../../../services/forge/forgeSkillsExt';
import * as A from '../../../services/forge/forgeAthletic';
import { FG, FONT, n0, dec } from '../theme';
import { Icon } from '../icons';
import { Bar, Btn, Chip, H, Label, P, Panel, Row, Stepper } from '../ui';
import { useForgeState, useForgeAct } from '../useForge';
import { useForgeUi } from '../forgeUi';

const L = C.L;
const colorFor = (lvl: number) => (lvl >= 10 ? FG.gold : lvl >= 6 ? FG.red : lvl >= 3 ? FG.coral : FG.dim);
const TIER_LABEL: Record<string, string> = { T1: 'INICIO', T2: 'ATLETA', T3: 'FORJADO', T4: 'ELITE', T5: 'TOJI' };
const TIER_COLOR: Record<string, string> = { T1: FG.dim, T2: FG.muted, T3: FG.blue, T4: FG.coral, T5: FG.gold };

export default function Personaje() {
  const [sec, setSec] = useState<'personaje' | 'cuerpo'>('personaje');
  return (
    <View>
      <Row gap={6} style={{ marginBottom: 12 }}>
        <Chip label="Personaje" on={sec === 'personaje'} onPress={() => setSec('personaje')} style={{ flex: 1, alignItems: 'center' }} />
        <Chip label="Cuerpo y metas" on={sec === 'cuerpo'} onPress={() => setSec('cuerpo')} style={{ flex: 1, alignItems: 'center' }} />
      </Row>
      {sec === 'personaje' ? <Character /> : <BodyGoals />}
    </View>
  );
}

function Character() {
  const S = useForgeState()!;
  const act = useForgeAct();
  const ui = useForgeUi();
  const [open, setOpen] = useState<string | null>(null);
  const { subL, grp } = C.groupLevels(S);
  const avg = L.MUSCLE_GROUPS.reduce((a: number, g: any) => a + grp[g.id], 0) / L.MUSCLE_GROUPS.length;
  const earned = C.earnedTitles(S);
  const ri = C.routineIntensity(S);
  const mult = L.intensityMult(C.rpgView(S));
  const bonus = Math.round((mult - 1) * 100);
  const riCol = ri.label === 'Brutal' ? FG.red : ri.label === 'Intensa' ? FG.coral : ri.label === 'Estándar' ? FG.green : FG.muted;

  return (
    <View>
      <Panel>
        <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <H size={24}>TU AVATAR</H>
          <Label size={12} color={FG.gold}>PROMEDIO NV {dec(avg)}</Label>
        </Row>
        <AvatarCard S={S} level={ui.level} />
      </Panel>

      <Panel>
        <Row style={{ marginBottom: 6 }}>
          <Icon name="Zap" size={16} color={FG.gold} />
          <H size={22} style={{ flex: 1 }}>PARÁMETROS ATLÉTICOS</H>
        </Row>
        <AthleticRadar data={A.athleticParams(S)} color={X.classById((S.classes || [])[0] ?? '')?.color ?? FG.red} />
      </Panel>

      <Panel>
        <H size={22} style={{ marginBottom: 8 }}>TUS MÚSCULOS</H>
        <MuscleMap S={S} />
      </Panel>

      <StrengthPanel S={S} />

      <Panel>
        <Row style={{ marginBottom: 6 }}>
          <Icon name="Swords" size={16} color={FG.red} />
          <H size={22} style={{ flex: 1 }}>TUS CLASES</H>
          <Label size={12}>{(S.classes || []).length}/2</Label>
        </Row>
        <P size={12.5} style={{ marginBottom: 10 }}>Elige <Text style={{ color: FG.white }}>1 o 2</Text> (doble clase). Cada clase sube los stats de combate que le corresponden, potencia tus parámetros atléticos, le da su pose a tu avatar y marca tu camino en el árbol.</P>
        <View style={{ gap: 8 }}>
          {X.ALL_CLASSES.map((c) => {
            const on = (S.classes || []).includes(c.id);
            const boost = Object.entries(c.boosts).map(([k, v]) => `+${Math.round(v * 100)}% ${({ atk: 'ATK', hp: 'HP', def: 'DEF', eva: 'EVA', crit: 'CRÍT', critDmg: 'D.CRÍT', vigor: 'VIGOR' } as Record<string, string>)[k]}`).join(' · ');
            const params = Object.entries(A.CLASS_PARAM_BOOST[c.id] ?? {}).map(([k, v]) => `+${Math.round((v as number) * 100)}% ${A.PARAMS.find((q) => q.key === k)?.label}`).join(' · ');
            const branches = (X.CLASS_BRANCHES[c.id] ?? []).map((b) => X.catById(b)?.label.toLowerCase()).filter(Boolean).join(', ');
            return (
              <TouchableOpacity key={c.id} onPress={() => act((s) => C.toggleClass(s, c.id), 'clase')} activeOpacity={0.85} style={[st.cls, on && { borderColor: c.color, backgroundColor: c.color + '18' }]}>
                <Row><Text style={{ fontSize: 20 }}>{c.emoji}</Text><H size={22} color={on ? c.color : FG.white} style={{ flex: 1 }}>{c.name}</H>{c.isNew && !on ? <Text style={[st.newTag, { color: c.color, borderColor: c.color + '66' }]}>NUEVA</Text> : null}{on && <Icon name="Check" size={15} color={c.color} strokeWidth={3} />}</Row>
                <P size={12.5}>{c.desc}</P>
                <P size={12} color={c.color}>{boost}</P>
                {params ? <P size={11.5} color={FG.text}>{params}</P> : null}
                {branches ? <P size={11.5} color={FG.dim}>Ramas: {branches}</P> : null}
              </TouchableOpacity>
            );
          })}
        </View>
        {(S.classes || []).length === 0 && <P size={12} color={FG.dim} style={{ marginTop: 8 }}>Sin clase aún — elige al menos una para empezar tu camino.</P>}
      </Panel>

      <Panel>
        <Row style={{ marginBottom: 8 }}>
          <Icon name="Crown" size={16} color={FG.gold} />
          <H size={22} style={{ flex: 1 }}>TÍTULOS</H>
          <Label size={12}>{earned.length}/{L.TITLES.length}</Label>
        </Row>
        <Row gap={7} style={{ flexWrap: 'wrap' }}>
          {L.TITLES.map((t: any) => {
            const has = earned.some((e: any) => e.id === t.id);
            const on = S.title === t.id;
            return <Chip key={t.id} label={`${has ? (on ? '★ ' : '') : '🔒 '}${t.name}`} on={on} color={FG.gold} disabled={!has} onPress={() => act((s) => C.setTitle(s, t.id), 'título')} />;
          })}
        </Row>
        <P size={12} color={FG.dim} style={{ marginTop: 8 }}>Toca un título desbloqueado para equiparlo (aparece junto a tu rango). Se ganan subiendo niveles, racha y dominando habilidades.</P>
      </Panel>

      <Panel>
        <Row gap={12}>
          <View style={[st.iconBox, { backgroundColor: riCol + '22' }]}><Icon name="Zap" size={20} color={riCol} /></View>
          <View style={{ flex: 1 }}>
            <Label size={11}>INTENSIDAD DE RUTINA</Label>
            <H size={24} color={riCol}>{ri.label}{ri.avgLoad ? ` · ~${ri.avgLoad} kg/serie` : ''}</H>
            <P size={12}>{bonus > 0 ? `+${bonus}% XP por entrenar fuerte` : bonus < 0 ? `${bonus}% XP (rutina suave)` : 'XP estándar — sube la carga para más'}</P>
          </View>
        </Row>
      </Panel>

      {[...new Set(L.MUSCLE_GROUPS.map((g: any) => g.region))].map((reg: any) => (
        <View key={reg} style={{ marginBottom: 12 }}>
          <Label size={11} style={{ marginBottom: 6 }}>{String(reg).toUpperCase()}</Label>
          <View style={{ gap: 8 }}>
            {L.MUSCLE_GROUPS.filter((g: any) => g.region === reg).map((g: any) => {
              const isOpen = open === g.id;
              const hot = colorFor(grp[g.id]);
              return (
                <View key={g.id} style={st.mg}>
                  <TouchableOpacity onPress={() => setOpen(isOpen ? null : g.id)} style={st.mgHead}>
                    <View style={[st.iconBox, { backgroundColor: hot + '22' }]}><Text style={{ fontSize: 20 }}>{g.emoji}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Row style={{ justifyContent: 'space-between' }}><H size={21}>{g.name}</H><H size={20} color={hot}>Nv {dec(grp[g.id])}</H></Row>
                      <P size={12}>{g.subs.length} subgrupos · toca para ver</P>
                    </View>
                    <Icon name="ChevronDown" size={18} color={FG.dim} />
                  </TouchableOpacity>
                  {isOpen && (
                    <View style={{ padding: 12, paddingTop: 0, gap: 10 }}>
                      <P size={12.5}>{g.desc}</P>
                      {g.subs.map((su: any) => {
                        const lv = subL[su.id];
                        return (
                          <View key={su.id}>
                            <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}><P color={FG.text} bold>{su.name}</P><H size={18} color={colorFor(lv.level)}>Nv {lv.level}</H></Row>
                            <Bar pct={(lv.inLevel / lv.forNext) * 100} color={colorFor(lv.level)} height={6} />
                            <P size={11.5} color={FG.dim} style={{ marginTop: 3 }}>{su.desc}</P>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}

      <Panel>
        <P size={12.5}>💡 Los músculos suben sobre todo con tu <Text style={{ color: FG.white }}>entrenamiento registrado</Text>. El <Text style={{ color: FG.white }}>árbol de habilidades</Text> aporta un extra menor — sirve para desbloquear movimientos únicos (front lever, gainer…), no para el día a día.</P>
        <P size={12.5} style={{ marginTop: 8 }}>⏳ <Text style={{ color: FG.white }}>Úsalo o piérdelo:</Text> como en la vida real, si dejas de entrenar primero baja tu forma (la barra) y luego, de a poco, el nivel. La constancia es la que manda.</P>
      </Panel>
    </View>
  );
}

/** El personaje: la figura con la pose de tu disciplina, tus músculos coloreados por nivel, el aura de tu rango y lo
 *  de tu clase. Con dos clases, se elige la pose. */
function AvatarCard({ S, level }: { S: C.ForgeState; level: number }) {
  const tier = L.tierFor(level);
  const mine: string[] = S.classes || [];
  const [pose, setPose] = useState<string | null>(null);
  const cls = pose && mine.includes(pose) ? pose : mine[0] ?? null;
  const clsObj = cls ? X.classById(cls) : null;
  const clsColor = clsObj?.color ?? FG.red;
  const ath = useMemo(() => A.athleticParams(S), [S]);
  return (
    <View style={[st.avatar, { borderColor: clsColor + '55' }]}>
      <Row style={{ justifyContent: 'space-between', width: '100%' }}>
        <Label size={11} color={TIER_COLOR[tier]}>{TIER_LABEL[tier]}</Label>
        <Label size={11} color={clsColor}>{clsObj ? `${clsObj.emoji} ${clsObj.name.toUpperCase()}` : 'SIN CLASE'}</Label>
      </Row>
      <ForgeAvatar S={S} cls={cls} tier={tier} size={210} />
      {mine.length > 1 && (
        <Row gap={6} style={{ marginTop: 4 }}>
          {mine.map((id) => { const c = X.classById(id); return c ? <Chip key={id} label={`${c.emoji} ${c.name}`} on={cls === id} color={c.color} onPress={() => setPose(id)} /> : null; })}
        </Row>
      )}
      <P size={12} style={{ marginTop: 8, textAlign: 'center' }}>
        Tu fuerte: <Text style={{ color: FG.white }}>{ath.best.label} {ath.best.value}</Text> · Lo que más te falta: <Text style={{ color: FG.white }}>{ath.weakest.label} {ath.weakest.value}</Text>
      </P>
      {!clsObj && <P size={11.5} color={FG.dim} style={{ textAlign: 'center' }}>Elige una clase abajo y tu avatar toma su pose.</P>}
    </View>
  );
}

/** Tu fuerza real: 1RM estimado de tus series contra los estándares (percentil de quienes entrenan). */
function StrengthPanel({ S }: { S: C.ForgeState }) {
  const sc = Str.strengthScore(S);
  const ratings = Str.liftRatings(S);
  if (!sc) {
    return (
      <Panel>
        <H size={22} style={{ marginBottom: 6 }}>TU FUERZA</H>
        <P size={12.5}>Todavía no hay series para estimarla. Anota con su peso y cuántas te quedaban (RIR 3 o menos, 10 reps o menos) en press de banca, sentadilla, peso muerto, press militar, remo, jalón, prensa, curl, o dominadas y fondos (también asistidas).</P>
      </Panel>
    );
  }
  const col = sc.score >= 80 ? FG.gold : sc.score >= 50 ? FG.green : sc.score >= 20 ? FG.blue : FG.muted;
  const patName: Record<string, string> = { empuje: 'Empuje', tiron: 'Tirón', pierna: 'Pierna' };
  return (
    <Panel>
      <Row style={{ marginBottom: 6 }}>
        <Icon name="TrendingUp" size={16} color={col} />
        <H size={22} style={{ flex: 1 }}>TU FUERZA</H>
        {sc.trend != null && sc.trend !== 0 ? <Label size={12} color={sc.trend > 0 ? FG.green : FG.orange}>{sc.trend > 0 ? '▲' : '▼'} {Math.abs(sc.trend)} en 4 semanas</Label> : null}
      </Row>
      <Row gap={14}>
        <View style={[st.scoreRing, { borderColor: col }]}><H size={36} color={col} style={{ lineHeight: 36 }}>{sc.score}</H><Label size={9}>/ 100</Label></View>
        <View style={{ flex: 1 }}>
          <P size={13} color={FG.text}>Más fuerte que ~{sc.score} % de quienes entrenan (tu mejor de empuje, tirón y pierna).</P>
          {sc.missing.length ? <P size={12} color={FG.dim}>Falta {sc.missing.map((m) => patName[m].toLowerCase()).join(' y ')} para el cuadro completo.</P> : null}
        </View>
      </Row>
      <View style={{ gap: 10, marginTop: 12 }}>
        {ratings.map((r) => (
          <View key={r.lift}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <P color={FG.text} bold>{r.name}</P>
              <P size={12.5}><Text style={{ color: FG.white }}>~{dec(r.e1rm)} kg</Text> · <Text style={{ color: FG.gold }}>{r.levelName}</Text></P>
            </Row>
            <Bar pct={r.pct} color={r.pct >= 80 ? FG.gold : r.pct >= 50 ? FG.green : FG.blue} height={6} />
            {r.next ? <P size={11.5} color={FG.dim} style={{ marginTop: 2 }}>{r.next.name}: ~{dec(r.next.kg)} kg de máximo</P> : null}
          </View>
        ))}
      </View>
      <P size={11} color={FG.dim} style={{ marginTop: 10 }}>Máximo estimado con tus series (Epley, contando las reps que te quedaban). Estándares de Strength Level por sexo y peso corporal, sin ajuste por edad. Es una estimación, no un récord probado.</P>
    </Panel>
  );
}

function BodyGoals() {
  const S = useForgeState()!;
  const act = useForgeAct();
  const tk = L.todayKey();
  const v = C.rpgView(S);
  const todayTr = (S.training || {})[tk] || {};
  const todaySets = Object.values(todayTr).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
  const todayKcal = T.dayEnergy(S, tk).kcal;
  const allKcal = T.totalTrainKcal(S);
  const bmr = L.bmrOf(S);
  const tdee = L.tdeeOf(S);
  const watchAct = L.watchToday(S);
  const dayExKcal = Math.max(todayKcal, watchAct ? watchAct.kcal : 0);
  const typicalEx = L.typicalExerciseOf(S);
  const extraKcal = Math.max(0, dayExKcal - typicalEx);
  const exWhat = watchAct && watchAct.kcal > todayKcal ? `${watchAct.label || 'actividad'} (reloj)` : 'tu entreno en Forge';
  const autoLv = L.autoLevelOf(S);
  const levelLabel = L.isAutoLevel(S) ? `automático (${String(autoLv.factor).replace('.', ',')})` : (L.ACTIVITY_LEVELS.find((a: any) => a.v === (S.activity || 1.375)) || {}).label || 'Ligero';
  // «¿Entrenas hoy?» respondido: según el día, igual que el servidor (DailyTargets)
  const { intent } = useTrainingIntent();
  const gh = T.ghostKcal(intent, dayExKcal, new Date(), tk);
  const planned = intent?.answer === 'si' && !gh.expired ? intent.kcal ?? 0 : 0;
  const neat = S.autoLevel?.neatKcal ?? 0;
  const byDay = intent && bmr ? T.byDaySpend(bmr, neat, dayExKcal, planned) : null;
  const totalDay = byDay ? byDay.spend : (tdee || 0) + extraKcal;
  // Revisión E1: la meta de agua es la de Inicio (forgeWater.aguaForge, misma regla que DailyTargets del servidor)
  const [fijadas, setFijadas] = useState<{ waterLiters?: number; calories?: number }>({});
  useEffect(() => {
    AsyncStorage.getItem('eris_nutrition_goals_set').then((r) => { try { const g = JSON.parse(r || '{}'); setFijadas(g && typeof g === 'object' ? g : {}); } catch {} }).catch(() => {});
  }, []);
  const hyd = useMemo(() => aguaForge(S, todaySets as number, watchAct, { intent, ghostExpired: gh.expired, bmr, fijadas }), [S, todaySets, watchAct, intent, bmr, gh.expired, fijadas]);
  const suggest = L.activitySuggestion(S);
  const gt = L.goalTargetsOf(S, tdee ? totalDay : null);
  const diab = L.forgeEnv.isDiabetic;
  const bmi = S.bodyKg && S.heightCm ? S.bodyKg / (S.heightCm / 100) ** 2 : null;
  const bmiCat = bmi == null ? '' : bmi < 18.5 ? 'bajo peso' : bmi < 25 ? 'normal' : bmi < 30 ? 'sobrepeso' : 'obesidad';

  return (
    <View>
      <Panel>
        <H size={22} style={{ marginBottom: 10 }}>TU CUERPO</H>
        <Row style={{ justifyContent: 'space-around', flexWrap: 'wrap', rowGap: 12 }}>
          <Stepper label="PESO (kg)" value={S.bodyKg != null ? dec(S.bodyKg) : '—'} onMinus={() => act((s) => C.setBody(s, 'bodyKg', Math.round(((s.bodyKg ?? 70) - 0.5) * 2) / 2), 'cuerpo')} onPlus={() => act((s) => C.setBody(s, 'bodyKg', Math.round(((s.bodyKg ?? 70) + 0.5) * 2) / 2), 'cuerpo')} />
          <Stepper label="ALTURA (cm)" value={S.heightCm != null ? String(S.heightCm) : '—'} onMinus={() => act((s) => C.setBody(s, 'heightCm', (s.heightCm ?? 170) - 1), 'cuerpo')} onPlus={() => act((s) => C.setBody(s, 'heightCm', (s.heightCm ?? 170) + 1), 'cuerpo')} />
          <Stepper label="EDAD" value={S.age != null ? String(S.age) : '—'} onMinus={() => act((s) => C.setBody(s, 'age', (s.age ?? 25) - 1), 'cuerpo')} onPlus={() => act((s) => C.setBody(s, 'age', (s.age ?? 25) + 1), 'cuerpo')} />
        </Row>
        <Row style={{ marginTop: 12, justifyContent: 'space-between' }}>
          <Chip label={S.sex === 'h' ? '♂ Hombre' : '♀ Mujer'} on onPress={() => act((s) => C.setBody(s, 'sex', s.sex === 'h' ? 'm' : 'h'), 'cuerpo')} />
          {bmi ? <P color={FG.text}>IMC <Text style={{ color: FG.gold }}>{dec(bmi)}</Text> · {bmiCat}</P> : null}
        </Row>
      </Panel>

      <Panel>
        <H size={22} style={{ marginBottom: 10 }}>GASTO CALÓRICO DIARIO (estimado)</H>
        <Row gap={10}>
          <View style={st.stat}><Label size={10}>BASAL (BMR)</Label><H size={28} color={FG.white}>{bmr ?? '—'} <Text style={st.unit}>kcal</Text></H><P size={11.5}>solo por existir</P></View>
          <View style={st.stat}><Label size={10}>MANTENIMIENTO</Label><H size={28} color={FG.white}>{tdee ?? '—'} <Text style={st.unit}>kcal</Text></H><P size={11.5}>basal + actividad diaria</P></View>
        </Row>
        <Label size={11} style={{ marginTop: 14, marginBottom: 6 }}>NIVEL DE ACTIVIDAD GENERAL</Label>
        <View style={{ gap: 6 }}>
          {autoLv ? (
            <TouchableOpacity onPress={() => act((s) => C.setActivityAuto(s), 'actividad')} style={[st.opt, L.isAutoLevel(S) && st.optOn]}>
              <P color={L.isAutoLevel(S) ? FG.white : FG.text} bold>{`⚡ Automático: ${String(autoLv.factor).replace('.', ',')} · ${autoLv.label}`}</P>
              <P size={12}>{`Según tus últimas 4 semanas reales (Forge + reloj): ~${String(autoLv.perWeek).replace('.', ',')} días de ejercicio por semana y tu movimiento del día a día.`}</P>
            </TouchableOpacity>
          ) : (
            <P size={12}>El nivel automático (según tu actividad real) se activa con 2 semanas de datos del reloj o de Forge. Mientras, elige el tuyo:</P>
          )}
          {L.ACTIVITY_LEVELS.map((a: any) => {
            const on = !L.isAutoLevel(S) && (S.activity || 1.375) === a.v;
            return (
              <TouchableOpacity key={a.v} onPress={() => act((s) => C.setActivity(s, a.v), 'actividad')} style={[st.opt, on && st.optOn]}>
                <P color={on ? FG.white : FG.text} bold>{a.label}</P>
                <P size={12}>{a.desc}</P>
              </TouchableOpacity>
            );
          })}
        </View>
        {suggest && (
          <View style={[st.opt, { marginTop: 8, borderColor: FG.gold + '55' }]}>
            <P size={12.5}>{`Según Forge y tu reloj, las últimas semanas entrenaste ~${String(suggest.perWeek).replace('.', ',')} días por semana: tu nivel sería `}<Text style={{ color: FG.gold }}>{suggest.label}</Text>.</P>
            <Btn title={`Usar ${suggest.label}`} kind="gold" small onPress={() => act((s) => C.setActivity(s, suggest.v), 'actividad')} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
          </View>
        )}
        <Row gap={12} style={{ marginTop: 14 }}>
          <View style={[st.iconBox, { backgroundColor: FG.orange + '22' }]}><Icon name="Flame" size={20} color={FG.orange} /></View>
          <View style={{ flex: 1 }}><Label size={11}>GASTO TOTAL HOY</Label><H size={30} color={FG.white}>{tdee ? n0(totalDay) : '—'} <Text style={st.unit}>kcal</Text></H></View>
        </Row>
        {byDay && intent ? (
          <P size={12} style={{ marginTop: 6 }}>{intent.answer === 'no'
            ? `Hoy dijiste que descansas: ~${n0(Math.round(bmr! * 1.2 + neat))} kcal (basal × 1,2${neat ? ` + ~${n0(neat)} de tu movimiento del día a día` : ''})${dayExKcal ? ` + ~${n0(dayExKcal)} de lo que igual te moviste` : ''}.`
            : `Hoy entrenas: ~${n0(Math.round(bmr! * 1.2 + neat))} de todos los días + ~${n0(byDay.exercise)} del entreno${gh.ghost ? ` (planificado: ${T.intentPhrase(intent)}, faltan ~${n0(gh.ghost)})` : ''}.`}</P>
        ) : null}
        <P size={12} style={{ marginTop: 6, display: byDay ? 'none' : 'flex' } as any}>{`Tu nivel ${levelLabel} ya incluye ~${typicalEx} kcal de ejercicio de un día típico. ` + (dayExKcal ? (extraKcal ? `Hoy, ${exWhat}: ~${dayExKcal} kcal → +${extraKcal} sobre tu día típico. ` : `Hoy, ${exWhat}: ~${dayExKcal} kcal, dentro de tu día típico. `) : 'Si hoy entrenas más que eso, la diferencia se suma sola. ')}</P>
        <P size={11.5} color={FG.dim} style={{ marginTop: 6 }}>{'⚕️ Para comer en superávit/déficit, valida estos números con tu médico o nutricionista.' + (diab ? ' Con tu diabetes, el ajuste de calorías afecta tu insulina — coordina el cambio con tu equipo médico.' : '')}</P>
      </Panel>

      <Panel>
        <Row gap={12} style={{ marginBottom: 10 }}>
          <View style={[st.iconBox, { backgroundColor: FG.green + '22' }]}><Icon name="Utensils" size={20} color={FG.green} /></View>
          <View style={{ flex: 1 }}><H size={22}>TU OBJETIVO</H><P size={12}>{gt.goal ? gt.goal.desc : 'Elígelo y ajusto tus calorías y tu proteína'}</P></View>
        </Row>
        <View style={{ gap: 6 }}>
          {L.GOALS.map((g: any) => {
            const on = S.goal === g.v;
            return (
              <TouchableOpacity key={g.v} onPress={() => act((s) => C.setGoal(s, on ? null : g.v), 'objetivo')} style={[st.opt, on && st.optOn]}>
                <P color={on ? FG.white : FG.text} bold>{g.label}</P>
                <P size={12}>{g.desc}</P>
              </TouchableOpacity>
            );
          })}
        </View>
        <Row gap={10} style={{ marginTop: 12 }}>
          <View style={st.stat}><Label size={10}>META DE CALORÍAS HOY</Label><H size={28} color={FG.gold}>{gt.kcal != null ? n0(gt.kcal) : '—'} <Text style={st.unit}>kcal</Text></H><P size={11.5}>{gt.delta ? `${gt.delta > 0 ? '+' : '−'}${Math.abs(gt.delta)} kcal de ${gt.delta > 0 ? 'superávit' : 'déficit'}` : 'lo que gastas hoy'}</P></View>
          <View style={st.stat}><Label size={10}>PROTEÍNA DIARIA</Label><H size={28} color={FG.green}>{gt.prot ? (gt.prot.cap ? `≤${gt.prot.target}` : `${gt.prot.lo}–${gt.prot.hi}`) : '—'} <Text style={st.unit}>g</Text></H><P size={11.5}>{gt.prot ? (gt.prot.cap ? 'tope por enfermedad renal' : `meta ${gt.prot.target} g · ${L.fmtKg(gt.prot.perKg)} g/kg`) : 'completa tu peso'}</P></View>
        </Row>
        {gt.prot && <P size={11.5} color={FG.dim} style={{ marginTop: 8 }}>{gt.prot.cap ? gt.prot.note || 'Con enfermedad renal la proteína es un tope; lo afina tu nefrólogo.' : `${gt.goal ? gt.goal.why + ' ' : ''}Rango con respaldo si entrenas fuerza: 1,6–2,2 g/kg (Morton 2018; ISSN).${gt.prot.usedRef ? ` Con IMC sobre 30 se calcula con tu peso de referencia (${gt.prot.refKg} kg).` : ''}`}</P>}
      </Panel>

      <Panel>
        <Row gap={12}>
          <View style={[st.iconBox, { backgroundColor: FG.blue + '22' }]}><Icon name="GlassWater" size={22} color={FG.blue} /></View>
          <View style={{ flex: 1 }}><Label size={11}>HIDRATACIÓN OBJETIVO HOY</Label><H size={30} color={FG.white}>{hyd && !hyd.off ? dec(hyd.total / 1000) : '—'} <Text style={st.unit}>L</Text></H></View>
          {hyd && !hyd.off && <View style={{ alignItems: 'center' }}><H size={26} color={FG.blue}>≈{hyd.cups}</H><Label size={9}>VASOS (250ml)</Label></View>}
        </Row>
        {hyd && hyd.off && <P size={12} style={{ marginTop: 6 }}>{'⚕️ Sin meta de agua: ' + hyd.note + '.'}</P>}
        {hyd && !hyd.off && (
          <P size={12} style={{ marginTop: 6 }}>{hyd.fijada ? <>La meta que fijaste en Perfil (la misma de Inicio).</> : <>Base por tu peso: <Text style={{ color: FG.white }}>{dec(hyd.base / 1000)} L</Text></>}{hyd.train > 0 ? <>{' · extra por entreno hoy: '}<Text style={{ color: FG.white }}>+{hyd.train} ml</Text></> : null}.{'\n'}
            <Text style={{ color: FG.dim }}>{(hyd.note ? '⚕️ Incluye ' + hyd.note + '. ' : '') + '⚕️ Sube con calor o sed' + (diab ? ' o glucosa alta' : '') + '. Si tu médico te indicó límite de líquidos (riñón/corazón), respeta esa pauta por encima de esto.'}</Text>
          </P>
        )}
      </Panel>

      <Panel>
        <Row gap={12}>
          <View style={[st.iconBox, { backgroundColor: FG.orange + '22' }]}><Icon name="Flame" size={22} color={FG.orange} /></View>
          <View style={{ flex: 1 }}><Label size={11}>QUEMA POR ENTRENAMIENTO HOY</Label><H size={30} color={FG.white}>{n0(todayKcal)} <Text style={st.unit}>kcal</Text></H></View>
        </Row>
        <P size={12} style={{ marginTop: 6 }}>Estimación según la carga de cada serie y qué tan cerca del fallo quedaste (Compendio de Actividades Físicas): la quema real varía por persona. Si tu reloj midió más, manda el reloj. Acumulado: <Text style={{ color: FG.white }}>{n0(allKcal)} kcal</Text>.</P>
        <P size={11.5} color={FG.dim} style={{ marginTop: 4 }}>{diab ? '⚕️ Con tu diabetes: a más quema, más baja la glucosa. Vigila tu glucosa tras entrenar y ten carbo rápido a mano.' : '⚕️ A más quema, más margen para ajustar tu ingesta calórica del día.'}</P>
      </Panel>
    </View>
  );
}

const st = StyleSheet.create({
  cls: { borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel2, borderRadius: 12, padding: 12, gap: 3 },
  newTag: { fontFamily: FONT.bodyBold, fontSize: 10, letterSpacing: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginRight: 6 },
  iconBox: { width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  mg: { borderWidth: 1, borderColor: FG.line, backgroundColor: FG.panel, borderRadius: 14 },
  mgHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  avatar: { alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, backgroundColor: '#0f0d15' },
  scoreRing: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#15121b' },
  stat: { flex: 1, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel2, borderRadius: 12, padding: 12 },
  unit: { fontFamily: FONT.body, fontSize: 13, color: FG.muted },
  opt: { borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel2, borderRadius: 10, padding: 10 },
  optOn: { borderColor: FG.red, backgroundColor: FG.red + '14' },
});

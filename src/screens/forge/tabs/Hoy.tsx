// Forge 2.0 — HOY: atributos, siguiente objetivo del árbol, misiones del día (o de un día pasado), reglas y reinicio.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as C from '../../../services/forge/forgeCore';
import { FG, FONT, fmtDay, n0, dec } from '../theme';
import { Icon } from '../icons';
import { Bar, Btn, H, Label, P, Panel, Row, Sheet } from '../ui';
import { useForgeState, useForgeAct } from '../useForge';
import { useForgeUi } from '../forgeUi';
import { ErisDecideChip } from '../../../components/home/ErisPlan';
import TrainingIntentCard from '../../../components/TrainingIntentCard';

const L = C.L;

export function skillStateOf(S: C.ForgeState, sk: any, level: number): 'mastered' | 'locked' | 'progress' | 'available' {
  if (C.isMasteredAny(S, sk.id)) return 'mastered';
  const ok = level >= sk.lvl && sk.prereq.every((p: string) => C.isMasteredAny(S, p));
  if (!ok) return 'locked';
  const st = S.skills?.[sk.id]?.steps || [];
  return st.some(Boolean) ? 'progress' : 'available';
}

export default function Hoy() {
  const S = useForgeState()!;
  const act = useForgeAct();
  const ui = useForgeUi();
  const [rules, setRules] = useState(false);
  const [reset, setReset] = useState(false);
  const tk = L.todayKey();
  const editingPast = !!ui.viewDay && ui.viewDay !== tk;
  const curDay: any = editingPast ? (S.log || []).find((e: any) => e.day === ui.viewDay) || L.freshToday(ui.viewDay) : S.today;
  const curMd = L.missionsDone(curDay);
  const curClaimed = !!curDay.claimed;

  const level = ui.level;
  const nextSkill = L.SKILLS.filter((sk: any) => skillStateOf(S, sk, level) !== 'mastered').sort((a: any, b: any) => {
    const av = skillStateOf(S, a, level) === 'locked' ? 1 : 0, bv = skillStateOf(S, b, level) === 'locked' ? 1 : 0;
    return av - bv || a.lvl - b.lvl;
  })[0];

  const attrs = [
    { icon: 'Swords', label: 'FUERZA', value: S.counters.workouts + (S.today.workout ? 1 : 0), max: 60, color: FG.red },
    { icon: 'Flame', label: 'CONSTANCIA', value: S.streak, max: 14, color: FG.orange, suffix: 'd' },
    { icon: 'HeartPulse', label: 'VITALIDAD', value: S.counters.sleepDays + ((S.today.sleep || 0) >= L.SLEEP_THRESHOLD ? 1 : 0), max: 80, color: FG.green },
    { icon: 'Wind', label: 'AGILIDAD', value: S.counters.stepDays + ((S.today.steps || 0) >= L.STEPS_THRESHOLD ? 1 : 0), max: 60, color: FG.blue },
  ];

  const mToggle = (m: any) => {
    if (editingPast) { act((s) => C.patchDayField(s, ui.viewDay!, m.key, !curDay[m.key]), 'misión'); return; }
    const on = !S.today[m.key];
    ui.toast((on ? 1 : -1) * m.xp);
    act((s) => C.toggleMission(s, m.key), 'misión');
  };
  const mSetCount = (m: any, val: number) => {
    if (editingPast) { act((s) => C.patchDayField(s, ui.viewDay!, m.key, val), 'misión'); return; }
    ui.toast((val - (S.today[m.key] || 0)) * m.xp);
    act((s) => C.setMissionCount(s, m.key, val), 'misión');
  };

  // El entreno de hoy (resumen; se registra en ENTRENAR)
  const dayKey = editingPast ? ui.viewDay! : tk;
  const sets = Object.values((S.training || {})[dayKey] || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
  const planIds = Object.keys(S.plan || {});
  const planTarget = planIds.reduce((a, id) => a + (S.plan[id] || 0), 0);
  const planDone = planIds.reduce((a, id) => a + Math.min(S.plan[id], ((S.training || {})[dayKey] || {})[id] || 0), 0);

  return (
    <View>
      {editingPast && (
        <Panel tint={FG.gold}>
          <Row>
            <Icon name="CalendarDays" size={18} color={FG.gold} />
            <View style={{ flex: 1 }}>
              <Label size={11} color={FG.gold}>EDITANDO DÍA PASADO</Label>
              <H size={24}>{fmtDay(ui.viewDay!)}</H>
            </View>
            <Btn title="Volver a hoy" kind="ghost" small onPress={() => ui.setViewDay(null)} />
          </Row>
        </Panel>
      )}

      {!editingPast && (
        <Panel>
          <Label style={{ marginBottom: 10 }}>ATRIBUTOS</Label>
          <View style={{ gap: 10 }}>
            {attrs.map((a) => (
              <View key={a.label}>
                <Row style={{ marginBottom: 5 }}>
                  <Icon name={a.icon} size={15} color={a.color} />
                  <Label size={12} color={FG.text} style={{ flex: 1 }}>{a.label}</Label>
                  <H size={18} color={a.color}>{a.value}{a.suffix || ''}</H>
                </Row>
                <Bar pct={(a.value / a.max) * 100} color={a.color} />
              </View>
            ))}
          </View>
        </Panel>
      )}

      {/* El entreno del día: atajo a ENTRENAR */}
      <TouchableOpacity onPress={() => ui.setTab('entrenar')} activeOpacity={0.85} style={[st.teaser, { borderColor: FG.red + '44' }]}>
        <Icon name="Dumbbell" size={20} color={FG.red} />
        <View style={{ flex: 1 }}>
          <Label size={11} color={FG.red}>{editingPast ? 'ENTRENO DE ESE DÍA' : 'ENTRENO DE HOY'}</Label>
          <P color={FG.white} bold>{sets ? `${sets} series registradas` : 'Nada registrado todavía'}{planTarget ? ` · plan ${planDone}/${planTarget}` : ''}</P>
          <P size={12}>Registra cada serie con su peso y qué tan cerca del fallo quedaste.</P>
        </View>
        <Icon name="ChevronRight" size={18} color={FG.dim} />
      </TouchableOpacity>

      {/* «¿Entrenas hoy?»: las metas de toda la app según el día (Forge 2.0) */}
      {!editingPast && <ErisDecideChip modulo="entreno" style={{ marginBottom: 10 }} />}
      {!editingPast && <TrainingIntentCard always theme={{ bg: FG.panel, line: FG.line2, text: FG.text, muted: FG.muted, accent: FG.red, ok: FG.green, font: FONT.body, fontBold: FONT.bodyBold }} />}

      {!editingPast && nextSkill && (
        <TouchableOpacity onPress={() => { ui.setTab('arbol'); ui.openSkill(nextSkill.id); }} activeOpacity={0.85} style={st.teaser}>
          <Icon name="Target" size={20} color={FG.gold} />
          <View style={{ flex: 1 }}>
            <Label size={11} color={FG.gold}>SIGUIENTE OBJETIVO</Label>
            <H size={22}>{nextSkill.emoji} {nextSkill.name}</H>
            <P size={12}>{skillStateOf(S, nextSkill, level) === 'locked' ? `🔒 Requiere nivel ${nextSkill.lvl}` : '¡Ya puedes entrenarla! Toca para ver pasos'}</P>
          </View>
          <Icon name="ChevronRight" size={18} color={FG.dim} />
        </TouchableOpacity>
      )}

      <Row style={{ justifyContent: 'space-between', marginTop: 16, marginBottom: 8 }}>
        <H size={24}>{editingPast ? 'MISIONES DEL DÍA' : 'MISIONES DE HOY'}</H>
        <H size={22} color={FG.gold}>{curMd}/{L.MISSIONS.length}</H>
      </Row>
      {curClaimed ? (
        <View style={st.dayWon}><Icon name="Check" size={18} color={FG.green} /><Text style={st.dayWonText}>DÍA CONQUISTADO · racha asegurada</Text></View>
      ) : (
        <View style={st.dayPending}><P style={{ textAlign: 'center' }}>Completa {Math.max(0, L.MISSIONS_TO_CLAIM - curMd)} misión(es) más para conquistar el día</P></View>
      )}

      <View style={{ gap: 10, marginTop: 10 }}>
        {L.MISSIONS.map((m: any) => {
          if (m.type === 'auto') {
            const val = curDay[m.key] || 0;
            const done = val >= m.threshold;
            const fmtVal = m.key === 'steps' ? `${n0(val)} pasos` : `${dec(val)} h`;
            return (
              <View key={m.key} style={[st.mission, done && st.missionOn]}>
                <View style={[st.iconBox, { backgroundColor: done ? FG.green + '22' : FG.line }]}><Icon name={m.icon} size={20} color={done ? FG.green : FG.muted} /></View>
                <View style={{ flex: 1 }}><P color={FG.white} bold size={15}>{m.label}</P><P size={12}>{m.sub} · {fmtVal}</P></View>
                <Text style={st.xp}>+{m.xp}</Text>
                <View style={[st.check, { borderColor: done ? FG.green : FG.line3, backgroundColor: done ? FG.green : 'transparent' }]}>{done && <Icon name="Check" size={16} color="#0c0b0e" strokeWidth={3} />}</View>
              </View>
            );
          }
          if (m.type === 'toggle') {
            const on = !!curDay[m.key];
            return (
              <TouchableOpacity key={m.key} onPress={() => mToggle(m)} activeOpacity={0.8} style={[st.mission, on && st.missionOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <View style={[st.iconBox, { backgroundColor: on ? FG.green + '22' : FG.line }]}><Icon name={m.icon} size={20} color={on ? FG.green : FG.muted} /></View>
                <View style={{ flex: 1 }}><P color={FG.white} bold size={15}>{m.label}</P><P size={12}>{m.key === 'workout' ? 'Se marca sola al registrar una serie' : m.sub}</P></View>
                <Text style={st.xp}>+{m.xp}</Text>
                <View style={[st.check, { borderColor: on ? FG.green : FG.line3, backgroundColor: on ? FG.green : 'transparent' }]}>{on && <Icon name="Check" size={16} color="#0c0b0e" strokeWidth={3} />}</View>
              </TouchableOpacity>
            );
          }
          const val = curDay[m.key] || 0;
          return (
            <View key={m.key} style={st.mission}>
              <View style={[st.iconBox, { backgroundColor: FG.line }]}><Icon name={m.icon} size={20} color={FG.muted} /></View>
              <View style={{ flex: 1 }}>
                <P color={FG.white} bold size={15}>{m.label} <Text style={{ color: FG.gold }}>{val}/{m.max}</Text></P>
                <P size={12}>{m.sub}</P>
                <Row gap={6} style={{ marginTop: 6 }}>
                  {Array.from({ length: m.max }).map((_, i) => (
                    <TouchableOpacity key={i} onPress={() => mSetCount(m, val === i + 1 ? i : i + 1)} style={[st.dot, i < val && { backgroundColor: FG.green, borderColor: FG.green }]} />
                  ))}
                </Row>
              </View>
            </View>
          );
        })}
      </View>

      {editingPast ? (
        <Btn title="Listo · volver a hoy" onPress={() => ui.setViewDay(null)} style={{ marginTop: 18 }} />
      ) : (
        <>
          <Row style={{ marginTop: 16 }}>
            <Btn title="Cómo funciona" kind="ghost" small icon="Info" onPress={() => setRules((v) => !v)} style={{ flex: 1 }} />
            <Btn title="Reiniciar" kind="ghost" small icon="RotateCcw" onPress={() => setReset(true)} style={{ flex: 1 }} />
          </Row>
          {rules && (
            <Panel style={{ marginTop: 12 }}>
              <P color={FG.white} bold>Las reglas, claras:</P>
              <P>• Las <Text style={{ color: FG.white }}>misiones diarias</Text> dan XP → subes de nivel.</P>
              <P>• Completa <Text style={{ color: FG.white }}>{L.MISSIONS_TO_CLAIM} de {L.MISSIONS.length}</Text> para conquistar el día y sumar <Text style={{ color: FG.orange }}>racha</Text> 🔥.</P>
              <P>• Cada <Text style={{ color: FG.white }}>serie registrada</Text> suma XP según el peso y las reps, y sube los músculos que trabaja.</P>
              <P>• En el <Text style={{ color: FG.white }}>ÁRBOL</Text> cada habilidad se abre al llegar a su nivel y dominar las anteriores; se domina marcando sus pasos reales → golpe gordo de XP.</P>
              <P>• Constancia &gt; intensidad.</P>
              <P size={12} color={FG.dim} style={{ marginTop: 6 }}>{(C.L.forgeEnv.isDiabetic ? '⚕️ Coordina entrenamiento, comidas e insulina con tu médico. ' : '⚕️ ') + 'Los flips: colchoneta/foso + entrenador. La app motiva, no sustituye criterio profesional.'}</P>
            </Panel>
          )}
          <P size={12} color={FG.dim} style={{ textAlign: 'center', marginTop: 14 }}>Mejor racha: {S.bestStreak} días · Días conquistados: {S.counters.daysActive}</P>
        </>
      )}

      <Sheet visible={reset} onClose={() => setReset(false)} center title="¿REINICIAR TODO?">
        <P>Perderás nivel, XP, racha, habilidades y tu historial de entrenos. Queda una copia en el PC de Eris (Perfil → Respaldo de Forge) por si te arrepientes.</P>
        <Row style={{ marginTop: 16 }}>
          <Btn title="Cancelar" kind="ghost" onPress={() => setReset(false)} style={{ flex: 1 }} />
          <Btn title="Reiniciar" kind="danger" onPress={() => { act(() => ({ ...C.newState(), gym: S.gym }), 'reinicio'); setReset(false); }} style={{ flex: 1 }} />
        </Row>
      </Sheet>
    </View>
  );
}

const st = StyleSheet.create({
  teaser: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: FG.gold + '33', backgroundColor: '#1a1710', marginBottom: 10 },
  dayWon: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#13241d', borderWidth: 1, borderColor: FG.green + '44' },
  dayWonText: { fontFamily: FONT.bodyBold, color: FG.green, fontSize: 14, letterSpacing: 1 },
  dayPending: { padding: 12, borderRadius: 12, backgroundColor: FG.panel, borderWidth: 1, borderStyle: 'dashed', borderColor: FG.line3 },
  mission: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel },
  missionOn: { borderColor: FG.green + '55', backgroundColor: '#132019' },
  iconBox: { width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  xp: { fontFamily: FONT.display, fontSize: 18, color: FG.gold, marginRight: 4 },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: FG.line3, backgroundColor: FG.line },
});

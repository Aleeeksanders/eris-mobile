// ============================================================
// Forge 2.0 — RUTINA (F5): la rutina estructurada que arma Eris (o el botón «Armar mi rutina»: el mismo generador,
// forgeRoutine.buildRoutine) con sus días, ejercicios, series × reps × RIR y el peso de arranque real de tu gimnasio.
// «Hoy toca» y cargarlo como plan de hoy (con la progresión: siguiente peso o +1 rep, y descargas). Cambiar un ejercicio
// por su alternativa (dolor, no hay la máquina). La rutina en texto (la del HTML, la que pegaste) sigue disponible.
// Fase I8: tu rutina escrita se convierte en plan por días con una revisión (MdReview): días de la semana (y descanso los
// que no tocan), bloques (Gym / Casa), calentamiento, notas y cómo la escribiste. Tu texto no se reemplaza.
// ============================================================
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import * as C from '../../../services/forge/forgeCore';
import * as R from '../../../services/forge/forgeRoutine';
import { forgeStore } from '../../../services/forge/forgeStore';
import type { Care } from '../../../services/forge/forgeCatalog';
import { wsManager } from '../../../services/WebSocketManager';
import { FG, FONT } from '../theme';
import { Icon } from '../icons';
import { Btn, Chip, H, Label, P, Panel, Row, Sheet } from '../ui';
import { useForgeRoutine, useForgeState, useForgeAct } from '../useForge';
import { useForgeUi } from '../forgeUi';
import MdReview from '../MdReview';

const GOAL_NAME: Record<R.RoutineGoal, string> = { fuerza: 'Fuerza', hipertrofia: 'Músculo (hipertrofia)', salud: 'Salud y constancia' };
const CARE: Array<{ id: Care; name: string }> = [{ id: 'lumbar', name: 'Espalda baja' }, { id: 'hombro', name: 'Hombro' }, { id: 'rodilla', name: 'Rodilla' }, { id: 'muneca', name: 'Muñeca' }, { id: 'codo', name: 'Codo' }];

export default function Rutina() {
  const S = useForgeState()!;
  const act = useForgeAct();
  const routineMd = useForgeRoutine();
  const ui = useForgeUi();
  const [builder, setBuilder] = useState(false);
  const [paste, setPaste] = useState(false);
  const [showText, setShowText] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const r: R.Routine | undefined = S.routinePlan;
  const fromMd = r?.source === 'md';
  const hasText = !!routineMd?.md;
  const cat = C.catalog(S);
  const next = useMemo(() => (r ? R.nextRoutineDay(S, r) : null), [r, S.sessions]);
  const todayPlan = S.planDay && S.planDay.day === C.L.todayKey() ? S.planDay : null;
  const rest = !!todayPlan?.rest || (r ? R.isRestDay(r) && !todayPlan : false);

  const loadToday = (dayId?: string) => {
    // Durmiendo poco estos días (Sueño 2.0 · S3): el plan sale con la descarga (~10 % menos y una serie menos)
    act((s) => R.loadRoutineDay(s, dayId, { sleepPoor: ui.ready?.level === 'liviano' }), 'plan de la rutina');
    ui.toast(0, 'PLAN DE HOY CARGADO ✓');
    ui.setTab('entrenar');
  };
  const swap = (exId: string) => {
    if (!r) return;
    const res = R.swapExercise(S, r, exId);
    if (!res.to) { ui.toast(0, 'NO ENCONTRÉ UNA ALTERNATIVA'); return; }
    act((s) => R.setRoutinePlan({ ...s, routinePlan: res.routine }, res.routine), 'rutina');
    // tu rutina escrita no se reemplaza por la tabla
    if (r.source !== 'md') forgeStore.setRoutine({ md: R.routineToMd(S, res.routine), name: res.routine.name }).catch(() => {});
    ui.toast(0, `CAMBIADO: ${cat[res.to]?.name.toUpperCase()}`);
  };

  return (
    <View>
      {r ? (
        <>
          <Panel tint={FG.red}>
            <Label size={11} color={FG.red}>{r.source === 'eris' ? 'RUTINA DE ERIS' : fromMd ? 'TU RUTINA (DE TU TEXTO)' : 'TU RUTINA'}</Label>
            <H size={26}>{r.name}</H>
            <P size={12.5}>{fromMd
              ? `${r.days.length} días${R.hasWeekdays(r) ? ` · ${r.days.filter((d) => d.weekday != null).map((d) => R.WEEKDAY_NAMES[d.weekday!]).join(', ')}` : ''}`
              : `${r.daysPerWeek} días por semana · ~${r.minutes} min · ${GOAL_NAME[r.goal]} · ${r.where === 'casa' ? 'en casa' : 'gimnasio'}`}</P>
            {next && rest && (
              <View style={st.today}>
                <View style={{ flex: 1 }}>
                  <Label size={10} color={FG.blue}>HOY: DESCANSO</Label>
                  <H size={22} color={FG.white}>{next.weekday != null ? `El ${R.WEEKDAY_NAMES[next.weekday]}: ` : 'Después: '}{next.name}</H>
                  <P size={12}>Descansar también es parte del plan. Si quieres entrenar igual, cárgalo.</P>
                </View>
                <Btn title="Cargar igual" small kind="ghost" onPress={() => loadToday(next.id)} />
              </View>
            )}
            {next && !rest && (
              <View style={st.today}>
                <View style={{ flex: 1 }}>
                  <Label size={10} color={FG.gold}>{todayPlan ? 'PLAN DE HOY' : 'HOY TOCA'}</Label>
                  <H size={22} color={FG.white}>{todayPlan?.name ?? next.name}</H>
                  <P size={12}>{(todayPlan ? r.days.find((d) => d.id === todayPlan.id) : next)?.focus}</P>
                </View>
                <Btn title={todayPlan ? 'Ir a entrenar' : 'Cargar'} small onPress={() => (todayPlan ? ui.setTab('entrenar') : loadToday(next.id))} />
              </View>
            )}
          </Panel>

          {r.days.map((d) => {
            const open = openDay === d.id || (openDay == null && d.id === (todayPlan?.id ?? next?.id));
            return (
              <View key={d.id} style={st.day}>
                <TouchableOpacity onPress={() => setOpenDay(open ? '-' : d.id)} style={st.dayHead}>
                  <View style={{ flex: 1 }}><H size={20}>{d.name}</H><P size={11.5}>{d.weekday != null ? `${R.WEEKDAY_NAMES[d.weekday]} · ` : ''}{d.items.length} ejercicios · {d.items.reduce((a, i) => a + i.sets, 0)} series</P></View>
                  <Icon name="ChevronDown" size={16} color={FG.dim} />
                </TouchableOpacity>
                {open && (
                  <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
                    {d.warmup ? <P size={12} color={FG.muted} style={{ marginBottom: 4 }}>Calentamiento: {d.warmup}</P> : null}
                    {d.items.map((it, k) => {
                      const t = R.nextTarget(S, it);
                      const showBlock = !!it.block && it.block !== d.items[k - 1]?.block;
                      return (
                        <View key={it.exId}>
                          {showBlock && <Label size={10} color={FG.gold} style={{ marginTop: 8, marginBottom: 2 }}>{it.block!.toUpperCase()}</Label>}
                          <View style={st.item}>
                            <View style={{ flex: 1 }}>
                              <P color={FG.white} bold>{cat[it.exId]?.name ?? it.exId}{it.optional ? <Text style={{ color: FG.dim }}> · opcional</Text> : null}</P>
                              {it.label ? <P size={11} color={FG.dim}>«{it.label}»</P> : null}
                              <P size={12} color={FG.gold}>{R.targetText(S, t)}</P>
                              {it.note ? <P size={11.5} color={FG.muted}>{it.note}</P> : null}
                              <P size={11} color={t.deload ? FG.orange : FG.dim}>{t.why}</P>
                            </View>
                            <TouchableOpacity onPress={() => swap(it.exId)} style={st.swap} accessibilityLabel={`Cambiar ${cat[it.exId]?.name}`}><Text style={st.swapTxt}>Cambiar</Text></TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                    {(d.notes ?? []).map((n, i) => <P key={i} size={11.5} color={FG.dim} style={{ marginTop: 4 }}>• {n}</P>)}
                    <Btn title={`Cargar ${d.name.split(' — ')[0]} como plan de hoy`} kind="ghost" small onPress={() => loadToday(d.id)} style={{ marginTop: 8 }} />
                  </View>
                )}
              </View>
            );
          })}

          {r.notes.length > 0 && (
            <Panel>
              <Label size={11} style={{ marginBottom: 6 }}>CÓMO USARLA</Label>
              {r.notes.map((n, i) => <P key={i} size={12.5}>• {n}</P>)}
            </Panel>
          )}
          <Row style={{ marginBottom: 12 }}>
            {fromMd && hasText
              ? <Btn title="Revisar de nuevo" kind="ghost" small icon="ListChecks" onPress={() => setReview(true)} style={{ flex: 1 }} />
              : <Btn title="Armar otra" kind="ghost" small icon="RotateCcw" onPress={() => setBuilder(true)} style={{ flex: 1 }} />}
            <Btn title={showText ? 'Ocultar texto' : fromMd ? 'Ver mi texto' : 'Ver como texto'} kind="ghost" small icon="FileText" onPress={() => setShowText((v) => !v)} style={{ flex: 1 }} />
            <Btn title="" kind="ghost" small icon="Trash2" onPress={() => act((s) => R.setRoutinePlan(s, null), 'rutina')} />
          </Row>
          {showText && (
            <Panel>
              {/* tu texto se edita aquí; al guardarlo se vuelve a revisar y convertir */}
              {fromMd && hasText ? <Btn title="Editar mi texto" kind="ghost" small icon="Pencil" onPress={() => setPaste(true)} style={{ alignSelf: 'flex-end', marginBottom: 6 }} /> : null}
              <Markdown style={md2}>{fromMd && hasText ? routineMd!.md : R.routineToMd(S, r)}</Markdown>
            </Panel>
          )}
        </>
      ) : (
        <Panel tint={FG.red}>
          <H size={26}>TU RUTINA, HECHA PARA TI</H>
          <P style={{ marginTop: 4 }}>Te armo una con tu equipo, tu fuerza y lo que tienes que cuidar: cuántos días, cuánto rato y para qué. Después cada día carga solo lo que toca, con el peso que corresponde.</P>
          <Btn title="Armar mi rutina" icon="Sparkles" onPress={() => setBuilder(true)} style={{ marginTop: 12 }} />
          <P size={12} color={FG.dim} style={{ marginTop: 8 }}>También puedes pedírsela a Eris por chat: «ármame una rutina de 4 días para el gimnasio».</P>
        </Panel>
      )}

      {/* La rutina en texto (la del HTML o la que pegues) */}
      {!r && (
        <>
          <Row gap={6} style={{ marginBottom: 8 }}>
            <Icon name="FileText" size={15} color={routineMd ? FG.green : FG.dim} />
            <P color={routineMd ? FG.green : FG.dim} bold style={{ flex: 1 }}>{routineMd?.name ?? 'Rutina de ejemplo'}</P>
            <Btn title={routineMd ? 'Editar' : 'Pegar la mía'} kind="ghost" small icon="Pencil" onPress={() => setPaste(true)} />
          </Row>
          {hasText && (
            <Panel tint={FG.gold}>
              <Label size={10} color={FG.gold}>TU RUTINA ESCRITA → PLAN POR DÍAS</Label>
              <P size={12.5} style={{ marginTop: 2 }}>La leo día por día y la convierto en un plan: cada día carga solo lo suyo, con los pesos reales de tu gimnasio. Antes la revisas.</P>
              <Btn title="Revisar y convertir" icon="ListChecks" onPress={() => setReview(true)} style={{ marginTop: 10 }} />
            </Panel>
          )}
          <Panel><Markdown style={md2}>{routineMd?.md ?? C.L.SAMPLE_ROUTINE_MD}</Markdown></Panel>
        </>
      )}

      <Builder visible={builder} onClose={() => setBuilder(false)} />
      <PasteSheet visible={paste} onClose={() => setPaste(false)} onSaved={() => setReview(true)} />
      {hasText && <MdReview visible={review} onClose={() => setReview(false)} md={routineMd!.md} name={routineMd!.name} />}
    </View>
  );
}

/** «Armar mi rutina»: lo que el generador necesita (lo mismo que pregunta Eris por chat). */
function Builder({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const S = useForgeState()!;
  const act = useForgeAct();
  const ui = useForgeUi();
  const [days, setDays] = useState(3);
  const [minutes, setMinutes] = useState(60);
  const [goal, setGoal] = useState<R.RoutineGoal>(S.goal === 'mantener' ? 'salud' : S.goal ? 'hipertrofia' : 'salud');
  const [where, setWhere] = useState<'gym' | 'casa'>(C.gymOf(S).preset === 'casa' ? 'casa' : 'gym');
  const [care, setCare] = useState<Care[]>([]);
  const medical = wsManager.getLastConnectedPayload()?.userProfile?.medical;
  const conds: string[] = (medical?.conditions ?? []).map((c: any) => c?.id);
  const preview = useMemo(() => (visible ? R.buildRoutine(S, { days, minutes, goal, where, care, hypertension: conds.includes('hypertension'), diabetes: conds.some((c) => /diabetes/.test(c)) }) : null), [visible, days, minutes, goal, where, care.join(','), S.sessions, S.gym]);
  const cat = C.catalog(S);
  const save = async () => {
    if (!preview) return;
    await act((s) => R.setRoutinePlan(s, preview), 'rutina nueva');
    // La tabla reemplaza solo una tabla armada antes; la rutina que escribiste tú queda (la puedes volver a convertir)
    const prev = forgeStore.getRoutine()?.md ?? '';
    if (!prev.trim() || /^# Rutina de \d+ días/.test(prev.trim())) await forgeStore.setRoutine({ md: R.routineToMd(S, preview), name: preview.name });
    ui.toast(0, 'RUTINA LISTA ✓');
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="ARMAR MI RUTINA" footer={<Btn title="Guardar rutina" onPress={save} style={{ marginTop: 10 }} />}>
      <Label size={11} style={{ marginBottom: 6 }}>¿CUÁNTOS DÍAS A LA SEMANA?</Label>
      <Row gap={6}>{[2, 3, 4, 5, 6].map((n) => <Chip key={n} label={`${n}`} on={days === n} onPress={() => setDays(n)} />)}</Row>
      <Label size={11} style={{ marginTop: 12, marginBottom: 6 }}>¿CUÁNTO RATO POR SESIÓN?</Label>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>{[30, 45, 60, 75, 90].map((m) => <Chip key={m} label={`${m} min`} on={minutes === m} onPress={() => setMinutes(m)} />)}</Row>
      <Label size={11} style={{ marginTop: 12, marginBottom: 6 }}>¿PARA QUÉ?</Label>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>{(Object.keys(GOAL_NAME) as R.RoutineGoal[]).map((g) => <Chip key={g} label={GOAL_NAME[g]} on={goal === g} onPress={() => setGoal(g)} />)}</Row>
      <Label size={11} style={{ marginTop: 12, marginBottom: 6 }}>¿DÓNDE?</Label>
      <Row gap={6}><Chip label="Gimnasio" on={where === 'gym'} onPress={() => setWhere('gym')} /><Chip label="En casa" on={where === 'casa'} onPress={() => setWhere('casa')} /></Row>
      <Label size={11} style={{ marginTop: 12, marginBottom: 6 }}>¿ALGO QUE CUIDAR? (lesión o molestia)</Label>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>{CARE.map((c) => { const on = care.includes(c.id); return <Chip key={c.id} label={c.name} on={on} onPress={() => setCare(on ? care.filter((x) => x !== c.id) : [...care, c.id])} />; })}</Row>
      {preview && (
        <View style={st.preview}>
          <Label size={10} color={FG.gold} style={{ marginBottom: 4 }}>ASÍ QUEDARÍA</Label>
          {preview.days.slice(0, 3).map((d) => (
            <P key={d.id} size={12.5}><Text style={{ color: FG.white }}>{d.name}</Text>: {d.items.map((i) => cat[i.exId]?.name).join(' · ')}</P>
          ))}
          {preview.days.length > 3 && <P size={12} color={FG.dim}>(y se repite: {preview.days.length} días)</P>}
          {preview.notes.slice(0, 2).map((n, i) => <P key={i} size={11.5} color={FG.dim}>• {n}</P>)}
        </View>
      )}
    </Sheet>
  );
}

function PasteSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved?: () => void }) {
  const routine = useForgeRoutine();
  const ui = useForgeUi();
  const [name, setName] = useState(routine?.name ?? 'Mi rutina');
  const [md, setMd] = useState(routine?.md ?? '');
  const save = async () => {
    if (!md.trim()) return;
    await forgeStore.setRoutine({ md: md.trim(), name: name.trim() || 'Mi rutina' });
    ui.toast(0, 'RUTINA GUARDADA ✓');
    onClose();
    // y de una a revisarla para convertirla en plan
    setTimeout(() => onSaved?.(), 350);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="MI RUTINA EN TEXTO" footer={<Btn title="Guardar" disabled={!md.trim()} onPress={save} style={{ marginTop: 10 }} />}>
      <Label size={11}>NOMBRE</Label>
      <TextInput value={name} onChangeText={setName} style={st.input} placeholderTextColor={FG.dimmer} />
      <Label size={11} style={{ marginTop: 10 }}>TEXTO (# títulos, - listas, | tablas |)</Label>
      <TextInput value={md} onChangeText={setMd} multiline textAlignVertical="top" style={[st.input, { minHeight: 240, fontFamily: 'monospace', fontSize: 13 }]} placeholderTextColor={FG.dimmer} placeholder={'# Día A — Empuje\n- Press de banca 4x8'} />
    </Sheet>
  );
}

const md2 = {
  body: { color: '#cfc9d6', fontFamily: FONT.body, fontSize: 14.5, lineHeight: 21 },
  heading1: { color: FG.white, fontFamily: FONT.display, fontSize: 30, lineHeight: 32, marginTop: 6, marginBottom: 4 },
  heading2: { color: FG.gold, fontFamily: FONT.display, fontSize: 24, lineHeight: 26, marginTop: 10, marginBottom: 2 },
  heading3: { color: FG.red, fontFamily: FONT.display, fontSize: 20, lineHeight: 22, marginTop: 8 },
  strong: { color: FG.white, fontFamily: FONT.bodyBold },
  blockquote: { backgroundColor: '#1d190f', borderLeftColor: FG.gold, borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 4, marginVertical: 6 },
  code_inline: { backgroundColor: FG.line, color: FG.gold, borderRadius: 4, paddingHorizontal: 4 },
  table: { borderColor: FG.line2, borderWidth: 1, borderRadius: 8, marginVertical: 6 },
  th: { backgroundColor: FG.panel3, padding: 6 },
  td: { padding: 6, borderColor: FG.line2 },
  tr: { borderColor: FG.line2 },
  hr: { backgroundColor: FG.line2 },
} as any;

const st = StyleSheet.create({
  today: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: FG.gold + '44', backgroundColor: '#1d190f' },
  day: { borderWidth: 1, borderColor: FG.line, backgroundColor: FG.panel, borderRadius: 14, marginBottom: 10 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: FG.line },
  swap: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: FG.line2 },
  swapTxt: { fontFamily: FONT.bodyBold, fontSize: 12, color: FG.muted },
  preview: { marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: FG.gold + '44', backgroundColor: '#1a170e', gap: 3 },
  input: { marginTop: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.bg, color: FG.white, fontFamily: FONT.body, fontSize: 15 },
});

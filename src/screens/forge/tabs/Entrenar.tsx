// ============================================================
// Forge 2.0 — ENTRENAR: el plan del día y el registro de cada serie (peso real, asistencia, RIR), el catálogo con
// máquinas, barras, poleas y asistidos (buscar y filtrar por equipo), crear ejercicios propios y «Mi gimnasio».
// ============================================================
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import * as C from '../../../services/forge/forgeCore';
import type { ForgeExercise } from '../../../services/forge/forgeCatalog';
import { FG, FONT, fmtDay, n0 } from '../theme';
import { Icon } from '../icons';
import { Btn, Chip, H, Label, P, Panel, Row, Sheet } from '../ui';
import { useForgeState, useForgeAct } from '../useForge';
import { useForgeUi } from '../forgeUi';
import * as Str from '../../../services/forge/forgeStrength';
import * as Pr from '../../../services/forge/forgeProgress';
import * as R from '../../../services/forge/forgeRoutine';
import SetLogger, { EQ_NAME, setText, type LoggerTarget } from '../SetLogger';
import GymSheet from '../GymSheet';

const L = C.L;

const FILTERS: Array<{ id: string; label: string; test: (e: ForgeExercise) => boolean }> = [
  { id: 'todo', label: 'Todo', test: () => true },
  { id: 'casa', label: '🏠 En casa', test: (e) => !!e.home },
  { id: 'cuerpo', label: 'Peso corporal', test: (e) => ['bw', 'asist', 'banda', 'iso'].includes(e.eq) },
  { id: 'db', label: 'Mancuernas', test: (e) => e.eq === 'db' || e.eq === 'kb' },
  { id: 'barra', label: 'Barra', test: (e) => ['bb', 'ez', 'smith'].includes(e.eq) },
  { id: 'maq', label: 'Máquinas', test: (e) => ['maq', 'disc', 'asist'].includes(e.eq) },
  { id: 'polea', label: 'Poleas', test: (e) => e.eq === 'polea' },
  { id: 'cardio', label: 'Cardio', test: (e) => e.eq === 'cardio' || e.pattern === 'cardio' },
];
const GROUPS: Array<{ id: string; name: string }> = [
  { id: 'empuje', name: 'Empuje' }, { id: 'tiron', name: 'Tirón' }, { id: 'pierna', name: 'Pierna' },
  { id: 'core_ej', name: 'Core' }, { id: 'atletico', name: 'Atlético / Cardio' }, { id: 'custom', name: 'Mis ejercicios' },
];
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function Entrenar() {
  const S = useForgeState()!;
  const act = useForgeAct();
  const ui = useForgeUi();
  const [logger, setLogger] = useState<LoggerTarget | null>(null);
  const [gymOpen, setGymOpen] = useState(false);
  const [creator, setCreator] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('todo');
  const [openGrp, setOpenGrp] = useState<string | null>(null);
  const tk = L.todayKey();
  const editingPast = !!ui.viewDay && ui.viewDay !== tk;
  const day = editingPast ? ui.viewDay! : tk;
  const cat = useMemo(() => C.catalog(S), [S.customExercises]);
  const daySess = S.sessions[day] || {};
  const dayTr = (S.training || {})[day] || {};
  const todaySets = Object.values(dayTr).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
  const plan: Record<string, number> = S.plan || {};
  const planIds = Object.keys(plan).filter((id) => cat[id]);
  const extraIds = Object.keys(daySess).filter((id) => !plan[id] && cat[id]);
  const totalTarget = planIds.reduce((a, id) => a + plan[id], 0);
  const totalDone = planIds.reduce((a, id) => a + Math.min(plan[id], dayTr[id] || 0), 0);
  // El día de la rutina de hoy (forgeRoutine): objetivo de cada ejercicio con la progresión
  const routineDay = !editingPast && S.planDay && S.planDay.day === tk ? S.planDay : null;

  // «Repetir un día» (pedido del usuario, 2026-11-04): los ejercicios de ese día pasan al plan de hoy
  const [repetir, setRepetir] = useState(false);
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const dias = useMemo(() => R.trainedDays(S, 14), [S.sessions, S.customExercises]);
  const esteDia = editingPast ? R.diaEntrenado(S, day) ?? undefined : undefined;
  const hayPlanHoy = Object.keys(plan).length > 0;
  const aplicarRepetir = async (dia: string, modo: 'reemplazar' | 'sumar') => {
    const d = dias.find((x) => x.day === dia) ?? (esteDia?.day === dia ? esteDia : undefined);
    setRepetir(false);
    setEligiendo(null);
    await act((s) => R.repeatDay(s, dia, modo), 'repetir día');
    if (editingPast) ui.setViewDay(null);
    ui.toast(0, `PLAN LISTO ✓ · ${d?.exIds.length ?? ''} EJERCICIOS DEL ${(d?.label ?? '').toUpperCase()}`.replace('  ', ' '));
  };
  // Con un plan ya armado hoy, se pregunta si se reemplaza o se suma; si no, se carga directo
  const elegirDia = (dia: string) => { if (hayPlanHoy) { setRepetir(false); setEligiendo(dia); } else void aplicarRepetir(dia, 'reemplazar'); };

  const repeatLast = async (exId: string) => {
    const last = C.lastSetOf(S, exId);
    if (!last) { setLogger({ exId, day }); return; }
    const { at: _a, legacy: _l, warmup: _w, ...rest } = last;
    let tree: Str.AutoSkillResult | null = null;
    const record = Pr.setRecord(S, exId, rest, day);
    const next = await act((s) => { tree = Str.applyAutoSkills(C.logSet(s, day, exId, rest)); return tree.state; }, 'serie');
    ui.toast(next ? C.setXpGain(S, next) : 0, (tree ? Str.autoSkillToast(tree) : null) ?? record ?? `${cat[exId].name} +1 serie 💪`);
  };

  const list = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    const qq = norm(q.trim());
    return Object.values(cat).filter((e) => f.test(e) && (!qq || norm(e.name).includes(qq)));
  }, [cat, filter, q]);

  const Row1 = ({ id }: { id: string }) => {
    const ex = cat[id];
    const sets = daySess[id] || [];
    const work = sets.filter((x) => !x.warmup).length;
    const tgt = plan[id];
    const full = tgt != null && work >= tgt;
    const last = C.lastSetOf(S, id);
    return (
      <View style={[st.exCard, full && { borderColor: FG.green + '55' }]}>
        <Row>
          <View style={{ flex: 1 }}>
            <P color={FG.white} bold size={15}>{full ? '✓ ' : ''}{ex.name}</P>
            <P size={12}>{EQ_NAME[ex.eq]}{tgt != null ? ` · ${work}/${tgt} series` : ` · ${work} series`}{!sets.length && last && !routineDay?.targets?.[id] ? ` · la última: ${setText(ex, last)}` : ''}</P>
            {routineDay?.targets?.[id] ? (
              <P size={12} color={routineDay.targets[id].deload ? FG.orange : FG.gold}>Objetivo: {R.targetText(S, routineDay.targets[id])} · {routineDay.targets[id].why}</P>
            ) : null}
            {routineDay?.targets?.[id]?.note ? <P size={11.5} color={FG.dim}>{routineDay.targets[id].note}</P> : null}
          </View>
          {tgt != null && (
            <TouchableOpacity onPress={() => act((s) => C.togglePlan(s, id), 'plan')} style={st.iconBtn} accessibilityLabel="Quitar del plan"><Icon name="X" size={13} color={FG.dim} /></TouchableOpacity>
          )}
        </Row>
        {sets.length > 0 && (
          <View style={st.sets}>
            {sets.map((x, i) => (
              <TouchableOpacity key={i} onPress={() => setLogger({ exId: id, day, editIdx: i })} style={[st.setChip, x.warmup && { borderColor: FG.blue + '55' }]}>
                <Text style={st.setNum}>{x.warmup ? 'C' : String(sets.slice(0, i + 1).filter((y) => !y.warmup).length)}</Text>
                <Text style={st.setTxt}>{setText(ex, x)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Row style={{ marginTop: 10 }}>
          {tgt != null && (
            <Row gap={4} style={st.tgt}>
              <Label size={10}>SERIES</Label>
              <TouchableOpacity onPress={() => act((s) => C.setPlanTarget(s, id, -1), 'plan')} style={st.mini}><Icon name="Minus" size={11} color={FG.muted} /></TouchableOpacity>
              <Text style={{ fontFamily: FONT.display, fontSize: 18, color: FG.white }}>{tgt}</Text>
              <TouchableOpacity onPress={() => act((s) => C.setPlanTarget(s, id, 1), 'plan')} style={st.mini}><Icon name="Plus" size={11} color={FG.muted} /></TouchableOpacity>
            </Row>
          )}
          <View style={{ flex: 1 }} />
          {sets.length > 0 && <Btn title="Repetir" kind="ghost" small icon="RotateCcw" onPress={() => repeatLast(id)} />}
          <Btn title="Serie" small icon="Plus" kind="green" onPress={() => setLogger({ exId: id, day })} />
        </Row>
      </View>
    );
  };

  return (
    <View>
      {editingPast && (
        <Panel tint={FG.gold}>
          <Row>
            <Icon name="CalendarDays" size={18} color={FG.gold} />
            <View style={{ flex: 1 }}>
              <Label size={11} color={FG.gold}>REGISTRANDO DÍA PASADO</Label>
              <H size={24}>{fmtDay(ui.viewDay!)}</H>
            </View>
            <Btn title="Volver a hoy" kind="ghost" small onPress={() => ui.setViewDay(null)} />
          </Row>
        </Panel>
      )}

      <Row style={{ marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <H size={26}>{editingPast ? 'PLAN DE ESE DÍA' : 'PLAN DE HOY'}</H>
          {routineDay ? <Label size={11} color={FG.gold}>{routineDay.name.toUpperCase()} · TU RUTINA</Label> : null}
          <P size={12}>{totalTarget ? `${totalDone}/${totalTarget} series del plan · ${todaySets} en total` : `${todaySets} series ${editingPast ? 'ese día' : 'hoy'}`}</P>
        </View>
        <Btn title="Mi gimnasio" kind="ghost" small icon="Settings" onPress={() => setGymOpen(true)} />
      </Row>
      {editingPast ? (
        esteDia ? <Btn title="Repetir este entreno hoy" kind="gold" small icon="RotateCcw" onPress={() => elegirDia(day)} style={{ alignSelf: 'flex-start', marginBottom: 10 }} /> : null
      ) : dias.length > 0 ? (
        <Btn title="Repetir un día" kind="ghost" small icon="RotateCcw" onPress={() => setRepetir(true)} style={{ alignSelf: 'flex-start', marginBottom: 10 }} />
      ) : null}

      {!editingPast && ui.ready && ui.ready.level !== 'normal' && !(totalTarget && totalDone >= totalTarget) && (
        <View style={[st.hint, { borderColor: (ui.ready.level === 'liviano' ? FG.orange : FG.gold) + '55' }]}>
          <Icon name="Moon" size={18} color={ui.ready.level === 'liviano' ? FG.orange : FG.gold} />
          <P size={12.5} color={FG.text} style={{ flex: 1 }}>{ui.ready.why} {ui.ready.tip}</P>
        </View>
      )}

      {!S.gym && (
        <TouchableOpacity onPress={() => setGymOpen(true)} style={st.hint} activeOpacity={0.85}>
          <Icon name="Dumbbell" size={18} color={FG.gold} />
          <P size={12.5} color={FG.text} style={{ flex: 1 }}>¿Dónde entrenas? Dime tu gimnasio (o si es en casa) y solo te muestro pesos que existen ahí.</P>
          <Icon name="ChevronRight" size={16} color={FG.dim} />
        </TouchableOpacity>
      )}

      {planIds.length === 0 && extraIds.length === 0 ? (
        <Panel>
          <P>Tu plan está vacío. Abajo, en <Text style={{ color: FG.white }}>AGREGAR EJERCICIOS</Text>, toca <Text style={{ color: FG.gold }}>+ Plan</Text> en los que vas a hacer. Después anotas cada serie con su peso y qué tan cerca del fallo quedaste.</P>
          {!editingPast && dias.length > 0 && <Btn title={`Repetir lo del ${dias[0].label}`} kind="gold" small icon="RotateCcw" onPress={() => elegirDia(dias[0].day)} style={{ alignSelf: 'flex-start', marginTop: 10 }} />}
        </Panel>
      ) : (
        <View style={{ gap: 10, marginBottom: 14 }}>
          {planIds.map((id, k) => {
            // Rutina escrita con bloques (fase I8): «GYM (FUERZA BRUTA)», «CASA (ANILLAS Y CONTROL)»
            const block = routineDay?.targets?.[id]?.block;
            const prev = k > 0 ? routineDay?.targets?.[planIds[k - 1]]?.block : undefined;
            return (
              <React.Fragment key={id}>
                {block && block !== prev ? <Label size={10} color={FG.gold} style={{ marginTop: k ? 6 : 0 }}>{String(block).toUpperCase()}</Label> : null}
                <Row1 id={id} />
              </React.Fragment>
            );
          })}
          {extraIds.length > 0 && <Label size={11} style={{ marginTop: 4 }}>FUERA DEL PLAN</Label>}
          {extraIds.map((id) => <Row1 key={id} id={id} />)}
          {planIds.length > 0 && <Btn title="Vaciar plan" kind="ghost" small onPress={() => act((s) => C.clearPlan(s), 'plan')} style={{ alignSelf: 'flex-end' }} />}
        </View>
      )}

      <Panel>
        <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <H size={24}>AGREGAR EJERCICIOS</H>
          <Label size={11}>{Object.keys(cat).length} en el catálogo</Label>
        </Row>
        <View style={st.search}>
          <Icon name="Search" size={16} color={FG.dim} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar: press, jalón, prensa, dominada…" placeholderTextColor={FG.dimmer} style={st.searchInput} />
          {q ? <TouchableOpacity onPress={() => setQ('')}><Icon name="X" size={14} color={FG.dim} /></TouchableOpacity> : null}
        </View>
        <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          {FILTERS.map((f) => <Chip key={f.id} label={f.label} on={filter === f.id} onPress={() => setFilter(f.id)} />)}
        </Row>
        {GROUPS.map((g) => {
          const items = list.filter((e) => (g.id === 'custom' ? (e as any).custom : !(e as any).custom && e.group === g.id));
          if (!items.length) return null;
          const open = openGrp === g.id || !!q.trim();
          const setsIn = items.reduce((a, e) => a + (dayTr[e.id] || 0), 0);
          return (
            <View key={g.id} style={st.grp}>
              <TouchableOpacity onPress={() => setOpenGrp(openGrp === g.id ? null : g.id)} style={[st.grpHead, open && { backgroundColor: FG.panel3 }]}>
                <Text style={[st.grpName, g.id === 'custom' && { color: FG.gold }]}>{g.name.toUpperCase()}</Text>
                {setsIn > 0 && <Text style={st.badge}>{setsIn}</Text>}
                <View style={{ flex: 1 }} />
                <P size={12} color={FG.dim}>{items.length} ej.</P>
                <Icon name="ChevronDown" size={16} color={FG.dim} />
              </TouchableOpacity>
              {open && items.map((ex) => {
                const inPlan = !!plan[ex.id];
                const cnt = dayTr[ex.id] || 0;
                return (
                  <View key={ex.id} style={st.item}>
                    <View style={{ flex: 1 }}>
                      <P color={FG.white} bold>{ex.name}</P>
                      <P size={11.5} color={FG.dim}>{EQ_NAME[ex.eq]}{ex.range ? ` · ${ex.range[0]}–${ex.range[1]}${ex.unit === 'seg' ? ' s' : ex.unit === 'min' ? ' min' : ' reps'}` : ''}{ex.care?.length ? ` · cuida: ${ex.care.join(', ')}` : ''}{cnt ? ` · ${cnt} hoy` : ''}</P>
                    </View>
                    <Chip label={inPlan ? '✓ Plan' : '+ Plan'} on={inPlan} color={FG.gold} onPress={() => act((s) => C.togglePlan(s, ex.id), 'plan')} />
                    <TouchableOpacity onPress={() => setLogger({ exId: ex.id, day })} style={st.plus} accessibilityLabel={`Anotar serie de ${ex.name}`}><Icon name="Plus" size={16} color={FG.green} /></TouchableOpacity>
                  </View>
                );
              })}
            </View>
          );
        })}
        {!list.length && <P style={{ textAlign: 'center', marginVertical: 10 }}>No encontré «{q}». Puedes crearlo abajo.</P>}
        <Btn title="Crear mi ejercicio" kind="ghost" icon="Plus" onPress={() => setCreator(true)} style={{ marginTop: 6 }} />
      </Panel>

      <SetLogger target={logger} onClose={() => setLogger(null)} />
      <Sheet visible={repetir || !!eligiendo} onClose={() => { setRepetir(false); setEligiendo(null); }} title={eligiendo ? '¿Y TU PLAN DE HOY?' : 'REPETIR UN DÍA'}>
        {eligiendo ? (
          <View style={{ gap: 10 }}>
            <P>Hoy ya tienes {planIds.length} ejercicio{planIds.length === 1 ? '' : 's'} en el plan. ¿Qué hago con lo del {R.diaTexto(eligiendo)}?</P>
            <Btn title="Reemplazar el plan de hoy" icon="RotateCcw" onPress={() => { void aplicarRepetir(eligiendo, 'reemplazar'); }} />
            <Btn title="Sumarlo a lo que ya tengo" kind="ghost" icon="Plus" onPress={() => { void aplicarRepetir(eligiendo, 'sumar'); }} />
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <P size={12.5}>Elige un día y sus ejercicios pasan al plan de hoy, en el mismo orden, con las mismas series y los pesos que usaste. Nada se anota solo: lo vas marcando al hacerlo.</P>
            {dias.map((d) => (
              <TouchableOpacity key={d.day} onPress={() => elegirDia(d.day)} activeOpacity={0.8} style={st.diaRow} accessibilityRole="button" accessibilityLabel={`Repetir el entreno del ${d.label}`}>
                <View style={{ flex: 1 }}>
                  <P color={FG.white} bold>{d.label.charAt(0).toUpperCase() + d.label.slice(1)}</P>
                  <P size={12}>{d.exIds.length} ejercicio{d.exIds.length === 1 ? '' : 's'} · {d.sets} series</P>
                  <P size={12} color={FG.dim} numberOfLines={2}>{d.names.join(' · ')}</P>
                </View>
                <Icon name="ChevronRight" size={16} color={FG.dim} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Sheet>
      <GymSheet visible={gymOpen} onClose={() => setGymOpen(false)} />
      <ExerciseCreator visible={creator} onClose={() => setCreator(false)} />
    </View>
  );
}

/** Crear un ejercicio propio (lo del HTML, más el tipo de equipo). */
function ExerciseCreator({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const act = useForgeAct();
  const ui = useForgeUi();
  const [name, setName] = useState('');
  const [group, setGroup] = useState('tiron');
  const [eq, setEq] = useState<'db' | 'bw' | 'iso' | 'maq' | 'polea' | 'bb'>('db');
  const [intensity, setIntensity] = useState<'baja' | 'media' | 'alta'>('media');
  const [subs, setSubs] = useState<string[]>([]);
  const [hold, setHold] = useState(30);
  const catNames: Record<string, string> = { empuje: 'Empuje', tiron: 'Tirón', pierna: 'Pierna', core_ej: 'Core', atletico: 'Cardio' };
  const eqNames: Record<string, string> = { db: '🏋️ Mancuernas', bb: 'Barra', maq: 'Máquina', polea: 'Polea', bw: '🏃 Peso corporal', iso: '⏱ Isométrico' };
  const save = () => {
    const en = (L.INTENSITY as any)[intensity] || L.INTENSITY.media;
    const m: Record<string, number> = {};
    subs.forEach((sid, i) => { m[sid] = i === 0 ? 2 : 1; });
    const isHold = eq === 'iso';
    const load = isHold || eq === 'bw' ? { bw: isHold ? 0.35 : 0.6 } : { db: true };
    act((s) => C.addCustomExercise(s, {
      id: 'cx_' + Date.now(), name: name.trim(), group, eq, met: isHold ? Math.min(en.met, 5) : en.met, min: isHold ? hold / 60 : en.min,
      m, load, reps: isHold ? hold : 10, ...(isHold ? { unit: 'seg' } : {}), ...(eq === 'maq' || eq === 'polea' ? { machine: eq === 'polea' ? 'polea' : 'otra' } : {}),
    }), 'ejercicio nuevo');
    ui.toast(0, 'EJERCICIO CREADO ✓');
    setName(''); setSubs([]); onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="CREAR EJERCICIO"
      footer={<Btn title="Guardar ejercicio" disabled={!name.trim() || !subs.length} onPress={save} style={{ marginTop: 10 }} />}>
      <Label size={11}>NOMBRE</Label>
      <TextInput value={name} onChangeText={setName} placeholder="Ej. Dead hang en barra" placeholderTextColor={FG.dimmer} style={st.input} />
      <Label size={11} style={{ marginTop: 12, marginBottom: 6 }}>CATEGORÍA</Label>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>{Object.entries(catNames).map(([id, n]) => <Chip key={id} label={n} on={group === id} onPress={() => setGroup(id)} />)}</Row>
      <Label size={11} style={{ marginTop: 12, marginBottom: 6 }}>EQUIPO</Label>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>{Object.entries(eqNames).map(([id, n]) => <Chip key={id} label={n} on={eq === id} onPress={() => setEq(id as any)} />)}</Row>
      {eq === 'iso' && (
        <Row style={{ marginTop: 10 }}>
          <P>Duración objetivo:</P>
          <TextInput value={String(hold)} onChangeText={(t) => setHold(Math.max(5, parseInt(t, 10) || 5))} keyboardType="number-pad" style={[st.input, { width: 80, marginTop: 0 }]} />
          <P>segundos</P>
        </Row>
      )}
      <Label size={11} style={{ marginTop: 12, marginBottom: 6 }}>{eq === 'iso' ? 'ESFUERZO' : 'INTENSIDAD'} (para calorías)</Label>
      <Row gap={6}>{(eq === 'iso' ? [['baja', 'Ligero'], ['media', 'Moderado'], ['alta', 'Intenso']] : [['baja', 'Suave'], ['media', 'Media'], ['alta', 'Fuerte']]).map(([v, l]) => <Chip key={v} label={l} on={intensity === v} onPress={() => setIntensity(v as any)} />)}</Row>
      <Label size={11} style={{ marginTop: 12, marginBottom: 6 }}>MÚSCULOS QUE TRABAJA (elige 1-3)</Label>
      {L.MUSCLE_GROUPS.map((g: any) => (
        <View key={g.id} style={{ marginBottom: 8 }}>
          <Label size={10.5} color={FG.text}>{g.emoji} {g.name.toUpperCase()}</Label>
          <Row gap={6} style={{ flexWrap: 'wrap', marginTop: 4 }}>
            {g.subs.map((su: any) => {
              const on = subs.includes(su.id);
              return <Chip key={su.id} label={`${on ? '✓ ' : ''}${su.name}`} on={on} onPress={() => setSubs(on ? subs.filter((x) => x !== su.id) : subs.length < 3 ? [...subs, su.id] : subs)} />;
            })}
          </Row>
        </View>
      ))}
    </Sheet>
  );
}

const st = StyleSheet.create({
  diaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel },
  exCard: { borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel, borderRadius: 14, padding: 12 },
  iconBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: FG.line2, alignItems: 'center', justifyContent: 'center' },
  sets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  setChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel2, borderRadius: 10, paddingVertical: 5, paddingHorizontal: 8 },
  setNum: { fontFamily: FONT.display, fontSize: 16, color: FG.gold },
  setTxt: { fontFamily: FONT.body, fontSize: 12.5, color: FG.text },
  tgt: { borderWidth: 1, borderColor: FG.line2, borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8 },
  mini: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.line, alignItems: 'center', justifyContent: 'center' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: FG.gold + '44', backgroundColor: '#1d190f', marginBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.bg, borderRadius: 12, paddingHorizontal: 12, marginBottom: 10 },
  searchInput: { flex: 1, color: FG.white, fontFamily: FONT.body, fontSize: 15, paddingVertical: 10 },
  grp: { borderWidth: 1, borderColor: FG.line, borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  grpHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, paddingHorizontal: 12, backgroundColor: FG.panel2 },
  grpName: { fontFamily: FONT.bodyBold, fontSize: 13, letterSpacing: 1, color: FG.white },
  badge: { fontFamily: FONT.bodyBold, fontSize: 11, color: FG.green, backgroundColor: '#16241e', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: FG.line },
  plus: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: FG.green + '55', backgroundColor: '#16241e', alignItems: 'center', justifyContent: 'center' },
  input: { marginTop: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.bg, color: FG.white, fontFamily: FONT.body, fontSize: 15 },
});

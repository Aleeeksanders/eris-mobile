// ============================================================
// Forge 2.0 — anotar (o corregir) una serie: reps, el peso REAL del equipo, asistencia y RIR.
// El selector solo ofrece pesos que existen en «Mi gimnasio» (mancuernas de 7, no de 7,5 si no hay; la máquina en su
// unidad y su escalón) y parte de lo último que usaste. La primera vez en una máquina pregunta cómo viene marcada.
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import * as C from '../../services/forge/forgeCore';
import { pickerFor, nearest, stepFrom, platesText, machineCfg, BANDS, fmtLoad, MACHINE_NAMES, LB, type MachineId } from '../../services/forge/forgeCatalog';
import { FG, FONT, dec } from './theme';
import { Icon } from './icons';
import { Btn, Chip, H, Label, P, Row, Sheet, Stepper } from './ui';
import { useForgeState, useForgeAct } from './useForge';
import { useForgeUi } from './forgeUi';
import * as Str from '../../services/forge/forgeStrength';
import * as Pr from '../../services/forge/forgeProgress';

export const EQ_NAME: Record<string, string> = {
  bw: 'Peso corporal', asist: 'Máquina asistida', banda: 'Banda', db: 'Mancuernas', bb: 'Barra', ez: 'Barra Z', smith: 'Smith',
  maq: 'Máquina', disc: 'Máquina de discos', polea: 'Polea', kb: 'Kettlebell', iso: 'Isométrico', cardio: 'Cardio',
};

const RIRS: Array<{ v: number | null; label: string; hint: string }> = [
  { v: 0, label: 'Al fallo', hint: 'no salía ni una más' },
  { v: 1, label: '1', hint: 'quedaba 1' },
  { v: 2, label: '2', hint: 'quedaban 2' },
  { v: 3, label: '3+', hint: 'quedaban 3 o más' },
  { v: null, label: 'No sé', hint: '' },
];

/** «3 × 10 · 7 kg · RIR 2» de una serie */
export function setText(ex: any, set: C.FSet): string {
  const unit = ex?.unit === 'seg' ? ' s' : ex?.unit === 'min' ? ' min' : '';
  const parts = [`${set.reps}${unit || ' reps'}`];
  if (ex?.eq === 'asist' && set.assist) parts.push(`asist. ${fmtLoad(set.assist)} ${set.unit ?? 'kg'}`);
  else if (ex?.eq === 'banda' && set.band) parts.push(`banda ${(BANDS.find((b) => b.id === set.band)?.name ?? '').toLowerCase()}`);
  else if (ex?.eq === 'bw' && set.kg) parts.push(`+${fmtLoad(set.kg)} kg`);
  else if (set.kg) parts.push(`${fmtLoad(set.kg)} ${set.unit ?? 'kg'}`);
  if (set.rir != null) parts.push(set.rir === 0 ? 'al fallo' : `RIR ${set.rir === 3 ? '3+' : set.rir}`);
  if (set.warmup) parts.push('calent.');
  return parts.join(' · ');
}

export interface LoggerTarget { exId: string; day: string; editIdx?: number }

export default function SetLogger({ target, onClose }: { target: LoggerTarget | null; onClose: () => void }) {
  const S = useForgeState();
  const act = useForgeAct();
  const ui = useForgeUi();
  // Estables entre renders (si no, el selector se reiniciaría con cada dato del reloj)
  const ex = useMemo(() => (S && target ? C.catalog(S)[target.exId] ?? null : null), [target?.exId, S?.customExercises]);
  const gym = S ? C.gymOf(S) : null;
  const editing = target?.editIdx != null ? (S?.sessions[target.day]?.[target.exId] || [])[target.editIdx] : null;

  const [reps, setReps] = useState(10);
  const [load, setLoad] = useState(0);
  const [band, setBand] = useState('m');
  const [rir, setRir] = useState<number | null>(2);
  const [warmup, setWarmup] = useState(false);

  const picker = useMemo(() => (ex && gym ? pickerFor(ex, gym) : null), [ex, gym]);

  // Valores iniciales: la serie que se corrige, o lo último usado en este ejercicio
  useEffect(() => {
    if (!S || !ex || !target || !picker) return;
    // Lo que toca según la rutina (con la progresión) si hoy todavía no hay series de este ejercicio
    const t = !editing && S.planDay?.day === target.day && !(S.sessions[target.day]?.[ex.id]?.length) ? S.planDay?.targets?.[ex.id] : null;
    const fromTarget: C.FSet | null = t ? { reps: t.repMin, rir: t.rir, ...(t.kg != null ? (ex.eq === 'asist' ? { assist: t.kg } : { kg: t.kg }) : {}), ...(t.unit === 'lb' ? { unit: 'lb' as const } : {}) } : null;
    const base: C.FSet | null = editing ?? fromTarget ?? C.lastSetOf(S, ex.id) ?? null;
    setReps(base?.reps ?? (S.reps || {})[ex.id] ?? ex.reps);
    // Si la máquina cambió de unidad (kg ↔ lb), lo anterior se convierte: 56 kg son ~123 lb, no 56 lb
    const conv = (v: number | undefined) => {
      if (v == null) return v;
      const from = base?.unit === 'lb' ? 'lb' : 'kg';
      return from === picker.unit ? v : picker.unit === 'lb' ? v / LB : v * LB;
    };
    const raw = picker.kind === 'assist' ? (conv(base?.assist) ?? picker.values[Math.floor(picker.values.length / 3)] ?? 0)
      : picker.kind === 'lastre' ? (base?.kg ?? 0)
        : (conv(base?.kg) ?? picker.values[Math.min(picker.values.length - 1, Math.max(0, Math.floor(picker.values.length / 6)))] ?? 0);
    setLoad(picker.values.length ? nearest(picker.values, raw) : raw);
    setBand(base?.band ?? 'm');
    setRir(editing ? editing.rir ?? null : base?.rir ?? 2);
    setWarmup(!!editing?.warmup);
  }, [target?.exId, target?.day, target?.editIdx, picker]);

  if (!S || !ex || !target || !picker || !gym) return <Sheet visible={false} onClose={onClose}><View /></Sheet>;

  const unitLabel = ex.unit === 'seg' ? 'SEGUNDOS' : ex.unit === 'min' ? 'MINUTOS' : 'REPS';
  const repStep = ex.unit === 'seg' ? 5 : 1;
  const machine = (ex.machine ?? (ex.eq === 'asist' ? 'asistida' : undefined)) as MachineId | undefined;
  const needsMachineCheck = !!machine && (ex.eq === 'maq' || ex.eq === 'polea' || ex.eq === 'asist') && !gym.checked?.[machine];

  const draft: C.FSet = {
    reps,
    ...(picker.kind === 'kg' && load ? { kg: load } : {}),
    ...(picker.kind === 'lastre' && load ? { kg: load } : {}),
    ...(picker.kind === 'assist' ? { assist: load } : {}),
    ...(picker.kind === 'band' ? { band, assist: BANDS.find((b) => b.id === band)?.kg ?? 0 } : {}),
    ...(picker.unit === 'lb' && (picker.kind === 'kg' || picker.kind === 'assist') ? { unit: 'lb' as const } : {}),
    rir: ex.eq === 'cardio' ? null : rir,
    ...(warmup ? { warmup: true } : {}),
  };
  const eff = C.effKg(S, ex, draft);
  const lastTime = C.lastSetOf(S, ex.id, target.day);

  const save = async () => {
    if (editing && target.editIdx != null) {
      await act((s) => C.updateSet(s, target.day, ex.id, target.editIdx!, draft), 'serie corregida');
      ui.toast(0, 'SERIE CORREGIDA ✓');
    } else {
      // La serie y lo que cumple del árbol (pasos medibles: «8 dominadas estrictas», «Plancha 45 s»…)
      let tree: Str.AutoSkillResult | null = null;
      const record = Pr.setRecord(S, ex.id, draft, target.day); // contra todo lo anterior (antes de anotarla)
      const next = await act((s) => { tree = Str.applyAutoSkills(C.logSet(s, target.day, ex.id, draft)); return tree.state; }, 'serie');
      const treeMsg = tree ? Str.autoSkillToast(tree) : null;
      ui.toast(warmup || !next ? 0 : C.setXpGain(S, next), treeMsg ?? record ?? (warmup ? `${ex.name} · calentamiento` : `${ex.name} +1 serie 💪`));
    }
    onClose();
  };
  const remove = async () => {
    if (target.editIdx == null) return;
    await act((s) => C.removeSet(s, target.day, ex.id, target.editIdx!), 'serie borrada');
    ui.toast(0, 'SERIE BORRADA');
    onClose();
  };

  return (
    <Sheet visible={!!target} onClose={onClose} title={ex.name.toUpperCase()}
      footer={(
        <Row style={{ marginTop: 10 }}>
          {editing ? <Btn title="Borrar" kind="danger" icon="Trash2" onPress={remove} style={{ flex: 1 }} /> : null}
          <Btn title={editing ? 'Guardar cambios' : 'Guardar serie'} onPress={save} style={{ flex: 2 }} />
        </Row>
      )}>
      <P size={12.5} style={{ marginBottom: 10 }}>
        {EQ_NAME[ex.eq] ?? ''}{lastTime && !editing ? ` · la última vez: ${setText(ex, lastTime)}` : ''}
      </P>

      {needsMachineCheck && machine && <MachineCheck machine={machine} />}

      <View style={st.block}>
        <Stepper label={unitLabel} size="lg" value={String(reps)} onMinus={() => setReps((r) => Math.max(1, r - repStep))} onPlus={() => setReps((r) => Math.min(ex.unit === 'min' ? 300 : 999, r + repStep))} />
      </View>

      {picker.kind !== 'none' && (
        <View style={st.block}>
          <Label size={11} style={{ marginBottom: 6 }}>{picker.kind === 'assist' ? 'ASISTENCIA' : picker.kind === 'lastre' ? 'LASTRE' : picker.kind === 'band' ? 'BANDA' : 'PESO'} · {picker.hint}</Label>
          {picker.kind === 'band' ? (
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {BANDS.map((b) => <Chip key={b.id} label={`${b.name} (~${b.kg} kg)`} on={band === b.id} onPress={() => setBand(b.id)} />)}
            </Row>
          ) : (
            <WeightPicker values={picker.values} value={load} unit={picker.unit} onChange={setLoad} zeroLabel={picker.kind === 'lastre' ? 'sin lastre' : undefined} />
          )}
          {(ex.eq === 'bb' || ex.eq === 'ez' || ex.eq === 'smith') && load > 0 && (
            <P size={12.5} color={FG.gold} style={{ marginTop: 6 }}>{platesText(load, ex.eq === 'bb' ? gym.bar : ex.eq === 'ez' ? gym.ez : gym.smith, gym.plates) || 'Ese total no sale exacto con tus discos'}</P>
          )}
          {(ex.eq === 'asist' || ex.eq === 'banda' || (ex.eq === 'bw' && load > 0)) && (
            <P size={12.5} color={FG.muted} style={{ marginTop: 6 }}>Mueves ~{dec(eff)} kg ({ex.eq === 'bw' ? 'tu peso + lastre' : 'tu peso menos la ayuda'}).</P>
          )}
          {picker.unit === 'lb' && load > 0 && <P size={12} color={FG.dim} style={{ marginTop: 4 }}>≈ {dec(eff)} kg</P>}
        </View>
      )}

      {ex.eq !== 'cardio' && (
        <View style={st.block}>
          <Label size={11} style={{ marginBottom: 6 }}>¿CUÁNTAS TE QUEDABAN? (RIR)</Label>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {RIRS.map((r) => <Chip key={String(r.v)} label={r.label} on={rir === r.v} color={r.v === 0 ? FG.red : r.v == null ? FG.dim : FG.gold} onPress={() => setRir(r.v)} />)}
          </Row>
          <P size={12} color={FG.dim} style={{ marginTop: 6 }}>{rir == null ? 'Sin dato: no cuenta para estimar tu fuerza.' : RIRS.find((x) => x.v === rir)?.hint}. Sirve para calcular tu fuerza y lo que gastaste.</P>
        </View>
      )}

      <TouchableOpacity onPress={() => setWarmup((w) => !w)} style={[st.toggle, warmup && { borderColor: FG.blue, backgroundColor: FG.blue + '18' }]} accessibilityRole="checkbox" accessibilityState={{ checked: warmup }}>
        <View style={[st.box, warmup && { backgroundColor: FG.blue, borderColor: FG.blue }]}>{warmup && <Icon name="Check" size={13} color="#0c0b0e" strokeWidth={3} />}</View>
        <P color={FG.text}>Serie de calentamiento (no cuenta como serie de trabajo)</P>
      </TouchableOpacity>
    </Sheet>
  );
}

/** Rueda de pesos reales: chips alrededor del actual y − / + de a un escalón. */
export function WeightPicker({ values, value, unit, onChange, zeroLabel }: { values: number[]; value: number; unit: string; onChange: (v: number) => void; zeroLabel?: string }) {
  const ref = useRef<ScrollView>(null);
  const idx = Math.max(0, values.findIndex((v) => Math.abs(v - value) < 1e-6));
  // El peso elegido siempre a la vista (al abrir y al cambiarlo con − / +)
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => ref.current?.scrollTo({ x: Math.max(0, idx * 62 - (w || 300) / 2 + 28), animated: true }), 80); return () => clearTimeout(t); }, [idx, values.length, w]);
  if (!values.length) return <P>No hay pesos configurados: revisa «Mi gimnasio».</P>;
  return (
    <View>
      <Row style={{ justifyContent: 'center', marginBottom: 8 }} gap={14}>
        <TouchableOpacity style={st.stepBig} onPress={() => onChange(stepFrom(values, value, -1))} accessibilityLabel="Bajar un escalón"><Icon name="Minus" size={20} color={FG.muted} /></TouchableOpacity>
        <View style={{ alignItems: 'center', minWidth: 120 }}>
          <H size={44} color={FG.white} style={{ lineHeight: 44 }}>{value === 0 && zeroLabel ? '0' : fmtLoad(value)}</H>
          <Label size={11}>{value === 0 && zeroLabel ? zeroLabel.toUpperCase() : unit.toUpperCase()}</Label>
        </View>
        <TouchableOpacity style={st.stepBig} onPress={() => onChange(stepFrom(values, value, 1))} accessibilityLabel="Subir un escalón"><Icon name="Plus" size={20} color={FG.muted} /></TouchableOpacity>
      </Row>
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {values.map((v) => {
          const on = Math.abs(v - value) < 1e-6;
          return (
            <TouchableOpacity key={v} onPress={() => onChange(v)} style={[st.w, on && { borderColor: FG.red, backgroundColor: FG.red + '26' }]}>
              <Text style={{ fontFamily: FONT.display, fontSize: 20, color: on ? FG.white : FG.muted }}>{fmtLoad(v)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** La primera vez en una máquina: ¿en qué viene marcada y de cuánto en cuánto sube? */
function MachineCheck({ machine }: { machine: MachineId }) {
  const S = useForgeState()!;
  const act = useForgeAct();
  const gym = C.gymOf(S);
  const cfg = machineCfg(gym, machine);
  const steps = cfg.unit === 'lb' ? [5, 10, 15, 20] : [1, 2.5, 5, 10];
  const set = (patch: Partial<typeof cfg>, done = false) => act((s) => {
    const g = C.gymOf(s);
    const cur = machineCfg(g, machine);
    let next = { ...cur, ...patch };
    if (patch.unit && patch.unit !== cur.unit) next = patch.unit === 'lb' ? { ...next, step: 10, min: 10, max: Math.round(cur.max / 0.4536 / 10) * 10 } : { ...next, step: 5, min: 5, max: Math.round(cur.max * 0.4536 / 5) * 5 };
    return C.setGym(s, { ...g, machines: { ...g.machines, [machine]: next }, checked: done ? { ...(g.checked || {}), [machine]: true } : g.checked });
  }, 'mi gimnasio');
  return (
    <View style={[st.block, { borderColor: FG.gold + '55', backgroundColor: '#1d190f' }]}>
      <Label size={11} color={FG.gold} style={{ marginBottom: 4 }}>PRIMERA VEZ EN «{MACHINE_NAMES[machine].toUpperCase()}»</Label>
      <P size={12.5} style={{ marginBottom: 8 }}>¿Cómo viene marcada? Así el selector muestra solo los pesos que tiene.</P>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <Chip label="kg" on={cfg.unit === 'kg'} onPress={() => set({ unit: 'kg' })} color={FG.gold} />
        <Chip label="lb (libras)" on={cfg.unit === 'lb'} onPress={() => set({ unit: 'lb' })} color={FG.gold} />
      </Row>
      <Label size={10} style={{ marginTop: 10, marginBottom: 6 }}>SUBE DE A</Label>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {steps.map((sv) => <Chip key={sv} label={`${fmtLoad(sv)} ${cfg.unit}`} on={cfg.step === sv} onPress={() => set({ step: sv, min: sv })} color={FG.gold} />)}
        <Chip label="+ plaquita de ½" on={!!cfg.half} onPress={() => set({ half: !cfg.half })} color={FG.gold} />
      </Row>
      <Btn title="Listo, así es" kind="gold" small onPress={() => set({}, true)} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
    </View>
  );
}

const st = StyleSheet.create({
  block: { borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel2, borderRadius: 14, padding: 12, marginBottom: 10 },
  stepBig: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.line, alignItems: 'center', justifyContent: 'center' },
  w: { width: 56, paddingVertical: 8, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: FG.line2 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: FG.line3, alignItems: 'center', justifyContent: 'center' },
});

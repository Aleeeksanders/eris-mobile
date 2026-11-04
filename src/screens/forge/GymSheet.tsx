// ============================================================
// Forge 2.0 — «Mi gimnasio»: qué pesos existen de verdad donde entrenas.
// Presets por cadena (valores típicos, se ajustan), juego de mancuernas, barras, discos, kettlebells y cada máquina
// con su unidad (kg o lb) y su escalón. Con esto el selector de cada serie muestra solo pesos reales.
// ============================================================
import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import * as C from '../../services/forge/forgeCore';
import { GYM_PRESETS, DB_SETS, defaultGym, dbWeights, machineCfg, MACHINE_NAMES, fmtLoad, type Gym, type MachineId } from '../../services/forge/forgeCatalog';
import { FG } from './theme';
import { Icon } from './icons';
import { Btn, Chip, H, Label, P, Row, Sheet, Stepper } from './ui';
import { useForgeState, useForgeAct } from './useForge';

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const KBS = [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32];
const HOME_DB = [1, 2, 3, 4, 5, 6, 7, 7.5, 8, 9, 10, 12, 12.5, 14, 15, 16, 17.5, 18, 20, 22.5, 24, 25, 30];

export default function GymSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const S = useForgeState();
  const act = useForgeAct();
  const [openM, setOpenM] = useState<MachineId | null>(null);
  if (!S) return null;
  const g = C.gymOf(S);
  const save = (patch: Partial<Gym>) => act((s) => C.setGym(s, { ...C.gymOf(s), ...patch }), 'mi gimnasio');
  const usedMachines = Object.keys(MACHINE_NAMES) as MachineId[];
  const dbs = dbWeights(g);

  return (
    <Sheet visible={visible} onClose={onClose} title="MI GIMNASIO">
      <P size={12.5} style={{ marginBottom: 10 }}>Para que al anotar una serie solo aparezcan pesos que existen donde entrenas. Lo típico ya viene puesto: cambia solo lo que sea distinto.</P>

      <Label size={11} style={{ marginBottom: 6 }}>¿DÓNDE ENTRENAS?</Label>
      <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 6 }}>
        {GYM_PRESETS.map((p) => (
          <Chip key={p.id} label={p.name} on={g.preset === p.id} onPress={() => {
            if (p.id === g.preset) return;
            // Cambiar de lugar no borra lo que ya revisaste de cada máquina
            const base = defaultGym(p.id);
            save({ ...base, machines: g.machines, checked: g.checked, dbList: p.id === 'casa' ? (g.dbList ?? []) : g.dbList });
          }} />
        ))}
      </Row>
      <P size={11.5} color={FG.dim} style={{ marginBottom: 14 }}>{GYM_PRESETS.find((p) => p.id === g.preset)?.note}</P>

      <Label size={11} style={{ marginBottom: 6 }}>MANCUERNAS</Label>
      <View style={{ gap: 6, marginBottom: 8 }}>
        {DB_SETS.map((d) => (
          <TouchableOpacity key={d.id} onPress={() => save({ dbSet: d.id })} style={[st.opt, g.dbSet === d.id && st.optOn]}>
            <View style={[st.radio, g.dbSet === d.id && { borderColor: FG.red, backgroundColor: FG.red }]} />
            <P color={g.dbSet === d.id ? FG.white : FG.muted}>{d.name}</P>
          </TouchableOpacity>
        ))}
      </View>
      {g.dbSet === 'propias' ? (
        <>
          <P size={12} style={{ marginBottom: 6 }}>Toca las que tienes:</P>
          <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 14 }}>
            {HOME_DB.map((k) => {
              const on = (g.dbList ?? []).includes(k);
              return <Chip key={k} label={`${fmtLoad(k)} kg`} on={on} onPress={() => save({ dbList: on ? (g.dbList ?? []).filter((x) => x !== k) : [...(g.dbList ?? []), k].sort((a, b) => a - b) })} />;
            })}
          </Row>
        </>
      ) : (
        <P size={12} color={FG.dim} style={{ marginBottom: 14 }}>{dbs.slice(0, 14).map(fmtLoad).join(' · ')}{dbs.length > 14 ? ` … ${fmtLoad(dbs[dbs.length - 1])} kg` : ' kg'}</P>
      )}

      {g.preset !== 'casa' || g.plates.length ? (
        <>
          <Label size={11} style={{ marginBottom: 8 }}>BARRAS</Label>
          <Row style={{ justifyContent: 'space-around', marginBottom: 14 }}>
            <Stepper size="sm" label="OLÍMPICA" value={fmtLoad(g.bar)} onMinus={() => save({ bar: Math.max(5, g.bar - 2.5) })} onPlus={() => save({ bar: Math.min(25, g.bar + 2.5) })} />
            <Stepper size="sm" label="BARRA Z" value={fmtLoad(g.ez)} onMinus={() => save({ ez: Math.max(5, g.ez - 2.5) })} onPlus={() => save({ ez: Math.min(20, g.ez + 2.5) })} />
            <Stepper size="sm" label="SMITH" value={fmtLoad(g.smith)} onMinus={() => save({ smith: Math.max(0, g.smith - 2.5) })} onPlus={() => save({ smith: Math.min(30, g.smith + 2.5) })} />
          </Row>
          <P size={11.5} color={FG.dim} style={{ marginTop: -8, marginBottom: 12 }}>La barra Smith suele pesar menos que una olímpica (10–20 kg): si no sabes, pregunta en tu gimnasio.</P>
        </>
      ) : null}

      <Label size={11} style={{ marginBottom: 6 }}>DISCOS QUE HAY</Label>
      <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 14 }}>
        {PLATES.map((p) => {
          const on = g.plates.includes(p);
          return <Chip key={p} label={`${fmtLoad(p)} kg`} on={on} onPress={() => save({ plates: on ? g.plates.filter((x) => x !== p) : [...g.plates, p].sort((a, b) => b - a) })} />;
        })}
      </Row>

      <Label size={11} style={{ marginBottom: 6 }}>KETTLEBELLS</Label>
      <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 14 }}>
        {KBS.map((k) => {
          const on = g.kb.includes(k);
          return <Chip key={k} label={`${k} kg`} on={on} onPress={() => save({ kb: on ? g.kb.filter((x) => x !== k) : [...g.kb, k].sort((a, b) => a - b) })} />;
        })}
      </Row>

      {g.preset !== 'casa' && (
        <>
          <Label size={11} style={{ marginBottom: 4 }}>MÁQUINAS</Label>
          <P size={12} style={{ marginBottom: 8 }}>Cada una con lo que marca su placa. La primera vez que anotes en una, te pregunto.</P>
          {usedMachines.map((id) => {
            const c = machineCfg(g, id);
            const open = openM === id;
            const upd = (patch: Partial<typeof c>) => save({ machines: { ...g.machines, [id]: { ...c, ...patch } }, checked: { ...(g.checked || {}), [id]: true } });
            return (
              <View key={id} style={st.machine}>
                <TouchableOpacity onPress={() => setOpenM(open ? null : id)} style={st.machineHead}>
                  <P color={FG.text} bold style={{ flex: 1 }}>{MACHINE_NAMES[id]}</P>
                  <P size={12} color={g.checked?.[id] ? FG.green : FG.dim}>{c.unit} · de a {fmtLoad(c.step)}{c.half ? ' (+½)' : ''}{g.checked?.[id] ? ' ✓' : ''}</P>
                  <Icon name="ChevronDown" size={16} color={FG.dim} />
                </TouchableOpacity>
                {open && (
                  <View style={{ padding: 10, gap: 8 }}>
                    <Row gap={6}>
                      <Chip label="kg" on={c.unit === 'kg'} onPress={() => upd({ unit: 'kg', step: 5, min: 5, max: Math.round(c.max * (c.unit === 'lb' ? 0.4536 : 1) / 5) * 5 || 100 })} />
                      <Chip label="lb" on={c.unit === 'lb'} onPress={() => upd({ unit: 'lb', step: 10, min: 10, max: Math.round(c.max / (c.unit === 'kg' ? 0.4536 : 1) / 10) * 10 || 200 })} />
                      <Chip label="+ plaquita ½" on={!!c.half} onPress={() => upd({ half: !c.half })} />
                    </Row>
                    <Row style={{ justifyContent: 'space-around' }}>
                      <Stepper size="sm" label="ESCALÓN" value={fmtLoad(c.step)} onMinus={() => upd({ step: Math.max(1, c.step - (c.step > 5 ? 5 : 1.25)) })} onPlus={() => upd({ step: c.step + (c.step >= 5 ? 5 : 1.25) })} />
                      <Stepper size="sm" label="MÍNIMO" value={fmtLoad(c.min)} onMinus={() => upd({ min: Math.max(0, c.min - c.step) })} onPlus={() => upd({ min: Math.min(c.max, c.min + c.step) })} />
                      <Stepper size="sm" label="MÁXIMO" value={fmtLoad(c.max)} onMinus={() => upd({ max: Math.max(c.min, c.max - c.step) })} onPlus={() => upd({ max: c.max + c.step })} />
                    </Row>
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}
      <Btn title="Listo" onPress={onClose} style={{ marginTop: 14 }} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel2 },
  optOn: { borderColor: FG.red + '88' },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: FG.line3 },
  machine: { borderWidth: 1, borderColor: FG.line2, borderRadius: 12, marginBottom: 6, backgroundColor: FG.panel2 },
  machineHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
});

// ============================================================
// Forge — revisar tu rutina escrita antes de convertirla en plan (fase I8, 2026-10-23)
//
// Lo que leyó forgeMdRoutine, línea por línea: verde = el ejercicio del catálogo, ámbar = «¿es este?» (una variante: lo
// tomé como el más parecido), azul = nuevo (se crea como ejercicio propio al guardar), gris = no se incluye. Tocar una
// línea muestra las opciones. Nada se crea ni se guarda hasta «Guardar plan». Tu texto no se toca.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as C from '../../services/forge/forgeCore';
import * as M from '../../services/forge/forgeMdRoutine';
import { FG, FONT } from './theme';
import { Btn, Chip, Label, P, Row, Sheet } from './ui';
import { useForgeState, useForgeAct } from './useForge';
import { useForgeUi } from './forgeUi';

const KIND_COLOR = { exacto: FG.green, probable: FG.orange, propio: FG.blue, quitar: FG.dimmer } as const;

export default function MdReview({ visible, onClose, md, name }: { visible: boolean; onClose: () => void; md: string; name?: string }) {
  const S = useForgeState()!;
  const act = useForgeAct();
  const ui = useForgeUi();
  // Se lee siempre (es corto): así la hoja no queda vacía mientras se cierra. Lo elegido parte de cero al abrirla.
  const parsed = useMemo(() => M.parseRoutineMd(S, md), [md, S.customExercises]);
  const [choices, setChoices] = useState<Record<string, M.MdChoice>>({});
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (visible) { setChoices(M.defaultChoices(parsed)); setOpen(null); } }, [visible]);
  const cat = C.catalog(S);
  const sum = parsed ? M.mdSummary(parsed, choices) : null;

  const save = async () => {
    if (!parsed) return;
    const { routine, newExercises } = M.mdToRoutine(S, parsed, choices, { name });
    if (!routine.days.length) { ui.toast(0, 'NO QUEDÓ NINGÚN DÍA CON EJERCICIOS'); return; }
    await act((s) => M.applyMdRoutine(s, routine, newExercises), 'tu rutina como plan');
    ui.toast(0, newExercises.length ? `PLAN LISTO ✓ · ${newExercises.length} EJERCICIOS NUEVOS` : 'PLAN LISTO ✓');
    onClose();
  };

  const kindOf = (l: M.MdLine): keyof typeof KIND_COLOR => {
    const c = choices[l.key] ?? 'propio';
    if (c === 'quitar') return 'quitar';
    if (c === 'propio') return 'propio';
    return c === l.match.exId && l.match.confidence === 'probable' ? 'probable' : 'exacto';
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="REVISAR MI RUTINA"
      footer={<Btn title={parsed?.days.length ? `Guardar plan (${parsed.days.length} días)` : 'Guardar plan'} icon="Check" disabled={!parsed?.days.length} onPress={save} style={{ marginTop: 10 }} />}>
      {!parsed || !parsed.days.length ? (
        <P>No encontré días con ejercicios. Escribe cada día como «Día 1: Empuje» y debajo los ejercicios con sus series («Press de banca: 4 series x 6-8»).</P>
      ) : (
        <>
          <P size={12.5}>Así leí tu rutina. Toca un ejercicio para cambiarlo. Nada se guarda hasta que toques «Guardar plan», y tu texto queda tal cual.</P>
          {sum && (
            <Row gap={6} style={{ flexWrap: 'wrap', marginTop: 8 }}>
              <Pill color={FG.green} text={`${sum.exactos} reconocidos`} />
              {sum.probables > 0 && <Pill color={FG.orange} text={`${sum.probables} por confirmar`} />}
              {sum.propios > 0 && <Pill color={FG.blue} text={`${sum.propios} nuevos`} />}
              {sum.quitados > 0 && <Pill color={FG.dim} text={`${sum.quitados} fuera`} />}
            </Row>
          )}
          {parsed.days.map((d) => {
            const usedBy = new Map<string, string>();
            for (const l of d.lines) { const c = choices[l.key]; if (c && c !== 'propio' && c !== 'quitar') usedBy.set(c, l.key); }
            let lastBlock: string | undefined;
            return (
              <View key={d.id} style={st.day}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={st.dayName}>{d.name ? `Día ${d.label} — ${d.name}` : `Día ${d.label}`}</Text>
                  {d.weekday != null && <Text style={st.wd}>{M.WEEKDAY_NAME[d.weekday].toUpperCase()}</Text>}
                </Row>
                {d.warmup && <P size={11.5} color={FG.dim}>Calentamiento: {d.warmup}</P>}
                {d.lines.map((l) => {
                  const k = kindOf(l);
                  const c = choices[l.key] ?? 'propio';
                  const target = c === 'quitar' ? 'No se incluye' : c === 'propio' ? `Nuevo: ${M.customName(l.name)}` : cat[c]?.name ?? c;
                  const showBlock = l.block && l.block !== lastBlock;
                  lastBlock = l.block;
                  const isOpen = open === l.key;
                  const opts = [...new Set([...l.match.options, ...(l.match.exId ? [l.match.exId] : [])])].filter((id) => cat[id]);
                  return (
                    <View key={l.key}>
                      {showBlock && <Label size={10} color={FG.gold} style={{ marginTop: 8 }}>{l.block!.toUpperCase()}</Label>}
                      <TouchableOpacity onPress={() => setOpen(isOpen ? null : l.key)} style={[st.line, isOpen && { borderColor: KIND_COLOR[k] + '88' }]} accessibilityLabel={`${l.name}: ${target}`}>
                        <View style={[st.dot, { backgroundColor: KIND_COLOR[k] }]} />
                        <View style={{ flex: 1 }}>
                          <P size={11.5} color={FG.dim} numberOfLines={1}>{M.stripDeco(l.name)}</P>
                          <P size={13.5} color={k === 'quitar' ? FG.dim : FG.white} bold>
                            {k === 'probable' ? '¿' : ''}{target}{k === 'probable' ? '?' : ''}
                          </P>
                          <P size={11.5} color={FG.gold}>{M.lineScheme(l)}{l.optional ? ' · opcional' : ''}{l.kg.length ? ` · ${l.kg.map((h) => `${String(h.min).replace('.', ',')}${h.max !== h.min ? `–${String(h.max).replace('.', ',')}` : ''} kg`).join(' / ')}` : ''}</P>
                        </View>
                      </TouchableOpacity>
                      {isOpen && (
                        <View style={st.opts}>
                          {opts.map((id) => {
                            const taken = usedBy.get(id) && usedBy.get(id) !== l.key;
                            return <Chip key={id} label={cat[id].name} on={c === id} disabled={!!taken} color={FG.green} onPress={() => { setChoices({ ...choices, [l.key]: id }); setOpen(null); }} />;
                          })}
                          <Chip label={`Crear «${M.customName(l.name)}»`} on={c === 'propio'} color={FG.blue} onPress={() => { setChoices({ ...choices, [l.key]: 'propio' }); setOpen(null); }} />
                          <Chip label="No incluir" on={c === 'quitar'} color={FG.dim} onPress={() => { setChoices({ ...choices, [l.key]: 'quitar' }); setOpen(null); }} />
                          {opts.some((id) => usedBy.get(id) && usedBy.get(id) !== l.key) && <P size={11} color={FG.dim}>Un ejercicio va una sola vez por día.</P>}
                        </View>
                      )}
                    </View>
                  );
                })}
                {d.notes.map((n, i) => <P key={i} size={11.5} color={FG.dim}>• {n}</P>)}
              </View>
            );
          })}
          {parsed.rules.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Label size={10} style={{ marginBottom: 4 }}>TUS REGLAS (QUEDAN EN «CÓMO USARLA»)</Label>
              {parsed.rules.slice(0, 8).map((r, i) => <P key={i} size={11.5}>• {r}</P>)}
            </View>
          )}
          <P size={11} color={FG.dim} style={{ marginTop: 8 }}>Los pesos parten desde abajo de lo que dice tu rutina, con los pesos reales de tu gimnasio, y suben con la progresión. Los ejercicios nuevos llevan sus músculos por su nombre: después puedes corregirlos.</P>
        </>
      )}
    </Sheet>
  );
}

function Pill({ color, text }: { color: string; text: string }) {
  return (
    <View style={[st.pill, { borderColor: color + '66', backgroundColor: color + '18' }]}>
      <View style={[st.dot, { backgroundColor: color, marginTop: 0 }]} />
      <Text style={[st.pillTxt, { color }]}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  day: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: FG.line, gap: 2 },
  dayName: { fontFamily: FONT.display, fontSize: 21, color: FG.white, flex: 1 },
  wd: { fontFamily: FONT.bodyBold, fontSize: 11, letterSpacing: 1, color: FG.blue },
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 8, paddingHorizontal: 10, marginTop: 6, borderRadius: 10, borderWidth: 1, borderColor: FG.line, backgroundColor: FG.panel2 },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 8, paddingLeft: 19 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1 },
  pillTxt: { fontFamily: FONT.bodyBold, fontSize: 12 },
});

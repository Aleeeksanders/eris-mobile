// ============================================================
// Eris Mobile — anotar sueño con dos horas, sin fechas (2026-11-07)
//
// El usuario perdió el cargador del reloj y anota todas las noches. Antes: «Corregir» → «Anotar a mano», de a 15 min o 1 h y
// eligiendo el día: de 15 a 38 toques para un 17:30–23:50. Ahora dice las dos horas (o «Recién») y el día lo deduce Eris: la última
// vez que pasaron esas horas. Lo usan la pantalla de Sueño e Inicio.
// También aquí: «¿Cómo sigues?», tras un sueño largo a hora rara (sleepCore.wakeIsOdd).
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { T, R } from '../../config/design';
import { resolveSleepTimes, parseClock, clockOfMin, sleepRangeText, wakeQuestionText, WAKE_OPTIONS, type WakeDecision } from '../../services/sleep/sleepCore';
import { addManualSleep, saveWakeDecision } from '../../services/sleep/sleepStore';

const NIGHT = '#a78bfa';
const MAX_DIAS_ATRAS = 14;
const minOf = (ms: number) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
const de5 = (m: number) => Math.floor(m / 5) * 5;
const cero = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const keyToMs = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

function TimeField({ label, value, onChange, right }: { label: string; value: number; onChange: (m: number) => void; right?: React.ReactNode }) {
  const [raw, setRaw] = useState(clockOfMin(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setRaw(clockOfMin(value)); }, [value, editing]);
  const step = (d: number) => onChange(((value + d) % 1440 + 1440) % 1440);
  return (
    <View style={{ gap: 6 }}>
      <View style={st.rowBetween}>
        <Text style={st.label}>{label}</Text>
        {right}
      </View>
      <View style={st.field}>
        <Pressable onPress={() => step(-60)} hitSlop={6} accessibilityLabel={`${label}: una hora menos`} style={st.stepBtn}><Text style={st.stepTxt}>−1h</Text></Pressable>
        <Pressable onPress={() => step(-5)} hitSlop={6} accessibilityLabel={`${label}: 5 minutos menos`} style={st.stepBtn}><Text style={st.stepTxt}>−5</Text></Pressable>
        <TextInput
          value={raw} accessibilityLabel={label} keyboardType="number-pad" maxLength={5} selectTextOnFocus style={st.input}
          onFocus={() => setEditing(true)}
          onBlur={() => { setEditing(false); setRaw(clockOfMin(value)); }}
          onChangeText={(t) => { setRaw(t); const m = parseClock(t); if (m != null) onChange(m); }}
        />
        <Pressable onPress={() => step(5)} hitSlop={6} accessibilityLabel={`${label}: 5 minutos más`} style={st.stepBtn}><Text style={st.stepTxt}>+5</Text></Pressable>
        <Pressable onPress={() => step(60)} hitSlop={6} accessibilityLabel={`${label}: una hora más`} style={st.stepBtn}><Text style={st.stepTxt}>+1h</Text></Pressable>
      </View>
    </View>
  );
}

/**
 * El formulario. `presetNow`: recién despertó (Inicio). `targetDay`: el día que se está mirando en la pantalla de Sueño, para que
 * parta en ese día si es uno pasado. `usualOnset` y `need` dan la hora de dormirse con que parte.
 */
export function SleepEntryForm({ usualOnset, usualWake, need, targetDay, presetNow, onSaved, onCancel }: {
  usualOnset?: number | null; usualWake?: number | null; need?: number | null; targetDay?: string; presetNow?: boolean;
  onSaved: (r: { start: number; end: number }) => void; onCancel?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const hoy = !targetDay || keyToMs(targetDay) >= cero(Date.now());
  const [endMin, setEndMin] = useState(() => (presetNow ? minOf(Date.now()) : hoy ? de5(minOf(Date.now())) : Math.round((typeof usualWake === 'number' ? usualWake : 7.5) * 60)));
  const [startMin, setStartMin] = useState(() => {
    // Tu hora de siempre, si con ese despertar da un sueño creíble (a las 00:40, «me dormí a las 00:30» no lo es)
    if (typeof usualOnset === 'number') {
      const m = de5(Math.round(usualOnset * 60) % 1440);
      const dura = (endMin - m + 1440) % 1440;
      if (dura >= 180 && dura <= 12 * 60) return m;
    }
    return de5((endMin - Math.round((need ?? 7.5) * 60) + 2880) % 1440);
  });
  const [shift, setShift] = useState(() => {
    if (hoy) return 0;
    const r = resolveSleepTimes(startMin, endMin, Date.now());
    return r ? Math.max(0, Math.round((cero(r.end) - keyToMs(targetDay!)) / 86_400_000)) : 0;
  });
  const r = useMemo(() => resolveSleepTimes(startMin, endMin, now, shift), [startMin, endMin, now, shift]);
  const [saving, setSaving] = useState(false);

  const recien = () => { const t = Date.now(); setNow(t); setEndMin(minOf(t)); setShift(0); };
  const save = async () => {
    if (!r || saving) return;
    setSaving(true);
    try { await addManualSleep(r.start, r.end); onSaved(r); } finally { setSaving(false); }
  };

  return (
    <View style={{ gap: 12 }}>
      <TimeField label="Me dormí" value={startMin} onChange={setStartMin} />
      <TimeField label="Desperté" value={endMin} onChange={(m) => { setEndMin(m); setNow(Date.now()); }}
        right={<Pressable onPress={recien} hitSlop={8} accessibilityRole="button" style={st.chip}><Text style={st.chipTxt}>Recién</Text></Pressable>} />
      <View style={st.preview}>
        <Pressable disabled={shift >= MAX_DIAS_ATRAS} onPress={() => setShift((s) => s + 1)} hitSlop={10} accessibilityLabel="Un día antes"><Text style={[st.arrow, shift >= MAX_DIAS_ATRAS && st.off]}>‹</Text></Pressable>
        <Text style={st.previewTxt}>{r ? sleepRangeText(r.start, r.end, Date.now()) : 'Revisa las horas: tiene que ser entre 15 min y 16 h.'}</Text>
        <Pressable disabled={shift <= 0} onPress={() => setShift((s) => Math.max(0, s - 1))} hitSlop={10} accessibilityLabel="Un día después"><Text style={[st.arrow, shift <= 0 && st.off]}>›</Text></Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {onCancel && <Pressable onPress={onCancel} style={st.btnGhost} accessibilityRole="button"><Text style={st.btnGhostTxt}>Cancelar</Text></Pressable>}
        <Pressable disabled={!r || saving} onPress={save} style={[st.btnPrimary, (!r || saving) && { opacity: 0.4 }]} accessibilityRole="button"><Text style={st.btnPrimaryTxt}>Guardar</Text></Pressable>
      </View>
    </View>
  );
}

/** «Despertaste a las 23:50. ¿Cómo sigues?» */
export function WakeQuestion({ endIso, onAnswered }: { endIso: string; onAnswered?: (c: WakeDecision) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={st.q}>{wakeQuestionText(endIso)}</Text>
      <Text style={st.hint}>Si vuelves a dormir, tu día sigue igual. Si partes ahora, tus comidas, tu agua y tus avisos se cuentan desde ese despertar.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {WAKE_OPTIONS.map((o) => (
          <Pressable key={o.id} onPress={async () => { await saveWakeDecision(endIso, o.id); onAnswered?.(o.id); }} style={o.id === 'partir' ? st.optMain : st.opt} accessibilityRole="button">
            <Text style={o.id === 'partir' ? st.optMainTxt : st.optTxt}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: T.textLight, fontSize: 13, fontWeight: '700' },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  stepBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: R.md, borderWidth: 1, borderColor: `${NIGHT}33` },
  stepTxt: { color: NIGHT, fontSize: 13, fontWeight: '800' },
  input: { flex: 1, minWidth: 0, color: T.text, fontSize: 26, fontWeight: '800', textAlign: 'center', paddingVertical: 4, fontVariant: ['tabular-nums'] },
  chip: { borderWidth: 1, borderColor: NIGHT, borderRadius: R.full, paddingHorizontal: 14, paddingVertical: 7 },
  chipTxt: { color: NIGHT, fontSize: 13, fontWeight: '800' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  previewTxt: { flex: 1, color: T.text, fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 20 },
  arrow: { color: NIGHT, fontSize: 26, fontWeight: '700', paddingHorizontal: 8 },
  off: { opacity: 0.25 },
  btnPrimary: { flex: 1, backgroundColor: NIGHT, borderRadius: R.full, paddingVertical: 12, alignItems: 'center' },
  btnPrimaryTxt: { color: '#0b0a12', fontSize: 14, fontWeight: '900' },
  btnGhost: { paddingHorizontal: 14, paddingVertical: 12 },
  btnGhostTxt: { color: T.textMuted, fontSize: 13, fontWeight: '700' },
  q: { color: T.text, fontSize: 16, fontWeight: '800' },
  hint: { color: T.textLight, fontSize: 13, lineHeight: 18 },
  opt: { borderWidth: 1, borderColor: `${NIGHT}66`, borderRadius: R.full, paddingHorizontal: 14, paddingVertical: 10 },
  optTxt: { color: NIGHT, fontSize: 13, fontWeight: '800' },
  optMain: { backgroundColor: NIGHT, borderRadius: R.full, paddingHorizontal: 14, paddingVertical: 10 },
  optMainTxt: { color: '#0b0a12', fontSize: 13, fontWeight: '900' },
});

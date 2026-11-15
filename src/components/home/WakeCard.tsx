// ============================================================
// Eris Mobile — «Recién desperté» y «¿Cómo sigues?» en Inicio (2026-11-07)
//
// Sin reloj, Eris no sabe que despertaste hasta que se lo dices, y mientras tanto tus comidas y tu agua siguen contando desde el
// despertar anterior. Un toque y el día parte ahí. Casi siempre esta tarjeta no se muestra (sleepCore.wakePrompt).
// ============================================================
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, DeviceEventEmitter } from 'react-native';
import { T, R } from '../../config/design';
import { wakePrompt } from '../../services/sleep/sleepCore';
import { loadSleepEdits, SLEEP_EDITS_EVENT } from '../../services/sleep/sleepStore';
import { daySchedule } from '../../services/daySchedule';
import { SleepEntryForm, WakeQuestion } from '../../screens/sleep/SleepEntry';

const NIGHT = '#a78bfa';

export default function WakeCard({ wakeTime, pendingWake, usualOnset, need }: { wakeTime?: string | null; pendingWake?: string | null; usualOnset?: number | null; need?: number | null }) {
  const [lastManualEnd, setLastManualEnd] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const leer = async () => {
    const e = await loadSleepEdits();
    setLastManualEnd(e.manual.length ? Math.max(...e.manual.map((m) => m.end)) : null);
  };
  useEffect(() => {
    void leer();
    const sub = DeviceEventEmitter.addListener(SLEEP_EDITS_EVENT, leer);
    return () => sub.remove();
  }, []);

  const lastWake = wakeTime ? Date.parse(wakeTime) : null;
  // Lo último que Eris sabe de tu sueño lo anotaste tú (o no sabe nada y sí anotaste hace poco)
  const lastIsManual = lastManualEnd != null && (lastWake == null ? Date.now() - lastManualEnd < 3 * 86_400_000 : lastManualEnd >= lastWake);
  if (pendingWake) return <View style={st.card}><WakeQuestion endIso={pendingWake} /></View>;
  if (!open && !wakePrompt({ now: Date.now(), lastWake, lastIsManual, usualWake: daySchedule.usualWake() })) return null;
  return (
    <View style={st.card}>
      {open ? (
        <SleepEntryForm presetNow usualOnset={usualOnset} usualWake={daySchedule.usualWake()} need={need} onSaved={() => setOpen(false)} onCancel={() => setOpen(false)} />
      ) : (
        <View style={st.row}>
          <Text style={st.txt}>¿Recién despertaste?</Text>
          <Pressable onPress={() => setOpen(true)} style={st.btn} accessibilityRole="button"><Text style={st.btnTxt}>Recién desperté</Text></Pressable>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: T.bgCard, borderRadius: R.xl, padding: 14, borderWidth: 1, borderColor: `${NIGHT}55`, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  txt: { color: T.text, fontSize: 14, fontWeight: '700' },
  btn: { backgroundColor: NIGHT, borderRadius: R.full, paddingHorizontal: 14, paddingVertical: 10 },
  btnTxt: { color: '#0b0a12', fontSize: 13, fontWeight: '900' },
});

// ============================================================
// Forge — el cronómetro de un ejercicio por tiempo (plancha, wrist lever, saco, cardio): toda la pantalla es el botón.
// Cuenta 3-2-1 (tocar se la salta), cuenta el tiempo con la hora real y, al tocar, anota solo y parte el descanso. Al llegar
// a tu objetivo vibra una vez, también con el teléfono bloqueado o en el bolsillo (un round de saco de 3 min).
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { REST_VIBRATION, fmtClock, restTimer } from '../../services/forge/restTimer';
import { FG, FONT } from './theme';
import { Icon } from './icons';

const KEEP_TAG = 'forge-cronometro';
/** Menos que esto es un toque sin querer: no se anota */
export const TIMED_MIN_SECS = 3;

export default function TimedRun({ visible, title, goal, onStop, onCancel }: {
  visible: boolean; title: string; goal: { secs: number; label: string } | null;
  /** los segundos que duró */
  onStop: (secs: number) => void; onCancel: () => void;
}) {
  const [cuenta, setCuenta] = useState(3);
  const [secs, setSecs] = useState(0);
  const inicio = useRef(0);
  const llego = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setCuenta(3); setSecs(0); inicio.current = 0; llego.current = false;
    activateKeepAwakeAsync(KEEP_TAG).catch(() => {});
    return () => { deactivateKeepAwake(KEEP_TAG).catch(() => {}); restTimer.alarm?.cancelGoal(); };
  }, [visible]);

  const partir = () => {
    inicio.current = Date.now();
    setCuenta(0);
    restTimer.stop(); // partió la serie: el descanso se acabó
    if (goal) restTimer.alarm?.goal(inicio.current + goal.secs * 1000, `${title}: llegaste a ${fmtClock(goal.secs)}`);
  };

  // 3-2-1
  useEffect(() => {
    if (!visible || cuenta <= 0) return;
    const t = setTimeout(() => (cuenta === 1 ? partir() : setCuenta((c) => c - 1)), 1000);
    return () => clearTimeout(t);
  }, [visible, cuenta]);

  // El tiempo, con la hora real
  useEffect(() => {
    if (!visible || cuenta > 0) return;
    const iv = setInterval(() => {
      const s = Math.floor((Date.now() - inicio.current) / 1000);
      setSecs(s);
      if (goal && s >= goal.secs && !llego.current) {
        llego.current = true;
        if (AppState.currentState === 'active') Vibration.vibrate(REST_VIBRATION);
      }
    }, 200);
    return () => clearInterval(iv);
  }, [visible, cuenta]);

  const tocar = () => {
    if (cuenta > 0) return partir();
    onStop(Math.floor((Date.now() - inicio.current) / 1000));
  };

  const cumplido = !!goal && secs >= goal.secs;
  const pct = goal ? Math.min(100, (secs / goal.secs) * 100) : 0;
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={s.screen} onPress={tocar} accessibilityRole="button" accessibilityLabel={cuenta > 0 ? 'Partir ahora' : 'Terminar y anotar'}>
        <View style={s.head}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={onCancel} style={s.close} accessibilityLabel="Descartar sin anotar"><Icon name="X" size={22} color={FG.muted} /></TouchableOpacity>
        </View>
        <View style={s.mid}>
          <Text style={[s.big, cumplido && { color: FG.green }]}>{cuenta > 0 ? cuenta : fmtClock(secs)}</Text>
          <Text style={s.hint}>{cuenta > 0 ? 'Prepárate · toca para partir ya' : 'Toca en cualquier parte para terminar'}</Text>
        </View>
        <View style={s.foot}>
          {goal && (
            <>
              <Text style={s.goal}>{goal.label}: {fmtClock(goal.secs)}</Text>
              <View style={s.track}><View style={[s.fill, { width: `${pct}%` }, cumplido && { backgroundColor: FG.green }]} /></View>
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: FG.bg, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 44 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontFamily: FONT.display, fontSize: 28, color: FG.white },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  big: { fontFamily: FONT.display, fontSize: 132, lineHeight: 140, color: FG.white, fontVariant: ['tabular-nums'] },
  hint: { fontFamily: FONT.bodyMed, fontSize: 15, color: FG.muted, textAlign: 'center' },
  foot: { minHeight: 44, gap: 8 },
  goal: { fontFamily: FONT.bodyBold, fontSize: 14, color: FG.muted, textAlign: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: FG.line2, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: FG.gold },
});

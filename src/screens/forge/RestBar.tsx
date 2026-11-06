// ============================================================
// Forge — la barra de descanso: abajo, sin tapar nada, en todas las pestañas (services/forge/restTimer.ts).
// ============================================================
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { restTimer, fmtClock, type RestState } from '../../services/forge/restTimer';
import { FG, FONT } from './theme';
import { Icon } from './icons';

export function useRestState(): RestState | null {
  const [st, setSt] = useState<RestState | null>(restTimer.get());
  useEffect(() => {
    void restTimer.restore();
    setSt(restTimer.get());
    return restTimer.subscribe(setSt);
  }, []);
  return st;
}

export default function RestBar() {
  const st = useRestState();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!st || st.ended) return;
    const iv = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(iv);
  }, [st?.endAt, st?.ended]);
  if (!st) return null;

  const left = Math.max(0, Math.ceil((st.endAt - Date.now()) / 1000));
  const pct = st.ended ? 0 : Math.min(100, (left / st.total) * 100);
  return (
    <View style={s.bar} accessibilityLiveRegion="polite">
      <View style={s.track}><View style={[s.fill, { width: `${pct}%` }]} /></View>
      <View style={s.row}>
        {st.ended
          ? <Text style={[s.digits, s.ready]}>TE TOCA</Text>
          : <Text style={s.digits} accessibilityLabel={`Quedan ${left} segundos de descanso`}>{fmtClock(left)}</Text>}
        <View style={s.info}>
          <Text style={s.next} numberOfLines={1}>{st.next}</Text>
          {!st.ended && <Text style={s.sub} numberOfLines={1}>{st.warmup ? 'Calentamiento' : st.kind === 'cambio' ? `Entre ejercicios ${fmtClock(st.total)}` : st.kind === 'enlace' ? 'Solo el cambio de ejercicio' : `Descanso ${fmtClock(st.total)} · ${st.exName}`}</Text>}
        </View>
        {!st.ended && (
          <>
            <TouchableOpacity style={s.btn} onPress={() => restTimer.adjust(-15)} accessibilityLabel="Quitar 15 segundos"><Text style={s.btnTxt}>−15</Text></TouchableOpacity>
            <TouchableOpacity style={s.btn} onPress={() => restTimer.adjust(15)} accessibilityLabel="Sumar 15 segundos"><Text style={s.btnTxt}>+15</Text></TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={s.close} onPress={() => restTimer.stop()} accessibilityLabel="Terminar el descanso"><Icon name="X" size={16} color={FG.muted} /></TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { backgroundColor: FG.panel3, borderTopWidth: 1, borderTopColor: FG.line2, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 8 },
  track: { position: 'absolute', left: 0, right: 0, top: -1, height: 3, backgroundColor: FG.line2 },
  fill: { height: 3, backgroundColor: FG.gold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  digits: { fontFamily: FONT.display, fontSize: 38, lineHeight: 42, color: FG.gold, minWidth: 66, fontVariant: ['tabular-nums'] },
  ready: { color: FG.green, fontSize: 30, lineHeight: 42 },
  info: { flex: 1, minWidth: 0, marginLeft: 2 },
  next: { fontFamily: FONT.bodyBold, fontSize: 13.5, color: FG.white },
  sub: { fontFamily: FONT.bodyMed, fontSize: 11.5, color: FG.dim },
  btn: { minWidth: 44, height: 44, borderRadius: 10, backgroundColor: FG.line, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { fontFamily: FONT.bodyBold, fontSize: 14, color: FG.text },
  close: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
});

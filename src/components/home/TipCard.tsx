// ============================================================
// Eris Mobile — "¿Sabías que…?" (Inicio)
//
// Una función nueva por día, con un botón para probarla (services/tips.ts). Discreta a propósito: no compite con "Ahora".
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, LayoutAnimation } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { T, R } from '../../config/design';
import { tipOfToday, dismissTip, hideTipToday, type Tip, type TipAction } from '../../services/tips';

export default function TipCard({
  modules, onAction,
}: {
  modules: { nutri: boolean; toji: boolean; finanzas: boolean };
  onAction: (a: TipAction) => void;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  const load = useCallback(() => {
    tipOfToday(modules).then((t) => {
      setTip(t);
      if (t) Animated.timing(fade, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }).catch(() => {});
  }, [modules.nutri, modules.toji, modules.finanzas]);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!tip) return null;

  const close = (forever: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTip(null);
    (forever ? dismissTip(tip.id) : hideTipToday()).catch(() => {});
  };
  const act = () => {
    if (tip.action.kind === 'ok') { close(true); return; }
    onAction(tip.action);
    close(true);
  };

  return (
    <Animated.View style={[st.card, { opacity: fade }]}>
      <View style={st.head}>
        <Text style={st.label}>¿SABÍAS QUE…?</Text>
        <TouchableOpacity onPress={() => close(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Esconder hasta mañana">
          <Text style={st.x}>×</Text>
        </TouchableOpacity>
      </View>
      <View style={st.row}>
        <Text style={st.icon}>{tip.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>{tip.title}</Text>
          <Text style={st.text}>{tip.text}</Text>
        </View>
      </View>
      <View style={st.actions}>
        <TouchableOpacity onPress={act} activeOpacity={0.75} style={st.btn}>
          <Text style={st.btnText}>{tip.action.label}{tip.action.kind === 'ok' ? '' : ' ›'}</Text>
        </TouchableOpacity>
        {tip.action.kind !== 'ok' && (
          <TouchableOpacity onPress={() => close(true)} activeOpacity={0.7} style={st.btnGhost}>
            <Text style={st.btnGhostText}>Ya lo sé</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(168,85,247,0.06)', borderRadius: R.lg, padding: 14,
    borderWidth: 1, borderColor: 'rgba(168,85,247,0.22)', marginBottom: 12,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label: { color: '#c4b5fd', fontSize: 10.5, fontWeight: '800', letterSpacing: 1.8 },
  x: { color: T.textMuted, fontSize: 20, fontWeight: '600', lineHeight: 20 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { fontSize: 22, lineHeight: 28 },
  title: { color: T.text, fontSize: 14.5, fontWeight: '800' },
  text: { color: T.textLight, fontSize: 12.5, fontWeight: '500', marginTop: 2, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 14, marginTop: 12, alignItems: 'center' },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.full, backgroundColor: 'rgba(168,85,247,0.16)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.35)' },
  btnText: { color: '#d8b4fe', fontSize: 13, fontWeight: '800' },
  btnGhost: { paddingVertical: 8 },
  btnGhostText: { color: T.textMuted, fontSize: 12.5, fontWeight: '700' },
});

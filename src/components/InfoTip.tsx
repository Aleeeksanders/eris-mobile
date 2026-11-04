// ============================================================
// Eris Mobile — ⓘ: la información de cada número, a un toque (2026-10-22)
//
// Cerrado por defecto: un circulito discreto. Al tocarlo, una hoja con lo esencial y «Ver más» (cómo se calcula, de dónde
// sale el dato, qué puedes hacer). Los textos viven en config/infoTexts.ts. `color` adapta el acento al módulo.
// ============================================================
import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { T } from '../config/design';
import { INFO, type InfoText } from '../config/infoTexts';

export default function InfoTip({ id, info, color = T.accent, size = 18, style }: { id?: keyof typeof INFO | string; info?: InfoText; color?: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const it = info ?? (id ? INFO[id] : undefined);
  if (!it) return null;
  const extra = [['Cómo se calcula', it.calculo], ['De dónde sale el dato', it.fuente], ['Qué puedes hacer', it.hacer]].filter(([, v]) => !!v) as Array<[string, string]>;
  return (
    <>
      <Pressable onPress={() => { setMore(false); setOpen(true); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Más información: ${it.titulo}`}
        style={({ pressed }) => [st.dot, { width: size, height: size, borderRadius: size / 2, borderColor: `${color}88`, opacity: pressed ? 0.6 : 1 }, style]}>
        <Text style={[st.i, { color, fontSize: size * 0.62 }]}>i</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={st.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[st.sheet, { borderTopColor: color }]} onPress={() => {}}>
            <View style={st.head}>
              <Text style={st.title}>{it.titulo}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar" style={st.close}><Text style={st.closeText}>✕</Text></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 460 }}>
              <Text style={st.body}>{it.corto}</Text>
              {extra.length > 0 && !more && (
                <Pressable onPress={() => setMore(true)} accessibilityRole="button" style={st.moreBtn}><Text style={[st.moreText, { color }]}>Ver más ›</Text></Pressable>
              )}
              {more && extra.map(([k, v]) => (
                <View key={k} style={st.block}>
                  <Text style={[st.blockTitle, { color }]}>{k.toUpperCase()}</Text>
                  <Text style={st.body}>{v}</Text>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  dot: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.03)' },
  i: { fontWeight: '800', fontStyle: 'italic', marginTop: -1 },
  overlay: { flex: 1, backgroundColor: 'rgba(4,4,8,0.72)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.bgElevated, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 2, padding: 18, paddingBottom: 30 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  title: { flex: 1, color: T.text, fontSize: 18, fontWeight: '800' },
  close: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: T.textLight, fontSize: 14 },
  body: { color: T.textLight, fontSize: 14.5, lineHeight: 21 },
  moreBtn: { marginTop: 12, alignSelf: 'flex-start', paddingVertical: 6 },
  moreText: { fontSize: 14, fontWeight: '700' },
  block: { marginTop: 14 },
  blockTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
});

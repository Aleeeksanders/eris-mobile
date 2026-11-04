// ============================================================
// Eris Mobile — el chat vacío: ejemplos para tocar
//
// Plan para que la app se digiera fácil (2026-10-10, paso 4): el chat es la puerta de entrada. Casi todo se puede hacer
// hablando, pero nadie lo sabía: el chat vacío decía "Eris lista" con tres atajos genéricos. Ahora muestra ejemplos
// reales agrupados por lo que la persona quiere hacer:
//   - las PREGUNTAS se envían al tocarlas ("¿Cómo voy hoy?"): respuesta inmediata, sin escribir nada;
//   - lo que ANOTA datos se deja escrito en el cuadro para ajustarlo ("Anota un pan con palta"): así nunca se registra
//     comida, agua o un gasto que la persona no tuvo.
// Solo aparecen los grupos de lo que usa (Finanzas, Forge).
// ============================================================

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { T, R } from '../config/design';

interface Starter { label: string; send: boolean }
interface Group { title: string; icon: string; note?: string; needs?: 'finanzas' | 'toji'; items: Starter[] }

const GROUPS: Group[] = [
  {
    title: 'Anota sin buscar', icon: '🍽️', note: 'Te lo dejo escrito para que lo ajustes.',
    items: [{ label: 'Anota un pan con palta', send: false }, { label: 'Almorcé arroz con pollo', send: false }, { label: 'Tomé 500 ml de agua', send: false }],
  },
  {
    title: 'Pregúntale cómo vas', icon: '📊',
    items: [{ label: '¿Qué tengo para hoy?', send: true }, { label: '¿Cómo voy hoy?', send: true }, { label: '¿Cuánta agua llevo?', send: true }],
  },
  {
    title: 'Pídele ideas', icon: '💡',
    items: [{ label: '¿Qué ceno con lo que me falta?', send: true }, { label: 'Tengo hambre, ¿qué como?', send: true }],
  },
  {
    title: 'Tu plata', icon: '💰', needs: 'finanzas',
    items: [{ label: 'Gasté 5 lucas en el almuerzo', send: false }, { label: '¿En qué gasté más este mes?', send: true }],
  },
  {
    title: 'Entrenar', icon: '💪', needs: 'toji',
    items: [{ label: '¿Qué me toca hoy?', send: true }, { label: '¿Qué tan fuerte estoy?', send: true }],
  },
];

/** Ejemplos para el cuadro de texto vacío (van rotando). */
export function placeholderExamples(modules: { finanzas: boolean; toji: boolean }) {
  return [
    'Prueba: «anota 2 huevos revueltos»',
    'Prueba: «¿cómo voy hoy?»',
    'Prueba: «tomé un café con leche»',
    ...(modules.finanzas ? ['Prueba: «gasté 3 lucas en el metro»'] : []),
    'Prueba: «¿qué ceno?»',
  ];
}

export default function ChatStarters({
  personaName, modules, onSend, onPrefill,
}: {
  personaName: string;
  modules: { finanzas: boolean; toji: boolean };
  onSend: (text: string) => void;
  onPrefill: (text: string) => void;
}) {
  const enter = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const groups = GROUPS.filter((g) => !g.needs || modules[g.needs]);

  return (
    <Animated.View style={[st.wrap, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
      <View style={st.hero}>
        <View style={st.orbWrap}>
          <Animated.View style={[st.halo, { opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.45] }) }]} />
          <Animated.Image
            source={require('../../assets/icon.png')}
            style={[st.orb, { transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }]}
          />
        </View>
        <Text style={st.title}>Háblame como a una persona</Text>
        <Text style={st.sub}>Escribe o mantén 🎙️ y dímelo. Toca un ejemplo para probar.</Text>
      </View>

      {groups.map((g) => (
        <View key={g.title} style={st.group}>
          <Text style={st.groupTitle}>{g.icon}  {g.title}</Text>
          <View style={st.chips}>
            {g.items.map((it) => (
              <TouchableOpacity
                key={it.label}
                activeOpacity={0.75}
                onPress={() => (it.send ? onSend(it.label) : onPrefill(it.label))}
                style={[st.chip, !it.send && st.chipDraft]}
              >
                <Text style={st.chipText}>{it.label}</Text>
                {it.send ? <Text style={st.chipArrow}>›</Text> : <Text style={st.chipPen}>✎</Text>}
              </TouchableOpacity>
            ))}
          </View>
          {!!g.note && <Text style={st.note}>{g.note}</Text>}
        </View>
      ))}
      <Text style={st.footer}>{personaName} entiende cómo hablas: «lucas», «once», «la cazuela de mi mamá».</Text>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: { paddingTop: 18, paddingBottom: 10 },
  hero: { alignItems: 'center', marginBottom: 18 },
  orbWrap: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  halo: { position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(52,211,153,0.18)' },
  orb: { width: 80, height: 80, borderRadius: 40 },
  title: { color: T.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  sub: { color: T.textMuted, fontSize: 13, fontWeight: '500', marginTop: 6, textAlign: 'center' },
  group: { marginBottom: 16 },
  groupTitle: { color: T.textLight, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 9, borderRadius: R.full,
    backgroundColor: T.bgCard, borderWidth: 1, borderColor: T.border,
  },
  chipDraft: { borderStyle: 'dashed', borderColor: 'rgba(34,211,238,0.3)' },
  chipText: { color: T.text, fontSize: 13, fontWeight: '600' },
  chipArrow: { color: T.accent, fontSize: 15, fontWeight: '800', marginTop: -1 },
  chipPen: { color: T.textMuted, fontSize: 12 },
  note: { color: T.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 6 },
  footer: { color: T.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: 4, lineHeight: 17 },
});

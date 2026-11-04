// ============================================================
// Eris Mobile — Action Chips
// Mecanismo compartido para que Eris presente opciones tocables dentro
// de una respuesta de chat: cualquier texto "[Opción: ...]" se extrae
// del markdown mostrado y se renderiza como chips; tocar uno reenvía
// ese texto como mensaje nuevo. Usado por ChatScreen.tsx y por el panel
// de chat embebido de TojiScreen.tsx — cualquier chat con Eris debe
// poder mostrar estas opciones, no solo la pantalla principal.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

/**
 * Extrae los tags "[Opción: texto]" de un mensaje y devuelve el texto
 * limpio (sin los tags) junto con la lista de opciones encontradas.
 */
export function parseActionChips(text: string): { cleanText: string; actions: string[] } {
  const actions: string[] = [];
  const regex = /\[Opción:\s*(.+?)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    actions.push(match[1]);
  }
  const cleanText = text.replace(/\[Opción:\s*(.+?)\]/g, '').trim();
  return { cleanText, actions };
}

export function ActionChips({ actions, onSendText }: { actions: string[]; onSendText: (text: string) => void }) {
  if (actions.length === 0) return null;
  return (
    <View style={s.wrap}>
      {actions.map((act, idx) => (
        <TouchableOpacity key={idx} style={s.chip} onPress={() => onSendText(act)}>
          <Text style={s.chipText}>{act}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 8 },
  chip: { backgroundColor: 'rgba(34,211,238,0.15)', borderWidth: 1, borderColor: 'rgba(34,211,238,0.4)', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 },
  chipText: { color: '#22d3ee', fontSize: 14, fontWeight: '600' },
});

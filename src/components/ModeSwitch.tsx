/**
 * ModeSwitch — Hestia · AXS, a la vista en el Dashboard de Hestia y en el Panel AXS. Solo existe dentro del Modo AXS
 * Executive (se prende y apaga en Perfil): en Eris no aparece. App aplica el cambio (config/appMode.ts).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration } from 'react-native';
import { T, R, S } from '../config/design';
import { type AppMode, requestAppMode, useAppMode, useSysRole, isAdminRole } from '../config/appMode';

const OPTIONS: Array<{ id: AppMode; label: string; color: string; hint: string }> = [
  { id: 'hestia', label: 'Hestia', color: '#f59e0b', hint: 'Tu día con Hestia, más acceso a AXS y al PC.' },
  { id: 'empresa', label: 'AXS', color: '#3b82f6', hint: 'Menú de AXS: panel, proyectos, pendientes y sistema.' },
];

export default function ModeSwitch({ compact = false }: { compact?: boolean }) {
  const role = useSysRole();
  const mode = useAppMode();
  if (!isAdminRole(role) || mode === 'eris') return null;
  const cur = OPTIONS.find((o) => o.id === mode) ?? OPTIONS[0];
  return (
    <View style={[s.wrap, compact && { marginBottom: S.md }]}>
      <View style={s.row} accessibilityRole="tablist">
        {OPTIONS.map((o) => {
          const on = o.id === mode;
          return (
            <TouchableOpacity
              key={o.id}
              style={[s.seg, on && { backgroundColor: o.color + '22', borderColor: o.color }]}
              onPress={() => { if (!on) { Vibration.vibrate(15); requestAppMode(o.id); } }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Modo ${o.label}`}
              activeOpacity={0.75}
            >
              <View style={[s.dot, { backgroundColor: on ? o.color : T.textMuted }]} />
              <Text style={[s.label, on && { color: T.text }]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!compact && <Text style={s.hint}>{cur.hint}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: S.lg },
  row: { flexDirection: 'row', gap: 6, backgroundColor: T.bgCard, borderRadius: R.full, borderWidth: 1, borderColor: T.border, padding: 4 },
  seg: {
    flex: 1, minHeight: 40, borderRadius: R.full, borderWidth: 1, borderColor: 'transparent',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { color: T.textLight, fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  hint: { color: T.textMuted, fontSize: 12, marginTop: 8, textAlign: 'center' },
});

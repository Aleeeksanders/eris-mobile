// ============================================================
// Forge 2.0 — piezas de pantalla (paneles, botones, barras, selectores, hojas) con la estética del HTML.
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Pressable, type ViewStyle, type TextStyle, type StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardLiftView } from '../../components/KeyboardLift';
import { FG, FONT } from './theme';
import { Icon } from './icons';

export function Panel({ children, style, tint }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) {
  return <View style={[s.panel, tint ? { borderColor: tint + '44', backgroundColor: tint + '10' } : null, style]}>{children}</View>;
}

/** Título grande (Teko) */
export function H({ children, size = 22, color = FG.white, style }: { children: React.ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: FONT.display, fontSize: size, color, letterSpacing: 1, lineHeight: size * 1.05, includeFontPadding: false }, style]}>{children}</Text>;
}

/** Etiqueta en mayúsculas (Rajdhani) */
export function Label({ children, color = FG.muted, size = 11, style }: { children: React.ReactNode; color?: string; size?: number; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: FONT.bodyBold, fontSize: size, color, letterSpacing: 1.5 }, style]}>{children}</Text>;
}

/** Texto normal (Rajdhani) */
export function P({ children, color = FG.muted, size = 13.5, style, bold, numberOfLines }: { children: React.ReactNode; color?: string; size?: number; style?: StyleProp<TextStyle>; bold?: boolean; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[{ fontFamily: bold ? FONT.bodyBold : FONT.body, fontSize: size, color, lineHeight: size * 1.4 }, style]}>{children}</Text>;
}

export function Btn({ title, onPress, kind = 'primary', icon, disabled, style, small }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'gold' | 'green' | 'danger'; icon?: string; disabled?: boolean; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const bg = kind === 'primary' ? FG.red : kind === 'gold' ? FG.gold : kind === 'green' ? FG.green : kind === 'danger' ? '#3a1218' : FG.panel;
  const fg = kind === 'ghost' ? FG.muted : kind === 'danger' ? FG.pink : kind === 'gold' || kind === 'green' ? '#0e0c12' : FG.white;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8} accessibilityRole="button"
      style={[s.btn, small && s.btnSmall, { backgroundColor: bg, borderColor: kind === 'ghost' ? FG.line2 : kind === 'danger' ? FG.pink + '66' : bg, opacity: disabled ? 0.45 : 1 }, style]}>
      {icon ? <Icon name={icon} size={small ? 14 : 16} color={fg} /> : null}
      <Text style={{ fontFamily: FONT.bodyBold, fontSize: small ? 13 : 15, color: fg, letterSpacing: 1 }}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Chip({ label, on, onPress, color = FG.red, disabled, style }: { label: string; on?: boolean; onPress?: () => void; color?: string; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || !onPress} activeOpacity={0.75} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={[s.chip, { borderColor: on ? color : FG.line2, backgroundColor: on ? color + '22' : FG.panel2, opacity: disabled ? 0.4 : 1 }, style]}>
      <Text style={{ fontFamily: FONT.bodyBold, fontSize: 13, color: on ? color : FG.text }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Barra de progreso */
export function Bar({ pct, color = FG.gold, height = 8, track = FG.line }: { pct: number; color?: string; height?: number; track?: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ height, backgroundColor: track, borderRadius: height / 2, overflow: 'hidden' }}>
      <View style={{ width: `${w}%`, height: '100%', backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

/** − valor + */
export function Stepper({ label, value, onMinus, onPlus, size = 'md', color = FG.white }: { label?: string; value: string; onMinus: () => void; onPlus: () => void; size?: 'sm' | 'md' | 'lg'; color?: string }) {
  const b = size === 'lg' ? 46 : size === 'sm' ? 30 : 36;
  const fs = size === 'lg' ? 34 : size === 'sm' ? 18 : 24;
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      {label ? <Label size={10}>{label}</Label> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity onPress={onMinus} style={[s.step, { width: b, height: b }]} accessibilityLabel={`Menos ${label ?? ''}`}><Icon name="Minus" size={b * 0.42} color={FG.muted} /></TouchableOpacity>
        <Text style={{ fontFamily: FONT.display, fontSize: fs, color, minWidth: fs * 1.6, textAlign: 'center', includeFontPadding: false }}>{value}</Text>
        <TouchableOpacity onPress={onPlus} style={[s.step, { width: b, height: b }]} accessibilityLabel={`Más ${label ?? ''}`}><Icon name="Plus" size={b * 0.42} color={FG.muted} /></TouchableOpacity>
      </View>
    </View>
  );
}

/** Hoja desde abajo (o centrada) con su botón de cerrar */
export function Sheet({ visible, onClose, title, children, center, footer }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; center?: boolean; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType={center ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardLiftView style={[s.overlay, center && { justifyContent: 'center', paddingHorizontal: 20 }]}>{(lift) => (<>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar" />
        <Pressable style={[s.sheet, center ? s.sheetCenter : { paddingBottom: lift > 0 ? 18 : Math.max(26, insets.bottom + 12) }]} onPress={() => {}}>
          <View style={s.sheetHead}>
            {title ? <H size={24} style={{ flex: 1 }}>{title}</H> : <View style={{ flex: 1 }} />}
            <TouchableOpacity onPress={onClose} style={s.close} accessibilityLabel="Cerrar"><Icon name="X" size={18} color={FG.muted} /></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: center ? 520 : 560, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer}
        </Pressable>
      </>)}</KeyboardLiftView>
    </Modal>
  );
}

export function Row({ children, style, gap = 8 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function SectionHead({ icon, title, right, color = FG.red }: { icon?: string; title: string; right?: React.ReactNode; color?: string }) {
  return (
    <Row style={{ marginBottom: 10 }}>
      {icon ? <Icon name={icon} size={16} color={color} /> : null}
      <H size={22} style={{ flex: 1 }}>{title}</H>
      {right}
    </Row>
  );
}

export const s = StyleSheet.create({
  panel: { backgroundColor: FG.panel, borderWidth: 1, borderColor: FG.line, borderRadius: 16, padding: 16, marginBottom: 14 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1 },
  step: { borderRadius: 9, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.line, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(6,5,8,0.88)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#17131c', maxHeight: '100%', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: FG.line2, padding: 18, paddingBottom: 26 },
  sheetCenter: { borderRadius: 20, paddingBottom: 18 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  close: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.panel, alignItems: 'center', justifyContent: 'center' },
});

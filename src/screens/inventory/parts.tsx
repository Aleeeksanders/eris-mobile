// ============================================================
// Inventario — piezas: paneles, chips, botones, la hoja de formularios, el selector de área y de unidad, y la fila de
// cada cosa (con su cantidad, su vencimiento y los botones rápidos − / +).
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardLiftView } from '../../components/KeyboardLift';
import { IX, AREA_COLOR, venceTxt, venceColor } from './ix';
import { AREA, AREAS, UNIDADES, cantidadDe, diasHasta, familia, type AreaId, type Item, type Unidad } from '../../services/inventory/inventoryCore';
import InfoTip from '../../components/InfoTip';

export function Panel({ children, style, glow }: { children: React.ReactNode; style?: any; glow?: string }) {
  return <View style={[st.panel, glow ? { borderColor: glow + '55' } : null, style]}>{children}</View>;
}
export const Label = ({ children, color, info }: { children: React.ReactNode; color?: string; info?: string }) => (
  info
    ? <View style={st.labelRow}><Text style={[st.label, { marginBottom: 0 }, color ? { color } : null]}>{children}</Text><InfoTip id={info} color={IX.teal} size={15} /></View>
    : <Text style={[st.label, color ? { color } : null]}>{children}</Text>
);

export function Chip({ label, on, onPress, color = IX.teal, small }: { label: string; on?: boolean; onPress?: () => void; color?: string; small?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} style={[st.chip, small && st.chipSmall, on && { borderColor: color, backgroundColor: color + '22' }]} accessibilityRole="button" accessibilityState={{ selected: !!on }}>
      <Text style={[st.chipText, small && { fontSize: 12 }, on && { color: IX.text }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Btn({ label, onPress, color = IX.tealDeep, ghost, small, disabled, style, a11y }: { label: string; onPress?: () => void; color?: string; ghost?: boolean; small?: boolean; disabled?: boolean; style?: any; a11y?: string }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ disabled: !!disabled }}
      style={[st.btn, small && st.btnSmall, ghost ? { borderColor: color + '66', backgroundColor: 'transparent' } : { borderColor: color, backgroundColor: color }, disabled && { opacity: 0.4 }, style]}>
      <Text style={[st.btnText, small && { fontSize: 13 }, ghost && { color }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Hoja que sube desde abajo, con su botón de guardar. */
export function Sheet({ title, onClose, onSave, saveLabel = 'Guardar', children, color = IX.tealDeep }: {
  title: string; onClose: () => void; onSave?: () => void; saveLabel?: string; children: React.ReactNode; color?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardLiftView style={st.sheetDim}>{(lift) => (<>
        <Pressable style={st.sheetBack} onPress={onClose} accessibilityLabel="Cerrar" />
        <View style={[st.sheet, { paddingBottom: lift > 0 ? 12 : Math.max(16, insets.bottom + 10) }]}>
          <View style={st.sheetHandle} />
          <View style={st.sheetHead}>
            <Text style={st.sheetTitle} numberOfLines={1}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={st.sheetClose} accessibilityLabel="Cerrar"><Text style={{ color: IX.muted, fontSize: 18 }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 540, flexShrink: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 6 }}>{children}</ScrollView>
          {onSave && <Btn label={saveLabel} onPress={onSave} color={color} style={{ marginTop: 12 }} />}
        </View>
      </>)}</KeyboardLiftView>
    </Modal>
  );
}

/** Un campo de texto. `decimal`: acepta «1,5». */
export function Field({ label, value, onChange, placeholder, decimal, numeric, big, autoFocus, info }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; decimal?: boolean; numeric?: boolean; big?: boolean; autoFocus?: boolean; info?: string;
}) {
  const clean = (t: string) => (numeric ? t.replace(/[^\d]/g, '') : decimal ? t.replace(/[^\d.,]/g, '').replace(/([.,].*)[.,]/g, '$1') : t);
  return (
    <View>
      <Label info={info}>{label}</Label>
      <TextInput value={value} onChangeText={(t) => onChange(clean(t))} placeholder={placeholder} placeholderTextColor={IX.dim}
        keyboardType={numeric ? 'number-pad' : decimal ? 'decimal-pad' : 'default'} autoFocus={autoFocus}
        style={[st.input, big && st.inputBig, (numeric || decimal) && { fontFamily: IX.mono }]} />
    </View>
  );
}

/** El área: chips con su ícono (las ocultas no aparecen, salvo la elegida). */
export function AreaPicker({ value, onChange, ocultas = [] }: { value: AreaId | null | undefined; onChange: (a: AreaId) => void; ocultas?: AreaId[] }) {
  return (
    <View>
      <Label>ÁREA</Label>
      <View style={st.chips}>
        {AREAS.filter((a) => !ocultas.includes(a.id) || a.id === value).map((a) => (
          <Chip key={a.id} small label={`${a.icono} ${a.corto}`} on={value === a.id} color={AREA_COLOR[a.id]} onPress={() => onChange(a.id)} />
        ))}
      </View>
    </View>
  );
}

const U_LABEL: Record<Unidad, string> = { u: 'unidades', paquete: 'paquetes', g: 'g', kg: 'kg', ml: 'ml', L: 'L' };
export function UnitPicker({ value, onChange, solo }: { value: Unidad; onChange: (u: Unidad) => void; solo?: Unidad[] }) {
  return (
    <View style={st.chips}>
      {(solo ?? UNIDADES).map((u) => <Chip key={u} small label={U_LABEL[u]} on={value === u} onPress={() => onChange(u)} />)}
    </View>
  );
}

/** Las unidades que se pueden usar con un ítem (las de su familia y, si tiene contenido, las de ese contenido). */
export function unidadesPara(it: Pick<Item, 'unidad' | 'contenido'>): Unidad[] {
  const fam = familia(it.unidad);
  const same = UNIDADES.filter((u) => familia(u) === fam && (fam !== 'cuenta' || u === it.unidad));
  const extra = it.contenido ? UNIDADES.filter((u) => familia(u) === familia(it.contenido!.unidad)) : [];
  return [...new Set([...same, ...extra])];
}

/** La fila de una cosa: nombre, cantidad, vencimiento y los botones rápidos (usé una / compré una). */
export function ItemRow({ it, now, onPress, onMenos, onMas, area }: { it: Item; now: Date; onPress: () => void; onMenos?: () => void; onMas?: () => void; area?: boolean }) {
  const dias = it.vence ? diasHasta(it.vence, now) : null;
  const sin = it.cantidad <= 0;
  const poco = !sin && it.minimo != null && it.minimo > 0 && it.cantidad <= it.minimo;
  const cuenta = familia(it.unidad) === 'cuenta';
  return (
    <View style={st.row}>
      <TouchableOpacity style={{ flex: 1, minHeight: 48, justifyContent: 'center' }} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${it.nombre}: ${sin ? 'se acabó' : cantidadDe(it)}. Ver detalle`}>
        <Text style={[st.rowName, sin && { color: IX.muted }]} numberOfLines={1}>{area ? `${AREA[it.area].icono} ` : ''}{it.nombre}</Text>
        <View style={st.rowSub}>
          <Text style={[st.rowQty, sin && { color: IX.red }, poco && { color: IX.amber }]}>{sin ? 'Se acabó' : cantidadDe(it)}</Text>
          {poco && <Text style={[st.tag, { color: IX.amber, borderColor: IX.amber + '55' }]}>queda poco</Text>}
          {dias != null && !sin && dias <= 7 && <Text style={[st.tag, { color: venceColor(dias), borderColor: venceColor(dias) + '55' }]}>{venceTxt(dias)}</Text>}
          {!!it.ubicacion && <Text style={st.rowLoc} numberOfLines={1}>· {it.ubicacion}</Text>}
        </View>
      </TouchableOpacity>
      {cuenta && onMenos && !sin && <TouchableOpacity onPress={onMenos} style={st.qBtn} accessibilityRole="button" accessibilityLabel={`Usé una: ${it.nombre}`}><Text style={st.qText}>−</Text></TouchableOpacity>}
      {cuenta && onMas && <TouchableOpacity onPress={onMas} style={st.qBtn} accessibilityRole="button" accessibilityLabel={`Compré una: ${it.nombre}`}><Text style={st.qText}>+</Text></TouchableOpacity>}
    </View>
  );
}

export const Empty = ({ icon, text, children }: { icon: string; text: string; children?: React.ReactNode }) => (
  <View style={st.empty}><Text style={{ fontSize: 30 }}>{icon}</Text><Text style={st.emptyText}>{text}</Text>{children}</View>
);

export const st = StyleSheet.create({
  panel: { backgroundColor: IX.panel, borderRadius: 16, borderWidth: 1, borderColor: IX.line, padding: 16, marginBottom: 12 },
  label: { color: IX.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginBottom: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: IX.lineSoft, backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 14, minHeight: 38, justifyContent: 'center', maxWidth: '100%' },
  chipSmall: { paddingHorizontal: 11, minHeight: 34 },
  chipText: { color: IX.muted, fontSize: 13, fontWeight: '700' },
  btn: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSmall: { minHeight: 38, paddingHorizontal: 12, borderRadius: 10 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sheetDim: { backgroundColor: 'rgba(0,0,0,0.65)' },
  sheetBack: { flex: 1 },
  sheet: { backgroundColor: '#07120f', maxHeight: '100%', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: IX.line, paddingHorizontal: 18, paddingTop: 8 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: IX.dim, marginBottom: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sheetTitle: { flex: 1, color: IX.text, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  sheetClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: { backgroundColor: 'rgba(10,30,26,0.9)', borderWidth: 1, borderColor: 'rgba(45,212,191,0.32)', borderRadius: 12, color: IX.text, fontSize: 16, paddingHorizontal: 14, minHeight: 48 },
  inputBig: { fontSize: 26, fontWeight: '700', minHeight: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: IX.lineSoft, paddingVertical: 2 },
  rowName: { color: IX.text, fontSize: 15, fontWeight: '700' },
  rowSub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  rowQty: { color: IX.teal, fontFamily: IX.mono, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  rowLoc: { color: IX.dim, fontSize: 11, flexShrink: 1 },
  tag: { fontSize: 10.5, fontWeight: '800', borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  qBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: IX.line, alignItems: 'center', justifyContent: 'center' },
  qText: { color: IX.teal, fontSize: 22, fontWeight: '700', marginTop: -2 },
  empty: { alignItems: 'center', paddingVertical: 26, gap: 8 },
  emptyText: { color: IX.muted, fontSize: 13, textAlign: 'center', maxWidth: 300, lineHeight: 19 },
});

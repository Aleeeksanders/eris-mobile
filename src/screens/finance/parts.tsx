// ============================================================
// Finanzas 2.0 — piezas: paneles, KPI, curva, barra con fantasma, chips, botones y la hoja de formularios.
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import Svg, { Path, Line, Defs, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FX, clp, catOf, CAT_ORDER, TIPO_CUENTA } from './fx';
import type { Ref } from '../../services/finance/financeCore';
import InfoTip from '../../components/InfoTip';

export function Panel({ children, style, glow }: { children: React.ReactNode; style?: any; glow?: string }) {
  return <View style={[st.panel, glow ? { borderColor: glow + '55' } : null, style]}>{children}</View>;
}
export const Label = ({ children, color }: { children: React.ReactNode; color?: string }) => <Text style={[st.label, color ? { color } : null]}>{children}</Text>;
export const Mono = ({ children, style }: { children: React.ReactNode; style?: any }) => <Text style={[st.mono, style]}>{children}</Text>;

export function Kpi({ label, value, sub, color, onPress, infoId }: { label: string; value: string; sub?: string; color?: string; onPress?: () => void; infoId?: string }) {
  const Body = (
    <View style={st.kpi}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={st.kpiLabel}>{label}</Text>{!!infoId && <InfoTip id={infoId} color={FX.violet} size={15} />}</View>
      <Text style={[st.kpiValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {!!sub && <Text style={st.kpiSub} numberOfLines={2}>{sub}</Text>}
    </View>
  );
  return onPress ? <TouchableOpacity style={{ flexBasis: '47%', flexGrow: 1 }} onPress={onPress} accessibilityRole="button">{Body}</TouchableOpacity> : <View style={{ flexBasis: '47%', flexGrow: 1 }}>{Body}</View>;
}

/** Curva acumulada (gasto del mes) con línea fantasma del ritmo ideal y el día de hoy marcado. */
export function Curve({ values, ideal, total, width = 320, height = 70, color = FX.violet }: { values: number[]; ideal?: number; total: number; width?: number; height?: number; color?: string }) {
  const max = Math.max(1, ideal ?? 0, ...values) * 1.08;
  const n = Math.max(total, values.length, 2);
  const x = (i: number) => (i / (n - 1)) * (width - 6) + 3;
  const y = (v: number) => height - 3 - (v / max) * (height - 8);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = pts.length ? `M${pts.join(' L')}` : '';
  const area = pts.length ? `${line} L${x(values.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z` : '';
  const last = values.length ? values[values.length - 1] : 0;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="fxArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.35" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {[0.33, 0.66].map((g) => <Line key={g} x1="0" x2={width} y1={height * g} y2={height * g} stroke={FX.lineSoft} strokeWidth="1" />)}
      {ideal != null && ideal > 0 && <Line x1={x(0)} y1={y(0)} x2={x(n - 1)} y2={y(ideal)} stroke={FX.muted} strokeWidth="1.2" strokeDasharray="4,4" />}
      {!!area && <Path d={area} fill="url(#fxArea)" />}
      {!!line && <Path d={line} stroke={color} strokeWidth="2" fill="none" />}
      {values.length > 0 && <Circle cx={x(values.length - 1)} cy={y(last)} r="3.2" fill={color} />}
    </Svg>
  );
}

/** Barras de 6 meses: gasto (barra) contra ingreso (marca). */
export function Bars({ data, height = 86 }: { data: Array<{ label: string; gasto: number; ingreso: number }>; height?: number }) {
  const W = 320, slot = W / data.length, bw = slot * 0.46;
  const max = Math.max(1, ...data.map((d) => Math.max(d.gasto, d.ingreso))) * 1.1;
  const y = (v: number) => height - 14 - (v / max) * (height - 20);
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`}>
      {data.map((d, i) => {
        const cx = slot * i + slot / 2, top = y(d.gasto), over = d.ingreso > 0 && d.gasto > d.ingreso;
        return (
          <React.Fragment key={i}>
            <Rect x={cx - bw / 2} y={top} width={bw} height={Math.max(2, height - 14 - top)} rx="3" fill={over ? FX.down : FX.violetDeep} opacity={i === data.length - 1 ? 1 : 0.65} />
            {d.ingreso > 0 && <Line x1={cx - bw / 2 - 3} x2={cx + bw / 2 + 3} y1={y(d.ingreso)} y2={y(d.ingreso)} stroke={FX.up} strokeWidth="2" />}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

/**
 * Barra de presupuesto con la meta fantasma: el fondo punteado es el presupuesto del mes, la barra lo gastado y la
 * marca blanca lo esperable a hoy. Rojo solo si vas bastante sobre lo esperable para el día (o sobre el presupuesto).
 */
export function GhostBar({ gastado, presup, esperado, color }: { gastado: number; presup: number; esperado: number; color: string }) {
  const max = Math.max(presup, gastado) * 1.08 || 1;
  const w = (v: number) => `${Math.min(100, (v / max) * 100)}%` as const;
  const tono = gastado > presup ? FX.down : gastado > esperado * 1.15 ? FX.gold : color;
  return (
    <View style={st.track}>
      <View style={[st.ghost, { width: w(presup), borderColor: tono + '88', backgroundColor: tono + '18' }]} />
      <View style={[st.fill, { width: w(gastado), backgroundColor: tono }]} />
      {esperado > 0 && esperado < max && <View style={[st.marker, { left: w(esperado) }]} />}
    </View>
  );
}

export function Chip({ label, on, onPress, color = FX.violet, small }: { label: string; on?: boolean; onPress?: () => void; color?: string; small?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} style={[st.chip, small && st.chipSmall, on && { borderColor: color, backgroundColor: color + '22' }]} accessibilityRole="button" accessibilityState={{ selected: !!on }}>
      <Text style={[st.chipText, small && { fontSize: 12 }, on && { color: FX.text }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Btn({ label, onPress, color = FX.violetDeep, ghost, small, disabled, style }: { label: string; onPress?: () => void; color?: string; ghost?: boolean; small?: boolean; disabled?: boolean; style?: any }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
      style={[st.btn, small && st.btnSmall, ghost ? { borderColor: color + '66', backgroundColor: 'transparent' } : { borderColor: color, backgroundColor: color }, disabled && { opacity: 0.4 }, style]}>
      <Text style={[st.btnText, small && { fontSize: 13 }, ghost && { color }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Hoja que sube desde abajo, con su botón de guardar. */
export function Sheet({ visible, title, onClose, onSave, saveLabel = 'Guardar', children, color = FX.violetDeep }: {
  visible: boolean; title: string; onClose: () => void; onSave?: () => void; saveLabel?: string; children: React.ReactNode; color?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={st.sheetBack} onPress={onClose} accessibilityLabel="Cerrar" />
        <View style={[st.sheet, { paddingBottom: Math.max(16, insets.bottom + 10) }]}>
          <View style={st.sheetHandle} />
          <View style={st.sheetHead}>
            <Text style={st.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={st.sheetClose} accessibilityLabel="Cerrar"><Text style={{ color: FX.muted, fontSize: 18 }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12, paddingBottom: 6 }}>{children}</ScrollView>
          {onSave && <Btn label={saveLabel} onPress={onSave} color={color} style={{ marginTop: 12 }} />}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Field({ label, value, onChange, placeholder, numeric, big, autoFocus, secure }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean; big?: boolean; autoFocus?: boolean; secure?: boolean }) {
  return (
    <View>
      <Label>{label}</Label>
      <TextInput value={value} onChangeText={(t) => onChange(numeric ? t.replace(/[^\d]/g, '') : t)} placeholder={placeholder} placeholderTextColor={FX.dim}
        keyboardType={numeric ? 'number-pad' : 'default'} autoFocus={autoFocus} secureTextEntry={secure} autoCapitalize={secure ? 'none' : undefined} autoCorrect={secure ? false : undefined}
        style={[st.input, big && st.inputBig, numeric && { fontFamily: FX.mono }]} />
      {numeric && !!value && Number(value) >= 1000 && <Text style={st.inputHint}>{clp(Number(value))}</Text>}
    </View>
  );
}

export function CatPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <View>
      <Label>CATEGORÍA</Label>
      <View style={st.chips}>
        {CAT_ORDER.map((c) => { const m = catOf(c); return <Chip key={c} label={`${m.icon} ${m.label}`} on={value === c} onPress={() => onChange(c)} color={m.color} small />; })}
      </View>
    </View>
  );
}

export interface CuentaOpt { ref: Ref; nombre: string; tipo: string; saldo: number }
export function AccountPicker({ label = 'CUENTA', options, value, onChange, allowNone, noneLabel = 'Sin descontar' }: { label?: string; options: CuentaOpt[]; value: Ref | null | undefined; onChange: (r: Ref | null) => void; allowNone?: boolean; noneLabel?: string }) {
  return (
    <View>
      <Label>{label}</Label>
      <View style={st.chips}>
        {options.map((o) => {
          const m = TIPO_CUENTA[o.tipo] ?? TIPO_CUENTA.debito;
          return <Chip key={String(o.ref)} label={`${m.icon} ${o.nombre} · ${o.tipo === 'credito' ? 'cupo ' : ''}${clp(o.saldo)}`} on={value === o.ref} onPress={() => onChange(o.ref)} color={m.color} small />;
        })}
        {allowNone && <Chip label={`⊘ ${noneLabel}`} on={value == null} onPress={() => onChange(null)} small />}
      </View>
    </View>
  );
}

export const Empty = ({ icon, text }: { icon: string; text: string }) => (
  <View style={st.empty}><Text style={{ fontSize: 30 }}>{icon}</Text><Text style={st.emptyText}>{text}</Text></View>
);

export const st = StyleSheet.create({
  panel: { backgroundColor: FX.panel, borderRadius: 16, borderWidth: 1, borderColor: FX.line, padding: 16, marginBottom: 12 },
  label: { color: FX.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginBottom: 6 },
  mono: { fontFamily: FX.mono, color: FX.text, fontVariant: ['tabular-nums'] },
  kpi: { backgroundColor: FX.panel, borderRadius: 14, borderWidth: 1, borderColor: FX.lineSoft, padding: 12, minHeight: 84 },
  kpiLabel: { color: FX.muted, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.4 },
  kpiValue: { color: FX.text, fontFamily: FX.mono, fontSize: 19, fontWeight: '700', marginTop: 6, fontVariant: ['tabular-nums'] },
  kpiSub: { color: FX.muted, fontSize: 11, marginTop: 3 },
  track: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'visible', marginTop: 8 },
  ghost: { position: 'absolute', top: 0, left: 0, height: 10, borderRadius: 5, borderWidth: 1, borderStyle: 'dashed' },
  fill: { height: 10, borderRadius: 5 },
  marker: { position: 'absolute', top: -3, width: 2, height: 16, marginLeft: -1, borderRadius: 1, backgroundColor: FX.text, opacity: 0.85 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: FX.lineSoft, backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 14, minHeight: 38, justifyContent: 'center', maxWidth: '100%' },
  chipSmall: { paddingHorizontal: 11, minHeight: 34 },
  chipText: { color: FX.muted, fontSize: 13, fontWeight: '700' },
  btn: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSmall: { minHeight: 38, paddingHorizontal: 12, borderRadius: 10 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sheetBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { backgroundColor: '#0c0b18', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: FX.line, paddingHorizontal: 18, paddingTop: 8 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: FX.dim, marginBottom: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sheetTitle: { flex: 1, color: FX.text, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  sheetClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: { backgroundColor: 'rgba(20,15,50,0.9)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)', borderRadius: 12, color: FX.text, fontSize: 16, paddingHorizontal: 14, minHeight: 48 },
  inputBig: { fontSize: 28, fontWeight: '700', minHeight: 62 },
  inputHint: { color: FX.muted, fontSize: 12, marginTop: 4, fontFamily: FX.mono },
  empty: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyText: { color: FX.muted, fontSize: 13, textAlign: 'center', maxWidth: 280 },
});

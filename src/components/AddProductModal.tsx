/**
 * AddProductModal — cuando un código de barras no está en ninguna base (o está pero sin tabla nutricional), el
 * usuario copia la etiqueta del envase y el producto queda guardado: en el teléfono al tiro y en el servidor para
 * la próxima vez. Las etiquetas chilenas traen dos columnas ("100 g" y "1 porción"): se puede copiar cualquiera.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { T, R } from '../config/design';
import { foodSearchService, type FoodItem } from '../services/FoodSearchService';
import { maxSodiumMg } from '../services/nutrientSanity';

interface Props {
  visible: boolean;
  code: string;
  /** lo que se sepa del producto (nombre/marca de OFF o UPCitemdb) */
  suggestedName?: string;
  suggestedBrand?: string;
  onClose: () => void;
  onSaved: (food: FoodItem) => void;
}

type Field = 'kcal' | 'protein' | 'fat' | 'satFat' | 'carbs' | 'sugar' | 'fiber' | 'sodium';
const FIELDS: Array<{ key: Field; label: string; unit: string; required?: boolean }> = [
  { key: 'kcal', label: 'Energía', unit: 'kcal', required: true },
  { key: 'protein', label: 'Proteínas', unit: 'g', required: true },
  { key: 'fat', label: 'Grasas totales', unit: 'g', required: true },
  { key: 'satFat', label: '  Grasas saturadas', unit: 'g' },
  { key: 'carbs', label: 'H. de C. disponibles', unit: 'g', required: true },
  { key: 'sugar', label: '  Azúcares totales', unit: 'g' },
  { key: 'fiber', label: 'Fibra dietética', unit: 'g' },
  { key: 'sodium', label: 'Sodio', unit: 'mg' },
];

const parse = (s: string): number | undefined => {
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

export default function AddProductModal({ visible, code, suggestedName, suggestedBrand, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [portion, setPortion] = useState('');
  const [basis, setBasis] = useState<'100' | 'porcion'>('100');
  const [isDrink, setIsDrink] = useState(false);
  const [vals, setVals] = useState<Record<Field, string>>({ kcal: '', protein: '', fat: '', satFat: '', carbs: '', sugar: '', fiber: '', sodium: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(suggestedName ?? ''); setBrand(suggestedBrand ?? ''); setPortion(''); setBasis('100'); setIsDrink(false);
    setVals({ kcal: '', protein: '', fat: '', satFat: '', carbs: '', sugar: '', fiber: '', sodium: '' }); setError(null);
  }, [visible, code, suggestedName, suggestedBrand]);

  const save = async () => {
    const portionG = parse(portion);
    if (!name.trim()) return setError('Falta el nombre del producto.');
    if (basis === 'porcion' && !portionG) return setError('Para copiar la columna "1 porción" necesito el tamaño de la porción en g o ml.');
    const v = Object.fromEntries(FIELDS.map((f) => [f.key, parse(vals[f.key])])) as Record<Field, number | undefined>;
    const missing = FIELDS.filter((f) => f.required && v[f.key] === undefined).map((f) => f.label.trim().toLowerCase());
    if (missing.length) return setError(`Faltan: ${missing.join(', ')}.`);
    const k = basis === '100' ? 1 : 100 / portionG!;
    const per = (x: number | undefined) => (x === undefined ? undefined : x * k);
    const kcal = per(v.kcal)!, protein = per(v.protein)!, fat = per(v.fat)!, carbs = per(v.carbs)!;
    // Sanidad básica: por 100 g nada pasa de ~900 kcal ni los macros suman más de 100 g
    if (kcal > 900 || protein + fat + carbs > 105) return setError('Los números no cuadran para 100 g. Revisa la columna que copiaste (100 g o 1 porción).');
    // Las mismas reglas que nutrientSanity (revisión N1): el azúcar es parte de los carbohidratos y la saturada, de la grasa
    const sug = per(v.sugar), sat = per(v.satFat);
    if (sug !== undefined && sug > carbs + 0.5) return setError('Los azúcares no pueden ser más que los carbohidratos: revisa esas dos filas de la etiqueta.');
    if (sat !== undefined && sat > fat + 0.5) return setError('La grasa saturada no puede ser más que la grasa total: revisa esas dos filas de la etiqueta.');
    // Sodio: en mg. Sobre lo posible es que se copió en otra unidad (la sal pura tiene ~39.300 mg por 100 g)
    const sodium100 = per(v.sodium);
    if (sodium100 !== undefined && sodium100 > maxSodiumMg(name)) return setError('El sodio no cuadra: va en miligramos (mg). Revisa la etiqueta, por ejemplo 450 mg y no 450 g.');
    const food: FoodItem = {
      id: code, name: name.trim(), brand: brand.trim() || undefined,
      calories: Math.round(kcal), protein: r1(protein), carbs: r1(carbs), fat: r1(fat),
      fiber: r1(per(v.fiber) ?? 0), sugar: r1(per(v.sugar) ?? 0), sodium: Math.round(per(v.sodium) ?? 0),
      satFat: v.satFat !== undefined ? r1(per(v.satFat)!) : undefined,
      liquid: isDrink || undefined,
      source: 'etiqueta',
      servingSize: portionG ?? 100,
      servings: portionG ? [{ description: `1 porción (${portionG} ${isDrink ? 'ml' : 'g'})`, grams: portionG }] : [],
    };
    await foodSearchService.contributeBarcode(code, food);
    onSaved(food);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
            <Text style={s.title}>Agregar producto</Text>
            <Text style={s.sub}>
              El código {code} no tiene tabla nutricional en ninguna base. Cópiala del envase y queda guardado para la próxima vez.
            </Text>

            <Text style={s.label}>Nombre</Text>
            <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Ej: Galletas Tritón vainilla" placeholderTextColor={T.textMuted} />
            <Text style={s.label}>Marca (opcional)</Text>
            <TextInput style={s.input} value={brand} onChangeText={setBrand} placeholder="Ej: McKay" placeholderTextColor={T.textMuted} />

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Porción ({isDrink ? 'ml' : 'g'})</Text>
                <TextInput style={s.input} value={portion} onChangeText={setPortion} keyboardType="decimal-pad" placeholder="Ej: 30" placeholderTextColor={T.textMuted} />
              </View>
              <TouchableOpacity style={[s.chip, isDrink && s.chipOn, { alignSelf: 'flex-end', marginBottom: 2 }]} onPress={() => setIsDrink(!isDrink)}>
                <Text style={[s.chipText, isDrink && s.chipTextOn]}>Es bebida</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>¿Qué columna estás copiando?</Text>
            <View style={s.row}>
              {(['100', 'porcion'] as const).map((b) => (
                <TouchableOpacity key={b} style={[s.chip, basis === b && s.chipOn]} onPress={() => setBasis(b)}>
                  <Text style={[s.chipText, basis === b && s.chipTextOn]}>{b === '100' ? `100 ${isDrink ? 'ml' : 'g'}` : '1 porción'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.table}>
              {FIELDS.map((f) => (
                <View key={f.key} style={s.tableRow}>
                  <Text style={[s.tableLabel, f.label.startsWith('  ') && s.tableSub]}>{f.label.trim()}{f.required ? ' *' : ''}</Text>
                  <TextInput
                    style={s.tableInput}
                    value={vals[f.key]}
                    onChangeText={(t) => setVals((p) => ({ ...p, [f.key]: t }))}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={T.textMuted}
                  />
                  <Text style={s.tableUnit}>{f.unit}</Text>
                </View>
              ))}
            </View>

            {error && <Text style={s.error}>{error}</Text>}
          </ScrollView>
          <View style={s.actions}>
            <TouchableOpacity style={s.btnGhost} onPress={onClose}><Text style={s.btnGhostText}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={s.btn} onPress={save}><Text style={s.btnText}>Guardar y usar</Text></TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.bgCard, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, padding: 20, maxHeight: '92%', borderWidth: 1, borderColor: T.border },
  title: { color: T.text, fontSize: 19, fontWeight: '700' },
  sub: { color: T.textLight, fontSize: 13, marginTop: 6, lineHeight: 18 },
  label: { color: T.textLight, fontSize: 12, marginTop: 14, marginBottom: 6, letterSpacing: 0.3 },
  input: { backgroundColor: T.bgInput, color: T.text, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: T.border },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: R.full, borderWidth: 1, borderColor: T.border, backgroundColor: T.bgInput },
  chipOn: { borderColor: T.accent, backgroundColor: T.accentGlow },
  chipText: { color: T.textLight, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: T.accent },
  table: { marginTop: 16, borderRadius: R.md, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: T.border },
  tableLabel: { flex: 1, color: T.text, fontSize: 14 },
  tableSub: { color: T.textLight, paddingLeft: 12, fontSize: 13 },
  tableInput: { width: 80, color: T.text, fontSize: 15, textAlign: 'right', paddingVertical: 8 },
  tableUnit: { width: 34, color: T.textMuted, fontSize: 12, textAlign: 'right' },
  error: { color: T.red, marginTop: 12, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btnGhost: { flex: 1, paddingVertical: 13, borderRadius: R.md, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
  btnGhostText: { color: T.textLight, fontWeight: '600' },
  btn: { flex: 1.4, paddingVertical: 13, borderRadius: R.md, backgroundColor: T.accent, alignItems: 'center' },
  btnText: { color: '#04131a', fontWeight: '700' },
});

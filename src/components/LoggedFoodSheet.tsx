// ============================================================
// Eris Mobile — detalle y edición de lo anotado (fase I4, 2026-10-23)
//
// Pedido del usuario: al tocar algo anotado en Nutrición, ver su detalle completo y poder corregirlo.
// - Detalle: la porción (macros, fibra, azúcar, sodio, grasa saturada y agua), la calidad (letra, sellos, NOVA y
//   grupo), los alérgenos y de dónde salen los datos.
// - Edición: la cantidad (porciones o gramos), la comida y la hora, y «Editar información nutricional», que guarda TU
//   versión del alimento y la usa desde ahí (buscador y chat).
// La hoja solo junta los cambios: el registro (Health Connect, servidor, agua de la bebida) lo hace NutritionScreen.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Modal, StyleSheet } from 'react-native';
import { KeyboardLiftView } from './KeyboardLift';
import { T, R, S } from '../config/design';
import InfoTip from './InfoTip';
import type { FoodItem, LoggedFood } from '../services/FoodSearchService';
import type { MealSlot } from '../services/mealSlots';
import { detailOf, SOURCE_LABEL, ALLERGEN_LABEL, NOVA_LABEL, GROUP_LABEL } from '../services/foodDetail';
import { hhmm } from '../services/mealSchedule';
import { forgeStore } from '../services/forge/forgeStore';
import { fmtMicro } from '../services/supplements/supplementCore';

export type Per100Edit = Pick<FoodItem, 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar' | 'sodium' | 'satFat'>;

export interface LoggedFoodChanges {
  grams: number;
  mealType: string;
  /** la hora que puso la persona (null = no la tocó: si cambió la comida, la pone la pantalla según esa comida) */
  at: Date | null;
  /** valores nuevos por 100 g/ml: se guardan como tu versión del alimento */
  per100?: Per100Edit;
}

interface Props {
  entry: LoggedFood | null;
  slots: MealSlot[];
  slotLabel: (id: string) => string;
  wakeHour?: number;
  onClose: () => void;
  onSave: (entry: LoggedFood, changes: LoggedFoodChanges) => Promise<void>;
  onDelete: (entry: LoggedFood) => void;
  /** «Dejar de usar mi versión»: el buscador y el chat vuelven a la base */
  onForgetMine: (entry: LoggedFood) => Promise<void>;
}

const LETTER_COLOR: Record<string, string> = { A: T.green, B: '#9ad16b', C: T.gold, D: '#f0a35b', E: T.red };
const num = (v: string): number | undefined => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const parseHour = (v: string): { h: number; m: number } | null => {
  const m = v.trim().match(/^(\d{1,2})(?:[:.,h ]?(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2] ?? 0);
  return h <= 23 && mi <= 59 ? { h, m: mi } : null;
};

const FIELDS: Array<{ key: keyof Per100Edit; label: string; unit: string }> = [
  { key: 'calories', label: 'Calorías', unit: 'kcal' },
  { key: 'protein', label: 'Proteína', unit: 'g' },
  { key: 'carbs', label: 'Carbohidratos', unit: 'g' },
  { key: 'fat', label: 'Grasas', unit: 'g' },
  { key: 'fiber', label: 'Fibra', unit: 'g' },
  { key: 'sugar', label: 'Azúcares', unit: 'g' },
  { key: 'satFat', label: 'Grasa saturada', unit: 'g' },
  { key: 'sodium', label: 'Sodio', unit: 'mg' },
];

export default function LoggedFoodSheet({ entry, slots, slotLabel, wakeHour, onClose, onSave, onDelete, onForgetMine }: Props) {
  const [editing, setEditing] = useState(false);
  const [grams, setGrams] = useState('');
  const [meal, setMeal] = useState('');
  const [time, setTime] = useState('');
  const [timeTouched, setTimeTouched] = useState(false);
  const [nutriOpen, setNutriOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [allMicros, setAllMicros] = useState(false);

  useEffect(() => {
    if (!entry) return;
    const f = entry.food;
    setEditing(false); setNutriOpen(false); setError(null); setSaving(false); setTimeTouched(false); setAllMicros(false);
    setGrams(String(entry.grams));
    setMeal(entry.mealType);
    setTime(hhmm(new Date(entry.loggedAt)));
    setVals(Object.fromEntries(FIELDS.map(({ key }) => [key, f[key] == null ? '' : String(f[key]).replace('.', ',')])));
  }, [entry]);

  const d = useMemo(() => {
    if (!entry) return null;
    const fs = forgeStore.get();
    return detailOf(entry, wakeHour, { sex: fs?.sex ?? null, age: fs?.age ?? null });
  }, [entry, wakeHour]);
  if (!entry || !d) return null;
  const f = entry.food;
  const unit = d.unit;
  const g = num(grams) ?? 0;
  const servings = (f.servings ?? []).filter((x) => x.grams > 0).slice(0, 6);
  const visibleSlots = slots.filter((x) => !x.hidden || x.id === entry.mealType);

  // Lo que quedaría al guardar (kcal con los valores nuevos si se están editando)
  const kcal100 = nutriOpen ? (num(vals.calories ?? '') ?? f.calories) : f.calories;
  const previewKcal = Math.round((kcal100 * g) / 100);

  const shiftTime = (min: number) => {
    const p = parseHour(time) ?? { h: new Date(entry.loggedAt).getHours(), m: new Date(entry.loggedAt).getMinutes() };
    const total = (((p.h * 60 + p.m + min) % 1440) + 1440) % 1440;
    setTime(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`);
    setTimeTouched(true);
  };

  const save = async () => {
    setError(null);
    if (!(g > 0) || g > 5000) return setError(`Escribe la cantidad en ${unit === 'ml' ? 'ml' : 'gramos'} (por ejemplo ${unit === 'ml' ? '250' : '150'}).`);
    let at: Date | null = null;
    if (timeTouched) {
      const p = parseHour(time);
      if (!p) return setError('La hora va como 13:30.');
      at = new Date(entry.loggedAt);
      at.setHours(p.h, p.m, 0, 0);
    }
    let per100: Per100Edit | undefined;
    if (nutriOpen) {
      const v = (k: keyof Per100Edit) => num(vals[k] ?? '');
      const kcal = v('calories'), protein = v('protein'), carbs = v('carbs'), fat = v('fat');
      if (kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) return setError('Faltan las calorías, la proteína, los carbohidratos o las grasas.');
      // Mismas reglas que al cargar la tabla de un envase (AddProductModal)
      if (kcal > 900 || protein + carbs + fat > 105) return setError('Los números no cuadran para 100 g. Revisa que sean por 100 g o 100 ml, no por porción.');
      const sodium = v('sodium');
      if (sodium !== undefined && sodium > 40000) return setError('El sodio va en miligramos (mg): por ejemplo 450 mg.');
      per100 = {
        calories: Math.round(kcal), protein, carbs, fat, fiber: v('fiber') ?? 0, sugar: v('sugar') ?? 0,
        sodium: Math.round(sodium ?? 0), satFat: v('satFat'),
      };
    }
    setSaving(true);
    try {
      await onSave(entry, { grams: Math.round(g * 10) / 10, mealType: meal, at, per100 });
    } catch {
      setSaving(false);
      setError('No se pudo guardar. Inténtalo de nuevo.');
    }
  };

  const at = new Date(entry.loggedAt);
  const a = d.allergens;
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardLiftView style={s.overlay}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel="Cerrar" />
        <View style={s.card}>
          <View style={s.grabber} />
          <View style={s.header}>
            <View style={s.flex}>
              <Text style={s.title}>{f.name}</Text>
              {!!f.brand && <Text style={s.brand}>{f.brand}</Text>}
              <Text style={s.when}>
                {slotLabel(entry.mealType)} · {entry.approxTime ? `~${hhmm(at)}` : hhmm(at)}{f.mine ? ' · tu versión' : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Cerrar">
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: S.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {!editing ? (
              <>
                {/* ── La porción ── */}
                <View style={s.portion}>
                  <View>
                    <Text style={s.kcal}>{d.kcal}<Text style={s.kcalUnit}> kcal</Text></Text>
                    <Text style={s.grams}>{fmt(d.grams)} {unit}</Text>
                  </View>
                  <View style={s.macros}>
                    <Macro label="Proteína" value={d.protein} color={T.accent} />
                    <Macro label="Carbos" value={d.carbs} color={T.purple} />
                    <Macro label="Grasas" value={d.fat} color={T.red} />
                  </View>
                </View>

                <View style={s.rows}>
                  <Row label="Fibra" value={`${fmt(d.fiber)} g`} />
                  <Row label="Azúcares" value={d.sugar == null ? 'sin dato' : `${fmt(d.sugar)} g`} muted={d.sugar == null} />
                  <Row label="Sodio" value={d.sodiumMg == null ? 'sin dato' : `${d.sodiumMg} mg`} est={d.estimated.includes('sodio')} muted={d.sodiumMg == null} />
                  <Row label="Grasa saturada" value={d.satFat == null ? 'sin dato' : `${fmt(d.satFat)} g`} est={d.estimated.includes('grasa saturada')} muted={d.satFat == null} />
                  {d.drinkWaterL > 0
                    ? <Row label="Agua" value={`+${Math.round(d.drinkWaterL * 1000)} ml a lo bebido`} />
                    : d.waterL >= 0.005 ? <Row label="Agua que trae" value={`${Math.round(d.waterL * 1000)} ml`} /> : null}
                </View>
                {d.estimated.length > 0 && <Text style={s.note}>≈ estimado con la base de Eris por el nombre (esta fuente no lo trae).</Text>}

                {/* ── Calidad ── */}
                <View style={s.sectionHead}>
                  <Text style={s.sectionLabel}>CALIDAD</Text>
                  <InfoTip id="calidad_alimento" size={16} color={T.textMuted} />
                </View>
                <View style={s.quality}>
                  <View style={[s.letter, { borderColor: LETTER_COLOR[d.letter] }]}>
                    <Text style={[s.letterText, { color: LETTER_COLOR[d.letter] }]}>{d.letter}</Text>
                  </View>
                  <View style={s.flex}>
                    <Text style={s.qualityLine}>{NOVA_LABEL[d.nova] ?? `NOVA ${d.nova}`}</Text>
                    <Text style={s.qualitySub}>{GROUP_LABEL[d.group]} · NOVA {d.nova}</Text>
                  </View>
                </View>
                {d.sellos.length > 0 && (
                  <View style={s.chips}>
                    {d.sellos.map((x) => (
                      <View key={x} style={s.sello}><Text style={s.selloText}>ALTO EN {x.toUpperCase()}</Text></View>
                    ))}
                  </View>
                )}

                {/* ── Vitaminas y minerales (base de Eris con USDA, Open Food Facts) ── */}
                {d.micros && (
                  <>
                    <View style={s.sectionHead}>
                      <Text style={s.sectionLabel}>VITAMINAS Y MINERALES</Text>
                      <InfoTip id="vitaminas" size={16} color={T.textMuted} />
                    </View>
                    {(allMicros ? d.micros : [...d.micros].sort((x, y) => y.pct - x.pct).slice(0, 5)).map((m) => (
                      <View key={m.key} style={s.microRow}>
                        <Text style={s.microName} numberOfLines={1}>{m.nombre}</Text>
                        <View style={s.microBar}><View style={[s.microFill, { width: `${Math.min(100, m.pct)}%` }]} /></View>
                        <Text style={s.microVal}>{fmtMicro(m.key, m.valor)}</Text>
                        <Text style={s.microPct}>{m.pct} %</Text>
                      </View>
                    ))}
                    {d.micros.length > 5 && (
                      <TouchableOpacity onPress={() => setAllMicros((x) => !x)} style={s.linkBtn}>
                        <Text style={s.linkText}>{allMicros ? 'Ver menos' : `Ver las ${d.micros.length}`}</Text>
                      </TouchableOpacity>
                    )}
                    <Text style={s.note}>% de lo recomendado al día para ti (NIH).{d.microsEstimated ? ` ≈ Valores de «${f.name}» en la base de Eris.` : ''}</Text>
                  </>
                )}

                {/* ── Alérgenos ── */}
                <View style={s.sectionHead}>
                  <Text style={s.sectionLabel}>ALÉRGENOS</Text>
                  <InfoTip id="alergenos" size={16} color={T.textMuted} />
                </View>
                {a.declared.length + a.traces.length + a.byName.length === 0 ? (
                  <Text style={s.text}>Ninguno conocido. Si tienes una alergia, revisa la etiqueta.</Text>
                ) : (
                  <View style={{ gap: 6 }}>
                    {a.declared.length > 0 && <Text style={s.text}><Text style={s.bold}>Contiene: </Text>{a.declared.map((t) => ALLERGEN_LABEL[t] ?? t).join(', ')}</Text>}
                    {a.traces.length > 0 && <Text style={s.text}><Text style={s.bold}>Puede contener trazas de: </Text>{a.traces.map((t) => ALLERGEN_LABEL[t] ?? t).join(', ')}</Text>}
                    {a.byName.length > 0 && <Text style={s.text}><Text style={s.bold}>Por su nombre, puede tener: </Text>{a.byName.map((t) => ALLERGEN_LABEL[t] ?? t).join(', ')}</Text>}
                  </View>
                )}

                {/* ── Fuente ── */}
                <View style={s.sectionHead}><Text style={s.sectionLabel}>DE DÓNDE SALEN LOS DATOS</Text></View>
                <Text style={s.text}>{SOURCE_LABEL[d.source]}</Text>
                {f.mine && (
                  <TouchableOpacity style={s.linkBtn} onPress={() => onForgetMine(entry)}>
                    <Text style={s.linkText}>Dejar de usar mi versión</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                {/* ── Cantidad ── */}
                <Text style={s.sectionLabel}>CANTIDAD</Text>
                {servings.length > 0 && (
                  <View style={s.chips}>
                    {servings.map((sv) => {
                      const on = Math.abs(g - sv.grams) < 0.5;
                      return (
                        <TouchableOpacity key={`${sv.description}_${sv.grams}`} style={[s.chip, on && s.chipOn]} onPress={() => setGrams(String(sv.grams))}>
                          <Text style={[s.chipText, on && s.chipTextOn]}>{sv.description}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                <View style={s.inline}>
                  <TextInput
                    style={[s.input, s.flex]} value={grams} onChangeText={setGrams} keyboardType="decimal-pad"
                    placeholder={unit === 'ml' ? '250' : '150'} placeholderTextColor={T.textMuted} accessibilityLabel={`Cantidad en ${unit}`}
                  />
                  <Text style={s.unit}>{unit}</Text>
                  <Text style={s.preview}>{previewKcal} kcal</Text>
                </View>

                {/* ── Comida y hora ── */}
                <Text style={[s.sectionLabel, { marginTop: S.lg }]}>COMIDA</Text>
                <View style={s.chips}>
                  {visibleSlots.map((sl) => (
                    <TouchableOpacity key={sl.id} style={[s.chip, meal === sl.id && s.chipOn]} onPress={() => setMeal(sl.id)}>
                      <Text style={[s.chipText, meal === sl.id && s.chipTextOn]}>{sl.emoji} {sl.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[s.sectionLabel, { marginTop: S.lg }]}>HORA</Text>
                <View style={s.inline}>
                  <TouchableOpacity style={s.step} onPress={() => shiftTime(-15)} accessibilityLabel="15 minutos antes"><Text style={s.stepText}>−15</Text></TouchableOpacity>
                  <TextInput
                    style={[s.input, s.timeInput]} value={time} onChangeText={(v) => { setTime(v); setTimeTouched(true); }}
                    keyboardType="numbers-and-punctuation" maxLength={5} accessibilityLabel="Hora"
                  />
                  <TouchableOpacity style={s.step} onPress={() => shiftTime(15)} accessibilityLabel="15 minutos después"><Text style={s.stepText}>+15</Text></TouchableOpacity>
                </View>
                {!timeTouched && meal !== entry.mealType && <Text style={s.note}>Queda a la hora de esa comida, salvo que cambies la hora.</Text>}

                {/* ── Información nutricional (tu versión) ── */}
                <TouchableOpacity style={s.nutriToggle} onPress={() => setNutriOpen((x) => !x)}>
                  <Text style={s.nutriToggleText}>{nutriOpen ? '▾' : '▸'} Editar información nutricional</Text>
                  <InfoTip id="tu_version" size={16} color={T.textMuted} />
                </TouchableOpacity>
                {nutriOpen && (
                  <View style={s.nutriBox}>
                    <Text style={s.note}>Por 100 {unit}. Se guarda como tu versión de «{f.name}» y se usa desde ahora, en el buscador y en el chat.</Text>
                    {FIELDS.map(({ key, label, unit: u }) => (
                      <View key={key} style={s.fieldRow}>
                        <Text style={s.fieldLabel}>{label}</Text>
                        <TextInput
                          style={[s.input, s.fieldInput]} value={vals[key] ?? ''} keyboardType="decimal-pad"
                          onChangeText={(v) => setVals((x) => ({ ...x, [key]: v }))} placeholder="—" placeholderTextColor={T.textMuted}
                          accessibilityLabel={`${label} por 100 ${unit}`}
                        />
                        <Text style={s.fieldUnit}>{u}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
            {!!error && <Text style={s.error}>{error}</Text>}
          </ScrollView>

          <View style={s.actions}>
            {!editing ? (
              <>
                <TouchableOpacity style={s.deleteBtn} onPress={() => onDelete(entry)} accessibilityLabel={`Eliminar ${f.name}`}>
                  <Text style={s.deleteText}>Eliminar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.primary} onPress={() => setEditing(true)}>
                  <Text style={s.primaryText}>Editar</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={s.secondary} onPress={() => { setEditing(false); setError(null); }} disabled={saving}>
                  <Text style={s.secondaryText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.primary, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                  <Text style={s.primaryText}>{saving ? 'Guardando…' : 'Guardar cambios'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </KeyboardLiftView>
    </Modal>
  );
}

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.macro}>
      <Text style={[s.macroValue, { color }]}>{fmt(value)}<Text style={s.macroUnit}> g</Text></Text>
      <Text style={s.macroLabel}>{label}</Text>
    </View>
  );
}

function Row({ label, value, est, muted }: { label: string; value: string; est?: boolean; muted?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, muted && { color: T.textMuted, fontWeight: '500' }]}>{est ? '≈ ' : ''}{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  card: { backgroundColor: '#0e0e18', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', borderTopWidth: 1, borderColor: T.border, paddingBottom: 24 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: T.border },
  title: { color: T.text, fontSize: 18, fontWeight: '800' },
  brand: { color: T.textMuted, fontSize: 12, marginTop: 2 },
  when: { color: T.textLight, fontSize: 12, marginTop: 6 },
  close: { color: T.textMuted, fontSize: 18, fontWeight: '700' },
  body: { paddingHorizontal: S.lg, paddingTop: S.md },

  portion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: T.bgCard, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: T.border },
  kcal: { color: T.gold, fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  kcalUnit: { color: T.textMuted, fontSize: 13, fontWeight: '700' },
  grams: { color: T.textLight, fontSize: 12, marginTop: 2 },
  macros: { flexDirection: 'row', gap: 14 },
  macro: { alignItems: 'center' },
  macroValue: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  macroUnit: { fontSize: 11, color: T.textMuted, fontWeight: '600' },
  macroLabel: { color: T.textMuted, fontSize: 10, marginTop: 2 },

  rows: { marginTop: S.md, borderRadius: R.md, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: S.md, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border },
  rowLabel: { color: T.textLight, fontSize: 13 },
  rowValue: { color: T.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  note: { color: T.textMuted, fontSize: 11, marginTop: 6, lineHeight: 15 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: S.lg, marginBottom: 8 },
  sectionLabel: { color: T.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  quality: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  letter: { width: 44, height: 44, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  letterText: { fontSize: 22, fontWeight: '900' },
  qualityLine: { color: T.text, fontSize: 14, fontWeight: '700' },
  qualitySub: { color: T.textMuted, fontSize: 12, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  sello: { backgroundColor: '#000', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: '#3a3a44' },
  selloText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  text: { color: T.textLight, fontSize: 13, lineHeight: 19 },
  bold: { color: T.text, fontWeight: '700' },
  linkBtn: { marginTop: 10, alignSelf: 'flex-start' },
  linkText: { color: T.accent, fontSize: 13, fontWeight: '700' },

  microRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  microName: { color: T.textLight, fontSize: 12, width: 132 },
  microBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: T.border, overflow: 'hidden' },
  microFill: { height: 6, borderRadius: 3, backgroundColor: T.green },
  microVal: { color: T.text, fontSize: 12, fontWeight: '700', width: 64, textAlign: 'right', fontVariant: ['tabular-nums'] },
  microPct: { color: T.textMuted, fontSize: 11, width: 38, textAlign: 'right', fontVariant: ['tabular-nums'] },

  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.full, backgroundColor: T.border, borderWidth: 1, borderColor: T.border },
  chipOn: { backgroundColor: T.accentGlow, borderColor: T.accent },
  chipText: { color: T.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: T.accent },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  input: { backgroundColor: T.bgInput, color: T.text, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: '600', borderWidth: 1, borderColor: T.border },
  unit: { color: T.textMuted, fontSize: 13, fontWeight: '700' },
  preview: { color: T.gold, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 72, textAlign: 'right' },
  step: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.md, backgroundColor: T.border },
  stepText: { color: T.textLight, fontSize: 13, fontWeight: '800' },
  timeInput: { width: 84, textAlign: 'center', fontVariant: ['tabular-nums'] },

  nutriToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: S.lg, paddingVertical: 6 },
  nutriToggleText: { color: T.accent, fontSize: 14, fontWeight: '700' },
  nutriBox: { marginTop: 4, gap: 8 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldLabel: { color: T.textLight, fontSize: 13, flex: 1 },
  fieldInput: { width: 96, textAlign: 'right', paddingVertical: 8, fontSize: 15 },
  fieldUnit: { color: T.textMuted, fontSize: 12, width: 32 },
  error: { color: T.red, fontSize: 12, marginTop: S.md },

  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: S.lg, paddingTop: S.md, borderTopWidth: 1, borderTopColor: T.border },
  primary: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: T.accent, alignItems: 'center' },
  primaryText: { color: '#000', fontSize: 14, fontWeight: '800' },
  secondary: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: T.border, alignItems: 'center' },
  secondaryText: { color: T.textLight, fontSize: 14, fontWeight: '700' },
  deleteBtn: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 12, backgroundColor: T.redGlow, alignItems: 'center' },
  deleteText: { color: T.red, fontSize: 14, fontWeight: '700' },
});

// ============================================================
// Eris Mobile — FoodSearchModal
// Búsqueda FatSecret + estimación glucémica antes de confirmar
// ============================================================

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, Modal, StyleSheet, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Alert,
} from 'react-native';
import { T, R, S } from '../../config/design';
import type { MobileGlucoService, FoodSearchResult, FoodDetail, MealLogEntry } from '../../services/GlucoService';
import BarcodeScanner from './BarcodeScanner';

interface MealItem {
  food: FoodDetail;
  portionMultiplier: number;
}

interface Props {
  visible: boolean;
  service: MobileGlucoService;
  onClose: () => void;
  onSave: (entry: MealLogEntry) => void;
}

export default function FoodSearchModal({ visible, service, onClose, onSave }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [mealItems, setMealItems] = useState<MealItem[]>([]);
  const [step, setStep] = useState<'search' | 'review'>('search');
  const [saving, setSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await service.searchFoods(text);
        setResults(res.items.slice(0, 10));
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 600);
  }, [service]);

  const handleSelectFood = async (item: FoodSearchResult) => {
    try {
      const detail = await service.getFoodDetail(item.id);
      setMealItems(prev => [...prev, { food: detail, portionMultiplier: 1 }]);
    } catch (e) {
      console.warn('Error al obtener detalle:', e);
    }
  };

  const handleBarcode = async (code: string) => {
    setShowScanner(false);
    setBarcodeError(null);
    setSearching(true);
    try {
      const food = await service.lookupByBarcode(code);
      if (food) {
        setMealItems(prev => [...prev, { food, portionMultiplier: 1 }]);
      } else {
        setBarcodeError(`Producto no encontrado (${code}). Prueba buscarlo por nombre.`);
      }
    } catch {
      setBarcodeError('Error al consultar el producto. Verifica la conexión con Eris.');
    } finally {
      setSearching(false);
    }
  };

  const handleChangePortion = (idx: number, delta: number) => {
    setMealItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const next = Math.max(0.25, parseFloat((item.portionMultiplier + delta).toFixed(2)));
      return { ...item, portionMultiplier: next };
    }));
  };

  const handleRemoveItem = (idx: number) => {
    setMealItems(prev => prev.filter((_, i) => i !== idx));
  };

  // Cálculo de estimación (GL simplificado)
  const estimation = React.useMemo(() => {
    if (mealItems.length === 0) return null;
    let totalCal = 0, totalCarbs = 0, totalFiber = 0, totalProt = 0, totalFat = 0;
    for (const { food, portionMultiplier } of mealItems) {
      const s = food.defaultServing;
      totalCal  += s.calories * portionMultiplier;
      totalCarbs += s.carbs * portionMultiplier;
      totalFiber += s.fiber * portionMultiplier;
      totalProt  += s.protein * portionMultiplier;
      totalFat   += s.fat * portionMultiplier;
    }
    const netCarbs = Math.max(0, totalCarbs - totalFiber);
    const gi = 60; // GI genérico — en v2 se hace lookup por nombre
    const gl = parseFloat(((gi * netCarbs) / 100).toFixed(1));
    const adjGL = parseFloat((gl * Math.max(0.5, 1 - totalProt * 0.005) * Math.max(0.6, 1 - totalFat * 0.003)).toFixed(1));
    const risk: MealLogEntry['riskLevel'] = adjGL <= 10 ? 'low' : adjGL <= 19 ? 'medium' : adjGL <= 30 ? 'high' : 'very_high';
    return { totalCal: Math.round(totalCal), totalCarbs: Math.round(totalCarbs), totalFiber: Math.round(totalFiber), totalProt: Math.round(totalProt), totalFat: Math.round(totalFat), gl: adjGL, risk };
  }, [mealItems]);

  const handleSave = async () => {
    if (!estimation || mealItems.length === 0) return;
    setSaving(true);
    const entry: MealLogEntry = {
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      timestamp: new Date().toISOString(),
      foods: mealItems.map(({ food, portionMultiplier }) => ({
        foodId: food.id,
        name: food.name,
        servingDescription: food.defaultServing.description,
        portionMultiplier,
        calories: Math.round(food.defaultServing.calories * portionMultiplier),
        carbs: Math.round(food.defaultServing.carbs * portionMultiplier),
        protein: Math.round(food.defaultServing.protein * portionMultiplier),
        fat: Math.round(food.defaultServing.fat * portionMultiplier),
      })),
      totalCalories: estimation.totalCal,
      estimatedGL: estimation.gl,
      riskLevel: estimation.risk,
    };
    setSaving(false);
    onSave(entry);
    // reset
    setQuery(''); setResults([]); setMealItems([]); setStep('search');
  };

  const handleClose = () => {
    setQuery(''); setResults([]); setMealItems([]); setStep('search');
    setBarcodeError(null); setShowScanner(false);
    onClose();
  };

  const riskColors: Record<string, string> = { low: T.green, medium: T.gold, high: T.red, very_high: '#dc2626' };
  const riskLabels: Record<string, string> = { low: '🟢 Bajo', medium: '🟡 Moderado', high: '🔴 Alto', very_high: '🔴 Muy Alto' };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Barra superior */}
        <View style={s.topBar}>
          <Text style={s.title}>Registrar Comida</Text>
          <TouchableOpacity onPress={handleClose} style={s.closeBtn}>
            <Text style={s.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Búsqueda */}
        <View style={s.searchRow}>
          <TextInput
            style={s.input}
            placeholder="Buscar alimento…"
            placeholderTextColor={T.textMuted}
            value={query}
            onChangeText={handleSearch}
            autoFocus
          />
          <TouchableOpacity
            style={s.scanBtn}
            onPress={() => { setBarcodeError(null); setShowScanner(true); }}
            accessibilityLabel="Escanear código de barras"
          >
            {searching
              ? <ActivityIndicator size="small" color={T.accent} />
              : <Text style={s.scanBtnIcon}>📷</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Error de barcode */}
        {barcodeError && (
          <View style={s.barcodeError}>
            <Text style={s.barcodeErrorText}>{barcodeError}</Text>
          </View>
        )}

        {/* Resultados */}
        {results.length > 0 && (
          <View style={s.resultsBox}>
            <FlatList
              data={results}
              keyExtractor={i => i.id}
              style={{ maxHeight: 200 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.resultItem} onPress={() => handleSelectFood(item)}>
                  <Text style={s.resultName}>{item.name}{item.brandName ? ` · ${item.brandName}` : ''}</Text>
                  <Text style={s.resultDesc} numberOfLines={1}>{item.description}</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: T.border }} />}
            />
          </View>
        )}

        {/* Comida seleccionada */}
        <ScrollView style={s.mealList} contentContainerStyle={{ gap: 8 }}>
          {mealItems.length > 0 && (
            <Text style={s.sectionLabel}>COMIDA ACTUAL</Text>
          )}
          {mealItems.map(({ food, portionMultiplier }, idx) => {
            const s2 = food.defaultServing;
            return (
              <View key={idx} style={s.mealItem}>
                <View style={{ flex: 1 }}>
                  <Text style={s.mealName}>{food.name}</Text>
                  <Text style={s.mealMacros}>
                    {Math.round(s2.calories * portionMultiplier)} kcal · C {Math.round(s2.carbs * portionMultiplier)}g · P {Math.round(s2.protein * portionMultiplier)}g · G {Math.round(s2.fat * portionMultiplier)}g
                  </Text>
                </View>
                <View style={s.portionCtrl}>
                  <TouchableOpacity style={s.portBtn} onPress={() => handleChangePortion(idx, -0.25)}>
                    <Text style={s.portBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.portVal}>{portionMultiplier}×</Text>
                  <TouchableOpacity style={s.portBtn} onPress={() => handleChangePortion(idx, 0.25)}>
                    <Text style={s.portBtnText}>+</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRemoveItem(idx)} style={{ marginLeft: 6 }}>
                    <Text style={{ color: T.textMuted, fontSize: 16 }}>×</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {/* Estimación glucémica */}
          {estimation && (
            <View style={[s.estimCard, { borderColor: (riskColors[estimation.risk] + '55') }]}>
              <Text style={s.estimTitle}>Estimación Glucémica</Text>
              <View style={s.estimRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.estimGL}>{estimation.gl} GL</Text>
                  <Text style={s.estimSubGL}>Carga Glucémica</Text>
                </View>
                <View style={[s.riskBadge, { backgroundColor: riskColors[estimation.risk] + '22', borderColor: riskColors[estimation.risk] + '55' }]}>
                  <Text style={[s.riskText, { color: riskColors[estimation.risk] }]}>{riskLabels[estimation.risk]}</Text>
                </View>
              </View>
              <Text style={s.estimMacros}>
                {estimation.totalCal} kcal · Carbs {estimation.totalCarbs}g · Fibra {estimation.totalFiber}g · Prot {estimation.totalProt}g · Grasa {estimation.totalFat}g
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Botón guardar */}
        {mealItems.length > 0 && (
          <View style={s.footer}>
            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={T.bg} />
                : <Text style={s.saveBtnText}>Guardar Comida</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Escáner de código de barras */}
      <BarcodeScanner
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onBarcode={handleBarcode}
      />
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: S.md, paddingTop: S.lg, borderBottomWidth: 1, borderColor: T.border },
  title: { fontSize: 18, fontWeight: '800', color: T.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: T.bgCard, justifyContent: 'center', alignItems: 'center' },
  closeText: { color: T.textMuted, fontSize: 14 },
  searchRow: { flexDirection: 'row', alignItems: 'center', margin: S.md, marginBottom: 0, gap: 8 },
  input: { flex: 1, backgroundColor: T.bgInput, borderRadius: R.md, padding: S.sm, color: T.text, fontSize: 15, borderWidth: 1, borderColor: T.border },
  scanBtn: {
    width: 44, height: 44, borderRadius: R.md,
    backgroundColor: T.accentGlow, borderWidth: 1, borderColor: T.borderActive,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  scanBtnIcon: { fontSize: 20 },
  barcodeError: {
    marginHorizontal: S.md, marginTop: 8,
    backgroundColor: 'rgba(244,63,94,0.1)', borderRadius: R.md,
    padding: 10, borderWidth: 1, borderColor: 'rgba(244,63,94,0.3)',
  },
  barcodeErrorText: { color: '#f43f5e', fontSize: 12, lineHeight: 18 },
  resultsBox: { marginHorizontal: S.md, marginTop: 4, backgroundColor: T.bgCard, borderRadius: R.md, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },
  resultItem: { padding: S.sm },
  resultName: { color: T.text, fontWeight: '600', fontSize: 13 },
  resultDesc: { color: T.textMuted, fontSize: 11, marginTop: 2 },
  mealList: { flex: 1, padding: S.md },
  sectionLabel: { fontSize: 10, color: T.textMuted, fontWeight: '800', letterSpacing: 2 },
  mealItem: { backgroundColor: T.bgCard, borderRadius: R.md, padding: S.sm, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: T.border },
  mealName: { color: T.text, fontWeight: '600', fontSize: 13 },
  mealMacros: { color: T.textMuted, fontSize: 11, marginTop: 2 },
  portionCtrl: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  portBtn: { width: 26, height: 26, backgroundColor: T.bgInput, borderRadius: R.sm, justifyContent: 'center', alignItems: 'center' },
  portBtnText: { color: T.accent, fontSize: 16, fontWeight: '700', lineHeight: 18 },
  portVal: { color: T.text, fontWeight: '700', fontSize: 13, minWidth: 28, textAlign: 'center' },
  estimCard: { backgroundColor: T.bgCard, borderRadius: R.lg, padding: S.md, borderWidth: 1, marginTop: 8 },
  estimTitle: { color: T.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  estimRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  estimGL: { fontSize: 32, fontWeight: '900', color: T.text },
  estimSubGL: { color: T.textMuted, fontSize: 11 },
  riskBadge: { borderRadius: R.full, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  riskText: { fontWeight: '700', fontSize: 12 },
  estimMacros: { color: T.textMuted, fontSize: 11 },
  footer: { padding: S.md, paddingBottom: S.xl, borderTopWidth: 1, borderColor: T.border },
  saveBtn: { backgroundColor: T.accent, borderRadius: R.full, padding: S.md, alignItems: 'center' },
  saveBtnText: { color: T.bg, fontWeight: '800', fontSize: 15 },
});

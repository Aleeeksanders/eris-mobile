import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, ActivityIndicator, Modal, Animated,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { insertRecords } from 'react-native-health-connect';
import { foodSearchService, FoodItem, LoggedFood } from '../services/FoodSearchService';
import { wsManager } from '../services/WebSocketManager';
import { T, R, S } from '../config/design';

const STORAGE_KEY_LOG   = 'eris_nutrition_log_v1';
const STORAGE_KEY_WATER = 'eris_water_log_v1';
const STORAGE_KEY_MEALS = 'eris_meal_slots_v1';

// ─── Meal slots ──────────────────────────────────────────────
interface MealSlot {
  id: string;
  name: string;
  emoji: string;
}

const DEFAULT_MEAL_SLOTS: MealSlot[] = [
  { id: 'desayuno',    name: 'Desayuno',         emoji: '🌅' },
  { id: 'colacion_am', name: 'Colación mañana',  emoji: '🍎' },
  { id: 'almuerzo',    name: 'Almuerzo',         emoji: '☀️' },
  { id: 'colacion_pm', name: 'Colación tarde',   emoji: '🍌' },
  { id: 'cena',        name: 'Cena',             emoji: '🌙' },
  { id: 'once',        name: 'Once',             emoji: '🫖' },
];

const MEAL_EMOJIS = ['🌅','🍳','🥞','☀️','🌮','🥗','🍎','🍌','🌙','🥛','🍵','🫖','🍽️','🥙','💪','⚡','🫐','🥑'];

const HC_MEAL_MAP: Record<string, number> = {
  desayuno: 1, almuerzo: 2, cena: 3,
  colacion_am: 4, colacion_pm: 4, once: 4, merienda: 4,
};

const PORTION_MULTS = [
  { label: '½',   value: 0.5 },
  { label: '1',   value: 1   },
  { label: '1½',  value: 1.5 },
  { label: '2',   value: 2   },
  { label: '3',   value: 3   },
];

function guessMealByTime(slots: MealSlot[]): string {
  const h = new Date().getHours();
  const hints: Array<[number, string]> = [
    [21, 'once'], [19, 'cena'], [15, 'colacion_pm'],
    [12, 'almuerzo'], [10, 'colacion_am'], [6, 'desayuno'],
  ];
  for (const [start, id] of hints) {
    if (h >= start && slots.some(s => s.id === id)) return id;
  }
  return slots[0]?.id ?? 'desayuno';
}

// ─── Componente principal ────────────────────────────────────
export default function NutritionScreen() {
  const insets = useSafeAreaInsets();

  // Meal slots
  const [mealSlots, setMealSlots] = useState<MealSlot[]>(DEFAULT_MEAL_SLOTS);
  const [activeMealId, setActiveMealId] = useState('desayuno');
  const [showMealEditor, setShowMealEditor] = useState(false);
  const [editingSlots, setEditingSlots] = useState<MealSlot[]>([]);
  const [newMealName, setNewMealName] = useState('');
  const mealSlotsRef = useRef(mealSlots);
  useEffect(() => { mealSlotsRef.current = mealSlots; }, [mealSlots]);

  // Búsqueda
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);

  // Porción
  const [selectedServingIdx, setSelectedServingIdx] = useState(0);
  const [portionMult, setPortionMult] = useState(1);
  const [useCustomGrams, setUseCustomGrams] = useState(false);
  const [customGrams, setCustomGrams] = useState('');

  // Log
  const [todayLog, setTodayLog] = useState<LoggedFood[]>([]);
  const [waterLiters, setWaterLiters] = useState(0);
  const [view, setView] = useState<'log' | 'search'>('log');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Gramos efectivos para la porción actual
  const baseGrams = selectedFood
    ? (selectedFood.servings[selectedServingIdx]?.grams ?? selectedFood.servingSize ?? 100)
    : 100;
  const effectiveGrams = useCustomGrams
    ? (parseFloat(customGrams) || 0)
    : Math.round(baseGrams * portionMult * 10) / 10;

  // ─── Init ───────────────────────────────────────────────────
  useEffect(() => {
    loadTodayData();
    loadMealSlots();
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();

    const unsub = wsManager.subscribeMessage((data) => {
      // Push en tiempo real desde Eris chat
      if (data.type === 'nutrition_logged' && data.entry) {
        handleServerLog(data.entry);
      } else if (data.type === 'hydration_logged' && data.liters != null) {
        handleServerWater(data.liters);
      }
      // Respuesta a sync_nutrition_today: re-hidratar todo el log del día
      else if (data.type === 'nutrition_today') {
        const entries: any[] = Array.isArray(data.entries) ? data.entries : [];
        entries.forEach(entry => handleServerLog(entry));
        if (data.waterLiters != null && data.waterLiters > 0) {
          // Reemplazar en vez de sumar para evitar duplicados
          setWaterLiters(data.waterLiters);
          const today = new Date().toDateString();
          AsyncStorage.setItem(`${STORAGE_KEY_WATER}_${today}`, String(data.waterLiters)).catch(() => {});
        }
      }
    });

    // Pedir al servidor el log del día (cubre entradas registradas por chat mientras la pantalla estaba cerrada)
    if (wsManager.getStatus() === 'connected') {
      wsManager.sendMessage({ type: 'sync_nutrition_today' });
    }

    return () => { unsub(); };
  }, []);

  const loadMealSlots = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_MEALS);
      const slots: MealSlot[] = raw ? JSON.parse(raw) : DEFAULT_MEAL_SLOTS;
      setMealSlots(slots);
      setActiveMealId(guessMealByTime(slots));
    } catch {
      setActiveMealId(guessMealByTime(DEFAULT_MEAL_SLOTS));
    }
  };

  const persistMealSlots = async (slots: MealSlot[]) => {
    setMealSlots(slots);
    mealSlotsRef.current = slots;
    await AsyncStorage.setItem(STORAGE_KEY_MEALS, JSON.stringify(slots));
  };

  const loadTodayData = async () => {
    const today = new Date().toDateString();
    try {
      const logRaw   = await AsyncStorage.getItem(`${STORAGE_KEY_LOG}_${today}`);
      const waterRaw = await AsyncStorage.getItem(`${STORAGE_KEY_WATER}_${today}`);
      if (logRaw)   setTodayLog(JSON.parse(logRaw));
      if (waterRaw) setWaterLiters(parseFloat(waterRaw) || 0);
    } catch {}
  };

  const saveTodayLog = async (log: LoggedFood[], water: number) => {
    const today = new Date().toDateString();
    await AsyncStorage.setItem(`${STORAGE_KEY_LOG}_${today}`, JSON.stringify(log));
    await AsyncStorage.setItem(`${STORAGE_KEY_WATER}_${today}`, String(water));
    if (wsManager.getStatus() === 'connected') {
      const t = log.reduce((acc, entry) => {
        const p = foodSearchService.calcPortion(entry.food, entry.grams);
        return {
          calories: acc.calories + p.calories,
          protein: Math.round((acc.protein + p.protein) * 10) / 10,
          carbs:   Math.round((acc.carbs   + p.carbs  ) * 10) / 10,
          fat:     Math.round((acc.fat     + p.fat    ) * 10) / 10,
        };
      }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
      wsManager.sendMessage({ type: 'update_health_snapshot', snapshot: { nutrition: t, hydration: water } });
    }
  };

  // ─── Búsqueda con debounce ───────────────────────────────
  const searchTimer = useRef<any>(null);
  const handleSearch = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const items = await foodSearchService.search(text);
      setResults(items);
      setSearching(false);
    }, 500);
  };

  const handleSelectFood = (item: FoodItem) => {
    setSelectedFood(item);
    setSelectedServingIdx(0);
    setPortionMult(1);
    setUseCustomGrams(false);
    setCustomGrams('');
  };

  // ─── Registrar alimento ──────────────────────────────────
  const handleLogFood = async () => {
    if (!selectedFood || effectiveGrams <= 0) return;

    const entry: LoggedFood = {
      food: selectedFood,
      grams: effectiveGrams,
      mealType: activeMealId,
      loggedAt: new Date().toISOString(),
    };

    const newLog = [...todayLog, entry];
    setTodayLog(newLog);
    await saveTodayLog(newLog, waterLiters);

    try {
      const portion = foodSearchService.calcPortion(selectedFood, effectiveGrams);
      await insertRecords([{
        recordType: 'Nutrition',
        startTime: entry.loggedAt,
        endTime: new Date(Date.parse(entry.loggedAt) + 60000).toISOString(),
        name: selectedFood.name,
        energy:              { value: portion.calories, unit: 'kilocalories' },
        protein:             { value: portion.protein,  unit: 'grams' },
        totalCarbohydrate:   { value: portion.carbs,    unit: 'grams' },
        totalFat:            { value: portion.fat,      unit: 'grams' },
        dietaryFiber:        { value: portion.fiber,    unit: 'grams' },
        sugar:               { value: portion.sugar,    unit: 'grams' },
        sodium:              { value: portion.sodium,   unit: 'milligrams' },
        mealType: HC_MEAL_MAP[activeMealId] ?? 0,
      }]);
    } catch {}

    setSelectedFood(null);
    setResults([]);
    setQuery('');
    setView('log');
  };

  // ─── Hidratación ─────────────────────────────────────────
  const addWater = async (liters: number) => {
    const newTotal = Math.round((waterLiters + liters) * 100) / 100;
    setWaterLiters(newTotal);
    await saveTodayLog(todayLog, newTotal);
    try {
      await insertRecords([{
        recordType: 'Hydration',
        startTime: new Date().toISOString(),
        endTime:   new Date(Date.now() + 60000).toISOString(),
        volume: { value: liters, unit: 'liters' },
      }]);
    } catch {}
  };

  // ─── Sync desde Eris chat ────────────────────────────────
  const serverToSlot = (serverMealType: string): string => {
    const slots = mealSlotsRef.current;
    if (slots.some(s => s.id === serverMealType)) return serverMealType;
    const aliases: Record<string, string> = {
      desayuno: 'desayuno', almuerzo: 'almuerzo', cena: 'cena',
      once: 'once', colacion_am: 'colacion_am', colacion_pm: 'colacion_pm',
      merienda: 'colacion_pm',
    };
    const mapped = aliases[serverMealType];
    if (mapped && slots.some(s => s.id === mapped)) return mapped;
    return slots[0]?.id ?? 'desayuno';
  };

  const handleServerLog = useCallback((entry: any) => {
    const slotId = serverToSlot(entry.mealType ?? '');
    const newEntries: LoggedFood[] = (entry.items ?? []).map((item: any) => {
      const f = item.grams > 0 ? 100 / item.grams : 1;
      const food: FoodItem = {
        id: `eris_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: item.name,
        calories: Math.round(item.calories * f),
        protein:  Math.round(item.protein  * f * 10) / 10,
        carbs:    Math.round(item.carbs    * f * 10) / 10,
        fat:      Math.round(item.fat      * f * 10) / 10,
        fiber:    Math.round(item.fiber    * f * 10) / 10,
        sugar: 0, sodium: 0,
        servingSize: item.grams,
        servings: [{ description: `${item.grams}g`, grams: item.grams }],
      };
      return { food, grams: item.grams, mealType: slotId, loggedAt: entry.timestamp };
    });
    if (newEntries.length === 0) return;
    setTodayLog(prev => {
      // Deduplicar: evitar duplicados si el sync llega después de un push en tiempo real
      const dedupeKey = (e: LoggedFood) => `${e.loggedAt}_${e.food.name}_${e.grams}`;
      const existingKeys = new Set(prev.map(dedupeKey));
      const toAdd = newEntries.filter(e => !existingKeys.has(dedupeKey(e)));
      if (toAdd.length === 0) return prev;
      const updated = [...prev, ...toAdd];
      const today = new Date().toDateString();
      AsyncStorage.setItem(`${STORAGE_KEY_LOG}_${today}`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const handleServerWater = useCallback((liters: number) => {
    setWaterLiters(prev => {
      const updated = Math.round((prev + liters) * 100) / 100;
      const today = new Date().toDateString();
      AsyncStorage.setItem(`${STORAGE_KEY_WATER}_${today}`, String(updated)).catch(() => {});
      return updated;
    });
  }, []);

  // ─── Totales ─────────────────────────────────────────────
  const totals = todayLog.reduce((acc, entry) => {
    const p = foodSearchService.calcPortion(entry.food, entry.grams);
    return {
      calories: acc.calories + p.calories,
      protein:  Math.round((acc.protein + p.protein) * 10) / 10,
      carbs:    Math.round((acc.carbs   + p.carbs  ) * 10) / 10,
      fat:      Math.round((acc.fat     + p.fat    ) * 10) / 10,
    };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Orden de display: slots configurados primero, luego entradas huérfanas (legacy)
  const logMealTypes = [...new Set(todayLog.map(e => e.mealType))];
  const orderedDisplay = [
    ...mealSlots.map(s => s.id).filter(id => logMealTypes.includes(id)),
    ...logMealTypes.filter(t => !mealSlots.some(s => s.id === t)),
  ];
  const getSlotLabel = (mealType: string) => {
    const slot = mealSlots.find(s => s.id === mealType);
    if (slot) return `${slot.emoji} ${slot.name}`;
    const legacy: Record<string, string> = { merienda: '🍎 Merienda' };
    return legacy[mealType] ?? `🍽️ ${mealType}`;
  };

  // ─── Meal editor helpers ─────────────────────────────────
  const openMealEditor = () => {
    setEditingSlots([...mealSlots]);
    setNewMealName('');
    setShowMealEditor(true);
  };

  const cycleEmoji = (i: number) => {
    const curr = editingSlots[i].emoji;
    const idx = MEAL_EMOJIS.indexOf(curr);
    const next = MEAL_EMOJIS[(idx + 1) % MEAL_EMOJIS.length];
    setEditingSlots(prev => prev.map((s, j) => j === i ? { ...s, emoji: next } : s));
  };

  const updateSlotName = (i: number, name: string) => {
    setEditingSlots(prev => prev.map((s, j) => j === i ? { ...s, name } : s));
  };

  const deleteEditSlot = (id: string) => {
    if (editingSlots.length <= 1) return;
    setEditingSlots(prev => prev.filter(s => s.id !== id));
  };

  const addEditSlot = () => {
    if (editingSlots.length >= 8 || !newMealName.trim()) return;
    const newSlot: MealSlot = {
      id: `meal_${Date.now()}`,
      name: newMealName.trim(),
      emoji: MEAL_EMOJIS[editingSlots.length % MEAL_EMOJIS.length],
    };
    setEditingSlots(prev => [...prev, newSlot]);
    setNewMealName('');
  };

  const confirmMealEditor = async () => {
    const valid = editingSlots.filter(s => s.name.trim().length > 0);
    await persistMealSlots(valid);
    if (!valid.some(s => s.id === activeMealId)) {
      setActiveMealId(valid[0]?.id ?? 'desayuno');
    }
    setShowMealEditor(false);
  };

  // ─── UI ──────────────────────────────────────────────────
  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.headerTitle}>🥗 Nutrición</Text>
        <View style={s.headerTabs}>
          <TouchableOpacity
            style={[s.headerTab, view === 'log' && s.headerTabActive]}
            onPress={() => setView('log')}
          >
            <Text style={[s.headerTabText, view === 'log' && s.headerTabTextActive]}>Registro</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.headerTab, view === 'search' && s.headerTabActive]}
            onPress={() => setView('search')}
          >
            <Text style={[s.headerTabText, view === 'search' && s.headerTabTextActive]}>+ Agregar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {view === 'log' ? (
        <ScrollView style={s.flex} contentContainerStyle={{ padding: 16 }}>
          {/* Resumen del día */}
          <View style={s.summaryCard}>
            <Text style={s.summaryTitle}>RESUMEN DE HOY</Text>
            <View style={s.macroRow}>
              <MacroStat label="Calorías" value={totals.calories} unit="kcal" color={T.gold} />
              <MacroStat label="Proteína" value={totals.protein}  unit="g"    color={T.accent} />
              <MacroStat label="Carbos"   value={totals.carbs}    unit="g"    color={T.purple} />
              <MacroStat label="Grasas"   value={totals.fat}      unit="g"    color={T.red} />
            </View>
          </View>

          {/* Hidratación */}
          <View style={s.waterCard}>
            <View style={s.waterHeader}>
              <Text style={s.waterTitle}>💧 Hidratación</Text>
              <Text style={s.waterTotal}>{waterLiters}L / 2.5L</Text>
            </View>
            <View style={s.waterBar}>
              <View style={[s.waterFill, { width: `${Math.min((waterLiters / 2.5) * 100, 100)}%` as any }]} />
            </View>
            <View style={s.waterBtns}>
              {[0.25, 0.35, 0.5, 1].map(l => (
                <TouchableOpacity key={l} style={s.waterBtn} onPress={() => addWater(l)}>
                  <Text style={s.waterBtnText}>+{l === 1 ? '1L' : `${l * 1000}ml`}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Log por comida */}
          {orderedDisplay.map(mealType => {
            const items = todayLog.filter(e => e.mealType === mealType);
            if (items.length === 0) return null;
            const mealTotal = items.reduce((acc, entry) => {
              const p = foodSearchService.calcPortion(entry.food, entry.grams);
              return acc + p.calories;
            }, 0);
            return (
              <View key={mealType} style={s.mealSection}>
                <View style={s.mealSectionHeader}>
                  <Text style={s.mealSectionTitle}>{getSlotLabel(mealType)}</Text>
                  <Text style={s.mealSectionCal}>{mealTotal} kcal</Text>
                </View>
                {items.map((entry, idx) => {
                  const p = foodSearchService.calcPortion(entry.food, entry.grams);
                  return (
                    <View key={idx} style={s.foodEntry}>
                      <View style={s.foodEntryLeft}>
                        <Text style={s.foodEntryName}>{entry.food.name}</Text>
                        {entry.food.brand && <Text style={s.foodEntryBrand}>{entry.food.brand}</Text>}
                        <Text style={s.foodEntryDetail}>
                          {entry.grams}g · {p.protein}g prot · {p.carbs}g carbos · {p.fat}g grasas
                        </Text>
                      </View>
                      <Text style={s.foodEntryCal}>{p.calories}</Text>
                    </View>
                  );
                })}
              </View>
            );
          })}

          {todayLog.length === 0 && (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🍽️</Text>
              <Text style={s.emptyText}>No has registrado comidas hoy</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => setView('search')}>
                <Text style={s.emptyBtnText}>Registrar primera comida</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

      ) : (
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {!selectedFood ? (
            <>
              <View style={s.searchWrap}>
                <Text style={s.searchIcon}>🔍</Text>
                <TextInput
                  style={s.searchInput}
                  value={query}
                  onChangeText={handleSearch}
                  placeholder="Busca un alimento..."
                  placeholderTextColor={T.textMuted}
                  autoFocus
                />
                {searching && <ActivityIndicator size="small" color={T.accent} />}
              </View>

              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: 12 }}
                ListEmptyComponent={
                  query.length > 1 && !searching ? (
                    <Text style={s.noResults}>Sin resultados para "{query}"</Text>
                  ) : null
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.resultItem} onPress={() => handleSelectFood(item)}>
                    <View style={s.resultLeft}>
                      <Text style={s.resultName}>{item.name}</Text>
                      {item.brand && <Text style={s.resultBrand}>{item.brand}</Text>}
                      {item.servings.length > 0 && (
                        <Text style={s.resultServing}>
                          Porción: {item.servings[0].description}
                        </Text>
                      )}
                    </View>
                    <Text style={s.resultCal}>{item.calories} kcal/100g</Text>
                  </TouchableOpacity>
                )}
              />
            </>
          ) : (
            /* ── Panel de porción ── */
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <TouchableOpacity style={s.backBtn} onPress={() => setSelectedFood(null)}>
                <Text style={s.backBtnText}>← Volver</Text>
              </TouchableOpacity>

              <View style={s.portionCard}>
                <Text style={s.portionName}>{selectedFood.name}</Text>
                {selectedFood.brand && <Text style={s.portionBrand}>{selectedFood.brand}</Text>}

                {/* Porciones nombradas */}
                {selectedFood.servings.length > 0 && (
                  <>
                    <Text style={s.portionLabel}>PORCIÓN</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={s.chipRow}>
                        {selectedFood.servings.map((sv, i) => (
                          <TouchableOpacity
                            key={i}
                            style={[s.servingChip, selectedServingIdx === i && !useCustomGrams && s.servingChipActive]}
                            onPress={() => { setSelectedServingIdx(i); setUseCustomGrams(false); }}
                          >
                            <Text style={[s.servingChipText, selectedServingIdx === i && !useCustomGrams && s.servingChipTextActive]}>
                              {sv.description}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>

                    <Text style={s.portionLabel}>CANTIDAD</Text>
                    <View style={s.chipRow}>
                      {PORTION_MULTS.map(({ label, value }) => (
                        <TouchableOpacity
                          key={value}
                          style={[s.multChip, portionMult === value && !useCustomGrams && s.multChipActive]}
                          onPress={() => { setPortionMult(value); setUseCustomGrams(false); }}
                        >
                          <Text style={[s.multChipText, portionMult === value && !useCustomGrams && s.multChipTextActive]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {!useCustomGrams && (
                      <Text style={s.gramsResult}>
                        = {Math.round(baseGrams * portionMult)}g
                      </Text>
                    )}
                  </>
                )}

                {/* Opción gramos exactos */}
                <TouchableOpacity
                  style={s.customToggle}
                  onPress={() => {
                    setUseCustomGrams(v => !v);
                    if (!useCustomGrams) setCustomGrams(String(Math.round(effectiveGrams)));
                  }}
                >
                  <Text style={s.customToggleText}>
                    {useCustomGrams ? '← Usar porciones' : 'Ingresar gramos exactos'}
                  </Text>
                </TouchableOpacity>

                {(useCustomGrams || selectedFood.servings.length === 0) && (
                  <TextInput
                    style={s.gramsInput}
                    value={customGrams || (selectedFood.servings.length === 0 ? String(effectiveGrams) : '')}
                    onChangeText={(v) => { setCustomGrams(v); setUseCustomGrams(true); }}
                    keyboardType="numeric"
                    placeholder="gramos exactos"
                    placeholderTextColor={T.textMuted}
                  />
                )}

                {/* Preview nutricional */}
                {effectiveGrams > 0 && (() => {
                  const p = foodSearchService.calcPortion(selectedFood, effectiveGrams);
                  return (
                    <View style={s.previewBox}>
                      <Text style={s.previewTitle}>Valores para {effectiveGrams}g</Text>
                      <View style={s.macroRow}>
                        <MacroStat label="Calorías" value={p.calories} unit="kcal" color={T.gold} />
                        <MacroStat label="Proteína" value={p.protein}  unit="g"    color={T.accent} />
                        <MacroStat label="Carbos"   value={p.carbs}    unit="g"    color={T.purple} />
                        <MacroStat label="Grasas"   value={p.fat}      unit="g"    color={T.red} />
                      </View>
                    </View>
                  );
                })()}

                {/* Selección de comida */}
                <View style={s.mealLabelRow}>
                  <Text style={s.portionLabel}>COMIDA</Text>
                  <TouchableOpacity onPress={openMealEditor} style={s.editMealsBtn}>
                    <Text style={s.editMealsBtnText}>⚙ Editar</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={s.chipRow}>
                    {mealSlots.map(slot => (
                      <TouchableOpacity
                        key={slot.id}
                        style={[s.mealChip, activeMealId === slot.id && s.mealChipActive]}
                        onPress={() => setActiveMealId(slot.id)}
                      >
                        <Text style={[s.mealChipText, activeMealId === slot.id && s.mealChipTextActive]}>
                          {slot.emoji} {slot.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <TouchableOpacity
                  style={[s.logBtn, effectiveGrams <= 0 && s.logBtnDisabled]}
                  disabled={effectiveGrams <= 0}
                  onPress={handleLogFood}
                >
                  <Text style={s.logBtnText}>REGISTRAR EN ERIS ✓</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      )}

      {/* ── Editor de comidas ── */}
      <Modal visible={showMealEditor} transparent animationType="slide" statusBarTranslucent>
        <View style={s.editorOverlay}>
          <View style={s.editorCard}>
            <View style={s.editorHeader}>
              <Text style={s.editorTitle}>Mis comidas</Text>
              <Text style={s.editorSub}>Toca el emoji para cambiarlo · máx. 8</Text>
            </View>

            <ScrollView style={s.editorList} showsVerticalScrollIndicator={false}>
              {editingSlots.map((slot, i) => (
                <View key={slot.id} style={s.editorRow}>
                  <TouchableOpacity style={s.editorEmojiBtn} onPress={() => cycleEmoji(i)}>
                    <Text style={s.editorEmojiText}>{slot.emoji}</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={s.editorNameInput}
                    value={slot.name}
                    onChangeText={(v) => updateSlotName(i, v)}
                    placeholderTextColor={T.textMuted}
                    maxLength={20}
                  />
                  <TouchableOpacity
                    style={s.editorDeleteBtn}
                    onPress={() => deleteEditSlot(slot.id)}
                    disabled={editingSlots.length <= 1}
                  >
                    <Text style={[s.editorDeleteText, editingSlots.length <= 1 && { opacity: 0.2 }]}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {/* Agregar nueva comida */}
              {editingSlots.length < 8 && (
                <View style={s.editorAddRow}>
                  <TextInput
                    style={[s.editorNameInput, { flex: 1 }]}
                    value={newMealName}
                    onChangeText={setNewMealName}
                    placeholder="Nueva comida..."
                    placeholderTextColor={T.textMuted}
                    onSubmitEditing={addEditSlot}
                    returnKeyType="done"
                    maxLength={20}
                  />
                  <TouchableOpacity
                    style={[s.editorAddBtn, !newMealName.trim() && { opacity: 0.4 }]}
                    onPress={addEditSlot}
                    disabled={!newMealName.trim()}
                  >
                    <Text style={s.editorAddBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            <View style={s.editorActions}>
              <TouchableOpacity
                style={s.editorResetBtn}
                onPress={() => setEditingSlots([...DEFAULT_MEAL_SLOTS])}
              >
                <Text style={s.editorResetText}>Restablecer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.editorCancelBtn} onPress={() => setShowMealEditor(false)}>
                <Text style={s.editorCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.editorSaveBtn} onPress={confirmMealEditor}>
                <Text style={s.editorSaveText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── MacroStat ───────────────────────────────────────────────
function MacroStat({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <View style={ms.wrap}>
      <Text style={[ms.value, { color }]}>{value}</Text>
      <Text style={ms.unit}>{unit}</Text>
      <Text style={ms.label}>{label}</Text>
    </View>
  );
}
const ms = StyleSheet.create({
  wrap:  { alignItems: 'center', flex: 1 },
  value: { fontSize: 22, fontWeight: '800' },
  unit:  { fontSize: 10, color: T.textMuted, marginTop: -2 },
  label: { fontSize: 10, color: T.textLight, marginTop: 2 },
});

// ─── Styles ──────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: T.bg },
  flex:  { flex: 1 },

  header:            { paddingHorizontal: S.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  headerTitle:       { fontSize: 20, fontWeight: '800', color: T.text, marginBottom: 10 },
  headerTabs:        { flexDirection: 'row', gap: 8 },
  headerTab:         { paddingHorizontal: S.md, paddingVertical: 7, borderRadius: R.full, backgroundColor: T.border, borderWidth: 1, borderColor: T.border },
  headerTabActive:   { backgroundColor: T.accentGlow, borderColor: T.accent },
  headerTabText:     { color: T.textMuted, fontSize: 13, fontWeight: '600' },
  headerTabTextActive: { color: T.accent },

  summaryCard:  { backgroundColor: T.bgCard, borderRadius: R.lg, padding: S.md, marginBottom: 12, borderWidth: 1, borderColor: T.border },
  summaryTitle: { color: T.textLight, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12 },
  macroRow:     { flexDirection: 'row', justifyContent: 'space-around' },

  waterCard:   { backgroundColor: T.bgCard, borderRadius: R.lg, padding: S.md, marginBottom: 12, borderWidth: 1, borderColor: T.borderActive },
  waterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  waterTitle:  { color: T.text, fontSize: 14, fontWeight: '700' },
  waterTotal:  { color: T.accent, fontSize: 14, fontWeight: '700' },
  waterBar:    { height: 8, backgroundColor: T.border, borderRadius: R.sm, marginBottom: 12, overflow: 'hidden' },
  waterFill:   { height: '100%', backgroundColor: T.accent, borderRadius: R.sm },
  waterBtns:   { flexDirection: 'row', gap: 8 },
  waterBtn:    { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: T.accentGlow, borderWidth: 1, borderColor: T.borderActive, alignItems: 'center' },
  waterBtnText: { color: T.accent, fontSize: 13, fontWeight: '700' },

  mealSection:       { marginBottom: S.md },
  mealSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mealSectionTitle:  { color: T.textLight, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  mealSectionCal:    { color: T.gold, fontSize: 11, fontWeight: '700' },
  foodEntry:         { flexDirection: 'row', alignItems: 'center', backgroundColor: T.bgCard, borderRadius: R.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: T.border },
  foodEntryLeft:     { flex: 1 },
  foodEntryName:     { color: T.text, fontSize: 14, fontWeight: '600' },
  foodEntryBrand:    { color: T.textMuted, fontSize: 11, marginTop: 1 },
  foodEntryDetail:   { color: T.textLight, fontSize: 11, marginTop: 2 },
  foodEntryCal:      { color: T.gold, fontSize: 15, fontWeight: '800' },

  empty:       { alignItems: 'center', paddingTop: 40 },
  emptyIcon:   { fontSize: 48, marginBottom: 12 },
  emptyText:   { color: T.textMuted, fontSize: 14, marginBottom: S.md },
  emptyBtn:    { backgroundColor: T.accentGlow, paddingHorizontal: S.md, paddingVertical: 10, borderRadius: R.md, borderWidth: 1, borderColor: T.accent },
  emptyBtnText: { color: T.accent, fontWeight: '700', fontSize: 13 },

  searchWrap:  { flexDirection: 'row', alignItems: 'center', margin: S.md, backgroundColor: T.bgCard, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: T.border },
  searchIcon:  { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, color: T.text, fontSize: 16, paddingVertical: 14 },
  noResults:   { color: T.textMuted, textAlign: 'center', marginTop: 32, fontSize: 14 },

  resultItem:    { flexDirection: 'row', alignItems: 'center', backgroundColor: T.bgCard, borderRadius: R.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: T.border },
  resultLeft:    { flex: 1 },
  resultName:    { color: T.text, fontSize: 14, fontWeight: '600' },
  resultBrand:   { color: T.textMuted, fontSize: 11, marginTop: 2 },
  resultServing: { color: T.accent, fontSize: 11, marginTop: 3, fontWeight: '500' },
  resultCal:     { color: T.gold, fontSize: 13, fontWeight: '700' },

  backBtn:     { marginBottom: S.md },
  backBtnText: { color: T.accent, fontSize: 14, fontWeight: '600' },

  portionCard:  { backgroundColor: T.bgCard, borderRadius: R.xl, padding: S.lg, borderWidth: 1, borderColor: T.border },
  portionName:  { color: T.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  portionBrand: { color: T.textMuted, fontSize: 12, marginBottom: S.sm },
  portionLabel: { color: T.textLight, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: S.md, marginBottom: 8 },

  chipRow:         { flexDirection: 'row', gap: 8, marginBottom: 4 },

  servingChip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.full, backgroundColor: T.border, borderWidth: 1, borderColor: T.border },
  servingChipActive:   { backgroundColor: T.accentGlow, borderColor: T.accent },
  servingChipText:     { color: T.textMuted, fontSize: 12, fontWeight: '600' },
  servingChipTextActive: { color: T.accent },

  multChip:         { width: 52, paddingVertical: 8, borderRadius: 10, backgroundColor: T.border, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
  multChipActive:   { backgroundColor: T.purpleGlow, borderColor: T.purple },
  multChipText:     { color: T.textMuted, fontSize: 15, fontWeight: '700' },
  multChipTextActive: { color: T.purple },

  gramsResult:   { color: T.textMuted, fontSize: 12, marginTop: 4, marginBottom: 4 },

  customToggle:     { marginTop: 8, marginBottom: 8 },
  customToggleText: { color: T.accent, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },

  gramsInput:  { backgroundColor: T.bgInput, color: T.text, borderRadius: R.md, padding: 12, fontSize: 16, fontWeight: '600', borderWidth: 1, borderColor: T.border, marginTop: 4 },

  previewBox:   { backgroundColor: T.bgInput, borderRadius: 14, padding: 14, marginTop: 14 },
  previewTitle: { color: T.textLight, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10 },

  mealLabelRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: S.md },
  editMealsBtn:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.full, backgroundColor: T.border },
  editMealsBtnText: { color: T.textLight, fontSize: 11, fontWeight: '600' },

  mealChip:         { paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.full, backgroundColor: T.border, borderWidth: 1, borderColor: T.border },
  mealChipActive:   { backgroundColor: T.accentGlow, borderColor: T.accent },
  mealChipText:     { color: T.textMuted, fontSize: 12, fontWeight: '600' },
  mealChipTextActive: { color: T.accent },

  logBtn:         { marginTop: S.lg, backgroundColor: T.accent, borderRadius: 14, paddingVertical: S.md, alignItems: 'center', shadowColor: T.accent, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  logBtnDisabled: { backgroundColor: T.textMuted, shadowOpacity: 0 },
  logBtnText:     { color: '#000', fontWeight: '900', fontSize: 14, letterSpacing: 1.5 },

  // ── Modal editor ──
  editorOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  editorCard:    { backgroundColor: '#0e0e18', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, maxHeight: '85%', borderTopWidth: 1, borderColor: T.border },
  editorHeader:  { padding: S.lg, borderBottomWidth: 1, borderBottomColor: T.border },
  editorTitle:   { color: T.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  editorSub:     { color: T.textMuted, fontSize: 12 },
  editorList:    { padding: S.md },

  editorRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  editorEmojiBtn:  { width: 44, height: 44, borderRadius: 12, backgroundColor: T.border, alignItems: 'center', justifyContent: 'center' },
  editorEmojiText: { fontSize: 22 },
  editorNameInput: { flex: 1, backgroundColor: T.bgInput, color: T.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600', borderWidth: 1, borderColor: T.border },
  editorDeleteBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  editorDeleteText: { color: T.red, fontSize: 22, fontWeight: '700', lineHeight: 28 },

  editorAddRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 10 },
  editorAddBtn:    { width: 44, height: 44, borderRadius: 12, backgroundColor: T.accentGlow, borderWidth: 1, borderColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  editorAddBtnText: { color: T.accent, fontSize: 24, fontWeight: '700', lineHeight: 32 },

  editorActions:    { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: S.lg, paddingTop: S.md, gap: 10, borderTopWidth: 1, borderTopColor: T.border },
  editorResetBtn:   { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: T.border },
  editorResetText:  { color: T.textMuted, fontSize: 13, fontWeight: '600' },
  editorCancelBtn:  { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: T.border },
  editorCancelText: { color: T.textLight, fontSize: 13, fontWeight: '600' },
  editorSaveBtn:    { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: T.accent },
  editorSaveText:   { color: '#000', fontSize: 13, fontWeight: '800' },
});

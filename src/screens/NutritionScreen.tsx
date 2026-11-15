import { guardar } from '../services/saveGuard';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, ActivityIndicator, Modal, Animated,
  KeyboardAvoidingView, Platform, AppState, DeviceEventEmitter, Alert,
} from 'react-native';
import { KeyboardLiftView } from '../components/KeyboardLift';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTrainingIntent } from '../services/forge/trainingIntent';
import { foodSearchService, FoodItem, LoggedFood } from '../services/FoodSearchService';
import { withDrinkServings, isBeverage, countsAsWater } from '../services/beverage';
import { logWaterL } from '../services/foodWater';
import { slotAt, hhmm, MEAL_ORDER, typicalHour, fmtHour } from '../services/mealSchedule';
import {
  type MealSlot, defaultSlots, normalizeSlots, visibleSlots, slotLabel, displayOrder, addCustomSlot, finalizeEdit, resetSlots,
  entryTimeFor, isKnownSlot, fmtSlotHour, stepHour, sortSlots, KNOWN_SLOTS, NAME_MAX, MAX_VISIBLE,
} from '../services/mealSlots';
import { daySchedule, DAY_SCHEDULE_EVENT } from '../services/daySchedule';
import { escucharDestino } from '../services/notifTargets';
import { foodHistoryService, FoodHistoryEntry } from '../services/FoodHistoryService';
import { wsManager } from '../services/WebSocketManager';
import { nutritionBackend, NUTRITION_DAY_UPDATED } from '../services/NutritionBackend';
import { insertNutrition, deleteNutrition, insertHydration, deleteHydration, deleteHydrationBatch } from '../services/nutritionHC';
import {
  STORAGE_KEY_LOG, STORAGE_KEY_WATER, STORAGE_KEY_WATER_SEEN, STORAGE_KEY_WATER_LAST, STORAGE_KEY_PENDING_DEL,
  STORAGE_KEY_GOALS, STORAGE_KEY_WATER_HCIDS, STORAGE_KEY_WATER_APPLIED, HC_MEAL_MAP, logKey, mergeServerEntries, removeEntry, applyServerDeletion, foodLogForServer, waterNotSeen, pendingKey, prettySlot,
  type ServerEntry, type ServerWater, type PendingDelete,
} from '../services/nutritionSync';
import { T, R, S } from '../config/design';
import { usePersona } from '../config/persona';
import BarcodeScanner from '../components/gluco/BarcodeScanner';
import AddProductModal from '../components/AddProductModal';
import LoggedFoodSheet, { type LoggedFoodChanges } from '../components/LoggedFoodSheet';
import SupplementsCard from '../components/supplements/SupplementsCard';
import SupplementsSheet, { type SupMode } from '../components/supplements/SupplementsSheet';
import QualityPreview from '../components/QualityPreview';
import { simulateAddToday, type QualitySim } from '../services/NutritionQuality';
import { HealthSyncChip } from '../components/HealthSyncStatus';
import { ERIS_ASK_EVENT } from '../services/ErisNotifications';
import { ErisDecideChip } from '../components/home/ErisPlan';
import { coma } from '../services/fmtNum';

const STORAGE_KEY_MEALS = 'eris_meal_slots_v1';
const DEFAULT_WATER_GOAL = 2.5;

// ─── Meal slots ──────────────────────────────────────────────
// «Mis comidas»: la lógica (orden del día, ocultar en vez de borrar, hora de las propias, validar) está en
// services/mealSlots.ts, con pruebas. Antes la lista por defecto ponía la cena antes que la once (2026-10-16).
const MEAL_EMOJIS = ['🌅','🍳','🥞','☀️','🌮','🥗','🍎','🍌','🌙','🥛','🍵','🫖','🍽️','🥙','💪','⚡','🫐','🥑'];

const PORTION_MULTS = [
  { label: '½',   value: 0.5 },
  { label: '1',   value: 1   },
  { label: '1½',  value: 1.5 },
  { label: '2',   value: 2   },
  { label: '3',   value: 3   },
];

/**
 * Qué comida corresponde a una hora del día, entre las que el usuario tiene configuradas (la tabla única de
 * services/mealSchedule.ts). Antes esta tabla ponía la once DESPUÉS de la cena y no calzaba con la del chat.
 */
function guessMealByHour(slots: MealSlot[], h: number, wakeHour?: number): string {
  // Solo entre las que están a la vista (una oculta no se elige sola)
  return slotAt(h, { available: visibleSlots(slots).map(s => s.id), wakeHour });
}
const guessMealByTime = (slots: MealSlot[], wakeHour?: number) => {
  const n = new Date();
  return guessMealByHour(slots, n.getHours() + n.getMinutes() / 60, wakeHour);
};

// ─── Almacenamiento del día (AsyncStorage) ───────────────────
const parseJson = <T,>(raw: string | null, fallback: T): T => { try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; } };
const dayOf = (d: Date) => d.toDateString();
const logStoreKey = (day: string) => `${STORAGE_KEY_LOG}_${day}`;
const waterStoreKey = (day: string) => `${STORAGE_KEY_WATER}_${day}`;
const seenStoreKey = (day: string) => `${STORAGE_KEY_WATER_SEEN}_${day}`;
const appliedStoreKey = (day: string) => `${STORAGE_KEY_WATER_APPLIED}_${day}`;
const waterHcIdsKey = (day: string) => `${STORAGE_KEY_WATER_HCIDS}_${day}`;
const readLog = async (day: string): Promise<LoggedFood[]> => parseJson<LoggedFood[]>(await AsyncStorage.getItem(logStoreKey(day)), []);
// Con reintento y aviso si el teléfono no puede guardar (revisión 2026-10-31, D5: antes la comida se veía en la lista y no quedaba)
const writeLog = (day: string, log: LoggedFood[]) => guardar(logStoreKey(day), JSON.stringify(log), 'Nutrición');
const readWater = async (day: string): Promise<number> => parseFloat((await AsyncStorage.getItem(waterStoreKey(day))) || '0') || 0;
const newId = () => `eris_${Date.now()}_${Math.random().toString(36).slice(2)}`;

/** Guarda el id que Health Connect dio a una toma de agua de hoy — la lista completa, no solo la última (ver
 * STORAGE_KEY_WATER_HCIDS). Se usa al insertar; `handleEditWaterTotal` la lee para saber qué borrar. */
async function addWaterHcId(day: string, hcId: string | undefined) {
  if (!hcId) return;
  const list = parseJson<string[]>(await AsyncStorage.getItem(waterHcIdsKey(day)), []);
  await AsyncStorage.setItem(waterHcIdsKey(day), JSON.stringify([...list, hcId]));
}

/** Guarda en el registro guardado el id que Health Connect dio a cada comida (para poder borrar exactamente esa). */
async function patchHcIds(day: string, entries: LoggedFood[]) {
  const ids = new Map(entries.filter(e => e.hcId).map(e => [logKey(e), e.hcId as string]));
  if (ids.size === 0) return;
  let changed = false;
  const patched = (await readLog(day)).map(e => {
    const id = ids.get(logKey(e));
    if (id && e.hcId !== id) { changed = true; return { ...e, hcId: id }; }
    return e;
  });
  if (changed) await writeLog(day, patched);
}

/** Empuja al servidor las cifras del día (solo HOY) para que Eris las use al recomendar. */
function pushSnapshot(log: LoggedFood[], water: number) {
  if (wsManager.getStatus() !== 'connected') return;
  const t = log.reduce((acc, entry) => {
    const p = foodSearchService.calcPortion(entry.food, entry.grams);
    return {
      calories: acc.calories + p.calories,
      protein: Math.round((acc.protein + p.protein) * 10) / 10,
      carbs:   Math.round((acc.carbs   + p.carbs  ) * 10) / 10,
      fat:     Math.round((acc.fat     + p.fat    ) * 10) / 10,
    };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  // Con la lista de alimentos: así Eris ve también lo anotado a mano (antes solo le llegaba el total)
  const foodLog = foodLogForServer(daySchedule.todayKey(), log, (f, g) => foodSearchService.calcPortion(f, g));
  // El agua NO va acá: este total es solo el de esta pantalla (sin otras apps ni lo del chat aún no copiado) y pisaba en el
  // servidor el total completo que manda App (Health Connect + chat). App lo reenvía después de cada registro (notifyLogged).
  void water;
  wsManager.sendMessage({ type: 'update_health_snapshot', snapshot: { nutrition: t, foodLog } });
}

// ─── Borrados pendientes de confirmar por el servidor ────────
// Si se borra sin conexión (o el servidor no alcanza a responder), el borrado se reenvía hasta que confirme; mientras
// tanto ese alimento no se vuelve a agregar al sincronizar.
const loadPending = async (): Promise<PendingDelete[]> => parseJson<PendingDelete[]>(await AsyncStorage.getItem(STORAGE_KEY_PENDING_DEL), []);
const savePending = (list: PendingDelete[]) => AsyncStorage.setItem(STORAGE_KEY_PENDING_DEL, JSON.stringify(list.slice(-50)));
async function flushPending() {
  if (wsManager.getStatus() !== 'connected') return;
  for (const p of await loadPending()) wsManager.sendMessage({ type: 'delete_nutrition_entry', ...p });
}
async function queueDelete(p: PendingDelete) {
  const list = await loadPending();
  if (!list.some(x => pendingKey(x) === pendingKey(p))) await savePending([...list, p]);
  await flushPending();
}
async function clearPending(p: { timestamp: string; name: string; grams: number }) {
  const list = await loadPending();
  const next = list.filter(x => pendingKey(x) !== pendingKey(p));
  if (next.length !== list.length) await savePending(next);
}

// ─── Componente principal ────────────────────────────────────
interface Props {
  // Avisa al padre (App.tsx) tras un log exitoso a Health Connect, para que
  // refresque el snapshot global sin esperar el TTL de caché de MetricsService.
  onDataLogged?: () => void;
}

export default function NutritionScreen({ onDataLogged }: Props) {
  // El entreno de hoy (Forge 2.0): la meta según el día y el «fantasma» del entreno planificado
  const { targets: dayTargets } = useTrainingIntent();
  const persona = usePersona(); // Eris, o Hestia en el Modo AXS Executive
  const insets = useSafeAreaInsets();
  const onDataLoggedRef = useRef(onDataLogged);
  useEffect(() => { onDataLoggedRef.current = onDataLogged; }, [onDataLogged]);
  // onDataLogged (App.tsx) refresca el snapshot de Métricas/Toji; nutritionBackend.refreshLocal() avisa a Inicio,
  // que se maneja solo (no recibe snapshot por prop) — antes esto último no pasaba y Inicio no se enteraba de un
  // registro manual (agua, comida, borrado) hasta el próximo enfoque de esa pestaña, o nunca si Health Connect no
  // tenía el permiso de escritura.
  const notifyLogged = () => { onDataLoggedRef.current?.(); nutritionBackend.refreshLocal(); };

  // Meal slots
  // Todas las comidas (también las ocultas: lo ya anotado en ellas se sigue mostrando con su nombre y en su lugar)
  const [mealSlots, setMealSlots] = useState<MealSlot[]>(defaultSlots);
  const shownSlots = useMemo(() => visibleSlots(mealSlots), [mealSlots]);
  const [activeMealId, setActiveMealId] = useState('desayuno');
  const [showMealEditor, setShowMealEditor] = useState(false);
  const [editingSlots, setEditingSlots] = useState<MealSlot[]>([]);
  const [newMealName, setNewMealName] = useState('');
  const [newMealHour, setNewMealHour] = useState(18);
  const [editorMsg, setEditorMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const mealSlotsRef = useRef(mealSlots);
  useEffect(() => { mealSlotsRef.current = mealSlots; }, [mealSlots]);
  // Hora de despertar de hoy (corre la ventana del desayuno) y cuándo se eligió una comida a mano: la comida elegida se
  // respeta 10 min (para anotar varias cosas de la misma); después vuelve a la de la hora. Antes quedaba la de cuando se
  // abrió la pantalla: abierta a las 8, a las 12 seguía en "Desayuno".
  const wakeHourRef = useRef<number | undefined>(undefined);
  const manualPickRef = useRef(0);
  const MANUAL_PICK_MS = 10 * 60_000;
  useEffect(() => {
    const load = () => { wakeHourRef.current = daySchedule.wakeHour(); };
    load();
    const sub = AppState.addEventListener('change', st => { if (st === 'active') load(); });
    const sub2 = DeviceEventEmitter.addListener(DAY_SCHEDULE_EVENT, load);
    return () => { sub.remove(); sub2.remove(); };
  }, []);
  const pickMeal = (id: string) => { manualPickRef.current = Date.now(); setActiveMealId(id); };

  // Búsqueda
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  // Aviso del backend según el perfil del usuario (celiaquía, alergias…) para el alimento elegido
  const [safetyNote, setSafetyNote] = useState<{ level: 'blocked' | 'unknown'; reason: string } | null>(null);
  const safetyReqRef = useRef('');

  // Escáner de código de barras (mismo componente que ya usa GlucoTrack)
  const [showScanner, setShowScanner] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [addProduct, setAddProduct] = useState<{ code: string; name?: string; brand?: string } | null>(null);

  // Porción
  const [selectedServingIdx, setSelectedServingIdx] = useState(0);
  const [portionMult, setPortionMult] = useState(1);
  const [useCustomGrams, setUseCustomGrams] = useState(false);
  const [customGrams, setCustomGrams] = useState('');

  // Log
  const [todayLog, setTodayLog] = useState<LoggedFood[]>([]);
  const [waterLiters, setWaterLiters] = useState(0);
  const [waterGoal, setWaterGoal] = useState(DEFAULT_WATER_GOAL);
  const [calorieGoal, setCalorieGoal] = useState<number | null>(null);
  const [lastWater, setLastWater] = useState<{ liters: number; hcId?: string; day: string } | null>(null);
  const [lastDeletedFood, setLastDeletedFood] = useState<{ entry: LoggedFood; day: string } | null>(null);
  /** lo anotado que se abrió para ver su detalle o corregirlo */
  const [openEntry, setOpenEntry] = useState<LoggedFood | null>(null);
  /** la hoja de «Mis suplementos» (y en qué vista abre) */
  const [supSheet, setSupSheet] = useState<SupMode | null>(null);
  // «Ver» en el aviso de un suplemento: abre «Mis suplementos» (revisión I2)
  useEffect(() => escucharDestino('suplementos', () => setSupSheet('mios')), []);
  const undoSnackAnim = useRef(new Animated.Value(0)).current;
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);
  const [view, setView] = useState<'log' | 'search'>('log');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  // "Hoy" es el día de COMIDA: termina cuando te duermes, no a medianoche (services/mealSchedule.ts)
  const [currentDate, setCurrentDate] = useState(() => daySchedule.todayDate());

  // Espejo síncrono del registro y del agua que se están viendo: los eventos del servidor y los toques del usuario
  // llegan mezclados; leer siempre de acá (y no de un estado de una render vieja) evita pisar cambios.
  const todayLogRef = useRef<LoggedFood[]>([]);
  const waterRef = useRef(0);
  const setLog = (next: LoggedFood[]) => { todayLogRef.current = next; setTodayLog(next); };
  const setWater = (next: number) => { waterRef.current = next; setWaterLiters(next); };
  // El agua que trae lo comido ese día (jalea, fruta, sopa…): cuenta para la meta, que es de agua total
  const foodWaterLiters = useMemo(() => logWaterL(todayLog), [todayLog]);
  const waterTotalL = Math.round((waterLiters + foodWaterLiters) * 100) / 100;

  // ─── Manejo de fechas ────────────────────────────────────────
  // Los pushes del servidor (registro/borrado/agua por chat) SIEMPRE
  // corresponden al día real de hoy, no necesariamente al día que se está
  // mirando. Si se está mirando otro día, se actualiza solo lo guardado de
  // hoy sin tocar la vista.
  const currentDateRef = useRef(currentDate);
  useEffect(() => { currentDateRef.current = currentDate; }, [currentDate]);
  const isViewingToday = () => currentDateRef.current.toDateString() === daySchedule.todayKey();
  const loadToken = useRef(0);
  const storageOps = useRef<Promise<void>>(Promise.resolve());
  const lastTodayRef = useRef(daySchedule.todayKey());
  /** Las operaciones que tocan lo guardado se encadenan: dos eventos seguidos no se pisan. */
  const enqueue = useCallback((fn: () => Promise<void>) => {
    storageOps.current = storageOps.current.then(fn).catch(() => {});
  }, []);

  // Confirmación "¿es el mismo alimento?" — se llena cuando Eris detecta un
  // candidato parecido en el historial y hay que preguntarle al usuario
  // antes de registrar (nunca se hace merge automático).
  const [pendingSimilarFood, setPendingSimilarFood] = useState<{ newFood: FoodItem; candidate: FoodHistoryEntry } | null>(null);

  // Gramos efectivos para la porción actual
  const baseGrams = selectedFood
    ? (selectedFood.servings[selectedServingIdx]?.grams ?? selectedFood.servingSize ?? 100)
    : 100;
  const effectiveGrams = useCustomGrams
    ? (parseFloat(customGrams) || 0)
    : Math.round(baseGrams * portionMult * 10) / 10;

  // ─── Sync desde Eris chat ────────────────────────────────
  /** En qué comida configurada cae un registro del servidor. Si el usuario ya no tiene esa comida, la que corresponde por la hora. */
  const serverToSlot = (serverMealType: string, timestamp: string): string => {
    const slots = mealSlotsRef.current;
    // Una comida de siempre queda en ESA comida aunque esté oculta (se muestra igual, con su nombre). Antes, si el usuario la
    // había borrado de su lista, lo que Eris anotaba como «cena» caía en otra comida y no calzaba con lo que dijo el chat.
    if ((MEAL_ORDER as readonly string[]).includes(serverMealType) || slots.some(s => s.id === serverMealType)) return serverMealType;
    if (serverMealType === 'merienda') return 'colacion_pm';
    const d = new Date(timestamp);
    const at = Number.isNaN(d.getTime()) ? new Date() : d;
    return guessMealByHour(slots, at.getHours() + at.getMinutes() / 60, wakeHourRef.current);
  };

  // Comidas que llegan del servidor (por chat, o el reenvío completo al abrir la pantalla): se suman a lo de HOY sin
  // duplicar, se copian a Health Connect UNA vez (guardando su id) y todo fuera de cualquier actualizador de estado.
  const applyServerEntries = useCallback((entries: ServerEntry[]) => {
    if (!entries.length) return;
    enqueue(async () => {
      const pending = new Set((await loadPending()).map(pendingKey));
      const viewingToday = isViewingToday();
      const day = daySchedule.todayKey();
      const prev = viewingToday ? todayLogRef.current : await readLog(day);
      const { next, added } = mergeServerEntries(prev, entries, serverToSlot, newId, pending);
      if (added.length === 0) return;
      if (viewingToday) setLog(next);
      await writeLog(day, next);

      for (const e of added) {
        try { const id = await insertNutrition(e, HC_MEAL_MAP[e.mealType] ?? 0); if (id) e.hcId = id; } catch {}
      }
      await patchHcIds(day, added);
      // Alimentar el mismo historial que usa la búsqueda manual, para que lo registrado por chat también cuente.
      added.forEach(e => { foodHistoryService.record(e.food).catch(() => {}); });
      pushSnapshot(viewingToday ? todayLogRef.current : await readLog(day), viewingToday ? waterRef.current : await readWater(day));
      notifyLogged();
    });
  }, []);

  // Agua anotada por chat. Cada toma tiene su instante: se suma UNA vez (antes el total del servidor —que solo conoce lo
  // del chat— reemplazaba el total local y se perdía el agua registrada a mano).
  const applyServerWater = useCallback((waters: ServerWater[], fullSync: boolean) => {
    if (!waters.length) return;
    enqueue(async () => {
      if (fullSync) await nutritionBackend.ensureMigrated(waters);
      const day = daySchedule.todayKey();
      const seen = parseJson<string[]>(await AsyncStorage.getItem(seenStoreKey(day)), []);
      const applied = parseJson<string[]>(await AsyncStorage.getItem(appliedStoreKey(day)), []);
      // Al total de esta pantalla, UNA vez por toma. Antes la toma que no alcanzaba a guardarse en Health Connect (sin
      // permiso, no disponible) no quedaba "vista" y se volvía a sumar en CADA sincronización: el agua crecía sola.
      const toAdd = waterNotSeen(waters, [...seen, ...applied]);
      // A Health Connect, las que aún no están (también las ya sumadas que fallaron antes: se reintentan sin volver a sumar)
      const toHC = waterNotSeen(waters, seen);
      if (toAdd.length === 0 && toHC.length === 0) return;

      const viewingToday = isViewingToday();
      let next = viewingToday ? waterRef.current : await readWater(day);
      if (toAdd.length) {
        const add = Math.round(toAdd.reduce((a, w) => a + w.liters, 0) * 100) / 100;
        next = Math.round((next + add) * 100) / 100;
        if (viewingToday) setWater(next);
        await AsyncStorage.setItem(waterStoreKey(day), String(next));
        await AsyncStorage.setItem(appliedStoreKey(day), JSON.stringify([...applied, ...toAdd.map((w) => w.timestamp)]));
      }

      // Solo se marca "vista" (fuera del respaldo de nutritionBackend.merge en Inicio/Métricas) la toma que de
      // verdad quedó en Health Connect: si no, Inicio y Métricas la dejarían de contar.
      const succeeded: string[] = [];
      await Promise.all(toHC.map(async (w) => {
        try { const id = await insertHydration(w.liters); await addWaterHcId(day, id); succeeded.push(w.timestamp); } catch {}
      }));
      if (succeeded.length) await AsyncStorage.setItem(seenStoreKey(day), JSON.stringify([...seen, ...succeeded]));
      if (!toAdd.length && !succeeded.length) return;

      pushSnapshot(viewingToday ? todayLogRef.current : await readLog(day), next);
      notifyLogged();
    });
  }, []);

  // Eris borró comida(s) por chat — se sacan de acá y también de Health Connect (antes seguían contando en Inicio y Métricas).
  const handleServerDelete = useCallback((msg: { items?: unknown; timestamps?: unknown }) => {
    enqueue(async () => {
      const viewingToday = isViewingToday();
      const day = daySchedule.todayKey();
      const prev = viewingToday ? todayLogRef.current : await readLog(day);
      // Por alimento si el aviso lo trae ("borra el queso" deja la hallulla); si no, la comida completa
      const { next, removed } = applyServerDeletion(prev, msg);
      if (removed.length === 0) return;
      if (viewingToday) setLog(next);
      await writeLog(day, next);
      for (const e of removed) deleteNutrition(e).catch(() => {});
      pushSnapshot(next, viewingToday ? waterRef.current : await readWater(day));
      notifyLogged();
    });
  }, []);

  // ─── Init ───────────────────────────────────────────────────
  useEffect(() => {
    loadMealSlots();
    loadGoalsAndLastWater();
    // Metas fijadas por chat (set_nutritional_goals): NutritionBackend las guarda al llegar del servidor
    const goalsSub = DeviceEventEmitter.addListener('NUTRITION_GOALS_UPDATED', loadGoalsAndLastWater);
    // Eris anotó algo para un día anterior: si es el que se está mirando, se vuelve a leer
    const daySub = DeviceEventEmitter.addListener(NUTRITION_DAY_UPDATED, (day: string) => {
      enqueue(async () => {
        if (currentDateRef.current.toDateString() !== day) return;
        setLog(await readLog(day));
      });
    });
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    nutritionBackend.start(); // idempotente: asegura que Inicio/Métricas también reciban lo del servidor
    nutritionBackend.setScreenMounted(true); // los borrados de Eris los aplica esta pantalla mientras está montada

    const unsub = wsManager.subscribeMessage((data) => {
      switch (data.type) {
        // Respuesta al chequeo de restricciones del alimento elegido
        case 'food_safety_result':
          if (data.requestId === safetyReqRef.current) setSafetyNote(data.risk ?? null);
          break;
        case 'connected':
          wsManager.sendMessage({ type: 'sync_nutrition_today' });
          flushPending().catch(() => {});
          break;
        // Push en tiempo real desde Eris chat
        case 'nutrition_logged':
          // Para ayer o anteayer («ayer cené…»): lo guarda NutritionBackend en ese día; acá solo lo de hoy
          if (typeof data.day === 'string' && data.day !== daySchedule.todayKey()) break;
          if (data.entry) applyServerEntries([data.entry]);
          break;
        case 'hydration_logged':
          if (data.liters != null) applyServerWater([{ timestamp: data.entry?.timestamp ?? new Date().toISOString(), liters: data.liters }], false);
          break;
        // Eris borró una entrada por chat (delete_entry) — sacarla también de acá
        case 'nutrition_entry_deleted':
          handleServerDelete(data);
          break;
        // Respuesta a sync_nutrition_today: re-hidratar todo el log del día
        case 'nutrition_today':
          flushPending().catch(() => {});
          applyServerEntries(Array.isArray(data.entries) ? data.entries : []);
          applyServerWater(Array.isArray(data.waterEntries) ? data.waterEntries : [], true);
          break;
        // El servidor confirmó un borrado hecho acá
        case 'nutrition_delete_result':
          if (data.ok && data.timestamp) clearPending({ timestamp: data.timestamp, name: data.name, grams: data.grams }).catch(() => {});
          break;
      }
    });

    // Pedir al servidor el log del día (cubre entradas registradas por chat mientras la pantalla estaba cerrada)
    if (wsManager.getStatus() === 'connected') {
      wsManager.sendMessage({ type: 'sync_nutrition_today' });
      flushPending().catch(() => {});
    }

    return () => { unsub(); goalsSub.remove(); daySub.remove(); nutritionBackend.setScreenMounted(false); };
  }, []);

  useEffect(() => {
    const token = ++loadToken.current;
    // Limpiar de inmediato: antes, si el día elegido no tenía nada guardado,
    // la lista/agua del día anterior quedaban en pantalla como si fueran de
    // ese día (mismo contenido en "Hoy" y en "Sáb, 19 Sept").
    setLog([]);
    setWater(0);
    loadTodayData(currentDate, token);
  }, [currentDate]);

  // Si la app queda abierta cuando empieza el día siguiente, "Hoy" tiene que avanzar solo (antes currentDate quedaba
  // congelado en el día en que se montó la pantalla). El día de comida cambia al despertar, no a medianoche.
  useEffect(() => {
    const check = () => {
      const now = daySchedule.todayKey();
      if (now === lastTodayRef.current) return;
      const wasViewingOldToday = currentDateRef.current.toDateString() === lastTodayRef.current;
      lastTodayRef.current = now;
      if (wasViewingOldToday) setCurrentDate(daySchedule.todayDate());
    };
    const sub = AppState.addEventListener('change', st => { if (st === 'active') check(); });
    const sub2 = DeviceEventEmitter.addListener(DAY_SCHEDULE_EVENT, check);
    const interval = setInterval(check, 60_000);
    return () => { sub.remove(); sub2.remove(); clearInterval(interval); };
  }, []);

  const loadMealSlots = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_MEALS);
      let parsed: unknown = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
      // Lo guardado se ordena y se repara (la lista antigua tenía la cena antes que la once); si cambió, se guarda así
      const slots = parsed ? normalizeSlots(parsed) : defaultSlots();
      mealSlotsRef.current = slots;
      setMealSlots(slots);
      if (raw && JSON.stringify(slots) !== raw) AsyncStorage.setItem(STORAGE_KEY_MEALS, JSON.stringify(slots)).catch(() => {});
      setActiveMealId(guessMealByTime(slots, wakeHourRef.current));
    } catch {
      setActiveMealId(guessMealByTime(defaultSlots(), wakeHourRef.current));
    }
  };

  // Meta de agua: la misma que usan Inicio y Métricas (antes esta pantalla decía siempre 2.5 L) + la última toma para deshacer
  const loadGoalsAndLastWater = async () => {
    try {
      const goals = parseJson<{ waterLiters?: number; calories?: number; waterTargetOff?: number }>(await AsyncStorage.getItem(STORAGE_KEY_GOALS), {});
      // Sin meta de agua (enfermedad renal: la define su nefrólogo) → 0 = se muestra solo lo tomado
      if (goals.waterTargetOff) setWaterGoal(0);
      else if (goals.waterLiters && goals.waterLiters > 0) setWaterGoal(goals.waterLiters);
      setCalorieGoal(goals.calories && goals.calories > 0 ? goals.calories : null);
      setLastWater(parseJson<{ liters: number; hcId?: string; day: string } | null>(await AsyncStorage.getItem(STORAGE_KEY_WATER_LAST), null));
    } catch {}
  };

  const persistMealSlots = async (slots: MealSlot[]) => {
    setMealSlots(slots);
    mealSlotsRef.current = slots;
    await AsyncStorage.setItem(STORAGE_KEY_MEALS, JSON.stringify(slots));
  };

  const loadTodayData = async (date: Date, token: number) => {
    const day = dayOf(date);
    let log: LoggedFood[] = [];
    let water = 0;
    try { log = await readLog(day); water = await readWater(day); } catch {}
    // El usuario ya navegó a otro día mientras se leía el storage — descartar.
    if (token !== loadToken.current) return;
    // Mezclar con lo que pudo haber llegado del servidor mientras se leía
    // (el estado se limpió al cambiar de día, así que solo hay entradas nuevas).
    const prev = todayLogRef.current;
    if (prev.length === 0) setLog(log);
    else {
      const keys = new Set(log.map(logKey));
      setLog([...log, ...prev.filter(e => !keys.has(logKey(e)))]);
    }
    if (waterRef.current <= 0) setWater(water);
  };

  const saveTodayLog = async (log: LoggedFood[], water: number, date: Date = currentDate) => {
    const day = dayOf(date);
    await writeLog(day, log).catch(() => {}); // si falla, ya se avisó (saveGuard); lo de la pantalla sigue
    await guardar(waterStoreKey(day), String(water), 'Nutrición').catch(() => {});
    // Solo el snapshot de HOY va al backend — antes se mandaba también al
    // editar un día pasado, pisando el "estado actual" con datos de otro día.
    if (day === daySchedule.todayKey()) pushSnapshot(log, water);
  };

  // ─── Búsqueda con debounce ───────────────────────────────
  const searchTimer = useRef<any>(null);
  const searchSeq = useRef(0);
  const handleSearch = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const seq = ++searchSeq.current;
    if (!text.trim()) { setResults([]); setSearching(false); return; }
    // Desde la primera letra: lo ya anotado y la base local aparecen al tiro (sin red). Internet (envasados de Eris y
    // Open Food Facts) espera a que dejes de escribir, para no gastar consultas en cada letra.
    searchTimer.current = setTimeout(async () => {
      const quick = await foodSearchService.searchQuick(text);
      // Una búsqueda lenta no debe pisar a una más nueva
      if (seq !== searchSeq.current) return;
      setResults(quick);
      if (!foodSearchService.wantsNetwork(text)) { setSearching(false); return; }
      setSearching(true);
      searchTimer.current = setTimeout(async () => {
        const items = await foodSearchService.search(text);
        if (seq !== searchSeq.current) return;
        setResults(items);
        setSearching(false);
      }, 450);
    }, 120);
  };

  const handleSelectFood = (item: FoodItem) => {
    // Pregunta al backend si este alimento respeta las restricciones del perfil (no bloquea: solo avisa)
    setSafetyNote(null);
    const rid = Math.random().toString(36).slice(2);
    safetyReqRef.current = rid;
    wsManager.sendMessage({
      type: 'check_food_safety', requestId: rid, name: item.name,
      barcode: /^\d{6,14}$/.test(item.id) ? item.id : undefined,
    });
    setSelectedFood(withDrinkServings(item));
    // La comida de esta hora, salvo que se haya elegido otra hace poco
    if (Date.now() - manualPickRef.current > MANUAL_PICK_MS && currentDateRef.current.toDateString() === daySchedule.todayKey()) {
      setActiveMealId(guessMealByTime(mealSlotsRef.current, wakeHourRef.current));
    }
    setSelectedServingIdx(0);
    setPortionMult(1);
    setUseCustomGrams(false);
    setCustomGrams('');
  };

  const handleBarcode = async (code: string) => {
    setShowScanner(false);
    setBarcodeError(null);
    setSearching(true);
    try {
      const hit = await foodSearchService.lookupBarcode(code);
      if (hit.food) {
        handleSelectFood(hit.food);
      } else {
        // Nadie tiene la tabla nutricional: se carga desde el envase (y queda para la próxima vez)
        setAddProduct({ code: hit.code, name: hit.nameOnly?.name, brand: hit.nameOnly?.brand });
      }
    } catch {
      setBarcodeError('Error al consultar el producto. Verifica la conexión.');
    } finally {
      setSearching(false);
    }
  };

  // ─── Registrar alimento ──────────────────────────────────
  // Separado en dos pasos: primero se chequea si Eris cree que este
  // alimento es el mismo que uno ya guardado (para no duplicar "empanada de
  // carne" vs "Empanada, beef" con macros distintos); si hay un candidato
  // se pausa en un modal de confirmación antes de tocar AsyncStorage/Health
  // Connect. finalizeLogFood es el registro real.
  /**
   * El registro tal como quedaría: la hora de la COMIDA manda (services/mealSchedule.ts). Una comida que ya pasó
   * ("Desayuno" elegido a las 12) se comió antes → queda a la hora de esa comida; un día anterior, a la hora de esa comida
   * ese día (antes quedaba a medianoche). Lo usan el registro y la simulación (así simulan exactamente lo mismo).
   */
  const buildEntry = (food: FoodItem): LoggedFood => {
    const t = entryTimingFor(activeMealId);
    return {
      food,
      grams: effectiveGrams,
      mealType: activeMealId,
      loggedAt: t.at.toISOString(),
      ...(t.approx ? { approxTime: true } : {}),
    };
  };
  /** A qué hora queda lo que se anote en esa comida en el día que se está viendo (services/mealSlots.ts → entryTimeFor). */
  const entryTimingFor = (mealId: string, now: Date = new Date()) => {
    const day = currentDate;
    const isToday = day.toDateString() === daySchedule.todayKey(now);
    const slot = mealSlotsRef.current.find(x => x.id === mealId) ?? { id: mealId };
    return entryTimeFor(slot, day, now, { isToday, wakeHour: wakeHourRef.current, usualWake: daySchedule.usualWake() });
  };

  // Simulación: cómo cambia la calidad de HOY si anotas esto (mismo cálculo que la tarjeta de Métricas; no guarda nada)
  const [qualitySim, setQualitySim] = useState<QualitySim | null>(null);
  useEffect(() => {
    if (!selectedFood || effectiveGrams <= 0 || currentDate.toDateString() !== daySchedule.todayKey()) { setQualitySim(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      simulateAddToday(buildEntry(selectedFood), { waterLiters: waterTotalL })
        .then((s) => { if (alive) setQualitySim(s); })
        .catch(() => { if (alive) setQualitySim(null); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFood, effectiveGrams, activeMealId, currentDate, todayLog, waterTotalL]);

  const finalizeLogFood = async (food: FoodItem) => {
    if (effectiveGrams <= 0) return;
    const day = currentDate;
    const entry = buildEntry(food);

    const newLog = [...todayLogRef.current, entry];
    setLog(newLog);
    await saveTodayLog(newLog, waterRef.current, day);

    try {
      // Se guarda el id que le da Health Connect: el borrado lo necesita para quitar exactamente este registro
      const id = await insertNutrition(entry, HC_MEAL_MAP[activeMealId] ?? 0);
      if (id) { entry.hcId = id; await patchHcIds(dayOf(day), [entry]); }
      notifyLogged();
    } catch {}
    // Una bebida también suma a la meta de agua (antes una Coca-Cola Zero quedaba solo como comida de 0 kcal). La toma queda
    // unida a la bebida: si se borra la bebida, se resta su agua (antes el agua quedaba sumada).
    if (countsAsWater(food)) {
      const liters = Math.round(effectiveGrams) / 1000;
      const hcId = await addWater(liters).catch(() => undefined);
      entry.drinkWater = { liters, ...(hcId ? { hcId } : {}) };
      await writeLog(dayOf(day), todayLogRef.current).catch(() => {});
    }

    foodHistoryService.record(food).catch(() => {});

    setSelectedFood(null);
    setResults([]);
    setQuery('');
    setView('log');
  };

  // Pregunta a Eris (modelo flash, ~seg) si algún candidato del historial es
  // el mismo alimento. Fail-open: sin WS, timeout (7s) o error, se registra
  // directo sin preguntar — nunca bloquea poder guardar la comida.
  const checkSimilarityAndLog = async (food: FoodItem) => {
    try {
      const candidates = await foodHistoryService.findCandidates(food);
      if (candidates.length > 0 && wsManager.getStatus() === 'connected') {
        const matched = await new Promise<FoodHistoryEntry | null>((resolve) => {
          let done = false;
          const timer = setTimeout(() => {
            if (done) return;
            done = true;
            unsub();
            resolve(null);
          }, 7000);
          const unsub = wsManager.subscribeMessage((data: any) => {
            if (done || data?.type !== 'food_similarity_result') return;
            done = true;
            clearTimeout(timer);
            unsub();
            const idx = data.matchIndex;
            resolve(typeof idx === 'number' && candidates[idx] ? candidates[idx] : null);
          });
          wsManager.sendMessage({
            type: 'check_food_similarity',
            newFood: { name: food.name, brand: food.brand },
            candidates: candidates.map(c => ({ name: c.name, brand: c.brand })),
          });
        });
        if (matched) {
          setPendingSimilarFood({ newFood: food, candidate: matched });
          return; // esperar confirmación del usuario en el modal
        }
      }
    } catch {}
    await finalizeLogFood(food);
  };

  const handleLogFood = async () => {
    if (!selectedFood || effectiveGrams <= 0) return;
    await checkSimilarityAndLog(selectedFood);
  };

  const resolvePendingSimilarFood = async (useSaved: boolean) => {
    if (!pendingSimilarFood) return;
    const { newFood, candidate } = pendingSimilarFood;
    setPendingSimilarFood(null);
    const finalFood: FoodItem = useSaved
      ? {
          ...newFood,
          calories: candidate.macrosPer100g.calories,
          protein:  candidate.macrosPer100g.protein,
          carbs:    candidate.macrosPer100g.carbs,
          fat:      candidate.macrosPer100g.fat,
          fiber:    candidate.macrosPer100g.fiber,
          sugar:    candidate.macrosPer100g.sugar,
          sodium:   candidate.macrosPer100g.sodium,
        }
      : newFood;
    await finalizeLogFood(finalFood);
  };

  // Borra ESE alimento. Antes se recibía la posición dentro de SU comida (la lista se filtra por comida) y se usaba como
  // posición en TODO el día: borrar la primera colación quitaba el primer alimento del desayuno. Ahora se borra por identidad.
  const handleDeleteFood = async (entry: LoggedFood) => {
    const day = currentDate;
    const cur = todayLogRef.current;
    const next = removeEntry(cur, entry);
    if (next === cur) return;
    setLog(next);
    await removeDrinkWater(entry, dayOf(day));
    await saveTodayLog(next, waterRef.current, day);
    // También en Health Connect y en el servidor. Si no, "resucita" al reabrir la pantalla, Eris lo sigue contando y
    // Inicio/Métricas lo siguen sumando.
    deleteNutrition(entry).then(() => notifyLogged()).catch(() => {});
    queueDelete({ date: dayOf(day), timestamp: entry.loggedAt, name: entry.food.name, grams: entry.grams }).catch(() => {});
    showUndoSnack(entry, day);
  };

  // ─── Corregir lo anotado (hoja de detalle, fase I4) ────────
  // Se borra lo de antes y se anota lo nuevo por los mismos caminos (Health Connect, servidor, agua de la bebida,
  // despensa), en el mismo lugar de la lista. Así cada lugar queda igual que si se hubiera anotado bien desde el principio.
  const handleEditFood = async (old: LoggedFood, ch: LoggedFoodChanges) => {
    const day = currentDate;
    const cur = todayLogRef.current;
    const i = cur.indexOf(old) >= 0 ? cur.indexOf(old) : cur.findIndex((e) => logKey(e) === logKey(old));
    if (i < 0) { setOpenEntry(null); return; }
    // «Editar información nutricional»: tu versión del alimento, que se usa desde ahora (buscador y chat)
    const food = ch.per100 ? await foodSearchService.saveMyVersion(old.food, ch.per100) : old.food;
    // La hora: la que puso la persona; si solo cambió la comida, la de esa comida ese día; si no, la misma
    let at = new Date(old.loggedAt);
    let approx = !!old.approxTime;
    if (ch.at) { at = ch.at; approx = false; }
    else if (ch.mealType !== old.mealType) { const t = entryTimingFor(ch.mealType); at = t.at; approx = !!t.approx; }
    const next: LoggedFood = { food, grams: ch.grams, mealType: ch.mealType, loggedAt: at.toISOString(), ...(approx ? { approxTime: true } : {}) };
    // Nunca la misma clave que lo de antes (hora_nombre_gramos): el borrado de lo viejo no debe llevarse lo nuevo
    if (logKey(next) === logKey(old)) next.loggedAt = new Date(at.getTime() + 1000).toISOString();
    const list = cur.map((e, k) => (k === i ? next : e));
    setLog(list);
    await removeDrinkWater(old, dayOf(day));
    await saveTodayLog(list, waterRef.current, day);
    deleteNutrition(old).catch(() => {});
    queueDelete({ date: dayOf(day), timestamp: old.loggedAt, name: old.food.name, grams: old.grams }).catch(() => {});
    try {
      const id = await insertNutrition(next, HC_MEAL_MAP[next.mealType] ?? 0);
      if (id) { next.hcId = id; await patchHcIds(dayOf(day), [next]); }
    } catch {}
    if (countsAsWater(food)) {
      const liters = Math.round(next.grams) / 1000;
      const hcId = await addWater(liters).catch(() => undefined);
      next.drinkWater = { liters, ...(hcId ? { hcId } : {}) };
      await writeLog(dayOf(day), todayLogRef.current).catch(() => {});
    }
    foodHistoryService.record(food).catch(() => {});
    notifyLogged();
    setOpenEntry(null);
  };

  const handleForgetMine = async (entry: LoggedFood) => {
    await foodSearchService.removeMyVersion(entry.food);
    setOpenEntry(null);
    Alert.alert('Listo', `Desde ahora, «${entry.food.name}» usa los valores de la base en el buscador y en el chat. Lo ya anotado no cambia.`);
  };

  // ─── Deshacer un borrado de comida ────────────────────────
  // Snackbar temporal (como archivar en Gmail), no un enlace fijo tipo el de agua: con varios ítems borrados un
  // enlace permanente no dejaría claro cuál se deshace, y confirmar ANTES de cada borrado sería fricción para el
  // caso común (borrar algo que sí quieres borrar). Se autodescarta a los pocos segundos.
  const UNDO_MS = 6000;
  const showUndoSnack = (entry: LoggedFood, day: Date) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setLastDeletedFood({ entry, day: dayOf(day) });
    undoSnackAnim.setValue(0);
    Animated.timing(undoSnackAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    undoTimerRef.current = setTimeout(hideUndoSnack, UNDO_MS);
  };
  const hideUndoSnack = () => {
    Animated.timing(undoSnackAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setLastDeletedFood(null));
  };
  const handleUndoDeleteFood = async () => {
    if (!lastDeletedFood) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { entry, day } = lastDeletedFood;
    const viewingThatDay = dayOf(currentDate) === day;
    const cur = viewingThatDay ? todayLogRef.current : await readLog(day);
    // Nunca dos veces: si por lo que sea ya está de vuelta (doble toque, o llegó por chat mientras tanto), no se duplica.
    if (cur.some((e) => logKey(e) === logKey(entry))) { hideUndoSnack(); return; }
    const restored = [...cur, entry];
    if (viewingThatDay) setLog(restored);
    await writeLog(day, restored);
    if (day === daySchedule.todayKey()) pushSnapshot(restored, viewingThatDay ? waterRef.current : await readWater(day));
    await clearPending({ timestamp: entry.loggedAt, name: entry.food.name, grams: entry.grams });
    try { const id = await insertNutrition(entry, HC_MEAL_MAP[entry.mealType] ?? 0); if (id) entry.hcId = id; } catch {}
    await patchHcIds(day, [entry]);
    // La bebida vuelve con su agua
    if (entry.drinkWater && entry.drinkWater.liters > 0) {
      const liters = entry.drinkWater.liters;
      const curW = viewingThatDay ? waterRef.current : await readWater(day);
      const nextW = Math.round((curW + liters) * 100) / 100;
      if (viewingThatDay) setWater(nextW);
      await AsyncStorage.setItem(waterStoreKey(day), String(nextW));
      let hcId: string | undefined;
      try { hcId = await insertHydration(liters); await addWaterHcId(day, hcId); } catch {}
      entry.drinkWater = { liters, ...(hcId ? { hcId } : {}) };
      await writeLog(day, viewingThatDay ? todayLogRef.current : restored).catch(() => {});
    }
    foodHistoryService.record(entry.food).catch(() => {});
    notifyLogged();
    hideUndoSnack();
  };

  // ─── Hidratación ─────────────────────────────────────────
  const addWater = async (liters: number): Promise<string | undefined> => {
    const day = currentDate;
    const newTotal = Math.round((waterRef.current + liters) * 100) / 100;
    setWater(newTotal);
    await saveTodayLog(todayLogRef.current, newTotal, day);
    let hcId: string | undefined;
    try { hcId = await insertHydration(liters); await addWaterHcId(dayOf(day), hcId); notifyLogged(); } catch {}
    const last = { liters, hcId, day: dayOf(day) };
    setLastWater(last);
    AsyncStorage.setItem(STORAGE_KEY_WATER_LAST, JSON.stringify(last)).catch(() => {});
    return hcId;
  };

  /** Resta el agua de una bebida borrada (la toma que sumó al anotarla). */
  const removeDrinkWater = async (entry: LoggedFood, day: string) => {
    const dw = entry.drinkWater;
    if (!dw || !(dw.liters > 0)) return;
    const isCurrent = dayOf(currentDate) === day;
    const cur = isCurrent ? waterRef.current : await readWater(day);
    const next = Math.max(0, Math.round((cur - dw.liters) * 100) / 100);
    if (isCurrent) setWater(next);
    await AsyncStorage.setItem(waterStoreKey(day), String(next));
    if (dw.hcId) deleteHydration(dw.hcId).then(() => notifyLogged()).catch(() => {});
    // "Deshacer +350 ml" de esa misma bebida ya no tiene sentido
    if (lastWater?.hcId && lastWater.hcId === dw.hcId) { setLastWater(null); AsyncStorage.removeItem(STORAGE_KEY_WATER_LAST).catch(() => {}); }
  };

  // ─── Editar el total de hoy a un número exacto ────────────
  // "Deshacer" solo revierte la ÚLTIMA toma — si ya llevas varias, o si algo salió mal (ver el fix del cierre
  // forzoso), no había forma de corregir a un número cualquiera. Health Connect no tiene un "total": es una
  // lista de tomas, así que corregirlo significa borrar justo las que Eris insertó hoy (nunca las de otra app)
  // y dejar una sola con el total correcto.
  const [editingWater, setEditingWater] = useState(false);
  const [waterEditInput, setWaterEditInput] = useState('');
  const [savingWaterEdit, setSavingWaterEdit] = useState(false);
  const handleEditWaterTotal = async () => {
    if (savingWaterEdit) return; // evita un doble toque en "✓" mientras el anterior todavía borra/inserta en HC
    const next = parseFloat(waterEditInput.replace(',', '.'));
    if (!Number.isFinite(next) || next < 0) { setEditingWater(false); return; }
    setSavingWaterEdit(true);
    const day = currentDate;
    const dayS = dayOf(day);
    const rounded = Math.round(next * 100) / 100;

    setWater(rounded);
    await saveTodayLog(todayLogRef.current, rounded, day);

    try {
      const ids = parseJson<string[]>(await AsyncStorage.getItem(waterHcIdsKey(dayS)), []);
      if (ids.length) await deleteHydrationBatch(ids);
      let newId: string | undefined;
      if (rounded > 0) newId = await insertHydration(rounded);
      await AsyncStorage.setItem(waterHcIdsKey(dayS), JSON.stringify(newId ? [newId] : []));
      setLastWater(null);
      await AsyncStorage.removeItem(STORAGE_KEY_WATER_LAST);
      notifyLogged();
    } catch {}

    setSavingWaterEdit(false);
    setEditingWater(false);
  };

  // Deshacer la última toma manual (un toque equivocado en +1L no tenía arreglo)
  const undoWater = async () => {
    if (!lastWater) return;
    const dayS = lastWater.day;
    const isCurrent = dayOf(currentDate) === dayS;
    const cur = isCurrent ? waterRef.current : await readWater(dayS);
    const next = Math.max(0, Math.round((cur - lastWater.liters) * 100) / 100);
    if (isCurrent) setWater(next);
    await AsyncStorage.setItem(waterStoreKey(dayS), String(next));
    if (dayS === daySchedule.todayKey()) pushSnapshot(isCurrent ? todayLogRef.current : await readLog(dayS), next);
    if (lastWater.hcId) deleteHydration(lastWater.hcId).then(() => notifyLogged()).catch(() => {});
    setLastWater(null);
    AsyncStorage.removeItem(STORAGE_KEY_WATER_LAST).catch(() => {});
  };

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

  // Orden del registro: como pasa el día (la once antes que la cena), las comidas ocultas y antiguas en su lugar
  const orderedDisplay = useMemo(() => displayOrder(mealSlots, todayLog), [mealSlots, todayLog]);
  const getSlotLabel = (mealType: string) => slotLabel(mealSlots, mealType, prettySlot);

  // ─── Meal editor helpers ─────────────────────────────────
  // Se edita por id (no por posición): la lista se reordena sola según la hora y una posición vieja apuntaría a otra comida.
  const openMealEditor = () => {
    setEditingSlots(mealSlots.map(x => ({ ...x })));
    setNewMealName('');
    const n = new Date();
    setNewMealHour(stepHour(n.getHours() + (n.getMinutes() >= 30 ? 0.5 : 0), 0));
    setEditorMsg(null);
    setShowMealEditor(true);
  };

  const patchEditSlot = (id: string, patch: Partial<MealSlot>) => {
    setEditorMsg(null);
    setEditingSlots(prev => prev.map(x => (x.id === id ? { ...x, ...patch } : x)));
  };

  const cycleEmoji = (id: string) => {
    const curr = editingSlots.find(x => x.id === id)?.emoji ?? '';
    const idx = MEAL_EMOJIS.indexOf(curr);
    patchEditSlot(id, { emoji: MEAL_EMOJIS[(idx + 1) % MEAL_EMOJIS.length] });
  };

  /** Ocultar o volver a mostrar. Nunca se borra: lo ya anotado en esa comida sigue con su nombre y en su lugar. */
  const toggleEditSlot = (id: string) => {
    const slot = editingSlots.find(x => x.id === id);
    if (!slot) return;
    if (!slot.hidden && visibleSlots(editingSlots).length <= 1) { setEditorMsg({ text: 'Deja al menos una comida a la vista.', error: true }); return; }
    if (slot.hidden && visibleSlots(editingSlots).length >= MAX_VISIBLE) { setEditorMsg({ text: `Puedes tener hasta ${MAX_VISIBLE} comidas a la vista.`, error: true }); return; }
    patchEditSlot(id, { hidden: slot.hidden ? undefined : true });
  };

  const addEditSlot = () => {
    const used = new Set(editingSlots.map(x => x.emoji));
    const emoji = MEAL_EMOJIS.find(e => !used.has(e)) ?? '🍽️';
    const r = addCustomSlot(editingSlots, newMealName, newMealHour, emoji);
    if (r.error) { setEditorMsg({ text: r.error, error: true }); return; }
    setEditingSlots(r.slots);
    setNewMealName('');
    setEditorMsg(r.note ? { text: r.note } : null);
  };

  const confirmMealEditor = async () => {
    const r = finalizeEdit(mealSlots, editingSlots);
    if (r.error) { setEditorMsg({ text: r.error, error: true }); return; }
    await persistMealSlots(r.slots);
    // La comida elegida quedó oculta: la que corresponde a esta hora
    if (!visibleSlots(r.slots).some(x => x.id === activeMealId)) setActiveMealId(guessMealByTime(r.slots, wakeHourRef.current));
    setShowMealEditor(false);
  };

  const addDays = (d: Date, days: number) => {
    const n = new Date(d);
    n.setDate(n.getDate() + days);
    return n;
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
          {/* «Eris decide» (Eris al timón): qué comer hoy según el plan, o elegir un camino */}
          <ErisDecideChip modulo="comida" style={{ marginBottom: 10 }} />
                    {/* Date Selector */}
          <View style={s.dateSelector}>
            <TouchableOpacity onPress={() => setCurrentDate(d => addDays(d, -1))} style={s.dateBtn}>
              <Text style={s.dateBtnText}>◀</Text>
            </TouchableOpacity>
            <Text style={s.dateText}>
              {currentDate.toDateString() === daySchedule.todayKey() ? 'Hoy' : currentDate.toLocaleDateString('es-CL', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
            <TouchableOpacity onPress={() => setCurrentDate(d => addDays(d, 1))} style={s.dateBtn} disabled={currentDate.toDateString() === daySchedule.todayKey()}>
              <Text style={[s.dateBtnText, currentDate.toDateString() === daySchedule.todayKey() && { opacity: 0.2 }]}>▶</Text>
            </TouchableOpacity>
          </View>

          <HealthSyncChip />

          {/* Resumen del día */}
          <View style={s.summaryCard}>
            <Text style={s.summaryTitle}>
              {currentDate.toDateString() === daySchedule.todayKey() ? 'RESUMEN DE HOY' : 'RESUMEN DEL DÍA'}
            </Text>
            <View style={s.macroRow}>
              <MacroStat label="Calorías" value={totals.calories} unit="kcal" color={T.gold} />
              <MacroStat label="Proteína" value={totals.protein}  unit="g"    color={T.accent} />
              <MacroStat label="Carbos"   value={totals.carbs}    unit="g"    color={T.purple} />
              <MacroStat label="Grasas"   value={totals.fat}      unit="g"    color={T.red} />
            </View>
            {calorieGoal && (() => {
              const isToday = currentDate.toDateString() === daySchedule.todayKey();
              const diff = totals.calories - calorieGoal;
              const over = diff > 0;
              const color = over ? T.red : T.green;
              const pct = Math.min(100, Math.round((totals.calories / calorieGoal) * 100));
              return (
                <View style={s.deficitRow}>
                  <View style={s.deficitBar}>
                    <View style={[s.deficitFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                  </View>
                  <Text style={[s.deficitText, { color }]}>
                    {diff === 0 ? `Justo en tu meta (${calorieGoal} kcal)` : `${Math.abs(Math.round(diff))} kcal ${over ? 'sobre' : 'bajo'} tu meta de ${calorieGoal} kcal`}
                  </Text>
                  {/* El entreno planificado de hoy (Forge 2.0): la meta ya lo incluye */}
                  {isToday && dayTargets?.kcalGhost ? (
                    <Text style={[s.deficitText, { color: T.textLight, marginTop: 4 }]}>
                      {`Incluye ~${Math.round(dayTargets.kcalGhost).toLocaleString('es-CL')} kcal de ${dayTargets.intentPhrase ?? 'tu entreno'}`}
                      {dayTargets.kcalNoGhost != null ? (totals.calories > dayTargets.kcalNoGhost
                        ? ` · sin el entreno te pasarías por ${Math.round(totals.calories - dayTargets.kcalNoGhost).toLocaleString('es-CL')} kcal`
                        : ` · sin el entreno te quedarían ${Math.round(dayTargets.kcalNoGhost - totals.calories).toLocaleString('es-CL')} kcal`) : ''}
                    </Text>
                  ) : isToday && dayTargets?.byDay === 'descanso' ? (
                    <Text style={[s.deficitText, { color: T.textLight, marginTop: 4 }]}>Meta de día de descanso</Text>
                  ) : null}
                </View>
              );
            })()}
          </View>

          {/* Hidratación: lo bebido + el agua que trae la comida (services/foodWater.ts); a mano se edita solo lo bebido */}
          <View style={s.waterCard}>
            <View style={s.waterHeader}>
              <Text style={s.waterTitle}>💧 Hidratación</Text>
              {editingWater ? (
                <View style={s.waterEditRow}>
                  <TextInput
                    style={s.waterEditInput}
                    value={waterEditInput}
                    onChangeText={setWaterEditInput}
                    keyboardType="numeric"
                    autoFocus
                    selectTextOnFocus
                    onSubmitEditing={handleEditWaterTotal}
                  />
                  <Text style={s.waterTotal}>L bebidos</Text>
                  <TouchableOpacity onPress={handleEditWaterTotal} disabled={savingWaterEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[s.waterEditOk, savingWaterEdit && { opacity: 0.4 }]}>✓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingWater(false)} disabled={savingWaterEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[s.waterEditCancel, savingWaterEdit && { opacity: 0.4 }]}>×</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => { setWaterEditInput(String(waterLiters)); setEditingWater(true); }}
                  accessibilityLabel="Editar el total de agua de hoy"
                >
                  <Text style={s.waterTotal}>{waterGoal > 0 ? `${coma(waterTotalL, 2)} L / ${coma(waterGoal, 2)} L` : `${coma(waterTotalL, 2)} L · sin meta`}  ✎</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={s.waterBar}>
              <View style={[s.waterFill, { width: `${waterGoal > 0 ? Math.min((waterTotalL / waterGoal) * 100, 100) : 0}%` as any }]} />
            </View>
            {foodWaterLiters >= 0.05 && (
              <Text style={s.waterFoodNote}>
                {editingWater
                  ? `Escribe solo lo bebido: las ${String(foodWaterLiters).replace('.', ',')} L de la comida se suman solas.`
                  : `${String(waterLiters).replace('.', ',')} L bebidos + ${String(foodWaterLiters).replace('.', ',')} L que trae la comida`}
              </Text>
            )}
            <View style={s.waterBtns}>
              {[0.25, 0.35, 0.5, 1].map(l => (
                <TouchableOpacity key={l} style={s.waterBtn} onPress={() => addWater(l)}>
                  <Text style={s.waterBtnText}>+{l === 1 ? '1L' : `${l * 1000}ml`}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {lastWater && lastWater.day === dayOf(currentDate) && (
              <TouchableOpacity style={s.waterUndo} onPress={undoWater} accessibilityLabel="Deshacer la última toma de agua">
                <Text style={s.waterUndoText}>↩ Deshacer +{lastWater.liters >= 1 ? `${coma(lastWater.liters, 2)} L` : `${Math.round(lastWater.liters * 1000)} ml`}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Suplementos de hoy: «Tomado» en un toque (fase I5); solo el día de hoy */}
          {currentDate.toDateString() === daySchedule.todayKey() && <SupplementsCard onOpen={(m) => setSupSheet(m ?? 'mios')} />}

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
                    <View key={`${logKey(entry)}_${idx}`} style={s.foodEntry}>
                      {/* Tocar abre el detalle completo y la edición (LoggedFoodSheet) */}
                      <TouchableOpacity style={s.foodEntryTap} onPress={() => setOpenEntry(entry)} accessibilityLabel={`Ver o corregir ${entry.food.name}`}>
                        <View style={s.foodEntryLeft}>
                          <Text style={s.foodEntryName}>{entry.food.name}{entry.food.mine ? ' ✎' : ''}</Text>
                          {entry.food.brand && <Text style={s.foodEntryBrand}>{entry.food.brand}</Text>}
                          <Text style={s.foodEntryDetail}>
                            {/* Lo que se ingresó en ml (bebidas) se muestra en ml, igual que en el formulario */}
                            {entry.grams}{isBeverage(entry.food) ? ' ml' : 'g'} · {p.protein}g prot · {p.carbs}g carbos · {p.fat}g grasas
                          </Text>
                        </View>
                        <Text style={s.foodEntryCal}>{p.calories}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteFood(entry)} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }} accessibilityLabel={`Eliminar ${entry.food.name}`}>
                        <Text style={s.deleteBtnText}>×</Text>
                      </TouchableOpacity>
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
                <TouchableOpacity
                  onPress={() => { setBarcodeError(null); setShowScanner(true); }}
                  style={s.scanIconBtn}
                  accessibilityLabel="Escanear código de barras"
                >
                  <Text style={s.searchIcon}>📷</Text>
                </TouchableOpacity>
              </View>

              {barcodeError && (
                <View style={s.barcodeError}>
                  <Text style={s.barcodeErrorText}>{barcodeError}</Text>
                </View>
              )}

              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: 12 }}
                ListEmptyComponent={
                  query.trim().length > 0 && !searching ? (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={s.noResults}>Sin resultados para "{query}"</Text>
                      {/* No está en la base ni en Open Food Facts: Eris lo resuelve (busca sus macros y pregunta la porción) */}
                      <TouchableOpacity
                        style={s.askErisBtn}
                        onPress={() => DeviceEventEmitter.emit(ERIS_ASK_EVENT, `Quiero anotar «${query.trim()}» y no lo encontré en el buscador. ¿Me ayudas?`)}
                      >
                        <Text style={s.askErisText}>Díselo a {persona.name}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.resultItem} onPress={() => handleSelectFood(item)}>
                    <View style={s.resultLeft}>
                      <Text style={s.resultName}>{item.name}</Text>
                      {item.brand && <Text style={s.resultBrand}>{item.brand}</Text>}
                      {item.mine ? <Text style={s.resultRecent}>Tu versión</Text> : item.recent && <Text style={s.resultRecent}>Ya lo anotaste antes</Text>}
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
                {safetyNote && (
                  <View style={[s.safetyBox, safetyNote.level === 'blocked' && s.safetyBoxBlocked]}>
                    <Text style={[s.safetyTitle, safetyNote.level === 'blocked' && { color: '#f43f5e' }]}>
                      {safetyNote.level === 'blocked' ? '⚠️ No es para ti' : '⚠️ Revisa la etiqueta'}
                    </Text>
                    <Text style={s.safetyText}>{safetyNote.reason.charAt(0).toUpperCase() + safetyNote.reason.slice(1)}. Puedes registrarlo igual; {persona.name} solo te avisa según tu perfil.</Text>
                  </View>
                )}

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
                        = {Math.round(baseGrams * portionMult)} {isBeverage(selectedFood) ? 'ml' : 'g'}
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
                    {useCustomGrams ? '← Usar porciones' : isBeverage(selectedFood) ? 'Ingresar ml exactos' : 'Ingresar gramos exactos'}
                  </Text>
                </TouchableOpacity>

                {(useCustomGrams || selectedFood.servings.length === 0) && (
                  <TextInput
                    style={s.gramsInput}
                    value={(useCustomGrams || selectedFood.servings.length > 0) ? customGrams : String(effectiveGrams)}
                    onChangeText={(v) => { setCustomGrams(v); setUseCustomGrams(true); }}
                    keyboardType="numeric"
                    placeholder={isBeverage(selectedFood) ? 'ml exactos' : 'gramos exactos'}
                    placeholderTextColor={T.textMuted}
                  />
                )}

                {/* Preview nutricional */}
                {effectiveGrams > 0 && (() => {
                  const p = foodSearchService.calcPortion(selectedFood, effectiveGrams);
                  return (
                    <View style={s.previewBox}>
                      <Text style={s.previewTitle}>Valores para {effectiveGrams} {isBeverage(selectedFood) ? 'ml' : 'g'}</Text>
                      <View style={s.macroRow}>
                        <MacroStat label="Calorías" value={p.calories} unit="kcal" color={T.gold} />
                        <MacroStat label="Proteína" value={p.protein}  unit="g"    color={T.accent} />
                        <MacroStat label="Carbos"   value={p.carbs}    unit="g"    color={T.purple} />
                        <MacroStat label="Azúcar"   value={p.sugar}    unit="g"    color={T.textLight} />
                        <MacroStat label="Grasas"   value={p.fat}      unit="g"    color={T.red} />
                      </View>
                    </View>
                  );
                })()}

                {/* Simulación: si lo anotas, cómo queda la calidad de tu día (solo hoy; nada se guarda hasta registrar) */}
                {effectiveGrams > 0 && qualitySim && <QualityPreview sim={qualitySim} />}

                {/* Selección de comida */}
                <View style={s.mealLabelRow}>
                  <Text style={s.portionLabel}>COMIDA</Text>
                  <TouchableOpacity onPress={openMealEditor} style={s.editMealsBtn}>
                    <Text style={s.editMealsBtnText}>⚙ Editar</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={s.chipRow}>
                    {shownSlots.map(slot => (
                      <TouchableOpacity
                        key={slot.id}
                        style={[s.mealChip, activeMealId === slot.id && s.mealChipActive]}
                        onPress={() => pickMeal(slot.id)}
                      >
                        <Text style={[s.mealChipText, activeMealId === slot.id && s.mealChipTextActive]}>
                          {slot.emoji} {slot.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                {(() => {
                  // Si no queda a la hora de ahora, se dice para que no sorprenda: una comida que ya pasó va a su hora, y una
                  // que aún no llega (la cena elegida a las 11) queda en esa comida de hoy, a su hora
                  const t = entryTimingFor(activeMealId);
                  if (t.when !== 'past' && t.when !== 'future') return null;
                  const name = (mealSlots.find(x => x.id === activeMealId)?.name ?? activeMealId).toLowerCase();
                  return (
                    <Text style={s.mealTimeHint}>
                      {t.when === 'past'
                        ? `Se anota a la hora de ${name} (~${hhmm(t.at)}), no a la de ahora.`
                        : `Queda en ${name} de hoy (~${hhmm(t.at)}), aunque todavía no sea la hora.`}
                    </Text>
                  );
                })()}

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

      {/* ── Editor de comidas («Mis comidas»; la lógica y sus pruebas en services/mealSlots.ts) ── */}
      <Modal visible={showMealEditor} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowMealEditor(false)}>
        <KeyboardLiftView style={s.editorOverlay}>
          <View style={s.editorCard}>
            <View style={s.editorHeader}>
              <Text style={s.editorTitle}>Mis comidas</Text>
              <Text style={s.editorSub}>Van en el orden de tu día. Toca el emoji para cambiarlo. Las que no uses, ocúltalas: lo ya anotado en ellas no se pierde.</Text>
            </View>

            <ScrollView style={s.editorList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {sortSlots(editingSlots).filter(x => !x.hidden).map(slot => {
                const known = isKnownSlot(slot.id);
                const typical = known ? typicalHour(slot.id, wakeHourRef.current) : null;
                return (
                  <View key={slot.id} style={s.editorRow}>
                    <TouchableOpacity style={s.editorEmojiBtn} onPress={() => cycleEmoji(slot.id)} accessibilityLabel={`Cambiar el emoji de ${slot.name}`}>
                      <Text style={s.editorEmojiText}>{slot.emoji}</Text>
                    </TouchableOpacity>
                    <View style={s.flex}>
                      <TextInput
                        style={s.editorNameInput}
                        value={slot.name}
                        onChangeText={(v) => patchEditSlot(slot.id, { name: v })}
                        placeholder={KNOWN_SLOTS.find(k => k.id === slot.id)?.name ?? 'Nombre'}
                        placeholderTextColor={T.textMuted}
                        maxLength={NAME_MAX}
                      />
                      {known ? (
                        <Text style={s.editorHint}>{typical !== null ? `~${fmtHour(typical)} · según tu horario` : 'Según tu horario'}</Text>
                      ) : (
                        <View style={s.editorHourRow}>
                          <TouchableOpacity style={s.editorHourBtn} onPress={() => patchEditSlot(slot.id, { hour: stepHour(slot.hour ?? 12, -0.5) })} accessibilityLabel={`${slot.name}: media hora antes`}>
                            <Text style={s.editorHourBtnText}>−</Text>
                          </TouchableOpacity>
                          <Text style={s.editorHourText}>🕒 {fmtSlotHour(slot.hour ?? 12)}</Text>
                          <TouchableOpacity style={s.editorHourBtn} onPress={() => patchEditSlot(slot.id, { hour: stepHour(slot.hour ?? 12, 0.5) })} accessibilityLabel={`${slot.name}: media hora después`}>
                            <Text style={s.editorHourBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity style={s.editorToggleBtn} onPress={() => toggleEditSlot(slot.id)} accessibilityLabel={`Ocultar ${slot.name}`}>
                      <Text style={s.editorToggleText}>Ocultar</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              {/* Ocultas: se pueden volver a mostrar cuando quieras */}
              {editingSlots.some(x => x.hidden) && (
                <View style={s.editorBox}>
                  <Text style={s.editorSectionLabel}>OCULTAS</Text>
                  {sortSlots(editingSlots).filter(x => x.hidden).map(slot => (
                    <View key={slot.id} style={s.editorHiddenRow}>
                      <Text style={s.editorHiddenName}>{slot.emoji} {slot.name}{!isKnownSlot(slot.id) && typeof slot.hour === 'number' ? ` · ${fmtSlotHour(slot.hour)}` : ''}</Text>
                      <TouchableOpacity style={s.editorToggleBtn} onPress={() => toggleEditSlot(slot.id)} accessibilityLabel={`Mostrar ${slot.name}`}>
                        <Text style={[s.editorToggleText, { color: T.accent }]}>Mostrar</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Agregar una comida propia, con la hora en que suele ser (así va en su lugar y se anota a su hora) */}
              {visibleSlots(editingSlots).length < MAX_VISIBLE && (
                <View style={s.editorBox}>
                  <Text style={s.editorSectionLabel}>AGREGAR UNA COMIDA</Text>
                  <View style={s.editorAddRow}>
                    <TextInput
                      style={[s.editorNameInput, { flex: 1 }]}
                      value={newMealName}
                      onChangeText={(v) => { setNewMealName(v); setEditorMsg(null); }}
                      placeholder="Ej: Pre-entreno"
                      placeholderTextColor={T.textMuted}
                      onSubmitEditing={addEditSlot}
                      returnKeyType="done"
                      maxLength={NAME_MAX}
                    />
                    <TouchableOpacity
                      style={[s.editorAddBtn, !newMealName.trim() && { opacity: 0.4 }]}
                      onPress={addEditSlot}
                      disabled={!newMealName.trim()}
                      accessibilityLabel="Agregar comida"
                    >
                      <Text style={s.editorAddBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[s.editorHourRow, { marginTop: 8 }]}>
                    <Text style={s.editorHint}>Suele ser a las</Text>
                    <TouchableOpacity style={s.editorHourBtn} onPress={() => setNewMealHour(h => stepHour(h, -0.5))} accessibilityLabel="Media hora antes">
                      <Text style={s.editorHourBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={s.editorHourText}>🕒 {fmtSlotHour(newMealHour)}</Text>
                    <TouchableOpacity style={s.editorHourBtn} onPress={() => setNewMealHour(h => stepHour(h, 0.5))} accessibilityLabel="Media hora después">
                      <Text style={s.editorHourBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>

            {editorMsg && <Text style={[s.editorMsg, editorMsg.error && s.editorMsgError]}>{editorMsg.text}</Text>}

            <View style={s.editorActions}>
              <TouchableOpacity
                style={s.editorResetBtn}
                onPress={() => { setEditingSlots(resetSlots(editingSlots)); setEditorMsg({ text: 'Volvieron las comidas de siempre. Tus comidas propias quedaron ocultas.' }); }}
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
        </KeyboardLiftView>
      </Modal>

      {/* Confirmación "¿es el mismo alimento?" — Eris detectó un candidato
          parecido en el historial; nunca se registra sin que el usuario confirme. */}
      <Modal visible={!!pendingSimilarFood} transparent animationType="fade" onRequestClose={() => resolvePendingSimilarFood(false)}>
        <View style={s.simOverlay}>
          <View style={s.simCard}>
            <Text style={s.simTitle}>¿Es el mismo alimento?</Text>
            <Text style={s.simText}>
              "{pendingSimilarFood?.newFood.name}" se parece a{' '}
              <Text style={{ fontWeight: '700', color: T.text }}>"{pendingSimilarFood?.candidate.name}"</Text>
              {' '}que ya tenés guardado — pero los macros pueden variar bastante entre uno y otro.
            </Text>
            <View style={s.simRow}>
              <TouchableOpacity style={s.simBtnNo} onPress={() => resolvePendingSimilarFood(false)}>
                <Text style={s.simBtnNoText}>No, es diferente</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.simBtnYes} onPress={() => resolvePendingSimilarFood(true)}>
                <Text style={s.simBtnYesText}>Sí, es lo mismo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <BarcodeScanner
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onBarcode={handleBarcode}
      />

      <SupplementsSheet mode={supSheet} onClose={() => setSupSheet(null)} />

      <LoggedFoodSheet
        entry={openEntry}
        slots={sortSlots(mealSlots)}
        slotLabel={getSlotLabel}
        wakeHour={wakeHourRef.current}
        onClose={() => setOpenEntry(null)}
        onSave={handleEditFood}
        onDelete={(e) => { setOpenEntry(null); handleDeleteFood(e); }}
        onForgetMine={handleForgetMine}
      />

      <AddProductModal
        visible={!!addProduct}
        code={addProduct?.code ?? ''}
        suggestedName={addProduct?.name}
        suggestedBrand={addProduct?.brand}
        onClose={() => { setAddProduct(null); setBarcodeError('Puedes buscarlo por nombre o volver a escanearlo y cargar la etiqueta.'); }}
        onSaved={(food) => { setAddProduct(null); handleSelectFood(food); }}
      />

      {/* Deshacer un borrado de comida: flota sobre todo, así se ve sin importar qué tan abajo hayas scrolleado. */}
      {lastDeletedFood && lastDeletedFood.day === dayOf(currentDate) && (
        <Animated.View
          style={[
            s.undoSnack,
            { bottom: insets.bottom + 16, opacity: undoSnackAnim, transform: [{ translateY: undoSnackAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
          ]}
        >
          <Text style={s.undoSnackText} numberOfLines={1}>«{lastDeletedFood.entry.food.name}» eliminado</Text>
          <TouchableOpacity onPress={handleUndoDeleteFood} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.undoSnackAction}>DESHACER</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
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

  dateSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: T.bgCard, borderRadius: R.md, padding: S.sm, marginBottom: 12, borderWidth: 1, borderColor: T.border },
  dateBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  dateBtnText: { color: T.accent, fontSize: 18, fontWeight: 'bold' },
  dateText: { color: T.text, fontSize: 16, fontWeight: '600', textTransform: 'capitalize' },
  
  deleteBtnText: { color: T.red, fontSize: 24, fontWeight: 'bold', paddingLeft: 12, paddingRight: 4 },


  summaryCard:  { backgroundColor: T.bgCard, borderRadius: R.lg, padding: S.md, marginBottom: 12, borderWidth: 1, borderColor: T.border },
  summaryTitle: { color: T.textLight, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12 },
  macroRow:     { flexDirection: 'row', justifyContent: 'space-around' },
  deficitRow:   { marginTop: 14 },
  deficitBar:   { height: 5, backgroundColor: T.border, borderRadius: R.full, overflow: 'hidden' },
  deficitFill:  { height: '100%', borderRadius: R.full },
  deficitText:  { fontSize: 11, fontWeight: '700', marginTop: 6, textAlign: 'center' },

  waterCard:   { backgroundColor: T.bgCard, borderRadius: R.lg, padding: S.md, marginBottom: 12, borderWidth: 1, borderColor: T.borderActive },
  waterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  waterTitle:  { color: T.text, fontSize: 14, fontWeight: '700' },
  waterTotal:  { color: T.accent, fontSize: 14, fontWeight: '700' },
  waterEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waterEditInput: {
    color: T.text, fontSize: 14, fontWeight: '700', backgroundColor: T.bgInput,
    borderRadius: R.sm, borderWidth: 1, borderColor: T.accent, paddingHorizontal: 8, paddingVertical: 4, width: 56, textAlign: 'right',
  },
  waterEditOk:     { color: T.green, fontSize: 18, fontWeight: '900' },
  waterEditCancel: { color: T.textMuted, fontSize: 18, fontWeight: '900' },
  waterBar:    { height: 8, backgroundColor: T.border, borderRadius: R.sm, marginBottom: 12, overflow: 'hidden' },
  waterFill:   { height: '100%', backgroundColor: T.accent, borderRadius: R.sm },
  waterBtns:   { flexDirection: 'row', gap: 8 },
  waterBtn:    { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: T.accentGlow, borderWidth: 1, borderColor: T.borderActive, alignItems: 'center' },
  waterBtnText: { color: T.accent, fontSize: 13, fontWeight: '700' },
  waterUndo: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: R.full, borderWidth: 1, borderColor: T.border },
  waterUndoText: { color: T.textLight, fontSize: 12, fontWeight: '600' },
  waterFoodNote: { color: T.textMuted, fontSize: 11, marginTop: 6 },
  mealTimeHint: { color: T.textMuted, fontSize: 11, marginTop: 6 },

  undoSnack: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    backgroundColor: '#1c1c22', borderRadius: R.md, borderWidth: 1, borderColor: T.border,
    paddingVertical: 12, paddingHorizontal: 16,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  undoSnackText: { color: T.text, fontSize: 13, flex: 1 },
  undoSnackAction: { color: T.accent, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },

  mealSection:       { marginBottom: S.md },
  mealSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mealSectionTitle:  { color: T.textLight, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  mealSectionCal:    { color: T.gold, fontSize: 11, fontWeight: '700' },
  foodEntry:         { flexDirection: 'row', alignItems: 'center', backgroundColor: T.bgCard, borderRadius: R.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: T.border },
  foodEntryTap:      { flex: 1, flexDirection: 'row', alignItems: 'center' },
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
  scanIconBtn: { padding: 6, marginLeft: 4 },
  barcodeError: {
    marginHorizontal: S.md, marginTop: 8,
    backgroundColor: 'rgba(244,63,94,0.1)', borderRadius: R.md,
    padding: 10, borderWidth: 1, borderColor: 'rgba(244,63,94,0.3)',
  },
  safetyBox: {
    marginTop: 10, backgroundColor: 'rgba(245,158,11,0.10)', borderRadius: R.md,
    padding: 10, borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
  },
  safetyBoxBlocked: { backgroundColor: 'rgba(244,63,94,0.10)', borderColor: 'rgba(244,63,94,0.4)' },
  safetyTitle: { color: '#f59e0b', fontSize: 13, fontWeight: '800', marginBottom: 2 },
  safetyText: { color: T.textMuted, fontSize: 12, lineHeight: 17 },
  barcodeErrorText: { color: '#f43f5e', fontSize: 12, lineHeight: 18 },
  noResults:   { color: T.textMuted, textAlign: 'center', marginTop: 32, fontSize: 14 },
  askErisBtn:  { marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: T.accent },
  askErisText: { color: T.accent, fontSize: 14, fontWeight: '700' },
  resultRecent: { color: T.accent, fontSize: 11, marginTop: 2, fontWeight: '600' },

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
  editorHint:      { color: T.textMuted, fontSize: 11, marginTop: 4 },
  editorHourRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  editorHourBtn:   { width: 28, height: 28, borderRadius: 8, backgroundColor: T.border, alignItems: 'center', justifyContent: 'center' },
  editorHourBtnText: { color: T.textLight, fontSize: 16, fontWeight: '700', lineHeight: 20 },
  editorHourText:  { color: T.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  editorToggleBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: T.border },
  editorToggleText: { color: T.textMuted, fontSize: 12, fontWeight: '700' },
  editorBox:       { marginTop: S.md, paddingTop: S.md, borderTopWidth: 1, borderTopColor: T.border },
  editorSectionLabel: { color: T.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  editorHiddenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  editorHiddenName: { color: T.textLight, fontSize: 14, opacity: 0.7, flex: 1 },
  editorMsg:       { color: T.textLight, fontSize: 12, paddingHorizontal: S.lg, paddingTop: S.sm },
  editorMsgError:  { color: T.red },
  editorAddBtn:    { width: 44, height: 44, borderRadius: 12, backgroundColor: T.accentGlow, borderWidth: 1, borderColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  editorAddBtnText: { color: T.accent, fontSize: 24, fontWeight: '700', lineHeight: 32 },

  editorActions:    { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: S.lg, paddingTop: S.md, gap: 10, borderTopWidth: 1, borderTopColor: T.border },
  editorResetBtn:   { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: T.border },
  editorResetText:  { color: T.textMuted, fontSize: 13, fontWeight: '600' },
  editorCancelBtn:  { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: T.border },
  editorCancelText: { color: T.textLight, fontSize: 13, fontWeight: '600' },
  editorSaveBtn:    { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: T.accent },
  editorSaveText:   { color: '#000', fontSize: 13, fontWeight: '800' },

  // ── Modal "¿es el mismo alimento?" ──
  simOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: S.lg },
  simCard:    { backgroundColor: '#0e0e18', borderRadius: R.lg, padding: S.lg, borderWidth: 1, borderColor: T.border, width: '100%', maxWidth: 400 },
  simTitle:   { color: T.text, fontSize: 17, fontWeight: '800', marginBottom: 10 },
  simText:    { color: T.textLight, fontSize: 14, lineHeight: 20 },
  simRow:     { flexDirection: 'row', gap: 10, marginTop: 20 },
  simBtnNo:   { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: T.border, alignItems: 'center' },
  simBtnNoText: { color: T.textLight, fontSize: 13, fontWeight: '700' },
  simBtnYes:  { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: T.accent, alignItems: 'center' },
  simBtnYesText: { color: '#000', fontSize: 13, fontWeight: '800' },
});

/**
 * NutritionBackend — lo que el servidor sabe de la nutrición de HOY, combinado con Health Connect SIN contar doble.
 *
 * Health Connect es lo que leen Inicio y Métricas. Lo anotado por chat vive en el servidor y Nutrición lo copia a
 * Health Connect solo cuando esa pantalla está abierta. Antes Inicio sumaba SIEMPRE lo del servidor encima de
 * Health Connect (contaba doble lo ya copiado) y Métricas no lo sumaba nunca. Ahora se suma únicamente lo que
 * todavía NO está en el registro local del teléfono (lo que sí está, ya pasó a Health Connect).
 */

import { addManualSleep, saveWakeDecision } from './sleep/sleepStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { wsManager } from './WebSocketManager';
import { metricsService, MANUAL_SLEEP_PREFIX, type HealthSnapshot } from './MetricsService';
import { insertNutrition, insertHydration, deleteNutrition } from './nutritionHC';
import { foodSearchService, type LoggedFood } from './FoodSearchService';
import { logWaterL, servingWaterL } from './foodWater';
import { slotAt, MEAL_ORDER } from './mealSchedule';
import { daySchedule } from './daySchedule';
import { PROFILE_CHANGED_EVENT } from './ScopedStorage';
import {
  STORAGE_KEY_LOG, STORAGE_KEY_WATER, STORAGE_KEY_WATER_SEEN, STORAGE_KEY_SYNC_V2, STORAGE_KEY_GOALS, STORAGE_KEY_GOALS_SET,
  STORAGE_KEY_WATER_HCIDS, STORAGE_KEY_WATER_APPLIED, HC_MEAL_MAP,
  backendNotInLocal, sumItems, waterNotSeen, mergeGoals, serverEntryToLogged, applyServerDeletion, foodLogForServer,
  mergeServerEntries, logKey, pendingKey, STORAGE_KEY_PENDING_DEL,
  type ServerEntry, type ServerWater, type PendingDelete,
} from './nutritionSync';

/** Nutrición vuelve a leer ese día si lo está mostrando (lo anotado por chat para ayer llegó). */
export const NUTRITION_DAY_UPDATED = 'NUTRITION_DAY_UPDATED';

const parse = <T,>(raw: string | null, fallback: T): T => { try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };

class NutritionBackend {
  private entries: ServerEntry[] = [];
  private waters: ServerWater[] = [];
  private listeners = new Set<() => void>();
  private unsub: (() => void) | null = null;
  private migrating: Promise<void> | null = null;
  /** Nutrición abierta: ella aplica los borrados de Eris; si no, los aplica este servicio (ver applyServerDelete). */
  private screenMounted = false;
  setScreenMounted(v: boolean) { this.screenMounted = v; }

  /** Olvida lo que mandó el servidor (era de otra cuenta). */
  forgetServerData() {
    this.entries = [];
    this.waters = [];
    this.notify();
  }

  /** Empieza a escuchar al servidor (idempotente). Se llama al iniciar sesión. */
  start() {
    if (this.unsub) return;
    const off = wsManager.subscribeMessage((d: any) => {
      switch (d?.type) {
        case 'connected':
          // Los datos de Forge (peso, actividad, entreno de hoy) primero: con ellos el servidor calcula las metas
          AsyncStorage.getItem('eris_body_profile').then((raw) => {
            if (raw) { try { wsManager.sendMessage({ type: 'sync_body_profile', body: JSON.parse(raw) }); } catch {} }
          }).catch(() => {});
          wsManager.sendMessage({ type: 'sync_nutrition_today' });
          // Lo anotado por chat para ayer o anteayer mientras el teléfono no estaba conectado
          wsManager.sendMessage({ type: 'sync_nutrition_days', days: this.recentPastDays() });
          this.backfillHistory().catch(() => {});
          break;
        case 'nutrition_days':
          for (const d0 of Array.isArray(d.days) ? d.days : []) {
            if (d0 && typeof d0.day === 'string' && Array.isArray(d0.entries)) this.applyPastEntries(d0.day, d0.entries);
          }
          break;
        case 'nutrition_today':
          this.entries = Array.isArray(d.entries) ? d.entries : [];
          this.waters = Array.isArray(d.waterEntries) ? d.waterEntries : [];
          this.ensureMigrated(this.waters).finally(() => this.notify());
          this.applyGoals(d.goals).catch(() => {});
          if (d.goalsSet && typeof d.goalsSet === 'object') AsyncStorage.setItem(STORAGE_KEY_GOALS_SET, JSON.stringify(d.goalsSet)).catch(() => {});
          if ('sleepToday' in d) this.applyManualSleep(d.sleepToday).catch(() => {});
          break;
        // "Dormí 7 horas" por chat (sleep_log): Métricas, Inicio y el puntaje lo usan si el reloj no midió esa noche
        case 'sleep_logged':
          this.applyManualSleep(d.hours, d.day).catch(() => {});
          break;
        // «Dormí de 17:30 a 23:50» por chat: el mismo tramo que anotar en la pantalla de Sueño (2026-11-07)
        case 'sleep_tramo':
          if (typeof d.start === 'number' && typeof d.end === 'number' && d.end > d.start) addManualSleep(d.start, d.end).catch(() => {});
          break;
        case 'sleep_wake_decision':
          if (typeof d.end === 'string' && (d.choice === 'dormir' || d.choice === 'partir')) saveWakeDecision(d.end, d.choice).catch(() => {});
          break;
        // Metas fijadas por chat (set_nutritional_goals): llegan aparte, sin esperar a la próxima sincronización completa
        case 'nutrition_goals_updated':
          this.applyGoals(d.goals).catch(() => {});
          break;
        // Cualquier cambio del lado del servidor: se vuelve a pedir el estado completo (es la verdad)
        case 'nutrition_entry_deleted':
          if (!this.screenMounted) this.applyServerDelete(d).catch(() => {});
          wsManager.sendMessage({ type: 'sync_nutrition_today' });
          break;
        case 'nutrition_logged':
          // «ayer cené…»: va a ese día, no a hoy (y no hace falta volver a pedir el de hoy)
          if (typeof d.day === 'string' && d.day !== daySchedule.todayKey() && d.entry) { this.applyPastEntries(d.day, [d.entry]); break; }
          wsManager.sendMessage({ type: 'sync_nutrition_today' });
          break;
        case 'hydration_logged':
          wsManager.sendMessage({ type: 'sync_nutrition_today' });
          break;
      }
    });
    this.unsub = () => { off(); };
    if (wsManager.getStatus() === 'connected') wsManager.sendMessage({ type: 'sync_nutrition_today' });
    this.backfillHealthConnect().catch(() => {});
  }

  /**
   * Eris borró algo por chat y Nutrición no está abierta. Antes ese aviso se perdía: el alimento seguía en el registro del
   * teléfono y en Health Connect, y Inicio y Métricas lo seguían sumando aunque en el chat ya no existiera.
   */
  private async applyServerDelete(d: { items?: unknown; timestamps?: unknown }) {
    const key = `${STORAGE_KEY_LOG}_${daySchedule.todayKey()}`;
    const local = parse<LoggedFood[]>(await AsyncStorage.getItem(key), []);
    const { next, removed } = applyServerDeletion(local, d);
    if (!removed.length) return;
    await AsyncStorage.setItem(key, JSON.stringify(next));
    for (const e of removed) await deleteNutrition(e).catch(() => {});
    await metricsService.getSnapshot(true).catch(() => null); // que Inicio/Métricas lean Health Connect ya sin eso
    this.notify();
  }

  /** Guarda (o borra, con null) el sueño anotado por chat de esa noche y, si cambió, hace que todo se vuelva a leer. */
  private async applyManualSleep(hours: unknown, day?: unknown) {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const key = MANUAL_SLEEP_PREFIX + (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today);
    const prev = await AsyncStorage.getItem(key);
    const next = typeof hours === 'number' && hours > 0 ? String(hours) : null;
    if (prev === next) return;
    if (next) await AsyncStorage.setItem(key, next); else await AsyncStorage.removeItem(key);
    if (key === MANUAL_SLEEP_PREFIX + today) { metricsService.invalidate(); this.notify(); }
  }

  /** Los alimentos de HOY del teléfono (lo anotado a mano incluido), para que Eris los vea. */
  async todayFoodLog() {
    const day = daySchedule.todayKey();
    const local = parse<LoggedFood[]>(await AsyncStorage.getItem(`${STORAGE_KEY_LOG}_${day}`), []);
    return foodLogForServer(day, local, (f, g) => foodSearchService.calcPortion(f, g));
  }

  /**
   * Qué tomas de agua del chat ya están en el total de agua de un snapshot armado con `merge` (para el servidor, ver
   * eris/src/services/WaterToday.ts): las que están en Health Connect, las que `merge` sumó y, si el agua salió del registro
   * de la app, las ya sumadas ahí. Sin esto el servidor no sabía cuáles faltaban y respondía con otro total.
   */
  async chatWaterCounted(snap: { hydrationFromApp?: boolean }): Promise<string[]> {
    const day = daySchedule.todayKey();
    const [seenRaw, appliedRaw] = await Promise.all([
      AsyncStorage.getItem(`${STORAGE_KEY_WATER_SEEN}_${day}`),
      AsyncStorage.getItem(`${STORAGE_KEY_WATER_APPLIED}_${day}`),
    ]);
    return [...new Set([
      ...parse<string[]>(seenRaw, []),
      ...(snap.hydrationFromApp ? parse<string[]>(appliedRaw, []) : []),
      ...this.waters.map((w) => w.timestamp),
    ])].filter(Boolean).slice(-200);
  }

  /**
   * Una vez al día: los días anteriores según Health Connect van al servidor, que rellena SOLO lo que le falte en su
   * historial diario (nunca pisa lo que ya tiene). Así el análisis personal no depende de que ese historial nunca se pierda.
   */
  private async backfillHistory() {
    const day = daySchedule.todayKey();
    const KEY = 'eris_rollup_backfill_day';
    if ((await AsyncStorage.getItem(KEY)) === day) return;
    const history = await metricsService.readDailyHistory(45).catch(() => []);
    if (!history.length) return;
    wsManager.sendMessage({ type: 'backfill_rollup', days: history });
    await AsyncStorage.setItem(KEY, day);
  }

  /** Ayer y anteayer (días de comida), como los guarda el teléfono («Thu Oct 15 2026»). */
  private recentPastDays(): string[] {
    const out: string[] = [];
    for (let i = 1; i <= 2; i++) { const d = daySchedule.todayDate(); d.setDate(d.getDate() - i); out.push(d.toDateString()); }
    return out;
  }

  private pastOps: Promise<void> = Promise.resolve();
  /**
   * Comidas que Eris anotó por chat para un día anterior («ayer cené 2 empanadas», 2026-10-16): al registro de ESE día, sin
   * duplicar, y a Health Connect con su hora de ese día. Solo hasta 7 días atrás y nunca hoy (hoy lo maneja Nutrición).
   */
  applyPastEntries(day: string, entries: ServerEntry[]) {
    this.pastOps = this.pastOps.then(async () => {
      const t = Date.parse(day);
      if (!entries.length || Number.isNaN(t) || day === daySchedule.todayKey() || Date.now() - t > 8 * 86_400_000 || t > Date.now()) return;
      const key = `${STORAGE_KEY_LOG}_${day}`;
      const prev = parse<LoggedFood[]>(await AsyncStorage.getItem(key), []);
      const pending = new Set(parse<PendingDelete[]>(await AsyncStorage.getItem(STORAGE_KEY_PENDING_DEL), []).map(pendingKey));
      const slotOf = (mt: string, ts: string) =>
        (MEAL_ORDER as readonly string[]).includes(mt) ? mt : mt === 'merienda' ? 'colacion_pm' : (mt || slotAt(new Date(ts)));
      let n = 0;
      const { next, added } = mergeServerEntries(prev, entries, slotOf, () => `eris_${Date.now()}_${n++}_${Math.random().toString(36).slice(2, 8)}`, pending);
      if (!added.length) return;
      await AsyncStorage.setItem(key, JSON.stringify(next));
      const ids = new Map<string, string>();
      for (const e of added) {
        try { const id = await insertNutrition(e, HC_MEAL_MAP[e.mealType] ?? 0); if (id) ids.set(logKey(e), id); } catch {}
      }
      if (ids.size) {
        const saved = parse<LoggedFood[]>(await AsyncStorage.getItem(key), []).map((e) => (ids.has(logKey(e)) && !e.hcId ? { ...e, hcId: ids.get(logKey(e)) } : e));
        await AsyncStorage.setItem(key, JSON.stringify(saved));
      }
      metricsService.invalidate();
      DeviceEventEmitter.emit(NUTRITION_DAY_UPDATED, day);
      this.notify();
    }).catch(() => {});
  }

  /** Al cerrar sesión: no se conserva nada de la cuenta anterior. */
  stop() {
    this.unsub?.(); this.unsub = null;
    this.entries = []; this.waters = [];
    this.notify();
  }

  /** Lo que Eris anotó HOY por chat (aunque Nutrición no se haya abierto): el Inventario descuenta también eso. */
  serverEntriesToday(): ServerEntry[] { return this.entries; }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }
  private notify() { this.listeners.forEach((cb) => { try { cb(); } catch {} }); }

  /**
   * Avisa a los suscriptores (Inicio, Métricas) aunque el cambio no haya venido del servidor — un registro
   * manual en Nutrición (los botones +250ml, buscar y guardar un alimento) nunca pasa por el WS, así que sin
   * esto nadie más se enteraba hasta el próximo enfoque de esa pantalla (o nunca, si Health Connect tampoco
   * tenía el permiso de escritura). Nutrición lo llama después de cada acción local.
   */
  refreshLocal() { this.notify(); }

  /**
   * Reintenta escribir en Health Connect lo de HOY que quedó marcado como registrado en el teléfono pero sin
   * llegar allá (`insertNutrition`/`insertHydration` fallaron en su momento — típicamente porque el permiso de
   * escritura todavía no estaba otorgado). Nutrición seguía mostrando el total correcto porque lee su propio
   * registro local, pero Inicio y Métricas leen Health Connect directo y no veían nada de eso. Se llama al
   * iniciar sesión y justo después de conceder permisos, para que lo ya anotado aparezca sin tener que volver a
   * registrarlo.
   */
  async backfillHealthConnect(): Promise<void> {
    const day = daySchedule.todayKey();

    // Comida: cada ítem guarda el id que le dio Health Connect (`hcId`) cuando el insert funcionó; el que no lo
    // tiene todavía no llegó allá.
    try {
      const raw = await AsyncStorage.getItem(`${STORAGE_KEY_LOG}_${day}`);
      const log: LoggedFood[] = parse<LoggedFood[]>(raw, []);
      const missing = log.filter((e) => !e.hcId);
      if (missing.length) {
        let changed = false;
        for (const e of missing) {
          try {
            const id = await insertNutrition(e, HC_MEAL_MAP[e.mealType] ?? 0);
            if (id) { e.hcId = id; changed = true; }
          } catch { /* sigue sin permiso o Health Connect no disponible: se reintenta la próxima vez */ }
        }
        if (changed) await AsyncStorage.setItem(`${STORAGE_KEY_LOG}_${day}`, JSON.stringify(log));
      }
    } catch {}

    // Agua: se compara el total local del día contra lo que Health Connect ya tiene y se sube solo la diferencia,
    // como una toma de ajuste — evita duplicar lo que sí llegó. Su id se guarda junto a los de las demás tomas
    // de hoy (misma lista que usa Nutrición para "editar el total"), para que también se limpie si el usuario
    // corrige el total a mano más tarde.
    try {
      const localTotal = parseFloat((await AsyncStorage.getItem(`${STORAGE_KEY_WATER}_${day}`)) || '0') || 0;
      if (localTotal > 0) {
        const snap = await metricsService.getSnapshot(true);
        const gap = Math.round((localTotal - (snap.hydration || 0)) * 100) / 100;
        if (gap > 0.01) {
          const id = await insertHydration(gap);
          if (id) {
            const key = `${STORAGE_KEY_WATER_HCIDS}_${day}`;
            const ids = parse<string[]>(await AsyncStorage.getItem(key), []);
            await AsyncStorage.setItem(key, JSON.stringify([...ids, id]));
          }
        }
      }
    } catch {}

    this.notify();
  }

  /**
   * Antes el total de agua del servidor REEMPLAZABA el local. La primera vez con el modelo nuevo, si ya hay agua local hoy,
   * el agua que el servidor ya tenía se da por aplicada (si no, se sumaría otra vez). Si no hay agua local, no hay nada
   * "ya aplicado" y todo se suma normal (instalación nueva o día nuevo). Es idempotente y compartida entre pantallas.
   */
  ensureMigrated(waters: ServerWater[]): Promise<void> {
    if (!this.migrating) {
      this.migrating = (async () => {
        try {
          if (await AsyncStorage.getItem(STORAGE_KEY_SYNC_V2)) return;
          await AsyncStorage.setItem(STORAGE_KEY_SYNC_V2, '1');
          const day = daySchedule.todayKey();
          const localWater = parseFloat((await AsyncStorage.getItem(`${STORAGE_KEY_WATER}_${day}`)) || '0') || 0;
          if (!(localWater > 0)) return;
          const key = `${STORAGE_KEY_WATER_SEEN}_${day}`;
          const seen = parse<string[]>(await AsyncStorage.getItem(key), []);
          await AsyncStorage.setItem(key, JSON.stringify([...new Set([...seen, ...waters.map((w) => w.timestamp)])]));
        } catch {}
      })().finally(() => { this.migrating = null; });
    }
    return this.migrating;
  }

  /**
   * Guarda localmente las metas fijadas por chat (`set_nutritional_goals`). Antes esto no existía: la clave que
   * leen Inicio, Nutrición y Métricas nunca se escribía, así que el resumen del día siempre mostraba los valores
   * por defecto aunque el usuario hubiera configurado sus propias metas.
   */
  private async applyGoals(goals: Record<string, unknown> | undefined | null): Promise<void> {
    if (!goals || !Object.keys(goals).length) return;
    const prev = parse<Record<string, number>>(await AsyncStorage.getItem(STORAGE_KEY_GOALS), {});
    const next = mergeGoals(prev, goals);
    if (!next) return;
    await AsyncStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(next));
    DeviceEventEmitter.emit('NUTRITION_GOALS_UPDATED');
  }

  /**
   * Lo anotado por chat que todavía no está en el registro del teléfono, como ítems del registro (para evaluar la
   * calidad del día sin esperar a que se abra Nutrición). La comida se ubica por la hora en que se anotó.
   */
  async pendingLogged(): Promise<LoggedFood[]> {
    if (!this.entries.length) return [];
    const day = daySchedule.todayKey();
    const local = parse<LoggedFood[]>(await AsyncStorage.getItem(`${STORAGE_KEY_LOG}_${day}`), []);
    // Sin tipo de comida: la de esa hora (la tabla única de services/mealSchedule.ts)
    const slotByHour = (mealType: string, ts: string) => mealType || slotAt(new Date(ts));
    let n = 0;
    return backendNotInLocal(this.entries, local).flatMap((e) => serverEntryToLogged(e, slotByHour, () => `pend_${n++}`));
  }

  /**
   * Suma a un snapshot de Health Connect lo del servidor que aún no está copiado allí, y el agua que trae la comida del día
   * (`foodWaterL`, incluida en `hydration`: la meta es de agua total). Al servidor va solo lo bebido (ver App.sendHealthSnapshot).
   */
  async merge(base: HealthSnapshot): Promise<HealthSnapshot> {
    const day = daySchedule.todayKey();
    const [logRaw, seenRaw, appliedRaw] = await Promise.all([
      AsyncStorage.getItem(`${STORAGE_KEY_LOG}_${day}`),
      AsyncStorage.getItem(`${STORAGE_KEY_WATER_SEEN}_${day}`),
      AsyncStorage.getItem(`${STORAGE_KEY_WATER_APPLIED}_${day}`),
    ]);
    const local = parse<LoggedFood[]>(logRaw, []);
    const missing = backendNotInLocal(this.entries, local);
    const t = sumItems(missing);
    // Agua del chat que el total todavía no tiene: lo que no está en Health Connect ("vista") y, si el agua salió del registro
    // de la app (sin Health Connect), tampoco lo ya sumado ahí
    const counted = [...parse<string[]>(seenRaw, []), ...(base.hydrationFromApp ? parse<string[]>(appliedRaw, []) : [])];
    const water = waterNotSeen(this.waters, counted).reduce((a, w) => a + w.liters, 0);
    // El agua de la comida: lo anotado en el teléfono + lo del chat que aún no llegó acá
    const foodWater = Math.round((logWaterL(local) + missing.reduce((a, e) => a + (e.items ?? []).reduce((b, i) => b + servingWaterL(i), 0), 0)) * 100) / 100;
    // Lo bebido; si `base` ya venía combinado, sin el agua de la comida que ya traía (no se suma dos veces)
    const drinks = base.hydration == null ? null : base.hydration - (base.foodWaterL ?? 0);
    const drank = water > 0 ? (drinks || 0) + water : drinks;
    const hydration = drank == null && !(foodWater > 0) ? null : Math.round(((drank || 0) + foodWater) * 100) / 100;
    if (!missing.length) return { ...base, hydration, foodWaterL: foodWater };
    return {
      ...base,
      nutrition: missing.length ? {
        calories: Math.round((base.nutrition?.calories || 0) + t.calories),
        protein: Math.round(((base.nutrition?.protein || 0) + t.protein) * 10) / 10,
        carbs: Math.round(((base.nutrition?.carbs || 0) + t.carbs) * 10) / 10,
        fat: Math.round(((base.nutrition?.fat || 0) + t.fat) * 10) / 10,
        fiber: Math.round(((base.nutrition?.fiber || 0) + t.fiber) * 10) / 10,
        sugar: base.nutrition?.sugar || 0,
        sodium: base.nutrition?.sodium || 0,
      } : base.nutrition,
      hydration, foodWaterL: foodWater,
    };
  }
}

export const nutritionBackend = new NutritionBackend();
// Otra cuenta en el mismo teléfono: lo que mandó el servidor era de la anterior; el de la nueva llega al reconectar
DeviceEventEmitter.addListener(PROFILE_CHANGED_EVENT, () => nutritionBackend.forgetServerData());

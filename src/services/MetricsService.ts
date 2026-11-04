import { Linking, Platform, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROFILE_CHANGED_EVENT } from './ScopedStorage';
import { STORAGE_KEY_WATER, STORAGE_KEY_LOG } from './nutritionSync';
import { daySchedule } from './daySchedule';
import { nutritionDayOf, nutritionDayStart, nutritionDayKey, isoDayKey } from './mealSchedule';
import { trackGoal, type GoalTrack } from './nutritionQualityCore';
import { detectActivity, mainOrigin, type ActivitySummary, type ActivityLabel, type ActivityType } from './activityDetect';
import { autoLevel, WINDOW_DAYS, type AutoLevel, type DayActivity } from './activityLevel';
import { AuthStorage } from './AuthStorage';
import { sleepDay, sleepByDay, sleepInsights, applySleepEdits, nightRecords, planProgress, planTitle, sleepPatterns, isCaffeinated, isAlcohol, type RawSession, type SleepEpisode, type SleepInsights, type HabitEvents, type SleepPatterns } from './sleep/sleepCore';
import { forgeStore, FORGE_STATE_KEY } from './forge/forgeStore';
import { loadSleepEdits, loadSleepPlan, SLEEP_EDITS_EVENT } from './sleep/sleepStore';

/** Lo que la persona dijo de cada actividad detectada («fue básquet»), por día (YYYY-MM-DD). */
export const ACTIVITY_LABELS_KEY = 'eris_activity_labels_v1';
/** Minutos de actividad detectada por día (YYYY-MM-DD): los avisos de «muévete» los leen sin volver a leer el pulso. */
export const ACTIVITY_DAYS_KEY = 'eris_activity_days_v1';
/** Ejercicio (kcal, min) y pasos por día (YYYY-MM-DD): el nivel de actividad automático sale de acá (activityLevel.ts). */
export const ACTIVITY_LEVEL_DAYS_KEY = 'eris_activity_level_days_v1';
import {
  initialize,
  readRecords,
  aggregateRecord,
  openHealthConnectSettings,
  getGrantedPermissions,
  requestPermission,
  type Permission,
} from 'react-native-health-connect';

/** Durante un tramo de sueño: pulso medio y mínimo, oxígeno (promedio y mínimo) y respiración; solo lo que el reloj mandó */
export type SleepVitals = { hr?: number; hrMin?: number; spo2?: number; spo2Min?: number; resp?: number };
export async function readSleepVitals(start: number, end: number): Promise<SleepVitals> {
  const range = { operator: 'between' as const, startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() };
  const during: SleepVitals = {};
  try {
    const agg: any = await aggregateRecord({ recordType: 'HeartRate', timeRangeFilter: range });
    if (agg?.BPM_AVG > 0) during.hr = Math.round(agg.BPM_AVG);
    if (agg?.BPM_MIN > 0) during.hrMin = Math.round(agg.BPM_MIN);
  } catch { /* sin permiso */ }
  try {
    const r: any = await readRecords('OxygenSaturation', { timeRangeFilter: range });
    const v = (r.records as any[]).map((x) => { const p = x.percentage ?? x.value; return p > 1 ? p : p * 100; }).filter((p) => p >= 50 && p <= 100);
    if (v.length) { during.spo2 = Math.round(v.reduce((a, b) => a + b, 0) / v.length); during.spo2Min = Math.round(Math.min(...v)); }
  } catch { /* sin permiso */ }
  try {
    const r: any = await readRecords('RespiratoryRate', { timeRangeFilter: range });
    const v = (r.records as any[]).map((x) => x.rate).filter((x) => x > 0 && x < 60);
    if (v.length) during.resp = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
  } catch { /* sin permiso */ }
  return during;
}
/** Los tramos de sueño de los últimos `days` días, con sus etapas y las correcciones de la persona (pantalla de Sueño) */
export async function readSleepSessions(days = 31): Promise<RawSession[]> {
  const end = new Date(), start = new Date(end.getTime() - days * 86_400_000);
  const all: any[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 10; i++) {
    const res: any = await readRecords('SleepSession', { timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() }, ...(pageToken ? { pageToken } : {}) } as any);
    all.push(...(res.records ?? []));
    pageToken = res.pageToken;
    if (!pageToken) break;
  }
  return applySleepEdits(toRawSessions(all), await loadSleepEdits());
}

/**
 * Sueño 2.0 · S4: lo que pasó antes de dormir en los últimos días, con su hora: lo anotado en Nutrición (café, alcohol,
 * comida), el fin de cada entreno (la última serie de Forge y las sesiones de ejercicio del reloj). Para «¿por qué duermo mal?».
 */
export async function readHabitEvents(days = 31): Promise<HabitEvents> {
  const ev: HabitEvents = { caffeine: [], alcohol: [], meals: [], training: [], logged: [] };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const keys = Array.from({ length: days + 1 }, (_, k) => `${STORAGE_KEY_LOG}_${new Date(today.getFullYear(), today.getMonth(), today.getDate() - k).toDateString()}`);
  try {
    for (const [, raw] of await AsyncStorage.multiGet(keys)) {
      let list: any[] = [];
      try { list = raw ? JSON.parse(raw) : []; } catch {}
      for (const e of Array.isArray(list) ? list : []) {
        const at = Date.parse(e?.loggedAt), name = String(e?.food?.name ?? '');
        if (Number.isNaN(at) || !name) continue;
        ev.logged.push(at);
        if (isCaffeinated(name)) ev.caffeine.push(at);
        if (isAlcohol(name)) ev.alcohol.push(at);
        if ((Number(e.food.calories) || 0) * (Number(e.grams) || 0) / 100 >= 80) ev.meals.push(at);
      }
    }
  } catch {}
  // Forge: la última serie de cada día ≈ el fin del entreno
  try {
    const S: any = forgeStore.get() ?? JSON.parse((await AsyncStorage.getItem(FORGE_STATE_KEY)) || 'null');
    const since = Date.now() - (days + 1) * 86_400_000;
    for (const day of Object.values(S?.sessions ?? {}) as any[]) {
      const ats = Object.values(day ?? {}).flatMap((sets: any) => (Array.isArray(sets) ? sets : []).map((x: any) => Number(x?.at) || 0)).filter((t) => t > since);
      if (ats.length) ev.training.push(Math.max(...ats));
    }
  } catch {}
  // El reloj: el fin de cada sesión de ejercicio
  try {
    const start = new Date(Date.now() - days * 86_400_000);
    let pageToken: string | undefined;
    for (let i = 0; i < 10; i++) {
      const res: any = await readRecords('ExerciseSession', { timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: new Date().toISOString() }, ...(pageToken ? { pageToken } : {}) } as any);
      for (const r of (res.records ?? []) as any[]) { const b = Date.parse(r.endTime); if (!Number.isNaN(b)) ev.training.push(b); }
      pageToken = res.pageToken;
      if (!pageToken) break;
    }
  } catch { /* sin permiso de ejercicio */ }
  return ev;
}

/** Lo que se repite en tus noches (30 días); se recalcula como mucho cada 3 h o al corregir el sueño */
let patternsCache: { at: number; value: SleepPatterns } | null = null;
DeviceEventEmitter.addListener(SLEEP_EDITS_EVENT, () => { patternsCache = null; });
export async function sleepPatternsNow(): Promise<SleepPatterns | null> {
  if (patternsCache && Date.now() - patternsCache.at < 3 * 3_600_000) return patternsCache.value;
  try {
    const value = sleepPatterns(await readSleepSessions(31), await readHabitEvents(31), { now: Date.now(), usualWake: daySchedule.usualWake(), usualSleepH: daySchedule.sleepHours() });
    patternsCache = { at: Date.now(), value };
    return value;
  } catch { return null; }
}

/** Las sesiones de sueño de Health Connect, con sus etapas, para sleepCore */
const toRawSessions = (records: any[]): RawSession[] => records.map((r) => ({
  start: Date.parse(r.startTime), end: Date.parse(r.endTime),
  stages: (r.stages ?? []).map((st: any) => ({ start: Date.parse(st.startTime), end: Date.parse(st.endTime), stage: Number(st.stage) })),
}));

// Todo lo que la app lee o escribe en Health Connect (debe reflejar los `readRecords`/`aggregateRecord` de este
// archivo y los `insertRecords` de nutritionHC.ts, y los permisos declarados en app.json).
const ALL_HC_PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'OxygenSaturation' },
  { accessType: 'read', recordType: 'RespiratoryRate' },
  { accessType: 'read', recordType: 'Vo2Max' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'Height' },
  { accessType: 'read', recordType: 'BloodGlucose' },
  { accessType: 'read', recordType: 'Nutrition' },
  { accessType: 'write', recordType: 'Nutrition' },
  { accessType: 'read', recordType: 'Hydration' },
  { accessType: 'write', recordType: 'Hydration' },
];

/** Puntaje del día; null = sin datos para esa parte (no es un 0). */
export interface DayScores { fixed: number | null; dynamic: number | null; total: number | null }
/** Sueño anotado por chat para la noche de la que se despertó ese día (YYYY-MM-DD): lo guarda NutritionBackend. */
export const MANUAL_SLEEP_PREFIX = 'eris_manual_sleep_';

export interface HealthSnapshot {
  sleep: {
    /** lo dormido en 24 h: la noche + un segundo sueño + siestas (la recuperación) */
    durationHours: number;
    /** eficiencia de la noche (dormido / en cama) */
    efficiency?: number;
    stages?: { light: number; deep: number; rem: number; awake?: number };
    startTime?: string;   // inicio de la noche
    endTime?: string;     // fin de la noche
    /** anotado por chat (sleep_log): el reloj no lo midió */
    manual?: boolean;
    /** Sueño 2.0 · S0: lo dormido en la noche (la calidad y el horario) */
    nightHours?: number;
    /** la noche tuvo un rato despierto largo o hubo un segundo sueño */
    split?: boolean;
    /** las partes del día, como en el reloj (services/sleep/sleepCore.ts) */
    episodes?: SleepEpisode[];
    /** durante la noche: pulso medio y mínimo, oxígeno (promedio y mínimo) y respiración */
    during?: { hr?: number; hrMin?: number; spo2?: number; spo2Min?: number; resp?: number };
  } | null;
  heartRate: {
    resting: number | null;
    average: number;
  } | null;
  steps: number | null;
  distance: number | null;        // km
  calories: number | null;        // kcal activas del día
  spo2: number | null;            // % — medido por el reloj durante el día
  respiratoryRate: number | null;
  vo2Max: number | null;
  activeMinutes: number | null; // min de ejercicio/movimiento del día (ExerciseSession)
  /** Actividad del día detectada con el pulso, los pasos y las calorías del reloj, sin «modo entrenamiento» (activityDetect.ts) */
  activity?: ActivitySummary | null;
  /** Nivel de actividad según las últimas 4 semanas reales (activityLevel.ts); null con menos de 14 días de datos */
  activityLevel?: AutoLevel | null;
  bmi: number | null;            // IMC calculated desde peso + estatura en HC
  weight: number | null;
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium: number;
  } | null;
  hydration: number | null;
  /** el agua salió del registro de la app (Health Connect no tenía o no está disponible), no de Health Connect */
  hydrationFromApp?: boolean;
  /**
   * Cuánto de `hydration` es el agua que trae la comida (services/foodWater.ts). Solo en un snapshot ya combinado por
   * nutritionBackend.merge; el de Health Connect es solo lo bebido.
   */
  foodWaterL?: number;
  glucose: {
    valueMgdl: number;
    valueMmol: number;
    timestamp: string;
    source: 'health_connect';
  } | null;
  lastUpdated: string;
  // Nuevos campos para contexto temporal
  wakeTime?: string;             // Hora exacta de despertar (del sueño)
  /**
   * Fin del sueño PRINCIPAL (el bloque más largo de las últimas 24 h): marca cuándo empezó el día de comida (una siesta
   * larga no lo reinicia). Lo usan la app y el servidor (services/mealSchedule.ts).
   */
  dayWakeTime?: string;
  /** Sueño 2.0 · S1: las 2 semanas de sueño (deuda, regularidad, cronotipo, puntaje de la noche y hora para acostarse) */
  sleepInsights?: SleepInsights;
  /** el plan de sueño en curso (pantalla de Sueño): la meta y cómo va, para el chat y la semana (Sueño 2.0 · S3) */
  sleepPlan?: { kind: string; title: string; text: string; day: number; hits: number; of: number; done: boolean } | null;
  /** lo que se repite en sus noches (30 días): café, alcohol, comer o entrenar tarde, siestas (Sueño 2.0 · S4) */
  sleepPatterns?: SleepPatterns;
  /** El despertar habitual que usa la app (Perfil o reloj); lo manda App al servidor para que calcule el mismo día. */
  schedule?: { usualWake?: number | null; sleepHours?: number };
}

/**
 * Señales de otros módulos para el Score Ejecutivo — no son datos de salud (no viven en HealthSnapshot), pero
 * antes se mostraban aparte sin pesar en el número final. `trainedToday` viene de Forge (`toji_last_workout`),
 * `savingsRate` de Finanzas (`finance_summary_<perfil>`, el mismo % que ya usa el asesor financiero).
 */
export interface ScoreExtras {
  trainedToday?: boolean;
  savingsRate?: number;
  /** Calidad de la alimentación HASTA AHORA (NutritionQuality.evaluateToday, 0-100): qué tan nutritivo, a su hora y cuánto vs lo esperable. null = aún no toca evaluar. */
  foodScore?: number | null;
  /** Hidratación vs lo esperable a esta hora, descontando bebidas azucaradas (0-100). Si viene, reemplaza al cálculo por litros. */
  hydrationScore?: number | null;
}

class MetricsService {
  private initialized = false;
  private permissionsGranted = false;
  private cache: HealthSnapshot | null = null;
  private cacheTime = 0;
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  // Lectura de Health Connect en curso, si hay una — ver getSnapshot().
  private snapshotInFlight: Promise<HealthSnapshot> | null = null;
  // Meta de agua del usuario (Perfil o fijada por chat). Antes el puntaje y los textos de análisis usaban 2,5 L fijos
  // mientras las tarjetas usaban la meta real: con otra meta, el puntaje y la tarjeta no cuadraban.
  private waterGoal = 2.5;

  /** Al cambiar de cuenta: la foto en caché (agua de la app, sueño a mano, IMC) era de la otra cuenta */
  olvidarCuenta() { this.cache = null; this.cacheTime = 0; this.snapshotInFlight = null; this.waterGoal = 2.5; }

  /** Relee las metas guardadas (misma clave que Inicio, Nutrición y Métricas). Barato: una lectura de AsyncStorage. */
  async loadGoals(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem('eris_nutrition_goals_default');
      const g = raw ? JSON.parse(raw) : null;
      // waterTargetOff: sin meta de agua (enfermedad renal) → 0, y el puntaje no castiga por una meta que no aplica
      if (g?.waterTargetOff) this.waterGoal = 0;
      else if (g && typeof g.waterLiters === 'number' && g.waterLiters > 0) this.waterGoal = g.waterLiters;
    } catch {}
  }

  /** El agua A ESTA HORA (las horas que llevas despierto), la misma cuenta de los cuadros de Métricas y del chat. */
  private waterPace(liters: number): GoalTrack {
    return trackGoal(liters, this.waterGoal, { now: new Date(), wakeHour: daySchedule.wakeHour() ?? undefined, kind: 'agua', unit: 'L' });
  }

  isPermissionsGranted(): boolean {
    return this.permissionsGranted;
  }

  async init(): Promise<boolean | string> {
    try {
      const available = await initialize();
      if (!available) {
        return "La API 'initialize()' de react-native-health-connect devolvió 'false'. El sistema Android dice que Health Connect no está disponible para esta app.";
      }

      this.initialized = true;

      try {
        const granted = await getGrantedPermissions();
        this.permissionsGranted = granted.length > 0;
      } catch {
        this.permissionsGranted = false;
      }

      return true;
    } catch (e: any) {
      return `Excepción al inicializar: ${e?.message || String(e)}`;
    }
  }

  async refreshPermissions(): Promise<boolean> {
    if (!this.initialized) return false;
    try {
      const granted = await getGrantedPermissions();
      this.permissionsGranted = granted.length > 0;
      if (this.permissionsGranted) this.cache = null;
      return this.permissionsGranted;
    } catch {
      return false;
    }
  }

  async openPermissionsScreen(): Promise<true | string> {
    if (!this.initialized) {
      const ok = await this.init();
      if (ok !== true) return ok as string;
    }
    try {
      const APP_PACKAGE = 'com.aleeeksanders.erismobile';
      const androidVer = Platform.OS === 'android' ? (Platform.Version as number) : 0;

      const action = androidVer >= 34
        ? 'android.health.connect.action.MANAGE_HEALTH_PERMISSIONS'
        : 'androidx.health.connect.client.MANAGE_HEALTH_PERMISSIONS';
      const pkgClause = androidVer >= 34
        ? ''
        : ';package=com.google.android.apps.healthdata';

      const intentUri = `intent://#Intent;action=${action}${pkgClause};S.android.intent.extra.PACKAGE_NAME=${APP_PACKAGE};end`;

      try {
        await Linking.openURL(intentUri);
        return true;
      } catch {
        await openHealthConnectSettings();
        return true;
      }
    } catch (e: any) {
      return e?.message || String(e);
    }
  }

  async checkGrantedPermissions(): Promise<string[]> {
    if (!this.initialized) {
      const ok = await this.init();
      if (ok !== true) return [];
    }
    try {
      const granted = await getGrantedPermissions();
      return granted.map((p: any) => p.recordType);
    } catch {
      return [];
    }
  }

  async requestPermissionsIfNeeded(): Promise<true | string> {
    return this.openPermissionsScreen();
  }

  /**
   * Los dos permisos que de verdad importan para que lo anotado en Nutrición (comida, agua) llegue a Health
   * Connect y por lo tanto a Inicio/Métricas. Tener OTROS permisos (sueño, pasos…) no basta — por eso el chequeo
   * es específico, no `checkGrantedPermissions().length > 0`.
   */
  async hasNutritionWritePermissions(): Promise<boolean> {
    if (!this.initialized) {
      const ok = await this.init();
      if (ok !== true) return false;
    }
    try {
      const granted = await getGrantedPermissions();
      const has = (recordType: string) => granted.some((p: any) => p.accessType === 'write' && p.recordType === recordType);
      return has('Nutrition') && has('Hydration');
    } catch {
      return false;
    }
  }

  /**
   * Pide TODOS los permisos de Health Connect de una vez con el diálogo nativo (lee y escribe), en vez de mandar
   * al usuario a la pantalla general de Health Connect a adivinar cuáles activar. Antes ningún código de la app
   * llamaba a `requestPermission()`: por eso permisos sin afinidad visible como escribir Nutrición/Hidratación
   * quedaban sin otorgar aunque el usuario sí hubiera activado sueño/pasos — y entonces lo anotado a mano en
   * Nutrición (los botones +250ml, etc.) nunca llegaba a Health Connect, así que Inicio y Métricas no lo veían.
   */
  async requestAllPermissions(): Promise<{ ok: true; granted: string[] } | { ok: false; error: string }> {
    if (!this.initialized) {
      const init = await this.init();
      if (init !== true) return { ok: false, error: init as string };
    }
    try {
      const granted = await requestPermission(ALL_HC_PERMISSIONS);
      this.permissionsGranted = granted.length > 0;
      if (this.permissionsGranted) this.cache = null;
      return { ok: true, granted: granted.map((p: any) => `${p.accessType}:${p.recordType}`) };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  /**
   * Calorías consumidas por día de los últimos `days` (hoy incluido), para el gráfico de déficit/superávit
   * (como el de FatSecret). Lee Health Connect directo — no usa `getSnapshot()` porque esa solo trae el día
   * de hoy. Un día sin registros queda en 0, no se omite, para que el gráfico no muestre huecos engañosos.
   */
  private calorieHistoryInFlight: Map<number, Promise<Array<{ date: string; label: string; consumed: number }>>> = new Map();

  async getCalorieHistory(days: number): Promise<Array<{ date: string; label: string; consumed: number }>> {
    // Mismo motivo que getSnapshot(): no lanzar otra llamada nativa en paralelo si ya hay una para el mismo rango.
    const existing = this.calorieHistoryInFlight.get(days);
    if (existing) return existing;
    const p = this.readCalorieHistoryFromHealthConnect(days);
    this.calorieHistoryInFlight.set(days, p);
    try {
      return await p;
    } finally {
      this.calorieHistoryInFlight.delete(days);
    }
  }

  private async readCalorieHistoryFromHealthConnect(days: number): Promise<Array<{ date: string; label: string; consumed: number }>> {
    const out: Array<{ date: string; label: string; consumed: number }> = [];
    const byDay = new Map<string, number>();
    // Por día de COMIDA (lo de madrugada antes de dormir cuenta para el día anterior; services/mealSchedule.ts)
    const usual = { usualWake: daySchedule.usualWake() };
    const today = daySchedule.todayDate();
    try {
      const end = new Date();
      const first = new Date(today);
      first.setDate(first.getDate() - (days - 1));
      const start = nutritionDayStart(first, usual);
      const res = await readRecords('Nutrition', {
        timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
      });
      for (const r of res.records as any[]) {
        const key = nutritionDayKey(new Date(r.startTime), usual);
        byDay.set(key, (byDay.get(key) || 0) + (r.energy?.inKilocalories || 0));
      }
    } catch { /* permission not granted: se devuelve todo en 0, igual que el resto de la pantalla */ }

    const WEEKDAY = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      out.push({
        date: key,
        label: days <= 7 ? WEEKDAY[d.getDay()] : String(d.getDate()),
        consumed: Math.round(byDay.get(key) || 0),
      });
    }
    return out;
  }

  // forceRefresh=true salta la caché de 5 min — usado tras loguear comida/agua
  // para que Métricas refleje el dato nuevo de inmediato, no hasta que expire el TTL.
  async getSnapshot(forceRefresh = false): Promise<HealthSnapshot> {
    if (!this.initialized) return this.fillFromApp(this.getEmptySnapshot());

    if (!this.permissionsGranted) {
      await this.refreshPermissions();
      if (!this.permissionsGranted) return this.fillFromApp(this.getEmptySnapshot());
    }

    // Una lectura en curso (p. ej. la que pidió un registro recién hecho) es más nueva que la caché: se espera esa.
    // Antes Inicio y Métricas recibían la caché vieja justo después de anotar comida o agua, y no se volvían a
    // actualizar solas hasta 15 minutos después.
    if (this.snapshotInFlight) return this.snapshotInFlight;
    if (!forceRefresh && this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
      return this.cache;
    }

    // Si ya hay una lectura de Health Connect en curso, se comparte esa misma promesa en vez de lanzar otra
    // andanada de llamadas nativas en paralelo. Con Inicio, Métricas y el historial de calorías escuchando el
    // mismo aviso (nutritionBackend.notify), un solo registro de agua podía disparar 2-3 lecturas completas
    // (~15 llamadas nativas cada una) al mismo tiempo; un segundo toque rápido antes de que terminaran las
    // duplicaba de nuevo. Eso satura el puente de Health Connect y puede cerrar la app de golpe.
    if (this.snapshotInFlight) return this.snapshotInFlight;
    this.snapshotInFlight = this.readSnapshotFromHealthConnect();
    try {
      return await this.snapshotInFlight;
    } finally {
      this.snapshotInFlight = null;
    }
  }

  private async readSnapshotFromHealthConnect(): Promise<HealthSnapshot> {
    await this.loadGoals(); // el puntaje y los textos de análisis usan la meta de agua real
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const snapshot: HealthSnapshot = {
      sleep: null,
      heartRate: null,
      steps: null,
      distance: null,
      calories: null,
      spo2: null,
      respiratoryRate: null,
      vo2Max: null,
      activeMinutes: null,
      bmi: null,
      weight: null,
      nutrition: null,
      hydration: null,
      glucose: null,
      lastUpdated: now.toISOString(),
    };

    if (!this.initialized) {
      return this.getEmptySnapshot();
    }

    try {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      // El sueño: 36 h hacia atrás (y después solo la ÚLTIMA noche): con 24 h, a las 23:53 la noche anterior que empezó antes de esa
      // hora quedaba fuera y el análisis decía «Sueño: sin datos» habiendo dormido 8,5 h (2026-10-16)
      const sleepFrom = new Date(now.getTime() - 36 * 60 * 60 * 1000);
      // Sueño 2.0 · S1: 15 días para la deuda, la regularidad y el cronotipo (el día de hoy sigue saliendo de las últimas 36 h)
      const sleep15 = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

      // Sleep
      const sleepAll = await readRecords('SleepSession', {
        timeRangeFilter: { operator: 'between', startTime: sleep15.toISOString(), endTime: now.toISOString() }
      });
      // Con las correcciones de la persona (S2): «no estaba durmiendo» y lo anotado a mano en la pantalla de Sueño
      const sleepRaw = applySleepEdits(toRawSessions(sleepAll.records as any[]), await loadSleepEdits());
      const sleepRecent = sleepRaw.filter((x) => x.end > sleepFrom.getTime());
      // El "día" del cuerpo empieza cuando despierta de sueño REAL, no a medianoche —
      // por defecto cae a medianoche (todayStart) si no hay sueño real detectado.
      let dayBoundary = todayStart;

      if (sleepRecent.length > 0) {
        // El sueño por partes (Sueño 2.0 · S0, services/sleep/sleepCore.ts): la noche (aunque se haya despertado un rato), un
        // segundo sueño o las siestas, como en Mi Fitness. Antes se botaba lo de menos de 3 h, todo lo demás se sumaba como «una
        // noche» y el día empezaba al terminar el tramo más largo: el 24-10 (02:33–03:18 + 04:20–09:05 + 13:51–17:54, 9 h 31 en
        // el reloj) salió «8,8 h, descanso suficiente».
        const day = sleepDay(sleepRecent, { usualWake: daySchedule.usualWake(), usualSleepH: daySchedule.sleepHours() });
        // Las 2 semanas: deuda, regularidad, cronotipo, el puntaje de la noche y la hora para acostarse (sleepCore · S1)
        try {
          snapshot.sleepInsights = sleepInsights(sleepRaw, { now: now.getTime(), usualWake: daySchedule.usualWake(), usualSleepH: daySchedule.sleepHours() });
        } catch { /* sin historia suficiente */ }
        try {
          const plan = await loadSleepPlan();
          if (plan) {
            const pr = planProgress(plan, nightRecords(sleepRaw, { usualWake: daySchedule.usualWake(), usualSleepH: daySchedule.sleepHours() }), now.getTime());
            snapshot.sleepPlan = { kind: plan.kind, title: planTitle(plan), text: pr.text, day: pr.day, hits: pr.hits, of: pr.of, done: pr.done };
          } else snapshot.sleepPlan = null; // null explícito: el servidor junta cada snapshot con el anterior y dejaría el plan viejo
        } catch {}
        const pats = await sleepPatternsNow();
        if (pats) snapshot.sleepPatterns = pats;
        if (day && day.episodes.length) {
          const n = day.night;
          snapshot.sleep = {
            // para la recuperación cuenta el total de 24 h; la noche va aparte
            durationHours: day.totalH, // 2 decimales: «9 h 31» igual en el titular y en la frase
            nightHours: day.nightH ?? undefined,
            split: day.split,
            efficiency: day.efficiency,
            stages: day.stages ? { light: Math.round(day.stages.light * 10) / 10, deep: Math.round(day.stages.deep * 10) / 10, rem: Math.round(day.stages.rem * 10) / 10 } : undefined,
            startTime: n?.start ?? day.episodes[0].start,
            endTime: n?.end ?? day.episodes[day.episodes.length - 1].end,
            episodes: day.episodes,
          };
          // El último despertar (de una siesta incluida) y el del DÍA: el que viene de la noche, nunca de una siesta
          snapshot.wakeTime = day.lastWake ?? undefined;
          if (day.dayWake) {
            snapshot.dayWakeTime = day.dayWake;
            daySchedule.setWakeAt(day.dayWake);
            // Pasos y actividad cuentan desde que terminó la noche (si terminó hoy, antes de las 13)
            const woke = new Date(day.dayWake);
            if (woke >= todayStart && woke.getHours() < 13) dayBoundary = woke;
          }
        }
      }

      const between = (from: Date) => ({ operator: 'between' as const, startTime: from.toISOString(), endTime: now.toISOString() });
      // Comida y agua: por día de COMIDA, igual que la pantalla de Nutrición y el registro del servidor. Termina cuando te
      // duermes, no a medianoche (services/mealSchedule.ts): a las 2 AM sin haber dormido sigue siendo el día de ayer.
      const dctx = daySchedule.ctx();
      const calendarDay = nutritionDayStart(nutritionDayOf(now, dctx), dctx);

      // Lo que sigue es independiente entre sí: se pide en paralelo. Antes eran 14 llamadas nativas una tras otra y el
      // resumen tardaba la suma de todas.
      await Promise.all([
        // Durante la noche (Sueño 2.0 · S0): pulso, oxígeno y respiración SOLO dentro de la noche, como «Indicadores de salud»
        // de Mi Fitness. snapshot.spo2 y respiratoryRate siguen siendo la última lectura del día.
        (async () => {
          const s = snapshot.sleep;
          if (!s?.startTime || !s?.endTime || s.manual) return;
          const during = await readSleepVitals(Date.parse(s.startTime), Date.parse(s.endTime));
          if (Object.keys(during).length) s.during = during;
        })(),
        // Pulso: el promedio lo calcula Health Connect. Antes se traían TODAS las muestras de 24 h (con reloj, miles)
        // al JavaScript en cada actualización, solo para promediarlas.
        (async () => {
          try {
            const agg: any = await aggregateRecord({ recordType: 'HeartRate', timeRangeFilter: between(last24h) });
            const avg = agg?.BPM_AVG;
            if (avg && avg > 0) snapshot.heartRate = { resting: null, average: Math.round(avg) };
          } catch { /* permission not granted */ }
          try {
            const restingRes = await readRecords('RestingHeartRate', { timeRangeFilter: between(last24h) });
            if (restingRes.records.length > 0) {
              const lastResting = (restingRes.records as any[])[restingRes.records.length - 1];
              const bpm = lastResting.beatsPerMinute ?? lastResting.samples?.[0]?.beatsPerMinute;
              if (bpm && bpm > 0) {
                if (snapshot.heartRate) snapshot.heartRate.resting = Math.round(bpm);
                else snapshot.heartRate = { resting: Math.round(bpm), average: Math.round(bpm) };
              }
            }
          } catch { /* permission not granted */ }
        })(),

        // Pasos
        (async () => {
          try {
            const stepsAgg = await aggregateRecord({ recordType: 'Steps', timeRangeFilter: between(dayBoundary) });
            const total = (stepsAgg as any).COUNT_TOTAL ?? 0;
            if (total > 0) snapshot.steps = Math.round(total);
          } catch { /* permission not granted */ }
        })(),

        // Distancia
        (async () => {
          try {
            const distAgg = await aggregateRecord({ recordType: 'Distance', timeRangeFilter: between(dayBoundary) });
            const totalM = (distAgg as any).DISTANCE_TOTAL?.inMeters ?? 0;
            if (totalM > 0) snapshot.distance = Math.round(totalM / 10) / 100;
          } catch { /* permission not granted */ }
        })(),

        // Calorías activas
        (async () => {
          try {
            const calAgg = await aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: between(dayBoundary) });
            const totalKcal = (calAgg as any).ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0;
            if (totalKcal > 0) snapshot.calories = Math.round(totalKcal);
          } catch { /* permission not granted */ }
        })(),

        // Minutos activos
        (async () => {
          try {
            const exerciseRes = await readRecords('ExerciseSession', { timeRangeFilter: between(dayBoundary) });
            if (exerciseRes.records.length > 0) {
              const totalMs = (exerciseRes.records as any[]).reduce((sum, r) => {
                const start = new Date(r.startTime).getTime();
                const end = new Date(r.endTime).getTime();
                return sum + Math.max(0, end - start);
              }, 0);
              if (totalMs > 0) snapshot.activeMinutes = Math.round(totalMs / 60000);
            }
          } catch { /* permission not granted */ }
        })(),

        // SpO2
        (async () => {
          try {
            const spo2Data = await readRecords('OxygenSaturation', { timeRangeFilter: between(last24h) });
            if (spo2Data.records.length > 0) {
              const last = (spo2Data.records as any[])[spo2Data.records.length - 1];
              const raw = last.percentage ?? last.value;
              if (raw != null) snapshot.spo2 = raw > 1 ? Math.round(raw) : Math.round(raw * 100);
            }
          } catch { /* permission not granted */ }
        })(),

        // Frecuencia respiratoria
        (async () => {
          try {
            const respRes = await readRecords('RespiratoryRate', { timeRangeFilter: between(last24h) });
            if (respRes.records.length > 0) {
              const last = (respRes.records as any[])[respRes.records.length - 1];
              const rate = last.rate;
              if (rate && rate > 0) snapshot.respiratoryRate = Math.round(rate * 10) / 10;
            }
          } catch { /* permission not granted */ }
        })(),

        // VO2 máx
        (async () => {
          try {
            const vo2Res = await readRecords('Vo2Max', { timeRangeFilter: between(new Date(now.getTime() - 90 * 24 * 3600000)) });
            if (vo2Res.records.length > 0) {
              const last = (vo2Res.records as any[])[vo2Res.records.length - 1];
              const v = last.vo2MillilitersPerMinuteKilogram;
              if (v && v > 0) snapshot.vo2Max = Math.round(v * 10) / 10;
            }
          } catch { /* permission not granted */ }
        })(),

        // Peso, y con él la estatura para el IMC (en ese orden: el IMC necesita el peso)
        (async () => {
          try {
            const weightData = await readRecords('Weight', { timeRangeFilter: between(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)) });
            if (weightData.records.length > 0) {
              const last = (weightData.records as any[])[weightData.records.length - 1];
              snapshot.weight = Math.round(last.weight.inKilograms * 10) / 10;
            }
          } catch { /* permission not granted */ }
          try {
            if (snapshot.weight === null) return;
            const heightData = await readRecords('Height', { timeRangeFilter: between(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)) });
            if (heightData.records.length > 0) {
              const last = (heightData.records as any[])[heightData.records.length - 1];
              const heightM = last.height?.inMeters ?? last.heightMeters;
              if (heightM && heightM > 0) snapshot.bmi = Math.round((snapshot.weight / (heightM * heightM)) * 10) / 10;
            }
          } catch { /* permission not granted */ }
        })(),

        // Nutrición (día calendario)
        (async () => {
          try {
            const nutritionData = await readRecords('Nutrition', { timeRangeFilter: between(calendarDay) });
            if (nutritionData.records.length > 0) {
              const totals = (nutritionData.records as any[]).reduce((acc, r) => ({
                calories: acc.calories + (r.energy?.inKilocalories || 0),
                protein:  acc.protein  + (r.protein?.inGrams     || 0),
                carbs:    acc.carbs    + (r.totalCarbohydrate?.inGrams || 0),
                fat:      acc.fat      + (r.totalFat?.inGrams    || 0),
                fiber:    acc.fiber    + (r.dietaryFiber?.inGrams || 0),
                sugar:    acc.sugar    + (r.sugar?.inGrams        || 0),
                sodium:   acc.sodium   + (r.sodium?.inMilligrams  || 0),
              }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 });
              snapshot.nutrition = {
                calories: Math.round(totals.calories),
                protein:  Math.round(totals.protein  * 10) / 10,
                carbs:    Math.round(totals.carbs    * 10) / 10,
                fat:      Math.round(totals.fat      * 10) / 10,
                fiber:    Math.round(totals.fiber    * 10) / 10,
                sugar:    Math.round(totals.sugar    * 10) / 10,
                sodium:   Math.round(totals.sodium),
              };
            }
          } catch { /* permission not granted */ }
        })(),

        // Glucosa
        (async () => {
          try {
            const glucoseData = await readRecords('BloodGlucose', { timeRangeFilter: between(last24h) });
            if (glucoseData.records.length > 0) {
              const last = (glucoseData.records as any[])[glucoseData.records.length - 1];
              const mmol: number = last.level?.inMillimolesPerLiter ?? last.level ?? 0;
              if (mmol > 0) {
                snapshot.glucose = {
                  valueMmol  : Math.round(mmol * 10) / 10,
                  valueMgdl  : Math.round(mmol * 18.01559),
                  timestamp  : last.time ?? last.startTime ?? now.toISOString(),
                  source     : 'health_connect',
                };
              }
            }
          } catch { /* permission not granted */ }
        })(),

        // Hidratación (día calendario)
        (async () => {
          try {
            const hydrationData = await readRecords('Hydration', { timeRangeFilter: between(calendarDay) });
            if (hydrationData.records.length > 0) {
              const totalLiters = (hydrationData.records as any[]).reduce((sum, r) => sum + (r.volume?.inLiters || 0), 0);
              snapshot.hydration = Math.round(totalLiters * 100) / 100;
            }
          } catch { /* permission not granted */ }
        })(),
      ]);

      // Actividad sin «modo entrenamiento» (básquet, fútbol, una caminata larga…): pulso + pasos + calorías del reloj
      try { snapshot.activity = await this.detectActivityToday(todayStart, now, snapshot); } catch { /* sin permisos o sin datos */ }
      try { snapshot.activityLevel = await this.readAutoLevel(); } catch {}

    } catch (e) {
      console.log('[Health] Error leyendo métricas:', e);
    }

    await this.fillFromApp(snapshot);
    this.cache = snapshot;
    this.cacheTime = Date.now();
    return snapshot;
  }

  /** La próxima lectura va a Health Connect (p. ej. llegó un sueño anotado por chat). */
  invalidate() { this.cache = null; }

  /** Pulso, pasos, calorías activas, sesiones y sueño de Health Connect entre dos instantes (para detectar la actividad). */
  private async readActivityInputs(from: Date, to: Date) {
    const range = { operator: 'between' as const, startTime: from.toISOString(), endTime: to.toISOString() };
    const readAll = async (type: any, r: any = range): Promise<any[]> => {
      const all: any[] = [];
      let pageToken: string | undefined;
      for (let i = 0; i < 15; i++) {
        const res: any = await readRecords(type, { timeRangeFilter: r, ...(pageToken ? { pageToken } : {}) } as any);
        all.push(...(res.records ?? []));
        pageToken = res.pageToken;
        if (!pageToken) break;
      }
      return all;
    };
    const safe = (p: Promise<any[]>) => p.catch(() => [] as any[]);
    // El sueño que toca este rango (la noche anterior empieza antes de las 0:00)
    const sleepRange = { operator: 'between' as const, startTime: new Date(from.getTime() - 12 * 3600000).toISOString(), endTime: to.toISOString() };
    const [hrRecs, stepRecs, kcalRecs, sessRecs, sleepRecs] = await Promise.all([
      safe(readAll('HeartRate')), safe(readAll('Steps')), safe(readAll('ActiveCaloriesBurned')), safe(readAll('ExerciseSession')), safe(readAll('SleepSession', sleepRange)),
    ]);
    const ms = (v: unknown) => Date.parse(String(v));
    const origin = (r: any) => String(r?.metadata?.dataOrigin ?? '');
    return {
      hr: hrRecs.flatMap((r: any) => (r.samples ?? []).map((x: any) => ({ t: ms(x.time), bpm: Number(x.beatsPerMinute) }))),
      // Teléfono y reloj escriben los mismos pasos (y a veces las mismas kcal): se usa la fuente que más registró
      steps: mainOrigin(stepRecs.map((r: any) => ({ start: ms(r.startTime), end: ms(r.endTime), value: Number(r.count) || 0, origin: origin(r) }))),
      kcal: mainOrigin(kcalRecs.map((r: any) => ({ start: ms(r.startTime), end: ms(r.endTime), value: Number(r.energy?.inKilocalories) || 0, origin: origin(r) }))),
      sessions: sessRecs.map((r: any) => ({ start: ms(r.startTime), end: ms(r.endTime) })).filter((x) => x.end > x.start),
      sleep: sleepRecs.map((r: any) => ({ start: ms(r.startTime), end: ms(r.endTime) })).filter((x) => x.end > x.start),
    };
  }

  private async bodyAndLabels(): Promise<{ body: any; labels: Record<string, ActivityLabel[]>; forge: Record<string, number> }> {
    const pid = (await AuthStorage.getCredentials().catch(() => null))?.profileId ?? null;
    const [bodyRaw, labelsRaw, forgeRaw] = await Promise.all([
      AsyncStorage.getItem('eris_body_profile'), AsyncStorage.getItem(ACTIVITY_LABELS_KEY),
      pid ? AsyncStorage.getItem(`eris_forge_training_${pid}`) : Promise.resolve(null),
    ]);
    let body: any = {}, labels: Record<string, ActivityLabel[]> = {}, forge: Record<string, number> = {};
    try { body = bodyRaw ? JSON.parse(bodyRaw) : {}; } catch {}
    try { labels = labelsRaw ? JSON.parse(labelsRaw) : {}; } catch {}
    try { forge = (forgeRaw ? JSON.parse(forgeRaw).days : null) || {}; } catch {}
    return { body, labels, forge };
  }

  /**
   * La actividad del día sin «modo entrenamiento» (services/activityDetect.ts). Pedido del usuario (2026-10-16): «hice 2 horas
   * de básquet… uno no se pone en modo entrenamiento con el smartwatch». Deja guardado el día (ejercicio y pasos) para el nivel
   * de actividad automático y los avisos, y de a poco reconstruye las 4 semanas anteriores.
   */
  private async detectActivityToday(from: Date, now: Date, snap: HealthSnapshot): Promise<ActivitySummary | null> {
    const [inp, { body, labels, forge }] = await Promise.all([this.readActivityInputs(from, now), this.bodyAndLabels()]);
    const day = isoDayKey(now);
    if (!inp.hr.length && !inp.steps.length && !inp.kcal.length && !inp.sessions.length) return null;
    // Todas las partes del sueño (la noche, un segundo sueño, siestas): durmiendo no hay actividad
    const sleep = snap.sleep?.episodes?.length
      ? snap.sleep.episodes.map((e) => ({ start: Date.parse(e.start), end: Date.parse(e.end) }))
      : snap.sleep?.startTime && snap.sleep?.endTime ? [{ start: Date.parse(snap.sleep.startTime), end: Date.parse(snap.sleep.endTime) }] : inp.sleep;
    const res = detectActivity({
      from: from.getTime(), to: now.getTime(), hr: inp.hr, steps: inp.steps, kcal: inp.kcal, sessions: inp.sessions, sleep,
      restingHr: snap.heartRate?.resting ?? null, age: body.age ?? null, weightKg: body.weightKg ?? snap.weight ?? null, sex: body.sex ?? null,
      labels: labels[day] ?? [],
    }, day);
    await this.saveActivityDay(day, res, snap.steps, forge[day] ?? 0, body.weightKg ?? snap.weight ?? 75).catch(() => {});
    // Las semanas anteriores, de a 3 días por lectura (no frena el resumen)
    this.backfillActivityDays(body, labels, forge, snap.heartRate?.resting ?? null).catch(() => {});
    return res;
  }

  /** Guarda el día: minutos (avisos) y ejercicio + pasos (nivel de actividad automático). */
  private async saveActivityDay(day: string, res: ActivitySummary | null, steps: number | null, forgeSets: number, weightKg: number) {
    const [v1Raw, v2Raw] = await Promise.all([AsyncStorage.getItem(ACTIVITY_DAYS_KEY), AsyncStorage.getItem(ACTIVITY_LEVEL_DAYS_KEY)]);
    let v1: Record<string, number> = {}, v2: Record<string, Omit<DayActivity, 'day'>> = {};
    try { v1 = JSON.parse(v1Raw || '{}'); } catch {}
    try { v2 = JSON.parse(v2Raw || '{}'); } catch {}
    // Lo anotado en Forge ese día, por si el reloj no lo vio: ~2,5 min por serie a ~5 MET (4 netos)
    const forgeKcal = Math.round(forgeSets * 2.5 * 4 * 0.0175 * weightKg);
    v1[day] = res?.minutes ?? 0;
    v2[day] = {
      exKcal: Math.max(res?.kcal ?? 0, forgeKcal), exMin: Math.max(res?.minutes ?? 0, Math.round(forgeSets * 2.5)),
      steps: typeof steps === 'number' ? steps : null, boutSteps: (res?.bouts ?? []).reduce((a, b) => a + (b.steps ?? 0), 0),
    };
    const keep = (o: Record<string, any>) => Object.fromEntries(Object.keys(o).sort().slice(-40).map((k) => [k, o[k]]));
    await AsyncStorage.multiSet([[ACTIVITY_DAYS_KEY, JSON.stringify(keep(v1))], [ACTIVITY_LEVEL_DAYS_KEY, JSON.stringify(keep(v2))]]);
  }

  private backfilling = false;
  /** Reconstruye con Health Connect los días de las últimas 4 semanas que faltan (de a 3 por vez, del más reciente al más viejo). */
  private async backfillActivityDays(body: any, labels: Record<string, ActivityLabel[]>, forge: Record<string, number>, restingHr: number | null) {
    if (this.backfilling) return;
    this.backfilling = true;
    try {
      let have: Record<string, any> = {};
      try { have = JSON.parse((await AsyncStorage.getItem(ACTIVITY_LEVEL_DAYS_KEY)) || '{}'); } catch {}
      const missing: Date[] = [];
      for (let back = 1; back <= WINDOW_DAYS && missing.length < 3; back++) {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - back);
        if (!have[isoDayKey(d)]) missing.push(d);
      }
      for (const start of missing) {
        const end = new Date(start); end.setDate(end.getDate() + 1);
        const day = isoDayKey(start);
        const inp = await this.readActivityInputs(start, end);
        const steps = inp.steps.length ? Math.round(inp.steps.reduce((a, x) => a + x.value, 0)) : null;
        const res = inp.hr.length || inp.steps.length || inp.kcal.length || inp.sessions.length
          ? detectActivity({
            from: start.getTime(), to: end.getTime(), hr: inp.hr, steps: inp.steps, kcal: inp.kcal, sessions: inp.sessions, sleep: inp.sleep,
            restingHr, age: body.age ?? null, weightKg: body.weightKg ?? null, sex: body.sex ?? null, labels: labels[day] ?? [],
          }, day)
          : null;
        await this.saveActivityDay(day, res, steps, forge[day] ?? 0, body.weightKg ?? 75);
      }
    } finally {
      this.backfilling = false;
    }
  }

  /**
   * El nivel de actividad según tus últimas 4 semanas reales (services/activityLevel.ts). null con menos de 14 días de datos
   * o sin peso, altura, edad y sexo en Forge.
   */
  async readAutoLevel(): Promise<AutoLevel | null> {
    try {
      const [v2Raw, bodyRaw] = await Promise.all([AsyncStorage.getItem(ACTIVITY_LEVEL_DAYS_KEY), AsyncStorage.getItem('eris_body_profile')]);
      const v2 = JSON.parse(v2Raw || '{}') as Record<string, Omit<DayActivity, 'day'>>;
      const b = bodyRaw ? JSON.parse(bodyRaw) : {};
      const bmr = b.weightKg && b.heightCm && b.age && (b.sex === 'h' || b.sex === 'm')
        ? Math.round(10 * b.weightKg + 6.25 * b.heightCm - 5 * b.age + (b.sex === 'h' ? 5 : -161)) : null;
      return autoLevel(Object.entries(v2).map(([day, x]) => ({ day, ...x })), bmr, b.weightKg ?? null);
    } catch { return null; }
  }

  /** «Fue básquet»: lo guarda para esa actividad de hoy y vuelve a leer (el gasto y el nombre cambian en todas partes). */
  async labelActivity(bout: { start: string; end: string }, type: ActivityType): Promise<void> {
    const day = isoDayKey(new Date(bout.start));
    let all: Record<string, ActivityLabel[]> = {};
    try { all = JSON.parse((await AsyncStorage.getItem(ACTIVITY_LABELS_KEY)) || '{}'); } catch {}
    const list = (all[day] ?? []).filter((l) => !(Date.parse(l.start) < Date.parse(bout.end) && Date.parse(l.end) > Date.parse(bout.start)));
    all[day] = [...list, { start: bout.start, end: bout.end, type }];
    // solo las últimas 2 semanas
    const keep = Object.keys(all).sort().slice(-14);
    await AsyncStorage.setItem(ACTIVITY_LABELS_KEY, JSON.stringify(Object.fromEntries(keep.map((k) => [k, all[k]]))));
    this.invalidate();
  }

  /**
   * El despertar habitual según el reloj: la mediana del fin del sueño principal (el bloque más largo de 3 h o más de cada
   * día) en las últimas `days` noches. Con menos de 4 noches no se sabe (null). Lo usa daySchedule para el día de comida.
   */
  async readUsualWake(days = 21): Promise<{ hour: number; nights: number; sleepHours: number } | null> {
    if (!this.initialized || !this.permissionsGranted) return null;
    try {
      const end = new Date();
      const start = new Date(end.getTime() - days * 86400000);
      const all: any[] = [];
      let pageToken: string | undefined;
      for (let i = 0; i < 10; i++) {
        const res: any = await readRecords('SleepSession', { timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() }, ...(pageToken ? { pageToken } : {}) } as any);
        all.push(...(res.records ?? []));
        pageToken = res.pageToken;
        if (!pageToken) break;
      }
      // La noche de cada día (sleepCore: la que cae en la madrugada y termina a una hora de despertar; si no, la más larga de
      // 3 h o más), no el tramo más largo: un segundo sueño en la tarde ya no corre el despertar habitual
      const nights = [...sleepByDay(toRawSessions(all)).values()].filter((d) => d.nightEnd != null && d.nightH != null);
      const hours = nights.map((d) => { const t = new Date(d.nightEnd!); return t.getHours() + t.getMinutes() / 60; }).sort((a, b) => a - b);
      if (hours.length < 4) return null;
      // Cuánto dura la noche (para la hora habitual de dormir del reloj interno)
      const durs = nights.map((d) => d.nightH!).sort((a, b) => a - b);
      return { hour: hours[Math.floor(hours.length / 2)], nights: hours.length, sleepHours: durs[Math.floor(durs.length / 2)] };
    } catch { return null; }
  }

  /**
   * Los días anteriores (sin hoy) según Health Connect: pasos, sueño principal, agua y macros. Sirve para rellenar el
   * historial diario del servidor (lo que usa el análisis personal): el 2026-10-10 se perdieron 17 días de ese historial
   * por un error de escritura en el servidor, y Health Connect los sigue teniendo. Solo lee; no escribe nada.
   */
  /**
   * Minutos de ejercicio por día (YYYY-MM-DD) en Health Connect, de los últimos `days` días y hoy: las sesiones que graba el
   * reloj (básquet, gimnasio, bici…). Los avisos de «muévete» los usan junto con Forge (antes solo miraban Forge).
   */
  async readExerciseDays(days = 35): Promise<Record<string, number>> {
    if (!this.initialized || !this.permissionsGranted) return {};
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - days);
    const out: Record<string, number> = {};
    try {
      let pageToken: string | undefined;
      for (let i = 0; i < 10; i++) {
        const res: any = await readRecords('ExerciseSession', {
          timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: new Date().toISOString() },
          ...(pageToken ? { pageToken } : {}),
        } as any);
        for (const r of (res.records ?? []) as any[]) {
          const a = new Date(r.startTime).getTime(), b = new Date(r.endTime).getTime();
          if (!(b > a)) continue;
          const k = key(new Date(a));
          out[k] = (out[k] ?? 0) + Math.round((b - a) / 60000);
        }
        pageToken = res.pageToken;
        if (!pageToken) break;
      }
    } catch { /* sin permiso de ejercicio: solo Forge */ }
    return out;
  }

  async readDailyHistory(days = 45): Promise<Array<{ date: string; steps?: number; sleepHours?: number; sleepNightHours?: number; hydrationL?: number; calories?: number; proteinG?: number; carbsG?: number; fatG?: number }>> {
    if (!this.initialized || !this.permissionsGranted) return [];
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const start = new Date(todayStart); start.setDate(start.getDate() - days);
    const range = { operator: 'between' as const, startTime: start.toISOString(), endTime: todayStart.toISOString() };
    // Comida y agua: por día de COMIDA (lo de madrugada antes de dormir es del día anterior), hasta que empezó el de hoy
    const usual = { usualWake: daySchedule.usualWake() };
    const todayFood = daySchedule.todayDate();
    const foodRange = { operator: 'between' as const, startTime: nutritionDayStart(start, usual).toISOString(), endTime: nutritionDayStart(todayFood, daySchedule.ctx()).toISOString() };
    const foodKey = (t: string) => isoDayKey(nutritionDayOf(new Date(t), usual));
    const todayFoodKey = isoDayKey(todayFood);
    const out = new Map<string, any>();
    const at = (k: string) => { let e = out.get(k); if (!e) { e = { date: k }; out.set(k, e); } return e; };
    const readAll = async (type: any, r = range): Promise<any[]> => {
      const all: any[] = [];
      let pageToken: string | undefined;
      for (let i = 0; i < 20; i++) {
        const res: any = await readRecords(type, { timeRangeFilter: r, ...(pageToken ? { pageToken } : {}) } as any);
        all.push(...(res.records ?? []));
        pageToken = res.pageToken;
        if (!pageToken) break;
      }
      return all;
    };
    // Comida y agua: suma por día de comida
    try {
      for (const r of await readAll('Nutrition', foodRange)) {
        const k = foodKey(r.startTime);
        if (k >= todayFoodKey) continue;
        const e = at(k);
        e.calories = (e.calories ?? 0) + (r.energy?.inKilocalories || 0);
        e.proteinG = (e.proteinG ?? 0) + (r.protein?.inGrams || 0);
        e.carbsG = (e.carbsG ?? 0) + (r.totalCarbohydrate?.inGrams || 0);
        e.fatG = (e.fatG ?? 0) + (r.totalFat?.inGrams || 0);
      }
    } catch { /* sin permiso */ }
    try {
      for (const r of await readAll('Hydration', foodRange)) {
        const k = foodKey(r.startTime);
        if (k >= todayFoodKey) continue;
        const e = at(k);
        e.hydrationL = (e.hydrationL ?? 0) + (r.volume?.inLiters || 0);
      }
    } catch { /* sin permiso */ }
    // Sueño: lo dormido en el día (la noche, un segundo sueño y las siestas, igual que hoy: sleepCore) y aparte la noche
    try {
      for (const [k, d] of sleepByDay(toRawSessions(await readAll('SleepSession')), { usualWake: daySchedule.usualWake(), usualSleepH: daySchedule.sleepHours() })) {
        if (k >= key(todayStart)) continue;
        const e = at(k);
        e.sleepHours = d.totalH;
        if (d.nightH != null) e.sleepNightHours = d.nightH;
      }
    } catch { /* sin permiso */ }
    // Pasos: un total por día (de a uno, para no saturar el puente de Health Connect)
    for (let i = days; i >= 1; i--) {
      const from = new Date(todayStart); from.setDate(from.getDate() - i);
      const to = new Date(from); to.setDate(to.getDate() + 1);
      try {
        const agg: any = await aggregateRecord({ recordType: 'Steps', timeRangeFilter: { operator: 'between', startTime: from.toISOString(), endTime: to.toISOString() } });
        const total = agg?.COUNT_TOTAL ?? 0;
        if (total > 0) at(key(from)).steps = Math.round(total);
      } catch { break; /* sin permiso: no insistir */ }
    }
    const r1 = (n: number) => Math.round(n * 10) / 10;
    return [...out.values()].map((e) => ({
      date: e.date,
      ...(e.steps ? { steps: e.steps } : {}),
      ...(e.sleepHours ? { sleepHours: r1(e.sleepHours) } : {}),
      ...(e.sleepNightHours ? { sleepNightHours: r1(e.sleepNightHours) } : {}),
      ...(e.hydrationL ? { hydrationL: Math.round(e.hydrationL * 100) / 100 } : {}),
      ...(e.calories ? { calories: Math.round(e.calories), proteinG: r1(e.proteinG ?? 0), carbsG: r1(e.carbsG ?? 0), fatG: r1(e.fatG ?? 0) } : {}),
    })).filter((e) => Object.keys(e).length > 1);
  }

  /**
   * Lo que el reloj no midió pero sí se sabe: el sueño que el usuario contó por chat (sleep_log, se guarda en
   * `eris_manual_sleep_<día>`) y el IMC con el peso y la altura de Forge. Antes, sin reloj, el puntaje "Fijo" quedaba en 0
   * y el total salía "Crítico" aunque el usuario estuviera bien (2026-10-07).
   */
  private async fillFromApp(snapshot: HealthSnapshot): Promise<HealthSnapshot> {
    try {
      const d = new Date();
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const [sleepRaw, bodyRaw, waterRaw] = await Promise.all([
        AsyncStorage.getItem(MANUAL_SLEEP_PREFIX + day), AsyncStorage.getItem('eris_body_profile'),
        AsyncStorage.getItem(`${STORAGE_KEY_WATER}_${daySchedule.todayKey()}`),
      ]);
      // Sin agua en Health Connect (sin permiso o no disponible): la del registro de la app. Antes Inicio y Métricas
      // mostraban 0 aunque Nutrición tuviera el agua anotada.
      const w = waterRaw ? parseFloat(waterRaw) : NaN;
      if (snapshot.hydration == null && Number.isFinite(w) && w > 0) { snapshot.hydration = Math.round(w * 100) / 100; snapshot.hydrationFromApp = true; }
      const h = sleepRaw ? parseFloat(sleepRaw) : NaN;
      if (!snapshot.sleep && Number.isFinite(h) && h > 0) snapshot.sleep = { durationHours: h, manual: true };
      if (snapshot.bmi == null && bodyRaw) {
        const b = JSON.parse(bodyRaw);
        if (b?.weightKg > 0 && b?.heightCm > 0) {
          snapshot.bmi = Math.round((b.weightKg / Math.pow(b.heightCm / 100, 2)) * 10) / 10;
          if (snapshot.weight == null) snapshot.weight = b.weightKg;
        }
      }
    } catch {}
    return snapshot;
  }

  getEmptySnapshot(): HealthSnapshot {
    return {
      sleep: null, heartRate: null,
      steps: null, distance: null, calories: null,
      spo2: null, respiratoryRate: null, vo2Max: null,
      activeMinutes: null, bmi: null,
      weight: null, nutrition: null, hydration: null,
      glucose: null,
      lastUpdated: new Date().toISOString(),
    };
  }

  isReady(): boolean {
    return this.initialized;
  }

  async diagnose(): Promise<{
    ok: boolean;
    code: 'not_available' | 'no_permissions' | 'partial_permissions' | 'ok';
    message: string;
    steps: string[];
    grantedPermissions: string[];
    missingPermissions: string[];
  }> {
    const REQUIRED = [
      'SleepSession', 'HeartRate', 'RestingHeartRate', 'Steps', 'ActiveCaloriesBurned',
    ];

    if (!this.initialized) {
      const result = await this.init();
      if (result !== true) {
        return {
          ok: false,
          code: 'not_available',
          message: 'Health Connect no está disponible en este dispositivo.',
          steps: [
            'Necesitas Android 9+ con Health Connect instalado',
            'Descarga "Health Connect" desde Play Store',
            'Reinicia Eris después de instalarlo',
          ],
          grantedPermissions: [],
          missingPermissions: REQUIRED,
        };
      }
    }

    const granted = await this.checkGrantedPermissions();
    const missing = REQUIRED.filter(p => !granted.includes(p));

    if (granted.length === 0) {
      return {
        ok: false,
        code: 'no_permissions',
        message: 'Eris no tiene permisos para leer datos de Health Connect.',
        steps: [
          'Ve a Perfil → "Sincronizar Google Health"',
          'Toca "Abrir Health Connect"',
          'Busca Eris en la lista y activa todos los permisos',
        ],
        grantedPermissions: [],
        missingPermissions: REQUIRED,
      };
    }

    if (missing.length > 0) {
      return {
        ok: true,
        code: 'partial_permissions',
        message: `Permisos parciales. Faltan: ${missing.map(p => p.replace(/([A-Z])/g, ' $1').trim()).join(', ')}.`,
        steps: [
          'Ve a Perfil → "Sincronizar Google Health"',
          'Activa los permisos faltantes para Eris',
        ],
        grantedPermissions: granted,
        missingPermissions: missing,
      };
    }

    return {
      ok: true,
      code: 'ok',
      message: 'Todos los permisos están activos.',
      steps: [],
      grantedPermissions: granted,
      missingPermissions: [],
    };
  }

  // ---------- NUEVOS MÉTODOS PARA CONTEXTO EN TIEMPO REAL ----------

  /**
   * Genera un perfil de estado actual en tiempo real, pensado para que Eris (LLM)
   * pueda dar consejos personalizados y accionables.
   */
  getRealTimeAdvisoryContext(snapshot: HealthSnapshot, opts: { trainedToday?: boolean } = {}): string {
    if (!snapshot || !snapshot.lastUpdated) {
      return "⚠️ No hay datos biométricos disponibles aún. Pide a Eris que te guíe para sincronizar Health Connect.";
    }

    const now = new Date();
    const lastUpdated = new Date(snapshot.lastUpdated);
    const dataAgeMinutes = (now.getTime() - lastUpdated.getTime()) / 60000;

    let freshnessWarning = '';
    if (dataAgeMinutes > 60) {
      freshnessWarning = `⚠️ Los datos tienen ${Math.round(dataAgeMinutes)} minutos de antigüedad. Los consejos pueden no reflejar tu estado exacto.`;
    }

    const recovery = this.evaluateRecovery(snapshot);
    const energy = this.evaluateCurrentEnergy(snapshot);
    const pacing = this.evaluatePacing(snapshot, opts.trainedToday);
    const risks = this.evaluateRisks(snapshot);
    const trends = this.evaluateTrends(snapshot);
    const mealInference = this.inferLastMeal(snapshot);
    const tips = this.generateActionableTips(snapshot, opts.trainedToday);

    const contextParts = [
      `🕒 **Hora actual:** ${now.toLocaleTimeString()}`,
      `📅 **Última actualización de datos:** ${lastUpdated.toLocaleTimeString()} (hace ${Math.round(dataAgeMinutes)} min)`,
      freshnessWarning,
      '',
      `## 🧬 Estado de Recuperación (Base del día)`,
      recovery,
      '',
      `## ⚡ Estado Energético en Tiempo Real`,
      energy,
      '',
      `## 🏃‍♂️ Ritmo de Actividad Diario`,
      pacing,
      '',
      `## 🍽️ Estado Nutricional y Metabólico`,
      mealInference,
      trends,
      '',
      `## ⚠️ Factores de Riesgo / Fatiga`,
      risks,
      '',
      `## 💡 Objetivos pendientes y recomendaciones base`,
      tips,
    ];

    return contextParts.filter(p => p.trim().length > 0).join('\n');
  }

  // ---------- MÉTODOS AUXILIARES PRIVADOS ----------

  private evaluateRecovery(snapshot: HealthSnapshot): string {
    const lines: string[] = [];
    if (snapshot.sleep) {
      const h = snapshot.sleep.durationHours;
      const eff = snapshot.sleep.efficiency;
      const deep = snapshot.sleep.stages?.deep || 0;
      const rem = snapshot.sleep.stages?.rem || 0;
      const quality = h >= 7.5 ? 'óptima' : h >= 6 ? 'aceptable' : 'insuficiente';
      lines.push(`- **Sueño:** ${h}h (${quality}) · Eficiencia: ${eff || 'N/A'}% · Profundo: ${deep}h · REM: ${rem}h`);
      if (h < 6) lines.push('  ⚠️ *Menos de 6h afecta la recuperación muscular y cognitiva.*');
      if (deep < 1) lines.push('  ⚠️ *Fase profunda muy baja → la recuperación física está comprometida.*');
    } else {
      lines.push('- **Sueño:** Sin datos. Activa los permisos de sueño en Health Connect.');
    }

    if (snapshot.heartRate?.resting) {
      const hr = snapshot.heartRate.resting;
      const status = hr <= 55 ? '💪 Excelente (atleta)' : hr <= 65 ? '👍 Bueno' : hr <= 75 ? '📈 Moderado' : '🔴 Elevado (estrés/sobreentrenamiento)';
      lines.push(`- **FC en reposo:** ${hr} bpm → ${status}`);
    }

    if (snapshot.vo2Max) {
      const v = snapshot.vo2Max;
      const status = v >= 50 ? 'Excelente' : v >= 40 ? 'Bueno' : v >= 35 ? 'Regular' : 'Bajo';
      lines.push(`- **VO₂ máx:** ${v} ml/kg/min → ${status} (capacidad aeróbica)`);
    }

    return lines.join('\n');
  }

  private evaluateCurrentEnergy(snapshot: HealthSnapshot): string {
    const lines: string[] = [];

    if (snapshot.glucose) {
      const mgdl = snapshot.glucose.valueMgdl;
      const time = new Date(snapshot.glucose.timestamp);
      const minutesAgo = Math.round((Date.now() - time.getTime()) / 60000);
      let status = '';
      let advice = '';
      if (mgdl >= 80 && mgdl <= 110) {
        status = '✅ Estable (energía sostenida)';
        advice = 'Tus niveles están estables. Aprovecha para hacer ejercicio de intensidad moderada.';
      } else if (mgdl > 110 && mgdl <= 140) {
        status = '⬆️ Elevada (pico postprandial o estrés)';
        advice = 'Tienes energía disponible, pero puede venir seguida de una caída. No consumas azúcares simples ahora.';
      } else if (mgdl > 140) {
        status = '🔺 Muy elevada (resistencia o comida pesada)';
        advice = 'Evita ejercicios intensos hasta que baje a <140. Camina suavemente para ayudar a metabolizar.';
      } else if (mgdl >= 60 && mgdl < 80) {
        status = '⬇️ Baja (hipoglucemia leve)';
        advice = 'Necesitas carbohidratos de rápida absorción (jugo, fruta) para evitar mareos o fatiga.';
      } else {
        status = '🔻 Críticamente baja';
        advice = '¡Come algo con azúcar ahora mismo!';
      }
      lines.push(`- **Glucosa:** ${mgdl} mg/dL (${snapshot.glucose.valueMmol} mmol/L) — ${status}`);
      lines.push(`  📍 Medida hace ${minutesAgo} min.`);
      lines.push(`  💬 Consejo: ${advice}`);
    } else {
      lines.push('- **Glucosa:** Sin datos. (Los CGM o lecturas puntuales mejoran los consejos)');
    }

    if (snapshot.hydration !== null && this.waterGoal <= 0) {
      lines.push(`- **Hidratación:** ${snapshot.hydration}L (sin meta: tu límite de líquidos lo define tu médico)`);
    } else if (snapshot.hydration !== null) {
      // A ESTA HORA, no contra el día completo (2026-10-18, el usuario: «no mide en lo que llevamos del día, sino en base a
      // la meta»): a las 11 con 0,5 de 4 L esto decía «🔴 Bajo (deshidratación incipiente)», y Eris lo repetía.
      const liters = snapshot.hydration;
      const t = this.waterPace(liters);
      const status = t.state === 'cumplida' ? '✅ Meta del día cumplida'
        : t.state === 'al_dia' || t.state === 'adelantado' ? '✅ Al día para esta hora'
        : t.state === 'temprano' ? '🕐 Recién empieza el día'
        : t.state === 'algo_atras' ? '⚠️ Algo atrás para esta hora' : '🟠 Atrás para esta hora';
      lines.push(`- **Hidratación:** ${liters}L de ${this.waterGoal}L en el día (a esta hora lo esperable: ~${Math.round(t.expectedNow * 10) / 10}L) → ${status}`);
      if (t.state === 'algo_atras' || t.state === 'atras') lines.push(`  💧 *${t.status} en la próxima hora. El resto de la meta se reparte hasta la noche: no es una deuda.*`);
    }

    if (snapshot.activeMinutes && snapshot.activeMinutes > 0) {
      lines.push(`- **Minutos activos hoy:** ${snapshot.activeMinutes} min.`);
      if (snapshot.activeMinutes > 30) {
        lines.push('  🏋️ *Has tenido actividad significativa hoy. Tus músculos pueden estar en reparación (fatiga muscular).*');
      }
    }

    return lines.join('\n');
  }

  /**
   * Progreso del "día biológico" transcurrido (0-1) — ancla en la hora real de
   * despertar (snapshot.wakeTime, sueños ≥3h, ver getSnapshot) en vez de
   * medianoche, igual que ya hace el resto del sistema desde que el día deja
   * de resetearse a las 00:00. Sin sueño real detectado, cae a medianoche
   * como fallback (mismo criterio que el resto de la app).
   */
  private computeDayProgress(snapshot: HealthSnapshot, now: Date = new Date()): number {
    const ACTIVE_HOURS = 16; // ventana de vigilia asumida
    // El despertar de la NOCHE (no el de una siesta): a las 20:30 después de un segundo sueño hasta las 17:54, el día no va en
    // su 16 % (Sueño 2.0 · S0)
    const wakeIso = snapshot.dayWakeTime ?? snapshot.wakeTime;
    const wakeMs = wakeIso ? new Date(wakeIso).getTime() : null;
    if (wakeMs && now.getTime() > wakeMs) {
      const hoursAwake = (now.getTime() - wakeMs) / 3600000;
      return Math.min(1, hoursAwake / ACTIVE_HOURS);
    }
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const hoursSinceMidnight = (now.getTime() - midnight.getTime()) / 3600000;
    return Math.min(1, hoursSinceMidnight / ACTIVE_HOURS);
  }

  /**
   * Cuánto de la puntuación de una métrica acumulativa (pasos, calorías,
   * hidratación) se conserva dado el ritmo esperado a esta hora del día —
   * 1L de agua a las 11am no es lo mismo que 1L a las 4pm, aunque el litraje
   * sea idéntico. Nunca premia ir "adelantado" más allá del progreso real
   * (tope 1); nunca castiga ir atrasado por debajo de la mitad del crédito
   * (piso 0.5) — sigue reflejando el progreso absoluto, no solo el ritmo.
   */
  private paceMultiplier(actualPct: number, dayProgress: number): number {
    const expectedPct = Math.min(1, dayProgress * 1.1); // mismo colchón de 10% que ya usaba el pacing de pasos
    if (expectedPct <= 0) return 1;
    return Math.min(1, Math.max(0.5, actualPct / expectedPct));
  }

  private evaluatePacing(snapshot: HealthSnapshot, trainedToday?: boolean): string {
    const lines: string[] = [];
    const dayProgress = this.computeDayProgress(snapshot);
    // Entrenó (Forge) o tiene 20 min o más de ejercicio en el reloj: los pasos no cuentan las pesas ni el básquet. Antes este
    // texto decía «Muy sedentario, prioriza moverte» a quien venía de entrenar, y Eris se lo repetía (2026-10-16).
    const exercised = !!trainedToday || (snapshot.activeMinutes ?? 0) >= 20 || (snapshot.activity?.minutes ?? 0) >= 20;

    if (snapshot.steps !== null) {
      const steps = snapshot.steps;
      const goal = 8000; // la misma meta que usa el asesor del servidor
      const pct = Math.min(1, steps / goal);
      const expectedPct = Math.min(1, dayProgress * 1.1);
      const pace = pct / (expectedPct || 0.1);
      let paceText = '';
      const exMin = Math.max(snapshot.activeMinutes ?? 0, snapshot.activity?.minutes ?? 0);
      if (exercised) paceText = `🏋️ Ya entrenaste hoy${exMin ? ` (${exMin} min de actividad${snapshot.activity?.kcal ? `, ~${snapshot.activity.kcal} kcal` : ''})` : ''}: los pasos no cuentan todo lo que te moviste. No hace falta caminar más.`;
      else if (pace > 1.2) paceText = '🚀 Vas por delante del ritmo. ¡Energía alta!';
      else if (pace > 0.8) paceText = '👍 Vas al ritmo esperado. Mantén el paso.';
      else if (pace > 0.5) paceText = '🐢 Vas algo lento. Levántate y camina 5 min.';
      else paceText = '🛑 Muy sedentario hasta ahora. Prioriza moverte.';

      lines.push(`- **Pasos:** ${steps.toLocaleString()} / ${goal} (${Math.round(pct * 100)}%)`);
      lines.push(`  ⏳ Progreso esperado al ${Math.round(dayProgress * 100)}% del día → ${paceText}`);
    }

    if (snapshot.calories !== null) {
      const cal = snapshot.calories;
      const goalCal = 400;
      const pct = Math.min(1, cal / goalCal);
      lines.push(`- **Calorías activas:** ${cal} kcal / ${goalCal} kcal (${Math.round(pct * 100)}%)`);
      if (pct < 0.3 && !exercised) lines.push('  🍽️ *Has quemado pocas calorías. El movimiento activa el metabolismo.*');
    }

    return lines.join('\n');
  }

  private evaluateRisks(snapshot: HealthSnapshot): string {
    const risks: string[] = [];
    if (snapshot.sleep && snapshot.sleep.durationHours < 5.5) {
      risks.push('😴 *Fatiga acumulada por mal sueño.* Evita decisiones importantes o conducir si es posible.');
    }
    if (snapshot.hydration !== null && snapshot.hydration < 1.0) {
      risks.push('💧 *Deshidratación nivel 1.* Dolor de cabeza y bajo rendimiento cognitivo.');
    }
    if (snapshot.glucose && snapshot.glucose.valueMgdl > 180) {
      risks.push('🍬 *Hiperglucemia.* Riesgo de inflamación y somnolencia postpico.');
    }
    if (snapshot.glucose && snapshot.glucose.valueMgdl < 70) {
      risks.push('🍭 *Hipoglucemia.* Riesgo de mareos, ansiedad y falta de concentración.');
    }
    if (snapshot.steps !== null && snapshot.steps > 15000 && snapshot.sleep?.durationHours && snapshot.sleep.durationHours < 6) {
      risks.push('🏃 *Alta carga física con mala recuperación.* Riesgo de lesión o sobreentrenamiento.');
    }
    return risks.length > 0 ? risks.map(r => `- ${r}`).join('\n') : '✅ No se detectan riesgos agudos.';
  }

  private evaluateTrends(snapshot: HealthSnapshot): string {
    const lines: string[] = [];
    const now = new Date();
    const hour = now.getHours();

    if (snapshot.nutrition) {
      const n = snapshot.nutrition;
      const totalKcal = n.calories;
      const protein = n.protein;
      const carbs = n.carbs;
      lines.push(`- **Nutrición consumida hoy:** ${totalKcal} kcal · Prot: ${protein}g · Carbos: ${carbs}g`);
      if (protein < 20 && totalKcal > 0) {
        lines.push('  🥩 *Bajo consumo de proteína.* Afecta la saciedad y reparación muscular.');
      }
      if (hour >= 12 && hour <= 14 && totalKcal < 300) {
        lines.push('  🍽️ *Es hora de almorzar.* Tu energía va a bajar si no comes en la próxima hora.');
      }
      if (hour >= 19 && hour <= 21 && totalKcal < 500) {
        lines.push('  🍽️ *Es hora de cenar.* Prioriza proteína y verduras para una buena recuperación nocturna.');
      }
    }

    return lines.join('\n');
  }

  private inferLastMeal(snapshot: HealthSnapshot): string {
    if (snapshot.glucose && snapshot.glucose.valueMgdl > 120 && snapshot.nutrition?.calories && snapshot.nutrition.calories > 100) {
      const time = new Date(snapshot.glucose.timestamp);
      const minsAgo = Math.round((Date.now() - time.getTime()) / 60000);
      if (minsAgo < 120) {
        return `🍽️ **Última comida detectada:** hace ~${minsAgo} min (glucosa elevada). Tu cuerpo está procesando nutrientes. Evita ejercicio intenso por 1h.`;
      }
    }
    const hour = new Date().getHours();
    if (hour >= 6 && hour <= 9) return '🌅 **Mañana temprano.** Si no has desayunado, prioriza proteína y grasas saludables para energía sostenida.';
    if (hour >= 12 && hour <= 14) return '☀️ **Mediodía.** Asegura una comida balanceada con carbohidratos complejos para la tarde.';
    if (hour >= 18 && hour <= 20) return '🌙 **Atardecer.** Reduce carbos y aumenta proteína para favorecer el sueño.';
    return '⏳ No hay datos precisos de última comida. Escucha a tu cuerpo: ¿tienes hambre o fatiga?';
  }

  private generateActionableTips(snapshot: HealthSnapshot, trainedToday?: boolean): string {
    const tips: string[] = [];
    const exercised = !!trainedToday || (snapshot.activeMinutes ?? 0) >= 20 || (snapshot.activity?.minutes ?? 0) >= 20;
    if (snapshot.steps !== null && snapshot.steps < 5000 && !exercised) {
      tips.push('🚶 **Objetivo inmediato:** Camina 10 minutos (≈1000 pasos) para activar la circulación.');
    }
    if (snapshot.hydration !== null && snapshot.hydration < 1.5) {
      tips.push('💧 **Objetivo inmediato:** Bebe 500 ml de agua en los próximos 30 min.');
    }
    if (snapshot.glucose && snapshot.glucose.valueMgdl > 140) {
      tips.push('🚶 **Objetivo inmediato:** Camina suavemente 15 min para ayudar a bajar la glucosa.');
    }
    if (snapshot.glucose && snapshot.glucose.valueMgdl < 80) {
      tips.push('🍎 **Objetivo inmediato:** Come una fruta o toma un jugo para subir la glucosa.');
    }
    if (tips.length === 0) {
      tips.push('✅ Todo en orden. Mantén el ritmo actual. Eris está atenta a cualquier cambio.');
    }
    return tips.map(t => `- ${t}`).join('\n');
  }

  // ---------- PUNTUACIÓN DIVIDIDA (Fija + Dinámica) ----------

  /**
   * Puntaje fijo diario (se calcula una vez, idealmente al inicio del día).
   * Usa métricas que no cambian durante el día: sueño, reposo, VO2max, IMC, hábito de ejercicio.
   */
  /** null = no hay ningún dato fijo (sin reloj): no es un 0, es "falta información". */
  calculateFixedScore(snapshot: HealthSnapshot): number | null {
    let score = 0;
    let totalWeight = 0;

    // 1. Sueño (máx 40 pts)
    if (snapshot.sleep) {
      totalWeight += 40;
      let s = 0;
      const h = snapshot.sleep.durationHours;
      const eff = snapshot.sleep.efficiency;
      const stages = snapshot.sleep.stages;

      // Duración (20 pts)
      if (h >= 7 && h <= 9) s += 20;
      else if (h > 9) s += Math.max(10, 20 - (h - 9) * 2);
      else if (h >= 6) s += 14;
      else if (h >= 5) s += 7;

      // Eficiencia (10 pts)
      if (eff) {
        if (eff >= 90) s += 10;
        else if (eff >= 85) s += 7;
        else if (eff >= 80) s += 4;
      } else s += 5; // promedio

      // Arquitectura profunda + REM (10 pts)
      if (stages) {
        const deepScore = Math.min(5, (stages.deep / 1.5) * 5);
        const remScore = Math.min(5, (stages.rem / 1.5) * 5);
        s += deepScore + remScore;
      } else {
        s += (h >= 7) ? 10 : (h >= 6 ? 6 : 3);
      }
      score += Math.min(40, s);
    }

    // 2. Frecuencia cardíaca en reposo (máx 20 pts)
    if (snapshot.heartRate?.resting != null) {
      totalWeight += 20;
      const hr = snapshot.heartRate.resting;
      if (hr <= 55) score += 20;
      else if (hr <= 65) score += 16;
      else if (hr <= 75) score += 10;
      else if (hr <= 85) score += 5;
      else score += 2;
    }

    // 3. VO₂ máximo (máx 15 pts)
    if (snapshot.vo2Max != null) {
      totalWeight += 15;
      const vo2 = snapshot.vo2Max;
      if (vo2 >= 50) score += 15;
      else if (vo2 >= 45) score += 12;
      else if (vo2 >= 40) score += 9;
      else if (vo2 >= 35) score += 5;
      else score += 2;
    }

    // 4. Historial de ejercicio (usamos minutos activos del día actual como proxy, aunque sea dinámico)
    // Podríamos mejorar con promedio de días anteriores guardado en AsyncStorage
    if (snapshot.activeMinutes != null) {
      totalWeight += 15;
      const min = snapshot.activeMinutes;
      if (min >= 60) score += 15;
      else if (min >= 45) score += 12;
      else if (min >= 30) score += 8;
      else if (min >= 15) score += 4;
      else score += 1;
    }

    // 5. IMC (máx 10 pts)
    if (snapshot.bmi != null) {
      totalWeight += 10;
      const bmi = snapshot.bmi;
      if (bmi >= 18.5 && bmi < 25) score += 10;
      else if ((bmi >= 25 && bmi < 30) || (bmi >= 17 && bmi < 18.5)) score += 5;
      else if (bmi >= 30 || bmi < 17) score += 2;
      else score += 0;
    }

    return totalWeight === 0 ? null : Math.round((score / totalWeight) * 100);
  }

  /**
   * Puntaje dinámico (se actualiza cada vez que se consulta).
   * Basado en métricas que cambian durante el día: pasos, calorías, hidratación, glucosa, FC actual.
   * `extras` son señales de otros módulos (Forge, Finanzas) — opcionales, igual que el resto: si no se
   * conocen, simplemente no cuentan (no bajan el score por defecto).
   */
  calculateDynamicScore(snapshot: HealthSnapshot, extras: ScoreExtras = {}): number | null {
    let score = 0;
    let totalWeight = 0;
    const dayProgress = this.computeDayProgress(snapshot);

    // 1. Pasos (máx 35 pts) — 1L de agua o X pasos valen distinto según si
    // vas a tiempo o atrasado para la hora que es (ver paceMultiplier).
    if (snapshot.steps != null) {
      totalWeight += 35;
      const steps = snapshot.steps;
      const goal = 10000;
      const pct = Math.min(1, steps / goal);
      score += pct * this.paceMultiplier(pct, dayProgress) * 35;
    }

    // 2. Calorías activas (máx 20 pts)
    if (snapshot.calories != null) {
      totalWeight += 20;
      const cal = snapshot.calories;
      const calGoal = 300;
      const pct = Math.min(1, cal / calGoal);
      score += pct * this.paceMultiplier(pct, dayProgress) * 20;
    }

    // 3. Hidratación (máx 15 pts). Con el cálculo de NutritionQuality: litros vs lo esperable desde que despertaste,
    // y las bebidas azucaradas/alcohol restan (no hidratan igual que el agua).
    if (extras.hydrationScore != null) {
      totalWeight += 15;
      score += (Math.max(0, Math.min(100, extras.hydrationScore)) / 100) * 15;
    } else if (snapshot.hydration != null && this.waterGoal > 0) {
      totalWeight += 15;
      const liters = snapshot.hydration;
      const goal = this.waterGoal;
      const pct = Math.min(1, liters / goal);
      score += pct * this.paceMultiplier(pct, dayProgress) * 15;
    }

    // 4. Glucosa (máx 15 pts) – si está en rango
    if (snapshot.glucose != null) {
      totalWeight += 15;
      const mgdl = snapshot.glucose.valueMgdl;
      if (mgdl >= 70 && mgdl <= 140) score += 15;
      else if (mgdl > 140 && mgdl <= 180) score += 10;
      else if (mgdl > 180 && mgdl <= 250) score += 5;
      else if (mgdl < 70 || mgdl > 250) score += 0;
    }

    // 5. Frecuencia cardíaca actual (promedio del día) – máx 15 pts
    if (snapshot.heartRate?.average != null) {
      totalWeight += 15;
      const hr = snapshot.heartRate.average;
      if (hr >= 60 && hr <= 100) score += 15;
      else if (hr > 100 && hr <= 120) score += 8;
      else if (hr > 120 || hr < 60) score += 3;
    }

    // 6. Entrenamiento hoy (Forge) — máx 10 pts. Binario, pero nunca en 0: no entrenar un día no es un
    // fracaso, así que el piso es el mismo criterio que usan los demás "peor caso" de arriba (HR/VO2max: 2-3 pts).
    if (extras.trainedToday != null) {
      totalWeight += 10;
      score += extras.trainedToday ? 10 : 3;
    }

    // 7. Tasa de ahorro (Finanzas) — máx 10 pts, contra el 20% que ya usa el asesor financiero (BaselineEngine)
    // como referencia general de finanzas personales — mismo número en los dos lados, no uno inventado aparte.
    if (extras.savingsRate != null) {
      totalWeight += 10;
      const pct = Math.min(1, Math.max(0, extras.savingsRate / 20));
      score += pct * 10;
    }

    // 8. Alimentación (máx 30 pts) — lo que comiste, ¿te alimenta? Calidad de cada comida según su hora (pizza al
    // desayuno ≠ pizza al almuerzo ≠ solo pizza en todo el día), proteína/fibra/energía vs lo esperable A ESTA HORA,
    // ultraprocesados y sellos. Es el componente más pesado: comer mal no se compensa caminando.
    if (extras.foodScore != null) {
      totalWeight += 30;
      score += (Math.max(0, Math.min(100, extras.foodScore)) / 100) * 30;
    }

    return totalWeight === 0 ? null : Math.round((score / totalWeight) * 100);
  }

  /**
   * Calcula el score ejecutivo combinando fijo y dinámico con un peso.
   * @param snapshot Datos actuales
   * @param fixedWeight Peso para la parte fija (entre 0 y 1), por defecto 0.6
   * @param extras Señales de Forge/Finanzas — mismo score en Inicio y Métricas si se les pasa lo mismo.
   * @returns Objeto con puntajes separados y total
   */
  calcDayScore(snapshot: HealthSnapshot, fixedWeight = 0.6, extras: ScoreExtras = {}): DayScores {
    const fixed = this.calculateFixedScore(snapshot);
    const dynamic = this.calculateDynamicScore(snapshot, extras);
    // Una parte sin datos no cuenta como 0: el total sale de lo que sí se sabe. Antes "Fijo 0" (sin reloj) hundía el
    // total a 17 "Crítico" con el dinámico en 42 (2026-10-07).
    const total = fixed === null ? dynamic : dynamic === null ? fixed : Math.round(fixed * fixedWeight + dynamic * (1 - fixedWeight));
    return { fixed, dynamic, total };
  }

  // ---------- MÉTODO ORIGINAL toErisContext (se mantiene por compatibilidad) ----------

  toErisContext(snapshot: HealthSnapshot): string {
    const parts: string[] = ['## Estado Biométrico Actual'];

    if (snapshot.sleep) {
      const h = snapshot.sleep.durationHours;
      const quality = h >= 7.5 ? 'óptimo' : h >= 6 ? 'aceptable' : 'insuficiente';
      const eff = snapshot.sleep.efficiency ? ` · eficiencia ${snapshot.sleep.efficiency}%` : '';
      parts.push(`- **Sueño:** ${Math.round(h * 10) / 10}h${snapshot.sleep.split && snapshot.sleep.nightHours != null ? ` en partes (noche ${Math.round(snapshot.sleep.nightHours * 10) / 10}h)` : ''} (${quality})${eff}`);
      if (snapshot.sleep.stages) {
        const { light, deep, rem } = snapshot.sleep.stages;
        parts.push(`  └ Ligero: ${light}h · Profundo: ${deep}h · REM: ${rem}h`);
      }
    }
    if (snapshot.heartRate) {
      const restingStr = snapshot.heartRate.resting != null ? `reposo: ${snapshot.heartRate.resting} bpm · ` : '';
      parts.push(`- **FC:** ${restingStr}promedio: ${snapshot.heartRate.average} bpm`);
    }
    if (snapshot.steps !== null) {
      const pct = Math.round((snapshot.steps / 10000) * 100);
      parts.push(`- **Pasos:** ${snapshot.steps.toLocaleString()} (${pct}% del objetivo)`);
    }
    if (snapshot.distance !== null) parts.push(`- **Distancia:** ${snapshot.distance} km`);
    if (snapshot.calories !== null) parts.push(`- **Calorías activas:** ${snapshot.calories} kcal`);
    if (snapshot.activeMinutes !== null) parts.push(`- **Minutos activos:** ${snapshot.activeMinutes} min`);
    if (snapshot.spo2 !== null) parts.push(`- **SpO2:** ${snapshot.spo2}%`);
    if (snapshot.respiratoryRate) parts.push(`- **Frec. respiratoria:** ${snapshot.respiratoryRate} resp/min`);
    if (snapshot.vo2Max) parts.push(`- **VO₂ máx:** ${snapshot.vo2Max} ml/kg/min`);
    if (snapshot.glucose) {
      const g = snapshot.glucose;
      const label = g.valueMgdl > 180 ? 'ALTO' : g.valueMgdl < 70 ? 'BAJO' : 'en rango';
      const ago = Math.round((Date.now() - new Date(g.timestamp).getTime()) / 60000);
      parts.push(`- **Glucosa:** ${g.valueMgdl} mg/dL (${g.valueMmol} mmol/L) — ${label} — hace ${ago} min`);
    }
    if (snapshot.weight) parts.push(`- **Peso:** ${snapshot.weight} kg`);
    if (snapshot.bmi !== null) {
      const cat = snapshot.bmi < 18.5 ? 'bajo peso' : snapshot.bmi < 25 ? 'normal' : snapshot.bmi < 30 ? 'sobrepeso' : 'obesidad';
      parts.push(`- **IMC:** ${snapshot.bmi} (${cat})`);
    }
    if (snapshot.nutrition) {
      const n = snapshot.nutrition;
      parts.push(`- **Nutrición:** ${n.calories} kcal | Prot: ${n.protein}g | Carbos: ${n.carbs}g | Grasas: ${n.fat}g`);
      if (n.fiber > 0) parts.push(`  └ Fibra: ${n.fiber}g | Azúcar: ${n.sugar}g | Sodio: ${n.sodium}mg`);
    }
    if (snapshot.hydration !== null) {
      const t = this.waterGoal > 0 ? this.waterPace(snapshot.hydration) : null;
      parts.push(t
        ? `- **Hidratación:** ${snapshot.hydration}L de ${this.waterGoal}L en el día · a esta hora lo esperable: ~${Math.round(t.expectedNow * 10) / 10}L → ${t.status}`
        : `- **Hidratación:** ${snapshot.hydration}L (sin meta: la define su médico)`);
    }
    parts.push(`- **Actualizado:** ${new Date(snapshot.lastUpdated).toLocaleTimeString()}`);

    return parts.join('\n');
  }
}

// % de cada macro sobre la ENERGÍA de los tres (proteína y carbos 4 kcal/g, grasa 9 kcal/g), como cualquier tabla o
// guía. Antes era sobre los gramos: 50 g de grasa pesaban igual que 50 g de carbos aunque aportan más del doble de
// energía, y el reparto no calzaba con las calorías (2026-10-22). Compartido para que Inicio (torta) y Métricas
// (barras) muestren siempre el mismo número.
export function computeMacroPercents(nutrition: HealthSnapshot['nutrition']): { proteinPct: number; carbsPct: number; fatPct: number } {
  if (!nutrition) return { proteinPct: 0, carbsPct: 0, fatPct: 0 };
  const p = (nutrition.protein || 0) * 4, c = (nutrition.carbs || 0) * 4, f = (nutrition.fat || 0) * 9;
  const total = p + c + f;
  if (total <= 0) return { proteinPct: 0, carbsPct: 0, fatPct: 0 };
  return { proteinPct: Math.round((p / total) * 100), carbsPct: Math.round((c / total) * 100), fatPct: Math.round((f / total) * 100) };
}

export const metricsService = new MetricsService();
// Otra cuenta en el teléfono: nada de la anterior queda en memoria (revisión 2026-10-31, D4) (la foto de salud y la meta de agua)
DeviceEventEmitter.addListener(PROFILE_CHANGED_EVENT, () => metricsService.olvidarCuenta());
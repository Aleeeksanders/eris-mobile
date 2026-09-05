import { Linking, Platform } from 'react-native';
import {
  initialize,
  readRecords,
  aggregateRecord,
  openHealthConnectSettings,
  getGrantedPermissions,
} from 'react-native-health-connect';

export interface HealthSnapshot {
  sleep: {
    durationHours: number;
    efficiency?: number;
    stages?: { light: number; deep: number; rem: number };
  } | null;
  heartRate: {
    resting: number | null;
    average: number;
  } | null;
  steps: number | null;
  distance: number | null;       // km
  calories: number | null;       // kcal activas del día
  spo2: number | null;           // % — medido por el reloj durante el día
  respiratoryRate: number | null;
  vo2Max: number | null;
  activeMinutes: number | null; // min de ejercicio/movimiento del día (ExerciseSession)
  bmi: number | null;           // IMC calculado desde peso + estatura en HC
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
  glucose: {
    valueMgdl: number;
    valueMmol: number;
    timestamp: string;
    source: 'health_connect';
  } | null;
  lastUpdated: string;
}

class MetricsService {
  private initialized = false;
  private permissionsGranted = false;
  private cache: HealthSnapshot | null = null;
  private cacheTime = 0;
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutos

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

      // Verificar si los permisos siguen activos (se revocan al actualizar la APK sideloaded)
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

  // Llamar después de que el usuario regresa de Health Connect Settings
  async refreshPermissions(): Promise<boolean> {
    if (!this.initialized) return false;
    try {
      const granted = await getGrantedPermissions();
      this.permissionsGranted = granted.length > 0;
      if (this.permissionsGranted) this.cache = null; // invalidar caché para forzar re-lectura
      return this.permissionsGranted;
    } catch {
      return false;
    }
  }

  /**
   * Abre Health Connect directamente en la página de permisos de esta app.
   * Usa Linking con el esquema intent:// de Android — no llama requestPermission()
   * porque crashea la app en APKs sideloaded (crash nativo, no atrapable con try/catch JS).
   */
  async openPermissionsScreen(): Promise<true | string> {
    if (!this.initialized) {
      const ok = await this.init();
      if (ok !== true) return ok as string;
    }
    try {
      const APP_PACKAGE = 'com.aleeeksanders.erismobile';
      const androidVer = Platform.OS === 'android' ? (Platform.Version as number) : 0;

      // Android 14+ (API 34): HC integrado en el sistema, usa acción nativa
      // Android 13-: HC como app standalone (com.google.android.apps.healthdata)
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
        // El intent directo no funcionó (Android <13 o HC no instalado) — abrir settings general
        await openHealthConnectSettings();
        return true;
      }
    } catch (e: any) {
      return e?.message || String(e);
    }
  }

  /**
   * Verifica cuáles permisos fueron otorgados.
   * Llamar después de que el usuario regrese de Health Connect Settings.
   * Retorna la lista de permisos otorgados.
   */
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

  /** Mantener compatibilidad — pero ya no usa requestPermission() */
  async requestPermissionsIfNeeded(): Promise<true | string> {
    return this.openPermissionsScreen();
  }

  async getSnapshot(): Promise<HealthSnapshot> {
    if (!this.initialized) return this.getEmptySnapshot();

    // Si no hay permisos, re-verificar por si el usuario los acaba de otorgar
    if (!this.permissionsGranted) {
      await this.refreshPermissions();
      if (!this.permissionsGranted) return this.getEmptySnapshot();
    }

    // Retornar caché si está fresco
    if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
      return this.cache;
    }

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

      // Sleep
      const sleepRes = await readRecords('SleepSession', {
        timeRangeFilter: { operator: 'between', startTime: last24h.toISOString(), endTime: now.toISOString() }
      });
      if (sleepRes.records.length > 0) {
        const lastSleep = sleepRes.records[sleepRes.records.length - 1] as any;
        const start = new Date(lastSleep.startTime);
        const end = new Date(lastSleep.endTime);
        const dur = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        const stages: any[] = lastSleep.stages ?? [];
        let light = 0, deep = 0, rem = 0, awake = 0;
        for (const st of stages) {
          const h = (new Date(st.endTime).getTime() - new Date(st.startTime).getTime()) / 3600000;
          if      (st.stage === 4) light += h;
          else if (st.stage === 5) deep  += h;
          else if (st.stage === 6) rem   += h;
          else if (st.stage === 1) awake += h;  // awake-in-bed
        }
        const totalSleep = light + deep + rem;
        snapshot.sleep = {
          durationHours: Number(dur.toFixed(1)),
          efficiency: totalSleep > 0 && dur > 0 ? Math.round((totalSleep / dur) * 100) : undefined,
          stages: totalSleep > 0 ? {
            light: Math.round(light * 10) / 10,
            deep:  Math.round(deep  * 10) / 10,
            rem:   Math.round(rem   * 10) / 10,
          } : undefined,
        };
      }

      // Heart Rate
      const hrRes = await readRecords('HeartRate', {
        timeRangeFilter: { operator: 'between', startTime: last24h.toISOString(), endTime: now.toISOString() }
      });
      if (hrRes.records.length > 0) {
        let sum = 0;
        let count = 0;
        (hrRes.records as any[]).forEach(r => r.samples.forEach((s: any) => { sum += s.beatsPerMinute; count++; }));
        if (count > 0) {
          snapshot.heartRate = { resting: null, average: Math.round(sum / count) };
        }
      }

      // Fix resting HR — use real RestingHeartRate record, not the fake average-10 approximation
      try {
        const restingRes = await readRecords('RestingHeartRate', {
          timeRangeFilter: { operator: 'between', startTime: last24h.toISOString(), endTime: now.toISOString() },
        });
        if (restingRes.records.length > 0) {
          const lastResting = (restingRes.records as any[])[restingRes.records.length - 1];
          const bpm = lastResting.beatsPerMinute ?? lastResting.samples?.[0]?.beatsPerMinute;
          if (bpm && bpm > 0) {
            if (snapshot.heartRate) {
              snapshot.heartRate.resting = Math.round(bpm);
            } else {
              snapshot.heartRate = { resting: Math.round(bpm), average: Math.round(bpm) };
            }
          }
        }
      } catch { /* permission not granted */ }

      // Pasos — aggregateRecord deduplica automáticamente entre fuentes (Mi Fitness, sensor, etc.)
      // readRecords sumaba registros solapados de distintas apps → conteo inflado (ej: 29k)
      try {
        const stepsAgg = await aggregateRecord({
          recordType: 'Steps',
          timeRangeFilter: { operator: 'between', startTime: todayStart.toISOString(), endTime: now.toISOString() },
        });
        const total = (stepsAgg as any).COUNT_TOTAL ?? 0;
        if (total > 0) snapshot.steps = Math.round(total);
      } catch { /* permission not granted */ }

      // Distancia — aggregateRecord evita duplicados entre fuentes
      try {
        const distAgg = await aggregateRecord({
          recordType: 'Distance',
          timeRangeFilter: { operator: 'between', startTime: todayStart.toISOString(), endTime: now.toISOString() },
        });
        const totalM = (distAgg as any).DISTANCE_TOTAL?.inMeters ?? 0;
        if (totalM > 0) snapshot.distance = Math.round(totalM / 10) / 100;
      } catch { /* permission not granted */ }

      // Calorías activas — aggregateRecord evita duplicados entre fuentes
      try {
        const calAgg = await aggregateRecord({
          recordType: 'ActiveCaloriesBurned',
          timeRangeFilter: { operator: 'between', startTime: todayStart.toISOString(), endTime: now.toISOString() },
        });
        const totalKcal = (calAgg as any).ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0;
        if (totalKcal > 0) snapshot.calories = Math.round(totalKcal);
      } catch { /* permission not granted */ }

      // Minutos activos — suma de duraciones de sesiones de ejercicio del día
      try {
        const exerciseRes = await readRecords('ExerciseSession', {
          timeRangeFilter: { operator: 'between', startTime: todayStart.toISOString(), endTime: now.toISOString() },
        });
        if (exerciseRes.records.length > 0) {
          const totalMs = (exerciseRes.records as any[]).reduce((sum, r) => {
            const start = new Date(r.startTime).getTime();
            const end = new Date(r.endTime).getTime();
            return sum + Math.max(0, end - start);
          }, 0);
          if (totalMs > 0) snapshot.activeMinutes = Math.round(totalMs / 60000);
        }
      } catch { /* permission not granted */ }

      // SpO2 — Mi Fitness sí lo mide y sincroniza a HC
      try {
        const spo2Data = await readRecords('OxygenSaturation', {
          timeRangeFilter: { operator: 'between', startTime: last24h.toISOString(), endTime: now.toISOString() },
        });
        if (spo2Data.records.length > 0) {
          const last = (spo2Data.records as any[])[spo2Data.records.length - 1];
          const raw = last.percentage ?? last.value;
          if (raw != null) {
            // HC puede devolver 0-1 (decimal) o 0-100 (porcentaje)
            snapshot.spo2 = raw > 1 ? Math.round(raw) : Math.round(raw * 100);
          }
        }
      } catch { /* permission not granted */ }

      // Frecuencia respiratoria
      try {
        const respRes = await readRecords('RespiratoryRate', {
          timeRangeFilter: { operator: 'between', startTime: last24h.toISOString(), endTime: now.toISOString() },
        });
        if (respRes.records.length > 0) {
          const last = (respRes.records as any[])[respRes.records.length - 1];
          const rate = last.rate;
          if (rate && rate > 0) snapshot.respiratoryRate = Math.round(rate * 10) / 10;
        }
      } catch { /* permission not granted */ }

      // VO₂ máx
      try {
        const vo2Res = await readRecords('Vo2Max', {
          timeRangeFilter: { operator: 'between', startTime: new Date(now.getTime() - 90 * 24 * 3600000).toISOString(), endTime: now.toISOString() },
        });
        if (vo2Res.records.length > 0) {
          const last = (vo2Res.records as any[])[vo2Res.records.length - 1];
          const v = last.vo2MillilitersPerMinuteKilogram;
          if (v && v > 0) snapshot.vo2Max = Math.round(v * 10) / 10;
        }
      } catch { /* permission not granted */ }

      // Peso (último registrado en los últimos 30 días)
      try {
        const weightStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const weightData = await readRecords('Weight', {
          timeRangeFilter: { operator: 'between', startTime: weightStart.toISOString(), endTime: now.toISOString() },
        });
        if (weightData.records.length > 0) {
          const last = (weightData.records as any[])[weightData.records.length - 1];
          snapshot.weight = Math.round(last.weight.inKilograms * 10) / 10;
        }
      } catch { /* permission not granted */ }

      // Estatura + IMC (último registro en el último año)
      try {
        const heightStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        const heightData = await readRecords('Height', {
          timeRangeFilter: { operator: 'between', startTime: heightStart.toISOString(), endTime: now.toISOString() },
        });
        if (heightData.records.length > 0 && snapshot.weight !== null) {
          const last = (heightData.records as any[])[heightData.records.length - 1];
          const heightM = last.height?.inMeters ?? last.heightMeters;
          if (heightM && heightM > 0) {
            snapshot.bmi = Math.round((snapshot.weight / (heightM * heightM)) * 10) / 10;
          }
        }
      } catch { /* permission not granted */ }

      // ─── NUTRICIÓN — de Fitia, MyFitnessPal, Google Fit o cualquier app que sync a HC ───
      try {
        const nutritionData = await readRecords('Nutrition', {
          timeRangeFilter: { operator: 'between', startTime: todayStart.toISOString(), endTime: now.toISOString() },
        });
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
      } catch { /* permiso no disponible — fallar silenciosamente */ }

      // ─── GLUCOSA — de LibreLink / cualquier CGM que sincronice a Health Connect ───
      try {
        const glucoseData = await readRecords('BloodGlucose', {
          timeRangeFilter: { operator: 'between', startTime: last24h.toISOString(), endTime: now.toISOString() },
        });
        if (glucoseData.records.length > 0) {
          // Tomar la lectura más reciente
          const last = (glucoseData.records as any[])[glucoseData.records.length - 1];
          // Health Connect almacena en mmol/L
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
      } catch { /* permiso no otorgado o no disponible */ }

      // ─── HIDRATACIÓN — litros bebidos hoy ────────────────────────────
      try {
        const hydrationData = await readRecords('Hydration', {
          timeRangeFilter: { operator: 'between', startTime: todayStart.toISOString(), endTime: now.toISOString() },
        });
        if (hydrationData.records.length > 0) {
          const totalLiters = (hydrationData.records as any[]).reduce(
            (sum, r) => sum + (r.volume?.inLiters || 0), 0
          );
          snapshot.hydration = Math.round(totalLiters * 100) / 100;
        }
      } catch { /* permiso no disponible */ }

    } catch (e) {
      console.log('[Health] Error leyendo métricas:', e);
    }

    this.cache = snapshot;
    this.cacheTime = Date.now();
    return snapshot;
  }

  // Datos vacíos estrictos (sin demo)
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

  // Genera un resumen de texto para Eris
  toErisContext(snapshot: HealthSnapshot): string {
    const parts: string[] = ['## Estado Biométrico Actual'];

    if (snapshot.sleep) {
      const h = snapshot.sleep.durationHours;
      const quality = h >= 7.5 ? 'óptimo' : h >= 6 ? 'aceptable' : 'insuficiente';
      const eff = snapshot.sleep.efficiency ? ` · eficiencia ${snapshot.sleep.efficiency}%` : '';
      parts.push(`- **Sueño:** ${h}h (${quality})${eff}`);
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
      parts.push(`- **Hidratación:** ${snapshot.hydration}L de 2.5L (${Math.round((snapshot.hydration / 2.5) * 100)}%)`);
    }
    parts.push(`- **Actualizado:** ${new Date(snapshot.lastUpdated).toLocaleTimeString()}`);

    return parts.join('\n');
  }

  // Score Ejecutivo del Día (0-100)
  calcDayScore(snapshot: HealthSnapshot): number {
    let score = 0;
    let total = 0;

    if (snapshot.sleep) {
      total += 50;
      const h = snapshot.sleep.durationHours;
      score += h >= 8 ? 50 : h >= 7 ? 40 : h >= 6 ? 25 : h >= 5 ? 10 : 0;
    }

    if (snapshot.steps !== null) {
      total += 30;
      const s = snapshot.steps;
      score += s >= 10000 ? 30 : s >= 7000 ? 24 : s >= 5000 ? 15 : s >= 2000 ? 7 : 0;
    }

    if (snapshot.heartRate?.resting != null) {
      total += 20;
      const hr = snapshot.heartRate.resting;
      score += hr <= 55 ? 20 : hr <= 65 ? 16 : hr <= 75 ? 10 : 4;
    }

    if (total === 0) return 0;
    return Math.round((score / total) * 100);
  }
}

export const metricsService = new MetricsService();

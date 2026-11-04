// ============================================================
// Eris Mobile — GlucoService (cliente para el backend Eris)
// Consume los endpoints REST /api/gluco/* de Eris
// ============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";

export interface GlucoseReading {
  timestamp: string;
  value: number;
  valueInMmol: number;
  trend: string;
  trendArrow: string;
  isHigh: boolean;
  isLow: boolean;
}

export interface GlucoStats {
  avg: number;
  min: number;
  max: number;
  timeInRange: number;
  timeAbove: number;
  timeBelow: number;
}

export interface FoodSearchResult {
  id: string;
  name: string;
  brandName?: string;
  description: string;
}

export interface FoodDetail {
  id: string;
  name: string;
  brandName?: string;
  type: string;
  defaultServing: {
    id: string;
    description: string;
    calories: number;
    carbs: number;
    fiber: number;
    protein: number;
    fat: number;
    sugar?: number;
  };
}

export interface MealLogEntry {
  id: string;
  timestamp: string;
  foods: Array<{
    foodId: string;
    name: string;
    servingDescription: string;
    portionMultiplier: number;
    calories: number;
    carbs: number;
    protein: number;
    fat: number;
    sugar?: number;
  }>;
  totalCalories: number;
  estimatedGL: number;
  riskLevel: "low" | "medium" | "high" | "very_high";
}

const MEAL_LOG_KEY = "gluco_meal_log";

export class MobileGlucoService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    // e.g., "http://192.168.1.x:3000"
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /** Sesión de Google (token que emitió el servidor); ya no hay PIN. */
  private async getCredentials() {
    const [profileId, token] = await Promise.all([
      AsyncStorage.getItem('eris_profile_id'),
      AsyncStorage.getItem('eris_session_token'),
    ]);
    return { profileId: profileId || 'default', token: token || '' };
  }

  private async get<T>(path: string): Promise<T> {
    const { token } = await this.getCredentials();

    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      try {
        const body = await res.json() as any;
        const err = new Error(body?.message || body?.error || `Error ${res.status}`);
        (err as any).code = body?.code;
        throw err;
      } catch (inner) {
        if ((inner as any).code !== undefined) throw inner;
        throw new Error(`Error ${res.status}: ${path}`);
      }
    }
    return res.json() as Promise<T>;
  }

  async testConnection(): Promise<{ ok: boolean; code: string; message: string; current?: any; sensorInfo?: any }> {
    const { token } = await this.getCredentials();
    try {
      const res = await fetch(`${this.baseUrl}/api/gluco/test`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      return await res.json() as any;
    } catch {
      return { ok: false, code: "network_error", message: "No se pudo conectar con el servidor Eris." };
    }
  }

  // ─── Glucosa ────────────────────────────────────────────────

  async fetchCurrent(): Promise<{
    current: GlucoseReading | null;
    lastFetched: string;
    sensorInfo?: any;
  }> {
    return this.get("/api/gluco/current");
  }

  async fetchHistory(hours = 24): Promise<{ readings: GlucoseReading[]; hours: number }> {
    return this.get(`/api/gluco/history?hours=${hours}`);
  }

  async fetchStats(hours = 24): Promise<{ stats: GlucoStats | null; hours: number }> {
    return this.get(`/api/gluco/stats?hours=${hours}`);
  }

  // ─── FatSecret / Alimentos ────────────────────────────────────

  async searchFoods(query: string): Promise<{ items: FoodSearchResult[]; totalResults: number }> {
    return this.get(`/api/gluco/food/search?q=${encodeURIComponent(query)}`);
  }

  async getFoodDetail(id: string): Promise<FoodDetail> {
    return this.get(`/api/gluco/food/detail?id=${encodeURIComponent(id)}`);
  }

  async lookupByBarcode(barcode: string): Promise<FoodDetail | null> {
    try {
      return await this.get<FoodDetail>(`/api/gluco/food/barcode?code=${encodeURIComponent(barcode)}`);
    } catch {
      return null;
    }
  }

  // ─── Log local de comidas (AsyncStorage) ────────────────────

  /** Todo el registro (revisión M2: un registro dañado ya no rompe la pantalla; se aparta y se empieza de nuevo) */
  private async readMealLog(): Promise<MealLogEntry[]> {
    const raw = await AsyncStorage.getItem(MEAL_LOG_KEY).catch(() => null);
    if (!raw) return [];
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; }
    catch { await AsyncStorage.setItem(`${MEAL_LOG_KEY}__danado_${Date.now()}`, raw).catch(() => {}); return []; }
  }

  async saveMealLog(entry: MealLogEntry): Promise<void> {
    const log = await this.readMealLog();
    // Mantener últimas 100 entradas
    const updated = [entry, ...log].slice(0, 100);
    await AsyncStorage.setItem(MEAL_LOG_KEY, JSON.stringify(updated));
  }

  async getMealLog(limitDays = 7): Promise<MealLogEntry[]> {
    const log = await this.readMealLog();
    const cutoff = new Date(Date.now() - limitDays * 24 * 60 * 60 * 1000).toISOString();
    return log.filter((e) => e.timestamp > cutoff);
  }

  /**
   * Borra UNA comida del registro completo (revisión M2: la pantalla leía solo los últimos 30 días y guardaba eso, así que
   * borrar una comida borraba también todo lo de más de 30 días).
   */
  async deleteMeal(id: string): Promise<MealLogEntry[]> {
    const next = (await this.readMealLog()).filter((e) => e.id !== id);
    await AsyncStorage.setItem(MEAL_LOG_KEY, JSON.stringify(next));
    return next;
  }

  async clearMealLog(): Promise<void> {
    await AsyncStorage.removeItem(MEAL_LOG_KEY);
  }

  // ─── Helpers ─────────────────────────────────────────────────

  getGlucoseColor(value: number, low = 70, high = 180): string {
    if (value < low) return "#818cf8";   // indigo — hipoglucemia
    if (value > high) return "#f43f5e";  // rojo — hiperglucemia
    return "#22c55e";                    // verde — en rango
  }

  getRiskColor(risk: MealLogEntry["riskLevel"]): string {
    const map: Record<string, string> = {
      low: "#22c55e",
      medium: "#f59e0b",
      high: "#f43f5e",
      very_high: "#dc2626",
    };
    return map[risk] || "#94a3b8";
  }

  getRiskLabel(risk: MealLogEntry["riskLevel"]): string {
    const map: Record<string, string> = {
      low: "Bajo",
      medium: "Moderado",
      high: "Alto",
      very_high: "Muy Alto",
    };
    return map[risk] || "Desconocido";
  }
}

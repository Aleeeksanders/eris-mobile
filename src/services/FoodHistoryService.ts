import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import type { FoodItem } from './FoodSearchService';
import { PROFILE_CHANGED_EVENT } from './ScopedStorage';

const STORAGE_KEY = 'eris_food_history_v1';
const MIN_TOKEN_LEN = 5;
const MAX_CANDIDATES = 3;

export interface FoodHistoryEntry {
  name: string;
  brand?: string;
  macrosPer100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium: number;
  };
  count: number;
  lastLoggedAt: string;
}

/**
 * Minúsculas, sin acentos/puntuación, colapsa espacios — para comparar
 * "Empanada, beef" contra "empanada de carne" a nivel de texto plano.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar acentos
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(name: string): string[] {
  return normalizeName(name).split(' ').filter(t => t.length >= MIN_TOKEN_LEN);
}

/**
 * Filtro barato sin red: ¿comparten al menos un token "distintivo" (5+
 * caracteres)? "Empanada, beef" y "empanada de carne" comparten "empanada"
 * aunque "beef"≠"carne" — suficiente para justificar preguntarle a Eris,
 * no para decidir por sí solo (eso lo hace el LLM en el backend).
 */
export function findCandidatesIn(history: FoodHistoryEntry[], newFood: { name: string }): FoodHistoryEntry[] {
  const newTokens = new Set(tokenize(newFood.name));
  if (newTokens.size === 0) return [];
  const newNorm = normalizeName(newFood.name);

  return history
    .filter(h => {
      if (normalizeName(h.name) === newNorm) return false; // idéntico, no hace falta preguntar
      const tokens = tokenize(h.name);
      return tokens.some(t => newTokens.has(t));
    })
    .sort((a, b) => b.count - a.count || (Date.parse(b.lastLoggedAt) - Date.parse(a.lastLoggedAt)))
    .slice(0, MAX_CANDIDATES);
}

class FoodHistoryService {
  private cache: FoodHistoryEntry[] | null = null;

  /** Olvida lo cargado en memoria (se vuelve a leer de la cuenta activa). */
  forget() { this.cache = null; }

  private async load(): Promise<FoodHistoryEntry[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      this.cache = raw ? JSON.parse(raw) : [];
    } catch {
      this.cache = [];
    }
    return this.cache!;
  }

  private async persist(entries: FoodHistoryEntry[]) {
    this.cache = entries;
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch {}
  }

  async findCandidates(newFood: { name: string }): Promise<FoodHistoryEntry[]> {
    const history = await this.load();
    return findCandidatesIn(history, newFood);
  }

  /** Registra (o actualiza) un alimento en el historial — llamar tras cada log exitoso. */
  async record(food: FoodItem): Promise<void> {
    const history = await this.load();
    const norm = normalizeName(food.name);
    const idx = history.findIndex(h => normalizeName(h.name) === norm);
    const macrosPer100g = {
      calories: food.calories, protein: food.protein, carbs: food.carbs,
      fat: food.fat, fiber: food.fiber, sugar: food.sugar, sodium: food.sodium,
    };
    if (idx >= 0) {
      history[idx] = { ...history[idx], macrosPer100g, count: history[idx].count + 1, lastLoggedAt: new Date().toISOString() };
    } else {
      history.push({ name: food.name, brand: food.brand, macrosPer100g, count: 1, lastLoggedAt: new Date().toISOString() });
    }
    // Con tope (revisión 2026-10-31, D6): uno por alimento distinto crecía para siempre; quedan los 800 más usados y recientes
    const MAX = 800;
    await this.persist(history.length <= MAX ? history
      : [...history].sort((x, y) => String(y.lastLoggedAt).localeCompare(String(x.lastLoggedAt)) || y.count - x.count).slice(0, MAX));
  }
}

export const foodHistoryService = new FoodHistoryService();
// Otra cuenta en el mismo teléfono: su historial es otro (ver ScopedStorage)
DeviceEventEmitter.addListener(PROFILE_CHANGED_EVENT, () => foodHistoryService.forget());

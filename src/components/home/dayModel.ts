// ============================================================
// Eris Mobile — el día de la persona, para Inicio
//
// Lo que comparten el reloj interno, la tarjeta "Ahora" y los chips del día: desde cuándo está despierta, en qué comida
// está, la siguiente, cuánto falta para dormir, el agua esperable a esta hora de SU día y lo que ya comió (con la comida
// a la que corresponde). Se recalcula cada minuto, al cambiar el horario y al anotar comida (por chat o en la app).
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { daySchedule, DAY_SCHEDULE_EVENT } from '../../services/daySchedule';
import { mealWindows, internalHour, hourOf, dayPhase, effectiveSlot, MEAL_ORDER } from '../../services/mealSchedule';
import { STORAGE_KEY_LOG } from '../../services/nutritionSync';
import { nutritionBackend } from '../../services/NutritionBackend';
import type { LoggedFood } from '../../services/FoodSearchService';
import { isCaffeinated, type SleepInsights } from '../../services/sleep/sleepCore';

export const SNACK = new Set(['colacion_am', 'colacion_pm']);
export const MEAL_TITLE: Record<string, string> = {
  desayuno: 'Desayuno', colacion_am: 'Colación de media mañana', almuerzo: 'Almuerzo', colacion_pm: 'Colación de la tarde',
  once: 'Once', cena: 'Cena',
};

export interface DayMeal { at: Date; slot: string }
export interface DaySeg { s: string; a: number; b: number }

export interface DayModel {
  now: Date;
  /** ¿se sabe a qué hora despierta? (si no, se usa un día de 7:30 a 23:30) */
  known: boolean;
  /** hora de despertar (con decimales) */
  wake: number;
  /** despertó hoy según el reloj (si no, es la hora habitual) */
  wokeToday: boolean;
  /** horas que está despierta en un día */
  awake: number;
  /** horas desde que despertó */
  relNow: number;
  /** pasó su hora habitual de dormir */
  asleepNow: boolean;
  /** ventanas de comida en horas desde el despertar, recortadas a las horas despierta */
  segs: DaySeg[];
  current: DaySeg | null;
  next: DaySeg | null;
  /** en qué parte de su día está, por las horas que lleva despierta (mañana, mediodía, tarde, noche, hora de dormir) */
  phase: string;
  /** la hora de su día: como si hubiera despertado a las 7:30 (para el saludo) */
  inner: number;
  /** horas que faltan para dormir */
  toBed: number;
  /** hasta qué hora (desde el despertar) conviene el café: 6 h antes de acostarse (con el sueño de 2 semanas; si no, 8 h antes de dormir) */
  coffeeUntil: number;
  /** la ventana para acostarse de hoy (Sueño 2.0, horas locales; puede pasar de 24), si se sabe */
  bed: { from: number; to: number; target: number } | null;
  meals: DayMeal[];
  /** lo anotado hoy con cafeína (para el aviso de café tarde) */
  caffeine: Array<{ name: string; at: number }>;
}

/** Agua esperable a esta hora de su día: la meta repartida hasta ~2 h antes de dormir. */
export const expectedWater = (m: DayModel, goal: number) => (goal > 0 ? goal * Math.min(1, m.relNow / Math.max(1, m.awake - 2)) : 0);

export function useDayModel(sleep?: SleepInsights | null): DayModel {
  const [now, setNow] = useState(() => new Date());
  const [rev, setRev] = useState(0);
  const [logged, setLogged] = useState<LoggedFood[]>([]);

  // Cada minuto, y cuando cambia el horario (despertó, o lo fijó en Perfil)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    const sub = DeviceEventEmitter.addListener(DAY_SCHEDULE_EVENT, () => { setRev((r) => r + 1); setNow(new Date()); });
    return () => { clearInterval(id); sub.remove(); };
  }, []);

  // Lo comido hoy: lo anotado en el teléfono + lo del chat que aún no llega al registro
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const local: LoggedFood[] = JSON.parse((await AsyncStorage.getItem(`${STORAGE_KEY_LOG}_${daySchedule.todayKey()}`)) || '[]');
        const pending = await nutritionBackend.pendingLogged().catch(() => [] as LoggedFood[]);
        if (alive) setLogged([...local, ...pending]);
      } catch {}
    };
    load();
    const off = nutritionBackend.subscribe(load);
    return () => { alive = false; off(); };
  }, [rev]);

  return useMemo(() => {
    const ctx = daySchedule.ctx();
    const wakeH = daySchedule.wakeHour(now);
    const known = wakeH != null;
    const wake = known ? wakeH! : 7.5;
    const wakeAt = ctx.wakeAt ? new Date(ctx.wakeAt) : null;
    const wokeToday = !!wakeAt && !Number.isNaN(wakeAt.getTime()) && Math.abs(hourOf(wakeAt) - wake) < 0.02;
    const awake = 24 - daySchedule.sleepHours();
    const relNow = (((hourOf(now) - wake) % 24) + 24) % 24;
    const asleepNow = relNow > awake;
    const win = mealWindows(known ? wake : undefined);
    const segs = MEAL_ORDER.map((s) => {
      let a = win[s][0] - wake, b = win[s][1] - wake;
      if (b <= 0) { a += 24; b += 24; }
      return { s, a: Math.max(0, a), b: Math.min(awake, b) };
    }).filter((x) => x.b - x.a > 0.05);
    const current = asleepNow ? null : segs.find((x) => relNow >= x.a && relNow < x.b) ?? null;
    const next = segs.find((x) => x.a > relNow && !SNACK.has(x.s)) ?? null;
    const meals = logged
      .map((e) => ({ at: new Date(e.loggedAt), slot: e.mealType }))
      .filter((x) => !Number.isNaN(x.at.getTime()))
      .map((x) => ({ at: x.at, slot: effectiveSlot(x.slot, x.at, { wakeHour: known ? wake : undefined }) }));
    // La hora para acostarse y la del último café salen del sueño de 2 semanas (Sueño 2.0 · S3), la misma de la pantalla
    // de Sueño y del chat; sin eso, las horas que suele dormir
    const rel = (h: number) => (((h - wake) % 24) + 24) % 24;
    const bed = sleep && sleep.nights >= 4 ? { from: sleep.bedtime.from, to: sleep.bedtime.to, target: sleep.bedtime.target } : null;
    const caffeine = logged
      .filter((e) => e?.food?.name && isCaffeinated(e.food.name))
      .map((e) => ({ name: e.food.name, at: Date.parse(e.loggedAt) }))
      .filter((x) => !Number.isNaN(x.at));
    return {
      now, known, wake, wokeToday, awake, relNow, asleepNow, segs, current, next,
      phase: dayPhase(now, known ? wake : undefined, awake), inner: internalHour(now, known ? wake : undefined),
      toBed: bed ? rel(bed.target) - relNow : awake - relNow, coffeeUntil: bed ? rel(sleep!.caffeineUntil) : awake - 8, bed, meals, caffeine,
    };
  }, [now, rev, logged, sleep]);
}

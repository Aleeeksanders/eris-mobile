// ============================================================
// Eris Mobile — junta lo que sabe el teléfono y deja programados los avisos del día
//
// Las reglas (qué avisar y cuándo) están en reminderRules.ts. Esto solo reúne los datos (comidas de hoy y de las
// últimas 2 semanas, agua, metas del día, Forge, Finanzas, módulos y preferencias) y le pasa el plan a
// ErisNotifications. Se recalcula cada vez que algo cambia (anotas comida o agua, Forge o Finanzas se actualizan,
// cambias un interruptor, vuelves a la app): lo que ya hiciste se cancela y lo ya resuelto sale de la bandeja.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wsManager } from './WebSocketManager';
import { getIntent, shouldAsk, INTENT_EVENT } from './forge/trainingIntent';
import { AppState, DeviceEventEmitter } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AuthStorage } from './AuthStorage';
import { ModuleStorage } from './ModuleStorage';
import { nutritionBackend } from './NutritionBackend';
import { metricsService, ACTIVITY_DAYS_KEY } from './MetricsService';
import { foodSearchService, type LoggedFood } from './FoodSearchService';
import { STORAGE_KEY_LOG, STORAGE_KEY_WATER, STORAGE_KEY_GOALS } from './nutritionSync';
import { erisNotifications, PLAN_REFRESH_EVENT } from './ErisNotifications';
/** El día LOCAL de una hora ISO (revisión K1: cortar la hora UTC daba «mañana» después de las 21:00) */
const diaLocalDe = (iso: unknown) => { const d = new Date(String(iso)); return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
import { planReminders, dayKey, type PlanInput, type FinanceInfo } from './reminderRules';
import { effectiveSlot } from './mealSchedule';
import { daySchedule } from './daySchedule';
import { NudgeCache } from './nudgeSuggest';
import { getTone, DEFAULT_TONE, TONE_CHANGED_EVENT } from './tone';
import { isCaffeinated, lateCaffeine } from './sleep/sleepCore';
import { SLEEP_EDITS_EVENT } from './sleep/sleepStore';
import { dayPlanStore, DAY_PLAN_EVENT } from './dayPlan/dayPlanStore';

/**
 * Quien trasnocha o trabaja de noche: la pauta completa (comidas, agua, horas de silencio) se corre a su horario. Las reglas
 * piensan en el horario de siempre; se les da la hora "corrida" y los avisos vuelven a la hora real. Sin corrimiento
 * (despierta entre las 5 y las 9) no cambia nada. Se corre lo mismo que el despertar (no los ¾ del horario de comidas): las
 * horas de silencio tienen que cubrir el sueño entero (despertando a las 13, el resumen de la mañana llegaba a las 11).
 */
const reminderShiftHours = (wake?: number) => (wake == null ? 0 : wake > 9 ? wake - 8 : wake < 5 ? wake - 5 : 0);

function shiftInput(i: PlanInput, ms: number): PlanInput {
  const m = Math.round(ms / 60000);
  const norm = (x: number) => (((x - m) % 1440) + 1440) % 1440;
  const h = m / 60;
  return {
    ...i, now: new Date(i.now.getTime() - ms),
    mealHistory: i.mealHistory.map((x) => ({ ...x, minutes: norm(x.minutes) })),
    todayMeals: i.todayMeals.map((t) => ({ ...t, minutes: norm(t.minutes) })),
    // las horas de sueño (acostarse, último café) y las comidas del plan se corren igual que el resto
    ...(i.sleep ? { sleep: { ...i.sleep, bedFrom: i.sleep.bedFrom - h, bedTo: i.sleep.bedTo - h, caffeineUntil: i.sleep.caffeineUntil - h } } : {}),
    ...(i.planMeals ? { planMeals: i.planMeals.map((x) => ({ ...x, hora: x.hora - h })) } : {}),
    ...(i.planMealsTomorrow ? { planMealsTomorrow: i.planMealsTomorrow.map((x) => ({ ...x, hora: x.hora - h })) } : {}),
    ...(i.planCues ? { planCues: i.planCues.map((x) => ({ ...x, hora: x.hora - h })) } : {}),
  };
}

const HISTORY_DAYS = 14;
const DEBOUNCE_MS = 2000;

const parse = <T,>(raw: string | null | undefined, fallback: T): T => { try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
const minutesOf = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes(); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86400000);

class ReminderPlanner {
  private subs: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private again = false;
  /** la comida concreta de los avisos de colación, fibra y proteína (se pide al servidor una vez por necesidad y día) */
  private nudges = new NudgeCache();

  /** Se llama al iniciar sesión. Idempotente. */
  start() {
    if (this.subs.length) return;
    const kick = () => this.schedule();
    this.subs.push(nutritionBackend.subscribe(kick));
    for (const ev of [PLAN_REFRESH_EVENT, 'NUTRITION_GOALS_UPDATED', 'MODULES_CHANGED', TONE_CHANGED_EVENT, INTENT_EVENT, SLEEP_EDITS_EVENT, DAY_PLAN_EVENT]) {
      const sub = DeviceEventEmitter.addListener(ev, kick);
      this.subs.push(() => sub.remove());
    }
    const app = AppState.addEventListener('change', (st) => { if (st === 'active') kick(); });
    this.subs.push(() => app.remove());
    kick();
  }

  /** Al cerrar sesión: no quedan avisos de la cuenta anterior. */
  stop() {
    this.subs.forEach((off) => off());
    this.subs = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nudges.clear();
    erisNotifications.clearPlan().catch(() => {});
  }

  /** Recalcula pronto (varios cambios seguidos se juntan en una sola pasada). */
  schedule(delay = DEBOUNCE_MS) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.run().catch(() => {}); }, delay);
  }

  private async run() {
    if (this.running) { this.again = true; return; }
    this.running = true;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
      const creds = await AuthStorage.getCredentials();
      if (!creds?.profileId) return;
      // "Alertas proactivas" apagado en Perfil: ningún aviso del día
      if (!(await erisNotifications.tipsEnabled())) { await erisNotifications.clearPlan(); return; }
      const real = await this.gather(creds.profileId, new Date());
      const shiftMs = Math.round(reminderShiftHours(daySchedule.wakeHour()) * 60) * 60000;
      const input = shiftMs ? shiftInput(real, shiftMs) : real;
      const base = planReminders(input).map((r) => (shiftMs ? { ...r, at: new Date(r.at.getTime() + shiftMs) } : r));
      // Los ids llevan el día de la pauta (corrida para quien trasnocha): con ese día se pide la comida concreta
      const plan = await this.nudges.apply(base, dayKey(input.now), real.kcalToday, real.tone ?? DEFAULT_TONE).catch(() => base);
      // Lo que las reglas todavía piden para el día completo: un aviso ya mostrado que no esté acá ya se resolvió
      const midnight = new Date(input.now); midnight.setHours(0, 0, 0, 0);
      const stillRelevant = new Set(planReminders({ ...input, now: midnight }, { raw: true }).map((r) => r.id));
      await erisNotifications.schedulePlan(plan, stillRelevant);
    } finally {
      this.running = false;
      if (this.again) { this.again = false; this.schedule(); }
    }
  }

  private async gather(pid: string, now: Date): Promise<PlanInput> {
    // El día de COMIDA (termina al dormir): a las 2 AM sin haber dormido, "hoy" sigue siendo ayer
    const todayDate = daySchedule.todayDate(now);
    const today = todayDate.toDateString();
    const histDates = Array.from({ length: HISTORY_DAYS }, (_, k) => new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - (k + 1)));
    const kToday = `${STORAGE_KEY_LOG}_${today}`, kWater = `${STORAGE_KEY_WATER}_${today}`;
    const kTraining = `eris_forge_training_${pid}`, kFinance = `finance_summary_${pid}`;
    const histKeys = histDates.map((d) => `${STORAGE_KEY_LOG}_${d.toDateString()}`);
    const got = new Map(await AsyncStorage.multiGet([kToday, kWater, STORAGE_KEY_GOALS, kTraining, kFinance, ...histKeys]));
    const [modules, settings, displayName, pending, tone, exerciseDays, snapNow] = await Promise.all([
      ModuleStorage.get(pid), erisNotifications.reminderSettings(pid), AuthStorage.getDisplayName(),
      nutritionBackend.pendingLogged().catch(() => [] as LoggedFood[]),
      getTone().catch(() => null),
      // El ejercicio del reloj y los pasos de hoy: con ellos no se pide moverse a quien ya entrenó (2026-10-16)
      // + la actividad detectada sin «modo entrenamiento» (lo que guarda MetricsService al leer el pulso de cada día)
      Promise.all([metricsService.readExerciseDays(35).catch(() => ({} as Record<string, number>)), AsyncStorage.getItem(ACTIVITY_DAYS_KEY).catch(() => null)])
        .then(([hc, raw]) => {
          const det = parse<Record<string, number>>(raw, {});
          const out: Record<string, number> = { ...hc };
          for (const [k, v] of Object.entries(det)) out[k] = Math.max(out[k] ?? 0, Number(v) || 0);
          return out;
        }),
      metricsService.getSnapshot().catch(() => null),
    ]);

    // Hoy: lo anotado en el teléfono + lo anotado por chat que todavía no se copia al teléfono
    let kcalToday = 0, proteinToday = 0, fiberToday = 0;
    const todayMeals: PlanInput['todayMeals'] = [];
    for (const e of [...parse<LoggedFood[]>(got.get(kToday), []), ...pending]) {
      try {
        const p = foodSearchService.calcPortion(e.food, e.grams);
        kcalToday += p.calories || 0;
        proteinToday += p.protein || 0;
        fiberToday += p.fiber || 0;
      } catch {}
      const m = minutesOf(e.loggedAt);
      // La comida de la hora en que se comió (un "Desayuno" anotado a las 12 no dice que desayunas a mediodía)
      if (m !== null && e.mealType) todayMeals.push({ slot: effectiveSlot(e.mealType, new Date(e.loggedAt)), minutes: m });
    }
    const localWater = parseFloat(got.get(kWater) || '0') || 0;
    const merged = await nutritionBackend.merge({ hydration: localWater } as any).catch(() => null);
    const waterToday = Number(merged?.hydration ?? localWater) || 0;

    // Las últimas 2 semanas: a qué hora comes cada comida (solo para afinar la pauta, no para copiarla)
    const mealHistory: PlanInput['mealHistory'] = [];
    histDates.forEach((d, k) => {
      for (const e of parse<LoggedFood[]>(got.get(histKeys[k]), [])) {
        const m = minutesOf(e.loggedAt);
        if (m !== null && e.mealType) mealHistory.push({ day: dayKey(d), slot: effectiveSlot(e.mealType, new Date(e.loggedAt)), minutes: m });
      }
    });

    // Metas del día (las mismas de Inicio y Nutrición: DailyTargets en el servidor)
    const goals = parse<Record<string, number>>(got.get(STORAGE_KEY_GOALS), {});
    const kcalGoal = goals.calories > 0 ? goals.calories : 2000;
    const waterGoal = goals.waterTargetOff ? null : goals.waterLiters > 0 ? goals.waterLiters : 2.5;

    // Forge (lo guarda TojiScreen): series por día y racha de misiones
    const tr = parse<{ days?: Record<string, number>; streak?: number; lastClaimedDay?: string | null }>(got.get(kTraining), {});
    const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

    // Finanzas (lo guarda hwExtract): los días hasta cada pago se recalculan con la fecha de hoy
    const fs = parse<any>(got.get(kFinance), null);
    const todayK = dayKey(now);
    const thisMonth = typeof fs?.updatedAt === 'string' && fs.updatedAt.slice(0, 7) === todayK.slice(0, 7);
    const finance: FinanceInfo | null = fs ? {
      ultimoMovimiento: typeof fs.ultimoMovimiento === 'string' ? fs.ultimoMovimiento : null,
      proximos: (Array.isArray(fs.proximos) ? fs.proximos : [])
        .filter((p: any) => typeof p?.fecha === 'string')
        .map((p: any) => ({ ...p, enDias: daysBetween(todayK, p.fecha) }))
        .filter((p: any) => p.enDias >= 0),
      pendientes: Array.isArray(fs.pendientes) ? fs.pendientes : [],
      comida: thisMonth && fs.comida ? fs.comida : null,
      // Finanzas 2.0: el presupuesto al día y lo libre cambian con los días; solo se usan si el resumen es reciente
      presupuesto: thisMonth && Array.isArray(fs.presupuesto) ? fs.presupuesto : null,
      libre: typeof fs.libre === 'number' && daysBetween(diaLocalDe(fs.updatedAt), todayK) <= 2 ? fs.libre : null,
      proximoIngreso: fs.proximoIngreso && typeof fs.proximoIngreso.desc === 'string' ? fs.proximoIngreso : null,
    } : null;

    // Sueño 2.0 · S4: la hora para acostarse y del último café (las 2 semanas del reloj), su plan, y si toma café de tarde
    // (2 días o más de las últimas 2 semanas con cafeína anotada desde las 14:00: a quien no toma café no se le avisa)
    const ins = snapNow?.sleepInsights && snapNow.sleepInsights.nights >= 4 ? snapNow.sleepInsights : null;
    let sleep: PlanInput['sleep'] = null;
    if (ins) {
      const cafDays = new Set<string>();
      histDates.forEach((d, k) => {
        for (const e of parse<LoggedFood[]>(got.get(histKeys[k]), [])) {
          const at = new Date(e.loggedAt);
          if (e?.food?.name && isCaffeinated(e.food.name) && at.getHours() >= 14) cafDays.add(dayKey(d));
        }
      });
      const todayCaf = [...parse<LoggedFood[]>(got.get(kToday), []), ...pending]
        .filter((e) => e?.food?.name && isCaffeinated(e.food.name)).map((e) => ({ name: e.food.name, at: Date.parse(e.loggedAt) }));
      sleep = {
        bedFrom: ins.bedtime.from, bedTo: ins.bedtime.to, caffeineUntil: ins.caffeineUntil,
        drifting: (ins.trendMinPerDay ?? 0) >= 20 || ins.regularity === 'irregular' || ins.regularity === 'algo irregular',
        debtH: ins.debtH,
        plan: snapNow?.sleepPlan && !snapNow.sleepPlan.done ? { title: snapNow.sleepPlan.title, text: snapNow.sleepPlan.text } : null,
        coffeeAfternoon: cafDays.size >= 2,
        lateCaffeineToday: !!lateCaffeine(todayCaf, ins),
      };
    }

    // Eris al timón (T2): las comidas del plan de hoy que faltan, a su hora
    const plan = dayPlanStore.get();
    const mealsOf = (p: typeof plan) => (p ? p.pasos.filter((s) => s.accion.type === 'log_food' && !s.hecho && s.hora != null)
      .map((s) => ({ pasoId: s.id, slot: (s.accion as any).slot as string, hora: s.hora!, titulo: s.titulo, detalle: s.detalle })) : null);
    const planMeals = mealsOf(plan);
    const planMealsTomorrow = mealsOf(dayPlanStore.getTomorrow());
    // ⚡ El día exigente: el café, la siesta-café y los bloques que faltan, a su hora (lo de todo el día no avisa)
    const planCues = plan?.mode === 'rendimiento' ? plan.pasos.filter((s) => s.accion.type === 'cue' && !s.hecho && s.hora != null)
      .map((s) => ({ pasoId: s.id, cue: (s.accion as any).cue as string, hora: s.hora!, titulo: s.titulo, detalle: s.detalle })) : null;

    return {
      now,
      tone: tone ?? DEFAULT_TONE,
      sleep,
      planMeals,
      planMealsTomorrow,
      planCues,
      name: (displayName || '').trim().split(/\s+/)[0] || '',
      settings,
      modules: { nutri: modules.includes('nutri'), forge: modules.includes('toji'), finanzas: modules.includes('finanzas') },
      mealHistory, todayMeals, kcalToday, proteinToday,
      kcalGoal, proteinGoal: goals.proteinGGoal > 0 ? goals.proteinGGoal : null, proteinIsCap: !!goals.proteinIsCap,
      fiberToday, fiberGoal: goals.fiberGGoal > 0 ? goals.fiberGGoal : 28,
      waterToday, waterGoal,
      trainingDays: tr.days || {},
      exerciseDays,
      stepsToday: typeof snapNow?.steps === 'number' ? snapNow.steps : null,
      forgeStreak: tr.streak ? { streak: tr.streak, atStake: tr.lastClaimedDay === yesterday } : null,
      finance,
      // «¿Entrenas hoy?» (Forge 2.0, services/forge/trainingIntent.ts)
      intentToday: (() => { const it = getIntent(); return it ? { answer: it.answer, time: it.time, minutes: it.minutes, phrase: it.label } : null; })(),
      askIntent: await shouldAsk().catch(() => false),
      glucoseCaution: (wsManager.getLastConnectedPayload()?.userProfile?.medical?.medications ?? [])
        .some((m: any) => m?.active !== false && /insulin|glibencl|glimepir|gliclaz|glipiz|daonil|amaryl|diamicron/i.test(`${m?.name ?? ''} ${m?.type ?? ''}`)),
    };
  }
}

export const reminderPlanner = new ReminderPlanner();

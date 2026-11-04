// ============================================================
// Eris Mobile — «¿Entrenas hoy?» (Forge 2.0, F3, 2026-10-17)
//
// La respuesta del día (en Inicio, en Forge, en un aviso o por chat) va al servidor (`set_training_intent`) y desde ahí
// las metas de toda la app pasan a ser «según el día» (DailyTargets): descanso baja, entreno sube con lo que vas a
// gastar. Lo planificado que todavía no hiciste es el «fantasma» de «te quedan X» (llega en `nutrition_today.targets`).
// Lo que se proyecta gastar sale del plan de hoy de Forge con tus últimas cargas (forgeTrain.planProjection), o de una
// actividad con su MET. Forge también le manda al servidor esa proyección (para cuando lo dices por chat).
// Se pregunta solo a quien entrena (decisión del usuario): rutina o plan en Forge, objetivo ganar/recomp, o 4+ días con
// entreno en las últimas 4 semanas.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROFILE_CHANGED_EVENT } from '../ScopedStorage';
import { DeviceEventEmitter } from 'react-native';
import { useEffect, useState } from 'react';
import { wsManager } from '../WebSocketManager';
import { AuthStorage } from '../AuthStorage';
import { ACTIVITY_DAYS_KEY } from '../MetricsService';
import * as T from './forgeTrain';
import { forgeStore } from './forgeStore';
import { routineContext } from './forgeRoutine';
import { progressContext } from './forgeProgress';

export const INTENT_EVENT = 'training_intent_changed';
const INTENT_KEY = 'forge_intent_v1';
const TARGETS_KEY = 'forge_day_targets_v1';
/** Apagar las preguntas del entreno (Perfil → Avisos): «medir sin obsesión» */
export const ASK_OFF_KEY = 'forge_intent_ask_off';

const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Lo del día que manda el servidor con las metas (DailyTargets): el fantasma y la frase. */
export interface DayTargets {
  day: string;
  byDay: 'descanso' | 'entreno' | null;
  kcalGhost: number | null;
  kcalNoGhost: number | null;
  kcalPlanned: number | null;
  intentPhrase: string | null;
  minutesToWorkout: number | null;
}

let intent: T.TrainingIntent | null = null;
let targets: DayTargets | null = null;
// Otra cuenta en el teléfono: nada de la anterior queda en memoria (revisión 2026-10-31, D4)
DeviceEventEmitter.addListener(PROFILE_CHANGED_EVENT, () => { intent = null; targets = null; lastProjection = ''; });
let installed = false;
let lastProjection = '';

const emit = () => DeviceEventEmitter.emit(INTENT_EVENT);

export function getIntent(): T.TrainingIntent | null { return intent && intent.day === todayKey() ? intent : null; }
export function getDayTargets(): DayTargets | null { return targets && targets.day === todayKey() ? targets : null; }

async function persist() {
  await AsyncStorage.multiSet([[INTENT_KEY, JSON.stringify(intent)], [TARGETS_KEY, JSON.stringify(targets)]]).catch(() => {});
}

export function installTrainingIntent() {
  if (installed) return;
  installed = true;
  AsyncStorage.multiGet([INTENT_KEY, TARGETS_KEY]).then((pairs) => {
    try { const v = JSON.parse(pairs[0][1] ?? 'null'); if (v?.day === todayKey()) intent = v; } catch {}
    try { const v = JSON.parse(pairs[1][1] ?? 'null'); if (v?.day === todayKey()) targets = v; } catch {}
    emit();
  }).catch(() => {});
  wsManager.subscribeMessage((d: any) => {
    if (d?.type === 'connected') {
      wsManager.sendMessage({ type: 'get_training_intent' });
      publishProjection(true);
    }
    // Lo dicho por chat («hoy entreno pierna a las 7») o la confirmación de lo respondido acá
    if (d?.type === 'training_intent' && d.ok !== false && typeof d.day === 'string') {
      if (d.day === todayKey()) { intent = d.intent ?? null; persist(); emit(); }
      wsManager.sendMessage({ type: 'sync_nutrition_today' });
    }
    if (d?.type === 'nutrition_today' && d.targets && typeof d.targets === 'object') {
      const t = d.targets;
      targets = {
        day: todayKey(), byDay: t.byDay ?? null, kcalGhost: t.kcalGhost ?? null, kcalNoGhost: t.kcalNoGhost ?? null,
        kcalPlanned: t.kcalPlanned ?? null, intentPhrase: t.intentPhrase ?? null, minutesToWorkout: t.minutesToWorkout ?? null,
      };
      persist(); emit();
    }
  });
  // Forge cambió (plan, series, cargas): la proyección para el chat
  forgeStore.onChange(() => publishProjection());
}

/** Le cuenta al servidor lo que gastaría el plan de hoy y tu sesión típica (para «hoy entreno» por chat). */
function publishProjection(force = false) {
  const s = forgeStore.get();
  if (!s) return;
  // + lo que el chat necesita para armar o ajustar la rutina (equipo, máximos, experiencia y la rutina) y tu progreso
  let progress: ReturnType<typeof progressContext> | null = null;
  try { progress = progressContext(s); } catch {}
  const projection = { day: todayKey(), plan: T.planProjection(s), typical: T.typicalSession(s), routineName: forgeStore.getRoutine()?.name ?? null, ...routineContext(s), progress };
  const key = JSON.stringify(projection);
  if (!force && key === lastProjection) return;
  lastProjection = key;
  if (wsManager.getStatus() === 'connected') wsManager.sendMessage({ type: 'sync_forge_projection', projection });
}

export interface IntentChoice {
  answer: 'si' | 'no';
  kind?: 'rutina' | 'otra';
  activity?: string;
  minutes?: number;
  time?: string;
  label?: string;
  source?: T.TrainingIntent['source'];
}

/** Lo que se proyecta gastar con lo elegido (la rutina con tus cargas, o la actividad por su MET). */
export function projectChoice(c: IntentChoice): { kcal: number; minutes: number; waterMl: number } | null {
  if (c.answer !== 'si') return null;
  const s = forgeStore.get();
  if (c.kind === 'otra' && c.activity) return T.activityProjection(c.activity, c.minutes ?? 60, s?.bodyKg);
  const plan = s ? T.planProjection(s) : null;
  const est = (plan && plan.sets > 0 ? plan : null) ?? (s ? T.typicalSession(s) : null) ?? { kcal: Math.round(4 * 0.0175 * (s?.bodyKg || 70) * 45), minutes: 45 };
  const minutes = c.minutes ?? est.minutes;
  const kcal = c.minutes && est.minutes ? Math.round((est.kcal * c.minutes) / Math.max(1, est.minutes)) : est.kcal;
  return { kcal, minutes, waterMl: Math.round(minutes * 10) };
}

/** Responder «¿entrenas hoy?» (o cambiar la respuesta). null = borrar lo de hoy. */
export async function setIntent(c: IntentChoice | null): Promise<void> {
  const day = todayKey();
  if (!c) {
    intent = null; persist(); emit();
    wsManager.sendMessage({ type: 'set_training_intent', intent: null });
    return;
  }
  const p = projectChoice(c);
  const st = forgeStore.get();
  const routineDay = st?.planDay?.day === day ? st.planDay.name : undefined;
  const raw = { day, answer: c.answer, kind: c.kind, activity: c.activity, label: c.label ?? (c.kind === 'otra' ? T.ACTIVITY_TYPES.find((a) => a.id === c.activity)?.name : routineDay),
    minutes: p?.minutes, time: c.time, kcal: p?.kcal, waterMl: p?.waterMl, source: c.source ?? 'app', at: new Date().toISOString() };
  intent = T.sanitizeIntent(raw, day);
  persist(); emit();
  wsManager.sendMessage({ type: 'set_training_intent', intent });
}

/** ¿Se le pregunta a esta persona? (rutina o plan en Forge, objetivo ganar/recomp, o 4+ días con entreno en 4 semanas) */
export async function shouldAsk(): Promise<boolean> {
  if ((await AsyncStorage.getItem(ASK_OFF_KEY).catch(() => null)) === '1') return false;
  const s = await forgeStore.load().catch(() => null);
  const pid = (await AuthStorage.getCredentials().catch(() => null))?.profileId ?? 'anon';
  let days = 0;
  try {
    const t = JSON.parse((await AsyncStorage.getItem(`eris_forge_training_${pid}`)) ?? 'null');
    const watch = JSON.parse((await AsyncStorage.getItem(ACTIVITY_DAYS_KEY)) ?? '{}');
    const cut = new Date(); cut.setDate(cut.getDate() - 28);
    const cutKey = `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, '0')}-${String(cut.getDate()).padStart(2, '0')}`;
    const set = new Set<string>([...Object.keys(t?.days ?? {}), ...Object.entries(watch).filter(([, m]) => Number(m) >= 20).map(([k]) => k)]);
    days = [...set].filter((k) => k > cutKey).length;
  } catch {}
  return T.shouldAskIntent({ hasRoutine: !!forgeStore.getRoutine(), hasPlan: !!s && Object.keys(s.plan || {}).length > 0, goal: s?.goal ?? null, trainedDays28: days });
}

/** La respuesta de hoy y las metas del día, vivas. */
export function useTrainingIntent(): { intent: T.TrainingIntent | null; targets: DayTargets | null } {
  const [, tick] = useState(0);
  useEffect(() => { const sub = DeviceEventEmitter.addListener(INTENT_EVENT, () => tick((n) => n + 1)); return () => sub.remove(); }, []);
  return { intent: getIntent(), targets: getDayTargets() };
}

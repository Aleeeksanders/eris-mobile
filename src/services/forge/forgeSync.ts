// ============================================================
// Eris Mobile — lo que Forge le cuenta al resto de la app y al servidor (Forge 2.0, F1, 2026-10-17)
//
// Antes vivía en TojiScreen, como respuesta a los mensajes del WebView (TOJI_STATE_SYNC, TOJI_BODY_SYNC…). Ahora es un
// solo lugar que usan las dos versiones: el HTML (mientras no se migre) y Forge nativo (forgeStore.onChange).
//   - el caché para la burbuja y los avisos (series por día, racha) → ReminderPlanner y los cuadros de Métricas;
//   - «entrenó hoy» → el servidor (asesor, puntaje);
//   - los ejercicios personalizados y la rutina → el servidor (TrainingPlanTool);
//   - el cuerpo y el entreno de hoy → el servidor calcula las metas de toda la app (DailyTargets);
//   - el respaldo cifrado en el PC (forgeBackup).
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { wsManager } from '../WebSocketManager';
import { forgeStateCache } from '../ForgeStateCache';
import { PLAN_REFRESH_EVENT } from '../ErisNotifications';
import { onForgeDump, FORGE_RESTORE_APPLY_EVENT, FORGE_RESTORE_DONE_EVENT, type ForgeDump } from '../forgeBackup';
import { AuthStorage } from '../AuthStorage';
import { waterRule, proteinRule } from '../../config/targetRules';
import * as C from './forgeCore';
import { bodySync } from './forgeTrain';
import { sanitizeRoutine, setRoutinePlan } from './forgeRoutine';
import { mergeCustom } from './forgeMdRoutine';
import { forgeStore, type Routine } from './forgeStore';

export const todayKeyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let lastTraining = '';
let lastWorkout = '';
let lastCustom = '';
let lastBody = '';
let lastRoutine = '';

/** El estado completo de Forge cambió (TOJI_STATE_SYNC del HTML, o un cambio en Forge nativo). */
export function publishForgeState(st: any, pid: string | null) {
  forgeStateCache.set(st);
  // Para los avisos de Eris (ReminderPlanner) y Métricas: series por día de las últimas 5 semanas y la racha
  const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 35); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const days: Record<string, number> = {};
  for (const [k, ex] of Object.entries(st?.training || {})) {
    if (k < cutoff) continue;
    const sets = Object.values((ex as Record<string, unknown>) || {}).reduce((a: number, b) => a + (Number(b) || 0), 0);
    if (sets > 0) days[k] = sets;
  }
  // Último día con series: «entrenó hoy» para el servidor (antes solo llegaba al abrir Forge)
  const lastWk = Object.keys(days).sort().pop() ?? '';
  if (lastWk && lastWk !== lastWorkout) {
    lastWorkout = lastWk;
    AsyncStorage.setItem('toji_last_workout', lastWk).catch(() => {});
    if (lastWk === todayKeyLocal()) wsManager.sendMessage({ type: 'update_health_snapshot', snapshot: { trained: true, trainedDay: lastWk } });
  }
  const training = JSON.stringify({ days, streak: st?.streak || 0, bestStreak: st?.bestStreak || 0, lastClaimedDay: st?.lastClaimedDay || null });
  if (pid && training !== lastTraining) {
    lastTraining = training;
    AsyncStorage.setItem(`eris_forge_training_${pid}`, training).then(() => DeviceEventEmitter.emit(PLAN_REFRESH_EVENT)).catch(() => {});
  }
  // El catálogo de ejercicios personalizados: TrainingPlanTool sabe qué existe sin que Forge esté abierto
  const customExercises = st?.customExercises || [];
  const serialized = JSON.stringify(customExercises);
  if (serialized !== lastCustom) {
    lastCustom = serialized;
    wsManager.sendMessage({ type: 'sync_toji_context', customExercises });
  }
}

/** Peso, altura, edad, sexo, actividad y entreno de hoy → el servidor calcula las metas de TODOS los módulos con esto. */
export function publishForgeBody(body: any) {
  const serialized = JSON.stringify(body ?? null);
  if (!body || serialized === lastBody) return;
  lastBody = serialized;
  wsManager.sendMessage({ type: 'sync_body_profile', body });
  AsyncStorage.setItem('eris_body_profile', serialized).catch(() => {});
}

export function publishRoutine(md: string | null, name: string | null) {
  const serialized = JSON.stringify([md, name]);
  if (serialized === lastRoutine) return;
  lastRoutine = serialized;
  wsManager.sendMessage({ type: 'sync_toji_context', routineMd: md, routineName: name });
}

/** Lo que TojiScreen inyectaba en el WebView: reglas del servidor según condiciones y medicamentos. */
export function refreshForgeEnv() {
  const medical = wsManager.getLastConnectedPayload()?.userProfile?.medical;
  const conditions = medical?.conditions ?? [];
  C.L.forgeEnv.isDiabetic = conditions.some((c: any) => c?.id === 'diabetes_t1' || c?.id === 'diabetes_t2' || c?.id === 'prediabetes');
  C.L.forgeEnv.waterRule = waterRule(medical);
  C.L.forgeEnv.proteinRule = proteinRule(medical);
}
export const setWatchDays = (d: Record<string, number>) => { C.L.forgeEnv.watchDays = d || {}; };

import { FORGE_TOAST_EVENT } from './forgeEvents';
export { FORGE_TOAST_EVENT };

let installed = false;
/**
 * Forge nativo conectado al resto: cada cambio se publica y se respalda; lo que Eris arma por chat se aplica al tiro
 * (aunque Forge no esté abierto). Se instala una vez (App). Mientras Forge siga siendo el HTML, no hace nada.
 */
export function installForgeSync() {
  if (installed) return;
  installed = true;
  forgeStore.onChange(async (s: C.ForgeState, routine: Routine) => {
    const pid = (await AuthStorage.getCredentials().catch(() => null))?.profileId ?? null;
    refreshForgeEnv();
    publishForgeState(s, pid);
    publishForgeBody(bodySync(s));
    publishRoutine(routine?.md ?? null, routine?.name ?? null);
    if (pid && pid !== 'anon') {
      const keys = C.toTojiKeys(s, routine);
      onForgeDump({ v: 1, profile: pid, at: new Date().toISOString(), keys });
    }
  });
  // Restaurar un respaldo del PC en Forge nativo (con el HTML lo hace TojiScreen en su WebView)
  DeviceEventEmitter.addListener(FORGE_RESTORE_APPLY_EVENT, async (p: { requestId: string; dump: ForgeDump }) => {
    if (!(await forgeStore.exists())) return;
    try {
      const { state, routine } = C.fromTojiKeys(p.dump.keys);
      await forgeStore.replace(C.rollover(state), 'restaurar', routine);
      DeviceEventEmitter.emit(FORGE_RESTORE_DONE_EVENT, { requestId: p.requestId, ok: true });
    } catch (e: any) {
      DeviceEventEmitter.emit(FORGE_RESTORE_DONE_EVENT, { requestId: p.requestId, ok: false, motivo: String(e?.message ?? e) });
    }
  });
  wsManager.subscribeMessage(async (payload: any) => {
    // La rutina estructurada que armó Eris por chat (training_plan → build_routine / adjust_routine), o tu rutina escrita
    // convertida en plan («carga mi rutina», fase I8): primero los ejercicios propios nuevos, después la rutina que los usa
    if (payload?.type === 'forge_routine') {
      if (!(await forgeStore.exists())) return;
      const md = payload.routine?.source === 'md';
      await forgeStore.update((s) => {
        const s1 = mergeCustom(s, payload.newExercises);
        const r = sanitizeRoutine(s1, payload.routine);
        return r ? setRoutinePlan(s1, { ...r, source: md ? 'md' : 'eris' }) : s;
      }, md ? 'tu rutina como plan' : 'rutina de Eris');
      DeviceEventEmitter.emit(FORGE_TOAST_EVENT, md ? 'TU RUTINA QUEDÓ COMO PLAN ✓' : 'RUTINA DE ERIS LISTA ✓');
      return;
    }
    if (payload?.type !== 'toji_apply_plan' && payload?.type !== 'toji_save_routine') return;
    if (!(await forgeStore.exists())) return; // sigue el HTML: lo maneja TojiScreen (o su cola)
    if (payload.type === 'toji_apply_plan') {
      const data = { dayLabel: payload.dayLabel, exercises: payload.exercises, newExercises: payload.newExercises };
      await forgeStore.update((s) => C.applyPlan(s, data), 'plan de Eris');
      DeviceEventEmitter.emit(FORGE_TOAST_EVENT, data.dayLabel ? `PLAN CARGADO: ${String(data.dayLabel).toUpperCase()} ✓` : 'PLAN CARGADO ✓');
    } else if (payload.md) {
      await forgeStore.setRoutine({ md: String(payload.md), name: String(payload.name || 'Rutina de Eris') });
      DeviceEventEmitter.emit(FORGE_TOAST_EVENT, 'RUTINA GUARDADA POR ERIS ✓');
    }
  });
}

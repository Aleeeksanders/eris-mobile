// ============================================================
// Eris Mobile — sleepStore (Sueño 2.0 · S2, 2026-10-28)
//
// Lo que la persona guarda en la pantalla de Sueño, por cuenta (AsyncStorage pasa por ScopedStorage):
//   - las correcciones (sleepCore.SleepEdits): «no estaba durmiendo» (el reloj marcó el sillón o quedó cargando) y lo que
//     durmió sin el reloj («anotar a mano»). Se aplican en Métricas, en el resumen que va al servidor y en la pantalla;
//   - el plan de mejora en curso (una meta por 2 semanas);
//   - «sin números» (medir sin obsesión): la pantalla muestra palabras y barras, sin horas ni porcentajes.
// Cada cambio en las correcciones (y en el plan) avisa con SLEEP_EDITS_EVENT: App vuelve a leer el día y se lo manda al servidor.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import type { SleepEdits, SleepPlan, WakeDecision, WakeDecisions } from './sleepCore';

export const SLEEP_EDITS_KEY = 'eris_sleep_edits_v1';
export const SLEEP_PLAN_KEY = 'eris_sleep_plan_v1';
export const SLEEP_NO_NUMBERS_KEY = 'eris_sleep_sin_numeros';
export const SLEEP_EDITS_EVENT = 'ERIS_SLEEP_EDITS_CHANGED';

const EMPTY: SleepEdits = { excluded: [], manual: [] };
const ok = (x: any) => x && typeof x.start === 'number' && typeof x.end === 'number' && x.end > x.start;

export async function loadSleepEdits(): Promise<SleepEdits> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(SLEEP_EDITS_KEY)) || 'null');
    const decisions: WakeDecisions = {};
    for (const [k, d] of Object.entries(v?.decisions ?? {})) if (d === 'dormir' || d === 'partir') decisions[k] = d;
    return { excluded: Array.isArray(v?.excluded) ? v.excluded.filter(ok) : [], manual: Array.isArray(v?.manual) ? v.manual.filter(ok) : [], decisions };
  } catch { return { ...EMPTY }; }
}

async function saveSleepEdits(e: SleepEdits): Promise<void> {
  // Solo 60 días hacia atrás: lo antiguo ya no se muestra
  const from = Date.now() - 60 * 86_400_000;
  const decisions = Object.fromEntries(Object.entries(e.decisions ?? {}).filter(([k]) => Date.parse(k) > from));
  const keep = { excluded: e.excluded.filter((x) => x.end > from), manual: e.manual.filter((x) => x.end > from), decisions };
  await AsyncStorage.setItem(SLEEP_EDITS_KEY, JSON.stringify(keep));
  DeviceEventEmitter.emit(SLEEP_EDITS_EVENT);
}

/** «No estaba durmiendo»: ese tramo deja de contar (y si era uno anotado a mano, se borra) */
export async function excludeSleep(start: number, end: number): Promise<void> {
  const e = await loadSleepEdits();
  const manual = e.manual.filter((m) => !(m.start < end && m.end > start));
  const wasManual = manual.length !== e.manual.length;
  await saveSleepEdits({ ...e, excluded: wasManual ? e.excluded : [...e.excluded, { start, end }], manual });
}

/** «Anotar a mano»: un tramo que el reloj no registró */
export async function addManualSleep(start: number, end: number): Promise<void> {
  const e = await loadSleepEdits();
  if (e.manual.some((m) => m.start === start && m.end === end)) return; // el mismo tramo dos veces (la app y el chat)
  await saveSleepEdits({ ...e, manual: [...e.manual, { start, end }] });
}

/** Lo que respondiste a «¿Cómo sigues?» tras un sueño largo a hora rara */
export async function saveWakeDecision(endIso: string, choice: WakeDecision): Promise<void> {
  const e = await loadSleepEdits();
  await saveSleepEdits({ ...e, decisions: { ...(e.decisions ?? {}), [endIso]: choice } });
}

/** Deshacer las correcciones de un día (las que tocan ese rango) */
export async function clearSleepEdits(from: number, to: number): Promise<void> {
  const e = await loadSleepEdits();
  const decisions = Object.fromEntries(Object.entries(e.decisions ?? {}).filter(([k]) => { const t = Date.parse(k); return !(t > from && t <= to); }));
  await saveSleepEdits({ excluded: e.excluded.filter((x) => !(x.start < to && x.end > from)), manual: e.manual.filter((x) => !(x.start < to && x.end > from)), decisions });
}

export async function loadSleepPlan(): Promise<SleepPlan | null> {
  try { const p = JSON.parse((await AsyncStorage.getItem(SLEEP_PLAN_KEY)) || 'null'); return p && typeof p.kind === 'string' && typeof p.start === 'string' ? p : null; } catch { return null; }
}
export async function saveSleepPlan(p: SleepPlan | null): Promise<void> {
  if (p) await AsyncStorage.setItem(SLEEP_PLAN_KEY, JSON.stringify(p)); else await AsyncStorage.removeItem(SLEEP_PLAN_KEY);
  DeviceEventEmitter.emit(SLEEP_EDITS_EVENT); // el plan va en el snapshot: Eris lo sabe en el chat y en la semana (S3)
}

export async function loadNoNumbers(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(SLEEP_NO_NUMBERS_KEY)) === '1'; } catch { return false; }
}
export async function saveNoNumbers(v: boolean): Promise<void> {
  await AsyncStorage.setItem(SLEEP_NO_NUMBERS_KEY, v ? '1' : '0');
}

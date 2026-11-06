// Forge — la barra de descanso y el cronómetro (2026-11-05). Se anota al TERMINAR la serie: el descanso parte al anotar, y
// entre dos anotaciones está el descanso MÁS la serie nueva. «A mí me sirve esperar de 120 a 150 s en algunos casos».
process.env.TZ = "America/Santiago";
import { test, expect, mock, beforeEach } from "bun:test";
const store: Record<string, string> = {};
mock.module("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (k: string) => store[k] ?? null, setItem: async (k: string, v: string) => { store[k] = v; }, removeItem: async (k: string) => { delete store[k]; },
  multiGet: async (ks: string[]) => ks.map((k) => [k, store[k] ?? null]), multiSet: async (kv: [string, string][]) => { for (const [k, v] of kv) store[k] = v; },
  multiRemove: async (ks: string[]) => { for (const k of ks) delete store[k]; }, getAllKeys: async () => Object.keys(store), mergeItem: async () => {}, clear: async () => {},
} }));
mock.module("C:/Proyectos/eris-mobile/src/services/ScopedStorage.ts", () => ({ PROFILE_CHANGED_EVENT: "perfil" }));
const vibrado: any[] = [];
mock.module("react-native", () => ({
  AppState: { currentState: "active" }, Vibration: { vibrate: (p: any) => vibrado.push(p) },
  DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove() {} }) }, Platform: { OS: "android", select: (o: any) => o.android ?? o.default },
}));
mock.module("C:/Proyectos/eris-mobile/src/services/WebSocketManager.ts", () => ({ wsManager: { getStatus: () => "disconnected", sendMessage: () => {}, subscribeMessage: () => () => {} } }));
const updates: any[] = [];
mock.module("C:/Proyectos/eris-mobile/src/services/forge/forgeStore.ts", () => ({ forgeStore: { update: async (fn: any, why: string) => { updates.push({ fn, why }); return null; } } }));

const C = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts");
const T = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeTrain.ts");
const { restTimer, REST_HOLD_MS } = await import("C:/Proyectos/eris-mobile/src/services/forge/restTimer.ts");
const { defaultGym } = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeCatalog.ts");

const tk = C.L.todayKey();
const base = () => { const s = C.newState(); s.bodyKg = 80; s.sex = "h"; s.age = 30; s.heightCm = 175; s.gym = defaultGym("smartfit"); return s; };
const cat = (s: any) => C.catalog(s);
const alarma = { programadas: [] as number[], canceladas: 0 };
restTimer.alarm = { schedule: (at: number) => { alarma.programadas.push(at); }, cancel: () => { alarma.canceladas++; }, goal: () => {}, cancelGoal: () => {} };
beforeEach(() => { restTimer.stop(); vibrado.length = 0; updates.length = 0; alarma.programadas.length = 0; alarma.canceladas = 0; });

test("cuánto descansar: la regla según el esfuerzo, 30 s más en los ejercicios grandes; calentamiento 45; cardio sin descanso", () => {
  const s = base();
  const banca = cat(s).press_banca, maquina = cat(s).press_pecho_maq;
  expect(banca.big).toBe(true);
  expect(T.restTarget(s, banca, { reps: 8, rir: 0 })).toBe(150); // grande al fallo: sus 120–150 s
  expect(T.restTarget(s, banca, { reps: 8, rir: 2 })).toBe(120);
  expect(T.restTarget(s, maquina, { reps: 12, rir: 1 })).toBe(90);
  expect(T.restTarget(s, banca, { reps: 10, warmup: true })).toBe(45);
  const cardio = Object.values(cat(s)).find((e: any) => e.eq === "cardio") as any;
  expect(T.restTarget(s, cardio, { reps: 20 })).toBe(0);
});

test("lo que dejas para un ejercicio se recuerda (solo ese) y manda sobre la regla; el calentamiento no cambia", () => {
  let s = base();
  const maquina = cat(s).press_pecho_maq, banca = cat(s).press_banca;
  s = T.setRestPref(s, maquina.id, 137);
  expect(s.restPrefs![maquina.id]).toBe(135); // de 5 en 5
  expect(T.restTarget(s, maquina, { reps: 12, rir: 3 })).toBe(135);
  expect(T.restTarget(s, banca, { reps: 8, rir: 2 })).toBe(120);
  expect(T.restTarget(s, maquina, { reps: 10, warmup: true })).toBe(45);
  expect(T.setRestPref(s, maquina.id, 9999).restPrefs![maquina.id]).toBe(600);
  expect(T.setRestPref(s, maquina.id, 1).restPrefs![maquina.id]).toBe(15);
});

test("el descanso medido: entre dos anotaciones se le resta lo que duró la serie nueva", () => {
  const ahora = C.L.forgeNow().getTime();
  let s = base();
  const banca = cat(s).press_banca;
  s = C.logSet(s, tk, "press_banca", { reps: 8, kg: 60, rir: 2, at: ahora - 174_000 }); // 2:54 antes
  // 8 reps ≈ 24 s de serie → 150 s de descanso
  expect(T.withMeasuredRest(s, tk, banca, { reps: 8, kg: 60, rir: 2 }, ahora).rest).toBe(150);
  // Anotar seguido no es descanso; irse a otra cosa tampoco
  expect(T.withMeasuredRest(s, tk, banca, { reps: 8, kg: 60 }, ahora - 170_000).rest).toBeUndefined();
  expect(T.withMeasuredRest(s, tk, banca, { reps: 8, kg: 60 }, ahora + 30 * 60_000).rest).toBeUndefined();
  // Primera serie del día y día pasado: nada que medir; «Repetir» no arrastra el descanso de la serie copiada
  expect(T.withMeasuredRest(base(), tk, banca, { reps: 8 }, ahora).rest).toBeUndefined();
  expect(T.withMeasuredRest(s, "2020-01-01", banca, { reps: 8, rest: 99 }, ahora).rest).toBeUndefined();
});

test("el descanso medido cuenta en el gasto en vez del supuesto", () => {
  const s = base();
  const banca = cat(s).press_banca;
  expect(T.setMinutes(banca, { reps: 8, rir: 2, rest: 150 })).toBeCloseTo((24 + 150) / 60, 5);
  expect(T.setMinutes(banca, { reps: 8, rir: 2 })).toBeCloseTo((24 + 90) / 60, 5); // sin medir: igual que antes
});

test("qué sigue: otra serie con su carga, el próximo del plan, o fin", () => {
  let s = base();
  s = { ...s, plan: { press_pecho_maq: 2, press_banca: 1 } };
  s = C.logSet(s, tk, "press_pecho_maq", { reps: 12, kg: 110, unit: "lb", rir: 1 });
  expect(T.nextAfterSet(s, tk, "press_pecho_maq")).toEqual({ text: "Serie 2 de 2 · 110 lb × 12", fin: false });
  s = C.logSet(s, tk, "press_pecho_maq", { reps: 11, kg: 110, unit: "lb", rir: 1 });
  expect(T.nextAfterSet(s, tk, "press_pecho_maq").text).toBe("Sigue: " + cat(s).press_banca.name);
  s = C.logSet(s, tk, "press_banca", { reps: 8, kg: 60, rir: 2 });
  expect(T.nextAfterSet(s, tk, "press_banca")).toEqual({ text: "Plan de hoy listo", fin: true });
  // Sin plan
  let l = C.logSet(base(), tk, "press_banca", { reps: 8, kg: 60, rir: 2 });
  expect(T.nextAfterSet(l, tk, "press_banca").text).toBe("Otra serie: 60 kg × 8");
});

test("el cronómetro: objetivo de la rutina o tu última marca", () => {
  let s = base();
  const ex: any = Object.values(cat(s)).find((e: any) => e.unit === "seg");
  expect(T.timedGoal(s, tk, ex)).toBeNull();
  s = C.logSet(s, tk, ex.id, { reps: 45 });
  expect(T.timedGoal(s, tk, ex)).toEqual({ secs: 45, label: "Tu última" });
  s = { ...s, planDay: { day: tk, id: "", name: "x", targets: { [ex.id]: { exId: ex.id, sets: 3, repMin: 60, repMax: 60, rir: 2 } } } } as any;
  expect(T.timedGoal(s, tk, ex)).toEqual({ secs: 60, label: "Objetivo" });
});

test("la barra: parte al anotar con el descanso de ese ejercicio y programa el aviso; hoy nomás; sin barra si terminaste el plan", () => {
  let s = base();
  const banca = cat(s).press_banca;
  s = C.logSet(s, tk, "press_banca", { reps: 8, kg: 60, rir: 0 });
  const antes = Date.now();
  restTimer.afterSet(s, tk, banca, { reps: 8, kg: 60, rir: 0 });
  const st = restTimer.get()!;
  expect(st.total).toBe(150);
  expect(st.endAt).toBeGreaterThanOrEqual(antes + 150_000);
  expect(st.next).toBe("Otra serie: 60 kg × 8");
  expect(alarma.programadas).toEqual([st.endAt]);
  restTimer.stop();
  expect(alarma.canceladas).toBe(1);
  // Corrigiendo un día pasado no parte nada
  restTimer.afterSet(s, "2020-01-01", banca, { reps: 8, rir: 0 });
  expect(restTimer.get()).toBeNull();
  // Última serie del plan: nada que descansar
  s = { ...s, plan: { press_banca: 1 } };
  restTimer.afterSet(s, tk, banca, { reps: 8, kg: 60, rir: 0 });
  expect(restTimer.get()).toBeNull();
});

test("−15/+15: mueve el término, reprograma el aviso y queda guardado para ese ejercicio (no en un calentamiento)", async () => {
  restTimer.start({ secs: 120, exId: "press_banca", exName: "Press de banca", next: "x" });
  const fin0 = restTimer.get()!.endAt;
  restTimer.adjust(15); restTimer.adjust(15);
  expect(restTimer.get()!.total).toBe(150);
  expect(restTimer.get()!.endAt).toBe(fin0 + 30_000);
  expect(alarma.programadas.length).toBe(3);
  expect(updates.length).toBe(0); // se guarda junto, no en cada toque
  restTimer.stop();
  expect(updates.length).toBe(1);
  const guardado = updates[0].fn(base());
  expect(guardado.restPrefs.press_banca).toBe(150);
  updates.length = 0;
  restTimer.start({ secs: 45, exId: "press_banca", exName: "Press de banca", next: "x", warmup: true });
  restTimer.adjust(15);
  restTimer.stop();
  expect(updates.length).toBe(0);
});

test("al acabarse: vibra una vez, muestra «te toca», NO cuenta hacia arriba y se va solo", async () => {
  restTimer.start({ secs: 15, exId: "a", exName: "A", next: "Serie 2" });
  restTimer.adjust(-15); // el mínimo es 15: no se puede acortar más
  expect(restTimer.get()!.ended).toBe(false);
  // Sobrevive a cerrar la app: guardado con la hora de término
  const guardado = JSON.parse(store.forge_rest_timer_v1);
  expect(guardado.endAt).toBe(restTimer.get()!.endAt);
  // Se acabó hace 1 s (la app seguía abierta)
  (restTimer as any).state = { ...restTimer.get()!, endAt: Date.now() - 1000 };
  (restTimer as any).finish();
  expect(restTimer.get()!.ended).toBe(true);
  expect(vibrado.length).toBe(1);
  restTimer.adjust(15); // ya no se ajusta
  expect(restTimer.get()!.total).toBe(15);
});

test("al volver tarde a la app: no vibra a destiempo; si ya pasó harto, ni aparece", async () => {
  store.forge_rest_timer_v1 = JSON.stringify({ endAt: Date.now() - 8000, total: 90, exId: "a", exName: "A", next: "x", warmup: false, ended: false });
  await restTimer.restore();
  expect(restTimer.get()!.ended).toBe(true);
  expect(vibrado.length).toBe(0);
  restTimer.stop();
  store.forge_rest_timer_v1 = JSON.stringify({ endAt: Date.now() - REST_HOLD_MS - 1000, total: 90, exId: "a", exName: "A", next: "x", warmup: false, ended: false });
  await restTimer.restore();
  expect(restTimer.get()).toBeNull();
  // Aún corriendo: sigue con la misma hora de término
  const fin = Date.now() + 60_000;
  store.forge_rest_timer_v1 = JSON.stringify({ endAt: fin, total: 90, exId: "a", exName: "A", next: "x", warmup: false, ended: false });
  await restTimer.restore();
  expect(restTimer.get()!.endAt).toBe(fin);
});

// Forge — serie con remate, ejercicios unidos y descanso entre ejercicios (2026-11-06). «Hago pronas hasta el fallo y las que me
// quedan les doy con negativas, y puede que no solo en este ejercicio»: es UNA serie, con un solo descanso, y las negativas
// suman al trabajo pero no inflan la fuerza. Evidencia: AXS/25 Laboratorio e I+D/Series con Remate y Descansos.
process.env.TZ = "America/Santiago";
import { test, expect, mock, beforeEach } from "bun:test";
const store: Record<string, string> = {};
mock.module("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (k: string) => store[k] ?? null, setItem: async (k: string, v: string) => { store[k] = v; }, removeItem: async (k: string) => { delete store[k]; },
  multiGet: async (ks: string[]) => ks.map((k) => [k, store[k] ?? null]), multiSet: async (kv: [string, string][]) => { for (const [k, v] of kv) store[k] = v; },
  multiRemove: async (ks: string[]) => { for (const k of ks) delete store[k]; }, getAllKeys: async () => Object.keys(store), mergeItem: async () => {}, clear: async () => {},
} }));
mock.module("C:/Proyectos/eris-mobile/src/services/ScopedStorage.ts", () => ({ PROFILE_CHANGED_EVENT: "perfil" }));
mock.module("react-native", () => ({
  AppState: { currentState: "active" }, Vibration: { vibrate: () => {} },
  DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove() {} }) }, Platform: { OS: "android", select: (o: any) => o.android ?? o.default },
}));
mock.module("C:/Proyectos/eris-mobile/src/services/WebSocketManager.ts", () => ({ wsManager: { getStatus: () => "disconnected", sendMessage: () => {}, subscribeMessage: () => () => {} } }));
const updates: any[] = [];
mock.module("C:/Proyectos/eris-mobile/src/services/forge/forgeStore.ts", () => ({ forgeStore: { update: async (fn: any, why: string) => { updates.push({ fn, why }); return null; } } }));

const C = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts");
const T = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeTrain.ts");
const Str = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeStrength.ts");
const Pr = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeProgress.ts");
const Rc = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeRecovery.ts");
const R = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeRoutine.ts");
const { restTimer } = await import("C:/Proyectos/eris-mobile/src/services/forge/restTimer.ts");
const { defaultGym } = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeCatalog.ts");

const tk = C.L.todayKey();
const base = () => { const s = C.newState(); s.bodyKg = 80; s.sex = "h"; s.age = 30; s.heightCm = 175; s.gym = defaultGym("smartfit"); return s; };
const cat = (s: any) => C.catalog(s);
const remate = (reps: number, neg: number) => ({ reps, rir: 0, tail: { kind: "neg" as const, reps: neg } });
const hace = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
beforeEach(() => { restTimer.stop(); updates.length = 0; });

test("cómo se lee: «6 + 4 negativas», sin el «× 3» suelto que confundía en la barra", () => {
  let s = base();
  s = { ...s, plan: { dom_prona: 3 } };
  s = C.logSet(s, tk, "dom_prona", remate(6, 4));
  expect(T.nextAfterSet(s, tk, "dom_prona").text).toBe("Serie 2 de 3 · 6 + 4 neg.");
  let b = { ...base(), plan: { dom_prona: 3 } };
  b = C.logSet(b, tk, "dom_prona", { reps: 3, rir: 0 });
  expect(T.nextAfterSet(b, tk, "dom_prona").text).toBe("Serie 2 de 3 · 3 reps");
  expect(C.tailText({ kind: "neg", reps: 1 })).toBe("1 negativa");
});

test("la fuerza y los récords salen solo de lo estricto: las negativas no inflan el máximo", () => {
  const conRemate = C.logSet(base(), tk, "press_banca", { reps: 8, kg: 60, rir: 0, tail: { kind: "neg", reps: 5 } });
  const sinRemate = C.logSet(base(), tk, "press_banca", { reps: 8, kg: 60, rir: 0 });
  expect(T.bestE1rm(conRemate, "press_banca")).toBe(T.bestE1rm(sinRemate, "press_banca"));
  expect(Pr.exerciseHistory(conRemate, "press_banca")[0].maxReps).toBe(8);
  // El volumen sí suma el remate
  expect(Pr.exerciseHistory(conRemate, "press_banca")[0].volume).toBe(Pr.exerciseHistory(sinRemate, "press_banca")[0].volume + 5 * 60);
});

test("el volumen de la semana: una serie con remate vale 1,5; con 1 o 2 reps de remate, 1", () => {
  let s = C.logSet(base(), tk, "dom_prona", remate(6, 4));
  expect(Str.weeklySets(s).dorsal).toBe(1.5);
  s = C.logSet(s, tk, "dom_prona", remate(4, 2));
  expect(Str.weeklySets(s).dorsal).toBe(2.5);
  expect(Str.weeklySets(s).biceps).toBe(1.5); // secundario: la mitad (1,25), redondeada a medias series
  // Antes, en dos líneas, contaba 2 por ronda
  let d = C.logSet(base(), tk, "dom_prona", { reps: 6, rir: 0 });
  d = C.logSet(d, tk, "dom_negativa", { reps: 4, rir: 2 });
  expect(Str.weeklySets(d).dorsal).toBe(2);
});

test("calorías: las negativas casi no suman, y juntar no cuenta un descanso que no existió", () => {
  const s = base();
  const prona = cat(s).dom_prona;
  const sola = T.setKcal(s, prona, { reps: 6, rir: 0, rest: 150 });
  const conNeg = T.setKcal(s, prona, { reps: 6, rir: 0, rest: 150, tail: { kind: "neg", reps: 4 } });
  const conPausa = T.setKcal(s, prona, { reps: 6, rir: 0, rest: 150, tail: { kind: "pausa", reps: 4 } });
  expect(conNeg).toBeGreaterThan(sola);
  expect(conNeg - sola).toBeLessThan(1);
  expect(conPausa - sola).toBeGreaterThan(conNeg - sola);
  // El tiempo real sí cuenta entero: 18 s + 4 × 4 s
  expect(T.setWorkSeconds(prona, { reps: 6, tail: { kind: "neg", reps: 4 } })).toBe(34);
});

test("descanso: una serie con remate descansa 1 minuto más; lo que dejaste para el ejercicio manda", () => {
  let s = base();
  const banca = cat(s).press_banca;
  expect(T.restTarget(s, banca, { reps: 8, rir: 0, tail: { kind: "neg", reps: 3 } })).toBe(210);
  s = T.setRestPref(s, "press_banca", 300);
  expect(T.restTarget(s, banca, { reps: 8, rir: 0, tail: { kind: "neg", reps: 3 } })).toBe(300);
});

test("el descanso medido resta también el remate", () => {
  const ahora = C.L.forgeNow().getTime();
  let s = base();
  const prona = cat(s).dom_prona;
  s = C.logSet(s, tk, "dom_prona", { ...remate(6, 4), at: ahora - 184_000 });
  expect(T.withMeasuredRest(s, tk, prona, remate(4, 6), ahora).rest).toBe(150); // 184 − (12 + 24) = 148, de 5 en 5
});

test("recuperación: una serie con remate pesa como dos y cuenta como al fallo; juntar no vuelve más suave la estimación", () => {
  let s = base();
  for (let i = 0; i < 2; i++) s = C.logSet(s, hace(10 + i), "dom_prona", { reps: 8, rir: 2 });
  s = C.logSet(s, hace(1), "dom_negativa", { reps: 4, rir: 2 }); // ya hay costumbre de negativas
  const r0 = Rc.muscleRecovery(s, "dorsal");
  let t = C.logSet(s, tk, "dom_prona", { reps: 6, rir: 3, tail: { kind: "neg", reps: 4 } });
  t = C.logSet(t, tk, "dom_prona", { reps: 4, rir: 3, tail: { kind: "neg", reps: 6 } });
  const r = Rc.muscleRecovery(t, "dorsal");
  expect(r.sets).toBe(2); // lo que se muestra: las series de verdad
  expect(r.fallo).toBe(1);
  expect(r0.lastDay).toBe(hace(1));
  // Tres rondas con remate = las mismas 48–72 h que tenían las seis líneas de antes
  const tres = C.logSet(t, tk, "dom_prona", { reps: 2, rir: 0, tail: { kind: "neg", reps: 8 } });
  expect(Rc.muscleRecovery(tres, "dorsal").range).toEqual([48, 72]);
});

test("recuperación: negativas sin costumbre (6 semanas sin hacerlas) suben el máximo; con costumbre no", () => {
  let s = base();
  for (const n of [5, 10, 15]) s = C.logSet(s, hace(n), "dom_prona", { reps: 8, rir: 2 });
  const nuevas = C.logSet(s, tk, "dom_prona", remate(6, 4));
  expect(Rc.muscleRecovery(nuevas, "dorsal").habitual).toBe(false);
  const conCostumbre = C.logSet(C.logSet(s, hace(5), "dom_negativa", { reps: 4, rir: 2 }), tk, "dom_prona", remate(6, 4));
  expect(Rc.muscleRecovery(conCostumbre, "dorsal").habitual).toBe(true);
});

test("el paso del árbol «5 negativas» también se cumple con las del remate", () => {
  const s = C.logSet(base(), tk, "dom_prona", remate(3, 5));
  const res = Str.applyAutoSkills(s);
  expect(res.checked.some((c: any) => c.skill === "s_pull" && c.step === 0)).toBe(true);
  const poco = Str.applyAutoSkills(C.logSet(base(), tk, "dom_prona", remate(3, 4)));
  expect(poco.checked.some((c: any) => c.skill === "s_pull" && c.step === 0)).toBe(false);
});

test("juntar pronas y negativas: una línea, el descanso guardado pasa a la principal y no vuelve al cargar la rutina", () => {
  let s = base();
  s = { ...s, plan: { dom_prona: 3, dom_negativa: 3, remo_db: 3 }, restPrefs: { dom_negativa: 300 } };
  expect(C.joinOffer(s)).toEqual({ main: "dom_prona", tail: "dom_negativa" });
  s = C.joinAsTail(s, "dom_prona", "dom_negativa");
  expect(s.plan).toEqual({ dom_prona: 3, remo_db: 3 });
  expect(s.restPrefs!.dom_prona).toBe(300);
  expect(s.tailPlan!.dom_prona).toEqual({ kind: "neg", replaces: "dom_negativa" });
  expect(C.joinOffer(s)).toBeNull();
  // La rutina escrita las trae en dos líneas: no reaparece la segunda
  const r: any = { name: "x", days: [{ id: "a", name: "Tirón", items: [{ exId: "dom_prona", sets: 3, repMin: 1, repMax: 6 }, { exId: "dom_negativa", sets: 3, repMin: 3, repMax: 7 }] }] };
  const p = R.planFromRoutine(s, r, r.days[0]);
  expect(Object.keys(p.plan)).toEqual(["dom_prona"]);
  expect(p.targets.dom_negativa).toBeUndefined();
  // Repetir un día de cuando iban separadas: tampoco
  let d = C.logSet(s, hace(2), "dom_prona", { reps: 5, rir: 0 });
  d = C.logSet(d, hace(2), "dom_negativa", { reps: 3, rir: 3 });
  expect(Object.keys(R.repeatDay(d, hace(2)).plan)).toEqual(["dom_prona"]);
  // Se puede deshacer, y ya no se vuelve a ofrecer
  const sep = C.splitTail(s, "dom_prona");
  expect(sep.plan.dom_negativa).toBe(3);
  expect(C.joinOffer(sep)).toBeNull();
});

test("«ahora no» no se vuelve a ofrecer", () => {
  const s = { ...base(), plan: { dom_prona: 3, dom_negativa: 3 } };
  expect(C.joinOffer(C.dismissJoin(s, "dom_prona"))).toBeNull();
});

test("tu avance: junta lo de antes (dos líneas) con lo nuevo (remate)", () => {
  let s = base();
  for (const [i, [a, b]] of [[3, 5], [2, 6], [1, 7]].entries()) { void i; s = C.logSet(s, hace(17), "dom_prona", { reps: a, rir: 0 }); s = C.logSet(s, hace(17), "dom_negativa", { reps: b, rir: 3 }); }
  for (const [a, b] of [[5, 3], [3, 5], [1, 7]]) { s = C.logSet(s, hace(9), "dom_prona", { reps: a, rir: 0 }); s = C.logSet(s, hace(9), "dom_negativa", { reps: b, rir: 3 }); }
  for (const [a, b] of [[6, 4], [4, 6], [2, 8]]) s = C.logSet(s, tk, "dom_prona", remate(a, b));
  expect(T.tailHistory(s, "dom_prona").length).toBe(3);
  expect(T.tailLine(s, "dom_prona")).toBe("Estrictas en la primera ronda: 3 → 5 → 6 · Total por ronda: 8 → 8 → 10");
  // Sin remates, nada que mostrar
  expect(T.tailLine(C.logSet(base(), tk, "dom_prona", { reps: 6, rir: 1 }), "dom_prona")).toBeNull();
});

test("ejercicios unidos: «Sigue, sin descanso» hasta terminar la ronda; ahí recién descansas", () => {
  let s = base();
  s = { ...s, plan: { press_banca: 2, dips_ej: 2, remo_db: 1 } };
  s = C.toggleLink(s, "press_banca", "dips_ej");
  expect(C.linkChain(s, "dips_ej")).toEqual(["press_banca", "dips_ej"]);
  const nombre = cat(s).dips_ej.name;
  s = C.logSet(s, tk, "press_banca", { reps: 8, kg: 60, rir: 1 });
  const a = T.afterSetPlan(s, tk, cat(s).press_banca, { reps: 8, kg: 60, rir: 1 });
  expect(a).toEqual({ secs: T.LINK_SECS, text: `Sigue: ${nombre}, sin descanso`, fin: false, kind: "enlace", saveAs: null });
  s = C.logSet(s, tk, "dips_ej", { reps: 8, rir: 1 });
  const b = T.afterSetPlan(s, tk, cat(s).dips_ej, { reps: 8, rir: 1 });
  expect(b.kind).toBe("serie");
  expect(b.text).toBe(`Ronda 2: ${cat(s).press_banca.name}`);
  expect(b.secs).toBeGreaterThanOrEqual(90);
  expect(b.saveAs).toBe("press_banca");
  // Terminadas las rondas, cambio de ejercicio
  s = C.logSet(C.logSet(s, tk, "press_banca", { reps: 8, kg: 60, rir: 1 }), tk, "dips_ej", { reps: 8, rir: 1 });
  expect(T.afterSetPlan(s, tk, cat(s).dips_ej, { reps: 8, rir: 1 }).kind).toBe("cambio");
  // Separarlos, y un unido fuera del plan no cuenta
  expect(C.linkChain(C.toggleLink(s, "press_banca", "dips_ej"), "dips_ej")).toEqual(["dips_ej"]);
  expect(C.linkChain({ ...s, plan: { press_banca: 2 } }, "press_banca")).toEqual(["press_banca"]);
});

test("entre ejercicios: su propio descanso; con músculos en común 3 min, si no 2; lo que dejes manda", () => {
  let s = base();
  s = { ...s, plan: { press_banca: 1, remo_db: 1, press_pecho_maq: 1 } };
  const banca = cat(s).press_banca;
  expect(T.betweenRest(s, banca, cat(s).remo_db)).toBe(120);
  expect(T.betweenRest(s, banca, cat(s).press_pecho_maq)).toBe(180);
  s = C.logSet(s, tk, "press_banca", { reps: 8, kg: 60, rir: 0 });
  const a = T.afterSetPlan(s, tk, banca, { reps: 8, kg: 60, rir: 0 });
  expect(a.kind).toBe("cambio");
  expect(a.saveAs).toBe(T.BETWEEN_KEY);
  expect(a.secs).toBe(120);
  const cinco = T.setRestPref(s, T.BETWEEN_KEY, 300);
  expect(T.afterSetPlan(cinco, tk, banca, { reps: 8, kg: 60, rir: 0 }).secs).toBe(300);
  // No toca el descanso entre series de ese ejercicio
  expect(T.restTarget(cinco, banca, { reps: 8, rir: 0 })).toBe(150);
});

test("la barra: lo que ajustas entre ejercicios queda en «entre ejercicios», no en el ejercicio", () => {
  let s = { ...base(), plan: { press_banca: 1, remo_db: 1 } };
  s = C.logSet(s, tk, "press_banca", { reps: 8, kg: 60, rir: 0 });
  restTimer.afterSet(s, tk, cat(s).press_banca, { reps: 8, kg: 60, rir: 0 });
  expect(restTimer.get()!.kind).toBe("cambio");
  restTimer.adjust(15);
  restTimer.stop();
  const g = updates[0].fn(base());
  expect(g.restPrefs[T.BETWEEN_KEY]).toBe(135);
  expect(g.restPrefs.press_banca).toBeUndefined();
});

test("la barra de ejercicios unidos no guarda nada", () => {
  let s: any = { ...base(), plan: { press_banca: 1, dips_ej: 1 } };
  s = C.toggleLink(s, "press_banca", "dips_ej");
  s = C.logSet(s, tk, "press_banca", { reps: 8, kg: 60, rir: 0 });
  restTimer.afterSet(s, tk, cat(s).press_banca, { reps: 8, kg: 60, rir: 0 });
  expect(restTimer.get()!.kind).toBe("enlace");
  restTimer.adjust(15);
  restTimer.stop();
  expect(updates.length).toBe(0);
});

test("tus descansos reales: entre series y entre ejercicios; pronas → negativas no es descanso", () => {
  const dia = new Date(); dia.setHours(10, 0, 0, 0);
  const t0 = dia.getTime();
  let s = base();
  const min = (m: number) => t0 + m * 60_000;
  s = C.logSet(s, tk, "dom_prona", { reps: 5, rir: 0, at: min(0) });
  s = C.logSet(s, tk, "dom_negativa", { reps: 3, rir: 3, at: min(0.5) }); // seguido
  s = C.logSet(s, tk, "dom_prona", { reps: 3, rir: 0, at: min(3) });      // ~2:30 → entre series
  s = C.logSet(s, tk, "dom_negativa", { reps: 5, rir: 3, at: min(3.5) });
  s = C.logSet(s, tk, "remo_db", { reps: 10, kg: 20, rir: 1, at: min(10.5) }); // 7 min → entre ejercicios
  s = C.logSet(s, tk, "remo_db", { reps: 10, kg: 20, rir: 1, at: min(13.5) });
  const r = T.restStats(s, 60, new Date(min(20)));
  expect(r.between.n).toBe(1);
  expect(r.between.med).toBe(390); // 7 min menos los 30 s de la serie
  expect(r.sets.n).toBe(2);
});

// forgeTrain (F3): gasto según la carga, 1RM estimado, proyección del plan, fantasma y metas según el día.
import { test, expect } from "bun:test";
import * as C from "C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts";
import * as T from "C:/Proyectos/eris-mobile/src/services/forge/forgeTrain.ts";
const L = C.L;

const base = () => { const s = C.newState(); s.bodyKg = 85; s.heightCm = 179; s.age = 27; s.sex = "h"; return s; };
const tk = () => L.todayKey();

test("«3×12 liviano en 3 ejercicios» ≈ 55 kcal y «5×12 al fallo en 5» ≈ 480 kcal (85 kg)", () => {
  let a = base();
  for (const id of ["curl_supino", "elev_lat", "ext_tri"]) for (let i = 0; i < 3; i++) a = C.logSet(a, tk(), id, { reps: 12, kg: 6, rir: 3 });
  const light = T.dayEnergy(a, tk());
  let b = base();
  for (const id of ["press_pecho_maq", "remo_maq", "ext_cuad", "curl_fem", "pec_deck"]) for (let i = 0; i < 5; i++) b = C.logSet(b, tk(), id, { reps: 12, kg: 40, rir: 0 });
  const hard = T.dayEnergy(b, tk());
  console.log("liviano", light, "· al fallo", hard);
  expect(light.kcal).toBeGreaterThan(45); expect(light.kcal).toBeLessThan(65);
  expect(hard.kcal).toBeGreaterThan(430); expect(hard.kcal).toBeLessThan(530);
  expect(hard.minutes).toBeGreaterThan(55); expect(hard.minutes).toBeLessThan(75);
  // el mismo volumen, más cerca del fallo, gasta más
  let c = base(); for (let i = 0; i < 3; i++) c = C.logSet(c, tk(), "press_pecho_maq", { reps: 10, kg: 40, rir: 3 });
  let d = base(); for (let i = 0; i < 3; i++) d = C.logSet(d, tk(), "press_pecho_maq", { reps: 10, kg: 40, rir: 0 });
  expect(T.dayEnergy(d, tk()).kcal).toBeGreaterThan(T.dayEnergy(c, tk()).kcal * 1.8);
});

test("referencia: 7 ejercicios × 2–3 series × 8–12 reps ≈ 220 kcal", () => {
  let s = base();
  const ids = ["sentadilla_bb", "press_banca", "remo_bb", "press_hombro_maq", "jalon", "curl_fem", "curl_bb"];
  ids.forEach((id, i) => { for (let k = 0; k < (i % 2 ? 2 : 3); k++) s = C.logSet(s, tk(), id, { reps: 10, kg: 40, rir: 2 }); });
  const e = T.dayEnergy(s, tk());
  console.log("7 ejercicios", e);
  expect(e.kcal).toBeGreaterThan(180); expect(e.kcal).toBeLessThan(260);
});

test("1RM estimado: Epley con las reps en reserva; no se estima con muchas reps o RIR alto", () => {
  expect(T.e1rmOf(100, 5, 0)).toBeCloseTo(116.7, 1);
  expect(T.e1rmOf(100, 5, 2)).toBeCloseTo(123.3, 1);
  expect(T.e1rmOf(100, 12, 0)).toBeNull();
  expect(T.e1rmOf(100, 5, null)).toBeNull();
  expect(T.e1rmOf(100, 5, 4)).toBeNull();
});

test("proyección del plan con tus últimas cargas, fantasma y metas según el día", () => {
  let s = base();
  const d1 = (() => { const d = new Date(); d.setDate(d.getDate() - 3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  for (let i = 0; i < 4; i++) s = C.logSet(s, d1, "prensa", { reps: 10, kg: 140, rir: 2 });
  s = C.togglePlan(s, "prensa"); s = C.setPlanTarget(s, "prensa", 1); // 4 series
  s = C.togglePlan(s, "curl_fem");
  const p = T.planProjection(s)!;
  console.log("plan", p);
  expect(p.sets).toBe(7);
  expect(p.kcal).toBeGreaterThan(60);
  const intent: T.TrainingIntent = { day: tk(), answer: "si", kind: "rutina", label: "Pierna", time: "19:00", kcal: p.kcal, source: "app", at: new Date().toISOString() };
  const at = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };
  expect(T.ghostKcal(intent, 0, at(12), tk()).ghost).toBe(p.kcal);
  expect(T.ghostKcal(intent, 50, at(19), tk()).ghost).toBe(p.kcal - 50);
  expect(T.ghostKcal(intent, 0, at(23), tk())).toEqual({ ghost: 0, expired: true }); // no entrenó: se apaga sin reproche
  expect(T.minutesToWorkout(intent, at(17), tk())).toBe(120);
  expect(T.intentPhrase(intent)).toBe("tu pierna de las 19:00");
  // según el día: descanso baja, entreno sube
  const bmr = 1839;
  expect(T.byDaySpend(bmr, 150, 0, 0).spend).toBe(Math.round(bmr * 1.2 + 150));
  expect(T.byDaySpend(bmr, 150, 0, 500).spend).toBe(Math.round(bmr * 1.2 + 150) + 500);
  expect(T.byDaySpend(bmr, 150, 600, 500).exercise).toBe(600);
  // otra actividad: básquet 2 h con 85 kg
  const b = T.activityProjection("basquet", 120, 85);
  expect(b.kcal).toBe(Math.round(6 * 0.0175 * 85 * 120));
  // validación de lo que llega
  expect(T.sanitizeIntent({ answer: "si", time: "7:30", kcal: 99999 }, tk())).toMatchObject({ time: "07:30", kind: "rutina" });
  expect(T.sanitizeIntent({ answer: "quizás" }, tk())).toBeNull();
});

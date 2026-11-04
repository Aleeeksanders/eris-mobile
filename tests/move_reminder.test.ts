// «Eris me dice que me mueva y hoy me hice cagar» (2026-10-16): el ejercicio del reloj y los pasos cuentan, no solo Forge.
import { test, expect } from "bun:test";
import { planReminders, dayKey, DEFAULT_REMINDER_SETTINGS, type PlanInput } from "C:/Proyectos/eris-mobile/src/services/reminderRules.ts";

const NOW = new Date(2026, 9, 16, 9, 0); // viernes 16 oct, 09:00 (lun/mié/vie: día de «muévete» si no hay historial)
const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  now: NOW, name: "Alex", settings: { ...DEFAULT_REMINDER_SETTINGS }, modules: { nutri: true, forge: true, finanzas: true },
  mealHistory: [], todayMeals: [], kcalToday: 0, proteinToday: 0, kcalGoal: 2000, proteinGoal: 100, proteinIsCap: false,
  waterToday: 0, waterGoal: 3, trainingDays: {}, forgeStreak: null, finance: null, ...over,
});
const moves = (r: ReturnType<typeof planReminders>) => r.filter((x) => x.kind === "training" && dayKey(x.at) === "2026-10-16").map((x) => x.title);

test("sin entreno ni ejercicio: sigue el «muévete» (el viernes)", () => {
  expect(moves(planReminders(base())).some((t) => /Muévete/.test(t))).toBe(true);
});
test("básquet en el reloj hoy (60 min): no hay «muévete»", () => {
  expect(moves(planReminders(base({ exerciseDays: { "2026-10-16": 60 } })))).toEqual([]);
});
test("10 min de reloj no cuentan como entreno", () => {
  expect(moves(planReminders(base({ exerciseDays: { "2026-10-16": 10 } }))).length).toBeGreaterThan(0);
});
test("ya caminó harto hoy (9.000 pasos): no hay «muévete»", () => {
  expect(moves(planReminders(base({ stepsToday: 9000 })))).toEqual([]);
});
test("entrenó con el reloj hace 2 días: no dice «N días sin entrenar»", () => {
  const r = planReminders(base({ exerciseDays: { "2026-10-14": 45 } }));
  expect(moves(r).some((t) => /días sin entrenar|Muévete/.test(t))).toBe(false);
});
test("Forge sigue contando igual", () => {
  expect(moves(planReminders(base({ trainingDays: { "2026-10-16": 12 } })))).toEqual([]);
});

// «¿Entrenas hoy?» (Forge 2.0, F3)
const today = (r: ReturnType<typeof planReminders>) => r.filter((x) => dayKey(x.at) === "2026-10-16");
test("sin responder y entrena: la mañana pregunta (con botones) y se insiste 2 veces; sin «muévete»", () => {
  const early = new Date(2026, 9, 16, 7, 0);
  const r = today(planReminders(base({ now: early, askIntent: true })));
  const morning = r.find((x) => x.id.endsWith("morning"))!;
  expect(morning.category).toBe("intent");
  expect(morning.body).toContain("¿Hoy entrenas?");
  const nags = r.filter((x) => /intent-/.test(x.id));
  expect(nags.map((x) => `${x.at.getHours()}:${x.at.getMinutes()}`)).toEqual(["12:30", "16:30"]);
  expect(nags.every((x) => x.category === "intent")).toBe(true);
  // a quien no se le pregunta: nada de eso
  expect(today(planReminders(base({ now: early }))).some((x) => /intent-/.test(x.id))).toBe(false);
});
test("respondió que entrena a las 19:00: comer antes y proteína después; nada de «muévete» ni insistencia", () => {
  const r = today(planReminders(base({ askIntent: true, intentToday: { answer: "si", time: "19:00", minutes: 60 } })));
  const pre = r.find((x) => /pre-workout/.test(x.id))!, post = r.find((x) => /post-workout/.test(x.id))!;
  expect(`${pre.at.getHours()}:${pre.at.getMinutes()}`).toBe("17:45");
  expect(pre.title).toContain("a las 19:00");
  expect(`${post.at.getHours()}:${post.at.getMinutes()}`).toBe("20:20");
  expect(r.some((x) => /intent-|Muévete|toca entrenar/.test(x.id + x.title))).toBe(false);
});
test("respondió que descansa: sin avisos de entreno", () => {
  const r = today(planReminders(base({ askIntent: true, intentToday: { answer: "no" } })));
  expect(r.filter((x) => x.kind === "training").map((x) => x.title)).toEqual([]);
});
test("ya entrenó hoy (reloj): no se insiste con la pregunta", () => {
  const r = today(planReminders(base({ askIntent: true, exerciseDays: { "2026-10-16": 60 } })));
  expect(r.some((x) => /intent-/.test(x.id))).toBe(false);
});

// Fase I6 (2026-10-23): calidad v2 (vitaminas y minerales + suplementos), excesos de grasa saturada y carbos, el día en Métricas.
import { test, expect } from "bun:test";
import * as Q from "C:/Proyectos/eris-mobile/src/services/nutritionQualityCore.ts";
import * as X from "C:/Proyectos/eris-mobile/src/services/supplements/supplementCore.ts";

const at = (h: number, m = 0) => new Date(2026, 9, 23, h, m);
const item = (name: string, grams: number, mealType: string, t: Date, per100: any, extra: any = {}) => Q.toQualityItem({ name, grams, mealType, at: t, per100, ...extra });
const MANZANA = { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, sugar: 10 };
const LENTEJAS = { kcal: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 7.9 };
const PIZZA = { kcal: 266, protein: 11, carbs: 33, fat: 10, fiber: 2.3, sugar: 3.6, sodium: 598, satFat: 4.5 };

test("los alimentos de la base traen sus vitaminas y minerales por el nombre exacto (no por parecido)", () => {
  expect(item("Manzana", 150, "once", at(17), MANZANA).micros?.vC).toBe(4.6);
  expect(item("Lentejas cocidas", 200, "almuerzo", at(13), LENTEJAS).micros?.fe).toBeGreaterThan(3);
  expect(item("Un plato inventado con palta", 200, "almuerzo", at(13), LENTEJAS).micros).toBeUndefined();
  // los del alimento mandan (Open Food Facts)
  expect(item("Manzana", 150, "once", at(17), MANZANA, { micros: { vC: 99 } }).micros).toEqual({ vC: 99 });
});

test("calidad v2: con la mayor parte de lo comido con datos, las vitaminas y minerales cuentan; si no, la nota es la de siempre", () => {
  const ref = X.microRef({ sex: "h", age: 40 });
  const dia = [item("Lentejas cocidas", 250, "almuerzo", at(13), LENTEJAS), item("Manzana", 150, "almuerzo", at(13), MANZANA),
    item("Leche entera", 250, "desayuno", at(8), { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0 })];
  const v1 = Q.evaluateDay(dia, { now: at(15), goals: { kcal: 2200 } });
  const v2 = Q.evaluateDay(dia, { now: at(15), goals: { kcal: 2200 }, microRef: ref });
  expect(v1.parts?.micros).toBeNull();
  expect(v2.parts?.micros).toBeGreaterThan(0);
  expect(v2.parts).toMatchObject({ quality: v1.parts!.quality, timing: v1.parts!.timing });
  // un día sin datos (un plato desconocido): no se castiga
  const sinDatos = [item("Plato misterioso", 400, "almuerzo", at(13), { kcal: 200, protein: 10, carbs: 20, fat: 8, fiber: 2 })];
  expect(Q.evaluateDay(sinDatos, { now: at(15), goals: { kcal: 2200 }, microRef: ref }).parts?.micros).toBeNull();
  // los suplementos suben lo que falta
  const conSup = Q.evaluateDay(dia, { now: at(15), goals: { kcal: 2200 }, microRef: ref, supMicros: { ca: 600, mg: 300, zn: 10, b12: 500 } });
  expect(conSup.parts!.micros!).toBeGreaterThan(v2.parts!.micros!);
});

test("lo que menos llevas sale como consejo, y la simulación cambia las vitaminas al agregar comida", () => {
  const ref = X.microRef({ sex: "m", age: 30 });
  const pobre = [item("Pan de molde blanco", 100, "desayuno", at(8), { kcal: 266, protein: 8, carbs: 49, fat: 3.3, fiber: 2.7 }),
    item("Arroz blanco cocido", 250, "almuerzo", at(13), { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 })];
  const d = Q.evaluateDay(pobre, { now: at(16), goals: { kcal: 2000 }, microRef: ref });
  expect(d.parts!.micros!).toBeLessThan(60);
  expect(d.microLow!.length).toBeGreaterThan(0);
  expect(d.tips.join(" ")).toMatch(/Vitaminas y minerales: lo que menos llevas a esta hora es/);
  const sim = Q.simulateAdd(pobre, item("Lentejas cocidas", 250, "colacion_pm", at(16), LENTEJAS), { now: at(16), goals: { kcal: 2000 }, microRef: ref });
  expect(sim.after.parts!.micros!).toBeGreaterThan(sim.before.parts!.micros!);
});

test("grasa saturada y carbos del día para los excesos de Métricas", () => {
  const d = Q.evaluateDay([item("Pizza", 300, "almuerzo", at(13), PIZZA)], { now: at(15), goals: { kcal: 2000 } });
  expect(d.satFatG).toBe(13.5);
  expect(d.carbsG).toBe(99);
});

test("el día en vitaminas y minerales: comida + suplementos, cobertura, lo más bajo y los límites superiores", () => {
  const items = [{ grams: 150, kcal: 78, micros: { vC: 4.6, k: 107, ca: 6 } }, { grams: 300, kcal: 600 }];
  const md = X.microDia(items, { vD: 125, mg: 400, ca: 500 }, { sex: "h", age: 40 });
  const row = (k: string) => md.rows.find((r) => r.key === k)!;
  expect(md.cobertura).toBe(0.12);
  expect(row("vC")).toMatchObject({ comida: 6.9, suplementos: 0, total: 6.9, dri: 90, pct: 8 });
  expect(row("ca")).toMatchObject({ comida: 9, suplementos: 500, total: 509 });
  // vitamina D 125 µg pasa el UL de 100; el magnesio de suplementos (400) pasa su UL de 350
  expect(row("vD").sobreUL).toBe(100);
  expect(row("mg").sobreUL).toBe(350);
  expect(row("ca").sobreUL).toBeNull();
  expect(md.bajos[0]).toMatchObject({ pct: 0 });
  expect(md.bajos[0].fuentes.length).toBeGreaterThan(5);
  expect(X.SCORE_KEYS).not.toContain("vD");
});

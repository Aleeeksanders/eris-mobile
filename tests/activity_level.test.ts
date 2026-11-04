// Nivel de actividad automático (eris-mobile/src/services/activityLevel.ts): de 4 semanas reales, no a ojo.
import { test, expect } from "bun:test";
process.env.TZ = "America/Santiago";
const L = await import("C:/Proyectos/eris-mobile/src/services/activityLevel.ts");

const now = new Date(2026, 9, 16, 21, 0);
const BMR = 1839, W = 85;
const key = (back: number) => { const d = new Date(now); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const weeks = (fn: (back: number) => Partial<import("C:/Proyectos/eris-mobile/src/services/activityLevel.ts").DayActivity>) =>
  Array.from({ length: 28 }, (_, i) => ({ day: key(i + 1), exKcal: 0, exMin: 0, steps: 4000, boutSteps: 0, ...fn(i + 1) }));

test("oficina, casi sin moverse: Sedentario", () => {
  const r = L.autoLevel(weeks(() => ({ steps: 3000 })), BMR, W, now)!;
  expect(r.factor).toBe(1.2);
  expect(r.label).toBe("Sedentario");
});

test("básquet 2×/semana (1.200 kcal) y 6.000 pasos: entre Ligero y Moderado", () => {
  const r = L.autoLevel(weeks((b) => (b % 7 === 1 || b % 7 === 4 ? { exKcal: 1200, exMin: 120, steps: 9000, boutSteps: 5000 } : { steps: 6000 })), BMR, W, now)!;
  console.log(r);
  expect(r.factor).toBeGreaterThan(1.375);
  expect(r.factor).toBeLessThan(1.55);
  expect(r.perWeek).toBe(2);
  // nivel = 1,2 + promedio diario ÷ basal
  expect(r.typicalKcal).toBeGreaterThan(300);
});

test("gimnasio 5 días + caminar harto: Moderado o más (las tablas clásicas inflan)", () => {
  const r = L.autoLevel(weeks((b) => (b % 7 < 5 ? { exKcal: 500, exMin: 70, steps: 12000, boutSteps: 1500 } : { steps: 10000 })), BMR, W, now)!;
  console.log(r);
  expect(r.factor).toBeGreaterThanOrEqual(1.5);
  expect(["Moderado", "Activo", "Muy activo"]).toContain(r.label);
});

test("menos de 14 días con datos o sin basal: no hay automático; hoy no cuenta", () => {
  expect(L.autoLevel(weeks(() => ({})).slice(0, 10), BMR, W, now)).toBeNull();
  expect(L.autoLevel(weeks(() => ({})), null, W, now)).toBeNull();
  const conHoy = [...weeks(() => ({ steps: 3000 })), { day: key(0), exKcal: 3000, exMin: 300, steps: 30000 }];
  expect(L.autoLevel(conHoy, BMR, W, now)!.factor).toBe(1.2);
});

test("el agua extra es la misma de siempre en los niveles con nombre y continua en el automático", () => {
  expect([1.2, 1.375, 1.55, 1.725, 1.9].map(L.levelWaterBonusMl)).toEqual([0, 120, 240, 360, 480]);
  expect(L.levelWaterBonusMl(1.48)).toBe(192);
});

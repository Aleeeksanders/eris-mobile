// Detección de actividad sin «modo entrenamiento» (eris-mobile/src/services/activityDetect.ts), con datos sintéticos del reloj.
import { test, expect } from "bun:test";
process.env.TZ = "America/Santiago";
const A = await import("C:/Proyectos/eris-mobile/src/services/activityDetect.ts");
const MIN = 60_000;
const day = new Date(2026, 9, 16); // 16 oct
const at = (h: number, m = 0) => new Date(2026, 9, 16).getTime() + Math.round((h * 60 + m) * MIN);
const from = day.getTime(), to = at(22);
/** muestras de pulso cada `every` min con un patrón */
const hrSeries = (h0: number, h1: number, every: number, bpm: (k: number) => number) => {
  const out: Array<{ t: number; bpm: number }> = [];
  for (let t = at(h0), k = 0; t < at(h1); t += every * MIN, k++) out.push({ t, bpm: bpm(k) });
  return out;
};
const perMinute = (h0: number, h1: number, v: (k: number) => number) => {
  const out: Array<{ start: number; end: number; value: number }> = [];
  for (let t = at(h0), k = 0; t < at(h1); t += MIN, k++) out.push({ start: t, end: t + MIN, value: v(k) });
  return out;
};
// Día tranquilo de fondo: pulso 68 cada 10 min, pocos pasos
const calm = hrSeries(7, 22, 10, () => 68);
const calmSteps = perMinute(7, 22, (k) => (k % 30 === 0 ? 40 : 2));
const base = { from, to, restingHr: 62, age: 27, weightKg: 85, sex: "h" as const };
const merge = <T,>(xs: T[], ys: T[]) => [...xs, ...ys];
const without = (xs: Array<{ t: number }>, h0: number, h1: number) => xs.filter((x) => x.t < at(h0) || x.t >= at(h1));
const withoutI = (xs: Array<{ start: number }>, h0: number, h1: number) => xs.filter((x) => x.start < at(h0) || x.start >= at(h1));

// Básquet 18:00–20:00 sin modo entrenamiento: el reloj mide el pulso cada 5 min, los pasos van y vienen
const bbHr = hrSeries(18, 20, 5, (k) => 150 + ((k * 7) % 20));
const bbSteps = perMinute(18, 20, (k) => [140, 20, 110, 60, 0, 150, 90, 30][k % 8]);
const bbKcal = perMinute(18, 20, () => 10);

test("2 horas de básquet sin modo entrenamiento: un bloque vigoroso, ~1.200 kcal del reloj, «deporte»", () => {
  const r = A.detectActivity({ ...base, hr: merge(without(calm, 18, 20), bbHr), steps: merge(withoutI(calmSteps, 18, 20), bbSteps), kcal: bbKcal }, "2026-10-16");
  console.log(JSON.stringify(r.bouts.map((b) => [b.start.slice(11, 16), b.minutes, b.intensity, b.guess, b.kcal, b.kcalFrom, b.avgHr, b.cadence])));
  expect(r.bouts.length).toBe(1);
  const b = r.bouts[0];
  expect(b.minutes).toBeGreaterThanOrEqual(115);
  expect(b.intensity).toBe("vigorosa");
  expect(b.guess).toBe("deporte");
  expect(b.kcalFrom).toBe("reloj");
  expect(b.kcal).toBe(1200);
  expect(r.vigorousMin).toBe(b.minutes);
});

test("sin calorías del reloj: se estima por el pulso (con tope)", () => {
  const r = A.detectActivity({ ...base, hr: merge(without(calm, 18, 20), bbHr), steps: merge(withoutI(calmSteps, 18, 20), bbSteps), kcal: [] }, "2026-10-16");
  const b = r.bouts[0];
  console.log(b.kcal, b.kcalFrom);
  expect(b.kcalFrom).toBe("pulso");
  expect(b.kcal).toBeGreaterThan(900);
  expect(b.kcal).toBeLessThan(1900);
});

test("si dice «fue básquet», queda con su nombre", () => {
  const labels = [{ start: new Date(at(18, 3)).toISOString(), end: new Date(at(19, 58)).toISOString(), type: "basquet" as const }];
  const r = A.detectActivity({ ...base, hr: merge(without(calm, 18, 20), bbHr), steps: merge(withoutI(calmSteps, 18, 20), bbSteps), kcal: bbKcal, labels }, "2026-10-16");
  expect(r.bouts[0].label).toBe("basquet");
  expect(A.boutName(r.bouts[0])).toEqual({ emoji: "🏀", name: "Básquet" });
});

test("caminata pareja de 30 min: moderada, «caminata»", () => {
  const r = A.detectActivity({ ...base, hr: merge(without(calm, 9, 10), hrSeries(9, 9.5, 5, () => 102)), steps: merge(withoutI(calmSteps, 9, 10), perMinute(9, 9.5, () => 112)), kcal: [] }, "2026-10-16");
  console.log(JSON.stringify(r.bouts.map((b) => [b.minutes, b.intensity, b.guess, b.kcal, b.kcalFrom])));
  expect(r.bouts.length).toBe(1);
  expect(r.bouts[0].guess).toBe("caminata");
  expect(r.bouts[0].intensity).toBe("moderada");
});

test("pulso algo alto sentado (estrés, café): no es actividad", () => {
  const r = A.detectActivity({ ...base, hr: merge(without(calm, 15, 16), hrSeries(15, 15.5, 5, () => 118)), steps: calmSteps, kcal: [] }, "2026-10-16");
  expect(r.bouts).toEqual([]);
});

test("el sueño queda fuera y una sesión del reloj no se cuenta dos veces", () => {
  const sleep = [{ start: at(0, 30), end: at(7, 0) }];
  const nightHr = hrSeries(1, 2, 5, () => 140); // algo raro mientras dormía
  const run = { start: at(7, 30), end: at(8, 0) };
  const r = A.detectActivity({ ...base, sleep, sessions: [run], hr: merge(calm, merge(nightHr, hrSeries(7.5, 8, 2, () => 165))), steps: merge(calmSteps, perMinute(7.5, 8, () => 165)), kcal: [] }, "2026-10-16");
  console.log(JSON.stringify(r.bouts.map((b) => [b.start.slice(11, 16), b.minutes, b.fromSession ?? false, b.guess])));
  expect(r.bouts.length).toBe(1);
  expect(r.bouts[0].fromSession).toBe(true);
  expect(r.bouts[0].minutes).toBe(30);
});

test("pasos del teléfono y del reloj: se usa una sola fuente", () => {
  const xs = [{ origin: "tel", value: 4000 }, { origin: "reloj", value: 5100 }, { origin: "reloj", value: 100 }];
  expect(A.mainOrigin(xs).map((x) => x.origin)).toEqual(["reloj", "reloj"]);
});

test("dos sesiones que se pisan (reloj + otra app, 2026-10-21) cuentan una vez", () => {
  // 20:50–21:51 y 21:08–21:59: la misma caminata escrita dos veces → un bloque de 69 min, no 112
  const walkSteps = perMinute(20 + 50 / 60, 22, () => 70);
  const r = A.detectActivity({ ...base, to: at(23), hr: calm, steps: merge(withoutI(calmSteps, 20.8, 22), walkSteps), kcal: [],
    sessions: [{ start: at(20, 50), end: at(21, 51) }, { start: at(21, 8), end: at(21, 59) }] }, "2026-10-16");
  console.log(r.bouts.map((b) => `${b.start.slice(11, 16)}–${b.end.slice(11, 16)} ${b.minutes} min ${b.kcal} kcal`));
  expect(r.bouts.filter((b) => b.fromSession).length).toBe(1);
  expect(r.minutes).toBe(69);
  expect(A.mergeSpans([{ start: 5, end: 9 }, { start: 1, end: 3 }, { start: 2, end: 4 }, { start: 9, end: 12 }])).toEqual([{ start: 1, end: 4 }, { start: 5, end: 12 }]);
});

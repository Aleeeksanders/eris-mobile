// Sueño 2.0 · S0: el núcleo con el día real del usuario (24-10, Mi Fitness) y los casos del plan.
import { test, expect } from "bun:test";
process.env.TZ = "America/Santiago";
import { sleepDay, sleepByDay, sleepInsights, sleepSummaryText, sleepReading, fmtSleep, type RawSession } from "C:/Proyectos/eris-mobile/src/services/sleep/sleepCore.ts";

const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime();
/** Etapas seguidas: [etapa, minutos]… desde `start` */
const seq = (start: number, parts: Array<[number, number]>) => {
  const out: Array<{ start: number; end: number; stage: number }> = [];
  let t = start;
  for (const [stage, min] of parts) { out.push({ start: t, end: t + min * 60_000, stage }); t += min * 60_000; }
  return out;
};
// 24-10 según Mi Fitness: 02:33–03:18 (45 min, sin etapas); 04:20–09:05 (ligero 2 h 48, profundo 1 h 25, REM 31, 1 min despierto);
// 13:51–17:54 (ligero 2 h 04, profundo 1 h 17, REM 41, 1 min despierto). Total 9 h 31.
const dia24: RawSession[] = [
  { start: at(24, 2, 33), end: at(24, 3, 18) },
  { start: at(24, 4, 20), end: at(24, 9, 5), stages: seq(at(24, 4, 20), [[4, 60], [5, 50], [4, 50], [1, 1], [6, 15], [5, 35], [4, 58], [6, 16]]) },
  { start: at(24, 13, 51), end: at(24, 17, 54), stages: seq(at(24, 13, 51), [[4, 40], [5, 45], [6, 20], [4, 44], [1, 1], [5, 32], [6, 21], [4, 40]]) },
];
const anoche23: RawSession = { start: at(23, 2, 10), end: at(23, 8, 0) };

test("el 24-10: la noche partida (02:33–09:05) y un segundo sueño en la tarde; 9 h 31 como Mi Fitness", () => {
  const d = sleepDay([anoche23, ...dia24], { usualWake: 7.75, usualSleepH: 7.25 })!;
  expect(d.episodes.map((e) => e.kind)).toEqual(["noche", "segundo"]);
  expect(fmtSleep(d.totalH)).toBe("9 h 31");
  expect(fmtSleep(d.nightH!)).toBe("5 h 29");
  expect(new Date(d.dayWake!).getHours()).toBe(9);               // el día empieza a las 09:05, no a las 17:54
  expect(new Date(d.lastWake!).getHours()).toBe(17);
  expect(d.night!.awakeMin).toBe(63);                            // 1 min del reloj + 62 entre 03:18 y 04:20
  expect(d.split).toBe(true);
  expect(sleepSummaryText(d)).toBe("Dormiste 9 h 31 en 2 partes: la noche, de 02:33 a 09:05 (5 h 29, con 1 h 03 despierto en medio), y un segundo sueño en la tarde, de 13:51 a 17:54 (4 h 02).");
  expect(sleepReading(d, 7.25)).toBe("En horas recuperaste, pero la noche fue partida y empezó tarde: descansa menos que dormir seguido.");
});

test("un sueño largo hasta las 18:30 no mueve el día mientras no se sepa cómo sigues; a las 8 h sin dormir, sí", () => {
  const partes = [{ start: at(24, 3, 0), end: at(24, 6, 0) }, { start: at(24, 13, 0), end: at(24, 18, 30) }];
  const ahora = sleepDay(partes, { usualWake: 7.75, now: at(24, 19, 0) })!;
  expect(new Date(ahora.dayWake!).getHours()).toBe(6);
  expect(ahora.episodes.map((e) => e.kind)).toEqual(["segundo"]);
  expect(ahora.pendingWake).toBe(new Date(at(24, 18, 30)).toISOString());
  const despues = sleepDay(partes, { usualWake: 7.75, now: at(25, 3, 0) })!;
  expect(new Date(despues.dayWake!).getHours()).toBe(18);
  expect(despues.pendingWake).toBeNull();
  // Cada uno en su día
  const h = sleepByDay(partes, { usualWake: 7.75 });
  expect(h.get("2026-10-24")!.totalH).toBe(3);
  expect(h.get("2026-10-25")!.totalH).toBe(5.5);
});

test("una siesta corta en la tarde no corta nada ni mueve el día", () => {
  const d = sleepDay([{ start: at(24, 0, 10), end: at(24, 7, 40) }, { start: at(24, 15, 0), end: at(24, 15, 20) }], { usualWake: 7.75 })!;
  expect(d.episodes.map((e) => e.kind)).toEqual(["noche", "siesta"]);
  expect(d.split).toBe(false);
  expect(new Date(d.dayWake!).getHours()).toBe(7);
  expect(sleepReading(d)).toBeNull();
  expect(sleepSummaryText(d)).toBe("Dormiste 7 h 30 de noche (de 00:10 a 07:40), más una siesta de 20 min en la tarde.");
});

test("despertar a medianoche (menos de 90 min) es la misma noche; más es otra parte", () => {
  const d = sleepDay([{ start: at(24, 0, 0), end: at(24, 3, 0) }, { start: at(24, 3, 40), end: at(24, 7, 30) }], { usualWake: 7.5 })!;
  expect(d.episodes.length).toBe(1);
  expect(d.night!.wakeups).toBe(1);
  expect(d.split).toBe(true);                                    // 40 min despierto en medio
});

test("turno de noche: sin nada en la ventana, la noche es la parte más larga de 3 h o más", () => {
  const d = sleepDay([{ start: at(24, 9, 0), end: at(24, 16, 0) }], { usualWake: 7.5 })!;
  expect(d.night!.kind).toBe("noche");
  // con su despertar habitual aprendido (16:00), su ventana calza sola
  const d2 = sleepDay([{ start: at(24, 9, 0), end: at(24, 16, 0) }], { usualWake: 16, usualSleepH: 7 })!;
  expect(new Date(d2.dayWake!).getHours()).toBe(16);
});

// 1-11 (registro real: 17,68 total, 7,17 noche): 7 h 10 del 31-10 + 10 h 31 acostándose de madrugada y despertando pasadas las
// 14:00. Sin las sesiones de Health Connect a mano, las horas son representativas; las duraciones y el resultado, los reales.
const nov = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).getTime();
const trasnoche = { usualWake: 8, usualSleepH: 6.25 };
const noche31 = { start: at(31, 6, 40), end: at(31, 13, 50) };
const dormido1 = [{ start: nov(1, 4, 20), end: nov(1, 9, 50) }, { start: nov(1, 10, 10), end: nov(1, 15, 11) }];

test("un sueño largo que termina otro día no se suma a la noche anterior: el 1-11 no son «17 h 41»", () => {
  const d = sleepDay([noche31, ...dormido1], trasnoche)!;
  expect(d.totalH).toBe(10.52);
  expect(d.nightH).toBe(10.52);
  expect(d.episodes.map((e) => e.kind)).toEqual(["noche"]);
  expect(new Date(d.dayWake!).getDate()).toBe(1);                // el día empezó hoy a las 15:11, no ayer a las 13:50
  expect(new Date(d.dayWake!).getHours()).toBe(15);
  expect(d.split).toBe(false);
  expect(sleepSummaryText(d)).toBe("Dormiste 10 h 31 (de 04:20 a 15:11, con 20 min despierto en medio).");
  // Igual que el historial por día
  const h = sleepByDay([noche31, ...dormido1], trasnoche).get("2026-11-01")!;
  expect([h.totalH, h.nightH]).toEqual([d.totalH, d.nightH]);
});

test("ese día, en el resumen de 2 semanas: no se toma por siesta ni corre la hora de acostarse", () => {
  const now = nov(1, 15, 39);
  const ins = sleepInsights([noche31, ...dormido1], { ...trasnoche, now });
  expect(ins.bedtime.napShiftMin).toBe(0);
  expect(ins.avgTotalH).toBe(8.84);                              // (7,17 + 10,52) / 2: siempre fue por día
  expect(ins.score!.word).not.toBe("Partida");
});

test("sin su despertar aprendido, dos sueños largos fuera de la ventana no se suman: cuenta el último", () => {
  const d = sleepDay([{ start: at(24, 5, 0), end: at(24, 14, 0) }, { start: at(25, 5, 0), end: at(25, 14, 0) }], {})!;
  expect(d.totalH).toBe(9);
  expect(new Date(d.dayWake!).getDate()).toBe(25);
});

test("un segundo sueño largo que termina antes de las 18:00 sí se suma; desde las 18:00 cuenta al día siguiente", () => {
  const d = sleepDay([{ start: at(23, 23, 0), end: at(24, 7, 0) }, { start: at(24, 13, 0), end: at(24, 17, 30) }], { usualWake: 7, usualSleepH: 8 })!;
  expect(d.episodes.map((e) => e.kind)).toEqual(["noche", "segundo"]);
  expect(d.totalH).toBe(12.5);
  expect(d.nightH).toBe(8);
  expect(new Date(d.dayWake!).getHours()).toBe(7);
  expect(d.split).toBe(false);                                   // 8 h de noche seguidas: no fue una noche partida
  expect(sleepReading(d)).toBeNull();
  const h = sleepByDay([{ start: at(23, 23, 0), end: at(24, 7, 0) }, { start: at(24, 20, 0), end: at(24, 23, 30) }], { usualWake: 7, usualSleepH: 8 });
  expect(h.get("2026-10-24")!.totalH).toBe(8);
  expect(h.get("2026-10-25")!.totalH).toBe(3.5);
});

// Sueño 2.0 · S0: el núcleo con el día real del usuario (24-10, Mi Fitness) y los casos del plan.
import { test, expect } from "bun:test";
process.env.TZ = "America/Santiago";
import { sleepDay, sleepByDay, sleepSummaryText, sleepReading, fmtSleep, type RawSession } from "C:/Proyectos/eris-mobile/src/services/sleep/sleepCore.ts";

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

test("si la tarde hubiera sido más larga que la noche, el día igual empieza al terminar la noche", () => {
  const d = sleepDay([{ start: at(24, 3, 0), end: at(24, 6, 0) }, { start: at(24, 13, 0), end: at(24, 18, 30) }], { usualWake: 7.75 })!;
  expect(d.night!.kind).toBe("noche");
  expect(new Date(d.dayWake!).getHours()).toBe(6);
  expect(d.episodes[1].kind).toBe("segundo");
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

test("dos apps con el mismo sueño no lo cuentan doble", () => {
  const a = { start: at(24, 0, 0), end: at(24, 7, 0) };
  const d = sleepDay([a, { ...a, start: a.start + 5 * 60_000 }], { usualWake: 7 })!;
  expect(fmtSleep(d.totalH)).toBe("7 h");
});

test("el historial por día: total y noche", () => {
  const m = sleepByDay([anoche23, ...dia24], { usualWake: 7.75, usualSleepH: 7.25 });
  expect(fmtSleep(m.get("2026-10-24")!.totalH)).toBe("9 h 31");
  expect(fmtSleep(m.get("2026-10-24")!.nightH!)).toBe("5 h 29");
  expect(m.get("2026-10-23")!.nightH).toBe(5.83);
});

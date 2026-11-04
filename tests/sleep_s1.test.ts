// Sueño 2.0 · S1: 14 días — deuda, regularidad (SRI), cronotipo, tendencia, puntaje y la hora para acostarse.
import { test, expect } from "bun:test";
process.env.TZ = "America/Santiago";
import { sleepInsights, nightScore, sleepRegularityIndex, insightsText, bedtimeText, hhmmOf, fmtSleep, type RawSession } from "C:/Proyectos/eris-mobile/src/services/sleep/sleepCore.ts";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
/** Una noche: se duerme el día `d` a las `h:m` (h ≥ 12 = la tarde/noche de ese día) y duerme `horas` */
const noche = (d: number, h: number, m: number, horas: number): RawSession => { const s = at(d, h, m); return { start: s, end: s + horas * 3600_000 }; };

// Dos semanas regulares: 00:30 → 07:45 (7 h 15)
const regulares: RawSession[] = Array.from({ length: 14 }, (_, i) => noche(11 + i, 0, 30, 7.25));
// La semana del usuario (18–24 oct): cada día más tarde (22:30, 01:00, 23:30, 00:30, 02:00, 02:00, 04:20) y noches cortas
const corrida: RawSession[] = [
  ...Array.from({ length: 7 }, (_, i) => noche(10 + i, 23, 30, 7.5)),
  noche(17, 22, 30, 7), noche(19, 1, 0, 6.5), noche(19, 23, 30, 7), noche(21, 0, 30, 7), noche(22, 2, 0, 6), noche(23, 2, 0, 5.8),
  { start: at(24, 2, 33), end: at(24, 3, 18) }, { start: at(24, 4, 20), end: at(24, 9, 5) }, { start: at(24, 13, 51), end: at(24, 17, 54) },
];

test("dos semanas regulares: sin deuda, horario muy regular, a acostarse ~00:15", () => {
  const s = sleepInsights(regulares, { now: at(24, 20), usualWake: 7.75 });
  expect(s.nights).toBe(14);
  expect(s.debtH).toBe(0);                      // 15 min bajo 7,5 h cada noche: variación normal, no deuda
  expect(s.regularity).toBe("muy regular");
  expect(s.sri).toBeGreaterThanOrEqual(85);
  expect(s.trendMinPerDay).toBe(0);
  expect(hhmmOf(s.usualOnset!)).toBe("00:30");
  expect(hhmmOf(s.bedtime.target)).toBe("00:15");   // 7:45 − 7,5 h
  expect(hhmmOf(s.caffeineUntil)).toBe("18:15");
  expect(s.score!.word).toBe("Buena");
});

test("la semana del usuario: se duerme cada vez más tarde, deuda y la noche partida", () => {
  const s = sleepInsights(corrida, { now: at(24, 20, 30), usualWake: 7.75, usualSleepH: 7.25 });
  expect(s.debtH).toBeGreaterThan(1);
  expect(s.trendMinPerDay!).toBeGreaterThan(20);              // cada día más tarde
  expect(s.regularity === "algo irregular" || s.regularity === "irregular").toBe(true);
  expect(s.score!.word).toBe("Partida");
  // Durmió 4 h en la tarde (13:51–17:54): la hora para acostarse se corre (30 min por hora, máx. 2 h)
  expect(s.bedtime.napShiftMin).toBe(120);
  expect(bedtimeText(s)).toContain("acuéstate cuando te dé sueño, desde las");
  const t = insightsText(s);
  expect(t).toContain("más tarde cada día");
  expect(t).not.toMatch(/mal|deberías|culpa/i);
});

test("el puntaje pesa la duración, el horario y los despertares más que las etapas", () => {
  const ref = { need: 7.5, usualOnset: 0.5, usualWakeH: 7.75 };
  const buena = nightScore({ totalH: 7.6, nightH: 7.6, onset: at(24, 0, 30), wake: at(24, 8, 6), awakeMin: 10 }, ref);
  const corta = nightScore({ totalH: 5, nightH: 5, onset: at(24, 2, 40), wake: at(24, 7, 40), awakeMin: 10 }, ref);
  expect(buena.word).toBe("Buena");
  expect(buena.total).toBeGreaterThanOrEqual(90);
  expect(corta.word).toBe("Corta");
  expect(corta.total).toBeLessThan(buena.total - 25);
});

test("SRI: sin datos no hay índice (no se inventa)", () => {
  expect(sleepRegularityIndex([], at(10, 0), at(24, 0))).toBeNull();
  expect(fmtSleep(7.25)).toBe("7 h 15");
});

// Sueño 2.0 · S2: lo que usa la pantalla de Sueño — un día cualquiera, hipnograma, correcciones, la acción y el plan.
import { test, expect } from "bun:test";
process.env.TZ = "America/Santiago";
import {
  sleepDayOn, hypnogram, applySleepEdits, sleepAction, suggestPlan, planProgress, sleepInsights, nightRecords, sleepDay, hhmmOf,
  type RawSession, type SleepPlan,
} from "C:/Proyectos/eris-mobile/src/services/sleep/sleepCore.ts";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const noche = (d: number, h: number, m: number, horas: number): RawSession => { const s = at(d, h, m); return { start: s, end: s + horas * 3600_000 }; };
const seq = (start: number, parts: Array<[number, number]>) => {
  const out: Array<{ start: number; end: number; stage: number }> = [];
  let t = start;
  for (const [stage, min] of parts) { out.push({ start: t, end: t + min * 60_000, stage }); t += min * 60_000; }
  return out;
};
// El 24-10 del usuario (Mi Fitness)
const partido: RawSession[] = [
  { start: at(24, 2, 33), end: at(24, 3, 18) },
  { start: at(24, 4, 20), end: at(24, 9, 5), stages: seq(at(24, 4, 20), [[4, 60], [5, 50], [4, 50], [1, 1], [6, 15], [5, 35], [4, 58], [6, 16]]) },
  { start: at(24, 13, 51), end: at(24, 17, 54) },
];
const regulares: RawSession[] = Array.from({ length: 14 }, (_, i) => noche(10 + i, 0, 30, 7.25));

test("un día cualquiera: el 24-10 sale igual que en el día de hoy, y el 15-10 es su noche normal", () => {
  const all = [...regulares.slice(0, 13), ...partido];
  const d24 = sleepDayOn(all, "2026-10-24", { usualWake: 7.75 })!;
  expect(d24.episodes.length).toBe(2);
  expect(d24.episodes[0].kind).toBe("noche");
  expect(d24.episodes[1].kind).toBe("segundo");
  expect(Math.round(d24.totalH * 60)).toBe(9 * 60 + 32);   // la tarde sin etapas acá (sin el minuto despierto de Mi Fitness)
  const d15 = sleepDayOn(all, "2026-10-15", { usualWake: 7.75 })!;
  expect(d15.episodes.length).toBe(1);
  expect(d15.totalH).toBeCloseTo(7.25, 2);
  expect(sleepDayOn(all, "2026-10-01")).toBeNull();
});

test("hipnograma: etapas en orden, despertar como 'despierto', sin etapas = 'dormido', y no se sale del rango", () => {
  const h = hypnogram(partido, at(24, 2, 33), at(24, 9, 5));
  expect(h[0]).toEqual({ start: at(24, 2, 33), end: at(24, 3, 18), stage: "dormido" });    // el tramo sin etapas
  expect(h.map((x) => x.stage).slice(1, 6)).toEqual(["ligero", "profundo", "ligero", "despierto", "rem"]);
  expect(h[h.length - 1].end).toBe(at(24, 9, 5));
  for (let i = 1; i < h.length; i++) expect(h[i].start).toBeGreaterThanOrEqual(h[i - 1].end);
  // Dos apps con el mismo sueño: se usa el que trae etapas, sin duplicar
  const dup = hypnogram([{ start: at(24, 4, 20), end: at(24, 9, 5) }, partido[1]], at(24, 4, 20), at(24, 9, 5));
  expect(dup.filter((x) => x.stage === "dormido").length).toBe(0);
  expect(dup.reduce((a, x) => a + (x.end - x.start), 0)).toBe(at(24, 9, 5) - at(24, 4, 20));
});

test("correcciones: «no estaba durmiendo» quita ese tramo; «anotar a mano» suma uno; nada raro pasa", () => {
  const sinTarde = applySleepEdits(partido, { excluded: [{ start: at(24, 13, 51), end: at(24, 17, 54) }], manual: [] });
  expect(sinTarde.length).toBe(2);
  const d = sleepDay(sinTarde, { usualWake: 7.75 })!;
  expect(d.episodes.length).toBe(1);
  // Un tramo que la corrección apenas toca (menos de la mitad) se queda
  expect(applySleepEdits(partido, { excluded: [{ start: at(24, 9, 0), end: at(24, 10, 0) }], manual: [] }).length).toBe(3);
  // A mano: suma; uno de más de 16 h o al revés no
  const mano = applySleepEdits([], { excluded: [], manual: [{ start: at(23, 23, 30), end: at(24, 7, 0) }, { start: at(24, 9), end: at(24, 8) }, { start: at(20, 0), end: at(21, 0) }] });
  expect(mano.length).toBe(1);
  expect(sleepDay(mano)!.totalH).toBe(7.5);
  expect(applySleepEdits(partido, null)).toBe(partido);
});

test("la acción del día: una sola, según cómo vienes", () => {
  expect(sleepAction(null)).toContain("algunas noches");
  const conSiesta = sleepInsights([...regulares.slice(0, 13), ...partido], { now: at(24, 20), usualWake: 7.75 });
  expect(sleepAction(conSiesta)).toMatch(/cuando te dé sueño/);
  const bien = sleepInsights(regulares, { now: at(23, 20), usualWake: 7.75 });
  expect(sleepAction(bien)).toMatch(/^Mantén tu horario: acuéstate entre las 23:45 y las 00:45/);
  const cortas = Array.from({ length: 10 }, (_, i) => noche(14 + i, 1, 30, 5.5));
  expect(sleepAction(sleepInsights(cortas, { now: at(23, 20), usualWake: 7 }))).toMatch(/30–60 min por noche/);
});

test("el plan: horario corrido → despertar; noches cortas → duración; tarde pero regular → adelantar; bien → ninguno", () => {
  const corrida: RawSession[] = [noche(17, 22, 30, 7), noche(19, 1, 0, 6.5), noche(19, 23, 30, 7), noche(21, 0, 30, 7), noche(22, 2, 0, 6), noche(23, 2, 0, 5.8), noche(24, 4, 20, 4.75)];
  expect(suggestPlan(sleepInsights(corrida, { now: at(24, 20), usualWake: 9 }), "2026-10-24")!.kind).toBe("despertar");
  const cortas = Array.from({ length: 10 }, (_, i) => noche(14 + i, 1, 30, 5.5));
  const pc = suggestPlan(sleepInsights(cortas, { now: at(23, 20), usualWake: 7 }), "2026-10-23")!;
  expect(pc.kind).toBe("duracion");
  expect(pc.how).toContain("23:30");
  // Duerme bien y regular, pero de 02:00 a 10:00 y su despertar fijado es 08:30: la hora ideal es 01:00 → adelantar de a poco
  const tarde = Array.from({ length: 10 }, (_, i) => noche(14 + i, 2, 0, 8));
  const adel = suggestPlan(sleepInsights(tarde, { now: at(23, 20), usualWake: 8.5 }), "2026-10-23")!;
  expect(adel.kind).toBe("adelantar");
  expect(adel.how).toBe("Empieza a las 01:40; cada 3 días, 20 min antes, hasta las 01:00.");
  // Con el despertar a las 09:30, ya está en su hora: nada que mejorar
  expect(suggestPlan(sleepInsights(tarde, { now: at(23, 20), usualWake: 9.5 }), "2026-10-23")).toBeNull();
  expect(suggestPlan(sleepInsights(regulares.slice(0, 4), { now: at(14, 20) }), "2026-10-14")).toBeNull(); // pocas noches
});

test("avance del plan: día 1–14, noches cumplidas (desde la noche siguiente) y fin", () => {
  const p: SleepPlan = { kind: "despertar", start: "2026-10-20", targetWake: 7.75, targetH: 7.5, startBed: 0.5, targetBed: 0.25 };
  const ns = nightRecords([noche(20, 0, 30, 7.25), noche(21, 1, 0, 6.75), noche(22, 2, 0, 7.5), noche(23, 0, 30, 7.25)]);
  expect(planProgress(p, ns, at(20, 22)).text).toBe("Día 1 de 14 · empieza esta noche.");   // la del 20 en la mañana no cuenta
  const r = planProgress(p, ns, at(23, 12));
  expect(r.day).toBe(4);
  expect(r.of).toBe(3);
  expect(r.hits).toBe(2);             // 07:45 sí, 09:30 no, 07:45 sí
  expect(r.done).toBe(false);
  expect(r.text).toBe("Día 4 de 14 · 2 de 3 noches cumplidas.");
  expect(planProgress(p, ns, at(21, 12)).text).toBe("Día 2 de 14 · 1 de 1 noche cumplida.");
  expect(planProgress(p, ns, at(30, 12)).text).toMatch(/^Día 11/);
  expect(planProgress(p, ns, new Date(2026, 10, 5).getTime()).done).toBe(true);
  // Adelantar: la meta baja 20 min cada 3 noches del plan (noches 1–3: 01:40; 4–6: 01:20…)
  const pa: SleepPlan = { kind: "adelantar", start: "2026-10-20", targetWake: 9, targetH: 8, startBed: 26, targetBed: 25 };
  const na = nightRecords([noche(21, 1, 40, 7), noche(24, 1, 40, 7)]);
  expect(planProgress(pa, na, at(25, 12)).hits).toBe(1); // la noche 1 (meta 01:40) sí; la 4 (meta 01:20) no
  expect(hhmmOf(26 - 1 / 3)).toBe("01:40");
});

// Sueño — anotar con dos horas y un sueño fuera de horario (2026-11-07). El caso real: durmió de 23:00 a 06:45 y otra vez de 17:30 a
// 23:50. Eris decía «14 h 05» y «la noche fue partida», y a las 00:40 lo daba por terminando su día, recién despierto.
process.env.TZ = "America/Santiago";
import { test, expect, mock } from "bun:test";
const store: Record<string, string> = {};
mock.module("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (k: string) => store[k] ?? null, setItem: async (k: string, v: string) => { store[k] = v; }, removeItem: async (k: string) => { delete store[k]; },
} }));
mock.module("react-native", () => ({ DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove() {} }) } }));
const S = await import("C:/Proyectos/eris-mobile/src/services/sleep/sleepCore.ts");
const M = await import("C:/Proyectos/eris-mobile/src/services/mealSchedule.ts");
const St = await import("C:/Proyectos/eris-mobile/src/services/sleep/sleepStore.ts");

const h = (d: number, hh: number, mm = 0) => new Date(2026, 10, d, hh, mm).getTime();
const noche = { start: h(5, 23), end: h(6, 6, 45) };
const tarde = { start: h(6, 17, 30), end: h(6, 23, 50) };
const finTarde = new Date(tarde.end).toISOString();
const usual = { usualWake: 7.75, usualSleepH: 7.5 };
const ahora = h(7, 0, 40);

test("cada sueño cuenta en un solo día: el de la tarde-noche, al siguiente; ya no son «14 h 05»", () => {
  expect(S.sleepKey(tarde.end, 380)).toBe("2026-11-07");
  expect(S.sleepKey(noche.end, 465)).toBe("2026-11-06");
  expect(S.sleepKey(h(6, 18, 30), 120)).toBe("2026-11-06");      // una siesta de 2 h, no
  expect(S.sleepKey(h(6, 17, 30), 240)).toBe("2026-11-06");      // antes de las 18:00, tampoco
  const por = S.sleepByDay([noche, tarde], usual);
  expect(por.get("2026-11-06")!.totalH).toBe(7.75);
  expect(por.get("2026-11-07")!.totalH).toBe(6.33);
  expect(S.sleepDayOn([noche, tarde], "2026-11-06", usual)!.totalH).toBe(7.75);
  const on7 = S.sleepDayOn([noche, tarde], "2026-11-07", usual)!;
  expect(on7.totalH).toBe(6.33);
  expect(S.sleepSummaryText(on7)).toBe("Dormiste 6 h 20 (de 17:30 a 23:50).");
  expect(S.sleepDayOn([noche, tarde], "2026-11-05", usual)).toBeNull();
});

test("recién despierto, sin responder: el día no se mueve, no hay «noche partida» y Eris pregunta", () => {
  const d = S.sleepDay([noche, tarde], { ...usual, now: ahora })!;
  expect(d.day).toBe("2026-11-07");
  expect(d.totalH).toBe(6.33);
  expect(d.episodes.map((e) => e.kind)).toEqual(["segundo"]);
  expect(d.dayWake).toBe(new Date(noche.end).toISOString());
  expect(d.lastWake).toBe(finTarde);
  expect(d.pendingWake).toBe(finTarde);
  expect(d.split).toBe(false);
  expect(S.sleepReading(d)).toBeNull();
  expect(S.wakeQuestionText(d.pendingWake!)).toBe("Despertaste a las 23:50. ¿Cómo sigues?");
});

test("«Parto mi día ahora»: el día se cuenta desde las 23:50, también la hora de acostarse", () => {
  const o = { ...usual, now: ahora, decisions: { [finTarde]: "partir" as const } };
  const d = S.sleepDay([noche, tarde], o)!;
  expect(d.dayWake).toBe(finTarde);
  expect(d.pendingWake).toBeNull();
  expect(d.episodes[0].kind).toBe("noche");
  const ins = S.sleepInsights([noche, tarde], o);
  expect(S.hhmmOf(ins.bedtime.target)).toBe("16:15");            // 23:50 − 7 h 30, de 15 en 15 min: no te pide 24 h despierto
  expect(ins.bedtime.napShiftMin).toBe(0);
});

test("«Vuelvo a dormir»: es un sueño extra, el día sigue y la hora de acostarse se corre", () => {
  const o = { ...usual, now: ahora, decisions: { [finTarde]: "dormir" as const } };
  const d = S.sleepDay([noche, tarde], o)!;
  expect(d.dayWake).toBe(new Date(noche.end).toISOString());
  expect(d.pendingWake).toBeNull();
  expect(S.sleepInsights([noche, tarde], o).bedtime.napShiftMin).toBe(120);
});

test("sin respuesta: si vuelve a dormir largo en las 8 h siguientes, ese es el despertar; si no, el día partió a las 23:50", () => {
  const luego = { start: h(7, 3), end: h(7, 8) };
  const d = S.sleepDay([noche, tarde, luego], { ...usual, now: h(7, 8, 30) })!;
  expect(d.dayWake).toBe(new Date(luego.end).toISOString());
  expect(d.pendingWake).toBeNull();
  expect(d.totalH).toBe(11.33);                                  // los dos cuentan al 7
  expect(d.episodes.map((e) => e.kind)).toEqual(["segundo", "noche"]);
  expect(d.split).toBe(true);                                    // 5 h de noche + el otro: esta sí fue partida
  const sinDormir = S.sleepDay([noche, tarde], { ...usual, now: h(7, 8) })!;
  expect(sinDormir.dayWake).toBe(finTarde);
  expect(sinDormir.pendingWake).toBeNull();
});

test("no se pregunta por una noche normal, ni por una siesta larga de la tarde, ni por una corta a las 19:00", () => {
  expect(S.sleepDay([noche], { ...usual, now: h(6, 8) })!.pendingWake).toBeNull();
  const nap = S.sleepDay([noche, { start: h(6, 14), end: h(6, 17, 30) }], { ...usual, now: h(6, 17, 40) })!;
  expect(nap.pendingWake).toBeNull();
  expect(nap.dayWake).toBe(new Date(noche.end).toISOString());
  expect(nap.episodes.map((e) => e.kind)).toEqual(["noche", "segundo"]);
  expect(nap.split).toBe(false);                                 // dormir bien y otro rato no es una noche partida
  const corta = S.sleepDay([noche, { start: h(6, 17), end: h(6, 19) }], { ...usual, now: h(6, 19, 10) })!;
  expect(corta.pendingWake).toBeNull();
  expect(corta.totalH).toBe(9.75);
});

test("sí se pregunta si un sueño largo termina de madrugada, antes de lo que sería despertar", () => {
  const d = S.sleepDay([{ start: h(5, 23), end: h(6, 2, 30) }], { ...usual, now: h(6, 2, 40) })!;
  expect(d.pendingWake).toBe(new Date(h(6, 2, 30)).toISOString());
  expect(S.wakeIsOdd(h(6, 5), usual)).toBe(false);
});

test("dos horas, sin fechas: el tramo más reciente que ya pasó", () => {
  const r = S.resolveSleepTimes(17 * 60 + 30, 23 * 60 + 50, ahora)!;
  expect([r.start, r.end]).toEqual([tarde.start, tarde.end]);
  expect(S.sleepRangeText(r.start, r.end, ahora)).toBe("Ayer, de 17:30 a 23:50 · 6 h 20");
  // A las 09:00: la noche de hoy, cruzando la medianoche
  const n = S.resolveSleepTimes(23 * 60, 7 * 60, h(7, 9))!;
  expect([n.start, n.end]).toEqual([h(6, 23), h(7, 7)]);
  expect(S.sleepRangeText(n.start, n.end, h(7, 9))).toBe("Hoy, de 23:00 a 07:00 · 8 h");
  // Días antes, y lo que no calza
  const atras = S.resolveSleepTimes(23 * 60, 7 * 60, h(7, 9), 2)!;
  expect(atras.end).toBe(h(5, 7));
  expect(S.resolveSleepTimes(7 * 60, 23 * 60 + 30, h(7, 23, 40))).toBeNull(); // 16 h 30
  expect(S.resolveSleepTimes(8 * 60, 8 * 60 + 5, h(7, 9))).toBeNull();
});

test("las horas dichas sin am ni pm: la madrugada si cubre 3 h o más; si no, lo más reciente", () => {
  const amb = (hh: number, mm = 0) => ({ min: hh * 60 + mm, amb: true });
  const r = S.resolveSaidTimes(amb(5, 30), amb(11, 50), ahora)!;
  expect([r.start, r.end]).toEqual([tarde.start, tarde.end]);
  const noche8 = S.resolveSaidTimes(amb(10), amb(6), h(7, 20))!;
  expect([noche8.start, noche8.end]).toEqual([h(6, 22), h(7, 6)]);
  const nap = S.resolveSaidTimes(amb(3), amb(5), h(7, 18))!;
  expect([nap.start, nap.end]).toEqual([h(7, 15), h(7, 17)]);
  const once = S.resolveSaidTimes(amb(11), amb(7), h(7, 9))!;
  expect([once.start, once.end]).toEqual([h(6, 23), h(7, 7)]);
  const recien = S.resolveSaidTimes({ min: 17 * 60 + 30, amb: false }, "ahora", tarde.end)!;
  expect([recien.start, recien.end]).toEqual([tarde.start, tarde.end]);
});

test("lo que se escribe: «1730», «17:30», «730», «7»", () => {
  expect(S.parseClock("1730")).toBe(1050);
  expect(S.parseClock("17:30")).toBe(1050);
  expect(S.parseClock("730")).toBe(450);
  expect(S.parseClock("7")).toBe(420);
  expect(S.parseClock("2350")).toBe(1430);
  expect(S.parseClock("2500")).toBeNull();
  expect(S.parseClock("1770")).toBeNull();
  expect(S.parseClock("")).toBeNull();
  expect(S.clockOfMin(1050)).toBe("17:30");
});

test("«Recién desperté» en Inicio: sin reloj, casi siempre; con reloj, solo si en tu mañana no llegó nada", () => {
  const base = { usualWake: 7.75 };
  expect(S.wakePrompt({ ...base, now: h(7, 1), lastWake: tarde.end, lastIsManual: true })).toBe(false); // recién anotó
  expect(S.wakePrompt({ ...base, now: h(7, 8), lastWake: tarde.end, lastIsManual: true })).toBe(true);
  expect(S.wakePrompt({ ...base, now: h(7, 8), lastWake: h(6, 7), lastIsManual: false })).toBe(true);
  expect(S.wakePrompt({ ...base, now: h(6, 22), lastWake: h(6, 7), lastIsManual: false })).toBe(false); // de noche, con reloj
  expect(S.wakePrompt({ ...base, now: h(7, 8), lastWake: h(7, 7), lastIsManual: false })).toBe(false);  // ya llegó
  expect(S.wakePrompt({ ...base, now: h(7, 8), lastWake: null, lastIsManual: false })).toBe(true);
});

test("el día de comida: lo que comes al despertar a las 23:50 no se junta con lo de antes de dormirte", () => {
  const ctx = { wakeAt: new Date(tarde.end).toISOString(), usualWake: 7.75 };
  expect(M.nutritionDayOf(new Date(h(6, 23, 55)), ctx).getDate()).toBe(7);
  expect(M.nutritionDayOf(new Date(h(7, 0, 40)), ctx).getDate()).toBe(7);
  expect(M.nutritionDayOf(new Date(h(7, 20)), ctx).getDate()).toBe(7);
  expect(M.nutritionDayOf(new Date(h(8, 1)), ctx).getDate()).toBe(7);   // sin haber dormido, sigue
  expect(M.nutritionDayOf(new Date(h(6, 16)), ctx).getDate()).toBe(6);  // antes de ese despertar
  expect(M.nutritionDayStart(new Date(h(7, 0)), ctx).getTime()).toBe(tarde.end);
  expect(M.wakeHourFor(ctx, new Date(h(7, 0, 40)))).toBeCloseTo(23.83, 1);
  // Sin eso (la noche de antes), igual que siempre
  const antes = { wakeAt: new Date(noche.end).toISOString(), usualWake: 7.75 };
  expect(M.nutritionDayOf(new Date(h(7, 0, 40)), antes).getDate()).toBe(6);
  expect(M.nutritionDayOf(new Date(h(6, 12)), antes).getDate()).toBe(6);
});

test("el horario tras despertar a las 23:50: primero desayuno, y el almuerzo al menos 2 h después", () => {
  const w = 23 + 50 / 60;
  expect(M.slotAt(0.5, { wakeHour: w })).toBe("desayuno");
  expect(M.slotAt(1.5, { wakeHour: w })).toBe("desayuno");
  expect(M.mealWindows(w).almuerzo[0]).toBeGreaterThanOrEqual(w + 2);
  // Quien despierta hasta las 15:00 sigue con su tabla de siempre
  expect(M.mealWindows(13).almuerzo[0]).toBe(15.5);
  expect(M.anchorHour(15)).toBe(12);
  expect(M.anchorHour(7.5)).toBe(7.5);
});

test("lo guardado: la respuesta queda con el tramo, no se pierde al anotar ni al corregir, y deshacer la borra", async () => {
  await St.addManualSleep(tarde.start, tarde.end);
  await St.addManualSleep(tarde.start, tarde.end);              // el mismo por la app y por el chat
  await St.saveWakeDecision(finTarde, "partir");
  await St.addManualSleep(h(7, 3), h(7, 8));
  let e = await St.loadSleepEdits();
  expect(e.manual.length).toBe(2);
  expect(e.decisions![finTarde]).toBe("partir");
  await St.excludeSleep(h(7, 3), h(7, 8));
  e = await St.loadSleepEdits();
  expect(e.manual.length).toBe(1);
  expect(e.decisions![finTarde]).toBe("partir");
  await St.clearSleepEdits(h(6, 12), h(7, 12));
  e = await St.loadSleepEdits();
  expect(e.manual.length).toBe(0);
  expect(e.decisions![finTarde]).toBeUndefined();
});

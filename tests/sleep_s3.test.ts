// Sueño 2.0 · S3: el sueño en el resto del día — entrenar (3 noches + deuda), la recomendación del día (comida primero, con
// diabetes el azúcar), el entreno cerca de la hora de dormir y el café después de la hora límite.
import { test, expect } from "bun:test";
process.env.TZ = "America/Santiago";
import {
  sleepReadiness, sleepDayTip, trainingTimeNote, isCaffeinated, lateCaffeine, lastSleepFrom, planTitle, sleepInsights, hhmmOf,
  type RawSession,
} from "C:/Proyectos/eris-mobile/src/services/sleep/sleepCore.ts";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const noche = (d: number, h: number, m: number, horas: number): RawSession => { const s = at(d, h, m); return { start: s, end: s + horas * 3600_000 }; };
const regulares = Array.from({ length: 14 }, (_, i) => noche(10 + i, 0, 30, 7.25));
const bien = sleepInsights(regulares, { now: at(23, 20), usualWake: 7.75 });
const cortas = sleepInsights(Array.from({ length: 10 }, (_, i) => noche(14 + i, 1, 30, 5.5)), { now: at(23, 20), usualWake: 7 });

test("lo de anoche desde el snapshot (el mismo en la app y el servidor)", () => {
  expect(lastSleepFrom({ durationHours: 9.52, nightHours: 5.48, split: true, episodes: [{ kind: "noche" }, { kind: "segundo" }] }))
    .toEqual({ totalH: 9.52, nightH: 5.48, split: true, secondSleep: true });
  expect(lastSleepFrom({ durationHours: 0 })).toBeNull();
  expect(lastSleepFrom(null)).toBeNull();
});

test("entrenar: normal si vienes bien; suave con una noche corta o partida; liviano con 3 noches cortas o mucha deuda", () => {
  expect(sleepReadiness(bien, { totalH: 7.25 })!.level).toBe("normal");
  expect(sleepReadiness(bien, { totalH: 7.25 })!.tip).toBe("Entrena normal.");
  const una = sleepReadiness(bien, { totalH: 5.6 })!;
  expect(una.level).toBe("suave");
  expect(una.why).toBe("Dormiste 5 h 36.");
  // El 24-10: 9 h 31 en total pero la noche de 5 h 29, partida → suave (no «descansaste lo suficiente»)
  const partida = sleepReadiness(bien, { totalH: 9.52, nightH: 5.48, split: true })!;
  expect(partida.level).toBe("suave");
  expect(partida.why).toContain("partida");
  // 10 noches de 5 h 30 → liviano: lo dicen las 3 noches y la deuda, no una sola
  const r = sleepReadiness(cortas, { totalH: 6.2 })!;
  expect(r.level).toBe("liviano");
  expect(r.why).toMatch(/3 noches de ~5 h 30/);
  expect(r.why).toMatch(/deuda/);
  expect(r.tip).toMatch(/una serie menos/);
  expect(sleepReadiness(bien, null)).toBeNull();
  // Sin las 2 semanas: solo lo de anoche
  expect(sleepReadiness(null, { totalH: 4.5 })!.level).toBe("liviano");
});

test("la recomendación del día: una sola, la comida primero; con diabetes, el azúcar", () => {
  expect(sleepDayTip(bien, { totalH: 7.25 })).toBeNull();
  const c = sleepDayTip(bien, { totalH: 5.2 })!;
  expect(c.kind).toBe("corta");
  expect(c.sub).toMatch(/proteína en el desayuno/);
  const d = sleepDayTip(bien, { totalH: 5.2 }, { diabetic: true })!;
  expect(d.title).toMatch(/cuida el azúcar/);
  expect(d.sub).toMatch(/caminata de 10 min después de comer/);
  expect(d.sub).not.toMatch(/insulina|dosis|metformina/i);
  // Partida con segundo sueño: acostarse cuando dé sueño; sin él: siesta corta
  expect(sleepDayTip(bien, { totalH: 9.52, nightH: 5.48, split: true, secondSleep: true })!.sub).toMatch(/cuando te dé sueño/);
  expect(sleepDayTip(bien, { totalH: 7.3, nightH: 5.5, split: true })!.sub).toMatch(/siesta de 20 min/);
  // Durmió bien anoche pero arrastra deuda
  const deuda = sleepDayTip(cortas, { totalH: 7.5 })!;
  expect(deuda.kind).toBe("deuda");
  expect(deuda.sub).toMatch(/acuéstate desde las/);
});

test("entreno tarde: avisa solo si termina a menos de 1 h de acostarse", () => {
  // Se acuesta ~00:15 (7:45 − 7,5 h)
  expect(hhmmOf(bien.bedtime.target)).toBe("00:15");
  expect(trainingTimeNote(19, bien)).toBeNull();
  expect(trainingTimeNote(22, bien)).toBeNull();           // termina 23:00, 1 h 15 antes
  expect(trainingTimeNote(22.5, bien)).toMatch(/^Tu entreno de las 22:30 terminaría cerca de tu hora de dormir \(~00:15\)/);
  expect(trainingTimeNote(7, bien)).toBeNull();            // de mañana, nunca
  expect(trainingTimeNote(23, null)).toBeNull();
});

test("café: qué tiene cafeína y cuándo es tarde (sin culpa)", () => {
  for (const n of ["Café con leche", "Cappuccino", "Coca-Cola Zero", "Té verde", "Mate", "Red Bull", "Nescafé"]) expect(isCaffeinated(n)).toBe(true);
  for (const n of ["Café descafeinado", "Tomate", "Chocolate", "Té de hierbas", "Coca-Cola sin cafeína", "Agua"]) expect(isCaffeinated(n)).toBe(false);
  expect(hhmmOf(bien.caffeineUntil)).toBe("18:15");
  expect(lateCaffeine([{ name: "Café", at: at(23, 16, 0) }], bien)).toBeNull();
  const t = lateCaffeine([{ name: "Café", at: at(23, 9, 0) }, { name: "Cappuccino", at: at(23, 20, 30) }], bien)!;
  expect(t.name).toBe("Cappuccino");
  expect(t.text).toBe("Tomaste cappuccino a las 20:30, después de tu hora límite (18:15): la cafeína dura horas y puede quitarte sueño sin que lo notes. Por hoy no pasa nada; mañana, mejor antes.");
  // De madrugada (antes de despertar) cuenta como la noche anterior: tarde
  expect(lateCaffeine([{ name: "Monster", at: at(23, 1, 30) }], bien)).not.toBeNull();
  expect(lateCaffeine([{ name: "Café", at: at(23, 21) }], null)).toBeNull();
});

test("nombre del plan", () => {
  expect(planTitle({ kind: "despertar", targetH: 7.5 })).toBe("Levántate a la misma hora");
  expect(planTitle({ kind: "duracion", targetH: 7.5 })).toBe("Dormir 7 h 30");
});

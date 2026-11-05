// Pasos y calorías hasta que te duermes (pedido del usuario, 2026-11-05): la actividad usa el día de COMIDA, no la medianoche
process.env.TZ = "America/Santiago";
import { test, expect } from "bun:test";
import { diaActivo } from "C:/Proyectos/eris-mobile/src/services/activityDay.ts";
import { nutritionDayStart } from "C:/Proyectos/eris-mobile/src/services/mealSchedule.ts";

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m);
const iso = (d: number) => `2026-11-${String(d).padStart(2, "0")}`;

test("un día normal: desde que despertaste (como antes)", () => {
  const a = diaActivo(at(5, 15), { wakeAt: at(5, 8), usualWake: 8 }, at(5, 8));
  expect(a.clave).toBe(iso(5));
  expect(a.desde.getTime()).toBe(at(5, 8).getTime());
});

test("trasnochando: a la 1:30 sin dormir siguen contando los pasos del día (desde que despertaste ayer)", () => {
  const ctx = { wakeAt: at(4, 9), usualWake: 9 };
  const a = diaActivo(at(5, 1, 30), ctx, at(4, 9));
  expect(a.clave).toBe(iso(4)); // el mismo día que la comida y el agua
  expect(a.desde.getTime()).toBe(at(4, 9).getTime()); // no la medianoche
  // y a las 23:50 de ese día, igual
  expect(diaActivo(at(4, 23, 50), ctx, at(4, 9)).desde.getTime()).toBe(at(4, 9).getTime());
});

test("al despertar empieza el día nuevo", () => {
  // durmió de 2:00 a 10:00: a las 12:00 cuenta desde las 10
  const a = diaActivo(at(5, 12), { wakeAt: at(5, 10), usualWake: 9 }, at(5, 10));
  expect(a.clave).toBe(iso(5));
  expect(a.desde.getTime()).toBe(at(5, 10).getTime());
});

test("despertar tarde (14:00): lo de la madrugada sin dormir fue del día anterior", () => {
  const a = diaActivo(at(5, 16), { wakeAt: at(5, 14), usualWake: 9 }, at(5, 14));
  expect(a.clave).toBe(iso(5));
  expect(a.desde.getTime()).toBe(at(5, 14).getTime());
});

test("una noche sin dormir: el día cambia a la hora en que suele empezar tu mañana (como la comida)", () => {
  const ctx = { wakeAt: at(4, 8), usualWake: 8 };
  const madrugada = diaActivo(at(5, 3), ctx, at(4, 8));
  expect(madrugada.clave).toBe(iso(4));
  const manana = diaActivo(at(5, 11), ctx, at(4, 8));
  expect(manana.clave).toBe(iso(5));
  expect(manana.desde.getTime()).toBe(nutritionDayStart(new Date(2026, 10, 5), ctx).getTime());
  expect(manana.desde.getTime()).toBeLessThanOrEqual(at(5, 11).getTime());
});

test("sin datos de sueño: desde el inicio del día de comida, nunca después de ahora", () => {
  const a = diaActivo(at(5, 15), {}, null);
  expect(a.clave).toBe(iso(5));
  expect(a.desde.getTime()).toBeLessThanOrEqual(at(5, 15).getTime());
  expect(a.desde.getDate()).toBe(5);
  // un despertar «en el futuro» (reloj raro) no se usa
  expect(diaActivo(at(5, 15), { wakeAt: at(5, 8) }, at(5, 18)).desde.getTime()).not.toBe(at(5, 18).getTime());
});

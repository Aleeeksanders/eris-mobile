// Forge — la recuperación con evidencia y con tus datos (2026-11-06). Sale de: «me dice que ya estoy listo pero aún tengo las
// agujetas del miércoles». Antes contaba días de calendario y no miraba el esfuerzo.
process.env.TZ = "America/Santiago";
import { test, expect } from "bun:test";
import * as C from "C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts";
import * as Rc from "C:/Proyectos/eris-mobile/src/services/forge/forgeRecovery.ts";
import { defaultGym } from "C:/Proyectos/eris-mobile/src/services/forge/forgeCatalog.ts";

const base = () => { const s = C.newState(); s.bodyKg = 85; s.sex = "h"; s.age = 27; s.heightCm = 179; s.gym = defaultGym("smartfit"); return s; };
const dia = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();

/** Su sesión real del miércoles 4 de noviembre */
function miercoles() {
  let s = base();
  const hoyD = dia(2026, 11, 4);
  for (const [r, k] of [[12, 0], [12, 1], [12, 2]]) s = C.logSet(s, hoyD, "press_pecho_maq", { reps: r, kg: 110, unit: "lb", rir: 1, at: at(2026, 11, 4, 21, 38 + k * 3) });
  for (const [r, rir, k] of [[8, 1, 0], [8, 0, 1], [6, 0, 2]]) s = C.logSet(s, hoyD, "dips_ej", { reps: r, rir, at: at(2026, 11, 4, 21, 50 + k * 3) });
  return s;
}

test("el caso real: el viernes a las 00:00 (~26 h) ya no dice «listo»; rango por dosis y por lo poco habitual", () => {
  const s = miercoles();
  const r = Rc.muscleRecovery(s, "pec_med", new Date(2026, 10, 6, 0, 0));
  expect(r.hoursAgo).toBeLessThan(28);
  expect(r.sets).toBeGreaterThanOrEqual(6);
  expect(r.fallo).toBe(1);
  expect(r.habitual).toBe(false);
  expect(r.range).toEqual([48, 96]); // mucho volumen al fallo + poco habitual
  expect(r.state).toBe("cargado");
  expect(Rc.muscleRecovery(s, "pec_med", new Date(2026, 10, 7, 12, 0)).state).toBe("probable"); // ~62 h
  expect(Rc.muscleRecovery(s, "pec_med", new Date(2026, 10, 9, 12, 0)).state).toBe("listo"); // ~110 h
});

test("registrar «ayer» hoy no reinicia el reloj: `at` es cuándo se anotó, no cuándo se hizo", () => {
  let s = base();
  const ayer = dia(2026, 11, 4);
  const anotado = at(2026, 11, 6, 7, 0); // lo anota el viernes
  for (let k = 0; k < 3; k++) s = C.logSet(s, ayer, "press_pecho_maq", { reps: 12, kg: 110, unit: "lb", rir: 1, at: anotado + k });
  const r = Rc.muscleRecovery(s, "pec_med", new Date(2026, 10, 6, 8, 0));
  expect(r.hoursAgo).toBe(44); // desde el mediodía del miércoles, no 1 h
});

test("el rango depende de lo que hiciste, no de un número fijo (Refalo 2023, Morán-Navarro 2017)", () => {
  expect(Rc.recoveryRange(3, 0, true)).toEqual([12, 24]); // poco y lejos del fallo
  expect(Rc.recoveryRange(4, 0, true)).toEqual([24, 48]);
  expect(Rc.recoveryRange(3, 1, true)).toEqual([24, 48]); // poco pero al fallo
  expect(Rc.recoveryRange(6, 1, true)).toEqual([48, 72]); // mucho y al fallo
  expect(Rc.recoveryRange(6, 1, false)).toEqual([48, 96]); // y no lo entrenas seguido
  expect(Rc.recoveryRange(8, 0, true)).toEqual([24, 48]); // mucho volumen lejos del fallo
});

test("entrenar seguido cuenta como habitual; sin trabajo no inventa", () => {
  let s = miercoles();
  s = C.logSet(s, dia(2026, 10, 25), "press_pecho_maq", { reps: 12, kg: 100, unit: "lb", rir: 2, at: at(2026, 10, 25, 20) });
  s = C.logSet(s, dia(2026, 10, 25), "press_pecho_maq", { reps: 12, kg: 100, unit: "lb", rir: 2, at: at(2026, 10, 25, 20, 3) });
  s = C.logSet(s, dia(2026, 10, 18), "press_pecho_maq", { reps: 12, kg: 100, unit: "lb", rir: 2, at: at(2026, 10, 18, 15) });
  s = C.logSet(s, dia(2026, 10, 18), "press_pecho_maq", { reps: 12, kg: 100, unit: "lb", rir: 2, at: at(2026, 10, 18, 15, 3) });
  expect(Rc.muscleRecovery(s, "pec_med", new Date(2026, 10, 6)).habitual).toBe(true);
  expect(Rc.muscleRecovery(s, "gemelos", new Date(2026, 10, 6))).toMatchObject({ state: "sin_datos", range: null });
});

test("lo que dices manda: «me limita» = cargado; «sin molestia» pasado el mínimo = recuperado; agujetas no cambia la estimación", () => {
  const s = miercoles();
  const ahora = new Date(2026, 10, 7, 12, 0);
  const t = ahora.getTime();
  const decir = (n: Rc.Soreness) => Rc.recordSoreness(s, n, ["pec_med"], dia(2026, 11, 4), t - 3_600_000);
  expect(Rc.muscleRecovery(decir("limita"), "pec_med", ahora)).toMatchObject({ state: "cargado", soreness: "limita" });
  expect(Rc.muscleRecovery(decir("nada"), "pec_med", ahora)).toMatchObject({ state: "listo", soreness: "nada" });
  expect(Rc.muscleRecovery(decir("molesta"), "pec_med", ahora)).toMatchObject({ state: "probable", soreness: "molesta" });
  // Antes del mínimo, «sin molestia» no adelanta: el dolor y la función van por separado (Flatt 2019)
  const temprano = new Date(2026, 10, 5, 22, 0);
  expect(Rc.muscleRecovery(Rc.recordSoreness(s, "nada", ["pec_med"], dia(2026, 11, 4), temprano.getTime()), "pec_med", temprano).state).toBe("cargado");
  // Lo de ayer ya no cuenta
  expect(Rc.muscleRecovery(decir("limita"), "pec_med", new Date(2026, 10, 8, 18, 0)).soreness).toBeNull();
});

test("la pregunta aparece entre 12 y 96 h, una vez al día, con los músculos que más trabajaste", () => {
  const s = miercoles();
  expect(Rc.sorenessPrompt(s, new Date(2026, 10, 5, 2, 0))).toBeNull(); // menos de 12 h
  const q = Rc.sorenessPrompt(s, new Date(2026, 10, 6, 8, 0))!;
  expect(q.day).toBe(dia(2026, 11, 4));
  expect(q.subs).toContain("pec_med");
  expect(q.nombres.length).toBeGreaterThan(0);
  const r = Rc.recordSoreness(s, "molesta", q.subs, q.day, new Date(2026, 10, 6, 8, 0).getTime());
  expect(Rc.sorenessPrompt(r, new Date(2026, 10, 6, 12, 0))).toBeNull(); // ya respondió
  expect(Rc.sorenessPrompt(s, new Date(2026, 10, 10, 8, 0))).toBeNull(); // más de 96 h
});

// ─── Lo que aprende de ti ─────────────────────────────────────────────────────────────────────
/** Press de banca: una sesión larga cada semana y vueltas rápidas, con el rendimiento que se indique */
function conHistoria(gaps: Array<[number, number]>) {
  let s = base();
  let t = at(2026, 8, 1, 18);
  s = C.logSet(s, dia(2026, 8, 1), "press_banca", { reps: 8, kg: 60, rir: 2, at: t });
  for (const [horas, reps] of gaps) {
    t += horas * 3_600_000;
    const d = new Date(t);
    s = C.logSet(s, dia(d.getFullYear(), d.getMonth() + 1, d.getDate()), "press_banca", { reps, kg: 60, rir: 2, at: t });
  }
  return s;
}

test("sin vueltas cortas lo dice en vez de inventar (su caso real: siempre 8 días o más)", () => {
  const s = conHistoria([[192, 8], [192, 8], [408, 8]]);
  const yo = Rc.personalRecovery(s, new Date(2026, 9, 10));
  expect(yo.corto).toBeNull();
  expect(yo.medio).toBeNull();
  expect(yo.minGapH).toBeGreaterThanOrEqual(96);
  expect(yo.texto).toContain("Todavía no puedo medir");
  expect(yo.texto).toContain("8 días");
  expect(Rc.personalRecovery(base()).texto).toContain("pocas comparaciones");
});

test("con datos, mide su rendimiento relativo y corrige el rango", () => {
  // 3 vueltas largas de referencia, y 3 vueltas a ~30 h rindiendo igual
  const bien = conHistoria([[200, 8], [200, 8], [200, 8], [200, 8], [30, 8], [200, 8], [30, 8], [200, 8], [30, 8]]);
  const yo = Rc.personalRecovery(bien, new Date(2026, 11, 1));
  expect(yo.corto!.n).toBe(3);
  expect(yo.corto!.ratio).toBeGreaterThan(0.95);
  expect(yo.texto).toContain("antes de 48 h");
  expect(Rc.recoveryRange(6, 1, false, yo)).toEqual([24, 48]); // se recupera más rápido que el promedio
  // Vuelve entre 48 y 96 h y rinde claramente menos
  const mal = conHistoria([[200, 10], [200, 10], [200, 10], [200, 10], [60, 6], [200, 10], [60, 6], [200, 10], [60, 6]]);
  const yo2 = Rc.personalRecovery(mal, new Date(2026, 11, 1));
  expect(yo2.medio!.ratio).toBeLessThan(0.93);
  expect(Rc.recoveryRange(6, 1, true, yo2)).toEqual([48, 96]);
});

test("cruza agujetas con rendimiento: es la pregunta del usuario, con sus datos", () => {
  let s = conHistoria([[200, 8], [200, 8]]);
  let t = at(2026, 8, 18, 18);
  for (let k = 0; k < 3; k++) {
    s = Rc.recordSoreness(s, "molesta", ["pec_med"], "x", t + 40 * 3_600_000);
    t += 48 * 3_600_000;
    const d = new Date(t);
    s = C.logSet(s, dia(d.getFullYear(), d.getMonth() + 1, d.getDate()), "press_banca", { reps: 8, kg: 60, rir: 2, at: t });
  }
  const pares = Rc.recoveryPairs(s, new Date(2026, 11, 1));
  expect(pares.filter((p) => p.soreness === "molesta").length).toBeGreaterThanOrEqual(2);
  const yo = Rc.personalRecovery(s, new Date(2026, 11, 1));
  expect(yo.conAgujetas!.n).toBeGreaterThanOrEqual(2);
});

test("lo que va al chat: acotado, sin músculos viejos, con lo que Forge sabe de ti", () => {
  const s = miercoles();
  const r = Rc.recoverySummary(s, new Date(2026, 10, 6, 8, 0));
  expect(r.musculos.length).toBeGreaterThan(0);
  expect(r.musculos.length).toBeLessThanOrEqual(8);
  expect(r.musculos[0].state).toBe("cargado");
  expect(r.personal.length).toBeGreaterThan(10);
  expect(JSON.stringify(r).length).toBeLessThan(2500);
  expect(Rc.recoverySummary(s, new Date(2026, 10, 20)).musculos).toEqual([]);
});

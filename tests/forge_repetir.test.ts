// Forge — «Repetir un día» (pedido del usuario, 2026-11-04): lo que hice el domingo pasa al plan de hoy
process.env.TZ = "America/Santiago";
import { test, expect } from "bun:test";
import * as C from "C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts";
import * as R from "C:/Proyectos/eris-mobile/src/services/forge/forgeRoutine.ts";
import { defaultGym } from "C:/Proyectos/eris-mobile/src/services/forge/forgeCatalog.ts";

const tk = C.L.todayKey();
const hace = (n: number) => { const [y, m, d] = tk.split("-").map(Number); const f = new Date(y, m - 1, d - n); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`; };
const base = () => { const s = C.newState(); s.bodyKg = 80; s.sex = "h"; s.age = 30; s.heightCm = 175; s.gym = defaultGym("smartfit"); return s; };
const serie = (reps: number, kg?: number, extra: Partial<C.FSet> = {}, at = 0) => ({ reps, ...(kg != null ? { kg } : {}), rir: 2, at, ...extra });

function conDomingo() {
  let s = base();
  const dom = hace(3);
  // en este orden: press de banca (con calentamiento), remo, sentadilla en pirámide
  s = C.logSet(s, dom, "press_banca", serie(10, 20, { warmup: true }, 1));
  for (const k of [2, 3, 4]) s = C.logSet(s, dom, "press_banca", serie(8, 60, {}, k));
  for (const k of [5, 6, 7]) s = C.logSet(s, dom, "remo_bb", serie(10, 50, {}, k));
  s = C.logSet(s, dom, "sentadilla_bb", serie(10, 80, {}, 8));
  s = C.logSet(s, dom, "sentadilla_bb", serie(8, 90, {}, 9));
  s = C.logSet(s, dom, "sentadilla_bb", serie(6, 100, {}, 10));
  // otro día anterior, y uno de hoy que no se ofrece
  s = C.logSet(s, hace(5), "dom_asist", serie(6, undefined, {}, 1));
  s = C.logSet(s, tk, "curl_bb", serie(12, 25, {}, 1));
  return { s, dom };
}

test("los días entrenados: del más reciente al más antiguo, sin hoy, con ejercicios y series de trabajo", () => {
  const { s, dom } = conDomingo();
  const dias = R.trainedDays(s);
  expect(dias.map((d) => d.day)).toEqual([dom, hace(5)]);
  expect(dias[0].exIds).toEqual(["press_banca", "remo_bb", "sentadilla_bb"]); // el orden en que se hicieron
  expect(dias[0].sets).toBe(9); // sin el calentamiento
  expect(dias[0].label).toMatch(/^(domingo|lunes|martes|miércoles|jueves|viernes|sábado) \d+ [a-z]{3}$/);
});

test("repetir: el plan de hoy queda con esos ejercicios, las mismas series y lo que se hizo como objetivo", () => {
  const { s, dom } = conDomingo();
  const n = R.repeatDay({ ...s, plan: { curl_bb: 3 } }, dom);
  expect(Object.keys(n.plan)).toEqual(["press_banca", "remo_bb", "sentadilla_bb"]); // reemplaza: sin el curl
  expect(n.plan.press_banca).toBe(3);
  expect(n.planDay).toMatchObject({ day: tk, repetido: dom });
  expect(n.planDay.name).toMatch(/^Repite el /);
  const t = n.planDay.targets;
  expect(t.press_banca).toMatchObject({ sets: 3, repMin: 8, repMax: 8, kg: 60, rir: 2 });
  // pirámide: la carga más alta entre las más usadas (cada una una vez) y sus reps
  expect(t.sentadilla_bb).toMatchObject({ sets: 3, kg: 100, repMin: 6, repMax: 6 });
  expect(t.remo_bb.why).toMatch(/^como el /);
  // nada se anotó como hecho
  expect(n.sessions[tk]).toEqual(s.sessions[tk]);
  // y el texto que muestra Entrenar
  expect(R.targetText(n, t.press_banca)).toBe("3×8 · RIR 2 · 60 kg");
});

test("sumar: agrega a lo que ya había hoy sin quitar nada", () => {
  const { s, dom } = conDomingo();
  const n = R.repeatDay({ ...s, plan: { curl_bb: 4 } }, dom, "sumar");
  expect(n.plan).toMatchObject({ curl_bb: 4, press_banca: 3, remo_bb: 3, sentadilla_bb: 3 });
});

test("lo que no se puede repetir: hoy, un día sin series o un día futuro dejan todo igual", () => {
  const { s } = conDomingo();
  expect(R.repeatDay(s, tk)).toBe(s);
  expect(R.repeatDay(s, hace(1))).toBe(s);
  expect(R.repeatDay(s, "2099-01-01")).toBe(s);
  expect(R.diaEntrenado(s, hace(1))).toBeNull();
});

test("la rutina no lo pisa hoy: «¿qué me toca?» (lo que lee el chat) dice el día repetido", () => {
  const { s, dom } = conDomingo();
  const r = R.buildRoutine(s, { days: 3 });
  const conRutina = R.setRoutinePlan(s, r);
  const n = R.repeatDay(conRutina, dom);
  const hoy = R.routineToday(n)!;
  expect(hoy.name).toMatch(/^Repite el /);
  expect(hoy.items.length).toBe(3);
  // el paso de día solo recarga la rutina cuando el plan es de otro día
  expect(n.planDay.day).toBe(tk);
});

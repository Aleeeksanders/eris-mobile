// forgeRoutine (F5): generador, cargas reales, progresión doble, descargas, plan del día y score de entrenamiento.
import { test, expect } from "bun:test";
import * as C from "C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts";
import * as R from "C:/Proyectos/eris-mobile/src/services/forge/forgeRoutine.ts";
import { defaultGym, dbWeights } from "C:/Proyectos/eris-mobile/src/services/forge/forgeCatalog.ts";
const L = C.L;
const ago = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const base = () => { const s = C.newState(); s.bodyKg = 85; s.sex = "h"; s.age = 27; s.heightCm = 179; s.gym = defaultGym("smartfit"); return s; };

test("división según los días, todos los patrones y equilibrio, ≥10 series por músculo principal si cabe", () => {
  const s = base();
  const r3 = R.buildRoutine(s, { days: 3, minutes: 60, goal: "hipertrofia" });
  expect(r3.split).toBe("full");
  expect(r3.days.map((d) => d.id)).toEqual(["A", "B", "C"]);
  const pats = new Set(r3.days.flatMap((d) => d.items.map((i) => C.BASE_BY_ID[i.exId].pattern)));
  for (const p of ["sentadilla", "bisagra", "emp_h", "emp_v", "tir_h", "tir_v"]) expect(pats.has(p as any)).toBe(true);
  const w = R.routineWeeklySets(s, r3);
  console.log("3 días:", r3.days.map((d) => `${d.id}: ${d.items.map((i) => `${i.exId}×${i.sets}`).join(", ")}`), "\nsemana:", w);
  expect(w.pec_med).toBeGreaterThanOrEqual(8);
  expect(Math.min(w.dorsal, w.pec_med) / Math.max(w.dorsal, w.pec_med)).toBeGreaterThan(0.6); // empuje ≈ tirón
  expect(R.buildRoutine(s, { days: 4 }).split).toBe("torso_pierna");
  const r6 = R.buildRoutine(s, { days: 6, minutes: 75 });
  expect(r6.split).toBe("ppl");
  expect(r6.days.length).toBe(6);
  // cabe en los minutos
  for (const d of R.buildRoutine(s, { days: 3, minutes: 30 }).days) expect(d.items.reduce((a, i) => a + i.sets, 0)).toBeLessThanOrEqual(Math.floor(30 / 2.6));
});

test("en casa solo lo que se puede en casa; con lumbar no hay básicos que la carguen; principiante sin técnica avanzada", () => {
  const s = { ...base(), gym: { ...defaultGym("casa"), dbList: [5, 7, 10, 12] } };
  const r = R.buildRoutine(s, { days: 3, where: "casa" });
  for (const d of r.days) for (const i of d.items) {
    const e = C.BASE_BY_ID[i.exId];
    expect(e.home).toBe(true);
    expect(["bw", "db", "kb", "iso", "banda"]).toContain(e.eq);
    expect(e.level).toBeLessThan(3);
  }
  const g = R.buildRoutine(base(), { days: 3, care: ["lumbar"] });
  const bigLumbar = g.days.flatMap((d) => d.items).filter((i) => (C.BASE_BY_ID[i.exId].care ?? []).includes("lumbar") && C.BASE_BY_ID[i.exId].big);
  expect(bigLumbar).toEqual([]);
  expect(g.notes.join(" ")).toContain("lumbar");
});

test("cargas de arranque desde tu máximo, al peso REAL de abajo; lo nuevo sin peso", () => {
  let s = base();
  for (let i = 0; i < 3; i++) s = C.logSet(s, ago(5), "press_banca_db", { reps: 8, kg: 24, rir: 2 }); // máximo ≈ 24 × (1 + 10/30) = 32
  const it = R.startLoad(s, C.BASE_BY_ID.press_banca_db, 10, 2, 32)!;
  // 32 / (1 + 12/30) = 22,9 → la mancuerna de abajo que existe: 22 (de 2 en 2 sobre 10)
  expect(it.kg).toBe(22);
  expect(dbWeights(s.gym!)).toContain(22);
  expect(R.startLoad(s, C.BASE_BY_ID.flexiones, 10, 2, 50)).toBeNull();
  const r = R.buildRoutine(s, { days: 3, goal: "hipertrofia" });
  const bench = r.days.flatMap((d) => d.items).find((i) => i.exId === "press_banca_db");
  if (bench) expect(dbWeights(s.gym!)).toContain(bench.kg!);
});

test("doble progresión: tope de reps → siguiente peso real; si no, +1 rep; asistida: menos ayuda; descarga si se estanca", () => {
  let s = base();
  const item: R.RoutineItem = { exId: "press_banca_db", sets: 3, repMin: 8, repMax: 10, rir: 2, kg: 20 };
  for (let i = 0; i < 3; i++) s = C.logSet(s, ago(2), "press_banca_db", { reps: 10, kg: 20, rir: 2 });
  expect(R.nextTarget(s, item)).toMatchObject({ kg: 22, why: expect.stringContaining("siguiente peso") });
  let t = base();
  for (const r of [10, 9, 8]) t = C.logSet(t, ago(2), "press_banca_db", { reps: r, kg: 20, rir: 2 });
  expect(R.nextTarget(t, item)).toMatchObject({ kg: 20, repMin: 9 });
  let a = base();
  const asItem: R.RoutineItem = { exId: "dom_asist", sets: 3, repMin: 6, repMax: 10, rir: 2, kg: 30 };
  for (let i = 0; i < 3; i++) a = C.logSet(a, ago(2), "dom_asist", { reps: 10, assist: 30, rir: 2 });
  expect(R.nextTarget(a, asItem).kg).toBe(25); // un escalón menos de ayuda
  // estancado 3 sesiones: descarga (~10 % menos y una serie menos)
  let st = base();
  for (const d of [9, 6, 3]) for (let i = 0; i < 3; i++) st = C.logSet(st, ago(d), "press_banca_db", { reps: 8, kg: 30, rir: 2 });
  const dl = R.nextTarget(st, { ...item, kg: 30 });
  expect(dl.deload).toBe(true);
  expect(dl.kg).toBe(26); // 27 → la de abajo que existe
  expect(dl.sets).toBe(2);
  // dormir mal también descarga
  expect(R.nextTarget(t, item, { sleepPoor: true }).deload).toBe(true);
});

test("plan del día desde la rutina, el día que sigue, texto y validación", () => {
  let s = base();
  const r = R.buildRoutine(s, { days: 3 });
  s = R.setRoutinePlan(s, r);
  expect(s.planDay.id).toBe("A");
  expect(Object.keys(s.plan)).toEqual(r.days[0].items.map((i) => i.exId));
  // entrenó el día A ayer → hoy toca B
  for (const it of r.days[0].items) s = C.logSet(s, ago(1), it.exId, { reps: it.repMin, kg: it.kg, rir: 2 });
  expect(R.nextRoutineDay(s, r).id).toBe("B");
  s = R.loadRoutineDay(s);
  expect(s.planDay.name).toContain("Día B");
  const md = R.routineToMd(s, r);
  expect(md).toContain("## Día A");
  expect(md).toContain("| Ejercicio | Series | Reps | RIR | Peso |");
  expect(R.targetText(s, { exId: "press_banca_db", sets: 3, repMin: 8, repMax: 10, rir: 2, kg: 22 })).toBe("3×8–10 · RIR 2 · 22 kg");
  expect(R.sanitizeRoutine(s, { days: [{ items: [{ exId: "no_existe" }, { exId: "jalon", sets: 3 }] }] })!.days[0].items.map((i) => i.exId)).toEqual(["jalon"]);
  // cambiar un ejercicio por su alternativa
  const sw = R.swapExercise(s, r, r.days[0].items[0].exId);
  expect(sw.to).not.toBeNull();
});

test("score de entrenamiento: constancia, progresión, equilibrio, RIR y sueño", () => {
  let s = base();
  for (const d of [27, 24, 20, 17, 13, 10, 6, 3]) {
    s = C.logSet(s, ago(d), "press_banca_db", { reps: 8, kg: 20 + (27 - d) / 3, rir: 2 });
    s = C.logSet(s, ago(d), "jalon", { reps: 10, kg: 50, rir: 2 });
    s = C.logSet(s, ago(d), "sentadilla_bb", { reps: 6, kg: 80, rir: 2 });
  }
  const sc = R.trainingScore(s, { sleepAvgH: 7.2 })!;
  console.log(sc.score, sc.parts.map((p) => `${p.label} ${p.pts}/${p.max} (${p.note})`));
  expect(sc.score).toBeGreaterThan(40);
  expect(sc.parts.find((p) => p.key === "rir")!.pts).toBe(15);
  expect(R.trainingScore(base())).toBeNull();
});

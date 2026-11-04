// forgeStrength (F4): estándares de Strength Level, score de fuerza, series de la semana y árbol automático.
import { test, expect } from "bun:test";
import * as C from "C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts";
import * as S from "C:/Proyectos/eris-mobile/src/services/forge/forgeStrength.ts";
const L = C.L;
const tk = () => L.todayKey();
const ago = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const base = (sex: "h" | "m" = "h", kg = 85) => { const s = C.newState(); s.bodyKg = kg; s.sex = sex; s.age = 27; s.heightCm = 179; return s; };

test("cortes interpolados por peso (tabla de Strength Level) y percentil", () => {
  expect(S.thresholdsFor("bench", "h", 80)).toEqual([56, 75, 98, 124, 151]);
  const t85 = S.thresholdsFor("bench", "h", 85)!;
  expect(t85[2]).toBeCloseTo(103.5, 1); // entre 98 (80 kg) y 109 (90 kg)
  expect(S.rateLift("bench", "h", 80, 98)!.pct).toBe(50);
  expect(S.rateLift("bench", "h", 80, 98)!.name).toBe("Intermedio");
  expect(S.rateLift("bench", "h", 80, 111)!.pct).toBe(65); // a mitad de camino entre intermedio (50) y avanzado (80)
  expect(S.rateLift("bench", "h", 80, 30)!.name).toBe("Empezando");
  expect(S.rateLift("bench", "m", 60, 47)!.name).toBe("Intermedio");
  expect(S.rateLift("bench", "h", 80, 98)!.next).toEqual({ name: "Avanzado", kg: 124 });
});

test("1RM real de tus series: con RIR, asistidas cuentan su carga, no se estima con RIR alto", () => {
  let s = base();
  s = C.logSet(s, ago(3), "press_banca", { reps: 5, kg: 90, rir: 1 });   // 90 × (1 + 6/30) = 108
  s = C.logSet(s, ago(3), "press_banca", { reps: 12, kg: 60, rir: 0 });  // 12 reps: no estima
  s = C.logSet(s, ago(2), "dom_asist", { reps: 8, assist: 25, rir: 2 }); // (85 − 25) × (1 + 10/30) = 80
  s = C.logSet(s, ago(2), "sentadilla_bb", { reps: 5, kg: 100, rir: 5 }); // RIR alto: no estima
  const r = S.liftRatings(s);
  const bench = r.find((x) => x.lift === "bench")!;
  expect(bench.e1rm).toBe(108);
  const pull = r.find((x) => x.lift === "pullup")!;
  expect(pull.e1rm).toBe(80);
  expect(pull.name).toBe("Dominadas");
  expect(r.some((x) => x.lift === "squat")).toBe(false);
  const sc = S.strengthScore(s)!;
  console.log(r.map((x) => `${x.name} ${x.e1rm} ${x.levelName} ${x.pct}%`), "score", sc.score, sc.missing);
  expect(sc.missing).toEqual(["pierna"]);
  expect(sc.score).toBe(Math.round((bench.pct + pull.pct) / 2));
});

test("series de la semana por músculo (principal 1, secundario ½) y su estado", () => {
  let s = base();
  for (let i = 0; i < 4; i++) s = C.logSet(s, ago(1), "press_banca", { reps: 8, kg: 80, rir: 2 }); // pec_med 2, triceps 1, delt_ant 1
  for (let i = 0; i < 8; i++) s = C.logSet(s, ago(3), "press_pecho_maq", { reps: 10, kg: 50, rir: 2 });
  s = C.logSet(s, ago(10), "press_banca", { reps: 8, kg: 80, rir: 2 }); // fuera de la semana
  const w = S.weeklySets(s);
  expect(w.pec_med).toBe(12);
  expect(w.triceps).toBe(6);
  expect(S.volumeState(w.pec_med)).toBe("optimo");
  expect(S.volumeState(w.triceps)).toBe("bajo");
  expect(S.volumeState(25)).toBe("alto");
});

test("árbol automático: estricto no cuenta la asistida; 3×20 el mismo día; desmarcar se respeta; c_toji por estado", () => {
  let s = base();
  s = C.logSet(s, ago(2), "dom_asist", { reps: 10, assist: 20, rir: 1 });
  let r = S.applyAutoSkills(s);
  expect(r.checked.some((c) => c.skill === "s_pull")).toBe(false);
  s = C.logSet(s, ago(1), "dom_prona", { reps: 8, rir: 1 });
  r = S.applyAutoSkills(s);
  expect(r.checked.filter((c) => c.skill === "s_pull").map((c) => c.step)).toEqual([1, 2]);
  s = r.state;
  // sentadilla: 2 series de 20 un día y 1 otro día no basta
  s = C.logSet(C.logSet(s, ago(5), "sentadilla_pc", { reps: 20 }), ago(5), "sentadilla_pc", { reps: 22 });
  s = C.logSet(s, ago(4), "sentadilla_pc", { reps: 25 });
  expect(S.applyAutoSkills(s).checked.some((c) => c.skill === "f_squat")).toBe(false);
  s = C.logSet(s, ago(5), "sentadilla_pc", { reps: 20 });
  r = S.applyAutoSkills(s);
  expect(r.checked.some((c) => c.skill === "f_squat" && c.step === 0)).toBe(true);
  s = r.state;
  // desmarcar a mano: no se vuelve a marcar
  s = S.toggleStepManual(s, "s_pull", 2);
  expect(s.skills.s_pull.steps[2]).toBe(false);
  expect(S.applyAutoSkills(s).checked.some((c) => c.skill === "s_pull")).toBe(false);
  // dominar del todo da el aviso
  s = C.logSet(s, tk(), "plancha_ej", { reps: 50 });
  s = C.logSet(s, tk(), "hollow", { reps: 35 });
  r = S.applyAutoSkills(s);
  expect(r.checked.filter((c) => c.skill === "f_core").map((c) => c.step)).toEqual([0, 1]);
  expect(r.mastered).toEqual([]); // le falta el «Arch 30 s» (a mano)
  // c_toji: racha de 30
  r = S.applyAutoSkills({ ...s, bestStreak: 31 });
  expect(r.checked.some((c) => c.skill === "c_toji" && c.step === 2)).toBe(true);
  expect(S.autoSkillToast(r)).toContain("ÁRBOL");
  // el HTML sigue leyendo los pasos
  expect(Array.isArray(r.state.skills.s_pull.steps)).toBe(true);
});

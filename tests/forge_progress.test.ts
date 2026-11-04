// forgeProgress (F6): historial por ejercicio, constancia, curva de fuerza, récords, «tú hace 3 meses» y primeras marcas.
import { test, expect } from "bun:test";
import * as C from "C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts";
import * as P from "C:/Proyectos/eris-mobile/src/services/forge/forgeProgress.ts";
import * as S from "C:/Proyectos/eris-mobile/src/services/forge/forgeStrength.ts";
const L = C.L;
const ago = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const base = () => { const s = C.newState(); s.bodyKg = 85; s.sex = "h"; s.age = 27; s.heightCm = 179; return s; };

/** 4 meses de banca 2 veces por semana: de 60 a 80 kg × 5 @RIR 2, más dominadas que pasan de asistidas a estrictas. */
function fourMonths() {
  let s = base();
  for (let w = 17; w >= 0; w--) {
    const kg = 60 + Math.round((17 - w) * 20 / 17 / 2.5) * 2.5;
    for (const off of [5, 2]) {
      const d = ago(w * 7 + off);
      s = C.logSet(s, d, "press_banca", { reps: 5, kg: 20, warmup: true });
      for (let k = 0; k < 3; k++) s = C.logSet(s, d, "press_banca", { reps: 5, kg, rir: 2 });
      s = C.logSet(s, d, "sentadilla_bb", { reps: 5, kg: kg + 20, rir: 2 });
      s = C.logSet(s, d, "press_pecho_maq", { reps: 10, kg: 100 + (17 - w) * 5, unit: "lb", rir: 2 });
    }
  }
  return s;
}

test("historial por ejercicio: mejor máximo estimado, peso más alto y volumen (sin calentamientos)", () => {
  const s = fourMonths();
  const h = P.exerciseHistory(s, "press_banca");
  expect(h.length).toBe(36);
  const last = h[h.length - 1];
  expect(last.topLoad).toBe(80);
  expect(last.e1rm).toBe(Math.round(80 * (1 + 7 / 30) * 10) / 10);
  expect(last.volume).toBe(3 * 5 * 80); // el calentamiento no suma
  expect(last.sets).toBe(3);
  expect(h[0].e1rm!).toBeLessThan(last.e1rm!);
  // desde una fecha
  expect(P.exerciseHistory(s, "press_banca", ago(30)).every((p) => p.day >= ago(30))).toBe(true);
  expect(P.exerciseHistory(s, "no_existe")).toEqual([]);
});

test("constancia: sesiones por semana y semanas del rango (lunes a domingo, la última es la actual)", () => {
  const s = fourMonths();
  const w1 = P.weeksOf("1m");
  expect(w1.length).toBe(5);
  const now = L.forgeNow();
  const k = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  expect(w1[w1.length - 1].start <= k && k <= w1[w1.length - 1].end).toBe(true);
  expect(P.weeksOf("1a").length).toBe(53);
  const spw = P.sessionsPerWeek(s, "3m");
  expect(spw.length).toBe(13);
  expect(spw.reduce((a, b) => a + b.value, 0)).toBe(P.trainingDays(s, P.weeksOf("3m")[0].start).length);
  expect(Math.max(...spw.map((x) => x.value))).toBeLessThanOrEqual(2);
});

test("curva de fuerza semana a semana sin tocar el reloj global, y sube con el entreno", () => {
  const s = fourMonths();
  const before = L.forgeNow().getTime();
  const sw = P.strengthWeeks(s, "3m");
  expect(Math.abs(L.forgeNow().getTime() - before)).toBeLessThan(5000); // el reloj sigue siendo el de verdad
  const vals = sw.map((x) => x.value).filter((v): v is number => v != null);
  expect(vals.length).toBe(13);
  expect(vals[vals.length - 1]).toBeGreaterThan(vals[0]);
  expect(vals[vals.length - 1]).toBe(S.strengthScore(s)!.score);
  // series por semana de un músculo
  const pec = P.muscleWeeks(s, "pec_med", "1m");
  expect(pec.length).toBe(5);
  expect(pec.some((x) => x.value > 0)).toBe(true);
});

test("récords: máximo estimado, peso como lo marca el equipo (lb) y reps en peso corporal", () => {
  let s = fourMonths();
  s = C.logSet(s, ago(10), "dom_prona", { reps: 6, rir: 1 });
  s = C.logSet(s, ago(3), "dom_prona", { reps: 9, rir: 0 });
  s = C.logSet(s, ago(4), "curl_supino", { reps: 10, kg: 12, rir: 2 });
  const r = P.records(s);
  const benchE1 = r.find((x) => x.exId === "press_banca" && x.kind === "e1rm")!;
  expect(benchE1.value).toBe(Math.round(80 * (1 + 7 / 30) * 10) / 10);
  expect(benchE1.text).toBe("~98,7 kg de máximo estimado");
  const maq = r.find((x) => x.exId === "press_pecho_maq" && x.kind === "peso")!;
  expect(maq.text).toBe("185 lb × 10");
  expect(r.find((x) => x.exId === "curl_supino" && x.kind === "peso")!.text).toBe("12 kg c/u × 10");
  const dom = r.find((x) => x.exId === "dom_prona" && x.kind === "reps")!;
  expect(dom.value).toBe(9);
  expect(dom.day).toBe(ago(3));
  expect(r.some((x) => x.exId === "dom_prona" && x.kind === "peso")).toBe(false);
  // de lo más nuevo a lo más viejo
  for (let i = 1; i < r.length; i++) expect(r[i - 1].day >= r[i].day).toBe(true);
});

test("aviso de récord al anotar: más peso, más máximo estimado, más reps; la primera vez no es récord", () => {
  let s = fourMonths();
  const d = ago(0);
  expect(P.setRecord(s, "press_banca", { reps: 5, kg: 82.5, rir: 2 }, d)).toBe("¡RÉCORD! MÁXIMO ESTIMADO ~101,8 KG");
  expect(P.setRecord(s, "press_banca", { reps: 3, kg: 82.5, rir: 4 }, d)).toBe("¡RÉCORD! 82,5 KG EN PRESS DE BANCA CON BARRA".replace("PRESS DE BANCA CON BARRA", C.catalog(s).press_banca.name.toUpperCase()));
  expect(P.setRecord(s, "press_banca", { reps: 5, kg: 70, rir: 2 }, d)).toBeNull();
  expect(P.setRecord(s, "press_banca", { reps: 5, kg: 90, warmup: true }, d)).toBeNull();
  expect(P.setRecord(s, "press_pecho_maq", { reps: 10, kg: 190, unit: "lb", rir: 4 }, d)).toContain("190 LB");
  // primera vez
  expect(P.setRecord(s, "dom_prona", { reps: 5, rir: 1 }, d)).toBeNull();
  s = C.logSet(s, ago(3), "dom_prona", { reps: 5, rir: 1 });
  expect(P.setRecord(s, "dom_prona", { reps: 6, rir: 4 }, d)).toContain("6 REPS");
  // la serie ya anotada no se compara contra sí misma
  const set = { reps: 5, kg: 85, rir: 2 };
  s = C.logSet(s, d, "press_banca", set);
  const logged = s.sessions[d].press_banca[s.sessions[d].press_banca.length - 1];
  expect(P.setRecord(s, "press_banca", logged, d)).not.toBeNull();
});

test("tú hace 3 meses: score y levantamientos de entonces contra hoy", () => {
  const s = fourMonths();
  const v = P.versusAgo(s)!;
  expect(v).not.toBeNull();
  expect(v.scoreThen).not.toBeNull();
  expect(v.scoreNow!).toBeGreaterThan(v.scoreThen!);
  const bench = v.lifts.find((x) => x.lift === "bench")!;
  expect(bench.now).toBeGreaterThan(bench.then);
  expect(v.sessionsNow).toBe(8);
  // sin historia de hace 3 meses: null
  let s2 = base();
  s2 = C.logSet(s2, ago(5), "press_banca", { reps: 5, kg: 60, rir: 2 });
  expect(P.versusAgo(s2)).toBeNull();
});

test("el mes: primeras marcas y constancia contra el mes anterior", () => {
  let s = fourMonths();
  s = C.logSet(s, ago(6), "dom_prona", { reps: 4, rir: 1 });
  s = C.logSet(s, ago(2), "dom_prona", { reps: 6, rir: 1 });
  const f = P.firsts(s, "1m");
  expect(f.some((x) => x.text === `Primera vez: ${C.catalog(s).dom_prona.name}`)).toBe(true);
  expect(f.some((x) => x.text.startsWith(`Récord en ${C.catalog(s).press_banca.name}`))).toBe(true);
  expect(f.some((x) => x.text.startsWith("Primera vez: " + C.catalog(s).press_banca.name))).toBe(false);
  const m = P.monthSummary(s);
  expect(m.sessions).toBeGreaterThanOrEqual(8);
  expect(m.prev).toBeGreaterThanOrEqual(8);
  expect(m.bestWeek).toBe(3); // la semana con las dominadas del día 6 suma 3
  expect(P.topExercises(s, "1m")[0]).toBe("press_banca");
});

test("peso corporal y asistidos: récord de lastre, de menos asistencia y de reps (sin «máximo estimado» con el cuerpo)", () => {
  let s = base();
  s = C.logSet(s, ago(9), "dom_asist", { reps: 8, assist: 30, rir: 2 });
  s = C.logSet(s, ago(4), "dom_asist", { reps: 8, assist: 20, rir: 2 });
  s = C.logSet(s, ago(8), "dom_prona", { reps: 8, rir: 1 });
  s = C.logSet(s, ago(3), "dom_prona", { reps: 5, kg: 10, rir: 1 });
  s = C.logSet(s, ago(5), "press_banca_db", { reps: 8, kg: 24, rir: 2 });
  const r = P.records(s);
  expect(r.find((x) => x.exId === "dom_asist")!.text).toBe("asistencia de 20 kg × 8");
  expect(r.some((x) => x.exId === "dom_prona" && x.kind === "e1rm")).toBe(false);
  expect(r.find((x) => x.exId === "dom_prona" && x.kind === "peso")!.text).toBe("+10 kg de lastre × 5");
  expect(r.find((x) => x.exId === "dom_prona" && x.kind === "reps")!.value).toBe(8);
  expect(r.find((x) => x.exId === "press_banca_db" && x.kind === "e1rm")!.text).toContain("kg c/u de máximo estimado");
  const d = ago(0);
  expect(P.setRecord(s, "dom_asist", { reps: 8, assist: 15, rir: 2 }, d)).toBe("¡RÉCORD! MENOS ASISTENCIA EN " + C.catalog(s).dom_asist.name.toUpperCase());
  expect(P.setRecord(s, "dom_asist", { reps: 8, assist: 25, rir: 2 }, d)).toBeNull();
  expect(P.setRecord(s, "dom_prona", { reps: 3, kg: 12.5, rir: 1 }, d)).toContain("+12,5 KG DE LASTRE");
  expect(P.setRecord(s, "dom_prona", { reps: 9, rir: 0 }, d)).toContain("9 REPS");
  expect(P.setRecord(s, "dom_prona", { reps: 7, rir: 0 }, d)).toBeNull();
});

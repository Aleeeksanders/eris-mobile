// Forge — series antiguas que en verdad fueron con ayuda (2026-11-06). Lo migrado guardaba solo las repeticiones: el fundador tenía
// «10, 10, 6» y «8, 8, 8» de pronas con 18 y 14 kg de ayuda, contadas como estrictas: récord de 10, y pasos del árbol que no eran.
process.env.TZ = "America/Santiago";
import { test, expect } from "bun:test";
const C = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts");
const Str = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeStrength.ts");
const Pr = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeProgress.ts");
const { defaultGym } = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeCatalog.ts");

const vieja = (reps: number) => ({ reps, legacy: true, rpgReps: 8, rpgKg: 85 });
function conHistoria() {
  let s: any = C.newState();
  s = { ...s, bodyKg: 85, sex: "h", age: 27, heightCm: 179, gym: defaultGym("smartfit") };
  s.sessions = {
    "2026-09-06": { dips_ej: [vieja(7), vieja(7), vieja(7)] },
    "2026-09-10": { dom_prona: [vieja(10), vieja(10), vieja(6)], elev_lat: [{ reps: 12, kg: 7.5, legacy: true }] },
    "2026-10-01": { dom_prona: [vieja(8), vieja(8), vieja(8)] },
    "2026-10-28": { dips_ej: [{ reps: 8, rir: 0 }] },
    "2026-11-06": { dom_prona: [{ reps: 6, rir: 0 }, { reps: 4, rir: 0 }, { reps: 2, rir: 0 }] },
  };
  return s;
}

test("pregunta por las antiguas que superan por 2 o más tu mejor marca; la más antigua primero", () => {
  const o = C.assistOffer(conHistoria())!;
  expect(o).toEqual({ day: "2026-09-10", exId: "dom_prona", toId: "dom_asist", reps: [10, 10, 6], best: 6 });
});

test("no pregunta si son creíbles, si no hay marcas nuevas con qué comparar, ni por lo que no tiene versión asistida", () => {
  const s = conHistoria();
  s.sessions["2026-09-10"].dom_prona = [vieja(7), vieja(7), vieja(6)];
  s.sessions["2026-10-01"].dom_prona = [vieja(7)];
  expect(C.assistOffer(s)).toBeNull(); // 7 contra un mejor de 6: puede ser
  const sinNuevas = conHistoria();
  delete sinNuevas.sessions["2026-11-06"];
  expect(C.assistOffer(sinNuevas)).toBeNull();
  const sinVersion = conHistoria();
  sinVersion.sessions = { "2026-09-01": { elev_piernas: [vieja(20)] }, "2026-11-01": { elev_piernas: [{ reps: 5, rir: 0 }] } };
  expect(C.assistOffer(sinVersion)).toBeNull();
});

test("«sí»: pasan al ejercicio asistido con su ayuda, y se pregunta por el siguiente día", () => {
  let s = C.markAssisted(conHistoria(), "2026-09-10", "dom_prona", "dom_asist", 18);
  const dia = s.sessions["2026-09-10"];
  expect(dia.dom_prona).toBeUndefined();
  expect(dia.dom_asist.map((x: any) => [x.reps, x.assist])).toEqual([[10, 18], [10, 18], [6, 18]]);
  expect(dia.elev_lat.length).toBe(1);
  expect(s.training["2026-09-10"].dom_asist).toBe(3);
  expect(C.assistOffer(s)!.day).toBe("2026-10-01");
  s = C.markAssisted(s, "2026-10-01", "dom_prona", "dom_asist", 14);
  expect(C.assistOffer(s)).toBeNull();
});

test("el récord de pronas pasa a ser lo estricto, y el asistido queda con su ayuda", () => {
  const antes = Pr.records(conHistoria()).find((r: any) => r.exId === "dom_prona" && r.kind === "reps")!;
  expect(antes.value).toBe(10);
  let s = C.markAssisted(conHistoria(), "2026-09-10", "dom_prona", "dom_asist", 18);
  s = C.markAssisted(s, "2026-10-01", "dom_prona", "dom_asist", 14);
  const r = Pr.records(s);
  expect(r.find((x: any) => x.exId === "dom_prona" && x.kind === "reps")!.value).toBe(6);
  expect(r.find((x: any) => x.exId === "dom_asist")!.text).toBe("asistencia de 14 kg × 8");
  // La próxima de 7 sí es récord
  expect(Pr.setRecord(s, "dom_prona", { reps: 7, rir: 0 }, "2026-11-20")).toContain("RÉCORD");
});

test("el XP de esos días no cambia", () => {
  const s0 = conHistoria();
  const s = C.markAssisted(s0, "2026-09-10", "dom_prona", "dom_asist", 18);
  expect(C.dayTrainXp(s, "2026-09-10")).toBe(C.dayTrainXp(s0, "2026-09-10"));
});

test("«no»: siguen como estaban y no se vuelve a preguntar por ese día", () => {
  const s = C.dismissAssist(conHistoria(), "2026-09-10", "dom_prona");
  expect(s.sessions["2026-09-10"].dom_prona.length).toBe(3);
  expect(C.assistOffer(s)!.day).toBe("2026-10-01");
});

test("el árbol: lo que el código marcó y ya no se cumple queda pendiente; lo marcado a mano no se toca", () => {
  let s = conHistoria();
  s.skills = { s_pull: { steps: [true, true, true], auto: [2] }, s_mu: { steps: [true, false, false], auto: [0] }, f_mob: { steps: [true, true] } };
  s = C.markAssisted(s, "2026-09-10", "dom_prona", "dom_asist", 18);
  s = Str.revokeAutoSkills(C.markAssisted(s, "2026-10-01", "dom_prona", "dom_asist", 14));
  expect(s.skills.s_pull.steps).toEqual([true, true, false]); // 8 estrictas: todavía no
  expect(s.skills.s_pull.auto).toEqual([]);
  expect(s.skills.s_mu.steps[0]).toBe(false);                 // 10 estrictas: tampoco
  expect(s.skills.f_mob.steps).toEqual([true, true]);
  // Se puede volver a ganar
  const r = Str.applyAutoSkills(C.logSet(s, "2026-12-01", "dom_prona", { reps: 8, rir: 0 }));
  expect(r.state.skills.s_pull.steps[2]).toBe(true);
});

test("sin cambios en el árbol, no toca el estado", () => {
  const s = conHistoria();
  s.skills = { s_pull: { steps: [false, true, false], auto: [1] } };
  expect(Str.revokeAutoSkills(s)).toBe(s);
});

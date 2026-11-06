// Fase I8 (2026-10-23): la rutina escrita → plan por días, y el mapa muscular tocable con la hoja del músculo.
import { test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import * as C from "C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts";
import * as M from "C:/Proyectos/eris-mobile/src/services/forge/forgeMdRoutine.ts";
import * as R from "C:/Proyectos/eris-mobile/src/services/forge/forgeRoutine.ts";
import * as Str from "C:/Proyectos/eris-mobile/src/services/forge/forgeStrength.ts";
import { defaultGym } from "C:/Proyectos/eris-mobile/src/services/forge/forgeCatalog.ts";
import { muscleAt } from "C:/Proyectos/eris-mobile/src/screens/forge/muscleGeometry.ts";

const base = (): C.ForgeState => ({ ...C.newState(), bodyKg: 85, gym: defaultGym("smartfit") });
const REAL = `${import.meta.dir}/fixtures/real_routine.md`;

test("la rutina real (emojis, Día N con día de la semana, Sesión A/B, «·», tiempo, metros, al fallo, «+»)", () => {
  if (!existsSync(REAL)) return;
  const s = base();
  const md = M.parseRoutineMd(s, readFileSync(REAL, "utf-8"));
  expect(md.title).toBe('Protocolo "Toji Fushiguro" - Split Gym / Casa');
  expect(md.rules.length).toBe(4);
  expect(md.days.map((d) => [d.label, d.name, d.weekday])).toEqual([["1", "Empuje", 0], ["2", "Tirón y agarre", 2], ["3", "Piernas y core", 4], ["4", "Atlético y armas", 6]]);
  expect(md.days[0].blocks).toEqual(["Gym (Fuerza Bruta)", "Casa (Anillas y Control)"]);
  expect(md.days[3].warmup).toMatch(/^5 mins de saltos de tijera/);
  expect(md.days[1].notes[0]).toMatch(/^Ideal para dejar la espalda/);
  const all = md.days.flatMap((d) => d.lines);
  expect(all.length).toBe(26);
  const by = (n: string) => all.find((l) => l.name.includes(n))!;
  // esquemas
  expect(M.lineScheme(by("Press de Banca"))).toBe("4×6–8");
  expect(M.lineScheme(by("Handstand"))).toBe("3×45 s");
  expect(M.lineScheme(by("Low Kicks"))).toBe("4×60 s");
  expect(M.lineScheme(by("Sprints"))).toBe("6×30 m");
  expect(M.lineScheme(by("False Grip"))).toBe("3 al fallo");
  expect(M.lineScheme(by("L-Sit"))).toBe("3 al fallo (tiempo)");
  expect(M.lineScheme(by("Wrist Levers"))).toBe("3×8–10 por brazo");
  expect(by("Ab Wheel").repMax).toBe(10); // «Core: Ab Wheel 3x10 + Elevación de Piernas Colgado 3x12»: dos ejercicios
  expect(by("Elevación de Piernas").repMax).toBe(12);
  expect(by("Box Jumps").optional).toBe(true);
  expect(by("Ring Dips").optional).toBeUndefined(); // «si tienes lastre, úsalo» en la nota no lo hace opcional
  // emparejar
  expect(by("Press de Banca").match).toMatchObject({ exId: "press_banca", confidence: "exacto" });
  expect(by("Peso Muerto Rumano").match.exId).toBe("rdl_bb"); // «Barra con 80-100 kg» → con barra
  expect(by("Remo Pendlay").match.exId).toBe("remo_bb");
  expect(by("Remo Pendlay").match.options).toContain("remo_sentado");
  expect(by("Ring Rows").match).toMatchObject({ exId: "remo_prono", confidence: "exacto" });
  expect(by("Ring Dips").match).toMatchObject({ exId: "dips_ej", confidence: "probable" });
  expect(by("Ab Wheel").match.exId).toBe("rueda");
  expect(by("Sprints").match.exId).toBe("sprint");
  expect(by("Handstand").match.exId).toBeNull(); // «Pino contra la pared» no es «HSPU contra pared»
  expect(by("Mace Swings").match.exId).toBeNull(); // no es un swing con kettlebell
  // pesos nombrados, según el equipo
  expect(by("Press de Banca").kg.map((k) => k.ctx)).toEqual(["barra", "mancuerna"]);
  expect(by("Dominadas Pronas").kg[0]).toMatchObject({ min: 10, max: 15, ctx: "lastre" });
  // el plan
  const choices = M.defaultChoices(md);
  expect(choices[by("Flexiones Pliométricas").key]).toBe("propio"); // las flexiones ya las tiene «RTO Push-ups» ese día
  expect(choices[by("Towel Pull-ups").key]).toBe("propio"); // la dominada exacta (lastrada) se queda con dom_prona
  const { routine, newExercises } = M.mdToRoutine(s, md, choices, { now: new Date(2026, 9, 23) });
  expect(routine).toMatchObject({ source: "md", split: "propia", daysPerWeek: 4 });
  expect(newExercises.map((c) => c.name)).toContain("Skin the Cat (anillas)");
  expect(by("Shadowboxing").match.exId).toBe("sombra"); // fase I9: el combate tiene sus ejercicios
  expect(by("Low Kicks").match.exId).toBe("patadas_saco");
  for (const d of routine.days) expect(new Set(d.items.map((i) => i.exId)).size).toBe(d.items.length); // una vez por día
  const item = (id: string) => routine.days.flatMap((d) => d.items).find((i) => i.exId === id)!;
  expect(item("press_banca")).toMatchObject({ kg: 65, rir: 2, block: "Gym (Fuerza Bruta)" }); // «RPE 8-9» del gimnasio → RIR 2
  expect(item("bulgara")).toMatchObject({ kg: 24, perSide: "pierna" });
  expect(item("dom_prona")).toMatchObject({ kg: 10 }); // lastre
  expect(item("sprint")).toMatchObject({ measure: "m", repMin: 30 });
  const s2 = M.applyMdRoutine(s, routine, newExercises);
  expect(R.targetText(s2, item("dom_prona"))).toBe("4×6–8 · RIR 2 · +10 kg de lastre");
  expect(R.targetText(s2, item("sprint"))).toBe("6×30 m");
  expect(R.targetText(s2, item("lsit_ej"))).toBe("3 series al fallo (tiempo)");
  // guardar dos veces no duplica los propios
  expect(M.mergeCustom(s2, newExercises)).toBe(s2);
});

test("otros formatos: títulos ## Día, tablas (la que arma Eris), días de la semana, «x10/lado», RIR/RPE, citas", () => {
  const s = base();
  const a = M.parseRoutineMd(s, "# Mi rutina\n\n## Día A — Empuje\n- Press de banca 4x8 RIR 2\n- Fondos 3 x 8-12 (opcional)\n\n## Día B — Pierna\n1. Sentadilla 5×5 RPE 8\n2. Zancadas x10/lado\n3. Plancha 3 series de 45 segundos");
  expect(a.title).toBe("Mi rutina");
  expect(a.days.map((d) => d.name)).toEqual(["Empuje", "Pierna"]);
  expect(a.days[0].lines.map((l) => [l.match.exId, l.sets, l.repMin, l.repMax, l.rir ?? null, !!l.optional])).toEqual([["press_banca", 4, 8, 8, 2, false], ["dips_ej", 3, 8, 12, null, true]]);
  expect(a.days[1].lines.map((l) => [l.match.exId, l.sets, l.repMin, l.perSide ?? null, l.measure])).toEqual([["sentadilla_bb", 5, 5, null, "reps"], ["zancadas_ej", 3, 10, "lado", "reps"], ["plancha_ej", 3, 45, null, "seg"]]);
  expect(a.days[1].lines[0].rir).toBe(2);
  // la tabla que arma Eris (routineToMd) vuelve a leerse igual
  const gen = R.buildRoutine(s, { days: 3, minutes: 60, now: new Date(2026, 9, 23) });
  const back = M.parseRoutineMd(s, R.routineToMd(s, gen));
  expect(back.days.length).toBe(3);
  for (let k = 0; k < 3; k++) expect(back.days[k].lines.map((l) => l.match.exId)).toEqual(gen.days[k].items.map((i) => i.exId));
  expect(back.days[0].lines[0].sets).toBe(gen.days[0].items[0].sets);
  // «> 3 días por semana · ~60 min» es una cita, no un ejercicio
  expect(back.days.flatMap((d) => d.lines).some((l) => /semana/.test(l.name))).toBe(false);
  // con la versión para la casa que agrega Eris («## 🏠 Si no puedes ir al gimnasio»): son alternativas, no más días
  const home = R.buildRoutine(s, { days: 3, minutes: 60, where: "casa", now: new Date(2026, 9, 23) });
  const both = `${R.routineToMd(s, gen)}\n\n---\n\n## 🏠 Si no puedes ir al gimnasio\n\n${R.routineToMd(s, home).replace(/^# .*\n/, "")}`;
  expect(M.parseRoutineMd(s, both).days.length).toBe(3);
  // días por nombre de la semana; «día a día» no es un día
  const w = M.parseRoutineMd(s, "Lunes: Torso\n- Dominadas 4x6\n- Remo con mancuerna 3x10\nJueves - Pierna\n- Prensa 4x10\nDía a día hay que ser constante.");
  expect(w.days.map((d) => [d.name, d.weekday])).toEqual([["Torso", 1], ["Pierna", 4]]);
  expect(w.days[1].notes).toEqual(["Día a día hay que ser constante."]);
  // sin días: los títulos son días
  const t = M.parseRoutineMd(s, "## Pecho\n- Press inclinado con mancuernas 3x10\n## Espalda\n- Jalón al pecho 3x12");
  expect(t.days.map((d) => d.lines[0].match.exId)).toEqual(["press_incl_db", "jalon"]);
});

test("el plan respeta los días de la semana: hoy toca, descanso y el siguiente", () => {
  const s = base();
  const md = M.parseRoutineMd(s, "Día 1: Empuje (Lunes)\n- Press de banca 4x8\nDía 2: Tirón (Miércoles)\n- Dominadas 4x6\nDía 3: Pierna (Viernes)\n- Sentadilla 4x8");
  const { routine } = M.mdToRoutine(s, md);
  expect(R.hasWeekdays(routine)).toBe(true);
  const mon = new Date(2026, 9, 19), tue = new Date(2026, 9, 20), sat = new Date(2026, 9, 24);
  expect(R.nextRoutineDay(s, routine, mon).name).toBe("Día 1 — Empuje");
  expect(R.isRestDay(routine, mon)).toBe(false);
  expect(R.isRestDay(routine, tue)).toBe(true);
  expect(R.nextRoutineDay(s, routine, tue).name).toBe("Día 2 — Tirón");
  expect(R.nextRoutineDay(s, routine, sat).name).toBe("Día 1 — Empuje"); // sábado → el lunes
  const rest = R.routineDayStart({ ...s, routinePlan: routine, plan: { flexiones: 3 } }, tue);
  expect(rest.plan).toEqual({});
  expect(rest.planDay).toMatchObject({ rest: true, name: "Descanso" });
  // sanitize (lo que llega del chat) conserva lo nuevo
  const clean = R.sanitizeRoutine(s, JSON.parse(JSON.stringify(routine)))!;
  expect(clean).toMatchObject({ source: "md", split: "propia" });
  expect(clean.days.map((d) => d.weekday)).toEqual([1, 3, 5]);
});

test("objetivo sin hablar de pesos cuando no hay peso que elegir", () => {
  const s = base();
  expect(R.nextTarget(s, { exId: "remo_prono", sets: 3, repMin: 8, repMax: 10, rir: 2 }).why).toBe("nuevo: con buena técnica, dejando ~2 en reserva");
  expect(R.nextTarget(s, { exId: "press_banca_db", sets: 3, repMin: 8, repMax: 10, rir: 2 }).why).toMatch(/elige un peso/);
});

test("el toque por coordenadas", () => {
  // el toque: el punto cae dentro del polígono (o en el más cercano si toca el borde)
  expect(muscleAt(85, 105, false)).toBe("pec_med");
  expect(muscleAt(115, 105, false)).toBe("pec_med");
  expect(muscleAt(100, 140, false)).toBe("abs");
  expect(muscleAt(85, 240, false)).toBe("cuadriceps");
  expect(muscleAt(100, 90, true)).toBe("trapecio");
  expect(muscleAt(84, 130, true)).toBe("dorsal");
  expect(muscleAt(85, 250, true)).toBe("femoral");
  expect(muscleAt(5, 380, false)).toBeNull();
});

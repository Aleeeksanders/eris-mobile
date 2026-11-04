// Fase I9 (2026-10-23): avatar con pose por disciplina, disciplinas y habilidades nuevas, parámetros atléticos.
import { test, expect } from "bun:test";
import * as C from "C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts";
import * as X from "C:/Proyectos/eris-mobile/src/services/forge/forgeSkillsExt.ts";
import * as A from "C:/Proyectos/eris-mobile/src/services/forge/forgeAthletic.ts";
import * as Str from "C:/Proyectos/eris-mobile/src/services/forge/forgeStrength.ts";
import * as M from "C:/Proyectos/eris-mobile/src/services/forge/forgeMdRoutine.ts";
import { POSES, skeleton, bounds, poseOf } from "C:/Proyectos/eris-mobile/src/screens/forge/avatarPose.ts";

const L = C.L;
const base = (over: Partial<C.ForgeState> = {}): C.ForgeState => ({ ...C.newState(), bodyKg: 85, sex: "h", age: 27, heightCm: 179, ...over });

test("lo del HTML no cambia; las clases nuevas entran a la Arena", () => {
  expect(L.SKILLS.length).toBe(79);
  expect(L.CLASSES.map((c: any) => c.id)).toEqual(["calistenia", "taekwondo", "karate", "boxeo"]);
  expect(X.ALL_CLASSES.map((c) => c.id)).toEqual(["calistenia", "taekwondo", "karate", "boxeo", "parkour", "tricking", "muay_thai"]);
  const cs = C.combatStats(base({ classes: ["muay_thai", "boxeo"] }));
  expect(cs.classBoost).toMatchObject({ atk: 22, def: 8, hp: 6, crit: 6, vigor: 6 });
  expect(cs.classBoost.list.map((c: any) => c.id)).toEqual(["muay_thai", "boxeo"]);
  const plain = C.combatStats(base());
  expect(cs.atk).toBeGreaterThan(plain.atk);
  expect(C.SKILL_COUNT).toBe(79 + X.EXT_SKILLS.length);
});

test("las habilidades nuevas: ids únicos, prerrequisitos que existen, sin ciclos, músculos válidos", () => {
  const ids = X.EXT_SKILLS.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(L.SKILL_BY_ID[id]).toBeUndefined();
  for (const sk of X.EXT_SKILLS) {
    expect(X.EXT_CATS.some((c) => c.id === sk.cat)).toBe(true);
    for (const p of sk.prereq) expect(X.skillById(p)).toBeDefined();
    expect(sk.steps.length).toBeGreaterThanOrEqual(3);
    for (const g of Object.keys(X.EXT_SKILL_MUSCLES[sk.id] ?? {})) expect(L.GROUP_BY_ID[g]).toBeDefined();
  }
  const depth = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) throw new Error(`ciclo en ${id}`);
    const sk = X.skillById(id);
    return sk.prereq.length ? 1 + Math.max(...sk.prereq.map((p: string) => depth(p, new Set([...seen, id])))) : 0;
  };
  for (const id of ids) expect(depth(id)).toBeGreaterThanOrEqual(1);
  for (const [cls, branches] of Object.entries(X.CLASS_BRANCHES)) for (const b of branches) expect(X.catById(b)).toBeDefined();
  expect(Object.keys(X.CLASS_BRANCHES).sort()).toEqual(X.ALL_CLASSES.map((c) => c.id).sort());
});

test("dominar una nueva suma su XP al RPG (nivel, rango, Arena) y cuenta como dominada", () => {
  const s = base();
  const before = C.rpgSummary(s);
  const s2 = C.masterSkill(s, "g_guardia");
  expect(C.isMasteredAny(s2, "g_guardia")).toBe(true);
  const after = C.rpgSummary(s2);
  expect(after.totalXp - before.totalXp).toBe(X.skillById("g_guardia").xp);
  expect(after.mastered).toBe(before.mastered + 1);
  expect(L.getTotalXp(s2)).toBe(L.getTotalXp(s)); // el estado guardado no cambia: solo la vista del RPG
  expect(C.toggleStep(s, "k_teep", 1).skills.k_teep.steps).toEqual([false, true, false]);
  expect(Str.toggleStepManual(s, "k_teep", 0).skills.k_teep.steps[0]).toBe(true);
});

test("los rounds anotados marcan solos los pasos de las disciplinas", () => {
  let s = base();
  const day = L.todayKey();
  for (let k = 0; k < 6; k++) s = C.logSet(s, day, "saco", { reps: 180 });
  for (let k = 0; k < 3; k++) s = C.logSet(s, day, "sombra", { reps: 120 });
  const r = Str.applyAutoSkills(s);
  expect(r.checked).toContainEqual({ skill: "g_guardia", step: 0 });
  expect(r.mastered).toContain("g_saco"); // 3, 5 y 6 rounds al saco: los tres pasos
  expect(Str.autoSkillToast(r)).toMatch(/^¡DOMINASTE /);
  expect(Str.critText(Str.EXT_CRITERIA.g_saco[1])).toBe("se marca solo con 5 rounds de 3 min o más el mismo día");
  expect(Str.ALL_CRITERIA.s_pull).toBe(Str.SKILL_CRITERIA.s_pull); // las del HTML siguen igual
});

test("parámetros atléticos: de lo que entrenas, 0–100, con el bono de la clase", () => {
  let s = base();
  expect(A.athleticParams(s).params.every((p) => p.value === 0 || p.key === "fuerza")).toBe(true);
  const day = L.todayKey();
  for (let k = 0; k < 6; k++) s = C.logSet(s, day, "saco", { reps: 180 });
  for (let k = 0; k < 3; k++) s = C.logSet(s, day, "dom_prona", { reps: 12 });
  s = { ...s, log: [{ day, steps: 10000 }, ...(s.log || [])] as any };
  const a = A.athleticParams(s);
  for (const p of a.params) { expect(p.value).toBeGreaterThanOrEqual(0); expect(p.value).toBeLessThanOrEqual(100); }
  const v = (k: A.ParamKey, x = a) => x.params.find((p) => p.key === k)!;
  expect(v("velocidad").base).toBeGreaterThan(0); // 18 min de saco
  expect(v("fuerza").value).toBe(78); // 12 dominadas × 6,5
  expect(v("resistencia").why).toMatch(/10\.000 pasos al día/);
  const box = A.athleticParams({ ...s, classes: ["boxeo"] });
  expect(v("velocidad", box).boost).toBeCloseTo(0.12);
  expect(v("velocidad", box).value).toBe(Math.min(100, Math.round(v("velocidad").base * 1.12)));
  expect(box.best.value).toBeGreaterThanOrEqual(box.weakest.value);
});

test("el avatar: cada pose cabe en el dibujo y las de pie tocan el suelo", () => {
  for (const [k, p] of Object.entries(POSES)) {
    const b = bounds(skeleton(p));
    expect(b.minX).toBeGreaterThanOrEqual(0); expect(b.maxX).toBeLessThanOrEqual(200);
    expect(b.minY).toBeGreaterThanOrEqual(0); expect(b.maxY).toBeLessThanOrEqual(240);
    const sk = skeleton(p);
    if (!p.air && k !== "calistenia") expect(p.ground - Math.max(sk.ankleN[1], sk.ankleF[1])).toBeLessThanOrEqual(6);
  }
  for (const c of X.ALL_CLASSES) expect(POSES[c.id]).toBeDefined(); // cada clase tiene su pose
  expect(poseOf("algo")).toBe(POSES.base);
  expect(skeleton(POSES.calistenia).handN[1]).toBeGreaterThan(skeleton(POSES.calistenia).ankleN[1]); // parada de manos: las manos abajo
});

test("la rutina escrita reconoce el combate (saco, low kicks, sombra)", () => {
  const s = base();
  const md = M.parseRoutineMd(s, "Día 1: Combate\n· Saco de Boxeo - Low Kicks y Patadas Medias: 4 rounds de 1 minuto.\n· Shadowboxing: 3 rounds de 3 minutos.\n· Rodillazos al saco: 3 rounds de 1 minuto.\n· Saco de boxeo: 5 rounds de 3 minutos.");
  expect(md.days[0].lines.map((l) => [l.match.exId, l.match.confidence, M.lineScheme(l)])).toEqual([
    ["patadas_saco", "exacto", "4×60 s"], ["sombra", "exacto", "3×180 s"], ["rodillazos", "exacto", "3×60 s"], ["saco", "exacto", "5×180 s"],
  ]);
});

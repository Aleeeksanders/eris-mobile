// forgeLegacy.ts (núcleo nativo) da EXACTAMENTE lo mismo que la lógica de toji.html, con estados aleatorios realistas.
import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import * as L from "C:/Proyectos/eris-mobile/src/services/forge/forgeLegacy.ts";

const html = readFileSync("C:/Proyectos/eris-mobile/assets/toji.html", "utf8");
const start = html.indexOf("const STORAGE_KEY");
const sc = html.lastIndexOf("<script", start);
const app = html.slice(html.indexOf(">", sc) + 1, html.indexOf("</script>", start));
const a = app.indexOf("const IS_DIABETIC"), b = app.indexOf("function App(");
const section = app.slice(a, b);
const sample = (html.match(/window\.__RUTINA_MD__ = ("(?:[^"\\]|\\.)*");/) || [])[1];

function htmlLogic(win: any) {
  const names = Object.keys(L).filter((k) => !["forgeEnv", "forgeNow", "setForgeNow", "SAMPLE_ROUTINE_MD", "setTrainXpOf"].includes(k));
  const src = `const Dumbbell='Dumbbell', Footprints='Footprints', Moon='Moon';\n${section}\nreturn { ${names.join(", ")} };`;
  return new Function("window", "React", src)(win, {});
}

// Estados aleatorios con todo lo que guarda Forge
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const dayKeyAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function randomState() {
  const s: any = L.defaultState();
  const exIds = Object.keys(L.EX_BY_ID);
  const custom = rnd() < 0.5 ? [{ id: "c_remo_maq", name: "Remo en máquina", group: "tiron", met: 5, min: 2.5, m: { dorsal: 2, biceps: 1 }, load: { db: true }, reps: 10 }] : [];
  s.customExercises = custom;
  const all = [...exIds, ...custom.map((c) => c.id)];
  for (let i = 0; i < 40; i++) {
    const k = dayKeyAgo(Math.floor(rnd() * 150));
    const day = (s.training[k] ||= {});
    const meta = (s.trainMeta[k] ||= {});
    for (let j = 0; j < 1 + Math.floor(rnd() * 5); j++) {
      const id = pick(all);
      const n = 1 + Math.floor(rnd() * 5);
      day[id] = (day[id] || 0) + n;
      meta[id] = { sets: Array.from({ length: day[id] }, () => 5 + Math.floor(rnd() * 10)), kg: Math.round(rnd() * 30), unit: "" };
    }
  }
  for (const id of all) { if (rnd() < 0.4) s.weights[id] = Math.round(rnd() * 40) / 2 * 2; if (rnd() < 0.4) s.reps[id] = 5 + Math.floor(rnd() * 15); }
  for (const sk of L.SKILLS) if (rnd() < 0.35) s.skills[sk.id] = { steps: sk.steps.map(() => rnd() < 0.6) };
  s.bankedXp = Math.floor(rnd() * 4000);
  s.streak = Math.floor(rnd() * 10); s.bestStreak = s.streak + Math.floor(rnd() * 5);
  s.bodyKg = rnd() < 0.85 ? 60 + Math.round(rnd() * 40) : null;
  s.heightCm = 160 + Math.round(rnd() * 30); s.age = 18 + Math.floor(rnd() * 40); s.sex = pick(["h", "m", null]);
  s.activity = pick([1.2, 1.375, 1.55, 1.725]);
  s.goal = pick([null, "perder", "recomp", "mantener", "ganar"]);
  s.classes = rnd() < 0.5 ? [pick(L.CLASSES).id] : [];
  s.dungeons = rnd() < 0.3 ? { [L.DUNGEONS[0].id]: true } : {};
  s.today = { ...L.freshToday(L.todayKey()), workout: rnd() < 0.5, steps: Math.floor(rnd() * 12000), sleep: Math.round(rnd() * 9 * 10) / 10 };
  if (rnd() < 0.5) s.today.watch = { day: L.todayKey(), kcal: Math.round(rnd() * 900), minutes: 60, vigorousMin: 30, label: "básquet" };
  if (rnd() < 0.5) { s.autoLevel = { factor: 1.2 + Math.round(rnd() * 50) / 100, label: "Moderado", perWeek: 2, days: 28 }; s.activityMode = pick(["auto", "manual", undefined]); }
  s.log = Array.from({ length: 10 }, (_, i) => ({ ...L.freshToday(dayKeyAgo(i + 1)), day: dayKeyAgo(i + 1), workout: rnd() < 0.5, steps: Math.floor(rnd() * 12000), sleep: 5 + rnd() * 4, xp: 40, missions: 1, claimed: rnd() < 0.5 }));
  return s;
}

const env = (isDiabetic: boolean, proteinRule: any, waterRule: any, watchDays: any) => ({
  win: { __ERIS_IS_DIABETIC__: isDiabetic, __ERIS_PROTEIN_RULE__: proteinRule, __ERIS_WATER_RULE__: waterRule, __ERIS_WATCH_DAYS__: watchDays, __RUTINA_MD__: JSON.parse(sample!) },
  env: { isDiabetic, proteinRule, waterRule, watchDays, routineMd: JSON.parse(sample!) },
});

test("la rutina de ejemplo es la misma", () => {
  expect(L.SAMPLE_ROUTINE_MD).toBe(JSON.parse(sample!));
});

test("200 estados al azar: XP, nivel, músculos, Arena, títulos, metas y agua dan igual", () => {
  const rules = [env(false, null, null, {}), env(true, { cap: 0.8 }, { noTarget: true }, { [dayKeyAgo(2)]: 40 }), env(false, null, { mult: 1.3 }, { [dayKeyAgo(1)]: 90, [dayKeyAgo(9)]: 30 })];
  for (let i = 0; i < 200; i++) {
    const s = randomState();
    const r = rules[i % rules.length];
    Object.assign(L.forgeEnv, r.env);
    const H = htmlLogic(r.win);
    const json = (x: any) => JSON.stringify(x);
    const checks: Array<[string, (F: any) => any]> = [
      ["getTotalXp", (F) => F.getTotalXp(s)],
      ["computeLevel", (F) => F.computeLevel(F.getTotalXp(s))],
      ["rankFor", (F) => F.rankFor(F.computeLevel(F.getTotalXp(s)).level)],
      ["trainXpOf", (F) => F.trainXpOf(s)],
      ["skillXpOf", (F) => F.skillXpOf(s)],
      ["routineIntensity", (F) => F.routineIntensity(s)],
      ["groupLevels", (F) => F.groupLevels(s)],
      ["subgroupXp", (F) => F.subgroupXp(s)],
      ["combatStats", (F) => F.combatStats(s)],
      ["earnedTitles", (F) => F.earnedTitles(s).map((t: any) => t.id)],
      ["todayXp", (F) => F.todayXp(s.today)],
      ["missionsDone", (F) => F.missionsDone(s.today)],
      ["applyClaim", (F) => F.applyClaim(s)],
      ["kcalTotal", (F) => F.kcalTotal(s)],
      ["kcalForDay", (F) => Object.keys(s.training).map((k) => F.kcalForDay(s, s.training[k]))],
      ["tdeeOf", (F) => F.tdeeOf(s)],
      ["bmrOf", (F) => F.bmrOf(s)],
      ["goalTargetsOf", (F) => F.goalTargetsOf(s)],
      ["hydrationOf", (F) => F.hydrationOf(s, 300, F.watchToday(s))],
      ["activitySuggestion", (F) => F.activitySuggestion(s)],
      ["effActivity", (F) => F.effActivity(s)],
      ["typicalExerciseOf", (F) => F.typicalExerciseOf(s)],
    ];
    for (const [name, fn] of checks) {
      const mine = json(fn(L)), theirs = json(fn(H));
      if (mine !== theirs) throw new Error(`${name} distinto en el estado ${i}:\n  html   ${theirs.slice(0, 300)}\n  nativo ${mine.slice(0, 300)}`);
    }
  }
});

test("los datos fijos son los mismos (árbol, ejercicios, Arena, títulos)", () => {
  const H = htmlLogic(env(false, null, null, {}).win);
  for (const k of ["SKILLS", "MUSCLE_GROUPS", "EX_GROUPS", "CLASSES", "CATS", "DUNGEONS", "REAL_ENEMIES", "FANTASY_ENEMIES", "SPECIALS", "SKILL_MUSCLES", "LAYOUT", "ACTIVITY_LEVELS", "GOALS", "TITLES"]) {
    expect(JSON.stringify((L as any)[k])).toBe(JSON.stringify(H[k]));
  }
  expect(L.SKILLS.length).toBe(79);
  expect(Object.keys(L.EX_BY_ID).length).toBe(48);
  expect(L.ALL_SUBS.length).toBe(22);
});

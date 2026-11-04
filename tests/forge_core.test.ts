// forgeCore (F1): migrar desde el HTML da el mismo RPG al peso, y las series nuevas mantienen al día los campos viejos.
import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import * as C from "C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts";
import * as G from "C:/Proyectos/eris-mobile/src/services/forge/forgeCatalog.ts";
const L = C.L;

const html = readFileSync("C:/Proyectos/eris-mobile/assets/toji.html", "utf8");
const start = html.indexOf("const STORAGE_KEY");
const sc = html.lastIndexOf("<script", start);
const app = html.slice(html.indexOf(">", sc) + 1, html.indexOf("</script>", start));
const section = app.slice(app.indexOf("const IS_DIABETIC"), app.indexOf("function App("));
const sample = JSON.parse((html.match(/window\.__RUTINA_MD__ = ("(?:[^"\\]|\\.)*");/) || [])[1]!);
const H: any = new Function("window", "React", `const Dumbbell='Dumbbell', Footprints='Footprints', Moon='Moon';\n${section}\nreturn { getTotalXp, computeLevel, groupLevels, combatStats, earnedTitles, routineIntensity, rankFor, kcalForDay, todayKey, defaultState, freshToday, EX_BY_ID, SKILLS, CLASSES, DUNGEONS };`)({ __RUTINA_MD__: sample }, {});

let seed = 11;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const dayKeyAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function legacyState() {
  const s: any = H.defaultState();
  const ids = Object.keys(H.EX_BY_ID);
  if (rnd() < 0.5) s.customExercises = [{ id: "c_x", name: "Remo en máquina", group: "tiron", met: 5, min: 2.5, m: { dorsal: 2, biceps: 1 }, load: { db: true }, reps: 10 }];
  const all = [...ids, ...s.customExercises.map((c: any) => c.id)];
  for (let i = 0; i < 35; i++) {
    const k = dayKeyAgo(Math.floor(rnd() * 120));
    const day = (s.training[k] ||= {});
    const withMeta = rnd() < 0.7;
    for (let j = 0; j < 1 + Math.floor(rnd() * 4); j++) {
      const id = pick(all);
      day[id] = (day[id] || 0) + 1 + Math.floor(rnd() * 4);
      if (withMeta) (s.trainMeta[k] ||= {})[id] = { sets: Array.from({ length: day[id] }, () => 6 + Math.floor(rnd() * 8)), kg: Math.round(rnd() * 20), unit: "" };
    }
  }
  for (const id of all) { if (rnd() < 0.5) s.weights[id] = Math.round(rnd() * 20) * 1; if (rnd() < 0.4) s.reps[id] = 5 + Math.floor(rnd() * 12); }
  for (const sk of H.SKILLS) if (rnd() < 0.3) s.skills[sk.id] = { steps: sk.steps.map(() => rnd() < 0.7) };
  s.bankedXp = Math.floor(rnd() * 3000); s.streak = Math.floor(rnd() * 8); s.bestStreak = s.streak + 2;
  s.bodyKg = 60 + Math.round(rnd() * 35); s.classes = rnd() < 0.5 ? [pick(H.CLASSES).id] : [];
  s.today = { ...H.freshToday(H.todayKey()), workout: rnd() < 0.5, steps: Math.floor(rnd() * 11000), sleep: 6 + rnd() * 3 };
  return s;
}

test("migrar 150 estados del HTML: nivel, XP, músculos, Arena, títulos y entrenos quedan iguales", () => {
  for (let i = 0; i < 150; i++) {
    const raw = legacyState();
    const s = C.hydrate(JSON.parse(JSON.stringify(raw)));
    const sum = C.rpgSummary(s);
    expect(sum.totalXp).toBe(H.getTotalXp(raw));
    expect(sum.level).toBe(H.computeLevel(H.getTotalXp(raw)).level);
    expect(JSON.stringify(C.groupLevels(s))).toBe(JSON.stringify(H.groupLevels(raw)));
    expect(JSON.stringify(C.combatStats(s))).toBe(JSON.stringify(H.combatStats(raw)));
    expect(JSON.stringify(C.earnedTitles(s).map((t: any) => t.id))).toBe(JSON.stringify(H.earnedTitles(raw).map((t: any) => t.id)));
    // las series migradas: tantas como el conteo, con las reps de trainMeta
    for (const [day, exs] of Object.entries(raw.training as Record<string, Record<string, number>>)) {
      for (const [id, n] of Object.entries(exs)) {
        const sets = s.sessions[day][id];
        expect(sets.length).toBe(n);
        const meta = raw.trainMeta[day]?.[id];
        if (meta) expect(sets.map((x) => x.reps)).toEqual(meta.sets.slice(0, n));
      }
    }
    // y volver a calcular un día desde las series deja el mismo conteo
    for (const day of Object.keys(raw.training)) expect(C.syncLegacyDay(s, day).training[day] ?? {}).toEqual(Object.fromEntries(Object.entries(raw.training[day]).filter(([, n]) => (n as number) > 0)));
  }
});

test("anotar series: conteo, trainMeta, último peso, misión de entrenar y XP", () => {
  let s = C.newState();
  s.bodyKg = 80;
  const tk = L.todayKey();
  const before = C.rpgSummary(s).totalXp;
  s = C.logSet(s, tk, "press_mil", { reps: 10, kg: 7, rir: 2 });
  s = C.logSet(s, tk, "press_mil", { reps: 9, kg: 7, rir: 1 });
  s = C.logSet(s, tk, "press_mil", { reps: 5, kg: 4, warmup: true });
  expect(s.training[tk].press_mil).toBe(2); // el calentamiento no cuenta
  expect(s.trainMeta[tk].press_mil).toEqual({ sets: [10, 9], kg: 7, unit: "" });
  expect(s.weights.press_mil).toBe(7);
  expect(s.today.workout).toBe(true);
  expect(C.rpgSummary(s).totalXp).toBeGreaterThan(before + 50 - 1); // misión (+50) y el trabajo de las series
  // máquina en libras: la carga efectiva va en kg
  s = C.logSet(s, tk, "jalon", { reps: 10, kg: 100, unit: "lb", rir: 2 });
  expect(C.effKg(s, C.BASE_BY_ID.jalon, s.sessions[tk].jalon[0])).toBe(45.4);
  // dominada asistida: peso corporal − asistencia, nunca negativo
  s = C.logSet(s, tk, "dom_asist", { reps: 8, assist: 25, rir: 2 });
  expect(C.effKg(s, C.BASE_BY_ID.dom_asist, s.sessions[tk].dom_asist[0])).toBe(55);
  expect(C.effKg(s, C.BASE_BY_ID.dom_asist, { reps: 5, assist: 120 })).toBe(0);
  expect(C.isStrict(C.BASE_BY_ID.dom_asist, s.sessions[tk].dom_asist[0])).toBe(false);
  // lastre en dominadas: el RPG cuenta la carga real
  const xpSin = C.rpgSummary(C.logSet(s, tk, "dom_prona", { reps: 6 })).totalXp;
  const xpCon = C.rpgSummary(C.logSet(s, tk, "dom_prona", { reps: 6, kg: 10 })).totalXp;
  expect(xpCon).toBeGreaterThan(xpSin);
  // los nuevos suben músculos del RPG
  const g0 = C.groupLevels(C.newState()).subL.dorsal.level;
  let t = C.newState(); t.bodyKg = 80;
  for (let i = 0; i < 40; i++) t = C.logSet(t, tk, "jalon", { reps: 10, kg: 60, rir: 2 });
  expect(C.groupLevels(t).subL.dorsal.level).toBeGreaterThan(g0);
  // borrar una serie
  s = C.removeSet(s, tk, "press_mil", 0);
  expect(s.training[tk].press_mil).toBe(1);
  expect(C.lastSetOf(s, "press_mil")?.reps).toBe(9);
});

test("el HTML puede leer lo que guarda Forge nativo (volver atrás)", () => {
  let s = C.newState();
  s.bodyKg = 75;
  const tk = L.todayKey();
  s = C.logSet(s, tk, "goblet", { reps: 12, kg: 14, rir: 2 });
  s = C.logSet(s, tk, "flexiones", { reps: 15, rir: 1 });
  const keys = C.toTojiKeys(s, { md: "# Día A", name: "Mi rutina" });
  const back = JSON.parse(keys["toji-rpg-v1"]);
  // el HTML lee los mismos entrenos (su XP usa su fórmula vieja, con el peso «actual»: puede variar un poco)
  expect(back.training[tk]).toEqual({ goblet: 1, flexiones: 1 });
  expect(back.trainMeta[tk].goblet).toEqual({ sets: [12], kg: 14, unit: "" });
  const htmlXp = H.getTotalXp({ ...H.defaultState(), ...back });
  expect(Math.abs(htmlXp - C.rpgSummary(s).totalXp)).toBeLessThan(10);
  const r = C.fromTojiKeys(keys);
  expect(r.routine).toEqual({ md: "# Día A", name: "Mi rutina" });
  expect(r.state.sessions[tk].goblet[0]).toMatchObject({ reps: 12, kg: 14, rir: 2 });
});

test("Mi gimnasio: solo pesos que existen", () => {
  const g = G.defaultGym("smartfit");
  const db = G.dbWeights(g);
  expect(db).toContain(7);
  expect(db).not.toContain(7.5);
  expect(db.slice(9, 13)).toEqual([10, 12, 14, 16]);
  expect(G.dbWeights({ ...g, dbSet: "dos_y_medio" })).toContain(7.5);
  expect(G.dbWeights({ ...g, dbSet: "propias", dbList: [5, 7, 7, 12] })).toEqual([5, 7, 12]);
  expect(G.barWeights(20, [20, 10, 5, 2.5]).slice(0, 4)).toEqual([20, 25, 30, 35]);
  expect(G.barWeights(20, [25, 20, 15, 10, 5, 2.5, 1.25]).slice(0, 3)).toEqual([20, 22.5, 25]);
  expect(G.platesText(70, 20, [25, 20, 15, 10, 5, 2.5, 1.25])).toBe("1 × 25 por lado");
  expect(G.platesText(92.5, 20, [25, 20, 15, 10, 5, 2.5, 1.25])).toBe("1 × 25 + 1 × 10 + 1 × 1,25 por lado");
  const p = G.pickerFor(C.BASE_BY_ID.jalon, { ...g, machines: { jalon: { unit: "lb", step: 10, min: 10, max: 200 } } });
  expect(p.unit).toBe("lb");
  expect(p.values.slice(0, 3)).toEqual([10, 20, 30]);
  expect(G.pickerFor(C.BASE_BY_ID.dom_asist, g).kind).toBe("assist");
  expect(G.stepFrom(db, 7, 1)).toBe(8);
  expect(G.stepFrom(db, 10, 1)).toBe(12);
  expect(G.nearest(db, 7.5)).toBe(7);
});

test("catálogo: ids únicos, alternativas que existen, músculos válidos", () => {
  const ids = C.BASE_EXERCISES.map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
  const subs = new Set(L.ALL_SUBS.map((x: any) => x.id));
  for (const e of C.BASE_EXERCISES) {
    for (const a of e.alt ?? []) if (!C.BASE_BY_ID[a]) throw new Error(`${e.id}: alternativa ${a} no existe`);
    for (const m of Object.keys(e.m)) if (!subs.has(m)) throw new Error(`${e.id}: músculo ${m} no existe`);
    if (["maq", "polea", "asist", "disc"].includes(e.eq) && !e.machine) throw new Error(`${e.id}: falta la máquina`);
  }
  console.log("ejercicios:", ids.length);
});

test("Arena: misma pelea con el mismo azar; la recompensa va al estado", () => {
  let s = C.newState(); s.bodyKg = 80;
  const en = L.REAL_ENEMIES[0];
  let f: any = C.startEnemy(s, en);
  let xp = 0; let guard = 0;
  let z = 3; const r = () => { z = (z * 16807) % 2147483647; return z / 2147483647; };
  while (!f.over && guard++ < 200) { const st = C.attack(s, f, null, r); f = st.fight; xp += st.xp; s = C.applyFightReward(s, st); }
  expect(f.over).toBe(true);
  if (f.win) expect(s.bankedXp).toBe(xp);
});

import * as M from "C:/Proyectos/eris-mobile/src/services/forge/forgeMigrate.ts";
test("migración completa: el JS corre dentro del HTML y la comparación calza; si algo no calza, no migra", () => {
  for (let i = 0; i < 25; i++) {
    const raw = legacyState();
    const posted: any[] = [];
    const ls = new Map<string, string>([["toji-routine-md-alex", JSON.stringify({ md: "# Rutina", name: "Mía" })]]);
    const win = { __ERIS_PROFILE_ID__: "alex", __RUTINA_MD__: sample, ReactNativeWebView: { postMessage: (m: string) => posted.push(JSON.parse(m)) } };
    const localStorage = { getItem: (k: string) => ls.get(k) ?? null };
    new Function("window", "localStorage", "React", `const Dumbbell='Dumbbell', Footprints='Footprints', Moon='Moon';\n${section}\n${M.migrationJS(raw)}`)(win, localStorage, {});
    const msg = posted.pop();
    expect(msg.type).toBe("toji_migration");
    expect(msg.error).toBeUndefined();
    expect(msg.routine).toEqual({ md: "# Rutina", name: "Mía" });
    const r = M.checkForgeMigration({ state: msg.state, routine: msg.routine, metrics: msg.metrics });
    if (!r.ok) console.log(r.diffs);
    expect(r.ok).toBe(true);
    // con una cifra distinta, no migra
    const bad = M.checkForgeMigration({ state: msg.state, routine: null, metrics: { ...msg.metrics, xp: msg.metrics.xp + 1 } });
    expect(bad.ok).toBe(false);
    expect(bad.diffs[0]).toContain("xp");
  }
  expect(M.isEmptyForge(H.defaultState())).toBe(true);
  expect(M.isEmptyForge(legacyState())).toBe(false);
});

test("cada serie cuenta con su carga: anotar una más liviana nunca resta XP; cambiar el peso corporal no cambia lo anotado", () => {
  let s = C.newState(); s.bodyKg = 85;
  const tk = L.todayKey();
  const d1 = (() => { const d = new Date(); d.setDate(d.getDate() - 2); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  for (let i = 0; i < 4; i++) s = C.logSet(s, d1, "jalon", { reps: 10, kg: 60, rir: 2 });
  for (let i = 0; i < 3; i++) s = C.logSet(s, d1, "flexiones", { reps: 15, rir: 2 });
  let prev = C.rpgSummary(s).totalXp;
  for (const kg of [55, 40, 20, 5]) {
    const next = C.logSet(s, tk, "jalon", { reps: 8, kg, rir: 1 });
    const xp = C.rpgSummary(next).totalXp;
    expect(xp).toBeGreaterThanOrEqual(prev);
    expect(C.setXpGain(s, next)).toBeGreaterThanOrEqual(1);
    s = next; prev = xp;
  }
  // subir de peso corporal no infla las flexiones de antes (quedó tu peso de ese día)
  const before = C.dayTrainXp(s, d1);
  expect(C.dayTrainXp({ ...s, bodyKg: 100 }, d1)).toBe(before);
  expect(s.sessions[d1].flexiones[0].body).toBe(85);
});

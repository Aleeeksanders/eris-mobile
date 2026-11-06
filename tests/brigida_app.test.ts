// Eris «brígida» en la app (2026-11-05): el resumen de los días entrenados que va al servidor («mi rutina de ayer»,
// «50 kilos de esta que se empuja») y los avisos en tono brígida
process.env.TZ = "America/Santiago";
import { test, expect, mock } from "bun:test";
mock.module("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } }));
mock.module("react-native", () => ({ DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove() {} }) }, Platform: { OS: "android", select: (o: any) => o.android ?? o.default } }));
mock.module("C:/Proyectos/eris-mobile/src/services/WebSocketManager.ts", () => ({ wsManager: { getStatus: () => "disconnected", sendMessage: () => {}, subscribeMessage: () => () => {} } }));
const C = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts");
const R = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeRoutine.ts");
const { defaultGym } = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeCatalog.ts");
const { voice } = await import("C:/Proyectos/eris-mobile/src/services/reminderRules.ts");
const { TONE_OPTIONS, isTone } = await import("C:/Proyectos/eris-mobile/src/services/tone.ts");
type FSet = import("C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts").FSet;

const tk = C.L.todayKey();
const hace = (n: number) => { const [y, m, d] = tk.split("-").map(Number); const f = new Date(y, m - 1, d - n); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`; };
const base = () => { const s = C.newState(); s.bodyKg = 80; s.sex = "h"; s.age = 30; s.heightCm = 175; s.gym = defaultGym("smartfit"); return s; };
const serie = (reps: number, kg?: number, extra: Partial<FSet> = {}, at = 0) => ({ reps, ...(kg != null ? { kg } : {}), rir: 1, at, ...extra });

function conAyer() {
  let s = base();
  const ayer = hace(1);
  s = C.logSet(s, ayer, "press_pecho_maq", serie(12, 110, { unit: "lb", warmup: true }, 1));
  for (const [k, r] of [[2, 12], [3, 12], [4, 11]] as const) s = C.logSet(s, ayer, "press_pecho_maq", serie(r, 110, { unit: "lb" }, k));
  for (const [k, r] of [[5, 8], [6, 7], [7, 6]] as const) s = C.logSet(s, ayer, "press_mil", serie(r, 16, {}, k));
  s = C.logSet(s, ayer, "fondos_asist", serie(8, undefined, { assist: 20 }, 8));
  s = C.logSet(s, hace(4), "remo_bb", serie(10, 50, {}, 1));
  return { s, ayer };
}

test("resumen de un día: series, reps y la carga (lb con su equivalente en kg; mancuerna «cada»; asistida sin kg)", () => {
  const { s, ayer } = conAyer();
  const d = R.resumenDia(s, ayer)!;
  expect(d.items.map((x) => x.name)).toEqual(["Press de pecho en máquina", "Press militar (mancuerna)", "Fondos asistidos (máquina)"]);
  expect(d.items[0].text).toBe("3 series: 12, 12, 11 reps · 110 lb (~49,9 kg)"); // sin el calentamiento
  expect(d.items[0].kg).toBe(49.9);
  expect(d.items[0].group).toBe("empuje");
  expect(d.items[1].text).toBe("3 series: 8, 7, 6 reps · 16 kg cada mancuerna");
  expect(d.items[2].text).toBe("1 serie: 8 reps · asistida −20 kg");
  expect(d.items[2].kg).toBeNull();
});

test("los días recientes van en lo que se manda al servidor, del más reciente al más antiguo", () => {
  const { s, ayer } = conAyer();
  const ctx = R.routineContext(s);
  expect(ctx.recent.map((d) => d.day)).toEqual([ayer, hace(4)]);
  expect(JSON.stringify(ctx.recent).length).toBeLessThan(6000);
});

test("tono brígida: opción en Perfil y avisos sin emojis, con su remate", () => {
  expect(isTone("brigida")).toBe(true);
  expect(TONE_OPTIONS.map((o) => o.id)).toContain("brigida");
  const v = voice("brigida");
  expect(v.e("💧")).toBe("");
  expect(v.h("Tu cuerpo te lo va a agradecer 💧", "Sin cuento.")).toBe(" Sin cuento.");
  expect(v.h("Solo humor")).toBe("");
  expect(v.s("tú", "usted")).toBe("tú");
  expect(voice("humor").h("Tu cuerpo te lo va a agradecer 💧", "Sin cuento.")).toBe(" Tu cuerpo te lo va a agradecer 💧");
});

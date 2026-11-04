// Revisión V2c (app): A1 la foto llega al cambiar · A2 módulos apagados · K1 día local · M2 GlucoTrack borra solo una comida
process.env.TZ = "America/Santiago";
import { test, expect, mock } from "bun:test";

(globalThis as any).__DEV__ = false;
const store: Record<string, string> = {};
const AS = {
  getItem: async (k: string) => store[k] ?? null, setItem: async (k: string, v: string) => { store[k] = v; }, removeItem: async (k: string) => { delete store[k]; },
  multiGet: async (ks: string[]) => ks.map((k) => [k, store[k] ?? null]), multiSet: async (kv: [string, string][]) => { for (const [k, v] of kv) store[k] = v; },
  multiRemove: async (ks: string[]) => { for (const k of ks) delete store[k]; }, getAllKeys: async () => Object.keys(store), mergeItem: async () => {}, clear: async () => {},
};
mock.module("@react-native-async-storage/async-storage", () => ({ default: AS }));
const listeners: Record<string, Array<(x: any) => void>> = {};
mock.module("react-native", () => ({
  Platform: { OS: "android", select: (o: any) => o.android ?? o.default }, AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" },
  DeviceEventEmitter: {
    emit: (e: string, x: any) => { for (const f of listeners[e] ?? []) f(x); },
    addListener: (e: string, f: any) => { (listeners[e] ??= []).push(f); return { remove() { listeners[e] = (listeners[e] ?? []).filter((g) => g !== f); } }; },
  },
}));
mock.module("expo-modules-core", () => ({ requireOptionalNativeModule: () => null, requireNativeModule: () => ({}) }));
const sent: any[] = [];
mock.module("C:/Proyectos/eris-mobile/src/services/WebSocketManager.ts", () => ({ wsManager: { getStatus: () => "connected", sendMessage: (m: any) => { sent.push(m); }, subscribeMessage: () => () => {} } }));
let cola: any[] = [{ pkg: "cl.bci.sismo.mach", app: "MACHBANK", title: "Compra", text: "Compraste $2.000 en Uber", at: Date.now(), key: "k1" }];
let tomadas = 0;
mock.module("C:/Proyectos/eris-mobile/modules/eris-bank-notifications/index.ts", () => ({ BankNotifications: {
  available: true, hasAccess: () => true, getAllowed: () => [], seenApps: () => [], getMail: () => false, onNotice: () => ({ remove() {} }), rebind: () => {},
  takeQueue: () => { tomadas++; const q = cola; cola = []; return q; },
} }));
mock.module("C:/Proyectos/eris-mobile/src/config/features.ts", () => ({ FeatureStore: { get: () => ({ glucose: false, finanzasAuto: true }) }, useFeature: () => true }));
mock.module("C:/Proyectos/eris-mobile/src/services/AuthStorage.ts", () => ({ AuthStorage: { getDisplayName: async () => "Alex", getCredentials: async () => ({ profileId: "prueba" }) } }));

mock.module("C:/Proyectos/eris-mobile/src/services/dayPlan/dayPlanStore.ts", () => ({ dayPlanStore: { getAuto: () => null } }));
mock.module("C:/Proyectos/eris-mobile/src/services/ErisNotifications.ts", () => ({ erisNotifications: { reminderSettings: async () => ({ sleep: true }), financeAuto: async () => {} } }));
const { modulosOn, respuestaApagado } = await import("C:/Proyectos/eris-mobile/src/services/modulosOn.ts");
const { autoPrefs, startAutoPrefs } = await import("C:/Proyectos/eris-mobile/src/services/autoPrefs.ts");
const { financeAuto } = await import("C:/Proyectos/eris-mobile/src/services/finance/financeAuto.ts");
const { diaLocal, fechaCorta } = await import("C:/Proyectos/eris-mobile/src/screens/inventory/ix.ts");
const { MobileGlucoService } = await import("C:/Proyectos/eris-mobile/src/services/GlucoService.ts");
const glucoService = new MobileGlucoService("http://localhost:1");

const espera = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test("A2: con Finanzas apagado, los avisos del banco no se toman ni se anotan", async () => {
  modulosOn.set(["pulso", "nutri"]);
  const r = await financeAuto.process();
  expect(r).toEqual({ anotados: 0, propuestos: 0 });
  expect(tomadas).toBe(0); // quedan en la cola del teléfono
  expect(respuestaApagado("Finanzas")).toMatchObject({ ok: false, code: "modulo_apagado" });
  modulosOn.set(null);
  expect(modulosOn.on("finanzas")).toBe(true);
});

test("A2: el evento de módulos actualiza la lista y la foto que va al servidor la lleva", async () => {
  const { DeviceEventEmitter } = await import("react-native");
  DeviceEventEmitter.emit("MODULES_CHANGED", ["nutri", "toji"]);
  expect(modulosOn.on("finanzas")).toBe(false);
  const snap = await autoPrefs.snapshot();
  expect(snap.modulos).toEqual(["nutri", "toji"]);
});

test("A1: un cambio en un módulo manda la foto (una vez, y solo si cambió)", async () => {
  startAutoPrefs();
  sent.length = 0;
  const { DeviceEventEmitter } = await import("react-native");
  DeviceEventEmitter.emit("finance_auto_changed", null);
  DeviceEventEmitter.emit("inventory_state_changed", null);
  await espera(1700);
  const fotos = () => sent.filter((m) => m.type === "save_preference" && m.key === "auto_prefs");
  expect(fotos().length).toBe(1);
  DeviceEventEmitter.emit("inventory_state_changed", null); // nada cambió
  await espera(1700);
  expect(fotos().length).toBe(1);
  DeviceEventEmitter.emit("MODULES_CHANGED", ["nutri", "toji", "finanzas"]); // cambió
  await espera(1700);
  expect(fotos().length).toBe(2);
  expect(fotos()[1].value.modulos).toContain("finanzas");
}, 10000);

test("K1: el historial usa el día local (después de las 21:00 no sale como de mañana)", () => {
  const iso = new Date(2026, 10, 4, 22, 30).toISOString(); // 22:30 en Chile = 01:30 UTC del 5
  expect(iso.slice(0, 10)).toBe("2026-11-05");
  expect(diaLocal(iso)).toBe("2026-11-04");
  expect(fechaCorta(diaLocal(iso))).toMatch(/^4 /);
});

test("M2: borrar una comida de GlucoTrack no borra lo de más de 30 días; un registro dañado no rompe", async () => {
  const svc: any = glucoService;
  const vieja = { id: "v", timestamp: new Date(Date.now() - 60 * 86_400_000).toISOString(), foods: [], totalCalories: 100, estimatedGL: 1, riskLevel: "low" };
  const hoy = { id: "h", timestamp: new Date().toISOString(), foods: [], totalCalories: 200, estimatedGL: 2, riskLevel: "low" };
  await svc.saveMealLog(vieja);
  await svc.saveMealLog(hoy);
  const k = Object.keys(store).find((x) => x.endsWith("gluco_meal_log"))!;
  expect(JSON.parse(store[k]).map((e: any) => e.id)).toEqual(["h", "v"]);
  await svc.deleteMeal("h");
  expect(JSON.parse(store[k]).map((e: any) => e.id)).toEqual(["v"]);
  store[k] = "{roto";
  expect(await svc.getMealLog(7)).toEqual([]);
  expect(Object.keys(store).some((x) => x.includes("gluco_meal_log__danado_"))).toBe(true);
});

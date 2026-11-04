// Revisión V2a — I1: botones tocados con la app cerrada (se entregan al abrir) · I2: a dónde llevan
process.env.TZ = "America/Santiago";
import { test, expect, mock } from "bun:test";

(globalThis as any).__DEV__ = false;
mock.module("expo-modules-core", () => ({ requireOptionalNativeModule: () => null, requireNativeModule: () => ({}), EventEmitter: class { addListener() { return { remove() {} }; } }, Platform: { OS: "android" } }));
const store: Record<string, string> = {};
mock.module("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (k: string) => store[k] ?? null, setItem: async (k: string, v: string) => { store[k] = v; }, removeItem: async (k: string) => { delete store[k]; },
  multiGet: async (ks: string[]) => ks.map((k) => [k, store[k] ?? null]), getAllKeys: async () => Object.keys(store), multiRemove: async () => {},
} }));
const listeners: Record<string, Array<(x: any) => void>> = {};
const emitted: Array<[string, any]> = [];
mock.module("react-native", () => ({
  Platform: { OS: "android", select: (o: any) => o.android ?? o.default }, AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => ({}) }, NativeModules: {}, NativeEventEmitter: class { addListener() { return { remove() {} }; } },
  DeviceEventEmitter: {
    emit: (e: string, x: any) => { emitted.push([e, x]); for (const f of listeners[e] ?? []) f(x); },
    addListener: (e: string, f: any) => { (listeners[e] ??= []).push(f); return { remove() { listeners[e] = (listeners[e] ?? []).filter((g) => g !== f); } }; },
  },
}));
let status = "disconnected";
const sent: any[] = [];
const wsSubs: Array<(d: any) => void> = [];
mock.module("C:/Proyectos/eris-mobile/src/services/WebSocketManager.ts", () => ({ wsManager: {
  getStatus: () => status, sendMessage: (m: any) => { sent.push(m); }, subscribeMessage: (f: any) => { wsSubs.push(f); return () => {}; },
} }));
mock.module("C:/Proyectos/eris-mobile/src/services/AuthStorage.ts", () => ({ AuthStorage: { getDisplayName: async () => "Alex", getCredentials: async () => null } }));
let last: any = null;
let handler: any = null;
mock.module("expo-notifications", () => ({
  getLastNotificationResponse: () => last, clearLastNotificationResponse: () => { last = null; },
  dismissNotificationAsync: async () => {}, setNotificationHandler: (h: any) => { handler = h; }, setNotificationChannelAsync: async () => {},
  setNotificationCategoryAsync: async () => {}, addNotificationResponseReceivedListener: () => ({ remove() {} }),
  getPermissionsAsync: async () => ({ granted: true }), requestPermissionsAsync: async () => ({ granted: true }),
  scheduleNotificationAsync: async () => "id", getPresentedNotificationsAsync: async () => [], cancelScheduledNotificationAsync: async () => {},
  getAllScheduledNotificationsAsync: async () => [], AndroidImportance: { HIGH: 4, DEFAULT: 3, LOW: 2, MAX: 5 }, AndroidNotificationPriority: { HIGH: "high", MAX: "max", DEFAULT: "default" },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0 }, SchedulableTriggerInputTypes: { DATE: "date" }, DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
}));
const hechos: string[] = [];
mock.module("C:/Proyectos/eris-mobile/src/services/dayPlan/dayPlanStore.ts", () => ({ dayPlanStore: { doneOrQueue: async (id: string) => { hechos.push(id); } } }));

const { erisNotifications } = await import("C:/Proyectos/eris-mobile/src/services/ErisNotifications.ts");
const { pedirDestino, escucharDestino, tomarDestino } = await import("C:/Proyectos/eris-mobile/src/services/notifTargets.ts");

const resp = (action: string, data: any, id = `n${Math.random()}`) => ({ actionIdentifier: action, notification: { request: { identifier: id, content: { data } } } });
const espera = () => new Promise((r) => setTimeout(r, 20));

test("I1: «Lo comí ✓» y «Hecho ✓» con la app cerrada se hacen al abrir (una vez)", async () => {
  last = resp("plan_comi", { kind: "meal", pasoId: "comida-almuerzo" }, "plan-almuerzo");
  expect(erisNotifications.takeLaunchAction()).toBeNull(); // no abre nada
  await espera();
  expect(hechos).toEqual(["comida-almuerzo"]);
  last = resp("plan_hecho", { kind: "focus", pasoId: "mente-cafe1" }, "focus-1");
  expect(erisNotifications.takeLaunchAction()).toBeNull();
  await espera();
  expect(hechos).toEqual(["comida-almuerzo", "mente-cafe1"]);
  // la misma notificación otra vez (Android la vuelve a entregar): no se repite
  last = resp("plan_comi", { kind: "meal", pasoId: "comida-almuerzo" }, "plan-almuerzo");
  erisNotifications.takeLaunchAction();
  await espera();
  expect(hechos.length).toBe(2);
});

test("I1: «Rechazar» con la app cerrada: se manda al tener sesión", async () => {
  status = "disconnected";
  await erisNotifications.init();
  last = resp("rechazar", { kind: "approval", approvalId: "ap-7" });
  expect(erisNotifications.takeLaunchAction()).toBeNull();
  await espera();
  expect(sent.filter((m) => m.type === "confirm_response")).toEqual([]);
  status = "connected";
  for (const f of wsSubs) f({ type: "connected" });
  await espera();
  expect(sent.filter((m) => m.type === "confirm_response")).toEqual([{ type: "confirm_response", id: "ap-7", approved: false }]);
  expect(emitted.some(([, x]) => x === "ap-7")).toBe(true);
});

test("I2: los pedidos de destino llegan aunque la pantalla se monte después, una sola vez", async () => {
  pedirDestino("suplementos");
  let n = 0;
  const off = escucharDestino("suplementos", () => { n++; });
  await espera();
  expect(n).toBe(1);
  pedirDestino("suplementos");
  expect(n).toBe(2);
  off();
  expect(tomarDestino("suplementos")).toBe(false);
  // otro destino no lo dispara
  let m = 0;
  const off2 = escucharDestino("entreno_hora", () => { m++; });
  pedirDestino("suplementos");
  expect(m).toBe(0);
  off2();
});

test("I2: tocar el aviso (no un botón) de suplementos y «Ver mi día» llegan con su acción", () => {
  last = resp("expo.modules.notifications.actions.DEFAULT", { kind: "supplement", tap: "home", supId: "creatina" });
  const o = erisNotifications.takeLaunchAction();
  expect(o).toMatchObject({ kind: "supplement", tap: "home" });
  last = resp("plan_ver", { kind: "focus", tap: "home" });
  expect(erisNotifications.takeLaunchAction()).toMatchObject({ action: "plan_ver" });
});

test("Z1: los avisos de sueño se ven con la app abierta (sin sonar), como los demás del día", async () => {
  await erisNotifications.init();
  const ver = (kind: string) => handler.handleNotification({ request: { content: { data: { kind } } } });
  expect(await ver("sleep")).toMatchObject({ shouldShowBanner: true, shouldPlaySound: false });
  expect(await ver("meal")).toMatchObject({ shouldShowBanner: true });
  expect(await ver("finance_auto")).toMatchObject({ shouldShowBanner: false });
});

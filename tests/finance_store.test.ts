// Finanzas nativa: migración desde la web (comparada al peso) y el store (guarda, avisa, respalda).
import { test, expect, mock } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const store: Record<string, string> = {};
mock.module("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (k: string) => store[k] ?? null, setItem: async (k: string, v: string) => { store[k] = v; }, removeItem: async (k: string) => { delete store[k]; },
  multiGet: async (ks: string[]) => ks.map((k) => [k, store[k] ?? null]), multiSet: async (kv: [string, string][]) => { for (const [k, v] of kv) store[k] = v; },
  multiRemove: async (ks: string[]) => { for (const k of ks) delete store[k]; }, getAllKeys: async () => Object.keys(store), mergeItem: async () => {}, clear: async () => {},
} }));
const emitted: string[] = [];
mock.module("react-native", () => ({ DeviceEventEmitter: { emit: (e: string) => { emitted.push(e); }, addListener: () => ({ remove() {} }) } }));
const sent: any[] = [];
mock.module("C:/Proyectos/eris-mobile/src/services/WebSocketManager.ts", () => ({ wsManager: {
  getStatus: () => "connected", sendMessage: (m: any) => { sent.push(m); }, subscribeMessage: () => () => {},
} }));

const { checkMigration } = await import("C:/Proyectos/eris-mobile/src/services/finance/financeMigrate.ts");
const { financeStore, FINANCE_STATE_KEY } = await import("C:/Proyectos/eris-mobile/src/services/finance/financeStore.ts");
const core = await import("C:/Proyectos/eris-mobile/src/services/finance/financeCore.ts");

// ScopedStorage guarda por cuenta: u:<perfil>:finance_state_v1
const saved = () => store[Object.keys(store).find((k) => k.endsWith(FINANCE_STATE_KEY))!];
const web = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "hw_f1", "web_out.json"), "utf-8"));
const snap = { dump: { profile: "prueba", keys: web.dump }, extract: { summary: web.summary, context: web.context } };
// La web calculó su resumen el 16-10 (revisión F4: fallaba por comparar con la fecha de hoy, no por la migración)
const CUANDO = new Date("2026-10-16T09:06:00-03:00");

test("migración: lo de la web pasa igual al peso", () => {
  const r = checkMigration(snap, CUANDO);
  expect(r.diffs).toEqual([]);
  expect(r.ok).toBe(true);
  expect(r.state!.tx.length).toBe(JSON.parse(web.dump.hw2_tx).length);
});

test("migración: si algo no calza, no se migra y dice qué", () => {
  const tampered = { ...snap, extract: { ...snap.extract, summary: { ...snap.extract.summary, liquidez: 1 } } };
  const r = checkMigration(tampered, CUANDO);
  expect(r.ok).toBe(false);
  expect(r.diffs.join(" ")).toContain("liquidez");
  expect(checkMigration({} as any).ok).toBe(false);
});

test("store: sin Finanzas nativa no hace nada; con ella guarda, avisa y respalda", async () => {
  financeStore.setProfileSource(async () => "prueba");
  expect(await financeStore.exists()).toBe(false);
  expect(await financeStore.apply({ action: "gasto", monto: 1000 })).toBeNull();
  const S = checkMigration(snap, CUANDO).state!;
  await financeStore.replace(S);
  expect(JSON.parse(saved()).tx.length).toBe(S.tx.length);
  const r = await financeStore.apply({ action: "gasto", monto: 2500, descripcion: "café", categoria: "alimentacion", cuenta: "bci" });
  expect(r?.ok).toBe(true);
  expect(financeStore.get()!.tx.length).toBe(S.tx.length + 1);
  expect(JSON.parse(saved()).tx.length).toBe(S.tx.length + 1);
  expect(emitted).toContain("finance_state_changed");
  await new Promise((r) => setTimeout(r, 20));
  const pushes = sent.filter((m) => m.type === "finance_backup_push");
  expect(pushes.length).toBeGreaterThan(0);
  const last = pushes.at(-1);
  expect(last.dump.profile).toBe("prueba");
  expect(core.fromHwKeys(last.dump.keys).tx.length).toBe(S.tx.length + 1); // el respaldo trae lo nuevo, en formato web
  // ids crecientes y únicos
  await financeStore.apply({ action: "gasto", monto: 100, descripcion: "a", categoria: "otros", cuenta: "bci" });
  await financeStore.apply({ action: "gasto", monto: 100, descripcion: "b", categoria: "otros", cuenta: "bci" });
  const ids = financeStore.get()!.tx.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
});

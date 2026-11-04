// Revisión exhaustiva V2a (Finanzas): F1 lector de avisos + releer, F2 una sola cifra, F3 sin caer a la web, F5 detalles
process.env.TZ = "America/Santiago";
import { test, expect, mock } from "bun:test";

const store: Record<string, string> = {};
const AS = {
  getItem: async (k: string) => store[k] ?? null, setItem: async (k: string, v: string) => { store[k] = v; }, removeItem: async (k: string) => { delete store[k]; },
  multiGet: async (ks: string[]) => ks.map((k) => [k, store[k] ?? null]), multiSet: async (kv: [string, string][]) => { for (const [k, v] of kv) store[k] = v; },
  multiRemove: async (ks: string[]) => { for (const k of ks) delete store[k]; }, getAllKeys: async () => Object.keys(store), mergeItem: async () => {}, clear: async () => {},
};
mock.module("@react-native-async-storage/async-storage", () => ({ default: AS }));
mock.module("react-native", () => ({
  Platform: { OS: "android" }, AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" },
  DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove() {} }) },
}));
mock.module("C:/Proyectos/eris-mobile/src/services/WebSocketManager.ts", () => ({ wsManager: { getStatus: () => "connected", sendMessage: () => {}, subscribeMessage: () => () => {} } }));
let cola: any[] = [];
mock.module("C:/Proyectos/eris-mobile/modules/eris-bank-notifications/index.ts", () => ({ BankNotifications: {
  available: true, hasAccess: () => true, getAllowed: () => ["cl.bci.sismo.mach"], seenApps: () => [{ pkg: "cl.bci.sismo.mach", app: "MACHBANK", count: 1, last: 0 }],
  getMail: () => false, takeQueue: () => { const q = cola; cola = []; return q; }, onNotice: () => ({ remove() {} }), rebind: () => {},
} }));
mock.module("C:/Proyectos/eris-mobile/src/config/features.ts", () => ({ FeatureStore: { get: () => true, isOn: () => true }, useFeature: () => true }));
mock.module("C:/Proyectos/eris-mobile/src/services/AuthStorage.ts", () => ({ AuthStorage: { getDisplayName: async () => "Alex", getProfileId: async () => "prueba" } }));

const { parseAviso } = await import("C:/Proyectos/eris-mobile/src/services/finance/bankNotif.ts");
const { categoriaDelAviso, decidir, AUTO_DEFAULT } = await import("C:/Proyectos/eris-mobile/src/services/finance/bankAuto.ts");
const core = await import("C:/Proyectos/eris-mobile/src/services/finance/financeCore.ts");
const { financeStore } = await import("C:/Proyectos/eris-mobile/src/services/finance/financeStore.ts");
const { financeAuto } = await import("C:/Proyectos/eris-mobile/src/services/finance/financeAuto.ts");
const { financeBridge } = await import("C:/Proyectos/eris-mobile/src/services/FinanceBridge.ts");
const { financeInbox } = await import("C:/Proyectos/eris-mobile/src/services/finance/financeInbox.ts");

const AT = new Date(2026, 10, 3, 13, 5).getTime();
const mach = (title: string, text: string, key = `k${Math.random()}`) => ({ pkg: "cl.bci.sismo.mach", app: "MACHBANK", title, text, at: AT, key });
const be = (title: string, text: string) => ({ pkg: "net.veritran.becl.prod", app: "BancoEstado", title, text, at: AT, key: `b${Math.random()}` });

// ─── F1: el lector ─────────────────────────────────────────────────────────

test("F1: comercio con minúsculas («en Uber Eats»), ya no «Compra MACHBANK»", () => {
  const p = parseAviso(mach("Compra exitosa", "Compraste $8.490 en Uber Eats con tu tarjeta"))!;
  expect(p.comercio).toBe("Uber Eats");
  expect(p.desc).not.toContain("MACHBANK");
  const q = parseAviso(mach("MACH", "Pagaste $3.978 en Lider Express."))!;
  expect(q.comercio).toBe("Lider Express");
  // lo de antes sigue igual
  expect(parseAviso(mach("Compra aprobada", "Compra por $12.990 en LIDER EXPRESS con tu tarjeta ****4521"))!.comercio).toBe("LIDER EXPRESS");
});

test("F1: el comercio en el título del aviso; un título genérico no es comercio", () => {
  expect(parseAviso(mach("Starbucks", "Compraste $8.310 con tu tarjeta MACH"))!.comercio).toBe("Starbucks");
  for (const t of ["¡Compra exitosa!", "Compra aprobada", "MACHBANK", "Tarjeta MACH", "Nuevo movimiento"]) {
    const p = parseAviso(mach(t, "Compraste $8.310 con tu tarjeta"))!;
    expect(p.comercio).toBeUndefined();
    expect(p.desc).toBe("Compra con MACH");
  }
});

test("F1: «en 3 cuotas», «en tu cuenta» o un banco no son comercio", () => {
  expect(parseAviso(mach("Compra", "Compra por $30.000 en 3 cuotas con tu tarjeta"))!.comercio).toBeUndefined();
  expect(parseAviso(mach("Compra", "Cargo de $5.000 en tu cuenta"))!.comercio).toBeUndefined();
});

test("F1: transferencias de BancoEstado: «a la cuenta de», «Destinatario:», «cuenta destino ****»", () => {
  const a = parseAviso(be("Transferencia exitosa", "Transferiste $54.580 a la cuenta de Juan Pérez"))!;
  expect(a.tipo).toBe("transferencia");
  expect(a.contraparte).toBe("Juan Pérez");
  expect(a.desc).toBe("Transferencia a Juan Pérez");
  const b = parseAviso(be("Transferencia realizada", "Realizaste una transferencia por $200.000. Destinatario: MARIA SOTO. Cuenta destino ****7001"))!;
  expect(b.contraparte).toBe("Maria Soto");
  expect(b.last4Otra).toBe("7001");
  expect(b.last4).toBeUndefined();
});

test("F1: una compra sin comercio no copia la categoría de la anterior sin comercio", () => {
  const S = core.emptyState();
  S.setupDone = true;
  S.cuentas = [{ id: 1, nombre: "MACH", banco: "MACH", tipo: "debito", saldoInicial: 100_000 }] as any;
  S.tx = [{ id: 9, tipo: "gasto", desc: "Compra con MACH", monto: 1500, cat: "entretenimiento", fecha: "2026-11-01", desde: 1 }] as any;
  const p = parseAviso(mach("Compra exitosa", "Compraste $2.000 con tu tarjeta"))!;
  expect(categoriaDelAviso(p, S)).toEqual({ cat: "otros", conocido: false });
  // con comercio sí aprende
  S.tx.push({ id: 10, tipo: "gasto", desc: "Patreon", monto: 3594, cat: "entretenimiento", fecha: "2026-11-01", desde: 1 } as any);
  const q = parseAviso(mach("Compra", "Compraste $3.594 en Patreon"))!;
  expect(categoriaDelAviso(q, S).conocido).toBe(true);
  // y se sigue anotando sola (la cuenta es clara)
  const d = decidir(mach("Compra exitosa", "Compraste $2.000 con tu tarjeta"), S, {}, { ...AUTO_DEFAULT, on: true, allowed: true });
  expect(d.accion).toBe("anotar");
});

test("F1: releer corrige lo ya anotado con el lector viejo, salvo lo que la persona renombró", async () => {
  for (const k of Object.keys(store)) delete store[k];
  const S = core.emptyState();
  S.setupDone = true;
  S.cuentas = [{ id: 1, nombre: "MACH", banco: "MACH", tipo: "debito", saldoInicial: 100_000 }] as any;
  S.tx = [
    { id: 1, tipo: "gasto", desc: "Compra MACHBANK", monto: 8490, cat: "otros", fecha: "2026-11-03", desde: 1 },
    { id: 2, tipo: "gasto", desc: "Cine con Vale", monto: 7900, cat: "entretenimiento", fecha: "2026-11-03", desde: 1 },
    { id: 3, tipo: "gasto", desc: "Compra MACHBANK", monto: 1500, cat: "alimentacion", fecha: "2026-11-03", desde: 1 },
  ] as any;
  await financeStore.replace(S);
  const viejo = (id: number, monto: number, texto: string) => ({ clave: `notif:k${id}`, txId: id, desc: "Compra MACHBANK", monto, cat: "otros", cuenta: 1, cuentaNombre: "MACH",
    fecha: "2026-11-03", hora: "13:05", app: "MACHBANK", at: Date.now(),
    p: { clave: `notif:k${id}`, fuente: "banco", app: "MACHBANK", pkg: "cl.bci.sismo.mach", tipo: "compra", monto, desc: "Compra MACHBANK", cat: "otros", fecha: "2026-11-03", hora: "13:05", texto, at: Date.now() } });
  const KEY = Object.keys(store).find((k) => k.endsWith("finance_state_v1"))!.replace("finance_state_v1", "finance_auto_log_v1");
  store[KEY] = JSON.stringify([
    viejo(1, 8490, "Compra exitosa · Compraste $8.490 en Uber Eats con tu tarjeta"),
    viejo(2, 7900, "Compra exitosa · Compraste $7.900 en Cinemark con tu tarjeta"), // la persona lo renombró
    viejo(3, 1500, "Compra exitosa · Compraste $1.500 con tu tarjeta"), // sigue sin comercio: nombre nuevo
  ]);
  const n = await financeAuto.releer();
  const tx = financeStore.get()!.tx;
  expect(tx.find((t) => t.id === 1)!.desc).toBe("Uber Eats");
  expect(tx.find((t) => t.id === 1)!.cat).not.toBe("otros"); // estaba en Otros y ahora se sabe
  expect(tx.find((t) => t.id === 2)!.desc).toBe("Cine con Vale");
  expect(tx.find((t) => t.id === 3)!.desc).toBe("Compra con MACH");
  expect(tx.find((t) => t.id === 3)!.cat).toBe("alimentacion"); // la categoría que eligió la persona no se toca
  expect(n).toBe(2);
  // una sola vez
  expect(await financeAuto.releer()).toBe(0);
});

// ─── F2: una sola cifra y los nombres de la app ────────────────────────────

test("F2: lo que lee Eris: sin «Plata a mano», con «Comida»/«Ocio» y «-$»", () => {
  const S = core.emptyState();
  S.setupDone = true;
  S.cuentas = [{ id: 1, nombre: "Cuenta RUT", banco: "Banco Estado", tipo: "debito", saldoInicial: 50_000 }, { id: 2, nombre: "Visa", banco: "BCI", tipo: "credito", saldoInicial: 100_000, cupo: 100_000 }] as any;
  const hoy = new Date(2026, 10, 4, 12);
  S.tx = [
    { id: 1, tipo: "gasto", desc: "Almuerzo", monto: 8000, cat: "alimentacion", fecha: "2026-11-02", desde: 1 },
    { id: 2, tipo: "gasto", desc: "Cine", monto: 6000, cat: "entretenimiento", fecha: "2026-11-02", desde: 1 },
    { id: 3, tipo: "gasto", desc: "Notebook", monto: 120_000, cat: "hogar", fecha: "2026-11-03", desde: 2 },
  ] as any;
  const ctx = core.extract(S, hoy).context;
  expect(ctx).not.toContain("Plata a mano");
  expect(ctx).toContain("Su plata");
  expect(ctx).toContain("  · Comida: $8.000");
  expect(ctx).toContain("  · Ocio: $6.000");
  expect(ctx).not.toMatch(/Alimentacion|Entretenimiento/);
  expect(ctx).not.toMatch(/\$-\d/);
  expect(ctx).toContain("-$20.000"); // cupo libre de la Visa pasada del cupo
  // la paridad con la web no cambia: extractLegacy sigue igual
  const L = core.extractLegacy(S, hoy).context;
  expect(L).toContain("Plata a mano");
  expect(L).toContain("Alimentacion");
  expect(L).toContain("$-20.000");
  expect(core.clp(-12345)).toBe("-$12.345");
  expect(core.clp(-0.3)).toBe("$0");
});

// ─── F3: el chat no cae a la Finanzas web vieja ────────────────────────────

test("F3: si el libro nativo está ilegible o falla, el chat responde el error (no anota en la web)", async () => {
  for (const k of Object.keys(store)) delete store[k];
  await financeStore.replace(core.emptyState());
  const k = Object.keys(store).find((x) => x.endsWith("finance_state_v1"))!;
  store[k] = "{roto";
  // recargar como al abrir la app
  (financeStore as any).loaded = false; (financeStore as any).loading = null; (financeStore as any).state = null;
  const r = await financeBridge.run({ action: "gasto", monto: 5000, desc: "almuerzo" });
  expect(r.ok).toBe(false);
  expect(r.msg).toContain("no anoté nada");
  // y si AsyncStorage falla al leer, lo mismo
  (financeStore as any).loaded = false; (financeStore as any).loading = null;
  const orig = AS.getItem;
  AS.getItem = async () => { throw new Error("disco"); };
  const r2 = await financeBridge.run({ action: "gasto", monto: 5000, desc: "almuerzo" });
  AS.getItem = orig;
  expect(r2.ok).toBe(false);
  expect(r2.code).toBe("error");
});

// ─── F5: «Por confirmar» no pierde avisos callado ──────────────────────────

test("F5: lo que no cabe en «Por confirmar» queda contado", async () => {
  for (const k of Object.keys(store)) delete store[k];
  const prop = (i: number) => ({ clave: `notif:x${i}`, fuente: "banco", app: "MACH", pkg: "p", tipo: "compra", monto: 1000 + i, desc: `C${i}`, cat: "otros", fecha: "2026-11-03", hora: "10:00", texto: "t" }) as any;
  await financeInbox.add(Array.from({ length: 240 }, (_, i) => prop(i)));
  expect((await financeInbox.list()).length).toBe(240);
  expect(await financeInbox.fuera()).toBe(0);
  await financeInbox.add(Array.from({ length: 20 }, (_, i) => prop(300 + i)));
  expect((await financeInbox.list()).length).toBe(250);
  expect(await financeInbox.fuera()).toBe(10);
  // los que salieron no vuelven a entrar como nuevos
  expect((await financeInbox.vistos()).has("notif:x0")).toBe(true);
  await financeInbox.olvidarFuera();
  expect(await financeInbox.fuera()).toBe(0);
});

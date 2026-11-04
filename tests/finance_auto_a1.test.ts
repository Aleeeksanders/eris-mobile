// Eris administra (A1): transferencias (entre tus cuentas, a otros), sueldo, «Me debe», fijos, giros, pago de tarjeta,
// correos/SMS del banco y los lectores por formato.
process.env.TZ = "America/Santiago";
import { test, expect } from "bun:test";
import { decidir, emparejar, aplicar, anotarAviso, convertirEnPropia, editarEntrada, sugerir, resumenAnotado, esYo, AUTO_DEFAULT, ESPERA_MS, type AutoConfig, type Decision } from "C:/Proyectos/eris-mobile/src/services/finance/bankAuto.ts";
import { parseAviso, type AvisoBanco } from "C:/Proyectos/eris-mobile/src/services/finance/bankNotif.ts";
import { emptyState, estado, vistas, formGasto, formPrestamo, formEfectivo, editarGasto, confirmarIngreso, deudaDe, vistaCuenta, CASH, type FinanceState } from "C:/Proyectos/eris-mobile/src/services/finance/financeCore.ts";

const ON: AutoConfig = { ...AUTO_DEFAULT, on: true, allowed: true };
const AT = new Date(2026, 9, 30, 13, 5).getTime();
let k = 0;
const aviso = (text: string, o: Partial<AvisoBanco> = {}): AvisoBanco =>
  ({ pkg: o.pkg ?? "cl.bci.app.personas", app: o.app ?? "BCI", title: o.title ?? "", text, at: o.at ?? AT, key: o.key ?? `k${++k}`, ...(o.via ? { via: o.via } : {}) });
const SAN = { pkg: "cl.santander.smartphone", app: "Santander" };
function S0(cuentas: any[]): FinanceState {
  const S = emptyState();
  S.cuentas = cuentas as any;
  S.setupDone = true;
  return S;
}
const ctx = () => { let id = 5000 + Math.floor(Math.random() * 1000) * 10; return { now: new Date(AT), newId: () => ++id }; };
const BCI = { id: 1, nombre: "Cuenta corriente", banco: "BCI", tipo: "debito", saldoInicial: 500_000 };
const VISA = { id: 2, nombre: "Visa", banco: "BCI", tipo: "credito", saldoInicial: 600_000, cupo: 800_000 }; // debe 200.000
const SANT = { id: 3, nombre: "Cuenta Santander 5678", banco: "Santander", tipo: "debito", saldoInicial: 300_000 };
const AHORRO = { id: 4, nombre: "Ahorro", banco: "Santander", tipo: "ahorro", saldoInicial: 1_000_000 };
const saldo = (S: FinanceState, id: any) => vistaCuenta(estado(S), id)!.saldo;
const anota = (S: FinanceState, d: Decision) => { const r = aplicar(S, d, ctx()); expect(r.ok).toBe(true); return r; };

// ─── Lectores ─────────────────────────────────────────────────────────────

test("lectores: compras de cada banco (CuentaRUT, Santander con tarjeta, Tenpo, SMS del Banco de Chile en «pesos» con *1234)", () => {
  const be = parseAviso(aviso("BancoEstado informa: Compra por $12.990 en LIDER EXPRESS con tu CuentaRUT", { pkg: "cl.bancoestado.app", app: "BancoEstado" }))!;
  expect([be.tipo, be.monto, be.desc, be.banco]).toEqual(["compra", 12990, "Lider", "bancoestado"]);
  const st = parseAviso(aviso("Compra por $8.500 con Tarjeta de Crédito ****4321 en UBER TRIP el 30/10/2026 13:05", SAN))!;
  expect([st.tipo, st.monto, st.last4]).toEqual(["compra", 8500, "4321"]);
  const te = parseAviso(aviso("Compraste $3.990 en SPOTIFY", { pkg: "com.tenpo.app", app: "Tenpo" }))!;
  expect([te.tipo, te.monto]).toEqual(["compra", 3990]);
  const sms = parseAviso(aviso("Banco de Chile: Compra por 15.000 pesos con su tarjeta de crédito *1234 en COPEC", { pkg: "com.google.android.apps.messaging", app: "BancoChile", title: "BancoChile", via: "sms" }))!;
  expect([sms.tipo, sms.monto, sms.last4, sms.app, sms.banco, sms.via]).toEqual(["compra", 15000, "1234", "Banco de Chile · SMS", "chile", "sms"]);
});

test("lectores: transferencias enviadas y recibidas, con quién, la otra cuenta y el saldo", () => {
  const env = parseAviso(aviso("Transferiste $50.000 a JUAN PEREZ desde tu cuenta ****1234"))!;
  expect([env.tipo, env.contraparte, env.last4, env.desc]).toEqual(["transferencia", "Juan Perez", "1234", "Transferencia a Juan Perez"]);
  const propia = parseAviso(aviso("Transferencia exitosa: $200.000 a tu cuenta ****5678"))!;
  expect([propia.tipo, propia.contraparte, propia.last4Otra]).toEqual(["transferencia", undefined, "5678"]);
  const rec = parseAviso(aviso("Recibiste una transferencia de $120.000 de EMPRESA SPA"))!;
  expect([rec.tipo, rec.monto, rec.contraparte, rec.desc]).toEqual(["ingreso", 120000, "Empresa Spa", "Transferencia de Empresa Spa"]);
  const mp = parseAviso(aviso("Juan Pérez te envió $5.000", { pkg: "com.mercadopago.wallet", app: "Mercado Pago" }))!;
  expect([mp.tipo, mp.contraparte]).toEqual(["ingreso", "Juan Pérez"]);
  const dep = parseAviso(aviso("Te depositaron $1.250.000 en tu CuentaRUT. Saldo disponible $1.300.000", { pkg: "cl.bancoestado.app", app: "BancoEstado" }))!;
  expect([dep.tipo, dep.monto, dep.saldo]).toEqual(["ingreso", 1250000, 1300000]);
  expect(parseAviso(aviso("Transferencia de $30.000 a Pedro Soto"))!.tipo).toBe("transferencia");
  expect(parseAviso(aviso("Transferencia de $30.000 de Pedro Soto"))!.tipo).toBe("ingreso");
});

test("lectores: pago de la tarjeta, giro, y la publicidad por correo no es un movimiento", () => {
  expect(parseAviso(aviso("Pagaste tu Tarjeta de Crédito por $150.000"))!.tipo).toBe("pago");
  expect(parseAviso(aviso("Recibimos el pago de tu tarjeta ****1234 por $150.000"))!.tipo).toBe("pago");
  expect(parseAviso(aviso("Pagaste $9.990 con tu tarjeta en NETFLIX"))!.tipo).toBe("compra");
  expect(parseAviso(aviso("Giro por $40.000 en cajero automático"))!.tipo).toBe("giro");
  expect(parseAviso(aviso("Aprovecha 30% de descuento: compra hasta $50.000", { pkg: "com.google.android.gm", title: "Banco Falabella", via: "correo" }))).toBeNull();
  const mail = parseAviso(aviso("Compra aprobada por $22.000 en FARMACIAS AHUMADA", { pkg: "com.google.android.gm", app: "Bci", title: "Bci", via: "correo" }))!;
  expect([mail.app, mail.banco]).toEqual(["BCI · correo", "bci"]);
});

// ─── Entre tus cuentas ──────────────────────────────────────────────────

test("las dos mitades juntas (BCI → Santander, sin nombre): UNA transferencia, ni gasto ni ingreso", () => {
  const S = S0([BCI, SANT]);
  const a = aviso("Transferiste $80.000 desde tu cuenta"), b = aviso("Recibiste una transferencia de $80.000", { ...SAN, at: AT + 60_000 });
  const { pares, resto } = emparejar([a, b], S, {}, {});
  expect(resto.length).toBe(0);
  expect(pares.length).toBe(1);
  const d = pares[0];
  expect(d.accion === "anotar" && [d.e.como, d.e.cuenta, d.e.otra]).toEqual(["propia", 1, 3]);
  const r = anota(S, d);
  expect(r.tx!.tipo).toBe("transfer");
  expect([saldo(S, 1), saldo(S, 3)]).toEqual([420_000, 380_000]);
  // Ya están las dos mitades: ninguna se vuelve a anotar
  expect(decidir(a, S, {}, ON).accion).toBe("ignorar");
  expect(decidir(b, S, {}, ON).accion).toBe("ignorar");
});

test("a tu nombre: entre tus cuentas (la otra, la única; si es de ahorro, queda como ahorro)", () => {
  expect(esYo("ALEX BENJAMIN MELITA", "Alex Melita")).toBe(true);
  expect(esYo("ALEX SOTO", "Alex Melita")).toBe(false);
  const S = S0([BCI, SANT]);
  const d = decidir(aviso("Transferiste $100.000 a ALEX BENJAMIN MELITA"), S, {}, ON, { yo: "Alex Melita" });
  expect(d.accion === "anotar" && [d.e.como, d.e.cuenta, d.e.otra]).toEqual(["propia", 1, 3]);
  const S2 = S0([BCI, AHORRO]);
  const d2 = decidir(aviso("Transferiste $100.000 a ALEX MELITA"), S2, {}, ON, { yo: "Alex Melita" });
  expect(anota(S2, d2).tx!.tipo).toBe("ahorro");
});

test("la cuenta de destino es tuya (****5678 en su nombre): entre tus cuentas", () => {
  const S = S0([BCI, SANT]);
  const d = decidir(aviso("Transferencia exitosa: $200.000 a tu cuenta ****5678"), S, {}, ON);
  expect(d.accion === "anotar" && [d.e.como, d.e.otra]).toEqual(["propia", 3]);
});

test("una mitad sin nombre espera a la otra (si tu otra cuenta es de un banco que avisa); pasado el rato, decide", () => {
  const S = S0([BCI, SANT]);
  const a = aviso("Transferiste $60.000 desde tu cuenta");
  expect(decidir(a, S, {}, ON, { vigilados: ["bci", "santander"], ahora: AT + 60_000 }).accion).toBe("esperar");
  // Santander no avisa: no hay a quién esperar
  expect(decidir(a, S, {}, ON, { vigilados: ["bci"], ahora: AT + 60_000 }).accion).toBe("anotar");
  const tarde = decidir(a, S, {}, ON, { vigilados: ["bci", "santander"], ahora: AT + ESPERA_MS + 1 });
  expect(tarde.accion === "anotar" && tarde.e.como).toBe("gasto");
});

test("la otra mitad llegó después de anotarla como gasto: se UNEN en una transferencia (y deshacer la deja como estaba)", () => {
  const S = S0([BCI, SANT]);
  const g = decidir(aviso("Transferiste $60.000 desde tu cuenta"), S, {}, ON);
  anota(S, g);
  expect(saldo(S, 1)).toBe(440_000);
  const b = decidir(aviso("Recibiste una transferencia de $60.000", { ...SAN, at: AT + 30 * 60_000 }), S, {}, ON);
  expect(b.accion).toBe("unir");
  const r = anota(S, b);
  const t = S.tx.find((x) => x.id === r.tx!.id)!;
  expect([t.tipo, t.desde, t.hacia, t.cat]).toEqual(["transfer", 1, 3, undefined]);
  expect([saldo(S, 1), saldo(S, 3)]).toEqual([440_000, 360_000]);
  expect(r.antes!.tipo).toBe("gasto");
});

test("lo que respondiste antes se aprende: «Alex M» fue entre tus cuentas → la próxima, sola", () => {
  const S = S0([BCI, SANT]);
  const p = parseAviso(aviso("Transferiste $30.000 a Alex M"))!;
  // La persona dice: a mi cuenta Santander
  expect(anotarAviso(S, p, { como: "propia", cuenta: 1, otra: 3 }, ctx()).ok).toBe(true);
  const d = decidir(aviso("Transferiste $45.000 a Alex M"), S, {}, ON);
  expect(d.accion === "anotar" && [d.e.como, d.e.otra]).toEqual(["propia", 3]);
  // Y desde el movimiento: un gasto que era a tu cuenta se convierte
  const S2 = S0([BCI, SANT]);
  const g = anota(S2, decidir(aviso("Transferiste $10.000 a Cami R"), S2, {}, ON)).tx!;
  expect(convertirEnPropia(S2, g.id, 3).ok).toBe(true);
  expect(S2.tx.find((x) => x.id === g.id)!.tipo).toBe("transfer");
  const d2 = decidir(aviso("Transferiste $12.000 a Cami R"), S2, {}, ON);
  expect(d2.accion === "anotar" && d2.e.como).toBe("propia");
});

// ─── A otros ──────────────────────────────────────────────────────────────

test("a otra persona: un gasto «Transferencia a Juan»; con la categoría que le pusiste la última vez; nueva y grande, la confirmas tú", () => {
  const S = S0([BCI]);
  const d = decidir(aviso("Transferiste $50.000 a JUAN PEREZ"), S, {}, ON);
  expect(d.accion === "anotar" && [d.e.como, d.e.cat, d.p.desc]).toEqual(["gasto", "otros", "Transferencia a Juan Perez"]);
  const t = anota(S, d).tx!;
  editarGasto(S, t.id, { cat: "vivienda" });
  const d2 = decidir(aviso("Transferiste $250.000 a JUAN PEREZ"), S, {}, ON);
  expect(d2.accion === "anotar" && d2.e.cat).toBe("vivienda"); // conocido: el tope no aplica
  const nuevo = decidir(aviso("Transferiste $150.000 a MARIA LOPEZ"), S, {}, ON);
  expect(nuevo.accion === "proponer" && nuevo.razon).toContain("primera vez que le transfieres a Maria Lopez");
});

test("le presté (manual) y después me devolvió por transferencia: se marca cobrado solo", () => {
  const S = S0([BCI]);
  const p = parseAviso(aviso("Transferiste $10.000 a JUAN PEREZ"))!;
  expect(anotarAviso(S, p, { como: "prestamo", cuenta: 1 }, ctx()).ok).toBe(true);
  expect(vistas(estado(S)).meDeban[0].desc).toBe("Préstamo a Juan Perez");
  const d = decidir(aviso("Recibiste una transferencia de $10.000 de JUAN PEREZ"), S, {}, ON);
  expect(d.accion === "anotar" && d.e.como).toBe("cobro");
  anota(S, d);
  expect(vistas(estado(S)).meDeban[0].cobrado).toBe(true);
  expect(saldo(S, 1)).toBe(500_000);
});

test("«Me debe»: monto exacto pero de otra persona no es cobro; dos iguales sin nombre, pregunta", () => {
  const S = S0([BCI]);
  formPrestamo(S, { desc: "Juan almuerzo", monto: 10_000, cuenta: 1 }, ctx());
  const otro = decidir(aviso("Recibiste una transferencia de $10.000 de PEDRO SOTO"), S, {}, ON);
  expect(otro.accion === "anotar" && otro.e.como).toBe("abono");
  formPrestamo(S, { desc: "Cami cine", monto: 10_000, cuenta: 1 }, ctx());
  const varios = decidir(aviso("Recibiste una transferencia de $10.000"), S, {}, ON);
  expect(varios.accion === "proponer" && varios.razon).toContain("más de un «Me debe»");
});

// ─── Sueldo y fijos ───────────────────────────────────────────────────────

test("tu sueldo (±15 %, su cuenta): confirma el «¿Llegó?» con el monto real y dice la diferencia", () => {
  const S = S0([BCI, SANT]);
  S.prog.push({ id: 77, tipo: "ingreso", fuente: "sueldo", parte: "saldo", desc: "Sueldo", monto: 1_000_000, dia: 30, cuenta: 3 } as any);
  S.prog.push({ id: 78, tipo: "gasto", desc: "AFP", monto: 100_000, dia: 31, cuando: "planilla", cat: "otros" } as any);
  const d = decidir(aviso("Recibiste una transferencia de $1.050.000 de EMPRESA SPA", SAN), S, {}, ON);
  expect(d.accion === "anotar" && [d.e.como, d.e.progId, d.e.mes]).toEqual(["sueldo", 77, "2026-10"]);
  expect(d.accion === "anotar" && d.razon).toContain("$50.000 más de lo esperado");
  const r = anota(S, d);
  expect(S.rec).toContain("77:2026-10");
  expect(S.tx.some((t) => t.via === "planilla" && t.progMes === "2026-10")).toBe(true); // la planilla del mes
  expect(resumenAnotado(r.tx!, S, { razon: d.accion === "anotar" ? d.razon : "" }).titulo).toBe("Llegó tu sueldo: $1.050.000");
  // Otra vez el mismo: ya está
  expect(decidir(aviso("Recibiste una transferencia de $1.050.000 de EMPRESA SPA", SAN), S, {}, ON).accion).not.toBe("anotar");
  // Fuera de ±15 %: no es el sueldo
  const S2 = S0([BCI, SANT]);
  S2.prog.push({ id: 77, tipo: "ingreso", fuente: "sueldo", desc: "Sueldo", monto: 1_000_000, dia: 30, cuenta: 3 } as any);
  const lejos = decidir(aviso("Recibiste una transferencia de $1.300.000", SAN), S2, {}, ON);
  expect(lejos.accion === "anotar" && lejos.e.como).toBe("abono");
});

test("sueldo del día 1 que llega el 30: es el del mes siguiente; ya confirmado a mano con otra cifra: se enlaza", () => {
  const S = S0([SANT]);
  S.prog.push({ id: 77, tipo: "ingreso", fuente: "sueldo", desc: "Sueldo", monto: 1_000_000, dia: 1, cuenta: 3 } as any);
  const d = decidir(aviso("Te depositaron $1.000.000", SAN), S, {}, ON);
  expect(d.accion === "anotar" && d.e.mes).toBe("2026-11");
  const S2 = S0([SANT]);
  S2.prog.push({ id: 77, tipo: "ingreso", fuente: "sueldo", desc: "Sueldo", monto: 1_000_000, dia: 30, cuenta: 3 } as any);
  confirmarIngreso(S2, S2.prog[0], { monto: 1_000_000, hacia: 3 }, ctx());
  const v = decidir(aviso("Te depositaron $1.012.345", SAN), S2, {}, ON);
  expect(v.accion).toBe("vincular");
});

test("un ingreso fijo (arriendo que recibes, ±5 %) se confirma solo", () => {
  const S = S0([BCI]);
  S.prog.push({ id: 90, tipo: "ingreso", fuente: "pasivo", desc: "Arriendo depto", monto: 300_000, dia: 28, cuenta: 1 } as any);
  const d = decidir(aviso("Recibiste una transferencia de $300.000 de ROSA DIAZ"), S, {}, ON);
  expect(d.accion === "anotar" && [d.e.como, d.e.progId]).toEqual(["sueldo", 90]);
});

test("lo que no calza con nada entra como abono; «Fue un ingreso» y la próxima vez de esa persona, ingreso", () => {
  const S = S0([BCI]);
  const t = anota(S, decidir(aviso("Recibiste una transferencia de $80.000 de ACME LTDA"), S, {}, ON)).tx!;
  expect(t.tipo).toBe("abono");
  expect(editarEntrada(S, t.id, "extra").ok).toBe(true);
  expect(S.tx.find((x) => x.id === t.id)!.tipo).toBe("ingreso");
  const d = decidir(aviso("Recibiste una transferencia de $95.000 de ACME LTDA"), S, {}, ON);
  expect(d.accion === "anotar" && [d.e.como, d.e.fuente]).toEqual(["ingreso", "extra"]);
});

// ─── Giros, pago de tarjeta, duplicados ─────────────────────────────────

test("giro: sin efectivo pregunta (una vez); con efectivo, al efectivo", () => {
  const S = S0([BCI]);
  const d = decidir(aviso("Giro por $40.000 en cajero automático"), S, {}, ON);
  expect(d.accion === "proponer" && d.razon).toContain("A mi efectivo");
  const p = parseAviso(aviso("Giro por $40.000 en cajero automático"))!;
  expect(anotarAviso(S, p, { como: "giro", cuenta: 1, otra: CASH }, ctx()).ok).toBe(true);
  expect(estado(S).efectivo).toBe(40_000);
  const d2 = decidir(aviso("Giro por $20.000 en cajero automático"), S, {}, ON);
  expect(d2.accion === "anotar" && [d2.e.como, d2.e.otra]).toEqual(["giro", CASH]);
});

test("pago de la tarjeta: de tu cuenta del mismo banco a la tarjeta; más que la deuda, lo confirmas tú", () => {
  const S = S0([BCI, VISA]);
  const d = decidir(aviso("Pagaste tu Tarjeta de Crédito por $150.000"), S, {}, ON);
  expect(d.accion === "anotar" && [d.e.como, d.e.cuenta, d.e.otra]).toEqual(["pago", 1, 2]);
  anota(S, d);
  expect(deudaDe(vistaCuenta(estado(S), 2))).toBe(50_000);
  // El aviso del otro lado (la tarjeta) del mismo pago: se enlaza
  expect(decidir(aviso("Recibimos el pago de tu tarjeta por $150.000", { at: AT + 120_000 }), S, {}, ON).accion).toBe("vincular");
  const mucho = decidir(aviso("Pagaste tu Tarjeta de Crédito por $90.000", { at: AT + 86_400_000 * 3 }), S, {}, ON);
  expect(mucho.accion === "proponer" && mucho.razon).toContain("más de lo que debía");
});

test("ya lo anotaste por chat (transferencia a tu cuenta): las dos mitades se enlazan, no se duplica", () => {
  const S = S0([BCI, SANT]);
  S.tx.push({ id: 999, tipo: "transfer", fecha: "2026-10-30", monto: 70_000, desde: 1, hacia: 3, desc: "Transferencia", via: "eris" } as any);
  const a = decidir(aviso("Transferiste $70.000 desde tu cuenta"), S, {}, ON);
  expect(a.accion).toBe("vincular");
  anota(S, a);
  const b = decidir(aviso("Recibiste una transferencia de $70.000", SAN), S, {}, ON);
  expect(b.accion === "vincular" && b.txId).toBe(999);
  anota(S, b);
  expect(S.tx.filter((t) => t.monto === 70_000).length).toBe(1);
  expect((S.tx[0] as any).notif2.tipo).toBe("ingreso");
});

test("la misma compra por la app y por correo (BCI): se anota una vez", () => {
  const S = S0([BCI]);
  anota(S, decidir(aviso("Compra por $22.000 en FARMACIAS AHUMADA"), S, {}, ON));
  const mail = decidir(aviso("Compra aprobada por $22.000 en FARMACIAS AHUMADA", { pkg: "com.google.android.gm", app: "Bci", title: "Bci", via: "correo", at: AT + 5 * 60_000 }), S, {}, ON);
  expect(mail.accion).toBe("ignorar");
});

test("la hoja de «Por confirmar» sugiere: tu sueldo, entre tus cuentas, o un abono", () => {
  const S = S0([BCI, SANT]);
  S.prog.push({ id: 77, tipo: "ingreso", fuente: "sueldo", desc: "Sueldo", monto: 1_000_000, dia: 30, cuenta: 3 } as any);
  expect(sugerir(parseAviso(aviso("Te depositaron $990.000", SAN))!, S, {}).como).toBe("sueldo");
  expect(sugerir(parseAviso(aviso("Transferiste $5.000 a ALEX MELITA"))!, S, {}, { yo: "Alex Melita" }).como).toBe("propia");
  expect(sugerir(parseAviso(aviso("Recibiste $5.000", SAN))!, S, {}).como).toBe("abono");
});

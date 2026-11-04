// Eris administra (A0): qué hace Eris con cada aviso del banco (bankAuto.decidir) y «Cambiar» (financeCore.editarGasto)
process.env.TZ = "America/Santiago";
import { test, expect } from "bun:test";
import { decidir, bancoDe, AUTO_DEFAULT, type AutoConfig } from "C:/Proyectos/eris-mobile/src/services/finance/bankAuto.ts";
import { emptyState, editarGasto, estado, formGasto, type FinanceState } from "C:/Proyectos/eris-mobile/src/services/finance/financeCore.ts";

const ON: AutoConfig = { ...AUTO_DEFAULT, on: true, allowed: true };
const AT = new Date(2026, 9, 30, 13, 5).getTime();
const aviso = (text: string, o: Partial<{ pkg: string; app: string; title: string; at: number; key: string }> = {}) =>
  ({ pkg: o.pkg ?? "cl.bci.app.personas", app: o.app ?? "BCI", title: o.title ?? "Compra aprobada", text, at: o.at ?? AT, key: o.key ?? `k${Math.random()}` });
function S0(cuentas: Array<{ id: number | string; nombre: string; banco?: string; tipo: any; saldoInicial: number; cupo?: number }>): FinanceState {
  const S = emptyState();
  S.cuentas = cuentas as any;
  S.setupDone = true;
  return S;
}
const ctx = () => { let id = 1000; return { now: new Date(AT), newId: () => ++id }; };
const BCI_DEB = { id: 1, nombre: "Cuenta corriente", banco: "BCI", tipo: "debito", saldoInicial: 500_000 };
const BCI_TC = { id: 2, nombre: "Visa", banco: "BCI", tipo: "credito", saldoInicial: 800_000, cupo: 800_000 };

test("bancoDe: nombres de apps, paquetes y lo que escribiste en la cuenta", () => {
  expect(bancoDe("Banco Estado")).toBe("bancoestado");
  expect(bancoDe("CuentaRUT")).toBe("bancoestado");
  expect(bancoDe("cl.bci.sismo.mach MACH")).toBe("mach");
  expect(bancoDe("Mi Banco de Chile")).toBe("chile");
  expect(bancoDe("Banco Edwards")).toBe("chile");
  expect(bancoDe("cl.santander.smartphone")).toBe("santander");
  expect(bancoDe("Itaú")).toBe("itau");
  expect(bancoDe("Gmail")).toBeNull();
});

test("la única cuenta de ese banco: se anota sola, con la fecha y hora del aviso", () => {
  const S = S0([BCI_DEB]);
  const d = decidir(aviso("Compra por $12.990 en LIDER EXPRESS con tu tarjeta de débito ****1234"), S, {}, ON);
  expect(d.accion).toBe("anotar");
  if (d.accion !== "anotar") return;
  expect(d.e.cuenta).toBe(1);
  expect(d.p.monto).toBe(12990);
  expect(d.p.fecha).toBe("2026-10-30");
  expect(d.p.last4).toBe("1234");
});

test("lo aprendido gana: app + tarjeta → la cuenta que eligió la persona", () => {
  const S = S0([BCI_DEB, { id: 3, nombre: "Cuenta vista", banco: "Banco Estado", tipo: "debito", saldoInicial: 100_000 }]);
  const d = decidir(aviso("Compra por $5.000 en COPEC ****9999", { pkg: "com.x.raro", app: "Raro" }), S, { "com.x.raro:9999": 3 }, ON);
  expect(d.accion === "anotar" && d.e.cuenta).toBe(3);
});

test("dos cuentas del mismo banco: el aviso dice crédito o débito; sin pista, pregunta (una vez)", () => {
  const S = S0([BCI_DEB, BCI_TC]);
  const tc = decidir(aviso("Compra con tarjeta de crédito por $20.000 en FALABELLA"), S, {}, ON);
  expect(tc.accion === "anotar" && tc.e.cuenta).toBe(2);
  const db = decidir(aviso("Compra con tu tarjeta de débito por $20.000 en FALABELLA"), S, {}, ON);
  expect(db.accion === "anotar" && db.e.cuenta).toBe(1);
  const nada = decidir(aviso("Compra por $20.000 en FALABELLA"), S, {}, ON);
  expect(nada.accion).toBe("proponer");
  expect(nada.accion === "proponer" && nada.razon).toContain("varias cuentas de BCI");
});

test("app de otro banco, o sin cuenta de ese banco: a «Por confirmar» con la razón", () => {
  const S = S0([BCI_DEB]);
  const otro = decidir(aviso("Compra por $3.000 en UBER", { pkg: "com.google.android.gm", app: "Gmail" }), S, {}, ON);
  expect(otro.accion === "proponer" && otro.razon).toContain("No sé de qué banco");
  const sin = decidir(aviso("Compra por $3.000 en UBER", { pkg: "cl.santander.smartphone", app: "Santander" }), S, {}, ON);
  expect(sin.accion === "proponer" && sin.razon).toContain("No tienes una cuenta de Santander");
});

test("la categoría que usaste antes para ese comercio gana sobre la del comercio", () => {
  const S = S0([BCI_DEB]);
  formGasto(S, { desc: "Lider", monto: 9_000, cat: "hogar", cuenta: 1, fecha: "2026-10-20" }, ctx());
  const d = decidir(aviso("Compra por $12.990 en LIDER EXPRESS"), S, {}, ON);
  expect(d.accion === "anotar" && d.p.desc).toBe("Lider");
  expect(d.accion === "anotar" && d.e.cat).toBe("hogar");
});

test("ya lo anotaste por chat (mismo monto, ±1 día): se vincula, no se anota dos veces", () => {
  const S = S0([BCI_DEB]);
  formGasto(S, { desc: "Almuerzo", monto: 12_990, cat: "alimentacion", cuenta: 1, fecha: "2026-10-29", via: "eris" }, ctx());
  const d = decidir(aviso("Compra por $12.990 en LIDER EXPRESS"), S, {}, ON);
  expect(d.accion).toBe("vincular");
  // dos días después ya no es el mismo
  const S2 = S0([BCI_DEB]);
  formGasto(S2, { desc: "Almuerzo", monto: 12_990, cat: "alimentacion", cuenta: 1, fecha: "2026-10-27", via: "eris" }, ctx());
  expect(decidir(aviso("Compra por $12.990 en LIDER EXPRESS"), S2, {}, ON).accion).toBe("anotar");
});

test("el mismo aviso, o el mismo cargo avisado otra vez a los minutos: se ignora", () => {
  const S = S0([BCI_DEB]);
  formGasto(S, { desc: "Lider", monto: 12_990, cat: "alimentacion", cuenta: 1, fecha: "2026-10-30", via: "banco",
    extra: { notif: { clave: "notif:k1", pkg: "cl.bci.app.personas", app: "BCI", at: AT }, auto: true } }, ctx());
  expect(decidir(aviso("Compra por $12.990 en LIDER EXPRESS", { key: "k1" }), S, {}, ON).accion).toBe("ignorar");
  expect(decidir(aviso("Compra por $12.990 en LIDER", { key: "k2", at: AT + 3 * 60_000 }), S, {}, ON).accion).toBe("ignorar");
  // otro cargo igual, una hora después: es otra compra
  expect(decidir(aviso("Compra por $12.990 en LIDER", { key: "k3", at: AT + 60 * 60_000 }), S, {}, ON).accion).toBe("anotar");
});

test("comercio nuevo sobre el tope: lo confirmas tú; conocido o sin tope: se anota", () => {
  const S = S0([{ ...BCI_DEB, saldoInicial: 2_000_000 }]);
  const grande = decidir(aviso("Compra por $150.000 en PARIS"), S, {}, ON);
  expect(grande.accion === "proponer" && grande.razon).toContain("primera vez");
  expect(decidir(aviso("Compra por $150.000 en PARIS"), S, {}, { ...ON, tope: 0 }).accion).toBe("anotar");
  formGasto(S, { desc: "Paris", monto: 30_000, cat: "otros", cuenta: 1, fecha: "2026-10-01" }, ctx());
  expect(decidir(aviso("Compra por $150.000 en PARIS"), S, {}, ON).accion).toBe("anotar");
});

test("no alcanza el saldo que lleva Eris: lo propone (puede faltar algo)", () => {
  const S = S0([{ ...BCI_DEB, saldoInicial: 5_000 }]);
  const d = decidir(aviso("Compra por $12.990 en LIDER EXPRESS"), S, {}, ON);
  expect(d.accion === "proponer" && d.razon).toContain("no alcanza");
});

test("cuotas: solo con crédito", () => {
  const S = S0([BCI_TC]);
  const d = decidir(aviso("Compra con tarjeta de crédito por $90.000 en 3 cuotas en FALABELLA"), S, {}, { ...ON, tope: 0 });
  expect(d.accion === "anotar" && d.e.cuotas).toBe(3);
});

test("apagado: todo a «Por confirmar» (también lo que entra); encendido, A1 decide transferencias e ingresos", () => {
  const S = S0([BCI_DEB]);
  expect(decidir(aviso("Compra por $12.990 en LIDER EXPRESS"), S, {}, { ...ON, on: false }).accion).toBe("proponer");
  expect(decidir(aviso("Recibiste una transferencia de $50.000", { title: "Abono" }), S, {}, { ...ON, on: false }).accion).toBe("proponer");
  const tr = decidir(aviso("Transferiste $50.000 a Juan Pérez", { title: "Transferencia" }), S, {}, ON);
  expect(tr.accion === "anotar" && tr.e.como).toBe("gasto");
  const ab = decidir(aviso("Recibiste una transferencia de $50.000", { title: "Abono" }), S, {}, ON);
  expect(ab.accion === "anotar" && ab.e.como).toBe("abono");
  expect(decidir(aviso("Tu saldo disponible es $120.000", { title: "Saldo" }), S, {}, ON).accion).toBe("ignorar");
});

test("editarGasto: categoría y cuenta; sin fondos no; las cuotas se van al pasar a débito", () => {
  const S = S0([BCI_DEB, BCI_TC, { id: 4, nombre: "Vista", banco: "Banco Estado", tipo: "debito", saldoInicial: 1_000 }]);
  const g = formGasto(S, { desc: "Falabella", monto: 90_000, cat: "otros", cuenta: 2, cuotas: 3, fecha: "2026-10-30" }, ctx()).tx!;
  expect(editarGasto(S, g.id, { cat: "hogar" }).ok).toBe(true);
  expect(S.tx.find((t) => t.id === g.id)!.cat).toBe("hogar");
  const sinFondos = editarGasto(S, g.id, { cuenta: 4 });
  expect(sinFondos.ok).toBe(false);
  expect(sinFondos.msg).toContain("Saldo insuficiente");
  const r = editarGasto(S, g.id, { cuenta: 1 });
  expect(r.ok).toBe(true);
  const t = S.tx.find((x) => x.id === g.id)!;
  expect(t.desde).toBe(1);
  expect(t.cuotas).toBeUndefined();
  const E = estado(S);
  expect(E.cuentas.find((c) => c.id === 1)!.saldo).toBe(410_000);
  expect(E.cuentas.find((c) => c.id === 2)!.saldo).toBe(800_000);
  expect(editarGasto(S, 999, { cat: "hogar" }).ok).toBe(false);
});

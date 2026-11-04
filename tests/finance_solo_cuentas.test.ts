// Finanzas (2026-10-22): «solo existe la plata de tus cuentas». Sin efectivo de regalo, todo movimiento con plata exige
// cuenta, lo antiguo sin cuenta queda «Por ordenar», y el «Disponible» deja de existir como plata.
import { test, expect } from "bun:test";
import * as C from "C:/Proyectos/eris-mobile/src/services/finance/financeCore.ts";

const now = new Date(2026, 9, 22, 12);
let id = 5000;
const ctx = { now, newId: () => ++id };

test("primer uso: sin «Efectivo» de regalo; el ahorro que ya tienes es el saldo de tu cuenta de ahorro", () => {
  const S = C.onboarding({ sueldo: 900000, ahorro: 50000 }, ctx);
  expect(S.cuentas.map((c) => [c.tipo, c.saldoInicial])).toEqual([["ahorro", 50000]]);
  expect(S.tx.length).toBe(0); // nada «entró» al ahorro desde ninguna parte
  expect(C.usaEfectivo(S)).toBe(false);
  expect(C.estado(S).defs.some((c) => c.id === C.CASH)).toBe(false);
  expect(C.tablero(S, now).plata).toBe(50000);
});

test("sin cuentas: los formularios y el chat no anotan plata de ninguna parte", () => {
  const W = C.draft(C.onboarding({ sueldo: 900000 }, ctx));
  expect(C.formGasto(W, { desc: "pan", monto: 2000, cat: "alimentacion" }, ctx).msg).toContain("Primero agrega dónde tienes tu plata");
  expect(C.formAhorro(W, { desc: "Ahorro", monto: 1000 }, ctx).ok).toBe(false);
  expect(C.formPrestamo(W, { desc: "Cami", monto: 1000 }, ctx).ok).toBe(false);
  expect(C.formProg(W, { tipo: "gasto", desc: "Netflix", monto: 9000, dia: 5, cat: "entretenimiento" }, ctx).ok).toBe(false);
  // planilla sí: nunca pasa por una cuenta
  expect(C.formProg(W, { tipo: "gasto", desc: "Seguro", monto: 9000, dia: 1, cat: "salud", planilla: true }, ctx).ok).toBe(true);
  const r = C.applyOp(W, { action: "gasto", monto: 2000, descripcion: "pan" }, ctx).result;
  expect(r.ok).toBe(false);
  expect(r.code).toBe("sin_cuentas");
  // el tablero no inventa «puedes gastar»
  const T = C.tablero(W, now);
  expect(T.conCuentas).toBe(false);
  expect(T.libre).toBe(0);
  expect(T.porDiaHastaIngreso).toBeNull();
  const ex = C.extract(W, now);
  expect(ex.context).toContain("no tiene cuentas en Finanzas");
  expect(ex.context).not.toContain("Para gastar hasta");
  expect((ex.summary as any).plata).toBeNull();
  expect((ex.summary as any).libre).toBeNull();
});

test("efectivo: existe solo si lo agregas (o lo sacas de una cuenta)", () => {
  const W = C.draft(C.onboarding({ sueldo: 900000 }, ctx));
  expect(C.conEfectivo(W)).toBe(false);
  expect(C.formEfectivo(W, { saldo: 15000 }, ctx).ok).toBe(true);
  expect(C.conEfectivo(W)).toBe(true);
  expect(C.estado(W).efectivo).toBe(15000);
  expect(C.formGasto(W, { desc: "pan", monto: 2000, cat: "alimentacion", cuenta: C.CASH }, ctx).ok).toBe(true);
  expect(C.tablero(W, now).plata).toBe(13000);
  // corregir: queda como ajuste
  expect(C.formEfectivo(W, { saldo: 10000 }, ctx).ok).toBe(true);
  expect(C.estado(W).efectivo).toBe(10000);
  // giro desde una cuenta real: el efectivo aparece solo
  const W2 = C.draft(C.onboarding({ sueldo: 900000 }, ctx));
  C.formCuenta(W2, { banco: "BCI", tipo: "debito", saldo: 100000 }, ctx);
  const bci = C.estado(W2).cuentas[0].id;
  expect(C.formMov(W2, { tipo: "giro", desde: bci, hacia: C.CASH, monto: 20000 }, ctx).ok).toBe(true);
  expect(C.conEfectivo(W2)).toBe(true);
  expect(C.tablero(W2, now).plata).toBe(100000); // solo cambió de lugar
});

test("el «Efectivo» en $0 que creaba el primer uso se limpia; si tiene algo, se queda", () => {
  const S = C.emptyState();
  S.cuentas = [{ ...C.CASH_DEF }, { id: 1, nombre: "BCI", banco: "BCI", tipo: "debito", saldoInicial: 1000 }];
  S.lastCuenta = C.CASH;
  const L = C.limpiarEfectivoVacio(S)!;
  expect(L.cuentas.map((c) => c.id)).toEqual([1]);
  expect(L.lastCuenta).toBeNull();
  expect(C.limpiarEfectivoVacio(L)).toBeNull();
  const conPlata = { ...S, cuentas: [{ ...C.CASH_DEF, saldoInicial: 500 }] };
  expect(C.limpiarEfectivoVacio(conPlata)).toBeNull();
  const usado = { ...S, tx: [{ id: 9, tipo: "gasto", monto: 100, desde: C.CASH, hacia: null, desc: "x", fecha: "2026-10-01" }] as any };
  expect(C.limpiarEfectivoVacio(usado)).toBeNull();
});

test("Por ordenar: lo antiguo sin cuenta (no la planilla ni el ahorro inicial) y cómo asignarle su cuenta", () => {
  const S = C.emptyState();
  S.cuentas = [{ id: 1, nombre: "BCI", banco: "BCI", tipo: "debito", saldoInicial: 900000 }, { id: 2, nombre: "CMR", banco: "Falabella", tipo: "credito", cupo: 500000, saldoInicial: 500000 }];
  S.tx = [
    { id: 10, tipo: "gasto", monto: 830000, desde: null, hacia: null, desc: "Total", cat: "otros", fecha: "2026-10-03" },
    { id: 11, tipo: "gasto", monto: 5000, desde: null, hacia: null, desc: "Snacks", cat: "alimentacion", fecha: "2026-10-18" },
    { id: 12, tipo: "gasto", monto: 9000, desde: null, hacia: null, desc: "Seguro (planilla)", cat: "salud", fecha: "2026-09-30", via: "planilla" },
    { id: 13, tipo: "ingreso", monto: 9000, desde: null, hacia: null, desc: "Descontado por planilla: Seguro", fuente: "sueldo", fecha: "2026-09-30", via: "planilla" },
    { id: 14, tipo: "ahorro", monto: 50000, desde: null, hacia: 3, desc: "Ahorro inicial", fecha: "2026-09-01" },
    { id: 15, tipo: "ingreso", monto: 20000, desde: null, hacia: null, desc: "Freelance", fuente: "extra", fecha: "2026-10-10" },
  ] as any;
  S.prog = [{ id: 20, tipo: "gasto", desc: "Netflix", monto: 9000, dia: 5, cat: "entretenimiento" }, { id: 21, tipo: "gasto", desc: "Seguro", monto: 9000, dia: 31, cuando: "planilla", cat: "salud" }] as any;
  const P = C.porOrdenar(S);
  expect(P.tx.map((t) => `${t.id}:${t.falta}`)).toEqual(["11:desde", "15:hacia", "10:desde"]); // lo más nuevo arriba
  expect(P.prog.map((p) => p.id)).toEqual([20]);
  const W = C.draft(S);
  expect(C.asignarCuenta(W, "tx", 11, 1).ok).toBe(true);
  expect(C.estado(W).bal["1"]).toBe(900000 - 5000);
  expect(C.asignarCuenta(W, "tx", 15, 2).msg).toBe("Esa plata no puede llegar a una tarjeta de crédito");
  expect(C.asignarCuenta(W, "tx", 15, 1).ok).toBe(true);
  expect(C.asignarCuenta(W, "tx", 15, 1).msg).toBe("Ese movimiento ya tiene cuenta");
  expect(C.asignarCuenta(W, "tx", 10, null).msg).toBe("Elige una cuenta");
  expect(C.asignarCuenta(W, "prog", 20, 2).ok).toBe(true); // un fijo sí se puede pagar con la tarjeta
  expect(C.porOrdenar(W).tx.map((t) => t.id)).toEqual([10]);
  expect(C.porOrdenar(W).prog.length).toBe(0);
  // el contexto de Eris lo menciona, sin sumarlo a la plata
  const ex = C.extract(W, now);
  expect(ex.context).toContain("Por ordenar: 1 movimiento sin cuenta");
  expect((ex.summary as any).porOrdenar).toBe(1);
});

test("«¿Llegó?» siempre a una cuenta; fijo con la cuenta quitada → Por ordenar, y al asignarla arregla lo anotado", () => {
  const S = C.emptyState();
  S.setupDone = true;
  S.cuentas = [{ id: 1, nombre: "BCI", banco: "BCI", tipo: "debito", saldoInicial: 0 }, { id: 2, nombre: "Vieja", banco: "X", tipo: "debito", saldoInicial: 0, archivada: true }];
  S.prog = [
    { id: 30, tipo: "ingreso", fuente: "sueldo", desc: "Sueldo", monto: 800000, dia: 20, cuenta: 2 },
    { id: 31, tipo: "gasto", desc: "Gym", monto: 20000, dia: 5, cat: "salud", cuenta: 2 },
  ] as any;
  const W = C.draft(S);
  // la cuenta del sueldo ya no existe: hay que elegir
  const sueldo = W.prog[0];
  expect(C.formConfirmarIngreso(W, sueldo, {}, ctx).msg).toBe("Elige a qué cuenta llegó");
  expect(C.formConfirmarIngreso(W, sueldo, { hacia: 1 }, ctx).ok).toBe(true);
  expect(C.estado(W).bal["1"]).toBe(800000);
  // el gym se anotó sin cuenta (su cuenta se quitó): queda por ordenar, y el fijo también
  C.aplicarProgramados(W, ctx);
  expect(C.porOrdenar(W).prog.map((p) => p.id)).toEqual([30, 31]);
  expect(C.porOrdenar(W).tx.map((t) => t.desc)).toEqual(["Gym ↻"]);
  expect(C.asignarCuenta(W, "prog", 31, 1).msg).toBe("Gym: BCI (y 1 anotado antes)");
  expect(C.porOrdenar(W).tx.length).toBe(0);
  expect(C.estado(W).bal["1"]).toBe(780000);
});

test("simular sin cuentas: no inventa «te alcanza»", () => {
  const W = C.draft(C.onboarding({ sueldo: 900000 }, ctx));
  expect(C.simularCompra(W, { monto: 60000, cat: "otros" }, now)).toBeNull();
  C.formEfectivo(W, { saldo: 100000 }, ctx);
  expect(C.simularCompra(W, { monto: 60000, cat: "otros" }, now)!.veredicto).not.toBe("no_alcanza");
  expect(C.simularCompra(W, { monto: 160000, cat: "otros" }, now)!.veredicto).toBe("no_alcanza");
});

test("chat «resumen»: tu plata y lo que puedes gastar, sin «disponible»", () => {
  const W = C.draft(C.onboarding({ sueldo: 900000, ahorro: 100000 }, ctx));
  C.formCuenta(W, { banco: "BCI", tipo: "debito", saldo: 200000 }, ctx);
  const bci = C.estado(W).cuentas.find((c) => c.tipo === "debito")!.id;
  C.formSueldo(W, { monto: 900000, dia: C.ULT_HABIL, cuenta: bci }, ctx);
  const d = (C.applyOp(W, { action: "resumen" }, ctx).result as any).data;
  expect(d.disponible).toBeUndefined();
  expect(d.plata).toBe(300000);
  expect(d.libre).toBe(200000);
  expect(d.conCuentas).toBe(true);
  expect(d.usaEfectivo).toBe(false);
  expect(d.proximo.fecha).toBe("2026-10-30");
});

test("efectivo: no sale plata de un efectivo que no tienes; entrar sí", () => {
  const W = C.draft(C.onboarding({ sueldo: 900000 }, ctx));
  C.formCuenta(W, { banco: "BCI", tipo: "debito", saldo: 50000 }, ctx);
  expect(C.formGasto(W, { desc: "pan", monto: 2000, cat: "alimentacion", cuenta: C.CASH }, ctx).ok).toBe(false);
  const r = C.applyOp(W, { action: "gasto", monto: 2000, descripcion: "pan", cuenta: "efectivo" }, ctx).result;
  expect(r.ok).toBe(false);
  expect(r.msg).toContain("No tienes efectivo anotado");
  const bci = C.estado(W).cuentas[0].id;
  expect(C.formMov(W, { tipo: "giro", desde: bci, hacia: C.CASH, monto: 10000 }, ctx).ok).toBe(true);
  expect(C.formGasto(W, { desc: "pan", monto: 2000, cat: "alimentacion", cuenta: C.CASH }, ctx).ok).toBe(true);
  expect(C.estado(W).efectivo).toBe(8000);
});

test("tasa de ahorro: al cierre del mes a tu ritmo, no sueldo completo vs medio mes de gastos", () => {
  const W = C.draft(C.onboarding({ sueldo: 1000000 }, ctx));
  C.formCuenta(W, { banco: "BCI", tipo: "debito", saldo: 600000 }, ctx);
  const bci = C.estado(W).cuentas[0].id;
  C.formSueldo(W, { monto: 1000000, dia: 30, cuenta: bci }, ctx);
  C.formProg(W, { tipo: "gasto", desc: "Arriendo", monto: 300000, dia: 28, cat: "vivienda", cuenta: bci }, ctx);
  C.formGasto(W, { desc: "super", monto: 220000, cat: "alimentacion", cuenta: bci, fecha: "2026-10-10" }, ctx); // 10.000/día en 22 días
  const T = C.tablero(W, now);
  // 220.000 + 10.000 × 9 días + arriendo 300.000 = 610.000 → 39 % (antes: (1.000.000 − 220.000) / 1.000.000 = 78 %)
  expect(T.gastoProyectado).toBe(610000);
  expect(T.tasaAhorro).toBe(39);
  const ex = C.extract(W, now);
  expect(ex.context).toContain("- Tasa de ahorro (proyectada al cierre del mes, a su ritmo): 39%");
  expect((ex.summary as any).savingsRate).toBe(39);
});

test("boleta con desglose: UN movimiento con el total; el presupuesto lo reparte por categoría", () => {
  const W = C.draft(C.onboarding({ sueldo: 900000, presup: { alimentacion: 200000, hogar: 30000 } }, ctx));
  C.formCuenta(W, { banco: "BCI", tipo: "debito", saldo: 300000 }, ctx);
  const bci = C.estado(W).cuentas[0].id;
  const r = C.formGasto(W, { desc: "Líder", monto: 25000, cat: "alimentacion", cuenta: bci, via: "boleta",
    partes: [{ cat: "alimentacion", monto: 12000 }, { cat: "hogar", monto: 8000 }, { cat: "alimentacion", monto: 5000 }] }, ctx);
  expect(r.ok).toBe(true);
  expect(W.tx.filter((t) => t.tipo === "gasto").length).toBe(1);
  expect(r.tx!.partes).toEqual([{ cat: "alimentacion", monto: 17000 }, { cat: "hogar", monto: 8000 }]);
  expect(r.tx!.cat).toBe("alimentacion");
  expect(C.estado(W).cuentas[0].saldo).toBe(275000);
  const R = C.resumen(W, now);
  expect(R.porCat).toEqual({ alimentacion: 17000, hogar: 8000 });
  const L = Object.fromEntries(C.presupuestoAlDia(W, now).map((l) => [l.cat, l.gastado]));
  expect(L).toMatchObject({ alimentacion: 17000, hogar: 8000 });
  // un desglose que no suma el total no se anota
  expect(C.formGasto(W, { desc: "x", monto: 1000, cat: "otros", cuenta: bci, partes: [{ cat: "otros", monto: 300 }, { cat: "hogar", monto: 300 }] }, ctx).msg).toBe("El desglose no suma el total");
});

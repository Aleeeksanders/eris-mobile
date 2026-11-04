// Finanzas (2026-10-22): último día hábil con feriados de Chile y descuentos por planilla (vienen descontados del líquido).
import { test, expect } from "bun:test";
import * as C from "C:/Proyectos/eris-mobile/src/services/finance/financeCore.ts";

test("feriados de Chile 2026 (calendario oficial) y el 31-12 bancario", () => {
  const f = [...C.feriadosChile(2026)].sort();
  expect(f).toEqual(["2026-01-01", "2026-04-03", "2026-04-04", "2026-05-01", "2026-05-21", "2026-06-21", "2026-06-29", "2026-07-16", "2026-08-15",
    "2026-09-18", "2026-09-19", "2026-10-12", "2026-10-31", "2026-11-01", "2026-12-08", "2026-12-25", "2026-12-31"]);
});

test("feriados móviles por ley", () => {
  expect(C.feriadosChile(2023).has("2023-01-02")).toBe(true);   // 1-ene domingo → 2-ene (Ley 20.983)
  expect(C.feriadosChile(2027).has("2027-06-28")).toBe(true);   // 29-jun martes → lunes 28 (Ley 19.668)
  expect(C.feriadosChile(2027).has("2027-06-29")).toBe(false);
  expect(C.feriadosChile(2027).has("2027-10-11")).toBe(true);   // 12-oct martes → lunes 11
  expect(C.feriadosChile(2028).has("2028-10-27")).toBe(true);   // 31-oct martes → viernes 27 (Ley 20.299)
  expect(C.feriadosChile(2029).has("2029-09-17")).toBe(true);   // 17-sep lunes (Ley 20.215)
  expect(C.feriadosChile(2026).has("2026-04-03")).toBe(true);   // Viernes Santo (Pascua 5-abr-2026)
  expect(C.feriadosChile(2025).has("2025-06-20")).toBe(true);   // Pueblos Indígenas 2025
});

test("último día hábil de cada mes de 2026", () => {
  const got = Array.from({ length: 12 }, (_, i) => C.ultimoHabil(`2026-${String(i + 1).padStart(2, "0")}`));
  expect(got).toEqual([30, 27, 31, 30, 29, 30, 31, 31, 30, 30, 30, 30]); // dic: el 31 es feriado bancario
  expect(C.ultimoHabil("2027-03")).toBe(31);
});

const ctx = (d: Date) => { let id = 1000; return { now: d, newId: () => id++ }; };

test("sueldo el último día hábil: «¿llegó?» ese día, no el 31", () => {
  const S = C.emptyState();
  S.cuentas = [{ id: "bci", nombre: "BCI", tipo: "debito", saldoInicial: 0 }];
  const W = C.draft(S);
  const r = C.formSueldo(W, { monto: 850000, dia: C.ULT_HABIL, cuenta: "bci" }, ctx(new Date(2026, 9, 22)));
  expect(r.ok).toBe(true);
  expect(r.msg).toContain("el último día hábil (este mes, el 30)");
  const p = W.prog.find((x) => x.fuente === "sueldo")!;
  expect(p.cuando).toBe("ult_habil");
  expect(p.dia).toBe(31);
  expect(C.ingresosPendientes(W, new Date(2026, 9, 29)).length).toBe(0);
  expect(C.ingresosPendientes(W, new Date(2026, 9, 30)).map((x) => x.fecha)).toEqual(["2026-10-30"]);
  expect(C.proximoIngreso(W, new Date(2026, 9, 22))?.fecha).toBe("2026-10-30");
  expect(C.cuandoTexto(p)).toBe("el último día hábil");
});

test("planilla: no toca cuentas, entra al llegar el sueldo como gasto + ingreso «descontado por planilla»; se va si se borra el sueldo", () => {
  const S = C.emptyState();
  S.cuentas = [{ id: "bci", nombre: "BCI", tipo: "debito", saldoInicial: 100000 }];
  let W = C.draft(S);
  const c = ctx(new Date(2026, 9, 5));
  C.formSueldo(W, { monto: 850000, dia: C.ULT_HABIL, cuenta: "bci" }, c);
  expect(C.formProg(W, { tipo: "gasto", desc: "Crédito social", monto: 60000, dia: 1, cat: "deuda", cuenta: "bci", planilla: true }, c).msg).toContain("planilla");
  const pl = W.prog.find((p) => p.cuando === "planilla")!;
  expect(pl.cuenta).toBeUndefined();
  expect(C.sueldoPartes(W)).toMatchObject({ liquido: 850000, planilla: 60000, bruto: 910000 });
  // No se anota por fecha ni aparece como cobro que viene
  expect(C.aplicarProgramados(W, ctx(new Date(2026, 9, 28)))).toBe(0);
  expect(C.proximosProgramados(W, new Date(2026, 9, 25), 10).some((p) => p.cuando === "planilla")).toBe(false);
  // Llega el sueldo
  const sueldo = W.prog.find((p) => p.fuente === "sueldo")!;
  const t = C.confirmarIngreso(W, sueldo, {}, ctx(new Date(2026, 9, 30)));
  const pTx = W.tx.filter((x) => x.via === "planilla");
  expect(pTx.map((x) => `${x.tipo}:${x.monto}:${x.desde ?? x.hacia ?? "sin cuenta"}`)).toEqual(["gasto:60000:sin cuenta", "ingreso:60000:sin cuenta"]);
  expect(pTx.every((x) => x.fecha === "2026-10-30")).toBe(true);
  expect(C.estado(W).bal.bci).toBe(100000 + 850000);              // la cuenta solo recibe el líquido
  const ing = C.ingresoDelMes(W.tx, "2026-10", 850000, new Date(2026, 9, 30));
  expect(ing.sueldo).toBe(910000);                                 // el mes ve el bruto
  // confirmar dos veces no duplica
  expect(C.aplicarPlanilla(W, "2026-10", ctx(new Date(2026, 9, 30)))).toBe(0);
  // se borra el sueldo: se va la planilla y vuelve a «¿llegó?»
  C.borrarTx(W, t.id);
  expect(W.tx.some((x) => x.via === "planilla")).toBe(false);
  expect(C.ingresosPendientes(W, new Date(2026, 9, 30)).length).toBe(1);
  // el anticipo (quincena) no dispara la planilla
  W = C.draft(S);
  C.formSueldo(W, { monto: 850000, dia: 30, quincena: true, antMonto: 200000, antDia: 15, cuenta: "bci" }, c);
  C.formProg(W, { tipo: "gasto", desc: "Seguro", monto: 10000, dia: 1, cat: "salud", planilla: true }, c);
  C.confirmarIngreso(W, W.prog.find((p) => p.parte === "anticipo")!, {}, ctx(new Date(2026, 9, 15)));
  expect(W.tx.some((x) => x.via === "planilla")).toBe(false);
});

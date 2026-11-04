// Finanzas 2.0: formularios (mismas reglas que la web), tablero, presupuesto al día, atajos y primer uso.
import { test, expect } from "bun:test";
const C = await import("C:/Proyectos/eris-mobile/src/services/finance/financeCore.ts");

const now = new Date(2026, 9, 15, 12); // 15 de octubre
let id = 1000;
const ctx = { now, newId: () => ++id };
const base = () => {
  const S = C.onboarding({ sueldo: 1200000, ahorro: 200000, presup: { alimentacion: 300000, transporte: 60000 } }, ctx);
  const W = C.draft(S);
  expect(C.formCuenta(W, { banco: "BCI", tipo: "debito", saldo: 500000 }, ctx).ok).toBe(true);
  expect(C.formCuenta(W, { banco: "Banco Falabella", alias: "CMR", tipo: "credito", cupo: 800000, deuda: 100000 }, ctx).ok).toBe(true);
  return W;
};
const ref = (W: any, nombre: string) => C.estado(W).cuentas.find((c: any) => c.nombre.includes(nombre))!.id;

test("primer uso: sueldo, ahorro, presupuesto y listo para el chat", () => {
  const S = C.onboarding({ sueldo: 900000, ahorro: 50000, presup: { alimentacion: 200000, otros: 0 } }, ctx);
  expect(S.setupDone).toBe(true);
  expect(C.vistas(C.estado(S)).ahorroAcum).toBe(50000);
  expect(S.presup).toEqual({ alimentacion: 200000 });
  expect(C.applyOp(S, { action: "gasto", monto: 1000, descripcion: "x" }, ctx).result.ok).toBe(true);
});

test("cuentas: nombre repetido, cupo, saldo desde otra cuenta", () => {
  const W = base();
  expect(C.formCuenta(W, { banco: "BCI", tipo: "debito" }, ctx)).toEqual({ ok: false, msg: "Ya tienes una cuenta con ese nombre" });
  expect(C.formCuenta(W, { banco: "Santander", tipo: "credito", cupo: 0 }, ctx).msg).toBe("Indica el cupo total de la tarjeta");
  const r = C.formCuenta(W, { banco: "Tenpo", tipo: "debito", saldo: 100000, origen: ref(W, "BCI") }, ctx);
  expect(r.ok).toBe(true);
  expect(C.estado(W).cuentas.find((c: any) => c.nombre === "BCI")!.saldo).toBe(400000);
  expect(C.estado(W).cuentas.find((c: any) => c.nombre === "Tenpo")!.saldo).toBe(100000);
  const cmr = C.estado(W).cuentas.find((c: any) => c.nombre.includes("CMR"))!;
  expect(C.deudaDe(cmr)).toBe(100000);
});

test("gastos: saldo insuficiente, cuotas con interés, recuerda la cuenta", () => {
  const W = base();
  expect(C.formGasto(W, { desc: "tele", monto: 900000, cat: "otros", cuenta: ref(W, "BCI") }, ctx).msg).toContain("Saldo insuficiente en BCI");
  const r = C.formGasto(W, { desc: "celular", monto: 300000, cat: "otros", cuenta: ref(W, "CMR"), cuotas: 6, cuotaValor: 55000 }, ctx);
  expect(r.ok).toBe(true);
  expect(r.tx!.monto).toBe(330000); // 6 × 55.000 (con interés)
  expect(W.lastCuenta).toBe(ref(W, "CMR"));
  // En débito no hay cuotas
  const d = C.formGasto(W, { desc: "almuerzo", monto: 5000, cat: "alimentacion", cuenta: ref(W, "BCI"), cuotas: 3 }, ctx);
  expect(d.tx!.cuotas).toBeUndefined();
  expect(C.formGasto(W, { desc: "", monto: 5000, cat: "x" }, ctx).msg).toBe("¡Datos incompletos!");
  // 2026-10-22: solo existe la plata de tus cuentas: sin cuenta no se anota
  expect(C.formGasto(W, { desc: "aseo", monto: 4990, cat: "hogar" }, ctx).msg).toBe("Elige con qué pagaste");
  expect(C.formGasto(W, { desc: "aseo", monto: 4990, cat: "hogar", cuenta: ref(W, "BCI") }, ctx).tx!.cat).toBe("hogar");
});

test("movimientos: giro, transferencia, pago de tarjeta (sin pasarse), ajuste e ingreso", () => {
  const W = base();
  const bci = ref(W, "BCI"), cmr = ref(W, "CMR");
  expect(C.formMov(W, { tipo: "giro", desde: bci, hacia: C.CASH, monto: 20000 }, ctx).ok).toBe(true);
  expect(C.estado(W).efectivo).toBe(20000);
  expect(C.formMov(W, { tipo: "pago", desde: bci, hacia: cmr, monto: 200000 }, ctx).msg).toContain("debe $100.000");
  expect(C.formMov(W, { tipo: "pago", desde: bci, hacia: cmr, monto: 100000 }, ctx).ok).toBe(true);
  expect(C.deudaDe(C.estado(W).cuentas.find((c: any) => c.id === cmr)!)).toBe(0);
  expect(C.formMov(W, { tipo: "ajuste", hacia: bci, monto: "350000" }, ctx).ok).toBe(true);
  expect(C.estado(W).cuentas.find((c: any) => c.id === bci)!.saldo).toBe(350000);
  expect(C.formMov(W, { tipo: "abono", hacia: bci, monto: 80000, fuente: "extra", desc: "Freelance" }, ctx).msg).toBe("Ingreso anotado");
  expect(C.ingresoDelMes(W.tx, "2026-10", 0, now).extra).toBe(80000);
  expect(C.formMov(W, { tipo: "abono", hacia: bci, monto: 15000 }, ctx).msg).toBe("Abono anotado");
  expect(C.formMov(W, { tipo: "transfer", desde: bci, hacia: bci, monto: 1 }, ctx).msg).toBe("Origen y destino son la misma cuenta");
});

test("sueldo con quincena: mismos ids al cambiarlo, historial solo si cambia", () => {
  const W = base();
  expect(C.formSueldo(W, { monto: 1200000, dia: 30, quincena: true, antMonto: 1300000, antDia: 15 }, ctx).msg).toContain("anticipo");
  expect(C.formSueldo(W, { monto: 1200000, dia: 30, cuenta: ref(W, "BCI"), quincena: true, antMonto: 400000, antDia: 15 }, ctx).ok).toBe(true);
  const ids = W.prog.map((p: any) => p.id).sort();
  const hist = W.sueldo.length;
  expect(C.formSueldo(W, { monto: 1300000, dia: 30, cuenta: ref(W, "BCI"), quincena: true, antMonto: 400000, antDia: 15 }, ctx).ok).toBe(true);
  expect(W.prog.map((p: any) => p.id).sort()).toEqual(ids);
  expect(W.sueldo.length).toBe(hist + 1);
  expect(C.sueldoEsperado(W, now)).toBe(1300000);
  // el día 15 llegó la quincena: queda "por confirmar"
  expect(C.ingresosPendientes(W, now).map((p: any) => p.desc)).toEqual(["Anticipo (quincena)"]);
});

test("préstamos: cobrar devuelve a la cuenta; desmarcar lo vuelve pendiente", () => {
  const W = base();
  const bci = ref(W, "BCI");
  expect(C.formPrestamo(W, { desc: "Cami", monto: 30000, cuenta: bci }, ctx).ok).toBe(true);
  const p = W.tx.at(-1)!;
  expect(C.estado(W).cuentas.find((c: any) => c.id === bci)!.saldo).toBe(470000);
  expect(C.marcarCobrado(W, p.id, ctx).msg).toContain("+$30.000");
  expect(C.estado(W).cuentas.find((c: any) => c.id === bci)!.saldo).toBe(500000);
  expect(C.marcarCobrado(W, p.id, ctx).msg).toBe("Vuelve a estar pendiente");
  expect(C.vistas(C.estado(W)).meDeban[0].cobrado).toBe(false);
});

test("tablero: libre hasta el sueldo (con fijos que vienen), runway, patrimonio y tickers vs mes pasado", () => {
  const W = base();
  const bci = ref(W, "BCI");
  C.formSueldo(W, { monto: 1200000, dia: 30, cuenta: bci }, ctx);
  C.formProg(W, { tipo: "gasto", desc: "Internet", monto: 25000, dia: 20, cat: "vivienda", cuenta: bci }, ctx);
  // gastos variables de octubre y de septiembre (hasta el mismo día)
  for (const [d, m, c] of [["2026-10-03", 30000, "alimentacion"], ["2026-10-10", 20000, "alimentacion"], ["2026-10-12", 10000, "transporte"], ["2026-09-05", 25000, "alimentacion"], ["2026-09-25", 90000, "alimentacion"]] as const)
    C.formGasto(W, { desc: "x", monto: m, cat: c, cuenta: bci, fecha: d }, ctx);
  const T = C.tablero(W, now);
  expect(T.proximo?.desc).toBe("Sueldo");
  expect(T.proximo?.enDias).toBe(15);
  expect(T.comprometido).toBe(25000); // internet el 20, antes del sueldo
  expect(T.libre).toBe(T.liquidez - 25000);
  expect(Math.round(T.burnDiario)).toBe(4000); // 60.000 / 15 días
  expect(T.runwayDias).toBe(Math.floor(T.libre / (60000 / 15)));
  expect(T.patrimonio).toBe(T.liquidez + T.ahorro + T.meDeben - T.deudaTC);
  const comida = T.tickers.find((t: any) => t.cat === "alimentacion")!;
  expect(comida.monto).toBe(50000);
  expect(comida.antes).toBe(25000); // solo lo de septiembre hasta el día 15
  expect(comida.cambio).toBe(100);
  expect(T.tendencia).toHaveLength(6);
  expect(T.curva).toHaveLength(15);
  expect(T.curva.at(-1)).toBe(T.gasto);
});

test("presupuesto al día: fijos en su día, ritmo y sobre el tope", () => {
  const W = base();
  W.presup = { ...W.presup, vivienda: 400000 };
  expect(C.formProg(W, { tipo: "gasto", desc: "Arriendo", monto: 350000, dia: 5, cat: "vivienda", cuenta: ref(W, "BCI") }, ctx).ok).toBe(true);
  C.aplicarProgramados(W, ctx); // el 5 ya pasó: se anota
  C.formGasto(W, { desc: "super", monto: 280000, cat: "alimentacion", fecha: "2026-10-14", cuenta: ref(W, "CMR") }, ctx);
  C.formGasto(W, { desc: "bip", monto: 70000, cat: "transporte", fecha: "2026-10-14", cuenta: ref(W, "CMR") }, ctx);
  const L = Object.fromEntries(C.presupuestoAlDia(W, now).map((l: any) => [l.cat, l]));
  expect(L.vivienda.estado).toBe("al_dia"); // el arriendo no lo deja "sobre": estaba esperado desde el día 5
  expect(Math.round(L.vivienda.esperado)).toBe(350000 + Math.round(50000 * 15 / 31));
  expect(L.alimentacion.estado).toBe("apurado");
  expect(L.alimentacion.texto).toContain("/día");
  expect(L.transporte.estado).toBe("sobre");
  expect(L.transporte.texto).toBe("Sobre el presupuesto por $10.000");
});

test("atajos: lo que más repites (sin fijos ni cuotas), con su monto típico", () => {
  const W = base();
  const bci = ref(W, "BCI");
  for (const m of [3500, 3800, 3500]) C.formGasto(W, { desc: "Almuerzo", monto: m, cat: "alimentacion", cuenta: bci, fecha: "2026-10-10" }, ctx);
  for (const m of [2000, 2000]) C.formGasto(W, { desc: "micro", monto: m, cat: "transporte", cuenta: ref(W, "CMR"), fecha: "2026-10-11" }, ctx);
  C.formGasto(W, { desc: "Zapatillas", monto: 60000, cat: "otros", cuenta: bci, fecha: "2026-10-11" }, ctx);
  const A = C.atajos(W, now);
  expect(A.map((a: any) => a.desc)).toEqual(["Almuerzo", "micro"]);
  expect(A[0].monto).toBe(3500);
  expect(A[0].cuenta).toBe(bci);
});

test("rating: por conducta (no por ingreso), con qué lo sube; y el texto para Eris", () => {
  const W = base();
  const bci = ref(W, "BCI");
  C.formSueldo(W, { monto: 1200000, dia: 30, cuenta: bci }, ctx);
  C.formGasto(W, { desc: "super", monto: 100000, cat: "alimentacion", cuenta: bci, fecha: "2026-10-05" }, ctx);
  const R1 = C.rating(W, now)!;
  expect(R1.score).toBeGreaterThan(0);
  expect(R1.score).toBeLessThanOrEqual(100);
  expect(["AAA", "AA", "A", "BBB", "BB", "B", "CCC"]).toContain(R1.nota);
  expect(R1.partes.map((p: any) => p.id)).toEqual(["ahorro", "colchon", "deuda", "presup", "runway"]);
  // Con el MISMO comportamiento y el doble de sueldo, la nota no puede ser peor (no castiga ganar menos con un rango por ingreso)
  const W2 = C.draft(W); C.formSueldo(W2, { monto: 600000, dia: 30, cuenta: bci }, ctx);
  expect(C.rating(W2, now)!.partes.find((p: any) => p.id === "colchon")!.valor).toBe(R1.partes.find((p: any) => p.id === "colchon")!.valor);
  // Deuda alta en la tarjeta baja la nota y lo dice
  const W3 = C.draft(W); C.formGasto(W3, { desc: "viaje", monto: 650000, cat: "otros", cuenta: ref(W3, "CMR") }, ctx);
  const R3 = C.rating(W3, now)!;
  expect(R3.score).toBeLessThan(R1.score);
  expect(R3.mejoras.join(" ")).toContain("tarjetas");
  // El texto para Eris: sin rango por sueldo, con rating, ritmo y «Su plata» (2026-10-22: sin «Disponible», que contaba
  // el sueldo que aún no llegaba)
  const ex = C.extract(W, now);
  expect(ex.context).not.toContain("Hunter Rank");
  expect(ex.context).not.toMatch(/x SM\)/);
  expect(ex.context).toContain("Rating de sus finanzas:");
  expect(ex.context).toContain("Para gastar hasta");
  expect(ex.context).not.toContain("Disponible");
  expect(ex.context).toMatch(/\n- Su plata \([^)]*\): \$/);
  expect(ex.context).not.toContain("· Efectivo:"); // no lo usa
  expect((ex.summary as any).disponible).toBeUndefined();
  expect((ex.summary as any).plata).toBe(C.tablero(W, now).plata);
  expect(ex.summary.rating?.nota).toBe(R1.nota);
  expect((ex.summary as any).hunterRank).toBeUndefined();
  expect(C.rating(C.onboarding({ sueldo: 0 }, ctx), now)).toBeNull(); // sin datos no se califica
});

test("borrar: cuenta se archiva (lo anotado conserva el nombre) y avisos claros", () => {
  const W = base();
  const bci = ref(W, "BCI");
  C.formGasto(W, { desc: "pan", monto: 1500, cat: "alimentacion", cuenta: bci }, ctx);
  const t = W.tx.at(-1)!;
  expect(C.avisoBorrar(W, "tx", t.id)).toBe("Se devuelven $1.500 a BCI");
  expect(C.borrar(W, "cuenta", bci).ok).toBe(true);
  expect(C.estado(W).cuentas.some((c: any) => c.id === bci)).toBe(false);
  expect(C.estado(W).nombre(bci)).toBe("BCI");
  expect(W.lastCuenta).not.toBe(bci);
});

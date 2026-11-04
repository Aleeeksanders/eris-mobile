// Eris administra (A2): «tus finanzas no calzan» — el núcleo del cuadre (financeCore.cuadre) y sus arreglos
process.env.TZ = "America/Santiago";
import { test, expect } from "bun:test";
import {
  emptyState, formGasto, formPrestamo, cuadre, anotarSaldoBanco, anotarLineaCredito, arreglarCuadre, ajustarAlBanco, saldoLibroEn, cuadreResumen, extract,
  aplicarProgramados, estado, vistaCuenta, saldoFinalCartola, type FinanceState, type AvisoPend, type Explicacion,
} from "C:/Proyectos/eris-mobile/src/services/finance/financeCore.ts";


const NOW = new Date(2026, 9, 30, 18, 0);
const T = (h: number, m = 0, d = 30) => new Date(2026, 9, d, h, m).getTime();
let nid = 0;
const ctxAt = (ms: number) => ({ now: new Date(ms), newId: () => ms + ++nid });
const BCI = { id: 1, nombre: "Cuenta corriente", banco: "BCI", tipo: "debito", saldoInicial: 500_000 };
const SAN = { id: 3, nombre: "Cuenta Santander", banco: "Santander", tipo: "debito", saldoInicial: 300_000 };
const VISA = { id: 2, nombre: "Visa", banco: "BCI", tipo: "credito", saldoInicial: 800_000, cupo: 800_000 };
function S0(cuentas: any[]): FinanceState { const S = emptyState(); S.cuentas = cuentas as any; S.setupDone = true; return S; }
const banco = (S: FinanceState, ref: any, saldo: number, at = T(12), fuente: any = "chat") => expect(anotarSaldoBanco(S, ref, { saldo, at, fuente }).ok).toBe(true);
const cta = (S: FinanceState, ref: any, avisos: AvisoPend[] = []) => cuadre(S, NOW, { avisos }).cuentas.find((c) => c.ref === ref)!;
const arregla = (S: FinanceState, ref: any, ex: Explicacion) => { const r = arreglarCuadre(S, ref, ex, ctxAt(NOW.getTime())); expect(r.ok).toBe(true); return r; };

test("calza: el banco y lo anotado a esa hora; lo anotado DESPUÉS de la lectura no cuenta", () => {
  const S = S0([BCI]);
  formGasto(S, { desc: "Lider", monto: 12_990, cat: "alimentacion", cuenta: 1, fecha: "2026-10-30" }, ctxAt(T(9)));
  banco(S, 1, 487_010, T(10));
  expect(cta(S, 1).estado).toBe("calza");
  formGasto(S, { desc: "Almuerzo", monto: 8_500, cat: "alimentacion", cuenta: 1, fecha: "2026-10-30" }, ctxAt(T(14)));
  expect(saldoLibroEn(S, 1, T(10))).toBe(487_010);
  expect(cta(S, 1).estado).toBe("calza");
  expect(cta(S, 1).saldo).toBe(478_510);
});

test("sin saldo del banco: «sin dato»; las tarjetas de crédito no se cuadran (todavía)", () => {
  const S = S0([BCI, VISA]);
  expect(cta(S, 1).estado).toBe("sin_dato");
  expect(anotarSaldoBanco(S, 2, { saldo: 1, at: T(12), fuente: "chat" }).ok).toBe(false);
  expect(cuadre(S, NOW).cuentas.some((c) => c.ref === 2)).toBe(false);
});

test("un aviso en «Por confirmar» explica la diferencia (exacta si su cuenta es esa); descartado también, pero no exacta", () => {
  const S = S0([BCI]);
  banco(S, 1, 488_010);
  const avisos: AvisoPend[] = [
    { clave: "notif:a", desc: "Spotify", monto: 11_990, fecha: "2026-10-30", sale: true, cuentas: [1] },
    { clave: "notif:b", desc: "Uber", monto: 4_500, fecha: "2026-10-30", sale: true, cuentas: [1] },
  ];
  const c = cta(S, 1, avisos);
  expect([c.estado, c.diff]).toEqual(["no_calza", 11_990]);
  expect(c.explicaciones[0].tipo).toBe("aviso");
  expect(c.explicaciones[0].exacta).toBe(true);
  expect(c.explicaciones[0].texto).toContain("Spotify");
  const d = cta(S, 1, [{ ...avisos[0], descartado: true }]);
  expect(d.explicaciones[0].tipo).toBe("descartado");
  expect(d.explicaciones[0].exacta).toBe(false);
});

test("anotado dos veces (por chat y por el aviso): se quita el del chat y calza", () => {
  const S = S0([BCI]);
  formGasto(S, { desc: "Almuerzo", monto: 8_500, cat: "alimentacion", cuenta: 1, fecha: "2026-10-30", via: "eris" }, ctxAt(T(9)));
  formGasto(S, { desc: "Juan Maestro", monto: 8_500, cat: "alimentacion", cuenta: 1, fecha: "2026-10-30", via: "banco", extra: { notif: { clave: "notif:x", at: T(9, 5) } } }, ctxAt(T(9, 6)));
  banco(S, 1, 491_500);
  const c = cta(S, 1);
  expect(c.diff).toBe(-8_500);
  const ex = c.explicaciones[0];
  expect([ex.tipo, ex.exacta]).toEqual(["duplicado", true]);
  arregla(S, 1, ex);
  expect(S.tx.map((t) => t.desc)).toEqual(["Juan Maestro"]);
  expect(cta(S, 1).estado).toBe("calza");
});

test("anotado en la cuenta equivocada: si la otra cuenta tiene la diferencia contraria, se mueve (exacta)", () => {
  const S = S0([BCI, SAN]);
  formGasto(S, { desc: "Farmacia", monto: 8_500, cat: "salud", cuenta: 1, fecha: "2026-10-29" }, ctxAt(T(10, 0, 29)));
  banco(S, 1, 500_000);   // el BCI no lo cobró
  banco(S, 3, 291_500);   // fue con el Santander
  const c = cta(S, 1);
  const ex = c.explicaciones[0];
  expect([ex.tipo, ex.exacta, ex.accion && ex.accion.tipo === "mover" && ex.accion.a]).toEqual(["otra_cuenta", true, 3]);
  arregla(S, 1, ex);
  expect([cta(S, 1).estado, cta(S, 3).estado]).toEqual(["calza", "calza"]);
});

test("un fijo cobrado antes de su día: se anota ahora y no se repite en su día", () => {
  const S = S0([BCI]);
  S.prog.push({ id: 50, tipo: "gasto", desc: "Netflix", monto: 9_990, dia: 2, cat: "entretenimiento", cuenta: 1 } as any);
  const N = new Date(2026, 10, 1, 12); // 1 nov: Netflix es el 2
  expect(anotarSaldoBanco(S, 1, { saldo: 490_010, at: N.getTime(), fuente: "chat" }).ok).toBe(true);
  const c = cuadre(S, N).cuentas[0];
  const ex = c.explicaciones[0];
  expect([ex.tipo, ex.exacta]).toEqual(["fijo", true]);
  expect(arreglarCuadre(S, 1, ex, ctxAt(N.getTime())).ok).toBe(true);
  expect(cuadre(S, N).cuentas[0].estado).toBe("calza");
  // El día 2 no se anota otra vez
  expect(aplicarProgramados(S, ctxAt(new Date(2026, 10, 2, 9).getTime()))).toBe(0);
});

test("llegó el sueldo y no está confirmado: la diferencia ES el sueldo (con lo que llegó de verdad)", () => {
  const S = S0([BCI]);
  S.prog.push({ id: 77, tipo: "ingreso", fuente: "sueldo", parte: "saldo", desc: "Sueldo", monto: 1_000_000, dia: 30, cuenta: 1 } as any);
  banco(S, 1, 1_512_345);
  const c = cta(S, 1);
  const ex = c.explicaciones[0];
  expect([ex.tipo, ex.exacta]).toEqual(["sueldo", true]);
  expect(ex.texto).toContain("$12.345 más de lo esperado");
  arregla(S, 1, ex);
  expect(S.rec).toContain("77:2026-10");
  expect(cta(S, 1).estado).toBe("calza");
});

test("comisión como la del mes pasado (sugerencia) y dos avisos pendientes que suman justo la diferencia", () => {
  const S = S0([BCI]);
  formGasto(S, { desc: "Comisión mantención", monto: 3_990, cat: "otros", cuenta: 1, fecha: "2026-09-30" }, ctxAt(T(10, 0, 30) - 30 * 86_400_000));
  banco(S, 1, 492_020); // 500.000 − 3.990 (sept) − 3.990 (oct, no anotada)
  const c = cta(S, 1);
  expect(c.explicaciones.some((x) => x.tipo === "comision" && !x.exacta)).toBe(true);
  const S2 = S0([BCI]);
  banco(S2, 1, 487_010);
  const avisos: AvisoPend[] = [
    { clave: "notif:1", desc: "Uber", monto: 5_000, fecha: "2026-10-30", sale: true, cuentas: [1] },
    { clave: "notif:2", desc: "Starbucks", monto: 7_990, fecha: "2026-10-30", sale: true, cuentas: [1] },
    { clave: "notif:3", desc: "Copec", monto: 30_000, fecha: "2026-10-30", sale: true, cuentas: [1] },
  ];
  const c2 = cta(S2, 1, avisos);
  expect(c2.explicaciones[0].tipo).toBe("avisos");
  expect(c2.explicaciones[0].accion).toEqual({ tipo: "anotar_avisos", claves: ["notif:1", "notif:2"] });
});

test("nada calza: ajustar al saldo del banco (con su toque) deja la cuenta igual que el banco", () => {
  const S = S0([BCI]);
  banco(S, 1, 476_321);
  const c = cta(S, 1);
  expect(c.explicaciones.length).toBe(0);
  const r = ajustarAlBanco(S, 1, ctxAt(NOW.getTime()));
  expect(r.ok).toBe(true);
  expect(r.msg).toContain("−$23.679");
  expect(cta(S, 1).estado).toBe("calza");
  expect(S.tx[0].desc).toBe("Diferencia con el banco");
});

test("el saldo disponible incluye la línea de crédito: se descuenta y calza", () => {
  const S = S0([BCI]);
  banco(S, 1, 800_000, T(12), "aviso");
  expect(cta(S, 1).diff).toBe(-300_000);
  expect(anotarLineaCredito(S, 1, 300_000).ok).toBe(true);
  expect(cta(S, 1).estado).toBe("calza");
});

test("alertas sin saldo del banco: cuenta en negativo, transferencia a medias (> 24 h), sueldo atrasado 2 días hábiles", () => {
  const S = S0([BCI]);
  S.tx.push({ id: 9, tipo: "gasto", fecha: "2026-10-29", monto: 520_000, desde: 1, desc: "Arriendo", cat: "vivienda" } as any);
  S.prog.push({ id: 77, tipo: "ingreso", fuente: "sueldo", desc: "Sueldo", monto: 1_000_000, dia: 27, cuenta: 1 } as any);
  const C = cuadre(S, NOW, { avisos: [{ clave: "notif:t", desc: "Transferencia", monto: 80_000, fecha: "2026-10-28", sale: true, cuentas: [1], tipo: "transferencia", at: T(10, 0, 28) }] });
  const tipos = C.alertas.map((a) => a.tipo).sort();
  expect(tipos).toEqual(["mitad", "negativo", "sueldo"]);
  expect(C.alertas.find((a) => a.tipo === "sueldo")!.texto).toContain("debía llegar el 27 oct");
  // El 28 (1 día hábil después) todavía no es atraso
  expect(cuadre(S, new Date(2026, 9, 28, 18)).alertas.some((a) => a.tipo === "sueldo")).toBe(false);
});

test("lo que lee Eris: solo números (y la línea de contexto)", () => {
  const S = S0([BCI, SAN]);
  banco(S, 1, 500_000);
  banco(S, 3, 288_010);
  const R = cuadreResumen(S, NOW);
  expect(R.noCalzan).toBe(1);
  expect(R.cuentas.map((c) => [c.nombre, c.estado, c.diff])).toEqual([["Cuenta corriente", "calza", 0], ["Cuenta Santander", "no_calza", 11_990]]);
  const X = extract(S, NOW);
  expect(X.context).toContain("Cuadre con el banco: Cuenta corriente calza");
  expect(X.context).toContain("Cuenta Santander NO calza: lo anotado tiene $11.990 más que el banco");
  expect(X.summary.cuadre.noCalzan).toBe(1);
});

test("la cartola: el saldo con que termina (filas de lo viejo a lo nuevo, o al revés)", () => {
  const asc = [{ fecha: "2026-10-28", desc: "A", monto: -10_000, saldo: 90_000 }, { fecha: "2026-10-29", desc: "B", monto: -5_000, saldo: 85_000 }, { fecha: "2026-10-29", desc: "C", monto: 20_000, saldo: 105_000 }];
  expect(saldoFinalCartola(asc)).toEqual({ saldo: 105_000, fecha: "2026-10-29" });
  expect(saldoFinalCartola([...asc].reverse())).toEqual({ saldo: 105_000, fecha: "2026-10-29" });
  expect(saldoFinalCartola([{ fecha: "2026-10-28", desc: "A", monto: -1 }])).toBeNull();
});

test("«Me debe» y transferencias no rompen el cuadre: un préstamo cuenta como salida", () => {
  const S = S0([BCI]);
  formPrestamo(S, { desc: "Juan", monto: 10_000, cuenta: 1, fecha: "2026-10-30" }, ctxAt(T(9)));
  banco(S, 1, 490_000);
  expect(cta(S, 1).estado).toBe("calza");
  expect(vistaCuenta(estado(S), 1)!.saldo).toBe(490_000);
});

// Avisos del banco → propuesta de gasto. Textos de ejemplo con la forma típica de los avisos (no son de un banco real).
import { test, expect } from "bun:test";
import { parseAviso, esGasto, posibleDuplicado } from "C:/Proyectos/eris-mobile/src/services/finance/bankNotif.ts";

const AT = new Date(2026, 9, 15, 13, 42).getTime();
const av = (title: string, text: string, i = 1) => ({ pkg: "cl.banco.app", app: "Mi Banco", title, text, at: AT, key: `cl.banco.app:${AT}:${i}` });

test("compra con tarjeta: monto, comercio conocido, tarjeta, fecha y hora", () => {
  const p = parseAviso(av("Compra aprobada", "Compra por $12.990 en LIDER EXPRESS con tu tarjeta ****4521 el 15/10/2026."))!;
  expect(p).toMatchObject({ tipo: "compra", monto: 12990, comercio: "LIDER EXPRESS", desc: "Lider", cat: "alimentacion", last4: "4521", fecha: "2026-10-15", hora: "13:42", clave: "notif:cl.banco.app:" + AT + ":1" });
  expect(esGasto(p)).toBe(true);
});

test("otras formas de decirlo", () => {
  expect(parseAviso(av("Mi Banco", "Se realizó un cargo de $ 5.000 en FARMACIAS CRUZ VERDE. Tarjeta terminada en 1234")))
    .toMatchObject({ tipo: "compra", monto: 5000, desc: "Cruz Verde", cat: "salud", last4: "1234" });
  expect(parseAviso(av("Usaste tu tarjeta", "Pagaste $8.400 en UBER *TRIP. Saldo disponible $320.000")))
    .toMatchObject({ tipo: "compra", monto: 8400, desc: "Uber", cat: "transporte" });
  expect(parseAviso(av("Transferencia enviada", "Transferiste $50.000 a Juan Pérez desde tu cuenta corriente.")))
    .toMatchObject({ tipo: "transferencia", monto: 50000, desc: "Transferencia a Juan Pérez", cat: "otros" });
});

test("lo que no es un gasto", () => {
  expect(esGasto(parseAviso(av("Abono recibido", "Recibiste una transferencia de $120.000 de Empresa SpA"))!)).toBe(false);
  expect(esGasto(parseAviso(av("Giro", "Giro por $20.000 en cajero automático"))!)).toBe(false);
  expect(parseAviso(av("¡Oferta!", "Crédito de consumo por hasta $5.000.000 preaprobado para ti"))).toBeNull();
  expect(parseAviso(av("Tu saldo", "Tu saldo disponible es $340.000"))).toBeNull();
  expect(parseAviso(av("Código", "Tu código de seguridad es 482913"))).toBeNull();
});

test("posible duplicado: mismo monto el mismo día (lo anotó por chat o con la boleta)", () => {
  const p = parseAviso(av("Compra aprobada", "Compra por $12.990 en LIDER EXPRESS con tu tarjeta ****4521"))!;
  expect(posibleDuplicado([{ tipo: "gasto", monto: 12990, fecha: "2026-10-15", desc: "Lider" }], p)).toEqual({ desc: "Lider", fecha: "2026-10-15" });
  expect(posibleDuplicado([{ tipo: "gasto", monto: 12990, fecha: "2026-10-10", desc: "Lider" }], p)).toBeNull();
  expect(posibleDuplicado([{ tipo: "gasto", monto: 12000, fecha: "2026-10-15", desc: "Lider" }], p)).toBeNull();
});

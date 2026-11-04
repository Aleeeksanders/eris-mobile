import { test, expect } from "bun:test";
import { anonimizarAviso } from "C:/Proyectos/eris-mobile/src/services/finance/bankNotif.ts";
test("sin nombres de personas ni números; el banco y el comercio quedan", () => {
  expect(anonimizarAviso("Transferiste $50.000 a JUAN PEREZ desde tu cuenta ****1234")).toBe("Transferiste $99.999 a NOMBRE desde tu cuenta ****9999");
  expect(anonimizarAviso("Recibiste una transferencia de $120.000 de Empresa Spa")).toBe("Recibiste una transferencia de $999.999 de NOMBRE");
  expect(anonimizarAviso("Compra por $12.990 en LIDER EXPRESS con tu tarjeta de débito el 30/10")).toBe("Compra por $99.999 en LIDER EXPRESS con tu tarjeta de débito el 99/99");
  expect(anonimizarAviso("Alex Melita te envió $5.000", ["Alex", "Melita"])).toBe("NOMBRE NOMBRE te envió $9.999");
  expect(anonimizarAviso("Transferencia a Banco de Chile por $10.000")).toBe("Transferencia a Banco de Chile por $99.999");
});

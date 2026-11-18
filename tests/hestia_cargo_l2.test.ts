// Hestia como JARVIS · L2 (2026-11-17): ¿un cargo del banco fuera de lo común? (cargoRaro). Para que Hestia pregunte «¿lo
// reconoces?» solo cuando vale la pena: un comercio nuevo desde $30.000, mucho más de lo de siempre ahí, nunca lo programado.
process.env.TZ = "America/Santiago";
import { test, expect } from "bun:test";
import { cargoRaro, RARO } from "C:/Proyectos/eris-mobile/src/services/finance/cargoRaro.ts";
import { emptyState, type FinanceState, type Tx } from "C:/Proyectos/eris-mobile/src/services/finance/financeCore.ts";

function S(tx: Array<Partial<Tx>>, prog: any[] = []): FinanceState {
  const s = emptyState();
  s.tx = tx.map((t, i) => ({ id: i + 1, tipo: "gasto", fecha: "2026-11-01", monto: 1000, desc: "x", ...t })) as Tx[];
  s.prog = prog;
  return s;
}

test("un comercio nuevo: desde $30.000 es raro; menos, no", () => {
  expect(cargoRaro({ monto: 89_990, desc: "Falabella" }, S([]))).toBe("un comercio nuevo");
  expect(cargoRaro({ monto: 12_000, desc: "Falabella" }, S([]))).toBeNull();
  expect(cargoRaro({ monto: RARO.minimo - 1, desc: "Cualquiera" }, S([]))).toBeNull();
});

test("un comercio conocido: raro solo si es mucho más que lo más alto de ahí", () => {
  const s = S([{ desc: "LIDER EXPRESS", monto: 18_000 }, { desc: "Lider Express", monto: 25_000 }, { desc: "Copec", monto: 30_000 }]);
  expect(cargoRaro({ monto: 24_000, desc: "Líder Express" }, s)).toBeNull();
  expect(cargoRaro({ monto: 70_000, desc: "LIDER EXPRESS S.A." }, s)).toBe("mucho más de lo que sueles gastar ahí");
  // el supermercado grande de siempre: $200.000 no es raro si ya gastó $180.000 ahí
  const super_ = S([{ desc: "Jumbo", monto: 180_000 }]);
  expect(cargoRaro({ monto: 200_000, desc: "Jumbo" }, super_)).toBeNull();
  expect(cargoRaro({ monto: 300_000, desc: "Jumbo" }, super_)).toBe("más de lo habitual ahí");
});

test("lo recién anotado no cuenta como historial; lo programado (el arriendo) nunca es raro", () => {
  const s = S([{ id: 9, desc: "Falabella", monto: 89_990 }]);
  expect(cargoRaro({ monto: 89_990, desc: "Falabella" }, s, 9)).toBe("un comercio nuevo");
  const conArriendo = S([], [{ id: 1, tipo: "gasto", desc: "Arriendo depto", monto: 450_000, dia: 5 }]);
  expect(cargoRaro({ monto: 450_000, desc: "Arriendo" }, conArriendo)).toBeNull();
  expect(cargoRaro({ monto: 89_990, desc: "Falabella" }, null)).toBeNull();
});

import { test, expect } from "bun:test";
import { agruparBoleta, claveBoletaFoto, comercioDe } from "C:/Proyectos/eris-mobile/src/services/finance/receiptTed.ts";
const items = [
  { desc: "Leche", monto: 1190 }, { desc: "Detergente", monto: 8990, cat: "hogar" }, { desc: "Pan", monto: 1980 },
  { desc: "Papel Higienico", monto: 5490, cat: "hogar" }, { desc: "Cerveza", monto: 1100, cat: "entretenimiento" },
];
test("agrupar por categoría; la persona puede mover un producto", () => {
  const def = comercioDe("SUPERMERCADO DEMO").cat;
  expect(def).toBe("alimentacion");
  const g = agruparBoleta(items, def);
  expect(g.map((x) => [x.cat, x.monto, x.items.length])).toEqual([["hogar", 14480, 2], ["alimentacion", 3170, 2], ["entretenimiento", 1100, 1]]);
  const g2 = agruparBoleta(items, def, { 4: "alimentacion" });
  expect(g2.map((x) => [x.cat, x.monto])).toEqual([["hogar", 14480], ["alimentacion", 4270]]);
});
test("clave: timbre > folio > fecha+total", () => {
  const b = { ok: true as const, items, suma: 18750, cuadra: true, dudosas: [], comercio: "SUPERMERCADO DEMO", rut: "76123456-7", folio: 4521337, fecha: "2026-10-15", total: 18750 };
  expect(claveBoletaFoto(b)).toBe("foto:76123456-7:4521337");
  expect(claveBoletaFoto({ ...b, folio: undefined, rut: undefined })).toBe("foto:supermercadodemo:2026-10-15:18750");
});

// La boleta de un gasto que ya está anotado (2026-11-15, pedido del usuario: «Finanzas mueve sola la plata»): la foto ya no
// anota OTRO gasto, completa el del aviso del banco; el IVA aparte con el timbre; el Inventario por código de barras.
import { test, expect } from "bun:test";
const C = await import("C:/Proyectos/eris-mobile/src/services/finance/financeCore.ts");
const R = await import("C:/Proyectos/eris-mobile/src/services/finance/receiptTed.ts");
const I = await import("C:/Proyectos/eris-mobile/src/services/inventory/inventoryCore.ts");

const now = new Date(2026, 10, 15, 19); // 15 de noviembre, 19:00
let id = 5000;
const ctx = { now, newId: () => ++id };
const base = () => {
  const S = C.onboarding({ sueldo: 1200000, ahorro: 0, presup: { alimentacion: 300000 } }, ctx);
  const W = C.draft(S);
  expect(C.formCuenta(W, { banco: "BancoEstado", alias: "CuentaRUT", tipo: "debito", saldo: 200000 }, ctx).ok).toBe(true);
  return W;
};
const cta = (W: any) => C.estado(W).cuentas[0].id;
/** lo que anota Eris de un aviso del banco */
const delAviso = (W: any, desc = "Jumbo", monto = 29480, fecha = "2026-11-15") =>
  C.formGasto(W, { desc, monto, cat: "alimentacion", fecha, cuenta: cta(W), via: "banco", extra: { notif: { clave: "n1", app: "BancoEstado" }, auto: true } }, ctx).tx!;

test("la boleta encuentra el gasto que anotó el aviso del banco (mismo monto, ±1 día, sin boleta)", () => {
  const W = base();
  const t = delAviso(W);
  expect(C.gastoDeLaBoleta(W, { total: 29480, fecha: "2026-11-15" })?.id).toBe(t.id);
  expect(C.gastoDeLaBoleta(W, { total: 29481, fecha: "2026-11-14" })?.id).toBe(t.id); // ±$1 y el día anterior
  expect(C.gastoDeLaBoleta(W, { total: 29480, fecha: "2026-11-12" })).toBeNull(); // otro día
  expect(C.gastoDeLaBoleta(W, { total: 30000, fecha: "2026-11-15" })).toBeNull(); // otro monto
  // Uno por chat con el mismo monto: gana el del banco
  C.formGasto(W, { desc: "super", monto: 29480, cat: "alimentacion", fecha: "2026-11-15", cuenta: cta(W), via: "eris" }, ctx);
  expect(C.gastoDeLaBoleta(W, { total: 29480, fecha: "2026-11-15" })?.id).toBe(t.id);
});

test("completar: la plata no se mueve; se agregan los productos y el desglose", () => {
  const W = base();
  const t = delAviso(W, "Compra con MACH");
  const saldo = C.estado(W).bal[String(cta(W))];
  const r = C.completarConBoleta(W, t.id, {
    desc: "Jumbo", partes: [{ cat: "alimentacion", monto: 21490 }, { cat: "hogar", monto: 7990 }],
    boleta: { clave: "foto:81201000-K:3522445815", folio: 3522445815, total: 29480, items: [] },
  });
  expect(r.ok).toBe(true);
  const n = W.tx.find((x: any) => x.id === t.id)!;
  expect(n.monto).toBe(29480);
  expect(n.desde).toBe(cta(W));
  expect(n.fecha).toBe("2026-11-15");
  expect((n.notif as any).app).toBe("BancoEstado"); // sigue siendo el del aviso
  expect(n.desc).toBe("Jumbo"); // «Compra con MACH» no decía dónde
  expect(n.partes).toEqual([{ cat: "alimentacion", monto: 21490 }, { cat: "hogar", monto: 7990 }]);
  expect(n.cat).toBe("alimentacion");
  expect(C.estado(W).bal[String(cta(W))]).toBe(saldo); // no se descontó otra vez
  expect(W.tx.filter((x: any) => x.tipo === "gasto").length).toBe(1);
  expect(R.boletaAnotada(W.tx, "foto:81201000-K:3522445815")).not.toBeNull();
  // Ya tiene boleta: no se completa dos veces, y deja de ser candidato
  expect(C.completarConBoleta(W, t.id, { boleta: { clave: "x" } }).ok).toBe(false);
  expect(C.gastoDeLaBoleta(W, { total: 29480, fecha: "2026-11-15" })).toBeNull();
});

test("completar: si la boleta no suma justo lo del cargo, el desglose se reparte y cuadra al peso con el banco", () => {
  const W = base();
  const t = delAviso(W, "Lider", 10000);
  C.completarConBoleta(W, t.id, { desc: "Lider Express", partes: [{ cat: "alimentacion", monto: 6000 }, { cat: "hogar", monto: 4200 }], boleta: { clave: "b2" } });
  const n = W.tx.find((x: any) => x.id === t.id)!;
  expect(n.desc).toBe("Lider"); // ya decía dónde: se queda
  expect(n.partes!.reduce((a: number, p: any) => a + p.monto, 0)).toBe(10000);
  expect(n.partes![0]).toEqual({ cat: "alimentacion", monto: 5882 });
  expect(C.partesDe(n)).not.toBeNull();
});

test("IVA aparte con el timbre: lo pagado es la suma + 19 % → se le suma a cada producto", () => {
  const b = { ok: true as const, items: [{ desc: "Tornillos", monto: 10000 }, { desc: "Pintura", monto: 14772 }], suma: 24772, cuadra: false, dudosas: [] };
  const c = R.conIvaDelTimbre(b, 29480);
  expect(c.ivaAparte).toBe(true);
  expect(c.iva).toBe(4708);
  expect(c.items.reduce((s, i) => s + i.monto, 0)).toBe(29480);
  expect(c.cuadra).toBe(true);
  // La boleta normal (IVA incluido) no se toca
  const j = { ok: true as const, items: [{ desc: "Leche", monto: 29480 }], suma: 29480, cuadra: true, dudosas: [], total: 29480 };
  expect(R.conIvaDelTimbre(j, 29480)).toBe(j);
  expect(R.conIvaDelTimbre(b, 30500)).toBe(b); // no es justo el 19 %: no se inventa
});

test("Inventario: el código de barras de la boleta reconoce el producto aunque el nombre venga abreviado", () => {
  const S = I.emptyState();
  const ictx = { now, newId: () => ++id };
  expect(I.agregar(S, { nombre: "Leche proteína chocolate 1 L", area: "alimentos", cantidad: 1, barcode: "7802910007123" }, ictx).ok).toBe(true);
  const l = I.lineaDeBoleta({ desc: "Ceche Pro Li", monto: 4290, cant: 2, ean: "7802910007123", cat: "alimentacion" });
  expect(l.barcode).toBe("7802910007123");
  const d = I.destinoBoleta(S, l);
  expect(d?.item.nombre).toBe("Leche proteína chocolate 1 L");
  expect(d?.cantidad).toBe(2);
  // Sin precio legible pero con su código: igual va a la casa
  expect(I.lineaDeBoleta({ desc: "Leche Pro Cappu", monto: 0, ean: "7802910007093", cat: "alimentacion" }).incluir).toBe(true);
  expect(I.lineaDeBoleta({ desc: "Bolsa", monto: 0, cat: "alimentacion" }).incluir).toBe(false);
});

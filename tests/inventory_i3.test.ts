// Inventario fase I3 (2026-10-22): remedios que bajan solos, lo que se come sale de la despensa, la boleta al inventario.
import { test, expect } from "bun:test";
import * as I from "C:/Proyectos/eris-mobile/src/services/inventory/inventoryCore.ts";

const D = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
let id = 100;
const ctxAt = (now: Date) => ({ now, newId: () => ++id });

test("tomas al día según el horario del perfil (leer lo anotado, no indicar)", () => {
  expect(I.tomasDeHorario("mañana y noche")).toBe(2);
  expect(I.tomasDeHorario("cada 8 horas")).toBe(3);
  expect(I.tomasDeHorario("Antes de cada comida")).toBe(3);
  expect(I.tomasDeHorario("1 vez al día")).toBe(1);
  expect(I.tomasDeHorario("dos veces al día")).toBe(2);
  expect(I.tomasDeHorario("en ayunas")).toBe(1);
  expect(I.tomasDeHorario("cuando duele")).toBeNull();
});

test("un remedio baja solo cada día y avisa con una semana de anticipación", () => {
  const W = I.draft(I.emptyState());
  const c0 = ctxAt(D(2026, 10, 22));
  const met = I.agregar(W, { nombre: "Metformina 850", area: "botiquin", cantidad: 30 }, c0).id!;
  expect(I.configurarToma(W, met, 1, 2, c0, "med-1").msg).toBe("Metformina 850: 1 unidad × 2 al día; te alcanza ~15 días");
  // el mismo día: nada (el día no ha terminado)
  expect(I.aplicarTomas(W, c0)).toBe(0);
  // 3 días después: bajan 3 días × 2
  const c3 = ctxAt(D(2026, 10, 25));
  expect(I.aplicarTomas(W, c3)).toBe(1);
  const it = W.items.find((i) => i.id === met)!;
  expect(it.cantidad).toBe(24);
  expect(it.medId).toBe("med-1");
  expect(I.historial(W, met)[0]).toMatchObject({ tipo: "consumo", delta: -6, via: "remedio", nota: "3 días de tomas" });
  expect(I.aplicarTomas(W, c3)).toBe(0); // idempotente
  // con 14 (7 días) pasa a la lista de compras
  I.ajustar(W, met, 14, null, c3);
  expect(I.faltantes(W).map((f) => `${f.item.nombre}:${f.estado}`)).toEqual(["Metformina 850:poco"]);
  expect(I.extract(W, D(2026, 10, 25)).context).toContain("Metformina 850 te alcanza ~7 días");
});

test("lo que se come sale de la despensa: convertir, por confirmar, borrar devuelve, «no era de la casa»", () => {
  const W = I.draft(I.emptyState());
  const c = ctxAt(D(2026, 10, 22, 9));
  const huevos = I.agregar(W, { nombre: "Huevos", cantidad: 12 }, c).id!;
  const arroz = I.agregar(W, { nombre: "Arroz", cantidad: 1, unidad: "kg" }, c).id!;
  const leche = I.agregar(W, { nombre: "Leche", cantidad: 2, unidad: "u", contenido: { cant: 1, unidad: "L" } }, c).id!;
  I.agregar(W, { nombre: "Quesillo", cantidad: 1 }, c);
  // la primera vez solo se activa: lo de antes no se descuenta
  const antes = [{ key: "a", name: "Huevo entero", grams: 110, at: "2026-10-22T08:00:00.000Z" }];
  expect(I.procesarComidas(W, antes, c).descontadas).toEqual([]);
  const c2 = ctxAt(D(2026, 10, 22, 13));
  const hoy = [...antes,
    { key: "b", name: "Huevo entero", grams: 110, at: c2.now.toISOString() },
    { key: "c", name: "Arroz blanco cocido", grams: 200, at: c2.now.toISOString() },
    { key: "d", name: "Leche descremada", grams: 250, at: c2.now.toISOString() },
    { key: "e", name: "Quesillo", grams: 60, at: c2.now.toISOString() },
    { key: "f", name: "Pechuga de pollo", grams: 150, at: c2.now.toISOString() }];
  const r = I.procesarComidas(W, hoy, c2);
  expect(r.descontadas.map((x) => `${x.item}:${x.delta}`)).toEqual(["Huevos:2", "Arroz:0.08", "Leche:0.25"]);
  expect(r.pendientes).toBe(1); // el quesillo: no se sabe cuánto pesa una unidad
  expect(W.items.find((i) => i.id === huevos)!.cantidad).toBe(10);
  expect(W.items.find((i) => i.id === arroz)!.cantidad).toBe(0.92);
  // otra vez lo mismo: no descuenta dos veces
  expect(I.procesarComidas(W, hoy, c2).descontadas).toEqual([]);
  // borró el huevo en Nutrición: vuelve
  const r2 = I.procesarComidas(W, hoy.filter((x) => x.key !== "b"), c2);
  expect(r2.devueltas).toBe(1);
  expect(W.items.find((i) => i.id === huevos)!.cantidad).toBe(12);
  // por confirmar: media unidad de quesillo
  expect(I.resolverPendiente(W, "e", 0.5, "u", c2).ok).toBe(true);
  expect(W.nutri!.pendientes.length).toBe(0);
  // «lo comí fuera»: la leche vuelve
  const movLeche = W.nutri!.movs["d"];
  expect(I.noEraDeLaCasa(W, movLeche).ok).toBe(true);
  expect(W.items.find((i) => i.id === leche)!.cantidad).toBe(2);
  // apagado: no descuenta
  I.ajustarDescuentoComida(W, false);
  expect(I.procesarComidas(W, [...hoy, { key: "g", name: "Huevo", grams: 55, at: c2.now.toISOString() }], c2).descontadas).toEqual([]);
});

test("la boleta: cada producto con su cantidad, contenido, área y precio", () => {
  const l = (d: string, monto: number, extra: any = {}) => { const x = I.lineaDeBoleta({ desc: d, monto, ...extra }); return [x.nombre, x.area, x.cantidad, x.unidad, x.contenido ? `${x.contenido.cant}${x.contenido.unidad}` : "", x.precioTotal, x.incluir]; };
  expect(l("LECHE DESC COLUN 1L", 2580, { cant: 2, unit: 1290, cat: "alimentacion" })).toEqual(["Leche descremada colun 1l", "alimentos", 2, "u", "1L", 2580, true]);
  expect(l("PALTA HASS GRANEL", 1591, { cant: 0.532, unit: 2990, cat: "alimentacion" })).toEqual(["Palta hass granel", "alimentos", 0.532, "kg", "", 1591, true]);
  expect(l("DETERGENTE OMO 3L", 8990, { cat: "hogar" })).toEqual(["Detergente omo 3l", "limpieza", 1, "u", "3L", 8990, true]);
  expect(l("BOLSA PLASTICA", 30, { cat: "otros" })[6]).toBe(false);
  expect(l("GALLETA TRITON 126G", 990, { cat: "alimentacion" })).toEqual(["Galleta triton 126g", "despensa", 1, "u", "126g", 990, true]);
  expect(l("ARTICULO VARIOS", 1990, { cat: "otros" })).toEqual(["Articulo varios", null, 1, "u", "", 1990, false]);
});

test("la boleta se suma a lo que ya tienes (sin duplicar), en su unidad", () => {
  const W = I.draft(I.emptyState());
  const c = ctxAt(D(2026, 10, 22));
  I.agregar(W, { nombre: "Shampoo", cantidad: 0.5 }, c);
  I.agregar(W, { nombre: "Leche descremada", cantidad: 2, unidad: "L" }, c);
  I.agregar(W, { nombre: "Palta", cantidad: 1 }, c);
  const d = (desc: string, extra: any = {}) => { const l = I.lineaDeBoleta({ desc, monto: 1000, ...extra }); const x = I.destinoBoleta(W, l); return x ? `${x.item.nombre}:${x.cantidad}${x.unidad}` : null; };
  expect(I.lineaDeBoleta({ desc: "LECHE DESC COLUN 1L", monto: 1290 }).nombre).toBe("Leche descremada colun 1l");
  expect(I.lineaDeBoleta({ desc: "YOG NAT S/AZ 4X125G", monto: 1990 }).nombre).toBe("Yogur natural sin azúcar 4x125g");
  expect(d("SHAMPOO SEDAL 340ML")).toBe("Shampoo:1u");
  expect(d("LECHE DESC COLUN 1L", { cant: 2 })).toBe("Leche descremada:2L");
  expect(d("PALTA HASS GRANEL", { cant: 0.532 })).toBe("Palta:4u");
  expect(d("ARROZ TUCAPEL 1KG")).toBeNull(); // no tienes arroz: es nuevo
});

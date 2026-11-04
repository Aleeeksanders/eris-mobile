// Inventario (fase I2, 2026-10-22): el núcleo.
import { test, expect } from "bun:test";
import * as I from "C:/Proyectos/eris-mobile/src/services/inventory/inventoryCore.ts";

const now = new Date(2026, 9, 22, 12);
let id = 100;
const ctx = { now, newId: () => ++id };

test("cantidades dichas en texto", () => {
  const p = (s: string) => { const c = I.parseCantidad(s); return c ? [c.cant, c.unidad, c.contenido ? `${c.contenido.cant}${c.contenido.unidad}` : "", c.resto] : null; };
  expect(p("2 L de leche")).toEqual([2, "L", "", "leche"]);
  expect(p("6 huevos")).toEqual([6, "u", "", "huevos"]);
  expect(p("media docena de huevos")).toEqual([6, "u", "", "huevos"]);
  expect(p("un kilo de arroz")).toEqual([1, "kg", "", "arroz"]);
  expect(p("2 paquetes de fideos de 400 g")).toEqual([2, "paquete", "400g", "fideos"]);
  expect(p("una leche de 1 litro")).toEqual([1, "u", "1L", "leche"]);
  expect(p("500g de queso")).toEqual([500, "g", "", "queso"]);
  expect(p("medio kilo de pan")).toEqual([0.5, "kg", "", "pan"]);
  expect(p("un shampoo")).toEqual([1, "u", "", "shampoo"]);
  expect(p("1,5 litros de bebida")).toEqual([1.5, "L", "", "bebida"]);
  expect(p("leche")).toBeNull();
});

test("a qué área va cada cosa", () => {
  const a = (s: string) => I.areaPara(s);
  expect(a("Leche descremada")).toBe("alimentos");
  expect(a("arroz grado 1")).toBe("despensa");
  expect(a("Shampoo Head & Shoulders")).toBe("bano");
  expect(a("papel higiénico")).toBe("bano");
  expect(a("cloro")).toBe("limpieza");
  expect(a("Paracetamol 500 mg")).toBe("botiquin");
  expect(a("Creatina monohidratada")).toBe("botiquin");
  expect(a("calcetines")).toBe("ropa");
  expect(a("alimento para perro")).toBe("mascotas");
  expect(a("atún en agua")).toBe("despensa");
  expect(a("taladro")).toBeNull();
});

test("agregar suma a lo que hay (sin duplicar), convierte unidades y guarda el precio por unidad", () => {
  const W = I.draft(I.emptyState());
  const r = I.agregar(W, { nombre: "leche", cantidad: 2, unidad: "u", contenido: { cant: 1, unidad: "L" }, precioTotal: 2400, vence: "2026-10-30" }, ctx);
  expect(r.ok).toBe(true);
  expect(r.msg).toBe("Leche agregado: 2 unidades de 1 L en Alimentos");
  const leche = W.items[0];
  expect(leche.precio).toBe(1200);
  // 2 L más = 2 cajas más; vence la más próxima
  expect(I.agregar(W, { nombre: "Leches", cantidad: 2, unidad: "L", vence: "2026-11-05" }, ctx).msg).toBe("Leche: ahora tienes 4 unidades de 1 L");
  expect(W.items.length).toBe(1);
  expect(W.items[0].vence).toBe("2026-10-30");
  // 1 kg de algo que se cuenta en cajas de 1 L: no se puede convertir
  expect(I.agregar(W, { nombre: "leche", cantidad: 1, unidad: "kg" }, ctx).ok).toBe(false);
  // sin área conocida: se pide
  expect(I.agregar(W, { nombre: "taladro" }, ctx).msg).toBe("Elige en qué área va");
  expect(I.agregar(W, { nombre: "taladro", area: "objetos" }, ctx).ok).toBe(true);
});

test("consumir, contar, botar y deshacer", () => {
  const W = I.draft(I.emptyState());
  const leche = I.agregar(W, { nombre: "Leche", cantidad: 2, unidad: "u", contenido: { cant: 1, unidad: "L" } }, ctx).id!;
  expect(I.consumir(W, leche, 500, "ml", ctx).msg).toBe("Leche: te quedan 1,5 unidades de 1 L");
  expect(I.consumir(W, leche, null, null, ctx).msg).toBe("Leche: te quedan 0,5 unidades de 1 L");
  expect(I.consumir(W, leche, 3, "u", ctx).msg).toBe("Leche: se acabó (tenías 0,5 unidades de 1 L)");
  expect(I.consumir(W, leche, 1, "u", ctx).ok).toBe(false);
  const arroz = I.agregar(W, { nombre: "arroz", cantidad: 2, unidad: "kg" }, ctx).id!;
  expect(I.consumir(W, arroz, null, null, ctx).msg).toContain("¿Cuánto arroz usaste?");
  expect(I.consumir(W, arroz, 300, "g", ctx).msg).toBe("Arroz: te quedan 1,7 kg");
  const aj = I.ajustar(W, arroz, 1, "kg", ctx);
  expect(aj.msg).toBe("Arroz: ahora 1 kg");
  expect(I.deshacer(W, aj.movId!).msg).toBe("Arroz: deshecho, quedan 1,7 kg");
  const b = I.botar(W, arroz, 200, "g", "vencido", ctx);
  expect(b.msg).toBe("Arroz: 0,2 kg a la basura; quedan 1,5 kg");
  // deshacer lo que lo creó (sin más movimientos) lo saca
  const pan = I.agregar(W, { nombre: "pan", cantidad: 4 }, ctx);
  expect(I.deshacer(W, pan.movId!).msg).toBe("Pan: deshecho (ya no está)");
  expect(W.items.some((i) => i.nombre === "Pan")).toBe(false);
  // el historial cuadra con la cantidad
  const h = I.historial(W, arroz);
  expect(Math.round(h.reduce((a, m) => a + m.delta, 0) * 1000) / 1000).toBe(W.items.find((i) => i.id === arroz)!.cantidad);
});

test("por vencer, lo que falta, la lista de compras con precio y la revisión de la semana", () => {
  const W = I.draft(I.emptyState());
  I.agregar(W, { nombre: "yogur", cantidad: 4, vence: "2026-10-24", precioTotal: 2000 }, ctx);
  I.agregar(W, { nombre: "jamón", cantidad: 200, unidad: "g", vence: "2026-10-21" }, ctx);
  I.agregar(W, { nombre: "arroz", cantidad: 1, unidad: "kg", vence: "2027-05-01" }, ctx);
  const sh = I.agregar(W, { nombre: "shampoo", cantidad: 1, precioTotal: 3990, minimo: 1 }, ctx).id!;
  const pv = I.porVencer(W, now, 7);
  expect(pv.map((v) => `${v.item.nombre}:${v.dias}`)).toEqual(["Jamón:-1", "Yogur:2"]);
  // shampoo: 1 con mínimo 1 → poco; lo compras de a 1 a $3.990
  let L = I.listaCompras(W);
  expect(L.auto.map((f) => `${f.item.nombre}:${f.estado}:${f.sugerida}:${f.costo}`)).toEqual(["Shampoo:poco:1:3990"]);
  I.consumir(W, sh, null, null, ctx);
  I.anotarCompra(W, "Pilas AA", 4, "u", ctx);
  I.anotarCompra(W, "shampoo", null, null, ctx); // ya sale solo: no se duplica en la lista
  L = I.listaCompras(W);
  expect(L.auto[0].estado).toBe("acabado");
  expect(L.manual.map((c) => c.nombre)).toEqual(["Pilas AA"]);
  expect(L.total).toBe(3990);
  expect(L.sinPrecio).toBe(1);
  // la ropa no se «acaba»
  const pol = I.agregar(W, { nombre: "polera blanca", cantidad: 1 }, ctx).id!;
  I.ajustar(W, pol, 0, null, ctx);
  expect(I.faltantes(W).some((f) => f.item.nombre === "Polera blanca")).toBe(false);
  // revisión: lo contado hoy no se pide; a la semana sí
  expect(I.revision(W, now).length).toBe(0);
  expect(I.revision(W, new Date(2026, 9, 30, 12)).map((i) => i.nombre).sort()).toEqual(["Arroz", "Jamón", "Yogur"]);
  // comprar lo que estaba en la lista lo saca
  I.agregar(W, { nombre: "pilas aa", area: "objetos", cantidad: 4 }, ctx);
  expect(I.listaCompras(W).manual.length).toBe(0);
});

test("chat: compré, usé, se acabó, ¿tengo?, la lista y deshacer", () => {
  let S = I.emptyState();
  const run = (op: any) => { const r = I.applyOp(S, op, ctx); S = r.state; return r.result; };
  let r = run({ action: "compra", producto: "leche", cantidad: 2, unidad: "L" });
  expect(r.ok).toBe(true);
  expect(r.data).toMatchObject({ nombre: "Leche", area: "Alimentos", cantidad: "2 L", nuevo: true });
  expect(run({ action: "compra", producto: "taladro" }).code).toBe("falta_area");
  expect(run({ action: "compra", producto: "arroz", cantidad: 1, unidad: "kg" }).ok).toBe(true);
  // «compré arroz» sin cantidad: lo de la última vez (1 kg), no 1 gramo
  r = run({ action: "compra", producto: "arroz" });
  expect(r.data.cantidad).toBe("2 kg");
  expect(r.data.supuesto).toBe(true);
  r = run({ action: "consumo", producto: "leches", cantidad: 500, unidad: "ml" });
  expect(r.data.cantidad).toBe("1,5 L");
  r = run({ action: "se_acabo", producto: "la leche" });
  expect(r.data.acabado).toBe(true);
  expect(run({ action: "consumo", producto: "leche" }).code).toBe("sin_stock");
  expect(run({ action: "consumo", producto: "palta" }).code).toBe("no_encontrado");
  r = run({ action: "consultar", producto: "arroz" });
  expect(r.data.items[0]).toMatchObject({ nombre: "Arroz", cantidad: "2 kg", hay: true });
  r = run({ action: "lista" });
  expect(r.data.auto.map((x: any) => x.nombre)).toEqual(["Leche"]);
  r = run({ action: "deshacer" });
  expect(r.data.msg).toBe("Leche: deshecho, quedan 1,5 L");
  r = run({ action: "quedan", producto: "arroz", cantidad: 0 });
  expect(r.data.hay).toBe(false);
  const ex = I.extract(S, now);
  expect(ex.context).toContain("## Inventario del usuario");
  expect(ex.context).toContain("Se acabó: Arroz");
  expect(ex.summary.comida.map((c: any) => c.nombre)).toEqual(["Leche"]);
});

test("un respaldo raro o roto se normaliza sin romper nada", () => {
  const S = I.normalizar({ items: [{ id: 1, nombre: " Leche ", area: "xx", cantidad: "-3", unidad: "litros" }, { nombre: "" }], movs: "no", ocultas: ["mascotas", "zzz"] });
  expect(S.items).toHaveLength(1);
  expect(S.items[0]).toMatchObject({ nombre: "Leche", area: "objetos", cantidad: 0, unidad: "u" });
  expect(S.movs).toEqual([]);
  expect(S.ocultas).toEqual(["mascotas"]);
  expect(I.normalizar(null)).toEqual(I.emptyState());
});

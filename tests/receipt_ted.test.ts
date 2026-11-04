// El timbre electrónico (TED) de una boleta: lo que lee la cámara → total, fecha, comercio, folio y clave sin duplicados.
import { test, expect } from "bun:test";
import { parseTimbre, esCompra, boletaAnotada } from "C:/Proyectos/eris-mobile/src/services/finance/receiptTed.ts";

// Timbre sintético con la estructura del SII (DD con RE/TD/F/FE/RR/RSR/MNT/IT1 + CAF con la razón social)
const ted = (o: { re?: string; td?: number; f?: number; fe?: string; mnt?: number; rs?: string; it1?: string; ts?: string } = {}) =>
  `<TED version="1.0"><DD><RE>${o.re ?? "76123456-7"}</RE><TD>${o.td ?? 39}</TD><F>${o.f ?? 4521337}</F><FE>${o.fe ?? "2026-10-15"}</FE>` +
  `<RR>66666666-6</RR><RSR>SIN RAZON SOCIAL</RSR><MNT>${o.mnt ?? 23480}</MNT><IT1>${o.it1 ?? "LECHE ENTERA 1L"}</IT1>` +
  `<CAF version="1.0"><DA><RE>${o.re ?? "76123456-7"}</RE><RS>${o.rs ?? "WALMART CHILE S A"}</RS><TD>${o.td ?? 39}</TD><RNG><D>1</D><H>9999999</H></RNG>` +
  `<FA>2026-01-02</FA><RSAPK><M>xyz</M><E>Aw==</E></RSAPK><IDK>100</IDK></DA><FRMA algoritmo="SHA1withRSA">abc=</FRMA></CAF>` +
  `<TSTED>${o.ts ?? "2026-10-15T18:42:07"}</TSTED></DD><FRMT algoritmo="SHA1withRSA">def=</FRMT></TED>`;

test("lee el timbre: total, fecha, hora, comercio, primer producto y clave", () => {
  const t = parseTimbre(ted())!;
  expect(t).toMatchObject({ rut: "76123456-7", tipo: 39, folio: 4521337, fecha: "2026-10-15", hora: "18:42", monto: 23480,
    razonSocial: "WALMART CHILE S A", comercio: "Lider", cat: "alimentacion", item1: "LECHE ENTERA 1L", clave: "dte:76123456-7:39:4521337" });
  expect(esCompra(t)).toBe(true);
});

test("comercios: conocidos por nombre; los demás, nombre limpio sin la sociedad", () => {
  expect(parseTimbre(ted({ rs: "FARMACIAS CRUZ VERDE S.A." }))).toMatchObject({ comercio: "Cruz Verde", cat: "salud" });
  expect(parseTimbre(ted({ rs: "RENDIC HERMANOS S A" }))).toMatchObject({ comercio: "Unimarc", cat: "alimentacion" });
  expect(parseTimbre(ted({ rs: "COMPAÑIA DE PETROLEOS DE CHILE COPEC S A" }))).toMatchObject({ comercio: "Copec", cat: "transporte" });
  expect(parseTimbre(ted({ rs: "PANADERIA LA ESPIGA LIMITADA" }))).toMatchObject({ comercio: "Panaderia La Espiga", cat: "alimentacion" });
  expect(parseTimbre(ted({ rs: "INVERSIONES PEREZ Y CIA LTDA" }))).toMatchObject({ comercio: "Inversiones Perez", cat: "otros" });
  expect(parseTimbre(ted({ rs: "S&amp;P COMERCIAL SPA" }))?.comercio).toBe("S&p Comercial");
});

test("no es un timbre o no es una compra", () => {
  expect(parseTimbre("7802820005455")).toBeNull();                 // un código de barras de producto
  expect(parseTimbre("https://www.sii.cl/")).toBeNull();
  expect(parseTimbre(ted({ re: "no-es-rut" }))).toBeNull();
  expect(parseTimbre(ted({ fe: "15/10/2026" }))).toBeNull();
  const nc = parseTimbre(ted({ td: 61 }))!;
  expect(esCompra(nc)).toBe(false);                                // nota de crédito: no es un gasto
  // espacios y saltos de línea entre etiquetas (algunos lectores los agregan)
  expect(parseTimbre(ted().replace(/></g, ">\n  <"))?.monto).toBe(23480);
});

test("la misma boleta no se anota dos veces", () => {
  const t = parseTimbre(ted())!;
  const tx = [{ id: 1, tipo: "gasto", fecha: "2026-10-15", monto: 23480, desc: "Lider", boleta: { clave: t.clave, folio: t.folio } }];
  expect(boletaAnotada(tx, t.clave)).toEqual({ fecha: "2026-10-15", monto: 23480, desc: "Lider" });
  expect(boletaAnotada(tx, parseTimbre(ted({ f: 4521338 }))!.clave)).toBeNull();
});

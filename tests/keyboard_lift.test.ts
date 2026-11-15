// Cuánto subir una hoja (Modal) sobre el teclado (2026-11-15, «Ajustar saldo» tapado en Finanzas). Ver src/components/keyboardLiftCore.ts.
import { test, expect } from "bun:test";
import { altoParaSubir, FRACCION_ESTIMADA, type SenalesTeclado } from "../src/components/keyboardLiftCore";

const base: SenalesTeclado = { nativo: null, nativoFunciona: false, evento: 0, eventoFunciona: false, barra: 24, focoLargo: false, alto: 800 };

test("sin teclado y sin foco no se sube nada", () => {
  expect(altoParaSubir(base)).toBe(0);
  expect(altoParaSubir({ ...base, nativo: 0 })).toBe(0);
});

test("la medida nativa manda: ya trae la barra de abajo y sigue los cambios de teclado", () => {
  expect(altoParaSubir({ ...base, nativo: 330, nativoFunciona: true, evento: 280, eventoFunciona: true })).toBe(330);
  // del teclado de números al de letras: la nativa cambia, el evento de React Native no
  expect(altoParaSubir({ ...base, nativo: 300, nativoFunciona: true, evento: 360, eventoFunciona: true })).toBe(300);
  // se cerró el teclado
  expect(altoParaSubir({ ...base, nativo: 0, nativoFunciona: true, evento: 0, eventoFunciona: true, focoLargo: true })).toBe(0);
});

test("sin vista nativa, el evento de React Native más la barra de abajo (el evento viene sin ella)", () => {
  expect(altoParaSubir({ ...base, evento: 306, eventoFunciona: true })).toBe(330);
  expect(altoParaSubir({ ...base, evento: 0, eventoFunciona: true, focoLargo: true })).toBe(0);
});

test("ninguna señal responde y hay un campo con el foco: se estima, para que la hoja nunca quede tapada", () => {
  expect(altoParaSubir({ ...base, focoLargo: true })).toBe(Math.round(800 * FRACCION_ESTIMADA));
  expect(altoParaSubir({ ...base, nativo: 0, focoLargo: true })).toBe(360);
  // la primera señal real gana aunque todavía no se sepa si funciona
  expect(altoParaSubir({ ...base, nativo: 310, focoLargo: true })).toBe(310);
  expect(altoParaSubir({ ...base, evento: 290, focoLargo: true })).toBe(314);
});

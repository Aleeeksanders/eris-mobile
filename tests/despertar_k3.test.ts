// K3 (2026-11-16): la llamada pedida desde Hestia Manos (el botón del asistente) queda pendiente unos segundos, una sola vez, por si
// el chat aún no está montado. Y la marca de «llamada abierta» que mira App.tsx para no dejar Eris sobre la pantalla de bloqueo.
import { test, expect, mock } from "bun:test";

const emitidos: any[] = [];
mock.module("react-native", () => ({ DeviceEventEmitter: { emit: (e: string, o: any) => emitidos.push([e, o]), addListener: () => ({ remove() {} }) } }));
const { pedirLlamada, tomarLlamadaPendiente, llamadaAbierta, marcarLlamada } = await import("C:/Proyectos/eris-mobile/src/services/voz/despertar.ts");

test("la llamada pedida queda pendiente una vez, y vence", () => {
  pedirLlamada({ origen: "asistente", bloqueado: true });
  expect(emitidos.at(-1)).toEqual(["HESTIA_LLAMAR", { origen: "asistente", bloqueado: true }]);
  expect(tomarLlamadaPendiente()).toEqual({ origen: "asistente", bloqueado: true });
  expect(tomarLlamadaPendiente()).toBeNull(); // una sola vez
  const ahora = Date.now;
  try {
    pedirLlamada({ origen: "boton" });
    Date.now = () => ahora() + 31_000; // pasada su vigencia (30 s): ya no se abre
    expect(tomarLlamadaPendiente()).toBeNull();
  } finally { Date.now = ahora; }
});

test("la marca de llamada abierta", () => {
  expect(llamadaAbierta()).toBe(false);
  marcarLlamada(true);
  expect(llamadaAbierta()).toBe(true);
  marcarLlamada(false);
  expect(llamadaAbierta()).toBe(false);
});

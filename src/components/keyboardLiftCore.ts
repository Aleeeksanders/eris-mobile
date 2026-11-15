// ============================================================
// Cuánto subir una hoja (Modal) para que el teclado no la tape — la regla, pura (sin React Native) y con pruebas.
// Contexto: con la app «edge-to-edge» (Expo 54) la ventana de un Modal ya no se encoge con el teclado y las hojas de
// los formularios quedaban debajo de él (2026-11-15, «Ajustar saldo» en Finanzas). Hay tres señales, de mejor a peor:
//   1. nativo   — ImeWatcherView mide el teclado de la ventana del Modal (exacto; sigue los cambios de teclado).
//   2. evento   — los eventos de teclado de React Native (salen de la ventana de la actividad; quizás no lleguen).
//   3. estimado — si hay un campo con el foco y ninguna señal respondió, un alto típico, para que nunca quede tapada.
// ============================================================

/** Cuánto esperar una señal real antes de usar el estimado (el teclado tarda ~250–400 ms en aparecer). */
export const ESPERA_ESTIMADO_MS = 700;
/** El teclado de números con la barra de Android ocupa ~40 % de la pantalla y el de letras ~45 %: mejor que sobre. */
export const FRACCION_ESTIMADA = 0.45;

export interface SenalesTeclado {
  /** Alto que midió la vista nativa (dp desde el borde de abajo, con la barra de navegación); null si no hay vista. */
  nativo: number | null;
  /** ¿La vista nativa ya midió un teclado alguna vez? Entonces es la que manda. */
  nativoFunciona: boolean;
  /** Alto del último evento de teclado de React Native (dp, SIN la barra de navegación); 0 si está cerrado. */
  evento: number;
  /** ¿Llegó algún evento de teclado con una hoja abierta? */
  eventoFunciona: boolean;
  /** Alto de la barra de navegación de abajo (dp). */
  barra: number;
  /** ¿Hay un campo de texto con el foco hace al menos ESPERA_ESTIMADO_MS? */
  focoLargo: boolean;
  /** Alto de la ventana (dp). */
  alto: number;
}

/** Cuánto subir el borde de abajo de la hoja (dp, desde el borde de la pantalla). 0 = el teclado no está. */
export function altoParaSubir(s: SenalesTeclado): number {
  if (s.nativoFunciona) return Math.max(0, s.nativo ?? 0);
  if (s.eventoFunciona) return s.evento > 0 ? s.evento + Math.max(0, s.barra) : 0;
  if ((s.nativo ?? 0) > 0) return s.nativo!;
  if (s.evento > 0) return s.evento + Math.max(0, s.barra);
  return s.focoLargo ? Math.round(s.alto * FRACCION_ESTIMADA) : 0;
}

// Último estado del RPG de Forge (nivel, xp, streak, misiones) recibido vía
// TOJI_STATE_SYNC mientras el WebView de Toji estuvo montado. Vive en memoria
// (no persiste entre reinicios) — solo alimenta el chip "Analizar mi día de
// entrenamiento" de la burbuja global de Eris sin depender de que Forge siga
// abierto en pantalla.
let latest: any = null;

export const forgeStateCache = {
  set(state: any) { latest = state; },
  get(): any | null { return latest; },
};

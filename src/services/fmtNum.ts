// Números como se escriben en Chile: coma decimal («2,4 L»). Revisión N3 (2026-11-04): el agua salía con punto en Inicio
// y Nutrición y con coma en Métricas.
/** 2.45 → «2,5» (1 decimal; sin «,0»: 2 → «2») */
export const coma = (n: number, dec = 1) => String(Math.round((Number(n) || 0) * 10 ** dec) / 10 ** dec).replace('.', ',');

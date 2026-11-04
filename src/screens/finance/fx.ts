// ============================================================
// Finanzas 2.0 — la cara: oscura de siempre (morado y cian de Finanzas) con alma de terminal financiera.
// Números en monoespaciada, verde y rojo para lo que sube y baja, categorías como tickers (COMIDA ▲12 %).
// ============================================================
import { Platform } from 'react-native';
import { T } from '../../config/design';

export const FX = {
  bg: T.bg,
  panel: '#0b0a16',
  panelHi: '#100e20',
  line: 'rgba(124,58,237,0.18)',
  lineSoft: 'rgba(255,255,255,0.06)',
  violet: '#a78bfa',
  violetDeep: '#7c3aed',
  cyan: '#22d3ee',
  up: '#4ade80',      // sube lo bueno (ingresos, patrimonio)
  down: '#f87171',    // sube lo malo (gastos) o baja lo bueno
  gold: '#fbbf24',
  text: T.text,
  muted: '#6b6b9a',
  dim: '#46466e',
  mono: Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' }) as string,
};

/** $1.234.567 */
export const clp = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
/** $86,4K · $1,2M (para tickers y gráficos) */
export const clpK = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',')}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace('.', ',').replace(',0', '')}K`;
  return clp(n);
};
export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${clp(Math.abs(n))}`;
export const pct = (n: number) => `${n > 0 ? '▲' : n < 0 ? '▼' : '='}${Math.abs(n)}%`;

/** Las categorías con nombre claro y su "ticker". */
export const CAT: Record<string, { label: string; ticker: string; icon: string; color: string }> = {
  alimentacion: { label: 'Comida', ticker: 'COMIDA', icon: '🛒', color: '#fbbf24' },
  transporte: { label: 'Transporte', ticker: 'TRANSP', icon: '🚇', color: '#38bdf8' },
  vivienda: { label: 'Vivienda', ticker: 'VIVIEN', icon: '🏠', color: '#fb923c' },
  salud: { label: 'Salud', ticker: 'SALUD', icon: '💊', color: '#4ade80' },
  entretenimiento: { label: 'Ocio', ticker: 'OCIO', icon: '🎮', color: '#c084fc' },
  deuda: { label: 'Deudas', ticker: 'DEUDA', icon: '📉', color: '#f87171' },
  educacion: { label: 'Educación', ticker: 'EDUC', icon: '📚', color: '#22d3ee' },
  hogar: { label: 'Hogar y aseo', ticker: 'HOGAR', icon: '🧺', color: '#a3e635' },
  otros: { label: 'Otros', ticker: 'OTROS', icon: '•', color: '#94a3b8' },
};
export const catOf = (c?: string) => CAT[c || 'otros'] ?? CAT.otros;
export const CAT_ORDER = ['alimentacion', 'transporte', 'vivienda', 'hogar', 'salud', 'entretenimiento', 'educacion', 'deuda', 'otros'];

export const TIPO_CUENTA: Record<string, { icon: string; label: string; color: string }> = {
  efectivo: { icon: '💵', label: 'Efectivo', color: '#4ade80' },
  debito: { icon: '🏦', label: 'Débito', color: '#22d3ee' },
  credito: { icon: '💳', label: 'Crédito', color: '#fbbf24' },
  ahorro: { icon: '🪙', label: 'Ahorro', color: '#a78bfa' },
};

// Los mismos bancos que reconocen los avisos (bankNotif.BANCOS; revisión F5: faltaban Ripley, Security, Consorcio, Coopeuch, Global66, Prex y La Polar)
export const BANCOS = ['Banco Estado', 'Banco de Chile', 'Santander', 'BCI', 'Scotiabank', 'Banco Falabella', 'Banco Edwards', 'BICE', 'Banco Internacional', 'Itaú', 'Banco Ripley', 'Banco Security', 'Consorcio', 'Coopeuch', 'Mercado Pago', 'Tenpo', 'MACH', 'Global66', 'Prex', 'La Polar', 'Otro'];

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MES_CORTO = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
/** "30 oct" */
export const fechaCorta = (f: string) => { const [, m, d] = f.split('-').map(Number); return `${d} ${MESES[(m || 1) - 1].slice(0, 3)}`; };

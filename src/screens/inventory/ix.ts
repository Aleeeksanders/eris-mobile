// ============================================================
// Inventario — la cara: oscura como el resto de Eris, con el verde azulado de una despensa ordenada. Ámbar para lo que se
// vence pronto, rojo para lo vencido o acabado, verde para lo que está bien. Cantidades en monoespaciada.
// ============================================================
import { Platform } from 'react-native';
import { T } from '../../config/design';
import type { AreaId } from '../../services/inventory/inventoryCore';

export const IX = {
  bg: T.bg,
  panel: '#07110f',
  panelHi: '#0b1916',
  line: 'rgba(45,212,191,0.18)',
  lineSoft: 'rgba(255,255,255,0.06)',
  teal: '#2dd4bf',
  tealDeep: '#0d9488',
  amber: '#fbbf24',
  red: '#f87171',
  green: '#4ade80',
  text: T.text,
  muted: '#5f8c84',
  dim: '#3d625b',
  mono: Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' }) as string,
};

/** El color de cada área (las tarjetas y los chips). */
export const AREA_COLOR: Record<AreaId, string> = {
  alimentos: '#4ade80', despensa: '#fbbf24', bano: '#38bdf8', limpieza: '#a3e635',
  botiquin: '#f472b6', ropa: '#c084fc', objetos: '#94a3b8', mascotas: '#fb923c',
};

export const clp = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** "30 oct" */
/**
 * El día LOCAL de una hora ISO («2026-11-04T23:30:00Z» → «2026-11-04» en Chile). Revisión K1 (2026-11-04): el historial
 * cortaba la hora UTC, así que lo hecho después de las 21:00 salía como de mañana.
 */
export const diaLocal = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fechaCorta = (f: string) => { const [, m, d] = f.split('-').map(Number); return `${d} ${MESES[(m || 1) - 1]}`; };
/** «vence hoy», «vence en 3 días», «venció hace 2 días» */
export const venceTxt = (d: number) => (d < 0 ? `venció hace ${-d} día${d === -1 ? '' : 's'}` : d === 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence en ${d} días`);
export const venceColor = (d: number) => (d < 0 ? IX.red : d <= 2 ? IX.amber : IX.muted);

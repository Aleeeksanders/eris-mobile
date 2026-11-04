// ============================================================
// Forge 2.0 — la cara: la misma del HTML (oscuro, rojo y dorado, Teko para los números y Rajdhani para el texto).
// Las fuentes vienen del HTML (woff2 → ttf en assets/fonts) y se cargan al abrir Forge (useForgeFonts).
// ============================================================
import { useEffect, useState } from 'react';
import * as Font from 'expo-font';

export const FG = {
  bg: '#0c0b0e',
  panel: '#15131a',
  panel2: '#141019',
  panel3: '#1a1622',
  line: '#221e29',
  line2: '#2a2630',
  line3: '#3a3542',
  red: '#ff3b4e',
  redDeep: '#d92d3c',
  gold: '#f5c542',
  orange: '#f5a623',
  coral: '#ff7a4e',
  green: '#3ddc97',
  greenDeep: '#2a9d6f',
  blue: '#56b3ff',
  pink: '#ff6b78',
  purple: '#c77dff',
  text: '#ece8e4',
  white: '#ffffff',
  muted: '#9b93a5',
  dim: '#6f6878',
  dimmer: '#544c5a',
};

export const FONT = {
  display: 'Teko-SemiBold',
  displayBold: 'Teko-Bold',
  displayMed: 'Teko-Medium',
  body: 'Rajdhani-SemiBold',
  bodyMed: 'Rajdhani-Medium',
  bodyBold: 'Rajdhani-Bold',
};

let loaded = false;
let loading: Promise<void> | null = null;
export function loadForgeFonts(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = Font.loadAsync({
      'Teko-Medium': require('../../../assets/fonts/Teko-Medium.ttf'),
      'Teko-SemiBold': require('../../../assets/fonts/Teko-SemiBold.ttf'),
      'Teko-Bold': require('../../../assets/fonts/Teko-Bold.ttf'),
      'Rajdhani-Medium': require('../../../assets/fonts/Rajdhani-Medium.ttf'),
      'Rajdhani-SemiBold': require('../../../assets/fonts/Rajdhani-SemiBold.ttf'),
      'Rajdhani-Bold': require('../../../assets/fonts/Rajdhani-Bold.ttf'),
    }).then(() => { loaded = true; }).catch(() => { loaded = true; }); // sin fuentes, se ve con la del sistema
  }
  return loading;
}

export function useForgeFonts(): boolean {
  const [ok, setOk] = useState(loaded);
  useEffect(() => { if (!ok) loadForgeFonts().then(() => setOk(true)); }, []);
  return ok;
}

/** 1.234 */
export const n0 = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
/** 7,5 */
export const dec = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString().replace('.', ',');

/** 17/10 · 17/10/2026 */
export const fmtDay = (k: string, year = true) => { const [y, mo, da] = k.split('-'); return year ? `${da}/${mo}/${y}` : `${da}/${mo}`; };
const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fmtFull = (k: string) => { const [y, mo, da] = k.split('-'); const d = new Date(+y, +mo - 1, +da); return { dn: DOW[d.getDay()], label: `${+da} ${MON[+mo - 1]} ${y}` }; };
export const dayKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

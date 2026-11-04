// Finanzas 2.0 — el estado vivo del store y lo calculado (se recalcula solo cuando cambia algo o pasa el minuto).
import { useEffect, useMemo, useState } from 'react';
import { financeStore } from '../../services/finance/financeStore';
import { resumen, tablero, atajos, rating, type FinanceState } from '../../services/finance/financeCore';

export function useFinanceState(): FinanceState | null {
  const [S, setS] = useState<FinanceState | null>(financeStore.get());
  useEffect(() => {
    financeStore.load().then(setS).catch(() => {});
    return financeStore.subscribe(setS);
  }, []);
  return S;
}

/** Lo que muestran las pantallas, calculado por el núcleo. `tick` cambia cada minuto (cambio de día, "lo esperable a hoy"). */
export function useFinanceView(S: FinanceState | null) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60_000); return () => clearInterval(t); }, []);
  return useMemo(() => {
    if (!S) return null;
    const now = new Date();
    return { now, R: resumen(S, now), T: tablero(S, now), atajos: atajos(S, now), Rt: rating(S, now) };
  }, [S, tick]);
}

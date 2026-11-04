// Inventario — el estado vivo del store y lo calculado (se recalcula cuando cambia algo o pasa el minuto: cambio de día).
import { useEffect, useMemo, useState } from 'react';
import { inventoryStore } from '../../services/inventory/inventoryStore';
import { porVencer, listaCompras, revision, resumenAreas, type InventoryState } from '../../services/inventory/inventoryCore';

export function useInventoryState(): InventoryState | null {
  const [S, setS] = useState<InventoryState | null>(inventoryStore.get());
  useEffect(() => {
    inventoryStore.load().then(setS).catch(() => {});
    return inventoryStore.subscribe(setS);
  }, []);
  return S;
}

export function useInventoryView(S: InventoryState | null) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60_000); return () => clearInterval(t); }, []);
  return useMemo(() => {
    if (!S) return null;
    const now = new Date();
    return { now, vence: porVencer(S, now, 7), lista: listaCompras(S), revision: revision(S, now), areas: resumenAreas(S, now) };
  }, [S, tick]);
}

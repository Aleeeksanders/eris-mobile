// Forge nativo: el estado vivo y una forma única de cambiarlo (funciones puras del núcleo → forgeStore).
import { useCallback, useEffect, useState } from 'react';
import { forgeStore } from '../../services/forge/forgeStore';
import type { ForgeState } from '../../services/forge/forgeCore';

export function useForgeState(): ForgeState | null {
  const [S, setS] = useState<ForgeState | null>(forgeStore.get());
  useEffect(() => {
    const off = forgeStore.subscribe(setS);
    forgeStore.load().then(setS).catch(() => {});
    return off;
  }, []);
  return S;
}

export function useForgeRoutine() {
  const [r, setR] = useState(forgeStore.getRoutine());
  useEffect(() => forgeStore.subscribe(() => setR(forgeStore.getRoutine())), []);
  return r;
}

export type ForgeAct = (fn: (s: ForgeState) => ForgeState, why?: string) => Promise<ForgeState | null>;
export function useForgeAct(): ForgeAct {
  return useCallback((fn, why) => forgeStore.update(fn, why), []);
}

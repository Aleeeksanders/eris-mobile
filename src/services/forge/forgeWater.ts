// ============================================================
// Eris Mobile — la meta de agua de Forge = la de Inicio (revisión E1, 2026-11-04)
//
// Forge calculaba su propia meta (forgeLegacy.hydrationOf, código generado del HTML): sumaba el bono del nivel aunque ya
// se respondiera «¿Entrenas hoy?», no sumaba el agua del entreno planificado y no tenía tope. Inicio muestra la del
// servidor (eris/src/services/DailyTargets.ts → «Agua»). Acá está la MISMA regla:
//   - meta fijada en Perfil → esa;
//   - con el día respondido (y basal, y sin kcal fijadas) → 35 ml/kg + el mayor entre las series de hoy, el reloj y lo
//     planificado, por la regla médica (SGLT2 +30 %…), de a 50 ml;
//   - sin responder → lo de siempre (peso + bono del nivel + lo que pase de él);
//   - nunca más de 6 L.
// ============================================================
import * as L from './forgeLegacy';

export interface AguaForge { base: number; train: number; total: number; cups: number; note?: string | null; off?: boolean; fijada?: boolean }

export function aguaForge(S: any, todaySets: number, watchAct: any, o: {
  intent: { answer: 'si' | 'no'; waterMl?: number } | null | undefined;
  ghostExpired: boolean;
  bmr: number | null | undefined;
  fijadas?: { waterLiters?: number; calories?: number } | null;
}): AguaForge | null {
  const h = L.hydrationOf(S, todaySets, watchAct) as AguaForge | null;
  if (!h || h.off) return h;
  const r50 = (x: number) => Math.round(x / 50) * 50;
  const tope = (ml: number) => Math.min(6000, ml);
  const f = o.fijadas || {};
  if (Number(f.waterLiters) > 0) {
    const t = Math.round(Number(f.waterLiters) * 1000);
    return { ...h, base: t, train: 0, total: t, cups: Math.round(t / 250), fijada: true };
  }
  if (!(o.intent && o.bmr && !(Number(f.calories) > 0))) { const t = tope(h.total); return { ...h, total: t, cups: Math.round(t / 250) }; }
  const baseMl = (S.bodyKg ?? 0) * 35;
  const setsMl = Math.round(((Number(todaySets) || 0) * 2.5) / 60 * 600);
  const plannedMl = o.intent.answer === 'si' && !o.ghostExpired ? o.intent.waterMl ?? 0 : 0;
  const trainMl = Math.max(setsMl, L.watchWaterMl(watchAct), plannedMl);
  const total = tope(r50((baseMl + trainMl) * ((L.forgeEnv.waterRule || {}).multiplier || 1)));
  return { ...h, base: r50(baseMl), train: trainMl, total, cups: Math.round(total / 250) };
}

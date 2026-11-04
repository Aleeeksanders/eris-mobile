// ============================================================
// Eris Mobile — la comida concreta de un aviso
//
// Los avisos de colación, fibra y proteína (reminderRules.ts) ya no dicen solo "te falta X, ¿te doy opciones?": le piden
// al servidor UNA comida concreta (eris/src/services/NudgeSuggest.ts), elegida por código con el perfil completo:
// restricciones, condiciones de salud, presupuesto, objetivo de Forge, lo que queda del día y lo que suele comer.
// Si no hay conexión o no hay una opción limpia, el aviso queda con su texto de siempre.
// ============================================================
import { wsManager } from './WebSocketManager';
import type { PlannedReminder } from './reminderRules';
import type { Tone } from './tone';

export interface NudgeSuggestion { id: string; name: string; text: string }

const TIMEOUT_MS = 2500;

/** Pide la sugerencia al servidor; null si no hay conexión, no responde a tiempo o no hay una opción. */
export function askNudge(suggest: NonNullable<PlannedReminder['suggest']>, eatenKcal: number, tone: Tone): Promise<NudgeSuggestion | null> {
  if (wsManager.getStatus() !== 'connected') return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = `nu_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let done = false;
    const finish = (r: NudgeSuggestion | null) => { if (done) return; done = true; clearTimeout(timer); unsub(); resolve(r); };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    const unsub = wsManager.subscribeMessage((d: any) => {
      if (d?.type !== 'nudge_suggestion' || d.requestId !== requestId) return;
      const s = d.suggestion;
      finish(s && typeof s.text === 'string' && s.text ? { id: String(s.id || ''), name: String(s.name || ''), text: s.text } : null);
    });
    wsManager.sendMessage({ type: 'nudge_suggest', requestId, ...suggest, eaten: { kcal: Math.round(eatenKcal) }, tone });
  });
}

/**
 * Pone la comida concreta en los avisos que la piden. Lo ya pedido hoy se guarda (el plan se recalcula cada vez que
 * anotas algo): la misma necesidad con el mismo faltante no se vuelve a preguntar.
 */
export class NudgeCache {
  private day = '';
  private cache = new Map<string, NudgeSuggestion | null>();

  async apply(plan: PlannedReminder[], today: string, eatenKcal: number, tone: Tone): Promise<PlannedReminder[]> {
    if (this.day !== today) { this.day = today; this.cache.clear(); }
    const keyOf = (s: NonNullable<PlannedReminder['suggest']>) => `${s.need}|${s.gapG ?? ''}|${s.forDinner ? 1 : 0}|${Math.round(eatenKcal / 200)}|${tone}`;
    const wanted = plan.filter((r) => r.suggest && r.id.includes(today));
    await Promise.all(wanted.map(async (r) => {
      const k = keyOf(r.suggest!);
      if (this.cache.has(k)) return;
      const s = await askNudge(r.suggest!, eatenKcal, tone).catch(() => null);
      if (s) this.cache.set(k, s); // si no llegó, se vuelve a intentar en la próxima pasada
    }));
    return plan.map((r) => {
      const s = r.suggest && r.id.includes(today) ? this.cache.get(keyOf(r.suggest)) : null;
      return s ? { ...r, body: s.text } : r;
    });
  }

  clear() { this.day = ''; this.cache.clear(); }
}

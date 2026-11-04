// ============================================================
// Eris Mobile — Finanzas nativa → lo que sabe Eris (Finanzas 2.0, F2)
// Con la versión web, el resumen para Eris salía de su WebView (hwExtract). Con la nativa sale del núcleo: cada cambio
// (o al reconectar) se manda el mismo contexto y los mismos números (update_financial_context) y se guarda para el
// Dashboard y los avisos. Al abrir la app también se anotan los fijos que ya llegaron a su día.
// ============================================================
import { financeStore } from './financeStore';
import { publishFinanceContext } from '../hwExtract';
import { AuthStorage } from '../AuthStorage';
import { wsManager } from '../WebSocketManager';

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const profileId = async () => (await AuthStorage.getCredentials().catch(() => null))?.profileId ?? null;

function publishSoon(ms = 1200) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    const ex = financeStore.extract();
    if (!ex) return;
    publishFinanceContext({ type: 'hw_context', context: ex.context, summary: ex.summary }, await profileId());
  }, ms);
}

export function startFinanceNative() {
  if (started) return;
  started = true;
  financeStore.setProfileSource(profileId);
  financeStore.subscribe((S) => { if (S) publishSoon(); });
  financeStore.load().then((S) => { if (S) { void financeStore.applyScheduled(); publishSoon(400); } }).catch(() => {});
  wsManager.subscribeMessage((d: any) => { if (d?.type === 'connected' && financeStore.get()) publishSoon(800); });
}

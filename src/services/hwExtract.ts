// ============================================================
// Eris Mobile — resumen de Finanzas para Eris
// Lo usan la pantalla de Finanzas (HunterWalletScreen) y el anfitrión invisible que aplica lo que Eris anota por chat
// (FinanceHeadlessHost): ambos leen el localStorage de hunter-wallet.html y le mandan el resumen al servidor.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wsManager } from './WebSocketManager';
import { DeviceEventEmitter } from 'react-native';
import { PLAN_REFRESH_EVENT } from './ErisNotifications';

// Pide a hunter-wallet.html su resumen (window.__hwExtract): el texto de contexto para Eris y los números del Dashboard
// se calculan ALLÁ, desde el libro único. Antes este archivo repetía las mismas cuentas (rangos, sueldo mínimo, sueldo
// = último ingreso…) leyendo el localStorage por su cuenta, y cualquier cambio en Finanzas había que hacerlo dos veces.
// Se inyecta después de que la página cargó (injectJavaScript en onLoadEnd / hw_ready).
export const HW_EXTRACT_JS = `
(function() {
  try {
    if (typeof window.__hwExtract !== 'function') return;
    var r = window.__hwExtract();
    if (r && r.context) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'hw_context', context: r.context, summary: r.summary }));
  } catch(e) {}
})();
true;
`;

/**
 * La tasa de ahorro sin gastos anotados sale 100 %: solo cuenta si hubo movimientos en la última semana. (El servidor aplica
 * la misma regla antes de guardarla en el resumen del día.) Resúmenes de antes de 1.26 no traen `ultimoMovimiento`: se usan tal cual.
 */
export function freshSavingsRate(summary: any): number | undefined {
  if (!summary || typeof summary.savingsRate !== 'number') return undefined;
  if (!('ultimoMovimiento' in summary)) return summary.savingsRate;
  const last = summary.ultimoMovimiento;
  if (typeof last !== 'string') return undefined;
  return Date.now() - Date.parse(`${last}T12:00:00`) <= 7 * 86_400_000 ? summary.savingsRate : undefined;
}

/** Manda al servidor el resumen que armó HW_EXTRACT_JS y lo guarda para el Dashboard. */
export function publishFinanceContext(msg: any, profileId: string | null) {
  if (msg?.type !== 'hw_context' || !msg.context) return;
  wsManager.sendMessage({ type: 'update_financial_context', context: msg.context, summary: msg.summary });
  // Persistido por perfil para que Dashboard pueda mostrar un resumen sin tener que abrir Finanzas.
  if (msg.summary && profileId) {
    AsyncStorage.setItem(`finance_summary_${profileId}`, JSON.stringify({ ...msg.summary, updatedAt: new Date().toISOString() }))
      .then(() => DeviceEventEmitter.emit(PLAN_REFRESH_EVENT)) // los avisos de Finanzas se recalculan con esto
      .catch(() => {});
  }
}

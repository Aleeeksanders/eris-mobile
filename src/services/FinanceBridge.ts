// ============================================================
// Eris Mobile — FinanceBridge
// Lo que Eris anota por chat ("gasté 5 lucas en almuerzo con la BCI") llega del servidor como {type:'finance_op'}. Los
// datos de Finanzas viven en el localStorage de hunter-wallet.html (su WebView), así que la operación se aplica ahí:
//  - con Finanzas abierta, en esa misma pantalla (se ve el cambio al tiro);
//  - si no, en una copia invisible que se abre en segundo plano (FinanceHeadlessHost) y se cierra sola.
// El resultado real (saldos, errores como "saldo insuficiente") vuelve al servidor con {type:'finance_op_result'}.
// ============================================================

import { financeStore } from './finance/financeStore';

export interface FinanceOpResult { ok: boolean; code?: string; msg?: string; opciones?: string[]; data?: any }

/** Inyecta operaciones en un WebView de Finanzas ya cargado. Devuelve false si no pudo (no hay pantalla). */
type Runner = (reqId: string, ops: any[]) => boolean;

// Menos que la espera del servidor (15 s): si el teléfono no alcanza, el servidor recibe un "no respondió" honesto.
const PHONE_TIMEOUT_MS = 12_000;

class FinanceBridgeImpl {
  private visible: Runner | null = null;
  private waiting = new Map<string, (r: FinanceOpResult) => void>();
  private queue: Array<{ reqId: string; ops: any[] }> = [];
  private hostWake: (() => void) | null = null;

  /** HunterWalletScreen se registra mientras está abierta y cargada. */
  setVisible(r: Runner | null) { this.visible = r; }
  /** FinanceHeadlessHost: cómo despertarlo cuando hay operaciones en cola. */
  setHostWake(fn: (() => void) | null) { this.hostWake = fn; }
  takeQueue() { const q = this.queue; this.queue = []; return q; }
  hasQueue() { return this.queue.length > 0; }

  /** Resultados que publicó hunter-wallet.html ({type:'hw_ops_result'}). */
  onResults(reqId: string, results: FinanceOpResult[]) {
    const w = this.waiting.get(reqId);
    if (!w) return;
    this.waiting.delete(reqId);
    w(Array.isArray(results) && results[0] ? results[0] : { ok: false, code: 'error', msg: 'Finanzas no devolvió resultado' });
  }

  /**
   * Finanzas nativa (2.0): si existe, la operación se aplica en el store del teléfono con las mismas reglas (financeCore);
   * si no, en la versión web como antes. Se espera a que cargue para no escribir nunca en la web después de migrar.
   */
  run(op: any): Promise<FinanceOpResult> {
    // El cuadre con el banco (Eris administra, A2) necesita «Por confirmar» del teléfono: se resuelve en financeCuadre
    if (op?.action === 'cuadre' || op?.action === 'saldo_banco') {
      return require('./finance/financeCuadre').financeCuadre.chatOp(op).catch(() => ({ ok: false, code: 'error', msg: 'No pude revisar el cuadre en el teléfono' }));
    }
    // Revisión F3 (2026-11-04): antes, cualquier error del libro nativo mandaba la operación a la versión web, que tiene el
    // libro de ANTES de migrar (la anotaba ahí, decía «listo» y en Finanzas no aparecía). La web queda solo para quien
    // todavía no migra; si el libro nativo falla o quedó ilegible, se responde el error.
    const NO_PUDE: FinanceOpResult = { ok: false, code: 'error', msg: 'No pude abrir Finanzas en el teléfono: no anoté nada. Inténtalo de nuevo en un momento.' };
    return financeStore.load()
      .then((S) => (S ? financeStore.apply(op).then((r) => r ?? { ok: false, code: 'error', msg: 'Finanzas no está lista' })
        : financeStore.danado() ? NO_PUDE : this.runWeb(op)))
      .catch(() => NO_PUDE);
  }

  private runWeb(op: any): Promise<FinanceOpResult> {
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(reqId);
        this.queue = this.queue.filter((q) => q.reqId !== reqId); // que no se aplique tarde, después de decir que no
        resolve({ ok: false, code: 'timeout', msg: 'Finanzas no respondió en el teléfono' });
      }, PHONE_TIMEOUT_MS);
      this.waiting.set(reqId, (r) => { clearTimeout(timer); resolve(r); });
      if (this.visible && this.visible(reqId, [op])) return;
      this.queue.push({ reqId, ops: [op] });
      this.hostWake?.();
    });
  }
}

export const financeBridge = new FinanceBridgeImpl();

/** JS para inyectar en el WebView de Finanzas. */
export const applyOpsJS = (reqId: string, ops: any[]) =>
  `window.__hwApplyOps && window.__hwApplyOps(${JSON.stringify(reqId)}, ${JSON.stringify(ops)}); true;`;

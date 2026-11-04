// ============================================================
// Eris Mobile — la foto de la boleta se lee en el PC (Finanzas 2.0, F4)
// La foto viaja al PC de Eris, se lee con el OCR de Windows (sin internet) y se borra al terminar; vuelven los
// productos, el total y si cuadran (eris/src/services/ReceiptOcr.ts). La persona revisa y anota todo de una vez.
// ============================================================
import { wsManager } from '../WebSocketManager';
import type { BoletaFoto } from './receiptTed';

const TIMEOUT_MS = 60_000;

export function leerBoletaEnPC(base64: string): Promise<BoletaFoto | { ok: false; msg: string }> {
  if (wsManager.getStatus() !== 'connected') return Promise.resolve({ ok: false, msg: 'Para leer la boleta necesito conexión con el PC de Eris.' });
  return new Promise((resolve) => {
    const requestId = `bol_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let done = false;
    const finish = (r: BoletaFoto | { ok: false; msg: string }) => { if (done) return; done = true; clearTimeout(timer); unsub(); resolve(r); };
    const timer = setTimeout(() => finish({ ok: false, msg: 'El PC no respondió a tiempo. Intenta de nuevo.' }), TIMEOUT_MS);
    const unsub = wsManager.subscribeMessage((d: any) => {
      if (d?.type !== 'finance_receipt_read' || d.requestId !== requestId) return;
      if (d.ok && Array.isArray(d.items)) {
        const { type: _t, requestId: _r, ...b } = d;
        finish(b as BoletaFoto);
      } else finish({ ok: false, msg: String(d.msg || 'No pude leer la boleta.') });
    });
    wsManager.sendMessage({ type: 'finance_receipt_photo', requestId, image: base64 });
  });
}

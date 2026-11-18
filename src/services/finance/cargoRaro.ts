// ============================================================
// Eris Mobile — ¿un cargo del banco fuera de lo común? (Hestia como JARVIS · L2, 2026-11-17)
//
// Para que Hestia pregunte «¿lo reconoces?» solo cuando vale la pena (si pregunta por cada café, deja de escucharse). Por
// código, con el libro de Finanzas:
//  - un comercio que nunca habías usado, desde $30.000;
//  - un comercio conocido, mucho más de lo que sueles gastar ahí (más de 2,5 veces lo más alto, desde $20.000);
//  - desde $150.000, si pasa en 1,5 veces lo más alto de ahí;
//  - nunca lo que calza con un gasto programado (el arriendo, una suscripción) ni lo que es menos de $10.000.
// Puro: se prueba sin el teléfono.
// ============================================================
import { foldTxt, type FinanceState, type Tx } from './financeCore';

export interface CargoRaro {
  /** la clave del aviso del banco */
  id: string;
  txId: Tx['id'] | null;
  monto: number;
  comercio: string;
  razon: string;
  /** quedó en «Por confirmar» (no se anotó solo) */
  porConfirmar: boolean;
}

export const RARO = { minimo: 10_000, nuevo: 30_000, conocido: 20_000, veces: 2.5, alto: 150_000, vecesAlto: 1.5 };

/** El nombre del comercio para la comparación: sin tildes, mayúsculas, números de sucursal ni «S.A.» */
const claveComercio = (s: unknown) => foldTxt(s).replace(/\b(s\.?a\.?|spa|ltda|limitada)\b/g, ' ').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** ¿Este gasto (de un aviso) es raro para él? null = normal. `excluir` = el movimiento recién anotado (no cuenta como historial). */
export function cargoRaro(p: { monto: number; desc?: string; comercio?: string }, S: FinanceState | null, excluir?: Tx['id'] | null): string | null {
  const monto = Math.round(Number(p.monto) || 0);
  if (!S || monto < RARO.minimo) return null;
  const k = claveComercio(p.desc || p.comercio);
  if (!k) return null;
  // un gasto programado con ese nombre y ese monto (±5 %): es lo de siempre
  const fijo = (S.prog ?? []).some((g) => g.tipo === 'gasto' && Math.abs(g.monto - monto) <= Math.max(500, g.monto * 0.05) && (claveComercio(g.desc).includes(k) || k.includes(claveComercio(g.desc))));
  if (fijo) return null;
  const antes = (S.tx ?? []).filter((t) => t.tipo === 'gasto' && t.id !== excluir && claveComercio(t.desc) === k).map((t) => t.monto).slice(-40);
  if (!antes.length) return monto >= RARO.nuevo ? 'un comercio nuevo' : null;
  const max = Math.max(...antes);
  if (monto >= RARO.conocido && monto > RARO.veces * max) return 'mucho más de lo que sueles gastar ahí';
  if (monto >= RARO.alto && monto > RARO.vecesAlto * max) return 'más de lo habitual ahí';
  return null;
}

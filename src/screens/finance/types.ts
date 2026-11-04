import type { FinanceState, Prog, Ref, Tx } from '../../services/finance/financeCore';
import type { BoletaFoto, Timbre } from '../../services/finance/receiptTed';
import type { Propuesta } from '../../services/finance/bankNotif';
import type { useFinanceView } from './useFinance';

/** El aviso del banco del que sale un gasto (financeInbox): al anotarlo se marca como hecho */
export interface NotifRef { clave: string; pkg: string; app: string; last4?: string; texto?: string; fuente?: 'banco' | 'cartola' }

/** Las secciones de Finanzas (2026-10-16: «más claro: dónde hacer cada cosa») */
export type Seccion = 'hoy' | 'movs' | 'cuentas' | 'plan' | 'analisis';

export type SheetState =
  | { k: 'gasto'; preset?: { desc?: string; cat?: string; cuenta?: Ref | null; monto?: number; fecha?: string; notif?: NotifRef }; foto?: boolean }
  | { k: 'entrada' }
  | { k: 'mov'; tipo: 'giro' | 'transfer' | 'pago' | 'ajuste'; ref?: Ref | null }
  | { k: 'cuenta' } | { k: 'ahorro' } | { k: 'prestamo' } | { k: 'sueldo' } | { k: 'meta' }
  | { k: 'prog'; tipo: 'gasto' | 'ingreso' }
  | { k: 'confirmar'; p: Prog & { fecha: string } }
  | { k: 'tx'; id: Tx['id'] }
  | { k: 'presup'; cat: string }
  /** la foto de la boleta ya leída: revisar y anotar todo de una vez (un gasto por categoría) */
  | { k: 'boleta'; leida: BoletaFoto; timbre: Timbre | null }
  /** el botón +: todo lo que se puede anotar, en un solo lugar */
  | { k: 'menu' }
  /** importar la cartola: elegir la cuenta */
  | { k: 'cartola' }
  /** ¿cómo hago…? */
  | { k: 'guia' }
  /** avisos del banco, respaldo, borrar todo */
  | { k: 'ajustes' }
  /** «tengo efectivo»: el efectivo existe solo si lo agregas */
  | { k: 'efectivo' }
  /** «Por ordenar»: asignarle su cuenta a lo anotado sin cuenta */
  | { k: 'asignar'; kind: 'tx' | 'prog'; id: unknown }
  /** «Por confirmar»: un aviso del banco que no es una compra (transferencia, plata que entró, giro, pago de tarjeta) */
  | { k: 'aviso'; p: Propuesta }
  /** «Cuadrar» una cuenta con lo que dice el banco (A2): el saldo del banco, por qué no calza y cómo arreglarlo */
  | { k: 'cuadrar'; ref: Ref | null };

export type View = NonNullable<ReturnType<typeof useFinanceView>>;
export interface Act { (fn: (W: FinanceState, ctx: { now: Date; newId: () => number }) => { ok: boolean; msg: string }): Promise<boolean> }

export interface TabProps {
  S: FinanceState;
  V: View;
  open: (s: SheetState) => void;
  act: Act;
  /** ir a otra sección */
  irA: (s: Seccion) => void;
  /** importar la cartola de una cuenta (CartolaImport) */
  importarCartola: (ref: Ref, nombre: string) => void;
  /** la cuenta cuya cartola se está leyendo */
  leyendoCartola: Ref | null;
}

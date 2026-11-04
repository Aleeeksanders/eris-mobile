// Inventario — las secciones, las hojas (formularios) y lo que recibe cada sección.
import type { AreaId, InventoryState, Unidad, Ctx, FormResult } from '../../services/inventory/inventoryCore';
import type { useInventoryView } from './useInventory';

/** Las secciones de Inventario: lo del día, dónde está cada cosa y lo que hay que comprar. */
export type Seccion = 'hoy' | 'areas' | 'botiquin' | 'compras';

export interface AgregarPreset {
  nombre?: string; area?: AreaId | null; cantidad?: number | null; unidad?: Unidad | null; contenido?: string;
  vence?: string; minimo?: number | null; precio?: number | null; barcode?: string; marca?: string;
  /** viene de la lista de compras: al guardar, sale de la lista */
  compraId?: number;
}

export type SheetState =
  /** el +: todo lo que se agrega, en un solo lugar */
  | { k: 'menu' }
  | { k: 'agregar'; preset?: AgregarPreset }
  /** el detalle de una cosa: cantidad, usar, contar, botar, editar, historial */
  | { k: 'item'; id: number }
  | { k: 'usar'; id: number }
  | { k: 'contar'; id: number }
  | { k: 'botar'; id: number }
  | { k: 'editar'; id: number }
  | { k: 'lista_add' }
  /** la revisión de la semana: lo que no cuentas hace 7 días */
  | { k: 'revision' }
  | { k: 'guia' }
  | { k: 'ajustes' }
  /** un remedio o suplemento de todos los días: cuánto hay y sus tomas (del perfil, o una cosa del inventario) */
  | { k: 'remedio'; medId?: string; itemId?: number }
  /** anotar una consulta, examen, vacuna o evento en el historial médico */
  | { k: 'historia' };

export type View = NonNullable<ReturnType<typeof useInventoryView>>;
export interface Act { (fn: (W: InventoryState, ctx: Ctx) => FormResult): Promise<boolean> }

export interface TabProps {
  S: InventoryState;
  V: View;
  open: (s: SheetState) => void;
  act: Act;
  irA: (s: Seccion, area?: AreaId | null) => void;
  /** el área abierta en «Áreas» (null = la grilla) */
  area: AreaId | null;
  setArea: (a: AreaId | null) => void;
}

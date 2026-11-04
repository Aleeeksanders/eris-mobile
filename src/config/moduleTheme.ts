// ============================================================
// Eris Mobile — color por módulo
// El núcleo menta del ícono de Eris es siempre el mismo; la nube de átomos toma el color del módulo donde estás.
// Los colores viven en el dibujante nativo (ErisMarkDrawer.kt → TINTS) y en el respaldo estático (ErisFAB); aquí
// solo se decide QUÉ módulo está en pantalla.
// ============================================================
import type { MarkTint } from '../../modules/eris-bubble/ErisMarkView';

/** Mismos valores que TINTS en ErisMarkDrawer.kt (para el ícono estático cuando no hay módulo nativo). */
export const MODULE_TINTS: Record<MarkTint, { mid: string; outer: string }> = {
  chat: { mid: '#67e8f9', outer: '#22d3ee' },
  finanzas: { mid: '#c4b5fd', outer: '#a78bfa' },
  forge: { mid: '#fdba74', outer: '#fb923c' },
  nutricion: { mid: '#6ee7b7', outer: '#34d399' },
  salud: { mid: '#fda4af', outer: '#fb7185' },
};

/** Pestaña (nombre de la ruta, modo público o AXS Executive) → color de la nube. */
export function tintForTab(route?: string): MarkTint {
  switch (route) {
    case 'Nutri': case 'NUT': return 'nutricion';
    case 'Métricas': case 'DATA': case 'Glucosa': case 'SEC': return 'salud';
    case 'Forge': case 'FORGE': return 'forge';
    case 'Finanzas': case 'FIN': return 'finanzas';
    case 'Inventario': case 'INV': return 'nutricion';
    default: return 'chat';
  }
}

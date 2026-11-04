// Eris al timón: las claves del plan del día que leen otras pantallas (Finanzas) sin cargar el almacén entero
export const DAY_PLAN_EVENT = 'ERIS_DAY_PLAN_CHANGED';
/** el tope de gasto de hoy del plan de Eris (lo muestra Finanzas → Hoy) */
export const capKey = (day: string) => `eris_day_cap_${day}`;

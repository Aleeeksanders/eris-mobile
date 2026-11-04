// ============================================================
// Eris Mobile — reglas de metas según el perfil médico
// Misma regla que el servidor (eris/src/services/DailyTargets.ts → waterRule): la usa Forge para que su meta de agua
// coincida con la de Nutrición, Inicio y Eris. Si cambia allá, cambia acá.
// ============================================================

const SGLT2_NAMES = /gliflozin|jardiance|forxiga|farxiga|invokana/i;

/** Enfermedad renal → la proteína es un TOPE (0,8 g/kg), manda sobre el objetivo de Forge. Misma regla que DailyTargets.proteinRule. */
export function proteinRule(medical: any): { cap: boolean; note?: string } {
  const conditions: any[] = Array.isArray(medical?.conditions) ? medical.conditions : [];
  return conditions.some((c) => c?.id === 'ckd')
    ? { cap: true, note: 'Con enfermedad renal la proteína es un tope, no una meta; lo afina tu nefrólogo.' }
    : { cap: false };
}

const HEART_FAILURE_TEXT = /insuficiencia card[ií]aca|falla card[ií]aca|\bicc\b/i;
const FLUID_LIMIT_TEXT = /restricci[oó]n (de )?(l[ií]quidos|agua|h[ií]drica)|l[ií]mite de (l[ií]quidos|agua)/i;

/**
 * Enfermedad renal o insuficiencia cardíaca (también escrita a mano en las notas) → sin meta de agua: el límite de líquidos
 * lo pone su médico. SGLT2 → +30 % (va después: en insuficiencia cardíaca el SGLT2 es tratamiento común).
 */
export function waterRule(medical: any): { off: boolean; multiplier: number; note?: string } {
  const conditions: any[] = Array.isArray(medical?.conditions) ? medical.conditions : [];
  const text = (re: RegExp) => conditions.some((c) => re.test(String(c?.notes ?? '')));
  if (conditions.some((c) => c?.id === 'ckd')) {
    return { off: true, multiplier: 1, note: 'con enfermedad renal tu límite de líquidos lo define tu nefrólogo' };
  }
  if (conditions.some((c) => c?.id === 'heart_failure') || text(HEART_FAILURE_TEXT)) {
    return { off: true, multiplier: 1, note: 'con insuficiencia cardíaca tu límite de líquidos lo define tu cardiólogo' };
  }
  if (text(FLUID_LIMIT_TEXT)) return { off: true, multiplier: 1, note: 'tu límite de líquidos lo define tu médico' };
  const meds: any[] = Array.isArray(medical?.medications) ? medical.medications : [];
  const sglt2 = meds.some((m) => m?.active !== false && (m?.type === 'sglt2' || SGLT2_NAMES.test(String(m?.name ?? ''))));
  return sglt2 ? { off: false, multiplier: 1.3, note: '+30 % por tu medicamento (SGLT2)' } : { off: false, multiplier: 1 };
}

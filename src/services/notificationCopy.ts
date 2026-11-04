// ============================================================
// Eris Mobile — textos de las notificaciones (lógica pura, sin React Native, para poder probarla)
// ============================================================

export const COLORS = { urgent: '#F43F5E', warn: '#F59E0B', approval: '#3B82F6' };

/** Texto plano y corto para el cuerpo (sin markdown, sin pensar en voz alta del modelo). */
export function plainPreview(text: string, max = 220): string {
  const t = String(text)
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '· ')
    .replace(/[*_`>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).trim()}…`;
}

/**
 * Textos de una alerta de glucosa. Lo urgente dice qué hacer YA (la regla de los 15 g que también usa Eris en el chat);
 * lo urgente alto deriva a urgencias ante señales de alarma. Nunca dosis de medicamentos.
 */
export function glucoseCopy(alertType: string, value: number, trend?: string) {
  const v = `${Math.round(Number(value))} mg/dL${trend ? ` ${trend}` : ''}`;
  switch (alertType) {
    case 'urgent_low':
      return { kind: 'glucose_urgent' as const, color: COLORS.urgent, title: `🔴 Glucosa muy baja: ${v}`,
        body: 'Come o toma 15 g de azúcar rápida ahora (½ vaso de jugo o 1 cucharada de azúcar) y vuelve a medir en 15 minutos.' };
    case 'urgent_high':
      return { kind: 'glucose_urgent' as const, color: COLORS.urgent, title: `🔴 Glucosa muy alta: ${v}`,
        body: 'Toma agua y sigue lo que te indicó tu médico. Si tienes náuseas, vómitos o respiras rápido, llama al 131.' };
    case 'low':
      return { kind: 'glucose' as const, color: COLORS.warn, title: `🟡 Glucosa baja: ${v}`,
        body: 'Come algo con 15 g de carbohidratos y vuelve a medir en 15 minutos.' };
    default:
      return { kind: 'glucose' as const, color: COLORS.warn, title: `🟡 Glucosa alta: ${v}`,
        body: 'Toma agua y, si puedes, camina un rato. Si sigue subiendo, revisa la indicación de tu médico.' };
  }
}

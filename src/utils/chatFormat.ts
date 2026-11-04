// ============================================================
// Eris Mobile — cómo se ve un mensaje en el teléfono
//
// 2026-10-07: una tabla de 4 columnas se cortaba en el teléfono ("Hidrataci-ón", "Carbohid-ratos") y el razonamiento
// mostraba nombres internos ("manage_user_profile", "customContext"). El texto del servidor queda igual; acá solo se
// adapta para leerlo en pantalla chica.
// ============================================================

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isSeparator = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/**
 * Tablas markdown → una línea por fila: "- **Calorías:** 1.808 kcal · Meta: 2.850 kcal · Progreso: 63 %".
 * La primera columna es el nombre de la fila; el resto va con el título de su columna.
 */
export function tablesToLists(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isRow(lines[i]) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const head = cells(lines[i]);
      i += 2;
      while (i < lines.length && isRow(lines[i])) {
        const c = cells(lines[i]);
        const [first, ...rest] = c;
        const parts = rest.map((v, k) => (v ? `${head[k + 1] ? `${head[k + 1]}: ` : ""}${v}` : "")).filter(Boolean);
        out.push(`- **${first || "—"}:** ${parts.join(" · ")}`);
        i++;
      }
      i--;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join("\n");
}

const TOOL_WORDS: Record<string, string> = {
  manage_user_profile: "tu perfil", nutrition_tracker: "el registro de comida", get_live_context: "tus datos de hoy",
  metabolic_advisor: "el asesor metabólico", finance_tracker: "Finanzas", sleep_log: "el registro de sueño",
  lab_results: "tus exámenes", symptom_guide: "la guía de síntomas", carb_options: "las opciones de carbohidratos",
  personal_baseline: "tus patrones", gluco_tracker: "la glucosa", training_plan: "tu rutina", web_search: "la web",
  personal_journal: "tu diario", manage_user_context: "tus notas", insight_feedback: "tus preferencias",
  customContext: "contexto personal", dietaryRestrictions: "restricciones alimentarias",
};

/** El razonamiento se muestra sin nombres internos de herramientas ni de campos. */
export function friendlyThinking(text: string): string {
  return text
    .replace(/\s*(con\s+)?`?action\s*=\s*['"]?\w+['"]?`?/g, "")
    .replace(/`?\b([a-z]+(?:_[a-z]+)+|customContext|dietaryRestrictions)\b`?/g, (m, w: string) => TOOL_WORDS[w] ?? m)
    .replace(/ {2,}/g, " ");
}

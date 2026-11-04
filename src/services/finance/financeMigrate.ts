// ============================================================
// Eris Mobile — pasar Finanzas de la versión web a la nativa, sin perder un peso (Finanzas 2.0, F1)
//
// La versión web (assets/hunter-wallet.html) se abre invisible con el mismo origen y perfil, corre sus migraciones del
// libro y entrega TODAS sus claves (__hwBackupDump) junto con su propio resumen (__hwExtract). Acá se convierten al
// estado nativo y se COMPARA: el resumen y el texto para Eris calculados por el núcleo nuevo tienen que dar exactamente lo
// mismo que los de la web (saldos de cada cuenta, gastos del mes, cuotas, sueldo, ahorro, deudas…). Si algo no calza,
// no se migra y Finanzas sigue siendo la web. Los datos de la web NO se borran (se puede volver atrás).
// ============================================================
import { extractLegacy, fromHwKeys, type FinanceState } from './financeCore';

export interface WebSnapshot {
  dump: { profile: string; keys: Record<string, string> };
  extract: { context: string; summary: Record<string, unknown> };
}

export interface MigrationCheck {
  ok: boolean;
  state?: FinanceState;
  /** qué no calzó (para el registro y para decidir no migrar) */
  diffs: string[];
}

const sortKeys = (v: any): any => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);

/** Convierte lo de la web y revisa al peso que el núcleo nuevo diga lo mismo. Puro: no guarda nada. */
export function checkMigration(web: WebSnapshot, now = new Date()): MigrationCheck {
  const diffs: string[] = [];
  if (!web?.dump?.keys || typeof web.dump.keys !== 'object') return { ok: false, diffs: ['la web no entregó sus datos'] };
  const state = fromHwKeys(web.dump.keys);
  const mine = extractLegacy(state, now); // lo mismo que calculaba la web (no lo que lee Eris hoy)
  const a = sortKeys(mine.summary), b = sortKeys(web.extract?.summary ?? {});
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diffs.push(`${k}: web ${JSON.stringify(b[k])} · nativa ${JSON.stringify(a[k])}`);
  }
  if (mine.context !== web.extract?.context) diffs.push('el texto para Eris no es igual');
  return { ok: diffs.length === 0, state, diffs };
}

/** JS para la web invisible: entrega sus datos y su resumen (`hw_migration`). */
export const MIGRATION_JS = `(function(){try{var d=window.__hwBackupDump&&window.__hwBackupDump();var e=window.__hwExtract&&window.__hwExtract();`
  + `window.ReactNativeWebView.postMessage(JSON.stringify({type:'hw_migration',dump:d,extract:e}));}`
  + `catch(err){window.ReactNativeWebView.postMessage(JSON.stringify({type:'hw_migration',error:String(err&&err.message||err)}));}})();true;`;

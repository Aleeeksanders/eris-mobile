// Paridad Finanzas: el núcleo nuevo (financeCore.ts) contra hunter-wallet.html con el MISMO libro y las MISMAS 17
// operaciones (hw_parity_web.py corre la web en Chrome y deja hw_f1/web_out.json). Al peso: resultados, resumen, texto
// para Eris y el libro final (los ids nuevos se comparan por orden de aparición).
import { test, expect } from "bun:test";
process.env.TZ = "America/Santiago"; // bun test corre en UTC; el escenario es del día de Chile
import { readFileSync } from "fs";
import { join } from "path";
const core = await import("C:/Proyectos/eris-mobile/src/services/finance/financeCore.ts");

const DIR = join(import.meta.dir, "fixtures", "hw_f1");
const scenario = JSON.parse(readFileSync(join(DIR, "scenario.json"), "utf-8"));
const web = JSON.parse(readFileSync(join(DIR, "web_out.json"), "utf-8"));

// Revisión V3 (2026-11-04): con reloj fijo, el día del escenario (la web lo corrió ese día, a las 09:06). Antes exigía que
// HOY fuera ese día y había que volver a correr la web en Chrome cada mañana; si no, la prueba «fallaba».
const hoy = new Date(`${scenario.hoy}T09:06:00-03:00`);
let next = 9_000_000;
const ctx = { now: hoy, newId: () => ++next };
let S = core.fromHwKeys(scenario.seed);
const results: any[] = [];
for (const op of scenario.ops) { const r = core.applyOp(S, op, ctx); S = r.state; results.push(r.result); }

/** Los ids que no venían en la semilla → N1, N2… en el orden en que aparecen (en la web salen de Date.now()). */
function normalize(state: any) {
  const seedIds = new Set<string>();
  for (const k of ["hw2_tx", "hw2_cuentas", "hw2_prog"]) for (const x of JSON.parse(scenario.seed[k])) seedIds.add(String(x.id));
  const map = new Map<string, string>();
  const nid = (v: any) => { if (v == null || seedIds.has(String(v)) || v === "cash") return v; const k = String(v); if (!map.has(k)) map.set(k, `N${map.size + 1}`); return map.get(k); };
  const cuentas = state.cuentas.map((c: any) => ({ ...c, id: nid(c.id) }));
  const tx = state.tx.map((t: any) => ({ ...t, id: nid(t.id), ...(t.desde != null ? { desde: nid(t.desde) } : {}), ...(t.hacia != null ? { hacia: nid(t.hacia) } : {}), ...(t.prestamoId != null ? { prestamoId: nid(t.prestamoId) } : {}) }));
  const chatLog = state.chatLog.map((l: any) => ({ tipo: l.tipo, id: nid(l.id) }));
  return { cuentas, tx, prog: state.prog, rec: [...state.rec].sort(), sueldo: state.sueldo, presup: state.presup, metas: state.metas, sm: state.sm, lastCuenta: nid(state.lastCuenta), chatLog, setupDone: state.setupDone };
}

test("cada operación da lo mismo que en la web", () => {
  expect(results.length).toBe(web.results.length);
  // Los nombres de categoría son de la app desde I0 (2026-10-22: «🛒 Comida», no «⚔️ Provisiones» del juego de la web):
  // se compara al peso todo lo demás (montos, cuentas, saldos, mensajes)
  const sinNombre = (x: any) => JSON.parse(JSON.stringify(x ?? {}, (k, v) => (k === "catIcon" || k === "catLabel" ? undefined : v)));
  // Revisión V3 (2026-11-04): el resumen que acompaña a cada resultado cambió a propósito después de migrar («Disponible»
  // salió el 22-10 —solo existe la plata de tus cuentas—, llegaron «libre», las metas, los nombres de la app). Lo que NO puede
  // cambiar se compara al peso: si salió, por qué no, el monto y cómo quedó la cuenta. El libro final se compara entero abajo.
  const fijo = (x: any) => { const y = sinNombre(x); return { ok: y.ok, code: y.code, monto: y.monto ?? y.data?.monto, cuenta: y.cuenta ?? y.data?.cuenta }; };
  results.forEach((r, i) => expect({ i, ...fijo(r) }).toEqual({ i, ...fijo(web.results[i]) }));
});

test("el libro final es el mismo (saldos, cuotas, préstamos, fijos, deshacer)", () => {
  const webState = core.fromHwKeys(web.dump);
  expect(normalize(S)).toEqual(normalize(webState));
});

test("lo que ve Eris (resumen y texto) es el mismo", () => {
  const ex = core.extractLegacy(S, hoy);
  expect(ex.summary).toEqual(web.summary);
  expect(ex.context).toBe(web.context);
});

test("ida y vuelta hw* ↔ estado sin perder nada", () => {
  const again = core.fromHwKeys(core.toHwKeys(S));
  expect(again).toEqual(S);
});

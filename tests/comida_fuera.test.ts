import { test, expect } from "bun:test";
import * as C from "C:/Proyectos/eris-mobile/src/services/finance/financeCore.ts";
test("comida fuera y delivery: solo comida de este mes, dato neutral en el contexto", () => {
  let id = 1; const now = new Date(2026, 9, 15, 12); const ctx = { now, newId: () => id++ };
  const S = C.draft(C.onboarding({ sueldo: 900000 }, ctx));
  // desde I1 todo gasto sale de una cuenta
  const cuenta = C.formCuenta(S, { banco: "BCI", tipo: "debito", saldo: 500000 }, ctx).id;
  for (const [desc, monto, cat, fecha] of [["Rappi", 12000, "alimentacion", "2026-10-03"], ["Sushi con amigos", 18000, "alimentacion", "2026-10-10"], ["Super Lider", 40000, "alimentacion", "2026-10-11"], ["Uber", 5000, "transporte", "2026-10-12"], ["McDonald's", 6000, "alimentacion", "2026-09-28"]] as const)
    C.formGasto(S, { desc, monto, cat, fecha, cuenta }, ctx);
  expect(C.comidaFuera(S, now)).toEqual({ monto: 30000, veces: 2 });
  expect(C.extract(S, now).context).toContain("- Comida fuera y delivery este mes: $30.000 en 2 compras (dato, no juicio)");
});

// Revisión V0 (app, lo que corre sin teléfono): D6 lo viejo del día a día se borra · D3 restaurar Finanzas desde el respaldo
process.env.TZ = "America/Santiago";
import { test, expect, mock } from "bun:test";
mock.module("@react-native-async-storage/async-storage", () => ({ default: {} }));
const { clavesViejas, DIAS_GUARDADOS } = await import("C:/Proyectos/eris-mobile/src/services/storagePrune.ts");
const F = await import("C:/Proyectos/eris-mobile/src/services/finance/financeCore.ts");

test("D6: solo las claves con fecha de más de 120 días (los dos formatos de fecha); lo demás no se toca", () => {
  const now = new Date(2026, 9, 31, 12);
  const keys = [
    "eris_nutrition_log_v1_Fri Oct 30 2026",      // ayer
    "eris_nutrition_log_v1_Mon Jun 01 2026",      // > 120 días
    "eris_water_log_v1_Tue May 05 2026",          // > 120
    "eris_day_cap_2026-06-01",                    // > 120 (AAAA-MM-DD)
    "eris_day_cap_2026-10-01",                    // reciente
    "eris_mood_logged_2026-01-15",                // > 120
    "finance_state_v1",                           // sin fecha: nunca
    "eris_nutrition_goals_default",               // otro prefijo
    "eris_nutrition_log_v1_basura",               // sin fecha legible: no
  ];
  expect(clavesViejas(keys, now).sort()).toEqual(["eris_day_cap_2026-06-01", "eris_mood_logged_2026-01-15", "eris_nutrition_log_v1_Mon Jun 01 2026", "eris_water_log_v1_Tue May 05 2026"].sort());
  expect(DIAS_GUARDADOS).toBe(120);
});

test("D3: el respaldo del PC (claves hw*) vuelve a ser el mismo libro (lo que usa financeStore.restore)", () => {
  const S = F.emptyState();
  S.setupDone = true;
  S.cuentas = [{ id: 1, nombre: "Cuenta RUT", banco: "BancoEstado", tipo: "debito", saldoInicial: 100_000 }] as any;
  F.formGasto(S, { desc: "Lider", monto: 12_990, cat: "alimentacion", cuenta: 1, fecha: "2026-10-30" }, { now: new Date(), newId: () => 77 });
  const keys = F.toHwKeys(S);
  const R = F.fromHwKeys(keys);
  expect(R.tx.length).toBe(1);
  expect(F.estado(R).cuentas[0].saldo).toBe(87_010);
  expect(R.setupDone).toBe(true);
});

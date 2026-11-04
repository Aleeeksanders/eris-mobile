// «Mis comidas» (eris-mobile/src/services/mealSlots.ts): orden, lo guardado roto, editar sin romper nada, horas al anotar.
import { test, expect } from "bun:test";
process.env.TZ = "America/Santiago";
const M = await import("C:/Proyectos/eris-mobile/src/services/mealSlots.ts");
const ids = (l: any[]) => l.map((s) => s.id + (s.hidden ? "·oculta" : "")).join(" ");

test("la lista guardada vieja (cena antes que once) se muestra en orden del día", () => {
  const old = [
    { id: "desayuno", name: "Desayuno", emoji: "🌅" }, { id: "colacion_am", name: "Colación mañana", emoji: "🍎" },
    { id: "almuerzo", name: "Almuerzo", emoji: "☀️" }, { id: "colacion_pm", name: "Colación tarde", emoji: "🍌" },
    { id: "cena", name: "Cena", emoji: "🌙" }, { id: "once", name: "Once", emoji: "🫖" },
  ];
  expect(ids(M.normalizeSlots(old))).toBe("desayuno colacion_am almuerzo colacion_pm once cena");
  expect(ids(M.defaultSlots())).toBe("desayuno colacion_am almuerzo colacion_pm once cena");
});

test("lo guardado roto no rompe nada", () => {
  for (const raw of [null, "x", 3, {}, [null, 1, "a", { id: "" }, { name: "sin id" }]]) {
    const l = M.normalizeSlots(raw);
    expect(l.filter((s) => !s.hidden).length).toBeGreaterThan(0);
    expect(new Set(l.map((s) => s.id)).size).toBe(l.length);
  }
  // borradas con la versión anterior → quedan ocultas (no desaparecen); ids repetidos fuera; nombre vacío → el de siempre
  const l = M.normalizeSlots([{ id: "almuerzo", name: "", emoji: "" }, { id: "almuerzo", name: "Otro" }, { id: "meal_1", name: "Pre-entreno", emoji: "💪", hour: 18.7 }]);
  expect(ids(l)).toBe("desayuno·oculta colacion_am·oculta almuerzo colacion_pm·oculta once·oculta meal_1 cena·oculta");
  expect(l.find((s) => s.id === "almuerzo")!.name).toBe("Almuerzo");
  expect(l.find((s) => s.id === "meal_1")!.hour).toBe(18.5);
  // todas ocultas → vuelven las de siempre
  expect(M.visibleSlots(M.normalizeSlots(M.defaultSlots().map((s) => ({ ...s, hidden: true })))).length).toBe(6);
});

test("comidas propias: con hora, en su lugar; «Cena» vuelve a mostrar la de siempre", () => {
  let l = M.defaultSlots();
  let r = M.addCustomSlot(l, "Pre-entreno", 18, "💪", 1);
  expect(r.error).toBeUndefined();
  expect(ids(r.slots)).toBe("desayuno colacion_am almuerzo colacion_pm meal_1 once cena");
  r = M.addCustomSlot(r.slots, "Picoteo nocturno", 1, "🌙", 2);
  expect(ids(r.slots).endsWith("cena meal_2")).toBe(true); // la 1 AM va después de la cena
  l = r.slots.map((s) => (s.id === "cena" ? { ...s, hidden: true } : s));
  r = M.addCustomSlot(l, "cena", 21, "🍽️");
  expect(r.note).toContain("volví a mostrar");
  expect(r.slots.find((s) => s.id === "cena")!.hidden).toBeUndefined();
  expect(r.slots.filter((s) => s.name === "cena").length).toBe(0);
  expect(M.addCustomSlot(r.slots, "Once", 18, "x").error).toContain("Ya tienes");
  expect(M.addCustomSlot(r.slots, "   ", 18, "x").error).toBeTruthy();
});

test("guardar: nombre vacío vuelve, sin repetidos, al menos una a la vista", () => {
  const prev = M.defaultSlots();
  let f = M.finalizeEdit(prev, prev.map((s) => (s.id === "once" ? { ...s, name: "  " } : s)));
  expect(f.error).toBeUndefined();
  expect(f.slots.find((s) => s.id === "once")!.name).toBe("Once");
  f = M.finalizeEdit(prev, prev.map((s) => (s.id === "colacion_pm" ? { ...s, name: "Once" } : s)));
  expect(f.error).toBeTruthy();
  f = M.finalizeEdit(prev, prev.map((s) => ({ ...s, hidden: true })));
  expect(f.error).toContain("al menos una");
  f = M.finalizeEdit(prev, prev.map((s) => (s.id === "colacion_pm" ? { ...s, name: "Merienda" } : s)));
  expect(f.error).toBeUndefined();
  expect(f.slots.find((s) => s.id === "colacion_pm")!.name).toBe("Merienda");
  // restablecer: las de siempre a la vista, las propias ocultas (no se pierden)
  const withCustom = M.addCustomSlot(prev, "Pre-entreno", 18, "💪", 5).slots;
  const reset = M.resetSlots(withCustom);
  expect(ids(reset)).toBe("desayuno colacion_am almuerzo colacion_pm meal_5·oculta once cena");
});

test("orden de lo anotado en el día: once antes que cena, ocultas y antiguas en su lugar", () => {
  const slots = M.normalizeSlots(M.defaultSlots().map((s) => (s.id === "once" ? { ...s, hidden: true } : s)));
  const e = (mealType: string, h: number) => ({ mealType, loggedAt: new Date(2026, 9, 16, h).toISOString() });
  expect(M.displayOrder(slots, [e("cena", 21), e("once", 18), e("desayuno", 8), e("meal_99", 23), e("almuerzo", 13)]))
    .toEqual(["desayuno", "almuerzo", "once", "cena", "meal_99"]);
  expect(M.slotLabel(slots, "once", (x) => x)).toBe("🫖 Once"); // oculta: igual con su nombre
  expect(M.slotLabel(slots, "meal_99", () => "Otra comida")).toBe("🍽️ Otra comida");
});

test("hora al anotar: la cena elegida a las 11 queda en la cena de hoy", () => {
  const day = new Date(2026, 9, 16); const now = new Date(2026, 9, 16, 11, 0);
  const cena = M.entryTimeFor({ id: "cena" }, day, now, { isToday: true, wakeHour: 7 });
  expect(cena.when).toBe("future");
  expect(cena.at.getHours()).toBe(21);
  expect(M.entryTimeFor({ id: "desayuno" }, day, now, { isToday: true, wakeHour: 7 }).when).toBe("now"); // 11:00: dentro de la tolerancia
  expect(M.entryTimeFor({ id: "desayuno" }, day, new Date(2026, 9, 16, 12), { isToday: true, wakeHour: 7 }).when).toBe("past");
  expect(M.entryTimeFor({ id: "colacion_am" }, day, now, { isToday: true, wakeHour: 7 }).when).toBe("now");
  // otro día: a su hora ese día
  const ayer = new Date(2026, 9, 15);
  const c2 = M.entryTimeFor({ id: "cena" }, ayer, now, { isToday: false, usualWake: 7 });
  expect([c2.at.getDate(), c2.at.getHours()]).toEqual([15, 21]);
  // propia con hora
  const pre = { id: "meal_1", hour: 18.5 };
  expect(M.entryTimeFor(pre, day, now, { isToday: true }).when).toBe("future");
  expect(M.entryTimeFor(pre, day, new Date(2026, 9, 16, 18, 40), { isToday: true }).when).toBe("now");
  expect(M.entryTimeFor(pre, day, new Date(2026, 9, 16, 22), { isToday: true }).when).toBe("past");
  const late = M.entryTimeFor({ id: "meal_2", hour: 1 }, ayer, now, { isToday: false });
  expect([late.at.getDate(), late.at.getHours()]).toEqual([16, 1]); // madrugada → día calendario siguiente
});

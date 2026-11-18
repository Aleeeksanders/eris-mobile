// Hestia como JARVIS · L3 (2026-11-17): Forge por voz (forgeVoz.ts), con el núcleo de verdad. Lo que Hestia pide en la llamada:
// qué serie sigue, «hice 8 con 62,5» (con la carga de antes si no la dice), el descanso, el récord, borrar la última, terminar.
process.env.TZ = "America/Santiago";
import { test, expect, mock } from "bun:test";
const store: Record<string, string> = {};
mock.module("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (k: string) => store[k] ?? null, setItem: async (k: string, v: string) => { store[k] = v; }, removeItem: async (k: string) => { delete store[k]; },
  multiGet: async (ks: string[]) => ks.map((k) => [k, store[k] ?? null]), multiSet: async () => {}, multiRemove: async () => {}, getAllKeys: async () => [], mergeItem: async () => {}, clear: async () => {},
} }));
mock.module("C:/Proyectos/eris-mobile/src/services/ScopedStorage.ts", () => ({ PROFILE_CHANGED_EVENT: "perfil" }));
mock.module("react-native", () => ({
  AppState: { currentState: "active" }, Vibration: { vibrate: () => {} },
  DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove() {} }) }, Platform: { OS: "android", select: (o: any) => o.android ?? o.default },
}));

const C = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeCore.ts");
const T = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeTrain.ts");
const V = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeVoz.ts");
const { defaultGym } = await import("C:/Proyectos/eris-mobile/src/services/forge/forgeCatalog.ts");

const tk = C.L.todayKey();
function base() {
  const s = C.newState(); s.bodyKg = 80; s.sex = "h"; s.age = 30; s.heightCm = 175; s.gym = defaultGym("smartfit");
  s.plan = { press_banca: 3, press_incl: 2 };
  s.planDay = { day: tk, name: "Empuje", targets: { press_banca: { exId: "press_banca", sets: 3, repMin: 6, repMax: 8, rir: 2, kg: 60, why: "" }, press_incl: { exId: "press_incl", sets: 2, repMin: 8, repMax: 10, rir: 2, kg: 40, why: "" } } };
  return s;
}
function deps(S0: any) {
  let S = S0;
  let rest: any = null;
  let ahora = Date.now();
  return {
    get S() { return S; },
    avanzar(ms: number) { ahora += ms; },
    deps: {
      now: () => ahora,
      store: { load: async () => S, update: async (fn: any) => { S = fn(S); return S; } },
      reloj: {
        get: () => rest,
        afterSet: (s: any, day: string, ex: any, set: any) => { const p = T.afterSetPlan(s, day, ex, set); rest = !p.secs || p.fin ? null : { endAt: ahora + p.secs * 1000, total: p.secs, exId: ex.id, exName: ex.name, next: p.text, warmup: false, ended: false }; },
        adjust: (d: number) => { if (rest) rest = { ...rest, total: rest.total + d, endAt: rest.endAt + d * 1000 }; },
        stop: () => { rest = null; },
      },
    },
  };
}

test("lo que sigue: la primera serie del plan con la carga del objetivo; nombres para decirlos", async () => {
  const d = deps(base());
  const r = await V.aplicarForgeOp({ accion: "sesion" }, d.deps);
  expect(r.ok).toBe(true);
  expect(r.data).toMatchObject({ hayPlan: true, nombreDia: "Empuje", hechas: 0, total: 5, ejercicios: 2, listo: false });
  expect(r.data.sigue).toMatchObject({ exId: "press_banca", nombre: "press de banca", serie: 1, de: 3, carga: "60 kg", reps: "6 a 8", cambio: false });
  expect(V.nombreVoz("Press de Banca (Barra o Mancuernas)")).toBe("press de banca");
});

test("«hice 8 con 62,5»: se anota con el núcleo, parte el descanso; la siguiente sin carga usa la de antes; récord dicho en palabras", async () => {
  const S = base();
  // la vez pasada: 60 × 8 (así lo de hoy puede ser récord)
  S.sessions["2026-11-10"] = { press_banca: [{ reps: 8, kg: 60, rir: 2, at: 1 }] };
  const d = deps(S);
  const r = await V.aplicarForgeOp({ accion: "serie", reps: 8, kg: 62.5, rir: 1 }, d.deps);
  expect(r.ok).toBe(true);
  expect(r.data.anotada).toMatchObject({ exId: "press_banca", texto: "8 con 62,5 kg", serie: 1, de: 3 });
  expect(r.data.record).toMatch(/^máximo estimado de unos \d/);
  expect(r.data.descanso.secs).toBeGreaterThanOrEqual(90);
  expect(r.data.sigue).toMatchObject({ exId: "press_banca", serie: 2, carga: "62,5 kg" });
  expect(d.S.sessions[tk].press_banca).toHaveLength(1);
  expect(d.deps.reloj.get()).not.toBeNull();
  // «hice 7» (sin la carga): la de la serie anterior de hoy
  d.avanzar(150_000);
  const r2 = await V.aplicarForgeOp({ accion: "serie", reps: 7 }, d.deps);
  expect(r2.data.anotada.texto).toBe("7 con 62,5 kg");
  expect(d.S.sessions[tk].press_banca[1].rest).toBeGreaterThan(0); // el descanso medido entre anotaciones
});

test("al terminar un ejercicio, el cambio al siguiente (con su carga objetivo) y al final «plan listo»", async () => {
  const d = deps(base());
  for (let i = 0; i < 3; i++) { await V.aplicarForgeOp({ accion: "serie", reps: 8 }, d.deps); d.avanzar(120_000); }
  const s = await V.aplicarForgeOp({ accion: "sesion" }, d.deps);
  expect(s.data.sigue).toMatchObject({ exId: "press_incl", nombre: "press inclinado", serie: 1, de: 2, carga: "40 kg", reps: "8 a 10", cambio: true });
  await V.aplicarForgeOp({ accion: "serie", reps: 10 }, d.deps);
  d.avanzar(120_000);
  const fin = await V.aplicarForgeOp({ accion: "serie", reps: 9 }, d.deps);
  expect(fin.data.listo).toBe(true);
  expect(fin.data.descanso.secs).toBe(0);
});

test("nombrar el ejercicio, remate de negativas y al fallo; lo que no se entiende no se anota", async () => {
  const d = deps(base());
  const r = await V.aplicarForgeOp({ accion: "serie", reps: 6, ejercicio: "press inclinado", rir: 0, neg: 3 }, d.deps);
  expect(r.data.anotada).toMatchObject({ exId: "press_incl", texto: "6 con 40 kg y 3 negativas" });
  expect(d.S.sessions[tk].press_incl[0]).toMatchObject({ reps: 6, kg: 40, rir: 0, tail: { kind: "neg", reps: 3 } });
  expect((await V.aplicarForgeOp({ accion: "serie", reps: 8, ejercicio: "yoga aéreo de cabeza" }, d.deps)).code).toBe("no_encontre");
  expect((await V.aplicarForgeOp({ accion: "serie", reps: 0 }, d.deps)).code).toBe("invalida");
  // sin plan y sin series hoy: pregunta de qué
  const vacio = C.newState();
  expect((await V.aplicarForgeOp({ accion: "serie", reps: 8 }, deps(vacio).deps)).code).toBe("sin_ejercicio");
});

test("el descanso: cuánto queda, más, cortar; borrar la última; terminar con el resumen", async () => {
  const d = deps(base());
  await V.aplicarForgeOp({ accion: "serie", reps: 8, kg: 60 }, d.deps);
  const e = await V.aplicarForgeOp({ accion: "descanso", que: "estado" }, d.deps);
  expect(e.data.descanso.quedan).toBeGreaterThan(60);
  const mas = await V.aplicarForgeOp({ accion: "descanso", que: "mas", segundos: 30 }, d.deps);
  expect(mas.data.quedan).toBe(e.data.descanso.quedan + 30);
  expect((await V.aplicarForgeOp({ accion: "descanso", que: "cortar" }, d.deps)).data.cortado).toBe(true);
  expect((await V.aplicarForgeOp({ accion: "descanso", que: "cortar" }, d.deps)).code).toBe("sin_descanso");
  const b = await V.aplicarForgeOp({ accion: "borrar_ultima" }, d.deps);
  expect(b.data.borrada).toEqual({ nombre: "press de banca", texto: "8 con 60 kg" });
  expect(d.S.sessions[tk]).toBeUndefined();
  await V.aplicarForgeOp({ accion: "serie", reps: 8, kg: 60 }, d.deps);
  const t = await V.aplicarForgeOp({ accion: "terminar" }, d.deps);
  expect(t.data).toMatchObject({ series: 1, ejercicios: ["press de banca"] });
  expect(t.data.kcal).toBeGreaterThan(0);
  expect((await V.aplicarForgeOp({ accion: "sesion" }, { ...d.deps, store: { load: async () => null, update: async () => null } })).code).toBe("sin_forge");
});

test("las cargas para decirlas: lastre, ayuda, mancuernas cada una, libras", () => {
  const cat = C.catalog(base());
  expect(V.cargaVoz(cat.press_banca_db, { kg: 22.5 })).toBe("22,5 kg cada una");
  expect(V.cargaVoz(cat.dom_prona, { kg: 10 })).toBe("con 10 kg de lastre");
  expect(V.serieVoz(cat.dom_prona, { reps: 6, kg: 10 })).toBe("6 con 10 kg de lastre");
  expect(V.cargaVoz(cat.press_pecho_maq, { kg: 110, unit: "lb" })).toBe("110 libras");
  expect(V.recordVoz("¡RÉCORD! MÁXIMO ESTIMADO ~82 KG C/U")).toBe("máximo estimado de unos 82 kg cada una");
});

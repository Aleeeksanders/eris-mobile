// (2026-11-17, su pedido) Al agregar alimentos en Nutrición: primero lo que tienes en casa (Alimentos y Despensa del Inventario),
// después lo que ya comiste y después lo natural (manzana, almendras); los productos de internet al final.
import { test, expect, mock } from "bun:test";
const store: Record<string, string> = {};
mock.module("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (k: string) => store[k] ?? null, setItem: async (k: string, v: string) => { store[k] = v; }, removeItem: async (k: string) => { delete store[k]; },
  multiGet: async (ks: string[]) => ks.map((k) => [k, store[k] ?? null]), multiSet: async () => {}, multiRemove: async () => {}, getAllKeys: async () => Object.keys(store), mergeItem: async () => {}, clear: async () => {},
} }));
mock.module("react-native", () => ({ Platform: { OS: "android" }, DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove() {} }) }, AppState: { addEventListener: () => ({ remove() {} }) } }));
mock.module("C:/Proyectos/eris-mobile/src/services/WebSocketManager.ts", () => ({ wsManager: { getStatus: () => "disconnected", sendMessage: () => {}, subscribeMessage: () => () => {} } }));
let items: any[] = [];
mock.module("C:/Proyectos/eris-mobile/src/services/inventory/inventoryStore.ts", () => ({ inventoryStore: { get: () => ({ items }) } }));

const { foodSearchService } = await import("C:/Proyectos/eris-mobile/src/services/FoodSearchService.ts");

const item = (id: number, nombre: string, p: any = {}) => ({ id, nombre, area: "despensa", cantidad: 2, unidad: "un", creado: "2026-11-01", ...p });
// lo que comió ayer: unas almendras con marca
const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
store[`eris_nutrition_log_v1_${ayer.toDateString()}`] = JSON.stringify([{ food: { id: "off_1", name: "Almendras tostadas", brand: "Marco Polo", calories: 600, protein: 20, carbs: 20, fat: 50, fiber: 10, sugar: 4, sodium: 200, servingSize: 30, servings: [] }, grams: 30 }]);

test("lo de casa sale primero, con la tabla de la base por su nombre; lo que no tiene tabla, o no queda, o es del baño, no", async () => {
  items = [
    item(1, "Manzanas verdes", { area: "alimentos", cantidad: 3 }),
    item(2, "Manzanas rojas", { cantidad: 0 }),
    item(3, "Manzana Watt's para el baño", { area: "bano" }),
    item(4, "Mantequilla xyzzy rarísima"),
  ];
  const r = await foodSearchService.searchQuick("manzana");
  expect(r[0]).toMatchObject({ name: "Manzanas verdes", enCasa: true });
  expect(r[0].calories).toBeGreaterThan(30);
  expect(r.filter((f) => f.enCasa).map((f) => f.name)).toEqual(["Manzanas verdes"]);
  // y no se repite más abajo como «Manzana verde» de la base
  expect(r.slice(1).some((f) => f.name === "Manzanas verdes")).toBe(false);
  // lo de casa sin tabla nutricional no se ofrece
  expect((await foodSearchService.searchQuick("mantequilla xyzzy")).some((f) => f.enCasa)).toBe(false);
});

test("sin nada en casa: lo exacto primero; después lo ya comido y lo natural (la fruta antes que su versión con marca); el resto después", async () => {
  items = [];
  // «almendras»: la base exacta primero, después las que comió
  const a = await foodSearchService.searchQuick("almendras");
  expect(a[0].name).toBe("Almendras");
  expect(a.findIndex((f) => f.name === "Almendras tostadas")).toBe(1);
  // «almen» (escribiendo): lo natural y lo ya comido arriba, antes que el resto de la base
  const b = await foodSearchService.searchQuick("almen");
  expect(b.slice(0, 2).map((f) => f.name).sort()).toEqual(["Almendras", "Almendras tostadas"]);
  // lo natural antes que lo derivado o con marca
  const m = await foodSearchService.searchQuick("manzan");
  const iNat = m.findIndex((f) => f.name === "Manzana"), iCoc = m.findIndex((f) => f.name === "Manzana cocida");
  expect(iNat).toBeGreaterThanOrEqual(0);
  expect(iNat).toBeLessThan(iCoc);
});

test("lo de casa con el producto exacto del código de barras ya leído", async () => {
  store["eris_barcode_cache_v1"] = JSON.stringify({ "7801234567890": { id: "off_7801234567890", name: "Leche descremada", brand: "Colun", calories: 35, protein: 3.2, carbs: 5, fat: 0.1, fiber: 0, sugar: 5, sodium: 45, servingSize: 200, servings: [], source: "off" } });
  items = [item(9, "Leche Colun", { barcode: "7801234567890", area: "alimentos" })];
  const r = await foodSearchService.searchQuick("leche");
  expect(r[0]).toMatchObject({ name: "Leche descremada", brand: "Colun", enCasa: true, calories: 35 });
});

// ============================================================
// Eris Mobile — Inventario: el núcleo (2026-10-22, fase I2)
//
// Pedido del usuario: «un módulo nuevo llamado inventario, con categorías: alimentos, baño, despensa, ropa, objetos,
// botiquín… y todo lo que requiera revisión para el día a día», con «meticulosidad absoluta en mantener el inventario fiel
// a la realidad». Acá viven las reglas, sin pantallas ni almacenamiento (igual que financeCore):
//   - cada cosa con su área, cantidad y unidad (y lo que trae cada unidad: «1 L», «400 g»), vencimiento, mínimo, ubicación
//     y último precio;
//   - un historial de movimientos (compra, consumo, conteo, botado, movido) para saber de dónde salió cada número y poder
//     deshacer;
//   - lo que se vence, lo que se acaba, la lista de compras (sola, con precio estimado) y la revisión de la semana;
//   - las operaciones del chat («compré 2 L de leche», «se acabó el shampoo», «¿tengo arroz?») con las mismas reglas.
// SIN imports: el servidor tiene una COPIA EXACTA (eris/src/services/InventoryCore.ts, scripts/sync_inventory_core.ts).
// ============================================================

// ─── Áreas ────────────────────────────────────────────────────────────────

export type AreaId = 'alimentos' | 'despensa' | 'bano' | 'limpieza' | 'botiquin' | 'ropa' | 'objetos' | 'mascotas';
export interface AreaDef { id: AreaId; nombre: string; corto: string; icono: string; desc: string; consumible: boolean; vence: boolean }
/** En el orden en que se muestran. «Mascotas» parte oculta (se activa en ⚙). */
export const AREAS: AreaDef[] = [
  { id: 'alimentos', nombre: 'Alimentos', corto: 'Alimentos', icono: '🥬', desc: 'Frescos y refrigerados: frutas, verduras, lácteos, carnes, huevos, pan', consumible: true, vence: true },
  { id: 'despensa', nombre: 'Despensa', corto: 'Despensa', icono: '🥫', desc: 'Lo que dura: arroz, fideos, legumbres, conservas, aceite, café', consumible: true, vence: true },
  { id: 'bano', nombre: 'Baño e higiene', corto: 'Baño', icono: '🧴', desc: 'Shampoo, jabón, pasta de dientes, papel higiénico, desodorante', consumible: true, vence: true },
  { id: 'limpieza', nombre: 'Limpieza y hogar', corto: 'Limpieza', icono: '🧽', desc: 'Detergente, cloro, lavalozas, esponjas, bolsas de basura, pilas, ampolletas', consumible: true, vence: false },
  { id: 'botiquin', nombre: 'Botiquín', corto: 'Botiquín', icono: '💊', desc: 'Remedios, suplementos y primeros auxilios', consumible: true, vence: true },
  { id: 'ropa', nombre: 'Ropa', corto: 'Ropa', icono: '👕', desc: 'Lo que tienes y lo que hay que reponer', consumible: false, vence: false },
  { id: 'objetos', nombre: 'Objetos', corto: 'Objetos', icono: '📦', desc: 'Herramientas, electrónica, utensilios y cosas de la casa que no se gastan', consumible: false, vence: false },
  { id: 'mascotas', nombre: 'Mascotas', corto: 'Mascotas', icono: '🐾', desc: 'Alimento, arena y lo de tu mascota', consumible: true, vence: true },
];
export const AREA: Record<AreaId, AreaDef> = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<AreaId, AreaDef>;
export const esArea = (x: unknown): x is AreaId => typeof x === 'string' && x in AREA;

// ─── Unidades ─────────────────────────────────────────────────────────────

export type Unidad = 'u' | 'paquete' | 'g' | 'kg' | 'ml' | 'L';
export const UNIDADES: Unidad[] = ['u', 'paquete', 'g', 'kg', 'ml', 'L'];
export const esUnidad = (x: unknown): x is Unidad => typeof x === 'string' && (UNIDADES as string[]).includes(x);
type Familia = 'cuenta' | 'masa' | 'vol';
export const familia = (u: Unidad): Familia => (u === 'g' || u === 'kg' ? 'masa' : u === 'ml' || u === 'L' ? 'vol' : 'cuenta');
/** A la unidad base de su familia (g, ml o unidades). */
const factor = (u: Unidad) => (u === 'kg' || u === 'L' ? 1000 : 1);

export interface Contenido { cant: number; unidad: Unidad }

// ─── Estado ───────────────────────────────────────────────────────────────

export interface Item {
  id: number;
  nombre: string;
  area: AreaId;
  /** cuánto hay, en `unidad` (puede ser fraccionario: 1,5 L) */
  cantidad: number;
  unidad: Unidad;
  /** lo que trae cada unidad o paquete («1 L», «400 g»): así «usé 500 ml» descuenta media caja */
  contenido?: Contenido;
  /** YYYY-MM-DD: el vencimiento más próximo de lo que hay */
  vence?: string | null;
  /** bajo esto (en `unidad`) va a la lista de compras */
  minimo?: number | null;
  ubicacion?: string;
  /** último precio pagado por unidad del ítem (CLP) */
  precio?: number | null;
  marca?: string;
  barcode?: string;
  /** enlace a la base de alimentos (Nutrición) y al remedio del perfil (Botiquín): fase I3 */
  foodId?: string;
  medId?: string;
  /**
   * Lo que se usa todos los días (un remedio, un suplemento): cuántas unidades por toma y cuántas tomas al día. Lo anota la
   * persona tal como se lo indicaron (Eris no indica dosis). Baja solo cada día (aplicarTomas). `ultimo` = el último día ya
   * descontado (YYYY-MM-DD).
   */
  toma?: { porToma: number; tomasDia: number; ultimo: string };
  /** YYYY-MM-DD del último conteo o confirmación («está bien») */
  revisado?: string;
  creado: string;
  /** se quitó del inventario (no se vuelve a comprar): fuera de las listas */
  archivado?: boolean;
}

export type TipoMov = 'nuevo' | 'compra' | 'consumo' | 'ajuste' | 'botado' | 'movido';
export interface Mov {
  id: number;
  itemId: number;
  tipo: TipoMov;
  /** cuánto cambió (en la unidad del ítem; negativo = salió) */
  delta: number;
  /** ISO con hora */
  at: string;
  via?: 'app' | 'eris' | 'boleta' | 'nutricion' | 'remedio' | 'revision';
  nota?: string;
  precio?: number;
  desde?: AreaId;
  hacia?: AreaId;
}

/** Algo que anotaste en la lista de compras a mano (lo que se acaba sale solo, no va acá). */
export interface Compra { id: number; nombre: string; cant?: number | null; unidad?: Unidad | null; area?: AreaId | null; creado: string }

export interface InventoryState {
  v: 1;
  items: Item[];
  movs: Mov[];
  compras: Compra[];
  /** áreas que no usas (se esconden; lo que tienen se guarda igual) */
  ocultas: AreaId[];
  /** lo anotado por chat, para «deshacer» */
  chatLog: Array<{ movId: number; at: number }>;
  setupDone?: boolean;
  /**
   * Lo que se come en casa sale de la despensa (fase I3): qué comidas de Nutrición ya se descontaron (y con qué movimiento,
   * para devolverlo si se borra la comida), desde cuándo, y las que no se pudieron convertir solas (se preguntan).
   */
  nutri?: {
    desde: string; vistos: string[]; movs: Record<string, number>; pendientes: ComidaPendiente[];
    /** el día de comida de cada descuento (el de quien trasnocha no es el del calendario): solo se devuelve si falta de ESE día */
    dias?: Record<string, string>;
  };
  /**
   * `descontarComida`: lo que comes sale de la despensa (I3). `prevision` (Eris administra, A3): lo que se va a acabar en
   * pocos días a tu ritmo entra solo a la lista de compras (por defecto, sí).
   */
  ajustes?: { descontarComida: boolean; prevision?: boolean };
}

/** Una comida de Nutrición que calza con algo de la despensa pero no se sabe cuánto descontar («80 g de palta»). */
export interface ComidaPendiente { key: string; comida: string; grams: number; itemId: number; at: string; /** el día de comida de esa comida */ dia?: string }

export interface Ctx { now: Date; newId: () => number }
export interface FormResult { ok: boolean; msg: string; id?: number; movId?: number }
const OK = (msg: string, id?: number, movId?: number): FormResult => ({ ok: true, msg, ...(id != null ? { id } : {}), ...(movId != null ? { movId } : {}) });
const NO = (msg: string): FormResult => ({ ok: false, msg });

/** Tope del historial: años de uso caben, sin que el respaldo crezca sin fin. */
export const MAX_MOVS = 3000;

export function emptyState(): InventoryState {
  return { v: 1, items: [], movs: [], compras: [], ocultas: ['mascotas'], chatLog: [] };
}

/** Lo guardado (o un respaldo) a un estado válido: campos que falten, tipos raros, nada roto. */
export function normalizar(raw: any): InventoryState {
  const S = emptyState();
  if (!raw || typeof raw !== 'object') return S;
  const num = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  S.items = (Array.isArray(raw.items) ? raw.items : []).filter((i: any) => i && typeof i.nombre === 'string' && i.nombre.trim()).map((i: any): Item => ({
    ...i,
    id: num(i.id),
    nombre: String(i.nombre).trim().slice(0, 80),
    area: esArea(i.area) ? i.area : 'objetos',
    cantidad: Math.max(0, num(i.cantidad)),
    unidad: esUnidad(i.unidad) ? i.unidad : 'u',
    ...(i.contenido && esUnidad(i.contenido.unidad) && num(i.contenido.cant) > 0 ? { contenido: { cant: num(i.contenido.cant), unidad: i.contenido.unidad } } : { contenido: undefined }),
    creado: typeof i.creado === 'string' ? i.creado : '1970-01-01',
  }));
  S.movs = (Array.isArray(raw.movs) ? raw.movs : []).filter((m: any) => m && Number.isFinite(Number(m.itemId)) && typeof m.tipo === 'string').slice(-MAX_MOVS);
  S.compras = (Array.isArray(raw.compras) ? raw.compras : []).filter((c: any) => c && typeof c.nombre === 'string');
  S.ocultas = (Array.isArray(raw.ocultas) ? raw.ocultas : ['mascotas']).filter(esArea);
  S.chatLog = Array.isArray(raw.chatLog) ? raw.chatLog.slice(-40) : [];
  if (raw.setupDone) S.setupDone = true;
  if (raw.nutri && typeof raw.nutri === 'object' && typeof raw.nutri.desde === 'string') {
    S.nutri = {
      desde: raw.nutri.desde,
      vistos: Array.isArray(raw.nutri.vistos) ? raw.nutri.vistos.filter((k: any) => typeof k === 'string').slice(-400) : [],
      movs: raw.nutri.movs && typeof raw.nutri.movs === 'object' ? raw.nutri.movs : {},
      pendientes: Array.isArray(raw.nutri.pendientes) ? raw.nutri.pendientes.slice(-30) : [],
      ...(raw.nutri.dias && typeof raw.nutri.dias === 'object' ? { dias: raw.nutri.dias } : {}),
    };
  }
  if (raw.ajustes && typeof raw.ajustes === 'object') S.ajustes = { descontarComida: raw.ajustes.descontarComida !== false, ...(raw.ajustes.prevision === false ? { prevision: false } : {}) };
  return S;
}

/** Copia de trabajo: las funciones que cambian algo trabajan sobre ella (el estado original no se toca). */
export function draft(S: InventoryState): InventoryState {
  return { ...S, items: S.items.map((i) => ({ ...i })), movs: [...S.movs], compras: [...S.compras], ocultas: [...S.ocultas], chatLog: [...S.chatLog],
    ...(S.nutri ? { nutri: { ...S.nutri, vistos: [...S.nutri.vistos], movs: { ...S.nutri.movs }, pendientes: [...S.nutri.pendientes], ...(S.nutri.dias ? { dias: { ...S.nutri.dias } } : {}) } } : {}),
    ...(S.ajustes ? { ajustes: { ...S.ajustes } } : {}) };
}

// ─── Fechas ───────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
export const hoyStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const esFecha = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** Días desde hoy hasta la fecha (negativo = ya pasó). */
export function diasHasta(fecha: string, now: Date): number {
  const [y, m, d] = fecha.split('-').map(Number);
  const a = Date.UTC(y, m - 1, d), b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}

// ─── Texto: nombres, cantidades y a qué área va ───────────────────────────

export const fold = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'para', 'con', 'en', 'y', 'mi', 'mis']);
/**
 * «limones» → «limon», «leches» → «leche», «luces» → «luz». Como en castellano: el singular termina en vocal (+s) o en
 * l, n, r, d, j, y, x (+es). Quitar «es» tras cualquier consonante dejaba «leches» en «lech».
 */
export function singular(w: string): string {
  if (w.length <= 3) return w;
  if (/ces$/.test(w)) return w.slice(0, -3) + 'z';
  if (/[lnrdjyx]es$/.test(w) && w.length > 4) return w.slice(0, -2);
  if (/[aeiou]s$/.test(w)) return w.slice(0, -1);
  return w;
}
/** La clave de un nombre para comparar: sin tildes, mayúsculas, plurales ni artículos. */
export const claveNombre = (s: unknown) => fold(s).replace(/[^a-z0-9ñ ]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w)).map(singular).join(' ');

const NUM_PALABRA: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  quince: 15, veinte: 20, media: 0.5, medio: 0.5,
};
const UNIDAD_PALABRA: Array<[RegExp, Unidad, number?]> = [
  [/^(kg|kgs|kilos?|kilogramos?)$/, 'kg'], [/^(g|gr|grs|gramos?)$/, 'g'],
  [/^(l|lt|lts|litros?)$/, 'L'], [/^(ml|cc|mililitros?)$/, 'ml'],
  [/^(paquetes?|packs?|bolsas?|cajas?|bolsitas?)$/, 'paquete'],
  [/^(unidades?|u|un|latas?|botellas?|frascos?|tarros?|sobres?|rollos?|tubos?|barras?|blisters?|cajitas?|bidones?|envases?|piezas?|pares?)$/, 'u'],
  [/^(docenas?)$/, 'u', 12],
];
const RX_NUM = '(\\d+(?:[.,]\\d+)?|\\d+\\/\\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|media|medio)';
function aNumero(s: string): number | null {
  if (s in NUM_PALABRA) return NUM_PALABRA[s];
  if (/^\d+\/\d+$/.test(s)) { const [a, b] = s.split('/').map(Number); return b ? a / b : null; }
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function aUnidad(w: string): { u: Unidad; mult: number } | null {
  for (const [re, u, mult] of UNIDAD_PALABRA) if (re.test(w)) return { u, mult: mult ?? 1 };
  return null;
}

export interface Cantidad { cant: number; unidad: Unidad; contenido?: Contenido; resto: string }
/**
 * «2 L de leche» → 2 L, «leche»; «6 huevos» → 6 u, «huevos»; «2 paquetes de fideos de 400 g» → 2 paquetes de 400 g;
 * «media docena de huevos» → 6 u; «un shampoo» → 1 u. Sin número: null (quien llama decide: 1 unidad, o preguntar).
 */
export function parseCantidad(texto: string): Cantidad | null {
  let t = ` ${fold(texto)} `;
  t = t.replace(/\bmedia docena\b/g, '6 u').replace(/\buna docena\b/g, '12 u').replace(/\bdocena\b/g, '12 u');
  t = t.replace(/\bkilo y medio\b/g, '1.5 kg').replace(/\blitro y medio\b/g, '1.5 l').replace(/\bmedio kilo\b/g, '0.5 kg').replace(/\bmedio litro\b/g, '0.5 l');
  const re = new RegExp(`(?:^|\\s)${RX_NUM}\\s*(kg|kgs|kilos?|kilogramos?|g|gr|grs|gramos?|l|lt|lts|litros?|ml|cc|mililitros?|paquetes?|packs?|bolsas?|bolsitas?|cajas?|cajitas?|unidades?|u|latas?|botellas?|frascos?|tarros?|sobres?|rollos?|tubos?|barras?|blisters?|bidones?|envases?|piezas?|pares?|docenas?)?(?=\\s|$)`, 'g');
  const hits: Array<{ cant: number; unidad: Unidad | null; mult: number; start: number; end: number }> = [];
  for (const m of t.matchAll(re)) {
    const n = aNumero(m[1]);
    if (n == null || n <= 0) continue;
    const un = m[2] ? aUnidad(m[2]) : null;
    // «un» solo es número si viene antes de una palabra (no «el un»): basta con que haya algo después
    hits.push({ cant: n, unidad: un?.u ?? null, mult: un?.mult ?? 1, start: m.index!, end: m.index! + m[0].length });
  }
  if (!hits.length) return null;
  const a = hits[0];
  let cant = a.cant * a.mult, unidad: Unidad = a.unidad ?? 'u';
  let contenido: Contenido | undefined;
  // Un segundo número con peso o volumen («de 400 g», «de 1 litro»): lo que trae cada unidad o paquete
  const b = hits.slice(1).find((h) => h.unidad && familia(h.unidad) !== 'cuenta');
  if (b && familia(unidad) === 'cuenta') contenido = { cant: b.cant, unidad: b.unidad! };
  // «un kilo», «1 litro»: la cantidad es el peso o el volumen
  let resto = t;
  for (const h of [a, ...(b ? [b] : [])].sort((x, y) => y.start - x.start)) resto = resto.slice(0, h.start) + ' ' + resto.slice(h.end);
  resto = resto.replace(/\b(de|del)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!Number.isFinite(cant) || cant <= 0) return null;
  cant = Math.round(cant * 1000) / 1000;
  return { cant, unidad, ...(contenido ? { contenido } : {}), resto };
}

/** «400 g», «1 L», «1,5 kg» (el contenido de una unidad, escrito en la app). */
export function parseContenido(texto: string): Contenido | null {
  const c = parseCantidad(texto);
  return c && familia(c.unidad) !== 'cuenta' ? { cant: c.cant, unidad: c.unidad } : null;
}

// A qué área va cada cosa por su nombre. Lo que no calza: el que llama pregunta (la app muestra las áreas).
const AREA_RX: Array<[AreaId, RegExp]> = [
  ['mascotas', /\b(perro|perrito|gato|gatito|mascota|arena sanitaria|arena para gato|pellet|whiskas|dog chow|cat chow|master dog|champion dog|pedigree)\b/],
  ['botiquin', /\b(paracetamol|ibuprofeno|aspirina|naproxeno|ketorolaco|diclofenaco|omeprazol|loratadina|cetirizina|desloratadina|metformina|insulina|sitagliptina|losartan|enalapril|atorvastatina|levotiroxina|remedios?|medicament\w*|pastillas?|comprimidos?|capsulas?|jarabe|gotas|curitas?|parches?|vendas?|gasas?|termometro|suero oral|sales de rehidratacion|alcohol (desnaturalizado|70|etilico)|agua oxigenada|povidona|antiseptico|vitaminas?|multivitaminico|omega ?3|magnesio|zinc|hierro|creatina|melatonina|suplementos?|proteina en polvo|whey|colageno|electrolitos?)\b/],
  ['bano', /\b(shampoo|champu|acondicionador|jabon|jabones|gel de ducha|pasta de dientes|pasta dental|cepillo de dientes|cepillos? dental\w*|hilo dental|enjuague bucal|colutorio|desodorante|antitranspirante|papel higienico|confort|toallas? higienicas?|toallitas? humedas?|tampones?|protectores? diarios?|afeitar|maquinas? de afeitar|gillette|espuma de afeitar|crema (corporal|de manos|hidratante|facial)|bloqueador|protector solar|perfume|colonia|panales?|pañales?|cotonitos?|motas|algodon|desmaquillante|maquillaje|cortaunas)\b/],
  ['limpieza', /\b(cloro|lavaloza|lavalozas|detergente|suavizante|quitamanchas|desinfectante|lysoform|limpiador|limpia ?vidrios|esponjas?|virutilla|escobillas?|bolsas? de basura|bolsas? basura|toalla nova|nova|papel absorbente|servilletas?|guantes|trapero|mopa|escoba|pala|cera|abrillantador|insecticida|raid|ampolletas?|pilas?|fosforos|velas?|encendedor|film plastico|papel aluso|alusa|aluminio)\b/],
  ['ropa', /\b(poleras?|camisas?|pantalon\w*|jeans?|calcetines|calcetas|calzoncillos?|boxers?|calzones?|sosten\w*|brasieres?|chaquetas?|polerones?|sweaters?|vestidos?|faldas?|shorts?|pijamas?|zapatillas?|zapatos?|botas?|sandalias?|gorros?|bufandas?|guantes de lana|cinturon\w*|ropa interior|uniforme)\b/],
  ['alimentos', /\b(leche|yogur\w*|queso\w*|quesillo|mantequilla|margarina|crema de leche|huevos?|carnes?|pollo|pavo|cerdo|vacuno|posta|molida|lomo|chuleta\w*|filete|pescado|salmon|merluza|reineta|mariscos?|jamon|vienesas?|salchichas?|longaniza|chorizo|cecinas?|mortadela|salame|pan|panes|marraquetas?|hallullas?|frutas?|manzanas?|platanos?|naranjas?|mandarinas?|peras?|uvas?|frutillas?|kiwis?|limones?|paltas?|tomates?|lechugas?|zanahorias?|cebollas?|papas?|zapallo\w*|pepinos?|pimentones?|brocolis?|coliflor\w*|espinacas?|acelgas?|choclos?|porotos verdes|apio|betarragas?|repollos?|verduras?|hortalizas?|tofu|hummus|jugos? natural\w*|postres?|flan)\b/],
  ['despensa', /\b(arroz|fideos?|tallarines?|spaghetti|pastas?|lentejas?|porotos?|garbanzos?|arvejas?|harina|azucar|endulzante|stevia|sucralosa|sal|aceite|vinagre|atun|jurel|sardinas?|conservas?|duraznos en conserva|cafe|nescafe|te|yerba|cereal\w*|avena|granola|galletas?|salsa\w*|mayonesa|ketchup|mostaza|ketchup|especias|oregano|comino|pimienta|aji|merken|caldo\w*|sopas? de sobre|pure (en polvo|instantaneo)|chocolate\w*|cacao|mermelada|manjar|miel|mani|almendras?|nueces|frutos secos|pasas|chips|papas fritas|snacks?|bebidas?|gaseosas?|agua mineral|jugos?|leche en polvo|leche condensada|polenta|semola|quinoa|chia|linaza|levadura|polvos de hornear|maicena|gelatina|flan en polvo)\b/],
];
/** A qué área va (null = no se sabe: preguntar). El nombre manda sobre la categoría de la boleta. */
export function areaPara(nombre: string): AreaId | null {
  // el nombre tal cual y en singular («leches», «tomates cherry»)
  const t = ` ${fold(nombre)} `, k = ` ${claveNombre(nombre)} `;
  for (const [a, re] of AREA_RX) if (re.test(t) || re.test(k)) return a;
  return null;
}

// ─── Cantidades: convertir y mostrar ──────────────────────────────────────

const r3 = (n: number) => Math.round(n * 1000) / 1000;
/**
 * `cant` en `unidad` → en la unidad del ítem (null si no se puede: «1 paquete» de algo que se cuenta en kg y no se sabe
 * cuánto trae un paquete).
 */
export function convertir(item: Pick<Item, 'unidad' | 'contenido'>, cant: number, unidad: Unidad): number | null {
  const fi = familia(item.unidad), fu = familia(unidad);
  if (fi === fu) return fi === 'cuenta' ? cant : r3((cant * factor(unidad)) / factor(item.unidad));
  const c = item.contenido;
  if (fi === 'cuenta' && c && familia(c.unidad) === fu) return r3((cant * factor(unidad)) / (c.cant * factor(c.unidad)));
  if (fu === 'cuenta' && c && familia(c.unidad) === fi) return r3((cant * c.cant * factor(c.unidad)) / factor(item.unidad));
  return null;
}

const fmtN = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return (Number.isInteger(r) ? String(r) : r.toFixed(r * 10 === Math.round(r * 10) ? 1 : 2)).replace('.', ',');
};
const NOMBRE_U: Record<Unidad, [string, string]> = { u: ['unidad', 'unidades'], paquete: ['paquete', 'paquetes'], g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], L: ['L', 'L'] };
/** «2 L», «500 g», «3 unidades», «2 paquetes de 400 g». */
export function fmtCant(cant: number, unidad: Unidad, contenido?: Contenido | null): string {
  // los gramos y ml grandes se muestran en kg y L
  if ((unidad === 'g' || unidad === 'ml') && cant >= 1000) return fmtCant(cant / 1000, unidad === 'g' ? 'kg' : 'L');
  const [s, p] = NOMBRE_U[unidad];
  const base = `${fmtN(cant)} ${cant === 1 ? s : p}`;
  return contenido && familia(unidad) === 'cuenta' ? `${base} de ${fmtN(contenido.cant)} ${NOMBRE_U[contenido.unidad][0]}` : base;
}
export const cantidadDe = (i: Item) => fmtCant(i.cantidad, i.unidad, i.contenido);

const clp = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

// ─── Buscar ───────────────────────────────────────────────────────────────

/** Qué tan bien calza un ítem con lo que se busca (0–100). */
function puntaje(item: Item, q: string): number {
  const ki = claveNombre(item.nombre), kq = claveNombre(q);
  if (!kq) return 0;
  if (ki === kq) return 100;
  const ti = ki.split(' '), tq = kq.split(' ');
  if (tq.every((w) => ti.includes(w))) return 85 - Math.min(20, ti.length - tq.length);          // «leche» → «leche descremada»
  if (ti.every((w) => tq.includes(w))) return 70;                                                  // «leche descremada colun» → «leche»
  const comunes = tq.filter((w) => ti.includes(w)).length;
  return comunes ? Math.round((comunes / Math.max(tq.length, ti.length)) * 60) : 0;
}
/** Lo que calza con el texto, lo mejor primero (sin los quitados del inventario, salvo que se pida). */
export function buscar(S: InventoryState, q: string, conArchivados = false): Item[] {
  return S.items.filter((i) => conArchivados || !i.archivado).map((i) => ({ i, p: puntaje(i, q) })).filter((x) => x.p >= 50)
    .sort((a, b) => b.p - a.p || b.i.cantidad - a.i.cantidad).map((x) => x.i);
}
/** El ítem que es (uno solo con el mejor puntaje), o los que empatan. */
export function encontrar(S: InventoryState, q: string): { item?: Item; empatados?: Item[] } {
  const xs = S.items.filter((i) => !i.archivado).map((i) => ({ i, p: puntaje(i, q) })).filter((x) => x.p >= 50).sort((a, b) => b.p - a.p);
  if (!xs.length) return {};
  const top = xs.filter((x) => x.p === xs[0].p);
  return top.length === 1 ? { item: top[0].i } : { empatados: top.map((x) => x.i) };
}

// ─── Escribir ─────────────────────────────────────────────────────────────

function addMov(W: InventoryState, m: Omit<Mov, 'id' | 'at'> & { at?: string }, ctx: Ctx): Mov {
  const mov: Mov = { id: ctx.newId(), at: m.at ?? ctx.now.toISOString(), ...m };
  W.movs = [...W.movs, mov].slice(-MAX_MOVS);
  return mov;
}
const setItem = (W: InventoryState, it: Item) => { W.items = W.items.map((x) => (x.id === it.id ? it : x)); };
const num = (x: unknown) => { const n = Number(String(x ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

export interface Entrada {
  nombre: string;
  area?: AreaId | null;
  cantidad?: number | string | null;
  unidad?: Unidad | null;
  contenido?: Contenido | null;
  vence?: string | null;
  minimo?: number | string | null;
  ubicacion?: string | null;
  /** precio TOTAL de lo que compraste (se guarda por unidad) */
  precioTotal?: number | null;
  marca?: string | null;
  barcode?: string | null;
  foodId?: string | null;
  via?: Mov['via'];
}

/**
 * Agregar lo que compraste (o lo que ya tenías al empezar). Si ya está (mismo nombre y área), se SUMA a lo que hay: no se
 * duplica. El vencimiento que queda es el más próximo; el precio, el último.
 */
export function agregar(W: InventoryState, e: Entrada, ctx: Ctx, tipo: 'compra' | 'nuevo' = 'compra'): FormResult {
  const nombre = String(e.nombre || '').trim().replace(/\s+/g, ' ');
  if (!nombre) return NO('Ponle un nombre');
  if (nombre.length > 80) return NO('El nombre es muy largo');
  const cant = e.cantidad == null || e.cantidad === '' ? 1 : num(e.cantidad);
  if (!(cant > 0)) return NO('¿Cuánto? Pon una cantidad mayor que 0');
  const unidad: Unidad = e.unidad && esUnidad(e.unidad) ? e.unidad : 'u';
  if (e.vence != null && e.vence !== '' && !esFecha(e.vence)) return NO('La fecha de vencimiento no es válida');
  const minimo = e.minimo == null || e.minimo === '' ? null : num(e.minimo);
  if (minimo != null && !(minimo >= 0)) return NO('El mínimo tiene que ser un número');
  const k = claveNombre(nombre);
  const ya = W.items.find((i) => claveNombre(i.nombre) === k && (!e.area || i.area === e.area));
  const area: AreaId | null = e.area ?? ya?.area ?? areaPara(nombre);
  if (!area) return NO('Elige en qué área va');
  const precioU = e.precioTotal && e.precioTotal > 0 ? e.precioTotal / cant : null;

  if (ya) {
    const delta = convertir(ya, cant, unidad);
    if (delta == null) return NO(`${ya.nombre} se cuenta en ${NOMBRE_U[ya.unidad][1]}: dime cuánto es en ${NOMBRE_U[ya.unidad][1]}${ya.unidad === 'u' || ya.unidad === 'paquete' ? ' (o cuánto trae cada uno)' : ''}`);
    const it: Item = {
      ...ya, archivado: false, cantidad: r3(ya.cantidad + delta),
      vence: esFecha(e.vence) ? (ya.cantidad > 0 && esFecha(ya.vence) && ya.vence < e.vence ? ya.vence : e.vence) : ya.cantidad > 0 ? ya.vence : null,
      // por unidad del ítem, con centavos: redondear acá hacía que 4 rollos de $4.990 se estimaran en $4.992
      ...(precioU != null ? { precio: Math.round(((precioU * cant) / delta) * 100) / 100 } : {}),
      ...(minimo != null ? { minimo } : {}),
      ...(e.contenido && !ya.contenido ? { contenido: e.contenido } : {}),
      ...(e.ubicacion ? { ubicacion: e.ubicacion } : {}),
      ...(e.marca ? { marca: e.marca } : {}), ...(e.barcode ? { barcode: e.barcode } : {}), ...(e.foodId ? { foodId: e.foodId } : {}),
      revisado: hoyStr(ctx.now),
    };
    setItem(W, it);
    const m = addMov(W, { itemId: it.id, tipo: 'compra', delta, via: e.via ?? 'app', ...(precioU != null ? { precio: Math.round(precioU * cant) } : {}) }, ctx);
    W.compras = W.compras.filter((c) => claveNombre(c.nombre) !== k); // si estaba en la lista, sale
    return OK(`${it.nombre}: ahora tienes ${cantidadDe(it)}`, it.id, m.id);
  }

  const it: Item = {
    id: ctx.newId(), nombre: nombre[0].toUpperCase() + nombre.slice(1), area, cantidad: r3(cant), unidad,
    ...(e.contenido && familia(unidad) === 'cuenta' ? { contenido: e.contenido } : {}),
    vence: esFecha(e.vence) ? e.vence : null, minimo, ...(e.ubicacion ? { ubicacion: e.ubicacion.trim() } : {}),
    precio: precioU != null ? Math.round(precioU * 100) / 100 : null,
    ...(e.marca ? { marca: e.marca } : {}), ...(e.barcode ? { barcode: e.barcode } : {}), ...(e.foodId ? { foodId: e.foodId } : {}),
    revisado: hoyStr(ctx.now), creado: hoyStr(ctx.now),
  };
  W.items = [...W.items, it];
  const m = addMov(W, { itemId: it.id, tipo, delta: it.cantidad, via: e.via ?? 'app', ...(precioU != null ? { precio: Math.round(precioU * cant) } : {}) }, ctx);
  W.compras = W.compras.filter((c) => claveNombre(c.nombre) !== k);
  return OK(`${it.nombre} agregado: ${cantidadDe(it)} en ${AREA[area].nombre}`, it.id, m.id);
}

/** Usaste o comiste algo: baja lo que hay (nunca bajo 0). Sin cantidad: 1 unidad (si se cuenta por unidades). */
export function consumir(W: InventoryState, itemId: number, cant: number | null | undefined, unidad: Unidad | null | undefined, ctx: Ctx, via: Mov['via'] = 'app'): FormResult {
  const it = W.items.find((i) => i.id === itemId);
  if (!it) return NO('Ya no está en tu inventario');
  if (it.cantidad <= 0) return NO(`No te queda ${it.nombre.toLowerCase()} anotado`);
  let delta: number | null;
  if (cant == null) delta = familia(it.unidad) === 'cuenta' ? 1 : null;
  else delta = convertir(it, cant, unidad ?? it.unidad);
  if (delta == null) return NO(cant == null ? `¿Cuánto ${it.nombre.toLowerCase()} usaste? (tienes ${cantidadDe(it)})` : `${it.nombre} se cuenta en ${NOMBRE_U[it.unidad][1]}: dime cuánto es en ${NOMBRE_U[it.unidad][1]}`);
  if (!(delta > 0)) return NO('¿Cuánto? Pon una cantidad mayor que 0');
  const usado = Math.min(delta, it.cantidad);
  const nuevo: Item = { ...it, cantidad: r3(it.cantidad - usado), ...(it.cantidad - usado <= 0 ? { vence: null } : {}) };
  setItem(W, nuevo);
  const m = addMov(W, { itemId: it.id, tipo: 'consumo', delta: -r3(usado), via }, ctx);
  const msg = nuevo.cantidad <= 0 ? `${it.nombre}: se acabó${delta > it.cantidad ? ` (tenías ${cantidadDe(it)})` : ''}` : `${it.nombre}: te quedan ${cantidadDe(nuevo)}`;
  return OK(msg, it.id, m.id);
}

/** El conteo real: «me quedan 3». Queda anotado como ajuste (la diferencia) y como revisado hoy. */
export function ajustar(W: InventoryState, itemId: number, cant: number | string, unidad: Unidad | null | undefined, ctx: Ctx, via: Mov['via'] = 'app'): FormResult {
  const it = W.items.find((i) => i.id === itemId);
  if (!it) return NO('Ya no está en tu inventario');
  const n = num(cant);
  if (!(n >= 0)) return NO('Pon cuánto hay (0 si se acabó)');
  const real = convertir(it, n, unidad ?? it.unidad);
  if (real == null) return NO(`${it.nombre} se cuenta en ${NOMBRE_U[it.unidad][1]}`);
  const delta = r3(real - it.cantidad);
  const nuevo: Item = { ...it, cantidad: r3(real), revisado: hoyStr(ctx.now), ...(real <= 0 ? { vence: null } : {}) };
  setItem(W, nuevo);
  if (delta === 0) return OK(`${it.nombre}: confirmado, ${cantidadDe(nuevo)}`, it.id);
  const m = addMov(W, { itemId: it.id, tipo: 'ajuste', delta, via }, ctx);
  return OK(real <= 0 ? `${it.nombre}: se acabó` : `${it.nombre}: ahora ${cantidadDe(nuevo)}`, it.id, m.id);
}

/** «Está bien»: lo que dice el inventario es lo que hay (revisión de la semana). */
export function confirmar(W: InventoryState, itemId: number, ctx: Ctx): FormResult {
  const it = W.items.find((i) => i.id === itemId);
  if (!it) return NO('Ya no está en tu inventario');
  setItem(W, { ...it, revisado: hoyStr(ctx.now) });
  return OK(`${it.nombre}: confirmado`, it.id);
}

/** Se botó (vencido, malo, roto): sale del inventario y queda anotado aparte (no cuenta como consumo). */
export function botar(W: InventoryState, itemId: number, cant: number | null | undefined, unidad: Unidad | null | undefined, motivo: string, ctx: Ctx, via: Mov['via'] = 'app'): FormResult {
  const it = W.items.find((i) => i.id === itemId);
  if (!it) return NO('Ya no está en tu inventario');
  if (it.cantidad <= 0) return NO(`No te queda ${it.nombre.toLowerCase()} anotado`);
  const d = cant == null ? it.cantidad : convertir(it, cant, unidad ?? it.unidad);
  if (d == null || !(d > 0)) return NO('¿Cuánto botaste?');
  const sale = Math.min(d, it.cantidad);
  const nuevo: Item = { ...it, cantidad: r3(it.cantidad - sale), ...(it.cantidad - sale <= 0 ? { vence: null } : {}) };
  setItem(W, nuevo);
  const m = addMov(W, { itemId: it.id, tipo: 'botado', delta: -r3(sale), via, ...(motivo ? { nota: motivo.slice(0, 60) } : {}) }, ctx);
  return OK(`${it.nombre}: ${fmtCant(sale, it.unidad)} a la basura${nuevo.cantidad > 0 ? `; quedan ${cantidadDe(nuevo)}` : ''}`, it.id, m.id);
}

/** Cambiar de área o de lugar. */
export function mover(W: InventoryState, itemId: number, area: AreaId, ubicacion: string | null | undefined, ctx: Ctx): FormResult {
  const it = W.items.find((i) => i.id === itemId);
  if (!it) return NO('Ya no está en tu inventario');
  if (!esArea(area)) return NO('Elige un área');
  const nuevo: Item = { ...it, area, ...(ubicacion != null ? { ubicacion: ubicacion.trim() || undefined } : {}) };
  setItem(W, nuevo);
  if (area !== it.area) addMov(W, { itemId: it.id, tipo: 'movido', delta: 0, desde: it.area, hacia: area }, ctx);
  return OK(area !== it.area ? `${it.nombre} → ${AREA[area].nombre}` : `${it.nombre}: guardado`, it.id);
}

export interface Edicion { nombre?: string; vence?: string | null; minimo?: number | string | null; ubicacion?: string | null; contenido?: Contenido | null; marca?: string | null }
/** Lo que describe un ítem (no su cantidad: eso es consumo, compra o conteo, para que el historial cuadre). */
export function editar(W: InventoryState, itemId: number, e: Edicion): FormResult {
  const it = W.items.find((i) => i.id === itemId);
  if (!it) return NO('Ya no está en tu inventario');
  const nombre = e.nombre != null ? String(e.nombre).trim().replace(/\s+/g, ' ') : it.nombre;
  if (!nombre) return NO('Ponle un nombre');
  if (e.vence != null && e.vence !== '' && !esFecha(e.vence)) return NO('La fecha de vencimiento no es válida');
  const minimo = e.minimo === undefined ? it.minimo : e.minimo === null || e.minimo === '' ? null : num(e.minimo);
  if (minimo != null && !(minimo >= 0)) return NO('El mínimo tiene que ser un número');
  const nuevo: Item = {
    ...it, nombre, minimo,
    ...(e.vence !== undefined ? { vence: esFecha(e.vence) ? e.vence : null } : {}),
    ...(e.ubicacion !== undefined ? { ubicacion: e.ubicacion?.trim() || undefined } : {}),
    ...(e.contenido !== undefined && familia(it.unidad) === 'cuenta' ? { contenido: e.contenido ?? undefined } : {}),
    ...(e.marca !== undefined ? { marca: e.marca?.trim() || undefined } : {}),
  };
  setItem(W, nuevo);
  return OK(`${nombre}: guardado`, it.id);
}

/** Quitar del inventario: si no hay nada, se archiva (no vuelve a la lista de compras); «borrar» lo elimina con su historial. */
export function quitar(W: InventoryState, itemId: number, borrarTodo = false, ctx?: Ctx): FormResult {
  const it = W.items.find((i) => i.id === itemId);
  if (!it) return NO('Ya no está en tu inventario');
  if (borrarTodo) {
    W.items = W.items.filter((i) => i.id !== itemId);
    W.movs = W.movs.filter((m) => m.itemId !== itemId);
    return OK(`${it.nombre}: borrado`);
  }
  // lo que quedaba sale con un ajuste, para que el historial cuadre
  if (it.cantidad > 0 && ctx) addMov(W, { itemId: it.id, tipo: 'ajuste', delta: -it.cantidad, nota: 'ya no lo sigo' }, ctx);
  setItem(W, { ...it, archivado: true, cantidad: 0, vence: null });
  return OK(`${it.nombre}: ya no lo sigo (no vuelve a la lista de compras)`);
}

/** Deshacer un movimiento (el último de un ítem, o el que diga el chat): la cantidad vuelve a lo que era. */
export function deshacer(W: InventoryState, movId: number): FormResult {
  const m = W.movs.find((x) => x.id === movId);
  if (!m) return NO('Ese movimiento ya no está');
  const it = W.items.find((i) => i.id === m.itemId);
  W.movs = W.movs.filter((x) => x.id !== movId);
  W.chatLog = W.chatLog.filter((c) => c.movId !== movId);
  if (!it) return OK('Deshecho');
  // Era lo que lo creó (no le queda otro movimiento): se va del inventario
  if ((m.tipo === 'nuevo' || m.tipo === 'compra') && !W.movs.some((x) => x.itemId === it.id)) {
    W.items = W.items.filter((i) => i.id !== it.id);
    return OK(`${it.nombre}: deshecho (ya no está)`);
  }
  if (m.tipo === 'movido' && m.desde) { setItem(W, { ...it, area: m.desde }); return OK(`${it.nombre}: de vuelta en ${AREA[m.desde].nombre}`); }
  const nuevo: Item = { ...it, cantidad: Math.max(0, r3(it.cantidad - m.delta)), archivado: false };
  setItem(W, nuevo);
  return OK(`${it.nombre}: deshecho, quedan ${cantidadDe(nuevo)}`);
}

// ─── Lista de compras (a mano) ────────────────────────────────────────────

export function anotarCompra(W: InventoryState, nombre: string, cant: number | null | undefined, unidad: Unidad | null | undefined, ctx: Ctx): FormResult {
  const n = String(nombre || '').trim().replace(/\s+/g, ' ');
  if (!n) return NO('¿Qué hay que comprar?');
  const k = claveNombre(n);
  if (W.compras.some((c) => claveNombre(c.nombre) === k)) return OK(`${n} ya está en la lista`);
  const c: Compra = { id: ctx.newId(), nombre: n[0].toUpperCase() + n.slice(1), cant: cant && cant > 0 ? cant : null, unidad: unidad ?? null, area: areaPara(n), creado: hoyStr(ctx.now) };
  W.compras = [...W.compras, c];
  return OK(`${c.nombre}: a la lista de compras`, c.id);
}
export function quitarCompra(W: InventoryState, id: number): FormResult {
  const c = W.compras.find((x) => x.id === id);
  if (!c) return NO('Ya no está en la lista');
  W.compras = W.compras.filter((x) => x.id !== id);
  return OK(`${c.nombre}: fuera de la lista`);
}

export function ocultarArea(W: InventoryState, area: AreaId, ocultar: boolean): FormResult {
  if (!esArea(area)) return NO('Elige un área');
  W.ocultas = ocultar ? [...new Set([...W.ocultas, area])] : W.ocultas.filter((a) => a !== area);
  return OK(`${AREA[area].nombre}: ${ocultar ? 'oculta' : 'visible'}`);
}

// ─── Leer: lo que se vence, lo que se acaba, la lista y la revisión ────────

const activos = (S: InventoryState) => S.items.filter((i) => !i.archivado);
export const areasVisibles = (S: InventoryState) => AREAS.filter((a) => !S.ocultas.includes(a.id) || S.items.some((i) => i.area === a.id && !i.archivado && i.cantidad > 0));

export interface Vence { item: Item; dias: number }
/** Lo que vence en los próximos `dias` (y lo ya vencido), lo más urgente primero. */
export function porVencer(S: InventoryState, now: Date, dias = 7): Vence[] {
  return activos(S).filter((i) => i.cantidad > 0 && esFecha(i.vence)).map((i) => ({ item: i, dias: diasHasta(i.vence!, now) }))
    .filter((v) => v.dias <= dias).sort((a, b) => a.dias - b.dias);
}

/** `pronto` (A3): todavía hay, pero a tu ritmo de consumo se acaba en `dias` días o menos */
export interface Falta { item: Item; estado: 'acabado' | 'poco' | 'pronto'; sugerida: number | null; costo: number | null; dias?: number }
/** Se va a acabar «pronto»: a tu ritmo, en estos días o menos */
export const PRONTO_DIAS = 3;
const VENTANA_RITMO = 14;

/**
 * Cuánto usas de algo por día (Eris administra, A3): lo que salió por consumo en las últimas 2 semanas, repartido en los días
 * desde el primer consumo (mínimo 3, para que dos usos seguidos no parezcan un ritmo enorme). Con menos de 2 consumos, null.
 */
export function ritmoConsumo(S: InventoryState, it: Item, now: Date): number | null {
  const desde = now.getTime() - VENTANA_RITMO * 86_400_000;
  const ms = S.movs.filter((m) => m.itemId === it.id && m.tipo === 'consumo' && m.delta < 0 && Date.parse(m.at) >= desde && Date.parse(m.at) <= now.getTime());
  if (ms.length < 2) return null;
  const primero = Math.min(...ms.map((m) => Date.parse(m.at)));
  const dias = Math.max(3, Math.min(VENTANA_RITMO, (now.getTime() - primero) / 86_400_000));
  const total = ms.reduce((a, m) => a - m.delta, 0);
  return total > 0 ? total / dias : null;
}

/**
 * Lo que se acabó, está bajo su mínimo o (A3) se va a acabar en pocos días a tu ritmo (solo lo que se consume: la ropa y los
 * objetos no se «acaban»).
 */
export function faltantes(S: InventoryState, now: Date = new Date()): Falta[] {
  const out: Falta[] = [];
  const prevision = S.ajustes?.prevision !== false;
  for (const i of activos(S)) {
    if (!AREA[i.area].consumible) continue;
    // Lo de todos los días (un remedio) avisa cuando alcanza para una semana o menos
    const dias = diasQueAlcanza(i);
    const acabado = i.cantidad <= 0, poco = !acabado && ((i.minimo != null && i.minimo > 0 && i.cantidad <= i.minimo) || (dias != null && dias <= 7));
    const ritmo = !acabado && !poco && prevision && dias == null ? ritmoConsumo(S, i, now) : null;
    const quedan = ritmo ? Math.floor(i.cantidad / ritmo) : null;
    const pronto = quedan != null && quedan <= PRONTO_DIAS;
    if (!acabado && !poco && !pronto) continue;
    // Cuánto comprar: lo que compraste la última vez; si no, lo que falta para el doble del mínimo; si no, una semana a tu ritmo; si no, 1
    const ultima = [...S.movs].reverse().find((m) => m.itemId === i.id && (m.tipo === 'compra' || m.tipo === 'nuevo') && m.delta > 0)?.delta ?? null;
    const semana = ritmo ? (familia(i.unidad) === 'cuenta' ? Math.ceil(ritmo * 7) : ritmo * 7) : null;
    const sugerida = ultima ?? (i.minimo ? Math.max(i.minimo * 2 - i.cantidad, 1) : semana ?? (familia(i.unidad) === 'cuenta' ? 1 : null));
    out.push({ item: i, estado: acabado ? 'acabado' : poco ? 'poco' : 'pronto', sugerida: sugerida != null ? r3(sugerida) : null, costo: sugerida != null && i.precio ? Math.round(sugerida * i.precio) : null,
      ...(pronto ? { dias: quedan! } : {}) });
  }
  const orden = { acabado: 0, poco: 1, pronto: 2 } as const;
  return out.sort((a, b) => (a.estado === b.estado ? a.item.nombre.localeCompare(b.item.nombre) : orden[a.estado] - orden[b.estado]));
}

export interface ListaCompras { auto: Falta[]; manual: Compra[]; total: number; conPrecio: number; sinPrecio: number }
/** La lista de compras: lo que falta (solo) + lo anotado a mano, con el costo estimado por el último precio. */
export function listaCompras(S: InventoryState, now: Date = new Date()): ListaCompras {
  const auto = faltantes(S, now);
  const enAuto = new Set(auto.map((f) => claveNombre(f.item.nombre)));
  const manual = S.compras.filter((c) => !enAuto.has(claveNombre(c.nombre)));
  // lo anotado a mano que ya está en el inventario tiene precio conocido
  let total = 0, conPrecio = 0, sinPrecio = 0;
  for (const f of auto) { if (f.costo != null) { total += f.costo; conPrecio++; } else sinPrecio++; }
  for (const c of manual) {
    const it = activos(S).find((i) => claveNombre(i.nombre) === claveNombre(c.nombre)) ?? S.items.find((i) => claveNombre(i.nombre) === claveNombre(c.nombre));
    if (it?.precio) { total += Math.round(it.precio * (c.cant && c.unidad ? convertir(it, c.cant, c.unidad) ?? 1 : c.cant ?? 1)); conPrecio++; } else sinPrecio++;
  }
  return { auto, manual, total, conPrecio, sinPrecio };
}

/** La revisión de la semana: lo que se consume y no se cuenta hace 7 días o más (lo más antiguo primero), hasta `max`. */
export function revision(S: InventoryState, now: Date, max = 12): Item[] {
  const hoy = hoyStr(now);
  return activos(S).filter((i) => AREA[i.area].consumible && i.cantidad > 0 && (!i.revisado || diasHasta(i.revisado, now) <= -7) && i.revisado !== hoy)
    .sort((a, b) => String(a.revisado ?? '').localeCompare(String(b.revisado ?? ''))).slice(0, max);
}

export interface ResumenArea { area: AreaDef; items: number; conStock: number; vence: number; faltan: number }
export function resumenAreas(S: InventoryState, now: Date): ResumenArea[] {
  const pv = porVencer(S, now, 3), fa = faltantes(S);
  return areasVisibles(S).map((a) => ({
    area: a,
    items: activos(S).filter((i) => i.area === a.id).length,
    conStock: activos(S).filter((i) => i.area === a.id && i.cantidad > 0).length,
    vence: pv.filter((v) => v.item.area === a.id).length,
    faltan: fa.filter((f) => f.item.area === a.id).length,
  }));
}

/** El historial de un ítem (lo más nuevo primero). */
export const historial = (S: InventoryState, itemId: number) => S.movs.filter((m) => m.itemId === itemId).slice().reverse();

// ─── Lo que lee Eris ──────────────────────────────────────────────────────

const venceTxt = (d: number) => (d < 0 ? `venció hace ${-d} día${d === -1 ? '' : 's'}` : d === 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence en ${d} días`);

/**
 * El contexto para el chat y los números para avisos. Lo de Alimentos y Despensa va con cantidades (el asesor de comida arma
 * primero con lo que hay: fase I7).
 */
export function extract(S: InventoryState, now: Date) {
  const act = activos(S), pv = porVencer(S, now, 5), L = listaCompras(S, now);
  const conStock = act.filter((i) => i.cantidad > 0);
  let ctx = '\n\n## Inventario del usuario (lo que tiene en su casa):\n';
  if (!act.length) {
    ctx += '- Todavía no anota nada en Inventario (no sabes qué tiene en casa: no lo supongas).\n';
  } else {
    ctx += `- ${conStock.length} cosa${conStock.length === 1 ? '' : 's'} con stock: ${resumenAreas(S, now).filter((r) => r.conStock).map((r) => `${r.area.corto} ${r.conStock}`).join(' · ')}\n`;
    if (pv.length) ctx += `- Por vencer: ${pv.slice(0, 8).map((v) => `${v.item.nombre} (${venceTxt(v.dias)})`).join('; ')}\n`;
    const acab = L.auto.filter((f) => f.estado === 'acabado'), poco = L.auto.filter((f) => f.estado === 'poco');
    if (acab.length) ctx += `- Se acabó: ${acab.slice(0, 10).map((f) => f.item.nombre).join(', ')}\n`;
    if (poco.length) ctx += `- Queda poco: ${poco.slice(0, 10).map((f) => `${f.item.nombre} (${cantidadDe(f.item)})`).join(', ')}\n`;
    const pronto = L.auto.filter((f) => f.estado === 'pronto');
    if (pronto.length) ctx += `- Se acaba pronto a su ritmo (ya está en su lista de compras): ${pronto.slice(0, 10).map((f) => `${f.item.nombre} (~${f.dias} día${f.dias === 1 ? '' : 's'})`).join(', ')}\n`;
    if (L.manual.length) ctx += `- Anotado para comprar: ${L.manual.slice(0, 10).map((c) => c.nombre).join(', ')}\n`;
    const diarios = act.filter((i) => i.toma);
    if (diarios.length) ctx += `- Lo de todos los días (botiquín): ${diarios.map((i) => { const d = diasQueAlcanza(i); return `${i.nombre} ${i.cantidad > 0 ? `te alcanza ~${d} día${d === 1 ? '' : 's'}` : 'se acabó'}`; }).join('; ')}\n`;
    const comida = conStock.filter((i) => i.area === 'alimentos' || i.area === 'despensa');
    if (comida.length) ctx += `- Comida en casa: ${comida.slice(0, 40).map((i) => `${i.nombre} ${cantidadDe(i)}`).join(', ')}\n`;
  }
  return {
    context: ctx,
    summary: {
      items: act.length, conStock: conStock.length,
      porVencer: pv.map((v) => ({ nombre: v.item.nombre, dias: v.dias })).slice(0, 12),
      acabados: L.auto.filter((f) => f.estado === 'acabado').map((f) => f.item.nombre).slice(0, 20),
      poco: L.auto.filter((f) => f.estado === 'poco').map((f) => f.item.nombre).slice(0, 20),
      pronto: L.auto.filter((f) => f.estado === 'pronto').map((f) => ({ nombre: f.item.nombre, dias: f.dias ?? null })).slice(0, 20),
      lista: L.auto.length + L.manual.length, listaTotal: L.total,
      comida: conStock.filter((i) => i.area === 'alimentos' || i.area === 'despensa').map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad, ...(i.vence ? { vence: i.vence } : {}) })).slice(0, 80),
    },
  };
}

// ─── Operaciones del chat ─────────────────────────────────────────────────
// El servidor (inventory_tracker) manda {action, producto, cantidad, unidad…}; se aplican con las MISMAS reglas que la app
// y se contesta con lo que de verdad quedó (Eris solo dice «anotado» con esa respuesta).

export interface OpResult { ok: boolean; code?: string; msg?: string; opciones?: string[]; data?: any }
export const OP_ACTIONS = ['compra', 'consumo', 'se_acabo', 'quedan', 'botar', 'consultar', 'en_area', 'lista', 'agregar_lista', 'por_vencer', 'resumen', 'deshacer'] as const;
export type OpAction = typeof OP_ACTIONS[number];

const vista = (i: Item, now: Date) => ({ nombre: i.nombre, area: AREA[i.area].nombre, cantidad: cantidadDe(i), hay: i.cantidad > 0, ...(esFecha(i.vence) ? { vence: venceTxt(diasHasta(i.vence!, now)) } : {}), ...(i.ubicacion ? { ubicacion: i.ubicacion } : {}) });

export function applyOp(S: InventoryState, op: any, ctx: Ctx): { state: InventoryState; result: OpResult } {
  const W = draft(S);
  const result = applyOpOn(W, op || {}, ctx);
  return { state: W, result };
}

function applyOpOn(W: InventoryState, op: any, ctx: Ctx): OpResult {
  const fail = (code: string, msg: string, extra?: Record<string, unknown>): OpResult => ({ ok: false, code, msg, ...(extra || {}) });
  const action = String(op.action || '') as OpAction;
  const producto = String(op.producto || '').trim().slice(0, 80);
  const cant = op.cantidad != null && Number(op.cantidad) > 0 ? Number(op.cantidad) : null;
  const unidad: Unidad | null = esUnidad(op.unidad) ? op.unidad : null;
  const log = (r: FormResult & { movId?: number }) => { if (r.ok && r.movId != null) W.chatLog = [...W.chatLog, { movId: r.movId, at: ctx.now.getTime() }].slice(-40); };
  /** el ítem del que habla (uno solo), o por qué no */
  const cual = (): { item?: Item; fail?: OpResult } => {
    if (!producto) return { fail: fail('invalido', '¿De qué producto?') };
    const r = encontrar(W, producto);
    if (r.item) return { item: r.item };
    if (r.empatados) return { fail: fail('ambiguo', `«${producto}» calza con ${r.empatados.length} cosas`, { opciones: r.empatados.map((i) => i.nombre), data: { campo: 'producto' } }) };
    return { fail: fail('no_encontrado', `No tengo «${producto}» en tu inventario`) };
  };

  switch (action) {
    case 'compra': {
      if (!producto) return fail('invalido', '¿Qué compraste?');
      const area = esArea(op.area) ? op.area : null;
      // Si ya está, va donde está; si no, por su nombre; si tampoco, se pregunta el área
      const ya = encontrar(W, producto).item;
      const a = area ?? ya?.area ?? areaPara(producto);
      if (!a) return fail('falta_area', `¿En qué área guardo «${producto}»?`, { opciones: AREAS.filter((x) => !W.ocultas.includes(x.id)).map((x) => x.nombre), data: { campo: 'area' } });
      const contenido = op.contenido && esUnidad(op.contenido.unidad) && Number(op.contenido.cant) > 0 ? { cant: Number(op.contenido.cant), unidad: op.contenido.unidad as Unidad } : null;
      // Sin cantidad: lo que compras normalmente de eso (la última compra); si se cuenta por unidades, 1; si no, se pregunta
      // («compré arroz» no puede sumar 1 gramo)
      let c0 = cant, u0 = unidad;
      if (c0 == null) {
        const ultima = ya ? [...W.movs].reverse().find((m) => m.itemId === ya.id && (m.tipo === 'compra' || m.tipo === 'nuevo') && m.delta > 0) : null;
        if (ultima) { c0 = ultima.delta; u0 = ya!.unidad; }
        else if (!ya || familia(ya.unidad) === 'cuenta') { c0 = 1; u0 = ya ? ya.unidad : 'u'; }
        else return fail('falta_cantidad', `¿Cuánto ${ya.nombre.toLowerCase()} compraste? (lo cuento en ${NOMBRE_U[ya.unidad][1]})`, { data: { campo: 'cantidad' } });
      }
      const r = agregar(W, { nombre: ya ? ya.nombre : producto, area: ya ? ya.area : a, cantidad: c0, unidad: u0 ?? 'u', contenido, vence: esFecha(op.vence) ? op.vence : null, precioTotal: Number(op.precio) > 0 ? Number(op.precio) : null, via: 'eris' }, ctx);
      if (!r.ok) return fail('invalido', r.msg);
      log(r);
      const it = W.items.find((i) => i.id === r.id)!;
      return { ok: true, data: { ...vista(it, ctx.now), nuevo: !ya, agregado: fmtCant(c0!, u0 ?? 'u'), supuesto: cant == null } };
    }
    case 'consumo': {
      const c = cual(); if (c.fail) return c.fail;
      const r = consumir(W, c.item!.id, cant, unidad, ctx, 'eris');
      if (!r.ok) return fail(c.item!.cantidad <= 0 ? 'sin_stock' : 'falta_cantidad', r.msg);
      log(r);
      const it = W.items.find((i) => i.id === c.item!.id)!;
      return { ok: true, data: { ...vista(it, ctx.now), usado: cant != null ? fmtCant(cant, unidad ?? c.item!.unidad) : fmtCant(1, it.unidad), acabado: it.cantidad <= 0 } };
    }
    case 'se_acabo': {
      const c = cual(); if (c.fail) return c.fail;
      const r = ajustar(W, c.item!.id, 0, null, ctx, 'eris');
      if (!r.ok) return fail('invalido', r.msg);
      log(r);
      return { ok: true, data: { ...vista(W.items.find((i) => i.id === c.item!.id)!, ctx.now), acabado: true } };
    }
    case 'quedan': {
      if (cant == null && Number(op.cantidad) !== 0) return fail('falta_cantidad', `¿Cuánto ${producto ? `«${producto}»` : ''} te queda?`);
      const c = cual(); if (c.fail) return c.fail;
      const r = ajustar(W, c.item!.id, cant ?? 0, unidad, ctx, 'eris');
      if (!r.ok) return fail('invalido', r.msg);
      log(r);
      return { ok: true, data: { ...vista(W.items.find((i) => i.id === c.item!.id)!, ctx.now) } };
    }
    case 'botar': {
      const c = cual(); if (c.fail) return c.fail;
      const r = botar(W, c.item!.id, cant, unidad, String(op.motivo || 'vencido'), ctx, 'eris');
      if (!r.ok) return fail('invalido', r.msg);
      log(r);
      return { ok: true, data: { ...vista(W.items.find((i) => i.id === c.item!.id)!, ctx.now), botado: cant != null ? fmtCant(cant, unidad ?? c.item!.unidad) : 'todo' } };
    }
    case 'consultar': {
      if (!producto) return fail('invalido', '¿Qué producto buscas?');
      const xs = buscar(W, producto).slice(0, 5);
      return { ok: true, data: { producto, items: xs.map((i) => vista(i, ctx.now)), vacio: !W.items.some((i) => !i.archivado) } };
    }
    case 'en_area': {
      // «¿qué tengo en la despensa?»: lo que hay en un área (con stock primero)
      if (!esArea(op.area)) return fail('invalido', '¿De qué área?', { opciones: AREAS.map((a) => a.nombre), data: { campo: 'area' } });
      const xs = activos(W).filter((i) => i.area === op.area).sort((a, b) => Number(b.cantidad > 0) - Number(a.cantidad > 0) || a.nombre.localeCompare(b.nombre));
      return { ok: true, data: { area: AREA[op.area as AreaId].nombre, icono: AREA[op.area as AreaId].icono, items: xs.slice(0, 40).map((i) => vista(i, ctx.now)), total: xs.length, vacio: !W.items.some((i) => !i.archivado) } };
    }
    case 'lista': {
      const L = listaCompras(W);
      return { ok: true, data: {
        auto: L.auto.map((f) => ({ nombre: f.item.nombre, estado: f.estado, ...(f.sugerida != null ? { sugerida: fmtCant(f.sugerida, f.item.unidad) } : {}), ...(f.costo != null ? { costo: f.costo } : {}) })),
        manual: L.manual.map((c) => ({ nombre: c.nombre, ...(c.cant ? { cantidad: fmtCant(c.cant, c.unidad ?? 'u') } : {}) })),
        total: L.total, sinPrecio: L.sinPrecio, vacio: !W.items.some((i) => !i.archivado) && !W.compras.length } };
    }
    case 'agregar_lista': {
      const r = anotarCompra(W, producto, cant, unidad, ctx);
      if (!r.ok) return fail('invalido', r.msg);
      return { ok: true, data: { nombre: producto, lista: W.compras.length } };
    }
    case 'por_vencer': {
      const pv = porVencer(W, ctx.now, Number(op.dias) > 0 ? Math.min(60, Number(op.dias)) : 7);
      return { ok: true, data: { items: pv.map((v) => ({ nombre: v.item.nombre, cantidad: cantidadDe(v.item), cuando: venceTxt(v.dias), dias: v.dias })), vacio: !W.items.some((i) => !i.archivado) } };
    }
    case 'resumen': {
      const ex = extract(W, ctx.now).summary;
      return { ok: true, data: { ...ex, areas: resumenAreas(W, ctx.now).filter((r) => r.items).map((r) => ({ nombre: r.area.nombre, icono: r.area.icono, conStock: r.conStock, items: r.items })) } };
    }
    case 'deshacer': {
      const last = W.chatLog[W.chatLog.length - 1];
      if (!last) return fail('nada_que_deshacer', 'No tengo nada reciente anotado por chat en Inventario para deshacer');
      const m = W.movs.find((x) => x.id === last.movId);
      const it = m ? W.items.find((i) => i.id === m.itemId) : null;
      const r = deshacer(W, last.movId);
      if (!r.ok) { W.chatLog = W.chatLog.slice(0, -1); return fail('nada_que_deshacer', 'Ese registro ya no existe (quizás lo cambiaste en la app)'); }
      return { ok: true, data: { nombre: it?.nombre ?? '', msg: r.msg } };
    }
    default: return fail('invalido', 'Operación desconocida');
  }
}

/** Texto corto para la respuesta de una compra (lo usa el servidor al armar la respuesta). */
export const precioTxt = (n: number) => clp(n);

// ─── Lo de todos los días: remedios y suplementos (fase I3) ────────────────

/**
 * Cuántas tomas al día dice el horario del perfil («mañana y noche» → 2, «cada 8 horas» → 3, «antes de cada comida» → 3).
 * null = no se entiende (la persona lo pone a mano). No es una indicación: es leer lo que la persona anotó.
 */
export function tomasDeHorario(horario: string | null | undefined): number | null {
  const t = fold(horario);
  if (!t) return null;
  const cada = t.match(/cada (\d{1,2}) ?(?:h|hr|hrs|horas?)\b/);
  if (cada) { const h = Number(cada[1]); return h >= 1 && h <= 24 ? Math.max(1, Math.round(24 / h)) : null; }
  const veces = t.match(/(\d|una|dos|tres|cuatro)\s*(?:vez|veces)\s*(?:al|por|a)l?\s*dia/);
  if (veces) return ({ una: 1, dos: 2, tres: 3, cuatro: 4 } as Record<string, number>)[veces[1]] ?? Number(veces[1]);
  if (/cada comida|con (?:las|cada) comidas?/.test(t)) return 3;
  const momentos = ['manana|desayuno|ayunas|al despertar', 'mediodia|almuerzo', 'tarde|once', 'noche|cena|acostarse|dormir'].filter((m) => new RegExp(`\\b(${m})\\b`).test(t)).length;
  if (momentos) return momentos;
  if (/\b(diari\w*|al dia|todos los dias|una vez)\b/.test(t)) return 1;
  return null;
}

/** Para cuántos días alcanza lo que hay, si se usa todos los días (null = no es de todos los días). */
export function diasQueAlcanza(it: Item): number | null {
  if (!it.toma || !(it.toma.porToma > 0) || !(it.toma.tomasDia > 0)) return null;
  return Math.floor(it.cantidad / (it.toma.porToma * it.toma.tomasDia));
}

/** Un remedio o suplemento que se usa todos los días: cuánto por toma y cuántas tomas (lo dice la persona). */
export function configurarToma(W: InventoryState, itemId: number, porToma: number | string, tomasDia: number | string, ctx: Ctx, medId?: string | null): FormResult {
  const it = W.items.find((i) => i.id === itemId);
  if (!it) return NO('Ya no está en tu inventario');
  const pt = num(porToma), td = num(tomasDia);
  if (!(pt > 0) || !(td > 0) || td > 12) return NO('Pon cuántas unidades por toma y cuántas tomas al día (como te lo indicaron)');
  const ayer = hoyStr(new Date(ctx.now.getFullYear(), ctx.now.getMonth(), ctx.now.getDate() - 1));
  setItem(W, { ...it, toma: { porToma: pt, tomasDia: td, ultimo: it.toma?.ultimo ?? ayer }, ...(medId ? { medId } : {}) });
  const d = diasQueAlcanza({ ...it, toma: { porToma: pt, tomasDia: td, ultimo: ayer } });
  return OK(`${it.nombre}: ${fmtCant(pt, it.unidad)} × ${td} al día${d != null ? `; te alcanza ~${d} día${d === 1 ? '' : 's'}` : ''}`, it.id);
}
export function quitarToma(W: InventoryState, itemId: number): FormResult {
  const it = W.items.find((i) => i.id === itemId);
  if (!it) return NO('Ya no está en tu inventario');
  const { toma: _t, ...resto } = it;
  setItem(W, resto as Item);
  return OK(`${it.nombre}: ya no baja solo`, it.id);
}

/**
 * Lo de todos los días baja solo: por cada día que terminó desde el último descontado, sus tomas (hasta lo que haya).
 * Devuelve cuántas cosas bajaron. Si un día no lo tomaste, «Contar» lo corrige (y queda en el historial).
 */
export function aplicarTomas(W: InventoryState, ctx: Ctx): number {
  const ayer = hoyStr(new Date(ctx.now.getFullYear(), ctx.now.getMonth(), ctx.now.getDate() - 1));
  let n = 0;
  for (const it of [...W.items]) {
    if (!it.toma || it.archivado) continue;
    const dias = -diasHasta(it.toma.ultimo, new Date(ctx.now.getFullYear(), ctx.now.getMonth(), ctx.now.getDate() - 1)); // días terminados sin descontar
    if (!(dias > 0)) continue;
    const quiere = Math.min(dias, 60) * it.toma.porToma * it.toma.tomasDia;
    const sale = r3(Math.min(quiere, it.cantidad));
    setItem(W, { ...it, cantidad: r3(it.cantidad - sale), toma: { ...it.toma, ultimo: ayer }, ...(it.cantidad - sale <= 0 ? { vence: null } : {}) });
    if (sale > 0) { addMov(W, { itemId: it.id, tipo: 'consumo', delta: -sale, via: 'remedio', nota: `${dias} día${dias === 1 ? '' : 's'} de tomas` }, ctx); n++; }
  }
  return n;
}

// ─── Lo que se come en casa sale de la despensa (fase I3) ──────────────────

/** Peso de una unidad de lo que se cuenta por unidades (cuando no se anotó «lo que trae cada uno»). */
const PESO_UNIDAD: Array<[RegExp, number]> = [
  [/^huevo/, 55], [/^marraqueta|^pan frances/, 100], [/^hallulla/, 90], [/^pan\b/, 80], [/^palta/, 140], [/^manzana/, 150], [/^platano|^banana/, 120],
  [/^naranja/, 180], [/^mandarina/, 80], [/^pera\b/, 160], [/^tomate/, 120], [/^cebolla/, 150], [/^papa\b/, 170], [/^zanahoria/, 80], [/^limon/, 60],
  [/^kiwi/, 75], [/^durazno/, 150], [/^yogur/, 125], [/^pepino/, 200], [/^pimenton/, 150], [/^choclo/, 200], [/^empanada/, 200], [/^vienesa|^salchicha/, 45],
  [/^galleta/, 10], [/^barra|^barrita/, 30], [/^lata de atun|^atun/, 120], [/^jurel/, 300], [/^queso en lamina|^lamina/, 20],
];
const SECO = /^(arroz|fideo|tallarin|spaghetti|pasta|lenteja|poroto|garbanzo|arveja seca|quinoa|avena|cuscus|polenta|semola)/;

/**
 * Cuánto de un ítem es lo que se comió (`grams` de `comida`), en la unidad del ítem; null si no se puede saber solo.
 * Lo cocido de algo seco (arroz, fideos, legumbres) pesa ~2,5 veces más que crudo: se descuenta ~40 %.
 */
export function cuantoDe(it: Item, comida: string, grams: number): number | null {
  if (!(grams > 0)) return null;
  const k = claveNombre(it.nombre);
  const cocido = /\b(cocid\w*|hervid\w*|guisad\w*|preparad\w*|graneado|al vapor)\b/.test(fold(comida)) && SECO.test(k);
  const g = cocido ? grams * 0.4 : grams;
  const fam = familia(it.unidad);
  if (fam === 'masa') return r3(g / factor(it.unidad));
  if (fam === 'vol') return r3(g / factor(it.unidad)); // bebidas: 1 g ≈ 1 ml
  // se cuenta por unidades: con lo que trae cada una, o el peso típico de una unidad
  // Con lo que trae cada una se sabe exacto (250 ml de una caja de 1 L = 0,25); con el peso típico, de a media unidad
  if (it.contenido && familia(it.contenido.unidad) !== 'cuenta') return Math.round((g / (it.contenido.cant * factor(it.contenido.unidad))) * 100) / 100;
  const porUnidad = PESO_UNIDAD.find(([re]) => re.test(k))?.[1] ?? null;
  if (!porUnidad) return null;
  return Math.max(0.5, Math.round((g / porUnidad) * 2) / 2);
}

export interface ComidaEntrada { key: string; name: string; grams: number; at: string }
export interface ResultadoComidas { descontadas: Array<{ item: string; comida: string; delta: number; unidad: Unidad }>; pendientes: number; devueltas: number }

/**
 * Las comidas de hoy de Nutrición → la despensa. Cada comida nueva (desde que se activó) que calza con algo de Alimentos o
 * Despensa con stock baja eso (con «Deshacer»); si no se sabe cuánto, queda «por confirmar». Si una comida ya descontada
 * desaparece de Nutrición (la borraste), lo descontado vuelve. Idempotente: se puede llamar cada vez que cambia el registro.
 */
export function procesarComidas(W: InventoryState, comidas: ComidaEntrada[], ctx: Ctx, dia?: string): ResultadoComidas {
  const out: ResultadoComidas = { descontadas: [], pendientes: 0, devueltas: 0 };
  if (W.ajustes?.descontarComida === false) return out;
  if (!W.nutri) { W.nutri = { desde: ctx.now.toISOString(), vistos: comidas.map((c) => c.key).slice(-400), movs: {}, pendientes: [] }; return out; }
  const N = W.nutri;
  const hay = new Set(comidas.map((c) => c.key));
  // Borradas en Nutrición: lo descontado vuelve. Solo lo del día de comida que se pasa acá (`dia`, el de Nutrición): el
  // bocado de las 00:15 de quien sigue despierto es del día anterior y a la mañana siguiente no está en «hoy», pero no se
  // borró (antes se comparaba el día del calendario del descuento y volvía al inventario)
  const hoy = dia ?? hoyStr(ctx.now);
  const diaDe = (key: string, at: string) => N.dias?.[key] ?? (dia ? null : hoyStr(new Date(at)));
  for (const [key, movId] of Object.entries(N.movs)) {
    const m = W.movs.find((x) => x.id === movId);
    if (!m) { delete N.movs[key]; if (N.dias) delete N.dias[key]; continue; }
    if (diaDe(key, m.at) === hoy && !hay.has(key)) { deshacer(W, movId); delete N.movs[key]; if (N.dias) delete N.dias[key]; out.devueltas++; }
  }
  N.pendientes = N.pendientes.filter((p) => hay.has(p.key) || (p.dia ?? (dia ? null : hoyStr(new Date(p.at)))) !== hoy);
  const vistos = new Set(N.vistos);
  for (const c of comidas) {
    if (vistos.has(c.key) || c.at < N.desde) { vistos.add(c.key); continue; }
    vistos.add(c.key);
    const it = buscar(W, c.name).find((i) => (i.area === 'alimentos' || i.area === 'despensa') && i.cantidad > 0 && puntaje(i, c.name) >= 70);
    if (!it) continue;
    const d = cuantoDe(it, c.name, c.grams);
    if (d == null) { N.pendientes = [...N.pendientes, { key: c.key, comida: c.name, grams: c.grams, itemId: it.id, at: ctx.now.toISOString(), ...(dia ? { dia } : {}) }].slice(-30); out.pendientes++; continue; }
    const r = consumir(W, it.id, d, it.unidad, ctx, 'nutricion');
    if (!r.ok || r.movId == null) continue;
    const m = W.movs.find((x) => x.id === r.movId);
    if (m) m.nota = c.name.slice(0, 50);
    N.movs[c.key] = r.movId;
    if (dia) { N.dias = { ...(N.dias ?? {}), [c.key]: dia }; const keep = new Set(Object.keys(N.movs)); for (const k of Object.keys(N.dias)) if (!keep.has(k)) delete N.dias[k]; }
    out.descontadas.push({ item: it.nombre, comida: c.name, delta: d, unidad: it.unidad });
  }
  N.vistos = [...vistos].slice(-400);
  return out;
}

/** «Por confirmar»: descontar lo que dijiste (o nada, si no era de la casa). */
export function resolverPendiente(W: InventoryState, key: string, cant: number | null, unidad: Unidad | null, ctx: Ctx): FormResult {
  const N = W.nutri;
  const p = N?.pendientes.find((x) => x.key === key);
  if (!N || !p) return NO('Ya no está por confirmar');
  N.pendientes = N.pendientes.filter((x) => x.key !== key);
  if (cant == null || !(cant > 0)) return OK('Listo: no se descontó nada');
  const r = consumir(W, p.itemId, cant, unidad, ctx, 'nutricion');
  if (r.ok && r.movId != null) { N.movs[key] = r.movId; const m = W.movs.find((x) => x.id === r.movId); if (m) m.nota = p.comida.slice(0, 50); }
  return r;
}

/** «Lo comí fuera»: lo descontado por una comida vuelve, y esa comida no se vuelve a descontar. */
export function noEraDeLaCasa(W: InventoryState, movId: number): FormResult {
  const N = W.nutri;
  const key = N ? Object.keys(N.movs).find((k) => N.movs[k] === movId) : undefined;
  const r = deshacer(W, movId);
  if (N && key) delete N.movs[key];
  return r.ok ? OK(`${r.msg.split(':')[0]}: devuelto (no era de la casa)`) : r;
}

/** Eris administra (A3): ¿lo que se va a acabar a tu ritmo entra solo a la lista de compras? */
export function ajustarPrevision(W: InventoryState, activo: boolean): FormResult {
  W.ajustes = { ...(W.ajustes ?? { descontarComida: true }), prevision: activo };
  return OK(activo ? 'Lo que se va a acabar entra solo a tu lista de compras' : 'Solo entra a la lista lo que se acaba o queda bajo su mínimo');
}

export function ajustarDescuentoComida(W: InventoryState, activo: boolean): FormResult {
  W.ajustes = { ...(W.ajustes ?? { descontarComida: true }), descontarComida: activo };
  return OK(activo ? 'Lo que comes se descuenta de la despensa' : 'Lo que comes ya no se descuenta');
}

// ─── La boleta: cada producto a su área (fase I3) ───────────────────────────

/** Lo que trae una boleta que no es una cosa de la casa (la bolsa, el despacho, la propina). */
const NO_INVENTARIO = /\b(bolsa\w*|despacho|envio|propina|servicio|recargo|donacion|redondeo|vuelto|descuento|cupon|giftcard|tarjeta de regalo|recarga)\b/;
/** La categoría de Finanzas → el área, cuando el nombre no basta. */
const AREA_DE_CAT: Record<string, AreaId | null> = { alimentacion: 'despensa', hogar: 'limpieza', salud: 'botiquin', otros: null };

export interface LineaBoleta extends Entrada { incluir: boolean }
/**
 * Un producto leído de la boleta → lo que entra al inventario: el nombre como se lee («LECHE DESC 1L» → «Leche desc 1l»),
 * la cantidad («2 X 1.290» → 2; «0,532 X 2.990» → 0,532 kg), lo que trae («1L» → 1 L), el área (por el nombre o la
 * categoría) y el precio total. `incluir`: falso para la bolsa, el despacho o lo que no tiene área.
 */
export function lineaDeBoleta(it: { desc: string; monto: number; cant?: number; unit?: number; cat?: string }): LineaBoleta {
  const desc = String(it.desc || '').replace(/\s+/g, ' ').trim();
  const largo = expandirAbreviaturas(desc.toLowerCase());
  const nombre = largo ? largo[0].toUpperCase() + largo.slice(1) : 'Producto';
  const fraccion = it.cant != null && it.cant > 0 && !Number.isInteger(it.cant);
  const cont = parseContenido(desc.replace(/(\d)\s*(kg|g|gr|l|lt|ml|cc)\b/gi, '$1 $2'));
  const area = areaPara(desc) ?? (it.cat ? AREA_DE_CAT[it.cat] ?? null : null);
  return {
    nombre, area,
    cantidad: fraccion ? it.cant! : Math.max(1, Math.round(it.cant ?? 1)),
    unidad: fraccion ? 'kg' : 'u',
    contenido: !fraccion && cont ? cont : null,
    precioTotal: it.monto > 0 ? it.monto : null,
    via: 'boleta',
    incluir: !!area && !NO_INVENTARIO.test(fold(desc)) && it.monto > 0,
  };
}

/** Las abreviaturas de las boletas chilenas («LECHE DESC», «YOG NAT S/AZ») a palabras: así calzan con lo que ya tienes. */
const ABREV: Record<string, string> = {
  desc: 'descremada', descr: 'descremada', semidesc: 'semidescremada', semid: 'semidescremada', ent: 'entera', nat: 'natural', integ: 'integral', int: 'integral',
  yog: 'yogur', yogh: 'yogur', choc: 'chocolate', pech: 'pechuga', molid: 'molida', detergen: 'detergente', lavaloz: 'lavalozas', hig: 'higiénico',
  acond: 'acondicionador', desod: 'desodorante', mantequ: 'mantequilla', marg: 'margarina', azuc: 'azúcar', grat: 'gratinado', congel: 'congelado', cong: 'congelado',
  tomat: 'tomate', salc: 'salchicha', jam: 'jamón', pav: 'pavo', pollo: 'pollo', pan: 'pan', beb: 'bebida', jgo: 'jugo', choclo: 'choclo',
};
export function expandirAbreviaturas(s: string): string {
  return s.replace(/\bs\/az\b|\bs\/azucar\b/g, 'sin azúcar').replace(/\bc\/s\b/g, 'con sal').split(' ')
    .map((w) => { const k = w.replace(/[.]+$/, ''); return ABREV[k] ?? w; }).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * ¿Es algo que ya tienes? (la boleta dice «Shampoo sedal 340ml» y tienes «Shampoo»; «0,532 kg de palta» y cuentas paltas):
 * se suma ahí, en su unidad, en vez de duplicarlo. null = es nuevo (o no se puede convertir con seguridad).
 */
export function destinoBoleta(S: InventoryState, l: Pick<Entrada, 'nombre' | 'cantidad' | 'unidad' | 'contenido'>): { item: Item; cantidad: number; unidad: Unidad } | null {
  const it = S.items.map((i) => ({ i, p: puntaje(i, l.nombre) })).filter((x) => x.p >= 70).sort((a, b) => b.p - a.p)[0]?.i;
  if (!it) return null;
  const cant = Number(l.cantidad) || 1, un: Unidad = l.unidad ?? 'u';
  let q = convertir(it, cant, un);
  // «2 unidades de 1 L» a algo que se cuenta en L; «0,532 kg» a algo que se cuenta por unidades (peso típico)
  if (q == null && l.contenido && familia(un) === 'cuenta') q = convertir(it, cant * l.contenido.cant, l.contenido.unidad);
  if (q == null && familia(un) !== 'cuenta' && familia(it.unidad) === 'cuenta') q = cuantoDe(it, it.nombre, cant * factor(un));
  return q != null && q > 0 ? { item: it, cantidad: q, unidad: it.unidad } : null;
}

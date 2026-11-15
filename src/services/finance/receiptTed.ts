// ============================================================
// Eris Mobile — el timbre de la boleta (Finanzas 2.0, F4)
//
// Toda boleta o factura electrónica chilena trae al pie el «timbre electrónico» del SII: un código PDF417 con un XML
// (TED) firmado. Ahí vienen, exactos, el RUT y la razón social del comercio, el tipo de documento, el folio, la fecha,
// el TOTAL y el primer producto. Se lee con la cámara (expo-camera ya lee PDF417) y nada sale del teléfono.
//   - total, fecha y comercio sin tipear;
//   - RUT + tipo + folio = una clave única: la misma boleta no se anota dos veces.
// El detalle por producto (OCR) viene después, con boletas reales de muestra.
// Puro, sin dependencias: se prueba con bun.
// ============================================================

export interface Timbre {
  /** RUT del comercio, "76042014-K" */
  rut: string;
  /** 33 factura · 34 factura exenta · 39 boleta · 41 boleta exenta · 61 nota de crédito… */
  tipo: number;
  folio: number;
  /** YYYY-MM-DD */
  fecha: string;
  /** HH:MM del timbraje, si viene */
  hora?: string;
  /** total en pesos */
  monto: number;
  /** razón social tal como viene ("WALMART CHILE S A") */
  razonSocial: string;
  /** nombre corto para la descripción ("Lider") */
  comercio: string;
  /** primer producto de la boleta, si viene */
  item1?: string;
  /** categoría sugerida (la persona la confirma) */
  cat: string;
  /** clave anti-duplicado */
  clave: string;
}

export const TIPOS_DTE: Record<number, string> = {
  33: 'factura', 34: 'factura exenta', 39: 'boleta', 41: 'boleta exenta', 46: 'factura de compra', 52: 'guía de despacho', 56: 'nota de débito', 61: 'nota de crédito',
};
/** Los que son una compra (lo demás no se anota como gasto) */
const COMPRA = new Set([33, 34, 39, 41]);

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unEnt = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENT[e]).replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
const tag = (xml: string, name: string) => { const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`)); return m ? unEnt(m[1]).trim() : undefined; };

// Comercios conocidos por su razón social (la que trae el timbre)
const COMERCIOS: Array<[RegExp, string, string]> = [
  [/\bwalmart\b|\blider\b/, 'Lider', 'alimentacion'],
  [/\bcencosud\b|\bjumbo\b|\bsanta isabel\b/, 'Jumbo / Santa Isabel', 'alimentacion'],
  [/\brendic\b|\bsmu\b|\bunimarc\b|\balvi\b|\bmayorista 10\b/, 'Unimarc', 'alimentacion'],
  [/\btottus\b/, 'Tottus', 'alimentacion'],
  [/\bacuenta\b/, 'aCuenta', 'alimentacion'],
  [/\bcruz verde\b/, 'Cruz Verde', 'salud'],
  [/\bsalcobrand\b/, 'Salcobrand', 'salud'],
  [/\bahumada\b/, 'Farmacias Ahumada', 'salud'],
  [/\bcopec\b/, 'Copec', 'transporte'],
  [/\bshell\b|\benex\b/, 'Shell', 'transporte'],
  [/\baramco\b|\bpetrobras\b|\besmax\b/, 'Aramco', 'transporte'],
  [/\bsodimac\b|\bhomecenter\b/, 'Sodimac', 'vivienda'],
  // (también los que llegan en avisos del banco: bankNotif.ts)
  [/\buber\b.*\beats\b/, 'Uber Eats', 'alimentacion'],
  [/\brappi\b/, 'Rappi', 'alimentacion'],
  [/\bpedidos ?ya\b/, 'PedidosYa', 'alimentacion'],
  [/\buber\b/, 'Uber', 'transporte'],
  [/\bdidi\b/, 'DiDi', 'transporte'],
  [/\bcabify\b/, 'Cabify', 'transporte'],
  [/\bnetflix\b/, 'Netflix', 'entretenimiento'],
  [/\bspotify\b/, 'Spotify', 'entretenimiento'],
  [/\beasy\b/, 'Easy', 'vivienda'],
];
const CAT_POR_PALABRA: Array<[RegExp, string]> = [
  [/\b(supermercado|minimarket|almacen|panaderia|carniceria|botilleria|restaurant\w*|comida|alimentos|cafe|sushi|pizza|pasteleria)\b/, 'alimentacion'],
  [/\b(farmacia|clinica|medic\w*|dental|laboratorio|optica)\b/, 'salud'],
  [/\b(combustible\w*|servicentro|estacionamiento|autopista|transporte|buses)\b/, 'transporte'],
  [/\b(ferreteria|construccion|muebles|inmobiliaria)\b/, 'vivienda'],
  [/\b(cine|entretenci\w*|eventos|bar)\b/, 'entretenimiento'],
  [/\b(libreria|educaci\w*|universidad|instituto|colegio)\b/, 'educacion'],
];
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SOCIEDAD = /\s+(?:s\.?\s?a\.?|s\.?\s?p\.?\s?a\.?|spa|ltda\.?|limitada|e\.?\s?i\.?\s?r\.?\s?l\.?|y\s+cia\.?|y\s+compa[nñ]ia)\s*$/i;

/** "WALMART CHILE S A" → "Walmart Chile" si no es un comercio conocido. */
export function comercioDe(rs: string): { comercio: string; cat: string } {
  const f = fold(rs);
  for (const [re, nombre, cat] of COMERCIOS) if (re.test(f)) return { comercio: nombre, cat };
  let s = rs.replace(/[^a-zA-Z0-9À-ÿ&.\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) s = s.replace(SOCIEDAD, '').trim();
  const comercio = s.toLowerCase().replace(/(^|\s)([a-zà-ÿ])/g, (_, a: string, b: string) => a + b.toUpperCase()).slice(0, 40) || 'Boleta';
  const cat = CAT_POR_PALABRA.find(([re]) => re.test(f))?.[1] ?? 'otros';
  return { comercio, cat };
}

/** Lo que leyó la cámara → el timbre, o null si no es un timbre del SII. */
export function parseTimbre(raw: unknown): Timbre | null {
  if (typeof raw !== 'string' || raw.length < 40 || raw.length > 4000) return null;
  const xml = raw.replace(/\s+</g, '<').replace(/>\s+/g, '>');
  const dd = xml.match(/<DD>([\s\S]*?)<\/DD>/)?.[1];
  if (!dd || !/<TED\b/.test(xml)) return null;
  const rut = tag(dd, 'RE'), tipo = Number(tag(dd, 'TD')), folio = Number(tag(dd, 'F')), fecha = tag(dd, 'FE'), monto = Number(tag(dd, 'MNT'));
  if (!rut || !/^\d{6,9}-[\dkK]$/.test(rut) || !(tipo > 0) || !(folio > 0) || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !(monto >= 0)) return null;
  // La razón social del comercio va en la autorización de folios (CAF) que viene dentro del timbre
  const rs = tag(dd, 'RS') ?? '';
  const ts = tag(dd, 'TSTED');
  const hora = ts && /T(\d{2}):(\d{2})/.test(ts) ? ts.match(/T(\d{2}:\d{2})/)![1] : undefined;
  const item1 = tag(dd, 'IT1');
  const { comercio, cat } = comercioDe(rs || rut);
  return {
    rut: rut.toUpperCase(), tipo, folio, fecha, ...(hora ? { hora } : {}), monto: Math.round(monto), razonSocial: rs, comercio,
    ...(item1 ? { item1: item1.slice(0, 40) } : {}), cat, clave: `dte:${rut.toUpperCase()}:${tipo}:${folio}`,
  };
}

/** ¿Es una compra que se anota como gasto? (una nota de crédito o una guía no) */
export const esCompra = (t: Timbre) => COMPRA.has(t.tipo);

/** La misma boleta ya anotada (por la clave del timbre), con su fecha y monto para decírselo a la persona. */
export function boletaAnotada(tx: Array<{ boleta?: unknown; fecha?: unknown; monto?: unknown; desc?: unknown }>, clave: string) {
  const t = tx.find((x) => (x.boleta as any)?.clave === clave);
  return t ? { fecha: String(t.fecha), monto: Number(t.monto) || 0, desc: String(t.desc || '') } : null;
}

// ─── La foto de la boleta (lo lee el PC: eris/src/services/ReceiptOcr.ts) ──────────────────────────────────
export interface ItemBoleta {
  desc: string; monto: number; descuento?: number; cant?: number; unit?: number; cat?: string;
  /** el código de barras impreso al comienzo de la línea (Jumbo, Lider…): con él el Inventario reconoce el producto */
  ean?: string;
  /** su precio no se pudo leer: es lo que faltaba para el total */
  estimado?: boolean;
}
export interface BoletaFoto {
  ok: true; comercio?: string; rut?: string; fecha?: string; hora?: string; folio?: number;
  items: ItemBoleta[]; total?: number; suma: number; cuadra: boolean; dudosas: string[];
  /** los precios venían sin IVA (factura) y ya se le sumó a cada producto */
  ivaAparte?: boolean; iva?: number;
  /** productos que están pero sin precio legible: van al inventario; la plata, a «lo que no alcancé a leer» */
  sinPrecio?: Array<{ desc: string; ean?: string; cant?: number }>;
}

/**
 * Lo que el timbre dice que se pagó y la suma de los productos es el neto (sin IVA): se le suma el IVA a cada producto.
 * Respaldo en el teléfono por si la lectura del PC no lo vio (sin la línea del IVA, o un PC con el lector antiguo).
 */
export function conIvaDelTimbre(b: BoletaFoto, pagado: number | null | undefined): BoletaFoto {
  if (b.ivaAparte || !(pagado && pagado > 0) || b.sinPrecio?.length) return b;
  const suma = b.items.reduce((s, i) => s + i.monto, 0);
  if (!(suma > 0) || Math.abs(suma - pagado) <= 1 || Math.abs(Math.round(suma * 1.19) - pagado) > Math.max(3, b.items.length)) return b;
  const k = pagado / suma;
  const items = b.items.map((it) => ({ ...it, monto: Math.round(it.monto * k), ...(it.unit ? { unit: Math.round(it.unit * k) } : {}), ...(it.descuento ? { descuento: Math.round(it.descuento * k) } : {}) }));
  const dif = pagado - items.reduce((s, i) => s + i.monto, 0);
  if (dif) { let m = 0; items.forEach((it, i) => { if (it.monto > items[m].monto) m = i; }); items[m] = { ...items[m], monto: items[m].monto + dif }; }
  return { ...b, items, total: pagado, suma: pagado, cuadra: true, ivaAparte: true, iva: pagado - suma };
}
export interface GrupoBoleta { cat: string; items: Array<ItemBoleta & { i: number }>; monto: number }

/** Los productos por categoría (la elegida por la persona, la sugerida o la del comercio), la más grande primero. */
export function agruparBoleta(items: ItemBoleta[], catDefault: string, elegidas: Record<number, string> = {}): GrupoBoleta[] {
  const g = new Map<string, GrupoBoleta>();
  items.forEach((it, i) => {
    const cat = elegidas[i] ?? it.cat ?? catDefault;
    const x = g.get(cat) ?? { cat, items: [], monto: 0 };
    x.items.push({ ...it, i }); x.monto += it.monto;
    g.set(cat, x);
  });
  return [...g.values()].sort((a, b) => b.monto - a.monto);
}

/** Clave anti-duplicado de una boleta leída por foto: la del timbre si se leyó; si no, comercio + folio (o fecha + total). */
export function claveBoletaFoto(b: BoletaFoto, timbre?: Timbre | null): string {
  if (timbre) return timbre.clave;
  const quien = (b.rut || fold(b.comercio || 'boleta').replace(/[^a-z0-9]+/g, '')).slice(0, 24);
  return b.folio ? `foto:${quien}:${b.folio}` : `foto:${quien}:${b.fecha ?? ''}:${b.total ?? b.suma}`;
}

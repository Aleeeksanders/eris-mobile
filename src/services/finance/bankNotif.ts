// ============================================================
// Eris Mobile — avisos del banco → movimientos (Finanzas 2.0 F4; Eris administra A0–A1)
//
// El módulo nativo (modules/eris-bank-notifications) guarda los avisos con montos de las apps que eligió la persona (y,
// si lo activó, los correos y SMS de su banco). Acá se leen por código: monto, comercio, tarjeta, tipo (compra,
// transferencia enviada o recibida, giro, pago de la tarjeta), con quién (a quién le transferiste o quién te transfirió)
// y el saldo si lo dice. Los códigos de seguridad, saldos sueltos y avisos de marketing no son movimientos.
// Puro, sin dependencias de React Native: se prueba con bun.
// ============================================================
import { comercioDe } from './receiptTed';

/** `via`: el aviso llegó por correo o SMS (no por la app del banco); el banco se lee del remitente */
export interface AvisoBanco { pkg: string; app: string; title: string; text: string; at: number; key: string; via?: 'correo' | 'sms' }
/** `pago` = pago de la tarjeta de crédito; `transferencia` = enviada; `ingreso` = recibida o depósito */
export type TipoAviso = 'compra' | 'transferencia' | 'giro' | 'ingreso' | 'pago' | 'otro';

export interface Propuesta {
  clave: string;
  /** banco = aviso del teléfono; cartola = falta en lo anotado según la cartola importada (cartola.ts) */
  fuente: 'banco' | 'cartola';
  app: string; pkg: string;
  tipo: TipoAviso;
  monto: number;
  /** "LIDER EXPRESS" tal como lo escribió el banco */
  comercio?: string;
  /** lo que va en la descripción del movimiento */
  desc: string;
  cat: string;
  /** últimos 4 dígitos de la tarjeta o cuenta, si los dice */
  last4?: string;
  fecha: string;
  hora: string;
  /** el aviso original (para revisarlo) */
  texto: string;
  /** la cuenta, cuando se sabe (cartola de esa cuenta) */
  cuenta?: string | number | null;
  /** la hora del aviso (ms): dos avisos del mismo cargo llegan con minutos de diferencia */
  at?: number;
  /** por qué Eris no lo anotó sola (Eris administra): se muestra en «Por confirmar» */
  razon?: string;
  /** a quién le transferiste o quién te transfirió, como lo escribió el banco (A1) */
  contraparte?: string;
  /** los 4 dígitos de la OTRA cuenta («a la cuenta ****5678»): si es tuya, es una transferencia entre tus cuentas */
  last4Otra?: string;
  /** el saldo que dice el aviso («saldo disponible $412.300»): para cuadrar con lo anotado */
  saldo?: number;
  /** el banco del aviso (clave de BANCOS) */
  banco?: string;
  /** llegó por correo o SMS */
  via?: 'correo' | 'sms';
}

/**
 * Versión del lector: cuando sube, lo que Eris anotó sola con el lector anterior se vuelve a leer (financeAuto.releer) y,
 * si ahora se entiende el comercio o con quién fue, se corrige la descripción (si la persona no la cambió).
 * 2 = revisión F1 (2026-11-04): comercios con minúsculas, comercio en el título, «a la cuenta de», «cuenta destino».
 */
export const LECTOR_V = 2;

const pad = (n: number) => String(n).padStart(2, '0');
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Bancos y billeteras de Chile: el nombre de la app (o su paquete), el remitente del correo o SMS y lo que escribiste en
// la cuenta → el mismo banco. MACH antes que BCI (es de BCI, pero es otra cuenta).
const BANCOS: Array<[string, string, RegExp]> = [
  ['bancoestado', 'BancoEstado', /banco ?estado|cuenta ?rut|\bbech\b/],
  ['santander', 'Santander', /santander/],
  ['mach', 'MACH', /\bmach\b/],
  ['bci', 'BCI', /\bbci\b|banco de credito e inversiones/],
  ['chile', 'Banco de Chile', /banco de chile|bancochile|banchile|\bedwards\b/],
  ['itau', 'Itaú', /\bitau/],
  ['scotiabank', 'Scotiabank', /scotia/],
  ['falabella', 'Banco Falabella', /falabella|\bcmr\b/],
  ['ripley', 'Banco Ripley', /ripley/],
  ['security', 'Banco Security', /security/],
  ['bice', 'BICE', /\bbice\b/],
  ['consorcio', 'Consorcio', /consorcio/],
  ['internacional', 'Banco Internacional', /banco internacional/],
  ['coopeuch', 'Coopeuch', /coopeuch/],
  ['tenpo', 'Tenpo', /tenpo/],
  ['mercadopago', 'Mercado Pago', /mercado ?pago/],
  ['global66', 'Global66', /global ?66/],
  ['prex', 'Prex', /\bprex\b/],
  ['lapolar', 'La Polar', /la ?polar/],
];

/** El banco de un texto (nombre de la app, paquete, remitente, o lo que escribiste en la cuenta): una clave, o null */
export function bancoDe(s: unknown): string | null {
  const f = fold(String(s ?? '')).replace(/[._-]+/g, ' ');
  return BANCOS.find(([, , re]) => re.test(f))?.[0] ?? null;
}
export const nombreBanco = (k: string) => BANCOS.find(([id]) => id === k)?.[1] ?? k;

// Montos chilenos: $12.990 · $ 5.000 · CLP 12.990 · $12.990,00 · 12.990 pesos
const MONTO = /(?:\$|\bclp)\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?|\b(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?\s?pesos\b/gi;
// Lo que NO es un movimiento: saldos, cupos, promociones, códigos
const NO_MOV = /\b(saldo disponible|cupo disponible|tu saldo|saldo actual|codigo|clave dinamica|token|otp|oferta|promocion|descuento|cashback|preaprobad\w*|cr[eé]dito de consumo por hasta|simula)\b/;
// Correos y SMS: el banco también manda publicidad con montos; ahí, cualquier señal de marketing lo descarta
const MARKETING = /\b(oferta|promocion|descuento|cashback|cyber|black friday|sorteo|gana|beneficio|aprovecha|preaprobad\w*|simula|cuotas sin interes|hasta \d+)\b|\d\s?%/;

const PAGO_TC = /\b(pago de (?:tu |la )?tarjeta(?! de debito)|pagaste (?:tu |la )?tarjeta|pago (?:a|de) (?:tu )?(?:tarjeta de )?credito|pago (?:del|de tu) estado de cuenta|abono a (?:tu |la )?tarjeta|recibimos (?:el |tu )?pago)\b/;
const INGRESO = /\b(recibiste|has recibido|te transfiri\w*|te deposit\w*|te abon\w*|transferencia recibida|deposito recibido|abono recibido|abono en tu cuenta|abonamos|recibimos una transferencia|te enviaron|te envio|remuneracion|tienes un abono|nuevo abono)\b/;
const COMPRA = /\b(compra|compraste|cargo|pagaste|pago con (?:tu )?tarjeta|usaste tu tarjeta|transaccion con tu tarjeta|pago en)\b/;
const ENVIADA = /\b(transferiste|enviaste|transferencia (?:enviada|realizada|a terceros|exitosa|programada)|realizaste una transferencia|traspasaste|traspaso a|transferencia a)\b/;

function tipoDe(t: string): TipoAviso {
  if (PAGO_TC.test(t)) return 'pago';
  if (INGRESO.test(t)) return 'ingreso';
  if (COMPRA.test(t)) return 'compra';
  if (ENVIADA.test(t)) return 'transferencia';
  // «Transferencia de $50.000 a Juan» (enviada) / «Transferencia de $50.000 de Juan» (recibida)
  const tr = t.match(/\btransferencia (?:por|de) (?:\$|clp)?\s?[\d.,]+(?: pesos)? (a|hacia|para|de|desde)\b/);
  if (tr) return /^(a|hacia|para)$/.test(tr[1]) ? 'transferencia' : 'ingreso';
  if (/\b(giro|retiro|retiraste|giraste)\b/.test(t)) return 'giro';
  if (/\b(abono|deposito|transferencia de)\b/.test(t)) return 'ingreso';
  return 'otro';
}

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)([a-zà-ÿ])/g, (_, a: string, b: string) => a + b.toUpperCase());

// Un nombre como lo escribe el banco: «Juan Pérez», «JUAN PEREZ», «Empresa SpA» (hasta 4 palabras con mayúscula)
const NOMBRE = String.raw`[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ'.&-]+(?:\s+(?:de la |de |del )?[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ'.&-]+){0,3}`;
const NO_NOMBRE = /^(tu|su|la|el|ti|usted|cuenta|cuentas|tarjeta|banco|terceros|otro|otra|chile|cajero|la cuenta|mi|nuestra|app|clp)$/i;

/** A quién le transferiste (enviada) o quién te transfirió (recibida): lo que viene después del monto. */
function contraparteDe(texto: string, desde: number, tipo: TipoAviso): string | undefined {
  if (tipo !== 'transferencia' && tipo !== 'ingreso') return undefined;
  // «Destinatario:» con mayúscula también (el regex distingue mayúsculas por el nombre)
  const pre = tipo === 'transferencia' ? String.raw`(?:\ba(?: la cuenta de| nombre de)?|\bpara|[Dd]estinatario:?|[Bb]eneficiario:?|[Tt]itular:?)` : String.raw`(?:\bde|\bdesde|[Rr]emitente:?|[Oo]rdenante:?|[Ee]nviado por|[Tt]itular:?)`;
  const re = new RegExp(`${pre}\\s+(${NOMBRE})`, 'g');
  const rest = texto.slice(desde);
  // «Juan Pérez te envió $5.000» (billeteras): el nombre viene antes
  const antes = tipo === 'ingreso' ? texto.match(new RegExp(`(${NOMBRE})\\s+te\\s+(?:envi|transfiri|deposit)`)) : null;
  if (antes && !NO_NOMBRE.test(antes[1].split(/\s+/)[0]) && !bancoDe(antes[1])) return titulo(antes[1]).slice(0, 40);
  for (const m of rest.matchAll(re)) {
    // «MARIA SOTO. Cuenta destino…»: el nombre termina en el punto (no en «J. Pérez»)
    const n = m[1].split(/(?<=[\wÁÉÍÓÚÑáéíóúñ]{2})\.\s+/)[0].replace(/[.\s]+$/, '').trim();
    const first = n.split(/\s+/)[0];
    if (NO_NOMBRE.test(first) || bancoDe(n) || /^\d/.test(n)) continue;
    return titulo(n).slice(0, 40);
  }
  return undefined;
}

// Los 4 dígitos: ****1234 · *1234 · XXXX1234 · terminada en 1234 · N° 1234
const LAST4 = /(?:\*+|x{2,}|terminad[ao] en|final(?:izada)? en|n[°º]\s?)\s?(\d{4})\b/gi;

/** Un aviso del banco → la propuesta de movimiento, o null si no es un movimiento con monto claro. */
export function parseAviso(n: AvisoBanco): Propuesta | null {
  const texto = `${n.title || ''}${n.title && n.text ? ' · ' : ''}${n.text || ''}`.replace(/\s+/g, ' ').trim();
  if (!texto || texto.length > 800) return null;
  const t = fold(texto);
  const via = n.via === 'correo' || n.via === 'sms' ? n.via : undefined;
  if (via && MARKETING.test(t)) return null;
  const tipo = tipoDe(t);
  if (tipo === 'otro' && (via || NO_MOV.test(t))) return null;
  // El monto del movimiento: el que viene después de la palabra clave (no el saldo que a veces viene al final)
  const montos = [...texto.matchAll(MONTO)].map((m) => ({ at: m.index ?? 0, v: Number((m[1] ?? m[2] ?? '').replace(/\./g, '')) })).filter((m) => m.v > 0);
  if (!montos.length) return null;
  const kw = t.search(/\b(compra|compraste|cargo|pagaste|pago|transferencia|transferiste|enviaste|giro|retiro|recibiste|abono|deposito|te transfiri\w*|te deposit\w*)\b/);
  const saldoAt = t.search(/\bsaldo\b|\bcupo\b/);
  const candidatos = montos.filter((m) => saldoAt < 0 || m.at < saldoAt);
  const mov = candidatos.find((m) => kw < 0 || m.at > kw) ?? candidatos[0] ?? null;
  const monto = mov?.v;
  if (!monto) return null;
  const sm = texto.match(/\bsaldo(?:\s+(?:disponible|actual|contable))?(?:\s+(?:es|de|en tu cuenta))?\s*:?\s*(?:\$|clp)\s?(\d{1,3}(?:\.\d{3})+|\d+)/i);
  const saldo = sm ? Number(sm[1].replace(/\./g, '')) : undefined;

  // Los 4 dígitos propios y los de la otra cuenta («a la cuenta ****5678», «desde la cuenta ****9999»)
  let last4: string | undefined, last4Otra: string | undefined;
  for (const m of texto.matchAll(LAST4)) {
    const antes = fold(texto.slice(Math.max(0, (m.index ?? 0) - 28), m.index ?? 0));
    const otra = tipo === 'transferencia' ? /\b(a|hacia|destino|para)( la| tu)? (cuenta|cta)\b[^.]*$|\b(cuenta|cta) (de )?destino\b[^.]*$/.test(antes)
      : tipo === 'ingreso' ? /\b(desde|de|origen)( la)? (cuenta|cta)\b[^.]*$|\b(cuenta|cta) (de )?origen\b[^.]*$/.test(antes) : false;
    if (otra) last4Otra ??= m[1]; else last4 ??= m[1];
  }
  // Comercio: "en LIDER EXPRESS", "comercio: LIDER" (lo que sigue, hasta "con", "el", fecha o puntuación)
  // Revisión F1 (2026-11-04): antes solo MAYÚSCULAS («en LIDER»); «en Uber Eats» o «en Lider Express» quedaban como
  // «Compra MACHBANK». También «en el comercio X» y el comercio en el título del aviso (algunas billeteras lo ponen ahí).
  const cm = tipo === 'compra' ? texto.match(/\b(?:en(?: el comercio)?|comercio:?)\s+([A-ZÁÉÍÓÚÑ0-9][\wÁÉÍÓÚÑáéíóúñ .&'*\-]{1,40}?)(?=\s+(?:con|el|por|a las|desde|del|de tu|de su|monto|fue|ha sido|se|aprobad\w*|realizad\w*|exitos\w*)\b|\s*[.,;·!]|\s*$|\s+\d{1,2}[/:-])/) : null;
  const okComercio = (x: string) => !/^\d+$/.test(x) && !/^\d+ cuotas?\b/i.test(x) && !/^(tu|su|la|el|cuenta|tarjeta|linea|línea|chile|internet|cuotas?)\b/i.test(x) && !bancoDe(x);
  let comercio = cm && okComercio(cm[1].trim()) ? cm[1].replace(/[*\s]+$/, '').trim() : undefined;
  if (!comercio && tipo === 'compra' && !via) {
    const ti = String(n.title || '').replace(/\s+/g, ' ').trim();
    const tf = fold(ti);
    if (ti.length >= 2 && ti.length <= 40 && !/[$\d]/.test(ti) && okComercio(ti)
      && !/\b(compra|compraste|pago|pagaste|cargo|transacci\w*|aviso|notificaci\w*|alerta|movimiento|exito\w*|exitos\w*|aprobad\w*|realizad\w*|rechazad\w*|listo|hola|tarjeta|cuenta|saldo|transferencia|nuevo|nueva)\b/.test(tf)
      && fold(n.app || '') !== tf) comercio = ti;
  }
  const contraparte = contraparteDe(texto, mov ? mov.at : 0, tipo);
  const c = comercio ? comercioDe(comercio) : null;
  // El banco: de la app; si llegó por correo o SMS, del remitente o del comienzo del mensaje
  const banco0 = via ? bancoDe(`${n.title} ${String(n.text || '').slice(0, 80)}`) : bancoDe(`${n.app} ${n.pkg}`);
  const desc = tipo === 'transferencia' ? `Transferencia${contraparte ? ` a ${contraparte}` : ''}`
    : tipo === 'ingreso' ? (contraparte ? `Transferencia de ${contraparte}` : /deposit/.test(t) ? 'Depósito' : /transferencia/.test(t) ? 'Transferencia recibida' : 'Abono')
    : tipo === 'giro' ? 'Giro'
    : tipo === 'pago' ? 'Pago de tarjeta'
    : c && c.comercio !== 'Boleta' ? c.comercio : comercio ? titulo(comercio) : `Compra con ${banco0 ? nombreBanco(banco0) : n.app}`;
  const banco = banco0;
  const app = via && banco ? `${nombreBanco(banco)} · ${via === 'sms' ? 'SMS' : 'correo'}` : n.app || n.pkg;
  const d = new Date(n.at || Date.now());
  return {
    clave: `notif:${n.key}`, fuente: 'banco', app, pkg: n.pkg, tipo, monto,
    ...(comercio ? { comercio } : {}), desc: desc.slice(0, 40), cat: tipo === 'compra' ? c?.cat ?? 'otros' : 'otros',
    ...(last4 ? { last4 } : {}), ...(last4Otra ? { last4Otra } : {}), ...(contraparte ? { contraparte } : {}),
    ...(saldo != null && saldo !== monto ? { saldo } : {}), ...(banco ? { banco } : {}), ...(via ? { via } : {}),
    fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    texto: texto.slice(0, 300), at: d.getTime(),
  };
}

/** Salida de plata a otro: compras y transferencias enviadas. */
export const esGasto = (p: Propuesta) => p.tipo === 'compra' || p.tipo === 'transferencia';

/**
 * ¿Ya está anotado? Un gasto del mismo monto el mismo día o el anterior/siguiente (lo anotó por chat, con la boleta o a
 * mano). No se descarta solo: se le muestra a la persona para que decida.
 */
export function posibleDuplicado(tx: Array<{ tipo?: unknown; monto?: unknown; fecha?: unknown; desc?: unknown; notif?: unknown }>, p: Propuesta) {
  const dia = (f: string) => Date.parse(`${f}T12:00:00`);
  const tipos = p.tipo === 'ingreso' ? ['ingreso', 'abono', 'cobro'] : ['gasto'];
  const t = tx.find((x) => tipos.includes(String(x.tipo)) && Number(x.monto) === p.monto && typeof x.fecha === 'string' && Math.abs(dia(x.fecha) - dia(p.fecha)) <= 86_400_000);
  return t ? { desc: String(t.desc || ''), fecha: String(t.fecha) } : null;
}

/**
 * Para afinar los lectores con avisos reales (Eris administra, 2026-10-30): el texto del aviso sin nombres de personas ni
 * números (cada dígito → 9, así se ve el formato: «$99.999», «****9999»). Lo comparte la persona si quiere; no sale solo.
 */
export function anonimizarAviso(texto: string, nombres: string[] = []): string {
  let t = String(texto || '');
  for (const n of nombres.filter((x) => x && x.trim().length >= 3)) t = t.replace(new RegExp(n.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'NOMBRE');
  t = t.replace(/\b(a|de|para|desde|remitente:?|destinatario:?|beneficiario:?)\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+(?:\s+(?:de la |de |del )?[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+){1,3})/g,
    (m, pre: string, name: string) => (bancoDe(name) || /^(Tu|Su|La|El|Cuenta|Tarjeta|Chile)\b/.test(name) ? m : `${pre} NOMBRE`));
  return t.replace(/\d/g, '9');
}

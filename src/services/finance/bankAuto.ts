// ============================================================
// Eris Mobile — Eris anota sola lo que avisa tu banco (Eris administra, A0–A1)
//
// 2026-10-30, pedido del usuario: «si a mí no me interesa ingresar las boletas y todas esas cosas, requiero que lea el
// ingreso de la notificación y lo ingrese por Eris, y que se ingrese solo […] deberá reconocer las transferencias de
// bancos». Con el interruptor encendido, cada aviso se DECIDE por código:
//   - compra → gasto con su cuenta clara (aprendida, la única de ese banco, o por el tipo de tarjeta) y su categoría;
//   - transferencia enviada → entre tus cuentas (las dos mitades, tu nombre, la cuenta de destino o lo que respondiste
//     antes) o un gasto «Transferencia a Juan» con la categoría que usaste para esa persona;
//   - transferencia recibida → tu sueldo (±15 %, confirma el «¿Llegó?» con el monto real), un ingreso fijo, un «Me debe»
//     que te devolvieron, o un abono (no cuenta como ingreso; «Fue un ingreso» lo cambia y se aprende);
//   - giro → a tu efectivo; pago de la tarjeta → transferencia de tu cuenta a la tarjeta;
//   - vincular: ya lo anotaste tú (chat, boleta, un fijo, el sueldo) → el aviso se enlaza y no se anota dos veces;
//   - esperar: una mitad de lo que puede ser una transferencia entre tus cuentas espera un rato a la otra;
//   - proponer: con duda → «Por confirmar» con la razón; lo que respondas queda en tu libro y de ahí se aprende.
// Puro, sin React Native: se prueba con bun.
// ============================================================
import { parseAviso, bancoDe, nombreBanco, type AvisoBanco, type Propuesta } from './bankNotif';
import {
  estado, foldTxt, vistaCuenta, clp, CATEGORIAS, CASH, conEfectivo, vistas, deudaDe, addTx, confirmarIngreso, fechaProg, mesStr, formGasto,
  FUENTES, CAT_NOMBRE, type FinanceState, type Ref, type Tx, type TipoTx, type Prog, type Fuente, type Ctx, type FormResult,
} from './financeCore';

export { bancoDe };

/**
 * Lo que eligió la persona. `on` null = todavía no se le preguntó; `tope` 0 = sin tope; `allowed` = visto bueno del
 * administrador. A3 («Así manejo tu plata»): `sueldo` false = el sueldo que llega se propone (no se confirma solo);
 * `cuadre` false = el cuadre avisa pero no arregla nada solo.
 */
export interface AutoConfig { on: boolean | null; tope: number; allowed?: boolean; sueldo?: boolean; cuadre?: boolean }
export const AUTO_DEFAULT: AutoConfig = { on: null, tope: 100_000 };
/** La cuenta que eligió la persona para cada app + tarjeta: `${pkg}:${last4}` (financeInbox) */
export type Aprendido = Record<string, Ref | null>;

/** Lo que Eris sabe del teléfono además del libro (A1). */
export interface Contexto {
  /** el nombre de la persona: una transferencia a tu nombre (o desde tu nombre) es entre tus cuentas */
  yo?: string;
  /** los bancos cuyos avisos llegan (apps elegidas; '*' = también correos y SMS): si la otra cuenta es de uno, se espera su mitad */
  vigilados?: string[];
  /** ahora (ms): sin esto no se espera nada */
  ahora?: number;
}
/** Lo que espera una mitad a la otra antes de decidir sola */
export const ESPERA_MS = 15 * 60_000;
/** Dos mitades de una transferencia entre tus cuentas: el mismo monto en ≤ 2 h */
export const PAR_MS = 2 * 3_600_000;
const DIA_MS = 86_400_000;

/** Qué fue un aviso (lo decide Eris o la persona en «Por confirmar») */
export type Como = 'gasto' | 'propia' | 'prestamo' | 'giro' | 'pago' | 'abono' | 'ingreso' | 'sueldo' | 'cobro';
/** `cuenta` = de dónde sale (gasto, propia, préstamo, giro, pago) o adónde llega (abono, ingreso, sueldo, cobro); `otra` = el destino de propia y pago. */
export interface Eleccion { como: Como; cuenta: Ref | null; otra?: Ref | null; cat?: string; fuente?: Fuente; progId?: Prog['id']; mes?: string; prestamoId?: Tx['id']; cuotas?: number }

export type Decision =
  | { accion: 'anotar'; p: Propuesta; e: Eleccion; razon: string; q?: Propuesta }
  | { accion: 'unir'; p: Propuesta; txId: Tx['id']; desde: Ref; hacia: Ref; razon: string }
  | { accion: 'vincular'; p: Propuesta; txId: Tx['id']; razon: string }
  | { accion: 'esperar'; p: Propuesta; razon: string }
  | { accion: 'proponer'; p: Propuesta; razon: string }
  | { accion: 'ignorar'; razon: string };

/** El aviso guardado en el movimiento: para no anotarlo dos veces y para aprender (con quién, de qué tipo). */
export interface NotifTx { clave?: string; pkg?: string; app?: string; at?: number; last4?: string; tipo?: string; contraparte?: string }
export const notifObj = (p: Propuesta): NotifTx => ({
  clave: p.clave, pkg: p.pkg, app: p.app, at: p.at ?? Date.parse(`${p.fecha}T${p.hora || '12:00'}:00`), tipo: p.tipo,
  ...(p.last4 ? { last4: p.last4 } : {}), ...(p.contraparte ? { contraparte: p.contraparte } : {}),
});
const notifsDe = (t: Tx): NotifTx[] => [t.notif, t.notif2].filter((x) => x && typeof x === 'object') as NotifTx[];
const bancoAviso = (p: Propuesta) => p.banco ?? bancoDe(`${p.app} ${p.pkg}`);

// Lo que dice el aviso del medio de pago
const CREDITO = /\b(tarjeta de credito|t ?credito|credito)\b/;
const DEBITO = /\b(debito|cuenta corriente|cuenta vista|cuenta ?rut|chequera|cuenta de ahorro)\b/;
const sale = (p: Propuesta) => p.tipo === 'compra' || p.tipo === 'transferencia' || p.tipo === 'giro';

/** La cuenta del aviso: la aprendida, la que dice la tarjeta, o la única de ese banco (con el tipo de tarjeta si hace falta). */
export function cuentaDelAviso(p: Propuesta, S: FinanceState, aprendido: Aprendido): { ref: Ref; por: string } | { ref: null; falta: string } {
  const E = estado(S);
  const compra = p.tipo === 'compra';
  // Solo una compra sale de la tarjeta de crédito; transferencias, giros y entradas van por tus cuentas
  const activas = E.cuentas.filter((c) => c.id !== CASH && (compra || c.tipo !== 'credito'));
  const a = aprendido[`${p.pkg}:${p.last4 ?? ''}`];
  if (a != null && a !== CASH && activas.some((c) => c.id === a)) return { ref: a, por: 'la que usaste antes con esta tarjeta' };
  if (p.last4) {
    const porTarjeta = activas.filter((c) => foldTxt(`${c.nombre} ${c.banco ?? ''}`).includes(p.last4!));
    if (porTarjeta.length === 1) return { ref: porTarjeta[0].id, por: `la tarjeta ****${p.last4}` };
  }
  const b = bancoAviso(p);
  if (!b) return { ref: null, falta: 'No sé de qué banco es este aviso' };
  const delBanco = activas.filter((c) => bancoDe(`${c.banco ?? ''} ${c.nombre}`) === b);
  if (!delBanco.length) return { ref: null, falta: `No tienes una cuenta de ${nombreBanco(b)} en Finanzas` };
  const t = foldTxt(p.texto);
  const credito = compra && CREDITO.test(t) && !DEBITO.test(t), debito = DEBITO.test(t);
  const porTipo = credito ? delBanco.filter((c) => c.tipo === 'credito') : debito || !compra ? delBanco.filter((c) => c.tipo !== 'credito') : delBanco;
  // Con varias de débito, la que no es de ahorro (los avisos suelen ser de la cuenta del día a día)
  const elegibles = porTipo.length > 1 ? porTipo.filter((c) => c.tipo !== 'ahorro') : porTipo;
  if (elegibles.length === 1) return { ref: elegibles[0].id, por: delBanco.length === 1 ? `tu única cuenta de ${nombreBanco(b)}` : `tu ${credito ? 'tarjeta de crédito' : 'cuenta'} de ${nombreBanco(b)}` };
  return { ref: null, falta: `Tienes varias cuentas de ${nombreBanco(b)}: ¿${sale(p) ? 'con' : 'a'} cuál fue?` };
}

/** La categoría: la que usaste antes para ese comercio (o esa persona); si no, la del comercio (`comercioDe`). */
export function categoriaDelAviso(p: Propuesta, S: FinanceState): { cat: string; conocido: boolean } {
  // «Transferencia» sola no dice a quién: no se aprende de otra transferencia cualquiera
  if (p.tipo === 'transferencia' && !p.contraparte) return { cat: 'otros', conocido: false };
  // Una compra sin comercio («Compra con MACH») tampoco: antes tomaba la categoría de la última compra sin comercio de ese
  // banco (Uber, bebidas y Patreon terminaban todos en la misma; revisión F1, 2026-11-04)
  if (p.tipo === 'compra' && !p.comercio) return { cat: (CATEGORIAS as readonly string[]).includes(p.cat) ? p.cat : 'otros', conocido: false };
  const k = foldTxt(p.desc);
  for (let i = S.tx.length - 1; i >= 0; i--) {
    const t = S.tx[i];
    if (t.tipo === 'gasto' && foldTxt(t.desc) === k && typeof t.cat === 'string' && (CATEGORIAS as readonly string[]).includes(t.cat)) return { cat: t.cat, conocido: true };
  }
  return { cat: (CATEGORIAS as readonly string[]).includes(p.cat) ? p.cat : 'otros', conocido: false };
}

const dia = (f: unknown) => Date.parse(`${String(f).slice(0, 10)}T12:00:00`);
const SALEN: TipoTx[] = ['gasto', 'transfer', 'giro', 'prestamo', 'ahorro'];
const ENTRAN: TipoTx[] = ['ingreso', 'abono', 'cobro', 'transfer', 'ahorro'];

/**
 * ¿Ya está? El mismo aviso, el mismo cargo avisado dos veces (la app y el correo, o el aviso y su resumen), o lo anotaste
 * tú (chat, boleta, un fijo, el sueldo) el mismo día ±1. Una transferencia entre tus cuentas anotada con una mitad recibe
 * la otra mitad (sin duplicarse).
 */
export function yaAnotado(p: Propuesta, S: FinanceState, cuenta: Ref | null, tipos: TipoTx[] = sale(p) ? (p.tipo === 'compra' ? ['gasto'] : SALEN) : ENTRAN): { igual: true } | { tx: Tx } | null {
  if (S.tx.some((t) => notifsDe(t).some((n) => n.clave === p.clave))) return { igual: true };
  const b = bancoAviso(p);
  const mismoCargo = (n: NotifTx) => n.at != null && p.at != null && (n.tipo ?? 'compra') === p.tipo
    && (n.pkg === p.pkg ? Math.abs(n.at - p.at) < 10 * 60_000 : b != null && bancoDe(`${n.app ?? ''} ${n.pkg ?? ''}`) === b && Math.abs(n.at - p.at) < 30 * 60_000);
  if (S.tx.some((t) => Math.round(t.monto) === p.monto && notifsDe(t).some(mismoCargo))) return { igual: true };
  const lado = sale(p) ? 'desde' : 'hacia';
  const cands = S.tx.filter((t) => {
    if (!tipos.includes(t.tipo) || Math.round(t.monto) !== p.monto || Math.abs(dia(t.fecha) - dia(p.fecha)) > DIA_MS) return false;
    const ns = notifsDe(t);
    if (!ns.length) return cuenta == null || t[lado] == null || t[lado] === cuenta;
    // La otra mitad de una transferencia entre tus cuentas que ya tiene su primera mitad
    return (t.tipo === 'transfer' || t.tipo === 'ahorro') && ns.length === 1 && cuenta != null && t[lado] === cuenta && ns[0].tipo !== p.tipo;
  });
  if (!cands.length) return null;
  return { tx: cands.sort((a, b2) => Math.abs(dia(a.fecha) - dia(p.fecha)) - Math.abs(dia(b2.fecha) - dia(p.fecha)))[0] };
}

// ─── ¿Entre tus cuentas? ─────────────────────────────────────────────────

const palabras = (s: unknown) => foldTxt(s).split(/[^a-z0-9ñ]+/).filter((x) => x.length >= 2);
/** ¿Ese nombre eres tú? Al menos dos palabras de tu nombre (los bancos escriben el nombre legal: «ALEX BENJAMIN MELITA»). */
export function esYo(nombre: unknown, yo: unknown): boolean {
  const a = [...new Set(palabras(yo).filter((x) => x.length >= 3))], b = new Set(palabras(nombre));
  if (a.length < 2 || !b.size) return false;
  return a.filter((x) => b.has(x)).length >= 2;
}

/** Lo que respondiste antes: una transferencia entre tus cuentas con esa misma persona (tú, con otro nombre) en el libro. */
function propiaAprendida(p: Propuesta, S: FinanceState, lado: 'sale' | 'entra'): { cuenta: Ref | null } | null {
  const k = foldTxt(p.contraparte);
  if (!k) return null;
  const E = estado(S);
  let hallada: { cuenta: Ref | null } | null = null;
  for (let i = S.tx.length - 1; i >= 0 && !hallada; i--) {
    const t = S.tx[i];
    if (t.tipo !== 'transfer' && t.tipo !== 'ahorro') continue;
    const n = notifsDe(t).find((x) => foldTxt(x.contraparte) === k);
    if (!n) continue;
    // La misma dirección dice la cuenta; la otra dirección solo dice que eres tú
    const r = n.tipo === (lado === 'sale' ? 'transferencia' : 'ingreso') ? (lado === 'sale' ? t.hacia : t.desde) : null;
    hallada = { cuenta: r != null && E.activa(r) ? r : null };
  }
  return hallada;
}

/** ¿El aviso es una transferencia entre tus cuentas? y, si se sabe, la otra cuenta. */
export function propiaDe(p: Propuesta, S: FinanceState, cx: Contexto, cuenta: Ref): { propia: boolean; otra: Ref | null; por: string } {
  const E = estado(S);
  const otras = E.cuentas.filter((c) => c.id !== cuenta && (p.tipo === 'transferencia' || c.tipo !== 'credito'));
  if (p.last4Otra) {
    const c = otras.filter((x) => foldTxt(`${x.nombre} ${x.banco ?? ''}`).includes(p.last4Otra!));
    if (c.length === 1) return { propia: true, otra: c[0].id, por: `la cuenta ****${p.last4Otra} es tuya` };
  }
  const l = propiaAprendida(p, S, p.tipo === 'ingreso' ? 'entra' : 'sale');
  if (l) return { propia: true, otra: l.cuenta !== cuenta ? l.cuenta : null, por: `${p.contraparte} eres tú (lo anotaste así antes)` };
  if (!esYo(p.contraparte, cx.yo)) return { propia: false, otra: null, por: '' };
  const debito = otras.filter((c) => c.tipo !== 'credito');
  return { propia: true, otra: debito.length === 1 ? debito[0].id : null, por: 'va a tu nombre' };
}

const sinNombre = (n: string | undefined, yo: unknown) => !n || esYo(n, yo);
/** ¿Tienes otra cuenta (no de crédito) en un banco que te avisa? Entonces la otra mitad puede llegar. */
function otraVigilada(S: FinanceState, cuenta: Ref, cx: Contexto) {
  const v = cx.vigilados ?? [];
  if (!v.length) return false;
  return estado(S).cuentas.some((c) => c.id !== cuenta && c.tipo !== 'credito' && (v.includes('*') || v.includes(bancoDe(`${c.banco ?? ''} ${c.nombre}`) ?? '-')));
}
const esperando = (p: Propuesta, cx: Contexto) => cx.ahora != null && p.at != null && cx.ahora - p.at < ESPERA_MS;

/**
 * La otra mitad ya la anoté sola (una transferencia que pasó como gasto, o un abono): con esta mitad, las dos son UNA
 * transferencia entre tus cuentas.
 */
function mitadAnotada(p: Propuesta, S: FinanceState, cuenta: Ref, cx: Contexto): { id: Tx['id']; otra: Ref } | null {
  if (!sinNombre(p.contraparte, cx.yo) || p.at == null) return null;
  const E = estado(S);
  for (let i = S.tx.length - 1; i >= 0; i--) {
    const t = S.tx[i];
    const ns = notifsDe(t);
    if (!t.auto || ns.length !== 1 || Math.round(t.monto) !== p.monto) continue;
    const n = ns[0];
    if (n.at == null || Math.abs(n.at - p.at) > PAR_MS || !sinNombre(n.contraparte, cx.yo)) continue;
    if (p.tipo === 'ingreso' && t.tipo === 'gasto' && n.tipo === 'transferencia' && t.desde != null && t.desde !== cuenta && E.tipo(t.desde) !== 'credito') return { id: t.id, otra: t.desde };
    if (p.tipo === 'transferencia' && t.tipo === 'abono' && n.tipo === 'ingreso' && t.hacia != null && t.hacia !== cuenta) return { id: t.id, otra: t.hacia };
  }
  return null;
}

/** Las dos mitades de una transferencia entre tus cuentas que llegaron juntas (la salida de A y la entrada en B). */
export function emparejar(avisos: AvisoBanco[], S: FinanceState, aprendido: Aprendido, cx: Contexto = {}): { pares: Decision[]; resto: AvisoBanco[] } {
  const ps = avisos.map((a) => ({ a, p: parseAviso(a) }));
  const usados = new Set<number>();
  const pares: Decision[] = [];
  const E = estado(S);
  for (let i = 0; i < ps.length; i++) {
    const x = ps[i].p;
    if (!x || x.tipo !== 'transferencia' || usados.has(i)) continue;
    const A = cuentaDelAviso(x, S, aprendido).ref;
    if (A == null || yaAnotado(x, S, A) || !sinNombre(x.contraparte, cx.yo)) continue;
    for (let j = 0; j < ps.length; j++) {
      const y = ps[j].p;
      if (j === i || usados.has(j) || !y || y.tipo !== 'ingreso' || y.monto !== x.monto || Math.abs((y.at ?? 0) - (x.at ?? 0)) > PAR_MS) continue;
      const B = cuentaDelAviso(y, S, aprendido).ref;
      if (B == null || B === A || yaAnotado(y, S, B) || !sinNombre(y.contraparte, cx.yo)) continue;
      usados.add(i); usados.add(j);
      const v = vistaCuenta(E, A);
      if (v && v.saldo < x.monto) {
        const r = `Moviste ${clp(x.monto)} de ${v.nombre} a ${E.nombre(B)}, pero en lo que llevo ${v.nombre} no alcanza (${clp(Math.max(0, v.saldo))}): puede que falte anotar algo.`;
        pares.push({ accion: 'proponer', p: x, razon: r }, { accion: 'proponer', p: y, razon: r });
      } else pares.push({ accion: 'anotar', p: x, q: y, e: { como: 'propia', cuenta: A, otra: B }, razon: 'salió de una cuenta tuya y llegó a otra' });
      break;
    }
  }
  return { pares, resto: ps.filter((_, i) => !usados.has(i)).map((x) => x.a) };
}

// ─── Lo que entra: sueldo, fijos, «Me debe» ─────────────────────────────

/** ¿Es tu sueldo (±15 %) o un ingreso fijo (±5 %) que todavía no confirmas? Por fecha (±7 días) y cuenta. */
export function fijoDelAviso(p: Propuesta, S: FinanceState, hacia: Ref | null): { prog: Prog; mes: string; esperado: number } | null {
  const E = estado(S), hechos = new Set(S.rec), d = dia(p.fecha);
  const [y, m] = p.fecha.split('-').map(Number);
  const meses = [-1, 0, 1].map((k) => { const x = new Date(y, m - 1 + k, 1); return mesStr(x.getMonth(), x.getFullYear()); });
  const cands: Array<{ prog: Prog; mes: string; dd: number; rel: number }> = [];
  for (const pr of S.prog) {
    if (pr.tipo !== 'ingreso' || !(Number(pr.monto) > 0)) continue;
    const rel = Math.abs(p.monto - pr.monto) / pr.monto;
    if (rel > (pr.fuente === 'sueldo' ? 0.15 : 0.05)) continue;
    if (hacia != null && pr.cuenta != null && E.activa(pr.cuenta) && pr.cuenta !== hacia) continue;
    for (const ms of meses) {
      if (hechos.has(`${pr.id}:${ms}`)) continue;
      const dd = Math.abs(dia(fechaProg(pr, ms)) - d);
      if (dd <= 7 * DIA_MS) cands.push({ prog: pr, mes: ms, dd, rel });
    }
  }
  const c = cands.sort((a, b) => a.rel - b.rel || a.dd - b.dd)[0];
  return c ? { prog: c.prog, mes: c.mes, esperado: c.prog.monto } : null;
}

const STOP = new Set(['transferencia', 'prestamo', 'para', 'por', 'con', 'del', 'las', 'los', 'que', 'una', 'uno', 'spa', 'ltda']);
const fuertes = (s: unknown) => new Set(palabras(s).filter((x) => x.length >= 3 && !STOP.has(x)));
/** ¿Te devolvieron un «Me debe»? El monto exacto (y el nombre, si el aviso lo dice), o una parte si el nombre calza. */
export function cobroDelAviso(p: Propuesta, S: FinanceState): { id: Tx['id']; desc: string } | 'varios' | null {
  const pend = vistas(estado(S)).meDeban.filter((d) => !d.cobrado);
  if (!pend.length) return null;
  const k = fuertes(p.contraparte);
  const nombra = (desc: string) => [...fuertes(desc)].some((x) => k.has(x));
  const exactos = pend.filter((d) => d.monto === p.monto && (!k.size || nombra(d.desc)));
  if (exactos.length === 1) return { id: exactos[0].id, desc: exactos[0].desc };
  if (exactos.length > 1) return 'varios';
  // Una parte: solo si el aviso dice quién y es quien te debe
  const parte = k.size ? pend.filter((d) => nombra(d.desc) && p.monto < d.monto) : [];
  return parte.length === 1 ? { id: parte[0].id, desc: parte[0].desc } : null;
}

/** Lo que hiciste la última vez con lo que te mandó esta persona (abono o ingreso de alguna fuente). */
function entradaAnterior(p: Propuesta, S: FinanceState): { como: 'abono' | 'ingreso'; fuente?: Fuente } | null {
  if (!p.contraparte) return null;
  const k = foldTxt(p.desc);
  for (let i = S.tx.length - 1; i >= 0; i--) {
    const t = S.tx[i];
    if ((t.tipo === 'ingreso' || t.tipo === 'abono') && t.progId == null && foldTxt(t.desc) === k) return t.tipo === 'ingreso' ? { como: 'ingreso', fuente: (t.fuente as Fuente) || 'extra' } : { como: 'abono' };
  }
  return null;
}

// ─── Decidir ──────────────────────────────────────────────────────────────

const anotar = (p: Propuesta, e: Eleccion, razon: string): Decision => ({ accion: 'anotar', p, e, razon });
const proponer = (p: Propuesta, razon: string): Decision => ({ accion: 'proponer', p, razon });
const conPunto = (f: string) => `${f}${/[.?!:]$/.test(f) ? '' : '.'}`;
function noAlcanza(S: FinanceState, ref: Ref, monto: number): string | null {
  const v = vistaCuenta(estado(S), ref);
  return v && v.saldo < monto ? `En lo que llevo, ${v.nombre} no alcanza (${clp(Math.max(0, v.saldo))}): puede que falte anotar algo.` : null;
}
function duplicado(p: Propuesta, S: FinanceState, cuenta: Ref | null): Decision | null {
  const dup = yaAnotado(p, S, cuenta);
  if (dup && 'igual' in dup) return { accion: 'ignorar', razon: 'ya está anotado' };
  if (dup) return { accion: 'vincular', p, txId: dup.tx.id, razon: `ya lo tenías: ${dup.tx.desc}` };
  return null;
}

function decidirCompra(p: Propuesta, S: FinanceState, aprendido: Aprendido, cfg: AutoConfig): Decision {
  const c = cuentaDelAviso(p, S, aprendido);
  const dup = duplicado(p, S, c.ref);
  if (dup) return dup;
  if (c.ref == null) return proponer(p, `${conPunto('falta' in c ? c.falta : '')} Elige la cuenta y la próxima la anoto sola.`);
  const { cat, conocido } = categoriaDelAviso(p, S);
  if (!conocido && cfg.tope > 0 && p.monto > cfg.tope) return proponer(p, `Es la primera vez en ${p.desc} y pasa de ${clp(cfg.tope)}: confírmalo tú.`);
  const v = vistaCuenta(estado(S), c.ref);
  if (v && v.saldo < p.monto) return proponer({ ...p, cuenta: c.ref }, `En lo que llevo, ${v.nombre} no alcanza (${clp(Math.max(0, v.saldo))}): puede que falte anotar algo.`);
  const cm = foldTxt(p.texto).match(/\ben (\d{1,2}) cuotas\b/);
  const cuotas = v?.tipo === 'credito' && cm ? Math.max(1, Math.min(48, Number(cm[1]))) : undefined;
  return anotar(p, { como: 'gasto', cuenta: c.ref, cat, ...(cuotas && cuotas > 1 ? { cuotas } : {}) }, c.por);
}

function decidirSalida(p: Propuesta, S: FinanceState, aprendido: Aprendido, cfg: AutoConfig, cx: Contexto): Decision {
  const c = cuentaDelAviso(p, S, aprendido);
  const dup = duplicado(p, S, c.ref);
  if (dup) return dup;
  if (c.ref == null) return proponer(p, `${conPunto('falta' in c ? c.falta : '')} Elige la cuenta y la próxima la anoto sola.`);
  const A = c.ref;
  const pr = propiaDe(p, S, cx, A);
  if (pr.propia) {
    if (pr.otra == null) return esperando(p, cx) ? { accion: 'esperar', p, razon: 'espero la otra mitad' } : proponer(p, 'Fue a otra cuenta tuya: ¿a cuál? La próxima la anoto sola.');
    return noAlcanza(S, A, p.monto) ? proponer(p, noAlcanza(S, A, p.monto)!) : anotar(p, { como: 'propia', cuenta: A, otra: pr.otra }, pr.por);
  }
  const u = mitadAnotada(p, S, A, cx);
  if (u) return { accion: 'unir', p, txId: u.id, desde: A, hacia: u.otra, razon: 'la otra mitad ya había llegado' };
  if (!p.contraparte && otraVigilada(S, A, cx) && esperando(p, cx)) return { accion: 'esperar', p, razon: 'por si fue entre tus cuentas' };
  const { cat, conocido } = categoriaDelAviso(p, S);
  if (!conocido && cfg.tope > 0 && p.monto > cfg.tope) return proponer(p, `Es la primera vez que ${p.contraparte ? `le transfieres a ${p.contraparte}` : 'veo esta transferencia'} y pasa de ${clp(cfg.tope)}: confírmalo tú.`);
  const na = noAlcanza(S, A, p.monto);
  if (na) return proponer(p, na);
  return anotar(p, { como: 'gasto', cuenta: A, cat }, conocido ? `como la última vez con ${p.contraparte}` : c.por);
}

function decidirEntrada(p: Propuesta, S: FinanceState, aprendido: Aprendido, cx: Contexto, cfg: AutoConfig): Decision {
  const c = cuentaDelAviso(p, S, aprendido);
  const dup = duplicado(p, S, c.ref);
  if (dup) return dup;
  // Ya confirmaste tu sueldo a mano con otra cifra: es ese, no un ingreso más
  const yaSueldo = S.tx.find((t) => t.tipo === 'ingreso' && t.fuente === 'sueldo' && t.via !== 'planilla' && t.progId != null && !notifsDe(t).length
    && (c.ref == null || t.hacia === c.ref) && Math.abs(t.monto - p.monto) <= t.monto * 0.15 && Math.abs(dia(t.fecha) - dia(p.fecha)) <= 3 * DIA_MS);
  if (yaSueldo) return { accion: 'vincular', p, txId: yaSueldo.id, razon: `ya confirmaste ${yaSueldo.desc}` };
  if (c.ref == null) return proponer(p, `${conPunto('falta' in c ? c.falta : '')} Elige la cuenta y la próxima la anoto sola.`);
  const B = c.ref;
  const pr = propiaDe(p, S, cx, B);
  if (pr.propia) {
    if (pr.otra == null) return esperando(p, cx) ? { accion: 'esperar', p, razon: 'espero la otra mitad' } : proponer(p, 'Vino de otra cuenta tuya: ¿de cuál? La próxima la anoto sola.');
    return noAlcanza(S, pr.otra, p.monto) ? proponer(p, noAlcanza(S, pr.otra, p.monto)!) : anotar(p, { como: 'propia', cuenta: pr.otra, otra: B }, pr.por);
  }
  const u = mitadAnotada(p, S, B, cx);
  if (u) return { accion: 'unir', p, txId: u.id, desde: u.otra, hacia: B, razon: 'la otra mitad ya había llegado' };
  const f = fijoDelAviso(p, S, B);
  // «Así manejo tu plata»: si prefiere confirmar su sueldo él mismo, se le propone
  if (f && cfg.sueldo === false) return proponer(p, `Parece ${f.prog.desc === 'Sueldo' ? 'tu sueldo' : f.prog.desc} (esperabas ${clp(f.esperado)}): confírmalo tú.`);
  if (f) {
    const dif = p.monto - f.esperado;
    return anotar(p, { como: 'sueldo', cuenta: B, progId: f.prog.id, mes: f.mes },
      `${f.prog.desc}: ${dif === 0 ? 'justo lo esperado' : `${clp(Math.abs(dif))} ${dif > 0 ? 'más' : 'menos'} de lo esperado`}`);
  }
  const co = cobroDelAviso(p, S);
  if (co === 'varios') return proponer(p, 'Calza con más de un «Me debe»: ¿quién te devolvió?');
  if (co) return anotar(p, { como: 'cobro', cuenta: B, prestamoId: co.id }, `te devolvieron: ${co.desc}`);
  if (!p.contraparte && otraVigilada(S, B, cx) && esperando(p, cx)) return { accion: 'esperar', p, razon: 'por si fue entre tus cuentas' };
  const prev = entradaAnterior(p, S);
  if (prev?.como === 'ingreso') return anotar(p, { como: 'ingreso', cuenta: B, fuente: prev.fuente }, `como la última vez de ${p.contraparte}`);
  return anotar(p, { como: 'abono', cuenta: B }, prev ? `como la última vez de ${p.contraparte}` : 'no calza con tu sueldo, un fijo ni un «Me debe»');
}

function decidirGiro(p: Propuesta, S: FinanceState, aprendido: Aprendido): Decision {
  const c = cuentaDelAviso(p, S, aprendido);
  const dup = duplicado(p, S, c.ref);
  if (dup) return dup;
  if (c.ref == null) return proponer(p, `${conPunto('falta' in c ? c.falta : '')} Elige la cuenta y la próxima la anoto sola.`);
  if (!conEfectivo(S)) return proponer({ ...p, cuenta: c.ref }, '¿Lo pasaste a tu efectivo? Elige «A mi efectivo» y los próximos giros los anoto solos.');
  const na = noAlcanza(S, c.ref, p.monto);
  return na ? proponer(p, na) : anotar(p, { como: 'giro', cuenta: c.ref, otra: CASH }, 'a tu efectivo');
}

function decidirPago(p: Propuesta, S: FinanceState, aprendido: Aprendido): Decision {
  const E = estado(S), b = bancoAviso(p);
  const tarjetas = E.cuentas.filter((c) => c.tipo === 'credito');
  const delBanco = (xs: typeof tarjetas) => (b ? xs.filter((c) => bancoDe(`${c.banco ?? ''} ${c.nombre}`) === b) : []);
  const porDigitos = p.last4 ? tarjetas.filter((c) => foldTxt(c.nombre).includes(p.last4!)) : [];
  const hacia = (porDigitos.length === 1 ? porDigitos : delBanco(tarjetas).length === 1 ? delBanco(tarjetas) : tarjetas.length === 1 ? tarjetas : [])[0]?.id ?? null;
  const debitos = E.cuentas.filter((c) => c.tipo !== 'credito' && c.tipo !== 'ahorro');
  const a = aprendido[`${p.pkg}:${p.last4 ?? ''}`];
  const desde = a != null && debitos.some((c) => c.id === a) ? a : delBanco(debitos).length === 1 ? delBanco(debitos)[0].id : null;
  if (hacia != null) {
    const ya = S.tx.find((t) => (t.tipo === 'transfer') && t.hacia === hacia && Math.round(t.monto) === p.monto && Math.abs(dia(t.fecha) - dia(p.fecha)) <= DIA_MS && notifsDe(t).length < 2);
    if (ya && notifsDe(ya).some((n) => n.clave === p.clave)) return { accion: 'ignorar', razon: 'ya está anotado' };
    if (ya) return { accion: 'vincular', p, txId: ya.id, razon: `ya lo tenías: ${ya.desc}` };
  }
  if (hacia == null || desde == null) return proponer(p, hacia == null ? '¿Qué tarjeta pagaste?' : `¿Desde qué cuenta pagaste ${E.nombre(hacia)}?`);
  const deuda = deudaDe(vistaCuenta(E, hacia));
  if (p.monto > deuda) return proponer(p, `Pagaste más de lo que debía ${E.nombre(hacia)} según lo anotado (${clp(deuda)}): puede que falte anotar compras.`);
  const na = noAlcanza(S, desde, p.monto);
  return na ? proponer(p, na) : anotar(p, { como: 'pago', cuenta: desde, otra: hacia }, `pago de ${E.nombre(hacia)}`);
}

/** Un aviso del banco → qué hace Eris con él. */
export function decidir(n: AvisoBanco, S: FinanceState | null, aprendido: Aprendido, cfg: AutoConfig, cx: Contexto = {}): Decision {
  const p = parseAviso(n);
  return p ? decidirP(p, S, aprendido, cfg, cx) : { accion: 'ignorar', razon: 'no es un movimiento' };
}
/** Lo mismo con el aviso ya leído (la hoja de «Por confirmar» sugiere con esto). */
export function decidirP(p: Propuesta, S: FinanceState | null, aprendido: Aprendido, cfg: AutoConfig, cx: Contexto = {}): Decision {
  if (p.tipo === 'otro') return { accion: 'ignorar', razon: 'no es un movimiento' };
  if (!cfg.on || !S) return proponer(p, '');
  if (p.tipo === 'compra') return decidirCompra(p, S, aprendido, cfg);
  if (p.tipo === 'transferencia') return decidirSalida(p, S, aprendido, cfg, cx);
  if (p.tipo === 'ingreso') return decidirEntrada(p, S, aprendido, cx, cfg);
  if (p.tipo === 'giro') return decidirGiro(p, S, aprendido);
  return decidirPago(p, S, aprendido);
}

/** Lo que propone la hoja de «Por confirmar» para un aviso (la persona lo cambia si quiere). */
export function sugerir(p: Propuesta, S: FinanceState, aprendido: Aprendido, cx: Contexto = {}): Eleccion {
  const d = decidirP(p, S, aprendido, { on: true, tope: 0 }, { yo: cx.yo });
  if (d.accion === 'anotar') return d.e;
  const c = p.cuenta != null ? p.cuenta : cuentaDelAviso(p, S, aprendido).ref;
  if (p.tipo === 'ingreso') return { como: 'abono', cuenta: c };
  if (p.tipo === 'giro') return { como: 'giro', cuenta: c, otra: CASH };
  if (p.tipo === 'pago') return { como: 'pago', cuenta: null, otra: null };
  return { como: 'gasto', cuenta: c, cat: categoriaDelAviso(p, S).cat };
}

// ─── Anotar ───────────────────────────────────────────────────────────────

const OK = (msg: string, tx?: Tx): FormResult & { tx?: Tx } => ({ ok: true, msg, ...(tx ? { tx } : {}) });
const NO = (msg: string): FormResult & { tx?: Tx } => ({ ok: false, msg });

/** Un aviso anotado como corresponde (lo eligió Eris o la persona): con su fecha real y el aviso enlazado. */
export function anotarAviso(W: FinanceState, p: Propuesta, e: Eleccion, ctx: Ctx, o: { auto?: boolean; q?: Propuesta } = {}): FormResult & { tx?: Tx } {
  const E = estado(W), monto = p.monto, fecha = p.fecha;
  const via = p.fuente === 'cartola' ? 'cartola' : 'banco';
  const extra: Record<string, unknown> = { via, notif: notifObj(p), ...(o.q ? { notif2: notifObj(o.q) } : {}), ...(o.auto ? { auto: true } : {}) };
  const valida = (r: Ref | null | undefined, entrada = false) => (r != null && (r === CASH ? entrada || conEfectivo(W) : E.activa(r)) ? r : null);
  const sinFondos = (r: Ref) => {
    const v = vistaCuenta(E, r);
    return v && v.saldo < monto ? (v.tipo === 'credito' ? `Cupo insuficiente en ${v.nombre} (quedan ${clp(Math.max(0, v.saldo))})` : `Saldo insuficiente en ${v.nombre} (tiene ${clp(Math.max(0, v.saldo))})`) : null;
  };
  const credito = (r: Ref) => E.tipo(r) === 'credito';
  switch (e.como) {
    case 'gasto': {
      const { via: _v, ...resto } = extra;
      return formGasto(W, { desc: p.desc, monto, cat: e.cat ?? p.cat, fecha, cuenta: e.cuenta, cuotas: e.cuotas, via, extra: resto }, ctx);
    }
    case 'prestamo': {
      const r = valida(e.cuenta);
      if (r == null) return NO('Elige de qué cuenta salió');
      if (credito(r)) return NO('Un préstamo no sale de una tarjeta de crédito');
      const f = sinFondos(r); if (f) return NO(f);
      return OK('Préstamo anotado', addTx(W, { tipo: 'prestamo', fecha, monto, desde: r, desc: p.contraparte ? `Préstamo a ${p.contraparte}` : 'Préstamo', ...extra }, ctx));
    }
    case 'propia': case 'giro': case 'pago': {
      const desde = valida(e.cuenta), hacia = e.como === 'giro' ? CASH : valida(e.otra, true);
      if (desde == null) return NO('Elige de qué cuenta salió');
      if (hacia == null) return NO(e.como === 'pago' ? 'Elige qué tarjeta pagaste' : 'Elige a qué cuenta llegó');
      if (desde === hacia) return NO('Origen y destino son la misma cuenta');
      if (credito(desde)) return NO('Eso no puede salir de una tarjeta de crédito');
      const f = sinFondos(desde); if (f) return NO(f);
      if (credito(hacia)) {
        const d = deudaDe(vistaCuenta(E, hacia));
        if (monto > d) return NO(d === 0 ? `${E.nombre(hacia)} no tiene deuda` : `${E.nombre(hacia)} debe ${clp(d)}: no le puedes abonar más que eso`);
      }
      const tipo: TipoTx = e.como === 'giro' ? 'giro' : E.tipo(hacia) === 'ahorro' ? 'ahorro' : 'transfer';
      const desc = e.como === 'giro' ? 'Giro' : credito(hacia) ? `Pago ${E.nombre(hacia)}` : tipo === 'ahorro' ? `Ahorro (${E.nombre(hacia)})` : `Transferencia a ${E.nombre(hacia)}`;
      const tx = addTx(W, { tipo, fecha, monto, desde, hacia, desc, ...extra }, ctx);
      return OK(e.como === 'giro' ? 'Giro anotado' : credito(hacia) ? 'Tarjeta pagada' : 'Transferencia lista', tx);
    }
    case 'abono': case 'ingreso': {
      const r = valida(e.cuenta, true);
      if (r == null) return NO('Elige a qué cuenta llegó');
      if (credito(r)) return NO('Esa plata no puede llegar a una tarjeta de crédito');
      const tx = addTx(W, e.como === 'ingreso'
        ? { tipo: 'ingreso', fuente: e.fuente && e.fuente in FUENTES ? e.fuente : 'extra', fecha, monto, hacia: r, desc: p.desc, ...extra }
        : { tipo: 'abono', fecha, monto, hacia: r, desc: p.desc, ...extra }, ctx);
      return OK(e.como === 'ingreso' ? 'Ingreso anotado' : 'Abono anotado', tx);
    }
    case 'sueldo': {
      const pr = W.prog.find((x) => x.id === e.progId && x.tipo === 'ingreso');
      if (!pr) return NO('No encontré ese ingreso fijo');
      const r = valida(e.cuenta, true);
      if (r == null) return NO('Elige a qué cuenta llegó');
      if (credito(r)) return NO('Un ingreso no puede llegar a una tarjeta de crédito');
      const mes = e.mes || fecha.slice(0, 7);
      if (W.rec.includes(`${pr.id}:${mes}`)) return NO(`${pr.desc} de ese mes ya está confirmado`);
      const { via: _v, ...resto } = extra;
      return OK(`${pr.desc}: +${clp(monto)}`, confirmarIngreso(W, pr, { monto, hacia: r, via, fecha, mes, extra: resto }, ctx));
    }
    case 'cobro': {
      const d = vistas(E).meDeban.find((x) => x.id === e.prestamoId && !x.cobrado);
      if (!d) return NO('Ese préstamo ya está cobrado');
      const r = valida(e.cuenta, true);
      if (r == null) return NO('Elige a qué cuenta llegó');
      if (credito(r)) return NO('Esa plata no puede llegar a una tarjeta de crédito');
      return OK(`Cobrado · +${clp(monto)}`, addTx(W, { tipo: 'cobro', prestamoId: d.id, fecha, monto, hacia: r, desc: `Cobro: ${d.desc}`, ...extra }, ctx));
    }
  }
  return NO('No sé anotar eso');
}

/**
 * Un gasto o una entrada que era, en realidad, una transferencia entre tus cuentas: se convierte en UNA transferencia
 * (no es gasto ni ingreso). Con «la otra mitad» del aviso (unir) o porque la persona lo dice en el movimiento.
 */
export function convertirEnPropia(W: FinanceState, id: Tx['id'], otra: Ref | null, o: { notif2?: NotifTx } = {}): FormResult & { tx?: Tx } {
  const t = W.tx.find((x) => x.id === id);
  if (!t) return NO('No encontré ese movimiento');
  if (t.progId != null) return NO('Es un fijo: deshazlo primero');
  const E = estado(W);
  let desde: Ref | null, hacia: Ref | null;
  if (t.tipo === 'gasto') { desde = t.desde ?? null; hacia = otra; }
  else if (t.tipo === 'abono' || t.tipo === 'ingreso') { desde = otra; hacia = t.hacia ?? null; }
  else return NO('Eso no se puede pasar a transferencia');
  if (desde == null || hacia == null || !E.activa(desde) || !E.activa(hacia)) return NO('Elige la otra cuenta');
  if (desde === hacia) return NO('Origen y destino son la misma cuenta');
  if (E.tipo(desde) === 'credito') return NO('Eso no puede salir de una tarjeta de crédito');
  // En una entrada, la plata sale de la otra cuenta: tiene que tenerla
  if (t.tipo !== 'gasto') { const v = vistaCuenta(E, desde); if (v && v.saldo < t.monto) return NO(`Saldo insuficiente en ${v.nombre} (tiene ${clp(Math.max(0, v.saldo))})`); }
  if (E.tipo(hacia) === 'credito') { const d = deudaDe(vistaCuenta(E, hacia)); if (t.monto > d) return NO(d === 0 ? `${E.nombre(hacia)} no tiene deuda` : `${E.nombre(hacia)} debe ${clp(d)}: no le puedes abonar más que eso`); }
  const tipo: TipoTx = E.tipo(hacia) === 'ahorro' ? 'ahorro' : 'transfer';
  const n: Tx = { ...t, tipo, desde, hacia, desc: E.tipo(hacia) === 'credito' ? `Pago ${E.nombre(hacia)}` : tipo === 'ahorro' ? `Ahorro (${E.nombre(hacia)})` : `Transferencia a ${E.nombre(hacia)}`, ...(o.notif2 ? { notif2: o.notif2 } : {}) };
  for (const k of ['cat', 'fuente', 'cuotas', 'partes'] as const) delete n[k];
  W.tx = W.tx.map((x) => (x.id === id ? n : x));
  return OK(`Entre tus cuentas: ${E.nombre(desde)} → ${E.nombre(hacia)}`, n);
}

/** «Fue un ingreso» (un abono que era sueldo extra, una venta…) o «era un abono» (no cuenta como ingreso del mes). */
export function editarEntrada(W: FinanceState, id: Tx['id'], fuente: Fuente | null): FormResult {
  const t = W.tx.find((x) => x.id === id);
  if (!t || (t.tipo !== 'abono' && t.tipo !== 'ingreso')) return NO('No encontré esa entrada');
  if (t.progId != null) return NO('Es un ingreso fijo confirmado: se cambia en su «¿Llegó?»');
  if (fuente != null && !(fuente in FUENTES)) return NO('Esa fuente no existe');
  const n: Tx = fuente ? { ...t, tipo: 'ingreso', fuente } : { ...t, tipo: 'abono' };
  if (!fuente) delete n.fuente;
  W.tx = W.tx.map((x) => (x.id === id ? n : x));
  return OK(fuente ? `Ahora es un ingreso (${FUENTES[fuente].label})` : 'Ahora es un abono: no cuenta como ingreso del mes');
}

/** Aplica lo que decidió Eris (anotar, unir las dos mitades, vincular). */
export function aplicar(W: FinanceState, d: Decision, ctx: Ctx): FormResult & { tx?: Tx; antes?: Tx } {
  if (d.accion === 'anotar') return anotarAviso(W, d.p, d.e, ctx, { auto: true, q: d.q });
  if (d.accion === 'unir') {
    const antes = W.tx.find((x) => x.id === d.txId);
    const t = antes ? (antes.tipo === 'gasto' ? d.hacia : d.desde) : null;
    const r = convertirEnPropia(W, d.txId, t, { notif2: notifObj(d.p) });
    return r.ok ? { ...r, ...(antes ? { antes } : {}) } : r;
  }
  if (d.accion === 'vincular') {
    let ok = false;
    W.tx = W.tx.map((t) => {
      if (t.id !== d.txId) return t;
      ok = true;
      return t.notif && typeof t.notif === 'object' ? { ...t, notif2: notifObj(d.p) } : { ...t, notif: notifObj(d.p) };
    });
    return ok ? OK('Enlazado') : NO('Ya no existe');
  }
  return NO('Nada que anotar');
}

// ─── Cómo se cuenta ──────────────────────────────────────────────────────

/** Qué es cada movimiento, en palabras (el panel «Anotó Eris» y la notificación). */
export function etiquetaTx(t: Tx, S: FinanceState): string {
  const E = estado(S);
  if (t.tipo === 'gasto') return CAT_NOMBRE[String(t.cat)] ?? 'Otros';
  if (t.tipo === 'transfer') return E.tipo(t.hacia) === 'credito' ? 'Pago de tarjeta' : 'Entre tus cuentas';
  if (t.tipo === 'ahorro') return 'Ahorro';
  if (t.tipo === 'giro') return 'Giro a efectivo';
  if (t.tipo === 'abono') return 'Abono';
  if (t.tipo === 'cobro') return 'Te devolvieron';
  if (t.tipo === 'ingreso') return t.fuente === 'sueldo' ? 'Sueldo' : `Ingreso ${FUENTES[t.fuente as Fuente]?.label.toLowerCase() ?? ''}`.trim();
  return t.tipo;
}

/** El título y el cuerpo de la notificación de lo que Eris anotó sola. */
export function resumenAnotado(t: Tx, S: FinanceState, o: { last4?: string; razon?: string } = {}): { titulo: string; cuerpo: string } {
  const E = estado(S);
  const cta = (r: Ref | null | undefined) => `${E.nombre(r)}${o.last4 && r === t.desde ? ` ****${o.last4}` : ''}`;
  if (t.tipo === 'gasto') return { titulo: `Anoté ${clp(t.monto)} · ${t.desc}`, cuerpo: `${etiquetaTx(t, S)} · ${cta(t.desde)}. Si no era así, deshazlo o cámbialo.` };
  if (t.tipo === 'transfer' || t.tipo === 'ahorro') {
    if (E.tipo(t.hacia) === 'credito') return { titulo: `Pagaste ${clp(t.monto)} de ${E.nombre(t.hacia)}`, cuerpo: `Desde ${E.nombre(t.desde)}. Ahora debe ${clp(deudaDe(vistaCuenta(E, t.hacia)))}.` };
    return { titulo: `Moví ${clp(t.monto)}: ${E.nombre(t.desde)} → ${E.nombre(t.hacia)}`, cuerpo: 'Entre tus cuentas: no es gasto ni ingreso.' };
  }
  if (t.tipo === 'giro') return { titulo: `Giro ${clp(t.monto)} a tu efectivo`, cuerpo: `Desde ${E.nombre(t.desde)}.` };
  if (t.tipo === 'cobro') return { titulo: `Te devolvieron ${clp(t.monto)}`, cuerpo: `${t.desc.replace(/^Cobro: /, '')} · a ${E.nombre(t.hacia)}.` };
  if (t.tipo === 'ingreso' && t.progId != null) return { titulo: `Llegó ${t.desc === 'Sueldo' ? 'tu sueldo' : t.desc}: ${clp(t.monto)}`, cuerpo: `A ${E.nombre(t.hacia)}. ${o.razon ? `${o.razon.replace(/^[^:]+: /, '').replace(/^./, (c) => c.toUpperCase())}.` : ''}`.trim() };
  if (t.tipo === 'ingreso') return { titulo: `Entró ${clp(t.monto)} · ${t.desc}`, cuerpo: `${etiquetaTx(t, S)} en ${E.nombre(t.hacia)}.` };
  return { titulo: `Entró ${clp(t.monto)} · ${t.desc}`, cuerpo: `A ${E.nombre(t.hacia)}. Quedó como abono (no cuenta como ingreso); si fue un ingreso, márcalo.` };
}

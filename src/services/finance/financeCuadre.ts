// ============================================================
// Eris Mobile — «Tus finanzas no calzan» (Eris administra, A2)
//
// El núcleo (financeCore.cuadre) compara lo que dice el banco con lo anotado y busca el porqué; acá se le pasan los avisos
// de «Por confirmar» (y los descartados), se guardan los saldos del banco (del aviso, de una captura leída en el PC, de la
// cartola o del chat), se aplican los arreglos y se avisa:
//   - con «Eris anota sola», lo que calza exacto y no viene de «Por confirmar» (algo anotado dos veces, un fijo cobrado
//     antes, el sueldo, un gasto en la cuenta equivocada) se arregla solo y se avisa con «Deshacer»;
//   - si no, una notificación tranquila («Tus finanzas no calzan…») con «Arreglar» y «Ver», máximo una por cuenta al día;
//   - el ajuste al saldo del banco, nunca sin el toque de la persona.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import {
  cuadre, anotarSaldoBanco, anotarLineaCredito, arreglarCuadre, ajustarAlBanco, estado, hwResolve, clp, todayStr, editarGasto, borrarTx, CASH,
  type AvisoPend, type Explicacion, type Cuadre, type CuadreCuenta, type FinanceState, type FormResult, type FuenteSaldo, type Ref, type Tx,
} from './financeCore';
import { financeStore } from './financeStore';
import { financeInbox } from './financeInbox';
import { cuentaDelAviso, sugerir, anotarAviso, type Eleccion } from './bankAuto';
import { bancoDe, type Propuesta } from './bankNotif';
import { AuthStorage } from '../AuthStorage';
import { wsManager } from '../WebSocketManager';

const AVISADO_KEY = 'finance_cuadre_avisado_v1';
const LOG_KEY = 'finance_cuadre_log_v1';
/** Abrir la hoja «Cuadrar» de una cuenta (la notificación «Ver», el Plan de Eris) */
export const FINANCE_CUADRE_EVENT = 'finance_cuadre_open';
/** Cambió algo del cuadre (para que Hoy vuelva a calcular con los avisos) */
export const FINANCE_CUADRE_CHANGED = 'finance_cuadre_changed';

/** Lo que Eris arregló sola (para deshacerlo) */
interface ArregloAuto { id: string; ref: Ref; at: number; texto: string; accion: Explicacion['accion']; tx?: Tx; deshecho?: boolean }

let chain: Promise<unknown> = Promise.resolve();
const serial = <T,>(fn: () => Promise<T>): Promise<T> => { const r = chain.then(fn, fn); chain = r.catch(() => {}); return r; };
const readJSON = async <T,>(k: string, def: T): Promise<T> => { try { const v = JSON.parse((await AsyncStorage.getItem(k)) || 'null'); return v ?? def; } catch { return def; } };
const SALE: Eleccion['como'][] = ['gasto', 'prestamo', 'giro', 'pago'];

/** Los avisos de «Por confirmar» y los descartados, con las cuentas a las que pueden corresponder. */
async function avisosPendientes(S: FinanceState): Promise<AvisoPend[]> {
  const aprendido = await financeInbox.aprendido();
  const E = estado(S);
  const map = (p: Propuesta, descartado: boolean): AvisoPend => {
    const c = p.cuenta != null ? p.cuenta : p.fuente === 'banco' ? cuentaDelAviso(p, S, aprendido).ref : null;
    let cuentas: Ref[] = c != null ? [c] : [];
    if (!cuentas.length) {
      const b = p.banco ?? bancoDe(`${p.app} ${p.pkg}`);
      if (b) cuentas = E.cuentas.filter((x) => x.tipo !== 'credito' && bancoDe(`${x.banco ?? ''} ${x.nombre}`) === b).map((x) => x.id);
    }
    return { clave: p.clave, desc: p.desc, monto: p.monto, fecha: p.fecha, sale: p.tipo !== 'ingreso', cuentas, tipo: p.tipo, ...(p.at ? { at: p.at } : {}), ...(descartado ? { descartado: true } : {}) };
  };
  return [...(await financeInbox.list()).map((p) => map(p, false)), ...(await financeInbox.descartados()).map((p) => map(p, true))];
}

async function estadoActual(): Promise<FinanceState | null> { return financeStore.get() ?? (await financeStore.load()); }

/** Elige la cuenta por lo que dijo (chat): la que nombró, o la única que se puede cuadrar. */
function cuentaPorPista(S: FinanceState, hint: unknown): { ref: Ref } | { error: string; msg: string; opciones?: string[] } {
  const E = estado(S);
  if (hint) {
    const r = hwResolve(E, hint, 'sinCredito');
    return r.error || r.ref == null ? { error: r.error ?? 'falta_cuenta', msg: r.msg ?? '¿De qué cuenta?', opciones: r.opciones } : { ref: r.ref };
  }
  const cs = E.cuentas.filter((c) => c.tipo !== 'credito');
  if (cs.length === 1) return { ref: cs[0].id };
  return { error: 'falta_cuenta', msg: '¿De qué cuenta es ese saldo?', opciones: cs.map((c) => c.nombre) };
}

export const financeCuadre = {
  /** El cuadre de ahora, con los avisos de «Por confirmar» (para explicar lo que no calza). */
  calcular: async (): Promise<Cuadre | null> => {
    const S = await estadoActual();
    return S ? cuadre(S, new Date(), { avisos: await avisosPendientes(S) }) : null;
  },

  /** «El banco dice $X» de una cuenta (aviso, captura, cartola, chat o a mano). */
  registrarSaldo: async (ref: Ref, saldo: number, at: number, fuente: FuenteSaldo): Promise<FormResult | null> => {
    const r = await financeStore.act((W) => anotarSaldoBanco(W, ref, { saldo, at, fuente }));
    DeviceEventEmitter.emit(FINANCE_CUADRE_CHANGED);
    return r;
  },
  /** El saldo disponible de esa cuenta incluye la línea de crédito */
  registrarLinea: async (ref: Ref, monto: number) => {
    const r = await financeStore.act((W) => anotarLineaCredito(W, ref, monto));
    DeviceEventEmitter.emit(FINANCE_CUADRE_CHANGED);
    return r;
  },

  /** «Arreglar» una explicación (lo que sea: también los avisos de «Por confirmar», que se anotan como sugiere Eris). */
  arreglar: (ref: Ref, exId: string, opts: { a?: Ref | null } = {}) => serial(async (): Promise<FormResult> => {
    const S = await estadoActual();
    if (!S) return { ok: false, msg: 'Finanzas no está lista' };
    const C = cuadre(S, new Date(), { avisos: await avisosPendientes(S) });
    const ex = C.cuentas.find((c) => c.ref === ref)?.explicaciones.find((x) => x.id === exId);
    if (!ex || !ex.accion) return { ok: false, msg: 'Eso ya cambió: vuelve a revisar el cuadre' };
    const r = await aplicarExplicacion(ref, ex, opts.a);
    DeviceEventEmitter.emit(FINANCE_CUADRE_CHANGED);
    return r;
  }),

  /** «Fue un gasto que no recuerdo»: la diferencia como un gasto sin detalle (en Otros), a la hora del banco. */
  gastoOlvidado: (ref: Ref) => serial(async (): Promise<FormResult> => {
    const S = await estadoActual();
    const c = S ? cuadre(S, new Date()).cuentas.find((x) => x.ref === ref) : null;
    if (!c || c.estado !== 'no_calza' || c.diff <= 0) return { ok: false, msg: 'No hay una diferencia que anotar como gasto' };
    const ex: Explicacion = { id: 'olvido', tipo: 'comision', texto: '', monto: c.diff, exacta: false, accion: { tipo: 'gasto', desc: 'Gasto sin detalle', cat: 'otros', monto: c.diff } };
    const r = await financeStore.act((W, ctx) => arreglarCuadre(W, ref, ex, ctx));
    DeviceEventEmitter.emit(FINANCE_CUADRE_CHANGED);
    return r ?? { ok: false, msg: 'Finanzas no está lista' };
  }),

  /** «Ajustar al saldo del banco» (solo con el toque de la persona). */
  ajustar: (ref: Ref) => serial(async (): Promise<FormResult> => {
    const r = await financeStore.act((W, ctx) => ajustarAlBanco(W, ref, ctx));
    DeviceEventEmitter.emit(FINANCE_CUADRE_CHANGED);
    return r ?? { ok: false, msg: 'Finanzas no está lista' };
  }),

  /**
   * Revisar después de un saldo nuevo (o al abrir): con «anota sola», lo exacto se arregla solo; lo demás se avisa una vez
   * al día por cuenta. Lo que ya está en «Por confirmar» no se vuelve a avisar (ya lo ves ahí).
   */
  revisar: (o: { auto: boolean; avisar?: boolean }) => serial(async () => {
    const S = await estadoActual();
    if (!S) return null;
    let C = cuadre(S, new Date(), { avisos: await avisosPendientes(S) });
    const hechos: string[] = [], ids: string[] = [];
    const avisado = await readJSON<Record<string, string>>(AVISADO_KEY, {});
    const hoy = todayStr(new Date());
    if (o.auto) {
      // Lo que la persona deshizo no se vuelve a arreglar solo (queda como opción en «Cuadrar»)
      const rechazados = new Set((await readJSON<ArregloAuto[]>(LOG_KEY, [])).filter((x) => x.deshecho).map((x) => x.id.replace(/:\d+$/, '')));
      for (const c of C.cuentas.filter((x) => x.estado === 'no_calza')) {
        const top = c.explicaciones[0];
        if (!top?.exacta || !top.accion || top.accion.tipo === 'anotar_avisos' || rechazados.has(top.id)) continue;
        if (top.accion.tipo === 'mover' && top.accion.a == null) continue;
        const r = await aplicarExplicacion(c.ref, top, undefined, true);
        if (r.ok) { hechos.push(`${c.nombre}: ${r.msg}`); if (r.logId) ids.push(r.logId); avisado[String(c.ref)] = hoy; }
      }
      if (hechos.length) {
        const S2 = await estadoActual();
        if (S2) C = cuadre(S2, new Date(), { avisos: await avisosPendientes(S2) });
        try { await require('../ErisNotifications').erisNotifications.financeCuadre({ arreglado: hechos, ids }); } catch {}
      }
    }
    if (o.avisar !== false) {
      const nuevos = C.cuentas.filter((c) => c.estado === 'no_calza' && avisado[String(c.ref)] !== hoy
        && !(c.explicaciones[0] && (c.explicaciones[0].tipo === 'aviso' || c.explicaciones[0].tipo === 'avisos')));
      const neg = C.alertas.filter((a) => a.tipo === 'negativo' && a.ref != null && avisado[`neg:${a.ref}`] !== hoy);
      for (const c of nuevos.slice(0, 1)) {
        avisado[String(c.ref)] = hoy;
        try { await require('../ErisNotifications').erisNotifications.financeCuadre({ cuenta: c }); } catch {}
      }
      if (!nuevos.length) for (const a of neg.slice(0, 1)) {
        avisado[`neg:${a.ref}`] = hoy;
        try { await require('../ErisNotifications').erisNotifications.financeCuadre({ alerta: a }); } catch {}
      }
    }
    await AsyncStorage.setItem(AVISADO_KEY, JSON.stringify(avisado)).catch(() => {});
    DeviceEventEmitter.emit(FINANCE_CUADRE_CHANGED);
    return C;
  }),

  /** Deshacer lo que Eris arregló sola */
  deshacer: (id: string) => serial(async () => {
    const log = await readJSON<ArregloAuto[]>(LOG_KEY, []);
    const e = log.find((x) => x.id === id && !x.deshecho);
    if (!e || !e.accion) return false;
    const a = e.accion;
    const r = await financeStore.act((W) => {
      if (a.tipo === 'borrar' && e.tx) { if (!W.tx.some((t) => t.id === e.tx!.id)) W.tx = [...W.tx, e.tx]; return { ok: true, msg: 'Volvió' }; }
      if (a.tipo === 'mover') return editarGasto(W, a.txId, { cuenta: a.de });
      if ((a.tipo === 'fijo' || a.tipo === 'sueldo') && e.tx) { borrarTx(W, e.tx.id); if (a.tipo === 'fijo') W.rec = W.rec.filter((k) => k !== `${a.progId}:${e.tx!.progMes}`); return { ok: true, msg: 'Deshecho' }; }
      return { ok: false, msg: 'No sé deshacer eso' };
    });
    if (r?.ok) {
      e.deshecho = true;
      await AsyncStorage.setItem(LOG_KEY, JSON.stringify(log)).catch(() => {});
      // Recién deshecho: hoy no se avisa «no calzan» por esa cuenta (ya lo sabe)
      const av = await readJSON<Record<string, string>>(AVISADO_KEY, {});
      av[String(e.ref)] = todayStr(new Date());
      await AsyncStorage.setItem(AVISADO_KEY, JSON.stringify(av)).catch(() => {});
    }
    DeviceEventEmitter.emit(FINANCE_CUADRE_CHANGED);
    return !!r?.ok;
  }),
  /** Lo último que Eris arregló sola (para el panel) */
  arreglados: async (horas = 36): Promise<ArregloAuto[]> => (await readJSON<ArregloAuto[]>(LOG_KEY, [])).filter((x) => !x.deshecho && Date.now() - x.at < horas * 3_600_000).reverse(),

  /**
   * Por chat («mi BCI tiene 412 lucas», «¿mis finanzas calzan?», «arregla mi Santander», «ajusta mi BCI al banco»): la
   * operación del servidor (finance_tracker) se resuelve acá y vuelven solo números y frases para la respuesta.
   */
  chatOp: async (op: any): Promise<{ ok: boolean; code?: string; msg?: string; opciones?: string[]; data?: any }> => {
    const S = await estadoActual();
    if (!S) return { ok: false, code: 'sin_finanzas', msg: 'Finanzas no está lista en el teléfono' };
    let aplicado: string | undefined;
    let foco: Ref | null = null;
    if (op.action === 'saldo_banco') {
      const monto = Math.round(Number(op.monto));
      if (!Number.isFinite(monto)) return { ok: false, code: 'invalido', msg: 'Falta el saldo' };
      const c = cuentaPorPista(S, op.cuenta);
      if ('error' in c) return { ok: false, code: c.error, msg: c.msg, opciones: c.opciones, data: { campo: 'cuenta' } };
      const r = await financeCuadre.registrarSaldo(c.ref, monto, Date.now(), 'chat');
      if (!r?.ok) return { ok: false, code: 'invalido', msg: r?.msg ?? 'No pude guardar ese saldo' };
      foco = c.ref;
    } else if (op.cuenta) {
      const c = cuentaPorPista(S, op.cuenta);
      if ('error' in c) return { ok: false, code: c.error, msg: c.msg, opciones: c.opciones, data: { campo: 'cuenta' } };
      foco = c.ref;
    }
    let C = await financeCuadre.calcular();
    if (!C) return { ok: false, code: 'sin_finanzas', msg: 'Finanzas no está lista en el teléfono' };
    if (op.action === 'cuadre' && op.aplicar) {
      const malas = C.cuentas.filter((c) => c.estado === 'no_calza' && (foco == null || c.ref === foco));
      if (!malas.length) aplicado = foco != null ? 'Esa cuenta ya calza (o no tengo su saldo del banco)' : 'No hay nada que arreglar';
      else if (malas.length > 1) return { ok: false, code: 'falta_cuenta', msg: '¿Cuál arreglo?', opciones: malas.map((c) => c.nombre), data: { campo: 'cuenta' } };
      else {
        const c = malas[0];
        foco = c.ref;
        // Por chat se arregla solo lo que calza exacto; lo dudoso se elige en la hoja «Cuadrar»
        const top = c.explicaciones.find((x) => x.exacta && x.accion && !(x.accion.tipo === 'mover' && x.accion.a == null));
        const r = op.aplicar === 'ajuste' ? await financeCuadre.ajustar(c.ref)
          : top ? await financeCuadre.arreglar(c.ref, top.id) : { ok: false, msg: `No estoy segura de qué es: te dejé las opciones en Finanzas → Hoy → Cuadrar` };
        aplicado = r.msg;
        C = (await financeCuadre.calcular()) ?? C;
      }
    }
    const ver = (c: CuadreCuenta) => ({
      nombre: c.nombre, estado: c.estado, diff: c.diff, banco: c.banco?.saldo ?? null, libro: c.libro, horas: c.banco ? Math.round((Date.now() - c.banco.at) / 3_600_000) : null,
      fuente: c.banco?.fuente ?? null, explicacion: c.explicaciones[0]?.texto ?? null, arreglable: !!c.explicaciones.find((x) => x.exacta && x.accion && !(x.accion.tipo === 'mover' && x.accion.a == null)),
      mas: Math.max(0, c.explicaciones.length - 1),
    });
    const cuentas = C.cuentas.filter((c) => (foco == null ? c.banco != null : c.ref === foco)).map(ver);
    return { ok: true, data: { cuentas, sinDato: C.cuentas.filter((c) => !c.banco).map((c) => c.nombre), alertas: C.alertas.map((a) => a.texto).slice(0, 3), ...(aplicado ? { aplicado } : {}) } };
  },

  /** Abrir la hoja «Cuadrar» (de una cuenta o la primera que no calza) apenas Finanzas esté lista */
  abrir: (ref: Ref | null = null) => { pendingOpen = { ref }; DeviceEventEmitter.emit(FINANCE_CUADRE_EVENT, ref); },
  takePendingOpen: (): { ref: Ref | null } | null => { const x = pendingOpen; pendingOpen = null; return x; },

  /** Leer el saldo de una captura de la app del banco (en el PC: la imagen se borra al terminar). */
  leerCaptura: (base64: string): Promise<{ ok: true; saldos: Array<{ etiqueta: string; monto: number }>; last4: string[] } | { ok: false; msg: string }> => {
    if (wsManager.getStatus() !== 'connected') return Promise.resolve({ ok: false, msg: 'Para leer la captura necesito conexión con el PC de Eris.' });
    return new Promise((resolve) => {
      const requestId = `sal_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      let done = false;
      const finish = (r: any) => { if (done) return; done = true; clearTimeout(timer); unsub(); resolve(r); };
      const timer = setTimeout(() => finish({ ok: false, msg: 'El PC no respondió a tiempo. Intenta de nuevo.' }), 60_000);
      const unsub = wsManager.subscribeMessage((d: any) => {
        if (d?.type !== 'finance_balance_read' || d.requestId !== requestId) return;
        finish(d.ok ? { ok: true, saldos: Array.isArray(d.saldos) ? d.saldos : [], last4: Array.isArray(d.last4) ? d.last4 : [] } : { ok: false, msg: String(d.msg || 'No pude leer la captura.') });
      });
      wsManager.sendMessage({ type: 'finance_balance_photo', requestId, image: base64 });
    });
  },
};
let pendingOpen: { ref: Ref | null } | null = null;

/** Aplica una explicación; lo que hizo Eris sola queda en el registro para «Deshacer». */
async function aplicarExplicacion(ref: Ref, ex: Explicacion, a?: Ref | null, auto = false): Promise<FormResult & { logId?: string }> {
  const acc = ex.accion;
  if (!acc) return { ok: false, msg: 'Eso se arregla solo cuando el banco lo cobre' };
  if (acc.tipo === 'anotar_avisos') {
    const S = await estadoActual();
    if (!S) return { ok: false, msg: 'Finanzas no está lista' };
    const aprendido = await financeInbox.aprendido();
    const yo = (await AuthStorage.getDisplayName().catch(() => null)) ?? '';
    const todos = [...(await financeInbox.list()), ...(await financeInbox.descartados())];
    const msgs: string[] = [];
    for (const clave of acc.claves) {
      const p = todos.find((x) => x.clave === clave);
      if (!p) continue;
      const e = sugerir(p, financeStore.get() ?? S, aprendido, { yo });
      // La cuenta del aviso es la que se está cuadrando (si Eris no la sabía)
      if (SALE.includes(e.como) && e.cuenta == null) e.cuenta = ref;
      if (!SALE.includes(e.como) && e.como !== 'propia' && e.cuenta == null) e.cuenta = ref;
      if (e.como === 'propia') { if (p.tipo === 'ingreso') e.otra = e.otra ?? ref; else e.cuenta = e.cuenta ?? ref; }
      const r = await financeStore.act((W, ctx) => anotarAviso(W, p, e, ctx));
      if (!r?.ok) return { ok: false, msg: r?.msg ?? 'No pude anotarlo' };
      await financeInbox.resolve(p.clave);
      await financeInbox.olvidarDescartado(p.clave);
      if (p.fuente === 'banco' && e.cuenta != null && e.cuenta !== CASH) await financeInbox.recordarCuenta(p.pkg, p.last4, e.cuenta);
      msgs.push(`${p.desc} (${clp(p.monto)})`);
    }
    return msgs.length ? { ok: true, msg: `Anoté ${msgs.join(' y ')}` } : { ok: false, msg: 'Esos avisos ya no están' };
  }
  const exx: Explicacion = acc.tipo === 'mover' && a !== undefined ? { ...ex, accion: { ...acc, a } } : ex;
  const antes = financeStore.get();
  const r = await financeStore.act((W, ctx) => arreglarCuadre(W, ref, exx, ctx));
  if (r?.ok && auto) {
    // Para deshacer: el movimiento que se borró, o el que se creó
    const despues = financeStore.get();
    const tx = acc.tipo === 'borrar' ? antes?.tx.find((t) => t.id === acc.txId)
      : despues?.tx.filter((t) => !antes?.tx.some((x) => x.id === t.id) && t.via === 'cuadre').pop();
    const log = await readJSON<ArregloAuto[]>(LOG_KEY, []);
    const logId = `${ex.id}:${Date.now()}`;
    log.push({ id: logId, ref, at: Date.now(), texto: r.msg, accion: exx.accion, ...(tx ? { tx } : {}) });
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-40))).catch(() => {});
    return { ...r, logId };
  }
  return r ?? { ok: false, msg: 'Finanzas no está lista' };
}

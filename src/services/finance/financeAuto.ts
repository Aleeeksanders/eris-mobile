// ============================================================
// Eris Mobile — Finanzas en automático: los avisos del banco se procesan solos (Eris administra, A0–A1)
//
// La cola del módulo nativo (avisos con monto de las apps del banco que eligió la persona, y sus correos o SMS si los
// activó) se recoge en cualquier momento, no solo con Finanzas abierta: al abrir la app, al volver a ella, cuando llega un
// aviso con la app viva y, con la app cerrada, desde la tarea headless `ErisBankAuto` (index.ts) que lanza el propio
// servicio de Android. Primero se juntan las dos mitades de una transferencia entre tus cuentas (`emparejar`); después
// cada aviso pasa por `bankAuto.decidir`: lo claro se anota solo (con la fecha y hora reales del aviso), lo dudoso va a
// «Por confirmar», y una mitad que puede ser entre tus cuentas espera un rato a la otra (`finance_auto_espera_v1`).
//
// Lo que Eris anota queda en un registro (`finance_auto_log_v1`) para mostrarlo en Finanzas → Hoy y poder deshacerlo, y
// se avisa con una notificación silenciosa con «Deshacer» (sin abrir la app) y «Cambiar» o «Fue un ingreso».
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, DeviceEventEmitter } from 'react-native';
import { BankNotifications, type BankNotice } from '../../../modules/eris-bank-notifications';
import { decidir, decidirP, emparejar, aplicar, cuentaDelAviso, editarEntrada, resumenAnotado, etiquetaTx, AUTO_DEFAULT, ESPERA_MS, type AutoConfig, type Contexto, type Decision, type Como } from './bankAuto';
import { bancoDe, parseAviso, LECTOR_V, type Propuesta } from './bankNotif';
import { financeInbox } from './financeInbox';
import { financeStore } from './financeStore';
import { borrar, estado, type FinanceState, type Fuente, type Ref, type Tx } from './financeCore';
import { FeatureStore } from '../../config/features';
import { PROFILE_CHANGED_EVENT } from '../ScopedStorage';
import { AuthStorage } from '../AuthStorage';
import { financeCuadre } from './financeCuadre';
import { modulosOn } from '../modulosOn';

const CFG_KEY = 'finance_auto_v1';
const LOG_KEY = 'finance_auto_log_v1';
const ESPERA_KEY = 'finance_auto_espera_v1';
/** Lo tomado de la cola nativa y todavía sin decidir: si algo falla a mitad, la próxima vez se retoma (revisión D1) */
const TOMADOS_KEY = 'finance_auto_tomados_v1';
const LOG_DAYS = 30;
const LOG_MAX = 200;
/** Cambió la configuración o el registro: las pantallas vuelven a leer */
export const FINANCE_AUTO_EVENT = 'finance_auto_changed';
/** Abrir un movimiento en Finanzas (el botón «Cambiar» de la notificación) */
export const FINANCE_OPEN_TX_EVENT = 'finance_open_tx';

/** Lo que Eris anotó sola */
export interface AutoEntry {
  clave: string; txId: Tx['id']; desc: string; monto: number; cat: string; cuenta: Ref; cuentaNombre: string;
  fecha: string; hora: string; app: string; last4?: string; at: number; deshecho?: boolean;
  /** qué fue (A1): gasto, entre tus cuentas, abono, sueldo… (sin esto, un gasto: registros de A0) */
  como?: Como | 'unir';
  /** cómo se cuenta ahora («Comida», «Entre tus cuentas», «Abono»…) y la notificación */
  etiqueta?: string; titulo?: string; cuerpo?: string;
  /** el aviso tal cual: si se deshace, vuelve a «Por confirmar» (y la otra mitad, si eran dos) */
  p: Propuesta; q?: Propuesta;
  /** lo que había antes de unir las dos mitades (deshacer lo deja como estaba) */
  antes?: Tx;
  /** con qué versión del lector se leyó (sin esto, la 1): ver releer */
  lector?: number;
}

let chain: Promise<unknown> = Promise.resolve();
const serial = <T,>(fn: () => Promise<T>): Promise<T> => { const r = chain.then(fn, fn); chain = r.catch(() => {}); return r; };

async function readCfg(): Promise<AutoConfig> {
  try { const v = JSON.parse((await AsyncStorage.getItem(CFG_KEY)) || 'null'); return v && typeof v === 'object' ? { ...AUTO_DEFAULT, ...v } : { ...AUTO_DEFAULT }; } catch { return { ...AUTO_DEFAULT }; }
}
async function readLog(): Promise<AutoEntry[]> {
  try { const v = JSON.parse((await AsyncStorage.getItem(LOG_KEY)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
async function writeLog(xs: AutoEntry[]) {
  const lim = Date.now() - LOG_DAYS * 86_400_000;
  await AsyncStorage.setItem(LOG_KEY, JSON.stringify(xs.filter((x) => x.at > lim).slice(-LOG_MAX))).catch(() => {});
  DeviceEventEmitter.emit(FINANCE_AUTO_EVENT);
}
async function readEspera(): Promise<BankNotice[]> {
  try { const v = JSON.parse((await AsyncStorage.getItem(ESPERA_KEY)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Los bancos que avisan (para saber si la otra mitad de una transferencia puede llegar) */
function vigilados(): string[] {
  const seen = BankNotifications.seenApps();
  const out = BankNotifications.getAllowed().map((pkg) => bancoDe(`${pkg} ${seen.find((x) => x.pkg === pkg)?.app ?? ''}`)).filter((x): x is string => !!x);
  return BankNotifications.getMail() ? [...out, '*'] : out;
}

let pendingOpen: Tx['id'] | null = null;

export const financeAuto = {
  getConfig: readCfg,
  /** ¿Anota sola? Encendido por la persona y con visto bueno (el visto bueno queda guardado: la tarea headless no tiene servidor) */
  activo: async () => { const c = await readCfg(); return c.on === true && c.allowed === true; },
  setConfig: (patch: Partial<AutoConfig>) => serial(async () => {
    const next = { ...(await readCfg()), ...patch };
    await AsyncStorage.setItem(CFG_KEY, JSON.stringify(next)).catch(() => {});
    DeviceEventEmitter.emit(FINANCE_AUTO_EVENT);
    return next;
  }),
  log: readLog,

  /**
   * Cuando el lector de avisos mejora (bankNotif.LECTOR_V), lo que Eris anotó sola sin entender el comercio o con quién
   * fue («Compra MACHBANK», «Transferencia») se vuelve a leer con el texto guardado en el registro (30 días). Si ahora se
   * entiende, se corrige la descripción (y la categoría, solo si quedó en «Otros»), siempre que la persona no la haya
   * cambiado. Revisión F1, 2026-11-04. Devuelve cuántos movimientos corrigió.
   */
  releer: () => serial(async () => {
    const xs = await readLog();
    const pend = xs.filter((e) => !e.deshecho && (e.lector ?? 1) < LECTOR_V && e.p && typeof e.p.texto === 'string');
    if (!pend.length) return 0;
    const cambios: Array<{ id: Tx['id']; antes: string[]; desc: string; cat?: string }> = [];
    for (const e of pend) {
      e.lector = LECTOR_V;
      if (e.p.comercio || e.p.contraparte) continue; // ya se entendía
      const partes = e.p.texto.split(' · ');
      const p2 = parseAviso({ pkg: e.p.pkg, app: e.p.app, title: partes.length > 1 ? partes[0] : '', text: partes.length > 1 ? partes.slice(1).join(' · ') : partes[0],
        at: e.p.at ?? e.at, key: String(e.p.clave).replace(/^notif:/, ''), ...(e.p.via ? { via: e.p.via } : {}) });
      if (!p2 || p2.tipo !== e.p.tipo || p2.monto !== e.p.monto || p2.desc === e.p.desc) continue;
      cambios.push({ id: e.txId, antes: [e.desc, e.p.desc], desc: p2.desc, ...(p2.tipo === 'compra' && p2.comercio && p2.cat !== 'otros' ? { cat: p2.cat } : {}) });
      e.p = { ...e.p, desc: p2.desc, ...(p2.comercio ? { comercio: p2.comercio } : {}), ...(p2.contraparte ? { contraparte: p2.contraparte } : {}) };
      e.desc = p2.desc;
    }
    let n = 0;
    if (cambios.length) {
      await financeStore.act((W) => {
        for (const c of cambios) {
          const t = W.tx.find((x) => x.id === c.id);
          if (!t || !c.antes.includes(t.desc)) continue; // la persona le cambió el nombre: se respeta
          t.desc = c.desc;
          if (c.cat && t.tipo === 'gasto' && t.cat === 'otros') t.cat = c.cat;
          n++;
        }
        return { ok: n > 0 };
      }).catch(() => null);
    }
    await writeLog(xs);
    return n;
  }),

  /** Recoge los avisos nuevos (y los que esperaban su otra mitad) y decide cada uno. */
  process: () => serial(async () => {
    // Finanzas apagado en Perfil (revisión A2): los avisos quedan en la cola del teléfono, sin anotarse
    if (!modulosOn.on('finanzas')) return { anotados: 0, propuestos: 0 };
    // La cola nativa se vacía al tomarla: lo tomado se guarda ANTES de decidir y se borra al terminar. Si algo falla a
    // mitad (el almacenamiento, el límite de 30 s de la tarea headless), la próxima pasada lo retoma; lo ya anotado se
    // reconoce por la clave del aviso (yaAnotado / vistos) y no se duplica.
    const previos: BankNotice[] = await AsyncStorage.getItem(TOMADOS_KEY).then((r) => { try { const v = JSON.parse(r || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }).catch(() => []);
    const tomados = BankNotifications.takeQueue();
    const nuevos = [...previos, ...tomados.filter((a) => !previos.some((b) => b.key === a.key))];
    if (tomados.length) await AsyncStorage.setItem(TOMADOS_KEY, JSON.stringify(nuevos.slice(-200))).catch(() => {});
    const espera = await readEspera();
    if (!nuevos.length && !espera.length) return { anotados: 0, propuestos: 0 };
    const cfg = await readCfg();
    const S0 = await financeStore.load();
    const on = cfg.on === true && cfg.allowed === true && !!S0;
    const aprendido = await financeInbox.aprendido();
    const vistos = await financeInbox.vistos();
    const cx: Contexto = { yo: (await AuthStorage.getDisplayName().catch(() => null)) ?? '', vigilados: vigilados(), ahora: Date.now() };
    const porKey = new Map<string, BankNotice>();
    for (const a of [...espera, ...nuevos]) if (!vistos.has(`notif:${a.key}`)) porKey.set(a.key, a);
    const todos = [...porKey.values()].sort((x, y) => (x.at || 0) - (y.at || 0));
    const props: Propuesta[] = [], hechos: AutoEntry[] = [], quedan: BankNotice[] = [];
    // A2: «saldo disponible $X» del aviso = lo que dice el banco de esa cuenta a esa hora (para el cuadre)
    const lecturas: Array<{ ref: Ref; saldo: number; at: number }> = [];
    const lectura = (p: Propuesta, ref: Ref | null | undefined) => { if (p.saldo != null && ref != null) lecturas.push({ ref, saldo: p.saldo, at: p.at ?? Date.now() }); };

    const hacer = async (d: Decision) => {
      if (d.accion === 'ignorar' || d.accion === 'esperar') return;
      if (vistos.has(d.p.clave)) return;
      vistos.add(d.p.clave);
      if (d.accion === 'anotar' && d.q) vistos.add(d.q.clave);
      if (d.accion === 'proponer') {
        props.push(d.razon ? { ...d.p, razon: d.razon } : d.p);
        const S = financeStore.get();
        if (S && d.p.saldo != null) lectura(d.p, cuentaDelAviso(d.p, S, aprendido).ref);
        return;
      }
      const res = await financeStore.act((W, ctx) => aplicar(W, d, ctx));
      if (d.accion === 'vincular') {
        if (res?.ok) {
          await financeInbox.resolve(d.p.clave);
          const t = financeStore.get()?.tx.find((x) => x.id === d.txId);
          if (t) lectura(d.p, d.p.tipo === 'ingreso' ? t.hacia : t.desde);
        } else props.push(d.p);
        return;
      }
      if (res?.ok && res.tx) {
        const S = financeStore.get();
        const t = S?.tx.find((x) => x.id === res.tx!.id) ?? res.tx;
        const { titulo, cuerpo } = S ? resumenAnotado(t, S, { last4: d.p.last4, razon: d.razon }) : { titulo: '', cuerpo: '' };
        const cuenta = (t.tipo === 'gasto' || t.tipo === 'giro' || t.tipo === 'transfer' || t.tipo === 'ahorro' ? t.desde : t.hacia) ?? null;
        hechos.push({
          clave: d.p.clave, txId: t.id, desc: t.desc, monto: t.monto, cat: String(t.cat ?? 'otros'), cuenta: cuenta as Ref, cuentaNombre: S && cuenta != null ? estado(S).nombre(cuenta) : '',
          fecha: d.p.fecha, hora: d.p.hora, app: d.p.app, ...(d.p.last4 ? { last4: d.p.last4 } : {}), at: Date.now(),
          como: d.accion === 'unir' ? 'unir' : d.e.como, etiqueta: S ? etiquetaTx(t, S) : '', titulo, cuerpo, p: d.p,
          ...(d.accion === 'anotar' && d.q ? { q: d.q } : {}), ...(res.antes ? { antes: res.antes } : {}),
        });
        await financeInbox.resolve(d.p.clave);
        if (d.accion === 'anotar' && d.q) await financeInbox.resolve(d.q.clave);
        if (d.accion === 'unir') lectura(d.p, d.p.tipo === 'ingreso' ? d.hacia : d.desde);
        else { lectura(d.p, d.e.como === 'propia' && d.p.tipo === 'ingreso' ? d.e.otra : d.e.cuenta); if (d.q) lectura(d.q, d.e.otra); }
      } else {
        props.push({ ...d.p, razon: res?.msg ?? 'No pude anotarlo sola' });
        if (d.accion === 'anotar' && d.q) props.push({ ...d.q, razon: res?.msg ?? 'No pude anotarlo sola' });
      }
    };

    // 1) Las dos mitades de una transferencia entre tus cuentas que llegaron juntas
    const S1 = financeStore.get();
    const { pares, resto } = on && S1 ? emparejar(todos, S1, aprendido, cx) : { pares: [] as Decision[], resto: todos };
    for (const d of pares) await hacer(d);
    // 2) Cada uno, con el libro al día (lo recién anotado cuenta para el siguiente)
    for (const a of resto) {
      const d = decidir(a, financeStore.get(), aprendido, { ...cfg, on }, cx);
      if (d.accion === 'esperar') { quedan.push(a); continue; }
      await hacer(d);
    }
    // Lo que espera su otra mitad (no más de lo debido: pasado el plazo, la próxima vez se decide solo)
    await AsyncStorage.setItem(ESPERA_KEY, JSON.stringify(quedan.filter((a) => Date.now() - (a.at || 0) < 6 * ESPERA_MS))).catch(() => {});
    if (props.length) await financeInbox.add(props);
    // Todo decidido y guardado: lo tomado ya no hace falta
    await AsyncStorage.removeItem(TOMADOS_KEY).catch(() => {});
    if (hechos.length) {
      await writeLog([...(await readLog()), ...hechos]);
      // require: ErisNotifications importa el WS y la persona (evita el ciclo con las pantallas)
      try { await require('../ErisNotifications').erisNotifications.financeAuto(hechos); } catch {}
    }
    // El cuadre con lo que dijo el banco (arregla solo lo exacto si Eris anota sola; si no, avisa una vez al día)
    if (lecturas.length) {
      for (const l of lecturas) await financeCuadre.registrarSaldo(l.ref, l.saldo, l.at, 'aviso').catch(() => null);
      await financeCuadre.revisar({ auto: on && cfg.cuadre !== false, avisar: cfg.allowed === true }).catch(() => null);
    }
    return { anotados: hechos.length, propuestos: props.length, esperando: quedan.length, lecturas: lecturas.length };
  }),

  /**
   * Lo que quedó en «Por confirmar» y ahora ya está en el libro: la otra mitad de una transferencia que anotaste a mano
   * (se enlaza y sale de la lista, así no se anota dos veces). Con Eris anotando sola, también lo que anotaste por chat.
   */
  ordenarBandeja: () => serial(async () => {
    const S = financeStore.get() ?? (await financeStore.load());
    if (!S) return 0;
    const auto = await financeAuto.activo();
    const aprendido = await financeInbox.aprendido();
    let n = 0;
    for (const p of await financeInbox.list()) {
      if (p.fuente !== 'banco') continue;
      const d = decidirP(p, financeStore.get() ?? S, aprendido, { on: true, tope: 0 }, {});
      if (d.accion === 'ignorar' && d.razon === 'ya está anotado') { await financeInbox.resolve(p.clave); n++; continue; }
      if (d.accion !== 'vincular') continue;
      const t = (financeStore.get() ?? S).tx.find((x) => x.id === d.txId);
      // Sin «anota sola», solo la otra mitad de una transferencia entre tus cuentas (lo demás lo decides tú: «¿Ya está?»)
      if (!auto && !(t && (t.tipo === 'transfer' || t.tipo === 'ahorro') && t.notif)) continue;
      const r = await financeStore.act((W, ctx) => aplicar(W, d, ctx));
      if (r?.ok) { await financeInbox.resolve(p.clave); n++; }
    }
    return n;
  }),

  /** Deshacer lo que Eris anotó: se borra (o, si unió dos mitades, vuelve a como estaba) y el aviso vuelve a «Por confirmar». */
  deshacer: (clave: string) => serial(async () => {
    const log = await readLog();
    const e = log.find((x) => x.clave === clave && !x.deshecho);
    if (!e) return false;
    if (e.antes) {
      const antes = e.antes;
      await financeStore.act((W) => { if (!W.tx.some((t) => t.id === antes.id)) return { ok: true, msg: '' }; W.tx = W.tx.map((t) => (t.id === antes.id ? antes : t)); return { ok: true, msg: 'Como estaba' }; });
    } else await financeStore.act((W) => (W.tx.some((t) => t.id === e.txId) ? borrar(W, 'tx', e.txId) : { ok: true, msg: '' }));
    e.deshecho = true;
    await writeLog(log);
    const razon = 'Lo deshiciste: anótalo como corresponde o descártalo.';
    await financeInbox.devolver({ ...e.p, razon });
    if (e.q) await financeInbox.devolver({ ...e.q, razon });
    return true;
  }),

  /** «Fue un ingreso»: un abono que Eris anotó era un ingreso (la próxima vez de esa persona, se anota así). */
  fueIngreso: (clave: string, fuente: Fuente = 'extra') => serial(async () => {
    const log = await readLog();
    const e = log.find((x) => x.clave === clave && !x.deshecho);
    if (!e) return false;
    const ok = !!(await financeStore.act((W) => editarEntrada(W, e.txId, fuente)))?.ok;
    if (ok) { e.como = 'ingreso'; await writeLog(log); }
    return ok;
  }),

  /** Lo de hoy y ayer que sigue anotado (el panel «Anotó Eris»), como está AHORA en el libro */
  recientes: async (S: FinanceState | null, horas = 36): Promise<AutoEntry[]> => {
    if (!S) return [];
    const lim = Date.now() - horas * 3_600_000;
    const E = estado(S);
    const byId = new Map(S.tx.map((t) => [t.id, t] as const));
    return (await readLog()).filter((e) => !e.deshecho && e.at > lim && byId.has(e.txId)).map((e) => {
      const t = byId.get(e.txId)!;
      const ref = (t.tipo === 'gasto' || t.tipo === 'giro' || t.tipo === 'transfer' || t.tipo === 'ahorro' ? t.desde : t.hacia) ?? e.cuenta;
      const nombre = t.tipo === 'transfer' || t.tipo === 'ahorro' || t.tipo === 'giro' ? `${E.nombre(t.desde)} → ${E.nombre(t.hacia)}` : E.nombre(ref);
      return { ...e, desc: t.desc, monto: t.monto, cat: String(t.cat ?? e.cat), cuenta: ref, cuentaNombre: nombre, etiqueta: etiquetaTx(t, S),
        // el tipo de AHORA (si lo cambiaste a ingreso, ya no ofrece «Fue un ingreso»)
        como: t.tipo === 'abono' ? 'abono' : t.tipo === 'ingreso' && e.como === 'abono' ? 'ingreso' : e.como,
        last4: ref === e.cuenta ? e.last4 : undefined };
    }).reverse();
  },

  /** «Cambiar» desde la notificación: Finanzas abre ese movimiento apenas esté lista */
  openTx: (id: Tx['id']) => { pendingOpen = id; DeviceEventEmitter.emit(FINANCE_OPEN_TX_EVENT, id); },
  takePendingOpen: (): Tx['id'] | null => { const x = pendingOpen; pendingOpen = null; return x; },
};

/** Avisos nuevos → «Por confirmar» en orden → el cuadre con el banco (con visto bueno: avisa una vez al día por cuenta) */
const run = () => {
  financeAuto.process().then(() => financeAuto.releer()).then(() => financeAuto.ordenarBandeja()).then(() => readCfg())
    .then((c) => financeCuadre.revisar({ auto: c.on === true && c.allowed === true && c.cuadre !== false, avisar: c.allowed === true }))
    // A3: el resumen del domingo (lo que Eris hizo sola en la semana) se vuelve a programar con lo de ahora
    .then(() => require('../weeklyAuto').programarDomingo()).catch(() => {});
};
let escuchando = false;
/** Cuando llega un aviso con JS vivo (la app abierta, o el JS que despertó la tarea headless y sigue en memoria) */
function escucharAvisos() {
  if (escuchando) return;
  escuchando = true;
  BankNotifications.onNotice(run);
}

let started = false;
/** Se arranca una vez en App: procesa al abrir, al volver a la app y cuando llega un aviso con la app viva. */
export function startFinanceAuto() {
  if (started) return;
  started = true;
  // El visto bueno del administrador se guarda: la tarea headless (app cerrada) no habla con el servidor
  const syncAllowed = () => {
    const allowed = FeatureStore.get().finanzasAuto;
    readCfg().then((c) => { if (c.allowed !== allowed) return financeAuto.setConfig({ allowed }); }).catch(() => {});
  };
  FeatureStore.subscribe(syncAllowed);
  escucharAvisos();
  // El módulo nativo guarda los avisos por cuenta: se le dice cuál está activa (sin sesión, no lee nada; revisión D4)
  const fijarCuenta = () => AuthStorage.getCredentials().then((c) => BankNotifications.setProfile(c?.profileId ?? null)).catch(() => {});
  void fijarCuenta();
  AppState.addEventListener('change', (st) => { if (st === 'active') run(); });
  DeviceEventEmitter.addListener(PROFILE_CHANGED_EVENT, () => { void fijarCuenta().then(run); });
  setTimeout(run, 2500);
}

/** La tarea headless de Android (app cerrada): procesa la cola y termina. */
export async function runBankHeadless() {
  escucharAvisos();
  try { await financeAuto.process(); } catch {}
}

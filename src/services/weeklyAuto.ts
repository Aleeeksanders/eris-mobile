// ============================================================
// Eris Mobile — el domingo: lo que Eris hizo sola en la semana (Eris administra, A3)
//
// Se arma con lo que quedó registrado en el teléfono (lo que anotó de tus avisos, lo que cuadró, lo que descontó de la
// despensa, lo que entró a la lista de compras) y se programa para el domingo a las 19:00. Cada vez que la app corre se
// vuelve a programar con lo de ahora (así llega al día). Sin nada que contar, no se programa. Se apaga en «Así manejo tu…».
// ============================================================
import { autoPrefs } from './autoPrefs';

const DIA = 86_400_000;
const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;

export interface ResumenSemana { lineas: string[]; anotados: number; arreglos: number }

/** Lo de los últimos 7 días (hasta `now`) */
export async function resumenSemana(now = new Date()): Promise<ResumenSemana> {
  const desde = now.getTime() - 7 * DIA;
  const lineas: string[] = [];
  let anotados = 0, arreglos = 0;
  // Plata: lo que anotó de los avisos del banco y lo que cuadró
  try {
    const { financeAuto } = require('./finance/financeAuto');
    const log: Array<{ at: number; deshecho?: boolean; como?: string }> = (await financeAuto.log()).filter((e: any) => e.at > desde);
    const ok = log.filter((e) => !e.deshecho);
    anotados = ok.length;
    if (ok.length) {
      const n = (f: (c: string) => boolean) => ok.filter((e) => f(e.como ?? 'gasto')).length;
      const partes = [
        n((c) => c === 'gasto') ? plural(n((c) => c === 'gasto'), 'gasto') : '',
        n((c) => c === 'propia' || c === 'unir' || c === 'pago' || c === 'giro') ? `${plural(n((c) => c === 'propia' || c === 'unir' || c === 'pago' || c === 'giro'), 'movimiento')} entre tus cuentas` : '',
        n((c) => c === 'sueldo') ? 'tu sueldo' : '',
        n((c) => c === 'abono' || c === 'ingreso' || c === 'cobro') ? plural(n((c) => c === 'abono' || c === 'ingreso' || c === 'cobro'), 'entrada') : '',
      ].filter(Boolean);
      const desh = log.length - ok.length;
      lineas.push(`💸 Anoté ${plural(ok.length, 'movimiento')} de tus avisos del banco${partes.length ? ` (${partes.join(', ')})` : ''}${desh ? `; deshiciste ${desh}` : ''}.`);
    }
    const { financeCuadre } = require('./finance/financeCuadre');
    arreglos = (await financeCuadre.arreglados(7 * 24)).length;
    const C = await financeCuadre.calcular();
    const conDato = C ? C.cuentas.filter((c: any) => c.banco) : [];
    if (arreglos || conDato.length) {
      const malas = conDato.filter((c: any) => c.estado === 'no_calza').length;
      lineas.push(`⚖ ${arreglos ? `Cuadré ${plural(arreglos, 'cosa')} con tu banco. ` : ''}${!conDato.length ? '' : malas ? `${plural(malas, 'cuenta')} no ${malas === 1 ? 'calza' : 'calzan'}: revísala${malas === 1 ? '' : 's'} en Finanzas.` : 'Tus cuentas calzan con el banco.'}`.trim());
    }
  } catch {}
  // Casa: lo que descontó por lo que comiste, lo de las boletas y la lista de compras
  try {
    const { inventoryStore } = require('./inventory/inventoryStore');
    const { listaCompras } = require('./inventory/inventoryCore');
    const S = inventoryStore.get() ?? (await inventoryStore.load());
    if (S && S.items.length) {
      const movs = S.movs.filter((m: any) => Date.parse(m.at) > desde);
      const comidas = movs.filter((m: any) => m.via === 'nutricion' && m.tipo === 'consumo').length;
      const boleta = movs.filter((m: any) => m.via === 'boleta' && m.delta > 0).length;
      const L = listaCompras(S, now);
      const pronto = L.auto.filter((f: any) => f.estado === 'pronto').length;
      const enLista = L.auto.length + L.manual.length;
      if (comidas) lineas.push(`🏠 Desconté ${plural(comidas, 'cosa')} de tu despensa por lo que comiste.`);
      if (boleta) lineas.push(`🧾 Pasé ${plural(boleta, 'producto')} de tus boletas a la despensa.`);
      if (enLista) lineas.push(`🛒 Tu lista de compras tiene ${plural(enLista, 'cosa')}${pronto ? ` (${pronto} porque se te ${pronto === 1 ? 'está' : 'están'} acabando)` : ''}.`);
    }
  } catch {}
  return { lineas, anotados, arreglos };
}

/** El próximo domingo a las 19:00 (hoy, si es domingo y todavía no son las 19) */
export function proximoDomingo(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((7 - now.getDay()) % 7), 19, 0, 0);
  return d.getTime() <= now.getTime() + 60_000 ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, 19, 0, 0) : d;
}

/** Programa (o reprograma) el resumen del domingo con lo de ahora. */
export async function programarDomingo(now = new Date()) {
  const { erisNotifications } = require('./ErisNotifications');
  const p = await autoPrefs.get();
  const r = p.domingo ? await resumenSemana(now) : { lineas: [] };
  await erisNotifications.scheduleDomingo(r.lineas.length ? { at: proximoDomingo(now), lineas: r.lineas } : null);
}

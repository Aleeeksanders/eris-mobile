// Eris administra (A1) — «Por confirmar» → un aviso del banco que no es una compra: ¿qué fue? (una transferencia a otra
// persona o a otra cuenta tuya, plata que entró, un giro, el pago de la tarjeta). Eris sugiere y la persona elige; lo que
// elige queda en su libro con el aviso enlazado, y de ahí Eris aprende para la próxima.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FX, clp, fechaCorta } from './fx';
import { Sheet, CatPicker, Chip, Label, type CuentaOpt } from './parts';
import { sugerir, anotarAviso, type Eleccion, type Como } from '../../services/finance/bankAuto';
import { financeInbox } from '../../services/finance/financeInbox';
import { financeAuto } from '../../services/finance/financeAuto';
import { vistas, estado, CASH, conEfectivo, type FinanceState, type Ref, type Fuente } from '../../services/finance/financeCore';
import { AuthStorage } from '../../services/AuthStorage';
import type { Propuesta } from '../../services/finance/bankNotif';
import type { Act } from './types';

type Filtro = 'gasto' | 'sinCredito' | 'credito' | 'todas' | 'sinEfectivo';
const OPCIONES: Record<string, Array<[Como, string]>> = {
  transferencia: [['gasto', '💸 Pago o gasto'], ['propia', '⇄ A otra cuenta mía'], ['prestamo', '🤝 Le presté']],
  ingreso: [['abono', '↩ Abono o devolución'], ['ingreso', '⚡ Ingreso'], ['sueldo', '💼 Mi sueldo o un fijo'], ['cobro', '🤝 Me devolvieron'], ['propia', '⇄ De otra cuenta mía']],
  giro: [['giro', '💵 A mi efectivo'], ['gasto', '💸 Lo gasté']],
  pago: [['pago', '💳 Pago de tarjeta'], ['gasto', '💸 Otro pago']],
  compra: [['gasto', '💸 Gasto']],
};
/** ¿El aviso es de plata que entra? (su cuenta es el destino) */
const entra = (p: Propuesta) => p.tipo === 'ingreso';

export default function AvisoSheet({ p, S, act, onClose, opts, pick }: {
  p: Propuesta; S: FinanceState; act: Act; onClose: () => void;
  opts: (f: Filtro) => CuentaOpt[];
  pick: (label: string, options: CuentaOpt[], value: Ref | null | undefined, onChange: (r: Ref | null) => void) => React.ReactNode;
}) {
  const [e, setE] = useState<Eleccion | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([financeInbox.aprendido(), AuthStorage.getDisplayName().catch(() => null)])
      .then(([a, yo]) => { if (alive) setE(sugerir(p, S, a, { yo: yo ?? '' })); })
      .catch(() => { if (alive) setE(sugerir(p, S, {}, {})); });
    return () => { alive = false; };
    // solo al abrir: después manda lo que elige la persona
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.clave]);
  const pendientes = useMemo(() => vistas(estado(S)).meDeban.filter((d) => !d.cobrado), [S]);
  const fijos = useMemo(() => S.prog.filter((x) => x.tipo === 'ingreso' && !S.rec.includes(`${x.id}:${p.fecha.slice(0, 7)}`)), [S, p.fecha]);
  if (!e) return null;
  const set = (patch: Partial<Eleccion>) => setE((x) => (x ? { ...x, ...patch } : x));
  /** La cuenta del aviso (de donde salió, o adonde llegó): se conserva al cambiar qué fue */
  const base = entra(p) ? (e.como === 'propia' ? e.otra : e.cuenta) ?? null : e.cuenta ?? null;
  const elegir = (como: Como) => {
    if (como === e.como) return;
    if (entra(p)) setE(como === 'propia' ? { como, cuenta: null, otra: base } : { como, cuenta: base, ...(como === 'ingreso' ? { fuente: 'extra' as Fuente } : {}), ...(como === 'sueldo' && fijos[0] ? { progId: fijos[0].id } : {}), ...(como === 'cobro' && pendientes[0] ? { prestamoId: pendientes[0].id } : {}) });
    else setE({ como, cuenta: base, ...(como === 'giro' ? { otra: CASH } : {}), ...(como === 'gasto' ? { cat: e.cat ?? (p.tipo === 'compra' ? p.cat : 'otros') } : {}) });
  };
  const opciones = (OPCIONES[p.tipo] ?? OPCIONES.compra).filter(([c]) => (c !== 'sueldo' || fijos.length > 0) && (c !== 'cobro' || pendientes.length > 0));
  const guardar = async () => {
    const ok = await act((W, ctx) => anotarAviso(W, p, e, ctx));
    if (!ok) return;
    await financeInbox.resolve(p.clave);
    // La próxima vez con esa app y esa tarjeta, la misma cuenta
    if (p.fuente === 'banco' && e.como !== 'pago' && base != null && base !== CASH) await financeInbox.recordarCuenta(p.pkg, p.last4, base);
    // La otra mitad de esta transferencia (si estaba esperando acá) se enlaza sola
    await financeAuto.ordenarBandeja().catch(() => 0);
    onClose();
  };
  const sinEfectivo = !conEfectivo(S);
  return (
    <Sheet visible title="AVISO DEL BANCO" onClose={onClose} saveLabel="Anotar" onSave={guardar}>
      <View style={s.head}>
        <Text style={[s.monto, entra(p) && { color: FX.up }]}>{entra(p) ? '+' : '−'}{clp(p.monto)}</Text>
        <Text style={s.desc} numberOfLines={1}>{p.desc}</Text>
        <Text style={s.note}>{`🔔 ${p.app} · ${fechaCorta(p.fecha)}${p.hora ? ` ${p.hora}` : ''}: «${p.texto}»`}</Text>
        {p.razon ? <Text style={s.razon}>{p.razon}</Text> : null}
      </View>
      <View>
        <Label>QUÉ FUE</Label>
        <View style={s.row}>{opciones.map(([c, l]) => <Chip key={c} small label={l} on={e.como === c} onPress={() => elegir(c)} />)}</View>
      </View>
      {e.como === 'gasto' && (
        <>
          <CatPicker value={e.cat ?? 'otros'} onChange={(c) => set({ cat: c })} />
          {pick('CON QUÉ PAGASTE', opts('gasto'), e.cuenta, (r) => set({ cuenta: r }))}
        </>
      )}
      {e.como === 'prestamo' && (
        <>
          {pick('DE QUÉ CUENTA SALIÓ', opts('sinCredito'), e.cuenta, (r) => set({ cuenta: r }))}
          <Text style={s.note}>Queda en «Me deben»: cuando te lo devuelvan por transferencia, lo marco solo.</Text>
        </>
      )}
      {e.como === 'propia' && (
        <>
          {pick(entra(p) ? 'DE QUÉ CUENTA TUYA VINO' : 'DESDE', opts('sinCredito').filter((o) => !entra(p) || o.ref !== e.otra), e.cuenta, (r) => set({ cuenta: r }))}
          {pick(entra(p) ? 'A DÓNDE LLEGÓ' : 'A QUÉ CUENTA TUYA', opts(entra(p) ? 'sinCredito' : 'todas').filter((o) => entra(p) || o.ref !== e.cuenta), e.otra, (r) => set({ otra: r }))}
          <Text style={s.note}>Entre tus cuentas no es gasto ni ingreso. {p.contraparte ? `La próxima vez que aparezca «${p.contraparte}», la anoto así sola.` : ''}</Text>
        </>
      )}
      {e.como === 'giro' && (
        <>
          {pick('DESDE', opts('sinEfectivo'), e.cuenta, (r) => set({ cuenta: r }))}
          <Text style={s.note}>{sinEfectivo ? 'Va a tu efectivo (lo agrego como una cuenta más). Los próximos giros los anoto solos.' : 'Va a tu efectivo.'}</Text>
        </>
      )}
      {e.como === 'pago' && (
        <>
          {pick('DESDE', opts('sinCredito'), e.cuenta, (r) => set({ cuenta: r }))}
          {pick('QUÉ TARJETA', opts('credito'), e.otra, (r) => set({ otra: r }))}
        </>
      )}
      {(e.como === 'abono' || e.como === 'ingreso' || e.como === 'sueldo' || e.como === 'cobro') && (
        <>
          {e.como === 'ingreso' && (
            <View style={s.row}>
              {([['extra', '⚡ Extra'], ['pasivo', '🌱 Pasivo']] as Array<[Fuente, string]>).map(([k, l]) => <Chip key={k} small label={l} on={e.fuente === k} onPress={() => set({ fuente: k })} />)}
            </View>
          )}
          {e.como === 'sueldo' && (
            <View style={s.row}>
              {fijos.map((x) => <Chip key={String(x.id)} small label={`${x.desc} · ${clp(x.monto)}`} on={e.progId === x.id} onPress={() => set({ progId: x.id, mes: undefined })} />)}
            </View>
          )}
          {e.como === 'cobro' && (
            <View style={s.row}>
              {pendientes.map((d) => <Chip key={String(d.id)} small label={`${d.desc} · ${clp(d.monto)}`} on={e.prestamoId === d.id} onPress={() => set({ prestamoId: d.id })} />)}
            </View>
          )}
          {pick('A DÓNDE ENTRÓ', opts('sinCredito'), e.cuenta, (r) => set({ cuenta: r }))}
          <Text style={s.note}>{e.como === 'abono' ? 'Entra a la cuenta pero no cuenta como ingreso del mes (una devolución, un reembolso, plata que te pasaron).'
            : e.como === 'sueldo' ? 'Confirma su «¿Llegó?» con el monto real.' : e.como === 'cobro' ? 'Sale de «Me deben».' : 'Cuenta como ingreso del mes.'}</Text>
        </>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  head: { gap: 4 },
  monto: { color: FX.text, fontFamily: FX.mono, fontSize: 26, fontWeight: '700' },
  desc: { color: FX.text, fontSize: 15, fontWeight: '700' },
  note: { color: FX.muted, fontSize: 12, lineHeight: 17 },
  razon: { color: FX.violet, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});

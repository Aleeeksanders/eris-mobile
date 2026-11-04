// Finanzas 2.0 — Cuentas: DÓNDE está la plata. «Tu plata» arriba (solo existe la de tus cuentas, 2026-10-22); lo anotado
// sin cuenta, «Por ordenar»; efectivo (si lo tienes), cuentas, tarjetas, ahorro y lo que te deben.
// (Mover plata entre cuentas, girar o pagar la tarjeta se anota desde el +.)
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { FX, clp, TIPO_CUENTA, fechaCorta } from '../fx';
import { Panel, Label, Btn, Empty } from '../parts';
import { estado, vistas, deudaDe, cuotasPorCobrar, avisoBorrar, borrar, marcarCobrado, conEfectivo, porOrdenar, CASH } from '../../../services/finance/financeCore';
import InfoTip from '../../../components/InfoTip';
import { TIPO_LABEL } from './Movimientos';
import type { TabProps } from '../types';
import type { Ref } from '../../../services/finance/financeCore';

export default function Cuentas({ S, V, open, act, importarCartola, leyendoCartola }: TabProps) {
  const E = useMemo(() => estado(S), [S]);
  const VV = useMemo(() => vistas(E), [E]);
  const { T } = V;
  const grupos: Array<['debito' | 'credito' | 'ahorro', string]> = [['debito', 'CUENTAS'], ['credito', 'TARJETAS DE CRÉDITO'], ['ahorro', 'AHORRO']];
  const [abierta, setAbierta] = useState<Ref | null>(null);
  const deben = VV.meDeban.filter((d) => !d.cobrado);
  const cobrados = VV.meDeban.filter((d) => d.cobrado).slice(-5).reverse();
  const efec = conEfectivo(S);
  const PO = useMemo(() => porOrdenar(S), [S]);

  return (
    <View>
      <Panel glow={FX.cyan}>
        <View style={s.labelRow}><Label>TU PLATA</Label><InfoTip id="tu_plata" color={FX.cyan} size={16} /></View>
        <Text style={[s.big, T.plata < 0 && { color: FX.down }]}>{clp(T.plata)}</Text>
        <View style={s.split}>
          <Item label={efec ? 'Cuentas y efectivo' : 'Cuentas'} value={T.liquidez} />
          <Item label="Ahorro" value={T.ahorro} color={FX.violet} />
        </View>
        <View style={s.aparte}>
          <Text style={s.aparteT}>APARTE</Text>
          <View style={s.split}>
            <Item label="Te deben (aún no es tuya)" value={T.meDeben} color={FX.gold} />
            <Item label="Debes en tarjetas" value={-T.deudaTC} color={T.deudaTC > 0 ? FX.down : FX.muted} />
          </View>
          <Text style={s.hint}>Patrimonio neto: {clp(T.patrimonio)} (tu plata + lo que te deben − tarjetas).</Text>
        </View>
      </Panel>

      {/* Por ordenar: lo anotado sin cuenta no cuenta en tu plata hasta que tenga una */}
      {(PO.tx.length > 0 || PO.prog.length > 0) && (
        <Panel glow={FX.gold} style={{ borderColor: FX.gold + '55' }}>
          <View style={s.labelRow}><Label>⚠ POR ORDENAR</Label><InfoTip id="por_ordenar" color={FX.gold} size={16} /></View>
          <Text style={s.meta}>Se anotó sin decir de qué cuenta salió o a cuál llegó: no está en tu plata. Asígnale su cuenta, o bórralo si no era plata real.</Text>
          {PO.tx.map((t) => (
            <TouchableOpacity key={String(t.id)} style={s.line} onPress={() => open({ k: 'asignar', kind: 'tx', id: t.id })} accessibilityRole="button" accessibilityLabel={`Ordenar ${t.desc}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.lineDesc} numberOfLines={1}>{t.desc}</Text>
                <Text style={s.lineSub}>{TIPO_LABEL[t.tipo] ?? 'Movimiento'} · {fechaCorta(t.fecha)} · sin cuenta</Text>
              </View>
              <Text style={s.amt}>{t.falta === 'desde' ? '−' : '+'}{clp(t.monto)}</Text>
              <Text style={s.go}>›</Text>
            </TouchableOpacity>
          ))}
          {PO.prog.map((p) => (
            <TouchableOpacity key={`p${String(p.id)}`} style={s.line} onPress={() => open({ k: 'asignar', kind: 'prog', id: p.id })} accessibilityRole="button" accessibilityLabel={`Elegir cuenta para ${p.desc}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.lineDesc} numberOfLines={1}>{p.desc}</Text>
                <Text style={s.lineSub}>{p.tipo === 'gasto' ? 'Gasto' : 'Ingreso'} fijo sin cuenta</Text>
              </View>
              <Text style={s.amt}>{p.tipo === 'gasto' ? '−' : '+'}{clp(Number(p.monto) || 0)}</Text>
              <Text style={s.go}>›</Text>
            </TouchableOpacity>
          ))}
        </Panel>
      )}

      {/* Efectivo: existe solo si lo agregaste (o sacaste de una cuenta) */}
      {efec && (
        <Panel>
          <View style={s.head}>
            <Text style={s.name}>{TIPO_CUENTA.efectivo.icon} Efectivo</Text>
            <Text style={[s.bal, E.efectivo < 0 && { color: FX.down }]}>{clp(E.efectivo)}</Text>
          </View>
          <View style={s.rowBtns}>
            <Btn small ghost label="Corregir saldo" color={FX.muted} onPress={() => open({ k: 'mov', tipo: 'ajuste', ref: CASH })} />
            {E.efectivo === 0 && <Btn small ghost label="Quitar" color={FX.down} onPress={() => act((W) => borrar(W, 'cuenta', CASH))} />}
          </View>
        </Panel>
      )}

      {grupos.map(([tipo, titulo]) => {
        const list = E.cuentas.filter((c) => (tipo === 'debito' ? c.tipo === 'debito' || c.tipo === 'efectivo' : c.tipo === tipo));
        if (!list.length) return null;
        return (
          <View key={tipo}>
            <Text style={s.section}>{titulo}</Text>
            {list.map((c) => {
              const m = TIPO_CUENTA[c.tipo] ?? TIPO_CUENTA.debito;
              const deuda = deudaDe(c), cupo = c.cupo || 0, cuotas = c.tipo === 'credito' ? cuotasPorCobrar(VV.gastos, c.id, V.now) : null;
              const mas = abierta === c.id;
              return (
                <Panel key={String(c.id)} style={{ borderColor: m.color + '33' }}>
                  <View style={s.head}>
                    <Text style={s.name} numberOfLines={1}>{m.icon} {c.nombre}</Text>
                    <Text style={[s.bal, { color: c.tipo === 'credito' ? FX.text : c.saldo < 0 ? FX.down : FX.text }]}>{clp(c.saldo)}</Text>
                  </View>
                  {c.tipo === 'credito' ? (
                    <>
                      <Text style={s.meta}>Cupo libre de {clp(cupo)}{deuda > 0 ? ` · debes ${clp(deuda)}` : ' · sin deuda'}</Text>
                      <View style={s.bar}><View style={[s.barFill, { width: `${Math.min(100, (deuda / Math.max(1, cupo)) * 100)}%`, backgroundColor: deuda / Math.max(1, cupo) > 0.7 ? FX.down : FX.gold }]} /></View>
                      {cuotas && cuotas.total > 0 && <Text style={s.meta}>Cuotas por venir: {clp(cuotas.total)} · el próximo mes {clp(cuotas.proxMes)}</Text>}
                    </>
                  ) : <Text style={s.meta}>{m.label}{c.banco && !c.nombre.includes(c.banco) ? ` · ${c.banco}` : ''}</Text>}
                  <View style={s.rowBtns}>
                    {c.tipo === 'credito' && deuda > 0 && <Btn small ghost label="💳 Pagar" color={FX.gold} onPress={() => open({ k: 'mov', tipo: 'pago', ref: c.id })} />}
                    {c.tipo === 'debito' && <Btn small ghost label="🏧 Sacar efectivo" color={FX.cyan} onPress={() => open({ k: 'mov', tipo: 'giro', ref: c.id })} />}
                    {c.tipo !== 'credito' && <Btn small ghost label="⇄ Transferir" color={FX.cyan} onPress={() => open({ k: 'mov', tipo: 'transfer', ref: c.id })} />}
                    <TouchableOpacity onPress={() => setAbierta(mas ? null : c.id)} style={s.more} accessibilityRole="button" accessibilityLabel={mas ? 'Menos opciones' : `Más opciones de ${c.nombre}`}>
                      <Text style={s.moreText}>{mas ? '✕' : '⋯'}</Text>
                    </TouchableOpacity>
                  </View>
                  {mas && (
                    <View style={s.rowBtns}>
                      <Btn small ghost label={leyendoCartola === c.id ? 'Leyendo…' : '📄 Importar cartola'} color={FX.violet} disabled={leyendoCartola != null} onPress={() => importarCartola(c.id, c.nombre)} />
                      <Btn small ghost label="Corregir saldo" color={FX.muted} onPress={() => open({ k: 'mov', tipo: 'ajuste', ref: c.id })} />
                      <Btn small ghost label="Quitar" color={FX.down} onPress={() => Alert.alert(`Quitar ${c.nombre}`, avisoBorrar(S, 'cuenta', c.id), [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Quitar', style: 'destructive', onPress: () => act((W) => borrar(W, 'cuenta', c.id)) },
                      ])} />
                    </View>
                  )}
                </Panel>
              );
            })}
          </View>
        );
      })}
      {!E.cuentas.length && <Empty icon="🏦" text="Solo cuenta la plata que está en tus cuentas. Agrégalas (y tus tarjetas): cada gasto descuenta de donde pagaste y los saldos se calculan solos." />}
      <View style={[s.rowBtns, { marginTop: 0, marginBottom: 14 }]}>
        <Btn small label="+ Agregar cuenta o tarjeta" onPress={() => open({ k: 'cuenta' })} style={{ flexGrow: 1 }} />
        {!efec && <Btn small ghost label="💵 Tengo efectivo" color={FX.cyan} onPress={() => open({ k: 'efectivo' })} />}
      </View>

      {/* Te deben */}
      <Panel>
        <Label>🤝 TE DEBEN</Label>
        {!deben.length && <Text style={s.meta}>Cuando le prestes plata a alguien (+ → Le presté a alguien, o dile a Eris «le presté 10 lucas a la Cami»), aparece acá. Al cobrar vuelve a tu cuenta.</Text>}
        {deben.map((d) => (
          <View key={String(d.id)} style={s.line}>
            <View style={{ flex: 1 }}>
              <Text style={s.lineDesc} numberOfLines={1}>{d.desc}</Text>
              <Text style={s.lineSub}>{d.devolucion ? `Devuelve el ${fechaCorta(d.devolucion)}` : 'Sin fecha'}{d.monto < d.original ? ` · pagó ${clp(d.original - d.monto)}` : ''}</Text>
            </View>
            <Text style={[s.amt, { color: FX.gold }]}>{clp(d.monto)}</Text>
            <Btn small ghost label="Me pagó" color={FX.up} onPress={() => act((W, ctx) => marcarCobrado(W, d.id, ctx))} />
          </View>
        ))}
        {cobrados.length > 0 && <Text style={[s.lineSub, { marginTop: 8 }]}>Cobrados hace poco: {cobrados.map((d) => d.desc.split(' — ')[0]).join(', ')}</Text>}
      </Panel>
    </View>
  );
}

function Item({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1 }}>
      <Text style={s.itemLabel}>{label}</Text>
      <Text style={[s.itemVal, color ? { color } : null]}>{clp(value)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  big: { color: FX.text, fontFamily: FX.mono, fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  itemLabel: { color: FX.muted, fontSize: 11 },
  itemVal: { color: FX.text, fontFamily: FX.mono, fontSize: 14, marginTop: 2, fontVariant: ['tabular-nums'] },
  hint: { color: FX.dim, fontSize: 11, marginTop: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aparte: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: FX.lineSoft },
  aparteT: { color: FX.dim, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.4 },
  go: { color: FX.dim, fontSize: 22 },
  section: { color: FX.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginBottom: 6, marginTop: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { color: FX.text, fontSize: 15, fontWeight: '700', flex: 1 },
  bal: { fontFamily: FX.mono, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  meta: { color: FX.muted, fontSize: 12, marginTop: 6, lineHeight: 17 },
  bar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.05)', marginTop: 8, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  rowBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' },
  more: { minWidth: 44, minHeight: 36, borderRadius: 10, borderWidth: 1, borderColor: FX.lineSoft, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: FX.muted, fontSize: 18, fontWeight: '800', marginTop: -2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, borderTopWidth: 1, borderTopColor: FX.lineSoft },
  lineDesc: { color: FX.text, fontSize: 14, fontWeight: '600' },
  lineSub: { color: FX.muted, fontSize: 11, marginTop: 2 },
  amt: { color: FX.text, fontFamily: FX.mono, fontSize: 13, fontVariant: ['tabular-nums'] },
});

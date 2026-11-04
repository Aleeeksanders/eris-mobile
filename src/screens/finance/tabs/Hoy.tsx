// Finanzas 2.0 — Hoy: lo del día a día, en palabras simples. Cuánto puedes gastar (y por día), lo que llegó para
// confirmar, lo que viene (sueldo, fijos, cuotas) y un vistazo de cómo vas. El detalle «de terminal» está en Análisis.
import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FX, clp, catOf, fechaCorta } from '../fx';
import { Panel, Label, Btn } from '../parts';
import { formConfirmarIngreso, descartarIngreso, presupuestoAlDia, porOrdenar, estado, todayStr } from '../../../services/finance/financeCore';
import { capKey, DAY_PLAN_EVENT } from '../../../services/dayPlan/dayPlanKeys';
import { ErisDecideChip } from '../../../components/home/ErisPlan';
import InfoTip from '../../../components/InfoTip';
import { InboxPanel, AutoPanel, AutoOffer, useFinanceAuto } from '../Inbox';
import { CuadrePanel } from '../Cuadre';
import { tourRef } from '../../../components/tour/tourTargets';
import type { TabProps } from '../types';
import type { Propuesta } from '../../../services/finance/bankNotif';

export default function Hoy({ S, V, open, act, irA, inbox }: TabProps & { inbox: Propuesta[] }) {
  const { T, R, now } = V;
  const dm = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const hasta = T.proximo ? `hasta tu ${T.proximo.desc.replace(/\s*\([^)]*\)/g, '').toLowerCase()}` : 'hasta fin de mes';
  const dias = T.proximo ? T.proximo.enDias : dm - now.getDate() + 1;
  const runwayOk = T.runwayDias == null || T.runwayDias >= T.diasAlIngreso;
  const sinNada = !S.tx.length && !R.hayBoveda && !S.prog.length;
  const pres = useMemo(() => presupuestoAlDia(S, now).filter((l) => l.presup > 0), [S, now]);
  const peor = pres.find((l) => l.estado === 'sobre') ?? pres.find((l) => l.estado === 'apurado');
  const po = useMemo(() => porOrdenar(S), [S]);
  const nPo = po.tx.length + po.prog.length;
  // Eris al timón (T2): el tope de hoy del plan de Eris y lo gastado hoy (sin los fijos: «por día» ya los descuenta)
  const hoyK = todayStr(now);
  const [tope, setTope] = useState<number | null>(null);
  useEffect(() => {
    const read = () => AsyncStorage.getItem(capKey(hoyK)).then((v) => setTope(v && Number(v) > 0 ? Number(v) : null)).catch(() => setTope(null));
    read();
    const sub = DeviceEventEmitter.addListener(DAY_PLAN_EVENT, read);
    return () => sub.remove();
  }, [hoyK]);
  // Eris administra (A0): lo que Eris anotó sola de los avisos del banco, y la primera vez, ofrecerlo
  const auto = useFinanceAuto(S);
  const gastoHoy = useMemo(() => R.V.gastos.filter((g) => g.fecha === hoyK && g.progId == null).reduce((a, g) => a + g.monto, 0), [R.V.gastos, hoyK]);

  return (
    <View>
      {/* Lo que Eris anotó sola, lo que llegó del banco o de la cartola y espera tu visto bueno */}
      <AutoOffer cfg={auto.cfg} />
      <AutoPanel hechos={auto.hechos} open={open} />
      <InboxPanel S={S} items={inbox} open={open} auto={auto.activo} />
      <CuadrePanel S={S} open={open} />
      {/* «Eris decide» (Eris al timón): el tope de hoy según el plan, o elegir un camino */}
      {!sinNada && <ErisDecideChip modulo="plata" style={{ marginBottom: 10 }} />}

      {sinNada && (
        <Panel glow={FX.violetDeep}>
          <Label>EMPIEZA AQUÍ</Label>
          <Paso n={1} titulo="Agrega tus cuentas y tarjetas" sub="Así cada gasto descuenta de donde pagaste." onPress={() => irA('cuentas')} boton="Ir a Cuentas" />
          <Paso n={2} titulo="Configura tu sueldo y tus fijos" sub="El arriendo, las suscripciones: se anotan solos." onPress={() => irA('plan')} boton="Ir a Plan" />
          <Paso n={3} titulo="Anota con el botón +" sub="Un gasto, la foto de la boleta, lo que te entra…" onPress={() => open({ k: 'menu' })} boton="Abrir +" />
        </Panel>
      )}

      {/* ─── Lo principal: cuánto puedes gastar (sale SOLO de tus cuentas) ─── */}
      <View ref={tourRef('fin.hero')} collapsable={false}>
        {!T.conCuentas ? (sinNada ? null : (
          <Panel glow={FX.violetDeep}>
            <Label>PUEDES GASTAR</Label>
            <Text style={s.heroSub}>Solo cuenta la plata que está en tus cuentas. Agrega dónde tienes la tuya (cuenta, efectivo) y aquí verás cuánto puedes gastar {hasta}.</Text>
            <View style={[s.row, { marginTop: 10 }]}>
              <Btn small label="Ir a Cuentas" color={FX.violet} onPress={() => irA('cuentas')} />
              <Btn small ghost label="💵 Tengo efectivo" color={FX.cyan} onPress={() => open({ k: 'efectivo' })} />
            </View>
          </Panel>
        )) : (
        <Panel glow={FX.violetDeep}>
          <View style={s.labelRow}><Label>{T.libre < 0 ? 'TE FALTA' : 'PUEDES GASTAR'}</Label><InfoTip id="puedes_gastar" color={FX.violet} size={16} /></View>
          <Text style={[s.hero, T.libre < 0 && { color: FX.down }]} numberOfLines={1} adjustsFontSizeToFit>{clp(Math.abs(T.libre))}</Text>
          <Text style={s.heroSub}>
            {hasta} ({dias === 1 ? 'mañana' : `en ${dias} días`}{T.proximo ? `, ${fechaCorta(T.proximo.fecha)}` : ''})
            {T.porDiaHastaIngreso != null && T.libre > 0 ? <Text style={s.perDay}>{`  ·  ~${clp(T.porDiaHastaIngreso)} por día`}</Text> : null}
          </Text>
          {T.comprometido > 0 && <Text style={s.caption}>Ya le resté {clp(T.comprometido)} de fijos que se cobran antes.</Text>}
          {T.burnDiario > 0 && (
            <Text style={[s.pace, { color: runwayOk ? FX.up : FX.gold }]}>
              {runwayOk ? `✓ A tu ritmo (~${clp(T.burnDiario)} al día) te alcanza.`
                : T.porDiaHastaIngreso != null ? `⚠ A tu ritmo (~${clp(T.burnDiario)} al día) no llegas: apunta a ≤ ${clp(T.porDiaHastaIngreso)} al día.`
                : `⚠ A tu ritmo (~${clp(T.burnDiario)} al día) no llegas.`}
            </Text>
          )}
          {T.deudaTC > 0 && <Text style={s.caption}>En tarjetas debes {clp(T.deudaTC)}.</Text>}
          <Text style={s.caption}>Tu plata: {clp(T.plata)} (cuentas{T.ahorro > 0 ? ' + ahorro' : ''}).</Text>
        </Panel>
        )}
      </View>

      {/* El tope de hoy del plan de Eris: cuánto llevas, sin culpa si te pasas */}
      {tope != null && (
        <Panel glow={FX.violetDeep}>
          <View style={s.labelRow}><Label>🧭 TOPE DE HOY · PLAN DE ERIS</Label></View>
          <Text style={s.heroSub}>{gastoHoy <= tope ? `Llevas ${clp(gastoHoy)} de ${clp(tope)}: te quedan ${clp(tope - gastoHoy)} para hoy.` : `Llevas ${clp(gastoHoy)}: te pasaste ${clp(gastoHoy - tope)} del tope de hoy. No pasa nada: lo que puedes gastar por día se ajusta solo.`}</Text>
          <View style={s.capTrack}><View style={[s.capFill, { width: `${Math.min(100, Math.round((gastoHoy / tope) * 100))}%`, backgroundColor: gastoHoy <= tope ? FX.violet : FX.gold }]} /></View>
        </Panel>
      )}

      {/* Lo anotado sin cuenta: no está en tu plata hasta que tenga una */}
      {nPo > 0 && (
        <TouchableOpacity onPress={() => irA('cuentas')} accessibilityRole="button" accessibilityLabel={`Por ordenar: ${nPo} sin cuenta. Ir a Cuentas`}>
          <Panel style={{ borderColor: FX.gold + '55' }}>
            <View style={[s.vas, { borderTopWidth: 0 }]}>
              <Text style={s.vasIcon}>⚠</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.vasTitle}>Por ordenar: {nPo} sin cuenta</Text>
                <Text style={s.vasSub}>No están en tu plata hasta que les asignes de qué cuenta salieron. Toca para ordenarlos.</Text>
              </View>
              <Text style={s.go}>›</Text>
            </View>
          </Panel>
        </TouchableOpacity>
      )}

      {/* ─── Lo que viene ─── */}
      {(R.pendientes.length > 0 || R.proximos.some((p) => p.enDias > 0) || R.cuotas.proxMes > 0) && (
        <Panel>
          <Label>LO QUE VIENE</Label>
          {R.pendientes.map((p) => (
            <View key={String(p.id)} style={s.pending}>
              <Text style={s.pendTitle}>¿Llegó {p.desc.toLowerCase()}?</Text>
              <Text style={s.pendSub}>{clp(Number(p.monto) || 0)} · debía llegar el {fechaCorta(p.fecha)}</Text>
              <View style={s.row}>
                <Btn small label="✓ Llegó" color="#16a34a" style={{ flex: 1.3 }}
                  // Llega a la cuenta del fijo; si no tiene (o la quitaste), se elige en la hoja: nunca a ninguna parte
                  onPress={() => (p.cuenta != null && estado(S).activa(p.cuenta) ? act((W, ctx) => formConfirmarIngreso(W, p, {}, ctx)) : open({ k: 'confirmar', p }))} />
                <Btn small ghost label="Otro monto" color={FX.violet} style={{ flex: 1 }} onPress={() => open({ k: 'confirmar', p })} />
                <Btn small ghost label="No llegó" color={FX.muted} style={{ flex: 1 }}
                  onPress={() => act((W, ctx) => { descartarIngreso(W, p, ctx.now); return { ok: true, msg: `${p.desc}: queda para el próximo mes` }; })} />
              </View>
            </View>
          ))}
          {R.proximos.filter((p) => p.enDias > 0).slice(0, 5).map((p) => (
            <View key={`${p.id}-${p.fecha}`} style={s.line}>
              <Text style={s.lineDate}>{p.enDias === 1 ? 'MAÑANA' : fechaCorta(p.fecha).toUpperCase()}</Text>
              <Text style={s.lineDesc} numberOfLines={1}>{p.desc}</Text>
              <Text style={[s.lineAmt, { color: p.tipo === 'ingreso' ? FX.up : FX.text }]}>{p.tipo === 'ingreso' ? '+' : '−'}{clp(Number(p.monto) || 0)}</Text>
            </View>
          ))}
          {R.cuotas.proxMes > 0 && (
            <View style={s.line}>
              <Text style={s.lineDate}>PRÓX. MES</Text>
              <Text style={s.lineDesc} numberOfLines={1}>Cuotas de tarjetas ({R.cuotas.compras} compra{R.cuotas.compras !== 1 ? 's' : ''})</Text>
              <Text style={s.lineAmt}>−{clp(R.cuotas.proxMes)}</Text>
            </View>
          )}
        </Panel>
      )}

      {/* ─── Cómo vas (el detalle, en Análisis y Plan) ─── */}
      {(V.Rt || peor) && (
        <Panel>
          <Label>CÓMO VAS</Label>
          {peor && (
            <TouchableOpacity style={s.vas} onPress={() => irA('plan')} accessibilityRole="button" accessibilityLabel={`${catOf(peor.cat).label}: ${peor.texto}`}>
              <Text style={s.vasIcon}>{catOf(peor.cat).icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.vasTitle}>{catOf(peor.cat).label}</Text>
                <Text style={[s.vasSub, { color: peor.estado === 'sobre' ? FX.down : FX.gold }]}>{peor.texto}</Text>
              </View>
              <Text style={s.go}>›</Text>
            </TouchableOpacity>
          )}
          {!peor && pres.length > 0 && <Text style={[s.vasSub, { color: FX.up, marginBottom: 6 }]}>✓ Todas tus categorías van al día con su tope.</Text>}
          {V.Rt && (
            <TouchableOpacity style={s.vas} onPress={() => irA('analisis')} accessibilityRole="button" accessibilityLabel={`Tu rating: ${V.Rt.nota}`}>
              <Text style={[s.nota, { color: notaColor(V.Rt.nota) }]}>{V.Rt.nota}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.vasTitle}>Tu rating</Text>
                <Text style={s.vasSub} numberOfLines={2}>{V.Rt.mejoras[0] ?? 'Vas muy bien: sigue así.'}</Text>
              </View>
              <Text style={s.go}>›</Text>
            </TouchableOpacity>
          )}
        </Panel>
      )}
    </View>
  );
}

function Paso({ n, titulo, sub, boton, onPress }: { n: number; titulo: string; sub: string; boton: string; onPress: () => void }) {
  return (
    <View style={s.paso}>
      <Text style={s.pasoN}>{n}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.vasTitle}>{titulo}</Text>
        <Text style={s.vasSub}>{sub}</Text>
      </View>
      <Btn small ghost label={boton} color={FX.violet} onPress={onPress} />
    </View>
  );
}

export const notaColor = (n: string) => (n.startsWith('AA') || n === 'A' ? FX.up : n.startsWith('B') ? FX.gold : FX.down);

const s = StyleSheet.create({
  capTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginTop: 8 },
  capFill: { height: 8, borderRadius: 4 },
  hero: { color: FX.text, fontFamily: FX.mono, fontSize: 40, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 2 },
  heroSub: { color: FX.muted, fontSize: 14, marginTop: 4, lineHeight: 20 },
  perDay: { color: FX.text, fontFamily: FX.mono },
  caption: { color: FX.dim, fontSize: 12, marginTop: 6, lineHeight: 17 },
  pace: { fontSize: 13, fontWeight: '700', marginTop: 10, lineHeight: 19 },
  pending: { borderWidth: 1, borderColor: 'rgba(74,222,128,0.35)', backgroundColor: 'rgba(10,40,25,0.5)', borderRadius: 12, padding: 12, marginBottom: 10 },
  pendTitle: { color: '#d0ffe0', fontSize: 15, fontWeight: '800' },
  pendSub: { color: '#5aa070', fontSize: 12, marginTop: 2, marginBottom: 8, fontFamily: FX.mono },
  row: { flexDirection: 'row', gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 38, borderTopWidth: 1, borderTopColor: FX.lineSoft },
  lineDate: { color: FX.cyan, fontFamily: FX.mono, fontSize: 11, width: 70 },
  lineDesc: { color: FX.text, fontSize: 14, flex: 1 },
  lineAmt: { color: FX.text, fontFamily: FX.mono, fontSize: 13, fontVariant: ['tabular-nums'] },
  vas: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderTopWidth: 1, borderTopColor: FX.lineSoft, paddingVertical: 6 },
  vasIcon: { fontSize: 20, width: 40, textAlign: 'center' },
  vasTitle: { color: FX.text, fontSize: 14, fontWeight: '700' },
  vasSub: { color: FX.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  nota: { fontFamily: FX.mono, fontSize: 22, fontWeight: '900', width: 40, textAlign: 'center' },
  go: { color: FX.dim, fontSize: 22 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paso: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: FX.lineSoft },
  pasoN: { color: FX.violet, fontFamily: FX.mono, fontSize: 18, fontWeight: '900', width: 22, textAlign: 'center' },
});

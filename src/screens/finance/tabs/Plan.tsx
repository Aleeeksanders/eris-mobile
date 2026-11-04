// Finanzas 2.0 — Plan: lo que PLANEAS. Tu sueldo (y el «¿llegó?»), los gastos e ingresos fijos que se anotan solos,
// los topes por categoría (presupuesto al día del mes) y tus metas de ahorro.
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { FX, clp, catOf } from '../fx';
import { Panel, Btn, GhostBar } from '../parts';
import { estado, vistas, sueldoEsperado, borrar, avisoBorrar, cuandoTexto, diaProg, mesActual, sueldoPartes, ultimoHabil } from '../../../services/finance/financeCore';
import Presupuesto from './Presupuesto';
import InfoTip from '../../../components/InfoTip';
import type { TabProps } from '../types';

export default function Plan(props: TabProps) {
  const { S, V, open, act } = props;
  const E = useMemo(() => estado(S), [S]);
  const VV = useMemo(() => vistas(E), [E]);
  const sueldoProg = S.prog.filter((p) => p.tipo === 'ingreso' && p.fuente === 'sueldo');
  const ms = mesActual(V.now);
  // la planilla al final (no tiene día: llega con el sueldo)
  const fijos = S.prog.filter((p) => !(p.tipo === 'ingreso' && p.fuente === 'sueldo')).sort((a, b) => (a.cuando === 'planilla' ? 99 : diaProg(a, ms)) - (b.cuando === 'planilla' ? 99 : diaProg(b, ms)));
  const partes = sueldoPartes(S);
  const confirmarBorrar = (titulo: string, tipo: 'prog' | 'meta', id: unknown) => Alert.alert(titulo, avisoBorrar(S, tipo, id), [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => act((W) => borrar(W, tipo, id)) },
  ]);

  return (
    <View>
      {/* Sueldo */}
      <View style={s.sectionRow}><Text style={[s.section, { flex: 1 }]}>💼 TU SUELDO</Text><InfoTip id="ult_habil" color={FX.violet} size={17} /></View>
      <Panel glow="#a78bfa">
        {sueldoProg.length ? (
          <>
            <Text style={s.big}>{clp(sueldoEsperado(S, V.now))} <Text style={s.of}>líquido al mes</Text></Text>
            {sueldoProg.map((p) => <Text key={String(p.id)} style={s.meta}>{p.desc}: {clp(Number(p.monto) || 0)} {cuandoTexto(p)}{p.cuando === 'ult_habil' ? ` (este mes, el ${ultimoHabil(ms)})` : ''}{p.cuenta != null ? ` · a ${E.nombre(p.cuenta)}` : ''}</Text>)}
            {partes.planilla > 0 && <Text style={s.meta}>Bruto {clp(partes.bruto)} − planilla {clp(partes.planilla)} = líquido {clp(partes.liquido)}</Text>}
            <Text style={s.hint}>En su día te pregunto en Hoy si llegó (o dile a Eris «me llegó el sueldo»).</Text>
          </>
        ) : <Text style={s.meta}>Configúralo una vez (líquido, día de pago, cuenta y quincena) y después solo confirmas cuando llega.</Text>}
        <Btn small ghost label={sueldoProg.length ? 'Cambiar sueldo' : 'Configurar sueldo'} color={FX.violet} onPress={() => open({ k: 'sueldo' })} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
      </Panel>

      {/* Fijos */}
      <Text style={s.section}>↻ LO QUE SE REPITE CADA MES</Text>
      <Panel>
        {!fijos.length && <Text style={s.meta}>Arriendo, Spotify, el plan del celular… se anotan solos en su día. Un ingreso fijo (un arriendo que te pagan) te pregunta si llegó.</Text>}
        {fijos.map((p) => (
          <View key={String(p.id)} style={s.line}>
            <Text style={s.day}>{p.cuando === 'planilla' ? 'PLANILLA' : p.cuando === 'ult_habil' ? 'ÚLT. HÁBIL' : `DÍA ${String(p.dia).padStart(2, '0')}`}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.lineDesc} numberOfLines={1}>{p.desc}</Text>
              <Text style={s.lineSub} numberOfLines={1}>{p.tipo === 'gasto' ? catOf(p.cat).label : 'Ingreso'}{p.cuando === 'planilla' ? ' · descontado del sueldo' : p.cuenta != null ? ` · ${E.nombre(p.cuenta)}` : ''}</Text>
            </View>
            <Text style={[s.amt, { color: p.tipo === 'ingreso' ? FX.up : FX.text }]}>{p.tipo === 'ingreso' ? '+' : '−'}{clp(Number(p.monto) || 0)}</Text>
            <TouchableOpacity onPress={() => confirmarBorrar(`Quitar ${p.desc}`, 'prog', p.id)} style={s.x} accessibilityLabel={`Quitar ${p.desc}`}><Text style={s.xText}>✕</Text></TouchableOpacity>
          </View>
        ))}
        <View style={s.btns}>
          <Btn small ghost label="+ Gasto fijo" color={FX.cyan} onPress={() => open({ k: 'prog', tipo: 'gasto' })} style={{ flex: 1 }} />
          <Btn small ghost label="+ Ingreso fijo" color={FX.up} onPress={() => open({ k: 'prog', tipo: 'ingreso' })} style={{ flex: 1 }} />
        </View>
      </Panel>

      {/* Topes por categoría */}
      <Text style={s.section}>🎯 TOPES POR CATEGORÍA</Text>
      <Presupuesto {...props} />

      {/* Metas */}
      <Text style={[s.section, { marginTop: 14 }]}>🏁 METAS DE AHORRO</Text>
      <Panel>
        {!S.metas.length && <Text style={s.meta}>Un viaje, un fondo de emergencia, el pie del depa: te muestro cuánto llevas con lo que tienes ahorrado.</Text>}
        {S.metas.map((m) => {
          const pctN = Math.min(100, Math.round((VV.ahorroAcum / Math.max(1, m.target)) * 100));
          const dias = m.fecha ? Math.ceil((new Date(`${m.fecha}T12:00:00`).getTime() - V.now.getTime()) / 86400000) : null;
          return (
            <View key={String(m.id)} style={{ marginTop: 10 }}>
              <View style={s.head}>
                <Text style={s.lineDesc}>{m.desc}</Text>
                <Text style={[s.amt, { color: pctN >= 100 ? FX.up : FX.violet }]}>{pctN}%</Text>
                <TouchableOpacity onPress={() => confirmarBorrar(`Quitar ${m.desc}`, 'meta', m.id)} style={s.x} accessibilityLabel={`Quitar ${m.desc}`}><Text style={s.xText}>✕</Text></TouchableOpacity>
              </View>
              <GhostBar gastado={Math.min(VV.ahorroAcum, m.target)} presup={m.target} esperado={0} color={pctN >= 100 ? FX.up : FX.violet} />
              <Text style={s.lineSub}>{clp(VV.ahorroAcum)} de {clp(m.target)}{dias != null ? (dias > 0 ? ` · quedan ${dias} días` : ' · fecha cumplida') : ''}{dias != null && dias > 0 && VV.ahorroAcum < m.target ? ` · ~${clp((m.target - VV.ahorroAcum) / Math.max(1, dias / 30))}/mes` : ''}</Text>
            </View>
          );
        })}
        <View style={s.btns}>
          <Btn small ghost label="+ Meta" color={FX.violet} onPress={() => open({ k: 'meta' })} style={{ flex: 1 }} />
          <Btn small label="🪙 Ahorrar" color={FX.violetDeep} onPress={() => open({ k: 'ahorro' })} style={{ flex: 1 }} />
        </View>
      </Panel>
    </View>
  );
}

const s = StyleSheet.create({
  section: { color: FX.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8, marginTop: 4 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  big: { color: FX.text, fontFamily: FX.mono, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  of: { color: FX.muted, fontSize: 12 },
  meta: { color: FX.muted, fontSize: 13, marginTop: 4, lineHeight: 19 },
  hint: { color: FX.dim, fontSize: 11, marginTop: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, borderTopWidth: 1, borderTopColor: FX.lineSoft },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  day: { color: FX.cyan, fontFamily: FX.mono, fontSize: 11, width: 66 },
  lineDesc: { color: FX.text, fontSize: 14, fontWeight: '600', flex: 1 },
  lineSub: { color: FX.muted, fontSize: 11, marginTop: 2 },
  amt: { color: FX.text, fontFamily: FX.mono, fontSize: 13, fontVariant: ['tabular-nums'] },
  x: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  xText: { color: FX.dim, fontSize: 14 },
  btns: { flexDirection: 'row', gap: 8, marginTop: 12 },
});

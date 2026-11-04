// Finanzas 2.0 — Análisis: la terminal. El mes en una curva contra tu ritmo ideal, los cuatro números del mes,
// las categorías contra el mes pasado al mismo día, tu rating (cómo manejas la plata, no cuánto ganas) y 6 meses.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FX, clp, clpK, signed, pct, catOf, MES_CORTO } from '../fx';
import { Panel, Label, Kpi, Curve, Bars, Empty } from '../parts';
import { notaColor } from './Hoy';
import type { TabProps } from '../types';
import InfoTip from '../../../components/InfoTip';

export default function Analisis({ S, V, open }: TabProps) {
  const { T, now } = V;
  const hoy = now.getDate(), dm = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const presupTotal = Object.values(S.presup || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const ideal = presupTotal > 0 ? presupTotal : T.ingreso > 0 ? T.ingreso * 0.8 : 0;
  const nada = !S.tx.length;

  return (
    <View>
      {nada && <Empty icon="📊" text="Cuando anotes tus primeros gastos, acá ves tu ritmo del mes, tus categorías contra el mes pasado y tu rating." />}

      {/* ─── El mes en una curva ─── */}
      {T.curva.length > 1 && (
        <Panel glow={FX.violetDeep}>
          <Label>GASTO DEL MES · {clp(T.gasto)}</Label>
          <Curve values={T.curva} ideal={ideal} total={dm} />
          <Text style={s.caption}>{ideal > 0 ? `Línea punteada: el ritmo de ${presupTotal > 0 ? 'tu presupuesto' : 'gastar el 80 % de lo que entra'}. Si tu curva va arriba, vas más rápido.` : 'Tu gasto acumulado día a día.'}</Text>
          <View style={s.tags}>
            <Tag label="RITMO" value={`${clpK(T.burnDiario)}/día`} />
            <Tag label="TE ALCANZA" value={T.runwayDias == null ? '—' : `${T.runwayDias} día${T.runwayDias === 1 ? '' : 's'}`} color={T.runwayDias == null || T.runwayDias >= T.diasAlIngreso ? FX.up : FX.gold} />
            {T.deudaTC > 0 && <Tag label="TARJETAS" value={clpK(T.deudaTC)} color={FX.down} />}
          </View>
        </Panel>
      )}

      {/* ─── El mes en cuatro números ─── */}
      {!nada && (
        <View style={s.grid}>
          <Kpi label="RESULTADO DEL MES" value={signed(T.resultado)} color={T.resultado >= 0 ? FX.up : FX.down} sub={`Entró ${clpK(T.ingreso)} · salió ${clpK(T.gasto)}`} />
          <Kpi label="TODO LO QUE TIENES" value={clp(T.patrimonio)} color={T.patrimonio >= 0 ? FX.text : FX.down} sub="Cuentas + ahorro + te deben − tarjetas" />
          <Kpi label="AHORRAS" infoId="tasa_ahorro" value={`${T.tasaAhorro}%`} color={T.tasaAhorro >= 20 ? FX.up : T.tasaAhorro >= 10 ? FX.gold : FX.text} sub="Lo que te quedaría al cierre del mes, a tu ritmo" />
          <Kpi label="AHORRADO" value={clp(T.ahorro)} color={FX.violet} sub={T.meDeben > 0 ? `Y te deben ${clpK(T.meDeben)}` : 'En tus cuentas de ahorro'} />
        </View>
      )}

      {/* ─── Categorías vs el mes pasado (al mismo día) ─── */}
      {T.tickers.length > 0 && (
        <Panel>
          <Label>CATEGORÍAS · VS {MES_CORTO[(now.getMonth() + 11) % 12]} AL DÍA {hoy}</Label>
          {T.tickers.map((t) => {
            const m = catOf(t.cat);
            const up = (t.cambio ?? 0) > 0;
            return (
              <TouchableOpacity key={t.cat} style={s.ticker} onPress={() => open({ k: 'presup', cat: t.cat })} accessibilityRole="button" accessibilityLabel={`${m.label} ${clp(t.monto)}`}>
                <View style={[s.tickDot, { backgroundColor: m.color }]} />
                <Text style={s.tickCode}>{m.ticker}</Text>
                <Text style={s.tickAmt}>{clp(t.monto)}</Text>
                <Text style={[s.tickChg, { color: t.cambio == null ? FX.dim : up ? FX.down : FX.up }]}>{t.cambio == null ? 'NUEVO' : pct(t.cambio)}</Text>
                {t.presup > 0 && <Text style={s.tickBud}>{Math.round((t.monto / t.presup) * 100)}%</Text>}
              </TouchableOpacity>
            );
          })}
          <Text style={s.caption}>▲ gastaste más que el mes pasado a esta altura · % = cuánto del tope llevas. Toca una para ponerle tope.</Text>
        </Panel>
      )}

      {/* ─── Rating: cómo manejas la plata (no cuánto ganas) ─── */}
      {V.Rt && (
        <Panel>
          <View style={s.ratingHead}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Label>TU RATING</Label><InfoTip id="rating" color={FX.violet} size={16} /></View>
              <Text style={s.caption}>Mide cómo manejas la plata, no cuánto ganas.</Text>
            </View>
            <Text style={[s.nota, { color: notaColor(V.Rt.nota) }]}>{V.Rt.nota}</Text>
          </View>
          {V.Rt.partes.map((p) => (
            <View key={p.id} style={s.parte}>
              <Text style={s.parteLabel}>{p.label}</Text>
              <View style={s.parteBar}><View style={[s.parteFill, { width: `${Math.round(Math.max(0.04, Math.min(1, p.valor)) * 100)}%`, backgroundColor: p.valor >= 0.75 ? FX.up : p.valor >= 0.45 ? FX.gold : FX.down }]} /></View>
              <Text style={s.parteTxt} numberOfLines={2}>{p.texto}</Text>
            </View>
          ))}
          {V.Rt.mejoras.length > 0 && (
            <View style={s.mejoras}>
              <Text style={s.mejorasTitle}>PARA SUBIR</Text>
              {V.Rt.mejoras.map((m, i) => <Text key={i} style={s.mejora}>→ {m}</Text>)}
            </View>
          )}
        </Panel>
      )}

      {/* ─── 6 meses ─── */}
      {T.tendencia.some((t) => t.gasto > 0) && (
        <Panel>
          <Label>6 MESES · GASTO VS LO QUE ENTRÓ</Label>
          <Bars data={T.tendencia.map((t) => ({ label: t.ms, gasto: t.gasto, ingreso: t.ingreso }))} />
          <View style={s.months}>{T.tendencia.map((t) => <Text key={t.ms} style={s.month}>{MES_CORTO[Number(t.ms.slice(5)) - 1]}</Text>)}</View>
          <Text style={s.caption}>Barra: lo que salió · raya verde: lo que entró. Roja si saliste sobre lo que entró.</Text>
        </Panel>
      )}
    </View>
  );
}

function Tag({ label, value, color = FX.muted }: { label: string; value: string; color?: string }) {
  return (
    <View style={[s.tag, { borderColor: color + '55' }]}>
      <Text style={[s.tagText, { color }]}>{label} {value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  caption: { color: FX.dim, fontSize: 11, marginTop: 6, lineHeight: 15 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontFamily: FX.mono, fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  ticker: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, borderTopWidth: 1, borderTopColor: FX.lineSoft },
  tickDot: { width: 6, height: 6, borderRadius: 3 },
  tickCode: { color: FX.text, fontFamily: FX.mono, fontSize: 13, fontWeight: '700', width: 64 },
  tickAmt: { color: FX.text, fontFamily: FX.mono, fontSize: 13, flex: 1, fontVariant: ['tabular-nums'] },
  tickChg: { fontFamily: FX.mono, fontSize: 12, fontWeight: '700', width: 64, textAlign: 'right' },
  tickBud: { color: FX.muted, fontFamily: FX.mono, fontSize: 11, width: 40, textAlign: 'right' },
  months: { flexDirection: 'row', justifyContent: 'space-around', marginTop: -4 },
  month: { color: FX.dim, fontFamily: FX.mono, fontSize: 10 },
  ratingHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  nota: { fontFamily: FX.mono, fontSize: 34, fontWeight: '900' },
  parte: { marginTop: 10 },
  parteLabel: { color: FX.text, fontSize: 13, fontWeight: '700' },
  parteBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.05)', marginTop: 5, overflow: 'hidden' },
  parteFill: { height: 6, borderRadius: 3 },
  parteTxt: { color: FX.muted, fontSize: 11, marginTop: 4 },
  mejoras: { marginTop: 14, borderTopWidth: 1, borderTopColor: FX.lineSoft, paddingTop: 10, gap: 6 },
  mejorasTitle: { color: FX.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  mejora: { color: FX.text, fontSize: 13, lineHeight: 19 },
});

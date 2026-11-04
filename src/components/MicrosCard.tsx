// ============================================================
// Eris Mobile — «Vitaminas y minerales de hoy» en Métricas (fase I6, 2026-10-23)
//
// Lo de hoy de cada uno: la comida (verde) y los suplementos (morado) en la misma barra, contra lo recomendado al día para la
// edad y el sexo de Forge (NIH). Por defecto, los diez que más suelen faltar; «Ver las 17» abre el resto. Sin rojos: un día
// bajo no es un problema («medir sin obsesión»); lo que pasa un límite superior va en ámbar con su cifra.
// ============================================================

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { T, R } from '../config/design';
import InfoTip from './InfoTip';
import { fmtMicro, SCORE_KEYS, type MicroDia } from '../services/supplements/supplementCore';

const SUP = '#A78BFA';

export default function MicrosCard({ md, conPerfil }: { md: MicroDia; conPerfil: boolean }) {
  const [todas, setTodas] = useState(false);
  const rows = todas ? md.rows : md.rows.filter((r) => SCORE_KEYS.includes(r.key));
  const sobre = md.rows.filter((r) => r.sobreUL != null);
  const vacio = md.rows.every((r) => r.total === 0);
  return (
    <View style={st.card}>
      <View style={st.head}>
        <Text style={st.title}>VITAMINAS Y MINERALES</Text>
        <InfoTip id="vitaminas_dia" size={16} color={T.textMuted} />
      </View>
      {vacio ? (
        <Text style={st.text}>Cuando anotes comida (o marques un suplemento) aparecen aquí, con lo que llevas de cada uno.</Text>
      ) : (
        <>
          {rows.map((r) => {
            const pc = r.dri > 0 ? Math.min(100, (r.comida / r.dri) * 100) : 0;
            const ps = r.dri > 0 ? Math.min(100 - pc, (r.suplementos / r.dri) * 100) : 0;
            return (
              <View key={r.key} style={st.row}>
                <Text style={st.name} numberOfLines={1}>{r.nombre}</Text>
                <View style={st.bar}>
                  <View style={[st.fill, { width: `${pc}%`, backgroundColor: T.green }]} />
                  {ps > 0 && <View style={[st.fill, { width: `${ps}%`, backgroundColor: SUP }]} />}
                </View>
                <Text style={st.val}>{fmtMicro(r.key, r.total)}</Text>
                <Text style={[st.pct, r.sobreUL != null && { color: T.gold }]}>{r.pct > 300 ? '>300' : r.pct} %</Text>
              </View>
            );
          })}
          <TouchableOpacity onPress={() => setTodas((x) => !x)} style={st.more}>
            <Text style={st.moreText}>{todas ? 'Ver menos' : `Ver las ${md.rows.length}`}</Text>
          </TouchableOpacity>
          {md.bajos.length > 0 && md.bajos[0].pct < 50 && (
            <Text style={st.text}>
              Lo que menos llevas: <Text style={st.bold}>{md.bajos[0].nombre.charAt(0).toLowerCase() + md.bajos[0].nombre.slice(1)}</Text> ({md.bajos[0].fuentes}).
            </Text>
          )}
          {sobre.map((r) => (
            <Text key={r.key} style={[st.text, { color: T.gold }]}>
              {r.nombre}: hoy suma {fmtMicro(r.key, r.total)}, sobre el límite superior de los estudios ({fmtMicro(r.key, r.sobreUL!)}). Si te lo indicó tu médico, está bien.
            </Text>
          ))}
          <View style={st.legend}>
            <View style={[st.dot, { backgroundColor: T.green }]} /><Text style={st.legendText}>comida</Text>
            <View style={[st.dot, { backgroundColor: SUP, marginLeft: 10 }]} /><Text style={st.legendText}>suplementos</Text>
          </View>
          <Text style={st.foot}>
            {md.cobertura < 0.9 ? `~${Math.round(md.cobertura * 100)} % de lo que comiste hoy trae el dato: puede ser más. ` : ''}
            % de lo recomendado al día {conPerfil ? 'para tu edad y sexo' : '(sin tu edad y sexo en Forge: la referencia más alta)'} (NIH). Va sumando durante el día.
          </Text>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { width: '100%', backgroundColor: T.bgCard, borderRadius: R.lg, borderWidth: 1, borderColor: T.border, padding: 18, marginTop: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  title: { fontSize: 12, fontWeight: '800', color: T.textMuted, letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  name: { color: T.textLight, fontSize: 12, width: 128 },
  bar: { flex: 1, height: 7, borderRadius: 4, backgroundColor: T.bgInput, overflow: 'hidden', flexDirection: 'row' },
  fill: { height: 7 },
  val: { color: T.text, fontSize: 12, fontWeight: '700', width: 66, textAlign: 'right', fontVariant: ['tabular-nums'] },
  pct: { color: T.textMuted, fontSize: 11, width: 42, textAlign: 'right', fontVariant: ['tabular-nums'] },
  more: { alignSelf: 'flex-start', paddingVertical: 8 },
  moreText: { color: T.accent, fontSize: 12, fontWeight: '700' },
  text: { color: T.textLight, fontSize: 12, lineHeight: 17, marginTop: 4 },
  bold: { color: T.text, fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  legendText: { color: T.textMuted, fontSize: 11 },
  foot: { color: T.textMuted, fontSize: 10, marginTop: 8, lineHeight: 14 },
});

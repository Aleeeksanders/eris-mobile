// Inventario — Botiquín (fase I3): tus remedios del perfil con cuánto te queda y para cuántos días alcanza (bajan solos con
// las tomas que anotaste), el resto del botiquín (suplementos, primeros auxilios) y tu historial médico en un solo lugar.
// «Cuida, no trata»: muestra lo que TÚ anotaste (dosis y horario tal cual); Eris no sugiere ni cambia dosis.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { IX, fechaCorta } from '../ix';
import { Panel, Label, Btn, ItemRow, Empty } from '../parts';
import { claveNombre, cantidadDe, diasQueAlcanza, consumir, type Item } from '../../../services/inventory/inventoryCore';
import { usePerfilMedico, historiaMedica, CONDICION, EXAMEN, EVENTO, type Remedio } from '../useMedical';
import type { TabProps } from '../types';

/** La cosa del inventario que es ese remedio: la vinculada, o la del botiquín que empieza igual («Metformina 850»). */
export function itemDeRemedio(items: Item[], m: Remedio): Item | undefined {
  const k = claveNombre(m.name).split(' ')[0];
  return items.find((i) => !i.archivado && i.medId === m.id)
    ?? items.find((i) => !i.archivado && !i.medId && i.area === 'botiquin' && claveNombre(i.nombre).split(' ')[0] === k);
}

export default function Botiquin({ S, V, open, act }: TabProps) {
  const med = usePerfilMedico();
  const remedios = (med?.medications ?? []).filter((m) => m.active);
  const vinculados = new Set(remedios.map((m) => itemDeRemedio(S.items, m)?.id).filter(Boolean) as number[]);
  const otros = S.items.filter((i) => i.area === 'botiquin' && !i.archivado && !vinculados.has(i.id));
  // el último examen de cada tipo
  const examenes = Object.values((med?.labs ?? []).reduce<Record<string, any>>((acc, l) => {
    const prev = acc[l.test];
    if (!prev || String(l.date ?? '') > String(prev.date ?? '')) acc[l.test] = l;
    return acc;
  }, {}));
  const historia = [...(med?.history ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <View>
      {/* ─── Tus remedios (del perfil) ─── */}
      <Panel glow="#f472b6">
        <Label info="remedios">TUS REMEDIOS</Label>
        {med == null && <Text style={s.note}>Sin conexión con Eris: cuando se conecte veo tus remedios del perfil.</Text>}
        {med != null && !remedios.length && <Text style={s.note}>No tienes remedios activos en tu perfil. Se anotan en Perfil → Salud (o díselo a Eris).</Text>}
        {remedios.map((m) => {
          const it = itemDeRemedio(S.items, m);
          const dias = it ? diasQueAlcanza(it) : null;
          const color = !it ? IX.muted : it.cantidad <= 0 ? IX.red : dias != null && dias <= 7 ? IX.amber : IX.green;
          return (
            <View key={m.id} style={s.med}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{m.name}</Text>
                {(m.dose || m.schedule) && <Text style={s.sub}>Como lo anotaste: {[m.dose, m.schedule].filter(Boolean).join(' · ')}</Text>}
                <Text style={[s.stock, { color }]}>
                  {!it ? 'Sin stock anotado' : it.cantidad <= 0 ? 'Se acabó' : `Te quedan ${cantidadDe(it)}${dias != null ? ` · ~${dias} día${dias === 1 ? '' : 's'}` : ''}`}
                </Text>
              </View>
              {it ? (
                <View style={{ gap: 6 }}>
                  {!it.toma && <Btn small ghost label="Tomas" color={IX.teal} onPress={() => open({ k: 'remedio', medId: m.id, itemId: it.id })} a11y={`Anotar las tomas de ${m.name}`} />}
                  <Btn small ghost label="Ver" color={IX.muted} onPress={() => open({ k: 'item', id: it.id })} />
                </View>
              ) : <Btn small label="Anotar" onPress={() => open({ k: 'remedio', medId: m.id })} a11y={`Anotar cuánto tienes de ${m.name}`} />}
            </View>
          );
        })}
        {remedios.length > 0 && <Text style={s.hint}>Bajan solos cada día con las tomas que anotaste. Si un día no lo tomaste, «Contar» lo corrige. Eris no sugiere ni cambia dosis.</Text>}
      </Panel>

      {/* ─── El resto del botiquín ─── */}
      <Panel>
        <Label>SUPLEMENTOS Y PRIMEROS AUXILIOS</Label>
        {!otros.length && <Empty icon="💊" text="Paracetamol, curitas, termómetro, vitaminas, creatina… lo que tengas en el botiquín." />}
        {otros.map((it) => {
          const d = diasQueAlcanza(it);
          return (
            <View key={it.id}>
              <ItemRow it={it} now={V.now} onPress={() => open({ k: 'item', id: it.id })} onMenos={() => { void act((W, ctx) => consumir(W, it.id, 1, null, ctx)); }} />
              {d != null && <Text style={[s.sub, { marginLeft: 2, marginBottom: 4, color: d <= 7 ? IX.amber : IX.muted }]}>🗓 todos los días · te alcanza ~{d} día{d === 1 ? '' : 's'}</Text>}
            </View>
          );
        })}
        <Btn small label="+ Agregar al botiquín" onPress={() => open({ k: 'agregar', preset: { area: 'botiquin' } })} style={{ marginTop: 10 }} />
      </Panel>

      {/* ─── Historial médico ─── */}
      <Panel>
        <Label info="historial_medico">HISTORIAL MÉDICO</Label>
        {med == null ? <Text style={s.note}>Sin conexión con Eris.</Text> : (
          <>
            <View style={s.facts}>
              <Fact k="Grupo sanguíneo" v={med.bloodType || 'sin anotar'} />
              <Fact k="Alergias" v={med.allergies?.trim() || 'sin anotar'} />
              <Fact k="Condiciones" v={(med.conditions ?? []).map((c) => CONDICION[c.id] ?? c.id).join(', ') || 'ninguna anotada'} />
            </View>
            {examenes.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text style={s.subTitle}>ÚLTIMOS EXÁMENES</Text>
                {examenes.map((l: any) => (
                  <View key={l.test} style={s.ev}>
                    <Text style={s.evIcon}>🧪</Text>
                    <Text style={s.evTitle}>{EXAMEN[l.test] ?? l.test}: <Text style={{ fontFamily: IX.mono }}>{String(l.value).replace('.', ',')} {l.unit}</Text></Text>
                    {!!l.date && <Text style={s.evDate}>{/^\d{4}-\d{2}-\d{2}$/.test(l.date) ? fechaCorta(l.date) : l.date}</Text>}
                  </View>
                ))}
              </View>
            )}
            <Text style={[s.subTitle, { marginTop: 12 }]}>CONSULTAS Y EVENTOS</Text>
            {!historia.length && <Text style={s.note}>Anota tus consultas, exámenes, vacunas o urgencias con su fecha: así los tienes a mano (y Eris también).</Text>}
            {historia.slice(0, 20).map((h) => (
              <TouchableOpacity key={h.id} style={s.ev} accessibilityRole="button" accessibilityLabel={`${EVENTO[h.type]?.label ?? 'Evento'}: ${h.title}. Mantén presionado para borrar`}
                onLongPress={() => Alert.alert('Borrar del historial', `«${h.title}» (${fechaCorta(h.date)})`, [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Borrar', style: 'destructive', onPress: () => { void historiaMedica({ borrar: h.id }); } },
                ])}>
                <Text style={s.evIcon}>{EVENTO[h.type]?.icon ?? '📝'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.evTitle}>{h.title}</Text>
                  {!!h.note && <Text style={s.sub}>{h.note}</Text>}
                </View>
                <Text style={s.evDate}>{fechaCorta(h.date)}{h.date.slice(0, 4) !== String(V.now.getFullYear()) ? ` ${h.date.slice(0, 4)}` : ''}</Text>
              </TouchableOpacity>
            ))}
            <Btn small ghost label="+ Anotar consulta o evento" color={IX.teal} onPress={() => open({ k: 'historia' })} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
            <Text style={s.hint}>Es tu registro, no una ficha clínica. Condiciones, remedios y alergias se cambian en Perfil → Salud. Mantén presionado un evento para borrarlo.</Text>
          </>
        )}
      </Panel>
    </View>
  );
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <View style={s.fact}><Text style={s.factK}>{k}</Text><Text style={s.factV}>{v}</Text></View>
);

const s = StyleSheet.create({
  note: { color: IX.muted, fontSize: 12.5, lineHeight: 18 },
  hint: { color: IX.dim, fontSize: 11.5, lineHeight: 16, marginTop: 10 },
  med: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, borderTopWidth: 1, borderTopColor: IX.lineSoft, paddingVertical: 8 },
  name: { color: IX.text, fontSize: 15, fontWeight: '800' },
  sub: { color: IX.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  stock: { fontFamily: IX.mono, fontSize: 12.5, marginTop: 4 },
  facts: { gap: 6 },
  fact: { flexDirection: 'row', gap: 10 },
  factK: { color: IX.muted, fontSize: 12.5, width: 118 },
  factV: { color: IX.text, fontSize: 13, flex: 1, lineHeight: 18 },
  subTitle: { color: IX.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 4 },
  ev: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderTopWidth: 1, borderTopColor: IX.lineSoft, paddingVertical: 6 },
  evIcon: { fontSize: 16, width: 24, textAlign: 'center' },
  evTitle: { color: IX.text, fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
  evDate: { color: IX.dim, fontFamily: IX.mono, fontSize: 11 },
});

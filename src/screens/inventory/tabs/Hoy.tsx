// Inventario — Hoy: lo que pide atención. Lo que se vence (y lo vencido), lo que se acabó o queda poco, la revisión de la
// semana y un vistazo de tu casa por área. La primera vez: cómo empezar.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { IX, AREA_COLOR, venceTxt, venceColor, clp } from '../ix';
import { Panel, Label, Btn, Chip } from '../parts';
import { AREAS, cantidadDe, consumir, diasQueAlcanza, fmtCant, noEraDeLaCasa, resolverPendiente, familia, type AreaId } from '../../../services/inventory/inventoryCore';
import { tourRef } from '../../../components/tour/tourTargets';
import { ErisDecideChip } from '../../../components/home/ErisPlan';
import type { TabProps } from '../types';
import { daySchedule } from '../../../services/daySchedule';

export default function Hoy({ S, V, open, act, irA }: TabProps) {
  const activos = S.items.filter((i) => !i.archivado);
  const vacio = activos.length === 0;
  const { vence, lista, revision, areas } = V;
  // Lo que comiste hoy y salió de la despensa (con «Lo comí fuera»), y lo que no se supo cuánto descontar
  // El día de COMIDA, no el del calendario (revisión K2): a quien trasnocha, lo de la cena de las 00:30 se le borraba a medianoche
  const diaComida = daySchedule.todayKey(V.now);
  const comido = S.movs.filter((m) => m.via === 'nutricion' && m.delta < 0 && daySchedule.todayKey(new Date(m.at)) === diaComida).slice().reverse();
  const pendientes = (S.nutri?.pendientes ?? []).filter((p) => S.items.some((i) => i.id === p.itemId && i.cantidad > 0));
  const nada = !vence.length && !lista.auto.length && !revision.length && !pendientes.length;

  return (
    <View>
      {/* «Eris decide» (Eris al timón): lo que vence y lo que falta para el menú de hoy */}
      {!vacio && <ErisDecideChip modulo="casa" style={{ marginBottom: 10 }} />}
      {vacio && (
        <Panel glow={IX.tealDeep}>
          <Label>EMPIEZA AQUÍ</Label>
          <Text style={s.lead}>Anota lo que tienes en casa y yo te aviso lo que se vence, lo que se acaba y armo tu lista de compras.</Text>
          <Paso n={1} titulo="Elige un área y agrega lo que hay" sub="Parte por lo que más usas: el refri, la despensa o el baño." />
          <View style={[s.chips, { marginLeft: 34, marginBottom: 6 }]}>
            {AREAS.filter((a) => !S.ocultas.includes(a.id)).slice(0, 5).map((a) => (
              <Chip key={a.id} small label={`${a.icono} ${a.corto}`} color={AREA_COLOR[a.id]} onPress={() => open({ k: 'agregar', preset: { area: a.id } })} />
            ))}
          </View>
          <Paso n={2} titulo="O escanea el código de barras" sub="Te completo el nombre del producto." boton="Escanear" onPress={() => open({ k: 'agregar', preset: { barcode: '__scan__' } })} />
          <Paso n={3} titulo="O cuéntaselo a Eris" sub="«Compré 2 L de leche y 6 huevos», «se me acabó el shampoo»." />
        </Panel>
      )}

      {/* ─── Lo que se vence ─── */}
      {vence.length > 0 && (
        <View ref={tourRef('inv.vence')} collapsable={false}>
          <Panel glow={vence.some((v) => v.dias < 0) ? IX.red : IX.amber}>
            <Label info="por_vencer">POR VENCER</Label>
            {vence.slice(0, 8).map(({ item, dias }) => (
              <View key={item.id} style={s.line}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => open({ k: 'item', id: item.id })} accessibilityRole="button" accessibilityLabel={`${item.nombre}, ${venceTxt(dias)}`}>
                  <Text style={s.name} numberOfLines={1}>{item.nombre}</Text>
                  <Text style={[s.sub, { color: venceColor(dias) }]}>{venceTxt(dias)} · {cantidadDe(item)}</Text>
                </TouchableOpacity>
                {dias < 0
                  ? <Btn small ghost label="Lo boté" color={IX.red} onPress={() => open({ k: 'botar', id: item.id })} />
                  : <Btn small ghost label="Usé" color={IX.teal} onPress={() => open({ k: 'usar', id: item.id })} />}
              </View>
            ))}
            {vence.length > 8 && <Text style={s.more}>y {vence.length - 8} más</Text>}
          </Panel>
        </View>
      )}

      {/* ─── Lo que comiste y no se supo cuánto descontar ─── */}
      {pendientes.length > 0 && (
        <Panel glow={IX.teal}>
          <Label info="comida_despensa">POR CONFIRMAR · LO QUE COMISTE</Label>
          {pendientes.slice(0, 5).map((p) => {
            const it = S.items.find((i) => i.id === p.itemId)!;
            const opciones = familia(it.unidad) === 'cuenta' ? [0.5, 1, 2] : [];
            return (
              <View key={p.key} style={s.pend}>
                <Text style={s.name} numberOfLines={2}>Comiste {p.comida.toLowerCase()} ({Math.round(p.grams)} g): ¿cuánto descuento de {it.nombre}?</Text>
                <View style={[s.chips, { marginTop: 6 }]}>
                  {opciones.map((n) => <Chip key={n} small label={fmtCant(n, it.unidad)} onPress={() => { void act((W, ctx) => resolverPendiente(W, p.key, n, it.unidad, ctx)); }} />)}
                  <Chip small label="Otra cantidad" onPress={() => { void act((W, ctx) => resolverPendiente(W, p.key, null, null, ctx)); open({ k: 'usar', id: it.id }); }} />
                  <Chip small label="Nada (no era de la casa)" color={IX.muted} onPress={() => { void act((W, ctx) => resolverPendiente(W, p.key, null, null, ctx)); }} />
                </View>
              </View>
            );
          })}
        </Panel>
      )}

      {/* ─── Lo que se acabó o queda poco ─── */}
      {lista.auto.length > 0 && (
        <Panel>
          <Label info="lista_compras">SE ACABÓ O QUEDA POCO</Label>
          {lista.auto.slice(0, 6).map((f) => (
            <View key={f.item.id} style={s.line}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => open({ k: 'item', id: f.item.id })} accessibilityRole="button" accessibilityLabel={`${f.item.nombre}: ${f.estado === 'acabado' ? 'se acabó' : f.estado === 'pronto' ? `se acaba en ~${f.dias} días` : 'queda poco'}`}>
                <Text style={s.name} numberOfLines={1}>{f.item.nombre}</Text>
                <Text style={[s.sub, { color: f.estado === 'acabado' ? IX.red : IX.amber }]}>{f.estado === 'acabado' ? 'Se acabó' : f.estado === 'pronto' ? `A tu ritmo se acaba en ~${f.dias} día${f.dias === 1 ? '' : 's'}` : diasQueAlcanza(f.item) != null ? `Te alcanza ~${diasQueAlcanza(f.item)} días` : `Queda ${cantidadDe(f.item)}`}{f.costo ? ` · ~${clp(f.costo)}` : ''}</Text>
              </TouchableOpacity>
              <Btn small ghost label="Lo compré" color={IX.green} onPress={() => open({ k: 'agregar', preset: { nombre: f.item.nombre, area: f.item.area, cantidad: f.sugerida, unidad: f.item.unidad } })} />
            </View>
          ))}
          <TouchableOpacity onPress={() => irA('compras')} style={s.link} accessibilityRole="button"><Text style={s.linkText}>Ver la lista de compras ({lista.auto.length + lista.manual.length}) ›</Text></TouchableOpacity>
        </Panel>
      )}

      {/* ─── La revisión de la semana: que el inventario siga fiel ─── */}
      {revision.length > 0 && (
        <View ref={tourRef('inv.revision')} collapsable={false}>
          <Panel>
            <Label info="revision">REVISIÓN DE LA SEMANA</Label>
            <Text style={s.lead}>{revision.length === 1 ? 'Hay 1 cosa' : `Hay ${revision.length} cosas`} que no cuentas hace una semana o más. Un toque cada una: «está bien» o cuánto hay.</Text>
            <Btn small label={`Revisar ahora (${revision.length})`} onPress={() => open({ k: 'revision' })} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
          </Panel>
        </View>
      )}

      {!vacio && nada && (
        <Panel glow={IX.green}>
          <Text style={[s.lead, { color: IX.green }]}>✓ Todo al día: nada por vencer, nada por reponer y todo contado esta semana.</Text>
        </Panel>
      )}

      {/* ─── Lo que comiste hoy salió de la despensa ─── */}
      {comido.length > 0 && (
        <Panel>
          <Label info="comida_despensa">LO QUE COMISTE SALIÓ DE LA DESPENSA</Label>
          {comido.slice(0, 6).map((m) => {
            const it = S.items.find((i) => i.id === m.itemId);
            if (!it) return null;
            return (
              <View key={m.id} style={s.line}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{it.nombre} <Text style={s.menos}>−{fmtCant(-m.delta, it.unidad)}</Text></Text>
                  <Text style={s.sub} numberOfLines={1}>{m.nota ? `por «${m.nota}»` : 'por lo que anotaste en Nutrición'} · quedan {cantidadDe(it)}</Text>
                </View>
                <Btn small ghost label="Lo comí fuera" color={IX.muted} onPress={() => { void act((W) => noEraDeLaCasa(W, m.id)); }} a11y={`No era de la casa: devolver ${it.nombre}`} />
              </View>
            );
          })}
        </Panel>
      )}

      {/* ─── Tu casa, por área ─── */}
      {!vacio && (
        <Panel>
          <Label>TU CASA</Label>
          <View style={s.grid}>
            {areas.filter((a) => a.items > 0).map((a) => (
              <TouchableOpacity key={a.area.id} style={s.cell} onPress={() => irA('areas', a.area.id as AreaId)} accessibilityRole="button" accessibilityLabel={`${a.area.nombre}: ${a.conStock} con stock`}>
                <Text style={s.cellIcon}>{a.area.icono}</Text>
                <Text style={s.cellN}>{a.conStock}</Text>
                <Text style={s.cellName} numberOfLines={1}>{a.area.corto}</Text>
                {(a.vence > 0 || a.faltan > 0) && <View style={[s.dot, { backgroundColor: a.vence > 0 ? IX.amber : IX.red }]} />}
              </TouchableOpacity>
            ))}
          </View>
        </Panel>
      )}
    </View>
  );
}

function Paso({ n, titulo, sub, boton, onPress }: { n: number; titulo: string; sub: string; boton?: string; onPress?: () => void }) {
  return (
    <View style={s.paso}>
      <Text style={s.pasoN}>{n}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{titulo}</Text>
        <Text style={s.sub}>{sub}</Text>
      </View>
      {boton && <Btn small ghost label={boton} color={IX.teal} onPress={onPress} />}
    </View>
  );
}

/** «Usé una» desde una fila (se usa también en Áreas). */
export const usarUna = (act: TabProps['act'], id: number) => act((W, ctx) => consumir(W, id, 1, null, ctx));

const s = StyleSheet.create({
  lead: { color: IX.text, fontSize: 14, lineHeight: 20, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: 1, borderTopColor: IX.lineSoft, paddingVertical: 4 },
  name: { color: IX.text, fontSize: 14.5, fontWeight: '700' },
  sub: { color: IX.muted, fontSize: 12, marginTop: 2 },
  more: { color: IX.muted, fontSize: 12, marginTop: 6 },
  link: { minHeight: 40, justifyContent: 'center', marginTop: 4 },
  linkText: { color: IX.teal, fontSize: 13, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '30.5%', minHeight: 84, borderRadius: 14, borderWidth: 1, borderColor: IX.lineSoft, backgroundColor: IX.panelHi, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  cellIcon: { fontSize: 20 },
  cellN: { color: IX.text, fontFamily: IX.mono, fontSize: 18, fontWeight: '800', marginTop: 2 },
  cellName: { color: IX.muted, fontSize: 11, fontWeight: '700' },
  dot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4 },
  pend: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: IX.lineSoft },
  menos: { color: IX.teal, fontFamily: IX.mono, fontSize: 12.5, fontWeight: '600' },
  paso: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: IX.lineSoft },
  pasoN: { color: IX.teal, fontFamily: IX.mono, fontSize: 18, fontWeight: '900', width: 22, textAlign: 'center' },
});

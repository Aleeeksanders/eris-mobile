// Inventario — Áreas: DÓNDE está cada cosa. La grilla de tu casa (con lo que se vence o se acabó en cada área), un
// buscador para todo, y al tocar un área, sus cosas con los botones rápidos (− usé una · + compré una).
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { IX, AREA_COLOR } from '../ix';
import { Panel, Label, Btn, ItemRow, Empty } from '../parts';
import { AREA, buscar, agregar, diasHasta } from '../../../services/inventory/inventoryCore';
import { usarUna } from './Hoy';
import type { TabProps } from '../types';

export default function Areas({ S, V, open, act, area, setArea }: TabProps) {
  const [q, setQ] = useState('');
  const encontrados = useMemo(() => (q.trim().length >= 2 ? buscar(S, q).slice(0, 20) : []), [S, q]);
  const masUna = (id: number) => act((W, ctx) => { const it = W.items.find((i) => i.id === id)!; return agregar(W, { nombre: it.nombre, area: it.area, cantidad: 1, unidad: it.unidad }, ctx); });

  // ─── Un área abierta ───
  if (area) {
    const a = AREA[area];
    const xs = S.items.filter((i) => i.area === area && !i.archivado).sort((x, y) => {
      if ((x.cantidad > 0) !== (y.cantidad > 0)) return x.cantidad > 0 ? -1 : 1;
      const dx = x.vence ? diasHasta(x.vence, V.now) : 9999, dy = y.vence ? diasHasta(y.vence, V.now) : 9999;
      return dx - dy || x.nombre.localeCompare(y.nombre);
    });
    return (
      <View>
        <TouchableOpacity onPress={() => setArea(null)} style={s.back} accessibilityRole="button" accessibilityLabel="Volver a las áreas"><Text style={s.backText}>‹ Áreas</Text></TouchableOpacity>
        <Panel glow={AREA_COLOR[area]}>
          <View style={s.areaHead}>
            <Text style={s.areaIcon}>{a.icono}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.areaName}>{a.nombre}</Text>
              <Text style={s.areaDesc}>{a.desc}</Text>
            </View>
          </View>
          {!xs.length && <Empty icon={a.icono} text={`Todavía no hay nada en ${a.nombre}. Agrega lo que tienes: así te aviso lo que se vence y lo que se acaba.`} />}
          {xs.map((it) => (
            <ItemRow key={it.id} it={it} now={V.now} onPress={() => open({ k: 'item', id: it.id })}
              onMenos={a.consumible ? () => { void usarUna(act, it.id); } : undefined} onMas={() => { void masUna(it.id); }} />
          ))}
          <Btn small label={`+ Agregar en ${a.corto}`} onPress={() => open({ k: 'agregar', preset: { area } })} style={{ marginTop: 12 }} color={IX.tealDeep} />
        </Panel>
      </View>
    );
  }

  // ─── La grilla y el buscador ───
  return (
    <View>
      <TextInput value={q} onChangeText={setQ} placeholder="Buscar en tu casa (leche, pilas, ibuprofeno…)" placeholderTextColor={IX.dim} style={s.search}
        accessibilityLabel="Buscar en el inventario" returnKeyType="search" />
      {q.trim().length >= 2 && (
        <Panel>
          <Label>ENCONTRADO</Label>
          {!encontrados.length && <Text style={s.areaDesc}>No tienes «{q.trim()}» anotado. <Text style={{ color: IX.teal }} onPress={() => open({ k: 'agregar', preset: { nombre: q.trim() } })}>Agregarlo ›</Text></Text>}
          {encontrados.map((it) => <ItemRow key={it.id} it={it} now={V.now} area onPress={() => open({ k: 'item', id: it.id })} />)}
        </Panel>
      )}
      <View style={s.grid}>
        {V.areas.map((r) => (
          <TouchableOpacity key={r.area.id} style={[s.card, { borderColor: AREA_COLOR[r.area.id] + '44' }]} onPress={() => setArea(r.area.id)} accessibilityRole="button"
            accessibilityLabel={`${r.area.nombre}: ${r.conStock} con stock${r.vence ? `, ${r.vence} por vencer` : ''}${r.faltan ? `, ${r.faltan} por reponer` : ''}`}>
            <Text style={s.cardIcon}>{r.area.icono}</Text>
            <Text style={s.cardName} numberOfLines={1}>{r.area.nombre}</Text>
            <Text style={s.cardN}>{r.items ? `${r.conStock} con stock` : 'Vacía'}</Text>
            <View style={s.flags}>
              {r.vence > 0 && <Text style={[s.flag, { color: IX.amber, borderColor: IX.amber + '55' }]}>{r.vence} por vencer</Text>}
              {r.faltan > 0 && <Text style={[s.flag, { color: IX.red, borderColor: IX.red + '55' }]}>{r.faltan} por reponer</Text>}
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.hint}>¿Un área que no usas, o te falta Mascotas? ⚙ → Áreas.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  back: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 4 },
  backText: { color: IX.teal, fontSize: 15, fontWeight: '800' },
  areaHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  areaIcon: { fontSize: 30 },
  areaName: { color: IX.text, fontSize: 18, fontWeight: '900' },
  areaDesc: { color: IX.muted, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  search: { backgroundColor: IX.panel, borderWidth: 1, borderColor: IX.line, borderRadius: 14, color: IX.text, fontSize: 15, paddingHorizontal: 14, minHeight: 48, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexBasis: '47%', flexGrow: 1, minHeight: 116, borderRadius: 16, borderWidth: 1, backgroundColor: IX.panel, padding: 14 },
  cardIcon: { fontSize: 24 },
  cardName: { color: IX.text, fontSize: 15, fontWeight: '800', marginTop: 6 },
  cardN: { color: IX.teal, fontFamily: IX.mono, fontSize: 12, marginTop: 2 },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  flag: { fontSize: 10, fontWeight: '800', borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  hint: { color: IX.dim, fontSize: 11.5, marginTop: 14, textAlign: 'center' },
});

// Inventario — Compras: la lista se arma SOLA con lo que se acabó o queda poco, más lo que anotes a mano. Cada cosa con
// cuánto comprar (lo de la última vez) y su costo estimado (lo que pagaste la última vez), cruzado con lo que te queda del
// tope de cada categoría en Finanzas. «✓ Lo compré» la saca de la lista y la suma a tu casa.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { IX, AREA_COLOR, clp } from '../ix';
import { Panel, Label, Btn, Empty } from '../parts';
import { AREA, fmtCant, quitarCompra, type AreaId } from '../../../services/inventory/inventoryCore';
import { financeStore } from '../../../services/finance/financeStore';
import { presupuestoAlDia, CAT_NOMBRE, type FinanceState } from '../../../services/finance/financeCore';
import type { TabProps } from '../types';

/** De qué categoría de Finanzas sale cada área (para cruzar la lista con el tope del mes). */
const CAT_DE: Record<AreaId, string> = { alimentos: 'alimentacion', despensa: 'alimentacion', bano: 'hogar', limpieza: 'hogar', botiquin: 'salud', ropa: 'otros', objetos: 'hogar', mascotas: 'otros' };

export default function Compras({ S, V, open, act }: TabProps) {
  const { lista } = V;
  const [fin, setFin] = useState<FinanceState | null>(financeStore.get());
  useEffect(() => { financeStore.load().then(setFin).catch(() => {}); return financeStore.subscribe(setFin); }, []);

  // Lo de la lista por categoría de Finanzas, contra lo que queda de su tope este mes
  const cruce = useMemo(() => {
    if (!fin) return [];
    const pres = presupuestoAlDia(fin, V.now).filter((l) => l.presup > 0);
    const porCat: Record<string, number> = {};
    for (const f of lista.auto) if (f.costo) porCat[CAT_DE[f.item.area]] = (porCat[CAT_DE[f.item.area]] || 0) + f.costo;
    return pres.filter((l) => porCat[l.cat]).map((l) => ({ cat: l.cat, lista: porCat[l.cat], queda: Math.round(l.queda) }));
  }, [fin, lista, V.now]);

  const total = lista.auto.length + lista.manual.length;
  const compartir = () => {
    const ls = [
      ...lista.auto.map((f) => `• ${f.item.nombre}${f.sugerida ? ` (${fmtCant(f.sugerida, f.item.unidad)})` : ''}`),
      ...lista.manual.map((c) => `• ${c.nombre}${c.cant ? ` (${fmtCant(c.cant, c.unidad ?? 'u')})` : ''}`),
    ];
    Share.share({ message: `🛒 Lista de compras\n${ls.join('\n')}${lista.total ? `\n\nEstimado: ~${clp(lista.total)}` : ''}` }).catch(() => {});
  };

  return (
    <View>
      <Panel glow={IX.tealDeep}>
        <Label info="lista_compras">LISTA DE COMPRAS</Label>
        {!total && <Empty icon="🛒" text="Nada por comprar: cuando algo se acabe o quede bajo su mínimo, aparece acá solo. También puedes anotar lo que quieras." />}
        {lista.auto.map((f) => (
          <View key={f.item.id} style={s.line}>
            <View style={[s.bar, { backgroundColor: AREA_COLOR[f.item.area] }]} />
            <TouchableOpacity style={{ flex: 1 }} onPress={() => open({ k: 'item', id: f.item.id })} accessibilityRole="button" accessibilityLabel={`${f.item.nombre}: ${f.estado === 'acabado' ? 'se acabó' : f.estado === 'pronto' ? `se acaba en ~${f.dias} días` : 'queda poco'}`}>
              <Text style={s.name} numberOfLines={1}>{AREA[f.item.area].icono} {f.item.nombre}</Text>
              <Text style={s.sub}>
                <Text style={{ color: f.estado === 'acabado' ? IX.red : IX.amber }}>{f.estado === 'acabado' ? 'Se acabó' : f.estado === 'pronto' ? `Se acaba en ~${f.dias} día${f.dias === 1 ? '' : 's'}` : 'Queda poco'}</Text>
                {f.sugerida ? ` · comprar ~${fmtCant(f.sugerida, f.item.unidad)}` : ''}{f.costo ? ` · ~${clp(f.costo)}` : ''}
              </Text>
            </TouchableOpacity>
            <Btn small ghost label="✓ Lo compré" color={IX.green} onPress={() => open({ k: 'agregar', preset: { nombre: f.item.nombre, area: f.item.area, cantidad: f.sugerida, unidad: f.item.unidad } })} />
          </View>
        ))}
        {lista.manual.map((c) => (
          <View key={`m${c.id}`} style={s.line}>
            <View style={[s.bar, { backgroundColor: c.area ? AREA_COLOR[c.area] : IX.dim }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{c.area ? `${AREA[c.area].icono} ` : ''}{c.nombre}</Text>
              <Text style={s.sub}>Anotado a mano{c.cant ? ` · ${fmtCant(c.cant, c.unidad ?? 'u')}` : ''}</Text>
            </View>
            <Btn small ghost label="✓ Lo compré" color={IX.green} onPress={() => open({ k: 'agregar', preset: { nombre: c.nombre, area: c.area ?? null, cantidad: c.cant ?? null, unidad: c.unidad ?? null, compraId: c.id } })} />
            <TouchableOpacity onPress={() => { void act((W) => quitarCompra(W, c.id)); }} style={s.x} accessibilityRole="button" accessibilityLabel={`Sacar ${c.nombre} de la lista`}><Text style={s.xText}>✕</Text></TouchableOpacity>
          </View>
        ))}
        {total > 0 && (
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Estimado</Text>
            <Text style={s.total}>{lista.total ? `~${clp(lista.total)}` : '—'}</Text>
          </View>
        )}
        {total > 0 && <Text style={s.hint}>{lista.sinPrecio ? `${lista.sinPrecio} sin precio conocido: agrégalo al comprar y la próxima vez lo estimo. ` : ''}Con lo que pagaste la última vez.</Text>}
        <View style={s.btns}>
          <Btn small label="+ Anotar algo" onPress={() => open({ k: 'lista_add' })} style={{ flex: 1 }} />
          {total > 0 && <Btn small ghost label="Compartir" color={IX.teal} onPress={compartir} style={{ flex: 1 }} />}
        </View>
      </Panel>

      {/* ─── Contra tu presupuesto de Finanzas ─── */}
      {cruce.length > 0 && (
        <Panel>
          <Label info="lista_vs_presupuesto">CONTRA TU PRESUPUESTO</Label>
          {cruce.map((c) => (
            <View key={c.cat} style={s.cruce}>
              <Text style={s.name}>{CAT_NOMBRE[c.cat] ?? c.cat}</Text>
              <Text style={[s.sub, { color: c.lista > c.queda ? IX.red : IX.green }]}>
                ~{clp(c.lista)} en la lista · te {c.queda >= 0 ? `quedan ${clp(c.queda)}` : `pasaste por ${clp(-c.queda)}`} del tope del mes{c.lista > c.queda ? ': no alcanza todo' : ''}
              </Text>
            </View>
          ))}
        </Panel>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderTopWidth: 1, borderTopColor: IX.lineSoft, paddingVertical: 4 },
  bar: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginVertical: 8 },
  name: { color: IX.text, fontSize: 14.5, fontWeight: '700' },
  sub: { color: IX.muted, fontSize: 12, marginTop: 2 },
  x: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  xText: { color: IX.dim, fontSize: 16 },
  totalRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: IX.line, marginTop: 6, paddingTop: 10 },
  totalLabel: { flex: 1, color: IX.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  total: { color: IX.text, fontFamily: IX.mono, fontSize: 20, fontWeight: '800' },
  hint: { color: IX.dim, fontSize: 11.5, marginTop: 4, lineHeight: 16 },
  btns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  cruce: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: IX.lineSoft },
});

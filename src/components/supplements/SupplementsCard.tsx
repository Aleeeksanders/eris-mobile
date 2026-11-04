// ============================================================
// Eris Mobile — «Suplementos de hoy» en Nutrición (fase I5, 2026-10-23)
//
// Lo que tomas hoy, con «Tomado» en un toque (y ↩ para deshacer). Sin rojos ni culpa: lo que ya pasó su hora va en ámbar.
// Tocar «Ver todo» abre la hoja con tus suplementos, sus fichas y la constancia de la semana.
// ============================================================

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { T, R, S } from '../../config/design';
import InfoTip from '../InfoTip';
import { supplementStore, supDia, type SupState } from '../../services/supplements/supplementStore';
import { estadoHoy, fmtDosis } from '../../services/supplements/supplementCore';

export const SUP = '#A78BFA';
export const SUP_GLOW = 'rgba(167,139,250,0.14)';

export function useSupplements(): SupState | null {
  const [st, setSt] = useState<SupState | null>(supplementStore.get());
  useEffect(() => {
    const off = supplementStore.subscribe(setSt);
    supplementStore.load().then(setSt).catch(() => {});
    return off;
  }, []);
  return st;
}

export const fmtHora = (h: number) => `${Math.floor(h)}:${h % 1 ? '30' : '00'}`;

export default function SupplementsCard({ onOpen }: { onOpen: (mode?: 'mios' | 'fichas' | 'nuevo') => void }) {
  const st = useSupplements();
  const [msg, setMsg] = useState<string | null>(null);
  if (!st) return null;
  const now = new Date();
  const est = estadoHoy(st, supDia(), now.getHours() + now.getMinutes() / 60);

  const tomar = async (id: string) => { const r = await supplementStore.tomar(id); setMsg(r.msg); };
  const deshacer = async (id: string) => { const r = await supplementStore.destomar(id); setMsg(r.msg); };

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>💊 Suplementos de hoy</Text>
        <InfoTip id="suplementos" size={16} color={T.textMuted} />
        <View style={s.flex} />
        <TouchableOpacity onPress={() => onOpen(est.length ? 'mios' : 'fichas')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.link}>{est.length ? 'Ver todo' : 'Fichas'}</Text>
        </TouchableOpacity>
      </View>
      {est.length === 0 ? (
        <TouchableOpacity style={s.empty} onPress={() => onOpen('nuevo')}>
          <Text style={s.emptyText}>+ Agrega lo que tomas (creatina, vitamina D, omega-3…) y anótalo en un toque.</Text>
        </TouchableOpacity>
      ) : (
        est.map((e) => {
          const listo = e.faltan === 0;
          return (
            <View key={e.sup.id} style={s.row}>
              <View style={s.flex}>
                <Text style={s.name} numberOfLines={1}>{e.sup.nombre}</Text>
                <Text style={[s.detail, e.atrasada && { color: T.gold }]}>
                  {fmtDosis(e.sup.cantidad, e.sup.unidad)}
                  {e.sup.tomasDia > 1 ? ` · ${e.tomadas} de ${e.sup.tomasDia}` : ''}
                  {!listo && e.proxima != null ? ` · ${e.atrasada ? 'era' : 'toca'} a las ${fmtHora(e.proxima)}` : ''}
                </Text>
              </View>
              {e.tomadas > 0 && (
                <TouchableOpacity onPress={() => deshacer(e.sup.id)} style={s.undo} accessibilityLabel={`Deshacer una toma de ${e.sup.nombre}`}>
                  <Text style={s.undoText}>↩</Text>
                </TouchableOpacity>
              )}
              {listo ? (
                <View style={s.done}><Text style={s.doneText}>✓ Listo</Text></View>
              ) : (
                <TouchableOpacity onPress={() => tomar(e.sup.id)} style={s.take} accessibilityLabel={`Tomé ${e.sup.nombre}`}>
                  <Text style={s.takeText}>Tomado</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}
      {!!msg && <Text style={s.msg}>{msg}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  card: { backgroundColor: T.bgCard, borderRadius: R.lg, padding: S.md, marginBottom: S.md, borderWidth: 1, borderColor: T.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  title: { color: T.text, fontSize: 14, fontWeight: '800' },
  link: { color: SUP, fontSize: 12, fontWeight: '700' },
  empty: { paddingVertical: 10 },
  emptyText: { color: T.textLight, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: T.border },
  name: { color: T.text, fontSize: 14, fontWeight: '600' },
  detail: { color: T.textLight, fontSize: 11, marginTop: 2 },
  take: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.full, backgroundColor: SUP_GLOW, borderWidth: 1, borderColor: SUP },
  takeText: { color: SUP, fontSize: 12, fontWeight: '800' },
  done: { paddingHorizontal: 12, paddingVertical: 8 },
  doneText: { color: T.green, fontSize: 12, fontWeight: '800' },
  undo: { paddingHorizontal: 8, paddingVertical: 6 },
  undoText: { color: T.textMuted, fontSize: 16, fontWeight: '700' },
  msg: { color: T.textMuted, fontSize: 11, marginTop: 6 },
});

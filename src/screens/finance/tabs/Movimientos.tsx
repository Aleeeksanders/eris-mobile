// Finanzas 2.0 — Movimientos: el libro del mes, por día, con filtros y búsqueda. Tocar uno abre su detalle.
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { FX, clp, catOf, MESES } from '../fx';
import { Panel, Chip, Empty } from '../parts';
import { estado, foldTxt, mesStr, type Tx } from '../../../services/finance/financeCore';
import type { TabProps } from '../types';

const FILTROS: Array<[string, string, (t: Tx) => boolean]> = [
  ['todo', 'Todo', () => true],
  ['gasto', 'Gastos', (t) => t.tipo === 'gasto'],
  ['entra', 'Entradas', (t) => t.tipo === 'ingreso' || t.tipo === 'abono' || t.tipo === 'cobro'],
  ['mov', 'Movimientos', (t) => t.tipo === 'giro' || t.tipo === 'transfer' || t.tipo === 'ajuste'],
  ['prestamo', 'Préstamos', (t) => t.tipo === 'prestamo' || t.tipo === 'cobro'],
  ['ahorro', 'Ahorro', (t) => t.tipo === 'ahorro'],
];

/** Cómo se ve cada movimiento: ícono, signo y color. */
export function txLook(t: Tx): { icon: string; sign: '+' | '−' | '⇄' | '±'; color: string } {
  if (t.tipo === 'gasto') return { icon: catOf(t.cat).icon, sign: '−', color: FX.text };
  if (t.tipo === 'ingreso' || t.tipo === 'abono' || t.tipo === 'cobro') return { icon: t.tipo === 'cobro' ? '🤝' : t.fuente === 'sueldo' ? '💼' : '⬇️', sign: '+', color: FX.up };
  if (t.tipo === 'prestamo') return { icon: '📋', sign: '−', color: FX.gold };
  if (t.tipo === 'ahorro') return { icon: '🪙', sign: '⇄', color: FX.violet };
  if (t.tipo === 'ajuste') return { icon: '✏️', sign: '±', color: FX.muted };
  return { icon: t.tipo === 'giro' ? '🏧' : '⇄', sign: '⇄', color: FX.cyan };
}

export default function Movimientos({ S, V, open }: TabProps) {
  const [mes, setMes] = useState(V.now.getMonth());
  const [ano, setAno] = useState(V.now.getFullYear());
  const [filtro, setFiltro] = useState('todo');
  const [q, setQ] = useState('');
  const E = useMemo(() => estado(S), [S]);
  const ms = mesStr(mes, ano);
  const nav = (d: number) => { let m = mes + d, a = ano; if (m < 0) { m = 11; a--; } if (m > 11) { m = 0; a++; } setMes(m); setAno(a); };

  const dias = useMemo(() => {
    const f = FILTROS.find((x) => x[0] === filtro)![2];
    const qq = foldTxt(q);
    const list = S.tx.filter((t) => String(t.fecha).startsWith(ms) && f(t) && (!qq || foldTxt(`${t.desc} ${catOf(t.cat).label}`).includes(qq)))
      .sort((a, b) => (a.fecha === b.fecha ? Number(b.id) - Number(a.id) : a.fecha < b.fecha ? 1 : -1));
    const g = new Map<string, Tx[]>();
    for (const t of list) { const l = g.get(t.fecha) ?? []; l.push(t); g.set(t.fecha, l); }
    return [...g.entries()];
  }, [S, ms, filtro, q]);

  const salio = S.tx.filter((t) => String(t.fecha).startsWith(ms) && t.tipo === 'gasto' && !(Number(t.cuotas) > 1)).reduce((a, t) => a + t.monto, 0);

  return (
    <View>
      <View style={s.monthBar}>
        <TouchableOpacity onPress={() => nav(-1)} style={s.navBtn} accessibilityLabel="Mes anterior"><Text style={s.navTxt}>‹</Text></TouchableOpacity>
        <Text style={s.monthTxt}>{MESES[mes].toUpperCase()} {ano}</Text>
        <TouchableOpacity onPress={() => nav(1)} style={s.navBtn} accessibilityLabel="Mes siguiente"><Text style={s.navTxt}>›</Text></TouchableOpacity>
      </View>
      <View style={[s.chips]}>{FILTROS.map(([id, label]) => <Chip key={id} label={label} on={filtro === id} onPress={() => setFiltro(id)} small />)}</View>
      <TextInput value={q} onChangeText={setQ} placeholder="Buscar (uber, super, arriendo…)" placeholderTextColor={FX.dim} style={s.search} />
      {filtro === 'todo' && !q && salio > 0 && <Text style={s.sum}>Gastos anotados en {MESES[mes]}: <Text style={{ fontFamily: FX.mono, color: FX.text }}>{clp(salio)}</Text> (las compras en cuotas se cuentan por cuota, en Análisis)</Text>}

      {!dias.length && <Empty icon="🧾" text={q ? 'Nada calza con esa búsqueda.' : 'No hay movimientos este mes.'} />}
      {dias.map(([fecha, list]) => (
        <View key={fecha}>
          <Text style={s.day}>{diaTitulo(fecha, V.now)}</Text>
          <Panel style={{ paddingVertical: 4 }}>
            {list.map((t, i) => {
              const L = txLook(t);
              const cuenta = t.desde != null ? E.nombre(t.desde) : t.hacia != null ? E.nombre(t.hacia) : null;
              const sub = [t.tipo === 'gasto' ? catOf(t.cat).label : TIPO_LABEL[t.tipo], cuenta, Number(t.cuotas) > 1 ? `${t.cuotas} cuotas` : null, t.via === 'eris' ? 'por chat' : null, t.via === 'boleta' ? '🧾 boleta' : null, t.via === 'banco' ? '🔔 aviso' : null, t.via === 'cartola' ? '📄 cartola' : null].filter(Boolean).join(' · ');
              return (
                <TouchableOpacity key={String(t.id)} style={[s.row, i > 0 && s.rowSep]} onPress={() => open({ k: 'tx', id: t.id })} accessibilityRole="button">
                  <Text style={s.icon}>{L.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.desc} numberOfLines={1}>{t.desc}</Text>
                    <Text style={s.sub} numberOfLines={1}>{sub}</Text>
                  </View>
                  <Text style={[s.amt, { color: L.color }]}>{L.sign === '+' || L.sign === '−' ? L.sign : ''}{clp(Math.abs(t.monto))}</Text>
                </TouchableOpacity>
              );
            })}
          </Panel>
        </View>
      ))}
    </View>
  );
}

export const TIPO_LABEL: Record<string, string> = { gasto: 'Gasto', ingreso: 'Ingreso', abono: 'Abono', giro: 'Giro', transfer: 'Transferencia', ajuste: 'Ajuste', prestamo: 'Préstamo', cobro: 'Cobro', ahorro: 'Ahorro' };

function diaTitulo(f: string, now: Date) {
  const [y, m, d] = f.split('-').map(Number);
  const dt = new Date(y, m - 1, d), hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((hoy.getTime() - dt.getTime()) / 86400000);
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return (diff === 0 ? 'HOY' : diff === 1 ? 'AYER' : `${dias[dt.getDay()]} ${d}`).toUpperCase();
}

const s = StyleSheet.create({
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn: { width: 44, height: 40, borderRadius: 10, borderWidth: 1, borderColor: FX.lineSoft, alignItems: 'center', justifyContent: 'center' },
  navTxt: { color: FX.violet, fontSize: 20, fontWeight: '800' },
  monthTxt: { color: FX.violet, fontFamily: FX.mono, fontSize: 14, letterSpacing: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  search: { backgroundColor: FX.panel, borderWidth: 1, borderColor: FX.lineSoft, borderRadius: 12, color: FX.text, paddingHorizontal: 14, minHeight: 44, marginBottom: 10 },
  sum: { color: FX.muted, fontSize: 12, marginBottom: 8 },
  day: { color: FX.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginBottom: 6, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54 },
  rowSep: { borderTopWidth: 1, borderTopColor: FX.lineSoft },
  icon: { fontSize: 18, width: 26, textAlign: 'center' },
  desc: { color: FX.text, fontSize: 14, fontWeight: '600' },
  sub: { color: FX.muted, fontSize: 11, marginTop: 2 },
  amt: { fontFamily: FX.mono, fontSize: 14, fontVariant: ['tabular-nums'] },
});

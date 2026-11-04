// Finanzas 2.0 — elegir una fecha o un día del mes sin escribir (2026-10-16, pedido del usuario: «que la fecha no sea
// texto y sea un calendario; aparte que ta feo, estorba»). Atajos arriba (Hoy, Ayer…) y, al tocar la fecha, el mes en
// cuadrícula para elegir el día. Sin dependencias nuevas: es una vista propia con la estética de Finanzas.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FX, MESES } from './fx';
import { Label, Chip } from './parts';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deIso = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DIA_NOMBRE = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
/** "jue 15 oct" (+ el año si no es este) */
export function fechaLarga(s: string, now: Date): string {
  const d = deIso(s);
  if (!d) return s;
  return `${DIA_NOMBRE[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

/**
 * Una fecha. `modo`: 'pasado' (lo que ya pasó: un gasto, un ahorro; no deja elegir días futuros) o 'futuro' (cuándo te
 * devuelven, para cuándo es una meta; no deja elegir días pasados). `opcional`: se puede dejar sin fecha.
 */
export function FechaCampo({ label = 'FECHA', value, onChange, now, modo = 'pasado', opcional, accent, atajosDias }: {
  label?: string; value: string; onChange: (v: string) => void; now: Date; modo?: 'pasado' | 'futuro'; opcional?: boolean;
  /** el color del módulo que lo usa (Inventario: verde azulado); sin él, el de Finanzas */
  accent?: string;
  /** atajos propios (días desde hoy): un vencimiento pide «en 3 días», no «fin de mes» */
  atajosDias?: Array<[string, number]>;
}) {
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sel = deIso(value);
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState(() => { const b = sel ?? hoy; return new Date(b.getFullYear(), b.getMonth(), 1); });
  // Si la fecha cambia desde afuera (un atajo, la boleta), el calendario muestra ese mes
  useEffect(() => { if (sel) setMes(new Date(sel.getFullYear(), sel.getMonth(), 1)); }, [value]);

  const atajos: Array<[string, string]> = atajosDias ? atajosDias.map(([l, d]) => [l, iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + d))])
    : modo === 'pasado'
    ? [['Hoy', iso(hoy)], ['Ayer', iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1))]]
    : [['En 1 semana', iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 7))], ['Fin de mes', iso(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0))]];

  const primerDia = (mes.getDay() + 6) % 7; // lunes = 0
  const diasMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celdas: Array<number | null> = [...Array(primerDia).fill(null), ...Array.from({ length: diasMes }, (_, i) => i + 1)];
  while (celdas.length % 7) celdas.push(null);
  const fuera = (d: Date) => (modo === 'pasado' ? d > hoy : d < hoy);
  const mesActual = mes.getFullYear() === hoy.getFullYear() && mes.getMonth() === hoy.getMonth();
  const puedeAtras = !(modo === 'futuro' && mesActual);
  const puedeAdelante = !(modo === 'pasado' && mesActual);
  const mover = (k: number) => setMes((m) => new Date(m.getFullYear(), m.getMonth() + k, 1));

  return (
    <View>
      <Label>{label}</Label>
      <View style={s.row}>
        {opcional && <Chip small label="Sin fecha" color={accent} on={!value} onPress={() => { onChange(''); setAbierto(false); }} />}
        {atajos.map(([l, v]) => <Chip key={l} small label={l} color={accent} on={value === v} onPress={() => { onChange(v); setAbierto(false); }} />)}
        <TouchableOpacity onPress={() => setAbierto((a) => !a)} style={[s.btn, accent ? { borderColor: accent + '66', backgroundColor: 'rgba(10,30,26,0.9)' } : null, abierto && (accent ? { borderColor: accent } : s.btnOn)]} accessibilityRole="button" accessibilityLabel={value ? `Fecha: ${fechaLarga(value, now)}. Cambiar` : 'Elegir fecha'}>
          <Text style={s.btnText}>📅 {value ? fechaLarga(value, now) : 'Elegir'}</Text>
        </TouchableOpacity>
      </View>
      {abierto && (
        <View style={s.cal}>
          <View style={s.calHead}>
            <TouchableOpacity onPress={() => puedeAtras && mover(-1)} disabled={!puedeAtras} style={[s.nav, !puedeAtras && { opacity: 0.25 }]} accessibilityLabel="Mes anterior"><Text style={[s.navText, accent ? { color: accent } : null]}>‹</Text></TouchableOpacity>
            <Text style={s.mes}>{MESES[mes.getMonth()]} {mes.getFullYear()}</Text>
            <TouchableOpacity onPress={() => puedeAdelante && mover(1)} disabled={!puedeAdelante} style={[s.nav, !puedeAdelante && { opacity: 0.25 }]} accessibilityLabel="Mes siguiente"><Text style={[s.navText, accent ? { color: accent } : null]}>›</Text></TouchableOpacity>
          </View>
          <View style={s.grid}>
            {DIAS_SEMANA.map((d, i) => <Text key={`h${i}`} style={s.dow}>{d}</Text>)}
            {celdas.map((n, i) => {
              if (n == null) return <View key={`v${i}`} style={s.cell} />;
              const d = new Date(mes.getFullYear(), mes.getMonth(), n);
              const esSel = !!sel && sel.getTime() === d.getTime(), esHoy = d.getTime() === hoy.getTime(), off = fuera(d);
              return (
                <TouchableOpacity key={`d${n}`} disabled={off} onPress={() => { onChange(iso(d)); setAbierto(false); }}
                  style={[s.cell, esHoy && s.hoy, esSel && (accent ? { backgroundColor: accent + 'cc', borderColor: accent } : s.sel)]} accessibilityRole="button" accessibilityLabel={fechaLarga(iso(d), now)} accessibilityState={{ selected: esSel, disabled: off }}>
                  <Text style={[s.num, off && s.off, esSel && s.numSel]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

/** Un día del mes (1–31) para lo que se repite: el día de pago, el día de un fijo. */
/**
 * Un día de cada mes (1–31). Con `ultHabil`, también «Último día hábil» (valor 'ult'): sin fines de semana ni feriados de
 * Chile (pedido del usuario, 2026-10-22: el sueldo llega el último día hábil).
 */
export function DiaCampo({ label, value, onChange, nota, ultHabil }: { label: string; value: string; onChange: (v: string) => void; nota?: string; ultHabil?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const ult = value === 'ult';
  const n = ult ? 0 : Number(value) || 0;
  return (
    <View>
      <Label>{label}</Label>
      <TouchableOpacity onPress={() => setAbierto((a) => !a)} style={[s.btn, { alignSelf: 'flex-start' }, abierto && s.btnOn]} accessibilityRole="button" accessibilityLabel={ult ? 'Último día hábil. Cambiar' : n ? `Día ${n}. Cambiar` : 'Elegir día'}>
        <Text style={s.btnText}>📅 {ult ? 'Último día hábil de cada mes' : n ? `Día ${n} de cada mes` : 'Elegir día'}</Text>
      </TouchableOpacity>
      {abierto && (
        <View style={s.cal}>
          {ultHabil && (
            <TouchableOpacity onPress={() => { onChange('ult'); setAbierto(false); }} style={[s.btn, { marginBottom: 10, alignSelf: 'stretch', alignItems: 'center' }, ult && s.btnOn]} accessibilityRole="button" accessibilityState={{ selected: ult }} accessibilityLabel="Último día hábil del mes">
              <Text style={s.btnText}>Último día hábil del mes</Text>
            </TouchableOpacity>
          )}
          <View style={s.grid}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <TouchableOpacity key={d} onPress={() => { onChange(String(d)); setAbierto(false); }} style={[s.cell, d === n && s.sel]} accessibilityRole="button" accessibilityLabel={`Día ${d}`} accessibilityState={{ selected: d === n }}>
                <Text style={[s.num, d === n && s.numSel]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.nota}>{nota ?? 'Si un mes tiene menos días (febrero), se usa el último.'}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  btn: { minHeight: 36, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(124,58,237,0.45)', backgroundColor: 'rgba(20,15,50,0.9)', paddingHorizontal: 14, justifyContent: 'center' },
  btnOn: { borderColor: FX.violet },
  btnText: { color: FX.text, fontSize: 13, fontWeight: '700' },
  cal: { marginTop: 10, borderWidth: 1, borderColor: FX.line, borderRadius: 14, padding: 10, backgroundColor: FX.panelHi },
  calHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  nav: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  navText: { color: FX.violet, fontSize: 24, fontWeight: '700', marginTop: -3 },
  mes: { flex: 1, textAlign: 'center', color: FX.text, fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dow: { width: `${100 / 7}%`, textAlign: 'center', color: FX.dim, fontSize: 11, fontWeight: '800', paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  hoy: { borderColor: FX.cyan + '88' },
  sel: { backgroundColor: FX.violetDeep, borderColor: FX.violetDeep },
  num: { color: FX.text, fontFamily: FX.mono, fontSize: 14, fontWeight: '600' },
  numSel: { color: '#fff', fontWeight: '900' },
  off: { color: FX.dim, opacity: 0.4 },
  nota: { color: FX.dim, fontSize: 11, marginTop: 6 },
});

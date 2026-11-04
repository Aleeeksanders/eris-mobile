// Finanzas 2.0 (F4) — importar la cartola de una cuenta: desde el + («Importar cartola») o desde la cuenta en Cuentas.
// Se lee en el PC, se concilia con lo anotado y lo que falta va a «Por confirmar» en Hoy (nada se anota solo).
import React, { useState } from 'react';
import { Text, StyleSheet, Alert } from 'react-native';
import { FX, clp, fechaCorta } from './fx';
import { Sheet, Field } from './parts';
import { elegirCartola, leerEnPC, propuestasDeCartola, conciliarCartola, saldoFinalCartola, type ArchivoCartola, type CartolaLeida } from '../../services/finance/cartola';
import { financeCuadre } from '../../services/finance/financeCuadre';
import { financeInbox } from '../../services/finance/financeInbox';
import type { FinanceState, Ref } from '../../services/finance/financeCore';

export function useCartolaImport(S: FinanceState | null) {
  const [leyendo, setLeyendo] = useState<Ref | null>(null);
  // PDF que pide clave: se pide acá y se vuelve a mandar el MISMO archivo (sin elegirlo de nuevo)
  const [conClave, setConClave] = useState<{ ref: Ref; nombre: string; archivo: ArchivoCartola; error?: string } | null>(null);
  const [clave, setClave] = useState('');

  const resultado = (ref: Ref, nombre: string, r: CartolaLeida) => {
    if (!S) return;
    // El saldo con que termina la cartola = lo que dice el banco a esa fecha (A2: el cuadre lo compara con lo anotado)
    const fin = saldoFinalCartola(r.movimientos);
    if (fin) void financeCuadre.registrarSaldo(ref, fin.saldo, Date.parse(`${fin.fecha}T23:59:00`), 'cartola').then(() => financeCuadre.revisar({ auto: false, avisar: false })).catch(() => {});
    const c = conciliarCartola(S, r.movimientos, { cuenta: ref });
    const props = propuestasDeCartola(S, c, ref);
    const total = props.reduce((a, p) => a + p.monto, 0);
    const rango = r.desde && r.hasta ? ` (${fechaCorta(r.desde)} → ${fechaCorta(r.hasta)})` : '';
    const ab = c.abonosFaltan, abTotal = ab.reduce((a, m) => a + m.monto, 0);
    const abonos = ab.length ? `\n\nTambién hay ${ab.length} abono${ab.length === 1 ? '' : 's'} que no tienes anotado${ab.length === 1 ? '' : 's'} (${clp(abTotal)}): si corresponde, anótalo${ab.length === 1 ? '' : 's'} con + → Me entró plata.` : '';
    const base = `${r.movimientos.length} movimientos${rango}. ${c.coinciden.length} ya estaban anotados.`;
    if (!props.length) { Alert.alert(`Cartola de ${nombre}`, `${base} No falta ningún gasto. ✓${abonos}`); return; }
    Alert.alert(`Cartola de ${nombre}`, `${base}\nFaltan ${props.length} gasto${props.length === 1 ? '' : 's'} por ${clp(total)}. ¿Los dejo en «Por confirmar» (en Hoy) para que los revises uno por uno?${abonos}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí', onPress: async () => { const n = await financeInbox.add(props); Alert.alert('Listo', n ? `${n} gasto${n === 1 ? '' : 's'} en «Por confirmar» (en Hoy).` : 'Ya estaban en «Por confirmar» o los habías descartado.'); } },
    ]);
  };
  const leer = async (ref: Ref, nombre: string, archivo: ArchivoCartola, pwd?: string) => {
    const r = await leerEnPC(archivo, pwd);
    if (!r.ok && r.pideClave) { setClave(''); setConClave({ ref, nombre, archivo, ...(pwd ? { error: r.msg } : {}) }); return; }
    setConClave(null); setClave('');
    if (!r.ok) { if (!r.cancelado) Alert.alert('Cartola', r.msg); return; }
    resultado(ref, nombre, r);
  };
  const importar = async (ref: Ref, nombre: string) => {
    if (leyendo != null) return;
    setLeyendo(ref);
    try {
      const a = await elegirCartola();
      if ('ok' in a) { if (!a.cancelado) Alert.alert('Cartola', a.msg); return; }
      await leer(ref, nombre, a);
    } finally { setLeyendo(null); }
  };

  const hojaClave = (
    <Sheet visible={!!conClave} title="CLAVE DEL PDF" saveLabel="Abrir" onClose={() => { setConClave(null); setClave(''); }}
      onSave={() => { if (conClave && clave) { const c = conClave; void leer(c.ref, c.nombre, c.archivo, clave); } }}>
      <Text style={s.meta}>La cartola de {conClave?.nombre} viene con clave. Muchos bancos usan parte de tu RUT (por ejemplo, los primeros 4 o 6 números, sin puntos ni dígito verificador).</Text>
      <Field label="CLAVE" value={clave} onChange={setClave} secure autoFocus placeholder="La clave del PDF" />
      {conClave?.error && <Text style={[s.meta, { color: FX.down }]}>{conClave.error}</Text>}
      <Text style={s.meta}>Se usa solo para abrir este archivo en el PC de Eris; no se guarda.</Text>
    </Sheet>
  );

  return { importar: (ref: Ref, nombre: string) => { void importar(ref, nombre); }, leyendo, hojaClave };
}

const s = StyleSheet.create({
  meta: { color: FX.muted, fontSize: 12, marginTop: 6, lineHeight: 17 },
});

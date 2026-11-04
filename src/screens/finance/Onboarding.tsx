// Finanzas 2.0 — primer uso (quien nunca configuró Finanzas): lo mínimo para que el tablero tenga sentido desde el día uno.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { FX, clp } from './fx';
import { Panel, Field, Btn, Label } from './parts';
import { onboarding, formSueldo, draft } from '../../services/finance/financeCore';
import { financeStore } from '../../services/finance/financeStore';

export default function FinanceOnboarding({ onDone }: { onDone: () => void }) {
  const [sueldo, setSueldo] = useState('');
  const [dia, setDia] = useState('');
  const [ahorro, setAhorro] = useState('');
  const [comida, setComida] = useState('');
  const [busy, setBusy] = useState(false);

  const empezar = async () => {
    setBusy(true);
    const ctx = financeStore.ctx();
    let S = onboarding({ sueldo: Number(sueldo) || 0, ahorro: Number(ahorro) || 0, presup: Number(comida) > 0 ? { alimentacion: Number(comida) } : {} }, ctx);
    if (Number(sueldo) > 0 && Number(dia) > 0) { const W = draft(S); if (formSueldo(W, { monto: Number(sueldo), dia: Number(dia) }, ctx).ok) S = W; }
    await financeStore.replace(S);
    setBusy(false);
    onDone();
  };

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Text style={s.kicker}>ERIS · FINANZAS</Text>
      <Text style={s.title}>Tu terminal de plata</Text>
      <Text style={s.sub}>Cuánto puedes gastar hasta el sueldo, a qué ritmo vas, qué viene y cómo crece lo tuyo. Todo calculado por código, cifrado en tu PC y sin darle tu clave del banco a nadie.</Text>
      <Panel>
        <Field label="SUELDO LÍQUIDO (LO QUE TE LLEGA AL MES)" value={sueldo} onChange={setSueldo} numeric big placeholder="0" />
        <View style={{ height: 10 }} />
        <Field label="DÍA DE PAGO (OPCIONAL)" value={dia} onChange={setDia} numeric placeholder="30" />
        <Text style={s.hint}>Con el día de pago te pregunto «¿llegó?» cada mes y sé cuánto te queda hasta el próximo.</Text>
      </Panel>
      <Panel>
        <Field label="LO QUE TIENES AHORRADO HOY (OPCIONAL)" value={ahorro} onChange={setAhorro} numeric placeholder="0" />
        <View style={{ height: 10 }} />
        <Field label="TOPE PARA COMIDA AL MES (OPCIONAL)" value={comida} onChange={setComida} numeric placeholder="0" />
        <Text style={s.hint}>Después agregas tus cuentas y tarjetas en Cuentas, y tus fijos en Plan.</Text>
      </Panel>
      <Btn label={busy ? 'Armando…' : 'Empezar'} onPress={empezar} disabled={busy} />
      {Number(sueldo) > 0 && <Text style={[s.hint, { textAlign: 'center', marginTop: 10 }]}>{clp(Number(sueldo))} al mes{Number(dia) > 0 ? `, el día ${dia}` : ''}</Text>}
      <Label> </Label>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 20, paddingBottom: 80 },
  kicker: { color: FX.violet, fontFamily: FX.mono, fontSize: 11, letterSpacing: 2, marginTop: 10 },
  title: { color: FX.text, fontSize: 28, fontWeight: '900', marginTop: 6 },
  sub: { color: FX.muted, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  hint: { color: FX.dim, fontSize: 12, marginTop: 6, lineHeight: 17 },
});

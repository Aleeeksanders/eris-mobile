// Finanzas 2.0 — las hojas que ordenan «dónde se hace cada cosa» (2026-10-16, pedido del usuario: «más claro, simple en
// identificar dónde hacer cada cosa, y una guía de cómo usarlo»):
//   - el + (MenuSheet): TODO lo que se anota parte acá;
//   - importar la cartola (CartolaSheet): elegir la cuenta;
//   - ¿Cómo hago…? (GuiaSheet): cada tarea, dónde está y un botón para hacerla;
//   - Ajustes (AjustesSheet): avisos del banco, respaldo, el recorrido y empezar de cero.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { FX, TIPO_CUENTA } from './fx';
import { Sheet, Btn, Label } from './parts';
import { BankSetupPanel } from './Inbox';
import { estado, emptyState, CASH_DEF, type FinanceState, type Ref } from '../../services/finance/financeCore';
import type { SheetState, Seccion, Act } from './types';

type Open = (s: SheetState) => void;

function Opcion({ icon, titulo, sub, onPress }: { icon: string; titulo: string; sub?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.opt} onPress={onPress} accessibilityRole="button" accessibilityLabel={titulo}>
      <Text style={s.optIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.optTitle}>{titulo}</Text>
        {!!sub && <Text style={s.optSub}>{sub}</Text>}
      </View>
      <Text style={s.go}>›</Text>
    </TouchableOpacity>
  );
}

/** El +: todo lo que se anota, en grupos claros */
export function MenuSheet({ onClose, open }: { onClose: () => void; open: Open }) {
  return (
    <Sheet visible title="¿QUÉ QUIERES ANOTAR?" onClose={onClose}>
      <Label>GASTÉ</Label>
      <Opcion icon="💸" titulo="Un gasto" sub="Lo que pagaste o compraste" onPress={() => open({ k: 'gasto' })} />
      <Opcion icon="📷" titulo="Foto de la boleta" sub="Todos los productos de una vez, por categoría" onPress={() => open({ k: 'gasto', foto: true })} />
      <Label>ME ENTRÓ</Label>
      <Opcion icon="💰" titulo="Me entró plata" sub="Sueldo, un pago, una transferencia que te hicieron" onPress={() => open({ k: 'entrada' })} />
      <Label>MOVÍ PLATA</Label>
      <Opcion icon="⇄" titulo="Transferir entre mis cuentas" onPress={() => open({ k: 'mov', tipo: 'transfer' })} />
      <Opcion icon="🏧" titulo="Sacar efectivo" onPress={() => open({ k: 'mov', tipo: 'giro' })} />
      <Opcion icon="💳" titulo="Pagar la tarjeta" onPress={() => open({ k: 'mov', tipo: 'pago' })} />
      <Opcion icon="🪙" titulo="Ahorrar" sub="Va a tu cuenta de ahorro y suma a tus metas" onPress={() => open({ k: 'ahorro' })} />
      <Opcion icon="🤝" titulo="Le presté a alguien" sub="Queda en Cuentas → Te deben" onPress={() => open({ k: 'prestamo' })} />
      <Label>DE MI BANCO</Label>
      <Opcion icon="📄" titulo="Importar la cartola" sub="Excel, CSV o PDF: solo te propone lo que falta" onPress={() => open({ k: 'cartola' })} />
      <Text style={s.hint}>También se lo puedes decir a Eris en el chat: «gasté 5 lucas en almuerzo con la BCI».</Text>
    </Sheet>
  );
}

/** Importar la cartola: ¿de qué cuenta? */
export function CartolaSheet({ S, onClose, irA, importarCartola }: { S: FinanceState; onClose: () => void; irA: (s: Seccion) => void; importarCartola: (ref: Ref, nombre: string) => void }) {
  const cuentas = estado(S).cuentas.filter((c) => c.tipo !== 'efectivo');
  return (
    <Sheet visible title="IMPORTAR LA CARTOLA" onClose={onClose}>
      <Text style={s.body}>Descarga la cartola desde tu banco (Excel, CSV o PDF) y elige de qué cuenta es. La leo en el PC de Eris sin guardarla, la comparo con lo que ya anotaste y lo que falta queda en «Por confirmar», en Hoy.</Text>
      {cuentas.map((c) => (
        <Opcion key={String(c.id)} icon={(TIPO_CUENTA[c.tipo] ?? TIPO_CUENTA.debito).icon} titulo={c.nombre} sub={(TIPO_CUENTA[c.tipo] ?? TIPO_CUENTA.debito).label}
          onPress={() => { onClose(); importarCartola(c.id, c.nombre); }} />
      ))}
      {!cuentas.length && (
        <>
          <Text style={s.body}>Primero agrega la cuenta o tarjeta en Cuentas.</Text>
          <Btn small ghost label="Ir a Cuentas" color={FX.violet} onPress={() => { onClose(); irA('cuentas'); }} style={{ alignSelf: 'flex-start' }} />
        </>
      )}
    </Sheet>
  );
}

/** ¿Cómo hago…? — cada tarea: dónde está y un botón para hacerla ahora */
export function GuiaSheet({ onClose, open, irA, onTour }: { onClose: () => void; open: Open; irA: (s: Seccion) => void; onTour: () => void }) {
  const ir = (sec: Seccion) => () => { onClose(); irA(sec); };
  const items: Array<{ q: string; a: string; label?: string; run?: () => void }> = [
    { q: 'Anotar un gasto', a: 'Botón + → Un gasto. O dile a Eris: «gasté 5 lucas en almuerzo».', label: 'Anotar', run: () => open({ k: 'gasto' }) },
    { q: 'Anotar una boleta entera', a: '+ → Foto de la boleta. Revisas las categorías y anotas todo de una vez.', label: 'Sacar foto', run: () => open({ k: 'gasto', foto: true }) },
    { q: 'Me llegó el sueldo', a: 'En su día aparece en Hoy «¿Llegó tu sueldo?»: tocas ✓ Llegó. Se configura una vez en Plan → Tu sueldo.', label: 'Configurar sueldo', run: () => open({ k: 'sueldo' }) },
    { q: 'Mi sueldo llega el último día hábil', a: 'Plan → Tu sueldo → Día de pago → «Último día hábil del mes». Cuenta los fines de semana y los feriados de Chile.', label: 'Configurar sueldo', run: () => open({ k: 'sueldo' }) },
    { q: 'Un descuento por planilla', a: 'Plan → + Gasto fijo → «Viene descontado del sueldo». No pasa por tus cuentas: se anota cuando confirmas que llegó el sueldo.', label: 'Agregar', run: () => open({ k: 'prog', tipo: 'gasto' }) },
    { q: 'Me entró otra plata', a: '+ → Me entró plata (un pago, una venta, una transferencia que te hicieron).', label: 'Anotar', run: () => open({ k: 'entrada' }) },
    { q: 'Pagar la tarjeta de crédito', a: '+ → Pagar la tarjeta. Baja la deuda y sale de la cuenta que elijas.', label: 'Pagar', run: () => open({ k: 'mov', tipo: 'pago' }) },
    { q: 'Mover plata o sacar efectivo', a: '+ → Transferir entre mis cuentas, o Sacar efectivo.', label: 'Transferir', run: () => open({ k: 'mov', tipo: 'transfer' }) },
    { q: 'Ahorrar para algo', a: 'Plan → Metas de ahorro para ponerte una meta; + → Ahorrar cada vez que apartes plata.', label: 'Ver metas', run: ir('plan') },
    { q: 'Prestar plata', a: '+ → Le presté a alguien. Cuando te pague: Cuentas → Te deben → Me pagó.', label: 'Anotar', run: () => open({ k: 'prestamo' }) },
    { q: 'Gastos que se repiten', a: 'Plan → Lo que se repite cada mes → + Gasto fijo (arriendo, Netflix, el celular). Se anotan solos en su día.', label: 'Ir a Plan', run: ir('plan') },
    { q: 'Ponerle tope a una categoría', a: 'Plan → Topes por categoría: tocas una y pones el monto del mes. Te digo cada día si vas bien.', label: 'Ir a Plan', run: ir('plan') },
    { q: 'Agregar una cuenta o tarjeta', a: 'Cuentas → + Agregar cuenta o tarjeta. Solo cuenta la plata que está en tus cuentas.', label: 'Agregar', run: () => open({ k: 'cuenta' }) },
    { q: 'Tengo plata en efectivo', a: 'Cuentas → 💵 Tengo efectivo: cuentas lo que hay en tu billetera. Desde ahí lo pagado en efectivo sale de ahí.', label: 'Agregar efectivo', run: () => open({ k: 'efectivo' }) },
    { q: 'Algo quedó «Por ordenar»', a: 'Es lo que se anotó sin cuenta: no está en tu plata. Cuentas → Por ordenar → tócalo y elige de qué cuenta salió, o bórralo si no era plata real.', label: 'Ir a Cuentas', run: ir('cuentas') },
    { q: 'Importar la cartola del banco', a: '+ → Importar la cartola, eliges la cuenta y el archivo. Solo te propone lo que falta.', label: 'Importar', run: () => open({ k: 'cartola' }) },
    { q: 'Que lea los avisos de mi banco', a: '⚙ Ajustes → Avisos del banco. Cada compra que te avise el banco queda lista para confirmar en Hoy.', label: 'Abrir Ajustes', run: () => open({ k: 'ajustes' }) },
    { q: 'Corregir o borrar algo', a: 'Movimientos → tócalo → Eliminar, y lo anotas de nuevo. Para un saldo que no calza: Cuentas → ⋯ → Corregir saldo.', label: 'Ir a Movimientos', run: ir('movs') },
    { q: '¿Me alcanza para algo?', a: 'Pregúntale a Eris: «¿y si me compro unas zapatillas de 60 lucas?». Te dice cómo quedarías, sin anotar nada.' },
    { q: '¿Qué es el rating?', a: 'Una nota de AAA a CCC sobre cómo manejas la plata (ahorro, colchón, deuda, topes), no sobre cuánto ganas. Está en Análisis, con lo que más lo sube.', label: 'Ver Análisis', run: ir('analisis') },
  ];
  return (
    <Sheet visible title="¿CÓMO HAGO…?" onClose={onClose}>
      <View style={s.mapa}>
        <Text style={s.mapaRow}><Text style={s.mapaKey}>🏠 Hoy</Text>  cuánto puedes gastar, lo que llega y lo que viene</Text>
        <Text style={s.mapaRow}><Text style={s.mapaKey}>↕ Movimientos</Text>  todo lo anotado, por mes</Text>
        <Text style={s.mapaRow}><Text style={s.mapaKey}>🏦 Cuentas</Text>  dónde está tu plata y lo que te deben</Text>
        <Text style={s.mapaRow}><Text style={s.mapaKey}>🎯 Plan</Text>  sueldo, fijos, topes y metas</Text>
        <Text style={s.mapaRow}><Text style={s.mapaKey}>📊 Análisis</Text>  tu ritmo, categorías, rating y 6 meses</Text>
        <Text style={s.mapaRow}><Text style={s.mapaKey}>＋</Text>  todo lo que anotas parte acá</Text>
      </View>
      {items.map((it) => (
        <View key={it.q} style={s.item}>
          <View style={{ flex: 1 }}>
            <Text style={s.q}>{it.q}</Text>
            <Text style={s.a}>{it.a}</Text>
          </View>
          {it.run && <Btn small ghost label={it.label ?? 'Ir'} color={FX.violet} onPress={it.run} />}
        </View>
      ))}
      <Btn small label="▶ Ver el recorrido de nuevo" color={FX.violetDeep} onPress={() => { onClose(); onTour(); }} style={{ alignSelf: 'flex-start' }} />
    </Sheet>
  );
}

/** Ajustes: lo que se configura una vez */
export function AjustesSheet({ onClose, act, onTour }: { onClose: () => void; act: Act; onTour: () => void }) {
  return (
    <Sheet visible title="AJUSTES DE FINANZAS" onClose={onClose}>
      <BankSetupPanel />
      <View style={s.block}>
        <Label>RESPALDO</Label>
        <Text style={s.body}>Tus finanzas se respaldan cifradas en el PC de Eris cada vez que cambian. Para restaurar una copia: Perfil → Respaldo de Finanzas.</Text>
      </View>
      <View style={s.block}>
        <Label>AYUDA</Label>
        <Btn small ghost label="▶ Ver el recorrido de nuevo" color={FX.violet} onPress={() => { onClose(); onTour(); }} style={{ alignSelf: 'flex-start' }} />
      </View>
      <View style={s.block}>
        <Label>EMPEZAR DE CERO</Label>
        <Btn small ghost label="Borrar todo" color={FX.down} style={{ alignSelf: 'flex-start' }}
          onPress={() => Alert.alert('Empezar de cero', 'Se borran tus cuentas, movimientos, fijos, metas y topes de este teléfono. La copia del PC de hoy queda como estaba hasta el próximo cambio.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Borrar todo', style: 'destructive', onPress: () => { onClose(); void act((W) => { const e = emptyState(); Object.assign(W, e, { cuentas: [{ ...CASH_DEF }], setupDone: true, sueldo: W.sueldo.slice(-1), extra: W.extra }); return { ok: true, msg: 'Listo: Finanzas quedó en cero' }; }); } },
          ])} />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: FX.lineSoft, backgroundColor: FX.panelHi },
  optIcon: { fontSize: 20, width: 30, textAlign: 'center', color: FX.text },
  optTitle: { color: FX.text, fontSize: 15, fontWeight: '700' },
  optSub: { color: FX.muted, fontSize: 12, marginTop: 2 },
  go: { color: FX.dim, fontSize: 22 },
  hint: { color: FX.dim, fontSize: 12, lineHeight: 17 },
  body: { color: FX.muted, fontSize: 13, lineHeight: 19 },
  mapa: { borderWidth: 1, borderColor: FX.line, borderRadius: 12, padding: 12, gap: 6, backgroundColor: FX.panelHi },
  mapaRow: { color: FX.muted, fontSize: 12, lineHeight: 17 },
  mapaKey: { color: FX.text, fontWeight: '800' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: FX.lineSoft, paddingTop: 10 },
  q: { color: FX.text, fontSize: 14, fontWeight: '700' },
  a: { color: FX.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  block: { gap: 6 },
});

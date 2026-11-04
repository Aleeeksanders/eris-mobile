// Eris administra (A2) — «¿Calza con tu banco?»: en Hoy, cada cuenta con lo último que dijo el banco («✓ Calza» o «No calza
// por $X → Cuadrar») y lo que no calza aunque no haya saldo (una cuenta en negativo, una transferencia a medias, el sueldo
// atrasado). La hoja «Cuadrar» pide el saldo del banco (a mano o de una captura de su app, leída en el PC), muestra por qué
// no calza y lo arregla con un toque; el ajuste al saldo del banco, solo si la persona lo pide.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert, DeviceEventEmitter, ActivityIndicator } from 'react-native';
import { File } from 'expo-file-system';
import { FX, clp } from './fx';
import { Panel, Label, Btn, Chip, Sheet, Field, AccountPicker, type CuentaOpt } from './parts';
import { financeCuadre, FINANCE_CUADRE_CHANGED } from '../../services/finance/financeCuadre';
import { INBOX_CHANGED_EVENT } from '../../services/finance/financeInbox';
import { useFeature } from '../../config/features';
import type { Cuadre, CuadreCuenta, Explicacion, FinanceState, Ref } from '../../services/finance/financeCore';
import type { SheetState, Act } from './types';

/** El cuadre de ahora (con «Por confirmar») y lo que Eris arregló sola; se recalcula cuando cambia algo. */
export function useCuadre(S: FinanceState | null) {
  const [C, setC] = useState<Cuadre | null>(null);
  const [arreglados, setArreglados] = useState<Array<{ id: string; texto: string }>>([]);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      financeCuadre.calcular().then((x) => { if (alive) setC(x); }).catch(() => {});
      financeCuadre.arreglados().then((x) => { if (alive) setArreglados(x); }).catch(() => {});
    };
    refresh();
    const a = DeviceEventEmitter.addListener(INBOX_CHANGED_EVENT, refresh);
    const b = DeviceEventEmitter.addListener(FINANCE_CUADRE_CHANGED, refresh);
    return () => { alive = false; a.remove(); b.remove(); };
  }, [S]);
  return { C, arreglados };
}

const FUENTE: Record<string, string> = { aviso: 'del aviso', chat: 'por chat', captura: 'de la captura', cartola: 'de la cartola', manual: 'que pusiste' };
export function hace(at: number) {
  const min = Math.max(0, Math.round((Date.now() - at) / 60_000));
  return min < 2 ? 'recién' : min < 60 ? `hace ${min} min` : min < 48 * 60 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} días`;
}

/** Hoy → «⚖ CUADRE CON TU BANCO» */
export function CuadrePanel({ S, open }: { S: FinanceState; open: (s: SheetState) => void }) {
  const on = useFeature('finanzasAuto');
  const { C, arreglados } = useCuadre(S);
  if (!on || !C || !C.cuentas.length) return null;
  const conDato = C.cuentas.filter((c) => c.banco);
  return (
    <Panel>
      <Label color={FX.gold}>⚖ CUADRE CON TU BANCO</Label>
      {conDato.map((c) => (
        <View key={String(c.ref)} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.nombre} numberOfLines={1}>{c.nombre}</Text>
            <Text style={[s.meta, c.estado === 'no_calza' && { color: FX.gold }]} numberOfLines={2}>
              {c.estado === 'calza' ? `✓ Calza con el banco · ${hace(c.banco!.at)}` : `No calza por ${clp(Math.abs(c.diff))} · ${hace(c.banco!.at)}${c.explicaciones[0] ? `: ${c.explicaciones[0].texto}` : ''}`}
            </Text>
          </View>
          <Btn small ghost={c.estado === 'calza'} label={c.estado === 'calza' ? 'Revisar' : 'Cuadrar'} color={c.estado === 'calza' ? FX.muted : FX.gold} onPress={() => open({ k: 'cuadrar', ref: c.ref })} />
        </View>
      ))}
      {C.alertas.map((a) => (
        <View key={a.id} style={s.row}>
          <Text style={[s.meta, { flex: 1, color: FX.gold }]}>{a.tipo === 'negativo' ? '⚠ ' : a.tipo === 'sueldo' ? '💼 ' : '⇄ '}{a.texto}.</Text>
          {a.tipo === 'negativo' && a.ref != null && <Btn small ghost label="Cuadrar" color={FX.gold} onPress={() => open({ k: 'cuadrar', ref: a.ref! })} />}
        </View>
      ))}
      {arreglados.slice(0, 3).map((x) => (
        <View key={x.id} style={s.row}>
          <Text style={[s.meta, { flex: 1 }]}>🤖 Arreglé: {x.texto}</Text>
          <Btn small ghost label="↶" color={FX.muted} onPress={() => { financeCuadre.deshacer(x.id).catch(() => {}); }} />
        </View>
      ))}
      {!conDato.length && (
        <View style={s.row}>
          <Text style={[s.meta, { flex: 1 }]}>¿Calza lo anotado con tu banco? Dime cuánto dice de una cuenta (o sube una captura) y lo reviso.</Text>
          <Btn small label="Cuadrar" color={FX.violetDeep} onPress={() => open({ k: 'cuadrar', ref: null })} />
        </View>
      )}
      {conDato.length > 0 && <Text style={s.hint}>Comparo lo que dice tu banco con lo anotado a esa hora. Si no calza, busco por qué.</Text>}
    </Panel>
  );
}

const BOTON: Record<string, string> = { anotar_avisos: 'Anotar', borrar: 'Quitar el repetido', mover: 'Cambiar de cuenta', fijo: 'Anotarlo', sueldo: 'Confirmar', gasto: 'Anotarlo' };

/** La hoja «Cuadrar»: el saldo del banco, la comparación y por qué no calza. */
export function CuadrarSheet({ ref0, S, act: _act, onClose, open, importarCartola, opts }: {
  ref0: Ref | null; S: FinanceState; act: Act; onClose: () => void; open: (s: SheetState) => void;
  importarCartola: (ref: Ref, nombre: string) => void; opts: (f: 'sinCredito') => CuentaOpt[];
}) {
  const { C } = useCuadre(S);
  const cuentas = useMemo(() => opts('sinCredito'), [opts]);
  const [ref, setRef] = useState<Ref | null>(ref0);
  const [monto, setMonto] = useState('');
  const [fuente, setFuente] = useState<'manual' | 'captura'>('manual');
  const [leyendo, setLeyendo] = useState(false);
  const [saldos, setSaldos] = useState<Array<{ etiqueta: string; monto: number }>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  // Sin cuenta elegida: la primera que no calza, si no la primera
  useEffect(() => {
    if (ref != null || !C) return;
    const r = C.cuentas.find((c) => c.estado === 'no_calza')?.ref ?? cuentas[0]?.ref ?? null;
    if (r != null) setRef(r);
  }, [C, ref, cuentas]);
  const c: CuadreCuenta | undefined = C?.cuentas.find((x) => x.ref === ref);
  const hecho = (r: { ok: boolean; msg: string } | null) => { setMsg(r ? (r.ok ? `✓ ${r.msg}` : r.msg) : null); };

  const guardar = async () => {
    const n = Math.round(Number(String(monto).replace(/[^\d-]/g, '')));
    if (ref == null || !monto.trim() || !Number.isFinite(n)) { setMsg('Pon el saldo que dice tu banco'); return; }
    const r = await financeCuadre.registrarSaldo(ref, n, Date.now(), fuente);
    setMonto(''); setSaldos([]); setFuente('manual');
    hecho(r);
  };
  const captura = async () => {
    setMsg(null);
    let f: { base64(): Promise<string>; size?: number | null } | null = null;
    try { const r: any = await File.pickFileAsync(undefined, 'image/*'); f = Array.isArray(r) ? r[0] ?? null : r; } catch { return; }
    if (!f) return;
    if ((f.size ?? 0) > 8_000_000) { setMsg('La imagen es muy pesada'); return; }
    setLeyendo(true);
    try {
      const r = await financeCuadre.leerCaptura(await f.base64());
      if (!r.ok) { setMsg(r.msg); return; }
      if (!r.saldos.length) { setMsg('No encontré un saldo en la captura: escríbelo tú'); return; }
      setSaldos(r.saldos);
      setMonto(String(r.saldos[0].monto));
      setFuente('captura');
      // Si la captura muestra los 4 dígitos de una de tus cuentas, esa
      const porDigitos = cuentas.filter((o) => r.last4.some((d) => o.nombre.includes(d)));
      if (porDigitos.length === 1) setRef(porDigitos[0].ref);
    } catch { setMsg('No pude leer la captura'); } finally { setLeyendo(false); }
  };
  const arreglar = async (ex: Explicacion, a?: Ref | null) => { if (ref != null) hecho(await financeCuadre.arreglar(ref, ex.id, a !== undefined ? { a } : {})); };
  const ajustar = () => {
    if (!c || ref == null) return;
    Alert.alert('Ajustar al saldo del banco', `Anoto un ajuste de ${c.diff > 0 ? '−' : '+'}${clp(Math.abs(c.diff))} («Diferencia con el banco») para que ${c.nombre} quede igual que el banco. Úsalo si no encuentras qué falta.`, [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Ajustar', onPress: () => { void financeCuadre.ajustar(ref).then(hecho); } },
    ]);
  };

  return (
    <Sheet visible title="CUADRAR CON EL BANCO" onClose={onClose} saveLabel={monto.trim() ? 'Guardar saldo' : 'Listo'} onSave={() => { if (monto.trim()) void guardar(); else onClose(); }}>
      <AccountPicker label="CUENTA" options={cuentas} value={ref} onChange={(r) => { setRef(r); setMsg(null); }} />
      {c?.banco ? (
        <View style={s.box}>
          <View style={s.cmp}>
            <View style={{ flex: 1 }}><Text style={s.k}>TU BANCO DIJO</Text><Text style={s.v}>{clp(c.bancoNeto ?? c.banco.saldo)}</Text><Text style={s.meta}>{FUENTE[c.banco.fuente] ?? ''} · {hace(c.banco.at)}{c.bancoNeto != null && c.bancoNeto !== c.banco.saldo ? ` · sin la línea de crédito` : ''}</Text></View>
            <View style={{ flex: 1 }}><Text style={s.k}>YO LLEVABA</Text><Text style={s.v}>{clp(c.libro ?? 0)}</Text><Text style={s.meta}>a esa hora</Text></View>
          </View>
          {c.estado === 'calza'
            ? <Text style={[s.estado, { color: FX.up }]}>✓ Calza</Text>
            : <Text style={[s.estado, { color: FX.gold }]}>No calza por {clp(Math.abs(c.diff))}: {c.diff > 0 ? 'en lo anotado tienes más que en el banco (falta anotar algo que salió, o sobra algo que entró).' : 'en lo anotado tienes menos que en el banco (falta anotar algo que entró, o sobra un gasto).'}</Text>}
        </View>
      ) : ref != null ? <Text style={s.meta}>Todavía no sé cuánto dice tu banco de esta cuenta.</Text> : null}

      {c?.estado === 'no_calza' && (
        <View style={{ gap: 8 }}>
          <Label>{c.explicaciones.length ? 'CREO QUE ES' : 'NO ENCUENTRO POR QUÉ'}</Label>
          {c.explicaciones.map((ex) => (
            <View key={ex.id} style={s.ex}>
              <Text style={s.exT}>{ex.exacta ? '● ' : '○ '}{ex.texto}.</Text>
              {ex.accion?.tipo === 'mover' && ex.accion.a == null
                ? <AccountPicker label="¿CON QUÉ CUENTA FUE?" options={cuentas.filter((o) => o.ref !== ref)} value={null} onChange={(r) => { if (r != null) void arreglar(ex, r); }} />
                : ex.accion ? <Btn small label={BOTON[ex.accion.tipo] ?? 'Arreglar'} color={FX.violetDeep} onPress={() => { void arreglar(ex); }} style={{ alignSelf: 'flex-start' }} /> : null}
            </View>
          ))}
          <Label>{c.explicaciones.length ? 'SI NO ES NADA DE ESO' : 'QUÉ HAGO'}</Label>
          <View style={s.chips}>
            <Btn small ghost label="📄 Revisar con la cartola" color={FX.cyan} onPress={() => { onClose(); importarCartola(c.ref, c.nombre); }} />
            {c.diff > 0 && <Btn small ghost label="Fue un gasto que no recuerdo" color={FX.muted} onPress={() => { void financeCuadre.gastoOlvidado(c.ref).then(hecho); }} />}
            {c.diff < 0 && c.banco?.fuente !== 'cartola' && <Btn small ghost label={`Mi saldo incluye la línea de crédito (${clp(Math.abs(c.diff))})`} color={FX.muted} onPress={() => { void financeCuadre.registrarLinea(c.ref, Math.abs(c.diff)).then(hecho); }} />}
            <Btn small ghost label="Ajustar al saldo del banco" color={FX.gold} onPress={ajustar} />
          </View>
        </View>
      )}
      {msg && <Text style={[s.meta, { color: msg.startsWith('✓') ? FX.up : FX.gold }]}>{msg}</Text>}

      <View style={{ gap: 8 }}>
        <Field label={c?.banco ? '¿CUÁNTO DICE AHORA?' : '¿CUÁNTO DICE TU BANCO?'} value={monto} onChange={(v) => { setMonto(v); setFuente('manual'); }} numeric placeholder="El saldo de la cuenta, sin la línea de crédito" />
        <View style={s.chips}>
          {leyendo ? <ActivityIndicator color={FX.cyan} /> : <Btn small ghost label="📷 Desde una captura de tu banco" color={FX.cyan} onPress={() => { void captura(); }} />}
          {saldos.map((x) => <Chip key={`${x.etiqueta}${x.monto}`} small label={`${x.etiqueta}: ${clp(x.monto)}`} on={monto === String(x.monto)} onPress={() => { setMonto(String(x.monto)); setFuente('captura'); }} />)}
        </View>
        <Text style={s.hint}>La captura se lee en el PC de Eris y se borra al terminar. Solo guardo el número.</Text>
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: FX.lineSoft },
  nombre: { color: FX.text, fontSize: 14, fontWeight: '600' },
  meta: { color: FX.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  hint: { color: FX.dim, fontSize: 11, marginTop: 8 },
  box: { borderWidth: 1, borderColor: FX.line, borderRadius: 12, padding: 12, gap: 10, backgroundColor: FX.panelHi },
  cmp: { flexDirection: 'row', gap: 12 },
  k: { color: FX.muted, fontFamily: FX.mono, fontSize: 10, letterSpacing: 1 },
  v: { color: FX.text, fontFamily: FX.mono, fontSize: 20, fontWeight: '700', marginTop: 2 },
  estado: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  ex: { borderWidth: 1, borderColor: FX.lineSoft, borderRadius: 10, padding: 10, gap: 8 },
  exT: { color: FX.text, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});

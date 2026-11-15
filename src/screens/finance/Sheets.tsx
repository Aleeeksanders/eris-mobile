// Finanzas 2.0 — los formularios (hojas). Todo pasa por las reglas del núcleo (financeCore.form*): mismos mensajes que la web.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Switch, StyleSheet, Alert, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FX, clp, catOf, BANCOS, fechaCorta } from './fx';
import { Sheet, Field, CatPicker, AccountPicker, Chip, Label, Btn, type CuentaOpt } from './parts';
import {
  estado, vistas, todayStr, formGasto, formCuenta, formMov, formAhorro, formPrestamo, formSueldo, formProg, formMeta, ULT_HABIL,
  formConfirmarIngreso, marcarCobrado, borrar, avisoBorrar, sueldoEsperado, simularCompra, CASH, conEfectivo, formEfectivo, porOrdenar, asignarCuenta, vistaCuenta,
  partesDe, editarGasto, gastoDeLaBoleta, completarConBoleta, type Ref, type TipoCuenta, type Tx,
} from '../../services/finance/financeCore';
import { TIPO_LABEL, txLook } from './tabs/Movimientos';
import ReceiptScanner from './ReceiptScanner';
import ReceiptPhoto from './ReceiptPhoto';
import { FechaCampo, DiaCampo } from './Calendario';
import { leerBoletaEnPC } from '../../services/finance/boletaFoto';
import { financeInbox } from '../../services/finance/financeInbox';
import { esCompra, boletaAnotada, TIPOS_DTE, comercioDe, agruparBoleta, claveBoletaFoto, conIvaDelTimbre, type Timbre } from '../../services/finance/receiptTed';
import { foodSearchService } from '../../services/FoodSearchService';
import type { SheetState, View as FinView, Act, Seccion } from './types';
import { MenuSheet, CartolaSheet, GuiaSheet, AjustesSheet } from './HubSheets';
import AvisoSheet from './AvisoSheet';
import { CuadrarSheet } from './Cuadre';
import { convertirEnPropia, editarEntrada } from '../../services/finance/bankAuto';
import type { FinanceState } from '../../services/finance/financeCore';
import InfoTip from '../../components/InfoTip';
import { lineaDeBoleta, destinoBoleta, agregar, fmtCant, areaPara, AREA, AREAS, type AreaId, type InventoryState } from '../../services/inventory/inventoryCore';
import { inventoryStore } from '../../services/inventory/inventoryStore';
import { ModuleStorage } from '../../services/ModuleStorage';
import { AuthStorage } from '../../services/AuthStorage';



/** «Si lo anotas…»: la compra simulada con el núcleo (lo mismo que verías después en Hoy). Solo para hoy. */
function GastoPreview({ S, monto, cat, cuenta, cuotas, now }: { S: FinanceState; monto: number; cat: string; cuenta: Ref | null; cuotas: number; now: Date }) {
  const sim = useMemo(() => (monto > 0 ? simularCompra(S, { monto, cat, cuenta, cuotas }, now) : null), [S, monto, cat, cuenta, cuotas, now]);
  if (!sim) return null;
  const color = sim.veredicto === 'holgado' ? FX.up : sim.veredicto === 'justo' ? FX.gold : FX.down;
  const tag = sim.veredicto === 'holgado' ? 'TE ALCANZA' : sim.veredicto === 'justo' ? 'QUEDA JUSTO' : 'NO TE ALCANZA';
  // al contado la primera línea es "hoy tienes…" (ya está en Hoy): se muestra lo que cambia
  const lineas = (sim.cuotas > 1 ? sim.lineas : sim.lineas.slice(1)).slice(0, 3);
  return (
    <View style={[s.preview, { borderColor: color }]}>
      <Text style={[s.previewTag, { color }]}>SI LO ANOTAS · {tag}</Text>
      {lineas.map((l) => <Text key={l} style={s.note}>{l}</Text>)}
    </View>
  );
}

export default function FinanceSheets({ sheet, onClose, open, S, V, act, irA, importarCartola, onTour }: {
  sheet: SheetState | null; onClose: () => void; open: (s: SheetState) => void; S: FinanceState; V: FinView; act: Act;
  irA: (s: Seccion) => void; importarCartola: (ref: Ref, nombre: string) => void; onTour: () => void;
}) {
  const E = useMemo(() => estado(S), [S]);
  const now = V.now;
  const [scan, setScan] = useState(false);
  const [foto, setFoto] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  // La foto de la boleta para un gasto que ya está anotado (el que Eris anotó del aviso del banco): lo completa, no anota otro
  const [fotoPara, setFotoPara] = useState<Tx['id'] | null>(null);
  // Los productos de la boleta por su código de barras: el mismo nombre que da el escáner del Inventario («Leche Pro 1L choc»
  // → el nombre del envase), así entrar por boleta es igual de bueno que escanear cada uno
  const [porCodigo, setPorCodigo] = useState<Record<string, { nombre: string; marca?: string }>>({});
  const [buscandoCod, setBuscandoCod] = useState(false);
  useEffect(() => {
    if (sheet?.k !== 'boleta') return;
    const eans = [...new Set([...sheet.leida.items, ...(sheet.leida.sinPrecio ?? [])].map((i) => i.ean).filter((e): e is string => !!e))].slice(0, 30);
    setPorCodigo({});
    if (!eans.length) return;
    let vivo = true;
    setBuscandoCod(true);
    Promise.all(eans.map(async (e) => {
      const r = await foodSearchService.lookupBarcode(e).catch(() => null);
      const nombre = r?.food?.name ?? r?.nameOnly?.name;
      const marca = r?.food?.brand ?? r?.nameOnly?.brand;
      return nombre ? ([e, { nombre: String(nombre).slice(0, 60), ...(marca ? { marca: String(marca) } : {}) }] as const) : null;
    })).then((xs) => {
      if (!vivo) return;
      setPorCodigo(Object.fromEntries(xs.filter((x): x is NonNullable<typeof x> => !!x)));
      setBuscandoCod(false);
    }).catch(() => { if (vivo) setBuscandoCod(false); });
    return () => { vivo = false; };
  }, [sheet]);
  // ¿Usa el Inventario? Entonces los productos de la boleta van a su casa (fase I3)
  const [invOn, setInvOn] = useState(false);
  const [invS, setInvS] = useState<InventoryState | null>(null);
  useEffect(() => {
    if (sheet?.k !== 'boleta') return;
    AuthStorage.getCredentials().then((c) => (c?.profileId ? ModuleStorage.get(c.profileId) : [])).then((m) => setInvOn(m.includes('inventario'))).catch(() => {});
    inventoryStore.load().then(setInvS).catch(() => {});
  }, [sheet]);
  // Solo existe la plata de tus cuentas (2026-10-22): el efectivo aparece si lo agregaste o lo usas; sin cuentas, los
  // formularios piden agregar una (antes: «Sin descontar» y «Plata de fuera», plata que no salía de ningún lado).
  const efec = conEfectivo(S);
  const opts = (filtro: 'gasto' | 'sinCredito' | 'credito' | 'todas' | 'sinEfectivo'): CuentaOpt[] => {
    const all: CuentaOpt[] = [...(efec ? [{ ref: CASH, nombre: 'Efectivo', tipo: 'efectivo', saldo: E.efectivo }] : []), ...E.cuentas.map((c) => ({ ref: c.id, nombre: c.nombre, tipo: c.tipo, saldo: c.saldo }))];
    if (filtro === 'gasto') return all.filter((o) => o.tipo !== 'ahorro');
    if (filtro === 'sinCredito') return all.filter((o) => o.tipo !== 'credito');
    if (filtro === 'credito') return all.filter((o) => o.tipo === 'credito');
    if (filtro === 'sinEfectivo') return all.filter((o) => o.ref !== CASH && o.tipo !== 'credito');
    return all;
  };
  const hayCuentas = E.cuentas.length > 0 || efec;
  const primeraDebito = (): Ref | null => (E.cuentas.find((c) => c.tipo === 'debito') ?? E.cuentas.find((c) => c.tipo !== 'credito' && c.tipo !== 'ahorro'))?.id ?? (efec ? CASH : null);
  /** Elegir la cuenta; sin ninguna, cómo agregarla (no se puede anotar plata que no sale ni llega a ningún lado). */
  const pick = (label: string, options: CuentaOpt[], value: Ref | null | undefined, onChange: (r: Ref | null) => void) => (hayCuentas
    ? <AccountPicker label={label} options={options} value={value} onChange={onChange} />
    : (
      <View style={s.sinCta}>
        <Label>{label}</Label>
        <Text style={s.note}>Solo cuenta la plata que está en tus cuentas: primero agrega dónde la tienes.</Text>
        <View style={s.row}>
          <Btn small label="+ Agregar cuenta" color={FX.violet} onPress={() => open({ k: 'cuenta' })} />
          <Btn small ghost label="💵 Tengo efectivo" color={FX.cyan} onPress={() => open({ k: 'efectivo' })} />
        </View>
      </View>
    ));

  // ─── Estado de cada formulario (se reinicia al abrir) ───
  const [f, setF] = useState<any>({});
  const set = (patch: any) => setF((x: any) => ({ ...x, ...patch }));
  useEffect(() => {
    if (!sheet) return;
    const hoy = todayStr(now), last = S.lastCuenta != null && (S.lastCuenta === CASH ? efec : E.activa(S.lastCuenta)) ? S.lastCuenta : primeraDebito();
    switch (sheet.k) {
      case 'gasto': setF({ monto: sheet.preset?.monto ? String(sheet.preset.monto) : '', desc: sheet.preset?.desc ?? '', cat: sheet.preset?.cat ?? 'alimentacion', cuenta: sheet.preset?.cuenta !== undefined ? sheet.preset.cuenta : last,
        fecha: sheet.preset?.fecha ?? hoy, cuotas: 1, cuotaValor: '', ...(sheet.preset?.notif ? { notif: sheet.preset.notif } : {}) });
        // + → Foto de la boleta: la cámara se abre al tiro
        if (sheet.foto) setFoto(true);
        break;
      case 'entrada': setF({ monto: '', desc: '', fuente: 'extra', hacia: primeraDebito() }); break;
      case 'mov': {
        const ref = sheet.ref ?? null, creditos = E.cuentas.filter((c) => c.tipo === 'credito');
        const base = { tipo: sheet.tipo, monto: '', desc: '' };
        if (sheet.tipo === 'giro') setF({ ...base, desde: ref ?? primeraDebito(), hacia: CASH });
        else if (sheet.tipo === 'transfer') { const d = ref ?? primeraDebito(); setF({ ...base, desde: d, hacia: [...E.cuentas.map((c) => c.id), ...(efec ? [CASH] : [])].find((r) => r !== d) ?? null }); }
        else if (sheet.tipo === 'pago') setF({ ...base, hacia: ref ?? creditos[0]?.id ?? null, desde: primeraDebito() });
        else setF({ ...base, hacia: ref, monto: String(ref === CASH ? E.efectivo : E.cuentas.find((c) => c.id === ref)?.saldo ?? 0) });
        break;
      }
      case 'cuenta': setF({ banco: '', alias: '', tipo: 'debito', saldo: '', cupo: '', deuda: '', origen: 'nuevo' }); break;
      case 'ahorro': setF({ monto: '', desc: 'Ahorro', fecha: hoy, desde: primeraDebito(), hacia: E.cuentas.find((c) => c.tipo === 'ahorro')?.id ?? null }); break;
      case 'prestamo': setF({ monto: '', desc: '', fecha: hoy, devolucion: '', cuenta: last }); break;
      case 'sueldo': {
        const sp = S.prog.filter((p) => p.tipo === 'ingreso' && p.fuente === 'sueldo'), sal = sp.find((p) => p.parte !== 'anticipo'), ant = sp.find((p) => p.parte === 'anticipo');
        const total = sp.reduce((a, p) => a + (Number(p.monto) || 0), 0) || sueldoEsperado(S, now) || '';
        setF({ monto: String(total || ''), dia: sal?.cuando === 'ult_habil' ? ULT_HABIL : String(sal?.dia ?? 30), cuenta: sal?.cuenta ?? primeraDebito(), quincena: !!ant, antMonto: ant ? String(ant.monto) : '', antDia: ant?.cuando === 'ult_habil' ? ULT_HABIL : String(ant?.dia ?? 15) });
        break;
      }
      case 'prog': setF({ tipo: sheet.tipo, desc: '', monto: '', dia: String(now.getDate()), cat: 'vivienda', fuente: 'pasivo', cuenta: primeraDebito(), planilla: false }); break;
      case 'meta': setF({ desc: '', target: '', fecha: '' }); break;
      case 'confirmar': setF({ monto: String(sheet.p.monto), cuenta: sheet.p.cuenta != null && E.activa(sheet.p.cuenta) ? sheet.p.cuenta : primeraDebito() }); break;
      case 'presup': setF({ monto: S.presup?.[sheet.cat] ? String(S.presup[sheet.cat]) : '' }); break;
      case 'boleta': setF({ elegidas: {}, sel: null, cuenta: last, fecha: sheet.leida.fecha ?? sheet.timbre?.fecha ?? hoy }); break;
      // «📷 Boleta» desde la notificación de lo que Eris anotó: la cámara se abre al tiro para ese gasto
      case 'tx': setF({}); if (sheet.foto) { setFotoPara(sheet.id); setFoto(true); } break;
      case 'efectivo': setF({ saldo: efec ? String(E.efectivo) : '' }); break;
      case 'asignar': setF({ cuenta: null }); break;
      default: setF({});
    }
  }, [sheet]);

  const save = async (fn: Parameters<Act>[0]) => { if (await act(fn)) onClose(); };
  // La boleta escaneada llena el formulario; la persona revisa y guarda (nada se anota solo)
  const onTimbre = (t: Timbre) => {
    setScan(false);
    if (!esCompra(t)) { Alert.alert('No es una compra', `Es una ${TIPOS_DTE[t.tipo] ?? 'documento'} (folio ${t.folio}): no la anoto como gasto.`); return; }
    const ya = boletaAnotada(S.tx, t.clave);
    if (ya) { Alert.alert('Ya está anotada', `Esta boleta ya está en tus movimientos: ${ya.desc}, ${clp(ya.monto)} el ${fechaCorta(ya.fecha)}.`); return; }
    set({ monto: String(t.monto), desc: t.comercio, cat: t.cat, fecha: t.fecha,
      boleta: { clave: t.clave, rut: t.rut, tipo: t.tipo, folio: t.folio, comercio: t.razonSocial, ...(t.item1 ? { item1: t.item1 } : {}), ...(t.hora ? { hora: t.hora } : {}) } });
  };
  // La FOTO de la boleta: se lee en el PC y se abre la revisión con todos los productos (o, si no se pudo, el timbre)
  const onFoto = async ({ base64, timbre }: { base64: string; timbre: Timbre | null }) => {
    const para = fotoPara;
    setFoto(false); setFotoPara(null); setLeyendo(true);
    const r = await leerBoletaEnPC(base64);
    setLeyendo(false);
    if (!r.ok) {
      if (timbre && para == null) { Alert.alert('Boleta', `${r.msg}

Alcancé a leer el timbre: te dejo el total para anotarlo en un gasto.`); onTimbre(timbre); }
      else Alert.alert('Boleta', r.msg);
      return;
    }
    if (timbre && !esCompra(timbre)) { Alert.alert('No es una compra', `Es una ${TIPOS_DTE[timbre.tipo] ?? 'documento'}: no la anoto como gasto.`); return; }
    const ya = boletaAnotada(S.tx, claveBoletaFoto(r, timbre));
    if (ya) { Alert.alert('Ya está anotada', `Esta boleta ya está en tus movimientos: ${ya.desc}, ${clp(ya.monto)} el ${fechaCorta(ya.fecha)}.`); return; }
    // Precios sin IVA que el PC no vio pero el timbre sí (lo pagado = la suma + 19 %)
    open({ k: 'boleta', leida: conIvaDelTimbre(r, timbre?.monto), timbre, ...(para != null ? { txId: para } : {}) });
  };
  // La cámara y el «leyendo…» de la boleta, en las hojas que la usan
  const camaraBoleta = (
    <>
      <ReceiptPhoto visible={foto} onClose={() => { setFoto(false); setFotoPara(null); }} onFoto={onFoto} />
      {leyendo && <View style={s.leyendo}><ActivityIndicator color={FX.cyan} /><Text style={s.note}>Leyendo la boleta en el PC…</Text></View>}
    </>
  );
  if (!sheet) return null;
  const n = (v: unknown) => Number(v) || 0;
  /** el día del formulario: un número, o «último día hábil» */
  const diaDe = (v: unknown) => (v === ULT_HABIL ? ULT_HABIL : n(v));

  switch (sheet.k) {
    case 'menu': return <MenuSheet onClose={onClose} open={open} />;
    case 'cartola': return <CartolaSheet S={S} onClose={onClose} irA={irA} importarCartola={importarCartola} />;
    case 'guia': return <GuiaSheet onClose={onClose} open={open} irA={irA} onTour={onTour} />;
    case 'ajustes': return <AjustesSheet onClose={onClose} act={act} onTour={onTour} />;
    case 'aviso': return <AvisoSheet p={sheet.p} S={S} act={act} onClose={onClose} opts={opts} pick={pick} />;
    case 'cuadrar': return <CuadrarSheet ref0={sheet.ref} S={S} act={act} onClose={onClose} open={open} importarCartola={importarCartola} opts={opts} />;
    case 'gasto': {
      const sel = opts('gasto').find((o) => o.ref === f.cuenta);
      const credito = sel?.tipo === 'credito';
      return (
        <Sheet visible title="NUEVO GASTO" onClose={onClose} saveLabel="Anotar gasto"
          onSave={async () => {
            const ok = await act((W, ctx) => (f.boleta && boletaAnotada(W.tx, f.boleta.clave) ? { ok: false, msg: 'Esta boleta ya está anotada' }
              : formGasto(W, { desc: f.desc, monto: n(f.monto), cat: f.cat, fecha: f.fecha, cuenta: f.cuenta, cuotas: credito ? n(f.cuotas) : 1, cuotaValor: n(f.cuotaValor),
                ...(f.boleta ? { via: 'boleta', extra: { boleta: f.boleta } } : f.notif ? { via: f.notif.fuente === 'cartola' ? 'cartola' : 'banco', extra: { notif: { clave: f.notif.clave, app: f.notif.app, ...(f.notif.last4 ? { last4: f.notif.last4 } : {}) } } } : {}) }, ctx)));
            if (!ok) return;
            // Del aviso del banco: sale de «por confirmar» y la próxima vez con esa tarjeta propone la misma cuenta
            if (f.notif) { await financeInbox.resolve(f.notif.clave); await financeInbox.recordarCuenta(f.notif.pkg, f.notif.last4, f.cuenta ?? null); }
            onClose();
          }}>
          <ReceiptScanner visible={scan} onClose={() => setScan(false)} onTimbre={onTimbre} />
          {camaraBoleta}
          {f.notif && <Text style={s.note}>{f.notif.fuente === 'cartola' ? `📄 De la cartola de ${f.notif.app}: «${f.notif.texto ?? ''}». Revisa la categoría.` : `🔔 Aviso de ${f.notif.app}${f.notif.texto ? `: «${f.notif.texto}»` : ''}. Revisa con qué pagaste.`}</Text>}
          {f.notif ? null : f.boleta
            ? <Text style={s.note}>🧾 Boleta folio {f.boleta.folio} · {f.boleta.comercio || f.boleta.rut}{f.boleta.item1 ? ` · 1.º ${f.boleta.item1}` : ''}. Revisa la categoría y con qué pagaste.</Text>
            : !leyendo && <Btn small ghost label="📷 ¿Tienes la boleta? Sácale una foto" color={FX.cyan} onPress={() => setFoto(true)} style={{ alignSelf: 'flex-start' }} />}
          {V.atajos.length > 0 && (
            <View>
              <Label>LO DE SIEMPRE</Label>
              <View style={s.row}>
                {V.atajos.map((a) => <Chip key={`${a.desc}|${a.cat}|${String(a.cuenta)}`} small label={`${catOf(a.cat).icon} ${a.desc} · ${clp(a.monto)}`} on={f.desc === a.desc && f.cat === a.cat}
                  onPress={() => set({ desc: a.desc, cat: a.cat, cuenta: a.cuenta, monto: String(a.monto) })} />)}
              </View>
            </View>
          )}
          <Field label="MONTO" value={f.monto ?? ''} onChange={(v) => set({ monto: v })} numeric big autoFocus={!V.atajos.length} placeholder="0" />
          <Field label="EN QUÉ" value={f.desc ?? ''} onChange={(v) => set({ desc: v })} placeholder="Almuerzo, Uber, super…" />
          <CatPicker value={f.cat} onChange={(c) => set({ cat: c })} />
          {pick('CON QUÉ PAGASTE', opts('gasto'), f.cuenta, (r) => set({ cuenta: r }))}
          {credito && (
            <View>
              <Label>CUOTAS</Label>
              <View style={s.row}>{[1, 3, 6, 12, 24].map((c) => <Chip key={c} small label={c === 1 ? 'Al contado' : `${c}`} on={n(f.cuotas) === c} onPress={() => set({ cuotas: c })} />)}</View>
              {n(f.cuotas) > 1 && <Field label="VALOR DE LA CUOTA (SI TIENE INTERÉS)" value={f.cuotaValor ?? ''} onChange={(v) => set({ cuotaValor: v })} numeric placeholder="Opcional" />}
              {n(f.cuotas) > 1 && <Text style={s.note}>El cupo baja completo hoy; como gasto cuenta una cuota por mes desde el próximo.</Text>}
            </View>
          )}
          <FechaCampo value={f.fecha ?? ''} onChange={(v) => set({ fecha: v })} now={now} />
          {f.fecha === todayStr(now) && <GastoPreview S={S} monto={n(f.monto)} cat={f.cat} cuenta={f.cuenta ?? null} cuotas={credito ? n(f.cuotas) || 1 : 1} now={now} />}
        </Sheet>
      );
    }
    case 'boleta': {
      // La foto de la boleta ya leída en el PC (2026-10-22, pedido del usuario: «el precio total se queda en finanzas y lo
      // demás se mueve»): UN gasto con el total y su desglose por categoría (el presupuesto lo reparte), y cada producto, revisado
      // línea por línea, a su área del Inventario con su cantidad y precio.
      // 2026-11-15: si el gasto ya está anotado (Eris lo anotó del aviso del banco), la boleta lo COMPLETA y no anota otro;
      // cada producto se reconoce por su código de barras; lo que no se alcanzó a leer queda como «sin leer» para cuadrar.
      const { leida, timbre } = sheet;
      const cm = comercioDe(timbre?.razonSocial || leida.comercio || 'Boleta');
      const nombre = cm.comercio;
      const catDe = (i: number) => (f.elegidas ?? {})[i] ?? leida.items[i].cat ?? cm.cat;
      const grupos = agruparBoleta(leida.items, cm.cat, f.elegidas ?? {});
      const suma = grupos.reduce((a, g) => a + g.monto, 0);
      // El total del timbre manda (es exacto); si no se leyó, el que dice la boleta
      const total = timbre?.monto ?? leida.total;
      // Lo que no se alcanzó a leer (un precio borroso): va como «sin leer» en la categoría del comercio, así el gasto es lo pagado
      const sinLeer = total != null && total - suma > 1 ? total - suma : 0;
      const sobra = total != null && suma - total > 1;
      const cuadra = total != null && !sobra && !sinLeer;
      const partesTodas = grupos.map((g) => ({ cat: g.cat, monto: g.monto }));
      if (sinLeer) {
        const g = partesTodas.find((x) => x.cat === cm.cat);
        if (g) g.monto += sinLeer; else partesTodas.push({ cat: cm.cat, monto: sinLeer });
        partesTodas.sort((a, b) => b.monto - a.monto);
      }
      const clave = claveBoletaFoto(leida, timbre);
      // ¿Ya está anotado este gasto? (el aviso del banco, la cartola o tú por chat: mismo monto, ±1 día, sin boleta)
      const destino: Tx | null = f.nuevo ? null : sheet.txId != null
        ? S.tx.find((x) => x.id === sheet.txId && x.tipo === 'gasto' && !x.boleta) ?? null
        : gastoDeLaBoleta(S, { total: total ?? suma, fecha: f.fecha });
      const notifApp = (destino?.notif as { app?: string } | undefined)?.app;
      // Cada producto → su línea del inventario. Con el código de barras, el nombre del envase (como el escáner) y, si ya lo
      // tienes en casa con ese código o ese nombre («Shampoo»), se suma ahí en su unidad (salvo que elijas otra área)
      const lineaDe = (it: { desc: string; monto: number; cant?: number; unit?: number; cat?: string; ean?: string }, i: number) => {
        const l0 = lineaDeBoleta(it);
        const pc = it.ean ? porCodigo[it.ean] : undefined;
        const l = pc ? { ...l0, nombre: pc.nombre, ...(pc.marca ? { marca: pc.marca } : {}), area: l0.area ?? areaPara(pc.nombre) ?? null } : l0;
        if (pc && !l.incluir && l.area) l.incluir = true;
        const elegida = (f.areas ?? {})[i] as AreaId | null | undefined;
        const d = invS ? destinoBoleta(invS, l) : null;
        if (d && (elegida === undefined || elegida === d.item.area)) {
          return { ...l, nombre: d.item.nombre, area: d.item.area, cantidad: d.cantidad, unidad: d.unidad, contenido: null, incluir: elegida !== null && !/^(bolsa|despacho|propina)/i.test(it.desc), suma: d.item.nombre };
        }
        const area = elegida !== undefined ? elegida : l.area;
        return { ...l, area, incluir: !!area && (elegida !== undefined ? elegida != null : l.incluir), suma: null as string | null };
      };
      const lineas = leida.items.map((it, i) => lineaDe({ ...it, cat: catDe(i) }, i));
      // Los que están en la boleta pero sin precio legible: van a la casa igual (la plata quedó en «sin leer»)
      const lineasSP = (leida.sinPrecio ?? []).map((sp, j) => lineaDe({ desc: sp.desc, monto: 0, cant: sp.cant, ean: sp.ean, cat: cm.cat }, leida.items.length + j));
      const alInv = invOn ? [...lineas, ...lineasSP].filter((l) => l.incluir) : [];
      const anotar = async (soloTotal: boolean) => {
        const monto = soloTotal ? (total ?? suma) : suma + sinLeer;
        const partes = soloTotal || partesTodas.length < 2 ? undefined : partesTodas;
        const cat = soloTotal ? cm.cat : partesTodas[0]?.cat ?? cm.cat;
        const folio = timbre?.folio ?? leida.folio;
        const base = {
          clave, comercio: timbre?.razonSocial || leida.comercio || nombre, ...(folio ? { folio } : {}), total: total ?? suma, ...(timbre?.rut || leida.rut ? { rut: timbre?.rut ?? leida.rut } : {}),
          ...(sinLeer ? { sinLeer } : {}), ...(leida.ivaAparte ? { iva: leida.iva } : {}),
        };
        const items = leida.items.map((it, i) => ({ ...it, cat: catDe(i), ...(lineas[i].area ? { area: lineas[i].area } : {}), ...(it.ean && porCodigo[it.ean] ? { nombre: porCodigo[it.ean].nombre } : {}) }));
        const nInv = alInv.length ? ` · ${alInv.length} producto${alInv.length === 1 ? '' : 's'} al inventario` : '';
        const ok = await act((W, ctx) => {
          if (boletaAnotada(W.tx, clave)) return { ok: false, msg: 'Esta boleta ya está anotada' };
          if (destino) {
            const r = completarConBoleta(W, destino.id, { desc: nombre, cat, partes, boleta: { ...base, items } });
            return r.ok ? { ok: true, msg: `Le agregué la boleta a «${r.tx?.desc ?? destino.desc}»${nInv}` } : r;
          }
          const r = formGasto(W, { desc: nombre, monto, cat, fecha: f.fecha, cuenta: f.cuenta, via: 'boleta', ...(partes ? { partes } : {}), extra: { boleta: { ...base, items } } }, ctx);
          if (!r.ok) return r;
          return { ok: true, msg: `Boleta anotada: ${clp(monto)}${partes ? ` en ${partes.length} categorías` : ''}${nInv}` };
        });
        if (!ok) return;
        // Recién con el gasto anotado, los productos van a la casa (si fallara Finanzas, no se agrega nada)
        if (alInv.length) {
          await inventoryStore.act((W, ctx) => {
            let n = 0;
            for (const l of alInv) { const { incluir: _i, suma: _s, ...e } = l; if (agregar(W, { ...e, vence: null }, ctx).ok) n++; }
            return { ok: n > 0, msg: '' };
          });
        }
        onClose();
      };
      const guardar = () => {
        if (!sobra) { void anotar(false); return; }
        Alert.alert('Suma más que el total', `Los productos que leí suman ${clp(suma)} y el total de la boleta es ${clp(total!)}. Puede que algún precio se haya leído mal.`, [
          { text: 'Revisar', style: 'cancel' },
          { text: `Solo el total (${clp(total!)})`, onPress: () => { void anotar(true); } },
          { text: 'Anotar lo leído', onPress: () => { void anotar(false); } },
        ]);
      };
      type Linea = (typeof lineas)[number];
      const filaInv = (l: Linea, i: number, desc: string) => (invOn ? (
        <TouchableOpacity onPress={() => set({ selA: f.selA === i ? null : i, sel: null })} style={s.invRow} accessibilityRole="button"
          accessibilityLabel={l.incluir && l.area ? `${desc}: va a ${AREA[l.area].nombre} del inventario. Cambiar` : `${desc}: no va al inventario. Cambiar`}>
          <Text style={[s.invText, !l.incluir && { color: FX.dim }]}>
            {l.incluir && l.area
              ? (l.suma
                ? `📦 se suma a ${l.suma} (${AREA[l.area].icono} ${AREA[l.area].corto}) · +${fmtCant(l.cantidad as number, l.unidad ?? 'u')}`
                : `📦 ${AREA[l.area].icono} ${AREA[l.area].corto} · ${l.barcode && porCodigo[l.barcode] ? `${l.nombre} · ` : ''}${fmtCant(l.cantidad as number, l.unidad ?? 'u', l.contenido)}`)
              : '— no va al inventario'}
          </Text>
        </TouchableOpacity>
      ) : null);
      const pickArea = (l: Linea, i: number) => (f.selA === i ? (
        <View style={s.areaPick}>
          {AREAS.map((a) => <Chip key={a.id} small label={`${a.icono} ${a.corto}`} color="#2dd4bf" on={l.incluir && l.area === a.id} onPress={() => set({ areas: { ...(f.areas ?? {}), [i]: a.id }, selA: null })} />)}
          <Chip small label="No va al inventario" on={!l.incluir} onPress={() => set({ areas: { ...(f.areas ?? {}), [i]: null }, selA: null })} />
        </View>
      ) : null);
      const nProd = leida.items.length + (leida.sinPrecio?.length ?? 0);
      const conCodigo = leida.items.filter((it) => it.ean).length + (leida.sinPrecio ?? []).filter((x) => x.ean).length;
      return (
        <Sheet visible title="BOLETA" onClose={onClose} onSave={guardar}
          saveLabel={destino ? (alInv.length ? `Completar y ${alInv.length} al inventario` : 'Completar el gasto') : alInv.length ? `Anotar y ${alInv.length} al inventario` : 'Anotar la boleta'}>
          <Text style={s.txDesc}>{nombre}</Text>
          <Text style={s.note}>{[leida.fecha ? fechaCorta(leida.fecha) : null, leida.hora ?? null, leida.folio ? `folio ${leida.folio}` : null, `${nProd} producto${nProd === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</Text>
          {destino && (
            <View style={[s.preview, { borderColor: FX.cyan }]}>
              <Text style={[s.previewTag, { color: FX.cyan }]}>🔗 YA ESTÁ ANOTADO</Text>
              <Text style={s.note}>{`«${destino.desc}», ${clp(destino.monto)} el ${fechaCorta(String(destino.fecha))}${notifApp ? `, del aviso de ${notifApp}` : destino.via === 'cartola' ? ', de la cartola' : ''}. No lo anoto dos veces: le agrego el detalle${invOn ? ' y lo de la casa va al inventario' : ''}.`}</Text>
              {total != null && Math.abs(destino.monto - total) > 1 && <Text style={[s.note, { color: FX.gold }]}>{`La boleta dice ${clp(total)} y el cargo fue ${clp(destino.monto)}: queda lo que cobró el banco y el detalle se reparte en proporción.`}</Text>}
              {sheet.txId == null && <Btn small ghost label="No, es otra compra" color={FX.muted} onPress={() => set({ nuevo: true })} style={{ alignSelf: 'flex-start' }} />}
            </View>
          )}
          <Text style={[s.note, { color: total == null ? FX.muted : cuadra ? FX.up : FX.gold }]}>
            {total == null ? `Suman ${clp(suma)} (no encontré el total para cuadrar).`
              : cuadra ? `✓ Suman ${clp(suma)}: cuadra con el total.`
              : sinLeer ? `⚠ Leí ${clp(suma)} de ${clp(total)}: los ${clp(sinLeer)} que faltan quedan como «sin leer» en ${catOf(cm.cat).label}.`
              : `⚠ Suman ${clp(suma)} y el total dice ${clp(total)}.`}
          </Text>
          {leida.ivaAparte && <Text style={s.note}>{`🧾 Los precios venían sin IVA: le sumé el IVA (${clp(leida.iva ?? 0)}) a cada producto, para que cuadre con lo que pagaste.`}</Text>}
          {invOn && conCodigo > 0 && <Text style={s.note}>{buscandoCod ? '▦ Buscando los productos por su código de barras…' : `▦ ${Object.keys(porCodigo).length} de ${conCodigo} reconocidos por su código de barras.`}</Text>}
          {grupos.map((g) => (
            <View key={g.cat} style={s.grupo}>
              <Text style={s.grupoT}>{catOf(g.cat).icon} {catOf(g.cat).label.toUpperCase()} · {clp(g.monto)}</Text>
              {g.items.map((it) => {
                const l = lineas[it.i];
                return (
                  <View key={it.i}>
                    <TouchableOpacity onPress={() => set({ sel: f.sel === it.i ? null : it.i, selA: null })} style={s.itemRow} accessibilityRole="button" accessibilityLabel={`Cambiar la categoría de ${it.desc}`}>
                      <Text style={s.itemD} numberOfLines={1}>{it.desc}{it.cant && it.cant !== 1 ? ` ×${String(it.cant).replace('.', ',')}` : ''}</Text>
                      <Text style={[s.itemM, it.estimado ? { color: FX.gold } : null]}>{it.estimado ? '≈ ' : ''}{clp(it.monto)}{it.descuento ? ` (${clp(it.descuento)})` : ''}</Text>
                    </TouchableOpacity>
                    {filaInv(l, it.i, it.desc)}
                    {f.sel === it.i && <CatPicker value={catDe(it.i)} onChange={(c) => set({ elegidas: { ...(f.elegidas ?? {}), [it.i]: c }, sel: null })} />}
                    {pickArea(l, it.i)}
                  </View>
                );
              })}
            </View>
          ))}
          {(sinLeer > 0 || lineasSP.length > 0) && (
            <View style={s.grupo}>
              <Text style={s.grupoT}>❔ SIN PRECIO LEÍDO{sinLeer ? ` · ${clp(sinLeer)}` : ''}</Text>
              {(leida.sinPrecio ?? []).map((sp, j) => {
                const i = leida.items.length + j, l = lineasSP[j];
                return (
                  <View key={i}>
                    <View style={s.itemRow}><Text style={s.itemD} numberOfLines={1}>{sp.desc}{sp.cant && sp.cant !== 1 ? ` ×${sp.cant}` : ''}</Text><Text style={s.itemM}>—</Text></View>
                    {filaInv(l, i, sp.desc)}
                    {pickArea(l, i)}
                  </View>
                );
              })}
              {!lineasSP.length && <Text style={s.note}>Una o más líneas que no pude leer.</Text>}
            </View>
          )}
          {leida.items.some((it) => it.estimado) && <Text style={s.note}>≈ = su precio no se leía: es lo que faltaba para el total.</Text>}
          {leida.dudosas.length > 0 && <Text style={[s.note, { color: FX.gold }]}>No pude leer bien: {leida.dudosas.slice(0, 3).join(' · ')}</Text>}
          <Text style={s.note}>
            {destino ? 'Sigue siendo un solo gasto' : 'Se anota UN gasto con el total'}{partesTodas.length > 1 ? `, repartido en ${partesTodas.length} categorías para tu presupuesto` : ''}. Toca un producto para cambiarle la categoría{invOn ? '; toca la línea 📦 para elegir a qué área de tu casa va (o que no vaya)' : ''}.
          </Text>
          {!destino && pick('CON QUÉ PAGASTE', opts('gasto'), f.cuenta, (r) => set({ cuenta: r }))}
          {!destino && <FechaCampo value={f.fecha ?? ''} onChange={(v) => set({ fecha: v })} now={now} />}
        </Sheet>
      );
    }
    case 'entrada':
      return (
        <Sheet visible title="ME ENTRÓ PLATA" onClose={onClose} color="#16a34a" saveLabel="Anotar"
          onSave={() => save((W, ctx) => formMov(W, { tipo: 'abono', hacia: f.hacia, monto: n(f.monto), desc: f.desc, fuente: f.fuente === 'otro' ? undefined : f.fuente }, ctx))}>
          <Field label="MONTO" value={f.monto ?? ''} onChange={(v) => set({ monto: v })} numeric big autoFocus placeholder="0" />
          <View>
            <Label>QUÉ ES</Label>
            <View style={s.row}>
              {[['sueldo', '💼 Sueldo'], ['extra', '⚡ Extra'], ['pasivo', '🌱 Pasivo'], ['otro', '↩ Devolución u otro']].map(([k, l]) => <Chip key={k} small label={l} on={f.fuente === k} onPress={() => set({ fuente: k })} />)}
            </View>
            <Text style={s.note}>{f.fuente === 'otro' ? 'Entra a la cuenta pero no cuenta como ingreso del mes.' : 'Cuenta como ingreso del mes.'}{f.fuente === 'sueldo' ? ' Si tienes el sueldo configurado, mejor confirma el «¿Llegó?» en Hoy.' : ''}</Text>
          </View>
          <Field label="DETALLE (OPCIONAL)" value={f.desc ?? ''} onChange={(v) => set({ desc: v })} placeholder="Freelance, bono, venta…" />
          {pick('A DÓNDE ENTRÓ', opts('todas'), f.hacia, (r) => set({ hacia: r }))}
        </Sheet>
      );
    case 'mov': {
      const t = f.tipo as 'giro' | 'transfer' | 'pago' | 'ajuste';
      const titulo = { giro: 'GIRO', transfer: 'TRANSFERENCIA', pago: 'PAGAR TARJETA', ajuste: 'AJUSTAR SALDO' }[t] ?? 'MOVIMIENTO';
      return (
        <Sheet visible title={titulo} onClose={onClose} color={t === 'pago' ? '#b45309' : '#0e7490'}
          onSave={() => save((W, ctx) => formMov(W, { tipo: t, desde: f.desde, hacia: f.hacia, monto: t === 'ajuste' ? f.monto : n(f.monto), desc: f.desc }, ctx))}>
          {t === 'ajuste' ? (
            <>
              <Text style={s.note}>Pon el saldo REAL que ves en tu banco o billetera: la diferencia queda anotada como ajuste.</Text>
              <Field label={`SALDO REAL DE ${String(E.nombre(f.hacia)).toUpperCase()}`} value={f.monto ?? ''} onChange={(v) => set({ monto: v })} numeric big autoFocus />
            </>
          ) : (
            <>
              <Field label="MONTO" value={f.monto ?? ''} onChange={(v) => set({ monto: v })} numeric big autoFocus placeholder="0" />
              <AccountPicker label="DESDE" options={opts(t === 'giro' ? 'sinEfectivo' : 'sinCredito')} value={f.desde} onChange={(r) => set({ desde: r })} />
              {t !== 'giro' && <AccountPicker label={t === 'pago' ? 'QUÉ TARJETA' : 'HACIA'} options={opts(t === 'pago' ? 'credito' : 'todas').filter((o) => o.ref !== f.desde)} value={f.hacia} onChange={(r) => set({ hacia: r })} />}
              <Field label="DETALLE (OPCIONAL)" value={f.desc ?? ''} onChange={(v) => set({ desc: v })} />
            </>
          )}
        </Sheet>
      );
    }
    case 'cuenta':
      return (
        <Sheet visible title="NUEVA CUENTA" onClose={onClose} color="#0e7490" saveLabel="Agregar"
          onSave={() => save((W, ctx) => formCuenta(W, { banco: f.banco, alias: f.alias, tipo: f.tipo as TipoCuenta, saldo: n(f.saldo), cupo: n(f.cupo), deuda: n(f.deuda), origen: f.origen }, ctx))}>
          <View>
            <Label>TIPO</Label>
            <View style={s.row}>{[['debito', '🏦 Cuenta / débito'], ['credito', '💳 Tarjeta de crédito'], ['ahorro', '🪙 Ahorro']].map(([k, l]) => <Chip key={k} small label={l} on={f.tipo === k} onPress={() => set({ tipo: k })} />)}</View>
          </View>
          <View>
            <Label>BANCO</Label>
            <View style={s.row}>{BANCOS.map((b) => <Chip key={b} small label={b} on={f.banco === b} onPress={() => set({ banco: b })} />)}</View>
          </View>
          <Field label={f.banco === 'Otro' ? 'NOMBRE' : 'APODO (OPCIONAL)'} value={f.alias ?? ''} onChange={(v) => set({ alias: v })} placeholder={f.tipo === 'credito' ? 'Visa, CMR…' : 'Cuenta corriente, vista…'} />
          {f.tipo === 'credito' ? (
            <>
              <Field label="CUPO TOTAL" value={f.cupo ?? ''} onChange={(v) => set({ cupo: v })} numeric />
              <Field label="DEUDA DE HOY (LO USADO)" value={f.deuda ?? ''} onChange={(v) => set({ deuda: v })} numeric placeholder="0" />
            </>
          ) : (
            <>
              <Field label="SALDO DE HOY" value={f.saldo ?? ''} onChange={(v) => set({ saldo: v })} numeric placeholder="0" />
              {n(f.saldo) > 0 && E.cuentas.length > 0 && <AccountPicker label="¿ESA PLATA SALIÓ DE OTRA CUENTA?" options={opts('sinCredito')} value={f.origen === 'nuevo' ? null : f.origen} onChange={(r) => set({ origen: r ?? 'nuevo' })} allowNone noneLabel="No, es plata nueva" />}
            </>
          )}
        </Sheet>
      );
    case 'ahorro':
      return (
        <Sheet visible title="AHORRAR" onClose={onClose} saveLabel="Guardar ahorro"
          onSave={() => save((W, ctx) => formAhorro(W, { desc: f.desc, monto: n(f.monto), fecha: f.fecha, desde: f.desde, hacia: f.hacia }, ctx))}>
          <Field label="MONTO" value={f.monto ?? ''} onChange={(v) => set({ monto: v })} numeric big autoFocus placeholder="0" />
          <Field label="PARA QUÉ" value={f.desc ?? ''} onChange={(v) => set({ desc: v })} />
          {pick('DE DÓNDE SALE', opts('sinCredito').filter((o) => o.tipo !== 'ahorro'), f.desde, (r) => set({ desde: r }))}
          {E.cuentas.filter((c) => c.tipo === 'ahorro').length > 1 && <AccountPicker label="A QUÉ AHORRO" options={opts('todas').filter((o) => o.tipo === 'ahorro')} value={f.hacia} onChange={(r) => set({ hacia: r })} />}
          <Text style={s.note}>{E.cuentas.some((c) => c.tipo === 'ahorro') ? 'Pasa de tu cuenta a tu ahorro: tu plata total no cambia.' : 'Se crea tu cuenta «Ahorro» y la plata pasa ahí: tu plata total no cambia.'}</Text>
          <FechaCampo value={f.fecha ?? ''} onChange={(v) => set({ fecha: v })} now={now} />
        </Sheet>
      );
    case 'prestamo':
      return (
        <Sheet visible title="LE PRESTÉ A…" onClose={onClose} color="#b45309"
          onSave={() => save((W, ctx) => formPrestamo(W, { desc: f.desc, monto: n(f.monto), fecha: f.fecha, devolucion: f.devolucion || undefined, cuenta: f.cuenta }, ctx))}>
          <Field label="A QUIÉN" value={f.desc ?? ''} onChange={(v) => set({ desc: v })} placeholder="Nombre (y para qué, si quieres)" autoFocus />
          <Field label="MONTO" value={f.monto ?? ''} onChange={(v) => set({ monto: v })} numeric big placeholder="0" />
          {pick('DE DÓNDE SALIÓ', opts('sinCredito'), f.cuenta, (r) => set({ cuenta: r }))}
          <FechaCampo label="CUÁNDO TE DEVUELVE (OPCIONAL)" modo="futuro" opcional value={f.devolucion ?? ''} onChange={(v) => set({ devolucion: v })} now={now} />
        </Sheet>
      );
    case 'sueldo':
      return (
        <Sheet visible title="MI SUELDO" onClose={onClose} color="#7c3aed"
          onSave={() => save((W, ctx) => formSueldo(W, { monto: n(f.monto), dia: diaDe(f.dia), cuenta: f.cuenta, quincena: !!f.quincena, antMonto: n(f.antMonto), antDia: diaDe(f.antDia) }, ctx))}>
          <Field label="SUELDO LÍQUIDO (LO QUE TE LLEGA AL MES)" value={f.monto ?? ''} onChange={(v) => set({ monto: v })} numeric big />
          <DiaCampo label="DÍA DE PAGO" ultHabil value={f.dia ?? ''} onChange={(v) => set({ dia: v })} nota="Con «último día hábil» no cuentan los fines de semana ni los feriados de Chile. Con un día fijo, si el mes tiene menos días (febrero) se usa el último." />
          {pick('A QUÉ CUENTA LLEGA', opts('sinCredito'), f.cuenta, (r) => set({ cuenta: r }))}
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Me pagan con quincena (anticipo)</Text>
            <Switch value={!!f.quincena} onValueChange={(v) => set({ quincena: v })} trackColor={{ false: FX.lineSoft, true: FX.violetDeep }} thumbColor={f.quincena ? FX.violet : FX.muted} />
          </View>
          {!!f.quincena && (
            <>
              <Field label="ANTICIPO (QUINCENA)" value={f.antMonto ?? ''} onChange={(v) => set({ antMonto: v })} numeric />
              <DiaCampo label="DÍA DEL ANTICIPO" ultHabil value={f.antDia ?? ''} onChange={(v) => set({ antDia: v })} />
            </>
          )}
        </Sheet>
      );
    case 'prog':
      return (
        <Sheet visible title={f.tipo === 'ingreso' ? 'INGRESO FIJO' : 'GASTO FIJO'} onClose={onClose} color="#0e7490"
          onSave={() => save((W, ctx) => formProg(W, { tipo: f.tipo, desc: f.desc, monto: n(f.monto), dia: diaDe(f.dia), cat: f.cat, fuente: f.fuente, cuenta: f.cuenta, planilla: f.tipo === 'gasto' && !!f.planilla }, ctx))}>
          <Field label="QUÉ ES" value={f.desc ?? ''} onChange={(v) => set({ desc: v })} placeholder={f.tipo === 'ingreso' ? 'Arriendo que me pagan, pensión…' : 'Arriendo, Spotify, plan del celular…'} autoFocus />
          <Field label="MONTO" value={f.monto ?? ''} onChange={(v) => set({ monto: v })} numeric />
          {f.tipo === 'gasto' && (
            <View style={s.switchRow}>
              <Text style={s.switchLabel}>Viene descontado del sueldo (planilla)</Text>
              <InfoTip id="planilla" color={FX.violet} size={17} style={{ marginRight: 10 }} />
              <Switch value={!!f.planilla} onValueChange={(v) => set({ planilla: v })} trackColor={{ false: FX.lineSoft, true: FX.violetDeep }} thumbColor={f.planilla ? FX.violet : FX.muted} />
            </View>
          )}
          {f.tipo === 'gasto' && !!f.planilla
            ? <Text style={s.hint}>No pasa por tus cuentas: tu sueldo líquido ya llega sin esto. Se anota como gasto del mes cuando confirmas que llegó el sueldo, y el sueldo se ve como bruto − planilla = líquido.</Text>
            : <DiaCampo label="QUÉ DÍA DE CADA MES" ultHabil value={f.dia ?? ''} onChange={(v) => set({ dia: v })} />}
          {f.tipo === 'gasto' ? <CatPicker value={f.cat} onChange={(c) => set({ cat: c })} /> : (
            <View><Label>TIPO</Label><View style={s.row}>{[['pasivo', '🌱 Pasivo'], ['extra', '⚡ Extra']].map(([k, l]) => <Chip key={k} small label={l} on={f.fuente === k} onPress={() => set({ fuente: k })} />)}</View></View>
          )}
          {!(f.tipo === 'gasto' && f.planilla) && pick(f.tipo === 'gasto' ? 'SE PAGA CON' : 'LLEGA A', opts(f.tipo === 'gasto' ? 'gasto' : 'sinCredito'), f.cuenta, (r) => set({ cuenta: r }))}
        </Sheet>
      );
    case 'meta':
      return (
        <Sheet visible title="NUEVA META" onClose={onClose} color="#b45309"
          onSave={() => save((W, ctx) => formMeta(W, { desc: f.desc, target: n(f.target), fecha: f.fecha || undefined }, ctx))}>
          <Field label="QUÉ QUIERES LOGRAR" value={f.desc ?? ''} onChange={(v) => set({ desc: v })} placeholder="Viaje, fondo de emergencia, pie…" autoFocus />
          <Field label="CUÁNTO" value={f.target ?? ''} onChange={(v) => set({ target: v })} numeric big />
          <FechaCampo label="PARA CUÁNDO (OPCIONAL)" modo="futuro" opcional value={f.fecha ?? ''} onChange={(v) => set({ fecha: v })} now={now} />
        </Sheet>
      );
    case 'confirmar':
      return (
        <Sheet visible title="¿CUÁNTO LLEGÓ?" onClose={onClose} color="#16a34a"
          onSave={() => save((W, ctx) => formConfirmarIngreso(W, sheet.p, { monto: n(f.monto), hacia: f.cuenta }, ctx))}>
          <Text style={s.note}>{sheet.p.desc}: esperabas {clp(Number(sheet.p.monto) || 0)} el {fechaCorta(sheet.p.fecha)}.</Text>
          <Field label="LO QUE LLEGÓ" value={f.monto ?? ''} onChange={(v) => set({ monto: v })} numeric big autoFocus />
          {pick('A QUÉ CUENTA', opts('sinCredito'), f.cuenta, (r) => set({ cuenta: r }))}
        </Sheet>
      );
    case 'efectivo':
      return (
        <Sheet visible title="EFECTIVO" onClose={onClose} color="#0e7490" saveLabel={efec ? 'Corregir' : 'Agregar'}
          onSave={() => save((W, ctx) => formEfectivo(W, { saldo: n(f.saldo) }, ctx))}>
          <Field label="¿CUÁNTO EFECTIVO TIENES HOY?" value={f.saldo ?? ''} onChange={(v) => set({ saldo: v })} numeric big autoFocus placeholder="0" />
          <Text style={s.note}>Cuenta lo que hay en tu billetera. Desde ahí, lo que pagues en efectivo sale de acá; para sumarle, «Sacar efectivo» desde tu cuenta.</Text>
        </Sheet>
      );
    case 'asignar': {
      // «Por ordenar»: lo anotado sin cuenta. Asignarle una (su saldo cambia) o borrarlo si no era plata real
      const PO = porOrdenar(S);
      const t = sheet.kind === 'tx' ? PO.tx.find((x) => x.id === sheet.id) : null;
      const p = sheet.kind === 'prog' ? PO.prog.find((x) => x.id === sheet.id) : null;
      if (!t && !p) return null;
      const sale = t ? t.falta === 'desde' : p!.tipo === 'gasto';
      const op = sale && (t ? t.tipo === 'gasto' : true) ? opts('gasto') : opts('sinCredito');
      const monto = t ? t.monto : Number(p!.monto) || 0;
      const sel = f.cuenta != null ? vistaCuenta(E, f.cuenta) : null;
      return (
        <Sheet visible title="ASIGNAR CUENTA" onClose={onClose} saveLabel="Asignar"
          onSave={() => save((W) => asignarCuenta(W, sheet.kind, sheet.id, f.cuenta))}>
          <Text style={s.txDesc}>{t ? t.desc : p!.desc}</Text>
          <Text style={s.note}>{t ? `${TIPO_LABEL[t.tipo] ?? 'Movimiento'} · ${fechaCorta(t.fecha)} · ${clp(monto)}` : `${p!.tipo === 'gasto' ? 'Gasto' : 'Ingreso'} fijo · ${clp(monto)} al mes`}</Text>
          {pick(sale ? (t ? '¿DE QUÉ CUENTA SALIÓ?' : '¿CON QUÉ SE PAGA?') : (t ? '¿A QUÉ CUENTA LLEGÓ?' : '¿A QUÉ CUENTA LLEGA?'), op, f.cuenta, (r) => set({ cuenta: r }))}
          {t && sel && (
            <Text style={[s.note, { color: FX.gold }]}>
              {`${sel.nombre} quedaría en ${clp(sel.saldo + (sale ? -monto : monto))}${sel.tipo === 'credito' ? ' de cupo' : ''}. Si el saldo que ves hoy en tu banco ya lo incluía, después corrige el saldo de esa cuenta.`}
            </Text>
          )}
          {t && (
            <Btn small ghost label="No era plata real: borrarlo" color={FX.down} style={{ alignSelf: 'flex-start' }}
              onPress={() => Alert.alert('Borrar', `«${t.desc}» (${clp(monto)}) se borra de tus movimientos y del mes.`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Borrar', style: 'destructive', onPress: () => { void save((W) => borrar(W, 'tx', t.id)); } },
              ])} />
          )}
        </Sheet>
      );
    }
    case 'presup': {
      const m = catOf(sheet.cat);
      return (
        <Sheet visible title={`TOPE · ${m.label.toUpperCase()}`} onClose={onClose}
          onSave={() => save((W) => { const v = n(f.monto); const p = { ...W.presup }; if (v > 0) p[sheet.cat] = v; else delete p[sheet.cat]; W.presup = p; return { ok: true, msg: v > 0 ? `${m.label}: tope de ${clp(v)} al mes` : `${m.label}: sin tope` }; })}>
          <Field label="TOPE MENSUAL (0 = SIN TOPE)" value={f.monto ?? ''} onChange={(v) => set({ monto: v })} numeric big autoFocus />
          <Text style={s.note}>Te muestro cada día si vas al ritmo, cuánto te queda por día y te aviso antes de pasarte.</Text>
        </Sheet>
      );
    }
    case 'tx': {
      const t = S.tx.find((x) => x.id === sheet.id);
      if (!t) return null;
      const L = txLook(t);
      const d = t.tipo === 'prestamo' ? vistas(E).meDeban.find((x) => x.id === t.id) : null;
      const cuenta = t.desde != null ? E.nombre(t.desde) : t.hacia != null ? E.nombre(t.hacia) : null;
      return (
        <Sheet visible title={(TIPO_LABEL[t.tipo] ?? 'Movimiento').toUpperCase()} onClose={onClose}>
          <Text style={s.txAmt}>{L.sign === '+' || L.sign === '−' ? L.sign : ''}{clp(Math.abs(t.monto))}</Text>
          <Text style={s.txDesc}>{L.icon} {t.desc}</Text>
          <Text style={s.note}>{[fechaCorta(String(t.fecha)), t.tipo === 'gasto' ? catOf(t.cat).label : null, cuenta, Number(t.cuotas) > 1 ? `en ${t.cuotas} cuotas` : null, t.via === 'eris' ? 'anotado por chat' : null, t.via === 'boleta' ? `boleta folio ${(t.boleta as any)?.folio ?? ''}` : t.boleta ? '🧾 con boleta' : null, t.via === 'banco' ? `${t.auto ? '🤖 lo anotó Eris del ' : ''}aviso de ${(t.notif as any)?.app ?? 'tu banco'}` : null, t.via === 'cartola' ? 'de la cartola' : null].filter(Boolean).join(' · ')}</Text>
          {/* La boleta de un gasto ya anotado (el que Eris anotó del aviso del banco): qué compraste y lo de la casa al inventario */}
          {t.tipo === 'gasto' && !t.boleta && (
            <>
              {camaraBoleta}
              {!leyendo && <Btn small ghost label="🧾 Agregar la boleta (qué compraste)" color={FX.cyan} style={{ alignSelf: 'flex-start' }} onPress={() => { setFotoPara(t.id); setFoto(true); }} />}
            </>
          )}
          {/* Un gasto se corrige acá: la categoría y con qué pagaste (lo que Eris anotó sola de un aviso, sobre todo) */}
          {t.tipo === 'gasto' && (
            <>
              <CatPicker value={String(t.cat ?? 'otros')} onChange={(c) => { void act((W) => editarGasto(W, t.id, { cat: c })); }} />
              <AccountPicker label="PAGASTE CON" options={opts('gasto')} value={t.desde ?? null}
                onChange={(r) => { void act((W) => editarGasto(W, t.id, { cuenta: r })).then((ok) => {
                  // Lo que venía de un aviso del banco: la próxima vez con esa tarjeta, esta cuenta
                  const n = t.notif as { pkg?: string; last4?: string } | undefined;
                  if (ok && n?.pkg) void financeInbox.recordarCuenta(n.pkg, n.last4, r);
                }); }} />
            </>
          )}
          {/* Plata que entró: ¿cuenta como ingreso del mes o no? (lo que Eris dejó como abono, sobre todo) */}
          {t.tipo === 'abono' && t.progId == null && (
            <View>
              <Label>¿FUE UN INGRESO?</Label>
              <View style={s.row}>
                {([['extra', '⚡ Sí, extra'], ['pasivo', '🌱 Sí, pasivo']] as const).map(([k, l]) => <Chip key={k} small label={l} onPress={() => { void act((W) => editarEntrada(W, t.id, k)); }} />)}
              </View>
              <Text style={s.note}>Como abono entra a la cuenta pero no cuenta como ingreso del mes.</Text>
            </View>
          )}
          {t.tipo === 'ingreso' && t.progId == null && t.via !== 'planilla' && (
            <Btn small ghost label="↩ Era un abono (no cuenta como ingreso)" color={FX.muted} onPress={() => { void act((W) => editarEntrada(W, t.id, null)); }} />
          )}
          {/* Lo que vino de una transferencia: si fue entre tus cuentas, deja de ser gasto o ingreso (y se aprende) */}
          {(t.tipo === 'gasto' || t.tipo === 'abono' || t.tipo === 'ingreso') && t.progId == null && ['transferencia', 'ingreso'].includes(String((t.notif as any)?.tipo)) && (
            <AccountPicker label={t.tipo === 'gasto' ? '¿FUE A OTRA CUENTA TUYA?' : '¿VINO DE OTRA CUENTA TUYA?'}
              options={opts(t.tipo === 'gasto' ? 'todas' : 'sinCredito').filter((o) => o.ref !== (t.tipo === 'gasto' ? t.desde : t.hacia) && o.ref !== CASH)} value={null}
              onChange={(r) => { if (r != null) void act((W) => convertirEnPropia(W, t.id, r)); }} />
          )}
          {d && <Text style={s.note}>{d.cobrado ? 'Ya te lo devolvieron.' : `Te debe ${clp(d.monto)}${d.devolucion ? `; devuelve el ${fechaCorta(d.devolucion)}` : ''}.`}</Text>}
          {/* La boleta: el total es UN movimiento; el desglose es lo que cuenta en cada categoría */}
          {partesDe(t) && (
            <View style={s.grupo}>
              <Text style={s.grupoT}>EN TU PRESUPUESTO</Text>
              {partesDe(t)!.map((p) => <View key={p.cat} style={s.itemRow}><Text style={s.itemD}>{catOf(p.cat).icon} {catOf(p.cat).label}</Text><Text style={s.itemM}>{clp(p.monto)}</Text></View>)}
            </View>
          )}
          {Array.isArray((t as any).boleta?.items) && (t as any).boleta.items.length > 0 && (
            <View style={s.grupo}>
              <Text style={s.grupoT}>🧾 {(t as any).boleta.items.length} PRODUCTOS</Text>
              {((t as any).boleta.items as Array<{ desc: string; monto: number; cant?: number }>).slice(0, 25).map((it, i) => (
                <View key={i} style={s.itemRow}><Text style={s.itemD} numberOfLines={1}>{it.desc}{it.cant && it.cant !== 1 ? ` ×${String(it.cant).replace('.', ',')}` : ''}</Text><Text style={s.itemM}>{clp(it.monto)}</Text></View>
              ))}
            </View>
          )}
          {d && <Btn small ghost label={d.cobrado ? 'Marcar como pendiente' : '✓ Me lo devolvió'} color={FX.up} onPress={() => save((W, ctx) => marcarCobrado(W, t.id, ctx))} />}
          {/* Anotado sin cuenta: no está en tu plata hasta que tenga una (lo mismo que «Por ordenar» en Cuentas) */}
          {porOrdenar(S).tx.some((x) => x.id === t.id) && (
            <>
              <Text style={[s.note, { color: FX.gold }]}>⚠ Sin cuenta: no está en tu plata hasta que elijas de qué cuenta {porOrdenar(S).tx.find((x) => x.id === t.id)!.falta === 'desde' ? 'salió' : 'llegó'}.</Text>
              <Btn small ghost label="Asignar cuenta" color={FX.gold} onPress={() => open({ k: 'asignar', kind: 'tx', id: t.id })} />
            </>
          )}
          <Btn small ghost label="Eliminar" color={FX.down} onPress={() => Alert.alert('Eliminar', avisoBorrar(S, 'tx', t.id), [
            { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => save((W) => borrar(W, 'tx', t.id)) },
          ])} />
        </Sheet>
      );
    }
    default: return null;
  }
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  row2: { flexDirection: 'row', gap: 10 },
  note: { color: FX.muted, fontSize: 12, lineHeight: 17 },
  leyendo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  grupo: { borderWidth: 1, borderColor: FX.line, borderRadius: 10, padding: 10, gap: 2, backgroundColor: FX.panelHi },
  grupoT: { color: FX.text, fontFamily: FX.mono, fontSize: 12, letterSpacing: 1, fontWeight: '700', marginBottom: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  itemD: { flex: 1, color: FX.text, fontSize: 13 },
  itemM: { color: FX.muted, fontFamily: FX.mono, fontSize: 12 },
  preview: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4, backgroundColor: FX.panelHi },
  previewTag: { fontFamily: FX.mono, fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  input: { backgroundColor: 'rgba(20,15,50,0.9)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)', borderRadius: 12, color: FX.text, paddingHorizontal: 14, minHeight: 48, fontFamily: FX.mono },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  switchLabel: { color: FX.text, fontSize: 14, flex: 1 },
  hint: { color: FX.muted, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  invRow: { paddingLeft: 10, paddingBottom: 6, minHeight: 28, justifyContent: 'center' },
  invText: { color: '#2dd4bf', fontSize: 11.5, fontWeight: '700' },
  areaPick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 6 },
  sinCta: { gap: 8, borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)', borderStyle: 'dashed', borderRadius: 12, padding: 12 },
  txAmt: { color: FX.text, fontFamily: FX.mono, fontSize: 30, fontWeight: '700' },
  txDesc: { color: FX.text, fontSize: 16, fontWeight: '700' },
});

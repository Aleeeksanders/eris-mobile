// ============================================================
// Eris Mobile — «Mis suplementos» y sus fichas (fase I5, 2026-10-23)
//
// Tres vistas en una hoja:
//   - Mis suplementos: lo que tomas, cuándo, la constancia de la semana y el stock del Botiquín;
//   - Fichas: qué hace cada suplemento, qué tan estudiado está, la dosis de los estudios como REFERENCIA con su fuente y los
//     cuidados según TU perfil (condiciones, remedios, alergias);
//   - Agregar / editar: la dosis la escribe la persona (la que le indicaron o la de la etiqueta). Eris no indica dosis.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Modal, StyleSheet, Switch, KeyboardAvoidingView, Platform, Linking, Alert } from 'react-native';
import { T, R, S } from '../../config/design';
import InfoTip from '../InfoTip';
import { SUP, SUP_GLOW, fmtHora, useSupplements } from './SupplementsCard';
import { supplementStore, persona } from '../../services/supplements/supplementStore';
import {
  FICHAS, fichaPara, fichaPorId, cuidadosPara, constancia, fmtDosis, aporteToma, fmtMicro, microInfo, pctDri,
  type Ficha, type MiSup, type MicroKey,
} from '../../services/supplements/supplementCore';
import { usePerfilMedico } from '../../screens/inventory/useMedical';
import { inventoryStore } from '../../services/inventory/inventoryStore';
import { agregar, fmtCant, type Unidad } from '../../services/inventory/inventoryCore';
import { ModuleStorage } from '../../services/ModuleStorage';
import { AuthStorage } from '../../services/AuthStorage';

export type SupMode = 'mios' | 'fichas' | 'nuevo';
type Vista = { v: 'mios' } | { v: 'fichas' } | { v: 'ficha'; id: string } | { v: 'form'; supId?: string; fichaId?: string | null };

const EVIDENCIA: Record<string, { label: string; color: string }> = {
  fuerte: { label: 'Muy estudiado', color: T.green },
  moderada: { label: 'Evidencia moderada', color: T.gold },
  limitada: { label: 'Poca evidencia', color: T.textMuted },
};
const UNIDADES = ['g', 'mg', 'µg', 'UI', 'cápsula', 'tableta', 'sobre', 'scoop', 'gotas', 'ml'];
const num = (v: string) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

/**
 * «48 % de lo recomendado al día». Sobre 3 veces, sin el número: 500 µg de B12 son «20833 %» y asusta sin razón (se absorbe
 * una parte pequeña y no tiene límite superior). Si una dosis pasa el límite de los estudios, lo dice el aviso al guardarla.
 */
const pctTexto = (pct: number) => (pct > 300 ? 'más de 3 veces lo recomendado al día' : `${pct} % de lo recomendado al día`);

/** La unidad del stock en el Botiquín y cuánto baja por toma, según cómo se anotó la dosis. */
function stockPorDefecto(cantidad: number, unidad: string): { unidad: Unidad; porToma: number } {
  if (/^(g|gr|gramos?)$/i.test(unidad)) return { unidad: 'g', porToma: cantidad };
  if (/^ml$/i.test(unidad)) return { unidad: 'ml', porToma: cantidad };
  if (/^(c[aá]psula|tableta|comprimido|sobre|pastilla)$/i.test(unidad)) return { unidad: 'u', porToma: cantidad };
  return { unidad: 'u', porToma: 1 };
}

export default function SupplementsSheet({ mode, onClose }: { mode: SupMode | null; onClose: () => void }) {
  const [vista, setVista] = useState<Vista>({ v: 'mios' });
  useEffect(() => { if (mode) setVista(mode === 'nuevo' ? { v: 'form' } : { v: mode }); }, [mode]);
  if (!mode) return null;
  const title = vista.v === 'mios' ? 'Mis suplementos' : vista.v === 'fichas' ? 'Fichas de suplementos' : vista.v === 'ficha' ? (fichaPorId(vista.id)?.nombre ?? 'Ficha') : vista.supId ? 'Editar suplemento' : 'Agregar suplemento';
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel="Cerrar" />
        <View style={s.card}>
          <View style={s.grabber} />
          <View style={s.header}>
            {vista.v !== 'mios' && vista.v !== 'fichas' ? (
              <TouchableOpacity onPress={() => setVista(vista.v === 'ficha' ? { v: 'fichas' } : { v: 'mios' })} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={s.back}>‹</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={s.title} numberOfLines={1}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Cerrar"><Text style={s.close}>✕</Text></TouchableOpacity>
          </View>
          {(vista.v === 'mios' || vista.v === 'fichas') && (
            <View style={s.tabs}>
              {(['mios', 'fichas'] as const).map((t) => (
                <TouchableOpacity key={t} style={[s.tab, vista.v === t && s.tabOn]} onPress={() => setVista({ v: t })}>
                  <Text style={[s.tabText, vista.v === t && s.tabTextOn]}>{t === 'mios' ? 'Lo que tomo' : 'Fichas'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: S.xl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {vista.v === 'mios' && <Mios onEdit={(id) => setVista({ v: 'form', supId: id })} onAdd={() => setVista({ v: 'form' })} onFichas={() => setVista({ v: 'fichas' })} />}
            {vista.v === 'fichas' && <Fichas onOpen={(id) => setVista({ v: 'ficha', id })} />}
            {vista.v === 'ficha' && <FichaView id={vista.id} onAdd={(fid) => setVista({ v: 'form', fichaId: fid })} />}
            {vista.v === 'form' && <Form supId={vista.supId} fichaId={vista.fichaId} onDone={() => setVista({ v: 'mios' })} onFicha={(id) => setVista({ v: 'ficha', id })} />}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Lo que tomo ─────────────────────────────────────────────

function Mios({ onEdit, onAdd, onFichas }: { onEdit: (id: string) => void; onAdd: () => void; onFichas: () => void }) {
  const st = useSupplements();
  const inv = inventoryStore.get();
  if (!st) return null;
  const activos = st.items.filter((x) => x.activo);
  const cons = new Map(constancia(st, new Date()).map((c) => [c.id, c]));
  return (
    <View style={{ gap: 10 }}>
      {activos.length === 0 && (
        <Text style={s.text}>Aún no tienes suplementos anotados. Agrega lo que tomas y anótalo cada día en un toque, o revisa las fichas para saber qué dice la evidencia.</Text>
      )}
      {activos.map((sup) => {
        const f = fichaPorId(sup.fichaId);
        const c = cons.get(sup.id);
        const item = sup.invId != null ? inv?.items.find((i) => i.id === sup.invId && !i.archivado) : undefined;
        const dias = item && sup.porToma ? Math.floor(item.cantidad / (sup.porToma * sup.tomasDia)) : null;
        const aporte = aporteToma(sup);
        const k = Object.keys(aporte)[0] as MicroKey | undefined;
        return (
          <TouchableOpacity key={sup.id} style={s.item} onPress={() => onEdit(sup.id)} accessibilityLabel={`Editar ${sup.nombre}`}>
            <View style={s.itemHead}>
              <Text style={s.itemName}>{sup.nombre}</Text>
              {sup.aviso && <Text style={s.bell}>🔔</Text>}
            </View>
            <Text style={s.itemLine}>
              {fmtDosis(sup.cantidad, sup.unidad)} · {sup.tomasDia === 1 ? '1 vez' : `${sup.tomasDia} veces`} al día ({sup.horas.map(fmtHora).join(', ')})
            </Text>
            {k && <Text style={s.itemSub}>Suma {fmtMicro(k, aporte[k]!)} de {microInfo(k).nombre.charAt(0).toLowerCase() + microInfo(k).nombre.slice(1)} por toma ({pctTexto(pctDri(k, aporte[k]!, persona()))})</Text>}
            {c && c.esperadas > 0 && <Text style={s.itemSub}>Últimos 7 días: {c.hechas} de {c.esperadas} toma{c.esperadas === 1 ? '' : 's'}</Text>}
            {item && <Text style={s.itemSub}>Botiquín: {fmtCant(item.cantidad, item.unidad)}{dias != null ? ` · te alcanza ~${dias} día${dias === 1 ? '' : 's'}` : ''}</Text>}
            {!f && <Text style={s.itemSub}>Sin ficha en Eris (no suma a vitaminas y minerales)</Text>}
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity style={s.primary} onPress={onAdd}><Text style={s.primaryText}>+ Agregar suplemento</Text></TouchableOpacity>
      <TouchableOpacity style={s.linkBtn} onPress={onFichas}><Text style={s.linkText}>¿Qué dice la evidencia? Ver fichas</Text></TouchableOpacity>
    </View>
  );
}

// ─── Fichas ──────────────────────────────────────────────────

function Fichas({ onOpen }: { onOpen: (id: string) => void }) {
  const med = usePerfilMedico();
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.note}>Qué hace cada uno y qué tan estudiado está. La dosis de los estudios es una referencia con su fuente, no una indicación: Eris no te dirá que empieces nada.</Text>
      {FICHAS.map((f) => {
        const ev = EVIDENCIA[f.evidencia];
        const paraTi = cuidadosPara(f, med).length;
        return (
          <TouchableOpacity key={f.id} style={s.item} onPress={() => onOpen(f.id)}>
            <View style={s.itemHead}>
              <Text style={s.itemName}>{f.nombre}</Text>
              <View style={[s.badge, { borderColor: ev.color }]}><Text style={[s.badgeText, { color: ev.color }]}>{ev.label}</Text></View>
            </View>
            <Text style={s.itemSub} numberOfLines={2}>{f.que}</Text>
            {paraTi > 0 && <Text style={[s.itemSub, { color: T.gold }]}>⚠ {paraTi === 1 ? 'Un cuidado' : `${paraTi} cuidados`} para ti</Text>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FichaView({ id, onAdd }: { id: string; onAdd: (fichaId: string) => void }) {
  const f = fichaPorId(id);
  const med = usePerfilMedico();
  const st = useSupplements();
  if (!f) return null;
  const ev = EVIDENCIA[f.evidencia];
  const paraTi = cuidadosPara(f, med);
  const ya = st?.items.find((x) => x.activo && x.fichaId === f.id);
  return (
    <View style={{ gap: 4 }}>
      <View style={[s.badge, { borderColor: ev.color, alignSelf: 'flex-start' }]}><Text style={[s.badgeText, { color: ev.color }]}>{ev.label}</Text></View>
      <Text style={s.section}>QUÉ HACE</Text>
      <Text style={s.text}>{f.que}</Text>
      <Text style={s.section}>QUÉ TAN ESTUDIADO ESTÁ</Text>
      <Text style={s.text}>{f.evidenciaTexto}</Text>
      <Text style={s.section}>DOSIS QUE USAN LOS ESTUDIOS (REFERENCIA)</Text>
      <Text style={s.text}>{f.dosis}</Text>
      {paraTi.length > 0 && (
        <View style={s.forYou}>
          <Text style={s.forYouTitle}>Para ti, según tu perfil</Text>
          {paraTi.map((t) => <Text key={t} style={s.text}>• {t}</Text>)}
        </View>
      )}
      {f.general.length > 0 && (
        <>
          <Text style={s.section}>CUIDADOS</Text>
          {f.general.map((t) => <Text key={t} style={s.text}>• {t}</Text>)}
        </>
      )}
      <Text style={s.section}>FUENTES</Text>
      {f.fuentes.map((x) => (
        <TouchableOpacity key={x.url} onPress={() => Linking.openURL(x.url).catch(() => {})}>
          <Text style={s.source}>{x.nombre} ↗</Text>
        </TouchableOpacity>
      ))}
      <Text style={s.note}>Ficha escrita a partir de esas fuentes; no reemplaza a tu médico. Si tomas remedios o tienes una condición, conversa con él antes de empezar o cambiar un suplemento.</Text>
      {ya ? (
        <Text style={[s.note, { color: SUP }]}>Ya está en lo que tomas: {ya.nombre}, {fmtDosis(ya.cantidad, ya.unidad)}.</Text>
      ) : (
        <TouchableOpacity style={[s.primary, { marginTop: S.md }]} onPress={() => onAdd(f.id)}><Text style={s.primaryText}>Lo tomo: agregarlo</Text></TouchableOpacity>
      )}
    </View>
  );
}

// ─── Agregar / editar ────────────────────────────────────────

function Form({ supId, fichaId, onDone, onFicha }: { supId?: string; fichaId?: string | null; onDone: () => void; onFicha: (id: string) => void }) {
  const st = useSupplements();
  const med = usePerfilMedico();
  const actual: MiSup | undefined = supId ? st?.items.find((x) => x.id === supId) : undefined;
  const base = fichaPorId(actual?.fichaId ?? fichaId ?? null);
  const [nombre, setNombre] = useState(actual?.nombre ?? base?.nombre ?? '');
  const [cantidad, setCantidad] = useState(actual ? String(actual.cantidad).replace('.', ',') : '');
  const [unidad, setUnidad] = useState(actual?.unidad ?? base?.unidad ?? 'g');
  const [tomasDia, setTomasDia] = useState(actual?.tomasDia ?? 1);
  const [horas, setHoras] = useState<number[]>(actual?.horas ?? [8]);
  const [aviso, setAviso] = useState(actual?.aviso ?? true);
  const [invOn, setInvOn] = useState(false);
  const [stockOn, setStockOn] = useState(actual?.invId != null);
  const [stockCant, setStockCant] = useState('');
  const [porToma, setPorToma] = useState(actual?.porToma != null ? String(actual.porToma).replace('.', ',') : '');
  const [aviso2, setAviso2] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AuthStorage.getCredentials().then((c) => (c?.profileId ? ModuleStorage.get(c.profileId) : [])).then((m) => setInvOn(m.includes('inventario'))).catch(() => {});
    inventoryStore.load().catch(() => {});
  }, []);
  // La ficha que corresponde a lo escrito («Creatina Optimum» → creatina)
  const ficha: Ficha | null = useMemo(() => fichaPara(nombre) ?? (base && nombre.trim() === base.nombre ? base : null), [nombre, base]);
  const paraTi = ficha ? cuidadosPara(ficha, med) : [];
  const n = num(cantidad);
  const stockDef = Number.isFinite(n) ? stockPorDefecto(n, unidad) : { unidad: 'u' as Unidad, porToma: 1 };
  const item = actual?.invId != null ? inventoryStore.get()?.items.find((i) => i.id === actual.invId) : undefined;

  const setN = (k: number) => {
    const t = Math.max(1, Math.min(6, k));
    setTomasDia(t);
    setHoras((hs) => { const def = [[8], [8, 20], [8, 14, 20], [8, 12, 16, 20], [7, 10, 13, 16, 19], [7, 10, 13, 16, 19, 22]][t - 1]; return hs.length === t ? hs : def; });
  };
  const moveHora = (i: number, d: number) => setHoras((hs) => hs.map((h, j) => (j === i ? Math.max(0, Math.min(23.5, h + d)) : h)));

  const guardar = async () => {
    setError(null);
    if (!nombre.trim()) return setError('Escribe el nombre del suplemento.');
    if (!(n > 0)) return setError('Escribe cuánto tomas por vez (por ejemplo 5 g o 1.000 UI).');
    const datos = { nombre: nombre.trim(), fichaId: ficha?.id ?? null, cantidad: n, unidad, tomasDia, horas, aviso };
    const r = actual ? await supplementStore.editar(actual.id, datos) : await supplementStore.agregar(datos);
    if (!r.ok) return setError(r.msg);
    // El stock en el Botiquín: una cosa nueva (o la que ya estaba), que baja con cada «tomado»
    if (invOn && stockOn && r.id) {
      const pt = num(porToma) > 0 ? num(porToma) : stockDef.porToma;
      let invId = actual?.invId ?? null;
      if (invId == null) {
        const sc = num(stockCant);
        const res = await inventoryStore.act((W, ctx) => agregar(W, { nombre: nombre.trim(), area: 'botiquin', cantidad: sc > 0 ? sc : 0, unidad: stockDef.unidad, via: 'app' }, ctx, 'nuevo'));
        invId = (res as any).id ?? null;
      }
      if (invId != null) await supplementStore.enlazarStock(r.id, invId, pt);
    } else if (actual?.invId != null && !stockOn && r.id) {
      await supplementStore.enlazarStock(r.id, null, null);
    }
    if (r.aviso) { setAviso2(r.aviso); return; }
    onDone();
  };

  const quitar = () => {
    if (!actual) return;
    Alert.alert('Quitar suplemento', `¿Dejas de tomar ${actual.nombre}? Lo ya anotado queda en tu historial.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: async () => { await supplementStore.quitar(actual.id); onDone(); } },
    ]);
  };

  if (aviso2) {
    return (
      <View style={{ gap: 12 }}>
        <View style={s.forYou}><Text style={s.forYouTitle}>Guardado, con un aviso</Text><Text style={s.text}>{aviso2}</Text></View>
        <TouchableOpacity style={s.primary} onPress={onDone}><Text style={s.primaryText}>Entendido</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={s.section}>SUPLEMENTO</Text>
      <TextInput style={s.input} value={nombre} onChangeText={setNombre} placeholder="Creatina, vitamina D3, omega 3…" placeholderTextColor={T.textMuted} maxLength={60} />
      {ficha ? (
        <TouchableOpacity onPress={() => onFicha(ficha.id)}><Text style={s.linkText}>Ficha: {ficha.nombre} ↗</Text></TouchableOpacity>
      ) : nombre.trim() ? <Text style={s.note}>Sin ficha en Eris: se anota igual, pero no suma a vitaminas y minerales.</Text> : null}

      <View style={s.sectionRow}>
        <Text style={s.section}>CUÁNTO POR TOMA</Text>
        <InfoTip id="dosis_suplemento" size={15} color={T.textMuted} />
      </View>
      <View style={s.inline}>
        <TextInput style={[s.input, { width: 110 }]} value={cantidad} onChangeText={setCantidad} keyboardType="decimal-pad" placeholder="5" placeholderTextColor={T.textMuted} accessibilityLabel="Cantidad por toma" />
        <Text style={s.unitNow}>{unidad}</Text>
      </View>
      <View style={s.chips}>
        {UNIDADES.map((u) => (
          <TouchableOpacity key={u} style={[s.chip, unidad === u && s.chipOn]} onPress={() => setUnidad(u)}>
            <Text style={[s.chipText, unidad === u && s.chipTextOn]}>{u}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {ficha && <Text style={s.note}>Referencia de los estudios: {ficha.dosis.split('. ')[0]}.</Text>}

      <Text style={s.section}>VECES AL DÍA Y HORA</Text>
      <View style={s.inline}>
        <TouchableOpacity style={s.step} onPress={() => setN(tomasDia - 1)} accessibilityLabel="Una vez menos"><Text style={s.stepText}>−</Text></TouchableOpacity>
        <Text style={s.count}>{tomasDia}</Text>
        <TouchableOpacity style={s.step} onPress={() => setN(tomasDia + 1)} accessibilityLabel="Una vez más"><Text style={s.stepText}>+</Text></TouchableOpacity>
        <Text style={s.unitNow}>{tomasDia === 1 ? 'vez al día' : 'veces al día'}</Text>
      </View>
      {horas.map((h, i) => (
        <View key={i} style={s.inline}>
          <Text style={[s.unitNow, { width: 64 }]}>{tomasDia > 1 ? `Toma ${i + 1}` : 'Hora'}</Text>
          <TouchableOpacity style={s.step} onPress={() => moveHora(i, -0.5)} accessibilityLabel="Media hora antes"><Text style={s.stepText}>−</Text></TouchableOpacity>
          <Text style={s.count}>{fmtHora(h)}</Text>
          <TouchableOpacity style={s.step} onPress={() => moveHora(i, 0.5)} accessibilityLabel="Media hora después"><Text style={s.stepText}>+</Text></TouchableOpacity>
        </View>
      ))}
      <View style={[s.inline, { justifyContent: 'space-between' }]}>
        <Text style={s.text}>Avisarme a esa hora</Text>
        <Switch value={aviso} onValueChange={setAviso} trackColor={{ true: SUP, false: T.border }} />
      </View>

      {invOn && (
        <>
          <View style={[s.inline, { justifyContent: 'space-between', marginTop: S.sm }]}>
            <Text style={s.text}>Llevar el stock en el Botiquín</Text>
            <Switch value={stockOn} onValueChange={setStockOn} trackColor={{ true: SUP, false: T.border }} />
          </View>
          {stockOn && (
            <View style={{ gap: 6 }}>
              {item ? <Text style={s.note}>En el Botiquín: {fmtCant(item.cantidad, item.unidad)}.</Text> : (
                <View style={s.inline}>
                  <Text style={[s.unitNow, { width: 92 }]}>Tengo</Text>
                  <TextInput style={[s.input, { width: 100 }]} value={stockCant} onChangeText={setStockCant} keyboardType="decimal-pad" placeholder="300" placeholderTextColor={T.textMuted} />
                  <Text style={s.unitNow}>{stockDef.unidad === 'u' ? 'unidades' : stockDef.unidad}</Text>
                </View>
              )}
              <View style={s.inline}>
                <Text style={[s.unitNow, { width: 92 }]}>Cada toma usa</Text>
                <TextInput style={[s.input, { width: 100 }]} value={porToma} onChangeText={setPorToma} keyboardType="decimal-pad" placeholder={String(stockDef.porToma).replace('.', ',')} placeholderTextColor={T.textMuted} />
                <Text style={s.unitNow}>{(item?.unidad ?? stockDef.unidad) === 'u' ? 'unidad' : item?.unidad ?? stockDef.unidad}</Text>
              </View>
              <Text style={s.note}>Baja con cada «Tomado» y te avisa en el Botiquín cuando quede para una semana.</Text>
            </View>
          )}
        </>
      )}

      {paraTi.length > 0 && (
        <View style={[s.forYou, { marginTop: S.md }]}>
          <Text style={s.forYouTitle}>Para ti, según tu perfil</Text>
          {paraTi.map((t) => <Text key={t} style={s.text}>• {t}</Text>)}
        </View>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity style={[s.primary, { marginTop: S.md }]} onPress={guardar}><Text style={s.primaryText}>{actual ? 'Guardar cambios' : 'Agregar'}</Text></TouchableOpacity>
      {actual && <TouchableOpacity style={s.linkBtn} onPress={quitar}><Text style={[s.linkText, { color: T.red }]}>Dejar de tomarlo</Text></TouchableOpacity>}
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  card: { backgroundColor: '#0e0e18', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', borderTopWidth: 1, borderColor: T.border, paddingBottom: 16 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.sm },
  back: { color: T.textLight, fontSize: 26, fontWeight: '700', lineHeight: 28 },
  title: { flex: 1, color: T.text, fontSize: 18, fontWeight: '800' },
  close: { color: T.textMuted, fontSize: 18, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: S.lg, paddingBottom: S.sm, borderBottomWidth: 1, borderBottomColor: T.border },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.full, backgroundColor: T.border },
  tabOn: { backgroundColor: SUP_GLOW, borderWidth: 1, borderColor: SUP },
  tabText: { color: T.textMuted, fontSize: 12, fontWeight: '700' },
  tabTextOn: { color: SUP },
  body: { paddingHorizontal: S.lg, paddingTop: S.md },
  item: { backgroundColor: T.bgCard, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: T.border, gap: 3 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  itemName: { color: T.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  itemLine: { color: T.textLight, fontSize: 12 },
  itemSub: { color: T.textMuted, fontSize: 11, lineHeight: 15 },
  bell: { fontSize: 12 },
  badge: { borderWidth: 1, borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  section: { color: T.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: S.md, marginBottom: 4 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { color: T.textLight, fontSize: 13, lineHeight: 19 },
  note: { color: T.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  source: { color: SUP, fontSize: 12, lineHeight: 20 },
  forYou: { borderWidth: 1, borderColor: T.gold, borderRadius: R.md, padding: S.md, gap: 4, marginTop: S.sm, backgroundColor: 'rgba(224,180,84,0.06)' },
  forYouTitle: { color: T.gold, fontSize: 12, fontWeight: '800' },
  input: { backgroundColor: T.bgInput, color: T.text, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: '600', borderWidth: 1, borderColor: T.border },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  unitNow: { color: T.textLight, fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: R.full, backgroundColor: T.border, borderWidth: 1, borderColor: T.border },
  chipOn: { backgroundColor: SUP_GLOW, borderColor: SUP },
  chipText: { color: T.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: SUP },
  step: { width: 36, height: 36, borderRadius: 10, backgroundColor: T.border, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: T.textLight, fontSize: 18, fontWeight: '800' },
  count: { color: T.text, fontSize: 15, fontWeight: '800', minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] },
  primary: { paddingVertical: 13, borderRadius: 12, backgroundColor: SUP, alignItems: 'center' },
  primaryText: { color: '#0b0614', fontSize: 14, fontWeight: '800' },
  linkBtn: { alignSelf: 'center', paddingVertical: 10 },
  linkText: { color: SUP, fontSize: 13, fontWeight: '700' },
  error: { color: T.red, fontSize: 12, marginTop: S.sm },
});

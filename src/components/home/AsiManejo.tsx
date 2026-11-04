// ============================================================
// Eris administra (A3) — «Así manejo tu…»: una hoja por módulo que dice qué hace Eris sola, qué te pregunta y qué no toca
// nunca, con un interruptor por cosa. Cada interruptor cambia lo que ya actuaba (Finanzas en automático, el ajuste del
// Inventario, el piloto automático, los avisos de Perfil) o lo nuevo de A3 (autoPrefs); arriba, lo que hizo esta semana.
// Se abre desde el chip 🧭 de cada módulo y desde el Plan de Eris en Inicio.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Switch, TouchableOpacity, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '../../config/design';
import { autoPrefs, type AutoSnapshot } from '../../services/autoPrefs';
import { resumenSemana, programarDomingo } from '../../services/weeklyAuto';
import { financeAuto } from '../../services/finance/financeAuto';
import { inventoryStore } from '../../services/inventory/inventoryStore';
import { ajustarDescuentoComida, ajustarPrevision } from '../../services/inventory/inventoryCore';
import { dayPlanStore } from '../../services/dayPlan/dayPlanStore';
import { reminderSettingsKey, PLAN_REFRESH_EVENT, erisNotifications } from '../../services/ErisNotifications';
import { AuthStorage } from '../../services/AuthStorage';
import { useFeature } from '../../config/features';
import { BankNotifications } from '../../../modules/eris-bank-notifications';
import { clp } from '../../services/finance/financeCore';

export type ModuloManejo = 'plata' | 'casa' | 'comida' | 'entreno' | 'sueno';
const MODULOS: Array<[ModuloManejo, string, string]> = [
  ['plata', '💸', 'Plata'], ['casa', '🏠', 'Casa'], ['comida', '🍽', 'Comida'], ['entreno', '🏋️', 'Entreno'], ['sueno', '😴', 'Sueño'],
];
const TITULO: Record<ModuloManejo, string> = { plata: 'tu plata', casa: 'tu casa', comida: 'tu comida', entreno: 'tu entreno', sueno: 'tu sueño' };

interface Fila { label: string; sub: string; on: boolean; set: (v: boolean) => Promise<unknown>; off?: boolean }

export function AsiManejoSheet({ visible, modulo, onClose }: { visible: boolean; modulo: ModuloManejo; onClose: () => void }) {
  const [mod, setMod] = useState<ModuloManejo>(modulo);
  const [snap, setSnap] = useState<AutoSnapshot | null>(null);
  const [semana, setSemana] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const finOk = useFeature('finanzasAuto');
  useEffect(() => { if (visible) setMod(modulo); }, [visible, modulo]);
  const refresh = useCallback(() => {
    autoPrefs.snapshot().then(setSnap).catch(() => {});
    resumenSemana().then((r) => setSemana(r.lineas)).catch(() => {});
  }, []);
  useEffect(() => { if (visible) { setMsg(null); refresh(); } }, [visible, refresh]);

  /** Cambia algo y vuelve a leer (el servidor recibe la foto nueva) */
  const cambiar = (fn: () => Promise<unknown>, ok?: string) => async () => {
    setMsg(null);
    try { await fn(); if (ok) setMsg(ok); } catch { setMsg('No pude cambiarlo: revisa la conexión.'); }
    refresh();
    void autoPrefs.sync();
  };
  const setSueno = async (on: boolean) => {
    const c = await AuthStorage.getCredentials();
    if (!c?.profileId) return;
    const k = reminderSettingsKey(c.profileId);
    const cur = await erisNotifications.reminderSettings(c.profileId);
    await AsyncStorage.setItem(k, JSON.stringify({ ...cur, sleep: on }));
    DeviceEventEmitter.emit(PLAN_REFRESH_EVENT);
  };

  const s = snap;
  const filas: Fila[] = !s ? [] : mod === 'plata' ? [
    { label: 'Anoto lo que te avisa tu banco', sub: finOk ? (BankNotifications.available && !BankNotifications.hasAccess() ? 'Falta darme el acceso a las notificaciones: Finanzas → ⚙.' : 'Compras y transferencias con su cuenta clara; te aviso en silencio con «Deshacer».') : 'Todavía en prueba: pronto para todos.',
      on: s.plata.anota, off: !finOk, set: (v) => financeAuto.setConfig({ on: v, allowed: true }) },
    { label: 'Confirmo tu sueldo cuando llega', sub: 'Si llega lo esperado (±15 %), marco el «¿Llegó?» con el monto real.', on: s.plata.sueldo, off: !finOk || !s.plata.anota, set: (v) => financeAuto.setConfig({ sueldo: v }) },
    { label: 'Cuadro con tu banco y arreglo lo exacto', sub: 'Lo repetido, un fijo cobrado antes, el sueldo… Si no calza y no sé por qué, te pregunto.', on: s.plata.cuadre, off: !finOk || !s.plata.anota, set: (v) => financeAuto.setConfig({ cuadre: v }) },
    { label: 'Te pongo un tope para gastar hoy', sub: 'En el Plan de Eris: lo que puedes gastar por día hasta tu próximo ingreso.', on: s.topeDia, set: (v) => autoPrefs.set({ topeDia: v }) },
  ] : mod === 'casa' ? [
    { label: 'Descuento lo que comes de la despensa', sub: 'Lo que anotas en Nutrición sale de Alimentos y Despensa; si fue fuera de casa, «Lo comí fuera» lo devuelve.', on: s.casa.comidas, set: (v) => inventoryStore.act((W) => ajustarDescuentoComida(W, v)) },
    { label: 'Lo que se va a acabar entra a tu lista', sub: 'A tu ritmo de consumo, lo que se acaba en 3 días o menos (además de lo que se acabó o quedó bajo su mínimo).', on: s.casa.prevision, set: (v) => inventoryStore.act((W) => ajustarPrevision(W, v)) },
  ] : mod === 'comida' ? [
    { label: 'Armo tu día cada mañana', sub: 'El piloto automático: con tu último camino, y los avisos te traen el menú con «Lo comí ✓».', on: s.piloto === true, set: (v) => dayPlanStore.setAuto(v) },
  ] : mod === 'entreno' ? [
    { label: 'Ajusto la carga según cómo dormiste', sub: 'Con poco sueño, una versión más corta o liviana (sube el riesgo de lesión). Apagado: tu rutina tal cual.', on: s.segunSueno, set: (v) => autoPrefs.set({ segunSueno: v }) },
  ] : [
    { label: 'Te aviso la hora de acostarte', sub: 'Según tu reloj y lo que dormiste; también el último café.', on: s.sueno, set: setSueno },
  ];
  const pregunto: Record<ModuloManejo, string[]> = {
    plata: [`Un comercio o una persona nueva por más de ${clp(s?.plata.tope || 100_000)}`, 'Una cuenta que no conozco (y aprendo tu respuesta)', 'Ajustar una cuenta al saldo del banco'],
    casa: ['Lo que comiste y no sé cuánto descontar', 'Los productos de la boleta (los revisas antes de pasarlos)'],
    comida: ['Si comiste otra cosa, rearmo lo que queda del día'],
    entreno: ['«¿Entrenas hoy?» y a qué hora'],
    sueno: ['Cómo dormiste, si el reloj no lo trae'],
  };
  const nunca: Record<ModuloManejo, string[]> = {
    plata: ['Mover tu plata ni pagar nada', 'Sacar el texto de tus avisos del teléfono'],
    casa: ['Comprar nada por ti'],
    comida: ['Anotar una comida sin tu «Lo comí»'],
    entreno: ['Cambiar tu rutina sin que la cargues tú'],
    sueno: ['Recomendarte remedios para dormir'],
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose} accessibilityLabel="Cerrar" />
      <View style={st.sheet}>
        <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
          <View style={st.grab} />
          <Text style={st.title}>Así manejo {TITULO[mod]}</Text>
          <View style={st.tabs}>
            {MODULOS.map(([k, ic, l]) => (
              <TouchableOpacity key={k} onPress={() => { setMod(k); setMsg(null); }} style={[st.tab, mod === k && st.tabOn]} accessibilityRole="button" accessibilityState={{ selected: mod === k }}>
                <Text style={[st.tabText, mod === k && st.tabTextOn]}>{ic} {l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {semana.length > 0 && (
            <View style={st.box}>
              <Text style={st.k}>ESTA SEMANA HICE SOLA</Text>
              {semana.map((l) => <Text key={l} style={st.line}>{l}</Text>)}
            </View>
          )}
          <Text style={st.k}>LO HAGO SOLA</Text>
          {filas.map((f) => (
            <View key={f.label} style={[st.row, f.off && { opacity: 0.45 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.rowT}>{f.label}</Text>
                <Text style={st.rowS}>{f.sub}</Text>
              </View>
              <Switch value={f.on && !f.off} disabled={f.off} onValueChange={(v) => { void cambiar(() => f.set(v))(); }} trackColor={{ true: T.accent, false: T.border }} thumbColor="#fff" />
            </View>
          ))}
          <Text style={st.k}>TE PREGUNTO</Text>
          {pregunto[mod].map((x) => <Text key={x} style={st.line}>• {x}</Text>)}
          <Text style={st.k}>NUNCA</Text>
          {nunca[mod].map((x) => <Text key={x} style={st.line}>✕ {x}</Text>)}
          {!!s && (
            <View style={[st.row, { marginTop: 4 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.rowT}>📊 Los domingos, lo que hice sola</Text>
                <Text style={st.rowS}>A las 19:00, un resumen corto de la semana (si hubo algo).</Text>
              </View>
              <Switch value={s.domingo} onValueChange={(v) => { void cambiar(async () => { await autoPrefs.set({ domingo: v }); await programarDomingo(); })(); }} trackColor={{ true: T.accent, false: T.border }} thumbColor="#fff" />
            </View>
          )}
          {!!msg && <Text style={st.msg}>{msg}</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: T.bgCard, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, maxHeight: '88%', borderTopWidth: 1, borderColor: T.borderActive },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 4 },
  title: { color: T.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: T.border },
  tabOn: { borderColor: T.borderActive, backgroundColor: 'rgba(34,211,238,0.08)' },
  tabText: { color: T.textLight, fontSize: 12.5, fontWeight: '700' },
  tabTextOn: { color: T.accent },
  box: { borderWidth: 1, borderColor: T.border, borderRadius: 14, padding: 12, gap: 6, backgroundColor: T.bgElevated },
  k: { color: T.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  line: { color: T.textLight, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rowT: { color: T.text, fontSize: 14, fontWeight: '700' },
  rowS: { color: T.textLight, fontSize: 12, lineHeight: 16, marginTop: 2 },
  msg: { color: T.gold, fontSize: 12.5 },
});

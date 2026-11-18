// ============================================================
// Eris Mobile — Inventario (2026-10-22, fase I2). Lo que tienes en casa, fiel a la realidad.
// Secciones fijas (el patrón de Finanzas 1.47): Hoy · Áreas · Compras; el botón «+ Agregar» para todo lo que se agrega;
// ? (guía) y ⚙ (áreas, respaldo). Las reglas viven en services/inventory/inventoryCore.ts (las mismas que usa el chat).
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { escucharDestino } from '../../services/notifTargets';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar, BackHandler, ActivityIndicator, Animated, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IX } from './ix';
import { useInventoryState, useInventoryView } from './useInventory';
import InventorySheets from './Sheets';
import Hoy from './tabs/Hoy';
import Areas from './tabs/Areas';
import Compras from './tabs/Compras';
import Botiquin from './tabs/Botiquin';
import { revisarInventario } from '../../services/inventory/inventoryAuto';
import { inventoryStore } from '../../services/inventory/inventoryStore';
import { listInventoryBackups, fechaHora } from '../../services/inventoryBackup';
import GuidedTour, { type TourStep } from '../../components/tour/GuidedTour';
import { tourRef, measureTarget } from '../../components/tour/tourTargets';
import type { AreaId } from '../../services/inventory/inventoryCore';
import type { SheetState, Act, Seccion } from './types';

interface Props { onExit?: () => void; active?: boolean; onReadyChange?: (ready: boolean) => void }

const SECCIONES: Array<{ id: Seccion; titulo: string; icon: string }> = [
  { id: 'hoy', titulo: 'Hoy', icon: '🏠' },
  { id: 'areas', titulo: 'Áreas', icon: '🗂' },
  { id: 'botiquin', titulo: 'Botiquín', icon: '💊' },
  { id: 'compras', titulo: 'Compras', icon: '🛒' },
];
const TOUR_KEY = 'inventory_tour_v1';

export default function InventoryScreen({ onExit, active = true, onReadyChange }: Props) {
  const insets = useSafeAreaInsets();
  const S = useInventoryState();
  const V = useInventoryView(S);
  const [tab, setTab] = useState<Seccion>('hoy');
  const [area, setArea] = useState<AreaId | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toastMsg, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [tour, setTour] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const scroll = useRef<ScrollView>(null);
  const readyRef = useRef(onReadyChange); readyRef.current = onReadyChange;
  // «Hestia, escanea un producto para la despensa»: agregar, con el escáner abierto
  useEffect(() => escucharDestino('escanear_inventario', () => { setTab('hoy'); setSheet({ k: 'agregar', preset: { barcode: '__scan__' } } as SheetState); }), []);

  useEffect(() => { if (S) readyRef.current?.(true); }, [!!S]);
  // Al abrir: lo que comiste y las tomas del día, al tiro (también corre solo en segundo plano)
  useEffect(() => { if (active) void revisarInventario(); }, [active]);

  const toast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    Animated.sequence([Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }), Animated.delay(2200), Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: true })]).start();
  }, [fade]);

  const act: Act = useCallback(async (fn) => {
    const r = await inventoryStore.act((W, ctx) => fn(W, ctx));
    toast(r.msg, r.ok);
    return r.ok;
  }, [toast]);

  const irA = useCallback((sec: Seccion, a?: AreaId | null) => {
    setTab(sec);
    if (sec === 'areas') setArea(a ?? null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, []);

  // Vacío y con un respaldo en el PC (reinstalaste o borraste los datos): se ofrece restaurarlo, una vez por apertura
  const ofrecido = useRef(false);
  useEffect(() => {
    if (!active || !S || ofrecido.current || S.items.length || S.setupDone) return;
    ofrecido.current = true;
    listInventoryBackups().then((cs) => {
      const c = cs?.find((x) => x.stats.items > 0);
      if (!c) return;
      Alert.alert('Encontré tu Inventario', `En el PC hay un respaldo del ${fechaHora(c.at)} con ${c.stats.items} cosas. ¿Lo restauro?`, [
        { text: 'Empezar de cero', style: 'cancel', onPress: () => { void inventoryStore.act((W) => { W.setupDone = true; return { ok: true, msg: 'Inventario nuevo' }; }); } },
        { text: 'Restaurar', onPress: async () => { const r = await inventoryStore.restore(c.day); toast(r.message, r.ok); } },
      ]);
    }).catch(() => {});
  }, [active, S]);

  // La primera vez: el recorrido. Después, desde la guía (?) o ⚙.
  useEffect(() => {
    if (!active || !S) return;
    let alive = true;
    AsyncStorage.getItem(TOUR_KEY).then((v) => { if (alive && !v) setTimeout(() => { if (alive) { irA('hoy'); setTour(true); } }, 700); }).catch(() => {});
    return () => { alive = false; };
  }, [active, !!S, irA]);
  const finTour = useCallback(() => { setTour(false); AsyncStorage.setItem(TOUR_KEY, '1').catch(() => {}); }, []);
  const verTour = useCallback(() => { setSheet(null); irA('hoy'); setTimeout(() => setTour(true), 350); }, [irA]);

  // Atrás: primero la hoja, después el área abierta, después Inventario
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheet) { setSheet(null); return true; }
      if (tab === 'areas' && area) { setArea(null); return true; }
      onExit?.(); return true;
    });
    return () => sub.remove();
  }, [active, sheet, tab, area, onExit]);

  if (!S || !V) return <View style={[s.root, s.center]}><ActivityIndicator color={IX.teal} /></View>;
  const props = { S, V, open: setSheet, act, irA, area, setArea };
  const seccion = SECCIONES.find((x) => x.id === tab) ?? SECCIONES[0];
  const alertas = V.vence.length + V.lista.auto.length;

  const pasos: TourStep[] = [
    { id: 'hola', title: 'Tu casa, ordenada', text: 'Te muestro en 30 segundos dónde está cada cosa. Lo puedes volver a ver desde el ?.', locate: async () => null },
    { id: 'hoy', title: 'Hoy', text: 'Lo que pide atención: lo que se vence, lo que se acabó y la revisión de la semana. Lo que comes en Nutrición sale solo de la despensa.', locate: () => measureTarget('inv.tab.hoy') },
    { id: 'areas', title: 'Áreas', text: 'Dónde está cada cosa: alimentos, despensa, baño, limpieza, botiquín, ropa y objetos. Con − y + descuentas o sumas una unidad al tiro.', locate: () => measureTarget('inv.tab.areas') },
    { id: 'botiquin', title: 'Botiquín', text: 'Tus remedios del perfil con cuánto te queda y para cuántos días: bajan solos con las tomas que anotes. Y tu historial médico en un solo lugar.', locate: () => measureTarget('inv.tab.botiquin') },
    { id: 'compras', title: 'Compras', text: 'La lista se arma sola con lo que se acaba, con cuánto comprar y el costo estimado contra tu presupuesto de Finanzas.', locate: () => measureTarget('inv.tab.compras') },
    { id: 'agregar', title: 'Todo se agrega acá', text: 'A mano o escaneando el código de barras. Si ya lo tienes, se suma. También puedes decirle a Eris «compré 2 L de leche».', locate: () => measureTarget('inv.fab') },
    { id: 'ayuda', title: '¿Cómo hago…?', text: 'La guía con cada cosa paso a paso. En ⚙ eliges qué áreas usas y tienes el respaldo del PC.', locate: () => measureTarget('inv.help') },
  ];

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {active && <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>ERIS · INVENTARIO</Text>
          <Text style={s.title}>{tab === 'areas' && area ? 'Áreas' : seccion.titulo}</Text>
        </View>
        <View ref={tourRef('inv.help')} collapsable={false} style={s.headBtns}>
          <TouchableOpacity onPress={() => setSheet({ k: 'guia' })} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="¿Cómo hago…? Guía de Inventario"><Text style={s.iconText}>?</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setSheet({ k: 'ajustes' })} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Ajustes de Inventario"><Text style={s.iconText}>⚙</Text></TouchableOpacity>
        </View>
        {onExit && <TouchableOpacity onPress={onExit} style={s.close} accessibilityLabel="Cerrar Inventario"><Text style={s.closeText}>✕</Text></TouchableOpacity>}
      </View>
      <View style={s.tabs} accessibilityRole="tablist">
        {SECCIONES.map((x) => {
          const on = tab === x.id;
          const badge = x.id === 'hoy' ? alertas : x.id === 'compras' ? V.lista.auto.length + V.lista.manual.length : 0;
          return (
            <View key={x.id} ref={tourRef(`inv.tab.${x.id}`)} collapsable={false} style={{ flex: 1 }}>
              <TouchableOpacity onPress={() => irA(x.id)} style={[s.tab, on && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${x.titulo}${badge ? `, ${badge}` : ''}`}>
                <Text style={[s.tabIcon, !on && { opacity: 0.7 }]}>{x.icon}</Text>
                <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>{x.titulo}</Text>
                {badge > 0 && <View style={[s.badge, x.id === 'hoy' && V.vence.some((v) => v.dias < 0) && { backgroundColor: IX.red }]}><Text style={s.badgeText}>{badge > 9 ? '9+' : badge}</Text></View>}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {tab === 'hoy' && <Hoy {...props} />}
        {tab === 'areas' && <Areas {...props} />}
        {tab === 'botiquin' && <Botiquin {...props} />}
        {tab === 'compras' && <Compras {...props} />}
      </ScrollView>
      <View ref={tourRef('inv.fab')} collapsable={false} style={[s.fabWrap, { bottom: Math.max(22, insets.bottom + 14) }]}>
        <TouchableOpacity style={s.fab} onPress={() => setSheet(tab === 'areas' && area ? { k: 'agregar', preset: { area } } : { k: 'menu' })} accessibilityLabel="Agregar: a mano, escaneando o a la lista" accessibilityRole="button">
          <Text style={s.fabPlus}>+</Text>
          <Text style={s.fabText}>Agregar</Text>
        </TouchableOpacity>
      </View>
      <InventorySheets sheet={sheet} onClose={() => setSheet(null)} open={setSheet} S={S} V={V} act={act} irA={irA} onTour={verTour} toast={toast} />
      {tour && <GuidedTour steps={pasos} onDone={finTour} />}
      {toastMsg && (
        <Animated.View pointerEvents="none" style={[s.toast, { opacity: fade, top: insets.top + 8, backgroundColor: toastMsg.ok ? '#0c2420' : '#3a1220', borderColor: toastMsg.ok ? IX.tealDeep : IX.red }]}>
          <Text style={s.toastText}>{toastMsg.msg}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: IX.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  kicker: { color: IX.teal, fontFamily: IX.mono, fontSize: 10, letterSpacing: 2 },
  title: { color: IX.text, fontSize: 24, fontWeight: '900', marginTop: 2 },
  headBtns: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: IX.lineSoft, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: IX.muted, fontSize: 17, fontWeight: '800' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: IX.muted, fontSize: 20 },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, marginBottom: 4 },
  tab: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: IX.lineSoft, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabOn: { backgroundColor: 'rgba(13,148,136,0.85)', borderColor: IX.tealDeep },
  tabIcon: { fontSize: 15, color: IX.text },
  tabText: { color: IX.muted, fontSize: 11.5, fontWeight: '800' },
  tabTextOn: { color: '#e6fffb' },
  badge: { position: 'absolute', top: 3, right: 8, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: IX.amber, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#1a1204', fontSize: 10, fontWeight: '900' },
  fabWrap: { position: 'absolute', right: 20 },
  fab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 56, paddingHorizontal: 22, borderRadius: 28, backgroundColor: IX.tealDeep, elevation: 8, shadowColor: IX.tealDeep, shadowOpacity: 0.6, shadowRadius: 12 },
  fabPlus: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -3 },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '88%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  toastText: { color: IX.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});

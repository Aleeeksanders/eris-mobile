// ============================================================
// Eris Mobile — Finanzas 2.0 (nativa). Reemplaza a la versión web (HunterWalletScreen) con las mismas reglas
// (services/finance/financeCore.ts) y cara de terminal financiera.
//   - Primera vez con datos en la web: se migran comparando al peso (FinanceMigrator). Si algo no calza, sigue la web.
//   - Nunca configuró Finanzas: primer uso nativo (Onboarding).
// Secciones: Hoy · Movimientos · Cuentas · Plan · Análisis; el botón «+ Anotar» para todo lo que se anota; ? (guía) y ⚙.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar, BackHandler, ActivityIndicator, Animated, DeviceEventEmitter, Alert } from 'react-native';
import { listFinanceBackups, restoreFinanceBackup, fechaHora, RESTORE_OFFER_EVENT, type BackupCopy } from '../../services/financeBackup';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthStorage } from '../../services/AuthStorage';
import { financeStore } from '../../services/finance/financeStore';
import { FX } from './fx';
import { useFinanceState, useFinanceView } from './useFinance';
import FinanceMigrator, { type MigrationOutcome } from './FinanceMigrator';
import FinanceOnboarding from './Onboarding';
import FinanceSheets from './Sheets';
import Hoy from './tabs/Hoy';
import Movimientos from './tabs/Movimientos';
import Cuentas from './tabs/Cuentas';
import Plan from './tabs/Plan';
import Analisis from './tabs/Analisis';
import { useInbox } from './Inbox';
import { financeAuto, FINANCE_OPEN_TX_EVENT } from '../../services/finance/financeAuto';
import { financeCuadre, FINANCE_CUADRE_EVENT } from '../../services/finance/financeCuadre';
import { useCartolaImport } from './CartolaImport';
import GuidedTour, { type TourStep } from '../../components/tour/GuidedTour';
import { tourRef, measureTarget } from '../../components/tour/tourTargets';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HunterWalletScreen from '../HunterWalletScreen';
import type { SheetState, Act, Seccion } from './types';

interface Props { onExit?: () => void; active?: boolean; onReadyChange?: (ready: boolean) => void }
type Phase = 'loading' | 'migrating' | 'native' | 'onboarding' | 'web';
// Cinco secciones fijas, cada cosa en un solo lugar (2026-10-16: «más claro: dónde hacer cada cosa»); lo que se anota, en el +
const SECCIONES: Array<{ id: Seccion; titulo: string; corto: string; icon: string }> = [
  { id: 'hoy', titulo: 'Hoy', corto: 'Hoy', icon: '🏠' },
  { id: 'movs', titulo: 'Movimientos', corto: 'Movimientos', icon: '↕' },
  { id: 'cuentas', titulo: 'Cuentas', corto: 'Cuentas', icon: '🏦' },
  { id: 'plan', titulo: 'Plan', corto: 'Plan', icon: '🎯' },
  { id: 'analisis', titulo: 'Análisis', corto: 'Análisis', icon: '📊' },
];

export default function FinanceScreen({ onExit, active = true, onReadyChange }: Props) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('loading');
  const [profileId, setProfileId] = useState<string | null>(null);
  const readyRef = useRef(onReadyChange); readyRef.current = onReadyChange;

  useEffect(() => {
    (async () => {
      const creds = await AuthStorage.getCredentials().catch(() => null);
      setProfileId(creds?.profileId ?? 'anon');
      setPhase((await financeStore.exists()) ? 'native' : 'migrating');
    })();
  }, []);
  useEffect(() => { if (phase === 'native' || phase === 'onboarding') readyRef.current?.(true); }, [phase]);

  // Finanzas vacía en este teléfono y un respaldo con datos en el PC: se ofrece restaurarlo, una vez (revisión 2026-10-31,
  // D3: la oferta solo existía en la versión web, que ya no se abre). Igual que Forge.
  const offered = useRef(false);
  const ofrecer = useCallback((c: BackupCopy) => {
    if (offered.current || !(c?.stats?.tx > 0)) return;
    offered.current = true;
    Alert.alert('Tienes un respaldo de Finanzas', `En el PC hay una copia del ${fechaHora(c.at)} con ${c.stats.tx} movimientos y ${c.stats.cuentas} cuenta${c.stats.cuentas === 1 ? '' : 's'}, y Finanzas está vacía en este teléfono. ¿La restauro?`, [
      { text: 'Ahora no', style: 'cancel' },
      { text: 'Restaurar', onPress: async () => { const r = await restoreFinanceBackup(c.day); if (r.ok) setPhase('native'); Alert.alert(r.ok ? 'Finanzas restaurada' : 'No se pudo restaurar', r.message); } },
    ]);
  }, []);
  useEffect(() => {
    if (phase !== 'onboarding') return;
    listFinanceBackups().then((cs) => { if (cs && cs[0]) ofrecer(cs[0]); }).catch(() => {});
  }, [phase, ofrecer]);
  useEffect(() => { const sub = DeviceEventEmitter.addListener(RESTORE_OFFER_EVENT, ofrecer); return () => sub.remove(); }, [ofrecer]);

  const onMigrated = useCallback((o: MigrationOutcome) => {
    setPhase(o.kind === 'migrated' ? 'native' : o.kind === 'empty' ? 'onboarding' : 'web');
  }, []);

  if (phase === 'web') return <HunterWalletScreen onExit={onExit} active={active} onReadyChange={onReadyChange} />;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {active && <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />}
      {phase === 'migrating' && profileId && <FinanceMigrator profileId={profileId} onDone={onMigrated} />}
      {(phase === 'loading' || phase === 'migrating') && (
        <View style={s.center}><ActivityIndicator color={FX.violet} /><Text style={s.loading}>{phase === 'migrating' ? 'Pasando tus finanzas a la nueva versión…' : ''}</Text></View>
      )}
      {phase === 'onboarding' && <FinanceOnboarding onDone={() => setPhase('native')} />}
      {phase === 'native' && <NativeFinance onExit={onExit} active={active} />}
      {(phase === 'onboarding') && onExit && (
        <TouchableOpacity onPress={onExit} style={[s.close, { top: insets.top + 8 }]} accessibilityLabel="Cerrar Finanzas"><Text style={s.closeText}>✕</Text></TouchableOpacity>
      )}
    </View>
  );
}

const TOUR_KEY = 'finance_tour_v1';
const financeStoreHas = (id: unknown) => !!financeStore.get()?.tx.some((t) => t.id === id);

function NativeFinance({ onExit, active }: { onExit?: () => void; active: boolean }) {
  const S = useFinanceState();
  const V = useFinanceView(S);
  const [tab, setTab] = useState<Seccion>('hoy');
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [tour, setTour] = useState(false);
  const inbox = useInbox();
  const cartola = useCartolaImport(S);
  const fade = useRef(new Animated.Value(0)).current;
  const scroll = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    Animated.sequence([Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }), Animated.delay(2200), Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: true })]).start();
  }, [fade]);

  const act: Act = useCallback(async (fn) => {
    const r = await financeStore.act((W, ctx) => fn(W, ctx));
    if (!r) { showToast('Finanzas todavía no está lista', false); return false; }
    showToast(r.msg, r.ok);
    return r.ok;
  }, [showToast]);

  const irA = useCallback((sec: Seccion) => { setTab(sec); scroll.current?.scrollTo({ y: 0, animated: false }); }, []);

  // Los fijos que ya llegaron a su día se anotan al entrar (como hacía la web)
  useEffect(() => {
    if (!active) return;
    financeStore.applyScheduled().then((n) => { if (n) showToast(`↻ ${n} gasto${n !== 1 ? 's' : ''} fijo${n !== 1 ? 's' : ''} anotado${n !== 1 ? 's' : ''}`); }).catch(() => {});
  }, [active]);

  // «Cambiar» en la notificación de lo que Eris anotó sola: se abre ese movimiento
  const listo = !!S;
  useEffect(() => {
    if (!active || !listo) return;
    const abrir = () => {
      const id = financeAuto.takePendingOpen(); if (id != null && financeStoreHas(id)) { irA('hoy'); setSheet({ k: 'tx', id }); return; }
      // «Ver» del cuadre (la notificación o el Plan de Eris): la hoja «Cuadrar» de esa cuenta
      const c = financeCuadre.takePendingOpen(); if (c) { irA('hoy'); setSheet({ k: 'cuadrar', ref: c.ref }); }
    };
    abrir();
    const sub = DeviceEventEmitter.addListener(FINANCE_OPEN_TX_EVENT, () => setTimeout(abrir, 50));
    const sub2 = DeviceEventEmitter.addListener(FINANCE_CUADRE_EVENT, () => setTimeout(abrir, 50));
    return () => { sub.remove(); sub2.remove(); };
  }, [active, listo, irA]);

  // La primera vez: el recorrido (dónde está cada cosa). Después, desde la guía (?) o Ajustes.
  useEffect(() => {
    if (!active || !listo) return;
    let alive = true;
    AsyncStorage.getItem(TOUR_KEY).then((v) => {
      if (alive && !v) setTimeout(() => { if (alive) { irA('hoy'); setTour(true); } }, 700);
    }).catch(() => {});
    return () => { alive = false; };
  }, [active, listo, irA]);
  const finTour = useCallback(() => { setTour(false); AsyncStorage.setItem(TOUR_KEY, '1').catch(() => {}); }, []);
  const verTour = useCallback(() => { setSheet(null); irA('hoy'); setTimeout(() => setTour(true), 350); }, [irA]);

  // Atrás: primero cierra la hoja; después, Finanzas
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (sheet) { setSheet(null); return true; } onExit?.(); return true; });
    return () => sub.remove();
  }, [active, sheet, onExit]);

  if (!S || !V) return <View style={s.center}><ActivityIndicator color={FX.violet} /></View>;
  const props = { S, V, open: setSheet, act, irA, importarCartola: cartola.importar, leyendoCartola: cartola.leyendo };
  const seccion = SECCIONES.find((x) => x.id === tab) ?? SECCIONES[0];

  const pasos: TourStep[] = [
    { id: 'hola', title: 'Tus finanzas, ordenadas', text: 'Te muestro en 30 segundos dónde está cada cosa. Lo puedes volver a ver cuando quieras desde el ?.', locate: async () => null },
    { id: 'hero', title: 'Lo que puedes gastar', text: 'Hasta tu próximo sueldo, ya descontados los fijos que vienen, y cuánto te da por día. Arriba aparece lo que llegue para confirmar.', locate: () => measureTarget('fin.hero') },
    { id: 'anotar', title: 'Todo se anota acá', text: 'Un gasto, la foto de la boleta, lo que te entra, mover plata, ahorrar, prestar o importar la cartola: siempre parte en este botón.', locate: () => measureTarget('fin.fab') },
    { id: 'movs', title: 'Movimientos', text: 'Todo lo anotado, por mes. Toca uno para verlo o borrarlo.', locate: () => measureTarget('fin.tab.movs') },
    { id: 'cuentas', title: 'Cuentas', text: 'Tu plata: tus cuentas, tu efectivo (si lo agregas) y tu ahorro; no hay plata fuera de ahí. Aparte, tarjetas, lo que te deben y lo que falta ordenar.', locate: () => measureTarget('fin.tab.cuentas') },
    { id: 'plan', title: 'Plan', text: 'Tu sueldo (un día fijo o el último día hábil), lo que se repite cada mes con los descuentos por planilla, los topes por categoría y tus metas de ahorro.', locate: () => measureTarget('fin.tab.plan') },
    { id: 'analisis', title: 'Análisis', text: 'Para mirar en detalle: tu ritmo del mes, cada categoría contra el mes pasado, tu rating y 6 meses.', locate: () => measureTarget('fin.tab.analisis') },
    { id: 'ayuda', title: '¿Cómo hago…?', text: 'Acá está la guía con cada cosa paso a paso. En ⚙ están los avisos del banco y el respaldo. Y siempre puedes decirle a Eris «gasté 5 lucas en almuerzo».', locate: () => measureTarget('fin.help') },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>ERIS · FINANZAS</Text>
          <Text style={s.title}>{seccion.titulo}</Text>
        </View>
        <View ref={tourRef('fin.help')} collapsable={false} style={s.headBtns}>
          <TouchableOpacity onPress={() => setSheet({ k: 'guia' })} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="¿Cómo hago…? Guía de Finanzas"><Text style={s.iconText}>?</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setSheet({ k: 'ajustes' })} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Ajustes de Finanzas"><Text style={s.iconText}>⚙</Text></TouchableOpacity>
        </View>
        {onExit && <TouchableOpacity onPress={onExit} style={s.closeInline} accessibilityLabel="Cerrar Finanzas"><Text style={s.closeText}>✕</Text></TouchableOpacity>}
      </View>
      <View style={s.tabs} accessibilityRole="tablist">
        {SECCIONES.map((x) => {
          const on = tab === x.id;
          return (
            <View key={x.id} ref={tourRef(`fin.tab.${x.id}`)} collapsable={false} style={{ flex: 1 }}>
              <TouchableOpacity onPress={() => irA(x.id)} style={[s.tab, on && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={x.titulo}>
                <Text style={[s.tabIcon, !on && { opacity: 0.7 }]}>{x.icon}</Text>
                <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{x.corto}</Text>
                {x.id === 'hoy' && inbox.length > 0 && <View style={s.badge}><Text style={s.badgeText}>{inbox.length > 9 ? '9+' : inbox.length}</Text></View>}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {tab === 'hoy' && <Hoy {...props} inbox={inbox} />}
        {tab === 'movs' && <Movimientos {...props} />}
        {tab === 'cuentas' && <Cuentas {...props} />}
        {tab === 'plan' && <Plan {...props} />}
        {tab === 'analisis' && <Analisis {...props} />}
      </ScrollView>
      <View ref={tourRef('fin.fab')} collapsable={false} style={[s.fabWrap, { bottom: Math.max(22, insets.bottom + 14) }]}>
        <TouchableOpacity style={s.fab} onPress={() => setSheet({ k: 'menu' })} accessibilityLabel="Anotar: gasto, boleta, lo que entra, mover plata…" accessibilityRole="button">
          <Text style={s.fabPlus}>+</Text>
          <Text style={s.fabText}>Anotar</Text>
        </TouchableOpacity>
      </View>
      <FinanceSheets sheet={sheet} onClose={() => setSheet(null)} open={setSheet} S={S} V={V} act={act} irA={irA} importarCartola={cartola.importar} onTour={verTour} />
      {cartola.hojaClave}
      {tour && <GuidedTour steps={pasos} onDone={finTour} />}
      {toast && (
        <Animated.View pointerEvents="none" style={[s.toast, { opacity: fade, top: 8, backgroundColor: toast.ok ? '#1b1640' : '#3a1220', borderColor: toast.ok ? FX.violetDeep : FX.down }]}>
          <Text style={s.toastText}>{toast.msg}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: FX.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loading: { color: FX.muted, fontSize: 13 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  kicker: { color: FX.violet, fontFamily: FX.mono, fontSize: 10, letterSpacing: 2 },
  title: { color: FX.text, fontSize: 24, fontWeight: '900', marginTop: 2 },
  closeInline: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', right: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: FX.muted, fontSize: 20 },
  headBtns: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: FX.lineSoft, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: FX.muted, fontSize: 17, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: 4, paddingHorizontal: 12, marginBottom: 4 },
  tab: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: FX.lineSoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, gap: 2 },
  tabOn: { backgroundColor: 'rgba(124,58,237,0.85)', borderColor: FX.violetDeep },
  tabIcon: { fontSize: 15, color: FX.text },
  tabText: { color: FX.muted, fontSize: 11, fontWeight: '800' },
  tabTextOn: { color: '#ede7ff' },
  badge: { position: 'absolute', top: 3, right: 6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: FX.cyan, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#04121a', fontSize: 10, fontWeight: '900' },
  fabWrap: { position: 'absolute', right: 20 },
  fab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 56, paddingHorizontal: 22, borderRadius: 28, backgroundColor: FX.violetDeep, elevation: 8, shadowColor: FX.violetDeep, shadowOpacity: 0.6, shadowRadius: 12 },
  fabPlus: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -3 },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '88%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  toastText: { color: FX.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});

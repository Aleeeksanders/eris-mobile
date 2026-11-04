// ============================================================
// Forge 2.0 — la interfaz de Forge nativo: cabecera del RPG (rango, nivel, XP, racha), pestañas, avisos de XP, subir de
// nivel, la hoja de cada habilidad y la bienvenida. Sin módulos nativos de la app (ForgeScreen pone los datos del reloj,
// el servidor y el respaldo), así también se puede dibujar en un banco de prueba.
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Animated, BackHandler, DeviceEventEmitter, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as C from '../../services/forge/forgeCore';
import { FORGE_TOAST_EVENT } from '../../services/forge/forgeEvents';
import { FG, FONT, useForgeFonts, n0 } from './theme';
import { Icon } from './icons';
import { Bar, Btn, H, Label, P, Row, Sheet } from './ui';
import { useForgeState, useForgeAct } from './useForge';
import Hoy from './tabs/Hoy';
import Entrenar from './tabs/Entrenar';
import Personaje from './tabs/Personaje';
import Arbol from './tabs/Arbol';
import Arena from './tabs/Arena';
import Progreso from './tabs/Progreso';
import Rutina from './tabs/Rutina';
import SkillSheet from './SkillSheet';
import { ForgeUiCtx, type ForgeUi, type Tab } from './forgeUi';
import type { Readiness } from '../../services/sleep/sleepCore';

const L = C.L;

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'hoy', label: 'HOY', icon: 'Home' },
  { id: 'entrenar', label: 'ENTRENAR', icon: 'Dumbbell' },
  { id: 'personaje', label: 'PERSONAJE', icon: 'User' },
  { id: 'arbol', label: 'ÁRBOL', icon: 'GitBranch' },
  { id: 'arena', label: 'ARENA', icon: 'Swords' },
  { id: 'progreso', label: 'PROGRESO', icon: 'TrendingUp' },
  { id: 'rutina', label: 'RUTINA', icon: 'ScrollText' },
];

export default function ForgeShell({ onExit, exitLabel, active = true, ready = null }: { onExit?: () => void; exitLabel?: string; active?: boolean; ready?: Readiness | null }) {
  const fontsOk = useForgeFonts();
  const S = useForgeState();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('hoy');
  const [viewDay, setViewDay] = useState<string | null>(null);
  const [skill, setSkill] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ amount: number; label?: string; id: number } | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; rank: { name: string }; unlocked: any[] } | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const scroll = useRef<ScrollView>(null);
  const prevLevel = useRef<number | null>(null);

  const toast = useCallback((amount: number, label?: string) => {
    if (amount === 0 && !label) return;
    setToastMsg({ amount, label, id: Date.now() });
    fade.setValue(0);
    Animated.sequence([Animated.timing(fade, { toValue: 1, duration: 140, useNativeDriver: true }), Animated.delay(label ? 1500 : 900), Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: true })]).start();
  }, [fade]);

  // Lo que Eris armó por chat (forgeSync) se avisa acá
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(FORGE_TOAST_EVENT, (msg: string) => { toast(0, msg); if (/PLAN/.test(msg)) setTab('entrenar'); });
    return () => sub.remove();
  }, [toast]);

  // Subir de nivel (con las habilidades que se abren)
  const sum = S ? C.rpgSummary(S) : null;
  useEffect(() => {
    if (!sum) return;
    if (prevLevel.current != null && sum.level > prevLevel.current) {
      const from = prevLevel.current;
      setLevelUp({ level: sum.level, rank: sum.rank, unlocked: L.SKILLS.filter((sk: any) => sk.lvl > from && sk.lvl <= sum.level) });
    }
    prevLevel.current = sum.level;
  }, [sum?.level]);

  // Atrás: cierra la hoja abierta, vuelve a hoy o sale de Forge
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (skill) { setSkill(null); return true; }
      if (viewDay) { setViewDay(null); return true; }
      if (tab !== 'hoy') { setTab('hoy'); return true; }
      onExit?.();
      return true;
    });
    return () => sub.remove();
  }, [active, skill, viewDay, tab, onExit]);

  const goTab = useCallback((t: Tab) => { setTab(t); scroll.current?.scrollTo({ y: 0, animated: false }); }, []);
  const ui = useMemo<ForgeUi>(() => ({ tab, setTab: goTab, viewDay, setViewDay, toast, openSkill: setSkill, level: sum?.level ?? 1, ready }), [tab, goTab, viewDay, toast, sum?.level, ready]);

  if (!S || !sum || !fontsOk) return <View style={st.center}><ActivityIndicator color={FG.red} /></View>;

  const needsBody = S.bodyKg == null || S.heightCm == null || S.age == null || S.sex == null;
  const titleObj = S.title ? L.TITLES.find((t: any) => t.id === S.title) : null;
  const pct = sum.level >= L.MAX_LEVEL ? 100 : Math.min(100, Math.round((sum.xpInLevel / sum.xpForNext) * 100));

  return (
    <ForgeUiCtx.Provider value={ui}>
      <View style={{ flex: 1, backgroundColor: FG.bg }}>
        {onExit && (
          <View style={st.topBar}>
            <TouchableOpacity style={st.exitBtn} onPress={onExit} activeOpacity={0.75}><Text style={st.exitText}>← {exitLabel ?? 'Eris'}</Text></TouchableOpacity>
          </View>
        )}
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: tab === 'arbol' ? 0 : 16, paddingTop: 6, paddingBottom: 96 }} keyboardShouldPersistTaps="handled">
          {/* Cabecera: el RPG de siempre */}
          <View style={{ paddingHorizontal: tab === 'arbol' ? 16 : 0 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <View>
                <H size={40} color={FG.white} style={{ letterSpacing: 3 }}>FORGE</H>
                <Label size={11}>ACONDICIONAMIENTO · {sum.mastered}/{C.SKILL_COUNT} HABILIDADES</Label>
              </View>
              <View style={st.streak}>
                <Icon name="Flame" size={18} color={S.streak > 0 ? FG.orange : FG.dimmer} fill={S.streak > 0 ? FG.orange : 'none'} />
                <H size={24} color={FG.white}>{S.streak}</H>
                <Label size={9}>RACHA</Label>
              </View>
            </Row>
            <View style={st.rankCard}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Label size={10}>RANGO ACTUAL</Label>
                  <H size={28} color={FG.white}>{sum.rank.name}</H>
                  {titleObj ? <P size={12.5} color={FG.gold}>★ {titleObj.name}</P> : <P size={12.5}>{sum.rank.tag}</P>}
                </View>
                <View style={st.levelRing}>
                  <Label size={9}>NIVEL</Label>
                  <H size={34} color={FG.white} style={{ lineHeight: 34 }}>{sum.level}</H>
                  <Label size={9} color={FG.dim}>/ {L.MAX_LEVEL}</Label>
                </View>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 12, marginBottom: 6 }}>
                <Label size={11} color={FG.gold}>{sum.level >= L.MAX_LEVEL ? 'NIVEL MÁXIMO' : `XP ${n0(sum.xpInLevel)} / ${n0(sum.xpForNext)}`}</Label>
                <Label size={11}>{n0(sum.totalXp)} XP total</Label>
              </Row>
              <Bar pct={pct} color={FG.gold} height={12} />
            </View>
          </View>

          {tab === 'hoy' && <Hoy />}
          {tab === 'entrenar' && <Entrenar />}
          {tab === 'personaje' && <Personaje />}
          {tab === 'arbol' && <Arbol />}
          {tab === 'arena' && <Arena />}
          {tab === 'progreso' && <Progreso />}
          {tab === 'rutina' && <Rutina />}
        </ScrollView>

        {/* Pestañas */}
        <View style={[st.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <TouchableOpacity key={t.id} style={st.tabBtn} onPress={() => goTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Icon name={t.icon} size={18} color={on ? FG.red : FG.dim} />
                <Text style={[st.tabText, { color: on ? FG.white : FG.dim }]} numberOfLines={1}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* +XP */}
        {toastMsg && (
          <Animated.View pointerEvents="none" style={[st.toast, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
            {toastMsg.label ? <Text style={st.toastLabel}>{toastMsg.label}</Text> : null}
            {toastMsg.amount !== 0 ? <H size={30} color={toastMsg.amount >= 0 ? FG.gold : FG.pink}>{toastMsg.amount >= 0 ? `+${toastMsg.amount}` : toastMsg.amount} XP</H> : null}
          </Animated.View>
        )}

        <SkillSheet id={skill} onClose={() => setSkill(null)} />

        {/* Subiste de nivel */}
        <Sheet visible={!!levelUp} onClose={() => setLevelUp(null)} center>
          {levelUp && (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Icon name="Trophy" size={44} color={FG.gold} />
              <Label size={13} color={FG.gold}>SUBISTE DE NIVEL</Label>
              <H size={72} color={FG.white} style={{ lineHeight: 72 }}>{levelUp.level}</H>
              <H size={26} color={FG.red}>{levelUp.rank.name}</H>
              {levelUp.unlocked.length > 0 && (
                <View style={{ alignSelf: 'stretch', marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: FG.panel2, borderWidth: 1, borderColor: FG.line2, gap: 4 }}>
                  <Label size={11} color={FG.gold}>✨ NUEVAS HABILIDADES</Label>
                  {levelUp.unlocked.slice(0, 5).map((u) => <P key={u.id} color={FG.text}>{u.emoji} {u.name}</P>)}
                  {levelUp.unlocked.length > 5 && <P>+{levelUp.unlocked.length - 5} más…</P>}
                </View>
              )}
              <Btn title="CONTINUAR" onPress={() => setLevelUp(null)} style={{ marginTop: 14, alignSelf: 'stretch' }} />
            </View>
          )}
        </Sheet>

        {needsBody && <Welcome />}
      </View>
    </ForgeUiCtx.Provider>
  );
}

/** Bienvenida: el cuerpo, para estimar el gasto (la del HTML). */
function Welcome() {
  const act = useForgeAct();
  const [w, setW] = useState(''); const [h, setH] = useState(''); const [a, setA] = useState(''); const [sex, setSex] = useState<'h' | 'm' | null>(null);
  const W = parseFloat(w.replace(',', '.')), Hh = parseFloat(h), A = parseFloat(a);
  const ok = W >= 30 && Hh >= 100 && A >= 12 && !!sex;
  const bmr = ok ? Math.round(10 * W + 6.25 * Hh - 5 * A + (sex === 'h' ? 5 : -161)) : null;
  const field = (label: string, v: string, set: (x: string) => void, ph: string) => (
    <View style={{ flex: 1 }}>
      <Label size={11}>{label}</Label>
      <TextInput value={v} onChangeText={set} keyboardType="decimal-pad" placeholder={ph} placeholderTextColor={FG.dimmer} style={st.input} />
    </View>
  );
  return (
    <View style={st.welcome}>
      <View style={st.welcomeCard}>
        <Text style={{ fontSize: 40, textAlign: 'center' }}>🥷</Text>
        <H size={30} style={{ textAlign: 'center' }}>BIENVENIDO, HUNTER</H>
        <P style={{ textAlign: 'center', marginBottom: 12 }}>Necesito unos datos para estimar tu gasto calórico (basal + entrenamiento). Puedes cambiarlos cuando quieras.</P>
        <Row gap={10}>{field('PESO (kg)', w, setW, '77')}{field('ALTURA (cm)', h, setH, '178')}</Row>
        <Row gap={10} style={{ marginTop: 10, alignItems: 'flex-end' }}>
          {field('EDAD', a, setA, '27')}
          <View style={{ flex: 1 }}>
            <Label size={11}>SEXO</Label>
            <Row gap={6} style={{ marginTop: 5 }}>
              {([['h', 'Hombre'], ['m', 'Mujer']] as const).map(([v, t]) => (
                <TouchableOpacity key={v} onPress={() => setSex(v)} style={[st.sexBtn, sex === v && { borderColor: FG.red, backgroundColor: FG.red + '22' }]}><Text style={{ fontFamily: FONT.bodyBold, color: sex === v ? FG.white : FG.muted }}>{t}</Text></TouchableOpacity>
              ))}
            </Row>
          </View>
        </Row>
        {bmr ? <P style={{ textAlign: 'center', marginTop: 12 }} color={FG.text}>Gasto basal estimado: <Text style={{ color: FG.gold }}>{bmr} kcal/día</Text></P> : null}
        <Btn title="EMPEZAR" disabled={!ok} onPress={() => act((s) => ({ ...s, bodyKg: Math.min(250, Math.max(30, W)), heightCm: Math.min(250, Math.max(100, Hh)), age: Math.min(100, Math.max(12, A)), sex }), 'cuerpo')} style={{ marginTop: 14 }} />
        <P size={11.5} style={{ textAlign: 'center', marginTop: 10 }} color={FG.dim}>⚕️ Estimaciones aproximadas, no sustituyen criterio médico.</P>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: FG.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: FG.bg },
  loading: { color: FG.muted, fontSize: 13 },
  topBar: { height: 44, justifyContent: 'center', paddingHorizontal: 16 },
  exitBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(34,211,238,0.4)', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: 'rgba(12,11,14,0.85)' },
  exitText: { color: '#22d3ee', fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },
  streak: { alignItems: 'center', backgroundColor: FG.panel, borderWidth: 1, borderColor: FG.line, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 14 },
  rankCard: { backgroundColor: FG.panel, borderWidth: 1, borderColor: FG.line, borderRadius: 16, padding: 16, marginBottom: 14 },
  levelRing: { width: 78, height: 78, borderRadius: 39, borderWidth: 2, borderColor: FG.red, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1d1620' },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: '#0f0d12', borderTopWidth: 1, borderTopColor: FG.line, paddingTop: 8 },
  tabBtn: { flex: 1, alignItems: 'center', gap: 3 },
  tabText: { fontFamily: FONT.bodyBold, fontSize: 9.5, letterSpacing: 0.5 },
  toast: { position: 'absolute', top: 120, alignSelf: 'center', alignItems: 'center', backgroundColor: 'rgba(21,19,26,0.97)', borderWidth: 1, borderColor: FG.gold + '55', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 20 },
  toastLabel: { fontFamily: FONT.bodyBold, color: FG.white, fontSize: 14, letterSpacing: 1 },
  welcome: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,5,8,0.94)', justifyContent: 'center', padding: 20 },
  welcomeCard: { backgroundColor: '#17131c', borderWidth: 1, borderColor: FG.red + '55', borderRadius: 20, padding: 22 },
  input: { marginTop: 5, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.bg, color: FG.white, fontFamily: FONT.display, fontSize: 24 },
  sexBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: FG.line2, backgroundColor: FG.bg },
});

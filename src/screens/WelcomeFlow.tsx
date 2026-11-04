// ============================================================
// Eris Mobile — bienvenida (1 minuto)
//
// Pedido del usuario (2026-10-10): "es la más completa que he visto, pero la gente tiene que poder digerirla facilito".
// Antes alguien nuevo entraba y veía todo de golpe, incluidos módulos que no le interesaban. Ahora, la primera vez:
//   1. hola (qué es Eris, en una frase)
//   2. qué quiere mejorar → solo esos módulos quedan abajo (Nutrición, Forge, Finanzas; Inicio y Métricas siempre)
//   3. a qué hora se levanta → el horario de comidas y el día de comida (services/daySchedule.ts; el reloj, si existe,
//      lo ajusta solo y manda sobre esto)
//   4. conectar el reloj (Health Connect, el diálogo nativo con todos los permisos)
//   5. cómo quiere que le hable (2026-10-14: cercano con humor, cercano y directo, o de usted; la edad que conoce Forge
//      solo preselecciona uno, y se ve el mismo aviso en los tres tonos — services/tone.ts)
//   6. cómo se usa (háblale como a una persona; Inicio dice qué hacer ahora)
// Se muestra una vez por perfil (eris_welcome_done_<perfil>); el creador la puede volver a ver desde Perfil.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, R } from '../config/design';
import { daySchedule } from '../services/daySchedule';
import { metricsService } from '../services/MetricsService';
import { TONE_OPTIONS, DEFAULT_TONE, getTone, setTone, askSuggestedTone, type Tone } from '../services/tone';

export const WELCOME_EVENT = 'ERIS_SHOW_WELCOME';

const GOALS = [
  { id: 'comer', icon: '🍽️', title: 'Comer mejor', sub: 'Anotas lo que comes y te guío', modules: ['nutri'] },
  { id: 'dormir', icon: '😴', title: 'Dormir mejor', sub: 'Tu sueño y tu reloj interno', modules: [] as string[] },
  { id: 'entrenar', icon: '💪', title: 'Entrenar', sub: 'Forge: misiones y progreso', modules: ['toji'] },
  { id: 'plata', icon: '💰', title: 'Ordenar mi plata', sub: 'Gastos, sueldo y ahorro', modules: ['finanzas'] },
];
const CHOOSABLE = ['nutri', 'toji', 'finanzas'];
const MODULE_NAME: Record<string, string> = { nutri: 'Nutrición', toji: 'Forge', finanzas: 'Finanzas' };
const WAKE_OPTIONS = [5.5, 6.5, 7.5, 8.5, 9.5, 11];
const fmt = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const STEPS = 6;
const TONE_STEP = 4;

export default function WelcomeFlow({ initialModules, onDone }: { initialModules: string[]; onDone: (modules: string[]) => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState<Set<string>>(() => new Set([
    'dormir',
    ...(initialModules.includes('nutri') ? ['comer'] : []),
    ...(initialModules.includes('toji') ? ['entrenar'] : []),
    ...(initialModules.includes('finanzas') ? ['plata'] : []),
  ]));
  const [wake, setWake] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [hc, setHc] = useState<'idle' | 'busy' | 'ok' | 'no'>('idle');
  // Tono: el que ya eligió (si vuelve a ver la bienvenida), si no el que sugiere su edad (Forge), si no cercano y directo
  const [tone, setToneSel] = useState<Tone>(DEFAULT_TONE);
  const [suggested, setSuggested] = useState<Tone | null>(null);
  const toneTouched = useRef(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const mine = await getTone();
      if (mine) { if (alive && !toneTouched.current) setToneSel(mine); return; }
      const s = await askSuggestedTone();
      if (alive && s) { setSuggested(s); if (!toneTouched.current) setToneSel(s); }
    })().catch(() => {});
    return () => { alive = false; };
  }, []);

  // Entrada de cada paso (aparece subiendo) y el orbe de Eris que respira
  const enter = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [step]);
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const chosenModules = () => GOALS.filter((g) => goals.has(g.id)).flatMap((g) => g.modules);
  const finish = () => {
    // Inicio y Métricas siempre; lo elegido; y lo que tenía que no se elige acá (p. ej. Glucosa, si estaba)
    const keep = initialModules.filter((m) => !CHOOSABLE.includes(m) && m !== 'pulso' && m !== 'metricas');
    onDone([...new Set(['pulso', 'metricas', ...chosenModules(), ...keep])]);
  };
  const next = async () => {
    if (step === 2) {
      let h = wake;
      if (customOpen) {
        const m = custom.trim().match(/^(\d{1,2})(?:[:.h](\d{2}))?$/);
        const v = m ? Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0) : NaN;
        h = v >= 0 && v < 24 ? v : null;
      }
      if (h != null) await daySchedule.setHint(h);
    }
    if (step === TONE_STEP) await setTone(tone);
    if (step === STEPS - 1) { finish(); return; }
    setStep((s) => s + 1);
  };
  const connect = async () => {
    setHc('busy');
    const r = await metricsService.requestAllPermissions().catch(() => null);
    setHc(r && r.ok && r.granted.length > 0 ? 'ok' : 'no');
  };
  const toggle = (id: string) => setGoals((g) => { const n = new Set(g); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const anim = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  };
  const orbScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const haloOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.5] });

  const primaryLabel = step === 0 ? 'Empezar' : step === 3 ? (hc === 'ok' ? 'Siguiente' : 'Conectar') : step === STEPS - 1 ? 'Listo, empecemos' : 'Siguiente';
  const onPrimary = step === 3 && hc !== 'ok' ? connect : next;
  const secondary = step === 2 ? 'Saltar' : step === 3 && hc !== 'ok' ? 'Ahora no' : null;
  const mods = chosenModules();

  return (
    <KeyboardAvoidingView style={[st.root, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Progreso */}
      <View style={st.dots}>
        {Array.from({ length: STEPS }, (_, i) => (
          <View key={i} style={[st.dot, i === step && st.dotOn, i < step && st.dotDone]} />
        ))}
      </View>

      <Animated.View style={[st.body, anim]}>
        {step === 0 && (
          <View style={st.center}>
            <View style={st.orbWrap}>
              <Animated.View style={[st.halo, { opacity: haloOpacity, transform: [{ scale: orbScale }] }]} />
              <Animated.Image source={require('../../assets/icon.png')} style={[st.orb, { transform: [{ scale: orbScale }] }]} />
            </View>
            <Text style={st.hello}>Hola, soy Eris</Text>
            <Text style={st.lead}>Te acompaño a cuidar tu día: comida, agua, sueño, entrenamiento y plata.</Text>
            <Text style={st.leadMuted}>En un minuto la dejo a tu medida.</Text>
          </View>
        )}

        {step === 1 && (
          <View>
            <Text style={st.title}>¿Qué quieres mejorar?</Text>
            <Text style={st.sub}>Elige lo que te importe ahora. Lo cambias cuando quieras en Perfil.</Text>
            <View style={st.grid}>
              {GOALS.map((g) => {
                const on = goals.has(g.id);
                return (
                  <TouchableOpacity key={g.id} activeOpacity={0.8} onPress={() => toggle(g.id)} style={[st.goal, on && st.goalOn]}>
                    <View style={st.goalTop}>
                      <Text style={st.goalIcon}>{g.icon}</Text>
                      <View style={[st.check, on && st.checkOn]}>{on && <Text style={st.checkMark}>✓</Text>}</View>
                    </View>
                    <Text style={st.goalTitle}>{g.title}</Text>
                    <Text style={st.goalSub}>{g.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={st.title}>¿A qué hora te levantas normalmente?</Text>
            <Text style={st.sub}>Con esto ordeno tus comidas y tu día. Si usas reloj, lo ajusto solo.</Text>
            <View style={st.chips}>
              {WAKE_OPTIONS.map((h) => {
                const on = !customOpen && wake === h;
                return (
                  <TouchableOpacity key={h} activeOpacity={0.8} onPress={() => { setWake(h); setCustomOpen(false); }} style={[st.chip, on && st.chipOn]}>
                    <Text style={[st.chipText, on && st.chipTextOn]}>{fmt(h)}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity activeOpacity={0.8} onPress={() => setCustomOpen(true)} style={[st.chip, customOpen && st.chipOn]}>
                <Text style={[st.chipText, customOpen && st.chipTextOn]}>Más tarde o por turnos</Text>
              </TouchableOpacity>
            </View>
            {customOpen && (
              <TextInput
                style={st.input}
                value={custom}
                onChangeText={setCustom}
                placeholder="13:00"
                placeholderTextColor={T.textMuted}
                keyboardType="numbers-and-punctuation"
                autoFocus
              />
            )}
          </View>
        )}

        {step === 3 && (
          <View style={st.center}>
            <Text style={st.bigIcon}>{hc === 'ok' ? '✅' : '⌚'}</Text>
            <Text style={st.titleCenter}>{hc === 'ok' ? 'Listo, conectado' : 'Conecta tu reloj o teléfono'}</Text>
            <Text style={st.subCenter}>
              {hc === 'ok'
                ? 'Ya veo tus pasos, tu sueño y tu pulso.'
                : 'Leo tus pasos, sueño y pulso desde Health Connect, para no tener que preguntarte. Lo que anotes acá también queda guardado ahí.'}
            </Text>
            {hc === 'no' && <Text style={st.warn}>No se pudo conectar ahora. Puedes hacerlo después desde Perfil.</Text>}
          </View>
        )}

        {step === TONE_STEP && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={st.toneScroll} showsVerticalScrollIndicator={false}>
            <Text style={st.title}>¿Cómo quieres que te hable?</Text>
            <Text style={st.sub}>Es lo mismo, dicho a tu manera. Lo cambias cuando quieras en Perfil.</Text>
            <View style={st.tones}>
              {TONE_OPTIONS.map((o) => {
                const on = tone === o.id;
                return (
                  <TouchableOpacity key={o.id} activeOpacity={0.85} onPress={() => { toneTouched.current = true; setToneSel(o.id); }} style={[st.toneCard, on && st.goalOn]}>
                    <View style={st.toneHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={st.goalTitle}>{o.label}</Text>
                        <Text style={st.goalSub}>{suggested === o.id ? `${o.sub} · sugerido para ti` : o.sub}</Text>
                      </View>
                      <View style={[st.check, on && st.checkOn]}>{on && <Text style={st.checkMark}>✓</Text>}</View>
                    </View>
                    <View style={st.bubble}><Text style={st.bubbleText}>{o.example}</Text></View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {step === STEPS - 1 && (
          <View>
            <Text style={st.title}>Así me usas</Text>
            <View style={st.tips}>
              <View style={st.tip}>
                <Text style={st.tipIcon}>💬</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.tipTitle}>Háblame como a una persona</Text>
                  <Text style={st.tipSub}>«Anota un pan con palta», «¿cómo voy?», «¿qué ceno?». Por escrito o por voz.</Text>
                </View>
              </View>
              <View style={st.tip}>
                <Text style={st.tipIcon}>⏱️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.tipTitle}>Inicio te dice qué hacer ahora</Text>
                  <Text style={st.tipSub}>Una cosa a la vez. El detalle está en «Ver más».</Text>
                </View>
              </View>
              <View style={st.tip}>
                <Text style={st.tipIcon}>🧭</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.tipTitle}>Tus módulos, abajo</Text>
                  <Text style={st.tipSub}>
                    {mods.length ? `${mods.map((m) => MODULE_NAME[m]).join(', ')}, además de Inicio y Métricas.` : 'Inicio y Métricas. Puedes sumar más en Perfil.'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </Animated.View>

      <View style={st.footer}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPrimary}
          disabled={hc === 'busy'}
          style={[st.primary, step === 2 && wake == null && !customOpen && st.primaryDim]}
        >
          <Text style={st.primaryText}>{hc === 'busy' ? 'Conectando…' : primaryLabel}</Text>
        </TouchableOpacity>
        {secondary ? (
          <TouchableOpacity activeOpacity={0.7} onPress={() => setStep((s) => s + 1)} style={st.secondary}>
            <Text style={st.secondaryText}>{secondary}</Text>
          </TouchableOpacity>
        ) : step > 0 ? (
          <TouchableOpacity activeOpacity={0.7} onPress={() => setStep((s) => Math.max(0, s - 1))} style={st.secondary}>
            <Text style={st.secondaryText}>Atrás</Text>
          </TouchableOpacity>
        ) : <View style={st.secondary} />}
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: T.bg, paddingHorizontal: 22, zIndex: 50, elevation: 50 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)' },
  dotOn: { width: 22, backgroundColor: T.accent },
  dotDone: { backgroundColor: 'rgba(34,211,238,0.45)' },
  body: { flex: 1, justifyContent: 'center' },
  center: { alignItems: 'center' },
  orbWrap: { width: 190, height: 190, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  halo: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(52,211,153,0.16)' },
  orb: { width: 170, height: 170, borderRadius: 85 },
  hello: { color: T.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.8, marginBottom: 10 },
  lead: { color: T.textLight, fontSize: 16, fontWeight: '600', textAlign: 'center', lineHeight: 23, paddingHorizontal: 8 },
  leadMuted: { color: T.textMuted, fontSize: 14, fontWeight: '500', textAlign: 'center', marginTop: 10 },
  title: { color: T.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.6, lineHeight: 31 },
  sub: { color: T.textLight, fontSize: 14, fontWeight: '500', marginTop: 8, marginBottom: 20, lineHeight: 20 },
  titleCenter: { color: T.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.6, textAlign: 'center', marginTop: 14 },
  subCenter: { color: T.textLight, fontSize: 15, fontWeight: '500', textAlign: 'center', marginTop: 10, lineHeight: 22, paddingHorizontal: 6 },
  warn: { color: T.gold, fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 14 },
  bigIcon: { fontSize: 64 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  goal: {
    width: '47.8%', padding: 14, borderRadius: R.lg, backgroundColor: T.bgCard,
    borderWidth: 1, borderColor: T.border, minHeight: 128,
  },
  goalOn: { borderColor: T.borderActive, backgroundColor: 'rgba(34,211,238,0.07)' },
  goalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  goalIcon: { fontSize: 26 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: T.accent, borderColor: T.accent },
  checkMark: { color: T.bg, fontSize: 13, fontWeight: '900' },
  goalTitle: { color: T.text, fontSize: 15, fontWeight: '800' },
  goalSub: { color: T.textMuted, fontSize: 12, fontWeight: '500', marginTop: 3, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: R.full, backgroundColor: T.bgCard, borderWidth: 1, borderColor: T.border },
  chipOn: { borderColor: T.accent, backgroundColor: T.accentGlow },
  chipText: { color: T.textLight, fontSize: 15, fontWeight: '700' },
  chipTextOn: { color: T.accent },
  input: {
    marginTop: 16, backgroundColor: T.bgInput, borderRadius: R.md, borderWidth: 1, borderColor: T.borderActive,
    color: T.text, fontSize: 20, fontWeight: '800', paddingHorizontal: 16, paddingVertical: 12, width: 140,
  },
  toneScroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 8 },
  tones: { gap: 12 },
  toneCard: { padding: 14, borderRadius: R.lg, backgroundColor: T.bgCard, borderWidth: 1, borderColor: T.border, gap: 10 },
  toneHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bubble: { backgroundColor: T.bgInput, borderRadius: R.lg, borderTopLeftRadius: 4, padding: 12 },
  bubbleText: { color: T.textLight, fontSize: 13, lineHeight: 19 },
  tips: { gap: 14, marginTop: 18 },
  tip: { flexDirection: 'row', gap: 14, padding: 14, borderRadius: R.lg, backgroundColor: T.bgCard, borderWidth: 1, borderColor: T.border },
  tipIcon: { fontSize: 24 },
  tipTitle: { color: T.text, fontSize: 15, fontWeight: '800' },
  tipSub: { color: T.textLight, fontSize: 13, fontWeight: '500', marginTop: 3, lineHeight: 18 },
  footer: { gap: 6 },
  primary: { backgroundColor: T.accent, borderRadius: R.lg, paddingVertical: 16, alignItems: 'center' },
  primaryDim: { opacity: 0.45 },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  secondary: { alignItems: 'center', paddingVertical: 12, minHeight: 44 },
  secondaryText: { color: T.textMuted, fontSize: 14, fontWeight: '700' },
});

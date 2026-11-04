// ============================================================
// Eris Mobile — "Ahora" (Inicio)
//
// Inicio más simple (2026-10-10, pedido del usuario: "que la gente lo pueda digerir facilito"): en vez de varias tarjetas
// con números, UNA cosa que hacer ahora, con su botón. Se elige por prioridad según el reloj interno (dayModel):
//   1. una comida principal cuya hora ya va avanzada y no está anotada ("¿Ya almorzaste?")
//   2. agua atrasada respecto de lo esperable a esta hora de TU día (+250 ml sin salir de Inicio)
//   3. de noche, cómo estuvo el día (ánimo en un toque; alimenta el análisis personal)
//   4. a la tarde-noche, proteína muy por debajo de la meta
//   5. el sueño cerca / la luz de la mañana / el último café
// Sueño 2.0 · S3 (2026-10-29): en la mañana, tras una noche corta o partida, UNA recomendación del día (sleepDayTip: la comida
// primero, con diabetes el azúcar); un café anotado después de su hora límite; la hora para acostarse es la de Sueño.
//   6. si no hay nada: "vas bien" y qué viene
// Abajo, siempre, el análisis completo de Eris ("¿Qué hago ahora?").
// ============================================================

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T, R } from '../../config/design';
import { wsManager } from '../../services/WebSocketManager';
import { fmtHour } from '../../services/mealSchedule';
import { expectedWater, MEAL_TITLE, type DayModel } from './dayModel';
import { durTxt } from '../InternalClock';
import { lateCaffeine, hhmmOf, type DayTip, type SleepInsights } from '../../services/sleep/sleepCore';
import { NOTIFICATION_OPEN_EVENT } from '../../services/ErisNotifications';
import type { PlanStep } from '../../services/dayPlan/dayPlanStore';

const fmtL = (l: number) => `${(Math.round(l * 10) / 10).toString().replace('.', ',')} L`;
const isoToday = (d: Date = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MOODS = [{ score: 1, emoji: '😞' }, { score: 2, emoji: '😕' }, { score: 3, emoji: '😐' }, { score: 4, emoji: '🙂' }, { score: 5, emoji: '😄' }];
const VERB: Record<string, [string, string]> = {
  desayuno: ['¿Ya desayunaste?', 'desayuno'], almuerzo: ['¿Ya almorzaste?', 'almuerzo'], once: ['¿Ya tomaste once?', 'once'], cena: ['¿Ya cenaste?', 'cena'],
};

type Action = { label: string; kind: 'primary' | 'ghost'; onPress: () => void };
interface Item { icon: string; title: string; sub: string; actions?: Action[]; mood?: boolean }

export default function NowCard({
  m, hydration, waterGoal, protein, proteinGoal, personaName, onAsk, onLogFood, sleepTip, sleepIns, onOpenSleep, planStep, onPlanDone, onPlanSwap,
}: {
  m: DayModel; hydration: number | null; waterGoal: number; protein: number; proteinGoal: number;
  personaName: string; onAsk: (msg: string) => void; onLogFood: () => void;
  sleepTip?: DayTip | null; sleepIns?: SleepInsights | null; onOpenSleep?: () => void;
  /** el plan de Eris (Eris al timón): lo que toca ahora, con un toque */
  planStep?: PlanStep | null; onPlanDone?: (id: string) => void; onPlanSwap?: (slot: string) => void;
}) {
  const [moodDone, setMoodDone] = useState(false);
  const [tipSeen, setTipSeen] = useState(true);
  useEffect(() => { AsyncStorage.getItem(`eris_sleeptip_seen_${isoToday()}`).then((v) => setTipSeen(!!v)).catch(() => setTipSeen(false)); }, [m.wake]);
  const seeTip = () => { setTipSeen(true); AsyncStorage.setItem(`eris_sleeptip_seen_${isoToday()}`, '1').catch(() => {}); };
  const [flash, setFlash] = useState<string | null>(null);

  // ¿Ya contó cómo estuvo su día? (desde acá, desde el bloc de notas o por chat). Revisión N2 (2026-11-04): la clave del
  // día se fijaba al abrir Inicio; abierto pasada la medianoche, el ánimo de hoy quedaba en la clave de ayer y la pregunta
  // no volvía. Ahora se vuelve a mirar cuando cambia el día y cada respuesta va a la clave del día en que llega.
  const hoy = isoToday(m.now);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(`eris_mood_logged_${hoy}`).then((v) => { if (alive) setMoodDone(!!v); }).catch(() => {});
    const off = wsManager.subscribeMessage((d: any) => {
      const today = isoToday();
      if (d?.type === 'journal_entry_added' || (d?.type === 'about_me' && Array.isArray(d.journal) && d.journal.some((e: any) => e?.date === today))) {
        setMoodDone(true);
        AsyncStorage.setItem(`eris_mood_logged_${today}`, '1').catch(() => {});
      }
    });
    return () => { alive = false; off(); };
  }, [hoy]);

  const say = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 3500); };
  // Revisión N2: decía «Anoté» sin esperar al servidor (si la conexión se caía justo, no quedaba nada). Ahora espera su
  // respuesta; si no llega, no reintenta solo (podría quedar dos veces) y dice dónde revisarlo.
  const [waterBusy, setWaterBusy] = useState(false);
  const addWater = () => {
    if (wsManager.getStatus() !== 'connected') { onLogFood(); return; }
    if (waterBusy) return;
    setWaterBusy(true);
    setFlash('Anotando 250 ml…');
    let listo = false;
    const fin = (msg: string) => { if (listo) return; listo = true; off(); clearTimeout(t); setWaterBusy(false); say(msg); };
    const off = wsManager.subscribeMessage((d: any) => {
      if (d?.type === 'water_quick_logged') fin(d.ok ? 'Anoté 250 ml de agua 💧' : 'No pude anotarlo: inténtalo de nuevo o anótalo en Nutrición.');
    });
    const t = setTimeout(() => fin('No me llegó la confirmación: revisa tu agua en Nutrición antes de volver a anotarla.'), 10_000);
    wsManager.sendMessage({ type: 'log_water_quick', ml: 250 });
  };
  const logMood = (score: number) => {
    wsManager.sendMessage({ type: 'add_journal_entry', moodScore: score });
    setMoodDone(true);
    AsyncStorage.setItem(`eris_mood_logged_${isoToday()}`, '1').catch(() => {});
    say('Guardado. Gracias por contarme 🙌');
  };

  const water = hydration ?? 0;
  const expW = expectedWater(m, waterGoal);
  const evening = m.toBed < 4;
  const ate = (slot: string) => m.meals.some((x) => x.slot === slot);

  const pick = (): Item => {
    if (m.asleepNow) {
      return { icon: '🌙', title: 'Ya es tu noche', sub: `Pasaste tu hora habitual de dormir (${fmtHour(m.wake + m.awake)}). Descansar hoy te ordena mañana.` };
    }
    // 0. El plan de Eris: la comida o el entreno que toca ahora (desde media hora antes), con un toque
    const ps = planStep;
    const hNow = m.now.getHours() + m.now.getMinutes() / 60;
    if (ps && ps.hora != null && hNow >= ps.hora - 0.5 && hNow <= ps.hora + 2.5) {
      const a = ps.accion;
      if (a.type === 'log_food') {
        return { icon: ps.titulo.split(' ')[0], title: `${ps.titulo.replace(/^\S+\s/, '')}: lo del plan`, sub: ps.detalle,
          actions: [
            { label: 'Lo comí', kind: 'primary', onPress: () => { onPlanDone?.(ps.id); say('Anotado tal cual 🙌'); } },
            ...(a.opciones.length > 1 ? [{ label: 'Otra opción', kind: 'ghost' as const, onPress: () => onPlanSwap?.(a.slot) }] : []),
          ] };
      }
      if (a.type === 'load_routine') {
        return { icon: '🏋️', title: ps.titulo.replace(/^\S+\s/, ''), sub: ps.detalle,
          actions: [{ label: 'Ir a Forge', kind: 'primary', onPress: () => DeviceEventEmitter.emit(NOTIFICATION_OPEN_EVENT, { kind: 'plan', action: '', tap: 'forge' }) }] };
      }
      // ⚡ El día exigente: el café, la siesta-café o el bloque de foco, desde un cuarto de hora antes
      if (a.type === 'cue' && hNow >= ps.hora - 0.25) {
        return { icon: ps.titulo.split(' ')[0], title: ps.titulo.replace(/^\S+\s/, ''), sub: ps.detalle,
          actions: [{ label: 'Hecho', kind: 'primary', onPress: () => { onPlanDone?.(ps.id); say('Listo 💪'); } }] };
      }
    }
    // 1. Una comida principal avanzada sin anotar
    const cur = m.current;
    if (cur && VERB[cur.s] && m.relNow - cur.a >= 0.75 && !ate(cur.s)) {
      const [title, noun] = VERB[cur.s];
      return {
        icon: '🍽️', title, sub: 'Anótalo y llevo tu día al día.',
        actions: [
          { label: 'Anotar', kind: 'primary', onPress: onLogFood },
          { label: 'Pedir ideas', kind: 'ghost', onPress: () => onAsk(`¿Qué como de ${noun}? Dame 2 ideas según lo que me falta hoy.`) },
        ],
      };
    }
    // 2. Agua atrasada
    if (waterGoal > 0 && expW - water >= 0.4) {
      return {
        icon: '💧', title: `Toma agua: vas ~${fmtL(expW - water)} atrás`,
        sub: `A esta hora de tu día lo esperable es ~${fmtL(expW)}; llevas ${fmtL(water)}.`,
        actions: [
          { label: '+250 ml', kind: 'primary', onPress: addWater },
          { label: 'Otra cantidad', kind: 'ghost', onPress: onLogFood },
        ],
      };
    }
    // 2b. En la mañana, tras una noche corta o partida: UNA recomendación del día (una vez)
    if (sleepTip && !tipSeen && m.relNow < 4) {
      return {
        icon: '😴', title: sleepTip.title, sub: sleepTip.sub,
        actions: [
          { label: 'Entendido', kind: 'primary', onPress: seeTip },
          ...(onOpenSleep ? [{ label: 'Ver mi sueño', kind: 'ghost' as const, onPress: () => { seeTip(); onOpenSleep(); } }] : []),
        ],
      };
    }
    // 3. Cómo estuvo el día (de noche, una vez)
    if (evening && !moodDone) {
      return { icon: '✨', title: '¿Cómo estuvo tu día?', sub: 'Un toque y lo guardo: me ayuda a entender qué te hace bien.', mood: true };
    }
    // 4. Proteína muy baja a la tarde-noche
    if (proteinGoal > 0 && m.relNow >= m.awake * 0.6 && protein < proteinGoal * 0.6 && m.meals.length > 0) {
      return {
        icon: '🥚', title: `Te falta proteína: ~${Math.round(proteinGoal - protein)} g`,
        sub: 'Súmala en tu próxima comida.',
        actions: [{ label: 'Pedir ideas', kind: 'primary', onPress: () => onAsk('Me falta proteína hoy. ¿Qué como para completarla?') }],
      };
    }
    // 4b. Un café (o bebida con cafeína) anotado después de su hora límite: sin culpa, desde ahora sin cafeína
    const caf = lateCaffeine(m.caffeine, sleepIns);
    if (caf && m.toBed > 0.5) {
      const cafName = caf.name.split(/[,(/]/)[0].trim();
      return { icon: '☕', title: `${cafName.length <= 22 ? cafName : 'Café'} a las ${hhmmOf(new Date(caf.at).getHours() + new Date(caf.at).getMinutes() / 60)}: tarde para tu sueño`, sub: 'La cafeína dura horas. Por hoy no pasa nada: desde ahora, mejor sin cafeína.' };
    }
    // 5. Sueño, luz, café
    const ventana = m.bed ? `Tu hora: entre las ${hhmmOf(m.bed.from)} y las ${hhmmOf(m.bed.to)}. ` : '';
    if (m.toBed <= 0.1 && m.bed) return { icon: '🌙', title: 'Ya es tu hora de acostarte', sub: `${ventana}Menos pantalla y luz baja: ayudan a dormirte.`, ...(onOpenSleep ? { actions: [{ label: 'Ver mi sueño', kind: 'ghost' as const, onPress: onOpenSleep }] } : {}) };
    if (m.toBed < 2.5) return { icon: '🌙', title: m.bed ? `A acostarte en ~${durTxt(m.toBed)}` : `Duermes en ~${durTxt(m.toBed)}`, sub: `${ventana}Cena liviana y menos pantalla: ayudan a dormir mejor.` };
    if (m.relNow < 1.5) return { icon: '☀️', title: 'Sal un rato a la luz', sub: 'Unos minutos de sol al despertar ordenan tu reloj interno.' };
    if (m.relNow < m.coffeeUntil && m.coffeeUntil - m.relNow < 1.5) {
      return { icon: '☕', title: `Último café hasta las ${fmtHour(m.wake + m.coffeeUntil)}`, sub: 'Después, mejor sin cafeína para dormir bien.' };
    }
    // 6. Nada urgente
    return {
      icon: '✅', title: 'Vas bien',
      sub: m.next ? `Lo próximo: ${MEAL_TITLE[m.next.s].toLowerCase()} a las ${fmtHour(m.wake + m.next.a)}.` : 'Nada urgente por ahora.',
    };
  };

  const it = pick();

  return (
    <View style={st.card}>
      <Text style={st.label}>AHORA</Text>
      {flash ? (
        <View style={st.body}>
          <Text style={st.title}>{flash}</Text>
        </View>
      ) : (
        <View style={st.body}>
          <View style={st.head}>
            <Text style={st.icon}>{it.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.title}>{it.title}</Text>
              <Text style={st.sub}>{it.sub}</Text>
            </View>
          </View>
          {it.mood && (
            <View style={st.moods}>
              {MOODS.map((x) => (
                <TouchableOpacity key={x.score} onPress={() => logMood(x.score)} style={st.mood} activeOpacity={0.7}>
                  <Text style={st.moodEmoji}>{x.emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {!!it.actions?.length && (
            <View style={st.actions}>
              {it.actions.map((a) => (
                <TouchableOpacity key={a.label} onPress={a.onPress} activeOpacity={0.75} style={a.kind === 'primary' ? st.btnPrimary : st.btnGhost}>
                  <Text style={a.kind === 'primary' ? st.btnPrimaryText : st.btnGhostText}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
      <TouchableOpacity
        style={st.footer}
        activeOpacity={0.7}
        onPress={() => onAsk('¿Cómo voy hoy y qué hago ahora? Revisa mi comida, agua, sueño y movimiento.')}
      >
        <Text style={st.footerText}>Que {personaName} revise todo mi día</Text>
        <Text style={st.footerArrow}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: T.bgCard, borderRadius: R.xl, padding: 18,
    borderWidth: 1, borderColor: T.borderActive, marginBottom: 12,
  },
  label: { color: T.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  body: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  icon: { fontSize: 24, lineHeight: 30 },
  title: { color: T.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  sub: { color: T.textLight, fontSize: 13, fontWeight: '500', marginTop: 3, lineHeight: 18 },
  moods: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  mood: {
    width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: T.border,
  },
  moodEmoji: { fontSize: 24 },
  actions: { flexDirection: 'row', gap: 10 },
  btnPrimary: {
    flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: R.md,
    backgroundColor: T.accentGlow, borderWidth: 1, borderColor: T.borderActive,
  },
  btnPrimaryText: { color: T.accent, fontSize: 14, fontWeight: '800' },
  btnGhost: {
    flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: R.md,
    borderWidth: 1, borderColor: T.border,
  },
  btnGhostText: { color: T.textLight, fontSize: 14, fontWeight: '700' },
  footer: {
    flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footerText: { flex: 1, color: T.textLight, fontSize: 13, fontWeight: '700' },
  footerArrow: { color: T.accent, fontSize: 20, fontWeight: '700' },
});

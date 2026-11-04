// ============================================================
// «¿Entrenas hoy?» — la tarjeta de Inicio y de Forge (Forge 2.0, F3, 2026-10-17)
// Sin responder: tres botones (mi rutina · otra cosa · hoy descanso) y, si entrena, cuándo (y qué, si es otra cosa).
// Respondida: el resumen («Hoy entrenas a las 19:00 · ~520 kcal ya en tus metas») y «Cambiar».
// Las metas pasan a ser según el día SOLO al responder (decisión del usuario). Textos neutros: descansar también cuenta.
// ============================================================
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { T as AppT } from '../config/design';
import { ACTIVITY_TYPES } from '../services/forge/forgeTrain';
import { setIntent, shouldAsk, useTrainingIntent, projectChoice, type IntentChoice } from '../services/forge/trainingIntent';
import { trainingTimeNote, type SleepInsights } from '../services/sleep/sleepCore';
import { escucharDestino } from '../services/notifTargets';

export interface IntentTheme { bg: string; line: string; text: string; muted: string; accent: string; ok: string; font?: string; fontBold?: string }
const APP_THEME: IntentTheme = { bg: AppT.bgCard, line: AppT.border, text: AppT.text, muted: AppT.textLight, accent: AppT.accent, ok: AppT.green };

const TIMES: Array<{ label: string; time?: string }> = [
  { label: 'Ahora', time: undefined }, { label: '07:00', time: '07:00' }, { label: '12:30', time: '12:30' }, { label: '18:00', time: '18:00' },
  { label: '19:00', time: '19:00' }, { label: '20:00', time: '20:00' }, { label: '21:00', time: '21:00' },
];
const MINUTES = [30, 45, 60, 90, 120];
const OTHER = ['basquet', 'futbol', 'trote', 'caminata', 'bici', 'natacion', 'marcial', 'crossfit', 'baile', 'padel'];
const fmtK = (n: number) => Math.round(n).toLocaleString('es-CL');
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export default function TrainingIntentCard({ theme = APP_THEME, always = false, eatenKcal, goalKcal, sleepIns }: { theme?: IntentTheme; always?: boolean; eatenKcal?: number | null; goalKcal?: number | null; sleepIns?: SleepInsights | null }) {
  const { intent, targets } = useTrainingIntent();
  const [eligible, setEligible] = useState<boolean | null>(always ? true : null);
  const [draft, setDraft] = useState<IntentChoice | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!always) shouldAsk().then(setEligible).catch(() => setEligible(false)); }, [always]);
  // «Elegir hora» en el aviso «¿Entrenas hoy?»: la tarjeta abre directo en la hora (revisión I2; antes la app abría y nada)
  const intentRef = React.useRef(intent);
  intentRef.current = intent;
  useEffect(() => escucharDestino('entreno_hora', () => {
    const i = intentRef.current;
    setEligible(true);
    setEditing(true);
    setDraft(i && i.answer === 'si' ? { ...i } : { answer: 'si', kind: 'rutina' });
  }), []);
  const st = styles(theme);

  if (!intent && !always && !eligible) return null;

  // Respondida
  if (intent && !editing) {
    const ghost = targets?.kcalGhost ?? null;
    const phrase = intent.answer === 'no' ? 'Hoy descansas' : `Hoy ${intent.kind === 'otra' ? `toca ${intent.label ?? 'tu actividad'}` : `entrenas${intent.label ? ` ${intent.label.toLowerCase()}` : ''}`}${intent.time ? ` a las ${intent.time}` : ''}`;
    const sub = intent.answer === 'no'
      ? 'Tus metas de hoy son de día de descanso. Descansar también es parte del plan.'
      : ghost ? `~${fmtK(intent.kcal ?? 0)} kcal: tus metas ya las incluyen (te faltan ~${fmtK(ghost)} por entrenar)`
        : intent.kcal ? `~${fmtK(intent.kcal)} kcal, ya en tus metas` : 'Ya está en tus metas';
    // Sueño 2.0 · S3: un entreno que termina a menos de 1 h de su hora de acostarse (Stutz 2019)
    const [hh, mm] = (intent.time ?? '').split(':').map(Number);
    const lateNote = intent.answer === 'si' && Number.isFinite(hh) ? trainingTimeNote(hh + (mm || 0) / 60, sleepIns, (intent.minutes ?? (intent.kind === 'otra' ? 60 : 75)) / 60) : null;
    return (
      <View style={st.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 22 }}>{intent.answer === 'no' ? '🛌' : intent.kind === 'otra' ? '⛹️' : '🏋️'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>{phrase}</Text>
            <Text style={st.sub}>{sub}</Text>
            {lateNote ? <Text style={[st.sub, { marginTop: 4 }]}>🌙 {lateNote}</Text> : null}
          </View>
          <TouchableOpacity onPress={() => { setDraft(null); setEditing(true); }} style={st.ghostBtn} accessibilityLabel="Cambiar lo de hoy"><Text style={st.ghostTxt}>Cambiar</Text></TouchableOpacity>
        </View>
        {/* «Te quedan X (incluye ~N de tu pierna de las 19:00) · sin el entreno te pasarías por Y» (decisión del usuario) */}
        {ghost && goalKcal && eatenKcal != null ? (
          <View style={st.ghostBox}>
            <Text style={st.ghostLine}>Te quedan <Text style={{ color: theme.text, fontWeight: '700' }}>{fmtK(Math.max(0, goalKcal - eatenKcal))} kcal</Text> (incluye ~{fmtK(ghost)} de {targets?.intentPhrase ?? 'tu entreno'})</Text>
            {targets?.kcalNoGhost != null && eatenKcal > targets.kcalNoGhost
              ? <Text style={st.ghostLine}>Sin el entreno te pasarías por {fmtK(eatenKcal - targets.kcalNoGhost)} kcal</Text>
              : targets?.kcalNoGhost != null ? <Text style={st.ghostLine}>Sin el entreno te quedarían {fmtK(targets.kcalNoGhost - eatenKcal)} kcal</Text> : null}
          </View>
        ) : null}
      </View>
    );
  }

  const save = (c: IntentChoice) => { setIntent(c).catch(() => {}); setEditing(false); setDraft(null); };
  const p = draft ? projectChoice(draft) : null;

  return (
    <View style={st.card}>
      <Text style={st.title}>¿Entrenas hoy?</Text>
      {!draft ? (
        <>
          <Text style={st.sub}>Así tus calorías y tu agua de hoy calzan con lo que vas a hacer.</Text>
          <View style={st.row}>
            <Chip t={st} label="Sí, mi rutina" onPress={() => setDraft({ answer: 'si', kind: 'rutina' })} strong />
            <Chip t={st} label="Sí, otra cosa" onPress={() => setDraft({ answer: 'si', kind: 'otra', activity: 'basquet', minutes: 60 })} strong />
            <Chip t={st} label="Hoy descanso" onPress={() => save({ answer: 'no' })} />
          </View>
          {editing && intent && <Chip t={st} label="Borrar lo de hoy" onPress={() => { setIntent(null).catch(() => {}); setEditing(false); }} />}
        </>
      ) : (
        <>
          {draft.kind === 'otra' && (
            <>
              <Text style={st.label}>¿QUÉ?</Text>
              <View style={st.row}>
                {OTHER.map((id) => { const a = ACTIVITY_TYPES.find((x) => x.id === id)!; return <Chip key={id} t={st} label={a.name} on={draft.activity === id} onPress={() => setDraft({ ...draft, activity: id })} />; })}
              </View>
              <Text style={st.label}>¿CUÁNTO RATO?</Text>
              <View style={st.row}>
                {MINUTES.map((m) => <Chip key={m} t={st} label={m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : `${m} min`} on={draft.minutes === m} onPress={() => setDraft({ ...draft, minutes: m })} />)}
              </View>
            </>
          )}
          <Text style={st.label}>¿A QUÉ HORA?</Text>
          <View style={st.row}>
            {TIMES.map((x) => <Chip key={x.label} t={st} label={x.label} on={x.time ? draft.time === x.time : draft.time === 'ahora'} onPress={() => setDraft({ ...draft, time: x.time ?? 'ahora' })} />)}
          </View>
          {p && <Text style={st.sub}>Vas a gastar ~{fmtK(p.kcal)} kcal{draft.kind === 'rutina' ? ' (tu plan de hoy con tus últimas cargas)' : ''}: tus metas de hoy lo suman.</Text>}
          <View style={[st.row, { marginTop: 10 }]}>
            <Chip t={st} label="Volver" onPress={() => setDraft(null)} />
            <Chip t={st} label="Listo" strong onPress={() => save({ ...draft, time: draft.time === 'ahora' ? nowHHMM() : draft.time })} />
          </View>
        </>
      )}
    </View>
  );
}

function Chip({ t, label, onPress, on, strong }: { t: ReturnType<typeof styles>; label: string; onPress: () => void; on?: boolean; strong?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} style={[t.chip, (on || strong) && t.chipOn]} accessibilityRole="button" accessibilityState={{ selected: !!on }}>
      <Text style={[t.chipTxt, (on || strong) && t.chipTxtOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = (th: IntentTheme) => StyleSheet.create({
  card: { backgroundColor: th.bg, borderWidth: 1, borderColor: th.line, borderRadius: 16, padding: 14, marginBottom: 12, gap: 6 },
  title: { color: th.text, fontSize: 16, fontWeight: '700', fontFamily: th.fontBold },
  sub: { color: th.muted, fontSize: 12.5, lineHeight: 17, fontFamily: th.font },
  label: { color: th.muted, fontSize: 10.5, fontWeight: '700', letterSpacing: 1, marginTop: 6, fontFamily: th.fontBold },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: th.line },
  chipOn: { borderColor: th.accent, backgroundColor: th.accent + '22' },
  chipTxt: { color: th.text, fontSize: 13, fontFamily: th.fontBold },
  chipTxtOn: { color: th.accent, fontWeight: '700' },
  ghostBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: th.line },
  ghostTxt: { color: th.muted, fontSize: 12, fontFamily: th.fontBold },
  ghostBox: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: th.line, borderStyle: 'dashed', gap: 2 },
  ghostLine: { color: th.muted, fontSize: 12.5, fontFamily: th.font },
});

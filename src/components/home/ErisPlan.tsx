// ============================================================
// Eris Mobile — «¿Qué recomienda Eris?» en Inicio (Eris al timón · T1, 2026-10-29)
//
// Sin plan: un botón. Toca → una hoja con 3 caminos (Estricto · Óptimo · Flexible), cada uno con lo que significa HOY
// («2.850 kcal · Empuje · hasta $12.000 · cama 23:45»), y «Otro» para contar su caso. Un toque y Eris arma el día y lo aplica
// sin preguntar (el entreno en Forge, «¿entrenas hoy?», el tope de gasto), con «Deshacer» 10 s.
// Con plan: la tarjeta «Plan de Eris»: lo que viene destacado y un botón por paso («Lo comí», «Otra», «Ir a Forge», «Hecho»).
// ⚡ Modo Rendimiento (R1): el 4.º camino, solo si el servidor lo ofrece (por ahora, la cuenta del dueño). Se destaca cuando
// durmió poco; al tocarlo se abre un check-in opcional (estrés, foco, qué pide el día) y se arma. En la tarjeta: la curva de
// alerta ESTIMADA con sus ventanas, el tope de café en tazas, lo de todo el día junto y «Hecho» en cada paso.
// ============================================================
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, DeviceEventEmitter, Pressable, ScrollView, Switch } from 'react-native';
import Svg, { Path, Rect, Line, Circle, Text as SvgText } from 'react-native-svg';
import { T, R } from '../../config/design';
import { dayPlanStore, nextStep, MODE_NAME, type DayPlan, type PlanMode, type PlanStep, type PlanPreview, type PlanModule, type Mente, type TipoDia } from '../../services/dayPlan/dayPlanStore';
import { alertCurveText, type AlertCurve } from '../../services/sleep/sleepCore';
import { NOTIFICATION_OPEN_EVENT } from '../../services/ErisNotifications';
import { AsiManejoSheet, type ModuloManejo } from './AsiManejo';

const MODES: Array<{ mode: PlanMode; desc: string }> = [
  { mode: 'estricto', desc: 'Lo exacto: porciones justas, sin gustos, la rutina completa y un tope de gasto más bajo.' },
  { mode: 'optimo', desc: 'Lo que tu cuerpo necesita hoy, sin extremos.' },
  { mode: 'flexible', desc: 'Con un gusto incluido, entreno más corto y algo más de margen.' },
];
const REND_DESC = 'Para el día que igual tienes que rendir: café a la hora justa, siesta-café, bloques de foco y pausas. No es para todos los días.';
const hhmm = (h: number | null) => (h == null ? 'Hoy' : `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`);
/** Lo que contó en el check-in, en palabras (nunca como puntaje) */
const menteTexto = (m: Mente | null | undefined) => (!m ? '' : [
  m.estres ? (m.estres >= 4 ? 'estrés alto' : m.estres <= 2 ? 'tranquilo' : 'algo de estrés') : '',
  m.foco ? (m.foco <= 2 ? 'foco bajo' : m.foco >= 4 ? 'buen foco' : 'foco a medias') : '',
  m.tipo ? ({ detalle: 'día de detalle', ideas: 'día de ideas', todo: 'de todo' } as Record<TipoDia, string>)[m.tipo] : '',
].filter(Boolean).join(' · '));
/** La nota del servidor que invita al check-in: en la app sobra, porque está el botón */
const NOTA_CHECKIN = /^Si me cuentas cómo estás/;
const icon = (s: PlanStep) => s.titulo.split(' ')[0];
const sinIcono = (s: PlanStep) => s.titulo.replace(/^\S+\s/, '');

/** El estado del plan, al día con el almacén */
export function useDayPlan(): DayPlan | null {
  const [p, setP] = useState<DayPlan | null>(() => dayPlanStore.get());
  useEffect(() => dayPlanStore.subscribe(() => setP(dayPlanStore.get())), []);
  return p;
}

export default function ErisPlan() {
  const plan = useDayPlan();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(false);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(false), 10_000); return () => clearTimeout(t); }, [toast]);
  return (
    <>
      {plan ? <PlanCard plan={plan} onChange={() => setOpen(true)} toast={toast} onUndo={() => { setToast(false); dayPlanStore.undo(); }} />
        : (
          <TouchableOpacity style={st.button} onPress={() => setOpen(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="¿Qué recomienda Eris?">
            <Text style={st.buttonIcon}>🧭</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.buttonTitle}>¿Qué recomienda Eris?</Text>
              <Text style={st.buttonSub}>Elige un camino y Eris arma tu día. Tú solo lo sigues.</Text>
            </View>
            <Text style={st.chev}>›</Text>
          </TouchableOpacity>
        )}
      <PlanSheet visible={open} current={plan?.mode ?? null} onClose={() => setOpen(false)} onChosen={() => { setOpen(false); setToast(true); }} />
    </>
  );
}

// ─── La hoja: los 3 caminos y «Otro» ─────────────────────────────────────────
export function PlanSheet({ visible, current, onClose, onChosen }: { visible: boolean; current: PlanMode | null; onClose: () => void; onChosen: () => void }) {
  const [preview, setPreview] = useState<PlanPreview[] | null>(dayPlanStore.getPreview());
  const [busy, setBusy] = useState<PlanMode | 'otro' | null>(null);
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [manejo, setManejo] = useState(false);
  const [auto, setAutoState] = useState<boolean | null>(dayPlanStore.getAuto());
  const [rendOpen, setRendOpen] = useState(false);
  const [mente, setMente] = useState<Mente>({});
  useEffect(() => dayPlanStore.subscribe(() => setAutoState(dayPlanStore.getAuto())), []);
  const toggleAuto = async (on: boolean) => {
    setAutoState(on);
    try { setAutoState(await dayPlanStore.setAuto(on)); } catch { setAutoState(!on); setError('No pude guardar el piloto automático: revisa la conexión.'); }
  };
  useEffect(() => {
    if (!visible) return;
    setError(null); setBusy(null); setRendOpen(false);
    const cur = dayPlanStore.get();
    setMente(cur?.mode === 'rendimiento' && cur.mente ? cur.mente : {});
    if (!dayPlanStore.connected()) { setError('Sin conexión con Eris: el plan lo arma tu PC. Revisa que la app esté conectada.'); return; }
    dayPlanStore.loadPreview().then(setPreview).catch(() => setError('No pude calcular los caminos de hoy. Inténtalo de nuevo.'));
  }, [visible]);
  // El día exigente solo aparece si el servidor lo ofrece (por ahora, la cuenta del dueño o con el interruptor del panel)
  const rend = preview?.find((x) => x.mode === 'rendimiento') ?? null;

  const choose = async (mode: PlanMode, conNota = false, m?: Mente) => {
    setBusy(conNota ? 'otro' : mode); setError(null);
    try {
      const p = await dayPlanStore.choose(mode, conNota ? nota : undefined, m);
      if (!p) throw new Error('vacio');
      setNota('');
      onChosen();
    } catch { setError('No pude armar el día ahora. Inténtalo de nuevo en un momento.'); }
    setBusy(null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose} accessibilityLabel="Cerrar" />
      <View style={st.sheet}>
        <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={st.grab} />
        <Text style={st.sheetTitle}>¿Qué recomienda Eris?</Text>
        <Text style={st.sheetSub}>Elige un camino y Eris arma tu día con lo que tienes, cómo dormiste y tu plata. Tú solo lo sigues.</Text>
        {MODES.map(({ mode, desc }) => {
          const pv = preview?.find((x) => x.mode === mode);
          const rec = mode === 'optimo';
          return (
            <TouchableOpacity key={mode} disabled={!!busy || !!error && !preview} onPress={() => choose(mode)} activeOpacity={0.8}
              style={[st.option, rec && st.optionRec, current === mode && st.optionCur]} accessibilityRole="button" accessibilityLabel={`Camino ${MODE_NAME[mode]}`}>
              <View style={st.rowBetween}>
                <Text style={st.optionName}>{MODE_NAME[mode]}</Text>
                {rec ? <Text style={st.pill}>Recomendado</Text> : current === mode ? <Text style={st.pillMuted}>El de ahora</Text> : null}
              </View>
              <Text style={st.optionDesc}>{desc}</Text>
              {busy === mode ? <ActivityIndicator color={T.accent} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
                : <Text style={st.optionToday}>{pv ? `Hoy: ${pv.resumen}` : preview === null && !error ? 'Calculando tu día…' : ''}</Text>}
            </TouchableOpacity>
          );
        })}
        {rend && (
          <View style={[st.option, st.optionRend, rend.destacar && st.optionRendHot, current === 'rendimiento' && { borderColor: T.gold }]}>
            <TouchableOpacity disabled={!!busy} onPress={() => setRendOpen(!rendOpen)} activeOpacity={0.8} style={{ gap: 4 }}
              accessibilityRole="button" accessibilityLabel="Camino Rendimiento, para un día exigente" accessibilityState={{ expanded: rendOpen }}>
              <View style={st.rowBetween}>
                <Text style={st.optionName}>⚡ {MODE_NAME.rendimiento}</Text>
                {rend.destacar ? <Text style={st.pillGold}>Si tienes que rendir</Text> : current === 'rendimiento' ? <Text style={st.pillMuted}>El de ahora</Text> : null}
              </View>
              <Text style={st.optionDesc}>{REND_DESC}</Text>
              {rend.destacar && <Text style={st.rendHot}>Hoy vienes con poco descanso: si igual tienes que rendir, este es tu camino.</Text>}
              {!!rend.pista && <Text style={st.rendPista}>{rend.pista}</Text>}
              <Text style={[st.optionToday, { color: T.gold }]}>Hoy: {rend.resumen}</Text>
            </TouchableOpacity>
            {rendOpen && (
              <View style={st.checkin}>
                <Text style={st.ciLead}>Cuéntame cómo vienes (opcional): con eso ordeno tus bloques.</Text>
                <MenteCheckin value={mente} onChange={setMente} />
                <TouchableOpacity disabled={!!busy} onPress={() => choose('rendimiento', false, mente)} style={[st.rendBtn, !!busy && { opacity: 0.5 }]}
                  accessibilityRole="button" accessibilityLabel="Armar mi día exigente">
                  {busy === 'rendimiento' ? <ActivityIndicator color="#1a1003" /> : <Text style={st.rendBtnText}>Armar mi día exigente</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        <Text style={st.otroLabel}>Otro: cuéntale tu caso</Text>
        <View style={st.otroRow}>
          <TextInput value={nota} onChangeText={setNota} placeholder="«almuerzo afuera», «sin plata hasta el viernes», «me duele la rodilla»…"
            placeholderTextColor={T.textMuted} style={st.input} maxLength={240} multiline />
          <TouchableOpacity disabled={!nota.trim() || !!busy} onPress={() => choose('optimo', true)} style={[st.otroBtn, (!nota.trim() || !!busy) && { opacity: 0.4 }]}>
            {busy === 'otro' ? <ActivityIndicator color="#04131a" /> : <Text style={st.otroBtnText}>Armar</Text>}
          </TouchableOpacity>
        </View>
        <View style={st.autoRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.autoTitle}>Que Eris arme mi día cada mañana</Text>
            <Text style={st.autoSub}>Con tu último camino. En la noche deja listo el día siguiente y los avisos te traen el menú con «Lo comí ✓».</Text>
          </View>
          <Switch value={!!auto} onValueChange={toggleAuto} disabled={auto === null && !dayPlanStore.connected()} trackColor={{ true: T.accent, false: T.border }} thumbColor="#fff" />
        </View>
        {!!error && <Text style={st.error}>{error}</Text>}
        {/* Eris administra (A3): qué hace Eris sola en cada módulo, con sus interruptores */}
        <TouchableOpacity onPress={() => setManejo(true)} style={{ marginTop: 10 }} accessibilityRole="button"><Text style={st.link}>🤖 Así manejo tus cosas: qué hago sola y qué no →</Text></TouchableOpacity>
        </ScrollView>
      </View>
      <AsiManejoSheet visible={manejo} modulo="plata" onClose={() => setManejo(false)} />
    </Modal>
  );
}

// ─── La tarjeta del plan ──────────────────────────────────────────────────────
function PlanCard({ plan, onChange, toast, onUndo }: { plan: DayPlan; onChange: () => void; toast: boolean; onUndo: () => void }) {
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [ci, setCi] = useState(false);
  const rend = plan.mode === 'rendimiento';
  const next = nextStep(plan);
  // Lo del día exigente que va todo el día (pausas, respirar, no manejar con sueño): junto en un recuadro, no como pasos
  const todoDia = plan.pasos.filter((s) => s.accion.type === 'cue' && s.hora == null);
  const todos = plan.pasos.filter((s) => !todoDia.includes(s));
  const pendientes = todos.filter((s) => !s.hecho);
  // Lo de todo el día que se hace (el tope) y, de la línea de tiempo, desde lo que toca ahora (lo que ya pasó queda en «Ver todo»)
  const conHora = pendientes.filter((s) => s.hora != null);
  const desde = next && next.hora != null ? Math.max(0, conHora.indexOf(next)) : 0;
  const visibles = all ? todos : [...todos.filter((s) => s.hora == null && !s.hecho && s.accion.type !== 'info'), ...conHora.slice(desde, desde + 3)];
  const run = async (fn: () => Promise<unknown>, id: string) => { setBusy(id); try { await fn(); } finally { setBusy(null); } };
  const notas = rend ? (plan.notas ?? []).filter((n) => !NOTA_CHECKIN.test(n)) : [];
  return (
    <View style={[st.card, rend && { borderColor: 'rgba(245,158,11,0.35)' }]}>
      <View style={st.rowBetween}>
        <Text style={[st.label, rend && { color: T.gold }]}>{rend ? '⚡' : '🧭'} PLAN DE ERIS · {MODE_NAME[plan.mode].toUpperCase()}{plan.auto ? ' · AUTOMÁTICO' : ''}</Text>
        <TouchableOpacity onPress={onChange} hitSlop={8}><Text style={st.link}>Cambiar</Text></TouchableOpacity>
      </View>
      <Text style={st.resumen}>{plan.resumen}</Text>
      {toast && (
        <View style={st.toast}>
          <Text style={st.toastText}>Listo: tu día lo lleva Eris.</Text>
          <TouchableOpacity onPress={onUndo} hitSlop={8}><Text style={st.link}>Deshacer</Text></TouchableOpacity>
        </View>
      )}
      {rend && plan.curva && <CurveBlock c={plan.curva} />}
      {rend && (
        <View style={st.rendInfo}>
          {plan.tazas && <Text style={st.rendInfoText}>☕ {plan.tazas.max > 0 ? `Hasta ${plan.tazas.max} ${plan.tazas.max === 1 ? 'taza' : 'tazas'} de café hoy` : 'Hoy sin café'}</Text>}
          <TouchableOpacity onPress={() => setCi(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Contar cómo vienes: estrés, foco y qué pide tu día">
            <Text style={st.rendInfoText}>
              {plan.mente && menteTexto(plan.mente) ? `🧠 Con lo que me contaste: ${menteTexto(plan.mente)}. ` : '🧠 ¿Cómo vienes? Cuéntame tu estrés y tu foco y afino tus bloques. '}
              <Text style={st.link}>{plan.mente ? 'Cambiar' : 'Contar'}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={{ gap: 8, marginTop: 8 }}>
        {visibles.map((s) => (
          <Step key={s.id} s={s} next={next?.id === s.id} busy={busy === s.id}
            onDone={() => run(() => dayPlanStore.done(s.id), s.id)}
            onSwap={s.accion.type === 'log_food' ? () => run(() => dayPlanStore.swap((s.accion as any).slot), s.id) : undefined}
            onList={s.accion.type === 'add_list' ? () => run(() => dayPlanStore.addToList(s.id), s.id) : undefined} />
        ))}
      </View>
      {todos.length > visibles.length || all ? (
        <TouchableOpacity onPress={() => setAll(!all)} style={{ marginTop: 10 }}><Text style={st.link}>{all ? 'Ver menos' : `Ver todo el día (${todos.length})`}</Text></TouchableOpacity>
      ) : null}
      {todoDia.length > 0 && (
        <View style={st.allDay}>
          <Text style={st.allDayTitle}>TODO EL DÍA</Text>
          {todoDia.map((s) => <Text key={s.id} style={st.allDayItem}>{icon(s)}  {sinIcono(s)}</Text>)}
        </View>
      )}
      {notas.map((n) => <Text key={n} style={st.nota}>{n}</Text>)}
      {!pendientes.some((s) => s.accion.type !== 'info' && s.accion.type !== 'set_cap' && s.accion.type !== 'cuadrar') && <Text style={st.doneAll}>Hiciste todo lo del plan de hoy. 🙌</Text>}
      {rend && <CheckinModal visible={ci} initial={plan.mente ?? {}} onClose={() => setCi(false)} />}
    </View>
  );
}

// ─── El día exigente: la curva estimada, el check-in ─────────────────────────
/** La curva de alerta de hoy (ESTIMADA) desde que despertó hasta la hora de acostarse, con sus tres ventanas y el «ahora» */
function CurveBlock({ c }: { c: AlertCurve }) {
  const [w, setW] = useState(0);
  const H = 96, top = 16, plotH = 56, x0 = c.wake, x1 = c.bed;
  const X = (h: number) => ((h - x0) / (x1 - x0)) * w;
  const pts = c.puntos.filter(([h]) => h >= x0 && h <= x1);
  // La altura va a su propio rango (es una curva relativa, sin números): así se lee la forma del día
  const vs = pts.map(([, v]) => v);
  const lo = Math.max(0, Math.min(...vs, 1) - 0.08), hi = Math.min(1, Math.max(...vs, 0) + 0.08);
  const Y = (v: number) => top + (1 - (v - lo) / Math.max(0.05, hi - lo)) * plotH;
  const line = pts.map(([h, v], k) => `${k ? 'L' : 'M'}${X(h).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const area = pts.length ? `${line} L${X(pts[pts.length - 1][0]).toFixed(1)},${top + plotH} L${X(pts[0][0]).toFixed(1)},${top + plotH} Z` : '';
  const d = new Date();
  let now = d.getHours() + d.getMinutes() / 60;
  if (now < x0 - 6) now += 24; // pasada la medianoche, sigue siendo hoy
  const nowV = (() => { const k = pts.findIndex(([h]) => h >= now); if (k <= 0) return null; const [ha, va] = pts[k - 1], [hb, vb] = pts[k]; return va + ((now - ha) / (hb - ha)) * (vb - va); })();
  const bands: Array<{ r: [number, number]; label: string; color: string; fill: string }> = [
    { r: c.foco, label: 'foco', color: T.accent, fill: 'rgba(34,211,238,0.16)' },
    { r: c.bajon, label: 'bajón', color: T.textLight, fill: 'rgba(148,163,184,0.12)' },
    ...(c.segundoAire ? [{ r: c.segundoAire, label: '2.º aire', color: T.green, fill: 'rgba(34,197,94,0.14)' }] : []),
  ];
  // Las horas del eje cada 3 h, sin montarse con la del despertar ni con la de acostarse (~40 px de cada lado)
  const ticks: number[] = [];
  for (let h = Math.ceil(x0 / 3) * 3; h < x1; h += 3) if (X(h) >= 46 && X(h) <= w - 46) ticks.push(h);
  const txt = alertCurveText(c);
  return (
    <View style={st.curve} accessible accessibilityLabel={`Tu curva de hoy, estimada: ${txt}`}>
      <View style={st.rowBetween}>
        <Text style={st.curveTitle}>📈 TU CURVA DE HOY</Text>
        <Text style={st.curveEst}>estimada</Text>
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H, marginTop: 4 }}>
        {w > 0 && (
          <Svg width={w} height={H}>
            {bands.map((b) => (
              <React.Fragment key={b.label}>
                <Rect x={X(b.r[0])} y={top} width={Math.max(2, X(b.r[1]) - X(b.r[0]))} height={plotH} fill={b.fill} rx={4} />
                <SvgText x={X((b.r[0] + b.r[1]) / 2)} y={top - 5} fill={b.color} fontSize={9.5} fontFamily="sans-serif" fontWeight="700" textAnchor="middle">{b.label}</SvgText>
              </React.Fragment>
            ))}
            <Line x1={0} y1={top + plotH} x2={w} y2={top + plotH} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            {!!area && <Path d={area} fill="rgba(245,158,11,0.08)" />}
            {!!line && <Path d={line} stroke={T.gold} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />}
            {nowV != null && (
              <>
                <Line x1={X(now)} y1={top} x2={X(now)} y2={top + plotH} stroke="rgba(248,250,252,0.35)" strokeWidth={1} strokeDasharray="3,3" />
                <Circle cx={X(now)} cy={Y(nowV)} r={4} fill={T.text} stroke={T.bgCard} strokeWidth={1.5} />
              </>
            )}
            <SvgText x={1} y={H - 6} fill={T.textMuted} fontSize={9.5} fontFamily="sans-serif">{hhmm(x0)}</SvgText>
            {ticks.map((h) => <SvgText key={h} x={X(h)} y={H - 6} fill={T.textMuted} fontSize={9.5} fontFamily="sans-serif" textAnchor="middle">{`${h % 24}:00`}</SvgText>)}
            <SvgText x={w - 1} y={H - 6} fill={T.textMuted} fontSize={9.5} fontFamily="sans-serif" textAnchor="end">{hhmm(x1)}</SvgText>
          </Svg>
        )}
      </View>
      <Text style={st.curveText}>{txt.charAt(0).toUpperCase() + txt.slice(1)}. Estimada con tu sueño: todavía no la ajusto a ti.</Text>
    </View>
  );
}

/** El check-in del día exigente: tres toques, todos opcionales (tocar de nuevo lo quita) */
function MenteCheckin({ value, onChange }: { value: Mente; onChange: (m: Mente) => void }) {
  const scale = (k: 'estres' | 'foco', title: string, lo: string, hi: string) => (
    <View style={{ gap: 6 }}>
      <Text style={st.ciTitle}>{title}</Text>
      <View style={st.ciRow}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value[k] === n;
          return (
            <TouchableOpacity key={n} onPress={() => onChange({ ...value, [k]: on ? undefined : n })} style={[st.ciDot, on && st.ciDotOn]}
              accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${title} ${n} de 5`}>
              <Text style={[st.ciDotText, on && st.ciDotTextOn]}>{n}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={st.rowBetween}><Text style={st.ciHint}>{lo}</Text><Text style={st.ciHint}>{hi}</Text></View>
    </View>
  );
  const TIPOS: Array<[TipoDia, string]> = [['detalle', 'Detalle y orden'], ['ideas', 'Ideas y estrategia'], ['todo', 'De todo']];
  return (
    <View style={{ gap: 12 }}>
      {scale('estres', '¿Cuánto estrés traes?', 'Tranquilo', 'A tope')}
      {scale('foco', '¿Cómo está tu foco?', 'Disperso', 'Afilado')}
      <View style={{ gap: 6 }}>
        <Text style={st.ciTitle}>¿Qué pide tu día?</Text>
        <View style={[st.ciRow, { flexWrap: 'wrap' }]}>
          {TIPOS.map(([t, label]) => {
            const on = value.tipo === t;
            return (
              <TouchableOpacity key={t} onPress={() => onChange({ ...value, tipo: on ? undefined : t })} style={[st.ciChip, on && st.ciDotOn]}
                accessibilityRole="button" accessibilityState={{ selected: on }}>
                <Text style={[st.ciDotText, on && st.ciDotTextOn]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** Desde la tarjeta: contar cómo viene y rearmar el día exigente (lo hecho se conserva) */
function CheckinModal({ visible, initial, onClose }: { visible: boolean; initial: Mente; onClose: () => void }) {
  const [m, setM] = useState<Mente>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (visible) { setM(initial); setError(null); } }, [visible]);
  const save = async () => {
    setBusy(true); setError(null);
    try { if (!(await dayPlanStore.choose('rendimiento', undefined, m))) throw new Error('vacio'); onClose(); }
    catch { setError(dayPlanStore.connected() ? 'No pude rearmar el día ahora. Inténtalo de nuevo.' : 'Sin conexión con Eris: el plan lo arma tu PC.'); }
    setBusy(false);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose} accessibilityLabel="Cerrar" />
      <View style={st.sheet}>
        <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
          <View style={st.grab} />
          <Text style={st.sheetTitle}>¿Cómo vienes?</Text>
          <Text style={st.sheetSub}>Con esto ordeno tus bloques: lo de detalle en tu mejor rato, las ideas caminando y respiración si traes estrés. No es un puntaje.</Text>
          <MenteCheckin value={m} onChange={setM} />
          <TouchableOpacity disabled={busy} onPress={save} style={[st.rendBtn, busy && { opacity: 0.5 }]} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#1a1003" /> : <Text style={st.rendBtnText}>Afinar mi día</Text>}
          </TouchableOpacity>
          {!!error && <Text style={st.error}>{error}</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Step({ s, next, busy, onDone, onSwap, onList }: { s: PlanStep; next: boolean; busy: boolean; onDone: () => void; onSwap?: () => void; onList?: () => void }) {
  const [open, setOpen] = useState(false);
  const a = s.accion;
  const toForge = () => DeviceEventEmitter.emit(NOTIFICATION_OPEN_EVENT, { kind: 'plan', action: '', tap: 'forge' });
  // A2: «Cuadrar» abre Finanzas con la hoja del cuadre (la cuenta que no calza)
  const toCuadre = () => { require('../../services/finance/financeCuadre').financeCuadre.abrir(null); DeviceEventEmitter.emit(NOTIFICATION_OPEN_EVENT, { kind: 'plan', action: '', tap: 'finanzas' }); };
  return (
    <Pressable onPress={() => setOpen(!open)} style={[st.step, next && st.stepNext, s.hecho && { opacity: 0.5 }]}>
      <View style={st.stepHead}>
        <Text style={st.stepTime}>{s.hecho ? '✓' : hhmm(s.hora)}</Text>
        <Text style={st.stepIcon}>{icon(s)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={st.stepTitle}>{sinIcono(s)}</Text>
          <Text style={st.stepDetail} numberOfLines={open || next ? undefined : 1}>{s.detalle}</Text>
        </View>
      </View>
      {!s.hecho && (next || open) && a.type !== 'info' && a.type !== 'set_cap' && (
        <View style={st.actions}>
          {busy ? <ActivityIndicator color={T.accent} /> : (
            <>
              {a.type === 'log_food' && <Btn label="Lo comí" primary onPress={onDone} />}
              {a.type === 'log_food' && a.opciones.length > 1 && onSwap && <Btn label="Otra opción" onPress={onSwap} />}
              {a.type === 'load_routine' && <Btn label="Ir a Forge" primary onPress={toForge} />}
              {a.type === 'load_routine' && <Btn label="Hecho" onPress={onDone} />}
              {(a.type === 'walk' || a.type === 'rest') && <Btn label={a.type === 'rest' ? 'Ok' : 'Hecho'} primary onPress={onDone} />}
              {a.type === 'cue' && <Btn label="Hecho" primary onPress={onDone} />}
              {a.type === 'cuadrar' && <Btn label="Cuadrar" primary onPress={toCuadre} />}
              {a.type === 'add_list' && onList && <Btn label="Agregar a la lista" primary onPress={onList} />}
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ─── «Eris decide» en cada módulo: el mismo plan, con lo de ese módulo ─────────
const MOD_LABEL: Record<string, string> = { comida: 'tu comida', entreno: 'tu entreno', plata: 'tu plata', casa: 'tu casa', sueno: 'tu sueño' };
export function ErisDecideChip({ modulo, style }: { modulo: PlanModule; style?: any }) {
  const plan = useDayPlan();
  const [sheet, setSheet] = useState(false);
  const [mod, setMod] = useState(false);
  const [manejo, setManejo] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const pasos = plan ? plan.pasos.filter((s) => s.modulo === modulo || (modulo === 'casa' && s.id === 'casa-compras')) : [];
  // lo que toca ahora en este módulo (lo pendiente desde hace hora y media; si no, lo primero pendiente)
  const ahora = new Date().getHours() + new Date().getMinutes() / 60;
  const pend = pasos.filter((s) => !s.hecho);
  const sig = pend.find((s) => s.hora != null && s.hora >= ahora - 1.5) ?? pend.find((s) => s.accion.type !== 'info') ?? pend[0] ?? pasos[0];
  const label = !plan ? '🧭 Eris decide' : sig ? `🧭 ${sig.titulo.replace(/^\S+\s/, '')}` : `🧭 Plan de Eris · ${MODE_NAME[plan.mode]}`;
  const run = async (fn: () => Promise<unknown>, id: string) => { setBusy(id); try { await fn(); } finally { setBusy(null); } };
  return (
    <>
      <TouchableOpacity onPress={() => (plan && pasos.length ? setMod(true) : setSheet(true))} activeOpacity={0.8} style={[st.chip, style]}
        accessibilityRole="button" accessibilityLabel={plan ? `Plan de Eris para ${MOD_LABEL[modulo]}` : 'Eris decide'}>
        <Text style={st.chipText} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
      <PlanSheet visible={sheet} current={plan?.mode ?? null} onClose={() => setSheet(false)} onChosen={() => setSheet(false)} />
      <Modal visible={mod} transparent animationType="slide" onRequestClose={() => setMod(false)}>
        <Pressable style={st.overlay} onPress={() => setMod(false)} accessibilityLabel="Cerrar" />
        <View style={st.sheet}>
          <ScrollView contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
            <View style={st.grab} />
            <Text style={st.sheetTitle}>Plan de Eris · {plan ? MODE_NAME[plan.mode] : ''}</Text>
            <Text style={st.sheetSub}>Lo de {MOD_LABEL[modulo]} hoy. Tú solo lo sigues.</Text>
            {pasos.map((s) => (
              <Step key={s.id} s={s} next={sig?.id === s.id} busy={busy === s.id}
                onDone={() => run(() => dayPlanStore.done(s.id), s.id)}
                onSwap={s.accion.type === 'log_food' ? () => run(() => dayPlanStore.swap((s.accion as any).slot), s.id) : undefined}
                onList={s.accion.type === 'add_list' ? () => run(() => dayPlanStore.addToList(s.id), s.id) : undefined} />
            ))}
            <TouchableOpacity onPress={() => { setMod(false); setSheet(true); }} style={{ marginTop: 6 }}><Text style={st.link}>Cambiar de camino</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { setMod(false); setManejo(true); }} style={{ marginTop: 2 }} accessibilityRole="button"><Text style={st.link}>🤖 Así manejo {MOD_LABEL[modulo] ?? 'tus cosas'} →</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
      <AsiManejoSheet visible={manejo} modulo={(['plata', 'casa', 'comida', 'entreno', 'sueno'].includes(modulo) ? modulo : 'sueno') as ModuloManejo} onClose={() => setManejo(false)} />
    </>
  );
}

function Btn({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={primary ? st.btnPrimary : st.btnGhost} accessibilityRole="button">
      <Text style={primary ? st.btnPrimaryText : st.btnGhostText}>{label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.bgCard, borderRadius: R.xl, padding: 16, borderWidth: 1, borderColor: T.borderActive, marginBottom: 12 },
  buttonIcon: { fontSize: 26 },
  buttonTitle: { color: T.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  buttonSub: { color: T.textLight, fontSize: 12.5, marginTop: 2 },
  chev: { color: T.accent, fontSize: 22, fontWeight: '700' },
  card: { backgroundColor: T.bgCard, borderRadius: R.xl, padding: 16, borderWidth: 1, borderColor: T.borderActive, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { color: T.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, flexShrink: 1 },
  link: { color: T.accent, fontSize: 13, fontWeight: '700' },
  resumen: { color: T.textLight, fontSize: 12.5, marginTop: 6 },
  toast: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, padding: 10, borderRadius: R.md, backgroundColor: T.accentGlow },
  toastText: { color: T.text, fontSize: 13, fontWeight: '600' },
  step: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: R.md, padding: 10 },
  stepNext: { borderColor: T.borderActive, backgroundColor: 'rgba(34,211,238,0.05)' },
  stepHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  stepTime: { color: T.textMuted, fontSize: 12, fontWeight: '700', width: 40, marginTop: 2 },
  stepIcon: { fontSize: 18, lineHeight: 22 },
  stepTitle: { color: T.text, fontSize: 14, fontWeight: '700' },
  stepDetail: { color: T.textLight, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, marginLeft: 48 },
  btnPrimary: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.md, backgroundColor: T.accentGlow, borderWidth: 1, borderColor: T.borderActive },
  btnPrimaryText: { color: T.accent, fontSize: 13, fontWeight: '800' },
  btnGhost: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.md, borderWidth: 1, borderColor: T.border },
  btnGhostText: { color: T.textLight, fontSize: 13, fontWeight: '700' },
  doneAll: { color: T.green, fontSize: 13, fontWeight: '700', marginTop: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: T.bgCard, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, maxHeight: '88%', borderTopWidth: 1, borderColor: T.borderActive },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 4 },
  sheetTitle: { color: T.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  sheetSub: { color: T.textLight, fontSize: 13, lineHeight: 18 },
  option: { borderWidth: 1, borderColor: T.border, borderRadius: R.lg, padding: 14, gap: 4 },
  optionRec: { borderColor: T.borderActive, backgroundColor: 'rgba(34,211,238,0.06)' },
  optionCur: { borderColor: T.accent },
  optionName: { color: T.text, fontSize: 16, fontWeight: '800' },
  optionDesc: { color: T.textLight, fontSize: 12.5, lineHeight: 17 },
  optionToday: { color: T.accent, fontSize: 12.5, fontWeight: '600', marginTop: 4 },
  pill: { color: '#04131a', backgroundColor: T.accent, fontSize: 10.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  pillMuted: { color: T.textLight, borderWidth: 1, borderColor: T.border, fontSize: 10.5, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  otroLabel: { color: T.text, fontSize: 13, fontWeight: '700', marginTop: 4 },
  otroRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 44, maxHeight: 96, color: T.text, fontSize: 13.5, borderWidth: 1, borderColor: T.border, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10 },
  otroBtn: { backgroundColor: T.accent, borderRadius: R.md, paddingHorizontal: 16, height: 44, alignItems: 'center', justifyContent: 'center' },
  otroBtnText: { color: '#04131a', fontSize: 14, fontWeight: '900' },
  error: { color: T.gold, fontSize: 12.5 },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  autoTitle: { color: T.text, fontSize: 14, fontWeight: '700' },
  autoSub: { color: T.textLight, fontSize: 12, lineHeight: 16, marginTop: 2 },
  chip: { alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: T.borderActive, backgroundColor: 'rgba(34,211,238,0.08)' },
  chipText: { color: T.accent, fontSize: 12.5, fontWeight: '800' },
  // ⚡ el día exigente (ámbar: es un camino aparte, no el recomendado)
  optionRend: { borderColor: 'rgba(245,158,11,0.28)' },
  optionRendHot: { borderColor: 'rgba(245,158,11,0.55)', backgroundColor: 'rgba(245,158,11,0.06)' },
  pillGold: { color: '#1a1003', backgroundColor: T.gold, fontSize: 10.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  rendHot: { color: T.text, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  rendPista: { color: T.textLight, fontSize: 12, lineHeight: 16, fontStyle: 'italic' },
  checkin: { gap: 12, marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(245,158,11,0.2)' },
  ciLead: { color: T.textLight, fontSize: 12.5, lineHeight: 17 },
  ciTitle: { color: T.text, fontSize: 13.5, fontWeight: '700' },
  ciRow: { flexDirection: 'row', gap: 8 },
  ciDot: { flex: 1, height: 38, borderRadius: R.md, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  ciChip: { paddingHorizontal: 12, height: 36, borderRadius: 999, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  ciDotOn: { borderColor: T.gold, backgroundColor: T.goldGlow },
  ciDotText: { color: T.textLight, fontSize: 13.5, fontWeight: '700' },
  ciDotTextOn: { color: T.gold },
  ciHint: { color: T.textMuted, fontSize: 11 },
  rendBtn: { backgroundColor: T.gold, borderRadius: R.md, height: 46, alignItems: 'center', justifyContent: 'center' },
  rendBtnText: { color: '#1a1003', fontSize: 14.5, fontWeight: '900' },
  curve: { marginTop: 12, padding: 12, borderRadius: R.md, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  curveTitle: { color: T.textLight, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2 },
  curveEst: { color: T.textMuted, fontSize: 10.5, fontStyle: 'italic' },
  curveText: { color: T.textLight, fontSize: 12, lineHeight: 16, marginTop: 2 },
  rendInfo: { gap: 6, marginTop: 10 },
  rendInfoText: { color: T.textLight, fontSize: 12.5, lineHeight: 17 },
  allDay: { marginTop: 12, padding: 10, borderRadius: R.md, backgroundColor: 'rgba(255,255,255,0.025)', gap: 5 },
  allDayTitle: { color: T.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2 },
  allDayItem: { color: T.textLight, fontSize: 12.5, lineHeight: 17 },
  nota: { color: T.textLight, fontSize: 12, lineHeight: 16, marginTop: 8 },
});

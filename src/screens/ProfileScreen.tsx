import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, Alert, Switch, DeviceEventEmitter, AppState, Linking, LayoutAnimation,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthStorage } from '../services/AuthStorage';
import { wsManager } from '../services/WebSocketManager';
import { metricsService } from '../services/MetricsService';
import { nutritionBackend } from '../services/NutritionBackend';
import { STORAGE_KEY_GOALS, STORAGE_KEY_GOALS_SET } from '../services/nutritionSync';
import { daySchedule, DAY_SCHEDULE_EVENT } from '../services/daySchedule';
import { WELCOME_EVENT } from './WelcomeFlow';
import { TOUR_EVENT } from '../components/tour/tourTargets';
import { ModuleStorage } from '../services/ModuleStorage';
import { MODULES, DEFAULT_MODULES } from '../config/modules';
import { T, R, S } from '../config/design';
import { usePersona } from '../config/persona';
import { useFeature } from '../config/features';
import { AdminPanel } from './AdminPanel';
import { ErisBubble } from '../../modules/eris-bubble';
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from '../services/reminderRules';
import { reminderSettingsKey, PLAN_REFRESH_EVENT } from '../services/ErisNotifications';
import { getTone, setTone, TONE_OPTIONS, DEFAULT_TONE, type Tone } from '../services/tone';
import { getStrictMode, setStrictMode } from '../services/strictMode';
import InfoTip from '../components/InfoTip';
import { listFinanceBackups, restoreFinanceBackup, fechaHora, type BackupCopy } from '../services/financeBackup';
import { listForgeBackups, restoreForgeBackup, type ForgeBackupCopy } from '../services/forgeBackup';
import { listInventoryBackups, type InventoryBackupCopy } from '../services/inventoryBackup';
import { inventoryStore } from '../services/inventory/inventoryStore';
import { ASK_OFF_KEY } from '../services/forge/trainingIntent';

interface MedicalCondition { id: string; diagnosedDate?: string; notes?: string; }
interface Medication { id: string; name: string; dose?: string; schedule?: string; active: boolean; }
interface AlertThresholds { glucoseLow: number; glucoseHigh: number; glucoseUrgentLow: number; glucoseUrgentHigh: number; systolicHigh?: number; }
interface LabResult { test: string; value: number; unit: string; date?: string }
interface MedicalProfile { conditions: MedicalCondition[]; medications: Medication[]; thresholds: AlertThresholds; bloodType?: string; allergies?: string; dietaryRestrictions?: string[]; labs?: LabResult[]; }

/** Exámenes que Eris guardó por chat (lab_results): nombre legible y fecha dd-mm-aaaa */
const LAB_LABEL: Record<string, string> = {
  hba1c: 'HbA1c (hemoglobina glicosilada)', glucosa_ayunas: 'Glucosa en ayunas', colesterol_total: 'Colesterol total',
  ldl: 'Colesterol LDL', hdl: 'Colesterol HDL', trigliceridos: 'Triglicéridos', creatinina: 'Creatinina',
};
const labDate = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : d || 'sin fecha');

// Restricciones alimentarias que Eris respeta al recomendar comida (ids = los del backend, services/DietaryRestrictions.ts).
// La celiaquía y las alergias escritas abajo también se detectan solas; estos chips las hacen explícitas y cubren dietas.
/** Perfil → Notificaciones: un interruptor por tipo de aviso del día (las reglas están en services/reminderRules.ts). */
const REMINDER_ROWS: Array<{ key: keyof ReminderSettings; label: string; desc: string; module?: string }> = [
  { key: 'meal', label: 'Comidas', module: 'nutri', desc: 'Comer a buena hora con porciones según tu meta, una colación si pasan muchas horas, la proteína que te falta y anotar lo que comiste.' },
  { key: 'water', label: 'Agua', module: 'nutri', desc: 'Solo si vas atrasado con tu meta del día. Con "+250 ml" lo anotas sin abrir la app.' },
  { key: 'training', label: 'Entreno', module: 'toji', desc: 'Los días que sueles entrenar, si llevas días sin moverte y cuando tu racha de Forge está en juego.' },
  { key: 'finance', label: 'Finanzas', module: 'finanzas', desc: 'Pagos que vencen mañana, sueldo por confirmar, presupuesto de comida y días sin movimientos.' },
  { key: 'sleep', label: 'Sueño', desc: 'Hasta qué hora el café (si lo tomas de tarde) y, si tu horario se viene corriendo o tienes un plan de sueño, «a acostarse» 45 min antes de tu hora. Sin sonido.' },
  { key: 'summary', label: 'Resumen del día', desc: 'Lo que viene, a las 8:00, y el cierre del día a las 22:00.' },
];

const DIETARY_CHIPS: Array<{ id: string; label: string; group: 'diet' | 'allergy' | 'belief' }> = [
  // Dietas y estilos de alimentación
  { id: 'vegetariano', label: 'Vegetariano', group: 'diet' },
  { id: 'vegano', label: 'Vegano', group: 'diet' },
  { id: 'pescetariano', label: 'Pescetariano', group: 'diet' },
  { id: 'keto', label: 'Keto', group: 'diet' },
  { id: 'bajo_carbos', label: 'Bajo en carbohidratos', group: 'diet' },
  { id: 'embarazo', label: 'Embarazo', group: 'diet' },
  // Creencias / preferencias
  { id: 'sin_cerdo', label: 'Sin cerdo', group: 'belief' },
  { id: 'sin_alcohol', label: 'Sin alcohol', group: 'belief' },
  // Alergias e intolerancias
  { id: 'sin_gluten', label: 'Sin gluten', group: 'allergy' },
  { id: 'sin_lactosa', label: 'Sin lactosa', group: 'allergy' },
  { id: 'sin_frutos_secos', label: 'Sin frutos secos', group: 'allergy' },
  { id: 'sin_mani', label: 'Sin maní', group: 'allergy' },
  { id: 'sin_mariscos', label: 'Sin mariscos', group: 'allergy' },
  { id: 'sin_pescado', label: 'Sin pescado', group: 'allergy' },
  { id: 'sin_huevo', label: 'Sin huevo', group: 'allergy' },
  { id: 'sin_soya', label: 'Sin soya', group: 'allergy' },
  { id: 'sin_sesamo', label: 'Sin sésamo', group: 'allergy' },
  { id: 'sin_mostaza', label: 'Sin mostaza', group: 'allergy' },
  { id: 'sin_apio', label: 'Sin apio', group: 'allergy' },
  { id: 'sin_sulfitos', label: 'Sin sulfitos', group: 'allergy' },
  { id: 'sin_lupino', label: 'Sin lupino', group: 'allergy' },
];
const DIETARY_GROUPS: Array<{ key: 'diet' | 'belief' | 'allergy'; title: string }> = [
  { key: 'diet', title: 'Dieta' },
  { key: 'belief', title: 'Creencias y preferencias' },
  { key: 'allergy', title: 'Alergias e intolerancias' },
];

/** 13.25 → "13:15" */
const fmtHour = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** Un grupo plegable de Perfil: título con lo que tiene adentro; se abre y cierra con una animación suave. */
function ProfileGroup({ id, icon, title, sub, open, onToggle, children }: {
  id: string; icon: string; title: string; sub: string; open: boolean; onToggle: (id: string) => void; children: React.ReactNode;
}) {
  return (
    <View style={pg.wrap}>
      <TouchableOpacity activeOpacity={0.75} onPress={() => onToggle(id)} style={[pg.head, open && pg.headOpen]}>
        <Text style={pg.icon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={pg.title}>{title}</Text>
          {!open && <Text style={pg.sub}>{sub}</Text>}
        </View>
        <Text style={[pg.chev, open && pg.chevOpen]}>›</Text>
      </TouchableOpacity>
      {open && <View style={pg.body}>{children}</View>}
    </View>
  );
}
const pgHelp = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 14, borderRadius: R.lg,
    backgroundColor: 'rgba(168,85,247,0.07)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.25)',
  },
  icon: { fontSize: 20 },
  title: { color: T.text, fontSize: 14, fontWeight: '800' },
  sub: { color: T.textMuted, fontSize: 12, fontWeight: '500', marginTop: 1 },
  chev: { color: '#c4b5fd', fontSize: 22, fontWeight: '700' },
});
const pg = StyleSheet.create({
  wrap: { marginBottom: 12 },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 16,
    backgroundColor: T.bgCard, borderRadius: R.xl, borderWidth: 1, borderColor: T.border,
  },
  headOpen: { borderColor: T.borderActive, backgroundColor: 'rgba(34,211,238,0.05)' },
  icon: { fontSize: 22 },
  title: { color: T.text, fontSize: 16, fontWeight: '800' },
  sub: { color: T.textMuted, fontSize: 12, fontWeight: '500', marginTop: 2 },
  chev: { color: T.textMuted, fontSize: 24, fontWeight: '700', transform: [{ rotate: '0deg' }] },
  chevOpen: { color: T.accent, transform: [{ rotate: '90deg' }] },
  body: { paddingTop: 12 },
});

const DEFAULT_THRESHOLDS: AlertThresholds = { glucoseLow: 70, glucoseHigh: 180, glucoseUrgentLow: 55, glucoseUrgentHigh: 250 };

const CONDITION_IDS = ['diabetes_t1','diabetes_t2','prediabetes','hypertension','hypotension','hypothyroidism','hyperthyroidism','obesity','dyslipidemia','asthma','copd','ckd','heart_failure','celiac','ibs','depression','anxiety','other'] as const;
const CONDITION_LABELS: Record<string, string> = {
  diabetes_t1:'Diabetes T1', diabetes_t2:'Diabetes T2', prediabetes:'Prediabetes',
  hypertension:'Hipertensión', hypotension:'Hipotensión',
  hypothyroidism:'Hipotiroidismo', hyperthyroidism:'Hipertiroidismo',
  obesity:'Obesidad', dyslipidemia:'Dislipidemia',
  asthma:'Asma', copd:'EPOC', ckd:'Enf. Renal Crónica', heart_failure:'Insuf. Cardíaca',
  celiac:'Celiaquía', ibs:'Colon Irritable',
  depression:'Depresión', anxiety:'Ansiedad', other:'Otra',
};

interface UserProfile {
  displayName: string;
  role?: string;
  goals?: string;
  language?: string;
  customContext?: string;
  medical?: MedicalProfile;
  integrations?: {
    libreView?: { email?: string; password?: string; region?: string };
    fatSecret?: { clientId?: string; clientSecret?: string };
  };
}

// ─── "Sobre mí" — transparencia de lo que Eris calculó/aprendió ────
interface MetricDiagnosis {
  key: string; label: string; unit: string;
  todayValue: number | null; expected: number | null; deltaPct: number | null;
  confidence: 'insufficient' | 'generic' | 'verified' | 'workday' | 'weekend' | 'all_days';
  flagged: boolean;
}
interface MetricTrend {
  key: string; label: string; unit: string;
  direction: 'improving' | 'worsening' | 'stable';
  recentAvg: number | null; priorAvg: number | null; changePct: number | null;
  significant: boolean;
}
interface MedicalGuidanceEntry { id: string; kind: 'condition' | 'medication'; label: string; guidance: string; }
interface PersonalNote { id: string; category: string; note: string; createdAt: string }
interface JournalEntry { id: string; date: string; moodScore?: number; note?: string; createdAt: string }
interface MetricDismissal { metric: string; until: string }
interface VerifiedOverride { metric: string; value: number; source: string; setAt: string }
interface AboutMeData {
  readiness: { unlocked: boolean; daysTracked: number; daysRemaining: number } | null;
  metrics: MetricDiagnosis[];
  trends: MetricTrend[];
  kbGuidance: MedicalGuidanceEntry[];
  notes: PersonalNote[];
  journal: JournalEntry[];
  dismissals: MetricDismissal[];
  overrides: VerifiedOverride[];
}
const METRIC_LABELS: Record<string, string> = {
  hydrationL: 'Hidratación', sleepHours: 'Sueño', proteinG: 'Proteína', steps: 'Actividad',
  restingHR: 'FC en reposo', plata: 'Tu plata', savingsRate: 'Tasa de ahorro', moodScore: 'Ánimo',
};
const NOTE_CATEGORY_LABELS: Record<string, string> = {
  hydration: 'Hidratación', sleep: 'Sueño', nutrition: 'Nutrición',
  training: 'Entrenamiento', finance: 'Finanzas', general: 'General',
};
const CONFIDENCE_LABELS: Record<string, string> = {
  workday: 'tu patrón (días laborales)', weekend: 'tu patrón (fines de semana)',
  all_days: 'tu patrón (todos los días)', generic: 'referencia genérica',
};

function SectionHeader({ title }: { title: string }) {
  return <Text style={s.sectionHeader}>{title}</Text>;
}

function FieldRow({ label, value, onChangeText, placeholder, multiline = false }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; multiline?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, multiline && s.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={T.textMuted}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        autoCorrect={false}
      />
    </View>
  );
}

export default function ProfileScreen({ onLogout, onSwitchAccount }: { onLogout?: () => void, onSwitchAccount?: () => void }) {
  const persona = usePersona(); // Eris, o Hestia en el Modo AXS Executive
  const glucoseOn = useFeature('glucose'); // módulo de glucosa: solo con visto bueno del administrador
  const [profileId, setProfileId] = useState('');
  const [sysRole, setSysRole] = useState('eris');
  const [profile, setProfile] = useState<UserProfile>({ displayName: '' });
  const [saved, setSaved] = useState(false);
  const [notifications, setNotifications] = useState(true);
  // «Ayudar a mejorar Eris» (medición de la beta): lo decide el servidor; llega al conectar
  const [usoMedido, setUsoMedido] = useState<boolean>(() => wsManager.getLastConnectedPayload()?.usoMedido !== false);
  const [reminders, setReminders] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  // Cómo te habla Eris (services/tone.ts): lo eliges tú; sin elegir, cercano y directo
  const [tone, setToneState] = useState<Tone>(DEFAULT_TONE);
  useEffect(() => { getTone().then((t) => { if (t) setToneState(t); }).catch(() => {}); }, []);
  const chooseTone = (t: Tone) => { setToneState(t); setTone(t).catch(() => {}); };
  // Modo estricto con los antojos (fase I7): apagado por defecto
  const [strictOn, setStrictOn] = useState(false);
  useEffect(() => { getStrictMode().then(setStrictOn).catch(() => {}); }, []);
  const toggleStrict = (on: boolean) => { setStrictOn(on); setStrictMode(on).catch(() => {}); };
  // Respaldo de Finanzas en el PC (services/financeBackup.ts): las copias y restaurar una
  const [finCopies, setFinCopies] = useState<BackupCopy[] | null>(null);
  const [finPick, setFinPick] = useState(false);
  const [finBusy, setFinBusy] = useState(false);
  const loadFinCopies = () => { listFinanceBackups().then((c) => setFinCopies(c)).catch(() => {}); };
  useEffect(() => { loadFinCopies(); }, []);
  const askRestore = (c: BackupCopy) => {
    Alert.alert(
      'Restaurar Finanzas',
      `Finanzas quedará como el ${fechaHora(c.at)}: ${c.stats.tx} movimientos y ${c.stats.cuentas} cuentas. Lo que tienes ahora se guarda aparte en el teléfono.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Restaurar', onPress: async () => {
          setFinBusy(true);
          const r = await restoreFinanceBackup(c.day);
          setFinBusy(false); setFinPick(false);
          Alert.alert(r.ok ? 'Finanzas restaurada' : 'No se pudo restaurar', r.message);
        } },
      ],
    );
  };
  // «¿Entrenas hoy?»: apagable (services/forge/trainingIntent.ts)
  const [askIntentOff, setAskIntentOff] = useState(false);
  useEffect(() => { AsyncStorage.getItem(ASK_OFF_KEY).then((v) => setAskIntentOff(v === '1')).catch(() => {}); }, []);
  // Respaldo de Forge en el PC (services/forgeBackup.ts), igual que el de Finanzas
  const [forgeCopies, setForgeCopies] = useState<ForgeBackupCopy[] | null>(null);
  const [forgePick, setForgePick] = useState(false);
  const [forgeBusy, setForgeBusy] = useState(false);
  const loadForgeCopies = () => { listForgeBackups().then((c) => setForgeCopies(c)).catch(() => {}); };
  useEffect(() => { loadForgeCopies(); }, []);
  const askForgeRestore = (c: ForgeBackupCopy) => {
    Alert.alert(
      'Restaurar Forge',
      `Forge quedará como el ${fechaHora(c.at)}: ${c.stats.dias} días entrenados y ${c.stats.habilidades} habilidades. Lo que tienes ahora se guarda aparte en el teléfono.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Restaurar', onPress: async () => {
          setForgeBusy(true);
          const r = await restoreForgeBackup(c.day);
          setForgeBusy(false); setForgePick(false);
          Alert.alert(r.ok ? 'Forge restaurado' : 'No se pudo restaurar', r.message);
        } },
      ],
    );
  };
  // Respaldo de Inventario en el PC (services/inventoryBackup.ts), igual que el de Forge
  const [invCopies, setInvCopies] = useState<InventoryBackupCopy[] | null>(null);
  const [invPick, setInvPick] = useState(false);
  const [invBusy, setInvBusy] = useState(false);
  const loadInvCopies = () => { listInventoryBackups().then((c) => setInvCopies(c)).catch(() => {}); };
  useEffect(() => { loadInvCopies(); }, []);
  const askInvRestore = (c: InventoryBackupCopy) => {
    Alert.alert(
      'Restaurar Inventario',
      `Tu Inventario quedará como el ${fechaHora(c.at)}: ${c.stats.items} cosas (${c.stats.conStock} con stock). Lo que tienes ahora se guarda aparte en el teléfono.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Restaurar', onPress: async () => {
          setInvBusy(true);
          const r = await inventoryStore.restore(c.day);
          setInvBusy(false); setInvPick(false);
          Alert.alert(r.ok ? 'Inventario restaurado' : 'No se pudo restaurar', r.message);
        } },
      ],
    );
  };
  const [adminOpen, setAdminOpen] = useState(false);
  // Grupos de Perfil abiertos (se recuerda; "Tú" viene abierto la primera vez)
  const [openGroups, setOpenGroups] = useState<string[]>(['tu']);
  useEffect(() => {
    AsyncStorage.getItem('eris_profile_groups').then((v) => {
      if (!v) return;
      try { const a = JSON.parse(v); if (Array.isArray(a)) setOpenGroups(a); } catch {}
    }).catch(() => {});
  }, []);
  const toggleGroup = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenGroups((g) => {
      const n = g.includes(id) ? g.filter((x) => x !== id) : [...g, id];
      AsyncStorage.setItem('eris_profile_groups', JSON.stringify(n)).catch(() => {});
      return n;
    });
  };

  // Burbuja de Eris sobre otras apps (modules/eris-bubble). Android pide "Mostrar sobre otras apps" en sus ajustes:
  // si falta, se abre esa pantalla y la burbuja se activa sola al volver con el permiso dado.
  // Modo burbuja: al minimizar o cambiar de app, Eris queda en segundo plano como burbuja. Encendido por defecto (la ✕
  // de la burbuja la cierra solo por esa vez); este interruptor lo apaga del todo.
  const [bubbleOn, setBubbleOn] = useState(() => ErisBubble.isActive());
  const bubblePending = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      if (bubblePending.current && ErisBubble.canDrawOverlays()) {
        bubblePending.current = false;
        setBubbleOn(ErisBubble.enable());
      } else if (bubblePending.current) {
        // Volvió sin el permiso. En Android 13+ las apps instaladas fuera de Play Store tienen "configuración
        // restringida": el permiso aparece bloqueado hasta permitirlo a mano desde la información de la app.
        bubblePending.current = false;
        setBubbleOn(false);
        Alert.alert(
          'Android bloqueó el permiso',
          'Como Eris no viene de Play Store, Android protege "Mostrar sobre otras apps". Para desbloquearlo: en la información de la app toca ⋮ (arriba a la derecha) → "Permitir configuración restringida", confirma con tu PIN o huella y vuelve a activar la burbuja.',
          [
            { text: 'Ahora no', style: 'cancel' },
            { text: 'Abrir info de la app', onPress: () => { Linking.openSettings().catch(() => {}); } },
          ],
        );
      } else {
        setBubbleOn(ErisBubble.isActive());
      }
    });
    return () => { sub.remove(); };
  }, []);
  const handleToggleBubble = (on: boolean) => {
    if (!on) { ErisBubble.disable(); setBubbleOn(false); return; }
    if (ErisBubble.canDrawOverlays()) { setBubbleOn(ErisBubble.enable()); return; }
    Alert.alert(
      'Permitir la burbuja',
      'Android necesita el permiso "Mostrar sobre otras apps" para que Eris flote encima de todo. Se abrirá esa pantalla: activa el permiso para Eris y vuelve.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir ajustes', onPress: () => { bubblePending.current = true; ErisBubble.openOverlaySettings(); } },
      ],
    );
  };

  // Medication add form state
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [medSchedule, setMedSchedule] = useState('');



  const [axsMode, setAxsMode] = useState(false);
  const [enabledModules, setEnabledModules] = useState<string[]>(DEFAULT_MODULES);

  const [aboutMe, setAboutMe] = useState<AboutMeData | null>(null);

  // Metas nutricionales: antes solo se podían fijar pidiéndoselo a Eris por chat.
  const [calorieGoalInput, setCalorieGoalInput] = useState('');
  const [waterGoalInput, setWaterGoalInput] = useState('');
  const [proteinGoalInput, setProteinGoalInput] = useState('');
  const [savingGoals, setSavingGoals] = useState(false);
  // Las metas que rigen hoy (lo fijado o lo calculado con Forge y el perfil médico): van de ejemplo en los campos vacíos.
  // Antes los campos vacíos decían "2000" y "2.5", que no eran las metas de nadie.
  const [effectiveGoals, setEffectiveGoals] = useState<{ calories?: number; waterLiters?: number; protein?: number; waterTargetOff?: number }>({});

  useEffect(() => {
    const load = () => AsyncStorage.multiGet([STORAGE_KEY_GOALS_SET, STORAGE_KEY_GOALS]).then(([[, setRaw], [, effRaw]]) => {
      try { setEffectiveGoals(effRaw ? JSON.parse(effRaw) : {}); } catch {}
      // En los campos, solo lo que fijaste a mano (las metas calculadas con Forge no se muestran como si las hubieras puesto tú)
      const raw = setRaw ?? effRaw; // servidor anterior: no mandaba lo fijado aparte
      if (!raw) return;
      try {
        const g = JSON.parse(raw);
        if (g.calories) setCalorieGoalInput(String(g.calories));
        if (g.waterLiters) setWaterGoalInput(String(g.waterLiters));
        if (g.protein) setProteinGoalInput(String(g.protein));
      } catch {}
    }).catch(() => {});
    load();
    const sub = DeviceEventEmitter.addListener('NUTRITION_GOALS_UPDATED', () => {
      AsyncStorage.getItem(STORAGE_KEY_GOALS).then((r) => { try { setEffectiveGoals(r ? JSON.parse(r) : {}); } catch {} }).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  // Horario: a qué hora se levanta normalmente (para quien trasnocha o trabaja de noche). Lo del reloj se usa solo; esto manda.
  const [schedInfo, setSchedInfo] = useState(daySchedule.info());
  const [wakeInput, setWakeInput] = useState('');
  useEffect(() => {
    const sync = () => { const i = daySchedule.info(); setSchedInfo(i); setWakeInput((cur) => cur || (i.manual != null ? fmtHour(i.manual) : '')); };
    daySchedule.load().then(sync);
    const sub = DeviceEventEmitter.addListener(DAY_SCHEDULE_EVENT, sync);
    return () => sub.remove();
  }, []);
  const handleSaveWake = async () => {
    const t = wakeInput.trim();
    if (!t) { await daySchedule.setManual(null); Alert.alert('Listo', 'Tu horario vuelve a salir del reloj.'); return; }
    const m = t.match(/^(\d{1,2})(?:[:.h](\d{2}))?$/);
    const h = m ? Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0) : NaN;
    if (!(h >= 0 && h < 24)) { Alert.alert('Hora no válida', 'Escríbela como 7:30 o 13:00.'); return; }
    await daySchedule.setManual(h);
    setWakeInput(fmtHour(h));
    Alert.alert('Listo', `Tus comidas y tu día se ordenan desde las ${fmtHour(h)}.`);
  };

  const handleSaveGoals = () => {
    const goals: Record<string, number> = {};
    const cal = parseFloat(calorieGoalInput.replace(',', '.'));
    const water = parseFloat(waterGoalInput.replace(',', '.'));
    const protein = parseFloat(proteinGoalInput.replace(',', '.'));
    if (Number.isFinite(cal) && cal > 0) goals.calories = Math.round(cal);
    if (Number.isFinite(water) && water > 0) goals.waterLiters = Math.round(water * 100) / 100;
    if (Number.isFinite(protein) && protein > 0) goals.protein = Math.round(protein);
    if (!Object.keys(goals).length) { Alert.alert('Nada que guardar', 'Indica al menos una meta.'); return; }
    setSavingGoals(true);
    wsManager.sendMessage({ type: 'set_nutrition_goals', goals });
  };

  const handleToggleNotifications = async (value: boolean) => {
    if (!profileId) return; // BUG-04: guard si profileId aun no cargó
    setNotifications(value);
    await AsyncStorage.setItem(`eris_notifications_${profileId}`, JSON.stringify(value));
    wsManager.sendMessage({ type: 'save_preference', key: 'notifications', value });
    DeviceEventEmitter.emit(PLAN_REFRESH_EVENT); // apagado: se quitan los avisos programados; encendido: se programan
  };

  const handleToggleUso = (value: boolean) => {
    const enviar = () => { setUsoMedido(value); wsManager.sendMessage({ type: 'save_preference', key: 'metricas_uso', value }); };
    if (value) { enviar(); return; }
    Alert.alert('Dejar de ayudar con datos de uso', 'Eris deja de contar cuánto usas la app y borra lo que ya había contado. Todo lo demás sigue igual.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar y borrar', style: 'destructive', onPress: enviar },
    ]);
  };

  const handleToggleReminder = async (key: keyof ReminderSettings, value: boolean) => {
    if (!profileId) return;
    const next = { ...reminders, [key]: value };
    setReminders(next);
    await AsyncStorage.setItem(reminderSettingsKey(profileId), JSON.stringify(next)).catch(() => {});
    DeviceEventEmitter.emit(PLAN_REFRESH_EVENT);
  };

  const handleToggleAxsMode = async (value: boolean) => {
    if (!profileId) return;
    setAxsMode(value);
    await AsyncStorage.setItem(`eris_axs_mode_${profileId}`, JSON.stringify(value));
    DeviceEventEmitter.emit('AXS_MODE_CHANGED', value);
  };

  const handleToggleModule = async (moduleId: string) => {
    if (!profileId) return;
    const updated = enabledModules.includes(moduleId)
      ? enabledModules.filter(m => m !== moduleId)
      : [...enabledModules, moduleId];
    setEnabledModules(updated);
    await ModuleStorage.set(profileId, updated);
    DeviceEventEmitter.emit('MODULES_CHANGED', updated);
  };

  const getMedical = (p: UserProfile): MedicalProfile => ({
    conditions: [],
    medications: [],
    ...p.medical,
    thresholds: { ...DEFAULT_THRESHOLDS, ...p.medical?.thresholds },
  });

  const toggleCondition = (id: string) => {
    setProfile(p => {
      const med = getMedical(p);
      const exists = med.conditions.some(c => c.id === id);
      const conditions = exists
        ? med.conditions.filter(c => c.id !== id)
        : [...med.conditions, { id }];
      return { ...p, medical: { ...med, conditions } };
    });
  };

  const addMedication = () => {
    if (!medName.trim()) return;
    const newMed: Medication = { id: Date.now().toString(), name: medName.trim(), dose: medDose.trim() || undefined, schedule: medSchedule.trim() || undefined, active: true };
    setProfile(p => {
      const med = getMedical(p);
      return { ...p, medical: { ...med, medications: [...med.medications, newMed] } };
    });
    setMedName(''); setMedDose(''); setMedSchedule('');
  };

  const removeMedication = (id: string) => {
    setProfile(p => {
      const med = getMedical(p);
      return { ...p, medical: { ...med, medications: med.medications.filter(m => m.id !== id) } };
    });
  };

  const setThreshold = (key: keyof AlertThresholds, raw: string) => {
    const n = parseFloat(raw);
    if (isNaN(n)) return;
    setProfile(p => {
      const med = getMedical(p);
      return { ...p, medical: { ...med, thresholds: { ...med.thresholds, [key]: n } } };
    });
  };

  useEffect(() => {
    AuthStorage.getCredentials().then(creds => {
      if (creds) {
        setProfileId(creds.profileId);
        // Cargar preferencias SÓLO después de tener el profileId real
        const notifKey = `eris_notifications_${creds.profileId}`;
        const axsKey = `eris_axs_mode_${creds.profileId}`;
        AsyncStorage.getItem(notifKey).then(val => {
          if (val !== null) setNotifications(JSON.parse(val));
          else setNotifications(true); // default
        });
        AsyncStorage.getItem(reminderSettingsKey(creds.profileId)).then(val => {
          try { setReminders({ ...DEFAULT_REMINDER_SETTINGS, ...(val ? JSON.parse(val) : {}) }); } catch { setReminders(DEFAULT_REMINDER_SETTINGS); }
        }).catch(() => {});
        AsyncStorage.getItem(axsKey).then(val => {
          if (val !== null) setAxsMode(JSON.parse(val));
          else setAxsMode(false);
        });
        ModuleStorage.get(creds.profileId).then(setEnabledModules);
      }
    });

    // Cargar perfil cacheado primero por si nos montamos después de conectar
    const cachedPayload = wsManager.getLastConnectedPayload();
    if (cachedPayload) {
      if (cachedPayload.userProfile) setProfile(cachedPayload.userProfile);
      if (cachedPayload.role) setSysRole(cachedPayload.role);
    }

    // Escuchar actualizaciones en tiempo real
    const unsub = wsManager.subscribeMessage((data) => {
      if (data.type === 'connected') {
        if (data.userProfile) setProfile(data.userProfile);
        if (data.role) setSysRole(data.role);
      }
      // Eris cambió el perfil por chat (p. ej. guardó un examen): la pantalla se pone al día sin reconectar
      if (data.type === 'profile_updated' && data.profile) setProfile(data.profile);
      if (data.type === 'profile_saved') {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
      if (data.type === 'nutrition_goals_updated') {
        // nutritionBackend también escucha este mismo mensaje y ya deja todo sincronizado en AsyncStorage
        // (Inicio/Nutrición/Métricas); acá solo se confirma en pantalla y se avisa si algo quedó fuera de rango.
        setSavingGoals(false);
        if (data.error) Alert.alert('Error', data.error);
        else if (data.rejected?.length) Alert.alert('Meta guardada con avisos', data.rejected.join('\n'));
      }
      if (data.type === 'about_me') {
        // request_about_me siempre trae el perfil fresco del servidor — a
        // diferencia del snapshot de 'connected' (que puede quedar viejo si
        // el perfil cambió por chat sin que la app se haya reconectado), esto
        // asegura que los chips de condiciones no queden desincronizados de
        // lo que el propio panel de abajo (kbGuidance) ya está mostrando.
        if (data.userProfile) setProfile(data.userProfile);
        setAboutMe({
          readiness: data.readiness,
          metrics: data.metrics || [],
          trends: data.trends || [],
          kbGuidance: data.kbGuidance || [],
          notes: data.notes || [],
          journal: data.journal || [],
          dismissals: data.dismissals || [],
          overrides: data.overrides || [],
        });
      }
      if (data.type === 'user_note_deleted') {
        setAboutMe(prev => prev ? { ...prev, notes: prev.notes.filter(n => n.id !== data.noteId) } : prev);
      }
      if (data.type === 'metric_feedback_cleared') {
        setAboutMe(prev => {
          if (!prev) return prev;
          if (data.kind === 'override') return { ...prev, overrides: prev.overrides.filter(o => o.metric !== data.metric) };
          return { ...prev, dismissals: prev.dismissals.filter(d => d.metric !== data.metric) };
        });
      }
    });
    if (wsManager.getStatus() === 'connected') {
      wsManager.sendMessage({ type: 'request_about_me' });
    }
    return () => { unsub(); };
  }, []);

  const handleDeleteNote = (id: string) => {
    setAboutMe(prev => prev ? { ...prev, notes: prev.notes.filter(n => n.id !== id) } : prev);
    wsManager.sendMessage({ type: 'delete_user_note', noteId: id });
  };

  const handleClearFeedback = (metric: string, kind: 'dismissal' | 'override') => {
    setAboutMe(prev => {
      if (!prev) return prev;
      if (kind === 'override') return { ...prev, overrides: prev.overrides.filter(o => o.metric !== metric) };
      return { ...prev, dismissals: prev.dismissals.filter(d => d.metric !== metric) };
    });
    wsManager.sendMessage({ type: 'clear_metric_feedback', metric, kind });
  };

  // Verificar permisos de Health Connect cuando la app vuelve al foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        const granted = await metricsService.checkGrantedPermissions();
        if (granted.length > 0) {
          // Tiene permisos — actualizar initialized para que getSnapshot funcione
          metricsService.init();
        }
      }
    });
    return () => sub.remove();
  }, []);

  const handleSaveProfile = () => {
    wsManager.sendMessage({ type: 'save_profile', profile });
  };

  const handleSyncHealth = async () => {
    const initOk = await metricsService.init();
    if (initOk !== true) {
      Alert.alert(
        'Health Connect no disponible',
        'Asegúrate de tener la app Health Connect instalada y actualizada en tu dispositivo.',
        [{ text: 'OK' }]
      );
      return;
    }

    const granted = await metricsService.checkGrantedPermissions();
    const label = granted.length > 0
      ? `Ya tienes acceso a ${granted.length} de 17. Vuelve a pedir todos (útil si falta escribir Nutrición o Hidratación: sin eso, lo que anotas a mano en Nutrición no aparece en Inicio ni Métricas).`
      : 'Se abrirá el diálogo de Health Connect para activar los 17 permisos que usa Eris (lectura de métricas + escritura de comida y agua).';

    Alert.alert(
      'Conectar Health Connect',
      label,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Pedir todos los permisos',
          onPress: async () => {
            const result = await metricsService.requestAllPermissions();
            if (!result.ok) { Alert.alert('Error', result.error); return; }
            // Con el permiso recién concedido, reintenta lo de hoy que había quedado sin llegar a Health Connect
            // (comida/agua anotadas antes de otorgar el permiso) — así aparece sin tener que volver a registrarlo.
            nutritionBackend.backfillHealthConnect().catch(() => {});
            Alert.alert('Listo', `Health Connect confirmó ${result.granted.length} de 17 permisos. Si falta alguno, Android no vuelve a preguntar por él solo — usa "Administrar en ajustes" para activarlo a mano.`);
          },
        },
        {
          text: 'Administrar en ajustes',
          onPress: async () => {
            const result = await metricsService.openPermissionsScreen();
            if (typeof result === 'string') Alert.alert('Error', result);
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Seguro que deseas salir de este perfil seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          onPress: () => {
            // Resetear estado de preferencias antes de salir
            setAxsMode(false);
            setNotifications(true);
            DeviceEventEmitter.emit('AXS_MODE_CHANGED', false);
            onLogout?.();
          },
          style: 'destructive'
        }
      ]
    );
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={[s.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={s.header}>
        <Text style={s.title}>Perfil</Text>
        <View style={s.profileBadge}>
          <Text style={s.profileBadgeText}>{profileId}</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Siempre a la vista: para quien se pierde */}
        <TouchableOpacity onPress={() => DeviceEventEmitter.emit(TOUR_EVENT)} activeOpacity={0.75} style={pgHelp.row}>
          <Text style={pgHelp.icon}>🧭</Text>
          <View style={{ flex: 1 }}>
            <Text style={pgHelp.title}>Ver el recorrido de la app</Text>
            <Text style={pgHelp.sub}>Te muestro dónde está cada cosa, en un minuto</Text>
          </View>
          <Text style={pgHelp.chev}>›</Text>
        </TouchableOpacity>

        {/* Perfil en 4 grupos plegables (2026-10-10, plan para que la app se digiera fácil): antes eran 12 tarjetas en una
            sola pantalla larga. Lo de siempre queda igual adentro; el grupo "Tú" viene abierto y el resto se abre al tocarlo. */}
        <ProfileGroup id="tu" icon="👤" title="Tú" sub={`Cómo te conoce ${persona.name} y lo que sabe de ti`} open={openGroups.includes('tu')} onToggle={toggleGroup}>
          {/* Identidad para Eris */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>⚡ Personalización de {persona.name}</Text>
              <Text style={s.cardDesc}>
                Este perfil define cómo {persona.name} te conoce. Cuanto más detallado, más personalizada será tu experiencia.
              </Text>
            </View>

            <FieldRow
              label="Nombre o alias"
              value={profile.displayName}
              onChangeText={v => setProfile(p => ({ ...p, displayName: v }))}
              placeholder={`¿Cómo quieres que te llame ${persona.name}?`}
            />
            <FieldRow
              label="Tu rol o contexto"
              value={profile.role || ''}
              onChangeText={v => setProfile(p => ({ ...p, role: v }))}
              placeholder="Ej: CEO de startup, estudiante de medicina, investigador..."
            />
            <FieldRow
              label="Objetivos principales"
              value={profile.goals || ''}
              onChangeText={v => setProfile(p => ({ ...p, goals: v }))}
              placeholder="¿Qué quieres lograr? ¿En qué áreas necesitas más soporte?"
              multiline
            />
            <FieldRow
              label="Contexto adicional"
              value={profile.customContext || ''}
              onChangeText={v => setProfile(p => ({ ...p, customContext: v }))}
              placeholder={`Cualquier información que ${persona.name} deba saber siempre (proyectos actuales, restricciones, preferencias...)`}
              multiline
            />

            <TouchableOpacity
              style={[s.btnPrimary, saved && s.btnSuccess]}
              onPress={handleSaveProfile}
            >
              <Text style={s.btnPrimaryText}>{saved ? '✅ Guardado' : 'Guardar Perfil'}</Text>
            </TouchableOpacity>
          </View>

          {/* Sobre mí — transparencia de lo que Eris calculó/aprendió */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Lo que {persona.name} sabe de ti</Text>
            <Text style={s.cardDesc}>Todo lo que usa para personalizar tus análisis, a la vista — nada vive oculto.</Text>

            {aboutMe?.readiness && (
              <View style={[about.pill, aboutMe.readiness.unlocked ? about.pillOn : about.pillOff]}>
                <Text style={[about.pillText, { color: aboutMe.readiness.unlocked ? T.green : T.textMuted }]}>
                  {aboutMe.readiness.unlocked
                    ? `✓ Perfil desbloqueado — ${aboutMe.readiness.daysTracked} días de historial`
                    : `🔒 En aprendizaje — faltan ${aboutMe.readiness.daysRemaining} día${aboutMe.readiness.daysRemaining === 1 ? '' : 's'} (${aboutMe.readiness.daysTracked}/7)`}
                </Text>
              </View>
            )}

            {!aboutMe ? (
              <Text style={s.cardDesc}>Cargando...</Text>
            ) : (
              <>
                <Text style={about.subhead}>Tus promedios calculados</Text>
                {aboutMe.metrics.filter(m => m.confidence !== 'insufficient').length === 0 ? (
                  <Text style={about.emptyText}>Aún no hay suficiente historial para ninguna métrica.</Text>
                ) : (
                  aboutMe.metrics.filter(m => m.confidence !== 'insufficient').map(m => (
                    <View key={m.key} style={about.metricRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={about.metricLabel}>{m.label}</Text>
                        <Text style={about.metricSub}>
                          Hoy: {m.todayValue ?? '—'}{m.unit} · Esperado: {m.expected ?? '—'}{m.unit} · {CONFIDENCE_LABELS[m.confidence] || m.confidence}
                        </Text>
                      </View>
                      {m.deltaPct !== null && (
                        <Text style={[about.metricDelta, { color: m.flagged ? T.red : T.textMuted }]}>
                          {m.deltaPct > 0 ? '+' : ''}{m.deltaPct}%
                        </Text>
                      )}
                    </View>
                  ))
                )}

                {aboutMe.trends.some(t => t.significant) && (
                  <>
                    <Text style={about.subhead}>Tendencias de varios días (distinto de hoy)</Text>
                    {aboutMe.trends.filter(t => t.significant).map(t => (
                      <View key={t.key} style={about.metricRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={about.metricLabel}>{t.label}</Text>
                          <Text style={about.metricSub}>
                            Últimos 7 días: {t.recentAvg}{t.unit} · Semana anterior: {t.priorAvg}{t.unit}
                          </Text>
                        </View>
                        <Text style={[about.metricDelta, { color: t.direction === 'worsening' ? T.red : T.green }]}>
                          {t.direction === 'worsening' ? '↓' : '↑'} {t.changePct !== null && t.changePct > 0 ? '+' : ''}{t.changePct}%
                        </Text>
                      </View>
                    ))}
                  </>
                )}

                {aboutMe.kbGuidance.length > 0 && (
                  <>
                    <Text style={about.subhead}>Cómo tus condiciones/medicamentos ajustan tus análisis</Text>
                    {aboutMe.kbGuidance.map(g => (
                      <View key={g.id} style={about.kbRow}>
                        <Text style={about.kbLabel}>{g.label}</Text>
                        <Text style={about.kbText}>{g.guidance}</Text>
                      </View>
                    ))}
                  </>
                )}

                <Text style={about.subhead}>Lo que le has contado a {persona.name}</Text>
                {aboutMe.notes.length === 0 ? (
                  <Text style={about.emptyText}>Nada guardado todavía — cuéntale a {persona.name} en el chat cosas como "no tomo agua en la mañana porque me da reflujo" y las recordará aquí.</Text>
                ) : (
                  aboutMe.notes.map(n => (
                    <View key={n.id} style={about.noteRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={about.noteCategory}>{NOTE_CATEGORY_LABELS[n.category] || n.category}</Text>
                        <Text style={about.noteText}>{n.note}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteNote(n.id)} style={med.medDel}>
                        <Text style={med.medDelText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}

                <Text style={about.subhead}>Tu bloc de notas</Text>
                {aboutMe.journal.length === 0 ? (
                  <Text style={about.emptyText}>Todavía no has anotado nada — hazlo desde Dashboard o cuéntaselo a {persona.name} en el chat.</Text>
                ) : (
                  aboutMe.journal.map(j => (
                    <View key={j.id} style={about.kbRow}>
                      <Text style={about.kbLabel}>{j.date}{j.moodScore ? ` · ánimo ${j.moodScore}/5` : ''}</Text>
                      {j.note ? <Text style={about.kbText}>{j.note}</Text> : null}
                    </View>
                  ))
                )}

                {(aboutMe.dismissals.length > 0 || aboutMe.overrides.length > 0) && (
                  <>
                    <Text style={about.subhead}>Retroalimentación que le diste a {persona.name}</Text>
                    {aboutMe.dismissals.map(d => (
                      <View key={`d_${d.metric}`} style={about.noteRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={about.noteCategory}>SILENCIADO</Text>
                          <Text style={about.noteText}>{METRIC_LABELS[d.metric] || d.metric} hasta {new Date(d.until).toLocaleDateString('es-ES')}</Text>
                        </View>
                        <TouchableOpacity onPress={() => handleClearFeedback(d.metric, 'dismissal')} style={med.medDel}>
                          <Text style={med.medDelText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    {aboutMe.overrides.map(o => (
                      <View key={`o_${o.metric}`} style={about.noteRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={about.noteCategory}>OBJETIVO VERIFICADO</Text>
                          <Text style={about.noteText}>{METRIC_LABELS[o.metric] || o.metric} = {o.value} (fuente: {o.source})</Text>
                        </View>
                        <TouchableOpacity onPress={() => handleClearFeedback(o.metric, 'override')} style={med.medDel}>
                          <Text style={med.medDelText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
          </View>
        </ProfileGroup>

        <ProfileGroup id="dia" icon="🎯" title="Tu día y tus metas" sub={'Horario, metas de comida y agua, y tus módulos'} open={openGroups.includes('dia')} onToggle={toggleGroup}>
          <View style={[s.card, { marginTop: 12 }]}>
            <Text style={s.cardTitle}>Tu horario</Text>
            <Text style={s.cardDesc}>
              {schedInfo.detected != null
                ? `Según tu reloj te levantas cerca de las ${fmtHour(schedInfo.detected)}. `
                : 'Todavía no sé a qué hora te levantas (sin datos de sueño del reloj). '}
              Con eso ordeno tus comidas (el desayuno es al despertar, no a una hora fija) y tu día de comida: lo que comes de
              madrugada antes de dormir cuenta para ese día. Escribe tu hora si trabajas de noche o el reloj no la tiene.
            </Text>
            <Text style={[s.fieldLabel, { marginTop: 8 }]}>Normalmente me levanto a las</Text>
            <TextInput
              style={s.input}
              value={wakeInput}
              onChangeText={setWakeInput}
              placeholder={schedInfo.detected != null ? fmtHour(schedInfo.detected) : '7:30'}
              placeholderTextColor={T.textMuted}
              keyboardType="numbers-and-punctuation"
            />
            <TouchableOpacity style={[s.btnSecondary, { borderColor: T.accent, backgroundColor: T.accentGlow + '10', marginTop: 10 }]} onPress={handleSaveWake}>
              <Text style={[s.btnSecondaryText, { color: T.accent }]}>{wakeInput.trim() ? 'Guardar horario' : 'Usar el del reloj'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => DeviceEventEmitter.emit(WELCOME_EVENT)} style={{ marginTop: 12, alignItems: 'center' }} activeOpacity={0.7}>
              <Text style={{ color: T.textMuted, fontSize: 12, fontWeight: '700' }}>Ver la bienvenida otra vez</Text>
            </TouchableOpacity>
          </View>

          <View style={[s.card, { marginTop: 12 }]}>
            <Text style={s.cardTitle}>Metas nutricionales</Text>
            <Text style={s.cardDesc}>
              {effectiveGoals.calories
                ? `Hoy rigen ${Math.round(effectiveGoals.calories)} kcal${effectiveGoals.waterTargetOff ? '' : effectiveGoals.waterLiters ? ` · ${String(effectiveGoals.waterLiters).replace('.', ',')} L de agua` : ''}${effectiveGoals.protein ? ` · ${Math.round(effectiveGoals.protein)} g de proteína` : ''}, calculadas con Forge y tu perfil. Escribe un número solo si quieres otra meta; en blanco se mantiene el cálculo.`
                : `Déjalas en blanco para que ${persona.name} las calcule con Forge y tu perfil.`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Calorías (kcal)</Text>
                <TextInput
                  style={s.input}
                  value={calorieGoalInput}
                  onChangeText={setCalorieGoalInput}
                  placeholder={effectiveGoals.calories ? String(Math.round(effectiveGoals.calories)) : '2000'}
                  placeholderTextColor={T.textMuted}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Agua (L)</Text>
                <TextInput
                  style={s.input}
                  value={waterGoalInput}
                  onChangeText={setWaterGoalInput}
                  placeholder={effectiveGoals.waterTargetOff ? 'sin meta' : effectiveGoals.waterLiters ? String(effectiveGoals.waterLiters) : '2.5'}
                  placeholderTextColor={T.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={s.fieldLabel}>Proteína (g) — opcional</Text>
              <Text style={[s.cardDesc, { marginBottom: 6 }]}>
                Sin esto, Métricas usa una referencia según tu peso (o 60g si no lo conoce).
              </Text>
              <TextInput
                style={s.input}
                value={proteinGoalInput}
                onChangeText={setProteinGoalInput}
                placeholder={effectiveGoals.protein ? String(Math.round(effectiveGoals.protein)) : 'Ej: 90'}
                placeholderTextColor={T.textMuted}
                keyboardType="numeric"
              />
            </View>
            <TouchableOpacity
              style={[s.btnSecondary, { borderColor: T.accent, backgroundColor: T.accentGlow + '10' }, savingGoals && { opacity: 0.6 }]}
              onPress={handleSaveGoals}
              disabled={savingGoals}
            >
              <Text style={[s.btnSecondaryText, { color: T.accent }]}>{savingGoals ? 'Guardando…' : 'Guardar metas'}</Text>
            </TouchableOpacity>
          </View>

          {/* Módulos activos */}
          <SectionHeader title="🧩 MÓDULOS" />
          <View style={s.modulesGrid}>
            {MODULES.map(mod => {
              const review = !!mod.requiresFeature && !(mod.requiresFeature === 'glucose' && glucoseOn);
              const isOn = enabledModules.includes(mod.id) && !review;
              const locked = mod.alwaysOn || mod.status === 'coming_soon' || review;
              return (
                <TouchableOpacity
                  key={mod.id}
                  style={[
                    s.moduleCard,
                    isOn && !mod.alwaysOn && s.moduleCardActive,
                    locked && { opacity: mod.status === 'coming_soon' || review ? 0.55 : 1 },
                  ]}
                  onPress={() => !locked && handleToggleModule(mod.id)}
                  activeOpacity={locked ? 1 : 0.7}
                >
                  <Text style={s.moduleIcon}>{mod.icon}</Text>
                  <Text style={[s.moduleName, isOn && !mod.alwaysOn && { color: T.accent }]}>
                    {mod.name}
                  </Text>
                  <Text style={s.moduleDesc} numberOfLines={2}>{mod.description}</Text>
                  <View style={s.moduleFooter}>
                    {review ? (
                      <View style={s.moduleSoonBadge}>
                        <Text style={s.moduleSoonText}>En revisión</Text>
                      </View>
                    ) : mod.status === 'coming_soon' ? (
                      <View style={s.moduleSoonBadge}>
                        <Text style={s.moduleSoonText}>Próximamente</Text>
                      </View>
                    ) : mod.alwaysOn ? (
                      <View style={s.moduleEssentialBadge}>
                        <Text style={s.moduleEssentialText}>Esencial</Text>
                      </View>
                    ) : (
                      <Switch
                        value={isOn}
                        onValueChange={() => handleToggleModule(mod.id)}
                        trackColor={{ false: T.border, true: T.accentGlow }}
                        thumbColor={isOn ? T.accent : T.textMuted}
                        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ProfileGroup>

        <ProfileGroup id="salud" icon="🩺" title="Tu salud" sub={'Condiciones, medicamentos y exámenes'} open={openGroups.includes('salud')} onToggle={toggleGroup}>
          {/* Historial médico */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Condiciones activas</Text>
            <Text style={s.cardDesc}>{persona.name} adapta sus protocolos y contexto según tu historial. Solo marca las condiciones que tengas diagnosticadas.</Text>
            <View style={med.condGrid}>
              {CONDITION_IDS.map(id => {
                const active = (profile.medical?.conditions ?? []).some(c => c.id === id);
                return (
                  <TouchableOpacity key={id} style={[med.condChip, active && med.condChipOn]} onPress={() => toggleCondition(id)} activeOpacity={0.75}>
                    <Text style={[med.condChipText, active && med.condChipTextOn]}>{CONDITION_LABELS[id]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[s.card, { marginTop: 12 }]}>
            <Text style={s.cardTitle}>Datos clínicos</Text>
            <Text style={s.fieldLabel}>Grupo sanguíneo</Text>
            <View style={med.bloodGrid}>
              {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bt => {
                const sel = profile.medical?.bloodType === bt;
                return (
                  <TouchableOpacity key={bt} style={[med.bloodBtn, sel && med.bloodBtnOn]} onPress={() => setProfile(p => ({ ...p, medical: { ...getMedical(p), bloodType: bt } }))}>
                    <Text style={[med.bloodBtnText, sel && med.bloodBtnTextOn]}>{bt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={s.field}>
              <Text style={s.fieldLabel}>Alergias / Intolerancias</Text>
              <TextInput
                style={[s.input, s.inputMulti]}
                value={profile.medical?.allergies ?? ''}
                onChangeText={v => setProfile(p => ({ ...p, medical: { ...getMedical(p), allergies: v } }))}
                placeholder="Ej: lactosa, gluten, penicilina..."
                placeholderTextColor={T.textMuted}
                multiline numberOfLines={2}
              />
            </View>
            <View style={s.field}>
              <Text style={s.fieldLabel}>Restricciones alimentarias</Text>
              <Text style={med.dietHint}>{persona.name} nunca te recomendará comida que las incumpla; si no puede confirmar que un alimento las respeta, lo deja fuera.</Text>
              {DIETARY_GROUPS.map(g => (
                <View key={g.key} style={{ marginBottom: 6 }}>
                  <Text style={med.dietGroup}>{g.title}</Text>
                  <View style={med.bloodGrid}>
                    {DIETARY_CHIPS.filter(c => c.group === g.key).map(c => {
                      const sel = (profile.medical?.dietaryRestrictions ?? []).includes(c.id);
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[med.dietChip, sel && med.dietChipOn]}
                          onPress={() => setProfile(p => {
                            const m = getMedical(p);
                            const cur = m.dietaryRestrictions ?? [];
                            const next = cur.includes(c.id) ? cur.filter(x => x !== c.id) : [...cur, c.id];
                            return { ...p, medical: { ...m, dietaryRestrictions: next } };
                          })}
                        >
                          <Text style={[med.dietChipText, sel && med.dietChipTextOn]}>{c.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
            <TouchableOpacity style={[s.btnPrimary, saved && s.btnSuccess]} onPress={handleSaveProfile}>
              <Text style={s.btnPrimaryText}>{saved ? '✅ Guardado' : 'Guardar Historial'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[s.card, { marginTop: 12 }]}>
            <Text style={s.cardTitle}>Medicamentos activos</Text>
            {(profile.medical?.medications ?? []).filter(m => m.active).map(m => (
              <View key={m.id} style={med.medRow}>
                <View style={{ flex: 1 }}>
                  <Text style={med.medName}>{m.name}</Text>
                  {(m.dose || m.schedule) && <Text style={med.medSub}>{[m.dose, m.schedule].filter(Boolean).join(' · ')}</Text>}
                </View>
                <TouchableOpacity onPress={() => removeMedication(m.id)} style={med.medDel}>
                  <Text style={med.medDelText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={med.addForm}>
              <TextInput style={[s.input, { flex: 1 }]} value={medName} onChangeText={setMedName} placeholder="Nombre del medicamento" placeholderTextColor={T.textMuted} />
            </View>
            <View style={med.addFormRow}>
              <TextInput style={[s.input, { flex: 1 }]} value={medDose} onChangeText={setMedDose} placeholder="Dosis (ej: 500mg)" placeholderTextColor={T.textMuted} />
              <TextInput style={[s.input, { flex: 1 }]} value={medSchedule} onChangeText={setMedSchedule} placeholder="Horario (ej: mañana)" placeholderTextColor={T.textMuted} />
            </View>
            <TouchableOpacity style={s.btnSecondary} onPress={addMedication}>
              <Text style={s.btnSecondaryText}>+ Agregar medicamento</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnPrimary, saved && s.btnSuccess]} onPress={handleSaveProfile}>
              <Text style={s.btnPrimaryText}>{saved ? '✅ Guardado' : 'Guardar Medicamentos'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[s.card, { marginTop: 12 }]}>
            <Text style={s.cardTitle}>Exámenes</Text>
            {(profile.medical?.labs ?? []).length === 0 ? (
              <Text style={s.cardDesc}>Cuéntaselos a {persona.name} y quedan acá con su fecha. Por ejemplo: «mi hemoglobina glicosilada salió 5,2 % el 14 de septiembre».</Text>
            ) : (
              [...(profile.medical?.labs ?? [])]
                .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
                .map((l, i) => (
                  <View key={`${l.test}-${l.date ?? i}`} style={med.medRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={med.medName}>{LAB_LABEL[l.test] ?? l.test}: {String(l.value).replace('.', ',')} {l.unit}</Text>
                      <Text style={med.medSub}>{labDate(l.date)}</Text>
                    </View>
                  </View>
                ))
            )}
            {(profile.medical?.labs ?? []).some((l) => l.test === 'hba1c') && (
              <Text style={[s.cardDesc, { marginTop: 8 }]}>La HbA1c es tu promedio de glucosa de los últimos ~3 meses; tu meta la define tu médico.</Text>
            )}
          </View>

          {/* Umbrales de glucosa: solo con el módulo aprobado */}
          {glucoseOn && (
            <View style={[s.card, { marginTop: 12 }]}>
              <Text style={s.cardTitle}>Umbrales de alerta glucosa</Text>
              <Text style={s.cardDesc}>{persona.name} enviará notificaciones cuando tu glucosa supere estos rangos.</Text>
              <View style={med.threshRow}>
                <View style={med.threshField}>
                  <Text style={s.fieldLabel}>Bajo (mg/dL)</Text>
                  <TextInput style={s.input} value={String(profile.medical?.thresholds?.glucoseLow ?? 70)} onChangeText={v => setThreshold('glucoseLow', v)} keyboardType="numeric" placeholderTextColor={T.textMuted} />
                </View>
                <View style={med.threshField}>
                  <Text style={s.fieldLabel}>Alto (mg/dL)</Text>
                  <TextInput style={s.input} value={String(profile.medical?.thresholds?.glucoseHigh ?? 180)} onChangeText={v => setThreshold('glucoseHigh', v)} keyboardType="numeric" placeholderTextColor={T.textMuted} />
                </View>
              </View>
              <View style={med.threshRow}>
                <View style={med.threshField}>
                  <Text style={[s.fieldLabel, { color: '#ef4444' }]}>Crítico bajo</Text>
                  <TextInput style={s.input} value={String(profile.medical?.thresholds?.glucoseUrgentLow ?? 55)} onChangeText={v => setThreshold('glucoseUrgentLow', v)} keyboardType="numeric" placeholderTextColor={T.textMuted} />
                </View>
                <View style={med.threshField}>
                  <Text style={[s.fieldLabel, { color: '#ef4444' }]}>Crítico alto</Text>
                  <TextInput style={s.input} value={String(profile.medical?.thresholds?.glucoseUrgentHigh ?? 250)} onChangeText={v => setThreshold('glucoseUrgentHigh', v)} keyboardType="numeric" placeholderTextColor={T.textMuted} />
                </View>
              </View>
              <TouchableOpacity style={[s.btnPrimary, saved && s.btnSuccess]} onPress={handleSaveProfile}>
                <Text style={s.btnPrimaryText}>{saved ? '✅ Guardado' : 'Guardar Umbrales'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Integraciones */}
          {/* Sensor de glucosa: solo con el módulo aprobado por el administrador */}
          {glucoseOn && (
            <View style={s.card}>
              <Text style={s.cardTitle}>FreeStyle LibreLinkUp</Text>
              <Text style={s.cardDesc}>
                Ingresa el email y contraseña de tu cuenta FreeStyle LibreLinkUp. Eris detecta automáticamente el servidor correcto (Chile, Europa, EE.UU., etc.).
              </Text>
              <FieldRow
                label="Email de LibreView"
                value={profile.integrations?.libreView?.email || ''}
                onChangeText={v => setProfile(p => ({ ...p, integrations: { ...p.integrations, libreView: { ...p.integrations?.libreView, email: v } } }))}
                placeholder="tu@email.com"
              />
              <FieldRow
                label="Contraseña"
                value={profile.integrations?.libreView?.password || ''}
                onChangeText={v => setProfile(p => ({ ...p, integrations: { ...p.integrations, libreView: { ...p.integrations?.libreView, password: v } } }))}
                placeholder="Contraseña"
              />
              <TouchableOpacity
                style={[s.btnPrimary, saved && s.btnSuccess]}
                onPress={handleSaveProfile}
              >
                <Text style={s.btnPrimaryText}>Guardar Integraciones</Text>
              </TouchableOpacity>
            </View>
          )}
        </ProfileGroup>

        <ProfileGroup id="app" icon="⚙️" title="Avisos, conexiones y cuenta" sub={'Notificaciones, tu reloj, la burbuja y tu cuenta'} open={openGroups.includes('app')} onToggle={toggleGroup}>
          {/* Notificaciones */}
          <View style={s.card}>
            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.switchLabel}>Alertas proactivas de {persona.name}</Text>
                <Text style={s.switchDesc}>{persona.name} te avisa a buena hora con tus metas: comidas, agua, entreno, Finanzas y un resumen del día. Lo que ya hiciste se cancela solo.</Text>
              </View>
              <Switch
                value={notifications}
                onValueChange={handleToggleNotifications}
                trackColor={{ false: T.border, true: T.accentGlow }}
                thumbColor={notifications ? T.accent : T.textMuted}
              />
            </View>
            {notifications && (
              <View style={s.reminderList}>
                {REMINDER_ROWS.filter(r => !r.module || enabledModules.includes(r.module)).map(r => (
                  <View key={r.key} style={[s.switchRow, { marginTop: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.switchLabel}>{r.label}</Text>
                      <Text style={s.switchDesc}>{r.desc}</Text>
                    </View>
                    <Switch
                      value={reminders[r.key]}
                      onValueChange={(v) => handleToggleReminder(r.key, v)}
                      trackColor={{ false: T.border, true: T.accentGlow }}
                      thumbColor={reminders[r.key] ? T.accent : T.textMuted}
                    />
                  </View>
                ))}
                {/* «¿Entrenas hoy?» (Forge 2.0): se puede apagar del todo («medir sin obsesión») */}
                {enabledModules.includes('toji') && (
                  <View style={[s.switchRow, { marginTop: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.switchLabel}>Preguntarme si entreno hoy</Text>
                      <Text style={s.switchDesc}>En Inicio y en el resumen de la mañana. Así las calorías y el agua de hoy calzan con lo que haces; sin respuesta, quedan las de siempre.</Text>
                    </View>
                    <Switch
                      value={!askIntentOff}
                      onValueChange={(v) => { setAskIntentOff(!v); AsyncStorage.setItem(ASK_OFF_KEY, v ? '0' : '1').then(() => DeviceEventEmitter.emit(PLAN_REFRESH_EVENT)).catch(() => {}); }}
                      trackColor={{ false: T.border, true: T.accentGlow }}
                      thumbColor={!askIntentOff ? T.accent : T.textMuted}
                    />
                  </View>
                )}
                <Text style={[s.switchDesc, { marginTop: 12 }]}>Nada entre 22:30 y 8:00, máximo 8 avisos al día y al menos 45 minutos entre uno y otro.</Text>
              </View>
            )}
            {ErisBubble.available && (
              <View style={[s.switchRow, { marginTop: 14 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchLabel}>Modo burbuja</Text>
                  <Text style={s.switchDesc}>Al minimizar o cambiar de app, {persona.name} sigue activa como burbuja encima de todo: late mientras responde y marca un punto cuando la respuesta está lista. Tócala para volver al chat; arrástrala a la ✕ para cerrarla por esta vez.</Text>
                </View>
                <Switch
                  value={bubbleOn}
                  onValueChange={handleToggleBubble}
                  trackColor={{ false: T.border, true: T.accentGlow }}
                  thumbColor={bubbleOn ? T.accent : T.textMuted}
                />
              </View>
            )}
          </View>

          {/* Cómo te habla: el mismo aviso dicho a tu manera (avisos, sugerencias y chat) */}
          <View style={[s.card, { marginTop: 12 }]}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Cómo te habla {persona.name}</Text>
              <Text style={s.cardDesc}>Lo mismo, dicho a tu manera: en los avisos, en las sugerencias y en el chat.</Text>
            </View>
            {TONE_OPTIONS.map((o) => {
              const on = tone === o.id;
              return (
                <TouchableOpacity key={o.id} activeOpacity={0.8} onPress={() => chooseTone(o.id)} style={[s.toneRow, on && s.toneRowOn]}>
                  <View style={[s.toneRadio, on && s.toneRadioOn]}>{on && <View style={s.toneRadioDot} />}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.switchLabel}>{o.label}</Text>
                    <Text style={s.switchDesc}>{o.sub}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <View style={s.toneBubble}>
              <Text style={s.toneBubbleText}>{TONE_OPTIONS.find((o) => o.id === tone)?.example}</Text>
            </View>
          </View>

          {/* Antojos: la contrapartida es una sugerencia; con el modo estricto, la condición para recomendarlo */}
          <View style={[s.card, { marginTop: 12 }]}>
            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.switchLabel}>Modo estricto con los antojos</Text>
                  <InfoTip id="modo_estricto" size={15} color={T.textMuted} />
                </View>
                <Text style={s.switchDesc}>
                  {strictOn
                    ? `Si un antojo no calza con tu día, ${persona.name} te lo recomienda solo si aceptas la contrapartida (una cena más liviana, una caminata).`
                    : `Si un antojo no calza con tu día, ${persona.name} te muestra cuánto te afecta y una contrapartida que puedes aceptar o no.`}
                </Text>
              </View>
              <Switch
                value={strictOn}
                onValueChange={toggleStrict}
                trackColor={{ false: T.border, true: T.accentGlow }}
                thumbColor={strictOn ? T.accent : T.textMuted}
              />
            </View>
          </View>

          <View style={[s.card, { marginTop: 12 }]}>
            <Text style={s.cardTitle}>Google Health Connect</Text>
            <Text style={s.cardDesc}>
              Permite a Eris leer tus pasos, sueño, frecuencia cardíaca y oxígeno directamente desde tu reloj inteligente o teléfono de forma local.
            </Text>
            <TouchableOpacity
              style={[s.btnSecondary, { borderColor: T.accent, backgroundColor: T.accentGlow + '10' }]}
              onPress={handleSyncHealth}
            >
              <Text style={[s.btnSecondaryText, { color: T.accent }]}>Sincronizar Google Health</Text>
            </TouchableOpacity>
          </View>

          {/* Respaldo de Finanzas: antes sus datos vivían solo en el teléfono */}
          {(axsMode || enabledModules.includes('finanzas')) && (
            <View style={[s.card, { marginTop: 12 }]}>
              <Text style={s.cardTitle}>Respaldo de Finanzas</Text>
              <Text style={s.cardDesc}>
                Tus finanzas se copian cifradas en el PC de Eris cada vez que cambian (una copia por día, las últimas 7). Si reinstalas la app o cambias de teléfono, las recuperas desde aquí.
              </Text>
              <Text style={[s.switchDesc, { marginTop: 8 }]}>
                {finCopies === null ? 'Sin conexión con el servidor: no puedo ver las copias.'
                  : finCopies.length ? `Última copia: ${fechaHora(finCopies[0].at)} · ${finCopies[0].stats.tx} movimientos`
                    : 'Todavía no hay copias: se hace sola al abrir Finanzas.'}
              </Text>
              {!!finCopies?.length && (
                <TouchableOpacity style={[s.btnSecondary, { marginTop: 10 }]} onPress={() => { setFinPick((v) => !v); if (!finPick) loadFinCopies(); }} disabled={finBusy}>
                  <Text style={s.btnSecondaryText}>{finBusy ? 'Restaurando…' : finPick ? 'Cerrar' : 'Restaurar una copia'}</Text>
                </TouchableOpacity>
              )}
              {finPick && finCopies?.map((c) => (
                <TouchableOpacity key={c.day} style={[s.toneRow, { marginTop: 8 }]} onPress={() => askRestore(c)} disabled={finBusy} accessibilityRole="button">
                  <View style={{ flex: 1 }}>
                    <Text style={s.switchLabel}>{fechaHora(c.at)}</Text>
                    <Text style={s.switchDesc}>{c.stats.tx} movimientos · {c.stats.cuentas} cuentas</Text>
                  </View>
                  <Text style={[s.switchDesc, { color: T.accent }]}>Restaurar</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Respaldo de Forge: nivel, árbol e historial vivían solo en el teléfono */}
          {(axsMode || enabledModules.includes('toji')) && (
            <View style={[s.card, { marginTop: 12 }]}>
              <Text style={s.cardTitle}>Respaldo de Forge</Text>
              <Text style={s.cardDesc}>
                Tu progreso de Forge (nivel, árbol, entrenos y rutina) se copia cifrado en el PC de Eris cada vez que cambia (una copia por día, las últimas 7).
              </Text>
              <Text style={[s.switchDesc, { marginTop: 8 }]}>
                {forgeCopies === null ? 'Sin conexión con el servidor: no puedo ver las copias.'
                  : forgeCopies.length ? `Última copia: ${fechaHora(forgeCopies[0].at)} · ${forgeCopies[0].stats.dias} días entrenados`
                    : 'Todavía no hay copias: se hace sola al abrir Forge.'}
              </Text>
              {!!forgeCopies?.length && (
                <TouchableOpacity style={[s.btnSecondary, { marginTop: 10 }]} onPress={() => { setForgePick((v) => !v); if (!forgePick) loadForgeCopies(); }} disabled={forgeBusy}>
                  <Text style={s.btnSecondaryText}>{forgeBusy ? 'Restaurando…' : forgePick ? 'Cerrar' : 'Restaurar una copia'}</Text>
                </TouchableOpacity>
              )}
              {forgePick && forgeCopies?.map((c) => (
                <TouchableOpacity key={c.day} style={[s.toneRow, { marginTop: 8 }]} onPress={() => askForgeRestore(c)} disabled={forgeBusy} accessibilityRole="button">
                  <View style={{ flex: 1 }}>
                    <Text style={s.switchLabel}>{fechaHora(c.at)}</Text>
                    <Text style={s.switchDesc}>{c.stats.dias} días entrenados · {c.stats.habilidades} habilidades{c.stats.rutina ? ' · con rutina' : ''}</Text>
                  </View>
                  <Text style={[s.switchDesc, { color: T.accent }]}>Restaurar</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Respaldo de Inventario: lo que tienes en casa vive en el teléfono */}
          {(axsMode || enabledModules.includes('inventario')) && (
            <View style={[s.card, { marginTop: 12 }]}>
              <Text style={s.cardTitle}>Respaldo de Inventario</Text>
              <Text style={s.cardDesc}>
                Lo que tienes en casa (cantidades, vencimientos, lista de compras e historial) se copia cifrado en el PC de Eris cada vez que cambia (una copia por día, las últimas 7).
              </Text>
              <Text style={[s.switchDesc, { marginTop: 8 }]}>
                {invCopies === null ? 'Sin conexión con el servidor: no puedo ver las copias.'
                  : invCopies.length ? `Última copia: ${fechaHora(invCopies[0].at)} · ${invCopies[0].stats.items} cosas`
                    : 'Todavía no hay copias: se hace sola al agregar algo.'}
              </Text>
              {!!invCopies?.length && (
                <TouchableOpacity style={[s.btnSecondary, { marginTop: 10 }]} onPress={() => { setInvPick((v) => !v); if (!invPick) loadInvCopies(); }} disabled={invBusy}>
                  <Text style={s.btnSecondaryText}>{invBusy ? 'Restaurando…' : invPick ? 'Cerrar' : 'Restaurar una copia'}</Text>
                </TouchableOpacity>
              )}
              {invPick && invCopies?.map((c) => (
                <TouchableOpacity key={c.day} style={[s.toneRow, { marginTop: 8 }]} onPress={() => askInvRestore(c)} disabled={invBusy} accessibilityRole="button">
                  <View style={{ flex: 1 }}>
                    <Text style={s.switchLabel}>{fechaHora(c.at)}</Text>
                    <Text style={s.switchDesc}>{c.stats.items} cosas · {c.stats.conStock} con stock</Text>
                  </View>
                  <Text style={[s.switchDesc, { color: T.accent }]}>Restaurar</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Seguridad */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Acceso con Google</Text>
            <Text style={s.cardDesc}>
              Entras con tu cuenta de Google. Tu perfil está cifrado con una llave que solo guarda el servidor de Eris: no hay PIN que recordar ni que perder. Si cierras sesión en este teléfono, la sesión también se invalida en el servidor.
            </Text>
          </View>

          {/* Medición de la beta: solo conteos, con alias; apagar borra lo contado */}
          <View style={[s.card, { marginTop: 12 }]}>
            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.switchLabel}>Ayudar a mejorar Eris</Text>
                <Text style={s.switchDesc}>
                  Eris cuenta cuántos días usas la app, cuántos mensajes le mandas, qué módulos usas y cuánto tarda en responder. Nunca lo que escribes, comes, gastas ni nada de tu salud, y sin tu nombre. Si lo apagas, se borra lo contado.
                </Text>
              </View>
              <Switch
                value={usoMedido}
                onValueChange={handleToggleUso}
                trackColor={{ false: T.border, true: T.accentGlow }}
                thumbColor={usoMedido ? T.accent : T.textMuted}
              />
            </View>
          </View>

          {/* AXS Executive Mode (Solo Ikaros/Hestia) */}
          {sysRole === 'ikaros' && (
            <>
              <View style={[s.card, { borderColor: T.accent, backgroundColor: T.accentGlow + '10' }]}>
                <View style={s.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.switchLabel, { color: T.accent }]}>Modo AXS Executive</Text>
                    <Text style={s.switchDesc}>
                      Te atiende Hestia, con todo lo de tu día más acceso a AXS y al PC. En su Dashboard eliges entre Hestia y el menú AXS (panel, proyectos, pendientes y sistema). Apágalo para volver a Eris.
                    </Text>
                  </View>
                  <Switch
                    value={axsMode}
                    onValueChange={handleToggleAxsMode}
                    trackColor={{ false: T.border, true: T.accentGlow }}
                    thumbColor={axsMode ? T.accent : T.textMuted}
                  />
                </View>
                {sysRole === 'ikaros' && (
                  <TouchableOpacity
                    style={{ marginTop: S.md, minHeight: 48, borderRadius: R.md, borderWidth: 1, borderColor: T.borderActive, backgroundColor: T.accentGlow, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.md }}
                    onPress={() => setAdminOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Abrir el panel de administración">
                    <Text style={{ color: T.accent, fontSize: 15, fontWeight: '800' }}>Panel de administración</Text>
                    <Text style={{ color: T.textMuted, fontSize: 12, marginTop: 2 }}>Usuarios, roles, sesiones y actividad</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Acerca de */}
          <View style={s.card}>
            <View style={s.aboutRow}>
              <Text style={s.aboutLabel}>Perfil ID</Text>
              <Text style={s.aboutValue}>{profileId}</Text>
            </View>
            <View style={s.aboutRow}>
              <Text style={s.aboutLabel}>Versión Eris</Text>
              <Text style={s.aboutValue}>5.0 · Sovereign</Text>
            </View>
            <View style={s.aboutRow}>
              <Text style={s.aboutLabel}>Arquitectura</Text>
              <Text style={s.aboutValue}>Zero-Knowledge · AES-256-GCM</Text>
            </View>
            <View style={s.aboutRow}>
              <Text style={s.aboutLabel}>Datos en reposo</Text>
              <Text style={[s.aboutValue, { color: T.green }]}>Cifrados ✅</Text>
            </View>
          </View>
        </ProfileGroup>

        {/* Sesión */}
        <View style={s.dangerZone}>
          <TouchableOpacity style={[s.btnLogout, { flex: 1, marginRight: 6 }]} onPress={handleLogout}>
            <Text style={s.btnLogoutText}>Cerrar Sesión</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnLogout, { flex: 1, marginLeft: 6, borderColor: T.accent, backgroundColor: T.accentGlow }]} onPress={handleLogout}>
            <Text style={[s.btnLogoutText, { color: T.accent }]}>Cambiar Cuenta de Google</Text>
          </TouchableOpacity>
        </View>

        {sysRole === 'ikaros' && <AdminPanel visible={adminOpen} onClose={() => setAdminOpen(false)} selfId={profileId} />}

        <Text style={s.footer}>AXS Ecosystem · Eris Sovereign v5.0{'\n'}Zero-Knowledge Auth · Datos siempre cifrados</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  scroll: { flex: 1 },
  content: { padding: S.md, paddingBottom: 80 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.md, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '900', color: T.text, letterSpacing: -0.5 },
  profileBadge: { backgroundColor: T.accentGlow, paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.full, borderWidth: 1, borderColor: T.borderActive },
  profileBadgeText: { color: T.accent, fontWeight: '800', fontSize: 12 },

  sectionHeader: { fontSize: 11, color: T.textMuted, fontWeight: '800', letterSpacing: 2, marginTop: 20, marginBottom: 10 },

  card: { backgroundColor: T.bgCard, borderRadius: R.xl, padding: S.md, borderWidth: 1, borderColor: T.border, gap: 12 },
  cardHeader: { gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: T.text },
  cardDesc: { fontSize: 12, color: T.textMuted, lineHeight: 18 },

  field: { gap: 6 },
  fieldRow: { gap: 8 },
  fieldLabel: { fontSize: 12, color: T.textMuted, fontWeight: '700', letterSpacing: 0.5 },

  regionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  regionBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: T.border, backgroundColor: T.bgCard, alignItems: 'center', minWidth: 68 },
  regionBtnActive: { borderColor: T.accent, backgroundColor: T.accentGlow },
  regionBtnLabel: { fontSize: 14, fontWeight: '800', color: T.textMuted },
  regionBtnLabelActive: { color: T.accent },
  regionBtnSub: { fontSize: 10, color: T.textMuted, marginTop: 1 },
  regionBtnSubActive: { color: T.accent },
  input: {
    backgroundColor: T.bgInput, color: T.text,
    borderRadius: R.md, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },

  btnPrimary: { backgroundColor: T.accent, borderRadius: R.md, paddingVertical: 13, alignItems: 'center' },
  btnSuccess: { backgroundColor: T.green },
  btnPrimaryText: { color: '#000', fontWeight: '900', fontSize: 14 },

  btnSecondary: { backgroundColor: T.accentGlow, borderRadius: R.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: T.borderActive },
  btnSecondaryText: { color: T.accent, fontWeight: '700', fontSize: 13 },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { fontSize: 14, color: T.text, fontWeight: '600' },
  switchDesc: { fontSize: 12, color: T.textMuted, marginTop: 2, lineHeight: 16 },
  reminderList: { marginTop: 6, marginLeft: 4, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: T.border },
  toneRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: R.lg, borderWidth: 1, borderColor: T.border },
  toneRowOn: { borderColor: T.borderActive, backgroundColor: 'rgba(34,211,238,0.07)' },
  toneRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  toneRadioOn: { borderColor: T.accent },
  toneRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: T.accent },
  toneBubble: { backgroundColor: T.bgInput, borderRadius: R.lg, borderTopLeftRadius: 4, padding: 12 },
  toneBubbleText: { color: T.textLight, fontSize: 13, lineHeight: 19 },

  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  aboutLabel: { fontSize: 13, color: T.textMuted },
  aboutValue: { fontSize: 13, color: T.textLight, fontWeight: '600' },

  btnLogout: { marginTop: 24, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: T.red + '50', backgroundColor: T.redGlow },
  btnLogoutText: { color: T.red, fontWeight: '700', fontSize: 14 },
  dangerZone: { flexDirection: 'row', marginTop: 24 },

  footer: { color: T.textMuted, fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 18 },

  // Módulos
  modulesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  moduleCard: { width: '47.5%', backgroundColor: T.bgCard, borderRadius: R.xl, borderWidth: 1, borderColor: T.border, padding: 14, gap: 6 },
  moduleCardActive: { borderColor: 'rgba(34,211,238,0.4)', backgroundColor: 'rgba(34,211,238,0.05)' },
  moduleIcon: { fontSize: 26 },
  moduleName: { fontSize: 14, fontWeight: '800', color: T.text },
  moduleDesc: { fontSize: 11, color: T.textMuted, lineHeight: 15 },
  moduleFooter: { marginTop: 4, alignItems: 'flex-start' },
  moduleSoonBadge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(168,85,247,0.12)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)' },
  moduleSoonText: { fontSize: 10, fontWeight: '700', color: '#a855f7' },
  moduleEssentialBadge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: T.accentGlow, borderRadius: 20, borderWidth: 1, borderColor: T.borderActive },
  moduleEssentialText: { fontSize: 10, fontWeight: '700', color: T.accent },
});

const med = StyleSheet.create({
  condGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  condChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: T.border, backgroundColor: T.bgCard },
  condChipOn: { borderColor: T.accent, backgroundColor: T.accentGlow },
  condChipText: { fontSize: 12, color: T.textMuted, fontWeight: '600' },
  condChipTextOn: { color: T.accent, fontWeight: '800' },

  bloodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  bloodBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.md, borderWidth: 1, borderColor: T.border, backgroundColor: T.bgCard, minWidth: 50, alignItems: 'center' },
  bloodBtnOn: { borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)' },
  bloodBtnText: { fontSize: 13, fontWeight: '800', color: T.textMuted },
  bloodBtnTextOn: { color: '#ef4444' },
  dietGroup: { fontSize: 11, fontWeight: '800', color: T.textMuted, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 8, marginBottom: 6 },
  dietHint: { fontSize: 12, color: T.textMuted, marginBottom: 8, lineHeight: 17 },
  dietChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.md, borderWidth: 1, borderColor: T.border, backgroundColor: T.bgCard },
  dietChipOn: { borderColor: T.accent, backgroundColor: 'rgba(34,211,238,0.12)' },
  dietChipText: { fontSize: 13, fontWeight: '700', color: T.textMuted },
  dietChipTextOn: { color: T.accent },

  medRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border },
  medName: { fontSize: 14, color: T.text, fontWeight: '600' },
  medSub: { fontSize: 11, color: T.textMuted, marginTop: 2 },
  medDel: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.md, backgroundColor: 'rgba(239,68,68,0.1)' },
  medDelText: { fontSize: 13, color: '#ef4444', fontWeight: '800' },
  addForm: { marginTop: 8 },
  addFormRow: { flexDirection: 'row', gap: 10, marginTop: 8 },

  threshRow: { flexDirection: 'row', gap: 12 },
  threshField: { flex: 1, gap: 6 },
});

const about = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: R.full, paddingVertical: 5, paddingHorizontal: 12, borderWidth: 1 },
  pillOn: { backgroundColor: T.green + '1a', borderColor: T.green + '50' },
  pillOff: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: T.border },
  pillText: { fontSize: 11, fontWeight: '700' },

  subhead: { fontSize: 12, color: T.textMuted, fontWeight: '800', letterSpacing: 0.5, marginTop: 14, marginBottom: 4 },
  emptyText: { fontSize: 12, color: T.textMuted, fontStyle: 'italic', lineHeight: 17 },

  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: T.border },
  metricLabel: { fontSize: 13, color: T.text, fontWeight: '600' },
  metricSub: { fontSize: 11, color: T.textMuted, marginTop: 2 },
  metricDelta: { fontSize: 13, fontWeight: '800' },

  kbRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border },
  kbLabel: { fontSize: 12.5, color: T.accent, fontWeight: '700', marginBottom: 2 },
  kbText: { fontSize: 12, color: T.textMuted, lineHeight: 17 },

  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border },
  noteCategory: { fontSize: 10, color: T.accent, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  noteText: { fontSize: 13, color: T.text, lineHeight: 18 },
});

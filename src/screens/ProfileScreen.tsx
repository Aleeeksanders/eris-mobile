import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, Alert, Switch, DeviceEventEmitter, AppState
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthStorage } from '../services/AuthStorage';
import { wsManager } from '../services/WebSocketManager';
import { metricsService } from '../services/MetricsService';
import { ModuleStorage } from '../services/ModuleStorage';
import { MODULES, DEFAULT_MODULES, type ModuleConfig } from '../config/modules';
import { T, R, S } from '../config/design';

interface MedicalCondition { id: string; diagnosedDate?: string; notes?: string; }
interface Medication { id: string; name: string; dose?: string; schedule?: string; active: boolean; }
interface AlertThresholds { glucoseLow: number; glucoseHigh: number; glucoseUrgentLow: number; glucoseUrgentHigh: number; systolicHigh?: number; }
interface MedicalProfile { conditions: MedicalCondition[]; medications: Medication[]; thresholds: AlertThresholds; bloodType?: string; allergies?: string; }

const DEFAULT_THRESHOLDS: AlertThresholds = { glucoseLow: 70, glucoseHigh: 180, glucoseUrgentLow: 55, glucoseUrgentHigh: 250 };

const CONDITION_IDS = ['diabetes_t1','diabetes_t2','prediabetes','hypertension','hypotension','hypothyroidism','hyperthyroidism','obesity','dyslipidemia','asthma','copd','ckd','celiac','ibs','depression','anxiety','other'] as const;
const CONDITION_LABELS: Record<string, string> = {
  diabetes_t1:'Diabetes T1', diabetes_t2:'Diabetes T2', prediabetes:'Prediabetes',
  hypertension:'Hipertensión', hypotension:'Hipotensión',
  hypothyroidism:'Hipotiroidismo', hyperthyroidism:'Hipertiroidismo',
  obesity:'Obesidad', dyslipidemia:'Dislipidemia',
  asthma:'Asma', copd:'EPOC', ckd:'Enf. Renal Crónica',
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
  const [profileId, setProfileId] = useState('');
  const [sysRole, setSysRole] = useState('eris');
  const [profile, setProfile] = useState<UserProfile>({ displayName: '' });
  const [saved, setSaved] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [notifications, setNotifications] = useState(true);

  // Medication add form state
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [medSchedule, setMedSchedule] = useState('');

  // Account Switcher State
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchProfileId, setSwitchProfileId] = useState('');
  const [switchPin, setSwitchPin] = useState('');

  // Clave de AsyncStorage para la preferencia — aislada por perfil
  const NOTIF_KEY = `eris_notifications_${profileId}`;
  const AXS_MODE_KEY = `eris_axs_mode_${profileId}`;

  const [axsMode, setAxsMode] = useState(false);
  const [enabledModules, setEnabledModules] = useState<string[]>(DEFAULT_MODULES);

  const handleToggleNotifications = async (value: boolean) => {
    if (!profileId) return; // BUG-04: guard si profileId aun no cargó
    setNotifications(value);
    await AsyncStorage.setItem(`eris_notifications_${profileId}`, JSON.stringify(value));
    wsManager.sendMessage({ type: 'save_preference', key: 'notifications', value });
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
      if (data.type === 'profile_saved') {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
    return () => { unsub(); };
  }, []);

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
    if (granted.length > 0) {
      Alert.alert(
        'Permisos activos',
        `Eris tiene acceso a ${granted.length} métricas de salud. ¿Quieres administrar los permisos?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Administrar permisos',
            onPress: async () => {
              const result = await metricsService.openPermissionsScreen();
              if (typeof result === 'string') Alert.alert('Error', result);
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Conectar Health Connect',
      'Se abrirá Health Connect para que actives los permisos de Eris.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Abrir Health Connect',
          onPress: async () => {
            const result = await metricsService.openPermissionsScreen();
            if (typeof result === 'string') Alert.alert('Error al abrir Health Connect', result);
          },
        },
      ]
    );
  };

  const handleChangePin = () => {
    if (!newPin || newPin.length < 4) {
      Alert.alert('Error', 'El PIN debe tener al menos 4 caracteres.');
      return;
    }
    setSavingPin(true);
    wsManager.sendMessage({ type: 'change_pin', newPin });
    setTimeout(async () => {
      await AuthStorage.saveCredentials(profileId, newPin);
      setSavingPin(false);
      setNewPin('');
      Alert.alert('Éxito', 'Tu PIN ha sido actualizado.');
    }, 1000);
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

  const confirmSwitchAccount = async () => {
    if (!switchProfileId.trim()) {
      Alert.alert('Error', 'Ingresa un Perfil ID');
      return;
    }
    // Resetear estado de preferencias antes de cambiar
    setAxsMode(false);
    setNotifications(true);
    DeviceEventEmitter.emit('AXS_MODE_CHANGED', false);
    await AuthStorage.saveCredentials(switchProfileId.trim().toLowerCase(), switchPin || '');
    if (onSwitchAccount) {
      onSwitchAccount();
    } else {
      wsManager.disconnect();
      onLogout?.();
    }
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

        {/* Identidad para Eris */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>⚡ Personalización de Eris</Text>
            <Text style={s.cardDesc}>
              Este perfil define cómo Eris te conoce. Cuanto más detallado, más personalizada será tu experiencia.
            </Text>
          </View>

          <FieldRow
            label="Nombre o alias"
            value={profile.displayName}
            onChangeText={v => setProfile(p => ({ ...p, displayName: v }))}
            placeholder="¿Cómo quieres que te llame Eris?"
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
            placeholder="Cualquier información que Eris deba saber siempre (proyectos actuales, restricciones, preferencias...)"
            multiline
          />

          <TouchableOpacity
            style={[s.btnPrimary, saved && s.btnSuccess]}
            onPress={handleSaveProfile}
          >
            <Text style={s.btnPrimaryText}>{saved ? '✅ Guardado' : 'Guardar Perfil'}</Text>
          </TouchableOpacity>
        </View>

        {/* Módulos activos */}
        <SectionHeader title="🧩 MÓDULOS" />
        <View style={s.modulesGrid}>
          {MODULES.map(mod => {
            const isOn = enabledModules.includes(mod.id);
            const locked = mod.alwaysOn || mod.status === 'coming_soon';
            return (
              <TouchableOpacity
                key={mod.id}
                style={[
                  s.moduleCard,
                  isOn && !mod.alwaysOn && s.moduleCardActive,
                  locked && { opacity: mod.status === 'coming_soon' ? 0.55 : 1 },
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
                  {mod.status === 'coming_soon' ? (
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

        {/* Integraciones */}
        <SectionHeader title="🔌 INTEGRACIONES DE SALUD" />
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

        {/* Historial médico */}
        <SectionHeader title="🏥 HISTORIAL MÉDICO" />
        <View style={s.card}>
          <Text style={s.cardTitle}>Condiciones activas</Text>
          <Text style={s.cardDesc}>Eris adapta sus protocolos y contexto según tu historial. Solo marca las condiciones que tengas diagnosticadas.</Text>
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
          <Text style={s.cardTitle}>Umbrales de alerta glucosa</Text>
          <Text style={s.cardDesc}>Eris enviará notificaciones cuando tu glucosa supere estos rangos.</Text>
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

        {/* Seguridad */}
        <SectionHeader title="🔐 SEGURIDAD" />
        <View style={s.card}>
          <Text style={s.cardTitle}>Cambiar PIN</Text>
          <Text style={s.cardDesc}>
            Después de cambiar el PIN, úsalo en tu próximo inicio de sesión. Tu Llave de Rescate sigue siendo válida.
          </Text>
          <TextInput
            style={s.input}
            placeholder="Nuevo PIN"
            placeholderTextColor={T.textMuted}
            value={newPin}
            onChangeText={setNewPin}
            secureTextEntry
            autoCorrect={false}
          />
          <TouchableOpacity style={s.btnSecondary} onPress={handleChangePin}>
            <Text style={s.btnSecondaryText}>Actualizar PIN</Text>
          </TouchableOpacity>
        </View>

        {/* Notificaciones */}
        <SectionHeader title="🔔 NOTIFICACIONES" />
        <View style={s.card}>
          <View style={s.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.switchLabel}>Alertas proactivas de Eris</Text>
              <Text style={s.switchDesc}>Eris te notificará cuando detecte anomalías en tus métricas</Text>
            </View>
            <Switch
              value={notifications}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: T.border, true: T.accentGlow }}
              thumbColor={notifications ? T.accent : T.textMuted}
            />
          </View>
        </View>

        {/* AXS Executive Mode (Solo Ikaros/Hestia) */}
        {(sysRole === 'ikaros' || sysRole === 'hestia') && (
          <>
            <SectionHeader title="⚡ AXS ECOSYSTEM" />
            <View style={[s.card, { borderColor: T.accent, backgroundColor: T.accentGlow + '10' }]}>
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.switchLabel, { color: T.accent }]}>Modo AXS Executive</Text>
                  <Text style={s.switchDesc}>Cambia toda la interfaz a tecnología pura para acceso profundo al sistema.</Text>
                </View>
                <Switch
                  value={axsMode}
                  onValueChange={handleToggleAxsMode}
                  trackColor={{ false: T.border, true: T.accentGlow }}
                  thumbColor={axsMode ? T.accent : T.textMuted}
                />
              </View>
            </View>
          </>
        )}

        {/* Acerca de */}
        <SectionHeader title="ACERCA DE" />
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

        {/* Logout */}
        {!isSwitching ? (
          <View style={s.dangerZone}>
            <TouchableOpacity style={[s.btnLogout, { flex: 1, marginRight: 6 }]} onPress={handleLogout}>
              <Text style={s.btnLogoutText}>Cerrar Sesión</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnLogout, { flex: 1, marginLeft: 6, borderColor: T.accent, backgroundColor: T.accentGlow }]} onPress={() => setIsSwitching(true)}>
              <Text style={[s.btnLogoutText, { color: T.accent }]}>Cambiar Cuenta</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[s.card, { marginTop: 24, borderColor: T.accent }]}>
            <Text style={s.cardTitle}>Cambiar a otra cuenta</Text>
            <TextInput
              style={s.input}
              placeholder="Perfil ID"
              placeholderTextColor={T.textMuted}
              value={switchProfileId}
              onChangeText={setSwitchProfileId}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={s.input}
              placeholder="PIN de acceso"
              placeholderTextColor={T.textMuted}
              value={switchPin}
              onChangeText={setSwitchPin}
              secureTextEntry
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={() => setIsSwitching(false)}>
                <Text style={s.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnPrimary, { flex: 1 }]} onPress={confirmSwitchAccount}>
                <Text style={s.btnPrimaryText}>Iniciar Sesión</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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

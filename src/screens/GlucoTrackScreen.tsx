// ============================================================
// Eris Mobile — GlucoTrackScreen
// Pantalla principal: glucosa en tiempo real + log de comidas
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, StatusBar, Alert, Modal,
  Animated, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, R, S } from '../config/design';
import { NetworkConfig } from '../config/env';
import { MobileGlucoService, type GlucoseReading, type GlucoStats, type MealLogEntry } from '../services/GlucoService';
import FoodSearchModal from '../components/gluco/FoodSearchModal';
import GlucoseChart from '../components/gluco/GlucoseChart';
import { scanLibreSensor, cancelScan, nfcIsAvailable, type LibreReading } from '../services/LibreNFCService';
import { wsManager } from '../services/WebSocketManager';

// Deriva la URL base HTTP del WebSocket configurado en env.ts
const ERIS_BASE_URL = NetworkConfig.CLOUD_URL
  .replace('ws://', 'http://')
  .replace('/ws', '');

// UUID simple compatible con React Native (no depende de Web Crypto)
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
const glucoSvc = new MobileGlucoService(ERIS_BASE_URL);

// ─── Guía de errores por código ──────────────────────────────

const ERROR_GUIDES: Record<string, { title: string; steps: string[] }> = {
  not_configured: {
    title: 'Sensor no configurado',
    steps: [
      'Ve a Perfil → FreeStyle LibreLinkUp',
      'Introduce tu email y contraseña de la app LibreLinkUp',
      'Guarda los cambios y vuelve aquí',
    ],
  },
  tos_required: {
    title: 'Términos de servicio pendientes',
    steps: [
      'Abre la app FreeStyle LibreLinkUp en tu móvil',
      'Inicia sesión y acepta los Términos de Servicio',
      'Vuelve a Eris y pulsa "Diagnosticar"',
    ],
  },
  invalid_credentials: {
    title: 'Credenciales incorrectas',
    steps: [
      'Ve a Perfil → FreeStyle LibreLinkUp',
      'Verifica el email y contraseña (son los de la app LibreLinkUp)',
      'Guarda y vuelve a intentar',
    ],
  },
  no_connections: {
    title: 'Sensor no compartido',
    steps: [
      'Abre la app FreeStyle LibreLink en tu móvil',
      'Ve a Compartir → Invitar a LibreLinkUp',
      'Acepta la invitación desde la app LibreLinkUp',
    ],
  },
  network_error: {
    title: 'Sin conexión al servidor',
    steps: [
      'Verifica que Eris esté activo en tu PC',
      'Comprueba que estés en la misma red WiFi o con Tailscale activo',
    ],
  },
  sensor_unavailable: {
    title: 'Sensor sin lectura',
    steps: [
      'Comprueba que el sensor esté bien colocado',
      'Espera unos minutos y refresca',
    ],
  },
};

// ─── Subcomponentes ──────────────────────────────────────────

function GlucoBadge({ value, trend, isHigh, isLow, errorCode, errorMessage, onDiagnose, diagnosing }: Partial<GlucoseReading> & {
  errorCode?: string;
  errorMessage?: string;
  onDiagnose: () => void;
  diagnosing: boolean;
}) {
  if (value == null) {
    const guide = errorCode ? ERROR_GUIDES[errorCode] : null;
    return (
      <View style={badge.container}>
        <Text style={badge.noDataIcon}>🩸</Text>
        <Text style={badge.noData}>{guide?.title ?? 'Sin datos del sensor'}</Text>
        {errorMessage && !guide && (
          <Text style={badge.errorMsg}>{errorMessage}</Text>
        )}
        {guide && (
          <View style={badge.stepsBox}>
            {guide.steps.map((step, i) => (
              <Text key={i} style={badge.step}>· {step}</Text>
            ))}
          </View>
        )}
        <TouchableOpacity style={badge.diagBtn} onPress={onDiagnose} disabled={diagnosing}>
          <Text style={badge.diagBtnText}>{diagnosing ? 'Diagnosticando…' : 'Diagnosticar conexión'}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  const color = isLow ? '#818cf8' : isHigh ? T.red : T.green;
  const label = isLow ? 'BAJO' : isHigh ? 'ALTO' : 'EN RANGO';

  return (
    <View style={badge.container}>
      <View style={[badge.glow, { backgroundColor: color + '22' }]} />
      <Text style={[badge.value, { color }]}>{value}</Text>
      <Text style={badge.unit}>mg/dL  {trend}</Text>
      <View style={[badge.pill, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <Text style={[badge.pillText, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

function MealCard({ entry, onDelete }: { entry: MealLogEntry; onDelete: () => void }) {
  const color = glucoSvc.getRiskColor(entry.riskLevel);
  const time = new Date(entry.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={meal.card}>
      <View style={meal.header}>
        <Text style={meal.time}>{time}</Text>
        <View style={[meal.risk, { backgroundColor: color + '22', borderColor: color + '44' }]}>
          <Text style={[meal.riskText, { color }]}>
            GL {entry.estimatedGL} · {glucoSvc.getRiskLabel(entry.riskLevel)}
          </Text>
        </View>
        <TouchableOpacity onPress={onDelete} style={meal.del}>
          <Text style={meal.delText}>×</Text>
        </TouchableOpacity>
      </View>
      {entry.foods.map((f, i) => (
        <Text key={i} style={meal.food}>
          {f.name} · {f.calories} kcal · Carbs {f.carbs}g
        </Text>
      ))}
      <Text style={meal.totals}>
        Total: {entry.totalCalories} kcal
      </Text>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────

export default function GlucoTrackScreen() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [current, setCurrent] = useState<GlucoseReading | null>(null);
  const [history, setHistory] = useState<GlucoseReading[]>([]);
  const [stats, setStats] = useState<GlucoStats | null>(null);
  const [mealLog, setMealLog] = useState<MealLogEntry[]>([]);
  const [showFoodModal, setShowFoodModal] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [diagnosing, setDiagnosing] = useState(false);

  // Insulin log state
  const [showInsulinModal, setShowInsulinModal] = useState(false);
  const [insulinType, setInsulinType] = useState<'rapid' | 'long' | 'mixed'>('rapid');
  const [insulinUnits, setInsulinUnits] = useState('');
  const [insulinMeal, setInsulinMeal] = useState('');
  const [insulinLog, setInsulinLog] = useState<Array<{ id: string; type: string; units: number; mealContext?: string; timestamp: string }>>([]);

  // NFC scan state
  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [nfcReading, setNfcReading] = useState<LibreReading | null>(null);
  const nfcPulse = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    try {
      const [cur, hist, st, log] = await Promise.allSettled([
        glucoSvc.fetchCurrent(),
        glucoSvc.fetchHistory(24),
        glucoSvc.fetchStats(24),
        glucoSvc.getMealLog(1),
      ]);

      if (cur.status === 'fulfilled') {
        setCurrent(cur.value.current);
        setLastUpdated(
          new Date(cur.value.lastFetched).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        );
        if (cur.value.current) {
          setErrorCode(undefined);
          setErrorMessage(undefined);
        }
      } else {
        const reason = cur.reason as any;
        const serverCode: string | undefined = reason?.code;
        const msg: string = reason?.message ?? '';
        const knownCode = (serverCode && ERROR_GUIDES[serverCode])
          ? serverCode
          : Object.keys(ERROR_GUIDES).find(c => msg.toLowerCase().includes(c.replace('_', ' ')));
        setErrorCode(knownCode ?? 'network_error');
        setErrorMessage(msg || 'No se pudo obtener datos del sensor.');
      }
      if (hist.status === 'fulfilled') setHistory(hist.value.readings);
      if (st.status === 'fulfilled') setStats(st.value.stats);
      if (log.status === 'fulfilled') setMealLog(log.value);
    } catch (e) {
      console.warn('[GlucoTrack] Load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleDiagnose = useCallback(async () => {
    setDiagnosing(true);
    const result = await glucoSvc.testConnection();
    setDiagnosing(false);
    if (result.ok) {
      setErrorCode(undefined);
      setErrorMessage(undefined);
      if (result.current) setCurrent(result.current);
      Alert.alert('Sensor conectado', result.message);
    } else {
      setErrorCode(result.code);
      setErrorMessage(result.message);
      const guide = ERROR_GUIDES[result.code];
      Alert.alert(
        guide?.title ?? 'Error de conexión',
        result.message + (guide ? '\n\nPasos:\n' + guide.steps.map(s => '• ' + s).join('\n') : ''),
        [{ text: 'Entendido' }]
      );
    }
  }, []);

  // Load insulin log from server
  useEffect(() => {
    const unsub = wsManager.subscribeMessage((data) => {
      if (data.type === 'insulin_log') setInsulinLog(data.log ?? []);
    });
    wsManager.sendMessage({ type: 'get_insulin_log' });
    return () => { unsub(); };
  }, []);

  const handleLogInsulin = () => {
    const units = parseFloat(insulinUnits);
    if (!insulinUnits || isNaN(units) || units <= 0) {
      Alert.alert('Error', 'Ingresa un número de unidades válido'); return;
    }
    const dose = {
      id: Date.now().toString(),
      type: `insulin_${insulinType}` as string,
      units,
      mealContext: insulinMeal || undefined,
      timestamp: new Date().toISOString(),
      glucose: current?.value,
    };
    wsManager.sendMessage({ type: 'log_insulin', dose });
    setInsulinLog(prev => [dose, ...prev].slice(0, 20));
    setInsulinUnits(''); setInsulinMeal(''); setShowInsulinModal(false);
  };

  // NFC availability check on mount
  useEffect(() => {
    nfcIsAvailable().then(setNfcAvailable);
  }, []);

  // Pulse animation while scanning
  useEffect(() => {
    if (nfcScanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(nfcPulse, { toValue: 1.15, duration: 700, useNativeDriver: true }),
          Animated.timing(nfcPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      nfcPulse.setValue(1);
    }
  }, [nfcScanning]);

  const handleNFCScan = useCallback(async () => {
    setNfcError(null);
    setNfcScanning(true);
    try {
      const reading = await scanLibreSensor();
      setNfcReading(reading);
      setNfcScanning(false);

      // Actualizar glucosa en pantalla con datos NFC
      const trend = reading.trend as string;
      const syntheticReading: GlucoseReading = {
        timestamp: reading.timestamp.toISOString(),
        value: reading.glucoseMgdl,
        valueInMmol: reading.glucoseMmol,
        trend: trend as GlucoseReading['trend'],
        trendArrow: reading.trend,
        isHigh: reading.glucoseMgdl > 180,
        isLow: reading.glucoseMgdl < 70,
      };
      setCurrent(syntheticReading);
      setLastUpdated(
        new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        + ' (NFC)'
      );
      setErrorCode(undefined);
      setErrorMessage(undefined);

      // Sincronizar al backend
      if (wsManager.getStatus() === 'connected') {
        wsManager.sendMessage({
          type: 'update_health_snapshot',
          snapshot: {
            glucose: {
              valueMgdl    : reading.glucoseMgdl,
              valueMmol    : reading.glucoseMmol,
              trend        : reading.trend,
              trendLabel   : reading.trendLabel,
              sensorAge    : reading.sensorAge,
              daysLeft     : reading.daysLeft,
              warming      : reading.warming,
              source       : 'nfc',
              timestamp    : reading.timestamp.toISOString(),
            },
          },
        });
      }
    } catch (e: any) {
      setNfcScanning(false);
      setNfcError(e.message ?? 'Error al leer el sensor');
    }
  }, []);

  const handleCancelScan = useCallback(async () => {
    await cancelScan();
    setNfcScanning(false);
    setNfcError(null);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000); // refresca cada 5 min
    return () => clearInterval(interval);
  }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleMealSaved = async (entry: MealLogEntry) => {
    const entryWithId: MealLogEntry = { ...entry, id: uuid() };
    await glucoSvc.saveMealLog(entryWithId);
    const updated = await glucoSvc.getMealLog(1);
    setMealLog(updated);
    setShowFoodModal(false);
  };

  const handleDeleteMeal = async (id: string) => {
    Alert.alert('Eliminar registro', '¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          const raw = await glucoSvc.getMealLog(30);
          const filtered = raw.filter(e => e.id !== id);
          const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
          await AsyncStorage.setItem('gluco_meal_log', JSON.stringify(filtered));
          setMealLog(filtered.filter(e => {
            const cutoff = new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString();
            return e.timestamp > cutoff;
          }));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[s.safe, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={T.accent} size="large" />
        <Text style={s.loadingText}>Conectando con el sensor…</Text>
      </View>
    );
  }

  return (
    <View style={[s.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>GlucoTrack</Text>
          <Text style={s.sub}>
            {lastUpdated ? `Actualizado ${lastUpdated}` : 'Sin datos recientes'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {nfcAvailable && (
            <TouchableOpacity style={s.nfcBtn} onPress={handleNFCScan}>
              <Text style={s.nfcBtnText}>📡 Escanear</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.addBtn} onPress={() => setShowFoodModal(true)}>
            <Text style={s.addBtnText}>+ Comida</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal NFC */}
      <Modal visible={nfcScanning || nfcError !== null || nfcReading !== null} transparent animationType="fade">
        <View style={nfc.overlay}>
          <View style={nfc.sheet}>
            {nfcScanning && (
              <>
                <Animated.Text style={[nfc.icon, { transform: [{ scale: nfcPulse }] }]}>📡</Animated.Text>
                <Text style={nfc.title}>Acerca el teléfono al sensor</Text>
                <Text style={nfc.sub}>Coloca el teléfono directamente sobre el parche en tu brazo</Text>
                <TouchableOpacity style={nfc.cancelBtn} onPress={handleCancelScan}>
                  <Text style={nfc.cancelText}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
            {!nfcScanning && nfcError !== null && (
              <>
                <Text style={nfc.icon}>⚠️</Text>
                <Text style={nfc.title}>No se pudo leer el sensor</Text>
                <Text style={nfc.errorMsg}>{nfcError}</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                  <TouchableOpacity style={nfc.retryBtn} onPress={() => { setNfcError(null); handleNFCScan(); }}>
                    <Text style={nfc.retryText}>Reintentar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={nfc.cancelBtn} onPress={() => setNfcError(null)}>
                    <Text style={nfc.cancelText}>Cerrar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {!nfcScanning && nfcError === null && nfcReading !== null && (
              <>
                <Text style={nfc.icon}>✅</Text>
                <Text style={nfc.resultGlucose}>
                  {nfcReading.glucoseMgdl} <Text style={nfc.resultUnit}>mg/dL</Text>
                </Text>
                <Text style={nfc.resultTrend}>{nfcReading.trend} {nfcReading.trendLabel}</Text>
                {nfcReading.warming && (
                  <Text style={nfc.warmingText}>Sensor en calentamiento — puede tardar 1 hora</Text>
                )}
                <Text style={nfc.sensorAge}>
                  Sensor activo {Math.floor(nfcReading.sensorAge / 60 / 24)}d {Math.floor((nfcReading.sensorAge / 60) % 24)}h
                  {nfcReading.daysLeft > 0 ? ` · ${nfcReading.daysLeft}d restantes` : ' · VENCIDO'}
                </Text>
                <TouchableOpacity style={nfc.doneBtn} onPress={() => setNfcReading(null)}>
                  <Text style={nfc.doneText}>Listo</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
      >
        {/* Glucosa actual */}
        <GlucoBadge
          value={current?.value}
          trend={current?.trendArrow}
          isHigh={current?.isHigh}
          isLow={current?.isLow}
          errorCode={errorCode}
          errorMessage={errorMessage}
          onDiagnose={handleDiagnose}
          diagnosing={diagnosing}
        />

        {/* Gráfica 24h */}
        {history.length > 0 && (
          <>
            <Text style={s.sectionTitle}>📈 ÚLTIMAS 24 HORAS</Text>
            <View style={s.card}>
              <GlucoseChart readings={history} />
            </View>
          </>
        )}

        {/* Estadísticas TIR */}
        {stats && (
          <>
            <Text style={s.sectionTitle}>📊 TIEMPO EN RANGO (24H)</Text>
            <View style={s.card}>
              <View style={s.tirRow}>
                <TirBar label="En rango" pct={stats.timeInRange} color={T.green} />
                <TirBar label=">180" pct={stats.timeAbove} color={T.red} />
                <TirBar label="<70" pct={stats.timeBelow} color="#818cf8" />
              </View>
              <View style={s.statRow}>
                <StatPill label="Media" value={`${stats.avg} mg/dL`} />
                <StatPill label="Mín" value={`${stats.min}`} />
                <StatPill label="Máx" value={`${stats.max}`} />
              </View>
            </View>
          </>
        )}

        {/* Log de insulina */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>💉 INSULINA</Text>
          <TouchableOpacity style={s.addBtn} onPress={() => setShowInsulinModal(true)}>
            <Text style={s.addBtnText}>+ Dosis</Text>
          </TouchableOpacity>
        </View>
        {insulinLog.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>Sin dosis registradas hoy</Text>
          </View>
        ) : (
          insulinLog.slice(0, 5).map(dose => {
            const typeLabel = dose.type === 'insulin_rapid' ? 'Rápida' : dose.type === 'insulin_long' ? 'Lenta' : 'Mixta';
            const time = new Date(dose.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            return (
              <View key={dose.id} style={ins.row}>
                <View style={[ins.typeBadge, dose.type === 'insulin_rapid' && { borderColor: '#818cf8' }]}>
                  <Text style={[ins.typeText, dose.type === 'insulin_rapid' && { color: '#818cf8' }]}>{typeLabel}</Text>
                </View>
                <Text style={ins.units}>{dose.units} UI</Text>
                {dose.mealContext ? <Text style={ins.meal}>{dose.mealContext}</Text> : null}
                <Text style={ins.time}>{time}</Text>
              </View>
            );
          })
        )}

        {/* Log de comidas */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>🍽️ COMIDAS DE HOY</Text>
        </View>

        {mealLog.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>Sin comidas registradas hoy</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => setShowFoodModal(true)}>
              <Text style={s.emptyBtnText}>Registrar comida</Text>
            </TouchableOpacity>
          </View>
        ) : (
          mealLog.map(entry => (
            <MealCard
              key={entry.id}
              entry={entry}
              onDelete={() => handleDeleteMeal(entry.id)}
            />
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modal de insulina */}
      <Modal visible={showInsulinModal} transparent animationType="slide">
        <View style={nfc.overlay}>
          <View style={[nfc.sheet, { gap: 14 }]}>
            <Text style={nfc.title}>💉 Registrar dosis</Text>

            <View style={ins.typeRow}>
              {(['rapid','long','mixed'] as const).map(t => {
                const label = t === 'rapid' ? 'Rápida' : t === 'long' ? 'Lenta' : 'Mixta';
                return (
                  <TouchableOpacity key={t} style={[ins.typeBtn, insulinType === t && ins.typeBtnOn]} onPress={() => setInsulinType(t)}>
                    <Text style={[ins.typeBtnText, insulinType === t && ins.typeBtnTextOn]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ width: '100%' }}>
              <Text style={ins.inputLabel}>Unidades</Text>
              <TextInput
                style={ins.unitsInput}
                value={insulinUnits}
                onChangeText={setInsulinUnits}
                keyboardType="numeric"
                placeholder="Ej: 8"
                placeholderTextColor={T.textMuted}
                autoFocus
              />
            </View>

            <View style={{ width: '100%' }}>
              <Text style={ins.inputLabel}>Contexto (opcional)</Text>
              <View style={ins.mealRow}>
                {['Ayunas', 'Desayuno', 'Almuerzo', 'Cena', 'Corrección'].map(ctx => (
                  <TouchableOpacity key={ctx} style={[ins.mealBtn, insulinMeal === ctx && ins.mealBtnOn]} onPress={() => setInsulinMeal(insulinMeal === ctx ? '' : ctx)}>
                    <Text style={[ins.mealBtnText, insulinMeal === ctx && ins.mealBtnTextOn]}>{ctx}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginTop: 4 }}>
              <TouchableOpacity style={[nfc.cancelBtn, { flex: 1 }]} onPress={() => setShowInsulinModal(false)}>
                <Text style={nfc.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[nfc.doneBtn, { flex: 1, marginTop: 0 }]} onPress={handleLogInsulin}>
                <Text style={nfc.doneText}>Registrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de búsqueda */}
      <FoodSearchModal
        visible={showFoodModal}
        service={glucoSvc}
        onClose={() => setShowFoodModal(false)}
        onSave={handleMealSaved}
      />
    </View>
  );
}

// ─── Helpers visuales ─────────────────────────────────────────

function TirBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ color, fontSize: 18, fontWeight: '800' }}>{pct}%</Text>
      <Text style={{ color: T.textMuted, fontSize: 10, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', backgroundColor: T.bgInput, borderRadius: R.md, padding: S.xs, flex: 1 }}>
      <Text style={{ color: T.textMuted, fontSize: 10 }}>{label}</Text>
      <Text style={{ color: T.text, fontSize: 14, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  content: { padding: S.md, gap: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.md, paddingBottom: 12 },
  title: { fontSize: 26, fontWeight: '900', color: T.text, letterSpacing: -0.5 },
  sub: { fontSize: 12, color: T.textMuted, marginTop: 2 },
  addBtn: { backgroundColor: T.accentGlow, borderRadius: R.full, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: T.accent + '55' },
  addBtnText: { color: T.accent, fontWeight: '700', fontSize: 13 },
  nfcBtn: { backgroundColor: '#0e2a2a', borderRadius: R.full, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: T.green + '55' },
  nfcBtnText: { color: T.green, fontWeight: '700', fontSize: 13 },
  sectionTitle: { fontSize: 11, color: T.textMuted, fontWeight: '800', letterSpacing: 2, marginTop: 20, marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { backgroundColor: T.bgCard, borderRadius: R.xl, padding: S.md, borderWidth: 1, borderColor: T.border },
  tirRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: S.sm },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  emptyCard: { backgroundColor: T.bgCard, borderRadius: R.xl, padding: S.lg, alignItems: 'center', borderWidth: 1, borderColor: T.border, gap: 12 },
  emptyText: { color: T.textMuted, fontSize: 14 },
  emptyBtn: { backgroundColor: T.accentGlow, borderRadius: R.full, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: T.accent + '55' },
  emptyBtnText: { color: T.accent, fontWeight: '700' },
  loadingText: { color: T.textMuted, marginTop: 12, fontSize: 14 },
});

const badge = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: S.xl, position: 'relative' },
  glow: { position: 'absolute', width: 200, height: 200, borderRadius: 100, top: '10%' },
  value: { fontSize: 80, fontWeight: '900', letterSpacing: -3 },
  unit: { fontSize: 16, color: T.textLight, marginTop: -4, fontWeight: '600' },
  pill: { borderRadius: R.full, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, marginTop: 8 },
  pillText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  noDataIcon: { fontSize: 36, marginBottom: 8, opacity: 0.4 },
  noData: { fontSize: 18, color: T.textMuted, fontWeight: '700', textAlign: 'center' },
  errorMsg: { fontSize: 13, color: T.textMuted, marginTop: 6, textAlign: 'center', maxWidth: 280 },
  stepsBox: { marginTop: 12, alignSelf: 'stretch', marginHorizontal: 24, backgroundColor: T.bgCard, borderRadius: R.lg, padding: S.sm, gap: 6, borderWidth: 1, borderColor: T.border },
  step: { fontSize: 12, color: T.textLight, lineHeight: 18 },
  diagBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.full, borderWidth: 1, borderColor: T.accent + '66', backgroundColor: T.accentGlow },
  diagBtnText: { color: T.accent, fontWeight: '700', fontSize: 13 },
});

const nfc = StyleSheet.create({
  overlay    : { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet      : { backgroundColor: T.bgCard, borderTopLeftRadius: R.xl * 2, borderTopRightRadius: R.xl * 2, padding: S.xl, alignItems: 'center', gap: 10, paddingBottom: 40 },
  icon       : { fontSize: 52, marginBottom: 4 },
  title      : { fontSize: 20, fontWeight: '800', color: T.text, textAlign: 'center' },
  sub        : { fontSize: 14, color: T.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  errorMsg   : { fontSize: 13, color: T.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  resultGlucose : { fontSize: 72, fontWeight: '900', color: T.green, letterSpacing: -2 },
  resultUnit : { fontSize: 20, fontWeight: '600', color: T.textMuted },
  resultTrend: { fontSize: 18, color: T.textLight, fontWeight: '700' },
  warmingText: { fontSize: 12, color: T.gold, textAlign: 'center', backgroundColor: T.gold + '15', borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 4 },
  sensorAge  : { fontSize: 12, color: T.textMuted, marginTop: 4 },
  cancelBtn  : { paddingHorizontal: 24, paddingVertical: 12, borderRadius: R.full, borderWidth: 1, borderColor: T.border },
  cancelText : { color: T.textMuted, fontWeight: '600', fontSize: 14 },
  retryBtn   : { paddingHorizontal: 24, paddingVertical: 12, borderRadius: R.full, backgroundColor: T.accentGlow, borderWidth: 1, borderColor: T.accent + '55' },
  retryText  : { color: T.accent, fontWeight: '700', fontSize: 14 },
  doneBtn    : { marginTop: 8, paddingHorizontal: 32, paddingVertical: 14, borderRadius: R.full, backgroundColor: T.green + '20', borderWidth: 1, borderColor: T.green + '55' },
  doneText   : { color: T.green, fontWeight: '800', fontSize: 15 },
});

const meal = StyleSheet.create({
  card: { backgroundColor: T.bgCard, borderRadius: R.lg, padding: S.md, borderWidth: 1, borderColor: T.border, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  time: { color: T.textMuted, fontSize: 12, fontWeight: '600' },
  risk: { borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  riskText: { fontSize: 11, fontWeight: '700' },
  del: { marginLeft: 'auto' },
  delText: { color: T.textMuted, fontSize: 20, lineHeight: 22 },
  food: { color: T.textLight, fontSize: 12, marginBottom: 2 },
  totals: { color: T.textMuted, fontSize: 11, marginTop: 4, fontStyle: 'italic' },
});

const ins = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.bgCard, borderRadius: R.lg, padding: 12, borderWidth: 1, borderColor: T.border, marginBottom: 6 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.full, borderWidth: 1, borderColor: T.green + '66', backgroundColor: T.green + '15' },
  typeText: { fontSize: 11, fontWeight: '800', color: T.green },
  units: { fontSize: 15, fontWeight: '800', color: T.text },
  meal: { fontSize: 12, color: T.textMuted, flex: 1 },
  time: { fontSize: 11, color: T.textMuted, marginLeft: 'auto' },

  typeRow: { flexDirection: 'row', gap: 10, width: '100%' },
  typeBtn: { flex: 1, paddingVertical: 10, borderRadius: R.md, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
  typeBtnOn: { borderColor: T.green, backgroundColor: T.green + '20' },
  typeBtnText: { fontSize: 13, fontWeight: '700', color: T.textMuted },
  typeBtnTextOn: { color: T.green },

  inputLabel: { fontSize: 11, color: T.textMuted, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  unitsInput: { backgroundColor: T.bgInput, color: T.text, borderRadius: R.md, borderWidth: 1, borderColor: T.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 22, fontWeight: '800', textAlign: 'center' },

  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mealBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: T.border, backgroundColor: T.bgCard },
  mealBtnOn: { borderColor: T.accent, backgroundColor: T.accentGlow },
  mealBtnText: { fontSize: 12, color: T.textMuted, fontWeight: '600' },
  mealBtnTextOn: { color: T.accent, fontWeight: '800' },
});

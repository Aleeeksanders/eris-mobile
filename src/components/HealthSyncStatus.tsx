/**
 * HealthSyncStatus — dos piezas para que un permiso de Health Connect faltante deje de ser invisible.
 *
 * `HealthSyncChip`: indicador chico y persistente (Nutrición) — visible siempre, en ambos estados.
 * `HealthSyncBanner`: aviso prominente (Inicio) — solo aparece mientras falte el permiso de ESCRITURA
 * (Nutrición/Hidratación); en cuanto se concede, desaparece solo. El botón manual sigue viviendo en
 * Perfil ("Sincronizar Google Health") para quien quiera revisarlo o repetirlo después.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { metricsService } from '../services/MetricsService';
import { nutritionBackend } from '../services/NutritionBackend';
import { T, R } from '../config/design';

/** null = todavía no se sabe (primer chequeo en curso) — no se muestra nada hasta tener respuesta. */
function useHealthWriteStatus() {
  const [ok, setOk] = useState<boolean | null>(null);
  const check = useCallback(() => {
    metricsService.hasNutritionWritePermissions().then(setOk).catch(() => setOk(false));
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [check]);

  // Se re-chequea también al enfocar la pestaña — por si el usuario volvió de conceder el permiso en Perfil.
  useFocusEffect(useCallback(() => { check(); }, [check]));

  return { ok, recheck: check };
}

export function HealthSyncChip() {
  const { ok } = useHealthWriteStatus();
  if (ok === null) return null;
  return (
    <View style={[chip.box, { backgroundColor: ok ? T.greenGlow : T.goldGlow }]}>
      <Text style={[chip.text, { color: ok ? T.green : T.gold }]}>
        {ok ? '✓ Sincronizado con Health Connect' : '⚠ Revisa los permisos de Health Connect'}
      </Text>
    </View>
  );
}

export function HealthSyncBanner() {
  const { ok, recheck } = useHealthWriteStatus();
  const [connecting, setConnecting] = useState(false);
  if (ok !== false) return null; // null = todavía cargando, true = ya está conectado: no hay nada que avisar

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const result = await metricsService.requestAllPermissions();
      if (result.ok) await nutritionBackend.backfillHealthConnect();
      await recheck();
    } finally {
      setConnecting(false);
    }
  };

  return (
    <View style={banner.card}>
      <Text style={banner.icon}>🔗</Text>
      <View style={{ flex: 1 }}>
        <Text style={banner.title}>Conecta tus datos de salud</Text>
        <Text style={banner.desc}>Sin esto, lo que anotas en Nutrición no llega a Inicio ni a Métricas.</Text>
      </View>
      <TouchableOpacity style={banner.btn} onPress={handleConnect} disabled={connecting} activeOpacity={0.8}>
        <Text style={banner.btnText}>{connecting ? '…' : 'Conectar'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const chip = StyleSheet.create({
  box: { alignSelf: 'flex-start', borderRadius: R.full, paddingVertical: 5, paddingHorizontal: 12, marginBottom: 12 },
  text: { fontSize: 11, fontWeight: '700' },
});

const banner = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: T.goldGlow, borderRadius: R.lg, borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
    padding: 14, marginBottom: 16,
  },
  icon: { fontSize: 22 },
  title: { color: T.text, fontSize: 13, fontWeight: '800' },
  desc: { color: T.textLight, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  btn: { backgroundColor: T.gold, borderRadius: R.md, paddingVertical: 8, paddingHorizontal: 14 },
  btnText: { color: '#000', fontWeight: '800', fontSize: 12.5 },
});

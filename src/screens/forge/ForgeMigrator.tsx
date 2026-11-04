// ============================================================
// Forge 2.0 — el paso del HTML a la versión nativa, una sola vez y sin perder un punto.
// Abre toji.html invisible (mismo origen y perfil = mismo localStorage, sin interfaz), espera su estado ya cargado, le
// pide que calcule con sus propias funciones XP, nivel, músculos, Arena y títulos, y el núcleo nuevo tiene que dar lo
// mismo (forgeMigrate.checkForgeMigration). Si calza, se guarda como Forge nativo (y se respalda en el PC); si no, sigue
// el HTML y queda anotado qué no calzó. Lo que Eris dejó en cola mientras Forge estaba cerrado se aplica después.
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { moduleHtml } from '../../services/ModuleHtml';
import { checkForgeMigration, isEmptyForge, migrationJS } from '../../services/forge/forgeMigrate';
import { forgeStore } from '../../services/forge/forgeStore';
import * as C from '../../services/forge/forgeCore';

export type ForgeMigrationOutcome = { kind: 'migrated'; days: number } | { kind: 'empty' } | { kind: 'mismatch'; diffs: string[] } | { kind: 'error'; msg: string };
export const FORGE_MIGRATION_RECORD_KEY = 'forge_migration_v1';

/** Lo que Eris dejó en cola mientras Forge estaba cerrado (TojiScreen) pasa al Forge nativo. */
async function applyQueued(pid: string) {
  const [planRaw, routineRaw] = await Promise.all([
    AsyncStorage.getItem(`pending_toji_plan_${pid}`), AsyncStorage.getItem(`pending_toji_routine_${pid}`),
  ]).catch(() => [null, null] as const);
  try { if (planRaw) { const p = JSON.parse(planRaw); await forgeStore.update((s) => C.applyPlan(s, p), 'plan de Eris'); } } catch {}
  try { if (routineRaw) { const r = JSON.parse(routineRaw); if (r?.md) await forgeStore.setRoutine({ md: String(r.md), name: String(r.name || 'Rutina de Eris') }); } } catch {}
  AsyncStorage.multiRemove([`pending_toji_plan_${pid}`, `pending_toji_routine_${pid}`]).catch(() => {});
}

export default function ForgeMigrator({ profileId, onDone }: { profileId: string; onDone: (o: ForgeMigrationOutcome) => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const ref = useRef<WebView>(null);
  const done = useRef(false);
  const asked = useRef(false);
  const finish = (o: ForgeMigrationOutcome) => {
    if (done.current) return;
    done.current = true;
    AsyncStorage.setItem(FORGE_MIGRATION_RECORD_KEY, JSON.stringify({ ...o, at: new Date().toISOString() })).catch(() => {});
    onDone(o);
  };

  useEffect(() => {
    moduleHtml('toji').then(setHtml).catch((e) => finish({ kind: 'error', msg: String(e?.message ?? e) }));
    const t = setTimeout(() => finish({ kind: 'error', msg: 'el HTML de Forge no respondió' }), 25000);
    return () => clearTimeout(t);
  }, []);

  const onMessage = async (event: any) => {
    let msg: any;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    // El HTML ya cargó su estado (con el paso de día): se le pide que calcule con sus funciones
    if (msg.type === 'TOJI_STATE_SYNC' && !asked.current) {
      asked.current = true;
      ref.current?.injectJavaScript(migrationJS(msg.tojiState));
      return;
    }
    if (msg.type !== 'toji_migration') return;
    if (msg.error || !msg.state) return finish({ kind: 'error', msg: msg.error || 'sin datos' });
    if (isEmptyForge(msg.state) && !msg.routine) {
      // Nunca se usó: parte nativo desde cero (con lo que traía, por si tenía cuerpo o un plan)
      await forgeStore.replace({ ...C.hydrate(msg.state), migratedAt: new Date().toISOString() }, 'nuevo', null);
      await applyQueued(profileId);
      return finish({ kind: 'empty' });
    }
    const r = checkForgeMigration({ state: msg.state, routine: msg.routine, metrics: msg.metrics });
    if (!r.ok || !r.state) {
      console.warn('[Forge] la migración no calzó, sigue el HTML:', r.diffs);
      return finish({ kind: 'mismatch', diffs: r.diffs });
    }
    await forgeStore.replace(r.state, 'migración', msg.routine ?? null);
    await applyQueued(profileId);
    finish({ kind: 'migrated', days: Object.keys(r.state.sessions).length });
  };

  if (!html) return null;
  return (
    <View style={s.hidden} pointerEvents="none">
      <WebView
        ref={ref}
        source={{ html, baseUrl: 'file:///android_asset/' }}
        injectedJavaScriptBeforeContentLoaded={`window.__ERIS_PROFILE_ID__ = ${JSON.stringify(profileId)}; true;`}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        originWhitelist={['*']}
        onError={() => finish({ kind: 'error', msg: 'no cargó el HTML de Forge' })}
      />
    </View>
  );
}

const s = StyleSheet.create({ hidden: { position: 'absolute', width: 1, height: 1, left: -10, top: -10, opacity: 0 } });

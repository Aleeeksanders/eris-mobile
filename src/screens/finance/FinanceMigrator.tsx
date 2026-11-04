// ============================================================
// Finanzas 2.0 — el paso de la versión web a la nativa, una sola vez y sin perder un peso.
// Abre hunter-wallet.html invisible (mismo origen y perfil = mismo localStorage, sin interfaz), le pide TODOS sus datos y
// su propio resumen, y el núcleo nuevo tiene que dar exactamente lo mismo (financeMigrate.checkMigration). Si calza, se
// guarda como Finanzas nativa (y se respalda en el PC); si no, sigue la web y queda anotado qué no calzó.
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { moduleHtml } from '../../services/ModuleHtml';
import { checkMigration, MIGRATION_JS } from '../../services/finance/financeMigrate';
import { financeStore } from '../../services/finance/financeStore';

export type MigrationOutcome = { kind: 'migrated'; tx: number } | { kind: 'empty' } | { kind: 'mismatch'; diffs: string[] } | { kind: 'error'; msg: string };
export const MIGRATION_RECORD_KEY = 'finance_migration_v1';

export default function FinanceMigrator({ profileId, onDone }: { profileId: string; onDone: (o: MigrationOutcome) => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const ref = useRef<WebView>(null);
  const done = useRef(false);
  const finish = (o: MigrationOutcome) => {
    if (done.current) return;
    done.current = true;
    AsyncStorage.setItem(MIGRATION_RECORD_KEY, JSON.stringify({ ...o, at: new Date().toISOString() })).catch(() => {});
    onDone(o);
  };

  useEffect(() => {
    moduleHtml('wallet').then(setHtml).catch((e) => finish({ kind: 'error', msg: String(e?.message ?? e) }));
    const t = setTimeout(() => finish({ kind: 'error', msg: 'la versión web no respondió' }), 20000);
    return () => clearTimeout(t);
  }, []);

  const onMessage = async (event: any) => {
    let msg: any;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (msg.type === 'hw_ready') { ref.current?.injectJavaScript(MIGRATION_JS); return; }
    if (msg.type !== 'hw_migration') return;
    if (msg.error || !msg.dump?.keys) return finish({ kind: 'error', msg: msg.error || 'sin datos' });
    const keys: Record<string, string> = msg.dump.keys;
    const parse = (k: string, d: any) => { try { return keys[k] != null ? JSON.parse(keys[k]) : d; } catch { return d; } };
    // Nunca configuró Finanzas en la web: parte de cero (primer uso nativo)
    if (parse('hw_setup_done', false) !== true && !(parse('hw2_sueldo', []) || []).length && !(parse('hw2_tx', []) || []).length) return finish({ kind: 'empty' });
    const r = checkMigration({ dump: msg.dump, extract: msg.extract });
    if (!r.ok || !r.state) {
      console.warn('[Finanzas] la migración no calzó, sigue la versión web:', r.diffs);
      return finish({ kind: 'mismatch', diffs: r.diffs });
    }
    await financeStore.replace(r.state);
    finish({ kind: 'migrated', tx: r.state.tx.length });
  };

  if (!html) return null;
  return (
    <View style={s.hidden} pointerEvents="none">
      <WebView
        ref={ref}
        source={{ html, baseUrl: 'file:///android_asset/' }}
        injectedJavaScriptBeforeContentLoaded={`window.__ERIS_PROFILE_ID__ = ${JSON.stringify(profileId)}; window.__HW_HEADLESS__ = true; true;`}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        originWhitelist={['*']}
        onError={() => finish({ kind: 'error', msg: 'no cargó la versión web' })}
      />
    </View>
  );
}

const s = StyleSheet.create({ hidden: { position: 'absolute', width: 1, height: 1, left: -10, top: -10, opacity: 0 } });

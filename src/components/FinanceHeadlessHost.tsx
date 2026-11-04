// ============================================================
// Eris Mobile — FinanceHeadlessHost
// Copia invisible de Finanzas (hunter-wallet.html en modo __HW_HEADLESS__, sin interfaz) que se monta solo cuando
// Eris tiene algo que anotar y Finanzas no está abierta. Mismo origen (baseUrl) que la pantalla → mismo localStorage.
// Aplica las operaciones, le manda al servidor el resumen actualizado y se desmonta a los pocos segundos.
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { AuthStorage } from '../services/AuthStorage';
import { financeBridge, applyOpsJS } from '../services/FinanceBridge';
import { HW_EXTRACT_JS, publishFinanceContext } from '../services/hwExtract';
import { moduleHtml } from '../services/ModuleHtml';
import { onFinanceDump } from '../services/financeBackup';

const IDLE_CLOSE_MS = 8000;
const loadHtml = () => moduleHtml('wallet');

export function FinanceHeadlessHost() {
  const [active, setActive] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const ref = useRef<WebView>(null);
  const ready = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = () => {
    if (!ready.current || !ref.current) return;
    for (const { reqId, ops } of financeBridge.takeQueue()) ref.current.injectJavaScript(applyOpsJS(reqId, ops));
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      if (financeBridge.hasQueue()) return flush();
      ready.current = false;
      setActive(false);
    }, IDLE_CLOSE_MS);
  };

  useEffect(() => {
    financeBridge.setHostWake(() => { if (ready.current) flush(); else setActive(true); });
    return () => { financeBridge.setHostWake(null); if (idle.current) clearTimeout(idle.current); };
  }, []);

  useEffect(() => {
    if (!active) return;
    (async () => {
      try {
        const [h, creds] = await Promise.all([loadHtml(), AuthStorage.getCredentials()]);
        setProfileId(creds?.profileId ?? 'anon');
        setHtml(h);
      } catch (e) {
        console.warn('[FinanceHost] no se pudo cargar Finanzas:', e);
        setActive(false); // las operaciones en cola vencen con "no respondió" (FinanceBridge)
      }
    })();
  }, [active]);

  const onMessage = (event: any) => {
    let msg: any;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (msg.type === 'hw_ready') { ready.current = true; flush(); }
    else if (msg.type === 'hw_ops_result') {
      financeBridge.onResults(msg.reqId, msg.results);
      ref.current?.injectJavaScript(HW_EXTRACT_JS); // Eris ve los saldos nuevos sin abrir Finanzas
    } else if (msg.type === 'hw_context') publishFinanceContext(msg, profileId);
    else if (msg.type === 'hw_backup') onFinanceDump(msg.dump); // lo anotado por chat también se respalda
  };

  if (!active || !html || !profileId) return null;
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
        onError={() => { ready.current = false; setActive(false); }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, left: -10, top: -10, opacity: 0 },
});

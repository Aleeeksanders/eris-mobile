import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Vibration, AppState, Platform, DeviceEventEmitter,
} from 'react-native';
import { erisNotifications, APPROVAL_ANSWERED_EVENT } from '../services/ErisNotifications';
import { wsManager } from '../services/WebSocketManager';
import { personaName } from '../config/persona';
import { T, R, S } from '../config/design';

/**
 * Tarjeta "Eris pide permiso". El servidor NO ejecuta comandos, no escribe archivos ni repara la bóveda sin que
 * una persona toque Aprobar acá. El contenido lo pone el servidor (no lo puede cambiar el chat ni el modelo):
 * lo que se lee es exactamente lo que se ejecuta. Se monta una sola vez en App, así aparece en cualquier pantalla.
 * Sin respuesta, o con "atrás", se rechaza.
 */
interface ApprovalReq {
  id: string;
  tool: string;
  title: string;
  detail: string;
  risk: 'normal' | 'high';
  flags: string[];
  expiresAt: number;
}

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

const fmtLeft = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function ApprovalHost() {
  const [queue, setQueue] = useState<ApprovalReq[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const unsub = wsManager.subscribeMessage((data) => {
      if (data.type === 'confirm_request' && data.id) {
        const req: ApprovalReq = {
          id: String(data.id),
          tool: String(data.tool || ''),
          title: String(data.title || 'Acción pendiente'),
          detail: String(data.detail || ''),
          risk: data.risk === 'high' ? 'high' : 'normal',
          flags: Array.isArray(data.flags) ? data.flags.map(String) : [],
          expiresAt: Date.now() + (Number(data.ttlMs) || 180000),
        };
        setQueue((q) => (q.some((r) => r.id === req.id) ? q : [...q, req]));
        Vibration.vibrate(req.risk === 'high' ? [0, 250, 120, 250] : [0, 200]);
        // Fuera de la app: notificación con "Rechazar" (seguro) y "Revisar" (abre esta tarjeta). Aprobar, solo aquí.
        if (AppState.currentState !== 'active') {
          erisNotifications.approval({ id: req.id, title: req.title, detail: req.detail, risk: req.risk }).catch(() => {});
        }
      } else if (data.type === 'confirm_cancelled' && data.id) {
        setQueue((q) => q.filter((r) => r.id !== String(data.id)));
      } else if (data.type === 'connected' || data.type === 'auth_error') {
        setQueue([]); // una conexión nueva no hereda pedidos de la anterior: el servidor ya los rechazó
      }
    });
    return () => { unsub(); };
  }, []);

  // Rechazada desde la notificación: sale de la cola
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(APPROVAL_ANSWERED_EVENT, (id: string) => setQueue((q) => q.filter((r) => r.id !== id)));
    return () => sub.remove();
  }, []);

  // Lo que sale de la cola (respondido, cancelado, vencido) también sale de la bandeja de notificaciones
  const prevIds = useRef<string[]>([]);
  useEffect(() => {
    const ids = queue.map((r) => r.id);
    for (const id of prevIds.current) if (!ids.includes(id)) erisNotifications.dismissApproval(id);
    prevIds.current = ids;
  }, [queue]);

  // Cuenta regresiva: solo corre mientras hay algo pendiente
  useEffect(() => {
    if (queue.length === 0) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setQueue((q) => (q.some((r) => r.expiresAt <= n) ? q.filter((r) => r.expiresAt > n) : q));
    }, 1000);
    return () => clearInterval(t);
  }, [queue.length]);

  const current = queue[0];
  if (!current) return null;

  const answer = (approved: boolean) => {
    wsManager.sendMessage({ type: 'confirm_response', id: current.id, approved });
    setQueue((q) => q.filter((r) => r.id !== current.id));
  };

  const high = current.risk === 'high';
  const accent = high ? T.red : T.accent;
  const left = current.expiresAt - now;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => answer(false)} statusBarTranslucent>
      <View style={s.backdrop}>
        <View style={[s.card, { borderColor: high ? 'rgba(244,63,94,0.45)' : T.borderActive }]}>
          <View style={s.headRow}>
            <Text style={[s.eyebrow, { color: accent }]}>{personaName().toUpperCase()} PIDE PERMISO</Text>
            {queue.length > 1 && <Text style={s.counter}>1 de {queue.length}</Text>}
          </View>
          <Text style={s.title}>{current.title}</Text>

          {high && (
            <View style={s.riskBox}>
              <Text style={s.riskTitle}>Riesgo alto</Text>
              {current.flags.length > 0 && <Text style={s.riskFlags}>{current.flags.join(' · ')}</Text>}
            </View>
          )}
          {!high && current.flags.length > 0 && <Text style={s.flagsLine}>{current.flags.join(' · ')}</Text>}

          <Text style={s.label}>Esto es exactamente lo que se va a hacer</Text>
          <ScrollView style={s.detailBox} nestedScrollEnabled>
            <Text style={s.detail} selectable>{current.detail}</Text>
          </ScrollView>

          <View style={s.timerTrack}>
            <View style={[s.timerFill, { width: `${Math.max(0, Math.min(100, (left / 180000) * 100))}%`, backgroundColor: accent }]} />
          </View>
          <Text style={s.timerText}>Se rechaza sola en {fmtLeft(left)}</Text>

          <View style={s.btnRow}>
            <TouchableOpacity style={[s.btn, s.btnDeny]} onPress={() => answer(false)} accessibilityRole="button" accessibilityLabel="Rechazar">
              <Text style={s.btnDenyText}>Rechazar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { backgroundColor: accent }]} onPress={() => answer(true)} accessibilityRole="button" accessibilityLabel="Aprobar">
              <Text style={s.btnOkText}>{high ? 'Aprobar de todos modos' : 'Aprobar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', padding: S.md },
  card: { backgroundColor: T.bgCard, borderRadius: R.lg, borderWidth: 1, padding: S.md, maxHeight: '88%' },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  counter: { color: T.textMuted, fontSize: 12, fontWeight: '600' },
  title: { color: T.text, fontSize: 20, fontWeight: '700', marginBottom: S.sm },
  riskBox: { backgroundColor: T.redGlow, borderColor: 'rgba(244,63,94,0.35)', borderWidth: 1, borderRadius: R.sm, padding: S.sm, marginBottom: S.sm },
  riskTitle: { color: T.red, fontSize: 13, fontWeight: '800' },
  riskFlags: { color: T.textLight, fontSize: 13, marginTop: 2 },
  flagsLine: { color: T.textLight, fontSize: 13, marginBottom: S.sm },
  label: { color: T.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  detailBox: { backgroundColor: T.bgInput, borderRadius: R.sm, borderWidth: 1, borderColor: T.border, padding: S.sm, maxHeight: 240, marginBottom: S.sm },
  detail: { color: T.text, fontSize: 13, lineHeight: 19, fontFamily: MONO },
  timerTrack: { height: 3, backgroundColor: T.border, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  timerFill: { height: 3, borderRadius: 2 },
  timerText: { color: T.textMuted, fontSize: 12, marginTop: 6, marginBottom: S.md },
  btnRow: { flexDirection: 'row', gap: S.sm },
  btn: { flex: 1, minHeight: 52, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.sm },
  btnDeny: { backgroundColor: 'transparent', borderWidth: 1, borderColor: T.textMuted },
  btnDenyText: { color: T.text, fontSize: 15, fontWeight: '700' },
  btnOkText: { color: '#08080a', fontSize: 15, fontWeight: '800', textAlign: 'center' },
});

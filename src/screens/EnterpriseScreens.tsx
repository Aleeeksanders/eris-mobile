/**
 * Modo Empresa (solo administradores) — el menú de trabajo de AXS: Panel, Proyectos, Pendientes y Sistema.
 *
 * Todo sale del servidor, calculado en código desde la bóveda de AXS y el PC (eris/src/services/vault/AxsDashboard.ts y
 * SystemStatus.ts), por el canal de administración (`admin_axs_dashboard`, que vuelve a verificar que seas Ikaros).
 * Hestia sigue disponible en la burbuja; Forge y Finanzas, a un toque desde el Panel.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, TextInput, Modal, StatusBar, Alert,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { T, R, S } from '../config/design';
import { wsManager } from '../services/WebSocketManager';
import { AuthStorage } from '../services/AuthStorage';
import ModeSwitch from '../components/ModeSwitch';
import { AdminPanel } from './AdminPanel';
import { HestiaControl } from './HestiaControl';

const BLUE = '#3b82f6';
const AMBER = '#f59e0b';

// ─── Datos compartidos por las cuatro pestañas ──────────────────
interface Dash {
  generatedAt: string;
  vault: { notes: number; lastActivity: string; areas: Array<{ area: string; label: string; notes: number }> };
  health: { light: string; errors: number; warns: number; top: Array<{ label: string; path: string }> };
  attention: string[];
  pending: { backlog: number; rituals: number; immediate: string[]; byNote: Array<{ path: string; name: string; tasks: string[] }> };
  feed: { log: string | null; logStale: boolean; daily: string | null; decision: string | null; inbox: number | null };
  recent: Array<{ path: string; name: string; ago: string }>;
  projects: Array<{ path: string; name: string; area: string; areaLabel: string; status: string; tier: string; openTasks: number; tasks: number; ago: string; tags: string[] }>;
}
interface Sys {
  host: string; cpuPct: number; cpuModel: string; cores: number; ramUsedGb: number; ramTotalGb: number;
  disk: { freeGb: number; totalGb: number } | null; uptimeH: number; serverUptimeH: number;
  services: Array<{ key?: string; name: string; port: number; up: boolean }>;
}
interface State { dash?: Dash; system?: Sys | null; server?: { connections: number; pendingApprovals: number; integrity: { ok: boolean; entries: number } | null }; error?: string; at: number }

let cache: State | null = null;
let loading = false;
const subs = new Set<() => void>();
let installed = false;
const notify = () => subs.forEach((f) => { try { f(); } catch {} });
/** Botones de Sistema: qué se está haciendo ("whisper:reiniciar") y cómo terminó lo último (eris/src/services/ServiceControl.ts) */
let svcBusy: string | null = null;
let svcMsg: { text: string; ok: boolean } | null = null;

function request() {
  if (wsManager.getStatus() !== 'connected') { cache = { ...(cache ?? { at: 0 }), error: 'Sin conexión con el servidor de Eris.' }; notify(); return; }
  loading = true; notify();
  wsManager.sendMessage({ type: 'admin_axs_dashboard' });
}
function install() {
  if (installed) return;
  installed = true;
  wsManager.subscribeMessage((d: any) => {
    if (d?.type === 'admin_axs_dashboard') {
      loading = false;
      cache = d.ok ? { dash: d.dashboard, system: d.system, server: d.server, at: Date.now() }
        : { ...(cache ?? {}), system: d.system ?? cache?.system, server: d.server ?? cache?.server, error: d.message || 'No pude leer la bóveda de AXS.', at: Date.now() };
      notify();
    }
    // El canal de administración rechazó el pedido (p. ej. sesión sin Google)
    if (d?.type === 'admin_result' && d.ok === false && !d.action && loading) {
      loading = false; cache = { ...(cache ?? { at: Date.now() }), error: d.message || 'Permiso denegado.' }; notify();
    }
    if (d?.type === 'admin_result' && d.ok === false && !d.action && svcBusy) {
      svcBusy = null; svcMsg = { text: d.message || 'Permiso denegado.', ok: false }; notify();
    }
    if (d?.type === 'admin_service') {
      if (d.pending) { svcBusy = `${d.service}:${d.action}`; notify(); return; }
      svcBusy = null;
      svcMsg = { text: String(d.message ?? ''), ok: d.ok === true };
      if (d.system && cache) cache = { ...cache, system: d.system, at: Date.now() };
      notify();
    }
    // Al reconectar (p. ej. después de reiniciar el servidor) ningún botón queda esperando una respuesta que ya no llega
    if (d?.type === 'connected') { if (svcBusy) { svcBusy = null; notify(); } if (subs.size) request(); }
  });
}

function useAxs() {
  const [, force] = useState(0);
  useEffect(() => {
    install();
    const f = () => force((x) => x + 1);
    subs.add(f);
    if (!cache || Date.now() - cache.at > 60_000) request();
    return () => { subs.delete(f); };
  }, []);
  return { state: cache, loading, refresh: request };
}

// ─── Piezas ─────────────────────────────────────────────────────
function Screen({ title, eyebrow, children, refreshing, onRefresh }: { title: string; eyebrow: string; children: React.ReactNode; refreshing: boolean; onRefresh: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.eyebrow}>{eyebrow}</Text>
        <Text style={s.title}>{title}</Text>
        {children}
      </ScrollView>
    </View>
  );
}
const Card = ({ children, style }: { children: React.ReactNode; style?: any }) => <View style={[s.card, style]}>{children}</View>;
const SectionTitle = ({ children }: { children: React.ReactNode }) => <Text style={s.section}>{children}</Text>;
function Status({ state, loading }: { state: State | null; loading: boolean }) {
  if (loading && !state?.dash) return <View style={s.center}><ActivityIndicator color={BLUE} /><Text style={s.muted}>Leyendo la bóveda de AXS…</Text></View>;
  if (state?.error) return <Card style={{ borderColor: T.red }}><Text style={s.errorText}>{state.error}</Text><Text style={s.muted}>Desliza hacia abajo para reintentar.</Text></Card>;
  return null;
}
const STATUS_COLOR: Record<string, string> = { Activo: T.green, Planificado: BLUE, Concepto: T.purple, Histórico: T.textMuted };
const Pill = ({ text, color }: { text: string; color: string }) => (
  <View style={[s.pill, { borderColor: color, backgroundColor: color + '1f' }]}><Text style={[s.pillText, { color }]}>{text}</Text></View>
);
/** "[[ruta|Nombre]]" → "Nombre" (los enlaces de Obsidian no se abren en el teléfono) */
const plainLinks = (md: string) => md.replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/!?\[\[([^\]]+)\]\]/g, (_, p: string) => p.split('/').pop()!.replace(/\.md$/, ''));
/** La ficha trae su propio título y el enlace a la nota: el título ya está arriba de la hoja. Casillas "- [ ]" → "☐". */
const sheetText = (md: string) => {
  const lines = md.split('\n');
  if (/^#\s/.test(lines[0] ?? '')) { lines.shift(); if (/^\s*!?\[\[/.test(lines[0] ?? '')) lines.shift(); }
  return plainLinks(lines.join('\n').trim()).replace(/^(\s*[-*]\s+)\[ \]\s+/gm, '$1☐ ').replace(/^(\s*[-*]\s+)\[[xX]\]\s+/gm, '$1☑ ');
};

/** Ficha de un proyecto o nota (la misma que da Hestia en el chat). */
function ProjectSheet({ name, onClose, onAsk }: { name: string | null; onClose: () => void; onAsk: (msg: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!name) return;
    setText(null);
    const requestId = `p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const off = wsManager.subscribeMessage((d: any) => { if (d?.type === 'admin_axs_project' && d.requestId === requestId) setText(d.text || 'Sin información.'); });
    wsManager.sendMessage({ type: 'admin_axs_project', name, requestId });
    return () => { off(); };
  }, [name]);
  return (
    <Modal visible={!!name} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetOverlay}>
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle} numberOfLines={1}>{name}</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} accessibilityLabel="Cerrar"><Text style={s.closeText}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 460 }}>
            {text === null ? <ActivityIndicator color={BLUE} style={{ marginVertical: 30 }} /> : <Markdown style={md}>{sheetText(text)}</Markdown>}
          </ScrollView>
          <TouchableOpacity style={s.primaryBtn} onPress={() => { onClose(); onAsk(`Hestia, ¿en qué está ${name}?`); }}>
            <Text style={s.primaryText}>Preguntarle a Hestia</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Panel ──────────────────────────────────────────────────────
export function EnterprisePanel({ onNavigateToChat, onTojiPress, onWalletPress }: {
  onNavigateToChat: (msg?: string) => void; onTojiPress: () => void; onWalletPress: () => void;
}) {
  const { state, loading, refresh } = useAxs();
  const nav = useNavigation<any>();
  const [sheet, setSheet] = useState<string | null>(null);
  const d = state?.dash;
  const sys = state?.system;
  const up = sys ? sys.services.filter((x) => x.up).length : 0;
  const today = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <Screen eyebrow={`AXS · ${today}`} title="Panel AXS" refreshing={loading && !!d} onRefresh={refresh}>
      <ModeSwitch />
      <Status state={state} loading={loading} />
      {d && (
        <>
          <Card style={{ borderColor: d.attention.length ? AMBER : T.green }}>
            <Text style={[s.cardTitle, { color: d.attention.length ? AMBER : T.green }]}>{d.attention.length ? 'Merece atención' : 'Todo en orden'}</Text>
            {d.attention.length ? d.attention.map((a) => <Text key={a} style={s.li}>• {a}</Text>) : <Text style={s.li}>Nada urgente en AXS por ahora.</Text>}
          </Card>

          <View style={s.grid}>
            <Kpi label="NOTAS" value={String(d.vault.notes)} sub={`actividad ${d.vault.lastActivity}`} />
            <Kpi label="SALUD" value={`${d.health.light} ${d.health.errors + d.health.warns}`} sub={`${d.health.errors} error(es) · ${d.health.warns} aviso(s)`} />
            <Kpi label="PENDIENTES" value={String(d.pending.backlog)} sub={`${d.pending.immediate.length} inmediata(s)`} onPress={() => nav.navigate('Pendientes')} />
            <Kpi label="SISTEMA" value={sys ? `${up}/${sys.services.length}` : '—'} sub={sys ? `CPU ${sys.cpuPct} % · RAM ${sys.ramUsedGb}/${sys.ramTotalGb} GB` : 'sin datos'} onPress={() => nav.navigate('Sistema')} />
          </View>

          {d.pending.immediate.length > 0 && (
            <>
              <SectionTitle>LO INMEDIATO</SectionTitle>
              <Card>
                {d.pending.immediate.slice(0, 5).map((x, i) => <Text key={i} style={s.li}>• {x}</Text>)}
                {d.pending.immediate.length > 5 && <Text style={s.link} onPress={() => nav.navigate('Pendientes')}>Ver todos →</Text>}
              </Card>
            </>
          )}

          <SectionTitle>ÚLTIMO MOVIMIENTO</SectionTitle>
          <Card>
            {d.recent.map((n) => (
              <TouchableOpacity key={n.path} style={s.row} onPress={() => setSheet(n.name)} accessibilityRole="button">
                <Text style={s.rowName} numberOfLines={1}>{n.name}</Text>
                <Text style={s.rowMeta}>{n.ago}</Text>
              </TouchableOpacity>
            ))}
          </Card>

          <SectionTitle>REGISTRO</SectionTitle>
          <Card>
            <Text style={[s.li, d.feed.logStale && { color: AMBER }]}>Log del sistema: {d.feed.log ?? 'ninguno'}{d.feed.logStale ? ' ⚠' : ''}</Text>
            <Text style={s.li}>Nota diaria: {d.feed.daily ?? 'ninguna'}</Text>
            <Text style={s.li}>Última decisión: {d.feed.decision ?? 'ninguna'}</Text>
            {d.feed.inbox !== null && <Text style={s.li}>Inbox: {d.feed.inbox === 0 ? 'vacío ✅' : `${d.feed.inbox} por procesar`}</Text>}
          </Card>
        </>
      )}

      <SectionTitle>CON HESTIA</SectionTitle>
      <View style={s.chips}>
        {[
          { t: '🧭 Briefing', m: 'Hestia, dame el briefing de AXS.' },
          { t: '📋 Pendientes', m: 'Hestia, ¿qué pendientes tengo en AXS?' },
          { t: '📊 Reporte ejecutivo', m: 'Hestia, genera un reporte ejecutivo de AXS.' },
        ].map((c) => (
          <TouchableOpacity key={c.t} style={s.chip} onPress={() => onNavigateToChat(c.m)}><Text style={s.chipText}>{c.t}</Text></TouchableOpacity>
        ))}
      </View>

      <SectionTitle>MÓDULOS</SectionTitle>
      <View style={s.chips}>
        <TouchableOpacity style={s.chip} onPress={onWalletPress}><Text style={s.chipText}>💳 Finanzas</Text></TouchableOpacity>
        <TouchableOpacity style={s.chip} onPress={onTojiPress}><Text style={s.chipText}>🏋️ Forge</Text></TouchableOpacity>
        <TouchableOpacity style={s.chip} onPress={() => nav.navigate('Proyectos')}><Text style={s.chipText}>📁 Proyectos</Text></TouchableOpacity>
      </View>

      <ProjectSheet name={sheet} onClose={() => setSheet(null)} onAsk={onNavigateToChat} />
    </Screen>
  );
}

function Kpi({ label, value, sub, onPress }: { label: string; value: string; sub: string; onPress?: () => void }) {
  const Body = (
    <>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={s.kpiSub} numberOfLines={2}>{sub}</Text>
    </>
  );
  return onPress
    ? <TouchableOpacity style={s.kpi} onPress={onPress} accessibilityRole="button">{Body}</TouchableOpacity>
    : <View style={s.kpi}>{Body}</View>;
}

// ─── Proyectos ──────────────────────────────────────────────────
export function EnterpriseProjects({ onNavigateToChat }: { onNavigateToChat: (msg?: string) => void }) {
  const { state, loading, refresh } = useAxs();
  const [q, setQ] = useState('');
  const [area, setArea] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const d = state?.dash;
  const fold = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = useMemo(() => (d?.projects ?? []).filter((p) =>
    (!area || p.area === area) && (!q.trim() || fold(`${p.name} ${p.tags.join(' ')} ${p.areaLabel}`).includes(fold(q.trim())))), [d, q, area]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const p of list) m.set(p.areaLabel, [...(m.get(p.areaLabel) ?? []), p]);
    return [...m.entries()];
  }, [list]);
  return (
    <Screen eyebrow="AXS · BÓVEDA" title="Proyectos" refreshing={loading && !!d} onRefresh={refresh}>
      <Status state={state} loading={loading} />
      {d && (
        <>
          <TextInput style={s.search} value={q} onChangeText={setQ} placeholder="Buscar proyecto, nota o etiqueta…" placeholderTextColor={T.textMuted} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            <TouchableOpacity style={[s.chip, !area && s.chipOn]} onPress={() => setArea(null)}><Text style={s.chipText}>Todas</Text></TouchableOpacity>
            {d.vault.areas.filter((a) => a.area).map((a) => (
              <TouchableOpacity key={a.area} style={[s.chip, area === a.area && s.chipOn]} onPress={() => setArea(area === a.area ? null : a.area)}>
                <Text style={s.chipText}>{a.label} · {a.notes}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {groups.length === 0 && <Text style={s.muted}>Nada calza con «{q}».</Text>}
          {groups.map(([label, ps]) => (
            <View key={label}>
              <SectionTitle>{label.toUpperCase()}</SectionTitle>
              <Card>
                {ps.map((p) => (
                  <TouchableOpacity key={p.path} style={s.projRow} onPress={() => setSheet(p.name)} accessibilityRole="button">
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowName} numberOfLines={1}>{p.name}</Text>
                      <Text style={s.projMeta}>{[p.tier, p.ago, p.openTasks ? `${p.openTasks} tarea(s)` : ''].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <Pill text={p.status} color={STATUS_COLOR[p.status] ?? T.textMuted} />
                  </TouchableOpacity>
                ))}
              </Card>
            </View>
          ))}
        </>
      )}
      <ProjectSheet name={sheet} onClose={() => setSheet(null)} onAsk={onNavigateToChat} />
    </Screen>
  );
}

// ─── Pendientes ─────────────────────────────────────────────────
export function EnterprisePending({ onNavigateToChat }: { onNavigateToChat: (msg?: string) => void }) {
  const { state, loading, refresh } = useAxs();
  const [open, setOpen] = useState<string | null>(null);
  const d = state?.dash;
  return (
    <Screen eyebrow="AXS · TAREAS" title="Pendientes" refreshing={loading && !!d} onRefresh={refresh}>
      <Status state={state} loading={loading} />
      {d && (
        <>
          <View style={s.grid}>
            <Kpi label="ABIERTAS" value={String(d.pending.backlog)} sub={`en ${d.pending.byNote.length} nota(s)`} />
            <Kpi label="INMEDIATAS" value={String(d.pending.immediate.length)} sub="MEMORY.md" />
          </View>
          <SectionTitle>LO INMEDIATO</SectionTitle>
          <Card>
            {d.pending.immediate.length ? d.pending.immediate.map((x, i) => <Text key={i} style={s.li}>• {x}</Text>) : <Text style={s.li}>Nada marcado como inmediato ✅</Text>}
          </Card>
          <SectionTitle>BACKLOG EN NOTAS</SectionTitle>
          {d.pending.byNote.length === 0 && <Card><Text style={s.li}>Ninguna tarea abierta ✅</Text></Card>}
          {d.pending.byNote.map((n) => (
            <Card key={n.path}>
              <TouchableOpacity style={s.row} onPress={() => setOpen(open === n.path ? null : n.path)} accessibilityRole="button">
                <Text style={s.rowName} numberOfLines={1}>{n.name}</Text>
                <Text style={s.rowMeta}>{n.tasks.length} {open === n.path ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {open === n.path && n.tasks.map((t, i) => <Text key={i} style={s.task}>☐ {t}</Text>)}
            </Card>
          ))}
          {d.pending.rituals > 0 && <Text style={s.muted}>Además hay {d.pending.rituals} ritual(es) de cadencia sin marcar (se repiten; no se listan).</Text>}
          <TouchableOpacity style={s.primaryBtn} onPress={() => onNavigateToChat('Hestia, de mis pendientes de AXS, ¿por cuál parto hoy?')}>
            <Text style={s.primaryText}>¿Por cuál parto? · Hestia</Text>
          </TouchableOpacity>
        </>
      )}
    </Screen>
  );
}

// ─── Sistema ────────────────────────────────────────────────────
/** Servidor anterior sin `key` en cada servicio: se deduce por el puerto */
const KEY_BY_PORT: Record<number, string> = { 3000: 'backend', 11434: 'ollama', 8081: 'whisper', 5001: 'piper' };
const SVC_NAME: Record<string, string> = { backend: 'el servidor de Eris', ollama: 'el modelo (Ollama)', whisper: 'el dictado (Whisper)', piper: 'la voz (Piper)', chat: 'el chat completo' };
/** Lo que pasa si se detiene o reinicia, para confirmar antes (iniciar no pregunta) */
const SVC_WARN: Record<string, string> = {
  'ollama:detener': 'El chat de Eris y de Hestia queda en pausa para todos hasta que lo vuelvas a iniciar. Lo que se anota en la app se sigue guardando.',
  'whisper:detener': 'El dictado por voz deja de funcionar hasta que lo vuelvas a iniciar.',
  'piper:detener': 'Eris deja de responder con voz hasta que la vuelvas a iniciar.',
  'chat:detener': 'Se apagan el modelo, el dictado y la voz para liberar RAM y GPU. La app sigue registrando y mandando avisos.',
  'backend:reiniciar': 'La app se desconecta unos segundos y se reconecta sola. Si alguien está chateando, esa respuesta se corta.',
};

function askService(svc: string, action: 'iniciar' | 'detener' | 'reiniciar') {
  const send = () => {
    if (wsManager.getStatus() !== 'connected') { svcMsg = { text: 'Sin conexión con el servidor de Eris.', ok: false }; notify(); return; }
    svcBusy = `${svc}:${action}`; svcMsg = null; notify();
    wsManager.sendMessage({ type: 'admin_service', service: svc, action });
  };
  if (action === 'iniciar') { send(); return; }
  const warn = SVC_WARN[`${svc}:${action}`] ?? 'Se detiene y se vuelve a iniciar; puede tardar hasta un minuto y medio.';
  Alert.alert(`${action === 'detener' ? 'Detener' : 'Reiniciar'} ${SVC_NAME[svc] ?? svc}`, warn, [
    { text: 'Cancelar', style: 'cancel' },
    { text: action === 'detener' ? 'Detener' : 'Reiniciar', style: action === 'detener' ? 'destructive' : 'default', onPress: send },
  ]);
}

function SvcButton({ label, svc, action, disabled, danger }: { label: string; svc: string; action: 'iniciar' | 'detener' | 'reiniciar'; disabled?: boolean; danger?: boolean }) {
  const mine = svcBusy === `${svc}:${action}`;
  const off = !!disabled || (!!svcBusy && !mine);
  const color = danger ? T.red : BLUE;
  return (
    <TouchableOpacity
      style={[s.svcBtn, { borderColor: off ? T.border : color, backgroundColor: off ? 'transparent' : color + '1f' }]}
      onPress={() => askService(svc, action)} disabled={off || mine} accessibilityRole="button"
      accessibilityLabel={`${label} ${SVC_NAME[svc] ?? svc}`} accessibilityState={{ disabled: off || mine, busy: mine }}
    >
      {mine ? <ActivityIndicator size="small" color={color} /> : <Text style={[s.svcBtnText, { color: off ? T.textMuted : color }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

export function EnterpriseSystem() {
  const { state, loading, refresh } = useAxs();
  const [adminOpen, setAdminOpen] = useState(false);
  const [selfId, setSelfId] = useState('');
  useEffect(() => { AuthStorage.getCredentials().then((c) => setSelfId(c?.profileId ?? '')); }, []);
  // El estado del PC cambia rápido: al entrar a la pestaña se vuelve a medir
  useFocusEffect(useCallback(() => { if (cache && Date.now() - cache.at > 15_000) request(); }, []));
  const sys = state?.system;
  const srv = state?.server;
  const bar = (pct: number, color: string) => (
    <View style={s.barBg}><View style={[s.barFill, { width: `${Math.max(2, Math.min(100, pct))}%`, backgroundColor: color }]} /></View>
  );
  const level = (p: number) => (p > 85 ? T.red : p > 65 ? AMBER : T.green);
  return (
    <Screen eyebrow="AXS · PC" title="Sistema" refreshing={loading && !!state} onRefresh={refresh}>
      {/* Hestia como JARVIS · L0: su estado, la pausa, el equipo medido y los límites (solo Hestia) */}
      <HestiaControl />
      {!sys && <Status state={state} loading={loading} />}
      {sys && (
        <>
          <Card>
            <Text style={s.cardTitle}>{sys.host}</Text>
            <Text style={s.muted}>{sys.cpuModel} · {sys.cores} hilos</Text>
            <Text style={s.metric}>CPU {sys.cpuPct} %</Text>{bar(sys.cpuPct, level(sys.cpuPct))}
            <Text style={s.metric}>RAM {sys.ramUsedGb} de {sys.ramTotalGb} GB</Text>{bar((sys.ramUsedGb / sys.ramTotalGb) * 100, level((sys.ramUsedGb / sys.ramTotalGb) * 100))}
            {sys.disk && (<>
              <Text style={s.metric}>Disco: {sys.disk.freeGb} GB libres de {sys.disk.totalGb}</Text>
              {bar(100 - (sys.disk.freeGb / sys.disk.totalGb) * 100, level(100 - (sys.disk.freeGb / sys.disk.totalGb) * 100))}
            </>)}
            <Text style={s.muted}>PC encendido hace {sys.uptimeH} h · servidor de Eris hace {sys.serverUptimeH} h</Text>
          </Card>
          <SectionTitle>SERVICIOS DE ERIS</SectionTitle>
          <Card>
            {sys.services.map((x, i) => {
              const key = x.key ?? KEY_BY_PORT[x.port];
              const isServer = key === 'backend';
              return (
                <View key={x.port} style={[s.svc, i > 0 && s.svcSep]}>
                  <View style={s.row}>
                    <View style={[s.dot, { backgroundColor: x.up ? T.green : T.red }]} />
                    <Text style={[s.rowName, { flex: 1 }]}>{x.name}</Text>
                    <Text style={[s.rowMeta, { color: x.up ? T.green : T.red }]}>{x.up ? 'en línea' : 'detenido'} · {x.port}</Text>
                  </View>
                  {key && (
                    <View style={s.svcBtns}>
                      {/* El servidor solo se reinicia: detenido, la app no tendría con quién hablar para volver a iniciarlo */}
                      {!isServer && <SvcButton label="Iniciar" svc={key} action="iniciar" disabled={x.up} />}
                      {!isServer && <SvcButton label="Detener" svc={key} action="detener" disabled={!x.up} danger />}
                      <SvcButton label="Reiniciar" svc={key} action="reiniciar" disabled={!isServer && !x.up} />
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
          <Card>
            <Text style={s.cardTitle}>Chat completo</Text>
            <Text style={s.muted}>Modelo, dictado y voz juntos. Detenido, libera RAM y GPU y la app sigue registrando (solo registro).</Text>
            <View style={s.svcBtns}>
              <SvcButton label="Iniciar todo" svc="chat" action="iniciar" disabled={sys.services.filter((x) => (x.key ?? KEY_BY_PORT[x.port]) !== 'backend').every((x) => x.up)} />
              <SvcButton label="Detener todo" svc="chat" action="detener" disabled={sys.services.filter((x) => (x.key ?? KEY_BY_PORT[x.port]) !== 'backend').every((x) => !x.up)} danger />
            </View>
          </Card>
          {svcMsg && <Text style={[s.svcMsg, { color: svcMsg.ok ? T.green : T.red }]}>{svcMsg.text}</Text>}
          {srv && (
            <>
              <SectionTitle>SEGURIDAD</SectionTitle>
              <Card>
                <Text style={s.li}>Conexiones abiertas: {srv.connections}</Text>
                <Text style={s.li}>Aprobaciones pendientes: {srv.pendingApprovals}</Text>
                {srv.integrity && <Text style={[s.li, { color: srv.integrity.ok ? T.green : T.red }]}>Bitácora: {srv.integrity.ok ? `íntegra (${srv.integrity.entries} entradas)` : '⚠ alterada'}</Text>}
              </Card>
            </>
          )}
        </>
      )}
      <TouchableOpacity style={s.primaryBtn} onPress={() => setAdminOpen(true)} accessibilityRole="button">
        <Text style={s.primaryText}>Panel de administración</Text>
        <Text style={s.primarySub}>Usuarios, roles, sesiones y actividad</Text>
      </TouchableOpacity>
      <AdminPanel visible={adminOpen} onClose={() => setAdminOpen(false)} selfId={selfId} />
    </Screen>
  );
}

// ─── Estilos ────────────────────────────────────────────────────
const md = {
  body: { color: T.text, fontSize: 14, lineHeight: 21 },
  heading1: { color: T.text, fontSize: 18, fontWeight: '800' as const, marginBottom: 6 },
  strong: { color: T.text, fontWeight: '700' as const },
  blockquote: { backgroundColor: 'rgba(59,130,246,0.08)', borderLeftColor: BLUE, borderLeftWidth: 3, paddingLeft: 10 },
  code_inline: { backgroundColor: 'rgba(59,130,246,0.12)', color: '#93c5fd', borderRadius: 4, paddingHorizontal: 4 },
  bullet_list_icon: { color: BLUE },
  paragraph: { marginTop: 0, marginBottom: 6 },
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  content: { paddingHorizontal: S.md, paddingBottom: 120 },
  eyebrow: { color: BLUE, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 4, textTransform: 'uppercase' },
  title: { color: T.text, fontSize: 24, fontWeight: '900', marginTop: 2, marginBottom: S.md },
  section: { color: T.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: S.md, marginBottom: S.xs },
  card: { backgroundColor: T.bgCard, borderRadius: R.lg, borderWidth: 1, borderColor: T.border, padding: S.md, marginBottom: S.sm },
  cardTitle: { color: T.text, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  li: { color: T.textLight, fontSize: 14, lineHeight: 21 },
  task: { color: T.textLight, fontSize: 13, lineHeight: 20, marginTop: 4 },
  muted: { color: T.textMuted, fontSize: 12, marginTop: 4 },
  errorText: { color: T.red, fontSize: 14, fontWeight: '700' },
  center: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.sm },
  kpi: { flexBasis: '47%', flexGrow: 1, backgroundColor: T.bgCard, borderRadius: R.lg, borderWidth: 1, borderColor: T.border, padding: S.md },
  kpiLabel: { color: T.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  kpiValue: { color: T.text, fontSize: 24, fontWeight: '900', marginTop: 4, fontVariant: ['tabular-nums'] },
  kpiSub: { color: T.textMuted, fontSize: 11, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  projRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border },
  rowName: { color: T.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  rowMeta: { color: T.textMuted, fontSize: 12, marginLeft: 'auto' },
  projMeta: { color: T.textMuted, fontSize: 12, marginTop: 2 },
  link: { color: BLUE, fontSize: 13, fontWeight: '700', marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: S.sm },
  chip: { borderRadius: R.full, borderWidth: 1, borderColor: T.border, backgroundColor: T.bgCard, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' },
  chipOn: { borderColor: BLUE, backgroundColor: 'rgba(59,130,246,0.15)' },
  chipText: { color: T.text, fontSize: 13, fontWeight: '700' },
  search: { backgroundColor: T.bgInput, borderRadius: R.md, borderWidth: 1, borderColor: T.border, color: T.text, paddingHorizontal: 14, minHeight: 44, marginBottom: S.sm },
  pill: { borderRadius: R.full, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '800' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  metric: { color: T.text, fontSize: 13, fontWeight: '700', marginTop: 10 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: T.bgInput, marginTop: 6, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  svc: { paddingVertical: 6 },
  svcSep: { borderTopWidth: 1, borderTopColor: T.border },
  svcBtns: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  svcBtn: { minHeight: 40, minWidth: 92, paddingHorizontal: 14, borderRadius: R.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  svcBtnText: { fontSize: 13, fontWeight: '800' },
  svcMsg: { fontSize: 13, fontWeight: '700', lineHeight: 19, marginBottom: S.sm },
  primaryBtn: { marginTop: S.md, minHeight: 50, borderRadius: R.md, borderWidth: 1, borderColor: BLUE, backgroundColor: 'rgba(59,130,246,0.15)', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  primaryText: { color: '#93c5fd', fontSize: 15, fontWeight: '800' },
  primarySub: { color: T.textMuted, fontSize: 12, marginTop: 2 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.bgCard, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, padding: S.md, paddingBottom: S.xl, borderWidth: 1, borderColor: T.border },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: S.sm },
  sheetTitle: { color: T.text, fontSize: 17, fontWeight: '900', flex: 1 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: T.textMuted, fontSize: 18 },
});

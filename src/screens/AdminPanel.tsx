import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Platform, ActivityIndicator, RefreshControl, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { wsManager } from '../services/WebSocketManager';
import { T, R, S } from '../config/design';

/**
 * Panel de administración (solo Ikaros). Muestra METADATOS de cada perfil —quién es, cuándo entró, cuántas sesiones,
 * cuánto pesa, qué acciones sensibles disparó—; nunca el contenido de sus chats, salud ni finanzas.
 * Todo lo que cambia algo pasa por el servidor, que vuelve a verificar que quien pide es Ikaros.
 */

interface Row {
  profileId: string;
  kind: 'google' | 'legacy';
  email?: string;
  name?: string;
  role: 'ikaros' | 'eris';
  lastLoginAt?: string;
  activeSessions: number;
  online: number;
  sizeBytes: number;
  lastActivityAt?: string;
  disabled?: boolean;
  stats: { tools: number; approved: number; denied: number; blocked: number; logins: number };
  /** Cómo cuenta en la beta (lo marcas tú): beta gratis, paga o equipo (no entra en las cifras). */
  grupo?: Grupo;
}
type Grupo = 'beta' | 'pagado' | 'equipo';
const GRUPOS: Array<{ id: Grupo; label: string }> = [{ id: 'beta', label: 'Beta' }, { id: 'pagado', label: 'Paga' }, { id: 'equipo', label: 'Equipo' }];

/** El informe de la medición de la beta (servidor: services/BetaReport.ts). Solo conteos, con alias. */
interface Ret { n: number; vuelven: number; pct: number | null }
interface Informe {
  hoy: string; personas: number; equipo: number; fuera: number; muestraChica: boolean;
  cohortes: Array<{ semana: string; altas: number; activadas: number; d1: Ret; d7: Ret; d30: Ret; s2: Ret; s5: Ret }>;
  total: { altas: number; activadas: number; d1: Ret; d7: Ret; d30: Ret; s2: Ret; s5: Ret };
  diasPorSemana: { comida: number | null; agua: number | null; sueno: number | null; entreno: number | null; activos: number | null; personas: number };
  primeraSemana: Record<string, number | null>;
  chat: { mensajes: number; mensajesPorDia: number | null; mensajesPorDiaActivo: number | null; porModelo: number | null; voz: number | null; segundosModeloPorRespuesta: number | null; respuestaP50s: number | null; respuestaP90s: number | null };
  pc: { dias: number; modeloSegundosDia: number | null; horaPunta: number | null; horaPuntaEs: number | null; esperaPromedioS: number | null; whisperSegundosDia: number | null; piperSegundosDia: number | null; personasActivasDia: number | null; personasPorPc: number | null };
  pagan: { pagados: number; elegibles35: number; pagados35: number; conversion35: number | null };
}
const pctTxt = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)} %`);
const numTxt = (x: number | null | undefined, u = '') => (x == null ? '—' : `${String(x).replace('.', ',')}${u}`);
const retTxt = (r: Ret) => (r.n ? `${pctTxt(r.pct)}` : '—');
const semanaTxt = (iso: string) => { const [, m, d] = iso.split('-'); return `${+d}/${+m}`; };
interface Overview {
  profiles: Row[];
  integrity: { ok: boolean; entries: number; brokenAt?: number };
  server: { uptimeSec: number; connections: number; pendingApprovals: number; legacyLogin: boolean };
  /** Módulos que esperan tu visto bueno (apagados = nadie los ve ni los puede activar) */
  features?: { glucose: boolean; rendimiento?: boolean; finanzasAuto?: boolean };
}
interface Entry {
  ts: string; event: string; profileId: string; role?: string; tool?: string; decision?: string;
  detail?: string; ok?: boolean; error?: string; ip?: string;
}

type Tab = 'users' | 'beta' | 'activity';
type Filter = 'all' | 'tools' | 'access' | 'admin';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Todo' }, { id: 'tools', label: 'Acciones' }, { id: 'access', label: 'Accesos' }, { id: 'admin', label: 'Admin y alertas' },
];
const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

const ago = (iso?: string) => {
  if (!iso) return 'nunca';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'hace un momento';
  if (s < 5400) return `hace ${Math.round(s / 60)} min`;
  if (s < 129600) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} días`;
};
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const clock = (iso: string) => {
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const uptime = (sec: number) => (sec > 86400 ? `${Math.floor(sec / 86400)} d ${Math.floor((sec % 86400) / 3600)} h` : sec > 3600 ? `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min` : `${Math.max(1, Math.round(sec / 60))} min`);

/** Cómo se lee cada decisión de la bitácora: texto y color (rojo = algo fue frenado). */
function describe(e: Entry): { text: string; color: string } {
  if (e.event === 'tool') {
    const name = e.tool || 'herramienta';
    switch (e.decision) {
      case 'approved': return { text: `${name} · aprobada${e.ok === false ? ' (falló)' : ''}`, color: T.green };
      case 'auto': return { text: `${name} · ejecutada`, color: T.textLight };
      case 'denied': return { text: `${name} · rechazada por ti`, color: T.gold };
      case 'timeout': return { text: `${name} · sin respuesta`, color: T.gold };
      case 'no_channel': return { text: `${name} · app sin aprobaciones`, color: T.red };
      case 'blocked_taint': return { text: `${name} · bloqueada (texto externo)`, color: T.red };
      case 'blocked_policy': return { text: `${name} · bloqueada por política`, color: T.red };
      case 'too_many': return { text: `${name} · demasiados pedidos`, color: T.red };
      default: return { text: name, color: T.textLight };
    }
  }
  if (e.event === 'login') return { text: `Inició sesión${e.detail ? ` (${e.detail})` : ''}`, color: T.accent };
  if (e.event === 'login_failed') return { text: `Acceso fallido${e.detail ? ` · ${e.detail}` : ''}`, color: T.red };
  if (e.event === 'logout') return { text: 'Cerró sesión', color: T.textMuted };
  if (e.event === 'security') return { text: 'Alerta de seguridad', color: T.red };
  if (e.event === 'admin') return { text: 'Administración', color: T.purple };
  return { text: e.event, color: T.textLight };
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiSub}>{sub}</Text>
    </View>
  );
}

export function AdminPanel({ visible, onClose, selfId }: { visible: boolean; onClose: () => void; selfId: string }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('users');
  const [filter, setFilter] = useState<Filter>('all');
  const [ov, setOv] = useState<Overview | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const [informe, setInforme] = useState<Informe | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterRef = useRef<Filter>('all');
  filterRef.current = filter;

  const loadOverview = useCallback(() => wsManager.sendMessage({ type: 'admin_overview' }), []);
  const loadAudit = useCallback((f: Filter) => wsManager.sendMessage({ type: 'admin_audit', filter: f, limit: 120 }), []);

  useEffect(() => {
    if (!visible) return;
    const unsub = wsManager.subscribeMessage((d) => {
      if (d.type === 'admin_overview') { setOv(d); setBusy(false); }
      else if (d.type === 'admin_beta_report') { setInforme(d.informe ?? null); setBusy(false); }
      else if (d.type === 'admin_audit') { if (d.filter === filterRef.current) setEntries(d.entries); }
      else if (d.type === 'admin_result') {
        setBusy(false);
        setNote({ ok: !!d.ok, text: String(d.message || '') });
        if (noteTimer.current) clearTimeout(noteTimer.current);
        noteTimer.current = setTimeout(() => setNote(null), 5000);
        loadAudit(filterRef.current);
      }
    });
    setBusy(true);
    loadOverview();
    loadAudit(filterRef.current);
    return () => { unsub(); if (noteTimer.current) clearTimeout(noteTimer.current); };
  }, [visible, loadOverview, loadAudit]);

  const pickFilter = (f: Filter) => { setFilter(f); filterRef.current = f; setEntries(null); loadAudit(f); };
  const loadInforme = useCallback(() => wsManager.sendMessage({ type: 'admin_beta_report' }), []);
  const refresh = () => { setBusy(true); loadOverview(); loadAudit(filterRef.current); if (tab === 'beta') loadInforme(); };
  const pickTab = (t: Tab) => { setTab(t); if (t === 'beta') { setBusy(true); loadInforme(); } };

  const act = (msg: object, title: string, body: string, confirmLabel: string, destructive = false) => {
    Alert.alert(title, body, [
      { text: 'Cancelar', style: 'cancel' },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => { setBusy(true); wsManager.sendMessage(msg); } },
    ]);
  };

  const google = (ov?.profiles || []).filter((p) => p.kind === 'google');
  const legacy = (ov?.profiles || []).filter((p) => p.kind === 'legacy');

  const renderUser = (p: Row) => {
    const self = p.profileId === selfId;
    const label = p.name || p.profileId;
    return (
      <View key={p.profileId} style={[s.card, p.disabled && { borderColor: 'rgba(244,63,94,0.4)' }]}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>{label}{self ? '  ·  tú' : ''}</Text>
            <Text style={s.sub} numberOfLines={1}>{p.email || p.profileId}{p.name ? `  ·  @${p.profileId}` : ''}</Text>
          </View>
          <View style={[s.badge, p.role === 'ikaros' ? s.badgeIkaros : s.badgeEris]}>
            <Text style={[s.badgeText, { color: p.role === 'ikaros' ? T.purple : T.textLight }]}>{p.role === 'ikaros' ? 'IKAROS' : 'ERIS'}</Text>
          </View>
        </View>

        <View style={s.chips}>
          {p.online > 0 && <View style={[s.chip, { backgroundColor: T.greenGlow }]}><Text style={[s.chipText, { color: T.green }]}>● En línea</Text></View>}
          {p.disabled && <View style={[s.chip, { backgroundColor: T.redGlow }]}><Text style={[s.chipText, { color: T.red }]}>Suspendido</Text></View>}
        </View>

        <Text style={s.meta}>
          Último ingreso {ago(p.lastLoginAt)}  ·  {p.activeSessions} {p.activeSessions === 1 ? 'sesión' : 'sesiones'}  ·  {size(p.sizeBytes)} de datos
        </Text>
        {p.role !== 'ikaros' && (
          <View style={s.grupoRow}>
            <Text style={s.grupoLabel}>En la beta</Text>
            {GRUPOS.map((g) => {
              const on = (p.grupo ?? 'beta') === g.id;
              return (
                <TouchableOpacity key={g.id} style={[s.filter, on && s.filterOn, { minHeight: 32 }]} disabled={on}
                  onPress={() => act({ type: 'admin_set_grupo', profileId: p.profileId, grupo: g.id },
                    g.id === 'pagado' ? `${label} paga` : g.id === 'equipo' ? `${label} es del equipo` : `${label} en la beta gratis`,
                    g.id === 'pagado' ? 'Cuenta como persona que paga desde hoy, para la conversión de la beta. No cobra nada: el cobro va aparte.'
                      : g.id === 'equipo' ? 'No entra en las cifras de la beta (activación, retención, conversión). Su uso del PC sí se cuenta.'
                        : 'Cuenta como una persona más de la beta, sin pagar.', 'Marcar')}>
                  <Text style={[s.filterText, on && { color: T.accent }]}>{g.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {(p.stats.tools > 0 || p.stats.blocked > 0) && (
          <Text style={s.meta}>
            Últimos 7 días: {p.stats.tools} {p.stats.tools === 1 ? 'acción' : 'acciones'} sensibles
            {p.stats.approved > 0 ? `, ${p.stats.approved} aprobadas` : ''}{p.stats.denied > 0 ? `, ${p.stats.denied} rechazadas` : ''}
            {p.stats.blocked > 0 ? `, ` : ''}{p.stats.blocked > 0 && <Text style={{ color: T.red }}>{p.stats.blocked} bloqueadas</Text>}
          </Text>
        )}

        {!self && (
          <View style={s.actions}>
            <TouchableOpacity
              style={s.actBtn}
              onPress={() =>
                p.role === 'ikaros'
                  ? act({ type: 'admin_set_role', profileId: p.profileId, role: 'eris' }, `Quitar Ikaros a ${label}`, 'Vuelve a ser usuario normal. Se desconecta y entra de nuevo con el rol nuevo.', 'Quitar')
                  : act({ type: 'admin_set_role', profileId: p.profileId, role: 'ikaros' }, `Dar Ikaros a ${label}`, 'Es un rol con acceso al sistema. Después te pediré una confirmación aparte.', 'Continuar')
              }>
              <Text style={s.actText}>{p.role === 'ikaros' ? 'Quitar Ikaros' : 'Dar Ikaros'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actBtn, p.activeSessions === 0 && s.actDisabled]}
              disabled={p.activeSessions === 0}
              onPress={() => act({ type: 'admin_revoke_sessions', profileId: p.profileId }, `Cerrar sesiones de ${label}`, `Se cierran sus ${p.activeSessions} sesión(es) y tendrá que volver a entrar con Google.`, 'Cerrar sesiones', true)}>
              <Text style={s.actText}>Cerrar sesiones</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actBtn, !p.disabled && s.actDanger]}
              onPress={() =>
                p.disabled
                  ? act({ type: 'admin_set_disabled', profileId: p.profileId, disabled: false }, `Reactivar a ${label}`, 'Podrá volver a iniciar sesión con Google.', 'Reactivar')
                  : act({ type: 'admin_set_disabled', profileId: p.profileId, disabled: true }, `Suspender a ${label}`, 'Se cierran sus sesiones y no podrá entrar hasta que lo reactives. Sus datos no se borran.', 'Suspender', true)
              }>
              <Text style={[s.actText, !p.disabled && { color: T.red }]}>{p.disabled ? 'Reactivar' : 'Suspender'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[s.root, { paddingTop: insets.top + 6 }]}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>AXS · SOLO IKAROS</Text>
            <Text style={s.h1}>Administración</Text>
          </View>
          <TouchableOpacity onPress={refresh} style={s.iconBtn} accessibilityLabel="Actualizar">
            {busy ? <ActivityIndicator color={T.accent} size="small" /> : <Text style={s.iconBtnText}>Actualizar</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={[s.iconBtn, { marginLeft: 8 }]} accessibilityLabel="Cerrar">
            <Text style={s.iconBtnText}>Cerrar</Text>
          </TouchableOpacity>
        </View>

        {ov && (
          <View style={[s.strip, { borderColor: ov.integrity.ok ? 'rgba(34,197,94,0.3)' : 'rgba(244,63,94,0.5)', backgroundColor: ov.integrity.ok ? T.greenGlow : T.redGlow }]}>
            <Text style={[s.stripText, { color: ov.integrity.ok ? T.green : T.red }]}>
              {ov.integrity.ok ? `Bitácora íntegra · ${ov.integrity.entries} registros` : `Bitácora ALTERADA (línea ${ov.integrity.brokenAt})`}
            </Text>
            <Text style={s.stripSub}>{ov.server.connections} conectados · servidor activo hace {uptime(ov.server.uptimeSec)}</Text>
          </View>
        )}

        {note && (
          <View style={[s.note, { borderColor: note.ok ? 'rgba(34,197,94,0.35)' : 'rgba(245,158,11,0.4)' }]}>
            <Text style={[s.noteText, { color: note.ok ? T.green : T.gold }]}>{note.text}</Text>
          </View>
        )}

        <View style={s.tabs}>
          {([['users', `Usuarios${ov ? ` (${google.length})` : ''}`], ['beta', 'Beta'], ['activity', 'Actividad']] as Array<[Tab, string]>).map(([id, label]) => (
            <TouchableOpacity key={id} style={[s.tab, tab === id && s.tabOn]} onPress={() => pickTab(id)}>
              <Text style={[s.tabText, tab === id && { color: T.accent }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          contentContainerStyle={{ padding: S.md, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={T.accent} />}>
          {tab === 'users' && (
            <>
              {!ov && <ActivityIndicator color={T.accent} style={{ marginTop: 40 }} />}
              {ov?.features && (
                <View style={s.card}>
                  <Text style={s.name}>Módulos con visto bueno</Text>
                  <Text style={s.sub}>Mientras estén apagados, nadie los ve ni los puede activar desde su teléfono.</Text>
                  <View style={s.featureRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.legacyName}>Glucosa</Text>
                      <Text style={s.sub}>{ov.features.glucose ? 'Activo: sensor, alertas y pestaña para quien lo active.' : 'En revisión: sin sensor, alertas ni pestaña.'}</Text>
                    </View>
                    <Switch
                      value={ov.features.glucose}
                      onValueChange={(on) => act(
                        { type: 'admin_set_feature', feature: 'glucose', enabled: on },
                        on ? 'Activar el módulo de glucosa' : 'Desactivar el módulo de glucosa',
                        on ? 'Todos podrán activar la pestaña de glucosa, conectar su sensor y recibir alertas.'
                          : 'Se corta la lectura del sensor y sus alertas para todos, y la pestaña desaparece.',
                        on ? 'Activar' : 'Desactivar', !on)}
                      trackColor={{ false: T.border, true: T.accentGlow }}
                      thumbColor={ov.features.glucose ? T.accent : T.textMuted}
                    />
                  </View>
                  <View style={s.featureRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.legacyName}>⚡ Modo Rendimiento</Text>
                      <Text style={s.sub}>{ov.features.rendimiento ? 'Activo: todos ven el camino del día exigente (café, siesta-café, bloques).' : 'En prueba: solo tu cuenta lo ve.'}</Text>
                    </View>
                    <Switch
                      value={!!ov.features.rendimiento}
                      onValueChange={(on) => act(
                        { type: 'admin_set_feature', feature: 'rendimiento', enabled: on },
                        on ? 'Activar el Modo Rendimiento' : 'Desactivar el Modo Rendimiento',
                        on ? 'Todos verán el 4.º camino «Rendimiento» (día exigente) en «¿Qué recomienda Eris?» y en el chat.'
                          : 'Solo tu cuenta seguirá viendo el camino del día exigente.',
                        on ? 'Activar' : 'Desactivar', !on)}
                      trackColor={{ false: T.border, true: T.accentGlow }}
                      thumbColor={ov.features.rendimiento ? T.accent : T.textMuted}
                    />
                  </View>
                  <View style={s.featureRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.legacyName}>🤖 Finanzas en automático</Text>
                      <Text style={s.sub}>{ov.features.finanzasAuto ? 'Activo: todos pueden dejar que Eris anote sola lo que avisa su banco.' : 'En prueba: solo tu cuenta lo ve.'}</Text>
                    </View>
                    <Switch
                      value={!!ov.features.finanzasAuto}
                      onValueChange={(on) => act(
                        { type: 'admin_set_feature', feature: 'finanzasAuto', enabled: on },
                        on ? 'Activar Finanzas en automático' : 'Desactivar Finanzas en automático',
                        on ? 'Todos verán «¿Que Eris anote sola?» en Finanzas: las compras que avisa su banco se anotan solas.'
                          : 'Solo tu cuenta seguirá anotando sola los avisos del banco.',
                        on ? 'Activar' : 'Desactivar', !on)}
                      trackColor={{ false: T.border, true: T.accentGlow }}
                      thumbColor={ov.features.finanzasAuto ? T.accent : T.textMuted}
                    />
                  </View>
                </View>
              )}
              {google.map(renderUser)}

              {legacy.length > 0 && (
                <>
                  <TouchableOpacity style={s.legacyHead} onPress={() => setShowLegacy((v) => !v)}>
                    <Text style={s.legacyTitle}>Perfiles anteriores sin vincular ({legacy.length})</Text>
                    <Text style={s.legacyChevron}>{showLegacy ? '−' : '+'}</Text>
                  </TouchableOpacity>
                  <Text style={s.legacyHint}>Se crearon con ID y PIN. Nadie puede entrar a ellos hasta que su dueño inicie con Google y los vincule con su PIN.</Text>
                  {showLegacy && legacy.map((p) => (
                    <View key={p.profileId} style={s.legacyRow}>
                      <Text style={s.legacyName}>{p.profileId}</Text>
                      <Text style={s.legacyMeta}>{size(p.sizeBytes)} · última actividad {ago(p.lastActivityAt)}</Text>
                    </View>
                  ))}
                </>
              )}
              <Text style={s.privacy}>Aquí ves quién es y cómo usa Eris, no lo que escribe: los chats, la salud y las finanzas de cada persona quedan cifrados y fuera del panel.</Text>
            </>
          )}

          {tab === 'beta' && (
            <>
              {!informe && <ActivityIndicator color={T.accent} style={{ marginTop: 40 }} />}
              {informe && (
                <>
                  <View style={s.card}>
                    <Text style={s.name}>{informe.personas} {informe.personas === 1 ? 'persona' : 'personas'} en la beta</Text>
                    <Text style={s.sub}>{informe.equipo} del equipo no cuentan · {informe.fuera} apagaron la medición</Text>
                    {informe.muestraChica && <Text style={[s.meta, { color: T.gold }]}>Con menos de 20 personas, cada porcentaje cambia mucho con una persona más: míralos como señales, no como cifras.</Text>}
                    <View style={s.kpis}>
                      <Kpi label="Se activaron" value={pctTxt(informe.total.altas ? informe.total.activadas / informe.total.altas : null)} sub={`${informe.total.activadas} de ${informe.total.altas}`} />
                      <Kpi label="Vuelven al día 7" value={retTxt(informe.total.d7)} sub={informe.total.d7.n ? `${informe.total.d7.vuelven} de ${informe.total.d7.n}` : 'nadie llega aún'} />
                      <Kpi label="Vuelven al día 30" value={retTxt(informe.total.d30)} sub={informe.total.d30.n ? `${informe.total.d30.vuelven} de ${informe.total.d30.n}` : 'nadie llega aún'} />
                      <Kpi label="Pagan (35 días)" value={pctTxt(informe.pagan.conversion35)} sub={`${informe.pagan.pagados} marcados`} />
                    </View>
                    <Text style={s.hint}>Activada: en sus primeras 48 horas anotó algo y usó la app al menos 3 veces.</Text>
                  </View>

                  {informe.cohortes.length > 0 && (
                    <View style={s.card}>
                      <Text style={s.legacyName}>Por semana de alta</Text>
                      <View style={[s.tRow, s.tHead]}>
                        {['Semana', 'Altas', 'Activ.', 'Día 1', 'Día 7', 'Día 30'].map((h) => <Text key={h} style={[s.tCell, s.tHeadText]}>{h}</Text>)}
                      </View>
                      {informe.cohortes.map((c) => (
                        <View key={c.semana} style={s.tRow}>
                          <Text style={s.tCell}>{semanaTxt(c.semana)}</Text>
                          <Text style={s.tCell}>{c.altas}</Text>
                          <Text style={s.tCell}>{c.activadas}</Text>
                          <Text style={s.tCell}>{retTxt(c.d1)}</Text>
                          <Text style={s.tCell}>{retTxt(c.d7)}</Text>
                          <Text style={s.tCell}>{retTxt(c.d30)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={s.card}>
                    <Text style={s.legacyName}>Qué hacen</Text>
                    <Text style={s.meta}>Días por semana (mediana de {informe.diasPorSemana.personas}): abren la app {numTxt(informe.diasPorSemana.activos)} · anotan comida {numTxt(informe.diasPorSemana.comida)} · agua {numTxt(informe.diasPorSemana.agua)} · sueño {numTxt(informe.diasPorSemana.sueno)} · entreno {numTxt(informe.diasPorSemana.entreno)}</Text>
                    <Text style={s.meta}>La primera semana usaron: chat {pctTxt(informe.primeraSemana.chat)} · voz {pctTxt(informe.primeraSemana.voz)} · comida {pctTxt(informe.primeraSemana.comida)} · agua {pctTxt(informe.primeraSemana.agua)} · sueño {pctTxt(informe.primeraSemana.sueno)} · entreno {pctTxt(informe.primeraSemana.entreno)} · Finanzas {pctTxt(informe.primeraSemana.finanzas)} · Inventario {pctTxt(informe.primeraSemana.inventario)} · plan de Eris {pctTxt(informe.primeraSemana.plan)}</Text>
                  </View>

                  <View style={s.card}>
                    <Text style={s.legacyName}>El chat (4 semanas)</Text>
                    <Text style={s.meta}>{informe.chat.mensajes} mensajes · {numTxt(informe.chat.mensajesPorDia)} por persona al día ({numTxt(informe.chat.mensajesPorDiaActivo)} los días que abren la app)</Text>
                    <Text style={s.meta}>Por el modelo {pctTxt(informe.chat.porModelo)} (el resto lo responde el código) · por voz {pctTxt(informe.chat.voz)} · {numTxt(informe.chat.segundosModeloPorRespuesta, ' s')} de modelo por respuesta</Text>
                    <Text style={s.meta}>Responde en {numTxt(informe.chat.respuestaP50s, ' s')} o menos la mitad de las veces, y en {numTxt(informe.chat.respuestaP90s, ' s')} o menos 9 de cada 10.</Text>
                  </View>

                  <View style={s.card}>
                    <Text style={s.legacyName}>El PC (14 días, todos)</Text>
                    <Text style={s.meta}>{numTxt(informe.pc.modeloSegundosDia, ' s')} de modelo al día · hora más cargada {informe.pc.horaPuntaEs != null ? `${informe.pc.horaPuntaEs}:00` : '—'} ({pctTxt(informe.pc.horaPunta)} del día) · espera en cola {numTxt(informe.pc.esperaPromedioS, ' s')}</Text>
                    <Text style={s.meta}>Whisper {numTxt(informe.pc.whisperSegundosDia, ' s')} al día · Piper {numTxt(informe.pc.piperSegundosDia, ' s')} al día · {numTxt(informe.pc.personasActivasDia)} personas activas al día</Text>
                    <Text style={[s.meta, { color: T.text }]}>Un PC aguantaría ~{numTxt(informe.pc.personasPorPc)} personas que usen Eris así (sin pasar de la mitad del PC en la hora punta).</Text>
                  </View>
                  <Text style={s.privacy}>Solo conteos con un alias por persona: cuántos días, cuántos mensajes, qué módulos y cuánto PC. Nunca lo que escriben, comen o gastan. Quien apaga «Ayudar a mejorar Eris» en su Perfil queda fuera y se borra lo contado.</Text>
                </>
              )}
            </>
          )}

          {tab === 'activity' && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: S.sm }}>
                {FILTERS.map((f) => (
                  <TouchableOpacity key={f.id} style={[s.filter, filter === f.id && s.filterOn]} onPress={() => pickFilter(f.id)}>
                    <Text style={[s.filterText, filter === f.id && { color: T.accent }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {entries === null && <ActivityIndicator color={T.accent} style={{ marginTop: 30 }} />}
              {entries !== null && entries.length === 0 && <Text style={s.empty}>Sin registros con este filtro.</Text>}
              {(entries || []).map((e, i) => {
                const d = describe(e);
                return (
                  <View key={`${e.ts}-${i}`} style={s.logRow}>
                    <View style={[s.logDot, { backgroundColor: d.color }]} />
                    <View style={{ flex: 1 }}>
                      <View style={s.logTop}>
                        <Text style={[s.logWhat, { color: d.color }]} numberOfLines={1}>{d.text}</Text>
                        <Text style={s.logTime}>{clock(e.ts)}</Text>
                      </View>
                      <Text style={s.logWho}>{e.profileId}{e.ip ? `  ·  ${e.ip.replace('::ffff:', '')}` : ''}</Text>
                      {!!e.detail && <Text style={s.logDetail} numberOfLines={2}>{e.detail}</Text>}
                      {!!e.error && e.decision !== 'denied' && <Text style={s.logErr} numberOfLines={2}>{e.error}</Text>}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingBottom: S.sm },
  eyebrow: { color: T.purple, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  h1: { color: T.text, fontSize: 24, fontWeight: '800', marginTop: 2 },
  iconBtn: { minHeight: 40, minWidth: 40, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: T.border, backgroundColor: T.bgCard, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { color: T.textLight, fontSize: 13, fontWeight: '700' },
  strip: { marginHorizontal: S.md, borderWidth: 1, borderRadius: R.md, paddingVertical: 8, paddingHorizontal: S.sm },
  stripText: { fontSize: 13, fontWeight: '700' },
  stripSub: { color: T.textMuted, fontSize: 12, marginTop: 1 },
  note: { marginHorizontal: S.md, marginTop: S.sm, borderWidth: 1, borderRadius: R.md, padding: S.sm, backgroundColor: T.bgCard },
  noteText: { fontSize: 13, fontWeight: '600' },
  tabs: { flexDirection: 'row', marginHorizontal: S.md, marginTop: S.sm, borderBottomWidth: 1, borderBottomColor: T.border },
  tab: { paddingVertical: 12, paddingHorizontal: S.md, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  tabOn: { borderBottomColor: T.accent },
  tabText: { color: T.textMuted, fontSize: 14, fontWeight: '700' },

  card: { backgroundColor: T.bgCard, borderRadius: R.lg, borderWidth: 1, borderColor: T.border, padding: S.md, marginBottom: S.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: S.sm },
  name: { color: T.text, fontSize: 17, fontWeight: '700' },
  sub: { color: T.textMuted, fontSize: 13, marginTop: 2 },
  badge: { borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  badgeIkaros: { borderColor: 'rgba(168,85,247,0.5)', backgroundColor: T.purpleGlow },
  badgeEris: { borderColor: T.border, backgroundColor: 'transparent' },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  chips: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  chip: { borderRadius: R.full, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 12, fontWeight: '700' },
  meta: { color: T.textLight, fontSize: 13, marginTop: 8, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, marginTop: S.sm + 2, flexWrap: 'wrap' },
  actBtn: { minHeight: 40, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: T.border, backgroundColor: T.bgElevated, justifyContent: 'center' },
  actDanger: { borderColor: 'rgba(244,63,94,0.35)' },
  actDisabled: { opacity: 0.35 },
  actText: { color: T.text, fontSize: 13, fontWeight: '700' },

  featureRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: S.sm },
  grupoRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: S.sm },
  grupoLabel: { color: T.textMuted, fontSize: 12, fontWeight: '700', marginRight: 2 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: S.sm },
  kpi: { flexBasis: '47%', flexGrow: 1, backgroundColor: T.bgElevated, borderRadius: R.md, borderWidth: 1, borderColor: T.border, padding: S.sm },
  kpiValue: { color: T.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  kpiLabel: { color: T.textLight, fontSize: 12, fontWeight: '700', marginTop: 2 },
  kpiSub: { color: T.textMuted, fontSize: 11, marginTop: 1 },
  hint: { color: T.textMuted, fontSize: 12, lineHeight: 17, marginTop: S.sm },
  tRow: { flexDirection: 'row', paddingVertical: 7, borderTopWidth: 1, borderTopColor: T.border },
  tHead: { borderTopWidth: 0, marginTop: 6 },
  tCell: { flex: 1, color: T.text, fontSize: 12, fontVariant: ['tabular-nums'] },
  tHeadText: { color: T.textMuted, fontWeight: '700' },
  legacyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: S.md, paddingVertical: 10 },
  legacyTitle: { color: T.textLight, fontSize: 14, fontWeight: '700' },
  legacyChevron: { color: T.textMuted, fontSize: 20, fontWeight: '700', paddingHorizontal: 8 },
  legacyHint: { color: T.textMuted, fontSize: 12, lineHeight: 17, marginBottom: S.sm },
  legacyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 8, borderTopWidth: 1, borderTopColor: T.border },
  legacyName: { color: T.text, fontSize: 14, fontWeight: '600' },
  legacyMeta: { color: T.textMuted, fontSize: 12 },
  privacy: { color: T.textMuted, fontSize: 12, lineHeight: 17, marginTop: S.lg },

  filter: { paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', borderRadius: R.full, borderWidth: 1, borderColor: T.border, marginRight: 8, backgroundColor: T.bgCard },
  filterOn: { borderColor: T.borderActive, backgroundColor: T.accentGlow },
  filterText: { color: T.textLight, fontSize: 13, fontWeight: '700' },
  empty: { color: T.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40 },
  logRow: { flexDirection: 'row', gap: S.sm, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border },
  logDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  logTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  logWhat: { flex: 1, fontSize: 14, fontWeight: '700' },
  logTime: { color: T.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  logWho: { color: T.textMuted, fontSize: 12, marginTop: 1 },
  logDetail: { color: T.textLight, fontSize: 12, marginTop: 4, fontFamily: MONO, lineHeight: 17 },
  logErr: { color: T.red, fontSize: 12, marginTop: 3 },
});

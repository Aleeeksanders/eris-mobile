// ============================================================
// Hestia como JARVIS · L0 (2026-11-17): el panel de control de Hestia, arriba de Sistema (Modo AXS · Empresa). Solo Hestia:
//  - su estado (activa / en pausa y por qué) y el botón grande de pausar o reanudar (Eris sigue igual para todos);
//  - el equipo medido: CPU, RAM, disco, tarjeta de video (uso, memoria, temperatura) y batería, cada uno con su curva de 24 h,
//    el límite marcado y su color (verde, ámbar, rojo);
//  - el modelo cargado y lo que más RAM usa;
//  - los límites (aviso y acción) que el vigía del servidor revisa cada minuto (eris/src/services/hestia/Vigia.ts).
// Los datos los manda el servidor (admin_hestia_estado), que mide con nvidia-smi, Ollama y WMI: nada estimado.
// L1 (2026-11-17): «Presencia y voz»: si estás en casa y con audífonos (lo manda el teléfono), qué puede decirte en voz alta sola
// (bienvenida, saludo de la mañana, alertas del equipo) y por dónde llegó cada aviso.
// L6 (2026-11-18): en «Presencia y voz», «En la llamada, solo tu voz» (lo que dice otra voz no se toma; Hestia Manos revisa cada
// frase) y cómo fue la última llamada.
// L5 (2026-11-18): «Protocolos»: las escenas con nombre (gimnasio, dormir, foco, salir, casa y las tuyas), el que está corriendo
// con su botón para terminarlo, y activar, borrar o restaurar con un toque (crearlos es por voz o en el chat).
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Switch, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Polyline, Line } from 'react-native-svg';
import { T, R, S } from '../config/design';
import { wsManager } from '../services/WebSocketManager';

const H = '#F59E0B'; // el color de Hestia (brasa)
const AMBAR = '#f59e0b';

type Clave = 'ramLibreGb' | 'discoLibreGb' | 'gpuTempC' | 'vramGb' | 'cpuPct' | 'bateriaPct';
type Accion = 'solo_aviso' | 'pausar_fondo' | 'pausar_hestia' | 'sin_archivos';
interface Limite { aviso: number | null; accion: number | null; que: Accion }
type Limites = Record<Clave, Limite>;
interface Pausa { desde: string; hasta: string | null; motivo: string; por: string }
interface Medicion {
  t: string; cpuPct: number; ramLibreGb: number; ramTotalGb: number; discoLibreGb: number | null; discoTotalGb: number | null;
  gpu: { nombre: string; usoPct: number; vramUsadaGb: number; vramTotalGb: number; tempC: number; potenciaW: number | null } | null;
  modelo: { nombre: string; tamanoGb: number; enGpuGb: number; vence: string | null } | null;
  bateria: { pct: number; enchufado: boolean } | null;
}
interface Punto { t: string; cpuPct: number; ramLibreGb: number; discoLibreGb: number | null; gpuTempC: number | null; gpuUsoPct: number | null; vramGb: number | null }
type TipoHablar = 'bienvenida' | 'saludo' | 'equipo' | 'llamadas' | 'mensajes' | 'cargos' | 'agenda' | 'trabajos' | 'protocolos';
const HABLAR_DEF: Record<TipoHablar, boolean> = { bienvenida: true, saludo: true, equipo: true, llamadas: true, mensajes: true, cargos: true, agenda: true, trabajos: true, protocolos: true };
/** L5: un protocolo como lo manda el servidor (sus pasos ya dichos) y el que está corriendo */
interface ProtocoloItem { nombre: string; titulo: string; pasos: string[]; propio: boolean; base: boolean; hablar: 'todo' | 'urgente' | 'nada'; duracionMin: number | null }
interface ProtocoloActivo { nombre: string; titulo: string; desde: string; hasta: string | null; hablar: 'todo' | 'urgente' | 'nada'; dnd: boolean }
/** L4: un trabajo de fondo (lo que manda el servidor: sin los datos de la web) */
interface TrabajoFondo { id: string; tipo: string; tema: string; b?: string; estado: 'pendiente' | 'corriendo' | 'listo' | 'fallo' | 'cancelado'; paso?: string; progreso: number; creado: string; actualizado: string; corto?: string; error?: string }
interface Presencia { enCasa: boolean | null; desde: string | null; fueraDesde: string | null; ultimaBienvenida: string | null }
interface SensoresTel { audifonos: boolean; audifonosNombre?: string | null; enCasa: boolean | null; noMolestar: boolean; llamadaTel: boolean; dirigido: boolean; t: number;
  sonando?: boolean; enCurso?: boolean; bloqueado?: boolean }
interface Datos {
  estado: { pausa: Pausa | null; limites: Limites; fondoPausado: string | null; sinArchivos: string | null; iniciales: Limites;
    hablar?: Record<TipoHablar, boolean>; presencia?: Presencia; importantes?: string[];
    /** L6: solo tu voz en la llamada, y las frases de la última (ya contadas en `texto`) */
    voz?: { soloTuya: boolean; ultima: { t: string; texto: string } | null } };
  medicion: Medicion | null; procesos: Array<{ nombre: string; ramMb: number }>; historial: Punto[];
  sensores?: SensoresTel | null; avisos?: Array<{ clave: string; t: number; via: string }>;
  trabajos?: TrabajoFondo[]; fondo?: { ok: boolean; motivo: string } | null;
  protocolos?: { lista: ProtocoloItem[]; activo: ProtocoloActivo | null };
  /** lo que pasó con lo último que se tocó en el panel (activar o terminar un protocolo) */
  respuesta?: string;
}
const HABLAR: Array<{ id: TipoHablar; label: string; sub: string }> = [
  { id: 'bienvenida', label: 'Bienvenida a casa', sub: 'Al volver después de 1 h o más fuera: lo que te queda del día y quién te escribió.' },
  { id: 'saludo', label: 'Saludo de la mañana', sub: 'La primera vez que te pones los audífonos en la mañana (una vez al día).' },
  { id: 'equipo', label: 'Alertas del equipo', sub: 'Cuando el PC cruza un límite (también quedan escritas).' },
  { id: 'llamadas', label: 'Llamadas que entran', sub: '«Te llama Mamá» mientras suena. En la llamada con Hestia te pregunta si contesta.' },
  { id: 'mensajes', label: 'Mensajes de tus importantes', sub: 'Solo de quién (nunca el mensaje en voz alta), y solo de los contactos de abajo.' },
  { id: 'cargos', label: 'Cargos fuera de lo común', sub: '«¿Lo reconoces?» con botones. Con el teléfono bloqueado no dice el monto.' },
  { id: 'agenda', label: 'Reuniones y remedios', sub: 'Una reunión en 15 minutos y la hora de tus remedios o suplementos con aviso.' },
  { id: 'trabajos', label: 'Trabajos de fondo', sub: '«Terminé lo que me pediste» y los vigías del PC (también queda escrito en el chat «Trabajos de Hestia»).' },
  { id: 'protocolos', label: 'Fin de un protocolo', sub: '«Terminó tu bloque de foco» cuando acaba un protocolo con tiempo.' },
];
const VIA: Record<string, string> = { voz: '🔊 dicho', llamada: '📞 en la llamada', notificacion: '🔔 escrito', nada: '—' };
const NOMBRES: Array<[string, string]> = [['saludo-', 'Saludo de la mañana'], ['equipo-', 'Alerta del equipo'], ['llamada-', 'Llamada'], ['mensaje-', 'Mensaje'], ['cargo-', 'Cargo del banco'], ['reunion-', 'Reunión'], ['remedio-', 'Remedios'], ['trabajo-', 'Trabajo de fondo'], ['protocolo-', 'Fin de un protocolo']];
const nombreAviso = (c: string) => (c === 'bienvenida' ? 'Bienvenida a casa' : NOMBRES.find(([p]) => c.startsWith(p))?.[1] ?? c);

/** ¿Más es peor? (temperatura, memoria de la tarjeta, CPU) — igual que el vigía */
const SUBE_MAL: Record<Clave, boolean> = { ramLibreGb: false, discoLibreGb: false, gpuTempC: true, vramGb: true, cpuPct: true, bateriaPct: false };
const ETIQUETA: Record<Clave, string> = { ramLibreGb: 'RAM libre', discoLibreGb: 'Disco libre', gpuTempC: 'Temperatura de la tarjeta', vramGb: 'Memoria de la tarjeta', cpuPct: 'CPU (5 min seguidos)', bateriaPct: 'Batería sin cargador' };
const UNIDAD: Record<Clave, string> = { ramLibreGb: 'GB', discoLibreGb: 'GB', gpuTempC: '°C', vramGb: 'GB', cpuPct: '%', bateriaPct: '%' };
const PASO: Record<Clave, number> = { ramLibreGb: 0.5, discoLibreGb: 5, gpuTempC: 1, vramGb: 0.1, cpuPct: 5, bateriaPct: 5 };
const RANGO: Record<Clave, [number, number]> = { ramLibreGb: [0.5, 8], discoLibreGb: [5, 200], gpuTempC: [60, 95], vramGb: [3, 6], cpuPct: [50, 100], bateriaPct: [5, 50] };
const ACCIONES: Array<{ id: Accion; label: string }> = [
  { id: 'solo_aviso', label: 'Solo avisar' }, { id: 'pausar_fondo', label: 'Pausar lo de fondo' },
  { id: 'pausar_hestia', label: 'Pausar a Hestia' }, { id: 'sin_archivos', label: 'Sin archivos grandes' },
];
const coma = (n: number, d = 1) => n.toLocaleString('es-CL', { maximumFractionDigits: d });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

/** Verde, ámbar o rojo según los límites */
function color(k: Clave, v: number | null, L?: Limites): string {
  if (v == null || !L) return T.textMuted;
  const l = L[k];
  const pasa = (u: number | null) => u != null && (SUBE_MAL[k] ? v >= u : v <= u);
  if (l.que !== 'solo_aviso' && pasa(l.accion)) return T.red;
  if (pasa(l.aviso)) return AMBAR;
  return T.green;
}

/** La curva de 24 h, con el límite de aviso como línea punteada */
function Curva({ serie, limite, max, colorLinea }: { serie: Array<number | null>; limite?: number | null; max: number; colorLinea: string }) {
  const pts = serie.map((v, i) => (v == null ? null : `${i},${100 - Math.max(0, Math.min(100, (v / max) * 100))}`)).filter(Boolean) as string[];
  if (pts.length < 2) return <View style={st.curvaVacia}><Text style={st.mini}>La curva aparece en unos minutos</Text></View>;
  const n = Math.max(1, serie.length - 1);
  return (
    <Svg width="100%" height={34} viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" style={{ marginTop: 6 }}>
      {limite != null && <Line x1={0} x2={n} y1={100 - (limite / max) * 100} y2={100 - (limite / max) * 100} stroke={AMBAR} strokeWidth={1} strokeDasharray="3,3" vectorEffect="non-scaling-stroke" opacity={0.7} />}
      <Polyline points={pts.join(' ')} fill="none" stroke={colorLinea} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </Svg>
  );
}

function Medidor({ titulo, valor, sub, pct, c, serie, limite, max }: { titulo: string; valor: string; sub?: string; pct: number; c: string; serie: Array<number | null>; limite?: number | null; max: number }) {
  return (
    <View style={st.medidor} accessible accessibilityLabel={`${titulo}: ${valor}${sub ? `, ${sub}` : ''}`}>
      <View style={st.medCab}>
        <Text style={st.medTitulo}>{titulo}</Text>
        <Text style={[st.medValor, { color: c }]}>{valor}</Text>
      </View>
      {!!sub && <Text style={st.mini}>{sub}</Text>}
      <View style={st.barBg}><View style={[st.barFill, { width: `${Math.max(2, Math.min(100, pct))}%`, backgroundColor: c }]} /></View>
      <Curva serie={serie} limite={limite} max={max} colorLinea={c} />
    </View>
  );
}

export function HestiaControl() {
  const [d, setD] = useState<Datos | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [lim, setLim] = useState<Limites | null>(null);
  const [resp, setResp] = useState<string | null>(null);

  useEffect(() => {
    const off = wsManager.subscribeMessage((m: any) => {
      if (m?.type !== 'admin_hestia_estado') return;
      setD(m as Datos);
      setBusy(null);
      if (typeof m.respuesta === 'string') setResp(m.respuesta);
      // (mientras edita los límites, lo que llega no le pisa lo que está cambiando)
      setLim((x) => (editando && x ? x : (m.estado?.limites ?? null)));
    });
    return () => { off(); };
  }, [editando]);
  const pedir = useCallback(() => { if (wsManager.getStatus() === 'connected') wsManager.sendMessage({ type: 'admin_hestia_estado' }); }, []);
  // Al entrar y cada 30 s mientras está a la vista (el servidor mide cada minuto: barato)
  useFocusEffect(useCallback(() => { pedir(); const t = setInterval(pedir, 30_000); return () => clearInterval(t); }, [pedir]));

  const pausa = d?.estado.pausa ?? null;
  const m = d?.medicion ?? null;
  const L = d?.estado.limites;
  const h = d?.historial ?? [];

  const pausarAsk = () => {
    Alert.alert('Pausar a Hestia', 'Solo Hestia: Eris sigue igual para todos. Mientras, Hestia no usa el modelo; lo de siempre (la hora, las alarmas, la linterna) sigue.', [
      { text: '30 minutos', onPress: () => enviarPausa(30) },
      { text: '2 horas', onPress: () => enviarPausa(120) },
      { text: 'Hasta que la reanude', onPress: () => enviarPausa(null) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };
  const enviarPausa = (minutos: number | null) => { setBusy('pausa'); wsManager.sendMessage({ type: 'admin_hestia_pausa', accion: 'pausar', ...(minutos ? { minutos } : {}) }); };
  const reanudar = () => { setBusy('pausa'); wsManager.sendMessage({ type: 'admin_hestia_pausa', accion: 'reanudar' }); };
  const guardar = () => { if (!lim) return; setBusy('limites'); setEditando(false); wsManager.sendMessage({ type: 'admin_hestia_limites', limites: lim }); };
  const cambiarHablar = (k: TipoHablar, v: boolean) => {
    setD((x) => (x ? { ...x, estado: { ...x.estado, hablar: { ...HABLAR_DEF, ...(x.estado.hablar ?? {}), [k]: v } } } : x));
    wsManager.sendMessage({ type: 'admin_hestia_hablar', hablar: { [k]: v } });
  };
  // L6: «En la llamada, solo tu voz»
  const cambiarSoloTuya = (v: boolean) => {
    setD((x) => (x ? { ...x, estado: { ...x.estado, voz: { soloTuya: v, ultima: x.estado.voz?.ultima ?? null } } } : x));
    wsManager.sendMessage({ type: 'admin_hestia_voz', soloTuya: v });
  };
  // L2: de quién te avisa cuando te escriben (la lista entera; el servidor la limpia y la devuelve)
  const cambiarImportantes = (lista: string[]) => {
    setD((x) => (x ? { ...x, estado: { ...x.estado, importantes: lista } } : x));
    wsManager.sendMessage({ type: 'admin_hestia_importantes', importantes: lista });
  };

  const estadoTxt = useMemo(() => {
    if (!d) return null;
    if (pausa) return pausa.por === 'vigia' ? `En pausa sola: ${pausa.motivo}` : `En pausa${pausa.hasta ? ` hasta las ${hhmm(pausa.hasta)}` : ''} · ${pausa.motivo}`;
    const act = d.protocolos?.activo;
    if (act) return `Activa · protocolo ${act.titulo.toLowerCase()}${act.hasta ? ` hasta las ${hhmm(act.hasta)}` : ''}`;
    if (d.estado.fondoPausado) return `Activa · lo de fondo en espera (${d.estado.fondoPausado})`;
    return 'Activa · todos los sistemas en línea';
  }, [d, pausa]);

  if (!d) {
    return (
      <View style={[st.franja, { alignItems: 'center' }]}>
        <ActivityIndicator color={H} />
        <Text style={st.mini}>Midiendo el equipo…</Text>
      </View>
    );
  }

  const vram = m?.gpu ? (m.gpu.vramUsadaGb / m.gpu.vramTotalGb) * 100 : 0;
  return (
    <View>
      {/* La franja de Hestia: su estado y el botón grande */}
      <View style={[st.franja, { borderColor: pausa ? AMBAR : H + '55' }]}>
        <View style={st.franjaCab}>
          <View style={[st.punto, { backgroundColor: pausa ? AMBAR : T.green }]} />
          <Text style={st.hestia}>HESTIA</Text>
          <Text style={st.soloHestia}>solo Hestia · Eris sigue igual</Text>
        </View>
        <Text style={[st.estado, { color: pausa ? AMBAR : T.text }]}>{estadoTxt}</Text>
        {d.estado.sinArchivos && <Text style={[st.mini, { color: T.red }]}>Sin respaldos ni archivos grandes: {d.estado.sinArchivos}</Text>}
        <TouchableOpacity style={[st.botonGrande, pausa ? st.botonReanudar : st.botonPausar]} onPress={pausa ? reanudar : pausarAsk}
          disabled={busy === 'pausa'} accessibilityRole="button" accessibilityLabel={pausa ? 'Reanudar a Hestia' : 'Pausar a Hestia'}>
          {busy === 'pausa' ? <ActivityIndicator color={pausa ? T.bg : H} /> : <Text style={[st.botonGrandeTxt, { color: pausa ? T.bg : H }]}>{pausa ? '▶  Reanudar a Hestia' : '⏸  Pausar a Hestia'}</Text>}
        </TouchableOpacity>
        <Text style={st.mini}>También por voz: «Hestia, pausa», «Hestia, reanuda», «Hestia, estado de los sistemas».</Text>
      </View>

      {/* L1: presencia y voz */}
      <PresenciaVoz d={d} cambiar={cambiarHablar} cambiarImportantes={cambiarImportantes} cambiarSoloTuya={cambiarSoloTuya} />
      <Protocolos d={d} resp={resp} busy={busy}
        enviar={(accion, nombre) => { setBusy(`prot-${accion}-${nombre ?? ''}`); setResp(null); wsManager.sendMessage({ type: 'admin_hestia_protocolo', accion, ...(nombre ? { nombre } : {}) }); }} />
      <TrabajosFondo d={d} cancelar={(id) => { setBusy('trabajo'); wsManager.sendMessage({ type: 'admin_hestia_trabajo', cancelar: id }); }} />

      {/* El equipo */}
      {m && L && (
        <View style={st.grilla}>
          <Medidor titulo="CPU" valor={`${Math.round(m.cpuPct)} %`} pct={m.cpuPct} c={color('cpuPct', m.cpuPct, L)} serie={h.map((p) => p.cpuPct)} limite={L.cpuPct.aviso} max={100} />
          <Medidor titulo="RAM libre" valor={`${coma(m.ramLibreGb)} GB`} sub={`de ${coma(m.ramTotalGb)} GB`} pct={100 - (m.ramLibreGb / m.ramTotalGb) * 100}
            c={color('ramLibreGb', m.ramLibreGb, L)} serie={h.map((p) => p.ramLibreGb)} limite={L.ramLibreGb.aviso} max={m.ramTotalGb} />
          {m.discoLibreGb != null && m.discoTotalGb != null && (
            <Medidor titulo="Disco libre (C:)" valor={`${Math.round(m.discoLibreGb)} GB`} sub={`de ${Math.round(m.discoTotalGb)} GB · ${Math.round(100 - (m.discoLibreGb / m.discoTotalGb) * 100)} % usado`}
              pct={100 - (m.discoLibreGb / m.discoTotalGb) * 100} c={color('discoLibreGb', m.discoLibreGb, L)} serie={h.map((p) => p.discoLibreGb)} limite={L.discoLibreGb.aviso} max={Math.max(m.discoLibreGb * 2, (L.discoLibreGb.aviso ?? 20) * 2)} />
          )}
          {m.gpu && (<>
            <Medidor titulo="Tarjeta de video" valor={`${Math.round(m.gpu.tempC)} °C`} sub={`${Math.round(m.gpu.usoPct)} % de uso${m.gpu.potenciaW != null ? ` · ${coma(m.gpu.potenciaW, 0)} W` : ''}`}
              pct={(m.gpu.tempC / 100) * 100} c={color('gpuTempC', m.gpu.tempC, L)} serie={h.map((p) => p.gpuTempC)} limite={L.gpuTempC.aviso} max={100} />
            <Medidor titulo="Memoria de la tarjeta" valor={`${coma(m.gpu.vramUsadaGb)} / ${coma(m.gpu.vramTotalGb, 0)} GB`} pct={vram}
              c={color('vramGb', m.gpu.vramUsadaGb, L)} serie={h.map((p) => p.vramGb)} limite={L.vramGb.aviso} max={m.gpu.vramTotalGb} />
          </>)}
          {m.bateria && (
            <Medidor titulo="Batería del notebook" valor={`${Math.round(m.bateria.pct)} %`} sub={m.bateria.enchufado ? 'enchufado' : 'sin cargador'} pct={m.bateria.pct}
              c={m.bateria.enchufado ? T.green : color('bateriaPct', m.bateria.pct, L)} serie={[]} max={100} />
          )}
        </View>
      )}

      {/* El modelo y lo que más RAM usa */}
      {m && (
        <View style={st.card}>
          <Text style={st.cardTitulo}>El modelo</Text>
          <Text style={st.li}>{m.modelo ? `${m.modelo.nombre} · ${coma(m.modelo.tamanoGb)} GB (${coma(m.modelo.enGpuGb)} en la tarjeta)` : 'Descargado: la próxima respuesta tarda un poco más en partir.'}</Text>
          {d.procesos.length > 0 && (<>
            <Text style={[st.cardTitulo, { marginTop: S.sm }]}>Lo que más RAM usa</Text>
            {d.procesos.map((p) => (
              <View key={p.nombre} style={st.proc}>
                <Text style={st.procNombre}>{p.nombre}</Text>
                <Text style={st.procMb}>{p.ramMb >= 1024 ? `${coma(p.ramMb / 1024)} GB` : `${p.ramMb} MB`}</Text>
              </View>
            ))}
          </>)}
          <Text style={st.mini}>Medido {hhmm(m.t)} · se mide cada minuto</Text>
        </View>
      )}

      {/* Los límites */}
      {L && lim && (
        <View style={st.card}>
          <View style={st.franjaCab}>
            <Text style={[st.cardTitulo, { flex: 1, marginBottom: 0 }]}>Límites del equipo</Text>
            <TouchableOpacity onPress={() => (editando ? guardar() : setEditando(true))} accessibilityRole="button" style={st.enlace}>
              <Text style={st.enlaceTxt}>{busy === 'limites' ? 'Guardando…' : editando ? 'Guardar' : 'Editar'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={st.mini}>El aviso llega como «Hestia · equipo». La acción la hace Hestia sola y la deshace cuando el equipo se recupera.</Text>
          {(Object.keys(ETIQUETA) as Clave[]).map((k) => {
            const l = (editando ? lim : L)[k];
            const set = (p: Partial<Limite>) => setLim((x) => (x ? { ...x, [k]: { ...x[k], ...p } } : x));
            const paso = (campo: 'aviso' | 'accion', dir: 1 | -1) => {
              const base = l[campo] ?? l.aviso ?? RANGO[k][0];
              const v = Math.round((base + dir * PASO[k]) * 10) / 10;
              set({ [campo]: Math.max(RANGO[k][0], Math.min(RANGO[k][1], v)) } as Partial<Limite>);
            };
            const signo = SUBE_MAL[k] ? '>' : '<';
            return (
              <View key={k} style={st.limite}>
                <Text style={st.limNombre}>{ETIQUETA[k]}</Text>
                <View style={st.limFila}>
                  <Text style={st.limEtq}>Aviso {signo}</Text>
                  {editando && <Paso t="−" onPress={() => paso('aviso', -1)} />}
                  <Text style={st.limValor}>{l.aviso != null ? `${coma(l.aviso)} ${UNIDAD[k]}` : '—'}</Text>
                  {editando && <Paso t="+" onPress={() => paso('aviso', 1)} />}
                </View>
                {l.que !== 'solo_aviso' && (
                  <View style={st.limFila}>
                    <Text style={st.limEtq}>Acción {signo}</Text>
                    {editando && <Paso t="−" onPress={() => paso('accion', -1)} />}
                    <Text style={st.limValor}>{l.accion != null ? `${coma(l.accion)} ${UNIDAD[k]}` : '—'}</Text>
                    {editando && <Paso t="+" onPress={() => paso('accion', 1)} />}
                  </View>
                )}
                <TouchableOpacity disabled={!editando} accessibilityRole="button" accessibilityLabel={`Qué hace: ${ACCIONES.find((a) => a.id === l.que)?.label}`}
                  onPress={() => { const i = ACCIONES.findIndex((a) => a.id === l.que); const sig = ACCIONES[(i + 1) % ACCIONES.length].id; set({ que: sig, ...(sig !== 'solo_aviso' && l.accion == null ? { accion: l.aviso } : {}) }); }}
                  style={[st.accionChip, editando && { borderColor: H }]}>
                  <Text style={[st.accionTxt, editando && { color: H }]}>{ACCIONES.find((a) => a.id === l.que)?.label}{editando ? '  ↻' : ''}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          {editando && (
            <View style={st.limBotones}>
              <TouchableOpacity style={st.enlace} onPress={() => setLim(d.estado.iniciales)} accessibilityRole="button"><Text style={st.enlaceTxt}>Volver a los de fábrica</Text></TouchableOpacity>
              <TouchableOpacity style={st.enlace} onPress={() => { setEditando(false); setLim(L); }} accessibilityRole="button"><Text style={[st.enlaceTxt, { color: T.textMuted }]}>Cancelar</Text></TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const HABLA_T: Record<ProtocoloItem['hablar'], string> = { todo: 'Hestia te habla como siempre', urgente: 'Hestia solo te dice lo urgente', nada: 'Hestia no te habla' };

/** L5: las escenas con nombre. Activar hace los pasos de verdad en tu teléfono (Hestia Manos); crearlos es por voz o en el chat. */
function Protocolos({ d, resp, busy, enviar }: { d: Datos; resp: string | null; busy: string | null; enviar: (accion: 'activar' | 'terminar' | 'borrar', nombre?: string) => void }) {
  const P = d.protocolos;
  if (!P) return null;
  const act = P.activo;
  const borrar = (p: ProtocoloItem) => Alert.alert(p.base ? `Restaurar «${p.titulo}»` : `Borrar «${p.titulo}»`,
    p.base ? 'Vuelve a ser el que venía hecho.' : 'Lo creaste tú: se borra (lo puedes volver a crear por voz).', [
      { text: 'Cancelar', style: 'cancel' },
      { text: p.base ? 'Restaurar' : 'Borrar', style: 'destructive', onPress: () => enviar('borrar', p.nombre) },
    ]);
  return (
    <View style={st.card}>
      <Text style={st.cardTitulo}>Protocolos</Text>
      <Text style={st.mini}>Escenas con nombre. Por voz o en el chat: «Hestia, protocolo gimnasio». Para crear los tuyos: «crea un protocolo lectura que ponga no molestar por una hora y baje el volumen» (te repite los pasos y confirmas). Mandar mensajes o llamar nunca va en un protocolo.</Text>
      {act && (
        <View style={st.protoActivo} accessible accessibilityLabel={`Activo: ${act.titulo}${act.hasta ? `, hasta las ${hhmm(act.hasta)}` : ''}`}>
          <View style={[st.punto, { backgroundColor: H }]} />
          <View style={{ flex: 1 }}>
            <Text style={st.limNombre}>{act.titulo}{act.hasta ? ` · hasta las ${hhmm(act.hasta)}` : ''}</Text>
            <Text style={st.mini}>{HABLA_T[act.hablar]}{act.dnd ? ' · No molestar puesto por Hestia' : ''}</Text>
          </View>
          <TouchableOpacity style={st.cancelarBtn} onPress={() => enviar('terminar')} disabled={busy === 'prot-terminar-'} accessibilityRole="button" accessibilityLabel={`Terminar ${act.titulo}`}>
            {busy === 'prot-terminar-' ? <ActivityIndicator color={H} /> : <Text style={st.cancelarTxt}>Terminar</Text>}
          </TouchableOpacity>
        </View>
      )}
      {!!resp && <Text style={st.protoResp} accessibilityLiveRegion="polite">{resp}</Text>}
      {P.lista.map((p) => {
        const activo = act?.nombre === p.nombre;
        const cargando = busy === `prot-activar-${p.nombre}`;
        return (
          <View key={p.nombre} style={st.trabajo}>
            <View style={{ flex: 1 }}>
              <View style={st.franjaCab}>
                <Text style={st.limNombre}>{p.titulo}</Text>
                {p.propio && <Text style={st.protoTag}>{p.base ? 'tu versión' : 'tuyo'}</Text>}
              </View>
              <Text style={st.mini}>{p.pasos.join(' · ')}</Text>
              {p.propio && (
                <TouchableOpacity onPress={() => borrar(p)} accessibilityRole="button" style={st.enlace}>
                  <Text style={[st.enlaceTxt, { color: T.textMuted }]}>{p.base ? 'Volver al de siempre' : 'Borrar'}</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={[st.cancelarBtn, !activo && { borderColor: H }]} onPress={() => enviar('activar', p.nombre)} disabled={activo || cargando}
              accessibilityRole="button" accessibilityLabel={activo ? `${p.titulo}: activo` : `Activar ${p.titulo}`}>
              {cargando ? <ActivityIndicator color={H} /> : <Text style={[st.cancelarTxt, !activo && { color: H }]}>{activo ? 'Activo' : 'Activar'}</Text>}
            </TouchableOpacity>
          </View>
        );
      })}
      <Text style={[st.mini, { marginTop: 4 }]}>El No molestar necesita Hestia Manos 0.10.0; lo quita sola al terminar.</Text>
    </View>
  );
}

const ESTADO_T: Record<TrabajoFondo['estado'], string> = { pendiente: 'En cola', corriendo: 'Trabajando', listo: 'Listo', fallo: 'No pudo', cancelado: 'Cancelado' };
const QUE_T = (t: TrabajoFondo) => (t.tipo === 'comparar' ? `Comparar ${t.tema} con ${t.b}` : t.tipo === 'resumen_boveda' ? `Resumen de la bóveda: ${t.tema}`
  : t.tipo === 'vigia_proceso' ? (t.tema === 'compilar' ? 'Avisar cuando termine de compilar' : `Avisar cuando termine ${t.tema}`)
  : t.tipo === 'vigia_servicio' ? `Avisar si se cae ${t.tema}` : t.tipo === 'vigia_archivo' ? `Avisar cuando aparezca ${t.tema}` : `Investigar ${t.tema}`);

/** L4: lo que Hestia hace de fondo (cuando el PC está libre), con su avance y para cancelarlo */
function TrabajosFondo({ d, cancelar }: { d: Datos; cancelar: (id: string) => void }) {
  const xs = (d.trabajos ?? []).filter((t) => t.estado !== 'cancelado').slice().reverse().slice(0, 8);
  const vivos = xs.filter((t) => t.estado === 'pendiente' || t.estado === 'corriendo');
  return (
    <View style={st.card}>
      <Text style={st.cardTitulo}>Trabajos de fondo</Text>
      <Text style={st.mini}>
        {d.fondo ? (d.fondo.ok ? 'El PC está libre: puede trabajar ahora.' : `Espera: ${d.fondo.motivo}.`) : ''} Pídele por voz o en el chat «investiga tal cosa y me avisas», «compárame A con B» o «avísame cuando termine de compilar». El resultado llega al chat «Trabajos de Hestia».
      </Text>
      {!xs.length && <Text style={[st.mini, { marginTop: 6 }]}>Nada por ahora.</Text>}
      {xs.map((t) => (
        <View key={t.id} style={st.trabajo}>
          <View style={{ flex: 1 }}>
            <Text style={st.limNombre} numberOfLines={2}>{QUE_T(t)}</Text>
            <Text style={st.mini} numberOfLines={2}>
              {ESTADO_T[t.estado]}{t.estado === 'corriendo' || (t.estado === 'pendiente' && t.progreso > 0) ? ` · ${t.progreso} %` : ''}{t.paso ? ` · ${t.paso}` : ''}{t.estado === 'listo' && t.corto ? ` · ${t.corto}` : ''}{t.estado === 'fallo' && t.error ? ` · ${t.error}` : ''}
            </Text>
            {(t.estado === 'corriendo' || (t.estado === 'pendiente' && t.progreso > 0)) && (
              <View style={st.barra}><View style={[st.barraLlena, { width: `${Math.max(4, Math.min(100, t.progreso))}%` }]} /></View>
            )}
          </View>
          {(t.estado === 'pendiente' || t.estado === 'corriendo') && (
            <TouchableOpacity style={st.cancelarBtn} onPress={() => cancelar(t.id)} accessibilityRole="button" accessibilityLabel={`Cancelar: ${QUE_T(t)}`}>
              <Text style={st.cancelarTxt}>Cancelar</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
      {vivos.length > 1 && <Text style={[st.mini, { marginTop: 4 }]}>Uno a la vez, en orden.</Text>}
    </View>
  );
}

/** L1: dónde estás (según el teléfono), qué puede decirte en voz alta y por dónde llegó lo último */
function PresenciaVoz({ d, cambiar, cambiarImportantes, cambiarSoloTuya }: { d: Datos; cambiar: (k: TipoHablar, v: boolean) => void; cambiarImportantes: (l: string[]) => void; cambiarSoloTuya: (v: boolean) => void }) {
  const voz = d.estado.voz;
  const p = d.estado.presencia;
  const s = d.sensores && Date.now() - d.sensores.t < 30 * 60_000 ? d.sensores : null;
  const hablar = { ...HABLAR_DEF, ...(d.estado.hablar ?? {}) };
  const importantes = d.estado.importantes ?? [];
  const [nuevo, setNuevo] = useState('');
  const agregar = () => {
    const n = nuevo.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!n) return;
    setNuevo('');
    if (!importantes.some((x) => x.toLowerCase() === n.toLowerCase())) cambiarImportantes([...importantes, n]);
  };
  const donde = p?.enCasa == null ? 'Todavía no sé si estás en casa' : p.enCasa ? `En casa${p.desde ? ` desde las ${hhmm(p.desde)}` : ''}` : `Fuera${p.fueraDesde ? ` desde las ${hhmm(p.fueraDesde)}` : ''}`;
  const chips: string[] = [];
  if (!s) chips.push('El teléfono no ha mandado sus sensores');
  else {
    chips.push(s.audifonos ? `🎧 ${s.audifonosNombre || 'Audífonos'}` : 'Sin audífonos');
    if (s.noMolestar) chips.push('No molestar');
    if (s.sonando) chips.push('Sonando'); else if (s.enCurso ?? s.llamadaTel) chips.push('En una llamada');
    if (s.bloqueado === false) chips.push('Desbloqueado');
    if (s.dirigido) chips.push('Solo si digo Hestia');
  }
  const avisos = (d.avisos ?? []).slice(-5).reverse();
  return (
    <View style={st.card}>
      <Text style={st.cardTitulo}>Presencia y voz</Text>
      <Text style={st.donde}>{donde}</Text>
      <View style={st.chips}>{chips.map((c) => <Text key={c} style={st.chip}>{c}</Text>)}</View>
      <Text style={st.mini}>Solo habla sola con audífonos puestos. Nunca en «no molestar», en una llamada, en una reunión de tu calendario, de noche ni en «solo si digo Hestia»: ahí queda escrito.</Text>
      {HABLAR.map((h) => (
        <View key={h.id} style={st.hablar}>
          <View style={{ flex: 1 }}>
            <Text style={st.limNombre}>{h.label}</Text>
            <Text style={st.mini}>{h.sub}</Text>
          </View>
          <Switch value={hablar[h.id] !== false} onValueChange={(v) => cambiar(h.id, v)} trackColor={{ true: H, false: T.border }} thumbColor={T.text}
            accessibilityLabel={`${h.label}: ${hablar[h.id] !== false ? 'en voz alta' : 'solo escrito'}`} />
        </View>
      ))}
      {voz && (
        <View style={st.hablar}>
          <View style={{ flex: 1 }}>
            <Text style={st.limNombre}>En la llamada, solo tu voz</Text>
            <Text style={st.mini}>Hestia Manos revisa cada frase: lo que dice otra voz no lo tomo, y otra voz nunca aprueba nada. Con el teléfono bloqueado, «tu voz» vale frase por frase. Necesita Hestia Manos 0.11.0 y «Volver a aprender» una vez.</Text>
            {voz.ultima && <Text style={[st.mini, { color: T.textLight }]}>Última llamada ({new Date(voz.ultima.t).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} {hhmm(voz.ultima.t)}): {voz.ultima.texto}</Text>}
          </View>
          <Switch value={voz.soloTuya} onValueChange={cambiarSoloTuya} trackColor={{ true: H, false: T.border }} thumbColor={T.text}
            accessibilityLabel={`En la llamada, solo tu voz: ${voz.soloTuya ? 'encendido' : 'apagado'}`} />
        </View>
      )}
      <Text style={[st.cardTitulo, { marginTop: S.sm }]}>Contactos importantes</Text>
      <Text style={st.mini}>Cuando te escriben, Hestia te dice de quién. Escríbelos como aparecen en tus contactos (o el nombre del grupo). También por voz: «avísame cuando me escriba Mamá».</Text>
      <View style={st.chips}>
        {importantes.length === 0 && <Text style={st.mini}>Nadie todavía.</Text>}
        {importantes.map((n) => (
          <TouchableOpacity key={n} style={st.chipQuitar} onPress={() => cambiarImportantes(importantes.filter((x) => x !== n))}
            accessibilityRole="button" accessibilityLabel={`Quitar a ${n}`}>
            <Text style={st.chipQuitarTxt}>{n}  ✕</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={st.agregarFila}>
        <TextInput value={nuevo} onChangeText={setNuevo} placeholder="Mamá, Pedro, Familia…" placeholderTextColor={T.textMuted} style={st.agregarInput}
          maxLength={40} returnKeyType="done" onSubmitEditing={agregar} accessibilityLabel="Nombre del contacto importante" />
        <TouchableOpacity style={st.agregarBtn} onPress={agregar} accessibilityRole="button" accessibilityLabel="Agregar contacto importante">
          <Text style={st.agregarBtnTxt}>Agregar</Text>
        </TouchableOpacity>
      </View>
      {avisos.length > 0 && (<>
        <Text style={[st.cardTitulo, { marginTop: S.sm }]}>Lo último</Text>
        {avisos.map((a) => (
          <View key={`${a.clave}-${a.t}`} style={st.proc}>
            <Text style={st.procNombre}>{new Date(a.t).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · {nombreAviso(a.clave)}</Text>
            <Text style={st.procMb}>{VIA[a.via] ?? a.via}</Text>
          </View>
        ))}
      </>)}
    </View>
  );
}

const Paso = ({ t, onPress }: { t: string; onPress: () => void }) => (
  <TouchableOpacity style={st.paso} onPress={onPress} accessibilityRole="button" accessibilityLabel={t === '+' ? 'Subir' : 'Bajar'}><Text style={st.pasoTxt}>{t}</Text></TouchableOpacity>
);

const st = StyleSheet.create({
  trabajo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: T.border, marginTop: 6 },
  barra: { height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 6, overflow: 'hidden' },
  protoActivo: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: R.md, borderWidth: 1, borderColor: H + '66', backgroundColor: 'rgba(245,158,11,0.08)', padding: 10, marginTop: 8 },
  protoResp: { color: T.textLight, fontSize: 13, lineHeight: 19, marginTop: 8, borderLeftWidth: 2, borderLeftColor: H, paddingLeft: 10 },
  protoTag: { color: H, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, borderRadius: R.full, borderWidth: 1, borderColor: H + '66', paddingHorizontal: 8, paddingVertical: 1, overflow: 'hidden' },
  barraLlena: { height: 4, borderRadius: 2, backgroundColor: H },
  cancelarBtn: { minHeight: 40, borderRadius: R.md, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, justifyContent: 'center' },
  cancelarTxt: { color: T.textLight, fontWeight: '700', fontSize: 13 },
  chipQuitar: { borderRadius: 999, borderWidth: 1, borderColor: H + '66', paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  chipQuitarTxt: { color: T.text, fontSize: 13, fontWeight: '700' },
  agregarFila: { flexDirection: 'row', gap: 8, marginTop: 8 },
  agregarInput: { flex: 1, minHeight: 44, borderRadius: R.md, borderWidth: 1, borderColor: T.border, color: T.text, paddingHorizontal: 12, fontSize: 14 },
  agregarBtn: { minHeight: 44, borderRadius: R.md, borderWidth: 1, borderColor: H, paddingHorizontal: 16, justifyContent: 'center' },
  agregarBtnTxt: { color: H, fontWeight: '800', fontSize: 14 },
  franja: { backgroundColor: T.bgCard, borderRadius: R.lg, borderWidth: 1, borderColor: H + '55', padding: S.md, marginBottom: S.sm, gap: 6 },
  franjaCab: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  punto: { width: 9, height: 9, borderRadius: 5 },
  hestia: { color: H, fontSize: 12, fontWeight: '900', letterSpacing: 2.5 },
  soloHestia: { color: T.textMuted, fontSize: 11, marginLeft: 'auto' },
  estado: { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  botonGrande: { minHeight: 52, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', marginTop: 6, borderWidth: 1 },
  botonPausar: { borderColor: H, backgroundColor: 'rgba(245,158,11,0.10)' },
  botonReanudar: { borderColor: H, backgroundColor: H },
  botonGrandeTxt: { fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  mini: { color: T.textMuted, fontSize: 11, marginTop: 2, lineHeight: 16 },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.sm },
  medidor: { flexBasis: '47%', flexGrow: 1, backgroundColor: T.bgCard, borderRadius: R.lg, borderWidth: 1, borderColor: T.border, padding: 12 },
  medCab: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  medTitulo: { color: T.textLight, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, flexShrink: 1 },
  medValor: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  barBg: { height: 6, borderRadius: 3, backgroundColor: T.bgInput, marginTop: 8, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  curvaVacia: { height: 34, justifyContent: 'center' },
  card: { backgroundColor: T.bgCard, borderRadius: R.lg, borderWidth: 1, borderColor: T.border, padding: S.md, marginBottom: S.sm },
  cardTitulo: { color: T.text, fontSize: 14, fontWeight: '800', marginBottom: 6 },
  li: { color: T.textLight, fontSize: 13, lineHeight: 19 },
  proc: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  procNombre: { color: T.textLight, fontSize: 13 },
  procMb: { color: T.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  enlace: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 6 },
  enlaceTxt: { color: H, fontSize: 13, fontWeight: '800' },
  limite: { borderTopWidth: 1, borderTopColor: T.border, paddingVertical: 10, gap: 4, marginTop: 6 },
  limNombre: { color: T.text, fontSize: 13, fontWeight: '800' },
  limFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  limEtq: { color: T.textMuted, fontSize: 12, width: 72 },
  limValor: { color: T.text, fontSize: 14, fontWeight: '800', minWidth: 70, textAlign: 'center', fontVariant: ['tabular-nums'] },
  paso: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  pasoTxt: { color: T.text, fontSize: 18, fontWeight: '800' },
  accionChip: { alignSelf: 'flex-start', borderRadius: R.full, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 5, marginTop: 2 },
  accionTxt: { color: T.textLight, fontSize: 12, fontWeight: '700' },
  limBotones: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  donde: { color: T.text, fontSize: 15, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { color: T.textLight, fontSize: 12, fontWeight: '700', borderRadius: R.full, borderWidth: 1, borderColor: T.border, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  hablar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: T.border, paddingVertical: 10, marginTop: 6 },
});

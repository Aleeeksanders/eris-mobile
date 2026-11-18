// ============================================================
// Hestia por voz (J1, 2026-11-16): la llamada. Solo Hestia (Modo AXS Executive, rol ikaros): una conversación en tiempo real, no
// un dictado que termina en el chat. El teléfono reconoce lo que dices (en el aparato, sin internet) y manda cada frase; Hestia
// responde por trozos que suenan apenas están listos. Con audífonos (lo que eligió el usuario) la interrumpes hablando encima.
// Sin emojis en los botones: algunos Android no traen esos glifos y salen como cuadritos (ver SpeakerIcon en ChatScreen).
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking, Pressable, ScrollView, Platform, DeviceEventEmitter } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { parseActionChips } from '../utils/actionChips';
import { tablesToLists } from '../utils/chatFormat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { ErisMarkView, type MarkState } from '../../modules/eris-bubble/ErisMarkView';
import { ErisBubble } from '../../modules/eris-bubble';
import { setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wsManager } from '../services/WebSocketManager';
import { Escucha, prepararEscucha, type Preparacion } from '../services/voz/escucha';
import { Reproductor } from '../services/voz/reproductor';
import { HestiaManos, type VozDeFrase } from '../../modules/hestia-manos';
import { marcarLlamada } from '../services/voz/despertar';
import { ABRIR_ESCANER_EVENT } from '../services/notifTargets';
import { presenciaCambio } from '../services/hestia/presencia';
import { callarHestia } from '../services/hestia/altavoz';
import { COLGAR_HESTIA_EVENT } from '../services/hestia/avisos';

type Estado = 'preparando' | 'conectando' | 'escuchando' | 'pensando' | 'hablando' | 'problema';
const KEEP = 'hestia-llamada';
const palabras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** «Solo si digo Hestia»: se recuerda entre llamadas */
const CLAVE_DIRIGIDO = 'hestia_solo_si_la_nombran';
/** ¿La nombra? (como la escribe el reconocimiento: «Hestia», «Estia»; la misma cuenta que el servidor, voz/Dirigido.ts) */
const LA_NOMBRA = /\bh?estia\b/i;
const C = { fondo: '#07090D', panel: '#10141B', borde: '#1E2530', texto: '#F3F4F6', suave: '#9CA3AF', brasa: '#F59E0B', azul: '#7DD3FC', rojo: '#EF4444' };

/**
 * K3: `origen` = la abrió Hestia Manos (el botón del asistente, los ajustes rápidos, el atajo): sin el saludo del día, va directo a
 * escucharte. `bloqueado` = el teléfono estaba bloqueado y la llamada se ve sobre la pantalla de bloqueo: Hestia hace solo lo
 * seguro (lo decide el servidor) hasta que desbloquees; al colgar, Eris vuelve detrás del bloqueo.
 */
export default function HestiaLlamada({ visible, onClose, origen, bloqueado }: { visible: boolean; onClose: () => void; origen?: string; bloqueado?: boolean }) {
  const insets = useSafeAreaInsets();
  const [estado, setEstado] = useState<Estado>('preparando');
  const [problema, setProblema] = useState<Extract<Preparacion, { ok: false }> | null>(null);
  const [mio, setMio] = useState('');
  const [suyo, setSuyo] = useState('');
  const [audifonos, setAudifonos] = useState(true);
  const [silencio, setSilencio] = useState(false);
  /** «Solo si digo Hestia» (2026-11-17): lo que no la nombra ni se manda (salvo el «sí»/«no» a una pregunta suya) */
  const [dirigido, setDirigidoState] = useState(false);
  const dirigidoRef = useRef(false);
  const setDirigido = useCallback((v: boolean) => {
    dirigidoRef.current = v; setDirigidoState(v);
    AsyncStorage.setItem(CLAVE_DIRIGIDO, v ? '1' : '0').then(() => presenciaCambio()).catch(() => {});
  }, []);
  useEffect(() => { AsyncStorage.getItem(CLAVE_DIRIGIDO).then((v) => { if (v === '1') { dirigidoRef.current = true; setDirigidoState(true); } }).catch(() => {}); }, []);
  /** J2: lo largo (una agenda, un briefing) no se lee entero: queda escrito acá */
  const [detalle, setDetalle] = useState<string | null>(null);
  /** J2: una acción en el PC espera tu respuesta (voz = basta decir «sí»; si no, se toca la tarjeta) */
  const [aprobacion, setAprobacion] = useState<{ clase: 'voz' | 'tarjeta' | 'nunca_voz' } | null>(null);
  /** K3: la llamada corre sobre la pantalla de bloqueo (solo lo seguro hasta desbloquear) */
  const [bloq, setBloq] = useState(!!bloqueado);
  const bloqRef = useRef(!!bloqueado);
  const origenRef = useRef(origen);
  /** K5: abierta diciendo «Hestia» y Hestia Manos reconoció TU voz (con el teléfono bloqueado, un nivel más; lo decide el servidor) */
  const [tuVoz, setTuVoz] = useState(false);
  /**
   * L6: en la llamada, solo tu voz. Hestia Manos revisa el audio de cada frase (¿la dijiste tú?) y el resultado va con la frase;
   * el servidor decide (services/voz/VozFrase.ts): lo que dice otra voz no se toma y, bloqueado, «tu voz» vale frase por frase.
   */
  const vozFraseRef = useRef(false);
  const [vozFrase, setVozFrase] = useState(false);
  /** cómo sonó la última frase (lo que se ve bajo lo que dijiste) */
  const [vozUltima, setVozUltima] = useState<VozDeFrase['clase'] | null>(null);
  /** las frases se mandan en orden aunque revisar cada una tarde un poco */
  const colaFrases = useRef<Promise<void>>(Promise.resolve());
  /** Errores del micrófono que se repiten (antes se reintentaba en silencio y parecía que Hestia no escuchaba) */
  const erroresMic = useRef<{ codigo: string; n: number }>({ codigo: '', n: 0 });

  const turno = useRef(0);
  const aprobando = useRef(false);
  const pensando = useRef(false);
  const hablando = useRef(false);
  const audifonosRef = useRef(true);
  const silencioRef = useRef(false);
  const escucha = useRef<Escucha | null>(null);
  const reproductor = useRef<Reproductor | null>(null);
  audifonosRef.current = audifonos;
  silencioRef.current = silencio;

  /** La interrumpiste: lo que suena se calla y el servidor deja de generar ese turno */
  const interrumpir = useCallback(() => {
    if (!hablando.current && !pensando.current) return;
    reproductor.current?.callar(turno.current);
    pensando.current = false;
    wsManager.sendMessage({ type: 'voz_cortar' });
  }, []);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /** K3: desbloqueaste el teléfono: desde ahora Hestia puede todo (y lo que pediste bloqueado sigue solo, en el servidor) */
  const desbloqueado = useCallback(() => {
    if (!bloqRef.current) return;
    bloqRef.current = false;
    setBloq(false);
    wsManager.sendMessage({ type: 'voz_desbloqueado' });
  }, []);
  const pedirDesbloqueo = useCallback(() => { HestiaManos.pedirDesbloqueo().then((ok) => { if (ok) desbloqueado(); }); }, [desbloqueado]);

  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    // J3: «Colgar» desde la notificación de la llamada (con la pantalla apagada o desde otra app)
    const subColgar = ErisBubble.onCallHangup(() => onCloseRef.current());
    // K3: la llamada está abierta (Hestia Manos suelta el micrófono; App.tsx no esconde Eris del bloqueo) y el desbloqueo
    marcarLlamada(true);
    callarHestia(); // (L1: si estaba diciendo algo por los audífonos, ahora habla la llamada)
    HestiaManos.avisarLlamada('inicio');
    const subDesbloqueo = HestiaManos.onDesbloqueo(desbloqueado);
    if (bloqRef.current && !HestiaManos.bloqueado()) bloqRef.current = false; // se desbloqueó mientras abría
    setBloq(bloqRef.current);
    setEstado('preparando'); setProblema(null); setMio(''); setSuyo(''); setDetalle(null); setAprobacion(null); aprobando.current = false;
    activateKeepAwakeAsync(KEEP).catch(() => {});
    reproductor.current = new Reproductor((h, texto) => {
      hablando.current = h;
      if (!vivo) return;
      setEstado(h ? 'hablando' : pensando.current ? 'pensando' : 'escuchando');
      if (h && texto) setSuyo((s) => (s ? s : texto));
    });

    // L2: contestaste una llamada de teléfono (tocando la pantalla o «contesta»): la de Hestia se cuelga al tiro
    const porLlamada = DeviceEventEmitter.addListener(COLGAR_HESTIA_EVENT, () => { if (vivo) onCloseRef.current(); });
    const unsub = wsManager.subscribeMessage((m: any) => {
      if (!vivo || !m?.type?.startsWith?.('voz_')) return;
      switch (m.type) {
        case 'voz_lista': {
          setEstado('escuchando');
          break;
        }
        case 'voz_pensando':
          turno.current = Number(m.turno) || 0;
          pensando.current = true;
          setSuyo('');
          setDetalle(null);
          if (!hablando.current) setEstado('pensando');
          break;
        case 'voz_detalle':
          if (m.turno === turno.current && m.texto) setDetalle(String(m.texto));
          break;
        case 'voz_aprobacion':
          aprobando.current = m.estado === 'pendiente';
          setAprobacion(m.estado === 'pendiente' ? { clase: m.clase === 'voz' ? 'voz' : m.clase === 'nunca_voz' ? 'nunca_voz' : 'tarjeta' } : null);
          break;
        case 'voz_texto':
          if (m.turno === turno.current) setSuyo((s) => `${s}${s ? ' ' : ''}${String(m.texto ?? '')}`.trim());
          break;
        case 'voz_audio':
          reproductor.current?.agregar({ turno: Number(m.turno), seq: Number(m.seq), wav: String(m.wav ?? ''), texto: String(m.texto ?? '') });
          break;
        case 'voz_fin':
          if (m.turno === turno.current) { pensando.current = false; if (!hablando.current) setEstado('escuchando'); }
          break;
        case 'voz_escaner': {
          // «Hestia, escanea…» (2026-11-17): cuando termine de decir «Abriendo…», se cuelga y App abre la cámara que corresponde
          const que = String(m.que ?? '');
          const t0 = Date.now();
          const abrir = () => {
            if (!vivo) return;
            if (hablando.current && Date.now() - t0 < 6000) { setTimeout(abrir, 200); return; }
            onCloseRef.current();
            setTimeout(() => DeviceEventEmitter.emit(ABRIR_ESCANER_EVENT, que), 350);
          };
          setTimeout(abrir, 600);
          break;
        }
        case 'voz_cuelga': {
          // L1: «Hestia, eso es todo» → cuando termine de despedirse, se cuelga
          const t0 = Date.now();
          const colgar = () => {
            if (!vivo) return;
            if ((hablando.current || pensando.current) && Date.now() - t0 < 6000) { setTimeout(colgar, 200); return; }
            onCloseRef.current();
          };
          setTimeout(colgar, 500);
          break;
        }
        case 'voz_modo':
          // «Hestia, solo cuando te hable» / «escúchame siempre» (el servidor lo entendió y lo dice)
          setDirigido(m.dirigido === true);
          break;
        case 'voz_desbloquear':
          // K3: pediste algo personal con el teléfono bloqueado: Android muestra el desbloqueo (huella, cara o PIN: lo haces tú)
          pedirDesbloqueo();
          break;
        case 'voz_error':
          pensando.current = false;
          setSuyo(String(m.mensaje ?? 'Algo falló.'));
          if (!hablando.current) setEstado('escuchando');
          break;
        case 'voz_ignorada':
          // L6: era otra voz («solo tu voz», en el panel): no la tomó
          pensando.current = false;
          setMio(`(otra voz) ${String(m.texto ?? '')}`.trim());
          if (!hablando.current) setEstado('escuchando');
          break;
      }
    });

    (async () => {
      // L6: el audio de la llamada anterior, si quedó algo (se borra siempre: no sale del teléfono)
      HestiaManos.frasesLimpiar();
      vozFraseRef.current = false; setVozFrase(false); setVozUltima(null);
      const prep = await prepararEscucha();
      if (!vivo) return;
      if (!prep.ok) { setProblema(prep); setEstado('problema'); return; }
      setEstado('conectando');
      // J3: con el teléfono en el bolsillo o la pantalla apagada sigue escuchando (servicio de micrófono, que Android solo deja
      // partir con esta pantalla a la vista) y lo que dice Hestia sigue sonando (expo-audio pausa todo al salir, salvo esto)
      ErisBubble.startCall();
      // (la música de otras apps baja mientras Hestia habla y vuelve al terminar: reproductor.ts sostiene el pedido entre frases)
      setAudioModeAsync({ shouldPlayInBackground: true, playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
      escucha.current = new Escucha({
        parcial: (t) => {
          erroresMic.current.n = 0;
          if (silencioRef.current) return;
          // con parlante, lo que oye mientras Hestia habla es su propia voz: no cuenta
          if (!audifonosRef.current && hablando.current) return;
          setMio(t);
          // con audífonos, dos palabras tuyas encima de ella la interrumpen. Si está preguntando por una aprobación, solo se calla:
          // lo que digas es la respuesta y el turno sigue (cortarlo sería un «no»)
          // (con «solo si digo Hestia», otra persona hablando no la interrumpe)
          if (dirigidoRef.current && !aprobando.current && !LA_NOMBRA.test(t)) return;
          if (audifonosRef.current && (hablando.current || pensando.current) && palabras(t) >= 2) {
            if (aprobando.current) reproductor.current?.saltar(); else interrumpir();
          }
        },
        frase: (t, ms) => {
          if (silencioRef.current || !t.trim()) return;
          // «Solo si digo Hestia»: lo que no la nombra no era para ella (salvo responder a su pregunta)
          if (dirigidoRef.current && !aprobando.current && !LA_NOMBRA.test(t)) { setMio(`(no era para mí) ${t}`); return; }
          if (!audifonosRef.current && hablando.current) return;
          setMio(t);
          // L6: ¿la dijiste tú? (Hestia Manos revisa el audio de esta frase; si tarda más de 1,8 s, va sin revisar)
          const revisar = (): Promise<VozDeFrase | null> => (vozFraseRef.current && escucha.current?.grabando
            ? Promise.race([HestiaManos.vozDeFrase((ms || 3000) + 1500), new Promise<VozDeFrase>((r) => setTimeout(() => r({ clase: 'sin', motivo: 'lento' }), 1800))])
            : Promise.resolve(null));
          const pendiente = revisar();
          colaFrases.current = colaFrases.current.then(async () => {
            const v = await pendiente.catch(() => null);
            if (!vivo) return;
            if (v) setVozUltima(v.clase);
            const voz = v ? { clase: v.clase, ...(typeof v.puntaje === 'number' ? { puntaje: v.puntaje } : {}), ...(typeof v.ms === 'number' ? { ms: v.ms } : {}) } : undefined;
            if (aprobando.current) {
              // la respuesta a la pregunta (el servidor la interpreta: «sí», «no» o cambiaste de tema; otra voz no cuenta)
              reproductor.current?.saltar();
              wsManager.sendMessage({ type: 'voz_turno', texto: t, ...(voz ? { voz } : {}) });
              return;
            }
            // (otra voz no la interrumpe: el servidor decide si la toma)
            if (v?.clase !== 'otra' && (hablando.current || pensando.current)) interrumpir();
            pensando.current = true;
            setEstado('pensando');
            wsManager.sendMessage({ type: 'voz_turno', texto: t, ...(voz ? { voz } : {}) });
          }).catch(() => {});
        },
        error: (codigo, mensaje) => {
          if (codigo === 'start') { setSuyo(`No pude escucharte (${mensaje}).`); return; }
          // (2026-11-17, «no me responde»: el micrófono fallaba y la escucha reintentaba sin decir nada) — al tercer error igual
          // seguido, se dice cuál, con la causa más probable
          const e = erroresMic.current;
          e.n = e.codigo === codigo ? e.n + 1 : 1; e.codigo = codigo;
          if (e.n !== 3) return;
          const porque: Record<string, string> = {
            'audio-capture': 'el micrófono lo tiene otra app (¿Hestia Manos escuchando «Hestia»?)',
            busy: 'el reconocimiento de voz está ocupado con otra app',
            'service-not-allowed': 'Android no le da el micrófono a Eris',
            'language-not-supported': 'falta el español sin conexión',
            network: 'el reconocimiento sin conexión no respondió',
            client: 'el reconocimiento de voz se cayó',
          };
          setSuyo(`No te estoy oyendo: ${porque[codigo] ?? mensaje ?? codigo}. Pruebo de otra forma.`);
        },
        // (lo que pasa con el reconocimiento va al registro del servidor: se puede revisar sin el teléfono conectado)
        diag: (d) => wsManager.sendMessage({ type: 'voz_diag', android: Platform.Version, ...d }),
        rendida: (codigo, mensaje) => {
          setSuyo(`No logro usar el reconocimiento de voz de Android (${codigo}${mensaje ? `: ${mensaje}` : ''}). Mientras lo reviso, escríbele a Hestia en el chat.`);
        },
      });
      // K3: desde Hestia Manos, sin el saludo del día (la abriste para pedir algo); bloqueado, el servidor solo hace lo seguro
      // K5: bloqueado y abierta con la palabra: ¿eras tú? (Hestia Manos lo verificó al oír «Hestia»; se pregunta por el canal
      // firmado, nunca por el Intent que abrió la llamada)
      let conTuVoz = false;
      if (bloqRef.current && origenRef.current === 'palabra') {
        const r = await HestiaManos.pedir({ accion: 'tu_voz' });
        conTuVoz = r.ok && r.data?.tuVoz === true;
        if (!vivo) return;
        setTuVoz(conTuVoz);
      }
      // L6: ¿Hestia Manos ya aprendió cómo suenan tus frases? Entonces se guarda el audio mientras reconoce, para revisarlas
      if (HestiaManos.disponible()) {
        // (con tope: si Hestia Manos tarda, la llamada parte igual, sin revisar las frases)
        const e = await Promise.race([HestiaManos.pedir({ accion: 'estado' }), new Promise<{ ok: false; data?: any }>((r) => setTimeout(() => r({ ok: false }), 1500))]);
        if (!vivo) return;
        vozFraseRef.current = e.ok && e.data?.vozFrase === true;
        escucha.current.grabar = vozFraseRef.current;
        setVozFrase(vozFraseRef.current);
      }
      wsManager.sendMessage({ type: 'voz_inicio', axs: true, ...(origenRef.current ? { saludo: false } : {}), ...(bloqRef.current ? { bloqueado: true } : {}), ...(conTuVoz ? { tuVoz: true } : {}) });
      escucha.current.iniciar(prep.idioma);
    })();

    return () => {
      vivo = false;
      unsub();
      porLlamada.remove();
      subColgar.remove();
      subDesbloqueo.remove();
      // K3: al colgar, Eris NUNCA queda visible sobre la pantalla de bloqueo
      HestiaManos.sobreBloqueo(false);
      HestiaManos.avisarLlamada('fin');
      marcarLlamada(false);
      ErisBubble.stopCall();
      setAudioModeAsync({ shouldPlayInBackground: false }).catch(() => {});
      escucha.current?.detener(); escucha.current = null;
      HestiaManos.frasesLimpiar(); // L6: el audio de la llamada se borra al colgar
      reproductor.current?.cerrar(); reproductor.current = null;
      wsManager.sendMessage({ type: 'voz_colgar' });
      deactivateKeepAwake(KEEP).catch(() => {});
    };
  }, [visible, interrumpir, desbloqueado, pedirDesbloqueo]);

  const marca: MarkState = estado === 'escuchando' ? 'listening' : estado === 'pensando' ? 'thinking' : estado === 'hablando' ? 'speaking' : estado === 'problema' ? 'offline' : 'idle';
  const rotulo = aprobacion && estado !== 'problema'
    ? (aprobacion.clase === 'voz' ? 'Dime «sí» o «no» (o toca la tarjeta)' : 'Toca Aprobar o Rechazar en la tarjeta')
    : { preparando: 'Preparando el micrófono…', conectando: 'Conectando con Hestia…', escuchando: silencio ? 'Micrófono en silencio' : 'Te escucho', pensando: 'Pensando…', hablando: audifonos ? 'Hablando · interrúmpela cuando quieras' : 'Hablando · toca para interrumpir', problema: 'No se puede llamar todavía' }[estado];
  const det = detalle ? parseActionChips(detalle) : null;
  /** Una opción del detalle se dice como si la hubieras dicho («Lo comí ✓») */
  const elegir = (texto: string) => {
    setMio(texto);
    if (hablando.current || pensando.current) interrumpir();
    pensando.current = true;
    setEstado('pensando');
    wsManager.sendMessage({ type: 'voz_turno', texto });
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[st.fondo, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={st.arriba}>
          <Text style={st.titulo}>HESTIA</Text>
          <Text style={st.sub}>Llamada · solo en tu teléfono y tu PC</Text>
        </View>

        {bloq && (
          <View style={st.bloq}>
            <Text style={st.bloqTxt}>{vozFrase
              ? 'Teléfono bloqueado · reviso tu voz en cada frase: si eres tú, además de lo básico, tu día, anotar y preguntas. Para mensajes, llamadas o la plata, desbloquéalo.'
              : tuVoz
              ? 'Teléfono bloqueado · reconocí tu voz: lo básico, tu día, anotar y preguntas. Para mensajes, llamadas o la plata, desbloquéalo.'
              : 'Teléfono bloqueado: hago lo básico (alarmas, temporizador, linterna, volumen, música, la hora). Para lo personal, desbloquéalo.'}</Text>
            <TouchableOpacity style={st.bloqBtn} onPress={pedirDesbloqueo} accessibilityRole="button" accessibilityLabel="Desbloquear el teléfono">
              <Text style={st.bloqBtnTxt}>Desbloquear</Text>
            </TouchableOpacity>
          </View>
        )}

        <Pressable style={[st.centro, det && st.centroChico]} onPress={interrumpir} accessibilityRole="button" accessibilityLabel="Interrumpir a Hestia">
          <ErisMarkView size={det ? 96 : 190} state={marca} persona="hestia" />
          <Text style={[st.estado, estado === 'hablando' && { color: C.brasa }, aprobacion && { color: C.brasa }]}>{rotulo}</Text>
        </Pressable>

        {det && !problema && (
          <View style={st.detalle}>
            <View style={st.detalleCab}>
              <Text style={st.detalleTitulo}>TE LO DEJÉ ESCRITO</Text>
              <TouchableOpacity onPress={() => setDetalle(null)} accessibilityRole="button" accessibilityLabel="Cerrar el detalle" hitSlop={10}>
                <Text style={st.detalleCerrar}>Cerrar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={st.detalleScroll} contentContainerStyle={{ paddingBottom: 8 }}>
              <Markdown style={md}>{tablesToLists(det.cleanText)}</Markdown>
            </ScrollView>
            {det.actions.length > 0 && (
              <View style={st.fila}>
                {det.actions.slice(0, 4).map((a) => (
                  <TouchableOpacity key={a} style={st.opcion} onPress={() => elegir(a)} accessibilityRole="button">
                    <Text style={st.opcionTxt}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {problema ? (
          <View style={st.problema}>
            <Text style={st.problemaTxt}>{problema.motivo}</Text>
            <View style={st.fila}>
              {problema.accion === 'permiso' && <Boton texto="Abrir ajustes" onPress={() => Linking.openSettings()} />}
              <Boton texto="Cerrar" onPress={onClose} />
            </View>
          </View>
        ) : (
          <View style={[st.subtitulos, det && { minHeight: 0 }]}>
            {!!suyo && <Text style={[st.suyo, det && { fontSize: 15, lineHeight: 21 }]} numberOfLines={det ? 2 : 5}>{suyo}</Text>}
            {!!mio && <Text style={st.mio} numberOfLines={3}>Tú: {mio}</Text>}
            {vozFrase && !!mio && (vozUltima === 'tuya' || vozUltima === 'dudosa' || vozUltima === 'otra') && (
              <Text style={[st.vozChip, vozUltima === 'tuya' ? { color: C.azul } : vozUltima === 'otra' ? { color: C.rojo } : { color: C.brasa }]}
                accessibilityLabel={vozUltima === 'tuya' ? 'Era tu voz' : vozUltima === 'otra' ? 'Era otra voz' : 'No estoy segura de que fueras tú'}>
                {vozUltima === 'tuya' ? 'tu voz' : vozUltima === 'otra' ? 'otra voz' : 'no estoy segura de que seas tú'}
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity style={[st.chip, dirigido && st.chipOn]} onPress={() => setDirigido(!dirigido)} accessibilityRole="switch"
          accessibilityState={{ checked: dirigido }} accessibilityLabel="Solo te respondo si dices Hestia">
          <Text style={[st.chipTxt, dirigido && st.chipTxtOn]}>{dirigido ? '◉ Solo si digo «Hestia»' : '○ Te respondo todo · tocar para «solo si digo Hestia»'}</Text>
        </TouchableOpacity>
        <View style={st.controles}>
          <Control texto={audifonos ? 'Audífonos' : 'Parlante'} activo={audifonos} onPress={() => setAudifonos((a) => !a)}
            ayuda={audifonos ? 'Interrumpes hablando' : 'Interrumpes tocando'} />
          <Control texto={silencio ? 'Activar mic' : 'Silenciar'} activo={!silencio} onPress={() => setSilencio((v) => !v)} />
          <Control texto="Cortar" onPress={interrumpir} ayuda="Que se calle" />
          <TouchableOpacity style={st.colgar} onPress={onClose} accessibilityRole="button" accessibilityLabel="Colgar">
            <Text style={st.colgarTxt}>Colgar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Control({ texto, onPress, activo = true, ayuda }: { texto: string; onPress: () => void; activo?: boolean; ayuda?: string }) {
  return (
    <TouchableOpacity style={[st.control, !activo && { opacity: 0.6 }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={ayuda ? `${texto}. ${ayuda}` : texto}>
      <Text style={st.controlTxt}>{texto}</Text>
      {ayuda ? <Text style={st.controlAyuda}>{ayuda}</Text> : null}
    </TouchableOpacity>
  );
}
function Boton({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={st.boton} onPress={onPress} accessibilityRole="button"><Text style={st.botonTxt}>{texto}</Text></TouchableOpacity>
  );
}

const st = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: C.fondo, paddingHorizontal: 20 },
  arriba: { alignItems: 'center', gap: 4 },
  titulo: { color: C.brasa, fontSize: 16, fontWeight: '800', letterSpacing: 4 },
  sub: { color: C.suave, fontSize: 12 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  estado: { color: C.azul, fontSize: 14, fontWeight: '600' },
  subtitulos: { minHeight: 120, justifyContent: 'flex-end', gap: 10, paddingBottom: 12 },
  suyo: { color: C.texto, fontSize: 19, lineHeight: 26, textAlign: 'center' },
  mio: { color: C.suave, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  vozChip: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center', marginTop: -6, textTransform: 'uppercase' },
  problema: { backgroundColor: C.panel, borderColor: C.borde, borderWidth: 1, borderRadius: 14, padding: 16, gap: 12, marginBottom: 12 },
  problemaTxt: { color: C.texto, fontSize: 15, lineHeight: 21 },
  fila: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  boton: { backgroundColor: C.borde, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  botonTxt: { color: C.texto, fontWeight: '700' },
  controles: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  chip: { alignSelf: 'center', borderColor: C.borde, borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, marginBottom: 10 },
  chipOn: { borderColor: C.brasa, backgroundColor: 'rgba(245,158,11,0.10)' },
  chipTxt: { color: C.suave, fontSize: 12, fontWeight: '600' },
  chipTxtOn: { color: C.brasa, fontWeight: '700' },
  control: { flex: 1, backgroundColor: C.panel, borderColor: C.borde, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
  controlTxt: { color: C.texto, fontSize: 13, fontWeight: '700' },
  controlAyuda: { color: C.suave, fontSize: 10 },
  colgar: { flex: 1, backgroundColor: C.rojo, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  colgarTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  centroChico: { flex: 0, paddingVertical: 14, gap: 10 },
  bloq: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, backgroundColor: C.panel, borderColor: C.borde, borderWidth: 1, borderRadius: 14, padding: 12 },
  bloqTxt: { flex: 1, color: C.suave, fontSize: 12, lineHeight: 17 },
  bloqBtn: { borderColor: C.brasa, borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  bloqBtnTxt: { color: C.brasa, fontSize: 13, fontWeight: '700' },
  detalle: { flex: 1, backgroundColor: C.panel, borderColor: C.borde, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12, gap: 8 },
  detalleCab: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detalleTitulo: { color: C.brasa, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  detalleCerrar: { color: C.suave, fontSize: 13, fontWeight: '600' },
  detalleScroll: { flex: 1 },
  opcion: { borderColor: C.brasa, borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  opcionTxt: { color: C.brasa, fontSize: 13, fontWeight: '700' },
});

/** El detalle escrito, con los colores de la llamada */
const md = {
  body: { color: C.texto, fontSize: 15, lineHeight: 22 },
  heading1: { color: C.texto, fontSize: 17, fontWeight: '800' as const, marginTop: 6, marginBottom: 4 },
  heading2: { color: C.texto, fontSize: 16, fontWeight: '800' as const, marginTop: 6, marginBottom: 4 },
  heading3: { color: C.suave, fontSize: 15, fontWeight: '700' as const, marginTop: 4, marginBottom: 2 },
  strong: { fontWeight: '700' as const, color: C.texto },
  em: { fontStyle: 'italic' as const, color: C.suave },
  bullet_list_icon: { color: C.brasa, marginRight: 6 },
  ordered_list_icon: { color: C.brasa, marginRight: 6 },
  hr: { borderBottomColor: C.borde, borderBottomWidth: 1, marginVertical: 8 },
  link: { color: C.azul, textDecorationLine: 'underline' as const },
  paragraph: { marginTop: 0, marginBottom: 4 },
  code_inline: { backgroundColor: C.borde, color: C.azul, fontFamily: 'monospace', fontSize: 13, borderRadius: 4, paddingHorizontal: 4 },
};

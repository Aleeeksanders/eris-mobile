// ============================================================
// Hestia por voz (J1, 2026-11-16): la llamada. Solo Hestia (Modo AXS Executive, rol ikaros): una conversación en tiempo real, no
// un dictado que termina en el chat. El teléfono reconoce lo que dices (en el aparato, sin internet) y manda cada frase; Hestia
// responde por trozos que suenan apenas están listos. Con audífonos (lo que eligió el usuario) la interrumpes hablando encima.
// Sin emojis en los botones: algunos Android no traen esos glifos y salen como cuadritos (ver SpeakerIcon en ChatScreen).
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking, Pressable, ScrollView } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { parseActionChips } from '../utils/actionChips';
import { tablesToLists } from '../utils/chatFormat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { ErisMarkView, type MarkState } from '../../modules/eris-bubble/ErisMarkView';
import { ErisBubble } from '../../modules/eris-bubble';
import { setAudioModeAsync } from 'expo-audio';
import { wsManager } from '../services/WebSocketManager';
import { Escucha, prepararEscucha, type Preparacion } from '../services/voz/escucha';
import { Reproductor } from '../services/voz/reproductor';

type Estado = 'preparando' | 'conectando' | 'escuchando' | 'pensando' | 'hablando' | 'problema';
const KEEP = 'hestia-llamada';
const palabras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

const C = { fondo: '#07090D', panel: '#10141B', borde: '#1E2530', texto: '#F3F4F6', suave: '#9CA3AF', brasa: '#F59E0B', azul: '#7DD3FC', rojo: '#EF4444' };

export default function HestiaLlamada({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [estado, setEstado] = useState<Estado>('preparando');
  const [problema, setProblema] = useState<Extract<Preparacion, { ok: false }> | null>(null);
  const [mio, setMio] = useState('');
  const [suyo, setSuyo] = useState('');
  const [audifonos, setAudifonos] = useState(true);
  const [silencio, setSilencio] = useState(false);
  /** J2: lo largo (una agenda, un briefing) no se lee entero: queda escrito acá */
  const [detalle, setDetalle] = useState<string | null>(null);
  /** J2: una acción en el PC espera tu respuesta (voz = basta decir «sí»; si no, se toca la tarjeta) */
  const [aprobacion, setAprobacion] = useState<{ clase: 'voz' | 'tarjeta' | 'nunca_voz' } | null>(null);

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

  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    // J3: «Colgar» desde la notificación de la llamada (con la pantalla apagada o desde otra app)
    const subColgar = ErisBubble.onCallHangup(() => onCloseRef.current());
    setEstado('preparando'); setProblema(null); setMio(''); setSuyo(''); setDetalle(null); setAprobacion(null); aprobando.current = false;
    activateKeepAwakeAsync(KEEP).catch(() => {});
    reproductor.current = new Reproductor((h, texto) => {
      hablando.current = h;
      if (!vivo) return;
      setEstado(h ? 'hablando' : pensando.current ? 'pensando' : 'escuchando');
      if (h && texto) setSuyo((s) => (s ? s : texto));
    });

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
        case 'voz_error':
          pensando.current = false;
          setSuyo(String(m.mensaje ?? 'Algo falló.'));
          if (!hablando.current) setEstado('escuchando');
          break;
      }
    });

    (async () => {
      const prep = await prepararEscucha();
      if (!vivo) return;
      if (!prep.ok) { setProblema(prep); setEstado('problema'); return; }
      setEstado('conectando');
      // J3: con el teléfono en el bolsillo o la pantalla apagada sigue escuchando (servicio de micrófono, que Android solo deja
      // partir con esta pantalla a la vista) y lo que dice Hestia sigue sonando (expo-audio pausa todo al salir, salvo esto)
      ErisBubble.startCall();
      setAudioModeAsync({ shouldPlayInBackground: true, playsInSilentMode: true, interruptionMode: 'doNotMix' }).catch(() => {});
      escucha.current = new Escucha({
        parcial: (t) => {
          if (silencioRef.current) return;
          // con parlante, lo que oye mientras Hestia habla es su propia voz: no cuenta
          if (!audifonosRef.current && hablando.current) return;
          setMio(t);
          // con audífonos, dos palabras tuyas encima de ella la interrumpen. Si está preguntando por una aprobación, solo se calla:
          // lo que digas es la respuesta y el turno sigue (cortarlo sería un «no»)
          if (audifonosRef.current && (hablando.current || pensando.current) && palabras(t) >= 2) {
            if (aprobando.current) reproductor.current?.saltar(); else interrumpir();
          }
        },
        frase: (t) => {
          if (silencioRef.current || !t.trim()) return;
          if (!audifonosRef.current && hablando.current) return;
          setMio(t);
          if (aprobando.current) {
            // la respuesta a la pregunta (el servidor la interpreta: «sí», «no» o cambiaste de tema)
            reproductor.current?.saltar();
            wsManager.sendMessage({ type: 'voz_turno', texto: t });
            return;
          }
          if (hablando.current || pensando.current) interrumpir();
          pensando.current = true;
          setEstado('pensando');
          wsManager.sendMessage({ type: 'voz_turno', texto: t });
        },
        error: (codigo, mensaje) => { if (codigo !== 'start') return; setSuyo(`No pude escucharte (${mensaje}).`); },
      });
      wsManager.sendMessage({ type: 'voz_inicio', axs: true });
      escucha.current.iniciar(prep.idioma);
    })();

    return () => {
      vivo = false;
      unsub();
      subColgar.remove();
      ErisBubble.stopCall();
      setAudioModeAsync({ shouldPlayInBackground: false }).catch(() => {});
      escucha.current?.detener(); escucha.current = null;
      reproductor.current?.cerrar(); reproductor.current = null;
      wsManager.sendMessage({ type: 'voz_colgar' });
      deactivateKeepAwake(KEEP).catch(() => {});
    };
  }, [visible, interrumpir]);

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
          </View>
        )}

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
  problema: { backgroundColor: C.panel, borderColor: C.borde, borderWidth: 1, borderRadius: 14, padding: 16, gap: 12, marginBottom: 12 },
  problemaTxt: { color: C.texto, fontSize: 15, lineHeight: 21 },
  fila: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  boton: { backgroundColor: C.borde, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  botonTxt: { color: C.texto, fontWeight: '700' },
  controles: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  control: { flex: 1, backgroundColor: C.panel, borderColor: C.borde, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
  controlTxt: { color: C.texto, fontSize: 13, fontWeight: '700' },
  controlAyuda: { color: C.suave, fontSize: 10 },
  colgar: { flex: 1, backgroundColor: C.rojo, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  colgarTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  centroChico: { flex: 0, paddingVertical: 14, gap: 10 },
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

// ============================================================
// Eris Mobile — recorrido guiado
//
// Pedido del usuario (2026-10-10): "una especie de intro o tutorial, para que entiendan la aplicación, porque es muy
// amplia". Sobre la app real: oscurece la pantalla, deja iluminada solo la parte que explica (Tu día, Ahora, tus
// números, el chat, cada pestaña) y al lado una tarjeta corta. Así se aprende DÓNDE está cada cosa, no solo qué es.
// Lo arma Inicio (sabe qué pestañas tiene la persona); va en un Modal para cubrir también la barra de pestañas.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Easing, Dimensions } from 'react-native';
import Svg, { Path, Rect as SvgRect } from 'react-native-svg';
import { T, R } from '../../config/design';
import type { Rect } from './tourTargets';

export interface TourStep {
  id: string;
  title: string;
  text: string;
  /** dónde está lo que se explica (null = tarjeta centrada, sin iluminar nada) */
  locate: () => Promise<Rect | null>;
}

const PAD = 8;
const CARD_H_EST = 190;

export default function GuidedTour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const { width: W, height: H } = Dimensions.get('screen');
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);

  // Cada paso: se ubica lo que explica (Inicio hace scroll si hace falta) y aparece con un fundido
  useEffect(() => {
    let alive = true;
    busy.current = true;
    setReady(false);
    fade.setValue(0);
    steps[i].locate().then((r) => {
      if (!alive) return;
      setRect(r);
      setReady(true);
      Animated.timing(fade, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => { busy.current = false; });
    }).catch(() => { if (alive) { setRect(null); setReady(true); fade.setValue(1); busy.current = false; } });
    return () => { alive = false; };
  }, [i]);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const next = () => {
    if (busy.current) return;
    if (i >= steps.length - 1) { onDone(); return; }
    busy.current = true;
    Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setI((k) => k + 1));
  };
  const back = () => {
    if (busy.current || i === 0) return;
    busy.current = true;
    Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setI((k) => k - 1));
  };

  const step = steps[i];
  // Con margen alrededor, pero sin salirse de la pantalla (la última pestaña quedaba cortada en el borde)
  const hole = rect ? (() => {
    const x = Math.max(2, rect.x - PAD), y = Math.max(2, rect.y - PAD);
    return { x, y, w: Math.min(W - 2, rect.x + rect.w + PAD) - x, h: Math.min(H - 2, rect.y + rect.h + PAD) - y };
  })() : null;
  const rr = hole ? Math.min(20, hole.h / 2, hole.w / 2) : 0;
  const mask = hole
    ? `M0,0 H${W} V${H} H0 Z M${hole.x + rr},${hole.y} H${hole.x + hole.w - rr} A${rr},${rr} 0 0 1 ${hole.x + hole.w},${hole.y + rr} V${hole.y + hole.h - rr} A${rr},${rr} 0 0 1 ${hole.x + hole.w - rr},${hole.y + hole.h} H${hole.x + rr} A${rr},${rr} 0 0 1 ${hole.x},${hole.y + hole.h - rr} V${hole.y + rr} A${rr},${rr} 0 0 1 ${hole.x + rr},${hole.y} Z`
    : `M0,0 H${W} V${H} H0 Z`;
  // La tarjeta va debajo de lo iluminado si cabe; si no, arriba. Sin nada iluminado, al centro.
  const below = hole ? hole.y + hole.h + 14 + CARD_H_EST < H - 24 : false;
  const cardPos = !hole ? { top: H / 2 - CARD_H_EST / 2 } : below ? { top: hole.y + hole.h + 14 } : { top: Math.max(40, hole.y - 14 - CARD_H_EST) };
  const last = i === steps.length - 1;
  const first = i === 0;

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onDone}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Path d={mask} fill="rgba(3,3,8,0.82)" fillRule="evenodd" />
          {hole && <SvgRect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={rr} ry={rr} fill="none" stroke={T.accent} strokeWidth={1.5} strokeOpacity={0.9} />}
        </Svg>
        {hole && (
          <Animated.View
            pointerEvents="none"
            style={[st.glow, { left: hole.x - 4, top: hole.y - 4, width: hole.w + 8, height: hole.h + 8, borderRadius: rr + 4, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.55] }) }]}
          />
        )}
        {ready && (
          <View style={[st.card, cardPos]}>
            <Text style={st.count}>{first || last ? ' ' : `${i} de ${steps.length - 2}`}</Text>
            <Text style={st.title}>{step.title}</Text>
            <Text style={st.text}>{step.text}</Text>
            <View style={st.actions}>
              {first ? (
                <TouchableOpacity onPress={onDone} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={st.ghost}>Ahora no</Text>
                </TouchableOpacity>
              ) : last ? <View /> : (
                <View style={{ flexDirection: 'row', gap: 18 }}>
                  <TouchableOpacity onPress={back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Text style={st.ghost}>‹ Atrás</Text></TouchableOpacity>
                  <TouchableOpacity onPress={onDone} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Text style={st.ghost}>Saltar</Text></TouchableOpacity>
                </View>
              )}
              <TouchableOpacity onPress={next} activeOpacity={0.85} style={st.primary}>
                <Text style={st.primaryText}>{first ? 'Empezar' : last ? '¡Listo!' : 'Siguiente ›'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

const st = StyleSheet.create({
  glow: { position: 'absolute', borderWidth: 3, borderColor: T.accent },
  card: {
    position: 'absolute', left: 16, right: 16, backgroundColor: T.bgElevated, borderRadius: R.xl, padding: 18,
    borderWidth: 1, borderColor: T.borderActive,
  },
  count: { color: T.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  title: { color: T.text, fontSize: 19, fontWeight: '900', letterSpacing: -0.4 },
  text: { color: T.textLight, fontSize: 14, fontWeight: '500', marginTop: 6, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  ghost: { color: T.textMuted, fontSize: 14, fontWeight: '700' },
  primary: { backgroundColor: T.accent, borderRadius: R.md, paddingHorizontal: 18, paddingVertical: 10 },
  primaryText: { color: T.bg, fontSize: 14, fontWeight: '900' },
});

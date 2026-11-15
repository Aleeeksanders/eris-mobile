// ============================================================
// Hojas que suben desde abajo (Modal) y el teclado. Con la app «edge-to-edge» (Expo 54) la ventana de un Modal ya no
// se encoge cuando se abre el teclado, y los formularios quedaban debajo de él (2026-11-15, «Ajustar saldo»).
// KeyboardLiftView va como fondo de la hoja, DENTRO del Modal: la sube sobre el teclado y la deja bajo la barra de
// arriba. La regla (y por qué hay tres señales) está en keyboardLiftCore.ts, con sus pruebas.
// ============================================================
import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, TextInput, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { altoParaSubir, ESPERA_ESTIMADO_MS } from './keyboardLiftCore';

// La vista nativa que mide el teclado de la ventana del Modal (modules/eris-bubble/.../ImeWatcherView.kt). Si el APK
// no la trae, se sigue con los eventos de React Native y el estimado.
let NativeIme: React.ComponentType<any> | null = null;
if (Platform.OS === 'android') {
  try {
    if (requireOptionalNativeModule('ErisBubble') && (globalThis as any).expo?.getViewConfig?.('ErisBubble', 'ImeWatcherView')) {
      NativeIme = requireNativeViewManager('ErisBubble', 'ImeWatcherView');
    }
  } catch { NativeIme = null; }
}

// Lo que ya se sabe de este teléfono (vale para todas las hojas mientras la app está abierta)
let nativoFunciona = false;
let eventoFunciona = false;

/** Cuánto subir la hoja (dp desde el borde de abajo; 0 sin teclado) y la vista que mide el teclado, que va DENTRO del Modal. */
export function useKeyboardLift(): { lift: number; watcher: React.ReactNode } {
  const insets = useSafeAreaInsets();
  const { height: alto } = useWindowDimensions();
  const [nativo, setNativo] = useState<number | null>(NativeIme ? 0 : null);
  const [evento, setEvento] = useState(0);
  const [focoLargo, setFocoLargo] = useState(false);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const h = Math.round(e?.endCoordinates?.height ?? 0);
      if (h > 0) eventoFunciona = true;
      setEvento(h);
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setEvento(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Respaldo: un campo con el foco y ninguna señal del teclado → se estima (solo mientras ninguna señal funcione)
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let desde = 0;
    const t = setInterval(() => {
      if (nativoFunciona || eventoFunciona) { setFocoLargo(false); return; }
      const foco = TextInput.State?.currentlyFocusedInput?.();
      if (!foco) { desde = 0; setFocoLargo(false); return; }
      if (!desde) desde = Date.now();
      setFocoLargo(Date.now() - desde >= ESPERA_ESTIMADO_MS);
    }, 250);
    return () => clearInterval(t);
  }, []);

  const watcher = NativeIme ? (
    <NativeIme
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, opacity: 0 }}
      onIme={(e: any) => {
        const h = Math.max(0, Math.round(Number(e?.nativeEvent?.height) || 0));
        if (h > 0) nativoFunciona = true;
        setNativo(h);
      }}
    />
  ) : null;

  const lift = altoParaSubir({
    nativo, nativoFunciona, evento, eventoFunciona,
    barra: Platform.OS === 'ios' ? 0 : insets.bottom, // en iOS el alto del evento ya incluye la franja de abajo
    focoLargo, alto,
  });
  return { lift, watcher };
}

/**
 * El fondo de una hoja que sube desde abajo, DENTRO del Modal: la deja sobre el teclado y bajo la barra de arriba.
 * `children` puede ser una función que recibe cuánto subió (para no sumar el margen de la barra de abajo con el
 * teclado abierto). La hoja debe poder achicarse (maxHeight '100%' y su ScrollView adentro).
 */
export function KeyboardLiftView({ style, children }: {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode | ((lift: number) => React.ReactNode);
}) {
  const { lift, watcher } = useKeyboardLift();
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ flex: 1 }, style, { paddingTop: insets.top + 8 }, lift > 0 && { paddingBottom: lift }]}>
      {watcher}
      {typeof children === 'function' ? children(lift) : children}
    </View>
  );
}

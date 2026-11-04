import React from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Ícono animado de Eris (el condensado), dibujado en nativo por ErisMarkDrawer.kt — el mismo de la burbuja sobre
 * otras apps. Si el módulo nativo no está (web, iOS, APK viejo) se muestra `fallback`.
 */
export type MarkState =
  | 'idle' | 'thinking' | 'reply' | 'listening' | 'speaking' | 'offline'   // estados de fondo
  | 'appear' | 'rank' | 'close';                                          // momentos de una sola vez
export type MarkTint = 'chat' | 'finanzas' | 'forge' | 'nutricion' | 'salud';

let NativeMark: React.ComponentType<any> | null = null;
if (Platform.OS === 'android' && requireOptionalNativeModule('ErisBubble')) {
  try { NativeMark = requireNativeViewManager('ErisBubble'); } catch { NativeMark = null; }
}
export const erisMarkNativeAvailable = !!NativeMark;

export function ErisMarkView({ size, state = 'idle', tint = 'chat', persona = 'eris', disc = true, style, fallback = null }: {
  size: number;
  state?: MarkState;
  tint?: MarkTint;
  /** "eris" o "hestia" (Modo AXS Executive): núcleo, halo y nube del chat */
  persona?: 'eris' | 'hestia';
  /** dibujar el disco oscuro de fondo */
  disc?: boolean;
  style?: StyleProp<ViewStyle>;
  fallback?: React.ReactNode;
}) {
  if (!NativeMark) return <>{fallback}</>;
  return <NativeMark style={[{ width: size, height: size }, style]} state={state} tint={tint} persona={persona} disc={disc} />;
}

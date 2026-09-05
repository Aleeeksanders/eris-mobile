// ============================================================
// Eris Mobile — BarcodeScanner
// Escáner de código de barras usando expo-camera (SDK 54)
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ActivityIndicator, Vibration, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { T, R } from '../../config/design';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Se llama con el barcode detectado. El componente se encarga del debounce (1 scan/2s) */
  onBarcode: (code: string) => void;
}

export default function BarcodeScanner({ visible, onClose, onBarcode }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);

  // Reset al abrir el modal
  useEffect(() => {
    if (visible) {
      setScanning(true);
      setLastCode(null);
      setCooldown(false);
    }
  }, [visible]);

  const handleBarcode = (result: BarcodeScanningResult) => {
    if (cooldown || !scanning) return;

    const code = result.data;
    if (code === lastCode) return; // evitar re-scan del mismo código

    setLastCode(code);
    setCooldown(true);
    Vibration.vibrate(80); // feedback háptico

    // Pausa de 2s para evitar lecturas múltiples
    setTimeout(() => setCooldown(false), 2000);

    onBarcode(code);
  };

  // ─── Estado: esperando permisos ─────────────────────────────
  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={T.accent} />
          <Text style={s.text}>Verificando permisos…</Text>
        </View>
      </Modal>
    );
  }

  // ─── Estado: sin permisos ───────────────────────────────────
  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={s.center}>
          <Text style={s.permIcon}>📷</Text>
          <Text style={s.permTitle}>Permiso de cámara requerido</Text>
          <Text style={s.permDesc}>
            Eris necesita acceso a la cámara para escanear códigos de barras y obtener información nutricional del producto.
          </Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
            <Text style={s.permBtnText}>Conceder Permiso</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  // ─── Estado: cámara activa ──────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root}>
        <CameraView
          style={s.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: [
              'ean13', 'ean8', 'upc_a', 'upc_e',
              'code128', 'code39', 'qr', 'itf14', 'datamatrix',
            ],
          }}
          onBarcodeScanned={handleBarcode}
        />

        {/* Overlay oscuro con ventana de escaneo */}
        <View style={s.overlay} pointerEvents="none">
          {/* Regiones oscuras arriba y abajo */}
          <View style={s.overlayTop} />
          <View style={s.overlayMid}>
            <View style={s.overlaySide} />
            {/* Ventana transparente = zona de escaneo */}
            <View style={s.scanWindow}>
              {/* Esquinas decorativas */}
              <View style={[s.corner, s.cornerTL]} />
              <View style={[s.corner, s.cornerTR]} />
              <View style={[s.corner, s.cornerBL]} />
              <View style={[s.corner, s.cornerBR]} />
              {/* Línea de escaneo animada */}
              {cooldown && <View style={s.scannedFlash} />}
            </View>
            <View style={s.overlaySide} />
          </View>
          <View style={s.overlayBottom} />
        </View>

        {/* UI superior */}
        <View style={s.header}>
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={s.title}>Escanear Código de Barras</Text>
        </View>

        {/* Instrucción inferior */}
        <View style={s.footer}>
          {cooldown ? (
            <View style={s.scanningRow}>
              <ActivityIndicator size="small" color={T.accent} />
              <Text style={s.scanningText}>Buscando producto…</Text>
            </View>
          ) : (
            <Text style={s.hint}>
              Apunta la cámara al código de barras del producto
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const WINDOW_SIZE = 260;
const CORNER_SIZE = 24;
const CORNER_WIDTH = 3;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  camera: { ...StyleSheet.absoluteFillObject },
  center: {
    flex: 1, backgroundColor: T.bg,
    alignItems: 'center', justifyContent: 'center',
    padding: 32,
  },
  text: { color: T.textMuted, marginTop: 12, fontSize: 14 },

  // Permisos
  permIcon: { fontSize: 52, marginBottom: 16 },
  permTitle: { fontSize: 20, fontWeight: '800', color: T.text, marginBottom: 10, textAlign: 'center' },
  permDesc: { fontSize: 14, color: T.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  permBtn: {
    backgroundColor: T.accent, borderRadius: R.full,
    paddingVertical: 14, paddingHorizontal: 28, marginBottom: 12,
  },
  permBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },
  cancelBtn: { padding: 12 },
  cancelText: { color: T.textMuted, fontSize: 14 },

  // Overlay
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
  overlayMid: { flexDirection: 'row', height: WINDOW_SIZE },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
  scanWindow: { width: WINDOW_SIZE, height: WINDOW_SIZE },
  scannedFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34,211,238,0.25)',
    borderRadius: 4,
  },

  // Esquinas del visor
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: T.accent,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderBottomRightRadius: 4 },

  // Header sobre la cámara
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  closeBtnText: { color: '#fff', fontSize: 15 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
    alignItems: 'center',
  },
  hint: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  scanningRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scanningText: { color: T.accent, fontSize: 13, fontWeight: '600' },
});

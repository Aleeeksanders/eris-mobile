// Finanzas 2.0 (F4) — escanear el timbre de la boleta (PDF417 del SII) con la cámara. Lo lee services/finance/receiptTed:
// total, fecha, comercio, folio. Nada sale del teléfono; la persona revisa y guarda.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Vibration, Platform } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { FX } from './fx';
import { parseTimbre, type Timbre } from '../../services/finance/receiptTed';

export default function ReceiptScanner({ visible, onClose, onTimbre }: { visible: boolean; onClose: () => void; onTimbre: (t: Timbre) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [aviso, setAviso] = useState<string | null>(null);
  const done = useRef(false);
  const lastBad = useRef('');

  useEffect(() => { if (visible) { done.current = false; lastBad.current = ''; setAviso(null); } }, [visible]);

  const onScan = (r: BarcodeScanningResult) => {
    if (done.current) return;
    const t = parseTimbre(r.data);
    if (!t) {
      // Otro código (el de barras de un producto, un QR): se avisa una vez, sin vibrar a cada cuadro
      if (lastBad.current !== r.data) { lastBad.current = r.data; setAviso('Ese no es el timbre: busca el código ancho al final de la boleta.'); }
      return;
    }
    done.current = true;
    Vibration.vibrate(60);
    onTimbre(t);
  };

  if (!visible) return null;
  if (!permission) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={s.center}><ActivityIndicator color={FX.cyan} /></View>
      </Modal>
    );
  }
  if (!permission.granted) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={s.center}>
          <Text style={s.permTitle}>Para leer la boleta necesito la cámara</Text>
          <Text style={s.permDesc}>Leo solo el timbre del SII (total, fecha y comercio). La foto no se guarda ni sale del teléfono.</Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission} accessibilityRole="button"><Text style={s.permBtnText}>Dar permiso de cámara</Text></TouchableOpacity>
          <TouchableOpacity style={s.cancel} onPress={onClose} accessibilityRole="button"><Text style={s.cancelText}>Cancelar</Text></TouchableOpacity>
        </View>
      </Modal>
    );
  }
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root}>
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['pdf417'] }} onBarcodeScanned={onScan} />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={s.dim} />
          <View style={s.mid}>
            <View style={s.dim} />
            <View style={s.window}>
              <View style={[s.corner, s.tl]} /><View style={[s.corner, s.tr]} /><View style={[s.corner, s.bl]} /><View style={[s.corner, s.br]} />
            </View>
            <View style={s.dim} />
          </View>
          <View style={s.dim} />
        </View>
        <View style={s.header}>
          <TouchableOpacity style={s.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar"><Text style={s.closeText}>✕</Text></TouchableOpacity>
          <Text style={s.title}>ESCANEAR BOLETA</Text>
        </View>
        <View style={s.footer}>
          <Text style={s.hint}>Apunta al <Text style={{ color: FX.cyan }}>timbre</Text>: el código ancho, como un rectángulo de rayas, al final de la boleta.</Text>
          {aviso && <Text style={s.aviso}>{aviso}</Text>}
        </View>
      </View>
    </Modal>
  );
}

const C = 22, W = 3;
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: FX.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  permTitle: { color: FX.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  permDesc: { color: FX.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  permBtn: { backgroundColor: FX.violetDeep, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 24, marginTop: 8 },
  permBtnText: { color: '#fff', fontWeight: '800' },
  cancel: { padding: 10 },
  cancelText: { color: FX.muted },
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  mid: { flexDirection: 'row', height: 150 },
  window: { width: '86%', height: 150 },
  corner: { position: 'absolute', width: C, height: C, borderColor: FX.cyan },
  tl: { top: 0, left: 0, borderTopWidth: W, borderLeftWidth: W },
  tr: { top: 0, right: 0, borderTopWidth: W, borderRightWidth: W },
  bl: { bottom: 0, left: 0, borderBottomWidth: W, borderLeftWidth: W },
  br: { bottom: 0, right: 0, borderBottomWidth: W, borderRightWidth: W },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  title: { color: '#fff', fontFamily: FX.mono, fontSize: 13, letterSpacing: 2, fontWeight: '700' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 48, gap: 10 },
  hint: { color: '#fff', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  aviso: { color: FX.gold, fontSize: 13, textAlign: 'center' },
});

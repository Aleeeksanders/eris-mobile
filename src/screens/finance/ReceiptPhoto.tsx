// Finanzas 2.0 (F4) — la FOTO de la boleta. Mientras encuadras, si se ve el timbre del SII se lee solo (el total exacto,
// para cuadrar); al sacar la foto se manda al PC de Eris, que lee los productos (eris/src/services/ReceiptOcr.ts).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Vibration, Platform } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { FX, clp } from './fx';
import { parseTimbre, type Timbre } from '../../services/finance/receiptTed';

export default function ReceiptPhoto({ visible, onClose, onFoto }: { visible: boolean; onClose: () => void; onFoto: (f: { base64: string; timbre: Timbre | null }) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [timbre, setTimbre] = useState<Timbre | null>(null);
  const [sacando, setSacando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Hasta ~12 MP: de sobra para leer la boleta y la foto no pasa del límite del envío (las cámaras de 50 MP la harían enorme)
  const [size, setSize] = useState<string | undefined>(undefined);
  const elegirTamano = async () => {
    try {
      const sizes = (await cam.current?.getAvailablePictureSizesAsync()) ?? [];
      const px = (x: string) => { const m = x.match(/(\d+)\s*x\s*(\d+)/i); return m ? Number(m[1]) * Number(m[2]) : 0; };
      // (hasta ~9 MP con calidad 0,8: la foto no pasa del límite del PC, 9 MB)
      const ok = sizes.filter((x) => px(x) > 0 && px(x) <= 9_000_000).sort((a, b) => px(b) - px(a));
      if (ok[0]) setSize(ok[0]);
    } catch {}
  };

  useEffect(() => { if (visible) { setTimbre(null); setSacando(false); setError(null); } }, [visible]);

  const onScan = (r: BarcodeScanningResult) => {
    if (timbre) return;
    const t = parseTimbre(r.data);
    if (t) { setTimbre(t); Vibration.vibrate(40); }
  };

  const sacar = async () => {
    if (sacando || !cam.current) return;
    setSacando(true); setError(null);
    try {
      // (calidad 0,8: al 50 % el papel térmico se llenaba de artefactos y el lector leía mal el pie; 2026-11-16, 15 fotos sin cuadrar)
      const pic = await cam.current.takePictureAsync({ base64: true, quality: 0.8, exif: false });
      if (!pic?.base64) throw new Error('sin foto');
      onFoto({ base64: pic.base64, timbre });
    } catch {
      setError('No pude sacar la foto. Intenta de nuevo.');
      setSacando(false);
    }
  };

  if (!visible) return null;
  if (!permission) {
    return (<Modal visible animationType="slide" onRequestClose={onClose}><View style={s.center}><ActivityIndicator color={FX.cyan} /></View></Modal>);
  }
  if (!permission.granted) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={s.center}>
          <Text style={s.permTitle}>Para leer la boleta necesito la cámara</Text>
          <Text style={s.permDesc}>La foto se lee en el PC de Eris (sin internet) y se borra apenas termina.</Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission} accessibilityRole="button"><Text style={s.permBtnText}>Dar permiso de cámara</Text></TouchableOpacity>
          <TouchableOpacity style={s.cancel} onPress={onClose} accessibilityRole="button"><Text style={s.cancelText}>Cancelar</Text></TouchableOpacity>
        </View>
      </Modal>
    );
  }
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root}>
        <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['pdf417'] }} onBarcodeScanned={onScan}
          onCameraReady={elegirTamano} {...(size ? { pictureSize: size } : {})} />
        <View style={s.frameWrap} pointerEvents="none">
          <View style={s.frame}>
            <View style={[s.corner, s.tl]} /><View style={[s.corner, s.tr]} /><View style={[s.corner, s.bl]} /><View style={[s.corner, s.br]} />
          </View>
        </View>
        <View style={s.header}>
          <TouchableOpacity style={s.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar"><Text style={s.closeText}>✕</Text></TouchableOpacity>
          <Text style={s.title}>FOTO DE LA BOLETA</Text>
        </View>
        <View style={s.footer}>
          {timbre
            ? <Text style={s.ok}>✓ Timbre leído: total {clp(timbre.monto)}</Text>
            : (
              <>
                <Text style={s.hint}>Derecha, con buena luz y de cerca: desde arriba hasta el TOTAL y la fecha.</Text>
                {/* 2026-11-15, pedido del usuario: que se entienda qué sirve. El código de barras de abajo de la boleta no hace falta */}
                <Text style={s.hint2}>Si tu boleta trae un número largo al comienzo de cada producto (su código de barras), que se vea: así reconozco cada producto como si lo escanearas. Si no lo trae, igual la desgloso.</Text>
              </>
            )}
          {error && <Text style={s.err}>{error}</Text>}
          <TouchableOpacity style={[s.shutter, sacando && { opacity: 0.5 }]} onPress={sacar} disabled={sacando} accessibilityRole="button" accessibilityLabel="Sacar la foto">
            {sacando ? <ActivityIndicator color="#000" /> : <View style={s.shutterIn} />}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const C = 24, W = 3;
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: FX.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  permTitle: { color: FX.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  permDesc: { color: FX.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  permBtn: { backgroundColor: FX.violetDeep, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 24, marginTop: 8 },
  permBtnText: { color: '#fff', fontWeight: '800' },
  cancel: { padding: 10 },
  cancelText: { color: FX.muted },
  frameWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingTop: 40, paddingBottom: 150 },
  frame: { width: '78%', height: '100%' },
  corner: { position: 'absolute', width: C, height: C, borderColor: FX.cyan },
  tl: { top: 0, left: 0, borderTopWidth: W, borderLeftWidth: W },
  tr: { top: 0, right: 0, borderTopWidth: W, borderRightWidth: W },
  bl: { bottom: 0, left: 0, borderBottomWidth: W, borderLeftWidth: W },
  br: { bottom: 0, right: 0, borderBottomWidth: W, borderRightWidth: W },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  title: { color: '#fff', fontFamily: FX.mono, fontSize: 13, letterSpacing: 2, fontWeight: '700' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 40, gap: 12, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  hint: { color: '#fff', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  hint2: { color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  ok: { color: FX.up, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  err: { color: FX.gold, fontSize: 13, textAlign: 'center' },
  shutter: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.4)' },
  shutterIn: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: '#000' },
});

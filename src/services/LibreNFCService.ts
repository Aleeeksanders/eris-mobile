// ============================================================
// Eris Mobile — LibreNFCService
// Lectura directa de sensores FreeStyle Libre 2 Plus / Sensor Linx
// vía NFC (ISO 15693). No requiere cuenta LibreLinkUp.
//
// Sensores soportados:
//   · FreeStyle Libre 2 Plus (Chile / LatAm)
//   · Sensor Linx (Abbott Chile)
//   · FreeStyle Libre 1 / 2 (EU/US, sin cifrado)
//
// Protocolo: ISO 15693 / NFC-V
// FRAM: 344 bytes (43 bloques × 8 bytes)
// ============================================================

import NfcManager, { NfcTech, type TagEvent } from 'react-native-nfc-manager';

// ─── FRAM layout ──────────────────────────────────────────────
const FRAM_SIZE        = 344;
const STATUS_BYTE      = 4;     // sensor status
const TREND_IDX_BYTE   = 26;    // ring buffer pointer (0-15)
const HISTORY_IDX_BYTE = 27;    // ring buffer pointer (0-31)
const TREND_OFFSET     = 28;    // 16 records × 6 bytes
const HISTORY_OFFSET   = 124;   // 32 records × 6 bytes
const AGE_HIGH_BYTE    = 316;
const AGE_LOW_BYTE     = 317;
const TREND_COUNT      = 16;
const HISTORY_COUNT    = 32;
const RECORD_BYTES     = 6;

// Libre 2 Plus sensor life (14 days = 20160 min)
const MAX_SENSOR_MINUTES = 14 * 24 * 60;

const SensorStatus = {
  NotActivated : 1,
  WarmingUp    : 2,
  Active       : 3,
  Expired      : 4,
  Shutdown     : 5,
  Failure      : 6,
} as const;

// ─── Public types ─────────────────────────────────────────────

export type TrendArrow = '↑↑' | '↑' | '↗' | '→' | '↘' | '↓' | '↓↓';

export interface LibreReading {
  glucoseMgdl : number;
  glucoseMmol : number;
  trend       : TrendArrow;
  trendLabel  : string;
  /** Minutos que lleva activo el sensor */
  sensorAge   : number;
  /** Días restantes de vida del sensor */
  daysLeft    : number;
  /** true durante la hora de calentamiento inicial */
  warming     : boolean;
  timestamp   : Date;
  history     : Array<{ glucoseMgdl: number; minutesAgo: number }>;
}

// ─── Decryption ───────────────────────────────────────────────
// Libre 2 / 2 Plus usa un cifrado de flujo CRC16-KERMIT derivado del UID.
// Libre 2 EU: key = uid[4..5]  (xDrip+ documentado)
// Libre 2 Plus / Sensor Linx: key puede ser uid[0..1], uid[2..3], uid[3..4], etc.
// Probamos todas las posiciones — la que produce glucosa válida es la correcta.

function decryptWithKey(body: number[], keyHi: number, keyLo: number): number[] {
  const out = [...body];
  let key = ((keyHi & 0xFF) << 8) | (keyLo & 0xFF);
  for (let i = 0; i < out.length; i++) {
    key = (key & 1) ? ((key >>> 1) ^ 0x8408) : (key >>> 1);
    key &= 0xFFFF;
    out[i] ^= (key & 0xFF);
  }
  return out;
}

// Devuelve todos los candidatos descifrados (+ crudo sin cifrar) para intentar parsear
function decryptCandidates(uid: number[], body: number[]): Array<{ label: string; bytes: number[] }> {
  const candidates = [
    { label: 'raw',     bytes: body },
    { label: 'key4-5', bytes: decryptWithKey(body, uid[4], uid[5]) }, // Libre 2 EU
    { label: 'key0-1', bytes: decryptWithKey(body, uid[0], uid[1]) }, // Libre 2 Plus candidate
    { label: 'key2-3', bytes: decryptWithKey(body, uid[2], uid[3]) }, // Libre 2 Plus candidate
    { label: 'key3-4', bytes: decryptWithKey(body, uid[3], uid[4]) },
    { label: 'key1-2', bytes: decryptWithKey(body, uid[1], uid[2]) },
    { label: 'key5-6', bytes: decryptWithKey(body, uid[5], uid[6]) },
  ];
  return candidates;
}

// ─── FRAM parsing ─────────────────────────────────────────────

function rawToMgdl(lo: number, hi: number): number {
  const raw = (lo & 0xFF) | ((hi & 0x0F) << 8);   // 12-bit LE
  return Math.round((raw / 6.0) * 18.01559);        // mmol × 18
}

function calcTrend(readings: number[]): { arrow: TrendArrow; label: string } {
  if (readings.length < 4) return { arrow: '→', label: 'Estable' };
  // Tasa en mg/dL por minuto (lecturas cada 1 min)
  const rate = (readings[0] - readings[3]) / 3;
  if (rate >=  3.5) return { arrow: '↑↑', label: 'Sube muy rápido' };
  if (rate >=  2.0) return { arrow: '↑',  label: 'Subiendo' };
  if (rate >=  1.0) return { arrow: '↗',  label: 'Sube lento' };
  if (rate >  -1.0) return { arrow: '→',  label: 'Estable' };
  if (rate >  -2.0) return { arrow: '↘',  label: 'Baja lento' };
  if (rate >  -3.5) return { arrow: '↓',  label: 'Bajando' };
  return               { arrow: '↓↓', label: 'Baja muy rápido' };
}

function isValidGlucose(mgdl: number): boolean {
  return mgdl >= 20 && mgdl <= 600;
}

function parseFRAM(bytes: number[]): LibreReading | null {
  const trendIdx   = bytes[TREND_IDX_BYTE]   & 0xFF;
  const historyIdx = bytes[HISTORY_IDX_BYTE] & 0xFF;
  const status     = bytes[STATUS_BYTE]      & 0xFF;

  // Leer buffer de tendencia (16 lecturas, 1/min)
  const trendGlucose: number[] = [];
  for (let i = 0; i < TREND_COUNT; i++) {
    const idx = (trendIdx - i + TREND_COUNT) % TREND_COUNT;
    const off = TREND_OFFSET + idx * RECORD_BYTES;
    trendGlucose.push(rawToMgdl(bytes[off], bytes[off + 1]));
  }

  const current = trendGlucose[0];
  if (!isValidGlucose(current)) return null;

  const { arrow, label } = calcTrend(trendGlucose);

  // Historial (32 lecturas, 1 cada 15 min → ~8 horas)
  const history: LibreReading['history'] = [];
  for (let i = 0; i < HISTORY_COUNT; i++) {
    const idx = (historyIdx - i + HISTORY_COUNT) % HISTORY_COUNT;
    const off = HISTORY_OFFSET + idx * RECORD_BYTES;
    const val = rawToMgdl(bytes[off], bytes[off + 1]);
    if (isValidGlucose(val)) {
      history.push({ glucoseMgdl: val, minutesAgo: i * 15 });
    }
  }

  const age = ((bytes[AGE_HIGH_BYTE] & 0xFF) << 8) | (bytes[AGE_LOW_BYTE] & 0xFF);

  return {
    glucoseMgdl : Math.round(current),
    glucoseMmol : parseFloat((current / 18.01559).toFixed(1)),
    trend       : arrow,
    trendLabel  : label,
    sensorAge   : age,
    daysLeft    : Math.max(0, Math.ceil((MAX_SENSOR_MINUTES - age) / (24 * 60))),
    warming     : status === SensorStatus.WarmingUp || age < 60,
    timestamp   : new Date(),
    history,
  };
}

// ─── NFC block reading ────────────────────────────────────────

// Estrategias de lectura en orden de preferencia.
// Error 0x01 = "Command not supported" — el sensor necesita otra estrategia.
// Probamos 4 variantes para cubrir Libre 1, 2 EU, 2 Plus y Sensor Linx.
type ReadStrategy = 'multi_std' | 'multi_opt' | 'single_std' | 'single_addr';

const STRATEGIES: ReadStrategy[] = ['multi_std', 'multi_opt', 'single_std', 'single_addr'];

async function readBlocksWithStrategy(uid: number[], strategy: ReadStrategy): Promise<number[]> {
  const TOTAL_BLOCKS = 43;
  const BATCH        = 8;
  const fram: number[] = [];

  const isMulti   = strategy.startsWith('multi');
  const isAddr    = strategy.endsWith('addr');
  const optFlag   = strategy.endsWith('opt') ? 0x40 : 0x00;
  const addrFlag  = isAddr                   ? 0x20 : 0x00;
  const flags     = 0x02 | optFlag | addrFlag;   // 0x02 = high data rate

  const step = isMulti ? BATCH : 1;

  for (let start = 0; start < TOTAL_BLOCKS; start += step) {
    const count = isMulti ? Math.min(BATCH, TOTAL_BLOCKS - start) : 1;

    let cmd: number[];
    if (isMulti) {
      // Read Multiple Blocks (0x23)
      cmd = isAddr
        ? [flags, 0x23, ...uid, start, count - 1]
        : [flags, 0x23, start, count - 1];
    } else {
      // Read Single Block (0x20)
      cmd = isAddr
        ? [flags, 0x20, ...uid, start]
        : [flags, 0x20, start];
    }

    const resp: number[] = await NfcManager.nfcVHandler.transceive(cmd);

    if (!resp || resp.length === 0) {
      throw new Error(`sin_respuesta:${start}`);
    }
    if (resp[0] & 0x01) {
      const errCode = resp.length > 1 ? resp[1] : 0xFF;
      throw new Error(`error_sensor:${start}:0x${errCode.toString(16)}`);
    }

    if (isMulti) {
      // Respuesta: [respFlags(1), ([lockBit(1)] + data(8)) × count]
      const bytesPerBlock = (resp.length - 1) / count;
      const dataOff       = bytesPerBlock === 9 ? 1 : 0;
      for (let b = 0; b < count; b++) {
        const base = 1 + b * bytesPerBlock + dataOff;
        for (let j = 0; j < 8; j++) fram.push(resp[base + j] & 0xFF);
      }
    } else {
      // Respuesta: [respFlags(1), [lockBit(1)?], data(8)]
      const dataOff = resp.length === 10 ? 2 : 1;
      for (let j = 0; j < 8; j++) fram.push(resp[dataOff + j] & 0xFF);
    }
  }

  return fram;
}

async function readFRAM(): Promise<{ uid: number[]; fram: number[] }> {
  const tag = await NfcManager.getTag() as TagEvent & { id?: string };
  if (!tag?.id) throw new Error('Tag NFC no detectado');

  // Android entrega UIDs NFC-V en orden LSB-first: [serial..., 0x07, 0xE0]
  const hex = (tag.id as string).replace(/[^0-9a-fA-F]/g, '');
  const uid = Array.from({ length: hex.length / 2 }, (_, i) =>
    parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  );

  if (uid.length < 8 || uid[7] !== 0xE0) {
    throw new Error(
      `NFC detectado, pero el UID no corresponde a un chip Abbott (ISO 15693).\n` +
      `UID: ${uid.map(b => b.toString(16).padStart(2,'0')).join(' ')}\n` +
      'Asegúrate de que el NFC esté activo y acerca más el teléfono al sensor.'
    );
  }

  const errors: string[] = [];

  for (const strategy of STRATEGIES) {
    try {
      const fram = await readBlocksWithStrategy(uid, strategy);
      if (fram.length === FRAM_SIZE) {
        console.log(`[LibreNFC] ✅ Lectura exitosa con estrategia: ${strategy}`);
        return { uid, fram };
      }
      errors.push(`${strategy}: FRAM incompleto (${fram.length}/${FRAM_SIZE})`);
    } catch (e: any) {
      errors.push(`${strategy}: ${e.message}`);
    }
  }

  // Detectar el caso más común: todas las estrategias dan error_sensor 0x01 en bloque 0.
  // Esto ocurre cuando el sensor Libre 2 Plus está emparejado por BLE con la app FreeStyle Libre —
  // Abbott bloquea el acceso NFC al FRAM en ese modo.
  const allBlockedByBle = errors.every(e => e.includes('error_sensor:0:0x1'));
  if (allBlockedByBle) {
    throw new Error(
      'El sensor está en modo Bluetooth (emparejado con la app FreeStyle Libre).\n\n' +
      'Los sensores Libre 2 Plus bloquean la lectura NFC directa cuando están activos por BLE.\n\n' +
      'Usa la integración LibreLinkUp en la pestaña Glucosa para obtener datos en tiempo real desde la nube de Abbott.'
    );
  }

  const uidStr = uid.map(b => b.toString(16).padStart(2,'0')).join(' ');
  throw new Error(
    `No se pudo leer el sensor (${STRATEGIES.length} estrategias fallidas).\n` +
    `UID: ${uidStr}\n\n` +
    `Detalle:\n${errors.map(e => '· ' + e).join('\n')}\n\n` +
    'Mantén el teléfono muy quieto y plano sobre el sensor durante el escaneo.'
  );
}

// ─── Public API ───────────────────────────────────────────────

let _started = false;

export async function nfcIsAvailable(): Promise<boolean> {
  try {
    if (!_started) {
      await NfcManager.start();
      _started = true;
    }
    const [supported, enabled] = await Promise.all([
      NfcManager.isSupported(),
      NfcManager.isEnabled(),
    ]);
    return supported && enabled;
  } catch {
    return false;
  }
}

/**
 * Escanea un sensor FreeStyle Libre via NFC.
 * Llama a esta función luego de que el usuario apunte el teléfono al sensor.
 * Retorna una Promise que resuelve cuando se detecta y lee el sensor.
 */
export async function scanLibreSensor(): Promise<LibreReading> {
  if (!_started) {
    await NfcManager.start();
    _started = true;
  }

  await NfcManager.requestTechnology(NfcTech.NfcV);

  try {
    const { uid, fram } = await readFRAM();

    // Probar todos los candidatos de descifrado en orden de probabilidad
    const candidates = decryptCandidates(uid, fram);
    for (const { bytes } of candidates) {
      const result = parseFRAM(bytes);
      if (result) return result;
    }

    // Todos los candidatos fallaron — recopilar diagnóstico
    const diagLines = candidates.map(({ label, bytes }) => {
      const g = rawToMgdl(bytes[TREND_OFFSET], bytes[TREND_OFFSET + 1]);
      return `  ${label}: ${g} mg/dL`;
    });
    const uidStr = uid.map(b => b.toString(16).padStart(2,'0')).join(' ');

    throw new Error(
      `Sensor leído (${fram.length} bytes) pero ningún método de descifrado produjo glucosa válida (20–600 mg/dL).\n\n` +
      `UID: ${uidStr}\nGlucosa por método:\n${diagLines.join('\n')}\n\n` +
      'Posibles causas:\n' +
      '• Sensor en calentamiento (lleva menos de 60 min activo)\n' +
      '• Modelo con protocolo BLE obligatorio (Libre 3 o variante nueva)\n' +
      '• Mantén el teléfono muy quieto durante el escaneo'
    );
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export async function cancelScan(): Promise<void> {
  await NfcManager.cancelTechnologyRequest().catch(() => {});
}

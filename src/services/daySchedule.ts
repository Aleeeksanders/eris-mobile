// ============================================================
// Eris Mobile — el día de cada persona
//
// El día de COMIDA termina cuando la persona se duerme, no a medianoche, y el horario de las comidas se arma sobre su hora de
// despertar (services/mealSchedule.ts; pedido del usuario, 2026-10-10: "¿y la gente que trasnocha?"). Acá vive lo que se
// sabe del sueño, para que cualquier pantalla pueda preguntar "¿qué día de comida es hoy?" sin esperar a Health Connect:
//   - el fin del sueño principal de hoy (MetricsService lo pasa al leer el sueño),
//   - el despertar habitual de las últimas 3 semanas según el reloj (se recalcula una vez al día),
//   - o la hora que el usuario fijó en Perfil ("normalmente me levanto a las…"), que manda si existe.
// Sin nada de eso, el día de comida parte a las 5:00 y el horario es el de siempre.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { nutritionDayKey, nutritionDayOf, wakeHourFor, type DayCtx } from './mealSchedule';
import { PROFILE_CHANGED_EVENT } from './ScopedStorage';

const KEY_DETECTED = 'eris_usual_wake_v1';    // { hour, nights, day } según el reloj
const KEY_MANUAL = 'eris_usual_wake_manual';  // hora fijada en Perfil (número, horas con decimales)
const KEY_HINT = 'eris_usual_wake_hint';      // hora aproximada que dio en la bienvenida (pesa menos que el reloj)
export const DAY_SCHEDULE_EVENT = 'ERIS_DAY_SCHEDULE_CHANGED';

const okHour = (h: unknown): h is number => typeof h === 'number' && Number.isFinite(h) && h >= 0 && h < 24;

class DayScheduleStore {
  private wakeAt: string | null = null;
  private detected: { hour: number; nights: number; day: string; sleepHours?: number } | null = null;
  private manual: number | null = null;
  private hint: number | null = null;
  private loading: Promise<void> | null = null;

  /** Lo que se sabe del sueño (para mealSchedule). */
  ctx(): DayCtx {
    return { wakeAt: this.wakeAt, usualWake: this.usualWake() };
  }

  /** El despertar habitual: el de Perfil si lo fijó; si no, el del reloj; si no, el aproximado de la bienvenida. */
  usualWake(): number | null {
    return this.manual ?? this.detected?.hour ?? this.hint ?? null;
  }

  /** Cuánto duerme normalmente (sueño principal, según el reloj); 8 h si no se sabe. */
  sleepHours(): number {
    const h = this.detected?.sleepHours;
    return typeof h === 'number' && h >= 3 && h <= 14 ? h : 8;
  }

  /** ¿Se sabe algo del sueño (hoy o habitual)? Sin esto el reloj interno usa un día de 7:30 a 23:30. */
  hasData(): boolean {
    return this.wakeAt != null || this.usualWake() != null;
  }

  /** Lo que muestra Perfil. */
  info() {
    return { manual: this.manual, detected: this.detected?.hour ?? null, nights: this.detected?.nights ?? 0 };
  }

  /** "Sat Oct 10 2026": el día de comida de ahora (a las 2 AM sin haber dormido, sigue siendo el de ayer). */
  todayKey(now: Date = new Date()): string {
    return nutritionDayKey(now, this.ctx());
  }

  /** El día de comida de ahora, a medianoche. */
  todayDate(now: Date = new Date()): Date {
    return nutritionDayOf(now, this.ctx());
  }

  /** La hora de despertar que arma el horario de hoy (la de hoy o la habitual). */
  wakeHour(now: Date = new Date()): number | undefined {
    return wakeHourFor(this.ctx(), now);
  }

  load(): Promise<void> {
    if (!this.loading) {
      this.loading = AsyncStorage.multiGet([KEY_DETECTED, KEY_MANUAL, KEY_HINT]).then(([[, det], [, man], [, hin]]) => {
        try { const d = det ? JSON.parse(det) : null; if (d && okHour(d.hour)) this.detected = d; } catch {}
        const m = man != null ? parseFloat(man) : NaN;
        if (okHour(m)) this.manual = m;
        const h = hin != null ? parseFloat(hin) : NaN;
        if (okHour(h)) this.hint = h;
        DeviceEventEmitter.emit(DAY_SCHEDULE_EVENT);
      }).catch(() => {});
    }
    return this.loading;
  }

  /** Fin del sueño principal (el más largo) de las últimas 24 h, según Health Connect. */
  setWakeAt(iso: string | null | undefined) {
    if (!iso || iso === this.wakeAt) return;
    this.wakeAt = iso;
    DeviceEventEmitter.emit(DAY_SCHEDULE_EVENT);
  }

  /** La hora fijada en Perfil (null = quitarla y volver a lo del reloj). */
  async setManual(hour: number | null) {
    this.manual = okHour(hour) ? hour : null;
    try {
      if (this.manual == null) await AsyncStorage.removeItem(KEY_MANUAL);
      else await AsyncStorage.setItem(KEY_MANUAL, String(this.manual));
    } catch {}
    DeviceEventEmitter.emit(DAY_SCHEDULE_EVENT);
  }

  /** La hora aproximada que dio en la bienvenida: sirve mientras el reloj no sepa (no pisa ni a Perfil ni al reloj). */
  async setHint(hour: number | null) {
    this.hint = okHour(hour) ? hour : null;
    try {
      if (this.hint == null) await AsyncStorage.removeItem(KEY_HINT);
      else await AsyncStorage.setItem(KEY_HINT, String(this.hint));
    } catch {}
    DeviceEventEmitter.emit(DAY_SCHEDULE_EVENT);
  }

  /** Otra cuenta en el mismo teléfono: su horario es otro (cada cuenta tiene lo suyo guardado aparte, ver ScopedStorage). */
  resetForAccount() {
    this.detected = null;
    this.manual = null;
    this.hint = null;
    this.loading = null;
    this.load();
  }

  /** Una vez al día: el despertar habitual de las últimas semanas según el reloj. */
  async refreshUsual(read: () => Promise<{ hour: number; nights: number; sleepHours?: number } | null>) {
    await this.load();
    const day = new Date().toDateString();
    if (this.detected?.day === day) return;
    const r = await read().catch(() => null);
    if (!r || !okHour(r.hour)) return;
    this.detected = { hour: Math.round(r.hour * 4) / 4, nights: r.nights, day, ...(r.sleepHours ? { sleepHours: Math.round(r.sleepHours * 4) / 4 } : {}) };
    try { await AsyncStorage.setItem(KEY_DETECTED, JSON.stringify(this.detected)); } catch {}
    DeviceEventEmitter.emit(DAY_SCHEDULE_EVENT);
  }
}

export const daySchedule = new DayScheduleStore();
DeviceEventEmitter.addListener(PROFILE_CHANGED_EVENT, () => daySchedule.resetForAccount());

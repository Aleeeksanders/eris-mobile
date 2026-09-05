import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HealthSnapshot } from './MetricsService';

const COOLDOWN_KEY = 'eris_proactive_cd';
const COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20 h por regla

interface Cooldowns { [ruleId: string]: number }

class ProactiveService {
  private ready = false;

  async init(): Promise<void> {
    try {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status === 'granted') { this.ready = true; return; }
      if (!canAskAgain) return;
      const res = await Notifications.requestPermissionsAsync();
      this.ready = res.status === 'granted';
    } catch { /* HC not available or permissions fail — silent */ }
  }

  async check(snap: HealthSnapshot | null): Promise<void> {
    if (!this.ready) return;

    const raw = await AsyncStorage.getItem(COOLDOWN_KEY);
    const cd: Cooldowns = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    const canFire = (id: string) => !cd[id] || now - cd[id] > COOLDOWN_MS;
    const fired: Cooldowns = { ...cd };

    const notify = async (id: string, title: string, body: string) => {
      if (!canFire(id)) return;
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true },
        trigger: null,
      });
      fired[id] = now;
    };

    // FC reposo elevada (>78 lpm es señal de estrés/sobreentrenamiento)
    const hr = snap?.heartRate?.resting;
    if (hr && hr > 78) {
      await notify('hr_high', '⚡ Eris', `FC en reposo: ${hr} lpm. Puede ser estrés o sobreentrenamiento. Considera un día de recovery.`);
    }

    // Sueño escaso (<5.5 h)
    const sleepH = snap?.sleep?.durationHours;
    if (sleepH !== null && sleepH !== undefined && sleepH < 5.5) {
      await notify('sleep_low', '⚡ Eris', `Dormiste ${sleepH.toFixed(1)}h. El recovery pasa mientras duermes — esta noche intenta llegar a 7h.`);
    }

    // Poca actividad después de las 17:00
    const hour = new Date().getHours();
    const steps = snap?.steps ?? 0;
    const activeMins = snap?.activeMinutes ?? 0;
    if (hour >= 17 && steps < 3000 && activeMins < 15) {
      await notify('low_activity', '⚡ Eris', 'Poca actividad hoy. ¿15 minutos antes de cenar? Cualquier movimiento cuenta.');
    }

    // Días sin entrenar (usa el bridge de Toji)
    try {
      const lastWkStr = await AsyncStorage.getItem('toji_last_workout');
      if (lastWkStr) {
        const diffDays = Math.floor((now - new Date(lastWkStr).getTime()) / 86_400_000);
        if (diffDays >= 3) {
          await notify('no_workout', '⚡ Eris', `${diffDays} días sin entrenar. Una sesión de 20 min ya rompe la racha.`);
        }
      }
    } catch { /* AsyncStorage read fail */ }

    await AsyncStorage.setItem(COOLDOWN_KEY, JSON.stringify(fired));
  }
}

export const proactiveService = new ProactiveService();

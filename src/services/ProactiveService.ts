import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wsManager } from './WebSocketManager';
import { erisNotifications } from './ErisNotifications';

const COOLDOWN_KEY = 'eris_proactive_cd';
const COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20 h de reuso por regla
const TIP_RULE_ID = 'baseline_tip';
const ATTEMPT_GAP_MS = 30 * 60 * 1000; // 30 min — no golpear el backend en cada toggle de foreground/background
const TIP_TIMEOUT_MS = 12_000; // acotado — nunca bloquea el foreground de la app

interface Cooldowns { [ruleId: string]: number }

class ProactiveService {
  private ready = false;

  async init(): Promise<void> {
    try {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      await erisNotifications.init(); // canales y botones antes de la primera notificación
      if (status === 'granted') { this.ready = true; return; }
      if (!canAskAgain) return;
      const res = await Notifications.requestPermissionsAsync();
      this.ready = res.status === 'granted';
    } catch { /* HC not available or permissions fail — silent */ }
  }

  /**
   * Pide al backend un tip personalizado basado en el patrón histórico del
   * usuario (BaselineEngine) y lo dispara como notificación local si hay algo
   * que decir. Reemplaza la vieja cascada local de umbrales genéricos.
   */
  async requestTip(): Promise<void> {
    if (!this.ready) return;
    // "Alertas proactivas" apagado en Perfil: ni siquiera se le pide el consejo al servidor (es una pasada del modelo)
    if (!(await erisNotifications.tipsEnabled())) return;

    const raw = await AsyncStorage.getItem(COOLDOWN_KEY);
    const cd: Cooldowns & { lastAttempt?: number } = raw ? JSON.parse(raw) : {};
    const now = Date.now();

    if (cd.lastAttempt && now - cd.lastAttempt < ATTEMPT_GAP_MS) return;
    if (cd[TIP_RULE_ID] && now - cd[TIP_RULE_ID] < COOLDOWN_MS) return;

    cd.lastAttempt = now;
    await AsyncStorage.setItem(COOLDOWN_KEY, JSON.stringify(cd));

    const text = await this.fetchTip();
    if (!text) return;

    cd[TIP_RULE_ID] = Date.now();
    await AsyncStorage.setItem(COOLDOWN_KEY, JSON.stringify(cd));
    await erisNotifications.tip(text).catch(() => {});
  }

  private fetchTip(): Promise<string | null> {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        unsub();
        resolve(null);
      }, TIP_TIMEOUT_MS);

      const unsub = wsManager.subscribeMessage((data: any) => {
        if (done) return;
        if (data?.type === 'proactive_tip' && data.text) {
          done = true;
          clearTimeout(timer);
          unsub();
          resolve(data.text);
        } else if (data?.type === 'proactive_tip_skipped') {
          done = true;
          clearTimeout(timer);
          unsub();
          resolve(null);
        }
      });

      wsManager.sendMessage({ type: 'request_proactive_tip' });
    });
  }
}

export const proactiveService = new ProactiveService();

// ============================================================
// Eris Mobile — notificaciones con la identidad de Eris
//
// Antes cada parte armaba su notificación a mano y en Android todas caían en un mismo canal genérico: una glucosa
// crítica podía llegar sin asomarse arriba (la prioridad la decide el CANAL desde Android 8), con la app abierta no se
// mostraba nada (no había manejador), tocarla no llevaba a ningún lado, las alertas se apilaban y las aprobaciones
// quedaban en la bandeja aunque ya estuvieran respondidas. Acá vive todo: canales con nombre propio (el usuario puede
// silenciar uno sin perder los demás), textos en la voz de la asistente, color de su núcleo, una sola notificación
// viva por tema y botones que hacen algo.
// ============================================================
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, DeviceEventEmitter, Platform } from 'react-native';
import { wsManager } from './WebSocketManager';
import { AuthStorage } from './AuthStorage';
import { PersonaStore, personaName } from '../config/persona';
import { plainPreview, glucoseCopy, COLORS } from './notificationCopy';
import { DEFAULT_REMINDER_SETTINGS, type PlannedReminder, type ReminderSettings } from './reminderRules';

type Kind = 'glucose_urgent' | 'glucose' | 'reply' | 'tip' | 'approval' | 'meal' | 'water' | 'training' | 'finance' | 'summary' | 'supplement' | 'sleep' | 'focus' | 'finance_auto' | 'rest' | 'hestia' | 'hestia_aviso';

const { AndroidImportance, AndroidNotificationVisibility } = Notifications;

/** Canales de Android: nombre y descripción los ve el usuario en Ajustes → Notificaciones de Eris. */
const CHANNELS: Record<Kind, Notifications.NotificationChannelInput & { id: string }> = {
  // Hestia como JARVIS · L0 (2026-11-17): el equipo al límite (RAM, disco, temperatura) y lo que Hestia hizo para protegerlo.
  // Solo llega a la cuenta de Ikaros (el servidor no se lo manda a nadie más)
  hestia: {
    id: 'hestia-equipo', name: 'Hestia · equipo', description: 'Cuando tu PC está al límite (RAM, disco, temperatura) y lo que hizo Hestia para cuidarlo.',
    importance: AndroidImportance.HIGH, vibrationPattern: [0, 200, 120, 200], lightColor: '#F59E0B',
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE, enableVibrate: true,
  },
  // Hestia como JARVIS · L1 (2026-11-17): lo que Hestia te habría dicho en voz alta y no pudo (sin audífonos, «no molestar», una
  // reunión, de noche): la bienvenida a casa y otros avisos. Sin sonido: se lee cuando mires. Solo Ikaros.
  hestia_aviso: {
    id: 'hestia-avisos', name: 'Hestia · avisos', description: 'Lo que Hestia te diría en voz alta cuando no puede hablarte (sin audífonos, en una reunión o de noche).',
    importance: AndroidImportance.DEFAULT, lightColor: '#F59E0B', sound: null, enableVibrate: false,
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
  },
  // Fin del descanso en Forge (2026-11-05): vibra y se ve con la pantalla bloqueada, sin sonido para no cortar la música
  rest: {
    id: 'eris-forge-descanso', name: 'Descanso entre series', description: 'Vibra cuando se acaba tu descanso en Forge. Sin sonido, para no cortar tu música.',
    importance: AndroidImportance.HIGH, vibrationPattern: [0, 300, 150, 300], lightColor: '#F5C542', sound: null,
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC, enableVibrate: true,
  },
  glucose_urgent: {
    id: 'eris-salud-urgente', name: 'Alertas urgentes de salud',
    description: 'Glucosa en un rango peligroso. Suenan y aparecen aunque estés en otra app.',
    importance: AndroidImportance.MAX, vibrationPattern: [0, 400, 200, 400, 200, 400], lightColor: '#F43F5E',
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC, enableVibrate: true,
  },
  glucose: {
    id: 'eris-salud', name: 'Avisos de salud', description: 'Glucosa fuera de tu rango.',
    importance: AndroidImportance.HIGH, vibrationPattern: [0, 250, 150, 250], lightColor: '#F59E0B',
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC, enableVibrate: true,
  },
  reply: {
    id: 'eris-respuestas', name: 'Respuestas', description: 'Cuando Eris termina de responderte y estás en otra app.',
    importance: AndroidImportance.DEFAULT, vibrationPattern: [0, 120], lightColor: '#34D399',
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
  },
  tip: {
    id: 'eris-consejos', name: 'Consejos del día', description: 'Lo que Eris nota en tus datos y te conviene saber.',
    importance: AndroidImportance.DEFAULT, vibrationPattern: [0, 120, 80, 120], lightColor: '#34D399',
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
  },
  approval: {
    id: 'eris-aprobaciones', name: 'Aprobaciones', description: 'Hestia necesita tu permiso para una acción en el PC o en la bóveda.',
    importance: AndroidImportance.HIGH, vibrationPattern: [0, 200, 100, 200], lightColor: '#3B82F6',
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE, enableVibrate: true,
  },
  // Avisos del día (ReminderPlanner): cada tipo en su canal para poder silenciar uno sin perder los demás
  meal: {
    id: 'eris-comidas', name: 'Comidas', description: 'Comer a buena hora, colaciones, proteína que te falta y anotar lo que comiste.',
    importance: AndroidImportance.DEFAULT, vibrationPattern: [0, 120, 80, 120], lightColor: '#34D399',
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
  },
  water: {
    id: 'eris-agua', name: 'Agua', description: 'Cuando vas atrasado con tu meta de agua del día.',
    importance: AndroidImportance.DEFAULT, vibrationPattern: [0, 100], lightColor: '#38BDF8',
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
  },
  training: {
    id: 'eris-entreno', name: 'Entreno', description: 'Días que te toca entrenar, días sin moverte y tu racha de Forge.',
    importance: AndroidImportance.DEFAULT, vibrationPattern: [0, 150, 80, 150], lightColor: '#F97316',
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
  },
  finance: {
    id: 'eris-finanzas', name: 'Finanzas', description: 'Pagos que vencen, sueldo por confirmar, presupuesto y días sin movimientos.',
    importance: AndroidImportance.DEFAULT, vibrationPattern: [0, 120, 80, 120], lightColor: '#E0B454',
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
  },
  // Eris administra (A0): lo que Eris anota sola de los avisos del banco. Silencioso: es un «para que sepas», con Deshacer
  finance_auto: {
    id: 'eris-finanzas-auto', name: 'Finanzas en automático', description: 'Lo que Eris anota sola de los avisos de tu banco, con «Deshacer» por si no era así.',
    importance: AndroidImportance.LOW, lightColor: '#E0B454',
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
  },
  // Sueño 2.0 · S4: silencioso (sin sonido): el «a acostarse» puede llegar pasadas las 22:30
  sleep: {
    id: 'eris-sueno', name: 'Sueño', description: 'Hasta qué hora el café y, si tu horario se viene corriendo, cuándo empezar a bajar el ritmo para dormir.',
    importance: AndroidImportance.LOW, lightColor: '#A78BFA',
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
  },
  // ⚡ Modo Rendimiento (R1): solo el día que la persona eligió el día exigente
  focus: {
    id: 'eris-dia-exigente', name: 'Día exigente', description: 'Con el Modo Rendimiento: el café a la hora justa, la siesta-café y tus bloques de foco.',
    importance: AndroidImportance.DEFAULT, vibrationPattern: [0, 80, 60, 80], lightColor: '#F59E0B',
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
  },
  supplement: {
    id: 'eris-suplementos', name: 'Suplementos', description: 'La hora de tus suplementos, con «Tomado» sin abrir la app.',
    importance: AndroidImportance.DEFAULT, vibrationPattern: [0, 100, 60, 100], lightColor: '#A78BFA',
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
  },
  summary: {
    id: 'eris-resumen', name: 'Resumen del día', description: 'Lo que viene en la mañana y el cierre del día en la noche.',
    importance: AndroidImportance.DEFAULT, vibrationPattern: [0, 100], lightColor: '#34D399',
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
  },
};

/** Los avisos programados del día se reconocen por este prefijo (para reemplazarlos o quitarlos al recalcular). */
export const PLAN_PREFIX = 'eris-plan-';
// Revisión Z1 (2026-11-04): 'sleep' faltaba: los avisos de Sueño 2.0 (a la cama, último café) no se veían con la app abierta
const PLAN_KINDS = new Set<string>(['meal', 'water', 'training', 'finance', 'summary', 'supplement', 'focus', 'sleep']);
/** Los avisos de «Mis suplementos» (fase I5): los programa supplementStore, aparte de los del día. */
export const SUP_PREFIX = 'eris-sup-';
/** Una compra con boleta de productos (súper, farmacia, casa): la notificación de lo que Eris anotó ofrece «🧾 Boleta» */
const conBoleta = (h: { como?: string; cat?: string }) => (h.como === 'gasto' || h.como == null) && ['alimentacion', 'hogar', 'salud'].includes(String(h.cat));
const CATEGORY_IDS: Record<string, string> = {
  meal: 'eris-comida', meal_ideas: 'eris-comida-ideas', water: 'eris-agua', training: 'eris-entreno', finance: 'eris-finanzas',
  intent: 'eris-entreno-hoy', supplement: 'eris-suplemento', plan_meal: 'eris-plan-comida', plan_cue: 'eris-plan-paso',
  fin_auto: 'eris-fin-auto', fin_auto_varios: 'eris-fin-auto-varios', fin_auto_abono: 'eris-fin-auto-abono', fin_auto_compra: 'eris-fin-auto-compra',
  fin_cuadre: 'eris-fin-cuadre', fin_cuadre_ver: 'eris-fin-cuadre-ver', fin_cuadre_hecho: 'eris-fin-cuadre-hecho',
  hestia_cargo: 'hestia-cargo',
};
const PENDING_WATER_KEY = 'eris_pending_water_quick';
/** L2: la notificación de un cargo (una por aviso del banco) */
const idCargo = (id: unknown) => `hestia-cargo-${String(id ?? '').replace(/[^\w-]/g, '').slice(0, 80)}`;
/** «Rechazar» tocado sin conexión: se manda al volver (revisión I1) */
const PENDING_REJECT_KEY = 'eris_notif_pending_reject';
/** El resumen del domingo (A3): uno solo, se reprograma */
const IDS_DOMINGO = 'eris-resumen-domingo';
const HANDLED_KEY = 'eris_handled_notification_actions';
/** Algo cambió en los avisos (Perfil, Forge, Finanzas, un "+250 ml"): ReminderPlanner vuelve a calcular. */
export const PLAN_REFRESH_EVENT = 'ERIS_PLAN_REFRESH';
/** Abrir el chat con una pregunta ya escrita desde cualquier pantalla (p. ej. "Díselo a Eris" en el buscador). Lo atiende App. */
export const ERIS_ASK_EVENT = 'ERIS_ASK';
export const reminderSettingsKey = (profileId: string) => `eris_reminders_${profileId}`;

/** Color del núcleo de la asistente (menta Eris / brasa Hestia): tiñe el ícono y el nombre en la notificación. */
const personaColor = () => (PersonaStore.get() === 'hestia' ? '#F59E0B' : '#34D399');

/** Una sola notificación viva por tema: la nueva reemplaza a la anterior en vez de apilarse. */
const IDS = { glucose: 'eris-glucosa', reply: 'eris-respuesta', tip: 'eris-consejo' };

/** Lo que hay que hacer al tocar una notificación o uno de sus botones (lo ejecuta App, que sabe abrir el chat). */
export interface NotificationOpen {
  kind: Kind | string;
  action: string;
  message?: string;
  /** a dónde lleva tocar la notificación: el chat (por defecto), Forge, Finanzas o solo abrir la app */
  tap?: 'eris' | 'forge' | 'finanzas' | 'home' | 'sleep';
}
export const NOTIFICATION_OPEN_EVENT = 'ERIS_NOTIFICATION_OPEN';
export const APPROVAL_ANSWERED_EVENT = 'ERIS_APPROVAL_ANSWERED';

class ErisNotificationsService {
  private ready: Promise<void> | null = null;
  private approvalNotis = new Map<string, string>(); // id de la aprobación → id de su notificación
  private lastReplyId: string | null = null;

  /** Canales, botones, cómo se ven con la app abierta y qué pasa al tocarlas. Idempotente. */
  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      Notifications.setNotificationHandler({
        handleNotification: async (n) => {
          // Con la app abierta solo se muestra la salud (lo demás ya está en pantalla: el chat, la tarjeta de aprobación)
          const kind = (n.request.content.data as any)?.kind;
          const show = kind === 'glucose_urgent' || kind === 'glucose';
          // Los avisos del día también se ven con la app abierta (son de una hora puntual), pero sin sonar
          if (PLAN_KINDS.has(kind)) return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
          // Lo que Eris anotó sola: con la app abierta ya se ve en Finanzas → Hoy; queda en la bandeja, sin asomarse
          if (kind === 'finance_auto') return { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
          return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
        },
      });
      if (Platform.OS === 'android') {
        for (const ch of Object.values(CHANNELS)) {
          const { id, ...cfg } = ch;
          await Notifications.setNotificationChannelAsync(id, cfg).catch(() => {});
        }
      }
      await Notifications.setNotificationCategoryAsync('eris-glucosa', [
        { identifier: 'ayuda', buttonTitle: 'Pedir ayuda a Eris', options: { opensAppToForeground: true } },
      ]).catch(() => {});
      // Rechazar desde la notificación es seguro (no ejecuta nada); APROBAR solo dentro de la app, viendo el detalle
      await Notifications.setNotificationCategoryAsync('eris-aprobacion', [
        { identifier: 'rechazar', buttonTitle: 'Rechazar', options: { opensAppToForeground: false, isDestructive: true } },
        { identifier: 'revisar', buttonTitle: 'Revisar', options: { opensAppToForeground: true } },
      ]).catch(() => {});
      // Botones de los avisos del día. "+250 ml" anota sin abrir la app; lo demás lleva a donde corresponde.
      const cats: Array<[string, Array<[string, string, boolean]>]> = [
        [CATEGORY_IDS.meal, [['anotar', 'Anotar comida', true]]],
        [CATEGORY_IDS.meal_ideas, [['ideas', 'Pedir ideas', true], ['anotar', 'Anotar comida', true]]],
        [CATEGORY_IDS.water, [['agua250', '+250 ml', false], ['anotar', 'Otra cantidad', true]]],
        [CATEGORY_IDS.training, [['forge', 'Abrir Forge', true]]],
        [CATEGORY_IDS.finance, [['anotar_gasto', 'Anotar gasto', true], ['finanzas', 'Abrir Finanzas', true]]],
        // «¿Entrenas hoy?» se responde sin abrir la app; la hora se elige en la app
        [CATEGORY_IDS.intent, [['intent_si', 'Sí, entreno', false], ['intent_no', 'Hoy descanso', false], ['intent_hora', 'Elegir hora', true]]],
        // «Tomado» anota la toma sin abrir la app (y baja el stock del Botiquín si está enlazado)
        [CATEGORY_IDS.supplement, [['sup_tomado', 'Tomado ✓', false], ['sup_abrir', 'Ver', true]]],
        // El plan de Eris: «Lo comí ✓» anota la comida del plan tal cual sin abrir la app; si fue otra cosa, se anota en la app
        [CATEGORY_IDS.plan_meal, [['plan_comi', 'Lo comí ✓', false], ['anotar', 'Comí otra cosa', true]]],
        // El día exigente: «Hecho ✓» marca el paso (el café, la siesta-café) sin abrir la app
        [CATEGORY_IDS.plan_cue, [['plan_hecho', 'Hecho ✓', false], ['plan_ver', 'Ver mi día', true]]],
        // Eris administra: lo que anotó sola de un aviso del banco. «Deshacer» sin abrir la app; «Cambiar» abre el movimiento
        [CATEGORY_IDS.fin_auto, [['fin_deshacer', 'Deshacer', false], ['fin_cambiar', 'Cambiar', true]]],
        // Una compra que Eris anotó: «🧾 Boleta» abre la cámara para ese gasto (qué compraste y lo de la casa al inventario)
        [CATEGORY_IDS.fin_auto_compra, [['fin_deshacer', 'Deshacer', false], ['fin_cambiar', 'Cambiar', true], ['fin_boleta', '🧾 Boleta', true]]],
        [CATEGORY_IDS.fin_auto_varios, [['fin_ver', 'Ver', true]]],
        // Plata que entró y quedó como abono: «Fue un ingreso» la cambia sin abrir la app (y se aprende para esa persona)
        [CATEGORY_IDS.fin_auto_abono, [['fin_deshacer', 'Deshacer', false], ['fin_ingreso', 'Fue un ingreso', false]]],
        // Eris administra (A2): «tus finanzas no calzan». «Arreglar» aplica la explicación sin abrir la app; el ajuste al banco, nunca
        [CATEGORY_IDS.fin_cuadre, [['cuadre_arreglar', 'Arreglar', false], ['cuadre_ver', 'Ver', true]]],
        [CATEGORY_IDS.fin_cuadre_ver, [['cuadre_ver', 'Ver', true]]],
        [CATEGORY_IDS.fin_cuadre_hecho, [['cuadre_deshacer', 'Deshacer', false], ['cuadre_ver', 'Ver', true]]],
        // Hestia (L2): un cargo del banco fuera de lo común. «Sí, era yo» sin abrir la app; «No, revisar» abre el movimiento
        [CATEGORY_IDS.hestia_cargo, [['cargo_si', 'Sí, era yo', false], ['cargo_no', 'No, revisar', true]]],
      ];
      for (const [id, actions] of cats) {
        await Notifications.setNotificationCategoryAsync(id, actions.map(([identifier, buttonTitle, open]) => (
          { identifier, buttonTitle, options: { opensAppToForeground: open } }))).catch(() => {});
      }

      Notifications.addNotificationResponseReceivedListener((resp) => this.onResponse(resp));

      // La respuesta llegó mientras estabas en otra app: se avisa con su primer trozo
      wsManager.subscribeMessage((d: any) => {
        if (d?.type !== 'stream_end' || !d.content) return;
        if (AppState.currentState === 'active') return;
        if (d.id && d.id === this.lastReplyId) return;
        this.lastReplyId = d.id ?? null;
        this.reply(d.content).catch(() => {});
      });
      // Al volver a la app, el aviso de respuesta ya cumplió
      AppState.addEventListener('change', (st) => {
        if (st === 'active') Notifications.dismissNotificationAsync(IDS.reply).catch(() => {});
      });
      // "+250 ml" tocado sin conexión: se anota apenas vuelve
      wsManager.subscribeMessage((d: any) => { if (d?.type === 'connected') { this.flushPendingWater().catch(() => {}); this.flushPendingReject().catch(() => {}); } });
    })();
    return this.ready;
  }

  /** Si la app se abrió desde una notificación (estaba cerrada), lo que había que hacer. Se consume una vez. */
  takeLaunchAction(): NotificationOpen | null {
    try {
      const resp = Notifications.getLastNotificationResponse();
      if (!resp) return null;
      Notifications.clearLastNotificationResponse();
      // "+250 ml" con la app cerrada: Android la entrega al abrir; se anota (una sola vez) y no abre nada
      if (resp.actionIdentifier === 'agua250') { this.quickWater(resp).catch(() => {}); return null; }
      if (resp.actionIdentifier === 'intent_si' || resp.actionIdentifier === 'intent_no') { this.quickIntent(resp).catch(() => {}); return null; }
      if (resp.actionIdentifier === 'sup_tomado') { this.quickSupplement(resp).catch(() => {}); return null; }
      if (resp.actionIdentifier === 'fin_deshacer' || resp.actionIdentifier === 'fin_ingreso') { this.quickFinanceUndo(resp).catch(() => {}); return null; }
      if (resp.actionIdentifier === 'cuadre_arreglar' || resp.actionIdentifier === 'cuadre_deshacer') { this.quickCuadre(resp).catch(() => {}); return null; }
      // Revisión I1 (2026-11-04): «Lo comí ✓», «Hecho ✓» y «Rechazar» tocados con la app cerrada se perdían (Android los
      // entrega al abrir y acá no estaban): se hacen igual que con la app abierta, una sola vez
      if (resp.actionIdentifier === 'plan_comi' || resp.actionIdentifier === 'plan_hecho') { this.quickPlanMeal(resp).catch(() => {}); return null; }
      if (resp.actionIdentifier === 'rechazar' && (resp.notification.request.content.data as any)?.kind === 'approval') { this.quickReject(resp).catch(() => {}); return null; }
      if (resp.actionIdentifier === 'cargo_si') { Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {}); return null; }
      this.financeOpen(resp);
      return this.toOpen(resp);
    } catch { return null; }
  }

  private toOpen(resp: Notifications.NotificationResponse): NotificationOpen {
    const data = (resp.notification.request.content.data ?? {}) as any;
    return { kind: data.kind ?? '', action: resp.actionIdentifier, message: data.helpMessage ?? data.prompt, tap: data.tap };
  }

  /** Anota 250 ml desde el botón de la notificación. Idempotente: la misma notificación no suma dos veces. */
  private async quickWater(resp: Notifications.NotificationResponse) {
    const key = `${resp.notification.request.identifier}:${resp.actionIdentifier}`;
    let handled: string[] = [];
    try { handled = JSON.parse((await AsyncStorage.getItem(HANDLED_KEY)) || '[]'); } catch {}
    if (handled.includes(key)) return;
    await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify([...handled, key].slice(-30))).catch(() => {});
    Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
    if (wsManager.getStatus() === 'connected') wsManager.sendMessage({ type: 'log_water_quick', ml: 250 });
    else {
      const pending = Number((await AsyncStorage.getItem(PENDING_WATER_KEY).catch(() => null)) || 0) || 0;
      await AsyncStorage.setItem(PENDING_WATER_KEY, String(pending + 250)).catch(() => {});
    }
    DeviceEventEmitter.emit(PLAN_REFRESH_EVENT);
  }

  /** «Sí, entreno» / «Hoy descanso» desde la notificación (una sola vez por notificación). */
  private async quickIntent(resp: Notifications.NotificationResponse) {
    const key = `${resp.notification.request.identifier}:${resp.actionIdentifier}`;
    let handled: string[] = [];
    try { handled = JSON.parse((await AsyncStorage.getItem(HANDLED_KEY)) || '[]'); } catch {}
    if (handled.includes(key)) return;
    await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify([...handled, key].slice(-30))).catch(() => {});
    Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
    // require: evita el ciclo de imports (trainingIntent lee Forge, que lee las metas…)
    const { setIntent } = require('./forge/trainingIntent');
    await setIntent(resp.actionIdentifier === 'intent_si' ? { answer: 'si', kind: 'rutina', source: 'aviso' } : { answer: 'no', source: 'aviso' });
    DeviceEventEmitter.emit(PLAN_REFRESH_EVENT);
  }

  /** «Tomado ✓» desde la notificación de un suplemento (una sola vez por notificación). */
  private async quickSupplement(resp: Notifications.NotificationResponse) {
    const key = `${resp.notification.request.identifier}:${resp.actionIdentifier}`;
    let handled: string[] = [];
    try { handled = JSON.parse((await AsyncStorage.getItem(HANDLED_KEY)) || '[]'); } catch {}
    if (handled.includes(key)) return;
    await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify([...handled, key].slice(-30))).catch(() => {});
    Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
    const supId = String((resp.notification.request.content.data as any)?.supId ?? '');
    // require: evita el ciclo de imports (el store de suplementos lee Inventario y Forge)
    if (supId) await require('./supplements/supplementStore').supplementStore.tomar(supId);
  }

  /** «Lo comí ✓» de una comida del plan de Eris o «Hecho ✓» de un paso del día exigente (una sola vez por notificación; sin conexión queda en cola) */
  /**
   * «Rechazar» una aprobación desde la notificación (no ejecuta nada). Sin conexión (la app estaba cerrada) queda guardado
   * y se manda apenas hay sesión (`connected`), como «+250 ml».
   */
  private async quickReject(resp: Notifications.NotificationResponse) {
    const id = String((resp.notification.request.content.data as any)?.approvalId ?? '');
    if (!id) return;
    Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
    DeviceEventEmitter.emit(APPROVAL_ANSWERED_EVENT, id);
    if (wsManager.getStatus() === 'connected') { wsManager.sendMessage({ type: 'confirm_response', id, approved: false }); return; }
    let ids: string[] = [];
    try { ids = JSON.parse((await AsyncStorage.getItem(PENDING_REJECT_KEY)) || '[]'); } catch {}
    if (!ids.includes(id)) await AsyncStorage.setItem(PENDING_REJECT_KEY, JSON.stringify([...ids, id].slice(-20))).catch(() => {});
  }

  private async flushPendingReject() {
    let ids: string[] = [];
    try { ids = JSON.parse((await AsyncStorage.getItem(PENDING_REJECT_KEY)) || '[]'); } catch {}
    if (!ids.length) return;
    await AsyncStorage.removeItem(PENDING_REJECT_KEY).catch(() => {});
    for (const id of ids) wsManager.sendMessage({ type: 'confirm_response', id, approved: false });
  }

  private async quickPlanMeal(resp: Notifications.NotificationResponse) {
    const key = `${resp.notification.request.identifier}:${resp.actionIdentifier}`;
    let handled: string[] = [];
    try { handled = JSON.parse((await AsyncStorage.getItem(HANDLED_KEY)) || '[]'); } catch {}
    if (handled.includes(key)) return;
    await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify([...handled, key].slice(-30))).catch(() => {});
    Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
    const pasoId = String((resp.notification.request.content.data as any)?.pasoId ?? '');
    // require: evita el ciclo de imports (el plan lee Forge y Nutrición)
    if (pasoId) await require('./dayPlan/dayPlanStore').dayPlanStore.doneOrQueue(pasoId);
    DeviceEventEmitter.emit(PLAN_REFRESH_EVENT);
  }

  /**
   * «Deshacer» de lo que Eris anotó sola (una sola vez por notificación): se borra y vuelve a «Por confirmar». «Fue un
   * ingreso»: el abono pasa a ingreso extra.
   */
  private async quickFinanceUndo(resp: Notifications.NotificationResponse) {
    const key = `${resp.notification.request.identifier}:${resp.actionIdentifier}`;
    let handled: string[] = [];
    try { handled = JSON.parse((await AsyncStorage.getItem(HANDLED_KEY)) || '[]'); } catch {}
    if (handled.includes(key)) return;
    await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify([...handled, key].slice(-30))).catch(() => {});
    Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
    const clave = String((resp.notification.request.content.data as any)?.clave ?? '');
    // require: evita el ciclo de imports (Finanzas importa estas notificaciones)
    if (!clave) return;
    const fa = require('./finance/financeAuto').financeAuto;
    if (resp.actionIdentifier === 'fin_ingreso') await fa.fueIngreso(clave);
    else await fa.deshacer(clave);
  }

  /** «Arreglar» o «Deshacer» del cuadre (una sola vez por notificación), sin abrir la app */
  private async quickCuadre(resp: Notifications.NotificationResponse) {
    const key = `${resp.notification.request.identifier}:${resp.actionIdentifier}`;
    let handled: string[] = [];
    try { handled = JSON.parse((await AsyncStorage.getItem(HANDLED_KEY)) || '[]'); } catch {}
    if (handled.includes(key)) return;
    await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify([...handled, key].slice(-30))).catch(() => {});
    Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
    const data = (resp.notification.request.content.data ?? {}) as any;
    // require: evita el ciclo de imports (Finanzas importa estas notificaciones)
    const fc = require('./finance/financeCuadre').financeCuadre;
    if (resp.actionIdentifier === 'cuadre_deshacer') { for (const id of Array.isArray(data.ids) ? data.ids : []) await fc.deshacer(String(id)); return; }
    if (data.ref != null && data.exId) {
      const r = await fc.arreglar(data.ref, String(data.exId));
      await this.show('finance_auto', { title: r.ok ? 'Listo, ya calza' : 'No pude arreglarlo solo', body: r.ok ? r.msg : `${r.msg}. Ábrelo en Finanzas → Hoy.`, color: '#E0B454', sound: false, data: { tap: 'finanzas', cuadre: true, ref: data.ref } }, `eris-fin-cuadre-${String(data.ref)}`);
    }
  }

  /** «Cambiar» o tocar el aviso de lo que Eris anotó: Finanzas abre ese movimiento */
  private financeOpen(resp: Notifications.NotificationResponse) {
    const data = (resp.notification.request.content.data ?? {}) as any;
    // Hestia (L2): «No, revisar» (o tocar el aviso del cargo) abre ese movimiento en Finanzas
    if (data.cargo) {
      Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
      if (data.txId != null) { try { require('./finance/financeAuto').financeAuto.openTx(data.txId); } catch {} }
      return;
    }
    if (data.cuadre) {
      Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
      try { require('./finance/financeCuadre').financeCuadre.abrir(data.ref ?? null); } catch {}
      return;
    }
    if (data.kind !== 'finance_auto') return;
    Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
    if (data.txId != null && resp.actionIdentifier !== 'fin_ver') { try { require('./finance/financeAuto').financeAuto.openTx(data.txId, { foto: resp.actionIdentifier === 'fin_boleta' }); } catch {} }
  }

  /**
   * Lo que Eris anotó sola de los avisos del banco: uno → «Anoté $12.990 · Lider» (o «Moví…», «Llegó tu sueldo…», «Entró…»)
   * con Deshacer y Cambiar (o «Fue un ingreso» si quedó como abono); varios juntos → una sola notificación con la lista.
   */
  async financeAuto(hechos: Array<{ clave: string; txId: number | string; desc: string; monto: number; cat: string; cuentaNombre: string; last4?: string; hora: string; como?: string; titulo?: string; cuerpo?: string }>) {
    if (!hechos.length) return;
    const { clp, CAT_NOMBRE } = require('./finance/financeCore');
    const uno = hechos.length === 1 ? hechos[0] : null;
    const title = uno ? uno.titulo || `Anoté ${clp(uno.monto)} · ${uno.desc}` : `Anoté ${hechos.length} movimientos de tu banco`;
    const body = uno
      ? uno.cuerpo || `${CAT_NOMBRE[uno.cat] ?? 'Otros'} · ${uno.cuentaNombre}${uno.last4 ? ` ****${uno.last4}` : ''}. Si no era así, deshazlo o cámbialo.`
      : `${hechos.slice(0, 4).map((h) => `${h.desc} ${clp(h.monto)}`).join(' · ')}${hechos.length > 4 ? ` y ${hechos.length - 4} más` : ''}. Revísalos en Finanzas.`;
    await this.show('finance_auto', {
      title, body, color: '#E0B454', sound: false,
      categoryIdentifier: !uno ? CATEGORY_IDS.fin_auto_varios : uno.como === 'abono' ? CATEGORY_IDS.fin_auto_abono : conBoleta(uno) ? CATEGORY_IDS.fin_auto_compra : CATEGORY_IDS.fin_auto,
      data: { tap: 'finanzas', ...(uno ? { clave: uno.clave, txId: uno.txId } : {}) },
    }, `eris-fin-auto-${uno ? uno.clave.replace(/[^\w-]/g, '') : Date.now()}`);
  }

  /**
   * Eris administra (A2) — el cuadre con el banco: «Tus finanzas no calzan» (con lo que cree que es y «Arreglar»), una
   * cuenta en negativo, o lo que Eris arregló sola (con «Deshacer»). Tono tranquilo: es para revisar, no una alarma.
   */
  async financeCuadre(o: { cuenta?: { ref: string | number; nombre: string; libro: number | null; bancoNeto: number | null; diff: number; explicaciones: Array<{ id: string; texto: string; accion: any }> };
    alerta?: { ref?: string | number | null; texto: string }; arreglado?: string[]; ids?: string[] }) {
    const { clp } = require('./finance/financeCore');
    if (o.arreglado?.length) {
      await this.show('finance_auto', {
        title: 'Cuadré tus finanzas', body: `${o.arreglado.join(' · ')}. Si no era así, deshazlo.`, color: '#E0B454', sound: false,
        categoryIdentifier: o.ids?.length ? CATEGORY_IDS.fin_cuadre_hecho : CATEGORY_IDS.fin_cuadre_ver,
        data: { tap: 'finanzas', cuadre: true, ...(o.ids?.length ? { ids: o.ids } : {}) },
      }, 'eris-fin-cuadre-hecho');
      return;
    }
    if (o.alerta) {
      await this.show('finance', { title: 'Algo no calza en tus finanzas', body: `${o.alerta.texto}.`, color: '#E0B454', categoryIdentifier: CATEGORY_IDS.fin_cuadre_ver,
        data: { tap: 'finanzas', cuadre: true, ref: o.alerta.ref ?? null } }, `eris-fin-cuadre-${String(o.alerta.ref ?? 'x')}`);
      return;
    }
    const c = o.cuenta;
    if (!c) return;
    const top = c.explicaciones.find((x) => x.accion && !(x.accion.tipo === 'mover' && x.accion.a == null));
    const primera = c.explicaciones[0];
    const creo = primera ? ` Creo que ${primera.texto.charAt(0).toLowerCase()}${primera.texto.slice(1)}.` : ' No encuentro por qué: revísalo cuando puedas.';
    await this.show('finance', {
      title: 'Tus finanzas no calzan',
      body: `Tu ${c.nombre} dice ${clp(c.bancoNeto ?? 0)} y yo llevo ${clp(c.libro ?? 0)}.${creo}`,
      color: '#E0B454',
      categoryIdentifier: top ? CATEGORY_IDS.fin_cuadre : CATEGORY_IDS.fin_cuadre_ver,
      data: { tap: 'finanzas', cuadre: true, ref: c.ref, ...(top ? { exId: top.id } : {}) },
    }, `eris-fin-cuadre-${String(c.ref)}`);
  }

  /**
   * Los avisos de «Mis suplementos»: reemplaza los anteriores y programa los que vienen. Las tomas ya hechas no avisan, y
   * su aviso que quedó en la bandeja se quita.
   */
  async scheduleSupplements(list: Array<{ id: string; supId: string; at: Date; title: string; body: string }>) {
    await this.init();
    try {
      const keep = new Set(list.map((x) => x.id));
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(scheduled.filter((n) => n.identifier.startsWith(SUP_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
      const shown = await Notifications.getPresentedNotificationsAsync();
      for (const n of shown) if (n.request.identifier.startsWith(SUP_PREFIX) && !keep.has(n.request.identifier)) Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
      const color = personaColor();
      for (const r of list) {
        if (r.at.getTime() <= Date.now() + 30_000) continue;
        await Notifications.scheduleNotificationAsync({
          identifier: r.id,
          content: { title: r.title, body: r.body, color, sound: true, categoryIdentifier: CATEGORY_IDS.supplement, data: { kind: 'supplement', tap: 'home', supId: r.supId } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at,
            ...(Platform.OS === 'android' ? { channelId: CHANNELS.supplement.id } : {}),
          },
        }).catch(() => {});
      }
    } catch {}
  }

  /**
   * Eris administra (A3): el domingo a las 19:00, lo que Eris hizo sola en la semana. Se reprograma cada vez que la app
   * corre (con lo de ahora); null = no hay nada que contar o lo apagó (se quita el programado).
   */
  async scheduleDomingo(r: { at: Date; lineas: string[] } | null) {
    await this.init();
    try {
      await Notifications.cancelScheduledNotificationAsync(IDS_DOMINGO).catch(() => {});
      if (!r || !r.lineas.length || r.at.getTime() <= Date.now() + 30_000) return;
      await Notifications.scheduleNotificationAsync({
        identifier: IDS_DOMINGO,
        content: { title: 'Lo que hice sola esta semana', body: r.lineas.join('\n'), color: '#E0B454', sound: false, data: { kind: 'summary', tap: 'home' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, ...(Platform.OS === 'android' ? { channelId: CHANNELS.summary.id } : {}) },
      });
    } catch {}
  }

  private async flushPendingWater() {
    const pending = Number((await AsyncStorage.getItem(PENDING_WATER_KEY)) || 0) || 0;
    if (!(pending > 0)) return;
    await AsyncStorage.removeItem(PENDING_WATER_KEY);
    for (let ml = pending; ml > 0; ml -= 250) wsManager.sendMessage({ type: 'log_water_quick', ml: Math.min(250, ml) });
  }

  private onResponse(resp: Notifications.NotificationResponse) {
    const data = (resp.notification.request.content.data ?? {}) as any;
    if (resp.actionIdentifier === 'agua250') {
      try { Notifications.clearLastNotificationResponse(); } catch {} // que no se vuelva a anotar al reabrir la app
      this.quickWater(resp).catch(() => {});
      return;
    }
    if (resp.actionIdentifier === 'intent_si' || resp.actionIdentifier === 'intent_no') {
      try { Notifications.clearLastNotificationResponse(); } catch {}
      this.quickIntent(resp).catch(() => {});
      return;
    }
    if (resp.actionIdentifier === 'sup_tomado') {
      try { Notifications.clearLastNotificationResponse(); } catch {}
      this.quickSupplement(resp).catch(() => {});
      return;
    }
    if (resp.actionIdentifier === 'plan_comi' || resp.actionIdentifier === 'plan_hecho') {
      try { Notifications.clearLastNotificationResponse(); } catch {}
      this.quickPlanMeal(resp).catch(() => {});
      return;
    }
    if (resp.actionIdentifier === 'cuadre_arreglar' || resp.actionIdentifier === 'cuadre_deshacer') {
      try { Notifications.clearLastNotificationResponse(); } catch {}
      this.quickCuadre(resp).catch(() => {});
      return;
    }
    if (resp.actionIdentifier === 'fin_deshacer' || resp.actionIdentifier === 'fin_ingreso') {
      try { Notifications.clearLastNotificationResponse(); } catch {}
      this.quickFinanceUndo(resp).catch(() => {});
      return;
    }
    // Hestia (L2): «Sí, era yo»: el cargo queda como está (y la notificación se va)
    if (resp.actionIdentifier === 'cargo_si') {
      try { Notifications.clearLastNotificationResponse(); } catch {}
      Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
      return;
    }
    this.financeOpen(resp);
    if (String(resp.notification.request.identifier).startsWith(SUP_PREFIX)) {
      Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
    }
    // Un aviso del día ya cumplió al tocarlo: fuera de la bandeja
    if (String(resp.notification.request.identifier).startsWith(PLAN_PREFIX)) {
      Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
    }
    if (data.kind === 'approval' && resp.actionIdentifier === 'rechazar' && data.approvalId) {
      try { Notifications.clearLastNotificationResponse(); } catch {}
      this.quickReject(resp).catch(() => {});
      return;
    }
    DeviceEventEmitter.emit(NOTIFICATION_OPEN_EVENT, this.toOpen(resp));
  }

  /**
   * El aviso de Forge a una hora exacta (fin del descanso, objetivo del cronómetro). Con la app abierta no se muestra: vibra
   * la app. Tocarlo vuelve a Forge. Se reemplaza por identificador.
   */
  async forgeAlarm(id: string, at: number, title: string, body: string) {
    await this.init();
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: { title, body, data: { kind: 'rest', tap: 'forge' }, sound: false, ...(Platform.OS === 'android' ? { color: '#F5C542' } : {}) },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), ...(Platform.OS === 'android' ? { channelId: CHANNELS.rest.id } : {}) },
      });
    } catch {}
  }

  /** Quita ese aviso: si todavía no sonaba y si ya está en la bandeja. */
  async cancelForgeAlarm(id: string) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await Notifications.dismissNotificationAsync(id).catch(() => {});
  }

  private async show(kind: Kind, content: Notifications.NotificationContentInput, identifier?: string): Promise<string | null> {
    await this.init();
    try {
      return await Notifications.scheduleNotificationAsync({
        identifier,
        content: { ...content, data: { ...(content.data ?? {}), kind } },
        trigger: Platform.OS === 'android' ? { channelId: CHANNELS[kind].id } : null,
      });
    } catch { return null; }
  }

  /** Hestia · equipo (L0): un aviso del vigía del PC. Uno por límite: el siguiente del mismo reemplaza al anterior */
  async hestiaEquipo(a: { texto: string; nivel: string; clave: string }) {
    const titulo = a.nivel === 'vuelve' ? 'Hestia · todo bien de nuevo' : a.nivel === 'accion' ? 'Hestia cuidó el equipo' : 'Hestia · ojo con el PC';
    await this.show('hestia', { title: titulo, body: a.texto, color: '#F59E0B', sound: a.nivel === 'accion', data: { tap: 'home' } }, `hestia-equipo-${a.clave}`);
  }

  /**
   * L2: «¿Reconoces este cargo?» con «Sí, era yo» (sin abrir la app) y «No, revisar» (abre el movimiento). Con sonido suave:
   * es plata que salió. Una por aviso del banco; si lo contestaste por voz, se quita (cerrarCargo).
   */
  async hestiaCargo(a: { titulo: string; texto: string; clave: string; datos?: { id?: string; txId?: unknown; porConfirmar?: boolean } }) {
    await this.show('hestia_aviso', {
      title: a.titulo || '¿Reconoces este cargo?', body: a.texto, color: '#F59E0B', sound: true, categoryIdentifier: CATEGORY_IDS.hestia_cargo,
      data: { tap: 'finanzas', cargo: true, txId: a.datos?.txId ?? null, id: a.datos?.id ?? null },
    }, idCargo(a.datos?.id ?? a.clave));
  }

  /** L2: contestaste el cargo por voz en la llamada: la notificación ya no hace falta */
  cerrarCargo(id: string) { Notifications.dismissNotificationAsync(idCargo(id)).catch(() => {}); }

  /** L1: un aviso de Hestia que no se pudo decir en voz alta (la bienvenida a casa…) */
  async hestiaAviso(a: { titulo: string; texto: string; clave: string }) {
    await this.show('hestia_aviso', { title: a.titulo || 'Hestia', body: a.texto, color: '#F59E0B', sound: false, data: { tap: 'home' } }, `hestia-aviso-${a.clave}`);
  }

  /** Alerta de glucosa del sensor: reemplaza la anterior (no se apilan) y ofrece pedirle ayuda a Eris. */
  async glucose(a: { alertType: string; value: number; trend?: string }) {
    const c = glucoseCopy(a.alertType, a.value, a.trend);
    await this.show(c.kind, {
      title: c.title, body: c.body, color: c.color, sound: true,
      priority: c.kind === 'glucose_urgent' ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
      categoryIdentifier: 'eris-glucosa',
      data: { helpMessage: `Mi glucosa está en ${Math.round(Number(a.value))} mg/dL${a.trend ? ` ${a.trend}` : ''}. ¿Qué hago ahora?` },
    }, IDS.glucose);
  }

  /** Consejo del día (si el usuario no apagó "Alertas proactivas" en Perfil). */
  async tip(text: string) {
    if (!(await this.tipsEnabled())) return;
    await this.show('tip', { title: 'Un consejo para hoy', body: plainPreview(text, 240), color: personaColor(), sound: true }, IDS.tip);
  }

  /** La respuesta quedó lista mientras estabas en otra app. */
  async reply(text: string) {
    const body = plainPreview(text);
    if (!body) return;
    await this.show('reply', { title: `${personaName()} te respondió`, body, color: personaColor(), sound: true }, IDS.reply);
  }

  /** Hestia necesita permiso para algo (comando, archivo, bóveda). Se quita sola cuando se responde o vence. */
  async approval(a: { id: string; title: string; detail?: string; risk?: string }) {
    const first = plainPreview(String(a.detail ?? '').split('\n').find((l) => l.trim()) ?? '', 120);
    const notiId = await this.show('approval', {
      title: `${personaName()} necesita tu aprobación`,
      body: first ? `${a.title} · ${first}` : a.title,
      color: a.risk === 'high' ? COLORS.urgent : COLORS.approval,
      sound: true, priority: Notifications.AndroidNotificationPriority.MAX,
      categoryIdentifier: 'eris-aprobacion',
      data: { approvalId: a.id },
    });
    if (notiId) this.approvalNotis.set(a.id, notiId);
  }

  /** La aprobación se respondió (en la app o en la notificación) o venció: fuera de la bandeja. */
  dismissApproval(id: string) {
    const notiId = this.approvalNotis.get(id);
    if (!notiId) return;
    this.approvalNotis.delete(id);
    Notifications.dismissNotificationAsync(notiId).catch(() => {});
  }

  /**
   * Deja programados los avisos del día (ReminderPlanner): reemplaza los anteriores y quita de la bandeja los que ya
   * se resolvieron (`stillRelevant`: lo que el plan del día completo todavía pide; p. ej. si ya anotaste el almuerzo,
   * "¿Qué almorzaste?" desaparece). Android los entrega aunque la app esté cerrada.
   */
  async schedulePlan(plan: PlannedReminder[], stillRelevant?: Set<string>) {
    await this.init();
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(scheduled.filter((n) => n.identifier.startsWith(PLAN_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
      if (stillRelevant) {
        const shown = await Notifications.getPresentedNotificationsAsync();
        for (const n of shown) {
          const id = n.request.identifier;
          if (id.startsWith(PLAN_PREFIX) && !stillRelevant.has(id)) Notifications.dismissNotificationAsync(id).catch(() => {});
        }
      }
      const color = personaColor();
      const now = Date.now();
      for (const r of plan) {
        if (r.at.getTime() <= now + 30_000) continue;
        const tap = r.kind === 'training' ? 'forge'
          : r.kind === 'sleep' ? 'sleep'
          : r.category === 'plan_meal' || r.kind === 'focus' ? 'home'
          : r.kind === 'finance' ? (r.id.endsWith('-finance-idle') ? 'eris' : 'finanzas')
            : r.id.endsWith('-morning') ? 'home' : 'eris';
        await Notifications.scheduleNotificationAsync({
          identifier: r.id,
          content: {
            title: r.title, body: r.body, color, sound: true,
            ...(r.category ? { categoryIdentifier: CATEGORY_IDS[r.category] } : {}),
            data: { kind: r.kind, tap, ...(r.prompt ? { prompt: r.prompt } : {}), ...(r.pasoId ? { pasoId: r.pasoId } : {}) },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at,
            ...(Platform.OS === 'android' ? { channelId: CHANNELS[r.kind].id } : {}),
          },
        }).catch(() => {});
      }
    } catch {}
  }

  /** Quita todos los avisos del día (se apagaron, o se cerró sesión). */
  async clearPlan() {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      // También el resumen del domingo de esa cuenta (revisión D4; los recordatorios de suplementos los quita su almacén)
      await Notifications.cancelScheduledNotificationAsync(IDS_DOMINGO).catch(() => {});
      await Promise.all(scheduled.filter((n) => n.identifier.startsWith(PLAN_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
      const shown = await Notifications.getPresentedNotificationsAsync();
      for (const n of shown) if (n.request.identifier.startsWith(PLAN_PREFIX)) Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
    } catch {}
  }

  /** Qué tipos de aviso quiere el usuario (Perfil → Avisos). Por defecto, todos. */
  async reminderSettings(profileId: string): Promise<ReminderSettings> {
    try {
      const raw = await AsyncStorage.getItem(reminderSettingsKey(profileId));
      return { ...DEFAULT_REMINDER_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
    } catch { return { ...DEFAULT_REMINDER_SETTINGS }; }
  }

  /** El interruptor "Alertas proactivas" de Perfil (antes se guardaba pero nada lo leía). Por defecto, encendido. */
  async tipsEnabled(): Promise<boolean> {
    try {
      const creds = await AuthStorage.getCredentials();
      if (!creds?.profileId) return true;
      const raw = await AsyncStorage.getItem(`eris_notifications_${creds.profileId}`);
      return raw === null ? true : JSON.parse(raw) !== false;
    } catch { return true; }
  }
}

export const erisNotifications = new ErisNotificationsService();

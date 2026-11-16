import { NetworkConfig } from "../config/env";
import { AuthStorage } from "./AuthStorage";

// Capacidades que este cliente anuncia al servidor al autenticarse. 'approvals' = sabe mostrar la tarjeta Aprobar/Rechazar;
// sin ella el servidor NO ejecuta acciones sensibles (comandos, archivos…) para esta conexión.
// 'finance_ops' = sabe aplicar en Finanzas lo que Eris anota por chat (FinanceBridge + FinanceHeadlessHost).
// 'inventory_ops' = sabe aplicar en el Inventario lo que Eris anota por chat (inventoryStore, 2026-10-22).
const CLIENT_CAPS = ['approvals', 'finance_ops', 'inventory_ops', 'supplement_ops'];
// 'telefono_ops' (Hestia Manos, K0) = puede hacer cosas en el teléfono: solo si la app aparte está instalada y firmada igual.
// Lo decide App.tsx (setCapsExtra) para que este archivo no dependa de módulos nativos (las pruebas lo cargan fuera del teléfono).
let capsExtra: () => string[] = () => [];
export function setCapsExtra(f: () => string[]) { capsExtra = f; }
const clientCaps = () => { try { return [...CLIENT_CAPS, ...capsExtra()]; } catch { return CLIENT_CAPS; } };
// Tope para abrir una conexión antes de probar la otra ruta (Tailscale ↔ WiFi de la casa)
const CONNECT_TIMEOUT_MS = 5000;

type MessageHandler = (data: any) => void;
type ConnectionStatusHandler = (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;

interface ConnectionState {
  ws: WebSocket | null;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  isLocal: boolean;
  sessionId: string;
}

class WebSocketManager {
  private state: ConnectionState = {
    ws: null,
    status: 'disconnected',
    isLocal: !NetworkConfig.PREFER_CLOUD,
    sessionId: ''
  };

  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<ConnectionStatusHandler> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private autoReconnect = true;
  private lastConnectedPayload: any = null;
  
  private credentials = { profileId: 'default', pin: '' };
  // Cómo se autentica esta conexión: token de sesión (reconexiones) o ID token de Google (primer ingreso)
  private auth: {
    session?: string;
    google?: { idToken: string; link?: { profileId: string; pin: string }; forceNew?: boolean };
  } = {};
  public getLastConnectedPayload() {
    return this.lastConnectedPayload;
  }

  /** Solo para armar la URL (el servidor decide el perfil real a partir de tu cuenta de Google). */
  public setCredentials(profileId: string, _pin = '') {
    this.credentials.profileId = profileId;
  }

  public setAuth(a: { session?: string; google?: { idToken: string; link?: { profileId: string; pin: string }; forceNew?: boolean } }) {
    this.auth = a;
  }

  public getSessionToken(): string | undefined {
    return this.auth.session;
  }

  public connect(sessionId?: string) {
    if (this.state.status === 'connecting' || this.state.status === 'connected') return;

    if (sessionId) {
      this.state.sessionId = sessionId;
    }

    this.autoReconnect = true;
    this.attemptConnection();
  }

  public disconnect() {
    this.autoReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.state.ws) {
      // Remover listeners para evitar race conditions si reconectamos de inmediato
      this.state.ws.onclose = null;
      this.state.ws.onerror = null;
      this.state.ws.onmessage = null;
      this.state.ws.onopen = null;
      this.state.ws.close();
      this.state.ws = null;
    }
    this.lastConnectedPayload = null;
    this.updateStatus('disconnected');
  }

  private attemptConnection() {
    this.updateStatus('connecting');

    const baseUrl = this.state.isLocal ? NetworkConfig.LOCAL_URL : NetworkConfig.CLOUD_URL;
    let url = baseUrl + `?profile=${encodeURIComponent(this.credentials.profileId)}`;
    if (this.state.sessionId) url += `&session=${this.state.sessionId}`;
    // PIN ya no viaja en la URL

    console.log(`[WS] Intentando conectar a: ${url}`);
    
    // Validar si es nulo (ej cloud no configurado)
    if (!url || url.includes('tu-tunel')) {
      if (!this.state.isLocal) {
        console.log('[WS] Cloud no configurado. Fallback a Local.');
        this.state.isLocal = true;
        this.attemptConnection();
      } else {
        this.updateStatus('error');
      }
      return;
    }

    try {
      this.state.ws = new WebSocket(url);
      const currentWs = this.state.ws;

      // Sin tope, un intento a una ruta inalcanzable (Tailscale apagado en el teléfono) quedaba colgado hasta que Android
      // se rendía — 20 s o más — antes de probar el WiFi de la casa: la app parecía "no responder". Si no abre en
      // CONNECT_TIMEOUT_MS, se prueba de inmediato la otra ruta.
      const connectTimer = setTimeout(() => {
        if (this.state.ws !== currentWs || this.state.status !== 'connecting') return;
        currentWs.onopen = currentWs.onclose = currentWs.onerror = currentWs.onmessage = null;
        try { currentWs.close(); } catch {}
        this.state.ws = null;
        this.updateStatus('disconnected');
        if (this.autoReconnect) this.handleFallbackAndReconnect(300);
      }, CONNECT_TIMEOUT_MS);

      currentWs.onopen = () => {
        clearTimeout(connectTimer);
        if (this.state.ws !== currentWs) return;
        console.log('[WS] Conectado exitosamente');
        this.updateStatus('connected');
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      };

      currentWs.onmessage = (event) => {
        if (this.state.ws !== currentWs) return;
        try {
          const data = JSON.parse(event.data);

          // Interceptar petición de autenticación
          if (data.type === 'auth_required') {
            if (this.auth.google) {
              this.state.ws?.send(JSON.stringify({ type: 'auth_google', ...this.auth.google, caps: clientCaps() }));
            } else if (this.auth.session) {
              this.state.ws?.send(JSON.stringify({ type: 'auth_session', token: this.auth.session, caps: clientCaps() }));
            } else {
              // Sin sesión ni Google: hay que iniciar sesión (la UI muestra el botón de Google)
              this.messageHandlers.forEach(handler => handler({ type: 'auth_error', code: 'login_required', message: 'Inicia sesión con Google.' }));
            }
            return; // No propagar este mensaje a la UI
          }

          // El servidor emite el token de sesión al iniciar con Google: se guarda y las reconexiones lo usan
          if (data.type === 'connected' && data.sessionToken && data.profileId) {
            this.auth = { session: data.sessionToken };
            this.credentials.profileId = data.profileId;
            AuthStorage.saveSession(data.profileId, data.sessionToken).catch(() => {});
          }
          if (data.type === 'auth_error' && (data.code === 'session_expired' || data.code === 'invalid_token')) {
            this.auth = {};
          }

          // Si el server nos da un ID de sesión, lo guardamos para reconexiones
          if ((data.type === 'connected' || data.type === 'chat_switched') && data.sessionId) {
            this.state.sessionId = data.sessionId;
            if (data.type === 'connected') {
              this.lastConnectedPayload = data;
            }
          }
          // Cada pantalla por separado: antes, si una fallaba al procesar un mensaje, las siguientes no lo recibían.
          this.messageHandlers.forEach(handler => {
            try { handler(data); } catch (e) { console.error('[WS] Error en un receptor de mensajes', e); }
          });
          // Recién conectado: el servidor tiene que saber si hablas con Eris o con Hestia (lista de chats de cada una)
          if (data.type === 'connected') this.sendPersona();
        } catch (e) {
          console.error('[WS] Error parseando mensaje', e);
        }
      };

      currentWs.onerror = (e) => {
        if (this.state.ws !== currentWs) return;
        console.error(`[WS] Error en conexión (${this.state.isLocal ? 'Local' : 'Cloud'})`, e);
      };

      currentWs.onclose = () => {
        clearTimeout(connectTimer);
        if (this.state.ws !== currentWs) return;
        console.log('[WS] Desconectado');
        this.state.ws = null;
        this.updateStatus('disconnected');

        if (this.autoReconnect) {
          this.handleFallbackAndReconnect();
        }
      };
    } catch (e) {
      console.error('[WS] Excepción al instanciar WS', e);
      this.updateStatus('error');
      this.handleFallbackAndReconnect();
    }
  }

  private handleFallbackAndReconnect(delayMs = 3000) {
    // Si fallamos, invertimos la ruta. Si tratamos LAN y falló, testear CLOUD.
    this.state.isLocal = !this.state.isLocal;
    console.log(`[WS] Fallback de red activo. Intentando por ruta ${this.state.isLocal ? 'Local' : 'Cloud'} en ${delayMs} ms...`);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.attemptConnection();
    }, delayMs);
  }

  // Modo AXS Executive (Perfil). Viaja con cada mensaje al chat: fuera de ese modo el servidor no le da a Eris las
  // herramientas de AXS (bóveda, briefing, reportes).
  private axsMode = false;
  public setAxsMode(on: boolean) {
    const changed = on !== this.axsMode;
    this.axsMode = on;
    // Eris y Hestia tienen cada una su lista de chats: el servidor cambia de lista (y de chat abierto) al enterarse
    if (changed) this.sendPersona();
  }
  private sendPersona() {
    if (this.state.ws && this.state.status === 'connected') this.state.ws.send(JSON.stringify({ type: 'set_persona', axs: this.axsMode }));
  }

  public sendMessage(data: any) {
    if (this.state.ws && this.state.status === 'connected') {
      if (data && (data.type === 'message' || data.type === 'voice_message')) data = { ...data, axs: this.axsMode };
      this.state.ws.send(JSON.stringify(data));
    } else {
      console.warn('[WS] Intento de enviar mensaje sin conexión activa');
    }
  }

  public getStatus(): ConnectionState['status'] {
    return this.state.status;
  }

  public subscribeMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public subscribeStatus(handler: ConnectionStatusHandler) {
    this.statusHandlers.add(handler);
    // Emitir estado actual inicial
    handler(this.state.status);
    return () => this.statusHandlers.delete(handler);
  }

  private updateStatus(status: ConnectionState['status']) {
    this.state.status = status;
    this.statusHandlers.forEach(h => h(status));
  }
}

export const wsManager = new WebSocketManager();

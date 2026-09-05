import { NetworkConfig } from "../config/env";

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
  private _tojiPanelActive = false;

  setTojiPanelActive(val: boolean) { this._tojiPanelActive = val; }
  isTojiPanelActive() { return this._tojiPanelActive; }

  public getLastConnectedPayload() {
    return this.lastConnectedPayload;
  }

  public setCredentials(profileId: string, pin: string) {
    this.credentials.profileId = profileId;
    this.credentials.pin = pin;
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

      currentWs.onopen = () => {
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
            this.state.ws?.send(JSON.stringify({ type: 'auth', pin: this.credentials.pin }));
            return; // No propagar este mensaje a la UI
          }

          // Si el server nos da un ID de sesión, lo guardamos para reconexiones
          if ((data.type === 'connected' || data.type === 'chat_switched') && data.sessionId) {
            this.state.sessionId = data.sessionId;
            if (data.type === 'connected') {
              this.lastConnectedPayload = data;
            }
          }
          this.messageHandlers.forEach(handler => handler(data));
        } catch (e) {
          console.error('[WS] Error parseando mensaje', e);
        }
      };

      currentWs.onerror = (e) => {
        if (this.state.ws !== currentWs) return;
        console.error(`[WS] Error en conexión (${this.state.isLocal ? 'Local' : 'Cloud'})`, e);
      };

      currentWs.onclose = () => {
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

  private handleFallbackAndReconnect() {
    // Si fallamos, invertimos la ruta. Si tratamos LAN y falló, testear CLOUD.
    this.state.isLocal = !this.state.isLocal;
    console.log(`[WS] Fallback de red activo. Intentando por ruta ${this.state.isLocal ? 'Local' : 'Cloud'} en 3s...`);
    
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.attemptConnection();
    }, 3000);
  }

  public sendMessage(data: any) {
    if (this.state.ws && this.state.status === 'connected') {
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

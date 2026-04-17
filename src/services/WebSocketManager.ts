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
      this.state.ws.close();
      this.state.ws = null;
    }
  }

  private attemptConnection() {
    this.updateStatus('connecting');

    const baseUrl = this.state.isLocal ? NetworkConfig.LOCAL_URL : NetworkConfig.CLOUD_URL;
    const url = this.state.sessionId ? `${baseUrl}?session=${this.state.sessionId}` : baseUrl;

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

      this.state.ws.onopen = () => {
        console.log('[WS] Conectado exitosamente');
        this.updateStatus('connected');
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      };

      this.state.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Si el server nos da un ID de sesión, lo guardamos para reconexiones
          if ((data.type === 'connected' || data.type === 'chat_switched') && data.sessionId) {
            this.state.sessionId = data.sessionId;
          }
          this.messageHandlers.forEach(handler => handler(data));
        } catch (e) {
          console.error('[WS] Error parseando mensaje', e);
        }
      };

      this.state.ws.onerror = (e) => {
        console.error(`[WS] Error en conexión (${this.state.isLocal ? 'Local' : 'Cloud'})`, e);
      };

      this.state.ws.onclose = () => {
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

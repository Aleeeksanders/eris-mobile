import BackgroundService from 'react-native-background-actions';

// Mantiene el proceso vivo (con una notificación visible, obligatoria en
// Android) mientras Eris está generando una respuesta, para que el sistema
// no suspenda la app si el usuario minimiza o cambia de app a mitad de una
// consulta. Es "mejor esfuerzo": algunos fabricantes (Xiaomi, Huawei, etc.)
// igual matan el proceso agresivamente — la garantía real de que la
// respuesta no se pierda es que el backend ya persiste la conversación
// completa server-side (ver server.ts) y el cliente la recupera al reconectar.
//
// Cierre forzoso que esto causaba (logcat, Android 16):
//   ForegroundServiceDidNotStartInTimeException: Context.startForegroundService()
//   did not then call Service.startForeground()
// BackgroundService.start() resuelve apenas pide el servicio, pero el servicio
// recién llama a startForeground() un instante después, en su onStartCommand.
// Si BackgroundService.stop() llega antes de eso, Android mata la app entera.
// Pasaba con las respuestas instantáneas (registrar agua va por código, sin el
// modelo): 'thinking' y 'done' llegaban con milisegundos de diferencia. Ahora:
//   1. El servicio no se pide hasta que la respuesta tarda más de START_DELAY_MS
//      (las rápidas no lo necesitan: no hay tiempo de minimizar la app).
//   2. Si se pidió, no se detiene hasta que la tarea JS arranca — y esa tarea
//      solo corre después de que el servicio ya llamó a startForeground().
//   3. Arrancar y detener van en fila: nunca se cruzan.

const START_DELAY_MS = 1200;
// Si Android no permite el servicio (p. ej. la app pasó a segundo plano en esos
// 1,2 s), el propio servicio se detiene sin correr la tarea: este plazo evita
// esperar para siempre la confirmación que nunca va a llegar.
const CONFIRM_TIMEOUT_MS = 8000;

let markStarted: (() => void) | null = null;

// La tarea en sí no hace nada — react-native-background-actions exige una
// promesa "viva" para sostener el foreground service; el trabajo real
// (esperar la respuesta de Eris) ya lo hace WebSocketManager en paralelo.
// Cortamos el loop en cuanto stopThinking() llama a BackgroundService.stop().
const idleTask = async () => {
  markStarted?.();
  markStarted = null;
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (!BackgroundService.isRunning()) {
        clearInterval(check);
        resolve();
      }
    }, 1000);
  });
};

const options = {
  taskName: 'ErisThinking',
  taskTitle: 'Eris',
  taskDesc: 'Pensando…',
  // Silueta de Eris (modules/eris-bubble/.../drawable/ic_stat_eris.xml): con el ícono de color salía un cuadrado blanco
  taskIcon: { name: 'ic_stat_eris', type: 'drawable' },
  color: '#f59e0b', // el dorado de Eris
  foregroundServiceType: ['dataSync'] as const,
  linkingURI: undefined,
};

class QueryForegroundServiceImpl {
  private thinking = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // Resuelve cuando el servicio ya llamó a startForeground() (o venció el plazo).
  private started: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();

  startThinking(): void {
    this.thinking = true;
    if (this.timer || this.started) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.thinking) this.enqueue(() => this.doStart());
    }, START_DELAY_MS);
  }

  stopThinking(): void {
    this.thinking = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.enqueue(() => this.doStop());
  }

  private enqueue(op: () => Promise<void>) {
    this.queue = this.queue.then(op).catch(() => {});
  }

  private async doStart(): Promise<void> {
    if (!this.thinking || this.started || BackgroundService.isRunning()) return;
    const confirmed = new Promise<void>((resolve) => { markStarted = resolve; });
    try {
      await BackgroundService.start(idleTask, options as any);
      this.started = Promise.race([confirmed, new Promise<void>((r) => setTimeout(r, CONFIRM_TIMEOUT_MS))]);
    } catch {
      // Si el permiso de notificaciones no está concedido o el OEM bloquea
      // el foreground service, seguimos sin él — la app funciona igual en
      // primer plano, solo se pierde la protección extra en segundo plano.
      markStarted = null;
      this.started = null;
    }
  }

  private async doStop(): Promise<void> {
    if (this.thinking || !this.started) return; // otra consulta en curso, o nunca se inició: nada que detener
    await this.started;
    if (this.thinking) return; // empezó otra consulta mientras se esperaba la confirmación: el servicio sigue
    this.started = null;
    try {
      await BackgroundService.stop();
    } catch {}
  }
}

export const queryForegroundService = new QueryForegroundServiceImpl();

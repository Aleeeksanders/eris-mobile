package expo.modules.erisbanknotif

import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Eris administra (A0): con la app cerrada, un aviso del banco despierta a JS sin abrir pantallas. La tarea `ErisBankAuto`
 * (index.ts → financeAuto.runBankHeadless) recoge la cola y Eris anota lo claro. Si Android no deja arrancarla, el aviso
 * espera en la cola y se procesa al abrir la app, con su hora real.
 */
class BankHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    // 30 s de sobra para anotar unos pocos avisos; también con la app en primer plano (si JS justo se estaba cerrando)
    HeadlessJsTaskConfig("ErisBankAuto", Arguments.createMap(), 30_000, true)

  companion object {
    fun start(ctx: Context) {
      try { HeadlessJsTaskService.acquireWakeLockNow(ctx) } catch (_: Throwable) {}
      try {
        ctx.startService(Intent(ctx, BankHeadlessService::class.java))
      } catch (_: Throwable) {
        // Android no dejó arrancar el servicio en segundo plano: el aviso queda en la cola para cuando se abra la app
      }
    }
  }
}

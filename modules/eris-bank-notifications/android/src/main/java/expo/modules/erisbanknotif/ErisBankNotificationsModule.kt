package expo.modules.erisbanknotif

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Avisos del banco para Finanzas. JS pide el acceso (lo da la persona en Ajustes), elige las apps y recoge la cola.
 */
class ErisBankNotificationsModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "Sin contexto de Android" }

  override fun definition() = ModuleDefinition {
    Name("ErisBankNotifications")

    Events("onBankNotification")

    OnCreate {
      BankBridge.listener = { sendEvent("onBankNotification", emptyMap<String, Any>()) }
    }

    OnDestroy {
      BankBridge.listener = null
    }

    /** ¿La persona le dio a Eris el «Acceso a notificaciones»? */
    Function("hasAccess") {
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }

    /** Abre la pantalla de Android donde la persona da (o quita) el acceso. */
    Function("openAccessSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    /** Pide a Android reconectar el servicio (después de dar el acceso, o si el sistema lo soltó). */
    Function("rebind") {
      try {
        android.service.notification.NotificationListenerService.requestRebind(ComponentName(context, BankNotificationService::class.java))
      } catch (_: Throwable) {}
      Unit
    }

    /** La cuenta activa en la app (null = sin sesión): los avisos y la configuración son de cada cuenta */
    Function("setProfile") { p: String? -> BankPrefs.setProfile(context, p); Unit }

    Function("getAllowed") { BankPrefs.allowed(context).toList() }

    Function("setAllowed") { pkgs: List<String> -> BankPrefs.setAllowed(context, pkgs); Unit }

    /** ¿También los correos y SMS del banco? (apagado por defecto) */
    Function("getMail") { BankPrefs.mail(context) }

    Function("setMail") { on: Boolean -> BankPrefs.setMail(context, on); Unit }

    /** JSON {pkg: {app, count, last}} de las apps que mostraron montos y no están elegidas. */
    Function("seenApps") { BankPrefs.seenJson(context) }

    /** JSON [{pkg, app, title, text, at, key}] de los avisos guardados; la cola queda vacía. */
    Function("takeQueue") { BankPrefs.take(context) }
  }
}

package expo.modules.erisbubble

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Burbuja de Eris sobre otras apps. JS decide cuándo está activa; el servicio (BubbleService) la dibuja solo mientras
 * la app NO está en pantalla (dentro de la app ya está la burbuja flotante de React Native).
 */
class ErisBubbleModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "Sin contexto de Android" }

  private val main = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("ErisBubble")

    Events("onBubbleTap", "onBubbleClosed")

    OnCreate {
      BubbleBridge.listener = { event -> sendEvent(event, emptyMap<String, Any>()) }
    }

    OnDestroy {
      BubbleBridge.listener = null
    }

    /** ¿Tiene el permiso "Mostrar sobre otras apps"? */
    Function("canDrawOverlays") {
      Settings.canDrawOverlays(context)
    }

    /** Abre la pantalla de Android para dar el permiso a esta app. */
    Function("openOverlaySettings") {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("isEnabled") {
      BubblePrefs.isEnabled(context)
    }

    /** Activa la burbuja (y la deja activa en los próximos inicios de la app). Requiere el permiso. */
    Function("enable") {
      if (!Settings.canDrawOverlays(context)) return@Function false
      BubblePrefs.setEnabled(context, true)
      ContextCompat.startForegroundService(context, Intent(context, BubbleService::class.java))
      true
    }

    /** Desactiva y cierra la burbuja. */
    Function("disable") {
      BubblePrefs.setEnabled(context, false)
      context.stopService(Intent(context, BubbleService::class.java))
      Unit
    }

    /**
     * La app entró o salió de pantalla. Al salir, la burbuja del sistema aparece donde estaba la de dentro de la app
     * (centro en dp, opcional).
     */
    Function("setAppForeground") { foreground: Boolean, centerX: Double?, centerY: Double? ->
      BubbleBridge.appForeground = foreground
      if (!foreground && centerX != null && centerY != null) BubbleBridge.handoffCenterDp = centerX.toFloat() to centerY.toFloat()
      main.post { BubbleService.instance?.updateVisibility() }
      Unit
    }

    /** Estado que muestra la burbuja: "idle", "thinking" (anillo que late) o "reply" (punto: respuesta lista). */
    Function("setState") { state: String ->
      BubbleBridge.state = state
      main.post { BubbleService.instance?.applyState() }
      Unit
    }

    /** Quién está en la burbuja de fuera de la app: "eris" o "hestia" (Modo AXS Executive). */
    Function("setPersona") { persona: String ->
      BubbleBridge.persona = persona
      main.post { BubbleService.instance?.applyPersona() }
      Unit
    }

    /** true una sola vez después de tocar la burbuja: JS abre el chat de Eris. */
    Function("consumePendingOpen") {
      val v = BubbleBridge.pendingOpen
      BubbleBridge.pendingOpen = false
      v
    }

    /** El ícono animado de Eris para dentro de la app (ver ErisMarkView / ErisMarkDrawer). */
    View(ErisMarkView::class) {
      Prop("state") { view: ErisMarkView, state: String ->
        view.mark.setState(state)
        view.invalidate()
      }
      Prop("tint") { view: ErisMarkView, tint: String ->
        view.mark.setTint(tint)
        view.invalidate()
      }
      Prop("disc") { view: ErisMarkView, disc: Boolean ->
        view.drawDisc = disc
      }
      Prop("persona") { view: ErisMarkView, persona: String ->
        view.mark.setPersona(persona)
        view.invalidate()
      }
    }
  }
}

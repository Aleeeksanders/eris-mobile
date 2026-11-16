package expo.modules.erisbubble

import android.content.Context

/**
 * Estado compartido entre el módulo (JS) y el servicio de la burbuja. Viven en el mismo proceso, así que basta con
 * campos estáticos; lo que debe sobrevivir a un reinicio de la app (activada o no, posición) va en BubblePrefs.
 */
object BubbleBridge {
  /** La app está en pantalla: la burbuja del sistema se esconde y queda la burbuja de dentro de la app. */
  @Volatile var appForeground: Boolean = true

  /** Se tocó la burbuja: al volver la app, JS abre el chat de Eris (ver consumePendingOpen). */
  @Volatile var pendingOpen: Boolean = false

  /** J3: se mantuvo presionada la burbuja de Hestia: al volver la app, JS abre la llamada (ver consumePendingCall). */
  @Volatile var pendingCall: Boolean = false

  /** Posición que tenía la burbuja de dentro de la app (centro, en dp), para que la del sistema aparezca en el mismo lugar. */
  @Volatile var handoffCenterDp: Pair<Float, Float>? = null

  /** "idle" | "thinking" (Eris está respondiendo) | "reply" (la respuesta quedó lista mientras estabas fuera). */
  @Volatile var state: String = "idle"

  /** "eris" | "hestia" (Modo AXS Executive): ícono y textos de la burbuja. */
  @Volatile var persona: String = "eris"

  /** Eventos hacia JS (onBubbleTap, onBubbleClosed). null si el módulo no está cargado. */
  @Volatile var listener: ((String) -> Unit)? = null

  fun emit(event: String) {
    try { listener?.invoke(event) } catch (_: Throwable) {}
  }
}

object BubblePrefs {
  private const val FILE = "eris_bubble"

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  /** Modo burbuja: encendido salvo que el usuario lo apague en Perfil (igual necesita el permiso de superposición). */
  fun isEnabled(ctx: Context) = prefs(ctx).getBoolean("enabled", true)
  fun setEnabled(ctx: Context, v: Boolean) = prefs(ctx).edit().putBoolean("enabled", v).apply()

  /** Última posición (esquina superior izquierda, en px). -1 = sin guardar. */
  fun position(ctx: Context): Pair<Int, Int> = prefs(ctx).let { it.getInt("x", -1) to it.getInt("y", -1) }
  fun savePosition(ctx: Context, x: Int, y: Int) = prefs(ctx).edit().putInt("x", x).putInt("y", y).apply()
}

package expo.modules.hestiamanos

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.WindowManager
import java.lang.ref.WeakReference
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * K3 (2026-11-16): Hestia Manos abre la llamada con Hestia (el botón del asistente, el de los ajustes rápidos, el atajo del ícono).
 * Llega como un Intent a MainActivity con la CLAVE que Eris le dio a Hestia Manos al enlazarse (pedido firmado: despertar_enlazar):
 * sin esa clave, el Intent se ignora (cualquier app puede abrir MainActivity, pero no la llamada).
 *
 * Con el teléfono bloqueado, la actividad se muestra sobre la pantalla de bloqueo (setShowWhenLocked) SOLO mientras dure la llamada:
 * al colgar se apaga, y Eris queda detrás del bloqueo. Lo que Hestia puede hacer bloqueado lo decide el servidor (solo lo seguro).
 */
object DespertarEris {
  private const val PREFS = "hestia_manos"
  private const val CLAVE = "despertar_token"
  /** Una apertura vale 60 s (no la de un Intent viejo que vuelve al recrear la actividad) */
  private const val VIGENCIA_MS = 60_000L

  data class Pedido(val origen: String, val bloqueado: Boolean, val t: Long)

  @Volatile var pendiente: Pedido? = null
  var oyente: ((Pedido) -> Unit)? = null
  private var actividad: WeakReference<Activity>? = null
  @Volatile var sobreBloqueo = false
    private set

  /** La clave de este teléfono (se crea una vez y queda en las preferencias de Eris) */
  fun token(ctx: Context): String {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    p.getString(CLAVE, null)?.let { return it }
    val b = ByteArray(32).also { SecureRandom().nextBytes(it) }
    val t = b.joinToString("") { "%02x".format(it) }
    p.edit().putString(CLAVE, t).apply()
    return t
  }

  fun recordar(a: Activity) { actividad = WeakReference(a) }
  fun actividad(): Activity? = actividad?.get()

  /** ¿Este Intent es una apertura de Hestia Manos válida? Si sí, queda pendiente (y, bloqueado, la llamada se ve sobre el bloqueo). */
  fun revisar(a: Activity?, intent: Intent?): Boolean {
    val dada = intent?.getStringExtra("hestia_despertar") ?: return false
    intent.removeExtra("hestia_despertar") // no se vuelve a procesar al recrear la actividad
    val ctx = a ?: return false
    val ok = MessageDigest.isEqual(dada.toByteArray(), token(ctx).toByteArray())
    val t = intent.getLongExtra("hestia_t", 0L)
    if (!ok || kotlin.math.abs(System.currentTimeMillis() - t) > VIGENCIA_MS) return false
    val km = ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    val bloqueado = intent.getBooleanExtra("hestia_bloqueado", false) || km.isKeyguardLocked
    if (bloqueado) mostrarSobreBloqueo(a, true)
    val p = Pedido(intent.getStringExtra("hestia_origen") ?: "boton", bloqueado, System.currentTimeMillis())
    pendiente = p
    oyente?.invoke(p)
    return true
  }

  /** La apertura pendiente, si es reciente (una sola vez) */
  fun tomar(): Pedido? {
    val p = pendiente ?: return null
    pendiente = null
    return if (System.currentTimeMillis() - p.t <= VIGENCIA_MS) p else null
  }

  /** Mostrar (o no) Eris sobre la pantalla de bloqueo, y prender la pantalla. Solo durante la llamada. */
  fun mostrarSobreBloqueo(a: Activity?, on: Boolean) {
    val act = a ?: return
    act.runOnUiThread {
      try {
        if (Build.VERSION.SDK_INT >= 27) {
          act.setShowWhenLocked(on)
          act.setTurnScreenOn(on)
        } else {
          @Suppress("DEPRECATION")
          val f = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
          if (on) act.window.addFlags(f) else act.window.clearFlags(f)
        }
      } catch (_: Throwable) {}
    }
    sobreBloqueo = on
  }
}

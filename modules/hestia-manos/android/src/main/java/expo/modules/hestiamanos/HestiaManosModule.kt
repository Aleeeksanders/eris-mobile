package expo.modules.hestiamanos

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

/**
 * Puente con Hestia Manos (K0, 2026-11-16): la app aparte con los permisos fuertes. Eris se enlaza a su servicio y le manda
 * cada pedido del servidor (telefono_op) como {id, op}; la respuesta llega por un Messenger propio. Hestia Manos revisa en cada
 * pedido que venga de Eris con la misma firma; acá, que ella también esté firmada igual (si no, no se usa).
 */
class HestiaManosModule : Module() {
  companion object {
    const val PKG = "com.aleeeksanders.hestiamanos"
    const val ACCION = "com.aleeeksanders.hestiamanos.MANOS"
    const val ESPERA_MS = 12_000L
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "Sin contexto de Android" }

  private val main = Handler(Looper.getMainLooper())
  private var servicio: Messenger? = null
  private var enlazando = false
  private val esperando = HashMap<String, Promise>()
  private val enCola = ArrayList<Message>()

  private val respuestas = Messenger(Handler(Looper.getMainLooper()) { msg ->
    val id = msg.data?.getString("id")
    val res = msg.data?.getString("res")
    if (id != null) esperando.remove(id)?.resolve(res ?: """{"ok":false,"code":"error","msg":"Respuesta vacía."}""")
    true
  })

  private val conexion = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
      enlazando = false
      servicio = binder?.let { Messenger(it) }
      val s = servicio ?: return
      for (m in enCola) try { s.send(m) } catch (_: Throwable) {}
      enCola.clear()
    }
    override fun onServiceDisconnected(name: ComponentName?) { servicio = null; enlazando = false }
    override fun onBindingDied(name: ComponentName?) { servicio = null; enlazando = false; try { context.unbindService(this) } catch (_: Throwable) {} }
  }

  private fun instalada(): Boolean = try { context.packageManager.getPackageInfo(PKG, 0); true } catch (_: Throwable) { false }
  private fun mismaFirma(): Boolean = instalada() && context.packageManager.checkSignatures(context.packageName, PKG) == PackageManager.SIGNATURE_MATCH

  private fun enlazar(): Boolean {
    if (servicio != null || enlazando) return true
    enlazando = try {
      context.bindService(Intent(ACCION).setPackage(PKG), conexion, Context.BIND_AUTO_CREATE)
    } catch (_: Throwable) { false }
    return enlazando
  }

  private fun falla(code: String, msg: String) = """{"ok":false,"code":"$code","msg":"$msg"}"""

  override fun definition() = ModuleDefinition {
    Name("HestiaManos")

    OnDestroy {
      try { if (servicio != null || enlazando) context.unbindService(conexion) } catch (_: Throwable) {}
      servicio = null
    }

    /** ¿Está Hestia Manos instalada y firmada con la misma llave que Eris? */
    Function("disponible") { mismaFirma() }

    /** Un pedido (JSON) → la respuesta de Hestia Manos (JSON). Nunca rechaza: los errores vuelven como {ok:false}. */
    AsyncFunction("pedir") { op: String, promise: Promise ->
      main.post {
        if (!mismaFirma()) { promise.resolve(falla("sin_manos", "Hestia Manos no está instalada en el teléfono.")); return@post }
        val id = UUID.randomUUID().toString()
        val m = Message.obtain().apply {
          data = Bundle().apply { putString("id", id); putString("op", op) }
          replyTo = respuestas
        }
        esperando[id] = promise
        main.postDelayed({ esperando.remove(id)?.resolve(falla("timeout", "Hestia Manos no respondió a tiempo.")) }, ESPERA_MS)
        val s = servicio
        if (s != null) {
          try { s.send(m) } catch (_: Throwable) { servicio = null; enCola.add(m); enlazar() }
        } else {
          enCola.add(m)
          if (!enlazar()) { enCola.remove(m); esperando.remove(id)?.resolve(falla("sin_conexion", "No pude conectarme con Hestia Manos.")) }
        }
      }
    }
  }
}

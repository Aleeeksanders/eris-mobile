package expo.modules.hestiamanos

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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
import androidx.core.content.ContextCompat
import org.json.JSONObject
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

  /** Manda un Message al servicio (o lo deja en cola mientras se enlaza). false = no hubo cómo. */
  private fun mandar(m: Message): Boolean {
    val s = servicio
    if (s != null) {
      try { s.send(m); return true } catch (_: Throwable) { servicio = null }
    }
    enCola.add(m)
    if (!enlazar()) { enCola.remove(m); return false }
    return true
  }

  /** K3: un aviso sin esperar respuesta (la clave para abrir la llamada, que empezó o terminó una llamada) */
  private fun avisar(op: JSONObject) {
    main.post {
      if (!mismaFirma()) return@post
      mandar(Message.obtain().apply {
        data = Bundle().apply { putString("id", UUID.randomUUID().toString()); putString("op", op.toString()) }
        replyTo = respuestas
      })
    }
  }

  /** K3: desbloqueaste el teléfono (con la llamada abierta sobre el bloqueo, Hestia ya puede todo) */
  private val alDesbloquear = object : BroadcastReceiver() {
    override fun onReceive(c: Context?, i: Intent?) { try { sendEvent("onDesbloqueo", mapOf<String, Any>()) } catch (_: Throwable) {} }
  }
  private var escuchandoDesbloqueo = false

  override fun definition() = ModuleDefinition {
    Name("HestiaManos")

    // K3: la llamada abierta desde Hestia Manos (botón del asistente, ajustes rápidos, atajo) y el desbloqueo durante la llamada
    Events("onDespertar", "onDesbloqueo")

    OnCreate {
      DespertarEris.oyente = { p -> try { sendEvent("onDespertar", mapOf("origen" to p.origen, "bloqueado" to p.bloqueado)) } catch (_: Throwable) {} }
      try {
        ContextCompat.registerReceiver(context, alDesbloquear, IntentFilter(Intent.ACTION_USER_PRESENT), ContextCompat.RECEIVER_NOT_EXPORTED)
        escuchandoDesbloqueo = true
      } catch (_: Throwable) {}
      // La clave para que Hestia Manos pueda abrir la llamada (cada vez que Eris parte: si reinstalaste Hestia Manos, se re-enlaza)
      try { avisar(JSONObject().put("accion", "despertar_enlazar").put("token", DespertarEris.token(context))) } catch (_: Throwable) {}
    }

    OnDestroy {
      DespertarEris.oyente = null
      if (escuchandoDesbloqueo) try { context.unregisterReceiver(alDesbloquear) } catch (_: Throwable) {}
      escuchandoDesbloqueo = false
      try { if (servicio != null || enlazando) context.unbindService(conexion) } catch (_: Throwable) {}
      servicio = null
    }

    /** K3: la apertura pendiente desde Hestia Manos ({origen, bloqueado}), una sola vez; null si no hay */
    Function("consumirDespertar") {
      val act = appContext.currentActivity ?: DespertarEris.actividad()
      val p = DespertarEris.tomar() ?: run { DespertarEris.revisar(act, act?.intent); DespertarEris.tomar() }
      p?.let { mapOf("origen" to it.origen, "bloqueado" to it.bloqueado) }
    }

    /** K3: ¿el teléfono está bloqueado? */
    Function("bloqueado") {
      (context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
    }

    /** K3: mostrar (o no) Eris sobre la pantalla de bloqueo. Solo durante la llamada; al colgar, siempre false. */
    Function("sobreBloqueo") { on: Boolean ->
      DespertarEris.mostrarSobreBloqueo(appContext.currentActivity ?: DespertarEris.actividad(), on)
    }

    /** K3: pide desbloquear (huella, cara o PIN: lo haces tú, en la pantalla de Android). true = desbloqueaste. */
    AsyncFunction("pedirDesbloqueo") { promise: Promise ->
      val act = appContext.currentActivity ?: DespertarEris.actividad()
      if (act == null) { promise.resolve(false); return@AsyncFunction }
      act.runOnUiThread {
        val km = act.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        if (!km.isKeyguardLocked) { promise.resolve(true); return@runOnUiThread }
        try {
          km.requestDismissKeyguard(act, object : KeyguardManager.KeyguardDismissCallback() {
            override fun onDismissSucceeded() { promise.resolve(true) }
            override fun onDismissCancelled() { promise.resolve(false) }
            override fun onDismissError() { promise.resolve(false) }
          })
        } catch (_: Throwable) { promise.resolve(false) }
      }
    }

    /** K3: avisa a Hestia Manos que una llamada empezó o terminó (para la palabra «Hestia», después: soltar el micrófono) */
    Function("avisarLlamada") { estado: String ->
      avisar(JSONObject().put("accion", "llamada").put("estado", if (estado == "inicio") "inicio" else "fin"))
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
        if (!mandar(m)) esperando.remove(id)?.resolve(falla("sin_conexion", "No pude conectarme con Hestia Manos."))
      }
    }
  }
}

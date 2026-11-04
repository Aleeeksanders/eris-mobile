package expo.modules.erisbanknotif

import android.app.Notification
import android.content.Context
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lee las notificaciones que traen un monto ("$12.990") para proponer gastos en Finanzas. La persona elige de qué apps
 * (las de su banco); solo esas se guardan, en una cola local que la app recoge al abrir Finanzas. De las demás apps que
 * muestran montos se guarda solo el nombre y cuántas veces, para que la persona pueda elegirlas. Nada sale del teléfono.
 */
class BankNotificationService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    try {
      if (sbn == null || sbn.packageName == packageName) return
      val n = sbn.notification ?: return
      if ((n.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return // el resumen de un grupo repite lo de adentro
      val extras = n.extras ?: return
      val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
      val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
      val all = "$title $text"
      if (!MONEY.containsMatchIn(all)) return
      val pkg = sbn.packageName
      // Correos y SMS (Eris administra, A1): solo con el interruptor encendido y si el remitente (o el comienzo del
      // mensaje) es un banco conocido. Nunca se ofrecen como «app del banco»: leer todo el correo no es la idea.
      val via = MAIL_SMS[pkg]
      if (via != null && !BankPrefs.allowed(this).contains(pkg)) {
        if (!BankPrefs.mail(this) || !BANK.containsMatchIn("$title ${text.take(80)}")) return
        val item = JSONObject()
          .put("pkg", pkg).put("app", title.take(60)).put("title", title.take(200)).put("text", text.take(600))
          .put("at", sbn.postTime).put("key", "${pkg}:${sbn.postTime}:${sbn.id}").put("via", via)
        BankPrefs.push(this, item)
        if (BankBridge.listener != null) BankBridge.emit() else BankHeadlessService.start(this)
        return
      }
      val label = appLabel(this, pkg)
      if (BankPrefs.allowed(this).contains(pkg)) {
        val item = JSONObject()
          .put("pkg", pkg).put("app", label).put("title", title.take(200)).put("text", text.take(600))
          .put("at", sbn.postTime).put("key", "${pkg}:${sbn.postTime}:${sbn.id}")
        BankPrefs.push(this, item)
        // Con JS vivo (la app abierta o en segundo plano) lo recoge al tiro; si no, la tarea headless lo procesa
        if (BankBridge.listener != null) BankBridge.emit() else BankHeadlessService.start(this)
      } else {
        BankPrefs.seen(this, pkg, label, sbn.postTime)
      }
    } catch (_: Throwable) {
      // Un aviso raro nunca debe tumbar el servicio
    }
  }

  companion object {
    /** "$12.990", "$ 5.000", "CLP 12.990", "12.990 pesos" */
    val MONEY = Regex("""(\$\s?\d)|(\bCLP\s?\d)|(\d\s?pesos\b)""", RegexOption.IGNORE_CASE)

    /** Apps de correo y SMS: de estas solo se leen los mensajes de un banco, y solo si la persona lo activó */
    val MAIL_SMS = mapOf(
      "com.google.android.gm" to "correo", "com.microsoft.office.outlook" to "correo", "com.samsung.android.email.provider" to "correo",
      "com.yahoo.mobile.client.android.mail" to "correo",
      "com.google.android.apps.messaging" to "sms", "com.samsung.android.messaging" to "sms", "com.android.mms" to "sms", "com.android.messaging" to "sms",
    )

    /** Remitentes de bancos y billeteras de Chile (en el correo, «Falabella» o «Ripley» solos son la tienda: se pide «banco») */
    val BANK = Regex(
      """banco ?estado|cuenta ?rut|santander|\bbci\b|banco de chile|bancochile|\bedwards\b|ita[uú]|scotiabank|banco falabella|\bcmr\b|banco ripley|banco security|\bbice\b|consorcio|coopeuch|tenpo|mercado ?pago|\bmach\b|global ?66|\bprex\b|banco internacional""",
      RegexOption.IGNORE_CASE,
    )

    fun appLabel(ctx: Context, pkg: String): String = try {
      val pm = ctx.packageManager
      pm.getApplicationLabel(pm.getApplicationInfo(pkg, PackageManager.GET_META_DATA)).toString()
    } catch (_: Throwable) { pkg }
  }
}

/** Avisos hacia JS (la app abierta recoge la cola al tiro). */
object BankBridge {
  @Volatile var listener: (() -> Unit)? = null
  fun emit() { try { listener?.invoke() } catch (_: Throwable) {} }
}

/**
 * Lo que sobrevive con la app cerrada: apps elegidas, la cola de avisos y las apps vistas con montos. POR CUENTA (revisión
 * 2026-10-31, D4): con un teléfono compartido, los avisos del banco de una persona se anotaban en el libro de la otra. La
 * app dice qué cuenta está activa (`setProfile`); sin sesión no se guarda nada. La primera cuenta que entra después de
 * actualizar se queda con lo que había sin cuenta (como ScopedStorage).
 */
object BankPrefs {
  private const val FILE = "eris_bank_notif"
  private const val MAX_QUEUE = 60
  private fun prefs(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)
  private fun perfil(ctx: Context): String = prefs(ctx).getString("perfil", "") ?: ""
  private fun k(ctx: Context, base: String) = "$base:${perfil(ctx)}"

  /** La cuenta activa (vacía = sin sesión: no se lee nada). */
  @Synchronized fun setProfile(ctx: Context, p: String?) {
    val id = (p ?: "").trim()
    val sp = prefs(ctx)
    val e = sp.edit().putString("perfil", id)
    // Lo de antes (sin cuenta) pasa a la primera cuenta que entra, una sola vez
    if (id.isNotEmpty() && (sp.contains("allowed") || sp.contains("mail") || sp.contains("seen"))) {
      if (!sp.contains("allowed:$id")) sp.getStringSet("allowed", null)?.let { e.putStringSet("allowed:$id", it.toSet()) }
      if (!sp.contains("mail:$id") && sp.contains("mail")) e.putBoolean("mail:$id", sp.getBoolean("mail", false))
      if (!sp.contains("seen:$id")) sp.getString("seen", null)?.let { e.putString("seen:$id", it) }
      e.remove("allowed").remove("mail").remove("seen")
    }
    e.apply()
  }

  fun hayCuenta(ctx: Context): Boolean = perfil(ctx).isNotEmpty()
  fun allowed(ctx: Context): Set<String> = if (!hayCuenta(ctx)) emptySet() else prefs(ctx).getStringSet(k(ctx, "allowed"), emptySet()) ?: emptySet()
  fun mail(ctx: Context): Boolean = hayCuenta(ctx) && prefs(ctx).getBoolean(k(ctx, "mail"), false)
  fun setMail(ctx: Context, on: Boolean) { if (hayCuenta(ctx)) prefs(ctx).edit().putBoolean(k(ctx, "mail"), on).apply() }
  fun setAllowed(ctx: Context, pkgs: List<String>) { if (hayCuenta(ctx)) prefs(ctx).edit().putStringSet(k(ctx, "allowed"), pkgs.toSet()).apply() }

  /** Cada aviso se guarda con la cuenta activa: solo esa cuenta lo recoge. */
  @Synchronized fun push(ctx: Context, item: JSONObject) {
    if (!hayCuenta(ctx)) return
    item.put("perfil", perfil(ctx))
    val q = JSONArray(prefs(ctx).getString("queue", "[]") ?: "[]")
    for (i in 0 until q.length()) if (q.optJSONObject(i)?.optString("key") == item.optString("key")) return
    q.put(item)
    val trimmed = JSONArray()
    val from = maxOf(0, q.length() - MAX_QUEUE)
    for (i in from until q.length()) trimmed.put(q.get(i))
    prefs(ctx).edit().putString("queue", trimmed.toString()).apply()
  }

  /** Entrega lo de la cuenta activa y lo saca de la cola (lo de otras cuentas queda para cuando vuelvan). */
  @Synchronized fun take(ctx: Context): String {
    val id = perfil(ctx)
    val q = JSONArray(prefs(ctx).getString("queue", "[]") ?: "[]")
    val mio = JSONArray(); val resto = JSONArray()
    for (i in 0 until q.length()) {
      val o = q.optJSONObject(i) ?: continue
      // Los guardados antes de esta versión (sin cuenta) son de quien entra primero
      if (id.isNotEmpty() && (o.optString("perfil", "") == id || !o.has("perfil"))) mio.put(o) else resto.put(o)
    }
    prefs(ctx).edit().putString("queue", resto.toString()).apply()
    return mio.toString()
  }

  @Synchronized fun seen(ctx: Context, pkg: String, label: String, at: Long) {
    if (!hayCuenta(ctx)) return
    val o = JSONObject(prefs(ctx).getString(k(ctx, "seen"), "{}") ?: "{}")
    val prev = o.optJSONObject(pkg)
    o.put(pkg, JSONObject().put("app", label).put("count", (prev?.optInt("count") ?: 0) + 1).put("last", at))
    prefs(ctx).edit().putString(k(ctx, "seen"), o.toString()).apply()
  }

  fun seenJson(ctx: Context): String = if (!hayCuenta(ctx)) "{}" else prefs(ctx).getString(k(ctx, "seen"), "{}") ?: "{}"
}

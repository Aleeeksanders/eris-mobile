package expo.modules.hestiamanos

import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat

/**
 * Hestia como JARVIS · C4 (L1, 2026-11-17): lo que el teléfono sabe y Hestia necesita para decidir si puede hablarte, sin permisos
 * nuevos ni ubicación:
 *  - audífonos puestos (Bluetooth, con cable, USB o BLE), por AudioManager;
 *  - «no molestar» (el filtro de interrupciones de Android);
 *  - en una llamada (el audio en modo llamada: teléfono, WhatsApp, Meet);
 *  - la red cambió (la app revisa entonces si alcanza al PC por la red de la casa).
 * Vive en Eris (no en Hestia Manos): así Hestia Manos sigue sin acceso a internet. Cada cambio llega como un evento a JS.
 */
class Sensores(private val ctx: Context, private val avisar: (Map<String, Any?>) -> Unit) {
  private val main = Handler(Looper.getMainLooper())
  private val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val notif = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  private val red = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  private var activo = false

  companion object {
    /** Salidas de audio que son «audífonos» (un parlante Bluetooth también es A2DP: no se distingue sin permisos) */
    val AUDIFONOS = setOf(
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_HEARING_AID,
    ) + (if (Build.VERSION.SDK_INT >= 31) setOf(AudioDeviceInfo.TYPE_BLE_HEADSET) else emptySet())
  }

  /** Lo de ahora, de una vez */
  fun leer(): Map<String, Any?> {
    val salida = try { audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { it.type in AUDIFONOS } } catch (_: Throwable) { null }
    val filtro = try { notif.currentInterruptionFilter } catch (_: Throwable) { NotificationManager.INTERRUPTION_FILTER_ALL }
    val modo = try { audio.mode } catch (_: Throwable) { AudioManager.MODE_NORMAL }
    val wifi = try { red.getNetworkCapabilities(red.activeNetwork)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true } catch (_: Throwable) { false }
    val bloqueado = try { (ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked } catch (_: Throwable) { true }
    return mapOf(
      "audifonos" to (salida != null),
      "audifonosNombre" to salida?.productName?.toString()?.take(60),
      "noMolestar" to (filtro != NotificationManager.INTERRUPTION_FILTER_ALL && filtro != NotificationManager.INTERRUPTION_FILTER_UNKNOWN),
      "llamadaTel" to (modo == AudioManager.MODE_IN_CALL || modo == AudioManager.MODE_IN_COMMUNICATION || modo == AudioManager.MODE_RINGTONE),
      // L2: sonando ≠ en una llamada (la que entra se anuncia mientras suena); bloqueado: la plata no se dice en voz alta (K5)
      "sonando" to (modo == AudioManager.MODE_RINGTONE),
      "enCurso" to (modo == AudioManager.MODE_IN_CALL || modo == AudioManager.MODE_IN_COMMUNICATION),
      "bloqueado" to bloqueado,
      "wifi" to wifi,
    )
  }

  private fun cambio(motivo: String) {
    main.removeCallbacksAndMessages(null)
    // (los audífonos Bluetooth se conectan en dos pasos: se espera un poco y se manda una sola vez)
    main.postDelayed({ try { avisar(leer() + ("motivo" to motivo)) } catch (_: Throwable) {} }, 700)
  }

  private val alAudio = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>?) { cambio("audio") }
    override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>?) { cambio("audio") }
  }
  private val alFiltro = object : BroadcastReceiver() {
    override fun onReceive(c: Context?, i: Intent?) { cambio("no_molestar") }
  }
  private val alModo: Any? = if (Build.VERSION.SDK_INT >= 31) AudioManager.OnModeChangedListener { cambio("llamada") } else null
  /** L2: bloquear o desbloquear el teléfono también cambia lo que se puede decir (la plata) */
  private val alPantalla = object : BroadcastReceiver() {
    override fun onReceive(c: Context?, i: Intent?) { cambio("pantalla") }
  }
  private val alRed = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) { cambio("red") }
    override fun onLost(network: Network) { cambio("red") }
  }

  fun iniciar() {
    if (activo) return
    activo = true
    try { audio.registerAudioDeviceCallback(alAudio, main) } catch (_: Throwable) {}
    try { ContextCompat.registerReceiver(ctx, alFiltro, IntentFilter(NotificationManager.ACTION_INTERRUPTION_FILTER_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED) } catch (_: Throwable) {}
    if (Build.VERSION.SDK_INT >= 31) try { audio.addOnModeChangedListener(ContextCompat.getMainExecutor(ctx), alModo as AudioManager.OnModeChangedListener) } catch (_: Throwable) {}
    try { red.registerDefaultNetworkCallback(alRed) } catch (_: Throwable) {}
    try { ContextCompat.registerReceiver(ctx, alPantalla, IntentFilter().apply { addAction(Intent.ACTION_USER_PRESENT); addAction(Intent.ACTION_SCREEN_OFF) }, ContextCompat.RECEIVER_NOT_EXPORTED) } catch (_: Throwable) {}
  }

  fun detener() {
    if (!activo) return
    activo = false
    main.removeCallbacksAndMessages(null)
    try { audio.unregisterAudioDeviceCallback(alAudio) } catch (_: Throwable) {}
    try { ctx.unregisterReceiver(alFiltro) } catch (_: Throwable) {}
    if (Build.VERSION.SDK_INT >= 31) try { audio.removeOnModeChangedListener(alModo as AudioManager.OnModeChangedListener) } catch (_: Throwable) {}
    try { red.unregisterNetworkCallback(alRed) } catch (_: Throwable) {}
    try { ctx.unregisterReceiver(alPantalla) } catch (_: Throwable) {}
  }
}

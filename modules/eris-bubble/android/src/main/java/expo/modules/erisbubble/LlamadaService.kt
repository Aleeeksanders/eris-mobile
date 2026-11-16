package expo.modules.erisbubble

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Hestia por voz (J3, 2026-11-16): la llamada sigue con el teléfono en el bolsillo o la pantalla apagada.
 *
 * Android solo deja usar el micrófono desde segundo plano a una app con un servicio en primer plano de tipo «micrófono»,
 * y ese servicio solo puede partir con la app en pantalla: se inicia al abrir la llamada (la pantalla de la llamada está
 * a la vista) y se detiene al colgar. Tipo micrófono + reproducción: escucha y habla. La notificación dice que la llamada
 * sigue y trae «Colgar» (avisa a JS con el evento onCallHangup, que cuelga como el botón de la pantalla).
 */
class LlamadaService : Service() {
  companion object {
    private const val CANAL = "hestia_llamada"
    private const val NOTIF_ID = 4711
    const val ACCION_COLGAR = "expo.modules.erisbubble.LLAMADA_COLGAR"
    @Volatile var activa: Boolean = false

    fun iniciar(ctx: Context): Boolean = try {
      val i = Intent(ctx, LlamadaService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i) else ctx.startService(i)
      true
    } catch (_: Throwable) { false }

    fun detener(ctx: Context) {
      try { ctx.stopService(Intent(ctx, LlamadaService::class.java)) } catch (_: Throwable) {}
      activa = false
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACCION_COLGAR) {
      BubbleBridge.emit("onCallHangup")
      stopSelf()
      return START_NOT_STICKY
    }
    val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CANAL) == null) {
      nm.createNotificationChannel(NotificationChannel(CANAL, "Llamada con Hestia", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Mientras hablas con Hestia, también con la pantalla apagada"
        setShowBadge(false)
      })
    }
    val abrir = packageManager.getLaunchIntentForPackage(packageName)?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      PendingIntent.getActivity(this, 10, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val colgar = PendingIntent.getService(
      this, 11, Intent(this, LlamadaService::class.java).setAction(ACCION_COLGAR),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val n: Notification = NotificationCompat.Builder(this, CANAL)
      .setSmallIcon(R.drawable.ic_stat_eris)
      .setColor(0xFFF59E0B.toInt()) // brasa de Hestia
      .setContentTitle("Llamada con Hestia")
      .setContentText("Te sigo escuchando. Tócala para volver a la llamada.")
      .setOngoing(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(abrir)
      .addAction(0, "Colgar", colgar)
      .build()
    val tipo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
      ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
    try {
      ServiceCompat.startForeground(this, NOTIF_ID, n, tipo)
      activa = true
    } catch (_: Throwable) {
      // Android no lo permitió (la app no estaba en pantalla o falta el permiso del micrófono): la llamada sigue mientras esté a la vista
      activa = false
      stopSelf()
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    activa = false
    super.onDestroy()
  }
}

package expo.modules.erisbubble

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Choreographer
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.animation.OvershootInterpolator
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.dynamicanimation.animation.FloatValueHolder
import androidx.dynamicanimation.animation.SpringAnimation
import androidx.dynamicanimation.animation.SpringForce
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Dibuja la burbuja de Eris sobre las demás apps (ventana TYPE_APPLICATION_OVERLAY), como las burbujas de chat:
 *  - se arrastra siguiendo el dedo (una actualización por cuadro de pantalla) y, al soltarla, sigue la inercia del
 *    gesto y se asienta en el borde con un resorte;
 *  - al arrastrar aparece una "✕" abajo; cerca de ella la burbuja se imanta, y soltarla ahí la cierra por esta vez;
 *  - un toque abre la app directo en el chat de Eris.
 * Mientras la app está en pantalla la burbuja del sistema se esconde (ahí está la de React Native). Android exige un
 * servicio en primer plano, con su notificación, para mantenerla viva fuera de la app.
 */
class BubbleService : Service() {
  companion object {
    @Volatile var instance: BubbleService? = null
    private const val CHANNEL = "eris_bubble"
    private const val NOTIF_ID = 4711
    private const val SIZE_DP = 56        // disco de la burbuja
    private const val PAD_DP = 12         // margen de la ventana alrededor del disco, para los brillitos
    private const val MARGIN_DP = 12
    private const val TARGET_DP = 64
    private const val TARGET_BOTTOM_DP = 96
    private const val MAGNET_DP = 96      // a esta distancia de la ✕ la burbuja se imanta
    private const val FLING_X = 900f       // px/s horizontales: por sobre esto, gana la dirección del lanzamiento
  }

  private lateinit var wm: WindowManager
  private val choreographer by lazy { Choreographer.getInstance() }

  private var bubble: BubbleView? = null
  private var params: WindowManager.LayoutParams? = null
  private var target: TextView? = null


  // Posición: el dedo propone, y se aplica UNA vez por cuadro (cada updateViewLayout es una llamada al sistema)
  private var wantX = 0f
  private var wantY = 0f
  private var framePosted = false
  private val frame = Choreographer.FrameCallback { framePosted = false; applyPosition() }
  private var springX: SpringAnimation? = null
  private var springY: SpringAnimation? = null
  private var magnetized = false

  private fun dp(v: Int) = (v * resources.displayMetrics.density).roundToInt()
  private fun dpf(v: Float) = v * resources.displayMetrics.density
  private val screenW get() = resources.displayMetrics.widthPixels
  private val screenH get() = resources.displayMetrics.heightPixels
  /** Lado de la ventana de la burbuja (disco + margen para los brillitos). */
  private val size get() = dp(SIZE_DP + 2 * PAD_DP)
  /** Distancia del disco al borde de la pantalla, descontado el margen de la ventana. */
  private val edgeGap get() = dp(MARGIN_DP) - dp(PAD_DP)

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    wm = getSystemService(WINDOW_SERVICE) as WindowManager
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startInForeground()
    if (!Settings.canDrawOverlays(this) || !BubblePrefs.isEnabled(this)) {
      stopSelf()
      return START_NOT_STICKY
    }
    updateVisibility()
    return START_STICKY
  }

  override fun onDestroy() {
    removeBubble()
    if (instance === this) instance = null
    super.onDestroy()
  }

  /** Muestra la burbuja solo si la app no está en pantalla. */
  fun updateVisibility() {
    if (BubbleBridge.appForeground) removeBubble() else addBubble()
  }

  // ─── Notificación (obligatoria para el servicio en primer plano) ───────────────
  private fun startInForeground() {
    val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Burbuja de Eris", NotificationManager.IMPORTANCE_MIN).apply {
        description = "Mantiene a Eris activa como burbuja cuando sales de la app"
        setShowBadge(false)
      })
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_eris)
      .setColor(if (BubbleBridge.persona == "hestia") 0xFFF59E0B.toInt() else 0xFF34D399.toInt()) // núcleo: menta Eris / brasa Hestia
      .setContentTitle("${personaName()} sigue activa")
      .setContentText(
        if (BubbleBridge.persona == "hestia") "En segundo plano, como burbuja. Tócala para volver al chat; mantenla presionada para llamar a Hestia; arrástrala a la ✕ para cerrarla."
        else "En segundo plano, como burbuja. Tócala para volver al chat; arrástrala a la ✕ para cerrarla.")
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setContentIntent(open)
      .build()
    val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
    ServiceCompat.startForeground(this, NOTIF_ID, notification, type)
  }

  // ─── Ventanas ──────────────────────────────────────────────────────────────────
  private fun overlayType() =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

  private fun overlayParams(w: Int, h: Int, touchable: Boolean) = WindowManager.LayoutParams(
    w, h, overlayType(),
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
      WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED or
      (if (touchable) 0 else WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE),
    PixelFormat.TRANSLUCENT,
  ).apply { gravity = Gravity.TOP or Gravity.START }

  private fun addBubble() {
    if (bubble != null || !Settings.canDrawOverlays(this)) return

    // La ✕ va PRIMERO: así queda debajo de la burbuja. Antes se agregaba al empezar a arrastrar y había que sacar y
    // volver a poner la burbuja para dejarla encima, lo que cortaba el gesto a mitad del arrastre.
    addTarget()

    val view = BubbleView(this, dp(SIZE_DP), dp(PAD_DP)).apply { persona = BubbleBridge.persona; state = BubbleBridge.state }

    // Posición: donde estaba la burbuja de dentro de la app, si la mandó; si no, la última guardada; si no, a la derecha.
    val (sx, sy) = BubblePrefs.position(this)
    val handoff = BubbleBridge.handoffCenterDp
    val (startX, startY) = when {
      handoff != null -> (dpf(handoff.first) - size / 2f).roundToInt() to (dpf(handoff.second) - size / 2f).roundToInt()
      sx >= 0 && sy >= 0 -> sx to sy
      else -> (screenW - size - edgeGap) to (screenH * 0.6f).roundToInt()
    }
    val lp = overlayParams(size, size, touchable = true).apply { x = clampX(startX.toFloat()); y = clampY(startY.toFloat()) }
    wantX = lp.x.toFloat(); wantY = lp.y.toFloat()

    view.setOnTouchListener(DragListener())
    try {
      wm.addView(view, lp)
    } catch (_: Throwable) {
      removeTarget()
      return // sin permiso a último momento: no hay burbuja, la app sigue igual
    }
    bubble = view; params = lp
    view.scaleX = 0f; view.scaleY = 0f
    view.animate().scaleX(1f).scaleY(1f).setDuration(220).setInterpolator(OvershootInterpolator()).start()
    applyState()
  }

  private fun removeBubble() {
    stopSprings()
    if (framePosted) { choreographer.removeFrameCallback(frame); framePosted = false }
    bubble?.let { v ->
      params?.let { BubblePrefs.savePosition(this, it.x, it.y) }
      try { wm.removeView(v) } catch (_: Throwable) {}
    }
    bubble = null; params = null
    removeTarget()
  }

  private fun clampX(x: Float) = min(max(x.roundToInt(), 0), screenW - size)
  private fun clampY(y: Float) = min(max(y.roundToInt(), dp(24)), screenH - size - dp(24))

  /** Pide mover la burbuja; se aplica en el próximo cuadro (varios eventos de toque por cuadro = un solo movimiento). */
  private fun moveTo(x: Float, y: Float) {
    wantX = x; wantY = y
    if (!framePosted) { framePosted = true; choreographer.postFrameCallback(frame) }
  }

  private fun applyPosition() {
    val v = bubble ?: return
    val lp = params ?: return
    val nx = clampX(wantX); val ny = clampY(wantY)
    if (nx == lp.x && ny == lp.y) return
    lp.x = nx; lp.y = ny
    try { wm.updateViewLayout(v, lp) } catch (_: Throwable) {}
  }

  private fun personaName() = if (BubbleBridge.persona == "hestia") "Hestia" else "Eris"

  /** Eris ↔ Hestia (Modo AXS Executive): ícono de la burbuja y título de la notificación. */
  fun applyPersona() {
    bubble?.persona = BubbleBridge.persona
    try { startInForeground() } catch (_: Throwable) {} // misma notificación (mismo id), con el nombre nuevo
  }

  // ─── Estado (anillo / punto) ───────────────────────────────────────────────────
  /** Refleja lo que está haciendo Eris mientras estás fuera de la app (ver BubbleBridge.state). */
  fun applyState() {
    val v = bubble ?: return
    val next = BubbleBridge.state
    if (next == "reply" && v.state != "reply") {
      // Rebote cuando la respuesta queda lista
      v.animate().scaleX(1.15f).scaleY(1.15f).setDuration(140).withEndAction {
        v.animate().scaleX(1f).scaleY(1f).setDuration(220).setInterpolator(OvershootInterpolator()).start()
      }.start()
    }
    v.state = next
  }

  // ─── Arrastre, toque y cierre ─────────────────────────────────────────────────
  private inner class DragListener : View.OnTouchListener {
    private var downX = 0f
    private var downY = 0f
    private var startX = 0f
    private var startY = 0f
    private var dragging = false
    private var velocity: VelocityTracker? = null
    private val slop = ViewConfiguration.get(this@BubbleService).scaledTouchSlop
    // J3: mantenerla presionada (sin moverla) con Hestia en la burbuja abre la llamada de voz
    private var largo = false
    private var vista: View? = null
    private val alMantener = Runnable {
      if (dragging || BubbleBridge.persona != "hestia") return@Runnable
      largo = true
      vista?.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
      vista?.animate()?.scaleX(1f)?.scaleY(1f)?.setDuration(120)?.start()
      openEris(llamada = true)
    }

    override fun onTouch(v: View, e: MotionEvent): Boolean {
      val lp = params ?: return false
      when (e.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          stopSprings()
          velocity?.recycle(); velocity = VelocityTracker.obtain().also { it.addMovement(e) }
          downX = e.rawX; downY = e.rawY; startX = lp.x.toFloat(); startY = lp.y.toFloat(); dragging = false
          v.animate().scaleX(0.92f).scaleY(0.92f).setDuration(90).start()
          largo = false; vista = v
          v.removeCallbacks(alMantener)
          if (BubbleBridge.persona == "hestia") v.postDelayed(alMantener, ViewConfiguration.getLongPressTimeout().toLong() + 150)
        }
        MotionEvent.ACTION_MOVE -> {
          velocity?.addMovement(e)
          if (!dragging && hypot(e.rawX - downX, e.rawY - downY) > slop) {
            // Sin salto: el arrastre empieza desde donde está el dedo ahora, no desde el toque inicial
            dragging = true
            v.removeCallbacks(alMantener)
            downX = e.rawX; downY = e.rawY; startX = lp.x.toFloat(); startY = lp.y.toFloat()
            v.animate().scaleX(1f).scaleY(1f).setDuration(120).start()
            showTarget()
          }
          if (dragging) {
            val x = startX + (e.rawX - downX)
            val y = startY + (e.rawY - downY)
            val near = isNearTarget(x, y)
            if (near != magnetized) setMagnet(near)
            if (near) {
              val (tx, ty) = targetBubblePos()
              moveTo(tx, ty) // imantada: se queda en la ✕ mientras el dedo esté cerca
            } else moveTo(x, y)
          }
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          velocity?.addMovement(e)
          velocity?.computeCurrentVelocity(1000)
          val vx = velocity?.xVelocity ?: 0f
          val vy = velocity?.yVelocity ?: 0f
          velocity?.recycle(); velocity = null
          v.removeCallbacks(alMantener)
          v.animate().scaleX(1f).scaleY(1f).setDuration(120).start()
          when {
            largo -> {} // ya abrió la llamada
            !dragging && e.actionMasked == MotionEvent.ACTION_UP -> openEris()
            dragging && magnetized -> closeByUser()
            dragging -> settle(vx, vy)
          }
          if (dragging && !magnetized) hideTarget()
          dragging = false
        }
      }
      return true
    }
  }

  /** Al soltar: sigue la inercia del gesto y se asienta en un borde con un resorte (un poco de rebote). */
  private fun settle(vx: Float, vy: Float) {
    val lp = params ?: return
    if (framePosted) { choreographer.removeFrameCallback(frame); framePosted = false; applyPosition() }
    val right = when {
      vx > FLING_X -> true
      vx < -FLING_X -> false
      else -> lp.x + size / 2 >= screenW / 2
    }
    val toX = if (right) (screenW - size - edgeGap).toFloat() else edgeGap.toFloat()
    // En vertical conserva parte del impulso, dentro de la pantalla
    val toY = clampY(lp.y + vy * 0.12f).toFloat()

    stopSprings()
    val holderX = FloatValueHolder(lp.x.toFloat())
    val holderY = FloatValueHolder(lp.y.toFloat())
    springX = SpringAnimation(holderX).apply {
      spring = SpringForce(toX).setDampingRatio(0.72f).setStiffness(420f)
      setStartVelocity(vx)
      addUpdateListener { _, value, _ -> moveTo(value, holderY.value) }
      addEndListener { _, _, _, _ -> BubblePrefs.savePosition(this@BubbleService, toX.roundToInt(), clampY(holderY.value)) }
      start()
    }
    springY = SpringAnimation(holderY).apply {
      spring = SpringForce(toY).setDampingRatio(0.85f).setStiffness(320f)
      setStartVelocity(vy * 0.5f)
      addUpdateListener { _, value, _ -> moveTo(holderX.value, value) }
      start()
    }
  }

  private fun stopSprings() {
    springX?.cancel(); springY?.cancel()
    springX = null; springY = null
  }

  private fun openEris(llamada: Boolean = false) {
    BubbleBridge.pendingOpen = true
    if (llamada) BubbleBridge.pendingCall = true
    val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra("eris_open_chat", true)
      if (llamada) putExtra("hestia_llamada", true)
    } ?: return
    try { startActivity(intent) } catch (_: Throwable) {}
    BubbleBridge.emit("onBubbleTap")
  }

  /**
   * Soltada sobre la "✕": se cierra solo por ahora (sin notificación ni servicio). El modo burbuja sigue activo: la
   * próxima vez que salgas de la app vuelve a aparecer. Para apagarlo del todo está el interruptor en Perfil.
   */
  private fun closeByUser() {
    val v = bubble
    target?.animate()?.scaleX(0.6f)?.scaleY(0.6f)?.alpha(0f)?.setDuration(180)?.start()
    v?.animate()?.scaleX(0f)?.scaleY(0f)?.setDuration(180)?.withEndAction {
      removeBubble()
      BubbleBridge.emit("onBubbleClosed")
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      stopSelf()
    }?.start()
  }

  // ─── Zona de cierre ("✕" abajo) ───────────────────────────────────────────────
  private fun targetCenter(): Pair<Float, Float> = screenW / 2f to (screenH - dpf(TARGET_BOTTOM_DP.toFloat()) - dpf(TARGET_DP / 2f))

  /** Esquina superior izquierda que deja la burbuja centrada en la ✕. */
  private fun targetBubblePos(): Pair<Float, Float> = targetCenter().let { (cx, cy) -> (cx - size / 2f) to (cy - size / 2f) }

  private fun addTarget() {
    if (target != null) return
    val tsize = dp(TARGET_DP)
    val tv = TextView(this).apply {
      text = "✕"
      textSize = 22f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#CC1A1A22"))
        setStroke(dp(2), Color.parseColor("#66FFFFFF"))
      }
      alpha = 0f
    }
    val (cx, cy) = targetCenter()
    val lp = overlayParams(tsize, tsize, touchable = false).apply {
      x = (cx - tsize / 2f).roundToInt(); y = (cy - tsize / 2f).roundToInt()
    }
    try { wm.addView(tv, lp) } catch (_: Throwable) { return }
    target = tv
  }

  private fun showTarget() {
    target?.apply {
      animate().cancel()
      scaleX = 1f; scaleY = 1f; translationY = dpf(24f)
      animate().alpha(1f).translationY(0f).setDuration(160).start()
    }
  }

  private fun hideTarget() {
    setMagnet(false)
    target?.animate()?.alpha(0f)?.translationY(dpf(24f))?.setDuration(140)?.start()
  }

  private fun removeTarget() {
    target?.let { try { wm.removeView(it) } catch (_: Throwable) {} }
    target = null
  }

  private fun isNearTarget(x: Float, y: Float): Boolean {
    val (cx, cy) = targetCenter()
    return hypot(x + size / 2f - cx, y + size / 2f - cy) < dpf(MAGNET_DP.toFloat())
  }

  private fun setMagnet(on: Boolean) {
    if (on == magnetized) return
    magnetized = on
    if (on) bubble?.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    target?.animate()?.scaleX(if (on) 1.25f else 1f)?.scaleY(if (on) 1.25f else 1f)?.setDuration(120)?.start()
    (target?.background as? GradientDrawable)?.setColor(Color.parseColor(if (on) "#E6D92D3F" else "#CC1A1A22"))
  }
}

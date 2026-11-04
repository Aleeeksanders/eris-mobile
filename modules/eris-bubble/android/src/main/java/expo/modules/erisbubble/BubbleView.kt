package expo.modules.erisbubble

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import android.os.SystemClock
import android.view.View
import android.view.ViewOutlineProvider
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/**
 * La burbuja de Eris sobre otras apps: disco oscuro con el ícono de Eris (el condensado, ErisMarkDrawer: el mismo
 * dibujo y las mismas animaciones que la burbuja de dentro de la app), brillitos que titilan alrededor, y el estado
 * de Eris en segundo plano (anillo que late y átomos cayendo al núcleo = respondiendo; punto = respuesta lista).
 * La ventana es más grande que el disco para que los brillitos quepan afuera.
 */
class BubbleView(context: Context, private val discPx: Int, private val padPx: Int) : View(context) {
  private val d = resources.displayMetrics.density

  /** "idle" | "thinking" | "reply" */
  var state: String = "idle"
    set(v) { field = v; mark.setState(v); invalidate() }

  /** "eris" | "hestia" (Modo AXS Executive): núcleo, halo, anillo y brillitos. */
  var persona: String = "eris"
    set(v) {
      field = v
      mark.setPersona(v)
      val accent = Color.parseColor(if (v == "hestia") "#3B82F6" else "#22D3EE")
      rimPaint.color = (accent and 0x00FFFFFF) or (0x4D shl 24)
      ringPaint.color = accent
      badgePaint.color = accent
      sparks = sparksFor(v)
      if (width > 0) onSizeChanged(width, height, width, height)
      invalidate()
    }

  private val start = SystemClock.uptimeMillis()
  private val mark = ErisMarkDrawer()

  private val discPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#07060B") }
  private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE; strokeWidth = 1.5f * d; color = Color.parseColor("#4D22D3EE")
  }
  private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 3f * d; color = Color.parseColor("#22D3EE") }
  private val badgePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#22D3EE") }
  private val badgeRim = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 2f * d; color = Color.parseColor("#07060B") }
  private val sparkPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val star = Path()

  // Brillitos: ángulo (°), distancia (fracción del radio del disco), tamaño (dp), fase, color
  private data class Spark(val deg: Float, val dist: Float, val size: Float, val phase: Float, val color: Int)
  // (mismos valores que ErisFAB.tsx: la burbuja de dentro y la de fuera de la app se ven iguales)
  private fun sparksFor(p: String) = listOf(
    Spark(-58f, 1.22f, 5.5f, 0.00f, Color.WHITE),
    Spark(22f, 1.28f, 4.0f, 0.35f, Color.parseColor(if (p == "hestia") "#FDE68A" else "#A7F3D0")),
    Spark(140f, 1.20f, 4.5f, 0.62f, Color.parseColor(if (p == "hestia") "#3B82F6" else "#22D3EE")),
    Spark(205f, 1.26f, 3.5f, 0.18f, Color.parseColor("#C4B5FD")),
  )
  private var sparks = sparksFor("eris")

  init {
    // La sombra sigue al disco, no a la ventana completa
    outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(v: View, o: Outline) { o.setOval(padPx, padPx, padPx + discPx, padPx + discPx) }
    }
    elevation = 6f * d
    // Estrella de 4 puntas de radio 1 (se escala al dibujar)
    star.moveTo(0f, -1f)
    star.quadTo(0.14f, -0.14f, 1f, 0f)
    star.quadTo(0.14f, 0.14f, 0f, 1f)
    star.quadTo(-0.14f, 0.14f, -1f, 0f)
    star.quadTo(-0.14f, -0.14f, 0f, -1f)
    star.close()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    mark.play("appear") // los átomos llegan y se condensan cada vez que la burbuja aparece
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    val cx = w / 2f; val cy = h / 2f; val r = discPx / 2f
    // Halo del núcleo (menta de Eris / brasa de Hestia) que se funde en el color de AXS (cian / azul)
    val halo = if (persona == "hestia") intArrayOf(Color.parseColor("#38F59E0B"), Color.parseColor("#143B82F6"), Color.TRANSPARENT)
      else intArrayOf(Color.parseColor("#3834D399"), Color.parseColor("#1422D3EE"), Color.TRANSPARENT)
    glowPaint.shader = RadialGradient(cx, cy, r + padPx * 0.9f,
      halo,
      floatArrayOf(0.55f, 0.8f, 1f), Shader.TileMode.CLAMP)
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val t = (SystemClock.uptimeMillis() - start) / 1000f
    val cx = width / 2f; val cy = height / 2f; val r = discPx / 2f

    canvas.drawCircle(cx, cy, r + padPx * 0.9f, glowPaint)
    canvas.drawCircle(cx, cy, r, discPaint)
    canvas.drawCircle(cx, cy, r - rimPaint.strokeWidth / 2f, rimPaint)

    mark.draw(canvas, cx, cy, r, drawDisc = false)

    when (state) {
      "thinking" -> {
        val k = 0.5f + 0.5f * sin(t * 2f * PI.toFloat() / 1.4f)
        ringPaint.alpha = (70 + 185 * k).toInt()
        canvas.drawCircle(cx, cy, r - ringPaint.strokeWidth / 2f, ringPaint)
      }
      "reply" -> {
        val bx = cx + r * 0.66f; val by = cy - r * 0.66f; val br = 7f * d
        canvas.drawCircle(bx, by, br, badgePaint)
        canvas.drawCircle(bx, by, br, badgeRim)
      }
    }

    // Brillitos: cada uno titila con su propia fase (brillo rápido, apagado lento)
    for (s in sparks) {
      val k = ((sin(2f * PI.toFloat() * (t / 2.6f + s.phase)) + 1f) / 2f).toDouble().pow(3.0).toFloat()
      val a = Math.toRadians(s.deg.toDouble())
      val px = cx + (cos(a) * r * s.dist).toFloat()
      val py = cy + (sin(a) * r * s.dist).toFloat()
      val size = s.size * d * (0.55f + 0.65f * k)
      sparkPaint.color = s.color
      sparkPaint.alpha = (25 + 230 * k).toInt()
      canvas.save()
      canvas.translate(px, py)
      canvas.scale(size, size)
      canvas.drawPath(star, sparkPaint)
      canvas.restore()
    }

    // Animación continua mientras la burbuja esté en pantalla
    if (isAttachedToWindow) postInvalidateOnAnimation()
  }
}

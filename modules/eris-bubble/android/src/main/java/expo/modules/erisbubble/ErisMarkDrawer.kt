package expo.modules.erisbubble

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.os.SystemClock
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * El ícono de Eris: un condensado de Bose-Einstein. Una nube de átomos (en el color del módulo donde estás) que se
 * hace más densa hacia un núcleo menta (paleta "Plasma con núcleo aurora"). Lo dibujan la burbuja sobre otras apps
 * (BubbleView) y la de dentro de la app (ErisMarkView), así ambas son idénticas.
 *
 * Unidades: disco de radio 100 (las mismas del kit de marca, AXS Marca/_fuente/generar_logos.py → eris_mark).
 *
 * Estados continuos: idle (gira como galaxia), thinking (los átomos caen al núcleo), reply (como idle; al entrar,
 * pulso y anillo que sale), listening / speaking (reaccionan a una amplitud de voz), offline (congelado en gris).
 * Momentos de una sola vez: appear (los átomos llegan y se condensan), rank (implosión y explosión),
 * close (se evapora y queda oculto hasta el próximo appear).
 */
class ErisMarkDrawer {
  private data class Particle(val u1: Double, val u2: Double, val u3: Double, val r0: Float, val a0: Float, val s0: Float, val zone: Int, val op: Float)
  private class Tint(val mid: Int, val outer: Int)
  /** Lo que distingue a cada asistente: núcleo, su halo, átomos internos y la nube del chat (los módulos tiñen igual). */
  private class Palette(val core: IntArray, val glow: Int, val inner: Int, val chat: Tint)

  companion object {
    private fun c(hex: String) = Color.parseColor(hex)
    private fun rnd(x: Int, y: Int): Double { val v = sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - floor(v) }

    val CORE = intArrayOf(c("#ECFDF5"), c("#34D399"), c("#047857"))
    val GLOW = c("#34D399")
    val INNER = c("#A7F3D0")
    val GRAY = c("#64748B")
    private val TINTS = mapOf(
      "chat" to Tint(c("#67E8F9"), c("#22D3EE")),
      "finanzas" to Tint(c("#C4B5FD"), c("#A78BFA")),
      "forge" to Tint(c("#FDBA74"), c("#FB923C")),
      "nutricion" to Tint(c("#6EE7B7"), c("#34D399")),
      "salud" to Tint(c("#FDA4AF"), c("#FB7185")),
    )
    private val ONE_SHOT = mapOf("appear" to 1400L, "rank" to 2200L, "close" to 1200L, "replyPulse" to 1600L)
    private const val TINT_MS = 500L

    /** Eris: núcleo menta en una nube cian ("Plasma con núcleo aurora"). */
    private val ERIS = Palette(CORE, GLOW, INNER, Tint(c("#67E8F9"), c("#22D3EE")))
    /** Hestia (Modo AXS Executive): el fuego del hogar —núcleo brasa/ámbar— en una nube azul AXS (el anillo cian→azul). */
    private val HESTIA = Palette(intArrayOf(c("#FFFBEB"), c("#F59E0B"), c("#B45309")), c("#F59E0B"), c("#FDE68A"), Tint(c("#7DD3FC"), c("#3B82F6")))
    private val PALETTES = mapOf("eris" to ERIS, "hestia" to HESTIA)

    /** Misma nube que el kit de marca y la app: 64 átomos, más densos y dorados (menta) hacia el centro. */
    private val PARTICLES = List(64) { i ->
      val u1 = rnd(i, 7); val u2 = rnd(i, 13); val u3 = rnd(i, 29)
      val r0 = (22 + 52 * (1 - exp(-2.2 * u1)) / (1 - exp(-2.2))).toFloat()
      val q = (r0 - 22) / 52
      Particle(u1, u2, u3, r0, (u2 * 2 * PI).toFloat(), (1.2 + 2.5 * (1 - q).toDouble().pow(1.3)).toFloat(),
        if (r0 < 33) 0 else if (r0 < 50) 1 else 2, 0.95f - 0.55f * q)
    }
  }

  private val t0 = SystemClock.uptimeMillis()
  private var base = "idle"
  private var oneShot: String? = null
  private var oneStart = 0L
  private var hiddenAfterClose = false

  private var fromTint = TINTS.getValue("chat")
  private var toTint = TINTS.getValue("chat")
  private var tintStart = 0L
  private var tintKey = "chat"
  private var palette = ERIS

  private val discPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = c("#07060B") }
  private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  // Brillo arriba a la izquierda (cx 36 %, cy 32 %, r 75 % de la caja del núcleo de radio 16), como en el SVG
  private fun coreShader(colors: IntArray) =
    RadialGradient(-16f + 0.36f * 32f, -16f + 0.32f * 32f, 0.75f * 32f, colors, floatArrayOf(0f, 0.4f, 1f), Shader.TileMode.CLAMP)
  private val corePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = coreShader(CORE) }
  private val coreGray = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    shader = RadialGradient(-16f + 0.36f * 32f, -16f + 0.32f * 32f, 0.75f * 32f, intArrayOf(c("#A8A29E"), c("#44403C")), null, Shader.TileMode.CLAMP)
  }

  /** Estado de Eris. Los momentos (appear, rank, close) se reproducen una vez y vuelven al estado de fondo. */
  fun setState(s: String) {
    if (s in ONE_SHOT) { play(s); return }
    if (s == "reply" && base != "reply") play("replyPulse")
    base = s
    if (s != "close") hiddenAfterClose = false
  }

  fun play(moment: String) {
    oneShot = moment
    oneStart = SystemClock.uptimeMillis()
    if (moment == "appear") hiddenAfterClose = false
  }

  /** Quién es: "eris" (por defecto) o "hestia" (Modo AXS Executive). Cambia núcleo, halo y la nube del chat. */
  fun setPersona(id: String) {
    val next = PALETTES[id] ?: ERIS
    if (next === palette) return
    palette = next
    corePaint.shader = coreShader(next.core)
    setTint(tintKey, force = true)
  }

  /** Color de la nube según el módulo ("chat", "finanzas", "forge", "nutricion", "salud"), con transición. */
  fun setTint(key: String, force: Boolean = false) {
    tintKey = key
    val next = if (key == "chat" || key !in TINTS) palette.chat else TINTS.getValue(key)
    if (next === toTint && !force) return
    val now = SystemClock.uptimeMillis()
    fromTint = currentTint(now)
    toTint = next
    tintStart = now
  }

  private fun currentTint(now: Long): Tint {
    val p = clamp((now - tintStart) / TINT_MS.toFloat())
    if (p >= 1f) return toTint
    val e = if (p < 0.5f) 2 * p * p else 1 - (-2 * p + 2).pow(2) / 2
    return Tint(lerp(fromTint.mid, toTint.mid, e), lerp(fromTint.outer, toTint.outer, e))
  }

  private fun clamp(x: Float, a: Float = 0f, b: Float = 1f) = max(a, min(b, x))
  private fun eo(x: Float) = 1 - (1 - x).pow(3)
  private fun ei(x: Float) = x * x * x
  private fun lerp(a: Int, b: Int, p: Float): Int {
    fun ch(s: Int) = (((a shr s) and 255) + ((((b shr s) and 255) - ((a shr s) and 255)) * p)).toInt()
    return Color.argb(255, ch(16), ch(8), ch(0))
  }

  private fun dot(canvas: Canvas, x: Float, y: Float, r: Float, color: Int, op: Float) {
    if (r <= 0f || op <= 0.01f) return
    dotPaint.color = color
    dotPaint.alpha = (clamp(op) * 255).toInt()
    canvas.drawCircle(x, y, r, dotPaint)
  }

  /**
   * Dibuja el ícono centrado en (cx, cy) con radio rPx. Devuelve true mientras haya animación (siempre: la nube gira).
   * @param amp amplitud de voz 0..1 para listening/speaking (null = simulada).
   */
  fun draw(canvas: Canvas, cx: Float, cy: Float, rPx: Float, drawDisc: Boolean, amp: Float? = null): Boolean {
    val now = SystemClock.uptimeMillis()
    val t = (now - t0) / 1000f
    val a = amp ?: min(1f, abs((sin(t * 7.1f) + sin(t * 11.3f + 1f) + sin(t * 3.7f + 2f)) / 2f))
    val tint = currentTint(now)
    val inner = palette.inner
    val zone = intArrayOf(inner, tint.mid, tint.outer)

    var mode = oneShot ?: base
    var L = 0f
    oneShot?.let { m ->
      L = clamp((now - oneStart) / ONE_SHOT.getValue(m).toFloat())
      if (L >= 1f) { oneShot = null; if (m == "close") hiddenAfterClose = true; mode = base }
    }

    canvas.save()
    canvas.translate(cx, cy)
    canvas.scale(rPx / 100f, rPx / 100f)
    if (drawDisc) canvas.drawCircle(0f, 0f, 100f, discPaint)
    if (hiddenAfterClose && oneShot == null) { canvas.restore(); return true }

    for (p in PARTICLES) {
      var r = p.r0; var ang = p.a0; var s = p.s0; var col = zone[p.zone]; var op = p.op
      val sw = t * 0.12f * (1.25f - (p.r0 - 22) / 52)
      when (mode) {
        "thinking" -> {
          val f = ((t / 2.4f + p.u1.toFloat()) % 1f)
          r = 74 - 54 * f; ang = p.a0 + f * 1.6f + t * 0.1f
          op = min(1f, f * 4) * (1 - max(0f, (f - 0.8f) * 5)); s = 1.3f + 2.5f * f
          col = if (f > 0.7f) inner else tint.outer
        }
        "listening" -> { ang += sw + 0.06f * a * sin(t * 13 + p.u3.toFloat() * 40); r *= 1 + 0.13f * a * sin(t * 9 + p.u2.toFloat() * 30) }
        "speaking" -> {
          if (p.u3 > 0.45) {
            val f = ((t / 1.5f + p.u1.toFloat()) % 1f)
            r = 18 + 58 * f; op = (1 - f) * (0.35f + 0.65f * a); col = if (f < 0.3f) inner else tint.outer
          } else ang += sw
        }
        "rank" -> if (L < 0.4f) { val k = ei(L / 0.4f); r = p.r0 * (1 - k) + 14 * k } else {
          val k = eo((L - 0.4f) / 0.6f); r = 14 + p.r0 * k; if (k < 0.85f) col = inner
        }
        "offline" -> { col = GRAY; op *= 0.55f }
        "appear" -> { ang += sw; r = p.r0 + (1 - eo(L)) * 85; op *= clamp(L * 1.5f) }
        "close" -> { ang += sw; r = p.r0 + ei(L) * 90; op *= 1 - L }
        else -> { ang += sw; r += 1.5f * sin(t * 1.3f + p.u3.toFloat() * 20) } // idle, reply, replyPulse
      }
      dot(canvas, r * cos(ang), r * sin(ang), s, col, op)
    }

    // Anillo que sale al llegar una respuesta, y chispas al subir de rango
    if (mode == "replyPulse") {
      val k = eo(L); val rr = 16 + 60 * k
      for (i in 0 until 16) { val an = i * PI.toFloat() / 8; dot(canvas, rr * cos(an), rr * sin(an), 2.6f, inner, 1 - L) }
    }
    if (mode == "rank" && L > 0.4f) {
      val k = eo((L - 0.4f) / 0.6f); val rr = 20 + 70 * k
      for (i in 0 until 12) { val an = i * PI.toFloat() / 6 + 0.2f; dot(canvas, rr * cos(an), rr * sin(an), 3.4f * (1 - k) + 0.5f, Color.WHITE, 1 - k) }
    }

    // Núcleo
    val ck = when (mode) {
      "replyPulse" -> 1 + 0.35f * sin(PI.toFloat() * L)
      "rank" -> 1 + 0.7f * sin(PI.toFloat() * min(1f, L / 0.6f))
      "appear" -> eo(clamp((L - 0.25f) / 0.75f))
      "close" -> 1 - ei(L)
      "speaking" -> 1 + 0.12f * a
      else -> 1f
    }
    if (ck > 0.01f) {
      val gray = mode == "offline"
      val g = if (mode == "listening") 1 + 0.6f * a else 1f
      dot(canvas, 0f, 0f, 16 * 1.6f * g * ck, if (gray) c("#57534E") else palette.glow, 0.15f)
      canvas.save()
      canvas.scale(ck, ck)
      canvas.drawCircle(0f, 0f, 16f, if (gray) coreGray else corePaint)
      canvas.restore()
    }
    canvas.restore()
    return true
  }
}

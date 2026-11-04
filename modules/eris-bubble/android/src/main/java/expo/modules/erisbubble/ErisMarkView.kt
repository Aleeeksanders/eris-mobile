package expo.modules.erisbubble

import android.content.Context
import android.graphics.Canvas
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.min

/**
 * El ícono animado de Eris para dentro de la app (burbuja flotante, cargas de los módulos, portal).
 * Mismo dibujo que la burbuja sobre otras apps (ErisMarkDrawer); dibujarlo en nativo evita mover 64 átomos desde
 * JavaScript en cada cuadro. Props desde JS: state, tint, disc.
 */
class ErisMarkView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  val mark = ErisMarkDrawer()
  var drawDisc = true
    set(v) { field = v; invalidate() }

  init {
    setWillNotDraw(false)
    mark.play("appear")
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val w = width.toFloat(); val h = height.toFloat()
    if (w <= 0f || h <= 0f) return
    mark.draw(canvas, w / 2f, h / 2f, min(w, h) / 2f, drawDisc)
    // Solo se anima mientras se ve (con la vista oculta, Android no la dibuja y no se pide otro cuadro)
    if (isAttachedToWindow && isShown) postInvalidateOnAnimation()
  }

  override fun onVisibilityChanged(changedView: View, visibility: Int) {
    super.onVisibilityChanged(changedView, visibility)
    if (visibility == View.VISIBLE) invalidate()
  }
}

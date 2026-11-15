package expo.modules.erisbubble

import android.content.Context
import android.view.ViewTreeObserver
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * Mide el teclado de la ventana donde vive. Con la app «edge-to-edge» (Expo 54) la ventana de un Modal ya no se encoge
 * cuando se abre el teclado, y las hojas de formularios quedaban debajo de él (2026-11-15, «Ajustar saldo» en Finanzas).
 * Los eventos de teclado de React Native salen de la ventana de la actividad, no de la del Modal: esta vista invisible,
 * puesta dentro de la hoja, lee el alto del teclado de SU ventana y lo avisa a JS con onIme { height } (dp, desde el
 * borde de abajo de la pantalla; 0 sin teclado). Ver src/components/KeyboardLift.tsx.
 */
class ImeWatcherView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onIme by EventDispatcher()
  private var last = -1

  private val layoutListener = ViewTreeObserver.OnGlobalLayoutListener { check() }

  private fun check() {
    val insets = ViewCompat.getRootWindowInsets(this) ?: return
    val visible = insets.isVisible(WindowInsetsCompat.Type.ime())
    val px = if (visible) insets.getInsets(WindowInsetsCompat.Type.ime()).bottom else 0
    val dp = Math.round(px / resources.displayMetrics.density)
    if (dp != last) {
      last = dp
      onIme(mapOf("height" to dp))
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    // Al abrirse el teclado cambian los insets de la ventana y Android vuelve a distribuirla: ahí se mide
    viewTreeObserver.addOnGlobalLayoutListener(layoutListener)
    post { check() }
  }

  override fun onDetachedFromWindow() {
    if (viewTreeObserver.isAlive) viewTreeObserver.removeOnGlobalLayoutListener(layoutListener)
    super.onDetachedFromWindow()
  }
}

package expo.modules.hestiamanos

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * K3: mira cada Intent que llega a MainActivity, ANTES de que cargue React. Así, con el teléfono bloqueado y Eris cerrada, la
 * llamada se muestra sobre la pantalla de bloqueo desde el primer momento (si no, quedaría detrás hasta que cargue la app).
 */
class HestiaManosPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context?): List<ReactActivityLifecycleListener> =
    listOf(object : ReactActivityLifecycleListener {
      override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
        DespertarEris.recordar(activity)
        DespertarEris.revisar(activity, activity.intent)
      }
      override fun onNewIntent(intent: Intent): Boolean {
        DespertarEris.revisar(DespertarEris.actividad(), intent)
        return false // que los demás también lo vean
      }
      override fun onDestroy(activity: Activity) {
        // Nunca dejar Eris visible sobre la pantalla de bloqueo
        if (DespertarEris.sobreBloqueo) DespertarEris.mostrarSobreBloqueo(activity, false)
      }
    })
}

const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Plugin que agrega los permisos necesarios para mantener a Eris "pensando"
 * en segundo plano (servicio en primer plano ligero, solo mientras hay una
 * consulta en curso) vía react-native-background-actions.
 *
 * 1. FOREGROUND_SERVICE — requerido en Android 9+ para arrancar un servicio en primer plano.
 * 2. FOREGROUND_SERVICE_DATA_SYNC — tipo tipado requerido en Android 14+ (targetSdk 34+):
 *    la consulta a Eris es exactamente eso, sincronizar datos con el backend.
 * 3. POST_NOTIFICATIONS — requerido en Android 13+ para mostrar la notificación
 *    "Eris está pensando…" que sostiene el servicio.
 */
module.exports = function withForegroundServiceManifest(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest['uses-permission']) manifest['uses-permission'] = [];

    const permissions = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.POST_NOTIFICATIONS',
    ];

    for (const name of permissions) {
      const has = manifest['uses-permission'].some((p) => p.$['android:name'] === name);
      if (!has) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }

    // react-native-background-actions declara su propio <service> en su manifest
    // sin foregroundServiceType — Android 14+ (targetSdk 35) exige que esté
    // declarado. Lo re-declaramos acá con el tipo correcto; el merger de Android
    // combina ambas declaraciones del mismo componente sin necesitar tools:node.
    const application = manifest.application?.[0];
    if (application) {
      if (!application.service) application.service = [];
      const serviceName = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';
      const hasService = application.service.some((s) => s.$['android:name'] === serviceName);
      if (!hasService) {
        application.service.push({
          $: {
            'android:name': serviceName,
            'android:foregroundServiceType': 'dataSync',
          },
        });
      }
    }

    return config;
  });
};

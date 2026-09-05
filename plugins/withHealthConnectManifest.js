const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Plugin que corrige el AndroidManifest para Health Connect.
 *
 * Problemas que resuelve:
 * 1. Añade <queries> para que la app pueda "ver" Health Connect.
 * 2. Añade permiso MANAGE_HEALTH_DATA (requerido en Android 14+).
 * 3. Añade intent-filters en MainActivity:
 *    - ACTION_SHOW_PERMISSIONS_RATIONALE (Android 12+)
 *    - VIEW_PERMISSION_USAGE (Android 14+)
 *    Sin estos, la app crashea al abrir el diálogo de permisos.
 * 4. Limpia la actividad incorrecta de builds anteriores.
 */
module.exports = function withHealthConnectManifest(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

    // ─── 1. <queries> para Health Connect ──────────────────────────
    if (!androidManifest.queries) androidManifest.queries = [];
    const alreadyHasQuery = androidManifest.queries.some(
      (q) => q.package?.some((p) => p.$['android:name'] === 'com.google.android.apps.healthdata')
    );
    if (!alreadyHasQuery) {
      androidManifest.queries.push({
        package: [{ $: { 'android:name': 'com.google.android.apps.healthdata' } }],
      });
    }

    // ─── 2. Permiso MANAGE_HEALTH_DATA (Android 14+) ───────────────
    if (!androidManifest['uses-permission']) androidManifest['uses-permission'] = [];
    const hasManageHealth = androidManifest['uses-permission'].some(
      (p) => p.$['android:name'] === 'android.permission.health.MANAGE_HEALTH_DATA'
    );
    if (!hasManageHealth) {
      androidManifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.health.MANAGE_HEALTH_DATA' },
      });
    }

    // ─── 3. intent-filters en MainActivity ─────────────────────────
    const application = androidManifest.application[0];
    const activities = application.activity || [];

    const mainActivity = activities.find(
      (a) => a.$['android:name'] === '.MainActivity' || a.$['android:name']?.includes('MainActivity')
    );

    if (mainActivity) {
      if (!mainActivity['intent-filter']) mainActivity['intent-filter'] = [];

      // ACTION_SHOW_PERMISSIONS_RATIONALE — requerido en Android 12+
      const hasRationaleFilter = mainActivity['intent-filter'].some((f) =>
        f.action?.some((a) => a.$['android:name'] === 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE')
      );
      if (!hasRationaleFilter) {
        mainActivity['intent-filter'].push({
          action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }],
        });
      }

      // VIEW_PERMISSION_USAGE con categoría HEALTH_PERMISSIONS — requerido en Android 14+
      const hasViewPermUsage = mainActivity['intent-filter'].some((f) =>
        f.action?.some((a) => a.$['android:name'] === 'android.intent.action.VIEW_PERMISSION_USAGE')
      );
      if (!hasViewPermUsage) {
        mainActivity['intent-filter'].push({
          action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
          category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
        });
      }
    }

    // ─── 4. Limpiar actividad incorrecta de builds anteriores ──────
    // 'HealthDataRequestPermissions' no existe en el SDK de Health Connect.
    if (application.activity) {
      application.activity = application.activity.filter(
        (a) => a.$['android:name'] !== 'androidx.health.connect.client.permission.HealthDataRequestPermissions'
      );
    }

    return config;
  });
};

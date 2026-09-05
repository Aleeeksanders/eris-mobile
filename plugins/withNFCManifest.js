const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Plugin que agrega soporte NFC al AndroidManifest.
 *
 * 1. Permiso android.permission.NFC
 * 2. Declaración de feature NFC (required: false — no bloquea en dispositivos sin NFC)
 */
module.exports = function withNFCManifest(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    // ─── 1. Permiso NFC ────────────────────────────────────────
    if (!manifest['uses-permission']) manifest['uses-permission'] = [];
    const hasNFC = manifest['uses-permission'].some(
      (p) => p.$['android:name'] === 'android.permission.NFC'
    );
    if (!hasNFC) {
      manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.NFC' },
      });
    }

    // ─── 2. Feature NFC (no requerida — app funciona sin NFC) ───
    if (!manifest['uses-feature']) manifest['uses-feature'] = [];
    const hasFeature = manifest['uses-feature'].some(
      (f) => f.$['android:name'] === 'android.hardware.nfc'
    );
    if (!hasFeature) {
      manifest['uses-feature'].push({
        $: {
          'android:name': 'android.hardware.nfc',
          'android:required': 'false',
        },
      });
    }

    return config;
  });
};

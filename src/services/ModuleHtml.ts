// ============================================================
// Eris Mobile — HTML de los módulos web (Forge y Finanzas), leído UNA vez
// Antes cada apertura volvía a copiar el asset y leerlo (Forge pesa ~430 KB) mientras corría la animación del
// portal. Ahora se precarga al iniciar y queda en memoria: abrir un módulo ya no espera al disco.
// ============================================================
import { Asset } from 'expo-asset';

const SOURCES = {
  wallet: require('../../assets/hunter-wallet.html'),
  toji: require('../../assets/toji.html'),
} as const;
export type ModuleHtmlName = keyof typeof SOURCES;

const cache: Partial<Record<ModuleHtmlName, Promise<string>>> = {};

export function moduleHtml(name: ModuleHtmlName): Promise<string> {
  if (!cache[name]) {
    cache[name] = (async () => {
      const asset = Asset.fromModule(SOURCES[name]);
      await asset.downloadAsync();
      return (await fetch(asset.localUri!)).text();
    })();
    cache[name]!.catch(() => { delete cache[name]; }); // si falla, el próximo intento vuelve a leer
  }
  return cache[name]!;
}

export function preloadModuleHtml() {
  (Object.keys(SOURCES) as ModuleHtmlName[]).forEach((n) => { moduleHtml(n).catch(() => {}); });
}

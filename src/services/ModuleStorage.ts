import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_MODULES } from '../config/modules';

const key = (profileId: string) => `eris_modules_${profileId}`;
const seenKey = (profileId: string) => `eris_modules_seen_${profileId}`;

/**
 * Módulos nuevos: aparecen UNA vez a quien ya tenía su lista guardada (si no, nunca los vería sin ir a Perfil). Después
 * manda lo que elija: si lo apaga, queda apagado. 2026-10-22: Inventario (pedido del usuario).
 */
const NUEVOS = ['inventario'];

export const ModuleStorage = {
  async get(profileId: string): Promise<string[]> {
    try {
      const val = await AsyncStorage.getItem(key(profileId));
      if (!val) return DEFAULT_MODULES;
      const list: string[] = JSON.parse(val);
      const seen: string[] = JSON.parse((await AsyncStorage.getItem(seenKey(profileId))) || '[]');
      const pendientes = NUEVOS.filter((m) => !seen.includes(m));
      if (!pendientes.length) return list;
      const next = [...list, ...pendientes.filter((m) => !list.includes(m))];
      await AsyncStorage.setItem(key(profileId), JSON.stringify(next));
      await AsyncStorage.setItem(seenKey(profileId), JSON.stringify([...seen, ...pendientes]));
      return next;
    } catch {
      return DEFAULT_MODULES;
    }
  },

  async set(profileId: string, modules: string[]): Promise<void> {
    await AsyncStorage.setItem(key(profileId), JSON.stringify(modules));
    // Eligió (Perfil o la bienvenida): los módulos nuevos ya los vio, no se le vuelven a agregar
    await AsyncStorage.setItem(seenKey(profileId), JSON.stringify(NUEVOS)).catch(() => {});
  },
};

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_MODULES } from '../config/modules';

const key = (profileId: string) => `eris_modules_${profileId}`;

export const ModuleStorage = {
  async get(profileId: string): Promise<string[]> {
    try {
      const val = await AsyncStorage.getItem(key(profileId));
      return val ? JSON.parse(val) : DEFAULT_MODULES;
    } catch {
      return DEFAULT_MODULES;
    }
  },

  async set(profileId: string, modules: string[]): Promise<void> {
    await AsyncStorage.setItem(key(profileId), JSON.stringify(modules));
  },
};

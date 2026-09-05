import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = 'eris_profile_id';
const PIN_KEY = 'eris_pin';
const DISPLAY_NAME_KEY = 'eris_display_name';

export const AuthStorage = {
  async saveCredentials(profileId: string, pin: string) {
    await AsyncStorage.multiSet([
      [PROFILE_KEY, profileId],
      [PIN_KEY, pin],
      [`eris_pin_${profileId}`, pin], // Siempre sincronizado para Google re-login
    ]);
  },

  async getCredentials(): Promise<{ profileId: string; pin: string } | null> {
    const profileId = await AsyncStorage.getItem(PROFILE_KEY);
    const pin = await AsyncStorage.getItem(PIN_KEY);
    if (!profileId) return null;
    return { profileId, pin: pin || '' };
  },

  async clearCredentials() {
    // Solo borra la sesión activa. eris_pin_${profileId} se conserva para
    // que Google Sign-In pueda recuperar las credenciales en un re-login
    // sin generar un PIN nuevo que el servidor rechazaría.
    await AsyncStorage.multiRemove([PROFILE_KEY, PIN_KEY, DISPLAY_NAME_KEY]);
  },

  async setPin(pin: string) {
    await AsyncStorage.setItem(PIN_KEY, pin);
  },

  async getDisplayName(): Promise<string | null> {
    return AsyncStorage.getItem(DISPLAY_NAME_KEY);
  },

  async setDisplayName(name: string) {
    await AsyncStorage.setItem(DISPLAY_NAME_KEY, name);
  },

  /**
   * Inicializa credenciales de forma autónoma.
   * Si se pasa un `forProfileId` (Google Sign-In), usa ese ID.
   * Si no, intenta recuperar credenciales guardadas.
   * Si no hay nada guardado, retorna null (sin defaults peligrosos).
   */
  async initializeIfNeeded(forProfileId?: string): Promise<{ profileId: string; pin: string; isNew: boolean } | null> {
    // Si viene un profileId de Google, buscamos credenciales guardadas para ÉSE perfil
    if (forProfileId) {
      const stored = await AsyncStorage.getItem(`eris_pin_${forProfileId}`);
      if (stored) {
        await this.saveCredentials(forProfileId, stored);
        return { profileId: forProfileId, pin: stored, isNew: false };
      }
      // Primera vez con ese perfil de Google — generar PIN seguro
      const genPin = () => {
        if (typeof crypto !== 'undefined' && (crypto as any).getRandomValues) {
          const bytes = new Uint8Array(4);
          (crypto as any).getRandomValues(bytes);
          return Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        }
        return Math.random().toString(36).slice(2, 6).toUpperCase() +
               Math.random().toString(36).slice(2, 6).toUpperCase();
      };
      const pin = genPin();
      await AsyncStorage.setItem(`eris_pin_${forProfileId}`, pin);
      await this.saveCredentials(forProfileId, pin);
      return { profileId: forProfileId, pin, isNew: true };
    }

    // Flujo estándar: recuperar credenciales guardadas
    const existing = await this.getCredentials();
    if (existing && existing.profileId) {
      return { ...existing, isNew: false };
    }

    // Sin credenciales guardadas — retornar null para mostrar formulario
    return null;
  },
};

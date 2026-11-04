import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Sesión ─────────────────────────────────────────────────────────────────
// El acceso es SOLO con Google. El teléfono guarda un token de sesión al azar (lo emite el servidor tras verificar tu
// cuenta de Google); nunca una clave de cifrado ni un PIN. Cerrar sesión lo invalida también en el servidor.
const PROFILE_KEY = 'eris_profile_id';
const SESSION_KEY = 'eris_session_token';
const DISPLAY_NAME_KEY = 'eris_display_name';

// Restos del acceso anterior (ID + PIN). Ya no se usan para entrar: solo sirven UNA vez para vincular el perfil que
// ya tenías con tu cuenta de Google, y después se borran.
const LEGACY_PIN_KEY = 'eris_pin';
const LEGACY_PIN_PREFIX = 'eris_pin_';

export const AuthStorage = {
  async saveSession(profileId: string, token: string) {
    await AsyncStorage.multiSet([
      [PROFILE_KEY, profileId],
      [SESSION_KEY, token],
    ]);
  },

  async getSession(): Promise<{ profileId: string; token: string } | null> {
    const [profileId, token] = await Promise.all([AsyncStorage.getItem(PROFILE_KEY), AsyncStorage.getItem(SESSION_KEY)]);
    return profileId && token ? { profileId, token } : null;
  },

  /** Compatibilidad con pantallas que solo necesitan saber QUÉ perfil está activo (ya no hay PIN). */
  async getCredentials(): Promise<{ profileId: string; pin: string } | null> {
    const profileId = await AsyncStorage.getItem(PROFILE_KEY);
    return profileId ? { profileId, pin: '' } : null;
  },

  async clearCredentials() {
    await AsyncStorage.multiRemove([PROFILE_KEY, SESSION_KEY, DISPLAY_NAME_KEY]);
  },

  async getDisplayName(): Promise<string | null> {
    return AsyncStorage.getItem(DISPLAY_NAME_KEY);
  },

  async setDisplayName(name: string) {
    await AsyncStorage.setItem(DISPLAY_NAME_KEY, name);
  },

  // ─── Migración desde el acceso anterior ───────────────────────────────────
  /**
   * Perfiles que este teléfono conocía con su PIN. `emailAlias` (la parte del correo antes de la @) va primero, porque el
   * acceso con Google anterior usaba ese alias como ID de perfil.
   */
  async getLegacyCandidates(emailAlias: string): Promise<Array<{ profileId: string; pin: string }>> {
    const out: Array<{ profileId: string; pin: string }> = [];
    const push = (profileId: string | null, pin: string | null) => {
      if (profileId && pin && !out.some((c) => c.profileId === profileId)) out.push({ profileId, pin });
    };
    const alias = emailAlias.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    push(alias, await AsyncStorage.getItem(`${LEGACY_PIN_PREFIX}${alias}`));
    push(await AsyncStorage.getItem(PROFILE_KEY), await AsyncStorage.getItem(LEGACY_PIN_KEY));
    return out;
  },

  async clearLegacy() {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k === LEGACY_PIN_KEY || k.startsWith(LEGACY_PIN_PREFIX)));
  },
};

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Stockage des jetons : coffre sécurisé du téléphone (Keychain iOS / Keystore Android).
 * Sur le web (aperçu de développement uniquement), repli sur localStorage.
 */
export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        /* stockage indisponible : session non persistée */
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        /* ignoré */
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

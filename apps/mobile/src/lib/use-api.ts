import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { api, ApiError } from './api';

/** Charge une ressource de l'API à chaque affichage de l'écran et à chaque retour dans l'app. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }, [path]);

  // Recharge à chaque affichage de l'écran, et quand le joueur revient dans l'app
  // (l'app était restée ouverte en arrière-plan : infos du moment, solde… toujours à jour).
  useFocusEffect(
    useCallback(() => {
      void reload();
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void reload();
      });
      return () => sub.remove();
    }, [reload]),
  );

  return { data, error, loading, reload };
}

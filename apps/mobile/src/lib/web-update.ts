import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Version web de l'app (préproduction) : quand le joueur revient dans l'app, vérifie si une
 * nouvelle version a été mise en ligne et recharge la page. Utile sur iPhone, où une app
 * ajoutée à l'écran d'accueil reprend sans se recharger.
 */
const ENTRY = /\/_expo\/static\/js\/web\/entry-[\w-]+\.js/;

export function useWebAutoUpdate() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const current = Array.from(document.scripts)
      .map((s) => s.src.match(ENTRY)?.[0])
      .find(Boolean);
    if (!current) return; // mode développement
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        const html = await (await fetch('/', { cache: 'no-store' })).text();
        const latest = html.match(ENTRY)?.[0];
        if (latest && latest !== current) window.location.reload();
      } catch {
        /* hors ligne : on réessaiera au prochain retour */
      } finally {
        checking = false;
      }
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    const timer = setInterval(check, 5 * 60_000);
    void check();
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      clearInterval(timer);
    };
  }, []);
}

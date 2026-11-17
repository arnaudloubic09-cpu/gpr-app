import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import { storage } from './storage';

const KEY = 'gpr.pushToken';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Enregistre le téléphone pour les notifications push (après consentement du joueur).
 * Nécessite un vrai téléphone et un projet Expo (EAS) configuré : sinon, on n'enregistre rien
 * et le centre de notifications de l'app continue de fonctionner.
 */
export async function registerForPush(): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string | null } } | undefined)?.eas
      ?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return false;

  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!status.granted) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'GPR',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api('/me/push-tokens', { method: 'POST', body: { token, platform: Platform.OS } });
  await storage.set(KEY, token);
  return true;
}

/** À la déconnexion : ce téléphone ne reçoit plus les notifications du compte. */
export async function unregisterPush(): Promise<void> {
  const token = await storage.get(KEY);
  if (!token) return;
  await api('/me/push-tokens', { method: 'DELETE', body: { token } }).catch(() => undefined);
  await storage.remove(KEY);
}

/** Écran à ouvrir quand le joueur touche une notification. */
export function screenFor(data: Record<string, unknown> | undefined): string {
  switch (data?.screen) {
    case 'challenges':
      return '/challenges';
    case 'rewards':
      return '/rewards';
    case 'coupon':
      return typeof data.couponId === 'string' ? `/coupon/${data.couponId}` : '/coupons';
    default:
      return '/';
  }
}

import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loading } from '../src/components/ui';
import { AuthProvider, useAuth } from '../src/lib/auth';
import { colors } from '../src/lib/theme';

/** Redirige selon l'état de la session : connexion, profil à compléter, ou application. */
function Gate() {
  const { status, me } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    const first = segments[0];
    if (status === 'signedOut' && first !== 'login') router.replace('/login');
    else if (status === 'signedIn' && !me?.firstName && first !== 'onboarding')
      router.replace('/onboarding');
    else if (
      status === 'signedIn' &&
      me?.firstName &&
      (first === 'login' || first === 'onboarding')
    )
      router.replace('/');
  }, [status, me, segments, router]);

  if (status === 'loading') return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.bg },
        headerBackTitle: 'Retour',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="history" options={{ title: 'Historique' }} />
      <Stack.Screen name="reward/[id]" options={{ title: 'Récompense' }} />
      <Stack.Screen name="coupon/[id]" options={{ title: 'Mon coupon' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

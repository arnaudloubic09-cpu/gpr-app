import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { colors } from '../../src/lib/theme';

const icon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color as string} size={size} />
  );

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen
        name="rewards"
        options={{ title: 'Récompenses', tabBarIcon: icon('gift-outline') }}
      />
      <Tabs.Screen
        name="challenges"
        options={{ title: 'Défis', tabBarIcon: icon('flag-outline') }}
      />
      <Tabs.Screen
        name="coupons"
        options={{ title: 'Coupons', tabBarIcon: icon('qr-code-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profil', tabBarIcon: icon('person-outline') }}
      />
    </Tabs>
  );
}

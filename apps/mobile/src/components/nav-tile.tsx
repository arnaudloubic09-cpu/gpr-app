import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { colors, radius, space } from '../lib/theme';

/** Encart cliquable de l'accueil (ouvre un écran) : icône, titre, sous-titre et chevron. */
export function NavTile({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.primary,
        paddingVertical: space(4),
        paddingHorizontal: space(4),
        marginBottom: space(3),
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: space(3),
        }}
      >
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: colors.muted, marginTop: 2, fontSize: 13 }}>{subtitle}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.primary} />
    </Pressable>
  );
}

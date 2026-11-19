import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { colors, fonts, radius, space } from '../lib/theme';
import { useApi } from '../lib/use-api';

type Announcement = { id: string; title: string; body: string; club: { name: string } };

/** « Info du moment » publiée par le club principal du joueur (une seule à la fois). */
export function AnnouncementBanner() {
  const { data } = useApi<{ announcement: Announcement | null }>('/me/announcement');
  const a = data?.announcement;
  if (!a) return null;
  return (
    <View
      accessibilityRole="summary"
      style={{
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 4,
        borderLeftColor: colors.accent,
        padding: space(4),
        marginBottom: space(3),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space(2) }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="megaphone-outline" size={13} color={colors.primary} />
        </View>
        <Text
          style={{
            color: colors.muted,
            fontWeight: '600',
            fontSize: 12,
            marginLeft: space(2),
            letterSpacing: 0.4,
            flex: 1,
          }}
          numberOfLines={1}
        >
          Info du moment · {a.club.name}
        </Text>
      </View>
      <Text
        style={{ color: colors.primary, fontSize: 18, fontFamily: fonts.display, marginBottom: 4 }}
      >
        {a.title}
      </Text>
      <Text style={{ color: colors.text, lineHeight: 20 }}>{a.body}</Text>
    </View>
  );
}

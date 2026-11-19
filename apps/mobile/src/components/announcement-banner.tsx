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
        backgroundColor: colors.primary,
        borderRadius: radius.lg,
        borderLeftWidth: 5,
        borderLeftColor: colors.accent,
        padding: space(4),
        marginBottom: space(3),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space(1) }}>
        <Ionicons name="megaphone-outline" size={16} color={colors.accent} />
        <Text
          style={{
            color: colors.accent,
            fontWeight: '700',
            fontSize: 12,
            marginLeft: 6,
            letterSpacing: 0.5,
          }}
        >
          INFO DU MOMENT · {a.club.name.toUpperCase()}
        </Text>
      </View>
      <Text style={{ color: '#fff', fontSize: 18, fontFamily: fonts.display, marginBottom: 4 }}>
        {a.title}
      </Text>
      <Text style={{ color: '#E7E7E5', lineHeight: 20 }}>{a.body}</Text>
    </View>
  );
}

import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Empty, ErrorText, Loading, Screen } from '../src/components/ui';
import { api } from '../src/lib/api';
import { formatDateTime } from '../src/lib/format';
import { screenFor } from '../src/lib/push';
import { colors, space } from '../src/lib/theme';
import { useApi } from '../src/lib/use-api';

type Notif = {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const list = useApi<{ items: Notif[]; unread: number }>('/me/notifications');

  useEffect(() => {
    if (list.data?.unread)
      void api('/me/notifications/read', { method: 'POST' }).catch(() => undefined);
  }, [list.data?.unread]);

  if (list.loading && !list.data) return <Loading />;
  return (
    <Screen>
      <ErrorText>{list.error}</ErrorText>
      {list.data?.items.length === 0 ? (
        <Empty icon="notifications-outline" text="Aucune notification pour le moment." />
      ) : null}
      {list.data?.items.map((n) => (
        <Pressable
          key={n.id}
          accessibilityRole="button"
          onPress={() => router.push(screenFor(n.data) as never)}
        >
          <View
            style={{
              paddingVertical: space(3),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              flexDirection: 'row',
            }}
          >
            {!n.readAt ? (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.primary,
                  marginTop: 6,
                  marginRight: space(2),
                }}
              />
            ) : (
              <View style={{ width: 8, marginRight: space(2) }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{n.title}</Text>
              <Text style={{ color: colors.text }}>{n.body}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                {formatDateTime(n.createdAt)}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

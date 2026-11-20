import { Ionicons } from '@expo/vector-icons';
import type { BalanceView, RewardView } from '@gpr/core';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  Card,
  Chip,
  Empty,
  ErrorText,
  Loading,
  Screen,
  styles,
  Title,
} from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { CATEGORY, clubAvailable, points, rewardValue } from '../../src/lib/format';
import { colors, space } from '../../src/lib/theme';
import { useApi } from '../../src/lib/use-api';

type Club = { id: string; name: string; city: string };

export default function RewardsScreen() {
  const { me } = useAuth();
  const router = useRouter();
  const clubs = useApi<Club[]>('/clubs');
  const balance = useApi<BalanceView>('/me/balance');
  const [clubId, setClubId] = useState<string | null>(null);

  // Club favori en premier
  const sorted = [...(clubs.data ?? [])].sort((a, b) =>
    a.id === me?.favoriteClubId
      ? -1
      : b.id === me?.favoriteClubId
        ? 1
        : a.name.localeCompare(b.name),
  );
  useEffect(() => {
    if (!clubId && sorted.length) setClubId(sorted[0].id);
  }, [clubId, sorted]);

  const rewards = useApi<RewardView[]>(clubId ? `/clubs/${clubId}/rewards` : null);
  const available = clubAvailable(balance.data, clubId);
  const clubName = sorted.find((c) => c.id === clubId)?.name;

  return (
    <Screen>
      <Title
        subtitle={
          clubName
            ? `${points(available)} à utiliser à ${clubName}`
            : 'Vos points s’utilisent dans le club où vous les avez gagnés'
        }
      >
        Récompenses
      </Title>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: space(4) }}
      >
        {sorted.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            active={c.id === clubId}
            onPress={() => setClubId(c.id)}
          />
        ))}
      </ScrollView>

      {rewards.loading && !rewards.data ? <Loading /> : null}
      <ErrorText>{rewards.error ?? clubs.error}</ErrorText>
      {rewards.data?.length === 0 ? (
        <Empty icon="gift-outline" text="Ce club ne propose pas encore de récompense." />
      ) : null}

      {rewards.data?.map((r) => {
        const affordable = available >= r.costGpr;
        const cat = CATEGORY[r.category];
        return (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: '/reward/[id]', params: { id: r.id, clubId: r.clubId } })
            }
          >
            <Card style={{ opacity: r.available ? 1 : 0.55 }}>
              <View style={styles.row}>
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
                  <Ionicons
                    name={cat.icon as keyof typeof Ionicons.glyphMap}
                    size={22}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.text, fontSize: 16 }}>
                    {r.title}
                  </Text>
                  <Text style={styles.muted}>
                    {cat.label} · {rewardValue(r)}
                    {!r.available
                      ? ' · épuisé'
                      : r.stock !== null && r.stock <= 5
                        ? ` · plus que ${r.stock}`
                        : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      fontWeight: '800',
                      fontSize: 16,
                      color: affordable ? colors.primary : colors.muted,
                    }}
                  >
                    {r.costGpr}
                  </Text>
                  <Text style={[styles.muted, { fontSize: 12 }]}>points GPR</Text>
                </View>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

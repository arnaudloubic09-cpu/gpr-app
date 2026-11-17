import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { LevelBar } from '../../src/components/level-card';
import { Card, Empty, ErrorText, Loading, Screen, styles, Title } from '../../src/components/ui';
import { BADGE_ICONS, formatDate } from '../../src/lib/format';
import { colors, space } from '../../src/lib/theme';
import { useApi } from '../../src/lib/use-api';

type ActiveChallenge = {
  id: string;
  name: string;
  description: string;
  objective: string;
  period: 'WEEK' | 'MONTH' | 'FIXED';
  endsAt: string | null;
  club: { name: string } | null;
  rewardGpr: number | null;
  rewardBadge: { name: string } | null;
  progress: { value: number; target: number };
  completed: boolean;
};
type Challenges = {
  active: ActiveChallenge[];
  completed: {
    challengeId: string;
    name: string;
    club: string | null;
    rewardGpr: number | null;
    completedAt: string;
  }[];
};
type Badge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string | null;
};

const PERIOD: Record<ActiveChallenge['period'], string> = {
  WEEK: 'Cette semaine',
  MONTH: 'Ce mois-ci',
  FIXED: 'Défi en cours',
};

export default function ChallengesScreen() {
  const challenges = useApi<Challenges>('/me/challenges');
  const badges = useApi<Badge[]>('/me/badges');
  const earned = badges.data?.filter((b) => b.earnedAt).length ?? 0;

  return (
    <Screen>
      <Title subtitle="Les défis sont validés 2 h après chaque partie">Défis</Title>
      {challenges.loading && !challenges.data ? <Loading /> : null}
      <ErrorText>{challenges.error}</ErrorText>
      {challenges.data?.active.length === 0 ? (
        <Empty icon="flag-outline" text="Aucun défi en cours pour le moment." />
      ) : null}
      {challenges.data?.active.map((c) => (
        <Card key={c.id} style={c.completed ? { borderColor: colors.success } : undefined}>
          <View style={[styles.row, { justifyContent: 'space-between', marginBottom: space(1) }]}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>
              {PERIOD[c.period]}
              {c.club ? ` · ${c.club.name}` : ' · Tous les clubs'}
            </Text>
            {c.completed ? (
              <Text style={{ color: colors.success, fontWeight: '700' }}>✓ Réussi</Text>
            ) : null}
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{c.name}</Text>
          <Text style={[styles.muted, { marginBottom: space(3) }]}>{c.objective}</Text>
          <LevelBar
            progress={c.progress.value / c.progress.target}
            color={c.completed ? colors.success : colors.primary}
          />
          <View style={[styles.row, { justifyContent: 'space-between', marginTop: space(2) }]}>
            <Text style={styles.muted}>
              {c.progress.value} / {c.progress.target}
            </Text>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>
              {[
                c.rewardGpr ? `+${c.rewardGpr} points GPR` : null,
                c.rewardBadge ? `badge ${c.rewardBadge.name}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </Card>
      ))}

      <Text style={[styles.h2, { marginTop: space(4) }]}>
        Mes badges ({earned}/{badges.data?.length ?? 0})
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
        {badges.data?.map((b) => (
          <View
            key={b.id}
            style={{ width: '30%', alignItems: 'center', opacity: b.earnedAt ? 1 : 0.35 }}
            accessibilityLabel={`${b.name}${b.earnedAt ? ', obtenu' : ', pas encore obtenu'}`}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: b.earnedAt ? colors.primarySoft : colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name={(BADGE_ICONS[b.icon] ?? 'star') as keyof typeof Ionicons.glyphMap}
                size={28}
                color={b.earnedAt ? colors.primary : colors.muted}
              />
            </View>
            <Text style={{ fontWeight: '600', fontSize: 13, marginTop: 4, textAlign: 'center' }}>
              {b.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center' }}>
              {b.earnedAt ? formatDate(b.earnedAt) : b.description}
            </Text>
          </View>
        ))}
      </View>

      {challenges.data?.completed.length ? (
        <>
          <Text style={[styles.h2, { marginTop: space(6) }]}>Défis réussis</Text>
          <Card>
            {challenges.data.completed.map((c) => (
              <View
                key={`${c.challengeId}-${c.completedAt}`}
                style={[styles.row, { justifyContent: 'space-between', paddingVertical: space(2) }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600' }}>{c.name}</Text>
                  <Text style={[styles.muted, { fontSize: 12 }]}>
                    {formatDate(c.completedAt)}
                    {c.club ? ` · ${c.club}` : ''}
                  </Text>
                </View>
                {c.rewardGpr ? (
                  <Text style={{ color: colors.success, fontWeight: '700' }}>+{c.rewardGpr}</Text>
                ) : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

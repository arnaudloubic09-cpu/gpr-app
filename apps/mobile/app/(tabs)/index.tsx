import { Ionicons } from '@expo/vector-icons';
import type { BalanceView, LevelStatus } from '@gpr/core';
import { Link, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { AnnouncementBanner } from '../../src/components/announcement-banner';
import { LevelCard } from '../../src/components/level-card';
import { NavTile } from '../../src/components/nav-tile';
import { Card, ErrorText, Screen, styles, Title } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { LEVEL_COLORS, points } from '../../src/lib/format';
import { colors, radius, space } from '../../src/lib/theme';
import { useApi } from '../../src/lib/use-api';

export default function HomeScreen() {
  const { me } = useAuth();
  const balance = useApi<BalanceView>('/me/balance');
  const level = useApi<LevelStatus>('/me/level');
  const notifs = useApi<{ unread: number }>('/me/notifications');

  return (
    <Screen>
      <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
        <Title subtitle="Votre programme de fidélité">Bonjour {me?.firstName}</Title>
        <Link href="/notifications" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Notifications${notifs.data?.unread ? `, ${notifs.data.unread} non lues` : ''}`}
            style={{ padding: space(2) }}
          >
            <Ionicons name="notifications-outline" size={26} color={colors.text} />
            {notifs.data?.unread ? (
              <View
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: colors.danger,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                  {notifs.data.unread}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </Link>
      </View>

      <AnnouncementBanner />

      <View
        style={{
          // Le cadre prend la couleur du niveau du joueur (bronze, argent, or, platine)
          backgroundColor: (level.data && LEVEL_COLORS[level.data.current.code]) || colors.primary,
          borderRadius: radius.lg,
          padding: space(5),
          marginBottom: space(3),
        }}
        accessibilityLabel={`Solde : ${(balance.data?.clubs ?? []).map((c) => `${points(c.available)} à ${c.club.name}`).join(', ') || points(0)}`}
      >
        <Text style={{ color: '#fff', fontWeight: '600', opacity: 0.9 }}>
          Mes points GPR{level.data ? ` · Niveau ${level.data.current.label}` : ''}
        </Text>
        {balance.data && balance.data.clubs.length > 0 ? (
          <>
            <Text style={{ color: '#fff', opacity: 0.9, marginTop: space(3) }}>
              {balance.data.clubs[0].club.name}
            </Text>
            <Text style={{ color: '#fff', fontSize: 44, fontWeight: '900' }}>
              {balance.data.clubs[0].available.toLocaleString('fr-FR')}
            </Text>
            {balance.data.clubs.slice(1).map((c) => (
              <View
                key={c.club.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  borderTopWidth: 1,
                  borderTopColor: 'rgba(255,255,255,0.25)',
                  paddingVertical: space(2),
                }}
              >
                <Text style={{ color: '#fff', flex: 1 }} numberOfLines={1}>
                  {c.club.name}
                </Text>
                <Text style={{ color: '#fff', fontWeight: '800' }}>
                  {c.available.toLocaleString('fr-FR')}
                </Text>
              </View>
            ))}
          </>
        ) : (
          <Text
            style={{ color: '#fff', fontSize: 44, fontWeight: '900', marginVertical: space(1) }}
          >
            {balance.data ? '0' : '—'}
          </Text>
        )}
        <Text style={{ color: '#fff', opacity: 0.9, marginTop: space(1) }}>
          Utilisables dans le club où vous les avez gagnés
        </Text>
      </View>
      <Text
        style={{ color: colors.muted, fontSize: 13, marginBottom: space(3), textAlign: 'center' }}
      >
        Vos points sont crédités automatiquement après chaque partie, rien à présenter.
      </Text>

      {balance.data && (balance.data.pending > 0 || balance.data.expiringSoon > 0) ? (
        <View style={{ flexDirection: 'row', gap: space(3) }}>
          {balance.data.pending > 0 ? (
            <Card style={{ flex: 1 }}>
              <Text style={styles.muted}>En attente</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>
                +{balance.data.pending}
              </Text>
              <Text style={[styles.muted, { fontSize: 12 }]}>Validés 2 h après la partie</Text>
            </Card>
          ) : null}
          {balance.data.expiringSoon > 0 ? (
            <Card style={{ flex: 1, borderColor: colors.accent }}>
              <Text style={styles.muted}>Expirent bientôt</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.accent }}>
                {balance.data.expiringSoon}
              </Text>
              <Text style={[styles.muted, { fontSize: 12 }]}>Dans les 30 jours</Text>
            </Card>
          ) : null}
        </View>
      ) : null}
      <ErrorText>{balance.error}</ErrorText>

      {level.data ? <LevelCard level={level.data} /> : null}

      <NavTile
        icon="storefront-outline"
        title="Partenaires locaux"
        subtitle="Les avantages chez les commerçants partenaires"
        onPress={() => router.push('/local-partners')}
      />
      <NavTile
        icon="time-outline"
        title="Dernières activités"
        subtitle="Points gagnés, coupons, défis réussis"
        onPress={() => router.push('/history')}
      />
    </Screen>
  );
}

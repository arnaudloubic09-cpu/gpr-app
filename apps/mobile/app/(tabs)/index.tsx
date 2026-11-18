import { Ionicons } from '@expo/vector-icons';
import type { BalanceView, LevelStatus, TransactionItem } from '@gpr/core';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { LevelCard } from '../../src/components/level-card';
import { TransactionRow } from '../../src/components/transaction-row';
import { Card, Empty, ErrorText, Loading, Screen, styles, Title } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { LEVEL_COLORS, points } from '../../src/lib/format';
import { colors, radius, space } from '../../src/lib/theme';
import { useApi } from '../../src/lib/use-api';

export default function HomeScreen() {
  const { me } = useAuth();
  const balance = useApi<BalanceView>('/me/balance');
  const level = useApi<LevelStatus>('/me/level');
  const notifs = useApi<{ unread: number }>('/me/notifications');
  const tx = useApi<{ items: TransactionItem[] }>('/me/transactions?limit=5');

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

      <View
        style={{
          // Le cadre prend la couleur du niveau du joueur (bronze, argent, or, platine)
          backgroundColor: (level.data && LEVEL_COLORS[level.data.current.code]) || colors.primary,
          borderRadius: radius.lg,
          padding: space(5),
          marginBottom: space(3),
        }}
        accessibilityLabel={`Solde : ${points(balance.data?.available ?? 0)}`}
      >
        <Text style={{ color: '#fff', fontWeight: '600', opacity: 0.9 }}>
          Points GPR disponibles{level.data ? ` · Niveau ${level.data.current.label}` : ''}
        </Text>
        <Text style={{ color: '#fff', fontSize: 44, fontWeight: '900', marginVertical: space(1) }}>
          {balance.data ? balance.data.available.toLocaleString('fr-FR') : '—'}
        </Text>
        <Text style={{ color: '#fff', opacity: 0.9 }}>
          Valables dans tous les clubs du groupement
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

      <Card>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text style={styles.h2}>Dernières activités</Text>
          <Link href="/history" asChild>
            <Pressable accessibilityRole="link">
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Tout voir</Text>
            </Pressable>
          </Link>
        </View>
        {tx.loading && !tx.data ? <Loading /> : null}
        {tx.data?.items.length === 0 ? (
          <Empty
            icon="tennisball-outline"
            text="Jouez une partie dans un club du groupement pour gagner vos premiers points GPR."
          />
        ) : null}
        {tx.data?.items.map((t) => (
          <TransactionRow key={t.id} t={t} />
        ))}
      </Card>
    </Screen>
  );
}

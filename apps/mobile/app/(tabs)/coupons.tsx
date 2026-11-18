import type { CouponView } from '@gpr/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { COUPON_STATUS, formatDate } from '../../src/lib/format';
import { colors, space } from '../../src/lib/theme';
import { useApi } from '../../src/lib/use-api';

export default function CouponsScreen() {
  const router = useRouter();
  const [scope, setScope] = useState<'active' | 'history'>('active');
  const coupons = useApi<CouponView[]>(`/me/coupons?scope=${scope}`);

  return (
    <Screen>
      <Title subtitle="À présenter uniquement pour retirer une récompense à l’accueil (les points des parties sont automatiques)">
        Mes coupons
      </Title>
      <View style={[styles.row, { marginBottom: space(4) }]}>
        <Chip label="À utiliser" active={scope === 'active'} onPress={() => setScope('active')} />
        <Chip label="Historique" active={scope === 'history'} onPress={() => setScope('history')} />
      </View>
      {coupons.loading && !coupons.data ? <Loading /> : null}
      <ErrorText>{coupons.error}</ErrorText>
      {coupons.data?.length === 0 ? (
        <Empty
          icon="qr-code-outline"
          text={
            scope === 'active'
              ? 'Aucun coupon en cours. Échangez vos points dans l’onglet Récompenses.'
              : 'Aucun coupon passé.'
          }
        />
      ) : null}
      {coupons.data?.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/coupon/[id]', params: { id: c.id } })}
        >
          <Card>
            <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text }}>
              {c.reward.title}
            </Text>
            <Text style={styles.muted}>{c.club.name}</Text>
            <Text
              style={{
                marginTop: space(2),
                color: c.status === 'ACTIVE' ? colors.primary : colors.muted,
                fontWeight: '600',
              }}
            >
              {c.status === 'ACTIVE'
                ? `À utiliser avant le ${formatDate(c.expiresAt)}`
                : COUPON_STATUS[c.status]}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

import type { CouponView } from '@gpr/core';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Button, Card, ErrorText, Loading, Screen, styles } from '../../src/components/ui';
import { api, ApiError } from '../../src/lib/api';
import {
  COUPON_STATUS,
  formatDate,
  formatDateTime,
  points,
  rewardValue,
} from '../../src/lib/format';
import { colors, space } from '../../src/lib/theme';
import { useApi } from '../../src/lib/use-api';

function confirm(message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(message) ?? true);
  return new Promise((resolve) =>
    Alert.alert('Annuler le coupon', message, [
      { text: 'Non', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Oui, annuler', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export default function CouponScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const active = useApi<CouponView[]>('/me/coupons?scope=active');
  const history = useApi<CouponView[]>('/me/coupons?scope=history');
  const [cancelled, setCancelled] = useState<CouponView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const coupon =
    cancelled ?? [...(active.data ?? []), ...(history.data ?? [])].find((c) => c.id === id);
  if (!coupon)
    return active.loading || history.loading ? (
      <Loading />
    ) : (
      <Screen>
        <ErrorText>Coupon introuvable.</ErrorText>
      </Screen>
    );

  const isActive = coupon.status === 'ACTIVE';

  const cancel = async () => {
    if (!(await confirm(`Vos ${points(coupon.costGpr)} vous seront rendus immédiatement.`))) return;
    setLoading(true);
    setError(null);
    try {
      setCancelled(await api<CouponView>(`/me/coupons/${coupon.id}/cancel`, { method: 'POST' }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Card style={{ alignItems: 'center', paddingVertical: space(6) }}>
        <Text style={[styles.title, { textAlign: 'center' }]}>{coupon.reward.title}</Text>
        <Text style={[styles.muted, { marginBottom: space(5) }]}>
          {coupon.club.name} · {rewardValue(coupon.reward)}
        </Text>
        {isActive ? (
          <View
            style={{ padding: space(3), backgroundColor: '#fff' }}
            accessibilityLabel={`QR code du coupon ${coupon.code}`}
          >
            <QRCode value={coupon.code} size={220} />
          </View>
        ) : (
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: colors.muted,
              marginVertical: space(6),
            }}
          >
            {COUPON_STATUS[coupon.status]}
          </Text>
        )}
        <Text
          selectable
          style={{
            fontSize: 24,
            fontWeight: '800',
            letterSpacing: 2,
            marginTop: space(4),
            color: isActive ? colors.text : colors.muted,
          }}
        >
          {coupon.code}
        </Text>
        {isActive ? (
          <Text style={[styles.muted, { marginTop: space(2), textAlign: 'center' }]}>
            Présentez ce code à l’accueil du club.{'\n'}Valable jusqu’au{' '}
            {formatDate(coupon.expiresAt)}.
          </Text>
        ) : coupon.usedAt ? (
          <Text style={[styles.muted, { marginTop: space(2) }]}>
            Utilisé le {formatDateTime(coupon.usedAt)}
          </Text>
        ) : null}
      </Card>
      {isActive ? (
        <Button
          label="Annuler et récupérer mes points"
          variant="danger"
          onPress={cancel}
          loading={loading}
        />
      ) : null}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

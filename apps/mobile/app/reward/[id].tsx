import { Ionicons } from '@expo/vector-icons';
import type { BalanceView, CouponView, RewardView } from '@gpr/core';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, ErrorText, Loading, Screen, styles } from '../../src/components/ui';
import { api, ApiError } from '../../src/lib/api';
import { CATEGORY, formatDate, points, rewardValue } from '../../src/lib/format';
import { colors, space } from '../../src/lib/theme';
import { useApi } from '../../src/lib/use-api';

export default function RewardScreen() {
  const { id, clubId } = useLocalSearchParams<{ id: string; clubId: string }>();
  const router = useRouter();
  const catalog = useApi<RewardView[]>(`/clubs/${clubId}/rewards`);
  const balance = useApi<BalanceView>('/me/balance');
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un identifiant par demande : un double appui ne crée jamais deux coupons.
  const requestId = useRef(Crypto.randomUUID());

  const reward = catalog.data?.find((r) => r.id === id);
  if (!reward)
    return catalog.loading ? (
      <Loading />
    ) : (
      <Screen>
        <ErrorText>Récompense introuvable.</ErrorText>
      </Screen>
    );

  const available = balance.data?.available ?? 0;
  const missing = reward.costGpr - available;
  const cat = CATEGORY[reward.category];

  const redeem = async () => {
    setLoading(true);
    setError(null);
    try {
      const coupon = await api<CouponView>(`/rewards/${reward.id}/redeem`, {
        method: 'POST',
        body: { requestId: requestId.current },
      });
      router.replace({ pathname: '/coupon/[id]', params: { id: coupon.id } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
      requestId.current = Crypto.randomUUID();
      setLoading(false);
      setConfirming(false);
    }
  };

  return (
    <Screen>
      <Card style={{ alignItems: 'center', paddingVertical: space(6) }}>
        <Ionicons
          name={cat.icon as keyof typeof Ionicons.glyphMap}
          size={48}
          color={colors.primary}
        />
        <Text style={[styles.title, { textAlign: 'center', marginTop: space(3) }]}>
          {reward.title}
        </Text>
        <Text style={[styles.muted, { marginTop: space(1) }]}>
          {cat.label} · {rewardValue(reward)}
        </Text>
        <Text
          style={{ fontSize: 28, fontWeight: '900', color: colors.primary, marginTop: space(4) }}
        >
          {points(reward.costGpr)}
        </Text>
      </Card>

      {reward.description ? (
        <Text style={[styles.muted, { marginBottom: space(3) }]}>{reward.description}</Text>
      ) : null}

      <Card>
        <Text style={styles.label}>Comment ça marche ?</Text>
        <Text style={styles.muted}>
          1. Échangez vos points : vous recevez un coupon avec un QR code.{'\n'}
          2. Présentez-le à l’accueil du club, qui le valide.{'\n'}
          3. Le coupon est valable 7 jours. Non utilisé, vos points vous sont rendus
          automatiquement.
        </Text>
        {reward.endsAt ? (
          <Text style={[styles.muted, { marginTop: space(2) }]}>
            Offre valable jusqu’au {formatDate(reward.endsAt)}.
          </Text>
        ) : null}
      </Card>

      {!reward.available ? (
        <Text style={[styles.muted, { textAlign: 'center' }]}>
          Cette récompense est épuisée pour le moment.
        </Text>
      ) : missing > 0 ? (
        <Text style={[styles.muted, { textAlign: 'center' }]}>
          Il vous manque {points(missing)}. Encore quelques parties !
        </Text>
      ) : confirming ? (
        <View>
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            {points(reward.costGpr)} seront déduits de votre solde ({points(available)}).
          </Text>
          <Button
            label="Confirmer l’échange"
            onPress={redeem}
            loading={loading}
            icon="checkmark-circle-outline"
          />
          <Button
            label="Annuler"
            variant="secondary"
            onPress={() => setConfirming(false)}
            disabled={loading}
          />
        </View>
      ) : (
        <Button
          label="Échanger mes points"
          onPress={() => setConfirming(true)}
          icon="gift-outline"
        />
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

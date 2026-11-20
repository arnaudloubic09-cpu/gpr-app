import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Button, Card, ErrorText, Loading, Screen, styles } from '../../src/components/ui';
import { api, ApiError } from '../../src/lib/api';
import { colors, fonts, space } from '../../src/lib/theme';

type Use = {
  token: string;
  expiresAt: string;
  url: string;
  partner: { id: string; name: string; offer: string };
};

/** QR code à usage unique, à faire scanner par le partenaire local pour valider l'avantage. */
export default function LocalPartnerUseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [use, setUse] = useState<Use | null>(null);
  const [status, setStatus] = useState<'PENDING' | 'USED' | 'EXPIRED'>('PENDING');
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const create = useCallback(async () => {
    setError(null);
    setUse(null);
    setStatus('PENDING');
    try {
      setUse(await api<Use>(`/me/local-partners/${id}/use`, { method: 'POST' }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
    }
  }, [id]);

  useEffect(() => {
    void create();
  }, [create]);

  // Suivi en direct : le QR code passe à « validé » dès que le partenaire l'a scanné
  useEffect(() => {
    if (!use || status !== 'PENDING') return;
    const timer = setInterval(async () => {
      setNow(Date.now());
      try {
        const s = await api<{ status: 'PENDING' | 'USED' | 'EXPIRED' }>(
          `/me/local-partner-uses/${use.token}`,
        );
        setStatus(s.status);
      } catch {
        /* réseau : nouvel essai au prochain tour */
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [use, status]);

  if (error)
    return (
      <Screen>
        <ErrorText>{error}</ErrorText>
      </Screen>
    );
  if (!use) return <Loading />;

  const remaining = Math.max(0, Math.round((new Date(use.expiresAt).getTime() - now) / 1000));
  return (
    <Screen>
      <Text style={[styles.h2, { textAlign: 'center' }]}>{use.partner.name}</Text>
      <Text
        style={{
          textAlign: 'center',
          fontFamily: fonts.display,
          fontSize: 22,
          color: colors.primary,
          marginBottom: space(4),
        }}
      >
        {use.partner.offer}
      </Text>

      {status === 'USED' ? (
        <Card style={{ alignItems: 'center', borderColor: colors.success, borderWidth: 2 }}>
          <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          <Text
            style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginTop: space(2) }}
          >
            Avantage validé
          </Text>
          <Text style={[styles.muted, { textAlign: 'center', marginTop: space(1) }]}>
            Merci d’avoir joué dans un club du GPR !
          </Text>
        </Card>
      ) : status === 'EXPIRED' || remaining === 0 ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', color: colors.text, marginBottom: space(3) }}>
            QR code expiré
          </Text>
          <Button label="Afficher un nouveau QR code" onPress={create} />
        </Card>
      ) : (
        <Card style={{ alignItems: 'center' }}>
          <View style={{ padding: space(3), backgroundColor: '#fff' }}>
            <QRCode value={use.url} size={230} />
          </View>
          <Text
            style={{
              fontWeight: '700',
              color: colors.text,
              marginTop: space(3),
              textAlign: 'center',
            }}
          >
            Faites scanner ce QR code par le commerçant
          </Text>
          <Text style={[styles.muted, { marginTop: space(1) }]}>
            Valable encore {Math.floor(remaining / 60)} min{' '}
            {String(remaining % 60).padStart(2, '0')} s · une seule utilisation
          </Text>
        </Card>
      )}
    </Screen>
  );
}

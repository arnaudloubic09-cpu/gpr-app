import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Button, Card, Chip, ErrorText, Input, Screen, styles, Title } from '../src/components/ui';
import { api, ApiError } from '../src/lib/api';
import { registerForPush } from '../src/lib/push';
import { useAuth } from '../src/lib/auth';
import { useApi } from '../src/lib/use-api';
import { colors, space } from '../src/lib/theme';

type Club = { id: string; name: string; city: string };

/** Première connexion : prénom, nom, club favori, puis liaison automatique du compte de réservation. */
export default function OnboardingScreen() {
  const { reloadMe, me } = useAuth();
  const clubs = useApi<Club[]>('/clubs');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [favoriteClubId, setFavoriteClubId] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api('/me/consents', {
        method: 'PUT',
        body: [
          { type: 'TERMS', granted: true },
          { type: 'PUSH_NOTIFICATIONS', granted: notifications },
        ],
      });
      await api('/me', { method: 'PATCH', body: { firstName, lastName, favoriteClubId } });
      if (notifications) await registerForPush().catch(() => false);
      await api('/me/link-account', { method: 'POST' }).catch(() => undefined);
      await reloadMe();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Title subtitle={me?.email}>Bienvenue !</Title>
      <Card>
        <Input
          label="Prénom"
          value={firstName}
          onChangeText={setFirstName}
          autoComplete="given-name"
        />
        <Input label="Nom" value={lastName} onChangeText={setLastName} autoComplete="family-name" />
        <Text style={styles.label}>Votre club principal</Text>
        <Text style={[styles.muted, { marginBottom: space(2) }]}>
          Vos points GPR s’utilisent dans le club où vous les avez gagnés.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
          {clubs.data?.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              active={favoriteClubId === c.id}
              onPress={() => setFavoriteClubId(c.id)}
            />
          ))}
        </View>
        <View style={[styles.row, { marginTop: space(4) }]}>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            accessibilityLabel="Recevoir des notifications"
            trackColor={{ true: colors.primary, false: colors.border }}
          />
          <Text style={{ flex: 1, marginLeft: space(3) }}>
            Me prévenir quand mes points sont validés, quand je réussis un défi ou quand un coupon
            expire
          </Text>
        </View>
        <View style={[styles.row, { marginTop: space(3) }]}>
          <Switch
            value={terms}
            onValueChange={setTerms}
            accessibilityLabel="Accepter les conditions"
            trackColor={{ true: colors.primary, false: colors.border }}
          />
          <Text style={{ flex: 1, marginLeft: space(3) }}>
            J’accepte les conditions d’utilisation et la politique de confidentialité du programme
            GPR
          </Text>
        </View>
        <Button
          label="Commencer"
          loading={loading}
          disabled={!firstName.trim() || !lastName.trim() || !terms}
          onPress={submit}
        />
        <ErrorText>{error}</ErrorText>
      </Card>
    </Screen>
  );
}

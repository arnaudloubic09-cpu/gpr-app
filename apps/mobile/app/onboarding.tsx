import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Chip, ErrorText, Input, Screen, styles, Title } from '../src/components/ui';
import { api, ApiError } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { useApi } from '../src/lib/use-api';
import { space } from '../src/lib/theme';

type Club = { id: string; name: string; city: string };

/** Première connexion : prénom, nom, club favori, puis liaison automatique du compte de réservation. */
export default function OnboardingScreen() {
  const { reloadMe, me } = useAuth();
  const clubs = useApi<Club[]>('/clubs');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [favoriteClubId, setFavoriteClubId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api('/me', { method: 'PATCH', body: { firstName, lastName, favoriteClubId } });
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
          Vos points GPR sont valables dans tous les clubs du groupement.
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
        <Button
          label="Commencer"
          loading={loading}
          disabled={!firstName.trim() || !lastName.trim()}
          onPress={submit}
        />
        <ErrorText>{error}</ErrorText>
      </Card>
    </Screen>
  );
}

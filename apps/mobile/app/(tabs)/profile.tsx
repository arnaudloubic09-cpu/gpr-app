import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Chip, ErrorText, Screen, styles, Title } from '../../src/components/ui';
import { api, ApiError } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { formatDate } from '../../src/lib/format';
import { space } from '../../src/lib/theme';
import { useApi } from '../../src/lib/use-api';

type Club = { id: string; name: string; city: string };
type Link = { provider: string; linkedAt: string };
type LinkResult = { provider: string; status: string };

const PROVIDER: Record<string, string> = {
  PLAYTOMIC: 'Playtomic',
  DOINSPORT: 'Doinsport',
  MOCK: 'Réservation (démo)',
};
const LINK_STATUS: Record<string, string> = {
  LINKED: 'Compte lié',
  ALREADY_LINKED: 'Déjà lié',
  NOT_FOUND: 'Aucun compte trouvé avec votre email',
  TAKEN: 'Ce compte est déjà lié à un autre joueur : contactez votre club',
  UNAVAILABLE: 'Service momentanément indisponible',
};

export default function ProfileScreen() {
  const { me, reloadMe, signOut } = useAuth();
  const router = useRouter();
  const clubs = useApi<Club[]>('/clubs');
  const links = useApi<Link[]>('/me/links');
  const vip = useApi<{ enabled: boolean; active?: boolean }>('/me/vip');
  const [linkResults, setLinkResults] = useState<LinkResult[] | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFavorite = async (favoriteClubId: string) => {
    try {
      await api('/me', { method: 'PATCH', body: { favoriteClubId } });
      await reloadMe();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
    }
  };

  const link = async () => {
    setLinking(true);
    setError(null);
    try {
      setLinkResults(await api<LinkResult[]>('/me/link-account', { method: 'POST' }));
      await links.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
    } finally {
      setLinking(false);
    }
  };

  return (
    <Screen>
      <Title subtitle={me?.email}>
        {me?.firstName} {me?.lastName}
      </Title>

      {me?.deletionScheduledFor ? (
        <Card style={{ borderColor: '#b91c1c' }}>
          <Text style={{ color: '#b91c1c', fontWeight: '700' }}>
            Suppression du compte prévue le {formatDate(String(me.deletionScheduledFor))}
          </Text>
          <Button label="Gérer" variant="secondary" onPress={() => router.push('/privacy')} />
        </Card>
      ) : null}

      <Button
        label="Ma carte de membre"
        icon="card-outline"
        onPress={() => router.push('/member-card')}
      />
      <Button
        label="Partenaires locaux"
        variant="secondary"
        icon="storefront-outline"
        onPress={() => router.push('/local-partners')}
      />
      {vip.data?.enabled ? (
        <Button
          label={vip.data.active ? 'Ma carte VIP' : 'Découvrir la carte VIP'}
          variant="secondary"
          icon="diamond-outline"
          onPress={() => router.push('/vip')}
        />
      ) : null}
      <View style={{ height: space(3) }} />

      <Card>
        <Text style={styles.h2}>Club principal</Text>
        <Text style={[styles.muted, { marginBottom: space(3) }]}>
          Ses récompenses s’affichent en premier.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
          {clubs.data?.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              active={me?.favoriteClubId === c.id}
              onPress={() => setFavorite(c.id)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={styles.h2}>Compte de réservation</Text>
        <Text style={[styles.muted, { marginBottom: space(3) }]}>
          Liez votre compte Playtomic ou Doinsport (même email) pour gagner des points GPR à chaque
          partie. Seules les parties jouées après la liaison comptent.
        </Text>
        {links.data?.map((l) => (
          <Text key={l.provider} style={{ marginBottom: space(1) }}>
            ✓ {PROVIDER[l.provider] ?? l.provider} — lié le {formatDate(l.linkedAt)}
          </Text>
        ))}
        {linkResults?.map((r) => (
          <Text key={r.provider} style={styles.muted}>
            {PROVIDER[r.provider] ?? r.provider} : {LINK_STATUS[r.status] ?? r.status}
          </Text>
        ))}
        <Button
          label="Rechercher mon compte"
          variant="secondary"
          onPress={link}
          loading={linking}
          icon="link-outline"
        />
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button
        label="Confidentialité et données"
        variant="secondary"
        icon="shield-checkmark-outline"
        onPress={() => router.push('/privacy')}
      />
      <Button label="Se déconnecter" variant="secondary" onPress={signOut} icon="log-out-outline" />
    </Screen>
  );
}

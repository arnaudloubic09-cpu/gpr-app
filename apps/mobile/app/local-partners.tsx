import { Ionicons } from '@expo/vector-icons';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { Card, Empty, ErrorText, Loading, Screen, styles, Title } from '../src/components/ui';
import { API_URL } from '../src/config';
import { formatDate } from '../src/lib/format';
import { colors, radius, space } from '../src/lib/theme';
import { useApi } from '../src/lib/use-api';

type Partner = {
  id: string;
  name: string;
  offer: string;
  description: string | null;
  address: string;
  mapsUrl: string;
  logoUrl: string | null;
  club: { id: string; name: string };
  favorite: boolean;
  active: boolean;
  activeUntil: string | null;
};

export default function LocalPartnersScreen() {
  const { data, error, loading } = useApi<Partner[]>('/me/local-partners');
  const groups: { club: Partner['club']; favorite: boolean; items: Partner[] }[] = [];
  for (const p of data ?? []) {
    const g = groups.find((x) => x.club.id === p.club.id);
    if (g) g.items.push(p);
    else groups.push({ club: p.club, favorite: p.favorite, items: [p] });
  }
  return (
    <Screen>
      <Title subtitle="Présentez cet écran chez le partenaire pour profiter de l’avantage.">
        Partenaires locaux
      </Title>
      {loading && !data ? <Loading /> : null}
      <ErrorText>{error}</ErrorText>
      {data?.length === 0 ? (
        <Empty icon="storefront-outline" text="Aucun partenaire local pour le moment." />
      ) : null}
      {groups.map((g) => (
        <View key={g.club.id} style={{ marginBottom: space(3) }}>
          <Text style={[styles.h2, { marginBottom: space(2) }]}>
            {g.club.name}
            {g.favorite ? '  ★' : ''}
          </Text>
          {g.items.map((p) => (
            <Card key={p.id} style={{ borderWidth: 2, borderColor: colors.primary }}>
              <View style={{ flexDirection: 'row', gap: space(3) }}>
                {p.logoUrl ? (
                  <Image
                    source={{ uri: `${API_URL}${p.logoUrl}` }}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                    resizeMode="contain"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: radius.md,
                      backgroundColor: colors.primarySoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="storefront-outline" size={26} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text }}>
                    {p.name}
                  </Text>
                  <Text style={{ fontWeight: '700', color: colors.text, marginTop: 2 }}>
                    {p.offer}
                  </Text>
                  {p.description ? (
                    <Text style={[styles.muted, { marginTop: 2 }]}>{p.description}</Text>
                  ) : null}
                </View>
              </View>
              <View
                style={{
                  marginTop: space(3),
                  padding: space(2),
                  borderRadius: radius.md,
                  backgroundColor: p.active ? colors.primarySoft : '#EFEFED',
                }}
              >
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>
                  {p.active && p.activeUntil
                    ? `✓ Avantage actif jusqu’au ${formatDate(p.activeUntil)}`
                    : `Jouez une partie à ${p.club.name} pour activer l’avantage (30 jours).`}
                </Text>
              </View>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Itinéraire vers ${p.name}`}
                onPress={() => Linking.openURL(p.mapsUrl)}
                style={{ flexDirection: 'row', alignItems: 'center', marginTop: space(3) }}
              >
                <Ionicons name="navigate-outline" size={18} color={colors.primary} />
                <Text style={{ marginLeft: 6, color: colors.primary, fontWeight: '600', flex: 1 }}>
                  {p.address}
                </Text>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Itinéraire</Text>
              </Pressable>
            </Card>
          ))}
        </View>
      ))}
    </Screen>
  );
}

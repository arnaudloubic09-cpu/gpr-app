import type { LevelStatus } from '@gpr/core';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { LevelBar } from '../src/components/level-card';
import { Card, Empty, ErrorText, Loading, Screen, styles } from '../src/components/ui';
import { LEVEL_COLORS } from '../src/lib/format';
import { colors, radius, space } from '../src/lib/theme';
import { useApi } from '../src/lib/use-api';

type MemberCard = {
  memberCode: string;
  firstName: string | null;
  lastName: string | null;
  level: LevelStatus;
  clubs: {
    club: { id: string; name: string };
    perks: { id: string; label: string }[];
    nextLevelPerks: { id: string; label: string }[];
  }[];
};

/** Carte de membre : à présenter à l'accueil du club pour profiter des avantages de son niveau. */
export default function MemberCardScreen() {
  const card = useApi<MemberCard>('/me/member-card');
  if (!card.data)
    return card.loading ? (
      <Loading />
    ) : (
      <Screen>
        <ErrorText>{card.error}</ErrorText>
      </Screen>
    );
  const { level } = card.data;
  const color = LEVEL_COLORS[level.current.code] ?? colors.primary;

  return (
    <Screen>
      <View
        style={{
          backgroundColor: color,
          borderRadius: radius.lg,
          padding: space(5),
          alignItems: 'center',
          marginBottom: space(4),
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', opacity: 0.9 }}>Membre GPR</Text>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>
          Niveau {level.current.label}
        </Text>
        <Text style={{ color: '#fff', marginBottom: space(4) }}>
          {card.data.firstName} {card.data.lastName}
        </Text>
        <View
          style={{ backgroundColor: '#fff', padding: space(3), borderRadius: radius.md }}
          accessibilityLabel={`QR code de la carte ${card.data.memberCode}`}
        >
          <QRCode value={card.data.memberCode} size={180} />
        </View>
        <Text
          selectable
          style={{
            color: '#fff',
            fontWeight: '800',
            letterSpacing: 2,
            marginTop: space(3),
            fontSize: 18,
          }}
        >
          {card.data.memberCode}
        </Text>
        <Text style={{ color: '#fff', opacity: 0.9, marginTop: space(1), textAlign: 'center' }}>
          Présentez cette carte à l’accueil du club avant de payer.
        </Text>
      </View>

      {level.next ? (
        <Card>
          <Text style={styles.label}>Prochain niveau : {level.next.label}</Text>
          <LevelBar progress={level.progress} color={color} />
          <Text style={[styles.muted, { marginTop: space(2) }]}>
            {level.points12m.toLocaleString('fr-FR')} / {level.next.minGpr.toLocaleString('fr-FR')}{' '}
            points GPR gagnés sur les 12 derniers mois.
          </Text>
        </Card>
      ) : null}

      <Text style={[styles.h2, { marginTop: space(2) }]}>Mes avantages</Text>
      {card.data.clubs.every((c) => c.perks.length === 0 && c.nextLevelPerks.length === 0) ? (
        <Empty
          icon="pricetag-outline"
          text="Les clubs n’ont pas encore défini d’avantages de niveau."
        />
      ) : null}
      {card.data.clubs
        .filter((c) => c.perks.length || c.nextLevelPerks.length)
        .map((c) => (
          <Card key={c.club.id}>
            <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: space(2) }}>
              {c.club.name}
            </Text>
            {c.perks.length === 0 ? (
              <Text style={styles.muted}>Pas encore d’avantage à votre niveau.</Text>
            ) : null}
            {c.perks.map((p) => (
              <Text key={p.id} style={{ color: colors.text, marginBottom: 4 }}>
                ✓ {p.label}
              </Text>
            ))}
            {c.nextLevelPerks.length && level.next ? (
              <Text style={[styles.muted, { marginTop: space(2), fontSize: 13 }]}>
                Au niveau {level.next.label} : {c.nextLevelPerks.map((p) => p.label).join(', ')}
              </Text>
            ) : null}
          </Card>
        ))}
    </Screen>
  );
}

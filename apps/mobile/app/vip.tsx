import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Button, Card, Empty, ErrorText, Loading, Screen, styles } from '../src/components/ui';
import { api, ApiError } from '../src/lib/api';
import { formatDate } from '../src/lib/format';
import { colors, radius, space } from '../src/lib/theme';
import { useApi } from '../src/lib/use-api';

type VipStatus =
  | { enabled: false }
  | {
      enabled: true;
      active: boolean;
      until: string | null;
      sources: string[];
      freeLevel: { label: string; minGpr: number };
      priceCents: number;
      purchaseEnabled: boolean;
    };
type Partner = {
  id: string;
  name: string;
  offer: string;
  description: string | null;
  websiteUrl: string | null;
  codeValidityDays: number;
  available: boolean;
};
type MyCode = {
  id: string;
  code: string;
  assignedAt: string;
  expiresAt: string;
  partner: { id: string; name: string; offer: string; websiteUrl: string | null };
};

/** Carte VIP : codes promo des partenaires du GPR. */
export default function VipScreen() {
  const status = useApi<VipStatus>('/me/vip');
  const isVip = status.data?.enabled && status.data.active;
  const partners = useApi<Partner[]>(status.data?.enabled ? '/me/vip/partners' : null);
  const codes = useApi<MyCode[]>(isVip ? '/me/vip/codes' : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!status.data)
    return status.loading ? (
      <Loading />
    ) : (
      <Screen>
        <ErrorText>{status.error}</ErrorText>
      </Screen>
    );
  if (!status.data.enabled)
    return (
      <Screen>
        <Empty icon="diamond-outline" text="La carte VIP arrive bientôt." />
      </Screen>
    );
  const s = status.data;

  const getCode = async (p: Partner) => {
    setBusy(p.id);
    setError(null);
    try {
      await api(`/me/vip/partners/${p.id}/code`, { method: 'POST' });
      await codes.reload();
      setInfo(`Nouveau code ${p.name} ajouté en haut de « Mes codes ».`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
    } finally {
      setBusy(null);
    }
  };

  const buy = async () => {
    setError(null);
    try {
      await api('/me/vip/purchase', { method: 'POST' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
    }
  };

  const now = Date.now();
  return (
    <Screen>
      <View
        style={{
          backgroundColor: '#111827',
          borderRadius: radius.lg,
          padding: space(5),
          marginBottom: space(4),
        }}
      >
        <Text style={{ color: '#fbbf24', fontWeight: '800', letterSpacing: 2 }}>CARTE VIP GPR</Text>
        {isVip ? (
          <>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginTop: space(2) }}>
              Membre VIP
            </Text>
            <Text style={{ color: '#d1d5db', marginTop: space(1) }}>
              Valable jusqu’au {s.until ? formatDate(s.until) : '—'}
            </Text>
          </>
        ) : (
          <>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', marginTop: space(2) }}>
              Profitez des offres de nos partenaires
            </Text>
            <Text style={{ color: '#d1d5db', marginTop: space(2) }}>
              Gratuite pendant 1 an dès que vous atteignez le niveau {s.freeLevel.label}, ou{' '}
              {(s.priceCents / 100).toLocaleString('fr-FR')} € pour 1 an.
            </Text>
          </>
        )}
      </View>

      {!isVip ? (
        <Button
          label={`Obtenir la carte VIP · ${(s.priceCents / 100).toLocaleString('fr-FR')} €/an`}
          icon="diamond-outline"
          onPress={buy}
        />
      ) : null}
      {info ? (
        <Text style={{ color: colors.success, fontWeight: '600', marginTop: space(2) }}>
          {info}
        </Text>
      ) : null}
      <ErrorText>{error}</ErrorText>

      {isVip && codes.data?.length ? (
        <>
          <Text style={[styles.h2, { marginTop: space(4) }]}>Mes codes</Text>
          {codes.data.map((c) => {
            const expired = new Date(c.expiresAt).getTime() < now;
            return (
              <Card key={c.id} style={{ opacity: expired ? 0.5 : 1 }}>
                <Text style={{ fontWeight: '700' }}>
                  {c.partner.name} · {c.partner.offer}
                </Text>
                <Text
                  selectable
                  style={{
                    fontSize: 22,
                    fontWeight: '900',
                    letterSpacing: 1,
                    marginVertical: space(2),
                    color: colors.text,
                  }}
                >
                  {c.code}
                </Text>
                <Text style={styles.muted}>
                  {expired ? 'Expiré' : `À utiliser avant le ${formatDate(c.expiresAt)}`}
                </Text>
                {c.partner.websiteUrl && !expired ? (
                  <Pressable
                    onPress={() => Linking.openURL(c.partner.websiteUrl!)}
                    accessibilityRole="link"
                  >
                    <Text style={{ color: colors.primary, fontWeight: '600', marginTop: space(2) }}>
                      Aller sur le site ›
                    </Text>
                  </Pressable>
                ) : null}
              </Card>
            );
          })}
        </>
      ) : null}

      <Text style={[styles.h2, { marginTop: space(4) }]}>Partenaires</Text>
      {partners.loading && !partners.data ? <Loading /> : null}
      {partners.data?.length === 0 ? (
        <Empty icon="storefront-outline" text="Les premiers partenaires arrivent bientôt." />
      ) : null}
      {partners.data?.map((p) => (
        <Card key={p.id}>
          <Text style={{ fontWeight: '700', fontSize: 16 }}>{p.name}</Text>
          <Text style={{ color: colors.primary, fontWeight: '700', marginVertical: 2 }}>
            {p.offer}
          </Text>
          {p.description ? <Text style={styles.muted}>{p.description}</Text> : null}
          {isVip ? (
            <Button
              label={p.available ? 'Obtenir un code' : 'Plus de code pour le moment'}
              variant="secondary"
              disabled={!p.available}
              loading={busy === p.id}
              onPress={() => getCode(p)}
            />
          ) : (
            <Text style={[styles.muted, { marginTop: space(2), fontSize: 12 }]}>
              Réservé aux membres VIP · code valable {p.codeValidityDays} jours
            </Text>
          )}
        </Card>
      ))}
    </Screen>
  );
}

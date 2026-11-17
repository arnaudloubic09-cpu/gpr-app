import { useEffect, useState } from 'react';
import { Alert, Platform, Switch, Text, View } from 'react-native';
import { Button, Card, ErrorText, Screen, styles } from '../src/components/ui';
import { api, ApiError } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { formatDate } from '../src/lib/format';
import { registerForPush } from '../src/lib/push';
import { colors, space } from '../src/lib/theme';
import { useApi } from '../src/lib/use-api';

type Consent = {
  type: 'TERMS' | 'PUSH_NOTIFICATIONS' | 'MARKETING_EMAIL' | 'ANALYTICS';
  granted: boolean;
  updatedAt: string | null;
};

const LABELS: Record<Exclude<Consent['type'], 'TERMS'>, { title: string; hint: string }> = {
  PUSH_NOTIFICATIONS: {
    title: 'Notifications',
    hint: 'Points validés, défis réussis, coupon qui expire…',
  },
  MARKETING_EMAIL: {
    title: 'Emails d’information',
    hint: 'Nouveautés et offres des clubs du groupement.',
  },
  ANALYTICS: {
    title: 'Statistiques d’usage',
    hint: 'Aide le GPR à améliorer l’application (données agrégées).',
  },
};

function confirm(title: string, message: string, ok: string): Promise<boolean> {
  if (Platform.OS === 'web')
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

/** Écran RGPD : consentements, export de mes données, suppression du compte (30 jours de rétractation). */
export default function PrivacyScreen() {
  const { me, reloadMe } = useAuth();
  const consents = useApi<Consent[]>('/me/consents');
  const [values, setValues] = useState<Consent[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (consents.data) setValues(consents.data);
  }, [consents.data]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (type: Consent['type'], granted: boolean) =>
    run(async () => {
      setValues(await api<Consent[]>('/me/consents', { method: 'PUT', body: [{ type, granted }] }));
      if (type === 'PUSH_NOTIFICATIONS' && granted) await registerForPush().catch(() => false);
    });

  const scheduled = me?.deletionScheduledFor ? String(me.deletionScheduledFor) : null;

  return (
    <Screen>
      <Card>
        <Text style={styles.h2}>Mes choix</Text>
        {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((type) => (
          <View key={type} style={[styles.row, { paddingVertical: space(2) }]}>
            <View style={{ flex: 1, paddingRight: space(3) }}>
              <Text style={{ fontWeight: '600' }}>{LABELS[type].title}</Text>
              <Text style={[styles.muted, { fontSize: 13 }]}>{LABELS[type].hint}</Text>
            </View>
            <Switch
              value={values.find((v) => v.type === type)?.granted ?? false}
              onValueChange={(v) => toggle(type, v)}
              disabled={busy}
              accessibilityLabel={LABELS[type].title}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.h2}>Mes données</Text>
        <Text style={styles.muted}>
          Recevez par email une copie de toutes les données associées à votre compte (format JSON).
        </Text>
        <Button
          label="Recevoir mes données par email"
          variant="secondary"
          icon="download-outline"
          loading={busy}
          onPress={() =>
            run(async () => {
              await api('/me/export', { method: 'POST' });
              setMessage(`Vos données ont été envoyées à ${me?.email}.`);
            })
          }
        />
      </Card>

      <Card style={{ borderColor: colors.danger }}>
        <Text style={styles.h2}>Supprimer mon compte</Text>
        {scheduled ? (
          <>
            <Text style={{ color: colors.danger, fontWeight: '600' }}>
              Suppression prévue le {formatDate(scheduled)}.
            </Text>
            <Text style={styles.muted}>
              Jusqu’à cette date, votre compte fonctionne normalement et vous pouvez changer d’avis.
            </Text>
            <Button
              label="Annuler la suppression"
              loading={busy}
              onPress={() =>
                run(async () => {
                  await api('/me/deletion', { method: 'DELETE' });
                  await reloadMe();
                  setMessage('La suppression de votre compte est annulée.');
                })
              }
            />
          </>
        ) : (
          <>
            <Text style={styles.muted}>
              Votre compte sera supprimé 30 jours après votre demande. Pendant ce délai, vous pouvez
              annuler. Ensuite, vos données personnelles seront effacées, vos points GPR et coupons
              seront perdus.
            </Text>
            <Button
              label="Demander la suppression"
              variant="danger"
              loading={busy}
              onPress={async () => {
                if (
                  !(await confirm(
                    'Supprimer mon compte',
                    'Votre compte sera supprimé dans 30 jours. Vos points GPR seront perdus.',
                    'Confirmer',
                  ))
                )
                  return;
                await run(async () => {
                  await api('/me/deletion', { method: 'POST' });
                  await reloadMe();
                  setMessage('Demande enregistrée. Un email de confirmation vous a été envoyé.');
                });
              }}
            />
          </>
        )}
      </Card>
      {message ? <Text style={{ color: colors.success, fontWeight: '600' }}>{message}</Text> : null}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { Button, Card, ErrorText, Input, Screen, styles } from '../src/components/ui';
import { ApiError } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { colors, space } from '../src/lib/theme';

export default function LoginScreen() {
  const { requestCode, verifyCode } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError && e.status !== 401 ? e.message : 'Code invalide ou expiré.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ alignItems: 'center', marginVertical: space(10) }}>
          <Text style={{ fontSize: 44, fontWeight: '900', color: colors.primary }}>GPR</Text>
          <Text style={[styles.muted, { textAlign: 'center', marginTop: space(2) }]}>
            Jouez dans les clubs du groupement, cumulez des points GPR et profitez de récompenses.
          </Text>
        </View>
        <Card>
          {step === 'email' ? (
            <>
              <Input
                label="Votre email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="prenom.nom@email.fr"
                testID="email"
              />
              <Button
                label="Recevoir un code"
                loading={loading}
                disabled={!email.includes('@')}
                onPress={() =>
                  run(async () => {
                    await requestCode(email.trim().toLowerCase());
                    setStep('code');
                  })
                }
              />
            </>
          ) : (
            <>
              <Text style={[styles.muted, { marginBottom: space(3) }]}>
                Un code à 6 chiffres a été envoyé à {email}. Il est valable 10 minutes.
              </Text>
              <Input
                label="Code reçu par email"
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                placeholder="123456"
                testID="code"
              />
              <Button
                label="Se connecter"
                loading={loading}
                disabled={code.length !== 6}
                onPress={() => run(() => verifyCode(email.trim().toLowerCase(), code))}
              />
              <Button
                label="Changer d’email"
                variant="secondary"
                onPress={() => setStep('email')}
              />
            </>
          )}
          <ErrorText>{error}</ErrorText>
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}

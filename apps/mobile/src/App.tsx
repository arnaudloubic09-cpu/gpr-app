import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { API_URL } from './config';

type Health = { status: 'ok' | 'error'; database?: string } | null;

/** Écran de démarrage (phase 1) : vérifie la connexion à l'API. Les écrans joueur arrivent en phase 3. */
export default function App() {
  const [health, setHealth] = useState<Health>(null);
  const [loading, setLoading] = useState(true);

  const check = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/health`);
      setHealth(await res.json());
    } catch {
      setHealth({ status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void check();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GPR</Text>
      <Text style={styles.subtitle}>Le programme de fidélité de vos clubs de padel</Text>
      <View style={styles.card}>
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text style={health?.status === 'ok' ? styles.ok : styles.error}>
            {health?.status === 'ok' ? 'API connectée' : `API injoignable (${API_URL})`}
          </Text>
        )}
        <Pressable onPress={check} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>Réessayer</Text>
        </Pressable>
      </View>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f6f7f9',
  },
  title: { fontSize: 40, fontWeight: '800', color: '#0f766e' },
  subtitle: { marginTop: 8, fontSize: 16, color: '#6b7280', textAlign: 'center' },
  card: {
    marginTop: 32,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    width: '100%',
  },
  ok: { color: '#0f766e', fontWeight: '600' },
  error: { color: '#b91c1c', fontWeight: '600' },
  button: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  buttonText: { color: '#111827' },
});

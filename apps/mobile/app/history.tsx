import type { TransactionItem } from '@gpr/core';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { TransactionRow } from '../src/components/transaction-row';
import { Empty } from '../src/components/ui';
import { api } from '../src/lib/api';
import { colors, space } from '../src/lib/theme';

type Page = { items: TransactionItem[]; nextCursor: string | null };

export default function HistoryScreen() {
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    try {
      const page = await api<Page>(`/me/transactions?limit=30${cursor ? `&cursor=${cursor}` : ''}`);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      setDone(!page.nextCursor);
    } catch {
      setError('Impossible de charger l’historique.');
    } finally {
      setLoading(false);
    }
  }, [cursor, done, loading]);

  useEffect(() => {
    void loadMore();
    // chargement initial uniquement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingHorizontal: space(4), paddingBottom: space(10) }}
      data={items}
      keyExtractor={(t) => t.id}
      renderItem={({ item }) => <TransactionRow t={item} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={
        !loading ? (
          <Empty icon="time-outline" text="Aucune transaction pour le moment." />
        ) : undefined
      }
      ListFooterComponent={
        <View style={{ padding: space(4) }}>
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        </View>
      }
    />
  );
}

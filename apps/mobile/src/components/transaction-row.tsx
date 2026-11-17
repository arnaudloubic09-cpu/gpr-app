import type { TransactionItem } from '@gpr/core';
import { Text, View } from 'react-native';
import { formatDateTime, signedPoints } from '../lib/format';
import { colors, space } from '../lib/theme';

export function TransactionRow({ t }: { t: TransactionItem }) {
  const positive = t.amount > 0;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: space(3),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', color: colors.text }}>{t.label}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {[t.club?.name, formatDateTime(t.earnedAt)].filter(Boolean).join(' · ')}
          {t.status === 'PENDING' ? ' · en attente' : ''}
        </Text>
      </View>
      <Text
        style={{
          fontWeight: '700',
          fontSize: 16,
          color: t.status === 'PENDING' ? colors.muted : positive ? colors.success : colors.text,
        }}
      >
        {signedPoints(t.amount)}
      </Text>
    </View>
  );
}

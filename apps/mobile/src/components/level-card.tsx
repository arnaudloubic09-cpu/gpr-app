import { Ionicons } from '@expo/vector-icons';
import type { LevelStatus } from '@gpr/core';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { LEVEL_COLORS } from '../lib/format';
import { colors, radius, space } from '../lib/theme';

export function LevelBar({ progress, color }: { progress: number; color: string }) {
  return (
    <View
      style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' }}
    >
      <View
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
          height: 8,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** Niveau du joueur, progression et accès à la carte de membre. */
export function LevelCard({ level }: { level: LevelStatus }) {
  const color = LEVEL_COLORS[level.current.code] ?? colors.primary;
  return (
    <Link href="/member-card" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Niveau ${level.current.label}. Ouvrir ma carte de membre`}
      >
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            padding: space(4),
            marginBottom: space(3),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space(2) }}>
            <Ionicons name="ribbon" size={22} color={color} />
            <Text style={{ fontSize: 18, fontWeight: '800', color, marginLeft: space(2), flex: 1 }}>
              Niveau {level.current.label}
            </Text>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Ma carte ›</Text>
          </View>
          <LevelBar progress={level.progress} color={color} />
          <Text style={{ color: colors.muted, marginTop: space(2), fontSize: 13 }}>
            {level.next
              ? `Encore ${level.pointsToNext.toLocaleString('fr-FR')} points GPR pour le niveau ${level.next.label} (points gagnés sur 12 mois)`
              : 'Niveau maximal atteint : bravo !'}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

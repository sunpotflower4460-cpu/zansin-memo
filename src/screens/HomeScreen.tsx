import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ResurfacedSeed, Seed } from '../domain/types';
import { formatDate } from '../utils/seedUtils';

type HomeScreenProps = {
  seeds: Seed[];
  todaySeed?: ResurfacedSeed;
  onRefreshToday: () => void;
  onOpenSeed: (seedId: string) => void;
  onOpenWrite: () => void;
};

export function HomeScreen({ seeds, todaySeed, onRefreshToday, onOpenSeed, onOpenWrite }: HomeScreenProps) {
  const recent = [...seeds].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Kizashi Notes</Text>
      <Text style={styles.subheading}>思いつきを「種」として残し、やさしく育てる場所。</Text>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>今日の種</Text>
          <Pressable onPress={onRefreshToday} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>別の種をみる</Text>
          </Pressable>
        </View>
        {todaySeed ? (
          <Pressable onPress={() => onOpenSeed(todaySeed.seed.id)} style={styles.seedCard}>
            <Text style={styles.seedBody}>{todaySeed.seed.body}</Text>
            <Text style={styles.seedMeta}>理由: {todaySeed.reason}</Text>
            <Text style={styles.seedMeta}>更新: {formatDate(todaySeed.seed.updatedAt)}</Text>
          </Pressable>
        ) : (
          <Text style={styles.emptyText}>まだ種がありません。最初のひとことを残してみましょう。</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>最近の種</Text>
        {recent.length > 0 ? (
          recent.map((seed) => (
            <Pressable key={seed.id} onPress={() => onOpenSeed(seed.id)} style={styles.listItem}>
              <Text style={styles.listBody} numberOfLines={2}>
                {seed.body}
              </Text>
              <Text style={styles.listMeta}>{seed.growthState} ・ 重要度{seed.importance}</Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.emptyText}>保存された種はまだありません。</Text>
        )}
      </View>

      <Pressable onPress={onOpenWrite} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>新しい種を書く</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 120,
    gap: 14,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a',
  },
  subheading: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e293b',
  },
  seedCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f7fafc',
    gap: 8,
  },
  seedBody: {
    fontSize: 17,
    color: '#0f172a',
    lineHeight: 24,
  },
  seedMeta: {
    fontSize: 13,
    color: '#64748b',
  },
  listItem: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  listBody: {
    fontSize: 16,
    color: '#1e293b',
  },
  listMeta: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 21,
  },
  primaryButton: {
    backgroundColor: '#1d7a53',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
  },
  secondaryButtonText: {
    color: '#166534',
    fontSize: 13,
  },
});

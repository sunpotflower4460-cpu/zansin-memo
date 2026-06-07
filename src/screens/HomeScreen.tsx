import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { FadeInView } from '../components/FadeInView';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import type { ResurfacedSeed, Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { formatDate } from '../utils/seedUtils';
import { toGrowthLabel } from '../utils/displayLabels';

type HomeScreenProps = {
  seeds: Seed[];
  todaySeed?: ResurfacedSeed;
  onRefreshToday: () => void;
  onOpenSeed: (seedId: string) => void;
  onOpenWrite: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenSupport: () => void;
  onClearAllData: () => void;
};

export function HomeScreen({
  seeds,
  todaySeed,
  onRefreshToday,
  onOpenSeed,
  onOpenWrite,
  onOpenPrivacyPolicy,
  onOpenSupport,
  onClearAllData,
}: HomeScreenProps) {
  const recent = [...seeds].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const today = new Date();
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日`;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.todayMeta}>今日の種 · {dateLabel}</Text>
      <Text style={styles.heading}>Kizashi Notes</Text>
      <Text style={styles.subheading}>ひとことを置いて、あとでゆっくり育てるためのノートです。</Text>

      <FadeInView delayMs={40}>
        <SectionCard>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>今日の種</Text>
          {todaySeed ? (
            <AnimatedPressable
              onPress={onRefreshToday}
              style={styles.secondaryButton}
              pressedStyle={styles.secondaryButtonPressed}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel="今日の種を切り替える"
            >
              <Text style={styles.secondaryButtonText}>別の種を見る</Text>
            </AnimatedPressable>
          ) : null}
        </View>

        {todaySeed ? (
          <AnimatedPressable
            onPress={() => onOpenSeed(todaySeed.seed.id)}
            style={styles.seedCard}
            pressedStyle={styles.seedCardPressed}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="今日の種の詳細を開く"
          >
            <Text style={styles.seedBody}>{todaySeed.seed.body}</Text>
            <Text style={styles.seedMeta}>理由: {todaySeed.reason}</Text>
            <Text style={styles.seedMeta}>更新: {formatDate(todaySeed.seed.updatedAt)}</Text>
          </AnimatedPressable>
        ) : (
          <EmptyState
            icon="leaf-outline"
            title="まだ種はありません"
            description="ひとことだけ、ここに置いてみましょう。"
            actionLabel="最初の種を書く"
            onAction={onOpenWrite}
          />
        )}
        </SectionCard>
      </FadeInView>

      <FadeInView delayMs={90}>
        <SectionCard muted>
          <Text style={styles.cardTitle}>最近の種</Text>
          {recent.length > 0 ? (
            recent.map((seed) => (
              <AnimatedPressable
                key={seed.id}
                onPress={() => onOpenSeed(seed.id)}
                style={styles.listItem}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel="最近の種の詳細を開く"
              >
                <Text style={styles.listBody} numberOfLines={2}>
                  {seed.body}
                </Text>
                <View style={styles.listMetaRow}>
                  <Ionicons name="leaf-outline" size={14} color={theme.colors.textSoft} />
                  <Text style={styles.listMeta}>
                    {toGrowthLabel(seed.growthState)} ・ 大切度{seed.importance}
                  </Text>
                </View>
              </AnimatedPressable>
            ))
          ) : (
            <EmptyState icon="sparkles-outline" title="種の記録はこれからです" description="書いた種はここに静かに並んでいきます。" />
          )}
        </SectionCard>
      </FadeInView>

      <FadeInView delayMs={120}>
        <SectionCard muted>
          <Text style={styles.cardTitle}>このアプリについて</Text>
          <Text style={styles.aboutText}>
            このアプリは端末内のローカル保存を中心に動作します。{'\n'}
            現時点で、ログイン・AI送信・広告・トラッキングはありません。
          </Text>

          <AnimatedPressable
            onPress={onOpenPrivacyPolicy}
            style={styles.linkButton}
            pressedStyle={styles.linkButtonPressed}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="プライバシーポリシーを開く"
          >
            <Text style={styles.linkButtonText}>プライバシーポリシーを開く</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={onOpenSupport}
            style={styles.linkButton}
            pressedStyle={styles.linkButtonPressed}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="サポート連絡先を開く"
          >
            <Text style={styles.linkButtonText}>サポート連絡先</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={onClearAllData}
            style={styles.deleteButton}
            pressedStyle={styles.deleteButtonPressed}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="すべてのデータを削除する"
          >
            <Text style={styles.deleteButtonText}>すべてのデータを削除</Text>
          </AnimatedPressable>
        </SectionCard>
      </FadeInView>

      <PrimaryButton label="新しい種を書く" onPress={onOpenWrite} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: 124,
    gap: theme.spacing.md,
  },
  todayMeta: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSoft,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  heading: {
    fontSize: theme.typography.largeTitle,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subheading: {
    fontSize: theme.typography.subbody,
    color: theme.colors.textMuted,
    lineHeight: 22,
    marginBottom: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  cardTitle: {
    fontSize: theme.typography.sectionTitle,
    fontWeight: '600',
    color: theme.colors.text,
  },
  secondaryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: '#dceee1',
  },
  secondaryButtonPressed: {
    backgroundColor: '#d3e7d9',
  },
  secondaryButtonText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '500',
  },
  seedCard: {
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.xs,
  },
  seedCardPressed: {
    backgroundColor: '#e9f1eb',
  },
  seedBody: {
    fontSize: 17,
    color: theme.colors.text,
    lineHeight: 24,
  },
  seedMeta: {
    fontSize: theme.typography.caption,
    color: theme.colors.textMuted,
  },
  listItem: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#dfe8e0',
    gap: 6,
  },
  listBody: {
    fontSize: theme.typography.body,
    color: theme.colors.text,
  },
  listMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listMeta: {
    fontSize: theme.typography.caption,
    color: theme.colors.textMuted,
  },
  aboutText: {
    fontSize: theme.typography.body,
    color: theme.colors.textMuted,
    lineHeight: 22,
  },
  linkButton: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSoft,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  linkButtonPressed: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  linkButtonText: {
    fontSize: theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  deleteButton: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.dangerBg,
    backgroundColor: theme.colors.dangerBg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  deleteButtonPressed: {
    backgroundColor: theme.colors.surface,
  },
  deleteButtonText: {
    fontSize: theme.typography.body,
    color: theme.colors.dangerText,
    fontWeight: '600',
  },
});

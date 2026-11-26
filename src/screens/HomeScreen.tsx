import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { FadeInView } from '../components/FadeInView';
import { GrowthBadge } from '../components/GrowthBadge';
import { ImportanceDots } from '../components/ImportanceDots';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import type { ResurfacedSeed, Seed } from '../domain/types';
import { APP_VERSION } from '../config/appInfo';
import { theme } from '../styles/theme';
import { formatRelativeDay } from '../utils/seedUtils';
import { growthStateHints, growthStateLabels } from '../utils/displayLabels';
import { GROWTH_STATE_OPTIONS } from '../domain/types';

type HomeScreenProps = {
  seeds: Seed[];
  todaySeed?: ResurfacedSeed;
  onRefreshToday: () => void;
  onOpenSeed: (seedId: string) => void;
  onOpenWrite: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenSupport: () => void;
  onClearAllData: () => void;
  onExportJson: () => void;
  onExportText: () => void;
};

const SNIPPET_LENGTH = 40;
const toSnippet = (body: string) => (body.length > SNIPPET_LENGTH ? `${body.slice(0, SNIPPET_LENGTH)}…` : body);

export function HomeScreen({
  seeds,
  todaySeed,
  onRefreshToday,
  onOpenSeed,
  onOpenWrite,
  onOpenPrivacyPolicy,
  onOpenSupport,
  onClearAllData,
  onExportJson,
  onExportText,
}: HomeScreenProps) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const recent = [...seeds].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const today = new Date();
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日（${'日月火水木金土'[today.getDay()]}）`;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.todayMeta}>今日の種 · {dateLabel}</Text>
      <Text style={styles.heading} accessibilityRole="header" accessibilityLabel="きざしノート">
        きざしノート
      </Text>
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
            accessibilityLabel={`今日の種を開く。${toSnippet(todaySeed.seed.body)}`}
          >
            <Text style={styles.seedBody} numberOfLines={6}>
              {todaySeed.seed.body}
            </Text>
            <View style={styles.seedMetaRow}>
              <GrowthBadge state={todaySeed.seed.growthState} />
              <Text style={styles.seedMeta}>{formatRelativeDay(todaySeed.seed.updatedAt)}に更新</Text>
            </View>
            <Text style={styles.reason}>{todaySeed.reason}</Text>
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

      {seeds.length > 0 ? <PrimaryButton label="新しい種を書く" onPress={onOpenWrite} /> : null}

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
                accessibilityLabel={`種を開く。${toSnippet(seed.body)}`}
              >
                <Text style={styles.listBody} numberOfLines={2}>
                  {seed.body}
                </Text>
                <View style={styles.listMetaRow}>
                  <GrowthBadge state={seed.growthState} />
                  <Text style={styles.listMeta}>{formatRelativeDay(seed.updatedAt)}</Text>
                  <View style={styles.listMetaSpacer} />
                  <ImportanceDots value={seed.importance} />
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
          <AnimatedPressable
            onPress={() => setSettingsOpen((value) => !value)}
            style={styles.settingsToggle}
            haptic="light"
            accessibilityRole="button"
            accessibilityState={{ expanded: settingsOpen }}
            accessibilityLabel="設定・バックアップ・サポート"
            accessibilityHint={settingsOpen ? 'タップして閉じます' : 'タップして開きます'}
          >
            <View style={styles.settingsLabelWrap}>
              <Ionicons name="settings-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.cardTitle}>設定・バックアップ</Text>
            </View>
            <Ionicons name={settingsOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} color={theme.colors.textMuted} />
          </AnimatedPressable>

          {settingsOpen ? (
            <View style={styles.settingsBody}>
              <Text style={styles.exportLabel}>種の育ち方</Text>
              {GROWTH_STATE_OPTIONS.map((state) => (
                <View key={state} style={styles.howtoRow}>
                  <GrowthBadge state={state} />
                  <Text style={styles.howtoText}>{growthStateHints[state]}</Text>
                </View>
              ))}
              <Text style={styles.howtoNote}>
                詳細の画面で、{growthStateLabels.seed}→{growthStateLabels.sprout}→{growthStateLabels.tree}と育てていけます。急がなくて大丈夫です。
              </Text>

              <Text style={styles.exportLabel}>プライバシー</Text>
              <Text style={styles.aboutText}>
                種はこの端末の中だけに保存されます。{'\n'}
                ログイン・広告・トラッキング・外部への送信はありません。
              </Text>

              <Text style={styles.exportLabel}>データのバックアップ</Text>
              <AnimatedPressable
                onPress={onExportJson}
                style={styles.linkButton}
                pressedStyle={styles.linkButtonPressed}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel="JSONでエクスポートする"
              >
                <Text style={styles.linkButtonText}>JSON形式でエクスポート</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={onExportText}
                style={styles.linkButton}
                pressedStyle={styles.linkButtonPressed}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel="テキストでエクスポートする"
              >
                <Text style={styles.linkButtonText}>テキスト形式でエクスポート</Text>
              </AnimatedPressable>

              <Text style={styles.exportLabel}>このアプリについて</Text>
              <AnimatedPressable
                onPress={onOpenPrivacyPolicy}
                style={styles.linkButton}
                pressedStyle={styles.linkButtonPressed}
                haptic="light"
                accessibilityRole="link"
                accessibilityLabel="プライバシーポリシーを開く"
              >
                <Text style={styles.linkButtonText}>プライバシーポリシー</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={onOpenSupport}
                style={styles.linkButton}
                pressedStyle={styles.linkButtonPressed}
                haptic="light"
                accessibilityRole="link"
                accessibilityLabel="サポート連絡先を開く"
              >
                <Text style={styles.linkButtonText}>サポート・お問い合わせ</Text>
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

              <Text style={styles.versionText}>Kizashi Notes バージョン {APP_VERSION}</Text>
            </View>
          ) : null}
        </SectionCard>
      </FadeInView>

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
    fontFamily: theme.fonts.serif,
    letterSpacing: 2,
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
    fontWeight: '700',
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
  },
  secondaryButton: {
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.leaf,
  },
  secondaryButtonPressed: {
    backgroundColor: theme.colors.leafPressed,
  },
  secondaryButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  seedCard: {
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.xs,
  },
  seedCardPressed: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  seedBody: {
    fontSize: 18,
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
    lineHeight: 28,
  },
  seedMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  listItem: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.rule,
    gap: 6,
  },
  listBody: {
    fontFamily: theme.fonts.serif,
    fontSize: theme.typography.body,
    color: theme.colors.text,
  },
  listMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  settingsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  settingsLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsBody: {
    gap: theme.spacing.xs,
  },
  howtoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  howtoText: {
    flex: 1,
    fontSize: theme.typography.subbody,
    color: theme.colors.textMuted,
  },
  howtoNote: {
    fontSize: 13,
    color: theme.colors.textSoft,
    lineHeight: 19,
  },
  seedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reason: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  listMetaSpacer: {
    flex: 1,
  },
  versionText: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSoft,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
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
  exportLabel: {
    fontSize: theme.typography.caption,
    color: theme.colors.textMuted,
    fontWeight: '600',
    marginTop: theme.spacing.sm,
    letterSpacing: 0.3,
  },
});

import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Image, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import banner from '../../assets/banner-field.png';
import bannerLetter from '../../assets/splash-icon.png';
import { stageImages } from '../utils/stageImages';
import { FieldRow } from '../components/FieldRow';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { GrowthBadge } from '../components/GrowthBadge';
import { HelpButton } from '../components/HelpButton';
import { helpTexts } from '../utils/helpTexts';
import { LinkCount } from '../components/LinkCount';
import { getLinkCounts } from '../utils/links';
import { GardenLetterCard } from '../components/GardenLetterCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import type { ResurfacedSeed, Seed, SeedConnection } from '../domain/types';
import { APP_VERSION } from '../config/appInfo';
import { theme } from '../styles/theme';
import { formatRelativeDay } from '../utils/seedUtils';
import { growthStateHints } from '../utils/displayLabels';
import { GROWTH_STATE_OPTIONS } from '../domain/types';
import { buildGardenLetter } from '../utils/gardenLetter';

type HomeScreenProps = {
  seeds: Seed[];
  connections: SeedConnection[];
  todaySeed?: ResurfacedSeed;
  onRefreshToday: () => void;
  onOpenSeed: (seedId: string) => void;
  onOpenWrite: () => void;
  onOpenSeeds: () => void;
  onOpenGarden: () => void;
  /** 今日の種から、つながりを足す・芽を見直す。 */
  onAddMemo: (seedId: string) => void;
  onOpenSynthesis: (seedId: string, mode: 'new' | 'review') => void;
  onShowPractice: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenSupport: () => void;
  onClearAllData: () => void;
  onExportJson: () => void;
  onExportText: () => void;
};

const RECENT_LIMIT = 3;
const SNIPPET_LENGTH = 40;
const toSnippet = (body: string) => (body.length > SNIPPET_LENGTH ? `${body.slice(0, SNIPPET_LENGTH)}…` : body);

/** ホーム下部の小さな入口。押すと、その中身をすぐ下に開く。 */
function HomeTile({ title, summary, image, open, onPress }: { title: string; summary: string; image: ImageSourcePropType; open: boolean; onPress: () => void }) {
  return (
    <AnimatedPressable
      onPress={onPress}
      containerStyle={styles.tileContainer}
      style={[styles.tile, open && styles.tileOpen]}
      haptic="light"
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${title}。${summary}。開閉`}
    >
      <Image source={image} style={styles.tileImage} accessibilityIgnoresInvertColors />
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileSummary}>{summary}</Text>
      <Ionicons name={open ? 'chevron-up-outline' : 'chevron-down-outline'} size={16} color={theme.colors.textMuted} />
    </AnimatedPressable>
  );
}

export function HomeScreen({
  seeds,
  connections,
  todaySeed,
  onRefreshToday,
  onOpenSeed,
  onOpenWrite,
  onOpenSeeds,
  onOpenGarden,
  onAddMemo,
  onOpenSynthesis,
  onShowPractice,
  onOpenPrivacyPolicy,
  onOpenSupport,
  onClearAllData,
  onExportJson,
  onExportText,
}: HomeScreenProps) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [panel, setPanel] = React.useState<'field' | 'letter' | undefined>();
  const linkCounts = React.useMemo(() => getLinkCounts(seeds, connections), [seeds, connections]);
  const recent = [...seeds].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_LIMIT);
  const flowerCount = seeds.filter((seed) => seed.growthState === 'tree').length;
  const sproutCount = seeds.filter((seed) => seed.growthState === 'sprout').length;
  const seedCount = seeds.filter((seed) => seed.growthState === 'seed').length;
  const gardenLetter = buildGardenLetter(seeds, new Date(), connections);
  const today = new Date();
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日（${'日月火水木金土'[today.getDay()]}）`;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.banner} accessible accessibilityRole="header" accessibilityLabel={`きざしノート。${dateLabel}`}>
        <Image source={banner} style={styles.bannerImage} resizeMode="cover" accessibilityIgnoresInvertColors />
        <View style={styles.bannerText}>
          <Text style={styles.todayMeta}>{dateLabel}</Text>
          <Text style={styles.heading}>きざしノート</Text>
        </View>
      </View>
      {seeds.length === 0 ? (
        <FadeInView delayMs={40}>
          <SectionCard>
            <Text style={styles.emptyHeading} accessibilityRole="header">
              {'思いつきを残し、つなげて、\nできそうなことへ。'}
            </Text>
            <View style={styles.promise}>
              {[
                // 狭い画面で語の途中で折り返さないよう、区切りで改行する。
                'まとまっていない一言も、\n種になります。',
                '「関係がありそう」と思った\nメモを、あとからつなげます。',
                'できそうなことが見えたら、\n芽として残します。',
              ].map((line, index) => (
                <View key={line} style={styles.promiseRow}>
                  <Text style={styles.promiseNumber}>{index + 1}</Text>
                  <Text style={styles.promiseText}>{line}</Text>
                </View>
              ))}
            </View>
            <PrimaryButton label="メモを書く" onPress={onOpenWrite} accessibilityHint="入力画面を開きます。タイトルや分類は不要です" />
            <AnimatedPressable
              onPress={onShowPractice}
              style={styles.practiceButton}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel="例で使い方を見る。実際のメモには入りません"
            >
              <Ionicons name="school-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.practiceText}>例で使い方を見る</Text>
            </AnimatedPressable>
            <Text style={styles.promiseNote}>どちらも、あとからいつでも選べます。</Text>
          </SectionCard>
        </FadeInView>
      ) : (
        <>
          {/* 1. まず書く */}
          <PrimaryButton label="メモを書く" onPress={onOpenWrite} />

          {/* 2. 今日の種 */}
          {todaySeed ? (
            <FadeInView delayMs={40}>
              <SectionCard>
                <View style={styles.sectionHead}>
                  <View style={styles.titleRow}>
                    <Ionicons name="sunny-outline" size={20} color={theme.colors.accent} />
                    <Text style={styles.cardTitle}>今日の種</Text>
                    <HelpButton content={helpTexts.today} />
                  </View>
                  <AnimatedPressable
                    onPress={onRefreshToday}
                    style={styles.secondaryButton}
                    pressedStyle={styles.secondaryButtonPressed}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel="今日の種を切り替える"
                  >
                    <Text style={styles.secondaryButtonText}>別の種</Text>
                  </AnimatedPressable>
                </View>
                <AnimatedPressable
                  onPress={() => onOpenSeed(todaySeed.seed.id)}
                  style={styles.seedCard}
                  pressedStyle={styles.seedCardPressed}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={`今日の種を開く。${toSnippet(todaySeed.seed.body)}`}
                >
                  <Text style={styles.seedBody} numberOfLines={3}>
                    {todaySeed.seed.body}
                  </Text>
                  <View style={styles.seedMetaRow}>
                    <GrowthBadge state={todaySeed.seed.growthState} />
                    <LinkCount count={linkCounts.get(todaySeed.seed.id) ?? 0} />
                  </View>
                  <Text style={styles.reason}>{todaySeed.reason}</Text>
                </AnimatedPressable>
                <View style={styles.todayActions}>
                  <AnimatedPressable
                    onPress={() => onAddMemo(todaySeed.seed.id)}
                    style={styles.todayAction}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel="今日の種に、書いてつなぐ"
                  >
                    <Ionicons name="create-outline" size={16} color={theme.colors.primary} />
                    <Text style={styles.todayActionText}>書いてつなぐ</Text>
                  </AnimatedPressable>
                  {todaySeed.seed.synthesis && todaySeed.seed.growthState !== 'seed' ? (
                    <AnimatedPressable
                      onPress={() => onOpenSynthesis(todaySeed.seed.id, 'review')}
                      style={styles.todayAction}
                      haptic="light"
                      accessibilityRole="button"
                      accessibilityLabel="今日の種の芽を書き直す"
                    >
                      <Ionicons name="leaf-outline" size={16} color={theme.colors.primary} />
                      <Text style={styles.todayActionText}>芽を書き直す</Text>
                    </AnimatedPressable>
                  ) : null}
                </View>
              </SectionCard>
            </FadeInView>
          ) : null}

          {/* 3. 最近の種 */}
          <FadeInView delayMs={60}>
            <SectionCard muted>
              <View style={styles.sectionHead}>
                <Text style={styles.cardTitle}>最近の種</Text>
                <AnimatedPressable onPress={onOpenSeeds} style={styles.moreLink} haptic="light" accessibilityRole="button" accessibilityLabel="種一覧ですべて見る">
                  <Text style={styles.moreLinkText}>すべて見る</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
                </AnimatedPressable>
              </View>
              {recent.map((seed) => (
                <AnimatedPressable
                  key={seed.id}
                  onPress={() => onOpenSeed(seed.id)}
                  style={styles.listItem}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={`種を開く。${toSnippet(seed.body)}`}
                >
                  <Image source={stageImages[seed.growthState]} style={styles.listStage} accessibilityIgnoresInvertColors />
                  <View style={styles.listText}>
                    <Text style={styles.listBody} numberOfLines={2}>
                      {seed.body}
                    </Text>
                    <View style={styles.listMetaRow}>
                      <Text style={styles.listMeta}>{formatRelativeDay(seed.updatedAt)}</Text>
                      <LinkCount count={linkCounts.get(seed.id) ?? 0} />
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textSoft} />
                </AnimatedPressable>
              ))}
            </SectionCard>
          </FadeInView>

          {/* 4. 畑と庭便りは横に並べ、押した方だけを下に開く */}
          <View style={styles.tiles}>
            <HomeTile
              title="あなたの畑"
              summary={`種${seedCount}・芽${sproutCount}・花${flowerCount}`}
              image={stageImages[flowerCount > 0 ? 'tree' : sproutCount > 0 ? 'sprout' : 'seed']}
              open={panel === 'field'}
              onPress={() => setPanel((current) => (current === 'field' ? undefined : 'field'))}
            />
            <HomeTile
              title="庭便り"
              summary={`今週の新しい種 ${gardenLetter.newSeedCount}`}
              image={bannerLetter}
              open={panel === 'letter'}
              onPress={() => setPanel((current) => (current === 'letter' ? undefined : 'letter'))}
            />
          </View>
          {panel === 'field' ? (
            <SectionCard>
              <View style={styles.sectionHead}>
                <View style={styles.titleRow}>
                  <Text style={styles.cardTitle}>あなたの畑</Text>
                  <HelpButton content={helpTexts.field} />
                </View>
                <AnimatedPressable onPress={onOpenGarden} style={styles.moreLink} haptic="light" accessibilityRole="button" accessibilityLabel="庭で全体を見る">
                  <Text style={styles.moreLinkText}>庭で見る</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
                </AnimatedPressable>
              </View>
              <FieldRow seeds={seeds} onPress={onOpenGarden} />
            </SectionCard>
          ) : null}
          {panel === 'letter' ? <GardenLetterCard letter={gardenLetter} onOpenGarden={onOpenGarden} /> : null}
        </>
      )}

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
              <AnimatedPressable
                onPress={onShowPractice}
                style={styles.linkButton}
                pressedStyle={styles.linkButtonPressed}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel="例で使い方を見る。実際のメモには入りません"
              >
                <Text style={styles.linkButtonText}>例で使い方を見る</Text>
              </AnimatedPressable>

              <Text style={styles.exportLabel}>種の育ち方</Text>
              {GROWTH_STATE_OPTIONS.map((state) => (
                <View key={state} style={styles.howtoRow}>
                  <GrowthBadge state={state} />
                  <Text style={styles.howtoText}>{growthStateHints[state]}</Text>
                </View>
              ))}
              <Text style={styles.howtoNote}>
                {'メモを開いて「こうできそう」を書くと芽に。\n自分で咲いたと思えたら花にできます。'}
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
  banner: {
    height: 172,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: '#f1e4c3',
    borderWidth: 1,
    borderColor: theme.colors.rule,
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  bannerText: {
    position: 'absolute',
    top: 18,
    left: 20,
    gap: 2,
  },
  todayActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  todayAction: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: theme.radius.full, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.chipSelectedBorder },
  todayActionText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  moreLink: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 2,
  },
  moreLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
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
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.rule,
    gap: 10,
  },
  listBody: {
    fontFamily: theme.fonts.serif,
    lineHeight: 24,
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
  emptyHeading: { fontSize: 20, lineHeight: 30, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  promise: { gap: theme.spacing.xs },
  promiseRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  promiseNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
    backgroundColor: theme.colors.leaf,
    overflow: 'hidden',
  },
  promiseText: { flex: 1, fontSize: 15, lineHeight: 24, color: theme.colors.textMuted },
  promiseNote: { fontSize: 13, color: theme.colors.textSoft, textAlign: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  listStage: { width: 40, height: 40 },
  listText: { flex: 1, gap: 4 },
  tiles: { flexDirection: 'row', gap: theme.spacing.sm },
  tileContainer: { flex: 1 },
  tile: { alignItems: 'center', gap: 4, padding: theme.spacing.sm, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.rule },
  tileOpen: { borderColor: theme.colors.primary, borderWidth: 2, backgroundColor: theme.colors.primarySoft },
  tileImage: { width: 64, height: 64 },
  tileTitle: { fontSize: 15, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  tileSummary: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center' },
  practiceButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.chipSelectedBorder, backgroundColor: theme.colors.surface },
  practiceText: { fontSize: theme.typography.body, fontWeight: '700', color: theme.colors.primary },
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

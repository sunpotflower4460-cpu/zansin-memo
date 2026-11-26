import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { Seed, SeedConnection } from '../domain/types';
import { theme } from '../styles/theme';
import { helpTexts } from '../utils/helpTexts';
import { getLinkedSeeds, suggestLinks } from '../utils/links';
import { toSeedSnippet } from '../utils/seedText';
import { formatRelativeDay } from '../utils/seedUtils';
import { stageImages } from '../utils/stageImages';
import { AnimatedPressable } from './AnimatedPressable';
import { HelpButton } from './HelpButton';
import { SectionCard } from './SectionCard';
import { SeedPickerModal } from './SeedPickerModal';

type LinksSectionProps = {
  seed: Seed;
  allSeeds: Seed[];
  connections: SeedConnection[];
  onOpenSeed: (seedId: string) => void;
  onLink: (seedId: string) => void;
  onUnlink: (seedId: string) => void;
  onAddMemo: () => void;
};

// 種のつながり。同じ話の流れ、つないだ種、つながりそうな種（理由つき）をまとめて見せる。
export function LinksSection({ seed, allSeeds, connections, onOpenSeed, onLink, onUnlink, onAddMemo }: LinksSectionProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const linked = React.useMemo(() => getLinkedSeeds(seed, allSeeds, connections), [seed, allSeeds, connections]);
  const linkedIds = React.useMemo(() => new Set(linked.map((item) => item.id)), [linked]);
  const suggestions = React.useMemo(() => suggestLinks(seed, allSeeds, connections, { limit: 3 }), [seed, allSeeds, connections]);
  const candidates = React.useMemo(() => allSeeds.filter((item) => item.id !== seed.id), [allSeeds, seed.id]);
  const otherLinked = linked;
  const hasAnything = linked.length > 0;

  const handleToggle = (otherId: string) => {
    if (linkedIds.has(otherId)) {
      onUnlink(otherId);
    } else {
      onLink(otherId);
    }
  };

  return (
    <SectionCard muted>
      <View style={styles.titleRow}>
        <Ionicons name="git-network-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.title}>つながり</Text>
        <HelpButton content={helpTexts.links} />
      </View>
      <Text style={styles.caption}>「一緒に考えたい」と感じたメモ同士を結べます。親子や順序はありません。</Text>

      {otherLinked.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.label}>つながっている種</Text>
          {otherLinked.map((item) => (
            <View key={item.id} style={styles.plainRow}>
              <AnimatedPressable
                onPress={() => onOpenSeed(item.id)}
                containerStyle={styles.timelineBody}
                style={styles.linkRow}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`つながっている種を開く。${toSeedSnippet(item)}`}
              >
                <Image source={stageImages[item.growthState]} style={styles.stage} accessibilityIgnoresInvertColors />
                <View style={styles.linkBody}>
                  <Text style={styles.linkText} numberOfLines={2}>
                    {toSeedSnippet(item)}
                  </Text>
                  <Text style={styles.linkMeta}>{formatRelativeDay(item.updatedAt)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textSoft} />
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => onUnlink(item.id)}
                style={styles.unlink}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`つながりを外す。${toSeedSnippet(item, 20)}`}
              >
                <Ionicons name="close-circle-outline" size={22} color={theme.colors.textSoft} />
              </AnimatedPressable>
            </View>
          ))}
        </View>
      ) : null}

      {!hasAnything ? <Text style={styles.empty}>まだつながりはありません。関係がありそうだと感じたメモを、あとから結べます。</Text> : null}

      <View style={styles.actions}>
        <AnimatedPressable
          onPress={onAddMemo}
          containerStyle={styles.actionContainer}
          style={[styles.action, styles.actionPrimary]}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="この種につなげて、新しいメモを足す"
        >
          <Ionicons name="create-outline" size={18} color="#ffffff" />
          <Text style={styles.actionPrimaryText}>メモを足す</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => setPickerOpen(true)}
          containerStyle={styles.actionContainer}
          style={styles.action}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="つなぐ種を探して選ぶ"
        >
          <Ionicons name="link-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.actionText}>保存済みのメモをつなげる</Text>
        </AnimatedPressable>
      </View>

      {suggestions.length > 0 ? (
        <View style={styles.block}>
          <View style={styles.titleRow}>
            <Ionicons name="sparkles-outline" size={16} color={theme.colors.accent} />
            <Text style={styles.label}>つながりそうな種</Text>
          </View>
          {suggestions.map(({ seed: item, reason }) => (
            <View key={item.id} style={styles.suggestion}>
              <AnimatedPressable
                onPress={() => onOpenSeed(item.id)}
                containerStyle={styles.timelineBody}
                style={styles.suggestionBody}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`提案された種を開く。${toSeedSnippet(item)}。${reason}`}
              >
                <Text style={styles.linkText} numberOfLines={2}>
                  {toSeedSnippet(item)}
                </Text>
                <Text style={styles.reason}>{reason}</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => onLink(item.id)}
                style={styles.linkChip}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`この種とつなぐ。${toSeedSnippet(item, 20)}`}
              >
                <Text style={styles.linkChipText}>つなぐ</Text>
              </AnimatedPressable>
            </View>
          ))}
        </View>
      ) : null}

      <SeedPickerModal
        visible={pickerOpen}
        candidates={candidates}
        linkedIds={linkedIds}
        onToggle={handleToggle}
        onClose={() => setPickerOpen(false)}
      />
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
  },
  caption: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSoft,
  },
  block: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  label: {
    fontSize: theme.typography.subbody,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  empty: {
    fontSize: theme.typography.subbody,
    lineHeight: 21,
    color: theme.colors.textMuted,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  rail: {
    width: 14,
    alignItems: 'center',
  },
  railLine: {
    flex: 1,
    width: 2,
    backgroundColor: theme.colors.chipSelectedBorder,
  },
  railHidden: {
    backgroundColor: 'transparent',
  },
  railDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: theme.colors.chipSelectedBorder,
    backgroundColor: theme.colors.surface,
  },
  railDotCurrent: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  timelineBody: {
    flex: 1,
  },
  plainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: theme.spacing.xs,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.rule,
  },
  linkRowCurrent: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.chipSelectedBorder,
  },
  stage: {
    width: 40,
    height: 40,
  },
  linkBody: {
    flex: 1,
    gap: 2,
  },
  linkText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
  },
  linkTextCurrent: {
    fontWeight: '700',
  },
  linkMeta: {
    fontSize: 12,
    color: theme.colors.textSoft,
  },
  unlink: {
    width: 36,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  actionContainer: {
    flex: 1,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.chipSelectedBorder,
  },
  actionPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  actionText: {
    fontSize: theme.typography.subbody,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  actionPrimaryText: {
    fontSize: theme.typography.subbody,
    fontWeight: '700',
    color: '#ffffff',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: theme.spacing.xs,
    paddingLeft: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.chipSelectedBorder,
  },
  suggestionBody: {
    gap: 4,
  },
  reason: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.accent,
  },
  linkChip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.leaf,
  },
  linkChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
  },
});

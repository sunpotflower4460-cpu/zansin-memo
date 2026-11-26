import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { helpTexts } from '../utils/helpTexts';
import { getLinkedSeeds, getThread, suggestLinks } from '../utils/links';
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
  onOpenSeed: (seedId: string) => void;
  onLink: (seedId: string) => void;
  onUnlink: (seedId: string) => void;
  onContinue: () => void;
};

// 種のつながり。同じ話の流れ、つないだ種、つながりそうな種（理由つき）をまとめて見せる。
export function LinksSection({ seed, allSeeds, onOpenSeed, onLink, onUnlink, onContinue }: LinksSectionProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const linked = React.useMemo(() => getLinkedSeeds(seed, allSeeds), [seed, allSeeds]);
  const linkedIds = React.useMemo(() => new Set(linked.map((item) => item.id)), [linked]);
  const thread = React.useMemo(() => getThread(seed, allSeeds), [seed, allSeeds]);
  const threadIds = React.useMemo(() => new Set(thread.map((item) => item.id)), [thread]);
  const otherLinked = linked.filter((item) => !threadIds.has(item.id));
  const suggestions = React.useMemo(() => suggestLinks(seed, allSeeds, 3), [seed, allSeeds]);
  const candidates = React.useMemo(() => allSeeds.filter((item) => item.id !== seed.id), [allSeeds, seed.id]);
  const hasThread = thread.length > 1;
  const hasAnything = hasThread || otherLinked.length > 0;

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
      <Text style={styles.caption}>同じ話の続きや、関係のありそうな種を、つなげておけます。</Text>

      {hasThread ? (
        <View style={styles.block}>
          <Text style={styles.label}>この話のながれ</Text>
          {thread.map((item, index) => {
            const isCurrent = item.id === seed.id;
            const isDirect = linkedIds.has(item.id);
            return (
              <View key={item.id} style={styles.timelineRow}>
                <View style={styles.rail}>
                  <View style={[styles.railLine, index === 0 && styles.railHidden]} />
                  <View style={[styles.railDot, isCurrent && styles.railDotCurrent]} />
                  <View style={[styles.railLine, index === thread.length - 1 && styles.railHidden]} />
                </View>
                <AnimatedPressable
                  onPress={() => (isCurrent ? undefined : onOpenSeed(item.id))}
                  disabled={isCurrent}
                  containerStyle={styles.timelineBody}
                  style={[styles.linkRow, isCurrent && styles.linkRowCurrent]}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={`${isCurrent ? 'いま開いている種。' : '話のながれの種を開く。'}${toSeedSnippet(item)}`}
                >
                  <Image source={stageImages[item.growthState]} style={styles.stage} accessibilityIgnoresInvertColors />
                  <View style={styles.linkBody}>
                    <Text style={[styles.linkText, isCurrent && styles.linkTextCurrent]} numberOfLines={2}>
                      {toSeedSnippet(item)}
                    </Text>
                    <Text style={styles.linkMeta}>{isCurrent ? 'いま見ている種' : formatRelativeDay(item.createdAt)}</Text>
                  </View>
                  {isCurrent ? null : <Ionicons name="chevron-forward" size={16} color={theme.colors.textSoft} />}
                </AnimatedPressable>
                {isDirect ? (
                  <AnimatedPressable
                    onPress={() => onUnlink(item.id)}
                    style={styles.unlink}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel={`つながりを外す。${toSeedSnippet(item, 20)}`}
                  >
                    <Ionicons name="close-circle-outline" size={22} color={theme.colors.textSoft} />
                  </AnimatedPressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

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

      {!hasAnything ? <Text style={styles.empty}>まだつながりはありません。続きを書くか、つなぎたい種を選んでみましょう。</Text> : null}

      <View style={styles.actions}>
        <AnimatedPressable
          onPress={onContinue}
          containerStyle={styles.actionContainer}
          style={[styles.action, styles.actionPrimary]}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="この種の続きを書く"
        >
          <Ionicons name="create-outline" size={18} color="#ffffff" />
          <Text style={styles.actionPrimaryText}>続きを書く</Text>
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
          <Text style={styles.actionText}>種をつなぐ</Text>
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

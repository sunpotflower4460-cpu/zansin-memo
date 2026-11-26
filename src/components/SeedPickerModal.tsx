import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { normalizeSearchText, toSeedSnippet } from '../utils/seedText';
import { formatRelativeDay } from '../utils/seedUtils';
import { AnimatedPressable } from './AnimatedPressable';
import { GrowthBadge } from './GrowthBadge';

type SeedPickerModalProps = {
  visible: boolean;
  /** 自分以外の種。 */
  candidates: Seed[];
  linkedIds: Set<string>;
  onToggle: (seedId: string) => void;
  onClose: () => void;
  /** 画面の見出しと説明（既定は「つなぐ種を選ぶ」）。 */
  title?: string;
  caption?: string;
};

// つなぐ相手を、検索して選ぶ。つないだ種にはチェックが付き、もう一度押すと外れる。
export function SeedPickerModal({
  visible,
  candidates,
  linkedIds,
  onToggle,
  onClose,
  title = 'つなぐ種を選ぶ',
  caption = 'タップでつながり、もう一度タップで外れます。',
}: SeedPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    if (!visible) {
      setQuery('');
    }
  }, [visible]);

  const filtered = React.useMemo(() => {
    const q = normalizeSearchText(query.trim());
    const sorted = [...candidates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (!q) {
      return sorted;
    }
    return sorted.filter((seed) => normalizeSearchText(`${seed.title ?? ''} ${seed.body} ${seed.tags.join(' ')}`).includes(q));
  }, [candidates, query]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <AnimatedPressable
            onPress={onClose}
            style={styles.doneButton}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="選び終わる"
          >
            <Text style={styles.doneText}>完了</Text>
          </AnimatedPressable>
        </View>
        <Text style={styles.caption}>{caption}</Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={theme.colors.textSoft} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            placeholder="言葉で探す"
            placeholderTextColor={theme.colors.placeholder}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            accessibilityLabel="つなぐ種を探す"
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>{candidates.length === 0 ? 'ほかの種がまだありません。' : '見つかる種がありません。'}</Text>
          }
          renderItem={({ item }) => {
            const linked = linkedIds.has(item.id);
            return (
              <AnimatedPressable
                onPress={() => onToggle(item.id)}
                style={[styles.row, linked && styles.rowLinked]}
                haptic="light"
                accessibilityRole="button"
                accessibilityState={{ selected: linked }}
                accessibilityLabel={`${linked ? '選んでいる' : '選んでいない'}。${toSeedSnippet(item)}`}
                accessibilityHint={linked ? 'タップで外します' : 'タップで選びます'}
              >
                <Ionicons
                  name={linked ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={linked ? theme.colors.primary : theme.colors.chipSelectedBorder}
                />
                <View style={styles.rowBody}>
                  <Text style={styles.rowText} numberOfLines={2}>
                    {toSeedSnippet(item, 60)}
                  </Text>
                  <View style={styles.rowMeta}>
                    <GrowthBadge state={item.growthState} />
                    <Text style={styles.rowDate}>{formatRelativeDay(item.updatedAt)}</Text>
                  </View>
                </View>
              </AnimatedPressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: theme.typography.title - 4,
    fontWeight: '700',
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
  },
  doneButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  doneText: {
    fontSize: theme.typography.body,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  caption: {
    fontSize: theme.typography.subbody,
    color: theme.colors.textMuted,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.rule,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    fontSize: 16,
    color: theme.colors.text,
  },
  list: {
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.rule,
  },
  rowLinked: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.chipSelectedBorder,
  },
  rowBody: {
    flex: 1,
    gap: 6,
  },
  rowText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowDate: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  empty: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    paddingVertical: theme.spacing.xl,
  },
});

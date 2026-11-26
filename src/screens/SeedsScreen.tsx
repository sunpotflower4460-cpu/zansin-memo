import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ChipSelector } from '../components/ChipSelector';
import { ConnectPlanModal } from '../components/ConnectPlanModal';
import { EmptyState } from '../components/EmptyState';
import { GrowthBadge } from '../components/GrowthBadge';
import { HelpButton } from '../components/HelpButton';
import { ImportanceDots } from '../components/ImportanceDots';
import { IOSChip } from '../components/IOSChip';
import { LinkCount } from '../components/LinkCount';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import { GROWTH_STATE_OPTIONS, type GrowthState, type Seed, type SeedConnection } from '../domain/types';
import { theme } from '../styles/theme';
import { allLabel, growthStateLabels, sortLabels } from '../utils/displayLabels';
import { helpTexts } from '../utils/helpTexts';
import { findConnection, getLinkCounts } from '../utils/links';
import { buildMatchExcerpt, isLongText, normalizeSearchText, searchableText, toSeedSnippet } from '../utils/seedText';
import { formatDate, formatRelativeDay, matchesTagFilter, resolveTagFilter } from '../utils/seedUtils';

export type SeedsView = 'all' | 'unconnected' | 'connected' | 'sprout';
type SortType = 'updated' | 'importance';

const VIEWS: Array<{ id: SeedsView; label: string; empty: { title: string; description: string } }> = [
  { id: 'all', label: 'すべて', empty: { title: 'ここに思いつきを残していけます。', description: 'ひとことでも、種になります。' } },
  { id: 'unconnected', label: 'まだつないでいない', empty: { title: '今あるメモには、つながりがあります。', description: 'つながりのないメモが増えたら、ここに出ます。' } },
  { id: 'connected', label: 'つながり', empty: { title: '関係がありそうなメモを2つ選ぶと、つなげられます。', description: '「選ぶ」から、メモを2つ選んでください。' } },
  { id: 'sprout', label: '芽', empty: { title: 'できそうなことが見えたら、芽として残せます。', description: '芽は、メモの詳細から書けます。' } },
];

const MAX_RECENTLY_DELETED_SEEDS = 10;

function SeedSeparator() {
  return <View style={styles.separator} />;
}

type SeedsScreenProps = {
  seeds: Seed[];
  connections: SeedConnection[];
  deletedSeeds: Seed[];
  search: string;
  view: SeedsView;
  stateFilter: GrowthState | 'all';
  tagFilter: string | null;
  sortType: SortType;
  /** 複数選択の状態。詳細へ移って戻っても残す。 */
  selecting: boolean;
  selectedIds: string[];
  scrollOffset: number;
  onChangeSearch: (value: string) => void;
  onChangeView: (view: SeedsView) => void;
  onChangeFilter: (value: GrowthState | 'all') => void;
  onChangeTagFilter: (value: string | null) => void;
  onChangeSort: (value: SortType) => void;
  onChangeSelecting: (value: boolean) => void;
  onChangeSelectedIds: (ids: string[]) => void;
  onScrollOffsetChange: (offset: number) => void;
  onRestoreSeed: (seedId: string) => void;
  onOpenSeed: (seedId: string) => void;
  onOpenWrite?: () => void;
  onConnectPair: (aId: string, bId: string) => void;
  onConnectFromCenter: (centerId: string, targetIds: string[]) => void;
  /** 選んだメモから芽をつくる（最初に選んだメモが中心の初期値）。 */
  onStartSynthesis: (selectedIds: string[]) => void;
};

export function SeedsScreen({
  seeds,
  connections,
  deletedSeeds,
  search,
  view,
  stateFilter,
  tagFilter,
  sortType,
  selecting,
  selectedIds,
  scrollOffset,
  onChangeSearch,
  onChangeView,
  onChangeFilter,
  onChangeTagFilter,
  onChangeSort,
  onChangeSelecting,
  onChangeSelectedIds,
  onScrollOffsetChange,
  onRestoreSeed,
  onOpenSeed,
  onOpenWrite,
  onConnectPair,
  onConnectFromCenter,
  onStartSynthesis,
}: SeedsScreenProps) {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const listRef = React.useRef<FlatList<Seed>>(null);
  const restoredRef = React.useRef(false);

  const linkCounts = React.useMemo(() => getLinkCounts(seeds, connections), [seeds, connections]);
  const tagOptions = React.useMemo(
    () => Array.from(new Set(seeds.flatMap((seed) => seed.tags))).sort((a, b) => a.localeCompare(b)),
    [seeds],
  );
  const activeTagFilter = React.useMemo(() => resolveTagFilter(tagFilter, tagOptions), [tagFilter, tagOptions]);
  React.useEffect(() => {
    if (activeTagFilter !== tagFilter) {
      onChangeTagFilter(activeTagFilter);
    }
  }, [activeTagFilter, tagFilter, onChangeTagFilter]);

  // 検索対象の文字列は、メモが変わったときだけ作り直す（入力のたびに全件を作り直さない）。
  const haystacks = React.useMemo(() => new Map(seeds.map((seed) => [seed.id, searchableText(seed)])), [seeds]);
  const deferredSearch = React.useDeferredValue(search);
  const normalizedSearch = normalizeSearchText(deferredSearch.trim());

  const viewCounts = React.useMemo(() => {
    let unconnected = 0;
    let connected = 0;
    let sprout = 0;
    for (const seed of seeds) {
      if ((linkCounts.get(seed.id) ?? 0) > 0) connected += 1;
      else unconnected += 1;
      if (seed.growthState === 'sprout' || seed.growthState === 'tree') sprout += 1;
    }
    return { all: seeds.length, unconnected, connected, sprout } satisfies Record<SeedsView, number>;
  }, [seeds, linkCounts]);

  const filteredSeeds = React.useMemo(
    () =>
      seeds
        .filter((seed) => {
          if (view === 'unconnected' && (linkCounts.get(seed.id) ?? 0) > 0) return false;
          if (view === 'connected' && (linkCounts.get(seed.id) ?? 0) === 0) return false;
          if (view === 'sprout' && seed.growthState !== 'sprout' && seed.growthState !== 'tree') return false;
          if (stateFilter !== 'all' && seed.growthState !== stateFilter) return false;
          if (!matchesTagFilter(seed, activeTagFilter)) return false;
          return !normalizedSearch || (haystacks.get(seed.id) ?? '').includes(normalizedSearch);
        })
        .sort((a, b) =>
          sortType === 'importance'
            ? b.importance - a.importance || b.updatedAt.localeCompare(a.updatedAt)
            : b.updatedAt.localeCompare(a.updatedAt),
        ),
    [seeds, view, stateFilter, activeTagFilter, normalizedSearch, haystacks, sortType, linkCounts],
  );

  const hasActiveFilter = search.trim() !== '' || view !== 'all' || stateFilter !== 'all' || activeTagFilter !== null;
  const resetFilters = () => {
    onChangeSearch('');
    onChangeView('all');
    onChangeFilter('all');
    onChangeTagFilter(null);
  };

  const selectedSeeds = React.useMemo(
    () => selectedIds.map((id) => seeds.find((seed) => seed.id === id)).filter((seed): seed is Seed => Boolean(seed)),
    [selectedIds, seeds],
  );
  const toggleSelected = (id: string) =>
    onChangeSelectedIds(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  const cancelSelecting = () => {
    onChangeSelecting(false);
    onChangeSelectedIds([]);
  };
  const toggleExpanded = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const currentView = VIEWS.find((item) => item.id === view) ?? VIEWS[0];
  const trayVisible = selecting;

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.headingRow}>
        <Text style={styles.heading} accessibilityRole="header">
          種一覧
        </Text>
        <HelpButton content={helpTexts.seeds} />
        <View style={styles.headingSpacer} />
        <AnimatedPressable
          onPress={() => (selecting ? cancelSelecting() : onChangeSelecting(true))}
          style={[styles.selectButton, selecting && styles.selectButtonOn]}
          haptic="light"
          accessibilityRole="button"
          accessibilityState={{ selected: selecting }}
          accessibilityLabel={selecting ? '選ぶのをやめる' : 'メモを選んでつなげる'}
        >
          <Ionicons name={selecting ? 'close' : 'checkmark-circle-outline'} size={18} color={theme.colors.primary} />
          <Text style={styles.selectButtonText}>{selecting ? 'やめる' : '選ぶ'}</Text>
        </AnimatedPressable>
      </View>
      <Text style={styles.subheading}>
        {seeds.length === 0 ? '書いたメモがここに並びます。' : `${seeds.length}件のメモ。検索して、見返したいメモを見つけます。`}
      </Text>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={theme.colors.textSoft} />
        <TextInput
          value={search}
          onChangeText={onChangeSearch}
          style={styles.searchInput}
          placeholder="本文・タイトル・カテゴリ・芽で検索"
          placeholderTextColor={theme.colors.placeholder}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          accessibilityLabel="メモの検索"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityLabel="見かたを選ぶ">
        {VIEWS.map((item) => (
          <IOSChip
            key={item.id}
            label={`${item.label} ${viewCounts[item.id]}`}
            accessibilityLabel={`${item.label}、${viewCounts[item.id]}件`}
            selected={view === item.id}
            onPress={() => onChangeView(item.id)}
          />
        ))}
      </ScrollView>
      {view === 'unconnected' ? <Text style={styles.viewHint}>つながりがないのは、悪いことではありません。気が向いたときに結べます。</Text> : null}

      <AnimatedPressable
        onPress={() => setMoreOpen((value) => !value)}
        style={styles.moreToggle}
        haptic="light"
        accessibilityRole="button"
        accessibilityState={{ expanded: moreOpen }}
        accessibilityLabel="育ち方・カテゴリ・並び替え"
      >
        <Ionicons name="options-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.moreToggleTitle}>育ち方・カテゴリ・並び替え</Text>
        <Text style={styles.moreToggleSummary} numberOfLines={1}>
          {stateFilter === 'all' ? 'すべて' : growthStateLabels[stateFilter]}・{activeTagFilter ?? 'すべて'}・{sortLabels[sortType]}順
        </Text>
        <Ionicons name={moreOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={16} color={theme.colors.textMuted} />
      </AnimatedPressable>
      {moreOpen ? (
        <SectionCard muted>
          <Text style={styles.label}>育ち方</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            <IOSChip label={allLabel} selected={stateFilter === 'all'} onPress={() => onChangeFilter('all')} />
            {GROWTH_STATE_OPTIONS.map((state) => (
              <IOSChip key={state} label={growthStateLabels[state]} selected={stateFilter === state} onPress={() => onChangeFilter(state)} />
            ))}
          </ScrollView>
          <Text style={styles.label}>カテゴリ</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            <IOSChip label={allLabel} selected={activeTagFilter === null} onPress={() => onChangeTagFilter(null)} />
            {tagOptions.map((tag) => (
              <IOSChip key={tag} label={tag} selected={activeTagFilter === tag} onPress={() => onChangeTagFilter(tag)} />
            ))}
          </ScrollView>
          {tagOptions.length === 0 ? <Text style={styles.viewHint}>カテゴリは任意です。付けておくと、ここで絞り込めます。</Text> : null}
          <ChipSelector<SortType>
            label="並び替え"
            options={['updated', 'importance']}
            selectedValue={sortType}
            onChange={(value) => onChangeSort(value ?? 'updated')}
            getLabel={(value) => sortLabels[value]}
          />
        </SectionCard>
      ) : null}

      {hasActiveFilter ? (
        <View style={styles.resultRow}>
          <Text style={styles.resultText} accessibilityLiveRegion="polite">
            {filteredSeeds.length}件が見つかりました（全{seeds.length}件）
          </Text>
          <AnimatedPressable onPress={resetFilters} style={styles.resetButton} haptic="light" accessibilityRole="button" accessibilityLabel="検索と絞り込みをすべて解除する">
            <Text style={styles.resetText}>条件を解除</Text>
          </AnimatedPressable>
        </View>
      ) : null}
    </View>
  );

  const listFooter = (
    <View style={styles.listFooter}>
      <SectionCard muted>
        <Text style={styles.label}>最近削除した種</Text>
        {deletedSeeds.length === 0 ? (
          <Text style={styles.deletedHint}>削除したメモはまだありません。</Text>
        ) : (
          <View style={styles.deletedList}>
            {deletedSeeds.slice(0, MAX_RECENTLY_DELETED_SEEDS).map((seed) => (
              <View key={seed.id} style={styles.deletedItem}>
                <Text numberOfLines={2} style={styles.deletedBody}>
                  {seed.body}
                </Text>
                <View style={styles.deletedMetaWrap}>
                  <Text style={styles.deletedMeta}>削除: {seed.deletedAt ? formatDate(seed.deletedAt) : '日時不明'}</Text>
                  <IOSChip label="復元する" onPress={() => onRestoreSeed(seed.id)} />
                </View>
              </View>
            ))}
          </View>
        )}
      </SectionCard>
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        data={filteredSeeds}
        keyExtractor={(item) => item.id}
        extraData={`${selectedIds.join(',')}|${[...expanded].join(',')}|${selecting}`}
        contentContainerStyle={[styles.content, trayVisible && styles.contentWithTray]}
        contentOffset={{ x: 0, y: scrollOffset }}
        onScroll={(event) => onScrollOffsetChange(event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={120}
        onContentSizeChange={() => {
          // 詳細から戻ったとき、前の位置へ戻す（iOS以外でも効くよう、最初の一度だけ明示的に動かす）。
          if (!restoredRef.current && scrollOffset > 0) {
            restoredRef.current = true;
            listRef.current?.scrollToOffset({ offset: scrollOffset, animated: false });
          }
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        windowSize={9}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          seeds.length === 0 ? (
            <EmptyState
              icon="leaf-outline"
              title="まだメモはありません"
              description="ひとことだけ、置いてみましょう。書いたメモはここに並びます。"
              actionLabel={onOpenWrite ? 'メモを書く' : undefined}
              onAction={onOpenWrite}
            />
          ) : hasActiveFilter && view === 'all' ? (
            <EmptyState
              icon="search-outline"
              title="条件に合うメモはありません"
              description="検索や絞り込みを、少しゆるめてみてください。"
              actionLabel="条件を解除"
              onAction={resetFilters}
            />
          ) : (
            <EmptyState icon="leaf-outline" title={currentView.empty.title} description={currentView.empty.description} />
          )
        }
        ItemSeparatorComponent={SeedSeparator}
        ListFooterComponent={listFooter}
        renderItem={({ item: seed }) => {
          const picked = selectedIds.includes(seed.id);
          const order = selectedIds.indexOf(seed.id) + 1;
          const isExpanded = expanded.has(seed.id);
          const excerpt = normalizedSearch ? buildMatchExcerpt(seed, normalizedSearch) : undefined;
          const long = isLongText(seed.body, 90);
          return (
            <View style={[styles.seedCard, picked && styles.seedCardPicked]}>
              <AnimatedPressable
                onPress={() => (selecting ? toggleSelected(seed.id) : onOpenSeed(seed.id))}
                style={styles.seedCardMain}
                pressedStyle={styles.seedCardPressed}
                haptic="light"
                accessibilityRole="button"
                accessibilityState={selecting ? { selected: picked } : undefined}
                accessibilityLabel={`${selecting ? (picked ? `選択中、${order}番目。` : '選んでいません。') : 'メモを開く。'}${seed.title ? `${seed.title}。` : ''}${toSeedSnippet(seed, 40)}。${formatRelativeDay(seed.updatedAt)}。つながり${linkCounts.get(seed.id) ?? 0}件`}
              >
                <View style={styles.cardTop}>
                  {selecting ? (
                    <View style={styles.pickMark}>
                      <Ionicons name={picked ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={picked ? theme.colors.primary : theme.colors.chipSelectedBorder} />
                      <Text style={styles.pickLabel}>{picked ? `選択中 ${order}` : '選ぶ'}</Text>
                    </View>
                  ) : null}
                  <View style={styles.cardBody}>
                    {seed.title ? <Text style={styles.title}>{seed.title}</Text> : null}
                    <Text numberOfLines={isExpanded ? undefined : 3} style={styles.body}>
                      {seed.body}
                    </Text>
                    {seed.synthesis && (seed.growthState === 'sprout' || seed.growthState === 'tree') ? (
                      <Text style={styles.sprout} numberOfLines={isExpanded ? undefined : 2}>
                        芽: {seed.synthesis.statement}
                      </Text>
                    ) : null}
                    {excerpt && excerpt.field !== 'body' ? (
                      <Text style={styles.match} numberOfLines={2}>
                        一致: {excerpt.field === 'synthesis' ? '芽の文' : excerpt.field === 'tag' ? 'カテゴリ' : '題名'}「{excerpt.text}」
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.metaRow}>
                  <GrowthBadge state={seed.growthState} />
                  <Text style={styles.meta}>{formatRelativeDay(seed.updatedAt)}</Text>
                  <LinkCount count={linkCounts.get(seed.id) ?? 0} />
                  <View style={styles.metaSpacer} />
                  <ImportanceDots value={seed.importance} />
                  {selecting ? null : <Ionicons name="chevron-forward" size={16} color={theme.colors.textSoft} />}
                </View>
                {seed.tags.length > 0 ? (
                  <View style={styles.tagRow}>
                    {seed.tags.map((tag) => (
                      <Text key={tag} style={styles.tagPill}>
                        {tag}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </AnimatedPressable>
              {long || seed.synthesis ? (
                <AnimatedPressable
                  onPress={() => toggleExpanded(seed.id)}
                  style={styles.expandButton}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={`${isExpanded ? '短くする' : '全文を読む'}。${toSeedSnippet(seed, 20)}`}
                >
                  <Text style={styles.expandText}>{isExpanded ? '全文を閉じる' : '全文を読む'}</Text>
                </AnimatedPressable>
              ) : null}
            </View>
          );
        }}
      />

      {trayVisible ? (
        <View style={styles.tray} accessibilityViewIsModal={false}>
          <Text style={styles.trayTitle} accessibilityLiveRegion="polite">
            選んだメモ {selectedSeeds.length}件
          </Text>
          {selectedSeeds.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trayChips}>
              {selectedSeeds.map((seed, index) => (
                <AnimatedPressable
                  key={seed.id}
                  onPress={() => toggleSelected(seed.id)}
                  style={styles.trayChip}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={`選択を外す。${index + 1}番目。${toSeedSnippet(seed, 20)}`}
                >
                  <Text style={styles.trayChipText} numberOfLines={1}>
                    {index + 1}. {toSeedSnippet(seed, 12)}
                  </Text>
                  <Ionicons name="close" size={14} color={theme.colors.textMuted} />
                </AnimatedPressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.trayHint}>つなげたいメモを選んでください。検索や見かたの切り替えをしても、選択は残ります。</Text>
          )}
          {selectedSeeds.length === 1 ? <Text style={styles.trayHint}>もう1つ選ぶと、つなげられます。</Text> : null}
          {selectedSeeds.length === 2 ? (
            findConnection(connections, selectedSeeds[0].id, selectedSeeds[1].id) ? (
              <PrimaryButton
                label="つながっています。開いて見る"
                onPress={() => {
                  const first = selectedSeeds[0].id;
                  cancelSelecting();
                  onOpenSeed(first);
                }}
              />
            ) : (
              <PrimaryButton
                label="2つをつなげる"
                accessibilityHint="選んだ2つのメモの間に線を引きます。メモの内容は変わりません。"
                onPress={() => {
                  const [a, b] = selectedSeeds;
                  onConnectPair(a.id, b.id);
                }}
              />
            )
          ) : null}
          {selectedSeeds.length >= 3 ? <PrimaryButton label="つなぎ方を選ぶ" onPress={() => setPlanOpen(true)} /> : null}
          {selectedSeeds.length >= 1 ? (
            <AnimatedPressable
              onPress={() => {
                const ids = selectedSeeds.map((seed) => seed.id);
                cancelSelecting();
                onStartSynthesis(ids);
              }}
              style={styles.synthesisButton}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={`選んだメモから芽をつくる。最初に選んだメモに芽が残ります。${toSeedSnippet(selectedSeeds[0], 20)}`}
            >
              <Ionicons name="leaf-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.synthesisButtonText}>ここから芽をつくる（最初に選んだメモに残ります）</Text>
            </AnimatedPressable>
          ) : null}
        </View>
      ) : null}

      <ConnectPlanModal
        visible={planOpen}
        selected={selectedSeeds}
        connections={connections}
        onClose={() => setPlanOpen(false)}
        onConfirm={(centerId, targetIds) => {
          setPlanOpen(false);
          onConnectFromCenter(centerId, targetIds);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.lg, paddingBottom: 124 },
  contentWithTray: { paddingBottom: 260 },
  listHeader: { gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  listFooter: { marginTop: theme.spacing.md },
  separator: { height: theme.spacing.sm },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headingSpacer: { flex: 1 },
  heading: { fontSize: theme.typography.title, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  subheading: { color: theme.colors.textMuted, lineHeight: 22 },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.chipSelectedBorder,
  },
  selectButtonOn: { backgroundColor: theme.colors.leaf },
  selectButtonText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  searchWrap: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    minHeight: 46,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...theme.shadows.card,
  },
  searchInput: { flex: 1, fontSize: 16, color: theme.colors.text, minHeight: 46 },
  label: { color: theme.colors.textMuted, fontSize: theme.typography.subbody },
  row: { gap: 8, paddingRight: 16 },
  viewHint: { fontSize: 13, lineHeight: 19, color: theme.colors.textSoft },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.rule,
  },
  moreToggleTitle: { fontSize: theme.typography.subbody, fontWeight: '700', color: theme.colors.text },
  moreToggleSummary: { flex: 1, textAlign: 'right', fontSize: 13, color: theme.colors.textMuted },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultText: { flex: 1, fontSize: theme.typography.subbody, color: theme.colors.textMuted },
  resetButton: { minHeight: 44, justifyContent: 'center' },
  resetText: { fontSize: theme.typography.subbody, fontWeight: '700', color: theme.colors.primary },
  deletedList: { gap: 10 },
  deletedItem: { borderTopWidth: 1, borderTopColor: theme.colors.rule, paddingTop: 10, gap: 8 },
  deletedBody: { fontSize: 14, color: theme.colors.textMuted, lineHeight: 20 },
  deletedMetaWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  deletedMeta: { flex: 1, fontSize: 13, color: theme.colors.textSoft, lineHeight: 18 },
  deletedHint: { fontSize: 13, color: theme.colors.textMuted },
  seedCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.rule,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  seedCardPicked: { borderColor: theme.colors.primary, borderWidth: 2, backgroundColor: theme.colors.primarySoft },
  seedCardMain: { padding: theme.spacing.sm, gap: 7 },
  seedCardPressed: { backgroundColor: theme.colors.surfaceSoft },
  cardTop: { flexDirection: 'row', gap: 10 },
  cardBody: { flex: 1, gap: 6 },
  pickMark: { alignItems: 'center', width: 52, gap: 2 },
  pickLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },
  title: { fontSize: 15, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  body: { fontFamily: theme.fonts.serif, fontSize: 16, color: theme.colors.text, lineHeight: 23 },
  sprout: { fontSize: 14, lineHeight: 20, color: theme.colors.primary, fontWeight: '600' },
  match: { fontSize: 13, lineHeight: 19, color: theme.colors.accent },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { fontSize: 13, color: theme.colors.textMuted },
  metaSpacer: { flex: 1 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagPill: {
    fontSize: 12,
    color: theme.colors.textMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
  },
  expandButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.rule },
  expandText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  tray: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    ...theme.shadows.floating,
  },
  trayTitle: { fontSize: theme.typography.body, fontWeight: '700', color: theme.colors.text },
  trayChips: { gap: 8 },
  trayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    maxWidth: 200,
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.chipBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  trayChipText: { fontSize: 13, color: theme.colors.text, flexShrink: 1 },
  synthesisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.chipSelectedBorder,
  },
  synthesisButtonText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary, flexShrink: 1, textAlign: 'center' },
  trayHint: { fontSize: 13, lineHeight: 19, color: theme.colors.textMuted },
});

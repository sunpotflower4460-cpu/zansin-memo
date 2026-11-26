import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Seed, SeedConnection } from '../domain/types';
import { theme } from '../styles/theme';
import { helpTexts } from '../utils/helpTexts';
import { buildAdjacency, findConnection, suggestLinks } from '../utils/links';
import { normalizeSearchText, toSeedSnippet } from '../utils/seedText';
import { formatRelativeDay } from '../utils/seedUtils';
import { stageImages } from '../utils/stageImages';
import { AnimatedPressable } from './AnimatedPressable';
import { HelpButton } from './HelpButton';
import { LocalMap, MAP_NEIGHBOR_LIMIT } from './LocalMap';
import { SectionCard } from './SectionCard';
import { SeedPickerModal } from './SeedPickerModal';

export type ConnectionsViewMode = 'map' | 'list';

type ConnectionsPanelProps = {
  center: Seed;
  /** 削除されていないメモ全体。 */
  seeds: Seed[];
  /** 両端が削除されていないつながり。 */
  connections: SeedConnection[];
  viewMode: ConnectionsViewMode;
  onChangeViewMode: (mode: ConnectionsViewMode) => void;
  onOpenSeed: (seedId: string) => void;
  onLink: (otherId: string) => void;
  onUnlink: (otherId: string) => void;
  /** false を返したら保存できていないので、入力欄を閉じない。 */
  onSetNote: (otherId: string, note: string) => void | Promise<boolean>;
  onAddMemo: () => void;
  /** 練習など、「メモを足す」を出せない場面で隠す。 */
  hideAddMemo?: boolean;
  /** 「今回は見送る」にした候補のペア。候補から外す（手動の検索・接続は妨げない）。 */
  dismissed?: Set<string>;
  onDismissSuggestion?: (otherId: string) => void;
  /** 見送った候補を、このメモについて元に戻す。 */
  onRestoreDismissed?: () => void;
  dismissedCount?: number;
};

const LIST_PAGE = 20;

/** 今回つないだ相手を先に、旧データ（日時なし）は後ろに。 */
const orderNeighbors = (neighbors: Seed[], center: Seed, connections: SeedConnection[]): Seed[] =>
  [...neighbors].sort((a, b) => {
    const ca = findConnection(connections, center.id, a.id)?.createdAt ?? '';
    const cb = findConnection(connections, center.id, b.id)?.createdAt ?? '';
    return cb.localeCompare(ca) || b.updatedAt.localeCompare(a.updatedAt);
  });

export function ConnectionsPanel({
  center,
  seeds,
  connections,
  viewMode,
  onChangeViewMode,
  onOpenSeed,
  onLink,
  onUnlink,
  onSetNote,
  onAddMemo,
  hideAddMemo,
  dismissed,
  onDismissSuggestion,
  onRestoreDismissed,
  dismissedCount = 0,
}: ConnectionsPanelProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | undefined>();
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [noteEditing, setNoteEditing] = React.useState<string | undefined>();
  const [noteText, setNoteText] = React.useState('');
  const [listQuery, setListQuery] = React.useState('');
  const [listLimit, setListLimit] = React.useState(LIST_PAGE);
  const [suggestionsOpen, setSuggestionsOpen] = React.useState(false);
  /** マップのメモは、もう一度押すと選択を外す。 */
  const toggleSelectedNode = (id: string) => setSelectedId((current) => (current === id ? undefined : id));

  const index = React.useMemo(() => new Map(seeds.map((seed) => [seed.id, seed])), [seeds]);
  const neighbors = React.useMemo(() => {
    const ids = buildAdjacency(seeds, connections).get(center.id) ?? new Set<string>();
    const found = Array.from(ids)
      .map((id) => index.get(id))
      .filter((seed): seed is Seed => Boolean(seed));
    return orderNeighbors(found, center, connections);
  }, [seeds, connections, center, index]);
  const neighborIds = React.useMemo(() => new Set(neighbors.map((seed) => seed.id)), [neighbors]);
  const candidates = React.useMemo(() => seeds.filter((seed) => seed.id !== center.id), [seeds, center.id]);
  const suggestions = React.useMemo(() => suggestLinks(center, seeds, connections, { limit: 3, dismissed }), [center, seeds, connections, dismissed]);

  const mapNeighbors = neighbors.slice(0, MAP_NEIGHBOR_LIMIT);
  const hiddenCount = neighbors.length - mapNeighbors.length;
  const selected = selectedId && neighborIds.has(selectedId) ? index.get(selectedId) : undefined;

  const filteredList = React.useMemo(() => {
    const q = normalizeSearchText(listQuery.trim());
    return q ? neighbors.filter((seed) => normalizeSearchText(`${seed.title ?? ''} ${seed.body} ${seed.tags.join(' ')}`).includes(q)) : neighbors;
  }, [neighbors, listQuery]);

  const toggleExpanded = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const startNote = (otherId: string) => {
    setNoteEditing(otherId);
    setNoteText(findConnection(connections, center.id, otherId)?.note ?? '');
  };

  const renderNeighbor = (seed: Seed, withFullText: boolean) => {
    const connection = findConnection(connections, center.id, seed.id);
    const isExpanded = expanded.has(seed.id);
    return (
      <View key={seed.id} style={styles.row}>
        <View style={styles.rowTop}>
          <Image source={stageImages[seed.growthState]} style={styles.stage} accessibilityIgnoresInvertColors />
          <View style={styles.rowBody}>
            <Text style={styles.rowText} numberOfLines={withFullText && isExpanded ? undefined : 3}>
              {withFullText && isExpanded ? seed.body : toSeedSnippet(seed, 90)}
            </Text>
            <Text style={styles.rowMeta}>
              {formatRelativeDay(seed.updatedAt)}
              {connection?.origin === 'legacy' ? ' ・ 以前からのつながり' : ''}
            </Text>
          </View>
        </View>

        {connection?.note && noteEditing !== seed.id ? <Text style={styles.note}>つながる理由: {connection.note}</Text> : null}

        {noteEditing === seed.id ? (
          <View style={styles.noteEditor}>
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              style={styles.noteInput}
              multiline
              placeholder="共通点でも、違いや疑問でも。空でもかまいません。"
              placeholderTextColor={theme.colors.placeholder}
              accessibilityLabel="どうつながる？"
            />
            <View style={styles.rowActions}>
              <SmallButton
                label="保存"
                primary
                onPress={() => {
                  void Promise.resolve(onSetNote(seed.id, noteText)).then((ok) => {
                    if (ok !== false) setNoteEditing((current) => (current === seed.id ? undefined : current));
                  });
                }}
              />
              <SmallButton label="やめる" onPress={() => setNoteEditing(undefined)} />
            </View>
          </View>
        ) : null}

        <View style={styles.rowActions}>
          <SmallButton label="このメモを開く" primary onPress={() => onOpenSeed(seed.id)} accessibilityLabel={`このメモを開く。${toSeedSnippet(seed, 20)}`} />
          {withFullText ? <SmallButton label={isExpanded ? '閉じる' : '全文'} onPress={() => toggleExpanded(seed.id)} accessibilityLabel={`${isExpanded ? '短くする' : '全文を読む'}。${toSeedSnippet(seed, 20)}`} /> : null}
          <SmallButton label={connection?.note ? '理由を直す' : '理由を書く'} onPress={() => startNote(seed.id)} accessibilityLabel={`つながる理由を書く。${toSeedSnippet(seed, 20)}`} />
          <SmallButton label="つながりを外す" onPress={() => onUnlink(seed.id)} accessibilityLabel={`つながりを外す。メモは両方残ります。${toSeedSnippet(seed, 20)}`} />
        </View>
      </View>
    );
  };

  return (
    <SectionCard muted>
      <View style={styles.titleRow}>
        <Ionicons name="git-network-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.title} accessibilityRole="header">
          つながり{neighbors.length > 0 ? ` ${neighbors.length}件` : ''}
        </Text>
        <HelpButton content={helpTexts.links} />
      </View>

      {neighbors.length === 0 ? (
        <Text style={styles.empty}>関係がありそうなメモを、つなげられます。</Text>
      ) : (
        <>
          <View style={styles.segment} accessibilityRole="tablist">
            {(['map', 'list'] as const).map((mode) => (
              <AnimatedPressable
                key={mode}
                onPress={() => onChangeViewMode(mode)}
                containerStyle={styles.segmentContainer}
                style={[styles.segmentItem, viewMode === mode && styles.segmentItemOn]}
                haptic="light"
                accessibilityRole="tab"
                accessibilityState={{ selected: viewMode === mode }}
                accessibilityLabel={mode === 'map' ? 'マップで見る' : 'リストで見る'}
              >
                <Text style={[styles.segmentText, viewMode === mode && styles.segmentTextOn]}>{mode === 'map' ? 'マップ' : 'リスト'}</Text>
              </AnimatedPressable>
            ))}
          </View>
          {viewMode === 'map' ? (
            <>
              <View accessible={false}>
                <LocalMap center={center} neighbors={mapNeighbors} selectedId={selected?.id} onSelect={toggleSelectedNode} />
              </View>
              {hiddenCount > 0 ? (
                <AnimatedPressable
                  onPress={() => onChangeViewMode('list')}
                  style={styles.moreRow}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={`ほか${hiddenCount}件はリストで見られます`}
                >
                  <Text style={styles.moreText}>ほか{hiddenCount}件は、リストで見られます</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
                </AnimatedPressable>
              ) : null}
              {selected ? (
                <View style={styles.preview}>
                  <AnimatedPressable
                    onPress={() => setSelectedId(undefined)}
                    style={styles.closePreview}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel="選択を解除して閉じる"
                  >
                    <Ionicons name="close" size={16} color={theme.colors.textMuted} />
                    <Text style={styles.closePreviewText}>選択を解除</Text>
                  </AnimatedPressable>
                  {renderNeighbor(selected, true)}
                </View>
              ) : (
                <Text style={styles.hint}>タップすると中身が読めます。</Text>
              )}
            </>
          ) : (
            <>
              {neighbors.length > LIST_PAGE || listQuery ? (
                <TextInput
                  value={listQuery}
                  onChangeText={(text) => {
                    setListQuery(text);
                    setListLimit(LIST_PAGE);
                  }}
                  style={styles.search}
                  placeholder="つながっているメモから探す"
                  placeholderTextColor={theme.colors.placeholder}
                  accessibilityLabel="つながっているメモから探す"
                />
              ) : null}
              {filteredList.slice(0, listLimit).map((seed) => renderNeighbor(seed, true))}
              {filteredList.length > listLimit ? (
                <AnimatedPressable
                  onPress={() => setListLimit((value) => value + LIST_PAGE)}
                  style={styles.moreRow}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={`さらに${Math.min(LIST_PAGE, filteredList.length - listLimit)}件を表示。残り${filteredList.length - listLimit}件`}
                >
                  <Text style={styles.moreText}>さらに表示（残り{filteredList.length - listLimit}件）</Text>
                </AnimatedPressable>
              ) : null}
              {filteredList.length === 0 ? <Text style={styles.empty}>見つかるメモがありません。</Text> : null}
            </>
          )}
        </>
      )}

      <View style={styles.actions}>
        {hideAddMemo ? null : (
        <AnimatedPressable
          onPress={onAddMemo}
          containerStyle={styles.actionContainer}
          style={styles.action}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="書いてつなぐ。新しいメモを足します"
        >
          <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.actionText}>書いてつなぐ</Text>
        </AnimatedPressable>
        )}
        <AnimatedPressable
          onPress={() => setPickerOpen(true)}
          containerStyle={styles.actionContainer}
          style={styles.action}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="選んでつなぐ。保存したメモから探します"
        >
          <Ionicons name="link-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.actionText}>選んでつなぐ</Text>
        </AnimatedPressable>
      </View>

      {suggestions.length > 0 || dismissedCount > 0 ? (
        <View style={styles.block}>
          <AnimatedPressable
            onPress={() => setSuggestionsOpen((value) => !value)}
            style={styles.suggestionToggle}
            haptic="light"
            accessibilityRole="button"
            accessibilityState={{ expanded: suggestionsOpen }}
            accessibilityLabel={`つながるかもしれないメモ。${suggestions.length}件。開閉`}
          >
            <Ionicons name="sparkles-outline" size={16} color={theme.colors.accent} />
            <Text style={styles.label}>つながるかもしれないメモ（{suggestions.length}）</Text>
            <Ionicons name={suggestionsOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={16} color={theme.colors.textMuted} />
          </AnimatedPressable>
          {suggestionsOpen ? (
            <>
          {suggestions.length === 0 ? <Text style={styles.hint}>今は候補がありません。</Text> : null}
          {suggestions.map(({ seed: item, reason }) => (
            <View key={item.id} style={styles.suggestion}>
              <View style={styles.suggestionBody}>
                <Text style={styles.rowText} numberOfLines={2}>
                  {toSeedSnippet(item)}
                </Text>
                <Text style={styles.reason}>{reason}</Text>
              </View>
              <View style={styles.suggestionActions}>
                <AnimatedPressable
                  onPress={() => onLink(item.id)}
                  style={styles.linkChip}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={`この候補とつなぐ。${toSeedSnippet(item, 20)}。${reason}`}
                >
                  <Text style={styles.linkChipText}>つなぐ</Text>
                </AnimatedPressable>
                {onDismissSuggestion ? (
                  <AnimatedPressable
                    onPress={() => onDismissSuggestion(item.id)}
                    style={styles.skipChip}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel={`今回は見送る。${toSeedSnippet(item, 20)}。同じ組合せは、もう出しません`}
                  >
                    <Text style={styles.skipChipText}>今回は見送る</Text>
                  </AnimatedPressable>
                ) : null}
              </View>
            </View>
          ))}
          {dismissedCount > 0 && onRestoreDismissed ? (
            <AnimatedPressable
              onPress={onRestoreDismissed}
              style={styles.moreRow}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={`見送った候補を戻す。${dismissedCount}件`}
            >
              <Text style={styles.moreText}>見送った候補を戻す（{dismissedCount}件）</Text>
            </AnimatedPressable>
          ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      <SeedPickerModal
        visible={pickerOpen}
        candidates={candidates}
        linkedIds={neighborIds}
        onToggle={(otherId) => (neighborIds.has(otherId) ? onUnlink(otherId) : onLink(otherId))}
        onClose={() => setPickerOpen(false)}
      />
    </SectionCard>
  );
}

function SmallButton({
  label,
  onPress,
  primary,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={[styles.small, primary && styles.smallPrimary]}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={[styles.smallText, primary && styles.smallTextPrimary]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  suggestionToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  closePreview: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 12, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  closePreviewText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  empty: { fontSize: theme.typography.subbody, lineHeight: 21, color: theme.colors.textMuted },
  hint: { fontSize: 13, lineHeight: 19, color: theme.colors.textSoft },
  segment: {
    flexDirection: 'row',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.chipBg,
    padding: 3,
    gap: 3,
  },
  segmentContainer: { flex: 1 },
  segmentItem: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.full },
  segmentItemOn: { backgroundColor: theme.colors.surface, ...theme.shadows.card },
  segmentText: { fontSize: theme.typography.subbody, color: theme.colors.textMuted, fontWeight: '600' },
  segmentTextOn: { color: theme.colors.primary, fontWeight: '700' },
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44 },
  moreText: { fontSize: theme.typography.subbody, fontWeight: '700', color: theme.colors.primary },
  preview: { gap: theme.spacing.xs },
  row: {
    gap: 8,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.rule,
  },
  rowTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  rowBody: { flex: 1, gap: 4 },
  rowText: { fontSize: 14, lineHeight: 21, fontFamily: theme.fonts.serif, color: theme.colors.text },
  rowMeta: { fontSize: 12, color: theme.colors.textSoft },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stage: { width: 36, height: 36 },
  note: { fontSize: 13, lineHeight: 19, color: theme.colors.accent },
  noteEditor: { gap: 6 },
  noteInput: {
    minHeight: 60,
    borderRadius: theme.radius.sm,
    padding: 10,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    textAlignVertical: 'top',
  },
  search: {
    minHeight: 44,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  small: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.chipBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  smallPrimary: { backgroundColor: theme.colors.leaf, borderColor: theme.colors.chipSelectedBorder },
  smallText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  smallTextPrimary: { color: theme.colors.primary, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  actionContainer: { flex: 1 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.chipSelectedBorder,
  },
  actionText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary, flexShrink: 1, textAlign: 'center' },
  block: { gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  label: { flex: 1, fontSize: theme.typography.subbody, fontWeight: '700', color: theme.colors.textMuted },
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
  suggestionBody: { flex: 1, gap: 4 },
  reason: { fontSize: 12, lineHeight: 17, color: theme.colors.accent },
  suggestionActions: { gap: 6, alignItems: 'stretch' },
  skipChip: { minHeight: 40, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  skipChipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  linkChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: theme.radius.full, backgroundColor: theme.colors.leaf },
  linkChipText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
});

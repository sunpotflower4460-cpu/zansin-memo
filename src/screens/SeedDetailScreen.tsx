import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ChipSelector } from '../components/ChipSelector';
import { ConnectionsPanel, type ConnectionsViewMode } from '../components/ConnectionsPanel';
import { FadeInView } from '../components/FadeInView';
import { HelpButton } from '../components/HelpButton';
import { ImportanceDots } from '../components/ImportanceDots';
import { IOSChip } from '../components/IOSChip';
import { PrimaryButton } from '../components/PrimaryButton';
import { SynthesisCard } from '../components/SynthesisCard';
import { SectionCard } from '../components/SectionCard';
import {
  IMPORTANCE_OPTIONS,
  MOOD_OPTIONS,
  TRANSFORM_TYPES,
  type Draft,
  type Importance,
  type Mood,
  type Seed,
  type SeedConnection,
  type SeedUpdateInput,
  type TransformOutput,
  type TransformType,
} from '../domain/types';
import { theme } from '../styles/theme';
import { showConfirm } from '../utils/confirm';
import { triggerLightFeedback } from '../utils/feedback';
import { moodLabels, transformLabels } from '../utils/displayLabels';
import { helpTexts } from '../utils/helpTexts';
import { createId } from '../utils/ids';
import { toSeedSnippet } from '../utils/seedText';
import { formatDate, formatRelativeDay, parseTags } from '../utils/seedUtils';

type SeedDetailScreenProps = {
  seed: Seed;
  /** 削除されていないメモ全体。 */
  allSeeds: Seed[];
  /** 削除済みのメモ。芽の材料が削除されたことを伝えるためだけに使う。 */
  deletedSeeds: Seed[];
  connections: SeedConnection[];
  onBack: () => void;
  /** 戻り先の名前（例: 種一覧）。 */
  backLabel: string;
  /** これまでに中心にして見てきたメモ（古い順）。現在のメモは含まない。 */
  trail: Seed[];
  onBackOneCenter: () => void;
  onBackToFirst: () => void;
  connectionsViewMode: ConnectionsViewMode;
  onChangeConnectionsViewMode: (mode: ConnectionsViewMode) => void;
  /** 保存済みの編集中の下書き。あれば編集の続きから再開する。 */
  editDraft?: Draft;
  onEditDraftChange: (draft: Draft | null, draftId: string) => void;
  /** 下書きを書き込む。端末に保存できなければ false。 */
  onFlushDrafts: () => Promise<boolean>;
  onNotify: (message: string) => void;
  /** 保存の確定を待って true。失敗・衝突時は false（入力は残す）。 */
  onSave: (seedId: string, payload: SeedUpdateInput, expectedUpdatedAt: string, draftId: string) => Promise<boolean>;
  onDelete: (seedId: string) => void;
  onOpenSeed: (seedId: string) => void;
  onLinkSeeds: (seedId: string, otherId: string) => void;
  onUnlinkSeeds: (seedId: string, otherId: string) => void;
  onSetConnectionNote: (seedId: string, otherId: string, note: string) => Promise<boolean>;
  onAddMemo: (seedId: string) => void;
  onCreateTransform: (seedId: string, type: TransformType) => void;
  /** 芽の入口。mode: new=ここから芽をつくる／review=芽を見直す（考え直し中の再採用を含む）。 */
  onOpenSynthesis: (seedId: string, mode: 'new' | 'review') => void;
  onReconsiderSynthesis: (seedId: string) => void;
  /** 書きかけの芽の文。 */
  synthesisDraftText?: string;
  onBloom: (seedId: string, note: string) => Promise<boolean>;
  onReturnToSprout: (seedId: string) => void;
  onSetArchived: (seedId: string, archived: boolean) => void;
  dismissedSuggestions: Set<string>;
  dismissedCount: number;
  onDismissSuggestion: (seedId: string, otherId: string) => void;
  onRestoreDismissed: (seedId: string) => void;
};

type DraftState = {
  title: string;
  body: string;
  tags: string;
  mood?: Mood;
  importance: Importance;
};

const toDraft = (seed: Seed): DraftState => ({
  title: seed.title ?? '',
  body: seed.body,
  tags: seed.tags.join(', '),
  mood: seed.mood,
  importance: seed.importance,
});

// 保存済みの内容と見比べて、まだ保存していない変更があるかを返す（書式の違い、例えばカテゴリの区切り方は無視する）。
const hasUnsavedChanges = (draft: DraftState, seed: Seed): boolean =>
  draft.body.trim() !== seed.body ||
  (draft.title.trim() || undefined) !== seed.title ||
  draft.mood !== seed.mood ||
  draft.importance !== seed.importance ||
  parseTags(draft.tags).join('\n') !== seed.tags.join('\n');

const draftFromStored = (stored: Draft, seed: Seed): DraftState => ({
  title: stored.title ?? seed.title ?? '',
  body: stored.body,
  tags: stored.tags ?? seed.tags.join(', '),
  mood: stored.mood, // 下書きに無ければ「気分なし」にした状態
  importance: stored.importance ?? seed.importance,
});

export function SeedDetailScreen({
  seed,
  allSeeds,
  deletedSeeds,
  connections,
  onBack,
  backLabel,
  trail,
  onBackOneCenter,
  onBackToFirst,
  connectionsViewMode,
  onChangeConnectionsViewMode,
  editDraft,
  onEditDraftChange,
  onFlushDrafts,
  onNotify,
  onSave,
  onDelete,
  onOpenSeed,
  onLinkSeeds,
  onUnlinkSeeds,
  onSetConnectionNote,
  onAddMemo,
  onCreateTransform,
  onOpenSynthesis,
  onReconsiderSynthesis,
  synthesisDraftText,
  onBloom,
  onReturnToSprout,
  onSetArchived,
  dismissedSuggestions,
  dismissedCount,
  onDismissSuggestion,
  onRestoreDismissed,
}: SeedDetailScreenProps) {
  const insets = useSafeAreaInsets();
  // 下書きがあれば、編集の続きから開く。本文は明示的に「編集する」を選んだときだけ書き換えられる。
  const [editing, setEditing] = React.useState(Boolean(editDraft));
  const [draft, setDraft] = React.useState<DraftState>(() => (editDraft ? draftFromStored(editDraft, seed) : toDraft(seed)));
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  /** 日付・気分・書き出し・保管・削除は、必要なときだけ開く。 */
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  /** 編集を始めた時点の更新日時・本文。これと違えば、別の操作が先に確定している。 */
  const baseUpdatedAtRef = React.useRef(seed.updatedAt);
  const baseBodyRef = React.useRef(editDraft?.baseBody ?? seed.body);
  /** 編集の一回分の下書きID。保存や破棄のあと、次の編集では作り直す。 */
  const draftIdRef = React.useRef(editDraft?.id ?? createId());
  /** 「編集を閉じる」で残した入力があるか。あれば、次の「編集する」で続きから始める。 */
  const retainedRef = React.useRef(false);
  const latestSeedRef = React.useRef(seed);
  latestSeedRef.current = seed;

  const unsaved = editing && hasUnsavedChanges(draft, seed);
  const canSave = draft.body.trim().length > 0;
  const staleBase = editing && (seed.updatedAt !== baseUpdatedAtRef.current || seed.body !== baseBodyRef.current);

  // 編集中の内容は、短い間を置いて下書きとして残す（writer側でまとめて保存）。
  React.useEffect(() => {
    if (!editing) {
      return;
    }
    if (!hasUnsavedChanges(draft, latestSeedRef.current)) {
      onEditDraftChange(null, draftIdRef.current);
      return;
    }
    onEditDraftChange({
      id: draftIdRef.current,
      kind: 'edit-body',
      targetSeedId: latestSeedRef.current.id,
      body: draft.body,
      title: draft.title,
      tags: draft.tags,
      mood: draft.mood,
      importance: draft.importance,
      baseBody: baseBodyRef.current,
      updatedAt: new Date().toISOString(),
    }, draftIdRef.current);
    // 下書きの保存は入力ごとに呼ぶ。同じ下書きは writer が1件にまとめる。
  }, [draft, editing]);

  const startEditing = () => {
    if (!retainedRef.current) {
      setDraft(toDraft(seed));
      baseUpdatedAtRef.current = seed.updatedAt;
      baseBodyRef.current = seed.body;
    }
    setEditing(true);
  };

  // 保存の確定を待つ間の入力は、確定後に失われるので受け付けない。
  const editDraftFields = (patch: Partial<DraftState>) => {
    if (!saving) setDraft((prev) => ({ ...prev, ...patch }));
  };

  const closeEditor = () => {
    retainedRef.current = unsaved;
    if (unsaved) {
      void onFlushDrafts().then((ok) => onNotify(ok ? '編集中の内容は下書きとして残しました。' : '下書きをまだ端末に保存できていません。アプリを閉じないでください。'));
    }
    setEditing(false);
  };

  const buildPayload = (): SeedUpdateInput => ({
    title: draft.title,
    body: draft.body,
    mood: draft.mood,
    importance: draft.importance,
    tags: parseTags(draft.tags),
  });

  const save = async (): Promise<boolean> => {
    if (saving || !canSave) {
      return false;
    }
    setSaving(true);
    Keyboard.dismiss();
    const ok = await onSave(seed.id, buildPayload(), baseUpdatedAtRef.current, draftIdRef.current);
    setSaving(false);
    if (ok) {
      draftIdRef.current = createId();
      retainedRef.current = false;
      setEditing(false);
    }
    return ok;
  };

  const discardDraft = () => {
    showConfirm('下書きを破棄しますか？', '編集中の内容が消えます。元のメモは変わりません。', [
      { text: '編集を続ける', style: 'cancel' },
      {
        text: '下書きを破棄',
        style: 'destructive',
        onPress: () => {
          onEditDraftChange(null, draftIdRef.current);
          draftIdRef.current = createId();
          retainedRef.current = false;
          setEditing(false);
          setDraft(toDraft(latestSeedRef.current));
        },
      },
    ]);
  };

  const adoptLatestBase = () => {
    baseUpdatedAtRef.current = seed.updatedAt;
    baseBodyRef.current = seed.body;
    onNotify('最新の内容を基準にしました。入力はそのまま残っています。');
  };

  // 戻るだけでは、本文を書き換えない。編集中の内容は下書きに残して戻る。
  const handleBack = () => {
    if (editing && unsaved) {
      Keyboard.dismiss();
      void onFlushDrafts().then((ok) =>
        onNotify(ok ? '編集中の内容は下書きとして残しました。開くと続きから編集できます。' : '下書きをまだ端末に保存できていません。アプリを閉じないでください。'),
      );
    }
    onBack();
  };

  const transformOutputs: TransformOutput[] = seed.transformOutputs ?? [];
  const byId = React.useMemo(() => new Map([...allSeeds, ...deletedSeeds].map((item) => [item.id, item])), [allSeeds, deletedSeeds]);
  const contentStyle = React.useMemo(
    () => [styles.content, { paddingBottom: Math.max(48, insets.bottom + 32) }],
    [insets.bottom],
  );
  const currentSnippet = toSeedSnippet(seed, 30);
  const connectionCount = connections.filter((c) => c.aSeedId === seed.id || c.bSeedId === seed.id).length;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <AnimatedPressable
          onPress={handleBack}
          style={styles.backButton}
          pressedStyle={styles.backButtonPressed}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel={`${backLabel}に戻る`}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
          <Text style={styles.backButtonText}>{backLabel}</Text>
        </AnimatedPressable>

        {trail.length > 0 ? (
          <View style={styles.trail}>
            <Text style={styles.trailLabel} accessibilityLiveRegion="polite">
              いま見ているメモ: 「{currentSnippet}」
            </Text>
            <View style={styles.trailActions}>
              <AnimatedPressable
                onPress={onBackOneCenter}
                style={styles.trailButton}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`ひとつ前のつながりへ。${toSeedSnippet(trail[trail.length - 1], 20)}`}
              >
                <Ionicons name="arrow-back" size={14} color={theme.colors.primary} />
                <Text style={styles.trailButtonText}>ひとつ前のつながりへ</Text>
              </AnimatedPressable>
              {trail.length > 1 ? (
                <AnimatedPressable
                  onPress={onBackToFirst}
                  style={styles.trailButton}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={`最初のメモへ戻る。${toSeedSnippet(trail[0], 20)}`}
                >
                  <Text style={styles.trailButtonText}>最初のメモへ戻る</Text>
                </AnimatedPressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.headingRow}>
          <Text style={styles.heading} accessibilityRole="header">
            メモ
          </Text>
          <HelpButton content={helpTexts.detail} />
        </View>

        <FadeInView delayMs={40}>
          <SectionCard>
            {!editing ? (
              <>
                {seed.title ? <Text style={styles.readTitle}>{seed.title}</Text> : null}
                <Text style={styles.readBody} selectable>
                  {seed.body}
                </Text>
                <View style={styles.memoFooter}>
                  <Text style={styles.dateText}>{formatRelativeDay(seed.updatedAt)}に更新</Text>
                  <AnimatedPressable
                    onPress={startEditing}
                    style={styles.editButton}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel="このメモの本文や情報を編集する"
                  >
                    <Ionicons name="create-outline" size={16} color={theme.colors.primary} />
                    <Text style={styles.editButtonText}>編集</Text>
                  </AnimatedPressable>
                </View>
              </>
            ) : (
              <>
                {staleBase ? (
                  <View style={styles.warning} accessibilityLiveRegion="polite">
                    <Text style={styles.warningText}>編集中に、このメモが別の操作で更新されました。入力は残っています。</Text>
                    <AnimatedPressable
                      onPress={adoptLatestBase}
                      style={styles.warningButton}
                      haptic="light"
                      accessibilityRole="button"
                      accessibilityLabel="最新の内容を基準にして、入力はそのまま残す"
                    >
                      <Text style={styles.warningButtonText}>入力を残して保存できるようにする</Text>
                    </AnimatedPressable>
                  </View>
                ) : null}
                <TextInput
                  value={draft.body}
                  onChangeText={(body) => editDraftFields({ body })}
                  editable={!saving}
                  style={styles.bodyInput}
                  multiline
                  textAlignVertical="top"
                  placeholder="メモの本文"
                  placeholderTextColor={theme.colors.placeholder}
                  accessibilityLabel="メモの本文"
                />
                <TextInput
                  value={draft.title}
                  onChangeText={(title) => editDraftFields({ title })}
                  editable={!saving}
                  style={styles.titleInput}
                  placeholder="タイトル（任意）"
                  placeholderTextColor={theme.colors.placeholder}
                  accessibilityLabel="タイトル"
                />

                <AnimatedPressable
                  onPress={() => setDetailsOpen((value) => !value)}
                  style={styles.toggle}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: detailsOpen }}
                  accessibilityLabel="気分・大切度・カテゴリを開閉"
                >
                  <Text style={styles.toggleText}>気分・大切度・カテゴリ</Text>
                  <Ionicons name={detailsOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={16} color={theme.colors.textMuted} />
                </AnimatedPressable>
                {detailsOpen ? (
                  <View>
                    <ChipSelector<Mood>
                      label="気分"
                      options={MOOD_OPTIONS}
                      selectedValue={draft.mood}
                      onChange={(mood) => editDraftFields({ mood })}
                      allowClear
                      getLabel={(mood) => moodLabels[mood]}
                    />
                    <ChipSelector<Importance>
                      label="大切度（1〜5）"
                      options={IMPORTANCE_OPTIONS}
                      selectedValue={draft.importance}
                      onChange={(importance) => editDraftFields({ importance: importance ?? 3 })}
                    />
                    <Text style={styles.stateHint}>大切なほど、「今日の種」に選ばれやすくなります。</Text>
                    <View style={styles.fieldWrap}>
                      <Text style={styles.label}>カテゴリ（任意）</Text>
                      <TextInput
                        value={draft.tags}
                        onChangeText={(tags) => editDraftFields({ tags })}
                        editable={!saving}
                        style={styles.input}
                        accessibilityLabel="カテゴリ"
                      />
                    </View>
                  </View>
                ) : null}

                {unsaved ? (
                  <Text style={styles.saveStatusText} accessibilityLiveRegion="polite">
                    まだ保存していません（下書きは自動で残ります）
                  </Text>
                ) : null}
                <PrimaryButton
                  label={saving ? '保存しています…' : '変更を保存'}
                  disabled={!canSave || !unsaved || saving}
                  accessibilityHint={canSave ? '編集した内容でメモを更新します。' : '本文を入力すると保存できます。'}
                  onPress={() => void save()}
                />
                <View style={styles.editFooter}>
                  <AnimatedPressable
                    onPress={closeEditor}
                    style={styles.textButton}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel="編集をいったん閉じる。下書きは残ります"
                  >
                    <Text style={styles.textButtonText}>閉じる</Text>
                  </AnimatedPressable>
                  {unsaved ? (
                    <AnimatedPressable
                      onPress={discardDraft}
                      style={styles.textButton}
                      haptic="light"
                      accessibilityRole="button"
                      accessibilityLabel="下書きを破棄する"
                    >
                      <Text style={styles.dangerText}>下書きを破棄</Text>
                    </AnimatedPressable>
                  ) : null}
                </View>
              </>
            )}
          </SectionCard>
        </FadeInView>

        {/* 「思いついたことを書く場所」は、メモのすぐ下に置く。 */}
        <FadeInView delayMs={60}>
          <SynthesisCard
            seed={seed}
            byId={byId}
            draftText={synthesisDraftText}
            connectionCount={connectionCount}
            onCreate={() => onOpenSynthesis(seed.id, 'new')}
            onReview={() => onOpenSynthesis(seed.id, 'review')}
            onReconsider={() => onReconsiderSynthesis(seed.id)}
            onResumeDraft={() => onOpenSynthesis(seed.id, seed.synthesis ? 'review' : 'new')}
            onOpenSeed={onOpenSeed}
            onBloom={(note) => onBloom(seed.id, note)}
            onReturnToSprout={() => onReturnToSprout(seed.id)}
          />
        </FadeInView>

        <FadeInView delayMs={70}>
          <ConnectionsPanel
            center={seed}
            seeds={allSeeds}
            connections={connections}
            viewMode={connectionsViewMode}
            onChangeViewMode={onChangeConnectionsViewMode}
            onOpenSeed={onOpenSeed}
            onLink={(otherId) => onLinkSeeds(seed.id, otherId)}
            onUnlink={(otherId) => onUnlinkSeeds(seed.id, otherId)}
            onSetNote={(otherId, note) => onSetConnectionNote(seed.id, otherId, note)}
            onAddMemo={() => onAddMemo(seed.id)}
            dismissed={dismissedSuggestions}
            dismissedCount={dismissedCount}
            onDismissSuggestion={(otherId) => onDismissSuggestion(seed.id, otherId)}
            onRestoreDismissed={() => onRestoreDismissed(seed.id)}
          />
        </FadeInView>

        <FadeInView delayMs={80}>
          <SectionCard muted>
            <AnimatedPressable
              onPress={() => setMoreOpen((value) => !value)}
              style={styles.toggle}
              haptic="light"
              accessibilityRole="button"
              accessibilityState={{ expanded: moreOpen }}
              accessibilityLabel="くわしい情報・保管・削除を開閉"
            >
              <Text style={styles.toggleText}>くわしい情報・保管・削除</Text>
              <Ionicons name={moreOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={16} color={theme.colors.textMuted} />
            </AnimatedPressable>
            {moreOpen ? (
              <>
                <View style={styles.info}>
                  <Text style={styles.dateText}>作成: {formatDate(seed.createdAt)}</Text>
                  <Text style={styles.dateText}>更新: {formatDate(seed.updatedAt)}</Text>
                  <View style={styles.badgeRow}>
                    <ImportanceDots value={seed.importance} />
                    {seed.mood ? <Text style={styles.badgeText}>気分: {moodLabels[seed.mood]}</Text> : null}
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
                </View>

                <Text style={styles.sectionTitle}>ヒントを作る</Text>
                <Text style={styles.hintText}>このメモから、問いや小さな行動の案を端末の中で作ります。使うかどうかは自由です。</Text>
                <View style={styles.rowWrap}>
                  {TRANSFORM_TYPES.map((type) => (
                    <IOSChip
                      key={type}
                      label={transformLabels[type]}
                      onPress={() => {
                        triggerLightFeedback();
                        onCreateTransform(seed.id, type);
                      }}
                    />
                  ))}
                </View>
                {transformOutputs
                  .slice()
                  .reverse()
                  .map((output) => (
                    <View key={output.id} style={styles.outputCard}>
                      <Text style={styles.outputType}>{transformLabels[output.type]}</Text>
                      <Text style={styles.outputBody}>{output.content}</Text>
                      <Text style={styles.outputDate}>{formatDate(output.createdAt)}</Text>
                    </View>
                  ))}

                <AnimatedPressable
                  onPress={() => onSetArchived(seed.id, seed.growthState !== 'archived')}
                  style={styles.archiveButton}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={seed.growthState === 'archived' ? '保管から戻す' : 'このメモを保管する'}
                >
                  <Ionicons name="archive-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.editButtonText}>{seed.growthState === 'archived' ? '保管から戻す' : '保管する（今日の種に出さない）'}</Text>
                </AnimatedPressable>

                <AnimatedPressable
                  onPress={() =>
                    showConfirm('このメモを削除しますか？', '「種一覧」の一番下の「最近削除した種」から復元できます。つながりは、復元すると戻ります。', [
                      { text: 'キャンセル', style: 'cancel' },
                      {
                        text: '削除',
                        style: 'destructive',
                        onPress: () => {
                          triggerLightFeedback();
                          onDelete(seed.id);
                        },
                      },
                    ])
                  }
                  style={styles.deleteButton}
                  pressedStyle={styles.deleteButtonPressed}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel="このメモを削除"
                >
                  <Text style={styles.deleteButtonText}>このメモを削除</Text>
                </AnimatedPressable>
              </>
            ) : null}
          </SectionCard>
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.lg, paddingBottom: 124, gap: theme.spacing.md },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: theme.colors.leaf,
    gap: 2,
  },
  backButtonPressed: { backgroundColor: theme.colors.leafPressed },
  backButtonText: { color: theme.colors.primary, fontSize: 15, fontWeight: '500' },
  trail: {
    gap: 6,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.chipSelectedBorder,
  },
  trailLabel: { fontSize: 13, lineHeight: 19, color: theme.colors.text, fontFamily: theme.fonts.serif },
  trailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.chipSelectedBorder,
  },
  trailButtonText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  heading: { fontSize: theme.typography.title, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { color: theme.colors.textSoft, fontSize: 13 },
  readTitle: { fontSize: 18, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  readBody: { fontSize: 18, lineHeight: 30, fontFamily: theme.fonts.serif, color: theme.colors.text },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  badgeText: { fontSize: 13, color: theme.colors.textMuted },
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
  memoFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  info: { gap: 6 },
  archiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.chipSelectedBorder,
    backgroundColor: theme.colors.surface,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.chipSelectedBorder,
    backgroundColor: theme.colors.surface,
  },
  editButtonText: { fontSize: theme.typography.body, fontWeight: '700', color: theme.colors.primary },
  warning: {
    gap: 8,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dangerBg,
    borderWidth: 1,
    borderColor: theme.colors.dangerBorder,
  },
  warningText: { fontSize: 13, lineHeight: 19, color: theme.colors.dangerText },
  warningButton: { minHeight: 40, justifyContent: 'center' },
  warningButtonText: { fontSize: 14, fontWeight: '700', color: theme.colors.dangerText, textDecorationLine: 'underline' },
  bodyInput: {
    minHeight: 160,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    paddingBottom: 18,
    fontSize: 18,
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
    lineHeight: 30,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  titleInput: {
    borderRadius: theme.radius.sm,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: theme.colors.inputBgSoft,
    fontSize: 15,
    color: theme.colors.text,
  },
  stateHint: { marginTop: -8, fontSize: 13, color: theme.colors.textSoft },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  toggleText: { color: theme.colors.primary, fontSize: 14, fontWeight: '600' },
  fieldWrap: { marginTop: 6, gap: 8 },
  label: { fontSize: 14, color: theme.colors.textMuted },
  input: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  saveStatusText: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  editFooter: { gap: 4 },
  textButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  textButtonText: { fontSize: 14, fontWeight: '600', color: theme.colors.textMuted },
  dangerText: { fontSize: 14, fontWeight: '700', color: theme.colors.dangerText },
  sectionTitle: { fontSize: 17, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  hintText: { fontSize: 13, lineHeight: 19, color: theme.colors.textMuted },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  outputCard: { borderTopWidth: 1, borderTopColor: theme.colors.rule, paddingTop: 10, gap: 4 },
  outputType: { fontSize: 13, color: theme.colors.textMuted },
  outputBody: { fontSize: 14, color: theme.colors.text, lineHeight: 21 },
  outputDate: { fontSize: 12, color: theme.colors.textSoft },
  deleteButton: {
    minHeight: 44,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.dangerBorder,
    backgroundColor: theme.colors.dangerBg,
  },
  deleteButtonPressed: { backgroundColor: theme.colors.dangerPressed },
  deleteButtonText: { color: theme.colors.dangerText, fontSize: 15, fontWeight: '600' },
});

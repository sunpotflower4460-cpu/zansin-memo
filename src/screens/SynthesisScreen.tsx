import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import { SeedPickerModal } from '../components/SeedPickerModal';
import type { Draft, Seed, SeedConnection } from '../domain/types';
import type { MaterialRef } from '../domain/gardenCommands';
import { theme } from '../styles/theme';
import { createId } from '../utils/ids';
import { buildAdjacency } from '../utils/links';
import { isLongText, toSeedSnippet } from '../utils/seedText';
import { formatRelativeDay } from '../utils/seedUtils';
import { describeSource, sourcePartLabel } from '../utils/synthesis';

export type SynthesisSaveInput = {
  synthesisId: string;
  statement: string;
  centerBodyText: string;
  materials: MaterialRef[];
  keepExistingSources: boolean;
  draftId: string;
};

type SynthesisScreenProps = {
  mode: 'new' | 'review';
  center: Seed;
  /** 削除されていないメモ全体。 */
  seeds: Seed[];
  /** 削除済みのメモ。材料が削除されたことを伝え、本文を出さないために使う。 */
  deletedSeeds?: Seed[];
  connections: SeedConnection[];
  /** 一覧で一緒に選んだメモなど、最初から材料にしておくメモ。 */
  initialMaterialIds?: string[];
  /** 復元する下書き。 */
  draft?: Draft;
  saving: boolean;
  errorMessage?: string;
  onDraftChange: (draft: Draft | null, draftId: string) => void;
  /** 保存の確定を待って true。失敗時は false（入力と選択は残す）。 */
  onSave: (input: SynthesisSaveInput) => Promise<boolean>;
  onChangeCenter: (seedId: string) => void;
  onSwitchToReview: () => void;
  onPostpone: () => void;
  onBack: () => void;
  /** 無ければ「このメモを開く」を出さない（練習）。 */
  onOpenSeed?: (seedId: string) => void;
  /** 練習用の完成例。「完成例を見る」で入力欄に入れられる（保存はしない）。 */
  exampleStatement?: string;
};

type Pick = { seedId: string; part: 'body' | 'synthesis' };
const pickKey = (pick: Pick) => `${pick.seedId}\u0000${pick.part}`;

export function SynthesisScreen({
  mode,
  center,
  seeds,
  deletedSeeds,
  connections,
  initialMaterialIds,
  draft,
  saving,
  errorMessage,
  onDraftChange,
  onSave,
  onChangeCenter,
  onSwitchToReview,
  onPostpone,
  onBack,
  onOpenSeed,
  exampleStatement,
}: SynthesisScreenProps) {
  const insets = useSafeAreaInsets();
  const existing = center.synthesis;
  const reviewing = mode === 'review' && Boolean(existing);

  // 芽の一回分のID。復元・再試行で作り直さない。
  const idsRef = React.useRef({
    draftId: draft?.id ?? createId(),
    synthesisId: reviewing && existing ? existing.id : (draft?.plannedId ?? createId()),
  });
  // 見直し・芽にし直しは、いまの芽の文から書き始める。下書きがあれば下書きを優先する。
  const [statement, setStatement] = React.useState(draft?.body ?? (reviewing && existing ? existing.statement : ''));
  /** 見直しで材料を選び直すか。選び直さなければ、確定済みのスナップショットを保持する。 */
  const [reselect, setReselect] = React.useState(!reviewing || Boolean(draft?.reselect));
  const [picked, setPicked] = React.useState<Pick[]>(() => {
    const fromDraft = draft?.materials?.map((m) => ({ seedId: m.seedId, part: m.sourcePart })) ?? [];
    const fromList = (initialMaterialIds ?? []).filter((id) => id !== center.id).map((id) => ({ seedId: id, part: 'body' as const }));
    return fromDraft.length > 0 ? fromDraft : fromList;
  });
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [centerPickerOpen, setCenterPickerOpen] = React.useState(false);

  const byId = React.useMemo(() => new Map(seeds.map((seed) => [seed.id, seed])), [seeds]);
  const sourceById = React.useMemo(() => new Map([...seeds, ...(deletedSeeds ?? [])].map((seed) => [seed.id, seed])), [seeds, deletedSeeds]);
  const neighborIds = React.useMemo(() => buildAdjacency(seeds, connections).get(center.id) ?? new Set<string>(), [seeds, connections, center.id]);
  const pickedKeys = React.useMemo(() => new Set(picked.map(pickKey)), [picked]);
  const pickedSeedIds = React.useMemo(() => new Set(picked.map((p) => p.seedId)), [picked]);

  // 候補: つながっているメモ → 選んだメモ。選んでいないメモは、材料にしない。
  const candidateIds = React.useMemo(() => {
    const ids: string[] = [];
    for (const id of neighborIds) ids.push(id);
    for (const p of picked) if (!ids.includes(p.seedId) && p.seedId !== center.id) ids.push(p.seedId);
    return ids.filter((id) => id !== center.id && byId.has(id));
  }, [neighborIds, picked, byId, center.id]);

  // 選んだあとに削除された材料。黙って外さず、本人が外すか復元するまで保存しない。
  const unavailable = reselect
    ? picked.filter((p) => {
        const origin = byId.get(p.seedId);
        return !origin || (p.part === 'synthesis' && !origin.synthesis);
      })
    : [];

  const materials: MaterialRef[] = [];
  for (const p of picked) {
    const origin = byId.get(p.seedId);
    if (!origin) continue;
    if (p.part === 'body') {
      materials.push({ seedId: p.seedId, sourcePart: 'body', expectedText: origin.body });
    } else if (origin.synthesis) {
      materials.push({ seedId: p.seedId, sourcePart: 'synthesis', expectedText: origin.synthesis.statement });
    }
  }

  // 入力・選択の途中は、下書きとして残す（writer側でまとめて保存）。
  React.useEffect(() => {
    // 開いただけ・何も変えていないときは、下書きを作らない。
    const unchangedReview = reviewing && !reselect && statement === existing?.statement;
    if (unchangedReview || (!statement.trim() && picked.length === 0 && !(reviewing && reselect))) {
      onDraftChange(null, idsRef.current.draftId);
      return;
    }
    onDraftChange(
      {
        id: idsRef.current.draftId,
        kind: 'synthesis',
        targetSeedId: center.id,
        plannedId: idsRef.current.synthesisId,
        body: statement,
        materials: picked.map((p) => ({ seedId: p.seedId, sourcePart: p.part })),
        reselect: reselect && (reviewing || picked.length > 0) ? true : undefined,
        updatedAt: new Date().toISOString(),
      },
      idsRef.current.draftId,
    );
  }, [statement, picked, reselect, center.id]);

  // 芽を残すメモを変えたとき、新しい中心を材料の選択から外す（中心の原文は常に含まれる）。
  React.useEffect(() => {
    setPicked((current) => (current.some((p) => p.seedId === center.id) ? current.filter((p) => p.seedId !== center.id) : current));
  }, [center.id]);

  // 保存の確定を待つ間の変更は、保存にも下書きにも残らないので受け付けない。
  const toggle = (seedId: string, part: 'body' | 'synthesis') => {
    if (saving) return;
    setPicked((current) => {
      const key = pickKey({ seedId, part });
      return current.some((p) => pickKey(p) === key) ? current.filter((p) => pickKey(p) !== key) : [...current, { seedId, part }];
    });
  };
  const editStatement = (text: string) => {
    if (!saving) setStatement(text);
  };
  const toggleExpanded = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const clash = mode === 'new' && Boolean(existing);
  const question = materials.length > 0 ? 'メモを合わせると、\nどんなことができそう？' : 'どんなことができそう？';
  const canSave = statement.trim().length > 0 && !saving && !clash && unavailable.length === 0;

  const save = async () => {
    const ok = await onSave({
      synthesisId: idsRef.current.synthesisId,
      statement,
      centerBodyText: center.body,
      materials: reselect ? materials : [],
      keepExistingSources: reviewing && !reselect,
      draftId: idsRef.current.draftId,
    });
    return ok;
  };

  const sourcesToShow = reviewing && existing && !reselect ? existing.sources : [];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(140, insets.bottom + 120) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <AnimatedPressable onPress={onBack} style={styles.backButton} haptic="light" accessibilityRole="button" accessibilityLabel="戻る。入力は下書きに残ります">
          <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
          <Text style={styles.backButtonText}>戻る</Text>
        </AnimatedPressable>

        <Text style={styles.heading} accessibilityRole="header">
          {reviewing ? '芽を書き直す' : '芽を書く'}
        </Text>

        {/* この芽が残るメモ */}
        <SectionCard muted>
          <View style={styles.centerHead}>
            <Text style={styles.label}>このメモに残ります</Text>
            {!reviewing ? (
              <AnimatedPressable
                onPress={() => !saving && setCenterPickerOpen(true)}
                style={styles.centerChange}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel="芽を残すメモを変更する。入力は残ります"
              >
                <Text style={styles.linkButtonText}>変更</Text>
              </AnimatedPressable>
            ) : null}
          </View>
          <Text style={styles.centerText} numberOfLines={expanded.has('center') ? undefined : 3}>
            {center.body}
          </Text>
          {isLongText(center.body, 60) ? (
            <SmallToggle label={expanded.has('center') ? '閉じる' : '全文を表示'} onPress={() => toggleExpanded('center')} />
          ) : null}
        </SectionCard>

        {clash && existing ? (
          <View style={styles.clash} accessibilityLiveRegion="polite">
            <Text style={styles.clashTitle}>このメモには、すでに芽があります</Text>
            <Text style={styles.clashText}>「{toSeedSnippet({ body: existing.statement }, 60)}」</Text>
            <Text style={styles.note}>いま書いた内容は下書きに残ります。</Text>
            <View style={styles.row}>
              <AnimatedPressable onPress={onSwitchToReview} style={styles.smallPrimary} haptic="light" accessibilityRole="button" accessibilityLabel="いまの芽を書き直す。書いた内容は残ります">
                <Text style={styles.smallPrimaryText}>いまの芽を書き直す</Text>
              </AnimatedPressable>
              <AnimatedPressable onPress={() => setCenterPickerOpen(true)} style={styles.small} haptic="light" accessibilityRole="button" accessibilityLabel="別のメモに芽を残す">
                <Text style={styles.smallText}>別のメモに残す</Text>
              </AnimatedPressable>
            </View>
          </View>
        ) : null}

        {/* ここに書く */}
        <View style={styles.writeCard}>
          <Text style={styles.sectionTitle}>{question}</Text>
          <TextInput
            value={statement}
            onChangeText={editStatement}
            editable={!saving}
            style={styles.input}
            multiline
            textAlignVertical="top"
            placeholder="ここに書く（例：こうできるかも）"
            placeholderTextColor={theme.colors.placeholder}
            accessibilityLabel="できそうなこと"
          />
          {reviewing && existing && statement !== existing.statement ? <Text style={styles.note}>いまの芽: {existing.statement}</Text> : null}
          {exampleStatement ? (
            <AnimatedPressable onPress={() => editStatement(exampleStatement)} style={styles.linkButton} haptic="light" accessibilityRole="button" accessibilityLabel="完成例を入力欄に入れて見る">
              <Ionicons name="bulb-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.linkButtonText}>完成例を見る</Text>
            </AnimatedPressable>
          ) : null}
        </View>

        {/* 材料 */}
        <SectionCard muted>
          <Text style={styles.sectionTitle}>参考にするメモ（任意）</Text>

          {sourcesToShow.length > 0 ? (
            <>
              <Text style={styles.subLabel}>前に書いたときに見たメモ</Text>
              {sourcesToShow
                .filter((source) => !(source.seedId === center.id && source.sourcePart === 'body'))
                .map((source) => {
                  const state = describeSource(source, sourceById);
                  return (
                    <View key={`${source.seedId}-${source.sourcePart}`} style={styles.material}>
                      <Text style={styles.materialLabel}>{sourcePartLabel(source.sourcePart)}</Text>
                      <Text style={styles.materialText}>
                        {state.kind === 'deleted'
                          ? '（元のメモは「最近削除した種」にあります）'
                          : state.kind === 'missing'
                            ? '（元のメモが見つかりません）'
                            : source.textSnapshot}
                      </Text>
                      {state.kind === 'changed' ? <Text style={styles.changed}>いまは変わっています（{toSeedSnippet({ body: state.currentText }, 40)}）</Text> : null}
                    </View>
                  );
                })}
              <AnimatedPressable onPress={() => !saving && setReselect(true)} style={styles.linkButton} haptic="light" accessibilityRole="button" accessibilityLabel="参考にするメモを選び直す">
                <Text style={styles.linkButtonText}>選び直す</Text>
              </AnimatedPressable>
            </>
          ) : (
            <>
              {unavailable.map((p) => (
                <View key={pickKey(p)} style={styles.material} accessibilityLiveRegion="polite">
                  <Text style={styles.changed}>
                    {sourceById.get(p.seedId)?.deletedAt
                      ? '選んだメモは「最近削除した種」にあります。復元するか、外すと保存できます。'
                      : '選んだメモが見つかりません。外すと保存できます。'}
                  </Text>
                  <SmallToggle label="参考から外す" onPress={() => toggle(p.seedId, p.part)} />
                </View>
              ))}
              {candidateIds.length === 0 ? <Text style={styles.note}>選ばなくても書けます。</Text> : <Text style={styles.note}>チェックしたメモを、芽と一緒に残します。</Text>}
              {candidateIds.map((id) => {
                const origin = byId.get(id);
                if (!origin) return null;
                const bodyOn = pickedKeys.has(pickKey({ seedId: id, part: 'body' }));
                const synthOn = pickedKeys.has(pickKey({ seedId: id, part: 'synthesis' }));
                const open = expanded.has(id);
                return (
                  <View key={id} style={[styles.material, (bodyOn || synthOn) && styles.materialOn]}>
                    <CheckRow
                      on={bodyOn}
                      label={`${origin.title ? `「${origin.title}」` : 'メモ'}${neighborIds.has(id) ? '（つながっています）' : ''}`}
                      // 参考として残すのは本文なので、題名があっても本文を読めるようにする。
                      text={open ? origin.body : toSeedSnippet({ body: origin.body }, 70)}
                      onPress={() => toggle(id, 'body')}
                      a11y={`${bodyOn ? '参考にしている' : '参考にしていない'}。元のメモ。${toSeedSnippet(origin, 30)}`}
                    />
                    {origin.synthesis ? (
                      <CheckRow
                        on={synthOn}
                        label="芽の文"
                        text={origin.synthesis.statement}
                        onPress={() => toggle(id, 'synthesis')}
                        a11y={`${synthOn ? '参考にしている' : '参考にしていない'}。芽の文。${toSeedSnippet({ body: origin.synthesis.statement }, 30)}`}
                      />
                    ) : null}
                    <View style={styles.row}>
                      {isLongText(origin.body, 60) ? <SmallToggle label={open ? '閉じる' : '全文を表示'} onPress={() => toggleExpanded(id)} /> : null}
                      {onOpenSeed ? <SmallToggle label="このメモを開く" onPress={() => onOpenSeed(id)} /> : null}
                      <Text style={styles.meta}>{formatRelativeDay(origin.updatedAt)}</Text>
                    </View>
                  </View>
                );
              })}
              <AnimatedPressable onPress={() => setPickerOpen(true)} style={styles.linkButton} haptic="light" accessibilityRole="button" accessibilityLabel="参考にするメモを探して追加する">
                <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.linkButtonText}>ほかのメモも選ぶ</Text>
              </AnimatedPressable>
            </>
          )}
        </SectionCard>

        {errorMessage ? (
          <Text style={styles.error} accessibilityLiveRegion="assertive">
            {errorMessage}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {!statement.trim() ? <Text style={styles.disabledHint}>一言書くと、保存できます。</Text> : null}
        <PrimaryButton
          label={saving ? '保存しています…' : reviewing ? '書き直した芽を保存' : '芽として保存'}
          disabled={!canSave}
          onPress={() => void save()}
          accessibilityHint="この芽を、このメモに残します。元のメモは変わりません。"
        />
        <AnimatedPressable onPress={onPostpone} style={styles.postpone} haptic="light" accessibilityRole="button" accessibilityLabel="あとで考える。入力は下書きに残ります">
          <Text style={styles.postponeText}>あとで考える（下書きに残す）</Text>
        </AnimatedPressable>
      </View>

      <SeedPickerModal
        visible={pickerOpen}
        candidates={seeds.filter((seed) => seed.id !== center.id)}
        linkedIds={pickedSeedIds}
        title="参考にするメモを選ぶ"
        caption="選んでも、つながりは増えません。"
        onToggle={(id) => toggle(id, 'body')}
        onClose={() => setPickerOpen(false)}
      />
      <SeedPickerModal
        visible={centerPickerOpen}
        candidates={seeds.filter((seed) => seed.id !== center.id)}
        linkedIds={new Set()}
        title="芽を残すメモを選ぶ"
        caption="選んだメモに芽が残ります。入力中の文章は残ります。"
        onToggle={(id) => {
          setCenterPickerOpen(false);
          onChangeCenter(id);
        }}
        onClose={() => setCenterPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

function SmallToggle({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <AnimatedPressable onPress={onPress} style={styles.small} haptic="light" accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.smallText}>{label}</Text>
    </AnimatedPressable>
  );
}

function CheckRow({ on, label, text, onPress, a11y }: { on: boolean; label: string; text: string; onPress: () => void; a11y: string }) {
  return (
    <AnimatedPressable onPress={onPress} style={styles.checkRow} haptic="light" accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={a11y}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? theme.colors.primary : theme.colors.chipSelectedBorder} />
      <View style={styles.checkBody}>
        <Text style={styles.materialLabel}>{label}</Text>
        <Text style={styles.materialText}>{text}</Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.lg, gap: theme.spacing.md },
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
  backButtonText: { color: theme.colors.primary, fontSize: 15, fontWeight: '500' },
  heading: { fontSize: theme.typography.title, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  centerText: { fontSize: 16, lineHeight: 25, fontFamily: theme.fonts.serif, color: theme.colors.text },
  centerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  centerChange: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 8 },
  writeCard: { gap: theme.spacing.xs, padding: theme.spacing.md, borderRadius: theme.radius.lg, backgroundColor: theme.colors.primarySoft, borderWidth: 2, borderColor: theme.colors.primary },
  note: { fontSize: 13, lineHeight: 19, color: theme.colors.textSoft },
  sectionTitle: { fontSize: 17, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  subLabel: { fontSize: 14, fontWeight: '700', color: theme.colors.textMuted, marginTop: theme.spacing.xs },
  material: { gap: 6, padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.rule },
  materialOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  materialLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  materialText: { fontSize: 15, lineHeight: 23, fontFamily: theme.fonts.serif, color: theme.colors.text },
  changed: { fontSize: 13, lineHeight: 19, color: theme.colors.accent, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 44 },
  checkBody: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  meta: { fontSize: 12, color: theme.colors.textSoft },
  small: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: theme.radius.full, backgroundColor: theme.colors.chipBg, borderWidth: 1, borderColor: theme.colors.border },
  smallText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  smallPrimary: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: theme.radius.full, backgroundColor: theme.colors.leaf, borderWidth: 1, borderColor: theme.colors.chipSelectedBorder },
  smallPrimaryText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  linkButtonText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  clash: { gap: 6, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.dangerBg, borderWidth: 1, borderColor: theme.colors.dangerBorder },
  clashTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.dangerText },
  clashText: { fontSize: 14, lineHeight: 21, fontFamily: theme.fonts.serif, color: theme.colors.text },
  input: {
    minHeight: 120,
    borderRadius: theme.radius.md,
    padding: 14,
    fontSize: 17,
    lineHeight: 28,
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  error: { fontSize: 14, lineHeight: 21, color: theme.colors.dangerText, fontWeight: '600' },
  bottomBar: {
    gap: 4,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 12,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  disabledHint: { textAlign: 'center', fontSize: 13, color: theme.colors.textMuted },
  postpone: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  postponeText: { fontSize: 15, fontWeight: '600', color: theme.colors.textMuted },
});

import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { growthStateLabels } from '../utils/displayLabels';
import { isLongText, toSeedSnippet } from '../utils/seedText';
import { formatDate } from '../utils/seedUtils';
import { describeSource, getSynthesisStatus, hasChangedSources, sourcePartLabel } from '../utils/synthesis';
import { AnimatedPressable } from './AnimatedPressable';
import { growthIcons } from './GrowthBadge';
import { PrimaryButton } from './PrimaryButton';
import { SectionCard } from './SectionCard';

type SynthesisCardProps = {
  seed: Seed;
  byId: Map<string, Seed>;
  /** 書きかけの芽の文。あれば続きから書けることを示す。 */
  draftText?: string;
  /** つながっているメモの数。書き出しの呼びかけを変える。 */
  connectionCount?: number;
  // 渡さない操作は、ボタンを出さない（練習では読むだけ）。
  onCreate?: () => void;
  onReview?: () => void;
  onReconsider?: () => void;
  onResumeDraft?: () => void;
  onOpenSeed?: (seedId: string) => void;
  /** 花を咲かせる。保存できなければ false（入力は残す）。 */
  onBloom?: (note: string) => Promise<boolean>;
  onReturnToSprout?: () => void;
  /** 理由の入力を始めたとき。カードの上端から入力欄までの距離を渡す（画面側で見える位置へ送る）。 */
  onBloomInputFocus?: (offsetInCard: number) => void;
};

const STEPS = ['seed', 'sprout', 'tree'] as const;

/** 種 → 芽 → 花のどこにいるかを示す。 */
function GrowthSteps({ state }: { state: Seed['growthState'] }) {
  return (
    <View
      style={styles.steps}
      accessible
      accessibilityLabel={`育ち方は${growthStateLabels[state]}。${STEPS.map((step) => growthStateLabels[step]).join('、')}の順に育ちます`}
    >
      {STEPS.map((step, index) => {
        const on = step === state;
        return (
          <React.Fragment key={step}>
            {index > 0 ? <Ionicons name="chevron-forward" size={14} color={theme.colors.textSoft} /> : null}
            <View style={[styles.step, on && styles.stepOn]}>
              <Ionicons name={growthIcons[step]} size={14} color={on ? '#ffffff' : theme.colors.textSoft} />
              <Text style={[styles.stepText, on && styles.stepTextOn]}>{growthStateLabels[step]}</Text>
            </View>
          </React.Fragment>
        );
      })}
      {state === 'archived' ? <Text style={styles.meta}>保管中</Text> : null}
    </View>
  );
}

// メモの詳細で「思いついたことを書く場所」と、種→芽→花の育ちをまとめて見せる。
export function SynthesisCard({
  seed,
  byId,
  draftText,
  connectionCount = 0,
  onCreate,
  onReview,
  onReconsider,
  onResumeDraft,
  onOpenSeed,
  onBloom,
  onReturnToSprout,
  onBloomInputFocus,
}: SynthesisCardProps) {
  const bloomFormY = React.useRef(0);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [blooming, setBlooming] = React.useState(false);
  const [bloomNote, setBloomNote] = React.useState('');
  const [bloomSaving, setBloomSaving] = React.useState(false);
  const status = getSynthesisStatus(seed);
  const synthesis = seed.synthesis;
  const changed = hasChangedSources(seed, byId);
  const flower = status === 'current' && seed.growthState === 'tree';
  const sprout = status === 'current' && seed.growthState === 'sprout';
  const hasDraft = draftText !== undefined;
  const writeDraft = hasDraft ? onResumeDraft : onCreate;

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const bloom = async () => {
    if (!onBloom || bloomSaving) return;
    setBloomSaving(true);
    const ok = await onBloom(bloomNote);
    setBloomSaving(false);
    if (ok) setBlooming(false);
  };

  return (
    <SectionCard>
      <GrowthSteps state={seed.growthState} />

      {!synthesis ? (
        <>
          <Text style={styles.title} accessibilityRole="header">
            {status === 'legacy'
              ? '考えを書き足せます'
              : connectionCount > 0
                ? 'つないだメモから、\n思いついたことは？'
                : '思いついたことは？'}
          </Text>
          {writeDraft ? (
            <AnimatedPressable
              onPress={writeDraft}
              style={styles.writeBox}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={hasDraft ? '芽の下書きの続きを書く' : 'ここに書いて芽にする'}
            >
              <Ionicons name="create-outline" size={20} color={theme.colors.primary} />
              <View style={styles.writeBody}>
                <Text style={styles.writeTitle}>{hasDraft ? '続きを書く' : 'ここに書いて芽にする'}</Text>
                <Text style={styles.writeHint} numberOfLines={2}>
                  {hasDraft && draftText ? `書きかけ: ${toSeedSnippet({ body: draftText }, 30)}` : '例：「こうできるかも」を一言'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
            </AnimatedPressable>
          ) : null}
          {/* 考えの文がない以前の芽・花も、育ち方を戻せるようにする。 */}
          {status === 'legacy' ? (
            <View style={styles.row}>
              {seed.growthState === 'tree' && onReturnToSprout ? <SmallButton label="芽に戻す" accessibilityLabel="花を芽に戻す" onPress={onReturnToSprout} /> : null}
              {onReconsider ? <SmallButton label="種に戻す" accessibilityLabel="種に戻す" onPress={onReconsider} /> : null}
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.label} accessibilityRole="header">
            {flower ? '咲いた考え' : sprout ? '芽に書いたこと' : '前に書いた考え'}
          </Text>
          <Text style={styles.statement}>{synthesis.statement}</Text>

          {flower && seed.bloom ? (
            <View style={styles.bloomRecord}>
              <Text style={styles.meta}>{formatDate(seed.bloom.bloomedAt)}に咲きました</Text>
              {seed.bloom.note ? <Text style={styles.bloomNoteText}>咲いた理由: {seed.bloom.note}</Text> : null}
            </View>
          ) : null}

          {hasDraft && onResumeDraft ? (
            <View style={styles.draft}>
              <Text style={styles.draftText}>書き直し中の下書きがあります。</Text>
              <SmallButton label="続きを書く" accessibilityLabel="芽の下書きの続きを書く" primary onPress={onResumeDraft} />
            </View>
          ) : null}

          {sprout && onBloom ? (
            blooming ? (
              <View
                style={styles.bloomForm}
                onLayout={(event) => {
                  bloomFormY.current = event.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.label}>咲いたと感じた理由（書かなくても大丈夫）</Text>
                <TextInput
                  value={bloomNote}
                  onChangeText={(text) => {
                    if (!bloomSaving) setBloomNote(text);
                  }}
                  editable={!bloomSaving}
                  onFocus={() => onBloomInputFocus?.(bloomFormY.current)}
                  style={styles.input}
                  multiline
                  textAlignVertical="top"
                  placeholder="例：試してみたら、うまくいった"
                  placeholderTextColor={theme.colors.placeholder}
                  accessibilityLabel="咲いたと感じた理由"
                />
                <PrimaryButton label={bloomSaving ? '保存しています…' : '花を咲かせる'} disabled={bloomSaving} onPress={() => void bloom()} />
                <AnimatedPressable onPress={() => setBlooming(false)} style={styles.textButton} haptic="light" accessibilityRole="button" accessibilityLabel="花にするのをやめる">
                  <Text style={styles.textButtonText}>やめる</Text>
                </AnimatedPressable>
              </View>
            ) : (
              <View style={styles.next}>
                <Text style={styles.nextText}>自分で「咲いた」と思えたら、花にします。</Text>
                <PrimaryButton
                  label="花にする"
                  onPress={() => {
                    setBloomNote(seed.bloom?.note ?? '');
                    setBlooming(true);
                  }}
                />
              </View>
            )
          ) : null}

          <View style={styles.row}>
            {onReview ? (
              <SmallButton
                label={status === 'reconsidered' && seed.growthState !== 'archived' ? 'この考えで芽にする' : '書き直す'}
                accessibilityLabel={status === 'reconsidered' && seed.growthState !== 'archived' ? 'この考えで芽にする' : '芽を書き直す'}
                primary={status === 'reconsidered'}
                onPress={onReview}
              />
            ) : null}
            <SmallButton
              label={detailsOpen ? '閉じる' : `くわしく見る${changed ? '（参考メモに変更あり）' : ''}`}
              accessibilityLabel={detailsOpen ? '芽のくわしい情報を閉じる' : '芽のくわしい情報を見る'}
              onPress={() => setDetailsOpen((value) => !value)}
            />
          </View>

          {detailsOpen ? (
            <View style={styles.details}>
              <Text style={styles.meta}>
                {status === 'current' ? `芽にした日: ${formatDate(synthesis.promotedAt)}` : `最後に書いた日: ${formatDate(synthesis.updatedAt)}`}
              </Text>
              <Text style={styles.subTitle}>書いたときに見たメモ</Text>
              <Text style={styles.note}>そのときの文章を残しています。元のメモを直しても、ここは変わりません。</Text>
              {synthesis.sources.map((source) => {
                const state = describeSource(source, byId);
                const key = `${source.seedId}-${source.sourcePart}`;
                const expanded = open.has(key);
                const origin = byId.get(source.seedId);
                return (
                  <View key={key} style={styles.source}>
                    <Text style={styles.sourceLabel}>
                      {sourcePartLabel(source.sourcePart)}
                      {source.seedId === seed.id ? '（このメモ）' : ''}
                    </Text>
                    {state.kind === 'deleted' ? (
                      <Text style={styles.note}>元のメモは「最近削除した種」にあります。復元すると、内容を読めます。</Text>
                    ) : state.kind === 'missing' ? (
                      <Text style={styles.note}>元のメモが見つかりません。</Text>
                    ) : (
                      <Text style={styles.sourceText} numberOfLines={expanded ? undefined : 3}>
                        {source.textSnapshot}
                      </Text>
                    )}
                    {state.kind === 'changed' ? (
                      <Text style={styles.changed}>いまは変わっています: 「{toSeedSnippet({ body: state.currentText }, 40)}」</Text>
                    ) : null}
                    <View style={styles.row}>
                      {state.kind !== 'deleted' && state.kind !== 'missing' && isLongText(source.textSnapshot, 60) ? (
                        <SmallButton label={expanded ? '閉じる' : '全文'} accessibilityLabel={expanded ? 'このメモを閉じる' : 'このメモの全文を読む'} onPress={() => toggle(key)} />
                      ) : null}
                      {onOpenSeed && origin && !origin.deletedAt && source.seedId !== seed.id ? (
                        <SmallButton label="このメモを開く" accessibilityLabel={`このメモを開く。${toSeedSnippet(origin, 20)}`} onPress={() => onOpenSeed(source.seedId)} />
                      ) : null}
                    </View>
                  </View>
                );
              })}
              <View style={styles.row}>
                {flower && onReturnToSprout ? <SmallButton label="芽に戻す" accessibilityLabel="花を芽に戻す。理由は残ります" onPress={onReturnToSprout} /> : null}
                {status === 'current' && onReconsider ? (
                  <SmallButton label="種に戻す" accessibilityLabel="種に戻す。書いた考えは残ります" onPress={onReconsider} />
                ) : null}
              </View>
            </View>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

function SmallButton({ label, onPress, primary, accessibilityLabel }: { label: string; onPress: () => void; primary?: boolean; accessibilityLabel?: string }) {
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
  steps: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.chipBg,
    borderWidth: 1,
    borderColor: theme.colors.rule,
  },
  stepOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  stepText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSoft },
  stepTextOn: { color: '#ffffff' },
  title: { fontSize: 17, lineHeight: 26, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  writeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 76,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.primary,
  },
  writeBody: { flex: 1, gap: 2 },
  writeTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.primary },
  writeHint: { fontSize: 13, lineHeight: 19, color: theme.colors.textMuted },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  statement: { fontSize: 19, lineHeight: 30, fontFamily: theme.fonts.serif, color: theme.colors.text },
  bloomRecord: { gap: 2 },
  bloomNoteText: { fontSize: 14, lineHeight: 21, color: theme.colors.textMuted },
  meta: { fontSize: 12, color: theme.colors.textSoft },
  next: { gap: theme.spacing.xs },
  nextText: { fontSize: 14, lineHeight: 21, color: theme.colors.textMuted },
  bloomForm: { gap: theme.spacing.xs },
  input: {
    minHeight: 72,
    borderRadius: theme.radius.md,
    padding: 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { fontSize: 15, fontWeight: '600', color: theme.colors.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  details: { gap: theme.spacing.xs },
  subTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.textMuted, marginTop: theme.spacing.xs },
  note: { fontSize: 13, lineHeight: 19, color: theme.colors.textSoft },
  source: { gap: 6, padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.rule },
  sourceLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  sourceText: { fontSize: 15, lineHeight: 23, fontFamily: theme.fonts.serif, color: theme.colors.text },
  changed: { fontSize: 13, lineHeight: 19, color: theme.colors.accent, fontWeight: '600' },
  draft: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: theme.spacing.xs, borderRadius: theme.radius.md, backgroundColor: theme.colors.primarySoft },
  draftText: { fontSize: 13, color: theme.colors.text, flexShrink: 1 },
  small: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: theme.radius.full, backgroundColor: theme.colors.chipBg, borderWidth: 1, borderColor: theme.colors.border },
  smallPrimary: { backgroundColor: theme.colors.leaf, borderColor: theme.colors.chipSelectedBorder },
  smallText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  smallTextPrimary: { color: theme.colors.primary, fontWeight: '700' },
});

import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { growthStateLabels } from '../utils/displayLabels';
import { isLongText, toSeedSnippet } from '../utils/seedText';
import { formatDate } from '../utils/seedUtils';
import { describeSource, getSynthesisStatus, hasChangedSources, sourcePartLabel } from '../utils/synthesis';
import { AnimatedPressable } from './AnimatedPressable';
import { SectionCard } from './SectionCard';

type SynthesisCardProps = {
  seed: Seed;
  byId: Map<string, Seed>;
  /** 芽の下書きがあるか。 */
  hasDraft: boolean;
  // 渡さない操作は、ボタンを出さない（練習では読むだけ）。
  onCreate?: () => void;
  onReview?: () => void;
  onReconsider?: () => void;
  onResumeDraft?: () => void;
  onOpenSeed?: (seedId: string) => void;
};

// 詳細で、本人が書いた芽と、その材料（芽をまとめたときに読んだ文章）を読む。
// 「現在のつながり」とは別の見出しで、線の変化と材料の履歴を混同させない。
export function SynthesisCard({ seed, byId, hasDraft, onCreate, onReview, onReconsider, onResumeDraft, onOpenSeed }: SynthesisCardProps) {
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const status = getSynthesisStatus(seed);
  const synthesis = seed.synthesis;
  const changed = hasChangedSources(seed, byId);

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <SectionCard>
      <View style={styles.titleRow}>
        <Ionicons name="sparkles-outline" size={20} color={theme.colors.accent} />
        <Text style={styles.title} accessibilityRole="header">
          {status === 'reconsidered' ? '以前の考え（種として考え直し中）' : 'できそうなこと（芽）'}
        </Text>
      </View>

      {hasDraft && onResumeDraft ? (
        <View style={styles.draft}>
          <Text style={styles.draftText}>芽の下書きがあります。</Text>
          <AnimatedPressable onPress={onResumeDraft} style={styles.smallPrimary} haptic="light" accessibilityRole="button" accessibilityLabel="芽の下書きの続きを書く">
            <Text style={styles.smallPrimaryText}>続きを書く</Text>
          </AnimatedPressable>
        </View>
      ) : null}

      {synthesis ? (
        <>
          <Text style={styles.statement}>{synthesis.statement}</Text>
          <Text style={styles.meta}>
            {status === 'current' ? `芽にした日: ${formatDate(synthesis.promotedAt)}` : `最後に書いた日: ${formatDate(synthesis.updatedAt)}`}
            {changed ? ' ・ 材料に更新あり' : ''}
          </Text>
          {status === 'reconsidered' ? (
            <Text style={styles.note}>いまは現在の芽として数えていません。考えと材料は、そのまま残っています。</Text>
          ) : null}

          <View style={styles.row}>
            {onReview ? (
              <AnimatedPressable
                onPress={onReview}
                style={styles.smallPrimary}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={status === 'reconsidered' ? 'この考えで芽にし直す' : '芽を見直す'}
              >
                <Text style={styles.smallPrimaryText}>{status === 'reconsidered' ? 'この考えで芽にし直す' : '芽を見直す'}</Text>
              </AnimatedPressable>
            ) : null}
            {status === 'current' && onReconsider ? (
              <AnimatedPressable
                onPress={onReconsider}
                style={styles.small}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel="種として考え直す。考えと材料は残ります"
              >
                <Text style={styles.smallText}>種として考え直す</Text>
              </AnimatedPressable>
            ) : null}
          </View>

          <Text style={styles.subTitle}>この芽を作ったときの材料</Text>
          <Text style={styles.note}>芽をまとめたときに読んだ文章です。あとから元のメモを直しても、ここは変わりません。つながりを外しても、材料は残ります。</Text>
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
                  <Text style={styles.sourceNote}>元のメモは「最近削除した種」にあります。復元すると、内容を読めます。</Text>
                ) : state.kind === 'missing' ? (
                  <Text style={styles.sourceNote}>元のメモが見つかりません。</Text>
                ) : (
                  <Text style={styles.sourceText} numberOfLines={expanded ? undefined : 3}>
                    {source.textSnapshot}
                  </Text>
                )}
                {state.kind === 'changed' ? (
                  <Text style={styles.changed}>材料に更新あり。現在のメモ: 「{toSeedSnippet({ body: state.currentText }, 40)}」</Text>
                ) : null}
                <View style={styles.row}>
                  {state.kind !== 'deleted' && state.kind !== 'missing' && isLongText(source.textSnapshot, 60) ? (
                    <AnimatedPressable onPress={() => toggle(key)} style={styles.small} haptic="light" accessibilityRole="button" accessibilityLabel={expanded ? '材料を閉じる' : '材料の全文を読む'}>
                      <Text style={styles.smallText}>{expanded ? '閉じる' : '全文'}</Text>
                    </AnimatedPressable>
                  ) : null}
                  {onOpenSeed && origin && !origin.deletedAt && source.seedId !== seed.id ? (
                    <AnimatedPressable onPress={() => onOpenSeed(source.seedId)} style={styles.small} haptic="light" accessibilityRole="button" accessibilityLabel={`材料の元のメモを開く。${toSeedSnippet(origin, 20)}`}>
                      <Text style={styles.smallText}>元のメモを開く</Text>
                    </AnimatedPressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </>
      ) : status === 'legacy' ? (
        <>
          <Text style={styles.note}>
            以前からの育ち状態（{growthStateLabels[seed.growthState]}）です。芽の文章はまだ書かれていません。材料を見ながら、書いてみることもできます。
          </Text>
          {onCreate ? <CreateButton onPress={onCreate} /> : null}
        </>
      ) : (
        <>
          <Text style={styles.note}>つないだメモや、保存済みのメモを材料に、「なら、こうできそう」を一言で残せます。芽にするかどうかは自由です。</Text>
          {onCreate ? <CreateButton onPress={onCreate} /> : null}
        </>
      )}
    </SectionCard>
  );
}

function CreateButton({ onPress }: { onPress: () => void }) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={styles.create}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel="このメモから芽をつくる"
    >
      <Ionicons name="leaf-outline" size={18} color="#ffffff" />
      <Text style={styles.createText}>ここから芽をつくる</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text, flexShrink: 1 },
  statement: { fontSize: 18, lineHeight: 29, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.primary },
  meta: { fontSize: 13, color: theme.colors.textSoft },
  note: { fontSize: 13, lineHeight: 19, color: theme.colors.textMuted },
  subTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.textMuted, marginTop: theme.spacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  source: { gap: 6, padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.colors.rule },
  sourceLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  sourceText: { fontSize: 14, lineHeight: 22, fontFamily: theme.fonts.serif, color: theme.colors.text },
  sourceNote: { fontSize: 13, lineHeight: 19, color: theme.colors.textMuted },
  changed: { fontSize: 13, lineHeight: 19, color: theme.colors.accent, fontWeight: '600' },
  small: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: theme.radius.full, backgroundColor: theme.colors.chipBg, borderWidth: 1, borderColor: theme.colors.border },
  smallText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  smallPrimary: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: theme.radius.full, backgroundColor: theme.colors.leaf, borderWidth: 1, borderColor: theme.colors.chipSelectedBorder },
  smallPrimaryText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  draft: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.primarySoft },
  draftText: { fontSize: 14, fontWeight: '600', color: theme.colors.text, flex: 1 },
  create: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary },
  createText: { fontSize: theme.typography.body, fontWeight: '700', color: '#ffffff' },
});

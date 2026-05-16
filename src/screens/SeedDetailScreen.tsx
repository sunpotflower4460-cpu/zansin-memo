import * as React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipSelector } from '../components/ChipSelector';
import { EmptyState } from '../components/EmptyState';
import { IOSChip } from '../components/IOSChip';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import {
  GROWTH_STATE_OPTIONS,
  IMPORTANCE_OPTIONS,
  MOOD_OPTIONS,
  TRANSFORM_TYPES,
  type GrowthState,
  type Importance,
  type Mood,
  type Seed,
  type SeedUpdateInput,
  type TransformOutput,
  type TransformType,
} from '../domain/types';
import { pressedOpacity, theme } from '../styles/theme';
import { triggerLightFeedback } from '../utils/feedback';
import { growthStateLabels, moodLabels, transformLabels } from '../utils/displayLabels';
import { formatDate, parseTags } from '../utils/seedUtils';

type SeedDetailScreenProps = {
  seed: Seed;
  allSeeds: Seed[];
  onBack: () => void;
  onSave: (seedId: string, payload: SeedUpdateInput) => void;
  onDelete: (seedId: string) => void;
  onCreateTransform: (seedId: string, type: TransformType) => void;
};

type DraftState = {
  title: string;
  body: string;
  tags: string;
  mood?: Mood;
  growthState: GrowthState;
  importance: Importance;
  relatedSeedIds: string[];
};

const toDraft = (seed: Seed): DraftState => ({
  title: seed.title ?? '',
  body: seed.body,
  tags: seed.tags.join(', '),
  mood: seed.mood,
  growthState: seed.growthState,
  importance: seed.importance,
  relatedSeedIds: seed.relatedSeedIds,
});

const MAX_RELATED_CHIP_LABEL_LENGTH = 16;

export function SeedDetailScreen({ seed, allSeeds, onBack, onSave, onDelete, onCreateTransform }: SeedDetailScreenProps) {
  const [draft, setDraft] = React.useState<DraftState>(() => toDraft(seed));
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  React.useEffect(() => {
    setDraft(toDraft(seed));
  }, [seed]);

  const relatedCandidates = allSeeds.filter((item) => item.id !== seed.id).slice(0, 20);
  const transformOutputs: TransformOutput[] = seed.transformOutputs ?? [];
  const canSave = draft.body.trim().length > 0;

  const toggleRelatedSeed = (relatedSeedId: string) => {
    setDraft((current) => {
      const has = current.relatedSeedIds.includes(relatedSeedId);
      return {
        ...current,
        relatedSeedIds: has ? current.relatedSeedIds.filter((id) => id !== relatedSeedId) : [...current.relatedSeedIds, relatedSeedId],
      };
    });
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressedOpacity({ pressed })]}
          accessibilityRole="button"
          accessibilityLabel="戻る"
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
          <Text style={styles.backButtonText}>戻る</Text>
        </Pressable>

        <Text style={styles.heading}>種の詳細</Text>
        <Text style={styles.dateText}>作成: {formatDate(seed.createdAt)} / 更新: {formatDate(seed.updatedAt)}</Text>

        <SectionCard>
          <TextInput
            value={draft.body}
            onChangeText={(body) => setDraft((prev) => ({ ...prev, body }))}
            style={styles.bodyInput}
            multiline
            textAlignVertical="top"
            placeholder="種のことば"
            placeholderTextColor="#95a1ac"
          />
          <TextInput
            value={draft.title}
            onChangeText={(title) => setDraft((prev) => ({ ...prev, title }))}
            style={styles.titleInput}
            placeholder="タイトル（任意）"
            placeholderTextColor="#9ca8b3"
          />

          <Pressable onPress={() => setDetailsOpen((value) => !value)} style={({ pressed }) => [styles.toggle, pressedOpacity({ pressed })]}>
            <Text style={styles.toggleText}>詳細を編集する</Text>
            <Ionicons name={detailsOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={16} color={theme.colors.textMuted} />
          </Pressable>

          {detailsOpen ? (
            <View>
              <ChipSelector<Mood>
                label="気分"
                options={MOOD_OPTIONS}
                selectedValue={draft.mood}
                onChange={(mood) => setDraft((prev) => ({ ...prev, mood }))}
                allowClear
                getLabel={(mood) => moodLabels[mood]}
              />

              <ChipSelector<Importance>
                label="大切度"
                options={IMPORTANCE_OPTIONS}
                selectedValue={draft.importance}
                onChange={(importance) => setDraft((prev) => ({ ...prev, importance: importance ?? 3 }))}
              />

              <ChipSelector<GrowthState>
                label="育ち方"
                options={GROWTH_STATE_OPTIONS}
                selectedValue={draft.growthState}
                onChange={(growthState) => setDraft((prev) => ({ ...prev, growthState: growthState ?? 'seed' }))}
                getLabel={(state) => growthStateLabels[state]}
              />

              <View style={styles.fieldWrap}>
                <Text style={styles.label}>カテゴリ（任意）</Text>
                <TextInput value={draft.tags} onChangeText={(tags) => setDraft((prev) => ({ ...prev, tags }))} style={styles.input} />
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.label}>関連する種（任意）</Text>
                {relatedCandidates.length === 0 ? (
                  <Text style={styles.emptyText}>他の種が作成されるとここで紐づけできます。</Text>
                ) : (
                  <View style={styles.relatedList}>
                    {relatedCandidates.map((candidate) => {
                      const selected = draft.relatedSeedIds.includes(candidate.id);
                      return (
                        <IOSChip
                          key={candidate.id}
                          label={
                            candidate.body.length > MAX_RELATED_CHIP_LABEL_LENGTH
                              ? `${candidate.body.slice(0, MAX_RELATED_CHIP_LABEL_LENGTH)}…`
                              : candidate.body
                          }
                          selected={selected}
                          onPress={() => toggleRelatedSeed(candidate.id)}
                        />
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          ) : null}

          <PrimaryButton
            label="変更を保存"
            disabled={!canSave}
            onPress={() => {
              if (!canSave) {
                Alert.alert('保存前に', '種のことばだけ、少し残しておきましょう。');
                return;
              }

              onSave(seed.id, {
                title: draft.title,
                body: draft.body,
                mood: draft.mood,
                importance: draft.importance,
                growthState: draft.growthState,
                tags: parseTags(draft.tags),
                relatedSeedIds: draft.relatedSeedIds,
              });
            }}
          />
        </SectionCard>

        <SectionCard muted>
          <Text style={styles.sectionTitle}>この種を育てる</Text>
          <Text style={styles.hintText}>問いや行動の候補として、やさしく変換します。</Text>
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
          {transformOutputs.length === 0 ? (
            <EmptyState icon="sparkles-outline" title="まだ変換結果はありません" description="必要なときに候補を作ってみましょう。" />
          ) : (
            transformOutputs
              .slice()
              .reverse()
              .map((output) => (
                <View key={output.id} style={styles.outputCard}>
                  <Text style={styles.outputType}>{transformLabels[output.type]}</Text>
                  <Text style={styles.outputBody}>{output.content}</Text>
                  <Text style={styles.outputDate}>{formatDate(output.createdAt)}</Text>
                </View>
              ))
          )}
        </SectionCard>

        <Pressable
          onPress={() =>
            Alert.alert('種を削除しますか？', 'この操作は元に戻せません。', [
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
          style={({ pressed }) => [styles.deleteButton, pressedOpacity({ pressed })]}
        >
          <Text style={styles.deleteButtonText}>種を削除</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: 110,
    gap: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#eaf1ea',
    gap: 2,
  },
  backButtonText: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: '500',
  },
  heading: {
    fontSize: theme.typography.title,
    fontWeight: '700',
    color: theme.colors.text,
  },
  dateText: {
    color: theme.colors.textSoft,
    fontSize: 12,
  },
  bodyInput: {
    minHeight: 140,
    borderRadius: theme.radius.md,
    backgroundColor: '#f9fbf8',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
    color: theme.colors.text,
    lineHeight: 24,
  },
  titleInput: {
    borderRadius: theme.radius.sm,
    minHeight: 40,
    paddingHorizontal: 10,
    backgroundColor: '#f5f8f4',
    fontSize: 14,
    color: theme.colors.text,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  toggleText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  fieldWrap: {
    marginTop: 6,
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
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
  relatedList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  hintText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  outputCard: {
    borderTopWidth: 1,
    borderTopColor: '#dbe4dd',
    paddingTop: 10,
    gap: 4,
  },
  outputType: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  outputBody: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 21,
  },
  outputDate: {
    fontSize: 11,
    color: theme.colors.textSoft,
  },
  deleteButton: {
    minHeight: 44,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f4b0b7',
    backgroundColor: theme.colors.dangerBg,
  },
  deleteButtonText: {
    color: theme.colors.dangerText,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
});

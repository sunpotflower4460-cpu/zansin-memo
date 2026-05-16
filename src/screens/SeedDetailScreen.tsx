import * as React from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipSelector } from '../components/ChipSelector';
import {
  GROWTH_STATE_OPTIONS,
  IMPORTANCE_OPTIONS,
  MOOD_OPTIONS,
  TRANSFORM_TYPES,
  type GrowthState,
  type Importance,
  type Mood,
  type Seed,
  type TransformOutput,
  type TransformType,
} from '../domain/types';
import { formatDate, parseTags } from '../utils/seedUtils';

type SeedDetailScreenProps = {
  seed: Seed;
  allSeeds: Seed[];
  onBack: () => void;
  onSave: (seedId: string, payload: Partial<Seed>) => void;
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

const transformLabel: Record<TransformType, string> = {
  question: '問い',
  task: 'タスク',
  article: '記事案',
  project: 'プロジェクト案',
};

export function SeedDetailScreen({ seed, allSeeds, onBack, onSave, onDelete, onCreateTransform }: SeedDetailScreenProps) {
  const [draft, setDraft] = React.useState<DraftState>(() => toDraft(seed));

  React.useEffect(() => {
    setDraft(toDraft(seed));
  }, [seed]);

  const relatedCandidates = allSeeds.filter((item) => item.id !== seed.id).slice(0, 20);
  const transformOutputs: TransformOutput[] = seed.transformOutputs ?? [];

  const toggleRelatedSeed = (relatedSeedId: string) => {
    setDraft((current) => {
      const has = current.relatedSeedIds.includes(relatedSeedId);
      return {
        ...current,
        relatedSeedIds: has
          ? current.relatedSeedIds.filter((id) => id !== relatedSeedId)
          : [...current.relatedSeedIds, relatedSeedId],
      };
    });
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← 戻る</Text>
        </Pressable>

        <Text style={styles.heading}>Seed Detail</Text>
        <Text style={styles.dateText}>作成: {formatDate(seed.createdAt)} / 更新: {formatDate(seed.updatedAt)}</Text>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>タイトル（任意）</Text>
          <TextInput value={draft.title} onChangeText={(title) => setDraft((prev) => ({ ...prev, title }))} style={styles.input} />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>本文</Text>
          <TextInput
            value={draft.body}
            onChangeText={(body) => setDraft((prev) => ({ ...prev, body }))}
            style={[styles.input, styles.bodyInput]}
            multiline
            textAlignVertical="top"
          />
        </View>

        <ChipSelector<Mood>
          label="気分"
          options={MOOD_OPTIONS}
          selectedValue={draft.mood}
          onChange={(mood) => setDraft((prev) => ({ ...prev, mood }))}
          allowClear
        />

        <ChipSelector<Importance>
          label="重要度"
          options={IMPORTANCE_OPTIONS}
          selectedValue={draft.importance}
          onChange={(importance) => setDraft((prev) => ({ ...prev, importance: importance ?? 3 }))}
        />

        <ChipSelector<GrowthState>
          label="育ち方"
          options={GROWTH_STATE_OPTIONS}
          selectedValue={draft.growthState}
          onChange={(growthState) => setDraft((prev) => ({ ...prev, growthState: growthState ?? 'seed' }))}
        />

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>カテゴリ（保存キー: tags）</Text>
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
                  <Pressable
                    key={candidate.id}
                    onPress={() => toggleRelatedSeed(candidate.id)}
                    style={[styles.relatedItem, selected && styles.relatedItemSelected]}
                  >
                    <Text numberOfLines={2} style={[styles.relatedText, selected && styles.relatedTextSelected]}>
                      {candidate.body}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <Pressable
          onPress={() =>
            onSave(seed.id, {
              title: draft.title,
              body: draft.body,
              mood: draft.mood,
              importance: draft.importance,
              growthState: draft.growthState,
              tags: parseTags(draft.tags),
              relatedSeedIds: draft.relatedSeedIds,
            })
          }
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>変更を保存</Text>
        </Pressable>

        <View style={styles.transformSection}>
          <Text style={styles.sectionTitle}>変換アクション</Text>
          <Text style={styles.hintText}>提案として保存できます。押しつけにはしません。</Text>
          <View style={styles.rowWrap}>
            {TRANSFORM_TYPES.map((type) => (
              <Pressable key={type} onPress={() => onCreateTransform(seed.id, type)} style={styles.transformButton}>
                <Text style={styles.transformButtonText}>{transformLabel[type]}にする</Text>
              </Pressable>
            ))}
          </View>
          {transformOutputs.length === 0 ? (
            <Text style={styles.emptyText}>まだ変換結果はありません。</Text>
          ) : (
            transformOutputs
              .slice()
              .reverse()
              .map((output) => (
                <View key={output.id} style={styles.outputCard}>
                  <Text style={styles.outputType}>{transformLabel[output.type]}</Text>
                  <Text style={styles.outputBody}>{output.content}</Text>
                  <Text style={styles.outputDate}>{formatDate(output.createdAt)}</Text>
                </View>
              ))
          )}
        </View>

        <Pressable
          onPress={() =>
            Alert.alert('種を削除しますか？', 'この操作は元に戻せません。', [
              { text: 'キャンセル', style: 'cancel' },
              { text: '削除', style: 'destructive', onPress: () => onDelete(seed.id) },
            ])
          }
          style={styles.deleteButton}
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
    padding: 16,
    paddingBottom: 120,
    gap: 14,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  backButtonText: {
    color: '#334155',
    fontSize: 14,
  },
  heading: {
    fontSize: 27,
    fontWeight: '700',
    color: '#0f172a',
  },
  dateText: {
    color: '#64748b',
    fontSize: 12,
  },
  fieldWrap: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: '#334155',
  },
  input: {
    borderWidth: 1,
    borderColor: '#dbe3ed',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#0f172a',
  },
  bodyInput: {
    minHeight: 110,
  },
  relatedList: {
    gap: 8,
  },
  relatedItem: {
    borderWidth: 1,
    borderColor: '#dbe3ed',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#ffffff',
  },
  relatedItemSelected: {
    borderColor: '#8bc7af',
    backgroundColor: '#e7f7ef',
  },
  relatedText: {
    color: '#334155',
    fontSize: 14,
  },
  relatedTextSelected: {
    color: '#0f5132',
    fontWeight: '600',
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1d7a53',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  transformSection: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  hintText: {
    fontSize: 13,
    color: '#64748b',
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  transformButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bfd9cc',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  transformButtonText: {
    color: '#166534',
    fontSize: 13,
  },
  outputCard: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
    gap: 4,
  },
  outputType: {
    fontSize: 12,
    color: '#64748b',
  },
  outputBody: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 21,
  },
  outputDate: {
    fontSize: 11,
    color: '#94a3b8',
  },
  deleteButton: {
    minHeight: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fff1f2',
  },
  deleteButtonText: {
    color: '#b91c1c',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
  },
});

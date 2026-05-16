import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipSelector } from '../components/ChipSelector';
import {
  GROWTH_STATE_OPTIONS,
  IMPORTANCE_OPTIONS,
  MOOD_OPTIONS,
  type GrowthState,
  type Importance,
  type Mood,
  type SeedCreateInput,
} from '../domain/types';
import { parseTags } from '../utils/seedUtils';

type WriteScreenProps = {
  draft: {
    title: string;
    body: string;
    tags: string;
    mood?: Mood;
    growthState: GrowthState;
    importance: Importance;
  };
  onChange: (value: Partial<WriteScreenProps['draft']>) => void;
  onSave: (input: SeedCreateInput) => void;
};

export function WriteScreen({ draft, onChange, onSave }: WriteScreenProps) {
  const saveDisabled = draft.body.trim().length === 0;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Write</Text>
        <Text style={styles.subheading}>一言だけでも大丈夫。まだ種のままで保存できます。</Text>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>タイトル（任意）</Text>
          <TextInput
            value={draft.title}
            onChangeText={(title) => onChange({ title })}
            style={styles.input}
            placeholder="例: 朝の散歩で浮かんだこと"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>種のことば</Text>
          <TextInput
            value={draft.body}
            onChangeText={(body) => onChange({ body })}
            style={[styles.input, styles.bodyInput]}
            placeholder="思いつき、直感、違和感をそのまま。"
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
          />
        </View>

        <ChipSelector<Mood>
          label="気分（任意）"
          options={MOOD_OPTIONS}
          selectedValue={draft.mood}
          onChange={(mood) => onChange({ mood })}
          allowClear
        />

        <ChipSelector<Importance>
          label="重要度"
          options={IMPORTANCE_OPTIONS}
          selectedValue={draft.importance}
          onChange={(importance) => onChange({ importance })}
        />

        <ChipSelector<GrowthState>
          label="育ち方"
          options={GROWTH_STATE_OPTIONS}
          selectedValue={draft.growthState}
          onChange={(growthState) => onChange({ growthState })}
        />

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>カテゴリ（保存キー: tags）</Text>
          <TextInput
            value={draft.tags}
            onChangeText={(tags) => onChange({ tags })}
            style={styles.input}
            placeholder="例: 企画, 感覚, 執筆"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
          />
          <Text style={styles.hint}>カンマ区切りで複数入力できます。空でもOKです。</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={saveDisabled}
          onPress={() =>
            onSave({
              title: draft.title,
              body: draft.body,
              mood: draft.mood,
              importance: draft.importance,
              growthState: draft.growthState,
              tags: parseTags(draft.tags),
            })
          }
          style={[styles.saveButton, saveDisabled && styles.saveButtonDisabled]}
        >
          <Text style={styles.saveButtonText}>種を保存する</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  heading: {
    fontSize: 27,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  subheading: {
    color: '#64748b',
    lineHeight: 22,
    marginBottom: 16,
  },
  fieldWrap: {
    marginBottom: 14,
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
    minHeight: 130,
  },
  hint: {
    color: '#64748b',
    fontSize: 12,
  },
  saveButton: {
    marginTop: 6,
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#1d7a53',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

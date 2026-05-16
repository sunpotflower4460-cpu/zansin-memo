import * as React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChipSelector } from '../components/ChipSelector';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import {
  GROWTH_STATE_OPTIONS,
  IMPORTANCE_OPTIONS,
  MOOD_OPTIONS,
  type GrowthState,
  type Importance,
  type Mood,
  type SeedCreateInput,
} from '../domain/types';
import { pressedOpacity, theme } from '../styles/theme';
import { parseTags } from '../utils/seedUtils';
import { growthStateLabels, moodLabels } from '../utils/displayLabels';

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
  const insets = useSafeAreaInsets();
  const saveDisabled = draft.body.trim().length === 0;
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const contentStyle = [styles.content, { paddingBottom: Math.max(150, insets.bottom + 110) }];
  const bottomBarStyle = [styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>種を書く</Text>
        <Text style={styles.subheading}>きれいにまとめなくても大丈夫です。</Text>

        <SectionCard>
          <Text style={styles.bodyLabel}>今の種</Text>
          <TextInput
            value={draft.body}
            onChangeText={(body) => onChange({ body })}
            style={styles.bodyInput}
            placeholder="今浮かんだことを、そのまま置いてください。"
            placeholderTextColor="#8f9ba6"
            multiline
            textAlignVertical="top"
          />

          <TextInput
            value={draft.title}
            onChangeText={(title) => onChange({ title })}
            style={styles.titleInput}
            placeholder="タイトル（任意）"
            placeholderTextColor="#9aa6b2"
          />
        </SectionCard>

        <SectionCard muted>
          <Pressable onPress={() => setDetailsOpen((value) => !value)} style={({ pressed }) => [styles.detailToggle, pressedOpacity({ pressed })]}>
            <View style={styles.detailLabelWrap}>
              <Ionicons name="options-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.detailTitle}>気分やカテゴリを添える</Text>
            </View>
            <Ionicons name={detailsOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} color={theme.colors.textMuted} />
          </Pressable>

          {detailsOpen ? (
            <View>
              <ChipSelector<Mood>
                label="気分（任意）"
                options={MOOD_OPTIONS}
                selectedValue={draft.mood}
                onChange={(mood) => onChange({ mood })}
                allowClear
                getLabel={(mood) => moodLabels[mood]}
              />

              <ChipSelector<Importance>
                label="大切度"
                options={IMPORTANCE_OPTIONS}
                selectedValue={draft.importance}
                onChange={(importance) => onChange({ importance })}
              />

              <ChipSelector<GrowthState>
                label="育ち方"
                options={GROWTH_STATE_OPTIONS}
                selectedValue={draft.growthState}
                onChange={(growthState) => onChange({ growthState })}
                getLabel={(state) => growthStateLabels[state]}
              />

              <View style={styles.fieldWrap}>
                <Text style={styles.label}>カテゴリ（保存キー: tags）</Text>
                <TextInput
                  value={draft.tags}
                  onChangeText={(tags) => onChange({ tags })}
                  style={styles.input}
                  placeholder="例: 企画, 感覚, 執筆"
                  placeholderTextColor="#9aa6b2"
                  autoCapitalize="none"
                />
                <Text style={styles.hint}>カンマ区切りで複数入力できます。空でもOKです。</Text>
              </View>
            </View>
          ) : null}
        </SectionCard>
      </ScrollView>

      <View style={bottomBarStyle}>
        <PrimaryButton
          label="種を保存する"
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
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  heading: {
    fontSize: theme.typography.title,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subheading: {
    color: theme.colors.textMuted,
    lineHeight: 22,
    marginBottom: 2,
  },
  bodyLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.subbody,
  },
  bodyInput: {
    minHeight: 180,
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
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailTitle: {
    fontSize: theme.typography.subbody,
    color: theme.colors.text,
    fontWeight: '600',
  },
  fieldWrap: {
    marginTop: 2,
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
  hint: {
    color: theme.colors.textSoft,
    fontSize: 12,
  },
  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 10,
  },
});

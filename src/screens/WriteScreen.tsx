import * as React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ChipSelector } from '../components/ChipSelector';
import { FadeInView } from '../components/FadeInView';
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
import { theme } from '../styles/theme';
import { parseTags } from '../utils/seedUtils';
import { growthStateHints, growthStateLabels, moodLabels } from '../utils/displayLabels';

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
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const saveAccessibilityHint = saveDisabled ? '種のことばを入力するとまけます。' : '今の内容で種をまきます。';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <Text style={styles.heading} accessibilityRole="header">
          種をまく
        </Text>
        <Text style={styles.subheading}>
          思いついたことを、ひとことで。きれいにまとめなくても、タイトルがなくても大丈夫です。あとから育てられます。
        </Text>

        <FadeInView delayMs={40}>
          <SectionCard>
          <Text style={styles.bodyLabel}>いま浮かんでいること</Text>
          <TextInput
            value={draft.body}
            onChangeText={(body) => onChange({ body })}
            style={styles.bodyInput}
            placeholder="例：朝の光の中だと、考えがまとまりやすい気がする"
            placeholderTextColor={theme.colors.placeholder}
            multiline
            autoFocus
            textAlignVertical="top"
            accessibilityLabel="種のことば"
          />

          <TextInput
            value={draft.title}
            onChangeText={(title) => onChange({ title })}
            style={styles.titleInput}
            placeholder="タイトル（任意）"
            placeholderTextColor={theme.colors.placeholder}
            returnKeyType="done"
            accessibilityLabel="タイトル"
          />
          </SectionCard>
        </FadeInView>

        <FadeInView delayMs={90}>
          <SectionCard muted>
          <AnimatedPressable
            onPress={() => setDetailsOpen((value) => !value)}
            style={styles.detailToggle}
            haptic="light"
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsOpen }}
            accessibilityLabel="気分やカテゴリの詳細"
          >
            <View style={styles.detailLabelWrap}>
              <Ionicons name="options-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.detailTitle}>気分やカテゴリを添える</Text>
            </View>
            <Ionicons name={detailsOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} color={theme.colors.textMuted} />
          </AnimatedPressable>

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
                label="大切度（1〜5）"
                options={IMPORTANCE_OPTIONS}
                selectedValue={draft.importance}
                onChange={(importance) => onChange({ importance })}
              />
              <Text style={styles.stateHint}>大切なほど、あとで「今日の種」に選ばれやすくなります。</Text>

              <ChipSelector<GrowthState>
                label="育ち方"
                options={GROWTH_STATE_OPTIONS}
                selectedValue={draft.growthState}
                onChange={(growthState) => onChange({ growthState })}
                getLabel={(state) => growthStateLabels[state]}
              />
              <Text style={styles.stateHint}>{growthStateHints[draft.growthState]}</Text>

              <View style={styles.fieldWrap}>
                <Text style={styles.label}>カテゴリ（任意）</Text>
                <TextInput
                  value={draft.tags}
                  onChangeText={(tags) => onChange({ tags })}
                  style={styles.input}
                  placeholder="例: 企画, 感覚, 執筆"
                  placeholderTextColor={theme.colors.placeholder}
                  autoCapitalize="none"
                  accessibilityLabel="カテゴリ"
                />
                <Text style={styles.hint}>カンマ区切りで複数入力できます。空でもOKです。</Text>
              </View>
            </View>
          ) : null}
          </SectionCard>
        </FadeInView>
      </ScrollView>

      <View style={styles.bottomBar}>
        <PrimaryButton
          label="種をまく"
          disabled={saveDisabled}
          accessibilityHint={saveAccessibilityHint}
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
    paddingTop: theme.spacing.lg,
    paddingBottom: 120,
    gap: theme.spacing.md,
  },
  heading: {
    fontSize: theme.typography.title,
    fontWeight: '700',
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
  },
  stateHint: {
    marginTop: -8,
    marginBottom: 14,
    fontSize: 13,
    color: theme.colors.textSoft,
  },
  subheading: {
    color: theme.colors.textMuted,
    lineHeight: 22,
    marginBottom: 4,
  },
  bodyLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.subbody,
    marginBottom: 6,
  },
  bodyInput: {
    minHeight: 220,
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
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.inputBgSoft,
    fontSize: 15,
    color: theme.colors.text,
  },
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    minHeight: 44,
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
    fontSize: 13,
  },
  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
  },
});

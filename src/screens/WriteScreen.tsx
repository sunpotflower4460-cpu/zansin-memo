import * as React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ChipSelector } from '../components/ChipSelector';
import { HelpButton } from '../components/HelpButton';
import { helpTexts } from '../utils/helpTexts';
import { FadeInView } from '../components/FadeInView';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import {
  IMPORTANCE_OPTIONS,
  MOOD_OPTIONS,
  type GrowthState,
  type Importance,
  type Mood,
  type Seed,
  type SeedCreateInput,
} from '../domain/types';
import { theme } from '../styles/theme';
import { parseTags } from '../utils/seedUtils';
import { toSeedSnippet } from '../utils/seedText';
import { moodLabels } from '../utils/displayLabels';

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
  /** 「メモを足す」で、いまつなぐ先にしている種（中心）。 */
  addTo?: Seed;
  /** 単独のメモとして残す（本文は消さない）。 */
  standalone: boolean;
  /** 保存の確定を待っている間は、二重に押せない。 */
  saving: boolean;
  onToggleStandalone: () => void;
  onClearTarget: () => void;
  /** 直前に保存したメモ。あれば「保存しました」のカードを出す。 */
  savedMemo?: Seed;
  /** はじめて保存したときだけ、あとからつなげられることを一言添える。 */
  isFirstSave: boolean;
  /** 保存したメモのつながりの数。つないだら、芽を書く入口を出す。 */
  savedLinkCount: number;
  onWriteSprout: () => void;
  onConnectSaved: () => void;
  onDismissSaved: () => void;
  onOpenSaved: () => void;
  onSave: (input: SeedCreateInput) => void | Promise<void>;
};

export function WriteScreen({
  draft,
  onChange,
  addTo,
  standalone,
  saving,
  onToggleStandalone,
  onClearTarget,
  savedMemo,
  isFirstSave,
  savedLinkCount,
  onWriteSprout,
  onConnectSaved,
  onDismissSaved,
  onOpenSaved,
  onSave,
}: WriteScreenProps) {
  const saveDisabled = draft.body.trim().length === 0 || saving;
  const connecting = Boolean(addTo) && !standalone;
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const saveAccessibilityHint = saveDisabled ? '本文を入力すると保存できます。' : '今の内容を保存します。';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <View style={styles.headingRow}>
          <Text style={styles.heading} accessibilityRole="header">
            メモを書く
          </Text>
          <HelpButton content={helpTexts.write} />
        </View>
        <Text style={styles.subheading}>なんとなくでも、そのままで大丈夫。</Text>

        {savedMemo ? (
          <View style={styles.savedCard} accessible={false}>
            <View style={styles.savedTitleRow}>
              <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
              <Text style={styles.savedTitle} accessibilityLiveRegion="polite">
                保存しました
              </Text>
            </View>
            <AnimatedPressable
              onPress={onOpenSaved}
              style={styles.savedBody}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={`保存したメモを開く。${toSeedSnippet(savedMemo, 40)}`}
            >
              <Text style={styles.savedText} numberOfLines={3}>
                {toSeedSnippet(savedMemo, 80)}
              </Text>
            </AnimatedPressable>
            {savedLinkCount > 0 ? (
              <AnimatedPressable
                onPress={onWriteSprout}
                style={styles.sproutButton}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`つなぎました（${savedLinkCount}件）。思いついたことを書いて芽にする`}
              >
                <Ionicons name="create-outline" size={18} color="#ffffff" />
                <Text style={styles.sproutButtonText}>思いついたことを書く（芽にする）</Text>
              </AnimatedPressable>
            ) : isFirstSave ? (
              <Text style={styles.savedHint}>関係することを思いついたら、あとからつなげられます。</Text>
            ) : null}
            <View style={styles.savedActions}>
              <AnimatedPressable
                onPress={onConnectSaved}
                containerStyle={styles.savedActionContainer}
                style={styles.savedAction}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel="保存したメモを、別のメモとつなぐ"
              >
                <Ionicons name="link-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.savedActionText}>別のメモとつなぐ</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={onDismissSaved}
                containerStyle={styles.savedActionContainer}
                style={styles.savedAction}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel="続けて書く"
              >
                <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.savedActionText}>続けて書く</Text>
              </AnimatedPressable>
            </View>
          </View>
        ) : null}

        {addTo ? (
          <View style={styles.continuation}>
            <Ionicons name={connecting ? 'git-branch-outline' : 'document-outline'} size={20} color={theme.colors.primary} />
            <View style={styles.continuationBody}>
              <Text style={styles.continuationLabel}>{connecting ? 'このメモにつなげます' : '単独のメモとして残します'}</Text>
              <Text style={styles.continuationText} numberOfLines={2}>
                {toSeedSnippet(addTo, 40)}
              </Text>
              <AnimatedPressable
                onPress={onToggleStandalone}
                style={styles.toggleLink}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={connecting ? '単独のメモとして残すに切り替える。本文は消えません' : 'このメモにつなげるに戻す'}
              >
                <Text style={styles.toggleLinkText}>{connecting ? '単独のメモとして残す' : 'このメモにつなげる'}</Text>
              </AnimatedPressable>
            </View>
            <AnimatedPressable
              onPress={onClearTarget}
              style={styles.continuationClose}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel="つなぎ先の指定をやめる。本文は消えません"
            >
              <Ionicons name="close-circle-outline" size={24} color={theme.colors.textMuted} />
            </AnimatedPressable>
          </View>
        ) : null}

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
            accessibilityLabel="メモの本文"
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
        {saveDisabled ? <Text style={styles.disabledHint}>ひとこと書くと、「保存する」を押せるようになります。</Text> : null}
        <PrimaryButton
          label={saving ? '保存しています…' : connecting ? '保存してつなぐ' : '保存する'}
          accessibilityLabel={connecting ? '保存してつなぐ' : '保存する'}
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
  continuation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.chipSelectedBorder,
  },
  continuationBody: {
    flex: 1,
    gap: 2,
  },
  continuationLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  continuationText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
  },
  toggleLink: {
    minHeight: 36,
    justifyContent: 'center',
  },
  toggleLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  continuationClose: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedCard: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.chipSelectedBorder,
  },
  savedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  savedTitle: { fontSize: theme.typography.body, fontWeight: '700', color: theme.colors.primary },
  savedBody: { minHeight: 44, justifyContent: 'center' },
  savedText: { fontSize: 15, lineHeight: 23, fontFamily: theme.fonts.serif, color: theme.colors.text },
  sproutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary },
  sproutButtonText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  savedHint: { fontSize: 13, lineHeight: 19, color: theme.colors.textMuted },
  savedActions: { flexDirection: 'row', gap: theme.spacing.xs },
  savedActionContainer: { flex: 1 },
  savedAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.chipSelectedBorder,
  },
  savedActionText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  disabledHint: {
    textAlign: 'center',
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xs,
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

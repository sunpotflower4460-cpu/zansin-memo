import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';
import type { HelpContent } from '../utils/helpTexts';
import { AnimatedPressable } from './AnimatedPressable';
import { PrimaryButton } from './PrimaryButton';

type HelpButtonProps = {
  content: HelpContent;
};

// 見出しの横に置く小さな「？」。タップすると、その画面の見かた・使いかたを短く説明する。
export function HelpButton({ content }: HelpButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <AnimatedPressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        haptic="light"
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={`${content.title}の説明を開く`}
      >
        <Ionicons name="help-circle-outline" size={24} color={theme.colors.textMuted} />
      </AnimatedPressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="説明を閉じる">
          <Pressable style={styles.sheet} onPress={() => undefined} accessible={false}>
            <View style={styles.titleRow}>
              <Ionicons name="leaf-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.title} accessibilityRole="header">
                {content.title}
              </Text>
            </View>
            {content.lines.map((line) => (
              <Text key={line} style={styles.line}>
                {line}
              </Text>
            ))}
            <PrimaryButton label="とじる" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(43, 42, 38, 0.45)',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.rule,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.shadows.floating,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  title: {
    fontSize: theme.typography.sectionTitle,
    fontWeight: '700',
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
    flexShrink: 1,
  },
  line: {
    fontSize: theme.typography.body,
    lineHeight: 25,
    color: theme.colors.textMuted,
  },
});

import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../styles/theme';
import { AnimatedPressable } from './AnimatedPressable';

type UndoBarProps = {
  message: string;
  actionLabel: string;
  /** 表示している時間（ms）。過ぎたら閉じる。常設の「芽を見直す」「種として考え直す」からも直せる。 */
  durationMs?: number;
  onAction: () => void;
  onDismiss: () => void;
};

export function UndoBar({ message, actionLabel, durationMs = 12000, onAction, onDismiss }: UndoBarProps) {
  const insets = useSafeAreaInsets();
  React.useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDismiss]);

  return (
    <View style={[styles.bar, { bottom: Math.max(insets.bottom, 12) + 8 }]} accessibilityLiveRegion="polite">
      <Text style={styles.message}>{message}</Text>
      <AnimatedPressable onPress={onAction} style={styles.button} haptic="light" accessibilityRole="button" accessibilityLabel={actionLabel}>
        <Text style={styles.buttonText}>{actionLabel}</Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.xs,
    paddingVertical: 4,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.floating,
  },
  message: { flex: 1, color: '#ffffff', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: theme.radius.md, backgroundColor: 'rgba(255,255,255,0.18)' },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
});

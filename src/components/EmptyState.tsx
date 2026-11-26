import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { theme } from '../styles/theme';

type EmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  icon = 'leaf-outline',
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View
      style={styles.wrap}
      // ボタンがある場合はまとめず、VoiceOverでボタンにも到達できるようにする。
      accessible={!(actionLabel && onAction)}
      accessibilityLabel={`${title}。${description}`}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction ? (
        <AnimatedPressable onPress={onAction} style={styles.action} haptic="light" pressedStyle={styles.actionPressed}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.leaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: theme.typography.subbody,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
  },
  description: {
    fontSize: theme.typography.subbody,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  action: {
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.leaf,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionPressed: {
    backgroundColor: theme.colors.leafPressed,
  },
  actionText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});

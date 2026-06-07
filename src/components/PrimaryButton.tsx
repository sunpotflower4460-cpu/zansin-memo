import { StyleSheet, Text } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { theme } from '../styles/theme';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function PrimaryButton({ label, onPress, disabled, accessibilityLabel = label, accessibilityHint }: PrimaryButtonProps) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      style={[styles.button, disabled && styles.buttonDisabled]}
      pressedStyle={styles.buttonPressed}
    >
      <Text style={styles.label}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.floating,
  },
  buttonPressed: {
    backgroundColor: theme.colors.primaryPressed,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.primaryDisabled,
    shadowOpacity: 0,
    elevation: 0,
  },
  label: {
    color: '#ffffff',
    fontSize: theme.typography.body,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
});

import { Pressable, StyleSheet, Text } from 'react-native';
import { pressedOpacity, theme } from '../styles/theme';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export function PrimaryButton({ label, onPress, disabled }: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, pressedOpacity({ pressed }), disabled && styles.buttonDisabled]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.primaryDisabled,
  },
  label: {
    color: '#ffffff',
    fontSize: theme.typography.body,
    fontWeight: '600',
  },
});

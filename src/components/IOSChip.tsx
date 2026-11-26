import { StyleSheet, Text } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { theme } from '../styles/theme';

type IOSChipProps = {
  label: string;
  accessibilityLabel?: string;
  selected?: boolean;
  onPress: () => void;
};

export function IOSChip({ label, accessibilityLabel, selected, onPress }: IOSChipProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      haptic="light"
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: selected ?? false }}
      style={[styles.chip, selected && styles.chipSelected]}
      pressedStyle={styles.chipPressed}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.chipBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipPressed: {
    backgroundColor: '#e4eee7',
  },
  chipSelected: {
    borderColor: '#8dbca2',
    backgroundColor: '#dceee1',
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  labelSelected: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
});

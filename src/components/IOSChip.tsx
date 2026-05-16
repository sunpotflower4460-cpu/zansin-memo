import { Pressable, StyleSheet, Text } from 'react-native';
import { pressedOpacity, theme } from '../styles/theme';

type IOSChipProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
};

export function IOSChip({ label, selected, onPress }: IOSChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: selected ?? false }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressedOpacity({ pressed })]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
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
    minHeight: 36,
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: '#8dbca2',
    backgroundColor: '#dceee1',
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  labelSelected: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';

type ChipSelectorProps<T extends string | number> = {
  options: readonly T[];
  selectedValue?: T;
  onChange: (value: T | undefined) => void;
  label: string;
  allowClear?: boolean;
};

export function ChipSelector<T extends string | number>({
  options,
  selectedValue,
  onChange,
  label,
  allowClear,
}: ChipSelectorProps<T>) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {allowClear ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onChange(undefined)}
            style={[styles.chip, selectedValue === undefined && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selectedValue === undefined && styles.chipTextSelected]}>なし</Text>
          </Pressable>
        ) : null}
        {options.map((option) => {
          const selected = option === selectedValue;
          return (
            <Pressable
              key={String(option)}
              accessibilityRole="button"
              onPress={() => onChange(option)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{String(option)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 14,
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: '#334155',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#dbe3ed',
  },
  chipSelected: {
    backgroundColor: '#d9efe6',
    borderColor: '#8bc7af',
  },
  chipText: {
    color: '#334155',
    fontSize: 13,
  },
  chipTextSelected: {
    color: '#163c2e',
    fontWeight: '600',
  },
});

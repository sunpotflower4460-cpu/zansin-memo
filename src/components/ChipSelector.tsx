import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { IOSChip } from './IOSChip';
import { theme } from '../styles/theme';
import { chipSelectorOptionsSuffix, chipSelectorScrollHint } from '../utils/displayLabels';

type ChipSelectorProps<T extends string | number> = {
  options: readonly T[];
  selectedValue?: T;
  onChange: (value: T | undefined) => void;
  label: string;
  allowClear?: boolean;
  getLabel?: (value: T) => string;
  clearLabel?: string;
};

export function ChipSelector<T extends string | number>({
  options,
  selectedValue,
  onChange,
  label,
  allowClear,
  getLabel,
  clearLabel = 'なし',
}: ChipSelectorProps<T>) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityLabel={`${label}${chipSelectorOptionsSuffix}`}
        accessibilityHint={chipSelectorScrollHint}
      >
        {allowClear ? (
          <IOSChip label={clearLabel} selected={selectedValue === undefined} onPress={() => onChange(undefined)} />
        ) : null}
        {options.map((option) => {
          const selected = option === selectedValue;
          return (
            <IOSChip key={String(option)} label={getLabel ? getLabel(option) : String(option)} selected={selected} onPress={() => onChange(option)} />
          );
        })}
      </ScrollView>
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
    color: theme.colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 12,
  },
});

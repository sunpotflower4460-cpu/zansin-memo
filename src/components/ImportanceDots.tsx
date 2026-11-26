import { StyleSheet, View } from 'react-native';
import type { Importance } from '../domain/types';
import { theme } from '../styles/theme';

type ImportanceDotsProps = {
  value: Importance;
};

// 大切度を5つの点で静かに示す。数字は読み上げ用のラベルに残す。
export function ImportanceDots({ value }: ImportanceDotsProps) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`大切度${value}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View key={n} style={[styles.dot, n <= value && styles.dotOn]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.chipSelectedBorder,
    backgroundColor: 'transparent',
  },
  dotOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
});

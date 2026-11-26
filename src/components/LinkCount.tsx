import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';

type LinkCountProps = {
  count: number;
};

// 「つながり n」。つながりのある種だけに、静かに添える。
export function LinkCount({ count }: LinkCountProps) {
  if (count <= 0) {
    return null;
  }
  return (
    <View style={styles.row} accessible accessibilityLabel={`つながり${count}件`}>
      <Ionicons name="git-network-outline" size={14} color={theme.colors.primary} />
      <Text style={styles.text}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { GrowthState } from '../domain/types';
import { theme } from '../styles/theme';
import { growthStateLabels } from '../utils/displayLabels';

export const growthIcons: Record<GrowthState, keyof typeof Ionicons.glyphMap> = {
  seed: 'leaf-outline',
  sprout: 'nutrition-outline',
  tree: 'flower-outline',
  archived: 'archive-outline',
};

export const growthAccents: Record<GrowthState, string> = {
  seed: '#8a7646', // 土の色
  sprout: '#4f8a3f', // 若草
  tree: theme.colors.primary,
  archived: '#6f695c', // 古紙の灰
};

type GrowthBadgeProps = {
  state: GrowthState;
};

// 色だけに頼らず、アイコンと文字で育ち方を示す。
export function GrowthBadge({ state }: GrowthBadgeProps) {
  return (
    <View style={styles.badge}>
      <Ionicons name={growthIcons[state]} size={13} color={growthAccents[state]} />
      <Text style={[styles.text, { color: growthAccents[state] }]}>{growthStateLabels[state]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.chipBg,
    borderWidth: 1,
    borderColor: theme.colors.rule,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});

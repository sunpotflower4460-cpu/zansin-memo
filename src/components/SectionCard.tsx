import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '../styles/theme';

type SectionCardProps = {
  children: ReactNode;
  muted?: boolean;
  style?: ViewStyle;
};

export function SectionCard({ children, muted, style }: SectionCardProps) {
  return <View style={[styles.card, muted && styles.muted, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  muted: {
    backgroundColor: theme.colors.surfaceMuted,
  },
});

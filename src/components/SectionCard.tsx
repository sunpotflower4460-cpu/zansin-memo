import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../styles/theme';

type SectionCardProps = {
  children: ReactNode;
  muted?: boolean;
};

export function SectionCard({ children, muted }: SectionCardProps) {
  return <View style={[styles.card, muted && styles.muted]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  muted: {
    backgroundColor: theme.colors.surfaceMuted,
  },
});

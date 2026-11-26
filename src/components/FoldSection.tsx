import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';
import { AnimatedPressable } from './AnimatedPressable';
import { SectionCard } from './SectionCard';

type FoldSectionProps = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  count?: number;
  children: React.ReactNode;
};

/** 見出しだけを並べ、押したときに中身を開く欄。最初は閉じている。 */
export function FoldSection({ title, icon, count, children }: FoldSectionProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <SectionCard muted>
      <AnimatedPressable
        onPress={() => setOpen((value) => !value)}
        style={styles.header}
        haptic="light"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${count === undefined ? '' : `。${count}件`}。開閉`}
      >
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
        <Text style={styles.title}>{title}</Text>
        {count === undefined ? null : <Text style={styles.count}>{count}</Text>}
        <Ionicons name={open ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} color={theme.colors.textMuted} />
      </AnimatedPressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  count: { fontSize: 14, fontWeight: '700', color: theme.colors.textMuted },
  body: { gap: theme.spacing.sm },
});

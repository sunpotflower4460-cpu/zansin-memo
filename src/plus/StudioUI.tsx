import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode, Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';
import { buttonSelectionProps } from './PlusUI';

export type StudioIcon = ComponentProps<typeof Ionicons>['name'];
export const studioColors = {
  page: '#f8f6ef', surface: '#fffdf7', text: '#242d26', muted: '#535f54', rule: '#dedfd2',
  green: '#295341', soft: '#e7eee2', orange: '#985338', apricot: '#f5e8d9',
};

export function IconButton({ label, icon, onPress, disabled, color, background, focusRef }: {
  label: string; icon: StudioIcon; onPress: () => void; disabled?: boolean; color?: string; background?: string; focusRef?: Ref<View>;
}) {
  return <Pressable ref={focusRef} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} onPress={onPress} disabled={disabled}
    style={({ pressed }) => [studioStyles.iconButton, background && { backgroundColor: background }, (disabled || pressed) && studioStyles.quiet]}>
    <Ionicons name={icon} size={20} color={color ?? studioColors.green} />
  </Pressable>;
}

export function StudioTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return <View style={studioStyles.titleRow}>
    <View style={studioStyles.grow}>
      <Text accessibilityRole="header" style={studioStyles.title}>{title}</Text>
      {subtitle && <Text style={studioStyles.muted}>{subtitle}</Text>}
    </View>
    {children}
  </View>;
}

export function StudioAction({ label, icon, onPress, primary, disabled }: {
  label: string; icon?: StudioIcon; onPress: () => void; primary?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} onPress={onPress} disabled={disabled}
    style={({ pressed }) => [studioStyles.action, primary && studioStyles.primary, (pressed || disabled) && studioStyles.quiet]}>
    {icon && <Ionicons name={icon} size={17} color={primary ? '#fffdf6' : studioColors.green} />}
    <Text style={[studioStyles.actionText, primary && studioStyles.onPrimary]}>{label}</Text>
  </Pressable>;
}

export function StudioSegments<T extends string>({ items, value, onChange, label }: {
  items: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string;
}) {
  return <View accessibilityLabel={label} style={studioStyles.segments}>
    {items.map((item) => <Pressable key={item.id} accessibilityRole="button" {...buttonSelectionProps(value === item.id)}
      onPress={() => onChange(item.id)} style={({ pressed }) => [studioStyles.segment, value === item.id && studioStyles.onSegment, pressed && studioStyles.quiet]}>
      <Text style={[studioStyles.segmentText, value === item.id && studioStyles.onSegmentText]}>{item.label}</Text>
    </Pressable>)}
  </View>;
}

export const studioStyles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: studioColors.page },
  content: { width: '100%', maxWidth: 840, alignSelf: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 20, gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: studioColors.text, fontSize: 27, fontFamily: theme.fonts.serif, fontWeight: '600', lineHeight: 37 },
  subtitle: { color: studioColors.text, fontSize: 18, fontWeight: '600', lineHeight: 25 },
  muted: { color: studioColors.muted, fontSize: 13, lineHeight: 19 },
  text: { color: studioColors.text, fontSize: 15, lineHeight: 23 },
  status: { color: studioColors.green, fontSize: 14, lineHeight: 20 },
  error: { color: '#9a3e29', fontSize: 14, lineHeight: 20 },
  card: { borderWidth: 1, borderColor: studioColors.rule, borderRadius: 17, backgroundColor: studioColors.surface, padding: 13, gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: studioColors.rule },
  iconButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: studioColors.soft },
  action: { minHeight: 44, borderWidth: 1, borderColor: studioColors.rule, backgroundColor: studioColors.surface,
    borderRadius: 11, paddingHorizontal: 11, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primary: { backgroundColor: studioColors.green, borderColor: studioColors.green },
  actionText: { color: studioColors.green, fontSize: 13, lineHeight: 19, fontWeight: '600', flexShrink: 1 },
  onPrimary: { color: '#fffdf6' },
  quiet: { opacity: 0.55 },
  segments: { flexDirection: 'row', gap: 3, borderWidth: 1, borderColor: studioColors.rule, borderRadius: 13, padding: 3, backgroundColor: '#eeeee5' },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 4 },
  onSegment: { backgroundColor: studioColors.surface, borderWidth: 1, borderColor: '#d7ddcf' },
  segmentText: { color: studioColors.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  onSegmentText: { color: studioColors.green },
});

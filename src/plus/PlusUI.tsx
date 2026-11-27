import type { ReactNode, Ref } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { theme } from '../styles/theme';

export function PlusButton({ label, onPress, selected, primary, disabled, testID, focusRef }: {
  label: string; onPress: () => void; selected?: boolean; primary?: boolean; disabled?: boolean; testID?: string; focusRef?: Ref<View>;
}) {
  return <Pressable ref={focusRef} testID={testID} accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, selected && styles.selected, primary && styles.primary, pressed && styles.pressed, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>
  </Pressable>;
}

export function focusControl(control: View | null): void {
  if (!control) return;
  if (Platform.OS === 'web') { control.focus(); return; }
  const node = findNodeHandle(control);
  if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
}

export function PlusInput(props: TextInputProps) {
  return <TextInput placeholderTextColor={theme.colors.placeholder} {...props} style={[styles.input, props.multiline && styles.editor, props.style]} />;
}

export function Actions({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

export function Heading({ children, title }: { children: ReactNode; title?: boolean }) {
  return <Text accessibilityRole="header" style={title ? plusStyles.title : plusStyles.heading}>{children}</Text>;
}

export const plusStyles = StyleSheet.create({
  full: { flex: 1, minHeight: 0 },
  paper: { flex: 1, backgroundColor: theme.colors.background },
  page: { width: '100%', maxWidth: 860, alignSelf: 'center', padding: 16, gap: 14, paddingBottom: 36 },
  title: { color: theme.colors.text, fontSize: 30, fontFamily: theme.fonts.serif, fontWeight: '600' },
  heading: { color: theme.colors.text, fontSize: 18, fontFamily: theme.fonts.serif, fontWeight: '600' },
  text: { fontSize: 16, lineHeight: 25, color: theme.colors.text },
  original: { fontSize: 17, lineHeight: 28, fontFamily: theme.fonts.serif, color: theme.colors.text },
  meta: { fontSize: 14, color: theme.colors.textMuted, lineHeight: 21 },
  alert: { fontSize: 15, color: theme.colors.dangerText },
  row: { gap: 8 },
  rule: { borderTopWidth: 1, borderTopColor: theme.colors.rule, paddingTop: 10, gap: 8 },
});

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' },
  button: { minHeight: 44, maxWidth: '100%', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 9, justifyContent: 'center', backgroundColor: theme.colors.surfaceElevated },
  selected: { borderWidth: 2, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  primary: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  buttonText: { color: theme.colors.text, fontSize: 15, lineHeight: 22 },
  primaryText: { color: '#fff' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, minHeight: 48, paddingHorizontal: 12,
    paddingVertical: 9, color: theme.colors.text, backgroundColor: theme.colors.inputBg, fontSize: 16 },
  editor: { minHeight: 144, textAlignVertical: 'top', lineHeight: 25 },
});

import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Seed, SeedConnection } from '../domain/types';
import { theme } from '../styles/theme';
import { findConnection } from '../utils/links';
import { toSeedSnippet } from '../utils/seedText';
import { AnimatedPressable } from './AnimatedPressable';
import { PrimaryButton } from './PrimaryButton';

type ConnectPlanModalProps = {
  visible: boolean;
  /** 選んだ順。最初のメモが中心の初期値。 */
  selected: Seed[];
  connections: SeedConnection[];
  onConfirm: (centerId: string, targetIds: string[]) => void;
  onClose: () => void;
};

// 3件以上を選んだときのつなぎ方。中心から各メモへの線だけを作り、選んだ全員同士は結ばない。
export function ConnectPlanModal({ visible, selected, connections, onConfirm, onClose }: ConnectPlanModalProps) {
  const insets = useSafeAreaInsets();
  const [centerId, setCenterId] = React.useState<string | undefined>(selected[0]?.id);

  React.useEffect(() => {
    if (visible) {
      setCenterId(selected[0]?.id);
    }
  }, [visible, selected]);

  const center = selected.find((seed) => seed.id === centerId) ?? selected[0];
  const targets = selected.filter((seed) => seed.id !== center?.id);
  const plan = targets.map((target) => ({ target, exists: Boolean(center && findConnection(connections, center.id, target.id)) }));
  const newCount = plan.filter((item) => !item.exists).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Text style={styles.title} accessibilityRole="header">
          つなぎ方を選ぶ
        </Text>
        <Text style={styles.caption}>
          中心にするメモから、ほかのメモへ線を引きます。選んだメモ同士は、自動では結びません。
        </Text>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.label}>中心にするメモ</Text>
          {selected.map((seed) => {
            const isCenter = seed.id === center?.id;
            return (
              <AnimatedPressable
                key={seed.id}
                onPress={() => setCenterId(seed.id)}
                style={[styles.row, isCenter && styles.rowOn]}
                haptic="light"
                accessibilityRole="button"
                accessibilityState={{ selected: isCenter }}
                accessibilityLabel={`${isCenter ? '中心にしているメモ' : '中心にする'}。${toSeedSnippet(seed, 40)}`}
              >
                <Ionicons name={isCenter ? 'radio-button-on' : 'radio-button-off'} size={22} color={theme.colors.primary} />
                <Text style={styles.rowText} numberOfLines={2}>
                  {toSeedSnippet(seed, 50)}
                </Text>
              </AnimatedPressable>
            );
          })}

          <Text style={styles.label}>作られる線</Text>
          {plan.map(({ target, exists }) => (
            <View key={target.id} style={styles.planRow} accessible accessibilityLabel={`${exists ? 'すでにつながっています' : '新しく線を引きます'}。${toSeedSnippet(target, 40)}`}>
              <Text style={[styles.planBadge, exists ? styles.planExists : styles.planNew]}>{exists ? 'つながっています' : '追加'}</Text>
              <Text style={styles.rowText} numberOfLines={2}>
                中心 ─ {toSeedSnippet(target, 40)}
              </Text>
            </View>
          ))}
        </ScrollView>

        <PrimaryButton
          label={newCount > 0 ? `この${newCount}本の線を追加する` : 'すべてつながっています'}
          disabled={newCount === 0 || !center}
          onPress={() => center && onConfirm(center.id, targets.map((seed) => seed.id))}
        />
        <AnimatedPressable
          onPress={onClose}
          style={styles.cancel}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="やめる。メモは削除されません"
        >
          <Text style={styles.cancelText}>やめる（メモは消えません）</Text>
        </AnimatedPressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md, gap: theme.spacing.sm },
  title: { fontSize: 22, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  caption: { fontSize: 14, lineHeight: 21, color: theme.colors.textMuted },
  body: { gap: theme.spacing.xs, paddingBottom: theme.spacing.md },
  label: { fontSize: 14, fontWeight: '700', color: theme.colors.textMuted, marginTop: theme.spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: theme.spacing.sm,
    minHeight: 52,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.rule,
  },
  rowOn: { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.chipSelectedBorder },
  rowText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: theme.fonts.serif, color: theme.colors.text },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceMuted },
  planBadge: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full, overflow: 'hidden' },
  planNew: { backgroundColor: theme.colors.leaf, color: theme.colors.primary },
  planExists: { backgroundColor: theme.colors.chipBg, color: theme.colors.textMuted },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: theme.colors.textMuted },
});

import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { connectionId } from '../data/gardenModel';
import { withCoreCommand, type GardenV3Writer } from '../data/gardenV3Writer';
import { connectSeeds } from '../domain/gardenCommands';
import { defaultCraftExcerpt } from '../domain/plus/craft';
import { requirePlusAccess } from '../domain/plus/entitlements';
import type { Seed, SeedConnection } from '../domain/types';
import { theme } from '../styles/theme';
import { createId } from '../utils/ids';
import { toSeedSnippet } from '../utils/seedText';
import { PlusInput, focusControl } from './PlusUI';
import { IconButton, StudioAction, StudioTitle, studioColors, studioStyles } from './StudioUI';

export const materialLimit = 2;

export type StudioMaterials = {
  notes: Seed[];
  toggle: (id: string) => void;
  open: (onReturn?: () => void) => void;
};

export function StudioMaterialAction({ materials, id, onChange }: {
  materials: StudioMaterials; id: string; onChange?: () => void;
}) {
  const opener = React.useRef<View>(null);
  const placed = materials.notes.some((note) => note.id === id);
  if (!placed && materials.notes.length >= materialLimit) {
    return <StudioAction label="選んだ2枚の素材を見る" title="素材を見る" icon="layers-outline" focusRef={opener}
      onPress={() => materials.open(() => focusControl(opener.current))} />;
  }
  return <StudioAction label={placed ? '素材から外す' : '素材に置く'} icon={placed ? 'remove-circle-outline' : 'layers-outline'} onPress={() => {
    materials.toggle(id); onChange?.();
  }} />;
}

export function StudioMaterialBar({ materials }: { materials: StudioMaterials }) {
  const opener = React.useRef<View>(null);
  if (!materials.notes.length) return null;
  const both = materials.notes.length === materialLimit;
  const title = materials.notes.map((seed) => toSeedSnippet(seed, 22)).join('、');
  return <Pressable ref={opener} accessibilityRole="button" accessibilityLabel="選んだ素材を開く" accessibilityHint={title}
    onPress={() => materials.open(() => focusControl(opener.current))}
    style={({ pressed }) => [styles.bar, pressed && studioStyles.quiet]}>
    <Ionicons name="layers-outline" color={studioColors.green} size={19} />
    <View style={studioStyles.grow}>
      <Text style={styles.barLabel}>素材 {materials.notes.length}枚</Text>
      <Text numberOfLines={1} style={styles.barText}>{title}</Text>
    </View>
    <Text style={styles.barLabel}>{both ? '読み比べる' : '確認する'}</Text>
    <Ionicons name="chevron-forward" color={studioColors.green} size={15} />
  </Pressable>;
}

export function StudioMaterialReview({ materials, writer, canUse, connection, active, onBack, onCraft }: {
  materials: StudioMaterials; writer: GardenV3Writer; canUse: () => boolean; connection?: SeedConnection;
  active: boolean; onBack: () => void; onCraft: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const [expanded, setExpanded] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const saving = React.useRef(false);
  const back = React.useRef<View>(null);
  const [first, second] = materials.notes;
  const previews = React.useMemo(() => new Map(materials.notes.map((note) =>
    [note.id, defaultCraftExcerpt(note)?.quote ?? note.body])), [materials.notes]);
  React.useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => focusControl(back.current));
    return () => cancelAnimationFrame(frame);
  }, [active]);

  async function connect() {
    if (!first || !second || connection || saving.current || !canUse()) return;
    saving.current = true; setBusy(true); setNotice('');
    const id = createId();
    const command = withCoreCommand(connectSeeds({ commandId: id, a: first.id, b: second.id, note: reason, now: new Date().toISOString() }));
    const result = await writer.run(requirePlusAccess({ id, apply: (store) => {
      const current = [first, second].every((before) => store.seeds.some((seed) =>
        seed.id === before.id && !seed.deletedAt && seed.title === before.title && seed.body === before.body));
      return current ? command.apply(store) : { rejected: 'メモに更新があります。原文を確かめてからつないでください。' };
    } }, canUse)).finally(() => { saving.current = false; setBusy(false); });
    if (!result.ok) { setNotice(result.detail ?? 'つながりを保存できませんでした。'); return; }
    Keyboard.dismiss();
    setEditing(false); setReason(''); setNotice('つながりを保存しました');
  }

  return <ScrollView style={studioStyles.root} contentContainerStyle={studioStyles.content}
    testID="studio-material-review" automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" accessibilityViewIsModal
    onAccessibilityEscape={busy ? undefined : onBack}>
    <StudioTitle title={second ? 'メモを読み比べる' : '選んだ素材'} back={{ label: '素材を閉じる', onPress: onBack, disabled: busy, focusRef: back }} />
    <View style={[styles.cards, width >= 640 && fontScale <= 1.3 && styles.sideBySide]}>
      {materials.notes.map((note) => {
        const full = expanded.includes(note.id);
        const title = toSeedSnippet(note, 64);
        const preview = previews.get(note.id) ?? note.body;
        return <View key={note.id} style={styles.material}>
          <View style={studioStyles.row}>
            <Text accessibilityRole="header" style={[styles.materialTitle, studioStyles.grow]}>{title}</Text>
            <IconButton label={`「${title}」を素材から外す`} icon="close" disabled={busy} onPress={() => materials.toggle(note.id)} />
          </View>
          <Text selectable style={styles.quote}>{full ? note.body : preview}</Text>
          {preview !== note.body && <StudioAction label={full ? `「${title}」を一節で読む` : `「${title}」の全文を表示`}
            title={full ? '一節に戻す' : '全文を読む'} plain expanded={full}
            onPress={() => setExpanded(full ? expanded.filter((id) => id !== note.id) : [...expanded, note.id])} />}
        </View>;
      })}
    </View>
    {!second && <Text style={studioStyles.muted}>{first ? '地図や星座から、もう1枚素材を置けます。' : '地図や星座から素材にしたいメモを選べます。'}</Text>}
    {connection && <View style={styles.saved}>
      <View style={studioStyles.row}><Ionicons name="link-outline" size={18} color={studioColors.green} />
        <Text accessibilityRole="header" style={styles.savedTitle}>保存したつながり</Text></View>
      {!!connection.note && <Text selectable style={studioStyles.text}>{connection.note}</Text>}
    </View>}
    {second && !connection && editing && <View style={studioStyles.card}>
      <Text style={studioStyles.subtitle}>つなぐ理由</Text>
      <PlusInput accessibilityLabel="つなぐ理由" placeholder="どこがつながると思いましたか（任意）" value={reason} onChangeText={setReason}
        editable={!busy} maxLength={300} multiline style={styles.reason} />
      <View style={studioStyles.wrap}>
        <StudioAction label="つながりを保存" primary disabled={busy} onPress={() => void connect()} />
        <StudioAction label="理由の入力を閉じる" title="閉じる" plain disabled={busy} onPress={() => setEditing(false)} />
      </View>
    </View>}
    {!!notice && <Text style={notice === 'つながりを保存しました' ? studioStyles.status : studioStyles.error} accessibilityLiveRegion="polite">{notice}</Text>}
    <View style={studioStyles.wrap}>
      {first && <StudioAction label="素材を作業台へ持っていく" title="作業台へ" icon="construct-outline" primary disabled={busy} onPress={onCraft} />}
      {second && !connection && !editing && <StudioAction label="理由を添えてつなぐ" icon="link-outline" onPress={() => setEditing(true)} />}
      {!second && <StudioAction label="メモを探しに戻る" icon="arrow-back" onPress={onBack} />}
    </View>
  </ScrollView>;
}

export function materialConnection(notes: readonly Seed[], connections: readonly SeedConnection[]) {
  if (notes.length !== materialLimit) return undefined;
  const id = connectionId(notes[0].id, notes[1].id);
  return connections.find((edge) => edge.id === id);
}

const styles = StyleSheet.create({
  bar: { width: '100%', maxWidth: 840, alignSelf: 'center', minHeight: 52, paddingVertical: 5, paddingHorizontal: 14, gap: 8,
    flexDirection: 'row', alignItems: 'center', backgroundColor: studioColors.soft, borderTopWidth: 1, borderTopColor: '#ccdacb' },
  barLabel: { color: studioColors.green, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  barText: { color: studioColors.text, fontSize: 13, lineHeight: 18 },
  cards: { gap: 8 },
  sideBySide: { flexDirection: 'row', alignItems: 'flex-start' },
  material: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 9, gap: 5, borderWidth: 1, borderColor: studioColors.rule,
    borderRadius: 13, backgroundColor: studioColors.surface },
  materialTitle: { color: studioColors.text, fontFamily: theme.fonts.serif, fontSize: 17, lineHeight: 24, fontWeight: '700' },
  quote: { color: studioColors.text, fontSize: 15, lineHeight: 23, paddingVertical: 4 },
  saved: { padding: 11, gap: 4, borderRadius: 12, backgroundColor: studioColors.soft },
  savedTitle: { color: studioColors.green, fontSize: 14, fontWeight: '700' },
  reason: { minHeight: 80 },
});

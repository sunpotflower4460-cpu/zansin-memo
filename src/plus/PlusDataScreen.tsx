import * as React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GardenV3Writer } from '../data/gardenV3Writer';
import { buildPlusJsonExport, buildPlusTextExport } from '../utils/plusExport';
import { showConfirm } from '../utils/confirm';
import { clearPreviewProposalCache } from './PlusAiScreen';
import { StudioAction, StudioRow, StudioTitle, studioColors, studioStyles } from './StudioUI';
import { clearWorkFileCache, makeGardenFile } from './workFiles';
import type { GeneratedWorkFile } from './workFileTypes';

export function PlusDataScreen({ writer, onBack, onReset, comparison }: {
  writer: GardenV3Writer; onBack: () => void; onReset: () => void; comparison?: boolean;
}) {
  const [file, setFile] = React.useState<GeneratedWorkFile>();
  const [notice, setNotice] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const status = React.useSyncExternalStore(writer.subscribe, writer.getStatus);
  const store = React.useSyncExternalStore(writer.subscribe, writer.getSnapshot);
  const garden = comparison ? '比較用の庭' : '例の庭';
  React.useEffect(() => () => file?.discard(), [file]);

  async function publish(format: 'json' | 'text') {
    if (lock.current || writer.getStatus().deleting) return;
    lock.current = true; setBusy(true);
    try {
      const store = writer.getSnapshot();
      const data = format === 'json' ? buildPlusJsonExport(store) : buildPlusTextExport(store);
      setFile(await makeGardenFile(data, format));
      setNotice('書き出すファイルを用意しました');
    } catch { setNotice('書出しを用意できませんでした'); }
    finally { lock.current = false; setBusy(false); }
  }

  async function reset() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFile(undefined);
    try {
      clearWorkFileCache();
      clearPreviewProposalCache();
      const result = writer.getStatus().deleting ? await writer.retryDeleteAll() : await writer.deleteAll();
      if (result.ok) onReset();
      else setNotice(result.detail ?? '削除の完了を確認できませんでした');
    } finally { lock.current = false; setBusy(false); }
  }

  const blocked = busy || status.deleting;
  return <ScrollView style={studioStyles.root} contentContainerStyle={studioStyles.content}>
    <StudioTitle title="データ管理" subtitle={garden} back={{ label: 'データの画面を閉じる', onPress: onBack, disabled: blocked }} />
    <View style={styles.inventory}>
      {[['メモ', store.seeds.filter(({ deletedAt }) => !deletedAt).length],
        ['振り返り', store.reflections?.length ?? 0], ['作品', store.collectionItems.length]].map(([label, count]) => <View key={label} style={styles.stat}>
        <Text style={styles.value}>{count}</Text><Text style={studioStyles.muted}>{label}</Text>
      </View>)}
    </View>
    <View style={styles.section}>
      <Text accessibilityRole="header" style={studioStyles.subtitle}>書き出す</Text>
      <StudioRow title="読みやすいテキスト" label="標準テキストを作る" detail="メモや記録をひとつのテキストに" icon="document-text-outline"
        disabled={blocked} onPress={() => void publish('text')} />
      <StudioRow title="全データをJSONに" label="全データJSONを作る" detail="下書き・作品・削除済みのメモも含む" icon="archive-outline" disabled={blocked}
        onPress={() => showConfirm('全データを書き出しますか？', '削除済みのメモ、下書き、作品の材料も含まれます。ファイルの取り込みは未対応です。',
          [{ text: 'やめる', style: 'cancel' }, { text: 'JSONを作る', onPress: () => void publish('json') }])} />
      {file && <StudioAction label="ファイルを取り出す・共有" title={file.format === 'json' ? 'JSONを共有・保存' : 'テキストを共有・保存'}
        icon="share-outline" primary disabled={blocked} onPress={() => void file.deliver().catch(() => setNotice('取り出せませんでした'))} />}
      {!!notice && <Text accessibilityLiveRegion="polite" style={studioStyles.muted}>{notice}</Text>}
    </View>
    <View style={styles.section}>
      <StudioRow title={status.deleting ? '削除を再開する' : 'この庭のデータをすべて削除'} danger icon="trash-outline"
        label={status.deleting ? '削除を再開する' : `${garden}の全データを削除する`} disabled={busy}
        onPress={() => status.deleting ? void reset() : showConfirm(`${garden}の全データを削除しますか？`,
          comparison ? 'この庭のメモ、振り返り、アトリエ、作品、復旧用の控えを削除します。' : '例のメモ、アトリエ、作品、復旧用の控えを削除します。',
          [{ text: 'やめる', style: 'cancel' }, { text: '削除する', style: 'destructive', onPress: () => void reset() }])} />
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  inventory: { flexDirection: 'row', paddingVertical: 10, borderRadius: 15, backgroundColor: studioColors.soft },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  value: { fontSize: 21, lineHeight: 28, color: studioColors.green, fontWeight: '700', fontVariant: ['tabular-nums'] },
  section: { gap: 7, paddingTop: 4 },
});

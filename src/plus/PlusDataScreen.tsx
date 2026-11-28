import * as React from 'react';
import { ScrollView, Text } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import type { GardenV3Writer } from '../data/gardenV3Writer';
import { buildPlusJsonExport, buildPlusTextExport } from '../utils/plusExport';
import { showConfirm } from '../utils/confirm';
import { clearPreviewProposalCache } from './PlusAiScreen';
import { Actions, Heading, PlusButton, plusStyles } from './PlusUI';
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

  return <ScrollView contentContainerStyle={plusStyles.page}>
    <PlusButton label="データの画面を閉じる" disabled={busy || status.deleting} onPress={onBack} />
    <Heading title>{garden}のデータ</Heading>
    <SectionCard><Heading>書き出す</Heading>
      <Text style={plusStyles.meta}>JSONには下書き、削除済みの種、アトリエの版、作品と由来{comparison ? '、振り返り' : ''}を含みます。ファイルからの取り込みは準備中です。</Text>
      <Actions><PlusButton label="全データJSONを作る" disabled={busy || status.deleting} onPress={() => showConfirm('全データを書き出しますか？',
        '削除済みの種、下書きと作品の材料も含まれます。', [{ text: 'やめる', style: 'cancel' }, { text: 'JSONを作る', onPress: () => void publish('json') }])} />
        <PlusButton label="標準テキストを作る" disabled={busy || status.deleting} onPress={() => void publish('text')} /></Actions>
      {file && <PlusButton label="ファイルを取り出す・共有" disabled={status.deleting} onPress={() => void file.deliver().catch(() => setNotice('取り出せませんでした'))} />}
    </SectionCard>
    <SectionCard><Heading>削除する</Heading>
      <PlusButton label={status.deleting ? '削除を再開する' : `${garden}の全データを削除する`} disabled={busy}
        onPress={() => status.deleting ? void reset() : showConfirm(`${garden}の全データを削除しますか？`,
          comparison ? 'この庭のメモ、振り返り、アトリエ、作品、復旧用の控えを削除します。' : '例のメモ、アトリエ、作品、復旧用の控えを削除します。',
          [{ text: 'やめる', style: 'cancel' }, { text: '削除する', style: 'destructive', onPress: () => void reset() }])} />
    </SectionCard>
    {notice && <Text accessibilityLiveRegion="polite" style={plusStyles.meta}>{notice}</Text>}
  </ScrollView>;
}

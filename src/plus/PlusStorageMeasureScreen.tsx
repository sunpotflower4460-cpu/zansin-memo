import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { Platform, ScrollView, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { StorageLike } from '../data/gardenStorage';
import { browserTabStorage, scopeStorage } from '../data/plusPreviewStorage';
import { measurePlusStorage, reopenMeasuredStore, storageMeasureInputs, type PlusStorageCondition } from '../data/plusStorageMeasure';
import { Actions, Heading, PlusButton, plusStyles } from './PlusUI';

export function PlusStorageMeasureScreen() {
  const running = React.useRef(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<number>();
  const [report, setReport] = React.useState('');

  async function run(action: (storage: StorageLike) => Promise<object>) {
    if (running.current) return;
    running.current = true;
    setBusy(true); setProgress(undefined); setReport('');
    try {
      const storage = scopeStorage(Platform.OS === 'web' ? browserTabStorage() : AsyncStorage, 'kizashi-plus-storage-measure:');
      const result = await action(storage);
      setReport(JSON.stringify({ platform: Platform.OS, osVersion: Platform.Version, ...result }, null, 2));
    } catch {
      setReport('保存先を読み書きできませんでした。');
    } finally { running.current = false; setBusy(false); }
  }

  function measure(condition: PlusStorageCondition) {
    void run((storage) => measurePlusStorage(storage, condition, setProgress));
  }

  return <SafeAreaProvider><SafeAreaView style={plusStyles.paper}>
    <ScrollView contentContainerStyle={plusStyles.page}>
      <Heading title>Plusの保存計測</Heading>
      <Text style={plusStyles.text}>開発用の架空メモを使います。0.5秒ごとに下書きを更新し、60秒間の保存と再読込を確かめます。</Text>
      <Actions>
        <PlusButton disabled={busy} label="軽い条件で計測（50件）" onPress={() => measure('light')} />
        <PlusButton disabled={busy} label="重い条件で計測（5,000件）" onPress={() => measure('heavy')} />
        <PlusButton disabled={busy} label="最後の保存を読み直す" onPress={() => void run(reopenMeasuredStore)} />
      </Actions>
      {busy && <Text accessibilityLiveRegion="polite" style={plusStyles.meta}>{progress === undefined ? '保存先を確認しています' : `${progress} / ${storageMeasureInputs} 回の入力`}</Text>}
      {report !== '' && <Text selectable testID="plus-storage-measure-result" style={plusStyles.original}>{report}</Text>}
    </ScrollView>
  </SafeAreaView></SafeAreaProvider>;
}

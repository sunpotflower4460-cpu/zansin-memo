import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SectionCard } from '../components/SectionCard';
import { loadGardenV3 } from '../data/gardenV3Storage';
import { GardenV3Writer, type PlusCommand } from '../data/gardenV3Writer';
import { buildPlusExample } from '../data/plusExample';
import { isolatePlusPreview } from '../data/plusPreviewStorage';
import { toSeedSnippet } from '../utils/seedText';
import { PlusMapScreen } from './PlusMapScreen';
import { focusControl, Heading, PlusButton, plusStyles } from './PlusUI';

const storage = isolatePlusPreview(AsyncStorage);
const exampleGroups = buildPlusExample(8).displayGroups;

function PreviewGarden({ writer }: { writer: GardenV3Writer }) {
  const store = React.useSyncExternalStore(writer.subscribe, writer.getSnapshot);
  const status = React.useSyncExternalStore(writer.subscribe, writer.getStatus);
  const [reading, setReading] = React.useState<string>();
  const returnFocus = React.useRef<() => void>(undefined);
  const backControl = React.useRef<View>(null);
  const [notice, setNotice] = React.useState('');
  const commit = React.useCallback((command: PlusCommand) => writer.run(command), [writer]);
  const selected = reading ? store.seeds.find((seed) => seed.id === reading && !seed.deletedAt) : undefined;

  React.useEffect(() => {
    if (reading) {
      const frame = requestAnimationFrame(() => focusControl(backControl.current));
      return () => cancelAnimationFrame(frame);
    }
    if (returnFocus.current) {
      const restore = returnFocus.current;
      returnFocus.current = undefined;
      const frame = requestAnimationFrame(restore);
      return () => cancelAnimationFrame(frame);
    }
  }, [reading]);

  async function startExample() {
    const { seeds, connections } = buildPlusExample();
    const result = await writer.run({ id: 'plus-create-example', apply: (base) => base.seeds.length ? base : { ...base, seeds, connections } });
    if (!result.ok) setNotice('例の庭を保存できませんでした。もう一度試せます。');
  }

  return <View style={plusStyles.full}>
    {store.seeds.length ? <View style={[plusStyles.full, reading && { display: 'none' }]}>
      <PlusMapScreen store={store} commit={commit} initialGroups={exampleGroups} onOpenSeed={(id, onReturn) => { returnFocus.current = onReturn; setReading(id); }} />
    </View> : <ScrollView contentContainerStyle={plusStyles.page}>
      <Heading title>考えの地図</Heading>
      <SectionCard><Text style={plusStyles.text}>例のメモを使って、つながりや地図の見方を試せます。</Text>
        <PlusButton label="例の庭を開く" primary disabled={status.pending > 0} onPress={() => void startExample()} />
        {notice && <Text accessibilityLiveRegion="polite" style={plusStyles.alert}>{notice}</Text>}
      </SectionCard>
    </ScrollView>}
    {reading && <ScrollView contentContainerStyle={plusStyles.page}>
      <View><PlusButton label="地図に戻る" focusRef={backControl} onPress={() => setReading(undefined)} /></View>
      <Heading title>{selected ? selected.title || toSeedSnippet(selected) : '原文を確認できません'}</Heading>
      {selected && <SectionCard><Heading>元のメモ</Heading><Text selectable style={plusStyles.original}>{selected.body}</Text>
        {selected.synthesis && <><Heading>現在の芽</Heading><Text selectable style={plusStyles.original}>{selected.synthesis.statement}</Text></>}
      </SectionCard>}
    </ScrollView>}
  </View>;
}

export function PlusPreview() {
  const [writer, setWriter] = React.useState<GardenV3Writer>();
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    void loadGardenV3(storage).then((result) => {
      if (!active) return;
      if (result.status === 'ready') setWriter(new GardenV3Writer(storage, result.store, result));
      else setFailed(true);
    });
    return () => { active = false; };
  }, [attempt]);
  return <SafeAreaProvider><SafeAreaView style={plusStyles.paper}>
    <View style={{ width: '100%', maxWidth: 860, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8 }}>
      <Text style={plusStyles.meta}>Kizashi Plus 開発プレビュー · 例のデータ</Text>
    </View>
    {writer ? <PreviewGarden writer={writer} /> : <View style={plusStyles.page}>
      {failed ? <><Text accessibilityRole="alert" style={plusStyles.alert}>例の庭の保存データを読み込めませんでした。</Text>
        <PlusButton label="読み込みをやり直す" onPress={() => { setFailed(false); setAttempt((value) => value + 1); }} /></>
        : <ActivityIndicator accessibilityLabel="例の庭を読み込み中" />}
    </View>}
  </SafeAreaView></SafeAreaProvider>;
}

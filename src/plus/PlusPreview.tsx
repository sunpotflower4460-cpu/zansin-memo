import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SectionCard } from '../components/SectionCard';
import { loadGardenV3 } from '../data/gardenV3Storage';
import { GardenV3Writer, type PlusCommand } from '../data/gardenV3Writer';
import { buildPlusExample } from '../data/plusExample';
import { browserTabStorage, plusPreviewPrefix, plusPreviewWriterLock, scopeStorage } from '../data/plusPreviewStorage';
import { toSeedSnippet } from '../utils/seedText';
import type { AtelierRevision, MapReturnContext } from '../domain/plus/contracts';
import { createAtelier } from '../domain/plus/atelier';
import { currentEntitlement, plusRights } from '../domain/plus/entitlements';
import { createId } from '../utils/ids';
import { PlusAiScreen, reconcilePreviewProposals } from './PlusAiScreen';
import { PlusAtelierScreen } from './PlusAtelierScreen';
import { PlusCollectionScreen } from './PlusCollectionScreen';
import { PlusDataScreen } from './PlusDataScreen';
import { createPurchasePreview, PlusPurchasePreview } from './PlusPurchasePreview';
import { PlusMapScreen } from './PlusMapScreen';
import { Actions, focusControl, Heading, PlusButton, plusStyles } from './PlusUI';
import { clearWorkFileCache } from './workFiles';

const exampleGroups = buildPlusExample(8).displayGroups;
const enabled = {
  map: process.env.EXPO_PUBLIC_KIZASHI_PLUS_PREVIEW_MAP !== '0',
  proposals: process.env.EXPO_PUBLIC_KIZASHI_PLUS_PREVIEW_AI !== '0',
  atelier: process.env.EXPO_PUBLIC_KIZASHI_PLUS_PREVIEW_ATELIER !== '0',
  collection: process.env.EXPO_PUBLIC_KIZASHI_PLUS_PREVIEW_COLLECTION !== '0',
  commerce: process.env.EXPO_PUBLIC_KIZASHI_PLUS_PREVIEW_COMMERCE !== '0',
};

function PreviewGarden({ writer }: { writer: GardenV3Writer }) {
  const store = React.useSyncExternalStore(writer.subscribe, writer.getSnapshot);
  const status = React.useSyncExternalStore(writer.subscribe, writer.getStatus);
  const [reading, setReading] = React.useState<string>();
  const [ai, setAi] = React.useState<{ seedId: string; scope: string[]; origin: MapReturnContext }>();
  const [origin, setOrigin] = React.useState<MapReturnContext>();
  const [atelier, setAtelier] = React.useState<string>();
  const [atelierList, setAtelierList] = React.useState(false);
  const [collection, setCollection] = React.useState<{ source?: AtelierRevision }>();
  const [purchase, setPurchase] = React.useState(false);
  const [data, setData] = React.useState(false);
  const [purchaseModel] = React.useState(createPurchasePreview);
  const purchaseState = React.useSyncExternalStore(purchaseModel.flow.subscribe, purchaseModel.flow.snapshot);
  const rights = plusRights(currentEntitlement(purchaseState.evidence, Date.now(), true));
  const creating = React.useRef(false);
  const createAttempt = React.useRef<{ key: string; args: Parameters<typeof createAtelier>[0] }>(undefined);
  const returnFocus = React.useRef<() => void>(undefined);
  const backControl = React.useRef<View>(null);
  const [notice, setNotice] = React.useState('');
  const commit = React.useCallback((command: PlusCommand) => writer.run(command), [writer]);
  const selected = reading ? store.seeds.find((seed) => seed.id === reading && !seed.deletedAt) : undefined;
  React.useEffect(() => { void reconcilePreviewProposals(writer, true); }, [writer]);

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

  async function openAtelier(centerSeedId?: string, materials: string[] = [], originNavigation?: MapReturnContext) {
    if (creating.current || !rights.atelierAdvanced || !enabled.atelier) return;
    const key = JSON.stringify([centerSeedId, materials, originNavigation?.origin]);
    if (createAttempt.current?.key !== key) createAttempt.current = { key, args: {
      id: createId(), branchId: createId(), centerSeedId, materials: materials.map((seedId) => ({ id: createId(), ref: { seedId, part: 'body' } })),
      originNavigation, at: new Date().toISOString(),
    } };
    const args = createAttempt.current.args;
    creating.current = true;
    try {
      const result = await writer.run(createAtelier(args));
      if (result.ok) { setAtelier(args.id); createAttempt.current = undefined; setNotice(''); }
      else setNotice(result.detail ?? 'アトリエを保存できませんでした。もう一度試せます。');
    } finally { creating.current = false; }
  }

  return <View style={plusStyles.full}>
    {!purchase && !data && <View style={{ width: '100%', maxWidth: 860, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8 }}>
      <Actions>{enabled.commerce && <PlusButton label="利用権の動作を試す" onPress={() => setPurchase(true)} />}
        {!(reading || ai || atelier || atelierList || collection) && <PlusButton label="データを書き出す・削除する" onPress={() => setData(true)} />}</Actions>
    </View>}
    <View style={[plusStyles.full, (purchase || data) && { display: 'none' }]}>
    {store.seeds.length ? <View style={[plusStyles.full, (reading || ai || atelier || atelierList || collection) && { display: 'none' }]}>
      <View style={{ width: '100%', maxWidth: 860, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8 }}>
        <Actions><PlusButton label="アトリエを開く" onPress={() => setAtelierList(true)} />
          <PlusButton label="作品集を開く" onPress={() => setCollection({})} /></Actions>
        {notice && <Text accessibilityLiveRegion="polite" style={plusStyles.alert}>{notice}</Text>}
      </View>
      <PlusMapScreen store={store} commit={commit} initialGroups={exampleGroups} onOpenSeed={(id, onReturn) => { returnFocus.current = onReturn; setReading(id); }}
        onOpenCandidates={enabled.proposals ? (seedId, scope, origin) => setAi({ seedId, scope, origin }) : undefined}
        restoreContext={origin} canArrange={enabled.map && rights.arrangeMap}
        onOpenAtelier={enabled.atelier && rights.atelierAdvanced ? (seedId, materials, context) => void openAtelier(seedId, materials, context) : undefined} />
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
    {ai && !atelier && <PlusAiScreen writer={writer} centerId={ai.seedId} scope={ai.scope} onBack={() => setAi(undefined)} allowRequest={rights.requestFixtureAi}
      onMaterial={enabled.atelier && rights.atelierAdvanced ? (seedIds) => { void openAtelier(ai.seedId, seedIds, ai.origin); } : undefined} />}
    {atelierList && !atelier && <ScrollView contentContainerStyle={plusStyles.page}>
      <PlusButton label="地図に戻る" onPress={() => setAtelierList(false)} />
      <Heading title>アトリエ</Heading>
      {enabled.atelier && rights.atelierAdvanced && <PlusButton label="新しいアトリエ" onPress={() => void openAtelier()} />}
      {store.atelierProjects.map((project, i) => <PlusButton key={project.id} label={`${project.title ?? `アトリエ ${i + 1}`}を再開`} onPress={() => setAtelier(project.id)} />)}
    </ScrollView>}
    {atelier && <View style={[plusStyles.full, collection && { display: 'none' }]}><PlusAtelierScreen writer={writer} projectId={atelier} advanced={enabled.atelier && rights.atelierAdvanced}
      onBack={() => setAtelier(undefined)} onCreateWork={enabled.collection && rights.composeWork ? (source) => setCollection({ source }) : undefined}
      onOriginMap={(context) => { setOrigin({ ...context }); setAtelier(undefined); setAtelierList(false); setAi(undefined); }} /></View>}
    {collection && <PlusCollectionScreen writer={writer} source={collection.source} canCompose={enabled.collection && rights.composeWork} onBack={() => setCollection(undefined)} />}
    </View>
    {purchase && <PlusPurchasePreview model={purchaseModel} onBack={() => setPurchase(false)} />}
    {data && <PlusDataScreen writer={writer} onBack={() => setData(false)} onReset={() => { setData(false); setOrigin(undefined); setNotice(''); }} />}
  </View>;
}

export function PlusPreview() {
  const [writer, setWriter] = React.useState<GardenV3Writer>();
  const [failure, setFailure] = React.useState<'busy' | 'storage'>();
  const [attempt, setAttempt] = React.useState(0);
  const locks = Platform.OS === 'web' ? globalThis.navigator?.locks : undefined;
  const tabOnly = Platform.OS === 'web' && !locks;
  React.useEffect(() => {
    let active = true;
    let release!: () => void;
    const untilClosed = new Promise<void>((resolve) => { release = resolve; });
    async function boot() {
      const storage = scopeStorage(tabOnly ? browserTabStorage() : AsyncStorage, plusPreviewPrefix, () => active);
      clearWorkFileCache();
      const result = await loadGardenV3(storage);
      if (!active) return false;
      if (result.status !== 'ready') { setFailure('storage'); return false; }
      setWriter(new GardenV3Writer(storage, result.store, result));
      return true;
    }
    // Hold the lock from the first read until this writer is closed.
    const opening = locks ? locks.request(plusPreviewWriterLock, { ifAvailable: true }, async (lock) => {
      if (!active) return;
      if (!lock) { setFailure('busy'); return; }
      if (await boot()) await untilClosed;
    }) : boot();
    void opening.catch(() => { if (active) setFailure('storage'); });
    return () => { active = false; release(); };
  }, [attempt, locks, tabOnly]);
  return <SafeAreaProvider><SafeAreaView style={plusStyles.paper}>
    <View style={{ width: '100%', maxWidth: 860, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8 }}>
      <Text style={plusStyles.meta}>Kizashi Plus 開発プレビュー · 例のデータ</Text>
      {tabOnly && writer && <Text style={plusStyles.meta}>例の庭はこのタブを開いている間だけ使えます。</Text>}
    </View>
    {writer ? <PreviewGarden writer={writer} /> : <View style={plusStyles.page}>
      {failure ? <><Text accessibilityRole="alert" style={plusStyles.alert}>{failure === 'busy'
        ? '別のタブで例の庭が開いています。そのタブを閉じてから、ここで読み込めます。'
        : '例の庭の保存データを読み込めませんでした。'}</Text>
        <PlusButton label="読み込みをやり直す" onPress={() => { setFailure(undefined); setAttempt((value) => value + 1); }} /></>
        : <ActivityIndicator accessibilityLabel="例の庭を読み込み中" />}
    </View>}
  </SafeAreaView></SafeAreaProvider>;
}

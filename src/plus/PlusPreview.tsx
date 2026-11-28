import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { ActivityIndicator, AppState, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SectionCard } from '../components/SectionCard';
import { loadGardenV3 } from '../data/gardenV3Storage';
import { GardenV3Writer, type PlusCommand } from '../data/gardenV3Writer';
import { buildPlusExample, buildStudioExample } from '../data/plusExample';
import { browserTabStorage, plusPreviewPrefix, plusPreviewWriterLock, scopeStorage } from '../data/plusPreviewStorage';
import { toSeedSnippet } from '../utils/seedText';
import type { AtelierRevision, MapReturnContext } from '../domain/plus/contracts';
import { createAtelier } from '../domain/plus/atelier';
import { currentEntitlement, plusRights, requirePlusAccess, type VerifiedEntitlement } from '../domain/plus/entitlements';
import { indexMap } from '../domain/plus/map';
import { createId } from '../utils/ids';
import { theme } from '../styles/theme';
import { PlusAiScreen, reconcilePreviewProposals } from './PlusAiScreen';
import { AtelierLibrary, PlusAtelierScreen } from './PlusAtelierScreen';
import { PlusCollectionScreen } from './PlusCollectionScreen';
import { PlusComparisonMap } from './PlusComparisonMap';
import { PlusDataScreen } from './PlusDataScreen';
import { createPurchasePreview, PlusPurchasePreview } from './PlusPurchasePreview';
import { PlusMapScreen } from './PlusMapScreen';
import { PlusStudio } from './PlusStudio';
import { Actions, focusControl, Heading, PlusButton, plusStyles } from './PlusUI';
import { StudioCapture } from './StudioCapture';
import { StudioRecords } from './StudioRecords';
import { IconButton, StudioAction, StudioRow, StudioTitle, studioColors, studioStyles } from './StudioUI';
import { clearWorkFileCache } from './workFiles';

const exampleGroups = buildPlusExample(8).displayGroups;
const enabled = {
  map: process.env.EXPO_PUBLIC_KIZASHI_PLUS_PREVIEW_MAP !== '0',
  proposals: process.env.EXPO_PUBLIC_KIZASHI_PLUS_PREVIEW_AI !== '0',
  atelier: process.env.EXPO_PUBLIC_KIZASHI_PLUS_PREVIEW_ATELIER !== '0',
  collection: process.env.EXPO_PUBLIC_KIZASHI_PLUS_PREVIEW_COLLECTION !== '0',
  commerce: process.env.EXPO_PUBLIC_KIZASHI_PLUS_PREVIEW_COMMERCE !== '0',
};

function useEntitlementClock(evidence?: VerifiedEntitlement) {
  const [tick, refresh] = React.useReducer((version: number) => version + 1, 0);
  React.useEffect(() => {
    if (!evidence) return;
    const at = Date.now();
    const nextChange = Math.min(...[evidence.verifiedAt, evidence.cacheUntil, evidence.expiresAt ?? 0].filter((value) => value > at));
    const timer = Number.isFinite(nextChange) ? setTimeout(refresh, Math.min(nextChange - at, 2_147_483_647)) : undefined;
    const appState = AppState.addEventListener('change', (status) => { if (status === 'active') refresh(); });
    return () => { if (timer !== undefined) clearTimeout(timer); appState.remove(); };
  }, [evidence, tick]);
}

function PreviewGarden({ writer, onClose }: { writer: GardenV3Writer; onClose?: () => void }) {
  const comparison = Boolean(onClose);
  const store = React.useSyncExternalStore(writer.subscribe, writer.getSnapshot);
  const status = React.useSyncExternalStore(writer.subscribe, writer.getStatus);
  const [reading, setReading] = React.useState<string>();
  const [readingBack, setReadingBack] = React.useState('地図に戻る');
  const [ai, setAi] = React.useState<{ seedId: string; scope: string[]; origin: MapReturnContext }>();
  const [origin, setOrigin] = React.useState<MapReturnContext>();
  const [atelier, setAtelier] = React.useState<string>();
  const [atelierList, setAtelierList] = React.useState(false);
  const [collection, setCollection] = React.useState<{ source?: AtelierRevision; backLabel?: string }>();
  const atelierReturn = React.useRef<typeof collection>(undefined);
  const [purchase, setPurchase] = React.useState(false);
  const [data, setData] = React.useState(false);
  const [manualMap, setManualMap] = React.useState<false | 'more' | 'origin'>(false);
  const [mapImmersive, setMapImmersive] = React.useState(false);
  const [reflectionPage, setReflectionPage] = React.useState(false);
  const [capture, setCapture] = React.useState<{ centerId?: string }>();
  const [purchaseModel] = React.useState(() => createPurchasePreview(comparison ? 'free' : 'active'));
  const purchaseState = React.useSyncExternalStore(purchaseModel.flow.subscribe, purchaseModel.flow.snapshot);
  useEntitlementClock(purchaseState.evidence);
  const rightsNow = React.useCallback(() => plusRights(currentEntitlement(purchaseModel.flow.snapshot().evidence, Date.now(), true)), [purchaseModel]);
  const rights = rightsNow();
  const showFreeMap = comparison && !rights.arrangeMap;
  const canArrange = React.useCallback(() => enabled.map && rightsNow().arrangeMap, [rightsNow]);
  const canRequest = React.useCallback(() => enabled.proposals && rightsNow().requestFixtureAi, [rightsNow]);
  const canUseAtelier = React.useCallback(() => enabled.atelier && rightsNow().atelierAdvanced, [rightsNow]);
  const canCompose = React.useCallback(() => enabled.collection && rightsNow().composeWork, [rightsNow]);
  const creating = React.useRef(false);
  const createAttempt = React.useRef<{ key: string; args: Parameters<typeof createAtelier>[0] }>(undefined);
  const returnFocus = React.useRef<() => void>(undefined);
  const backControl = React.useRef<View>(null);
  const [notice, setNotice] = React.useState('');
  const commit = React.useCallback((command: PlusCommand) => writer.run(requirePlusAccess(command, canArrange)), [canArrange, writer]);
  const selected = reading ? store.seeds.find((seed) => seed.id === reading && !seed.deletedAt) : undefined;
  const captureCenter = capture?.centerId ? store.seeds.find((seed) => seed.id === capture.centerId && !seed.deletedAt) : undefined;
  const index = React.useMemo(() => indexMap(store.seeds, store.connections), [store.seeds, store.connections]);
  const overlay = Boolean(reading || ai || atelier || atelierList || collection || capture || reflectionPage);
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
    const { seeds, connections } = comparison ? buildStudioExample() : buildPlusExample();
    const result = await writer.run({ id: 'plus-create-example', apply: (base) => base.seeds.length ? base : { ...base, seeds, connections } });
    if (!result.ok) setNotice('例の庭を保存できませんでした。もう一度試せます。');
  }

  async function openAtelier(centerSeedId?: string, materials: string[] = [], originNavigation?: MapReturnContext) {
    if (creating.current || !canUseAtelier()) return;
    const key = JSON.stringify([centerSeedId, materials, originNavigation?.origin]);
    if (createAttempt.current?.key !== key) createAttempt.current = { key, args: {
      id: createId(), branchId: createId(), centerSeedId, materials: materials.map((seedId) => ({ id: createId(), ref: { seedId, part: 'body' } })),
      originNavigation, at: new Date().toISOString(),
    } };
    const args = createAttempt.current.args;
    creating.current = true;
    try {
      const result = await writer.run(requirePlusAccess(createAtelier(args), canUseAtelier));
      if (result.ok) { setAtelier(args.id); createAttempt.current = undefined; setNotice(''); }
      else setNotice(result.detail ?? 'アトリエを保存できませんでした。もう一度試せます。');
    } finally { creating.current = false; }
  }

  function openReading(id: string, onReturn?: () => void, back = '地図に戻る') {
    setReadingBack(back); returnFocus.current = onReturn; setReading(id);
  }

  const detailedMap = <PlusMapScreen store={store} commit={commit} initialGroups={exampleGroups} comparison={comparison}
    onBack={manualMap ? () => setManualMap(false) : undefined}
    onOpenSeed={openReading}
    onOpenCandidates={enabled.proposals ? (seedId, scope, origin) => setAi({ seedId, scope, origin }) : undefined}
    restoreContext={origin} canArrange={enabled.map && rights.arrangeMap}
    onOpenAtelier={enabled.atelier && rights.atelierAdvanced ? (seedId, materials, context) => void openAtelier(seedId, materials, context) : undefined} />;
  return <View style={plusStyles.full}>
    {!purchase && !data && (onClose ? !capture && (!mapImmersive || showFreeMap || overlay || manualMap) && <View style={styles.comparisonHeader}>
      <IconButton label="比較を閉じる" icon="close" onPress={onClose} />
      <View style={styles.planLabel}>
        <Text style={styles.planTitle}>比較用の庭</Text>
        <Text style={styles.planState} accessibilityLiveRegion="polite">{showFreeMap ? '無料版を表示中' : 'Plus を表示中'}</Text>
      </View>
      <Text style={styles.planTitle}>Plus</Text>
      <Switch accessibilityLabel="Plus を試す" value={!showFreeMap} onValueChange={(value) => {
        if (!value) setManualMap(false);
        purchaseModel.setStatus(value ? 'active' : 'free');
      }} trackColor={{ true: theme.colors.primary }} />
    </View> : <View style={styles.tools}><Actions>
      {enabled.commerce && <PlusButton label="利用権の動作を試す" onPress={() => setPurchase(true)} />}
      {!overlay && <PlusButton label="データを書き出す・削除する" onPress={() => setData(true)} />}
    </Actions></View>)}
    <View style={[plusStyles.full, (purchase || data) && { display: 'none' }]}>
    {index.live.length ? <View style={[plusStyles.full, overlay && { display: 'none' }]}>
      {!comparison && <View style={styles.tools}><Actions>
        <PlusButton label="アトリエを開く" onPress={() => setAtelierList(true)} />
        <PlusButton label="作品集を開く" onPress={() => setCollection({})} />
      </Actions></View>}
      {notice && <Text accessibilityLiveRegion="polite" style={[plusStyles.alert, styles.tools]}>{notice}</Text>}
      {showFreeMap ? <>
        <View style={styles.tools}><Actions>
          <StudioAction label="メモを書く" icon="create-outline" onPress={() => setCapture({})} />
          {Boolean(store.reflections?.length) && <StudioAction label="保存した振り返り" onPress={() => setReflectionPage(true)} />}
          {store.atelierProjects.length > 0 && <StudioAction label="アトリエを開く" onPress={() => setAtelierList(true)} />}
          {store.collectionItems.length > 0 && <StudioAction label="作品集を開く" onPress={() => setCollection({})} />}
          {enabled.commerce && <StudioAction label="購入と復元を試す" onPress={() => setPurchase(true)} />}
          <StudioAction label="データを書き出す・削除する" onPress={() => setData(true)} />
        </Actions></View>
        <PlusComparisonMap store={store} />
      </> : comparison ? <>
        <View style={[plusStyles.full, manualMap && { display: 'none' }]}>
          <PlusStudio writer={writer} canArrange={canArrange} canSuggest={canRequest} onRead={openReading}
            onWrite={(centerId) => setCapture({ centerId })} onAtelier={enabled.atelier ? () => setAtelierList(true) : undefined}
            onAtelierFromMemo={enabled.atelier ? (id) => void openAtelier(id, [id]) : undefined}
            onCollection={enabled.collection ? (from) => setCollection({ backLabel: from === 'records' ? '記録に戻る' : 'その他に戻る' }) : undefined}
            onData={() => setData(true)} onPurchase={enabled.commerce ? () => setPurchase(true) : undefined} onManualMap={() => setManualMap('more')}
            onMapImmersiveChange={setMapImmersive} />
        </View>
        {manualMap && <View style={plusStyles.full}>{detailedMap}</View>}
      </> : detailedMap}
    </View> : !overlay && <ScrollView contentContainerStyle={studioStyles.content}>
      <StudioTitle title={comparison ? '比較用の庭' : '考えの地図'} />
      <StudioRow title="例の地図を開く" label="例の庭を開く" icon="git-network-outline" detail="つながったメモで試す"
        disabled={status.pending > 0} onPress={() => void startExample()} />
      {comparison && <StudioRow title="最初のメモを書く" label="自分でメモを書いて試す" icon="create-outline" onPress={() => setCapture({})} />}
      {!!notice && <Text accessibilityLiveRegion="polite" style={studioStyles.error}>{notice}</Text>}
      {comparison && <Actions>
        {Boolean(store.reflections?.length) && <StudioAction label="保存した振り返り" onPress={() => setReflectionPage(true)} />}
        {enabled.commerce && <StudioAction label="購入と復元を試す" onPress={() => setPurchase(true)} />}
        <StudioAction label="データを書き出す・削除する" onPress={() => setData(true)} />
      </Actions>}
    </ScrollView>}
    {capture && <StudioCapture writer={writer} center={captureCenter ? { id: captureCenter.id, label: toSeedSnippet(captureCenter, 32) } : undefined}
      onClose={() => setCapture(undefined)} onSaved={() => setCapture(undefined)} />}
    {reflectionPage && <View style={plusStyles.full}><View style={styles.tools}>
      <StudioAction label="無料版の地図に戻る" icon="arrow-back-outline" onPress={() => setReflectionPage(false)} /></View>
      <StudioRecords writer={writer} index={index} advanced={false} canCreateReflection={canArrange}
        onRead={(id) => { setReflectionPage(false); openReading(id); }} onWork={() => setCollection({})}
        onWrite={() => { setReflectionPage(false); setCapture({}); }} />
    </View>}
    {reading && <ScrollView contentContainerStyle={plusStyles.page}>
      <View><PlusButton label={readingBack} focusRef={backControl} onPress={() => setReading(undefined)} /></View>
      <Heading title>{selected ? selected.title || toSeedSnippet(selected) : '原文を確認できません'}</Heading>
      {selected && <SectionCard><Heading>元のメモ</Heading><Text selectable style={plusStyles.original}>{selected.body}</Text>
        {selected.synthesis && <><Heading>現在の芽</Heading><Text selectable style={plusStyles.original}>{selected.synthesis.statement}</Text></>}
      </SectionCard>}
    </ScrollView>}
    {ai && !atelier && <PlusAiScreen writer={writer} centerId={ai.seedId} scope={ai.scope} onBack={() => setAi(undefined)} allowRequest={rights.requestFixtureAi} canRequest={canRequest}
      onMaterial={enabled.atelier && rights.atelierAdvanced ? (seedIds) => { void openAtelier(ai.seedId, seedIds, ai.origin); } : undefined} />}
    {atelierList && !atelier && !collection && <AtelierLibrary store={store} notice={notice} hasAccess={enabled.atelier && rights.atelierAdvanced}
      backLabel={atelierReturn.current ? '作品集に戻る' : comparison && !showFreeMap ? 'その他に戻る' : '地図に戻る'}
      onBack={() => {
        if (atelierReturn.current) setCollection(atelierReturn.current);
        atelierReturn.current = undefined; setAtelierList(false); setNotice('');
      }}
      onNew={() => void openAtelier()} onResume={setAtelier} />}
    {atelier && <View style={[plusStyles.full, collection && { display: 'none' }]}><PlusAtelierScreen writer={writer} projectId={atelier} advanced={enabled.atelier && rights.atelierAdvanced} comparison={comparison}
      canUseAdvanced={canUseAtelier} onBack={() => setAtelier(undefined)}
      onCreateWork={enabled.collection && rights.composeWork ? (source) => { if (canCompose()) setCollection({ source }); } : undefined}
      onOriginMap={(context) => { setOrigin({ ...context }); setAtelier(undefined); setAtelierList(false); setAi(undefined); atelierReturn.current = undefined;
        if (comparison && !showFreeMap) setManualMap('origin'); }} /></View>}
    {collection && <PlusCollectionScreen writer={writer} source={collection.source} canCompose={enabled.collection && rights.composeWork}
      comparison={comparison} backLabel={collection.backLabel} onStartDraft={enabled.atelier && rights.atelierAdvanced ? () => {
        atelierReturn.current = collection; setCollection(undefined); setAtelierList(true);
      } : undefined}
      canComposeNow={canCompose} onBack={() => setCollection(undefined)} />}
    </View>
    {purchase && <PlusPurchasePreview model={purchaseModel} comparison={comparison} onBack={() => setPurchase(false)} />}
    {data && <PlusDataScreen comparison={comparison} writer={writer} onBack={() => setData(false)}
      onReset={() => { setData(false); setOrigin(undefined); setNotice(''); setManualMap(false); }} />}
  </View>;
}

export function PlusPreview({ onClose }: { onClose?: () => void } = {}) {
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
    {(!onClose || !writer || tabOnly) && <View style={styles.header}>
      {onClose && !writer ? (
        <>
          <View style={styles.headerRow}>
            <View style={styles.planLabel}><Heading>無料と Plus の比較</Heading></View>
            <PlusButton label="比較を閉じる" onPress={onClose} />
          </View>
          <Text style={plusStyles.meta}>例のメモで比較できます。料金は発生しません。</Text>
        </>
      ) : !onClose && <Text style={plusStyles.meta}>Kizashi Plus 開発プレビュー · 例のデータ</Text>}
      {tabOnly && writer && <Text style={plusStyles.meta}>例の庭はこのタブを開いている間だけ使えます。</Text>}
    </View>}
    {writer ? <PreviewGarden writer={writer} onClose={onClose} /> : <View style={plusStyles.page}>
      {failure ? <><Text accessibilityRole="alert" style={plusStyles.alert}>{failure === 'busy'
        ? '別のタブで例の庭が開いています。そのタブを閉じてから、ここで読み込めます。'
        : '例の庭の保存データを読み込めませんでした。'}</Text>
        <PlusButton label="読み込みをやり直す" onPress={() => { setFailure(undefined); setAttempt((value) => value + 1); }} /></>
        : <ActivityIndicator accessibilityLabel="例の庭を読み込み中" />}
    </View>}
  </SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  header: { width: '100%', maxWidth: 860, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  comparisonHeader: { width: '100%', maxWidth: 860, alignSelf: 'center', minHeight: 57, paddingHorizontal: 13, paddingVertical: 4,
    flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: studioColors.rule,
    backgroundColor: studioColors.surface },
  planTitle: { color: studioColors.text, fontWeight: '700', fontSize: 14 },
  planState: { color: studioColors.muted, fontSize: 12 },
  planLabel: { flex: 1 },
  tools: { width: '100%', maxWidth: 860, alignSelf: 'center', paddingHorizontal: 13, paddingTop: 8 },
});

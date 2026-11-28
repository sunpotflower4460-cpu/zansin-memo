import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GardenV3Writer, PlusCommand } from '../data/gardenV3Writer';
import type { StudioPreferences } from '../domain/plus/contracts';
import { requirePlusAccess } from '../domain/plus/entitlements';
import { settleInsight, type Suggestion } from '../domain/plus/insights';
import { indexMap } from '../domain/plus/map';
import { permissionFor } from '../domain/plus/proposalPrivacy';
import { restoreProposalPair, updateSeedPermission } from '../domain/plus/proposals';
import { initialStudioPreferences, saveStudioPreferences } from '../domain/plus/studio';
import { createId } from '../utils/ids';
import { toSeedSnippet } from '../utils/seedText';
import { InsightCard, StudioInsights } from './StudioInsights';
import { StudioMapPanel, StudioNoteList } from './StudioMapPanel';
import { StudioRecords } from './StudioRecords';
import { IconButton, StudioAction, StudioTitle, studioColors, studioStyles, type StudioIcon } from './StudioUI';
import { useStudioSuggestions } from './studioSuggestionState';

const nav = [
  { id: 'map', label: '地図', icon: 'git-network-outline' },
  { id: 'ai', label: 'AIの提案', icon: 'sparkles-outline' },
  { id: 'records', label: '記録', icon: 'calendar-outline' },
  { id: 'more', label: 'その他', icon: 'ellipsis-horizontal' },
] as const satisfies readonly { id: string; label: string; icon: StudioIcon }[];
type Tab = typeof nav[number]['id'];
type MapPreview = { kind: 'suggestions' | 'connection'; center: string; selected?: string; emphasisId?: string; returnTo: 'ai' | 'records' };
const noSuggestions: readonly Suggestion[] = [];

type StudioProps = {
  writer: GardenV3Writer; canArrange: () => boolean; canSuggest: () => boolean;
  onRead: (id: string, onReturn?: () => void, backLabel?: string) => void; onWrite: (centerId?: string) => void; onAtelier?: () => void; onCollection?: () => void;
  onData: () => void; onPurchase?: () => void; onManualMap: () => void;
};

export function PlusStudio({ writer, canArrange, canSuggest, onRead, onWrite, onAtelier, onCollection, onData, onPurchase, onManualMap }: StudioProps) {
  const store = React.useSyncExternalStore(writer.subscribe, writer.getSnapshot);
  const index = React.useMemo(() => indexMap(store.seeds, store.connections), [store.connections, store.seeds]);
  const first = index.byId.get('example-0') ?? index.live[0];
  const [tab, setTab] = React.useState<Tab>('map');
  const [mapCenter, setMapCenter] = React.useState('');
  const [selection, setSelection] = React.useState('');
  const [aiCenter, setAiCenter] = React.useState('');
  const [trail, setTrail] = React.useState<string[]>([]);
  const [pick, setPick] = React.useState<'map' | 'ai'>();
  const [preview, setPreview] = React.useState<MapPreview>();
  const [review, setReview] = React.useState<Suggestion>();
  const [immersive, setImmersive] = React.useState(false);
  const [notice, setNotice] = React.useState<string>();
  const [mapNotice, setMapNotice] = React.useState<string>();
  const [pending, setPending] = React.useState(false);
  const handling = React.useRef(false);
  const center = index.byId.get(preview?.center ?? mapCenter) ?? first;
  const selected = index.byId.get(preview ? preview.selected ?? preview.center : selection) ?? center;
  const focus = index.byId.get(aiCenter) ?? selected;
  const state = useStudioSuggestions(store, index, focus?.id ?? '', canSuggest() && (tab === 'ai' || (tab === 'map' && preview?.kind === 'suggestions')));
  const settings = store.studioPreferences ?? initialStudioPreferences;

  if (!focus || !center || !selected) return null;
  const focusId = focus.id;
  const previousCenter = index.byId.get(trail.at(-1) ?? '');
  const skipped = store.proposalSuppressions.filter(({ pair }) => pair.includes(focusId))
    .flatMap(({ pair }) => index.byId.get(pair[0] === focusId ? pair[1] : pair[0]) ?? []);

  function changeTab(next: Tab) {
    if (next === 'ai' && (!aiCenter || (tab === 'map' && !preview))) setAiCenter(selected!.id);
    setTab(next); setPick(undefined); setNotice(undefined); setPreview(undefined); setReview(undefined); setImmersive(false);
  }

  function focusMap(id: string) {
    const origin = index.byId.get(mapCenter) ?? first;
    if (origin && id !== origin.id) setTrail((before) => [...before.slice(-30), origin.id]);
    setPreview(undefined); setMapCenter(id); setSelection(id);
  }

  function previous() {
    const id = trail.at(-1);
    if (!id) return;
    setTrail((before) => before.slice(0, -1));
    setMapCenter(id); setSelection(id);
  }

  function openAi(id: string) {
    setAiCenter(id); setTab('ai'); setNotice(undefined); setPreview(undefined); setImmersive(false);
  }

  function closePreview() {
    if (!preview) return;
    setTab(preview.returnTo); setPreview(undefined); setReview(undefined); setImmersive(false); setNotice(undefined);
  }

  function selectOnMap(id: string) {
    if (preview) setPreview({ ...preview, selected: id });
    else setSelection(id);
  }

  async function changeMap(patch: Partial<StudioPreferences>) {
    const result = await writer.run(requirePlusAccess(saveStudioPreferences(patch, createId()), canArrange));
    setMapNotice(result.ok ? undefined : result.detail ?? '表示スタイルを保存できませんでした。');
  }

  async function apply(command: PlusCommand, message: string) {
    if (handling.current) return false;
    handling.current = true; setPending(true);
    try {
      const result = await writer.run(requirePlusAccess(command, canSuggest));
      setNotice(result.ok ? message : result.detail ?? '変更を保存できませんでした。');
      return result.ok;
    } finally { handling.current = false; setPending(false); }
  }

  async function settle(entry: Suggestion, action: 'connect' | 'dismiss', fromMap: boolean) {
    const saved = await apply(settleInsight(entry, action, createId(), new Date().toISOString()),
      action === 'connect' ? 'つながりを保存しました' : '候補を見送りました');
    if (!saved || !fromMap) return;
    setReview((before) => before === entry ? undefined : before);
    setPreview((before) => before?.kind === 'suggestions' && before.center === entry.from.id ? { ...before,
      selected: action === 'connect' ? entry.to.id : entry.from.id, emphasisId: action === 'connect' ? entry.to.id : undefined,
    } : before);
  }

  return <View style={studioStyles.root}>
    <View style={[studioStyles.root, (tab !== 'map' || pick || review) && styles.hidden]}>
      {mapNotice && <Text accessibilityLiveRegion="polite" style={[studioStyles.error, styles.mapNotice]}>{mapNotice}</Text>}
      <StudioMapPanel index={index} center={center} selected={selected} settings={settings}
        hints={preview?.kind === 'suggestions' && focusId === center.id ? state.suggestions : noSuggestions}
        preview={preview && { kind: preview.kind, label: notice ?? (preview.kind === 'suggestions' ? '候補のつながり' : '記録から開いたつながり'),
          emphasisId: preview.emphasisId, onClose: closePreview }}
        immersive={immersive} onImmersive={() => setImmersive(!immersive)}
        back={!preview && previousCenter ? { title: toSeedSnippet(previousCenter, 50), onPress: previous } : undefined}
        onSearch={() => setPick('map')} onSettings={(patch) => void changeMap(patch)}
        onSelect={selectOnMap} onFocus={focusMap} onRead={onRead} onAI={openAi} onReview={(item) => { setNotice(undefined); setReview(item); }} onWrite={onWrite} />
    </View>
    <View style={[studioStyles.root, (tab !== 'ai' || pick || review) && styles.hidden]}>
      {canSuggest() ? <StudioInsights focus={focus} state={state} notice={notice} pending={pending} skipped={skipped}
      onPick={() => setPick('ai')} onRead={(id) => onRead(id, undefined, '候補に戻る')} onMap={(id) => {
        setPreview({ kind: 'suggestions', center: focusId, selected: id, emphasisId: id, returnTo: 'ai' });
        setNotice(undefined); setTab('map');
      }}
      onSettle={(entry, action) => void settle(entry, action, false)}
      onRestore={(id) => void apply(restoreProposalPair(focusId, id, createId()), '見送りを解除しました')}
      onPermission={(include) => void apply(updateSeedPermission(createId(), focusId, permissionFor(store, focusId)?.epoch ?? 0,
        { discovery: include ? 'include' : 'exclude' }, new Date().toISOString()), include ? '候補に含めました' : '自動候補から外しました')} /> :
      <ScrollView style={studioStyles.root} contentContainerStyle={studioStyles.content}><StudioTitle title="AIの提案" />
        <Text style={studioStyles.text}>このビルドでは提案機能が無効です。</Text></ScrollView>}
    </View>
    <View style={[studioStyles.root, (tab !== 'records' || pick) && styles.hidden]}>
      <StudioRecords writer={writer} index={index} advanced={canArrange()} canCreateReflection={canArrange}
        onRead={(id) => onRead(id, undefined, '記録に戻る')} onRelation={([from, to]) => {
          setPreview({ kind: 'connection', center: from, selected: to, emphasisId: to, returnTo: 'records' });
          setNotice(undefined); setTab('map');
        }}
        onWork={onCollection ?? (() => undefined)} onWrite={() => onWrite()} />
    </View>
    {tab === 'more' && !pick && <ScrollView style={studioStyles.root} contentContainerStyle={studioStyles.content}>
      <StudioTitle title="その他" />
      <View style={studioStyles.card}>
        {onAtelier && <StudioAction label="アトリエを開く" icon="create-outline" onPress={onAtelier} />}
        {onCollection && <StudioAction label="作品集を開く" icon="albums-outline" onPress={onCollection} />}
        <StudioAction label="地図の範囲・配置を編集" icon="options-outline" onPress={onManualMap} />
      </View>
      <View style={studioStyles.card}>
        {onPurchase && <StudioAction label="購入と復元を試す" onPress={onPurchase} />}
        <StudioAction label="データを書き出す・削除する" onPress={onData} />
      </View>
    </ScrollView>}
    {pick && <ScrollView style={studioStyles.root} contentContainerStyle={studioStyles.content} keyboardShouldPersistTaps="handled">
      <StudioTitle title={pick === 'ai' ? '起点のメモを選ぶ' : 'メモを探す'}>
        <IconButton label="検索を閉じる" icon="close" onPress={() => setPick(undefined)} />
      </StudioTitle>
      <StudioNoteList index={index} selected={pick === 'ai' ? focusId : selected.id} onPick={(id) => {
        if (pick === 'ai') setAiCenter(id);
        else focusMap(id);
        setPick(undefined); setNotice(undefined);
      }} />
    </ScrollView>}
    {review && <ScrollView accessibilityViewIsModal style={studioStyles.root} contentContainerStyle={studioStyles.content}>
      <StudioTitle title="候補を確認"><IconButton label="候補を閉じる" icon="close" disabled={pending} onPress={() => setReview(undefined)} /></StudioTitle>
      {notice && <Text accessibilityLiveRegion="polite" style={studioStyles.status}>{notice}</Text>}
      <InsightCard suggestion={review} pending={pending} onRead={(id) => onRead(id, undefined, '候補に戻る')}
        onSettle={(entry, action) => void settle(entry, action, true)} />
    </ScrollView>}
    {!review && !(immersive && tab === 'map' && !pick) && <View accessibilityRole="tablist" style={styles.nav}>
      {nav.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label}
        accessibilityState={{ selected: !pick && tab === item.id }} onPress={() => changeTab(item.id)}
        style={({ pressed }) => [styles.tab, !pick && tab === item.id && styles.active, pressed && studioStyles.quiet]}>
        <Ionicons name={item.icon} color={!pick && tab === item.id ? studioColors.green : studioColors.muted} size={20} />
        <Text style={[styles.tabText, !pick && tab === item.id && styles.activeText]}>{item.label}</Text>
      </Pressable>)}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
  nav: { flexDirection: 'row', alignItems: 'stretch', gap: 4, borderTopWidth: 1, borderTopColor: studioColors.rule,
    paddingHorizontal: 10, paddingTop: 4, paddingBottom: 4, backgroundColor: studioColors.surface },
  tab: { flex: 1, minHeight: 45, borderRadius: 10, paddingHorizontal: 2, paddingVertical: 4, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabText: { color: studioColors.muted, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  active: { backgroundColor: studioColors.soft },
  activeText: { color: studioColors.green, fontWeight: '800' },
  mapNotice: { paddingHorizontal: 14, paddingTop: 7 },
});

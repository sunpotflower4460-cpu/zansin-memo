import * as React from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import type { GardenV3Writer, PlusCommand } from '../data/gardenV3Writer';
import { activeDraft, adoptAtelierRevision, atelierExampleCurrent, changedRange, chooseAtelierBranch, forkAtelier, insertAtelierExample, materialState, movePins,
  reviseMaterial, saveAtelierExample, saveAtelierRevision, saveAtelierText, trackPin } from '../domain/plus/atelier';
import type { AtelierDraft, AtelierProject, AtelierRevision, GardenStoreV3, MapReturnContext } from '../domain/plus/contracts';
import { requirePlusAccess } from '../domain/plus/entitlements';
import { createId } from '../utils/ids';
import { normalizeSearchText, searchableText, toSeedSnippet } from '../utils/seedText';
import { Actions, Heading, PlusButton, PlusInput, plusStyles } from './PlusUI';
import { IconButton, StudioAction, StudioRow, StudioSegments, StudioTitle, studioColors, studioStyles } from './StudioUI';
import { useBufferedText } from './useBufferedText';

const now = () => new Date().toISOString();
const panels = [{ id: 'draft', label: '書く' }, { id: 'materials', label: '材料' }, { id: 'versions', label: '残した版' }] as const;

type Props = {
  writer: GardenV3Writer; projectId: string; onBack: () => void; advanced: boolean; canUseAdvanced: () => boolean;
  onCreateWork?: (revision: AtelierRevision) => void;
  onOriginMap?: (context: MapReturnContext) => void;
  comparison?: boolean;
};
type BuildDraftCommand = (target: { projectId: string; branchId: string; expected: number }) => PlusCommand;

export function PlusAtelierScreen(props: Props) {
  const store = React.useSyncExternalStore(props.writer.subscribe, props.writer.getSnapshot);
  const project = store.atelierProjects.find((item) => item.id === props.projectId);
  const draft = project && activeDraft(store, project);
  if (!project || !draft) return <ScrollView contentContainerStyle={plusStyles.page}>
    <PlusButton label="戻る" onPress={props.onBack} /><Text style={plusStyles.text}>下書きを確認できませんでした。</Text></ScrollView>;
  return <AtelierEditor key={JSON.stringify([project.id, draft.branchId])} {...props} project={project} draft={draft} store={store} />;
}

export function AtelierLibrary({ store, notice, hasAccess, backLabel, onBack, onNew, onResume }: {
  store: GardenStoreV3; notice?: string; hasAccess: boolean; backLabel: string; onBack: () => void; onNew: () => void; onResume: (id: string) => void;
}) {
  const projects = store.atelierProjects.map((project, i) => ({ project, draft: activeDraft(store, project), i }))
    .sort((a, b) => (b.draft?.updatedAt ?? b.project.updatedAt).localeCompare(a.draft?.updatedAt ?? a.project.updatedAt));
  return <ScrollView style={studioStyles.root} contentContainerStyle={studioStyles.content}>
    <StudioTitle title="アトリエ" back={{ label: backLabel, onPress: onBack }} />
    {!projects.length && <View style={[studioStyles.card, editorStyles.welcome]}>
      <Text style={studioStyles.subtitle}>下書きを育てる</Text>
      <Text style={studioStyles.muted}>気になるメモを手元に置いて、思いついたことから書けます。</Text>
      {hasAccess && <StudioAction label="新しいアトリエ" title="下書きをはじめる" icon="add" primary onPress={onNew} />}
    </View>}
    {!!projects.length && hasAccess && <StudioAction label="新しいアトリエ" title="新しい下書き" icon="add" primary onPress={onNew} />}
    {projects.map(({ project, draft, i }) => {
      const text = draft?.text.trim() ?? '';
      const title = project.title || (text ? toSeedSnippet({ body: text }, 29) : '題名のない下書き');
      const versions = store.atelierRevisions.filter(({ projectId }) => projectId === project.id).length;
      const detail = versions ? `残した版 ${versions}件` : text ? '書きかけ' : '下書きは空です';
      return <StudioRow key={project.id} title={title} detail={detail} icon="document-text-outline"
        label={`${project.title ?? `アトリエ ${i + 1}`}を再開`} onPress={() => onResume(project.id)} />;
    })}
    {!!notice && <Text accessibilityLiveRegion="polite" style={studioStyles.error}>{notice}</Text>}
  </ScrollView>;
}

function AtelierEditor({ writer, project, draft, store, onBack, onCreateWork, onOriginMap, advanced, canUseAdvanced, comparison }: Props & {
  project: AtelierProject; draft: AtelierDraft; store: GardenStoreV3;
}) {
  const [notice, setNotice] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [picker, setPicker] = React.useState(false);
  const [cap, setCap] = React.useState(20);
  const [chosen, setChosen] = React.useState<string>();
  const [compare, setCompare] = React.useState(false);
  const [shortExample, setShortExample] = React.useState(false);
  const [centerId, setCenterId] = React.useState(project.centerSeedId);
  const [chooseCenter, setChooseCenter] = React.useState(false);
  const [adoption, setAdoption] = React.useState<Parameters<typeof adoptAtelierRevision>[0]>();
  const [locked, setLocked] = React.useState(false);
  const [panel, setPanel] = React.useState<typeof panels[number]['id']>('draft');
  const [tools, setTools] = React.useState(false);
  const [openMaterial, setOpenMaterial] = React.useState<string>();
  const lock = React.useRef(false);
  const selectedRange = React.useRef({ start: 0, end: 0 });
  const ids = { projectId: draft.projectId, branchId: draft.branchId };
  const currentDraft = () => writer.getSnapshot().atelierDrafts.find((entry) => entry.projectId === ids.projectId && entry.branchId === ids.branchId);
  const buffer = useBufferedText(draft.text, draft.editRevision, async (text, expected, operationId) => {
    const result = await writer.run(saveAtelierText({ ...ids, expected }, text, operationId, now()));
    return result.ok ? { revision: currentDraft()?.editRevision ?? expected } : { error: result.detail ?? '下書きを保存できませんでした。入力は残っています。' };
  });
  const keyword = normalizeSearchText(search.trim());
  const visible = store.seeds.filter((seed) => !seed.deletedAt && (!keyword || searchableText(seed).includes(keyword)));
  const revisions = store.atelierRevisions.filter((item) => item.projectId === project.id);
  const last = project.branches.find((branch) => branch.id === draft.branchId)?.headRevisionId;
  const selected = revisions.find((item) => item.id === (chosen ?? last));
  const center = store.seeds.find((seed) => seed.id === centerId && !seed.deletedAt);
  const fixtureMaterial = draft.materials.map((item) => store.sourceSnapshots.find((snapshot) => snapshot.id === item.snapshotId))
    .find((snapshot) => snapshot?.source.ref.seedId === 'example-0' && snapshot.text === '長い日記は続かない。帰り道の気づきを、もっと手軽に残してみたい。');
  const hint = store.atelierSuggestions.filter((entry) => entry.projectId === project.id && entry.branchId === draft.branchId).at(-1);
  const canInsert = hint && buffer.text === draft.text && atelierExampleCurrent(store, draft, hint);

  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setLocked(true); setNotice('');
    try { if (await buffer.flush()) await action(); }
    finally { lock.current = false; setLocked(false); }
  }

  function commit(build: BuildDraftCommand, after?: () => void) {
    void perform(async () => {
      const current = currentDraft();
      if (!current) return;
      const result = await writer.run(build({ ...ids, expected: current.editRevision }));
      if (result.ok) after?.(); else setNotice(result.detail ?? '保存できませんでした。もう一度試せます。');
    });
  }
  function commitAdvanced(build: BuildDraftCommand, after?: () => void) {
    commit((target) => requirePlusAccess(build(target), canUseAdvanced), after);
  }

  function pinSelection() {
    const { start, end } = selectedRange.current;
    const paragraphStart = start > 0 ? buffer.text.lastIndexOf('\n', start - 1) + 1 : 0;
    const nextLine = buffer.text.indexOf('\n', start);
    const range = start === end ? { start: paragraphStart, end: nextLine < 0 ? buffer.text.length : nextLine } : { start, end };
    commitAdvanced((target) => trackPin({ target, id: createId(), range, at: now() }));
  }

  function beginAdoption() {
    if (!center || !selected) return;
    setAdoption({ id: createId(), revisionId: selected.id, centerId: center.id, centerText: center.body, newSynthesisId: createId(),
      oldSynthesis: center.synthesis, snapshotId: createId(), at: now() });
  }

  const difference = selected && changedRange(selected.text, buffer.text);

  return <ScrollView style={studioStyles.root} contentContainerStyle={comparison ? studioStyles.content : plusStyles.page}
    automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
    {comparison ? <>
      <StudioTitle title={project.title || 'アトリエ'} back={{ label: 'アトリエを閉じる', onPress: () => void perform(async () => onBack()) }}>
        {project.originNavigation && onOriginMap && <IconButton label="制作を始めた地図に戻る" icon="git-network-outline"
          onPress={() => void perform(async () => onOriginMap(project.originNavigation!))} />}
      </StudioTitle>
      <StudioSegments label="アトリエの作業" items={panels} value={panel} onChange={(next) => {
        Keyboard.dismiss(); setPanel(next); setSearch(''); setCap(20);
      }} />
    </> : <><Actions><PlusButton label="アトリエを閉じる" onPress={() => void perform(async () => onBack())} />
      {project.originNavigation && onOriginMap && <PlusButton label="制作を始めた地図に戻る" onPress={() =>
        void perform(async () => onOriginMap(project.originNavigation!))} />}</Actions>
      <Heading title>{project.title || 'アトリエ'}</Heading></>}
    {(!comparison || panel === 'materials') && <SectionCard>
      {!comparison && <Heading>材料棚</Heading>}
      {comparison && !draft.materials.length && !picker && <Text style={studioStyles.muted}>下書きの横に置きたいメモを選べます。</Text>}
      {draft.materials.map(({ snapshotId, versionMode }) => {
        const snapshot = store.sourceSnapshots.find(({ id }) => id === snapshotId);
        const state = materialState(store.seeds, snapshot);
        const hidden = state === 'deleted' || state === 'missing';
        const title = hidden ? state === 'deleted' ? '削除したメモ' : '原文を確認できないメモ' : snapshot?.title ?? '題名のない材料';
        const opened = !comparison || openMaterial === snapshotId;
        return <View style={comparison ? editorStyles.material : plusStyles.rule} key={snapshotId}>
          {comparison ? <StudioRow title={title} detail={state === 'changed' ? '原文に更新があります' : undefined}
            icon={opened ? 'book-outline' : 'document-outline'} onPress={() => setOpenMaterial(opened ? undefined : snapshotId)} /> : <Heading>{title}</Heading>}
          {opened && <>
          {!hidden && <><Text style={plusStyles.meta}>{versionMode === 'historical' ? '当時の材料を使っています' : '選んだときの材料'}{state === 'changed' ? ' · 現在の原文に更新があります' : ''}</Text>
            <Text selectable style={plusStyles.original}>{snapshot?.text}</Text></>}
          <Actions>
            {state === 'changed' && <>
              <PlusButton label="現在の文章を選び直す" onPress={() => commit((target) => reviseMaterial({ kind: 'refresh', priorId: snapshotId, id: createId(), commandId: createId(), target, at: now() }))} />
              {versionMode !== 'historical' && <PlusButton label="当時の材料のまま残す" onPress={() => commit((target) => reviseMaterial({ kind: 'historical', priorId: snapshotId, commandId: createId(), target, at: now() }))} />}
            </>}
            <PlusButton label="材料棚から外す" onPress={() => commit((target) => reviseMaterial({ kind: 'remove', priorId: snapshotId, commandId: createId(), target, at: now() }))} />
          </Actions></>}
        </View>;
      })}
      <PlusButton label={picker ? '材料選びを閉じる' : '材料を足す'} onPress={() => setPicker(!picker)} />
      {picker && <><PlusInput accessibilityLabel="材料を探す" placeholder="すべてのメモから探す" value={search} onChangeText={(value) => { setSearch(value); setCap(20); }} />
        {visible.slice(0, cap).map((seed) => <Actions key={seed.id}>
          <PlusButton label={`${toSeedSnippet(seed, 38)}の原文を選ぶ`} onPress={() => commit((target) => reviseMaterial({ kind: 'add',
            ref: { seedId: seed.id, part: 'body' }, id: createId(), commandId: createId(), target, at: now() }))} />
          {seed.synthesis && <PlusButton label={`${toSeedSnippet(seed, 38)}の芽を選ぶ`} onPress={() => commit((target) => reviseMaterial({ kind: 'add',
            ref: { seedId: seed.id, part: 'synthesis', synthesisId: seed.synthesis!.id }, id: createId(), commandId: createId(), target, at: now() }))} />}
        </Actions>)}
        {visible.length > cap && <PlusButton label="さらに表示" onPress={() => setCap((value) => value + 20)} />}
      </>}
    </SectionCard>}
    {(!comparison || panel === 'draft') && <View style={comparison ? editorStyles.drafting : studioStyles.card}>
      {!comparison && <Heading>作業中の文</Heading>}
      {(!comparison || tools || project.branches.length > 1) && <Actions>{project.branches.map((branch) => <PlusButton key={branch.id} label={branch.name ?? '案'} disabled={locked} selected={branch.id === draft.branchId}
        onPress={() => commit(() => chooseAtelierBranch(project.id, branch.id, createId()))} />)}
        {advanced && <PlusButton label="別の案を書く" disabled={locked} onPress={() => commitAdvanced(() => forkAtelier(project.id, createId(), now()))} />}</Actions>}
      <PlusInput accessibilityLabel="アトリエの下書き" placeholder="思い浮かんだ言葉をここに" style={comparison && editorStyles.paper}
        multiline value={buffer.text} onSelectionChange={(event) => { selectedRange.current = event.nativeEvent.selection; }}
        onChangeText={(text) => {
          if (!movePins(draft.text, text, draft.pinnedExcerpts)) { setNotice('固定した一節を外してから編集できます'); return; }
          buffer.edit(text);
        }} />
      <Actions>
        {advanced && <StudioAction label="この版を残す" icon="bookmark-outline" primary disabled={locked || !buffer.text.trim()} onPress={() => commitAdvanced((target) => saveAtelierRevision(target, createId(), now()), () => {
          setChosen(undefined); setNotice('版を保存しました');
          if (comparison) { Keyboard.dismiss(); setPanel('versions'); }
        })} />}
        <StudioAction label="下書きを保存" icon="checkmark" disabled={locked} onPress={() => void perform(async () => setNotice('下書きを保存しました'))} />
        {comparison && advanced && <IconButton label={tools ? '編集ツールを閉じる' : '編集ツールを開く'} icon="ellipsis-horizontal" onPress={() => setTools(!tools)} />}
        {advanced && (!comparison || tools) && <PlusButton label="選択中の一節を固定" disabled={locked || !buffer.text.trim()} onPress={pinSelection} />}
      </Actions>
      {draft.pinnedExcerpts.map((item) => <View key={item.id} style={plusStyles.rule}><Text selectable style={plusStyles.original}>固定した一節「{item.text}」</Text>
        <PlusButton label="固定を外して編集" onPress={() => commit((target) => trackPin({ target, id: item.id, at: now() }))} /></View>)}
      {advanced && fixtureMaterial && (!comparison || tools) && <>
        <PlusButton label={shortExample ? '短い案の例を閉じる' : '短い案の例を見る'} selected={shortExample} onPress={() => setShortExample(!shortExample)} />
        {shortExample && <View style={plusStyles.rule}><Text style={plusStyles.meta}>架空の材料で、無通信の案の取り込みを試せます。</Text>
          <PlusButton label="題名の例を用意する" disabled={locked} onPress={() => commitAdvanced((target) => saveAtelierExample(target, {
            id: createId(), snapshotId: fixtureMaterial.id, kind: 'title', content: '帰り道のひとこと', at: now(),
          }))} />
          {hint && <>
            {canInsert ? <><Text style={plusStyles.original}>{hint.content}</Text><Text style={plusStyles.meta}>根拠にした原文「{hint.evidence[0].quote}」</Text>
              <Actions><PlusButton label="文末に案を入れる" onPress={() => commitAdvanced((target) => insertAtelierExample(target, { id: hint.id, start: 0, end: 0, append: true, at: now() }))} />
                <PlusButton label="選んだ位置に案を入れる" onPress={() => commitAdvanced((target) => insertAtelierExample(target, { id: hint.id, ...selectedRange.current, at: now() }))} /></Actions>
            </> : <Text style={plusStyles.meta}>{hint.decision === 'inserted' ? '案を作業中の文に入れました' : '材料や下書きが変わりました。案を確認し直せます。'}</Text>}
          </>}
        </View>}
      </>}
      {buffer.message && <Text accessibilityLiveRegion="polite" style={plusStyles.alert}>{buffer.message}</Text>}
      {notice !== '' && <Text accessibilityLiveRegion="polite" style={plusStyles.meta}>{notice}</Text>}
    </View>}
    {comparison && panel === 'versions' && !revisions.length && <View style={studioStyles.card}>
      <Text style={studioStyles.subtitle}>まだ版がありません</Text>
      <StudioAction label="下書きに戻る" icon="create-outline" onPress={() => setPanel('draft')} />
    </View>}
    {revisions.length > 0 && (!comparison || panel === 'versions') && <SectionCard>
      {!comparison && <Heading>残した版 {revisions.length}件</Heading>}
      {comparison && notice !== '' && <Text accessibilityLiveRegion="polite" style={studioStyles.status}>{notice}</Text>}
      {(!comparison || revisions.length > 1) && <Actions>{revisions.map((entry, i) => <PlusButton key={entry.id} label={`保存した版 ${i + 1}を見る`} selected={selected?.id === entry.id}
        onPress={() => { setChosen(entry.id); setAdoption(undefined); }} />)}</Actions>}
      {selected && <>
        <Text selectable style={plusStyles.original}>{selected.text}</Text>
        <Actions>
          {advanced && <PlusButton label="作業中の文と比べる" selected={compare} onPress={() => setCompare(!compare)} />}
          {advanced && <PlusButton label="この版から考え直す" disabled={locked} onPress={() => commitAdvanced(() => forkAtelier(project.id, createId(), now(), selected.id))} />}
          {onCreateWork && <StudioAction label="この版を作品にする" primary icon="albums-outline" onPress={() => void perform(async () => onCreateWork(selected))} />}
        </Actions>
        {compare && advanced && difference && <View style={plusStyles.row}>
          <Text style={plusStyles.meta}>共通の冒頭</Text><Text selectable style={plusStyles.text}>{selected.text.slice(0, difference.start) || '（なし）'}</Text>
          <Text style={plusStyles.meta}>保存した版で異なる部分</Text><Text selectable style={plusStyles.text}>{selected.text.slice(difference.start, difference.end) || '（なし）'}</Text>
          <Text style={plusStyles.meta}>作業中の文で異なる部分</Text><Text selectable style={plusStyles.text}>{buffer.text.slice(difference.start, difference.afterEnd) || '（なし）'}</Text>
          <Text style={plusStyles.meta}>共通の末尾</Text><Text selectable style={plusStyles.text}>{selected.text.slice(difference.end) || '（なし）'}</Text>
        </View>}
        <Heading>芽として残す場所</Heading>
        <Text style={plusStyles.meta}>{center ? toSeedSnippet(center, 48) : '中心のメモを選んでください'}</Text>
        <Actions><PlusButton label="中心のメモを選ぶ" onPress={() => { setChooseCenter(!chooseCenter); setAdoption(undefined); }} />
          <PlusButton label={center?.synthesis ? '今の芽を見直す' : '芽にする内容を確認'} disabled={!center} onPress={beginAdoption} /></Actions>
        {chooseCenter && <><PlusInput accessibilityLabel="中心のメモを探す" value={search} onChangeText={(value) => { setSearch(value); setCap(20); }} />
          {visible.slice(0, cap).map((seed) => <PlusButton key={seed.id} label={toSeedSnippet(seed, 42)} onPress={() => { setCenterId(seed.id); setChooseCenter(false); }} />)}
          {visible.length > cap && <PlusButton label="さらに表示" onPress={() => setCap((value) => value + 20)} />}</>}
        {adoption && <View style={plusStyles.row}><Heading>採用前の確認</Heading><Text style={plusStyles.original}>{adoption.centerText}</Text>
          {adoption.oldSynthesis && <Text style={plusStyles.text}>今の芽「{adoption.oldSynthesis.statement}」を見直します。</Text>}
          <Actions><PlusButton label="この版を芽として保存" disabled={locked} primary onPress={() => commit(() => adoptAtelierRevision(adoption), () => { setAdoption(undefined); setNotice('芽として保存しました'); })} />
            <PlusButton label="採用をやめる" onPress={() => setAdoption(undefined)} /></Actions>
        </View>}
      </>}
    </SectionCard>}
  </ScrollView>;
}

const editorStyles = StyleSheet.create({
  welcome: { backgroundColor: '#edf1e5', padding: 16 },
  drafting: { gap: 10 },
  paper: { minHeight: 230, fontSize: 17, lineHeight: 27, borderColor: '#dcd6c5', backgroundColor: studioColors.surface },
  material: { gap: 7, paddingBottom: 4 },
});

import * as React from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import type { GardenV3Writer } from '../data/gardenV3Writer';
import { materialState } from '../domain/plus/atelier';
import { createCollectionWork, defaultWorkLayout, getWorkOnReturn, moveWork, recordWorkOutput, removeWork, saveWorkDraft, saveWorkEdit,
  workContent, workFormat, workOutputKey, workText, type WorkContent } from '../domain/plus/collection';
import type { AtelierRevision, CollectionReturnContext, CollectionRevision, GardenStoreV3, SourceSnapshot } from '../domain/plus/contracts';
import { readSource } from '../domain/plus/sources';
import { showConfirm } from '../utils/confirm';
import { createId } from '../utils/ids';
import { normalizeSearchText, searchableText, toSeedSnippet } from '../utils/seedText';
import { Actions, focusControl, Heading, PlusButton, PlusInput, plusStyles } from './PlusUI';
import { PlusWorkPaper, paperMap } from './PlusWorkPaper';
import { useBufferedText } from './useBufferedText';
import { makeWorkFile, makeWorkText } from './workFiles';
import type { GeneratedWorkFile } from './workFileTypes';

const now = () => new Date().toISOString();
const missingWork = '開いていた作品の版を確認できません';

export function PlusCollectionScreen({ writer, source, onBack, canCompose = true }: {
  writer: GardenV3Writer; source?: AtelierRevision; onBack: () => void; canCompose?: boolean;
}) {
  const store = React.useSyncExternalStore(writer.subscribe, writer.getSnapshot);
  const [composing, setComposing] = React.useState(Boolean(source));
  const [selected, setSelected] = React.useState<CollectionReturnContext>();
  const [notice, setNotice] = React.useState('');
  const context = selected && getWorkOnReturn(store, selected);
  const lostVersion = Boolean(selected && !context);
  const showMissing = React.useCallback(() => { setSelected(undefined); setNotice(missingWork); }, []);
  React.useEffect(() => { if (lostVersion) showMissing(); }, [lostVersion, showMissing]);
  const open = (work: CollectionRevision) => {
    setNotice('');
    setSelected({ collectionItemId: work.itemId, collectionRevisionId: work.id, scrollOffset: 0 });
  };
  if (composing && source) return <Composer writer={writer} source={source} store={store} onCancel={onBack} canCompose={canCompose}
    onSave={(work) => { setComposing(false); open(work); }} />;

  if (context && selected) return <WorkView key={context.revision.id} content={workContent(store, context.revision)}
    context={selected} newer={context.newer} store={store} writer={writer} onList={() => { setSelected(undefined); setNotice(''); }}
    onRevision={open} onMissing={showMissing} />;

  return <ScrollView contentContainerStyle={plusStyles.page}>
    <PlusButton label={source ? 'アトリエに戻る' : '地図に戻る'} onPress={onBack} />
    <Heading title>作品集</Heading>
    {notice && <Text accessibilityLiveRegion="polite" style={plusStyles.meta}>{notice}</Text>}
    {store.collectionItems.length === 0 && <Text style={plusStyles.text}>アトリエで残した版を選ぶと、作品をここに置けます。</Text>}
    {[...store.collectionItems].sort((a, b) => a.order - b.order).map((item, i, list) => {
      const work = store.collectionRevisions.find((revision) => revision.id === item.currentRevisionId);
      return work && <SectionCard key={item.id}>
        <Heading>{work.title || '題名のない作品'}</Heading>
        <Text style={plusStyles.meta}>{work.kind === 'word_card' ? 'ことばカード' : '地図と文章の1ページ'}</Text>
        <Text numberOfLines={3} style={plusStyles.original}>{work.textSnapshot}</Text>
        <Actions><PlusButton label="作品を開く" onPress={() => open(work)} />
          <PlusButton label="前へ移動" disabled={i === 0} onPress={() => void writer.run(moveWork(item.id, -1, createId()))} />
          <PlusButton label="後ろへ移動" disabled={i === list.length - 1} onPress={() => void writer.run(moveWork(item.id, 1, createId()))} />
        </Actions>
      </SectionCard>;
    })}
  </ScrollView>;
}

function Composer({ writer, store, source, onCancel, onSave, canCompose }: {
  writer: GardenV3Writer; store: GardenStoreV3; source: AtelierRevision; onCancel: () => void; onSave: (work: CollectionRevision) => void; canCompose: boolean;
}) {
  const [title, setTitle] = React.useState(source.title ?? '');
  const [text, setText] = React.useState(source.text);
  const [layout, setLayout] = React.useState<NonNullable<CollectionRevision['layout']>>(defaultWorkLayout);
  const [page, setPage] = React.useState(false);
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [included, setIncluded] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState('');
  const [limit, setLimit] = React.useState(16);
  const [preview, setPreview] = React.useState<{ command: ReturnType<typeof createCollectionWork>; content: WorkContent }>();
  const [notice, setNotice] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const saving = React.useRef(false);
  const paperRef = React.useRef<View>(null);
  const { width } = useWindowDimensions();
  const paperWidth = Math.min(560, width - 70);
  const [used, setUsed] = React.useState(0);
  const keyword = normalizeSearchText(search.trim());
  const notes = store.seeds.filter((seed) => !seed.deletedAt && (!keyword || searchableText(seed).includes(keyword)));
  const project = store.atelierProjects.find((entry) => entry.id === source.projectId);
  const layoutAtOrigin = project?.originNavigation;

  function review() {
    const command = createCollectionWork({ itemId: createId(), revisionId: createId(), atelierRevisionId: source.id, title, text, layout, at: now(),
      materialSnapshotIds: included, map: page ? { nodes: chosen.map((seedId) => ({ seedId, snapshotId: createId() })),
        positions: layoutAtOrigin?.layoutSnapshot.positions, viewId: layoutAtOrigin?.origin.kind === 'saved' ? layoutAtOrigin.origin.mapViewId : undefined } : undefined });
    const proposal = command.apply(writer.getSnapshot());
    if ('rejected' in proposal) { setNotice(proposal.rejected); return; }
    const work = proposal.collectionRevisions.at(-1)!;
    setUsed(0); setPreview({ command, content: workContent(proposal, work) }); setNotice('');
  }

  async function save() {
    if (!preview || saving.current || !canCompose) return;
    saving.current = true; setBusy(true);
    try {
      const result = await writer.run(preview.command);
      const work = writer.getSnapshot().collectionRevisions.find(({ id }) => id === preview.content.work.id);
      if (result.ok && work) onSave(work);
      else setNotice(!result.ok && result.detail || '作品を保存できませんでした。内容は残っています。');
    } finally { saving.current = false; setBusy(false); }
  }

  if (preview) {
    const height = Math.round(paperWidth * (page ? Math.SQRT2 : 1.25));
    return <ScrollView contentContainerStyle={plusStyles.page}>
      <Heading title>作品のプレビュー</Heading>
      <PlusWorkPaper content={preview.content} width={paperWidth} height={height} paperRef={paperRef} onMeasure={setUsed} />
      {used > height && <Text style={plusStyles.alert}>この内容は一枚に収まりません。文章や出典を調整できます。</Text>}
      {notice && <Text accessibilityLiveRegion="polite" style={plusStyles.alert}>{notice}</Text>}
      <Actions><PlusButton label="内容を選び直す" disabled={busy} onPress={() => setPreview(undefined)} />
        <PlusButton label="作品集に残す" primary disabled={busy || !canCompose} onPress={() => void save()} /></Actions>
      {!canCompose && <Text style={plusStyles.meta}>新しい作品を保存できる利用権の確認が必要です。編集中の文章は残っています。</Text>}
    </ScrollView>;
  }

  return <ScrollView contentContainerStyle={plusStyles.page} keyboardShouldPersistTaps="handled">
    <PlusButton label="アトリエに戻る" onPress={onCancel} />
    <Heading title>作品をつくる</Heading>
    <Actions><PlusButton label="ことばカード" selected={!page} onPress={() => setPage(false)} />
      <PlusButton label="地図と文章の1ページ" selected={page} onPress={() => setPage(true)} /></Actions>
    <PlusInput accessibilityLabel="作品の題名" placeholder="題名（任意）" value={title} onChangeText={setTitle} />
    <PlusInput accessibilityLabel="作品に残す文章" value={text} multiline onChangeText={setText} />
    {!canCompose && <Text style={plusStyles.meta}>新しい作品の保存には利用権が必要です。入力中の文章はここで読めます。</Text>}
    <SectionCard>
      <Heading>紙面と出典</Heading>
      <Actions><PlusButton label="和紙色" selected={layout.paper === 'washi'} onPress={() => setLayout({ ...layout, paper: 'washi' })} />
        <PlusButton label="白い紙" selected={layout.paper === 'white'} onPress={() => setLayout({ ...layout, paper: 'white' })} />
        <PlusButton label="文章を中央に置く" selected={layout.textAlign === 'center'} onPress={() => setLayout({ ...layout, textAlign: layout.textAlign === 'center' ? 'start' : 'center' })} />
        <PlusButton label="出典を紙面に含める" selected={layout.includeSources} onPress={() => setLayout({ ...layout, includeSources: !layout.includeSources })} /></Actions>
      {source.materialSnapshotIds.map((id) => {
        const material = store.sourceSnapshots.find((snapshot) => snapshot.id === id);
        const state = materialState(store.seeds, material);
        if (state === 'deleted' || state === 'missing') return <Text key={id} style={plusStyles.meta}>現在は参照できない材料</Text>;
        return <PlusButton key={id} label={`${material?.title || '題名なし'}の当時の材料を作品に残す`} selected={included.includes(id)}
          onPress={() => setIncluded((before) => before.includes(id) ? before.filter((value) => value !== id) : [...before, id])} />;
      })}
    </SectionCard>
    {page && <SectionCard><Heading>地図に含める種 · {chosen.length}件</Heading>
      <PlusButton label="図を文章の下に置く" selected={layout.mapPosition === 'below'} onPress={() => setLayout({ ...layout, mapPosition: layout.mapPosition === 'below' ? 'above' : 'below' })} />
      <PlusInput accessibilityLabel="作品の地図に含める種を探す" value={search} onChangeText={(value) => { setSearch(value); setLimit(16); }} />
      {notes.slice(0, limit).map((seed) => <PlusButton key={seed.id} label={`${toSeedSnippet(seed, 42)}を図に含める`} selected={chosen.includes(seed.id)}
        onPress={() => setChosen((before) => before.includes(seed.id) ? before.filter((id) => id !== seed.id) : [...before, seed.id])} />)}
      {notes.length > limit && <PlusButton label="さらに表示" onPress={() => setLimit(limit + 16)} />}
    </SectionCard>}
    {notice && <Text accessibilityLiveRegion="polite" style={plusStyles.alert}>{notice}</Text>}
    <PlusButton label="紙面を確認" primary disabled={!text.trim() || (page && !chosen.length)} onPress={review} />
  </ScrollView>;
}

function WorkView({ content, context, newer, store, writer, onList, onRevision, onMissing }: {
  content: WorkContent; context: CollectionReturnContext; newer: boolean; store: GardenStoreV3; writer: GardenV3Writer;
  onList: () => void; onRevision: (next: CollectionRevision) => void; onMissing: () => void;
}) {
  const { work } = content;
  const [editing, setEditing] = React.useState(false);
  const [read, setRead] = React.useState<{ snapshotId: string; mode: 'current' | 'historical'; context: CollectionReturnContext }>();
  const [used, setUsed] = React.useState(0);
  const [notice, setNotice] = React.useState('');
  const [prepared, setFile] = React.useState<{ file: GeneratedWorkFile; key: string }>();
  const [busy, setBusy] = React.useState(false);
  const outputBusy = React.useRef(false);
  const mounted = React.useRef(true);
  const paperRef = React.useRef<View>(null);
  const scroller = React.useRef<ScrollView>(null);
  const scroll = React.useRef(0);
  const readerBack = React.useRef<View>(null);
  const listBack = React.useRef<View>(null);
  const materialButtons = React.useRef(new Map<string, View>());
  const returning = React.useRef<typeof read>(undefined);
  const dimension = useWindowDimensions();
  const width = Math.max(210, Math.min(560, dimension.width - 70));
  const height = Math.round(width * (work.kind === 'word_card' ? 1.25 : Math.SQRT2));
  const crowded = paperMap(content, width - Math.round(width * 0.09) * 2, Math.round(height * 0.30)).crowded;
  const overflow = used > height || crowded;
  const isCurrent = !newer;
  const last = store.collectionExportReceipts.filter((receipt) => receipt.itemId === work.itemId).at(-1);
  const key = workOutputKey(content);
  const file = prepared?.key === key ? prepared.file : undefined;
  React.useEffect(() => { setFile(undefined); }, [key]);
  React.useEffect(() => () => prepared?.file.discard(), [prepared]);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useEffect(() => {
    if (read) {
      const frame = requestAnimationFrame(() => focusControl(readerBack.current));
      return () => cancelAnimationFrame(frame);
    }
    const prior = returning.current;
    if (prior) {
      const frame = requestAnimationFrame(() => {
        scroller.current?.scrollTo({ y: prior.context.scrollOffset, animated: false });
        focusControl(materialButtons.current.get(`${prior.snapshotId}:${prior.mode}`) ?? listBack.current);
        returning.current = undefined;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [read]);

  async function output(format: 'paper' | 'text') {
    if (outputBusy.current || (format === 'paper' && (overflow || !paperRef.current || !used))) return;
    outputBusy.current = true; setBusy(true); setNotice('');
    let built: GeneratedWorkFile | undefined;
    try {
      built = format === 'paper' ? await makeWorkFile(paperRef.current!, workFormat(work)) : await makeWorkText(workText(content));
      if (!mounted.current || workOutputKey(workContent(writer.getSnapshot(), work)) !== key) throw new Error('material_changed');
      if (format === 'paper' && !(await writer.run(recordWorkOutput(createId(), work, now(), key))).ok) throw new Error('output_receipt_failed');
      if (!mounted.current) throw new Error('view_closed');
      setFile({ file: built, key }); setNotice('ファイルを用意しました'); built = undefined;
    } catch { if (mounted.current) setNotice('書き出せませんでした。作品の内容を確認し、もう一度試せます。'); }
    finally { built?.discard(); outputBusy.current = false; if (mounted.current) setBusy(false); }
  }

  function deliverFile() {
    const current = writer.getSnapshot();
    if (!file || !getWorkOnReturn(current, context) || prepared?.key !== workOutputKey(workContent(current, work))) {
      setFile(undefined); setNotice('材料に変更があります。確認してからファイルを作り直してください。');
      return;
    }
    void file.deliver().catch(() => setNotice('ファイルを取り出せませんでした'));
  }

  function openMaterial(snapshot: SourceSnapshot, mode: 'current' | 'historical') {
    setRead({ snapshotId: snapshot.id, mode, context: { ...context, scrollOffset: scroll.current, selectedMaterialSnapshotId: snapshot.id } });
  }
  function closeMaterial() {
    if (!read) return;
    if (!getWorkOnReturn(writer.getSnapshot(), read.context)) { onMissing(); return; }
    returning.current = read;
    setRead(undefined);
  }
  function materialControl(snapshotId: string, mode: 'current' | 'historical') {
    const key = `${snapshotId}:${mode}`;
    return (control: View | null) => {
      if (control) materialButtons.current.set(key, control);
      else materialButtons.current.delete(key);
    };
  }
  const snapshot = read && store.sourceSnapshots.find((entry) => entry.id === read.snapshotId);
  const live = snapshot && readSource(store.seeds, snapshot.source.ref, true);
  const linkedMaterials = [...new Map([...content.materials, ...(content.diagram?.nodes.flatMap((node) =>
    store.sourceSnapshots.find(({ id }) => id === node.sourceSnapshotId) ?? []) ?? [])].map((item) => [item.id, item])).values()];

  if (editing && isCurrent) return <WorkEditor writer={writer} store={store} work={work} onBack={() => setEditing(false)} onSave={(next) => { setEditing(false); onRevision(next); }} />;
  return <View style={plusStyles.full}>
    <View style={[plusStyles.full, read && { display: 'none' }]}><ScrollView ref={scroller} contentContainerStyle={plusStyles.page}
      onScroll={(event) => { scroll.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={48}>
      <PlusButton label="作品集に戻る" focusRef={listBack} onPress={onList} />
      <Heading title>{work.title || '題名のない作品'}</Heading>
      {newer && <PlusButton label="新しい作品版を開く" onPress={() => {
        const item = store.collectionItems.find(({ id }) => id === work.itemId);
        const next = store.collectionRevisions.find(({ id }) => id === item?.currentRevisionId);
        if (next) onRevision(next);
      }} />}
      <PlusWorkPaper content={content} width={width} height={height} paperRef={paperRef} onMeasure={setUsed} />
      {overflow && <Text style={plusStyles.alert}>一枚には収まりません。文章を調整するか、テキストで取り出せます。</Text>}
      {(content.hidden.length > 0 || content.missingMaterials > 0) && <Text style={plusStyles.meta}>削除・参照できない材料の引用を隠しています。ご自身の文章に材料の内容が残っている場合は、共有前に確認できます。</Text>}
      {last && <Text style={plusStyles.meta}>{file && last.collectionRevisionId === work.id && file.format === last.format ? '現在の版のファイルを用意しました' : '最後の出力版は作品集に記録されています'}</Text>}
      <Actions>
        {isCurrent && <PlusButton label="本文・題名を編集" onPress={() => setEditing(true)} />}
        <PlusButton label={`${workFormat(work).toUpperCase()}ファイルを作る`} primary disabled={busy || overflow || used === 0} onPress={() => void output('paper')} />
        <PlusButton label="テキストファイルを作る" disabled={busy} onPress={() => void output('text')} />
        {file && <PlusButton label="ファイルを取り出す・共有" onPress={deliverFile} />}
      </Actions>
      {notice && <Text accessibilityLiveRegion="polite" style={plusStyles.meta}>{notice}</Text>}
      {linkedMaterials.length > 0 && <SectionCard><Heading>作品の材料</Heading>
        {linkedMaterials.map((entry) => <View key={entry.id} style={plusStyles.rule}>
          <Text style={plusStyles.text}>{entry.title || '題名のない材料'}</Text>
          <Actions><PlusButton label="作ったときの材料を見る" focusRef={materialControl(entry.id, 'historical')} onPress={() => openMaterial(entry, 'historical')} />
            <PlusButton label="現在の原文を開く" focusRef={materialControl(entry.id, 'current')} onPress={() => openMaterial(entry, 'current')} /></Actions>
        </View>)}
      </SectionCard>}
      {isCurrent && <PlusButton label="作品を削除する" onPress={() => showConfirm('作品を削除しますか？', '選んだ作品とその版を作品集から削除します。', [
        { text: 'やめる', style: 'cancel' }, { text: '削除する', style: 'destructive', onPress: () => void writer.run(removeWork(work.itemId, createId())).then((result) => {
          if (result.ok) onList(); else setNotice('作品を削除できませんでした');
        }) }])} />}
    </ScrollView></View>
    {read && <ScrollView contentContainerStyle={plusStyles.page}><PlusButton label="開いていた作品版に戻る" focusRef={readerBack} onPress={closeMaterial} />
      <Heading title>{read.mode === 'current' ? '現在の原文' : '作ったときの材料'}</Heading>
      {snapshot && live ? <SectionCard><Heading>{(read.mode === 'current' ? live.title : snapshot.title) ?? '題名のない材料'}</Heading>
        {materialState(store.seeds, snapshot) === 'changed' && <Text style={plusStyles.meta}>作品を作ったときから原文に更新があります</Text>}
        <Text selectable style={plusStyles.original}>{read.mode === 'current' ? live.text : snapshot.text}</Text>
      </SectionCard> : <Text style={plusStyles.text}>この材料の原文は表示できません。</Text>}
    </ScrollView>}
  </View>;
}

function WorkEditor({ writer, store, work, onBack, onSave }: {
  writer: GardenV3Writer; store: GardenStoreV3; work: CollectionRevision; onBack: () => void; onSave: (work: CollectionRevision) => void;
}) {
  const draft = store.collectionDrafts.find((entry) => entry.itemId === work.itemId);
  const [notice, setNotice] = React.useState('');
  const lock = React.useRef(false);
  const planned = React.useRef<string>(undefined);
  const buffered = useBufferedText(JSON.stringify({ title: draft?.title ?? work.title ?? '', text: draft?.text ?? work.textSnapshot }), draft?.editRevision ?? 0,
    async (value, expected, operationId) => {
      const changed = JSON.parse(value) as { title: string; text: string };
      const result = await writer.run(saveWorkDraft({ ...changed, itemId: work.itemId, base: work.id, expected, at: now(), operationId }));
      return result.ok ? { revision: expected + 1 } : { error: result.detail ?? '下書きを保存できませんでした。入力は残っています。' };
    });
  const form = JSON.parse(buffered.text) as { title: string; text: string };
  async function save() {
    if (lock.current) return;
    lock.current = true;
    try {
      if (!await buffered.flush()) return;
      const latest = writer.getSnapshot().collectionDrafts.find(({ itemId }) => itemId === work.itemId);
      if (!latest) { onBack(); return; }
      planned.current ??= createId();
      const result = await writer.run(saveWorkEdit(work.itemId, work.id, latest.editRevision, planned.current, now()));
      const next = writer.getSnapshot().collectionRevisions.find(({ id }) => id === planned.current);
      if (result.ok) { if (next) onSave(next); else onBack(); }
      else setNotice(result.detail ?? '作品を保存できませんでした。入力は残っています。');
    } finally { lock.current = false; }
  }
  return <ScrollView contentContainerStyle={plusStyles.page} keyboardShouldPersistTaps="handled">
    <Heading title>作品の文章を編集</Heading>
    <PlusInput accessibilityLabel="保存済み作品の題名" value={form.title} onChangeText={(title) => buffered.edit(JSON.stringify({ ...form, title }))} />
    <PlusInput accessibilityLabel="保存済み作品の本文" value={form.text} multiline onChangeText={(text) => buffered.edit(JSON.stringify({ ...form, text }))} />
    <Actions><PlusButton label="変更を保存" primary disabled={!form.text.trim()} onPress={() => void save()} />
      <PlusButton label="書きかけを残して戻る" onPress={() => void buffered.flush().then((ok) => { if (ok) onBack(); })} /></Actions>
    {(buffered.message || notice) && <Text accessibilityLiveRegion="polite" style={plusStyles.alert}>{buffered.message || notice}</Text>}
  </ScrollView>;
}

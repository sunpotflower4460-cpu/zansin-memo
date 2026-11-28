import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GardenV3Writer } from '../data/gardenV3Writer';
import { adoptCraft, type DraftTarget } from '../domain/plus/atelier';
import type { AtelierRevision } from '../domain/plus/contracts';
import { composeCraft, craftExcerpts, craftPart, craftRecipes, craftRoles, type CraftCandidate, type CraftPart, type CraftRecipe } from '../domain/plus/craft';
import { requirePlusAccess } from '../domain/plus/entitlements';
import { indexMap } from '../domain/plus/map';
import { textDigest } from '../domain/plus/sources';
import { theme } from '../styles/theme';
import { createId } from '../utils/ids';
import { normalizeSearchText, searchableText, toSeedSnippet } from '../utils/seedText';
import { PlusInput, buttonSelectionProps } from './PlusUI';
import { generateLocalCraft, localCraftAvailability } from './studioLanguage';
import { StudioAction, StudioRow, StudioSegments, StudioTitle, studioColors, studioStyles } from './StudioUI';

export type CraftStart = { seedIds: string[]; quotes?: string[]; target?: DraftTarget };
type Props = {
  start: CraftStart; writer: GardenV3Writer; advanced: boolean; canUse: () => boolean; canUseAI: () => boolean; canCompose: () => boolean;
  onBack: () => void; onDraft: (id: string) => void; onWork: (id: string, revision: AtelierRevision) => void;
};

export function StudioCraftBench({ start, writer, advanced, canUse, canUseAI, canCompose, onBack, onDraft, onWork }: Props) {
  const store = React.useSyncExternalStore(writer.subscribe, writer.getSnapshot);
  const index = React.useMemo(() => indexMap(store.seeds, store.connections), [store.seeds, store.connections]);
  const [parts, setParts] = React.useState<CraftPart[]>(() => [...new Set(start.seedIds)].slice(0, 3).flatMap((id, i) => {
    const seed = index.byId.get(id);
    const quote = start.quotes?.[i];
    const offset = seed && quote ? seed.body.indexOf(quote) : -1;
    const excerpt = quote && offset >= 0 ? { quote, start: offset, end: offset + quote.length } : seed && craftExcerpts(seed.body)[0];
    return seed && excerpt ? [craftPart(seed, excerpt)] : [];
  }));
  const [recipe, setRecipe] = React.useState<CraftRecipe>('experience');
  const [slot, setSlot] = React.useState<number>();
  const [picking, setPicking] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [limit, setLimit] = React.useState(12);
  const [aiReady, setAiReady] = React.useState(false);
  const [ai, setAi] = React.useState<{ base: CraftCandidate; result: CraftCandidate }>();
  const [showAI, setShowAI] = React.useState(false);
  const [showQuotes, setShowQuotes] = React.useState(false);
  const [thinking, setThinking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const run = React.useRef(0);
  const saving = React.useRef(false);
  const attempt = React.useRef<{ candidate: CraftCandidate; toWork: boolean; args: Parameters<typeof adoptCraft>[0] }>(undefined);
  React.useEffect(() => {
    let mounted = true;
    if (canUseAI()) void localCraftAvailability().then((ok) => { if (mounted) setAiReady(ok); });
    return () => { mounted = false; run.current++; };
  }, [canUseAI]);

  const current = React.useMemo(() => parts.map((part) => {
    const seed = index.byId.get(part.source.ref.seedId);
    return seed && seed.title === part.title && textDigest(seed.body) === part.source.textDigest ? seed : undefined;
  }), [parts, index]);
  const stale = current.some((seed) => !seed);
  const base = React.useMemo(() => stale ? undefined : composeCraft(parts, recipe), [parts, recipe, stale]);
  const alternative = ai?.base === base ? ai?.result : undefined;
  const candidate = showAI && alternative ? alternative : base;
  const source = slot === undefined ? undefined : current[slot];
  const excerpts = React.useMemo(() => {
    if (!source || slot === undefined) return [];
    const selected = parts[slot];
    const others = craftExcerpts(source.body).filter((item) => item.start !== selected.start || item.end !== selected.end);
    return [selected, ...others];
  }, [parts, slot, source]);
  const search = normalizeSearchText(query.trim());
  const options = React.useMemo(() => slot === undefined || !picking ? [] : index.live.filter((seed) => seed.body.trim() &&
    !parts.some((part, i) => i !== slot && part.source.ref.seedId === seed.id) && (!search || searchableText(seed).includes(search))),
  [index.live, parts, picking, search, slot]);

  function cancelGeneration() { run.current++; setThinking(false); }
  function update(next: CraftPart[]) {
    cancelGeneration(); setAi(undefined); setShowAI(false); setNotice(''); setParts(next); setSlot(undefined); Keyboard.dismiss();
  }
  function selectSlot(i: number) {
    setSlot(i); setPicking(!current[i]); setQuery(''); setLimit(12); setNotice('');
  }
  async function generate() {
    if (!base || !canUse() || !canUseAI() || !aiReady) return;
    const generation = ++run.current;
    setThinking(true); setNotice('');
    try {
      const aim = craftRecipes.find((entry) => entry.id === recipe)!.aim;
      const result = await generateLocalCraft(aim, base.parts.map((part) => part.quote));
      if (run.current !== generation || !canUse() || !canUseAI()) return;
      if (result) { setAi({ base, result: { ...base, ...result, generator: 'on_device' } }); setShowAI(true); }
      else setNotice('AIの案を作れませんでした。レシピの案を使うか、もう一度試せます。');
    } catch {
      if (run.current === generation) setNotice('AIの案を作れませんでした。レシピの案は下に残っています。');
    } finally { if (run.current === generation) setThinking(false); }
  }
  async function adopt(toWork: boolean) {
    if (!candidate || saving.current || !canUse() || (toWork && !canCompose())) return;
    saving.current = true; setBusy(true); setNotice('');
    try {
      if (attempt.current?.candidate !== candidate || attempt.current.toWork !== toWork) {
        const target = start.target ?? { projectId: createId(), branchId: createId(), expected: 0 };
        attempt.current = { candidate, toWork, args: { candidate, target, id: createId(), at: new Date().toISOString(),
          create: !start.target, saveVersion: toWork } };
      }
      const { args } = attempt.current;
      const saved = await writer.run(requirePlusAccess(adoptCraft(args), () => canUse() && (!toWork || canCompose())));
      if (!saved.ok) { setNotice(saved.detail ?? '保存できませんでした。この案のまま再試行できます。'); return; }
      if (toWork) {
        const revision = writer.getSnapshot().atelierRevisions.find((entry) => entry.id === `${args.id}:version`);
        if (revision) onWork(args.target.projectId, revision);
        else setNotice('保存した版を開けませんでした。アトリエから確認できます。');
      } else onDraft(args.target.projectId);
    } finally { saving.current = false; setBusy(false); }
  }

  if (slot !== undefined) return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
    style={studioStyles.root} contentContainerStyle={studioStyles.content}>
    <StudioTitle title={picking ? '素材を選ぶ' : '使う一節'} subtitle={craftRoles[slot]}
      back={{ label: '作業台に戻る', onPress: () => { Keyboard.dismiss(); setSlot(undefined); } }} />
    {picking ? <>
      <PlusInput accessibilityLabel="作業台の素材を探す" placeholder="メモの題名・本文・カテゴリ" value={query}
        returnKeyType="search" onChangeText={(value) => { setQuery(value); setLimit(12); }} />
      {options.slice(0, limit).map((seed) => <StudioRow key={seed.id} label={`${toSeedSnippet(seed, 45)}を素材に置く`}
        icon="add-outline" title={toSeedSnippet(seed, 45)} detail={toSeedSnippet({ body: seed.body }, 58)} onPress={() => {
          const next = [...parts];
          const excerpt = craftExcerpts(seed.body)[0];
          if (!excerpt) return;
          next[slot] = craftPart(seed, excerpt);
          update(next);
        }} />)}
      {options.length > limit && <StudioAction label="さらに素材を表示" onPress={() => setLimit(limit + 12)} />}
      {!options.length && <Text style={studioStyles.muted}>ほかに選べるメモがありません。別の言葉で探すか、メモを一枚書いてみてください。</Text>}
      {!source && parts[slot] && <StudioAction label="この素材を外す" onPress={() => update(parts.filter((_, i) => i !== slot))} />}
    </> : source && <>
      <Text style={studioStyles.subtitle}>{toSeedSnippet(source, 55)}</Text>
      {excerpts.slice(0, limit).map((item) => <Pressable key={`${item.start}-${item.end}`} accessibilityRole="button"
        {...buttonSelectionProps(item === parts[slot])} onPress={() => update(parts.map((part, i) => i === slot ? craftPart(source, item) : part))}
        style={[studioStyles.card, item === parts[slot] && styles.chosen]}><Text style={studioStyles.text}>{item.quote}</Text></Pressable>)}
      {excerpts.length > limit && <StudioAction label="さらに一節を表示" onPress={() => setLimit(limit + 12)} />}
      <View style={studioStyles.wrap}>
        {slot > 0 && <StudioAction label="きっかけの位置に移す" icon="swap-horizontal" onPress={() => update([parts[slot], ...parts.filter((_, i) => i !== slot)])} />}
        <StudioAction label="別のメモに入れ替える" onPress={() => { setLimit(12); setPicking(true); }} />
        <StudioAction label="この素材を外す" onPress={() => update(parts.filter((_, i) => i !== slot))} />
      </View>
    </>}
  </ScrollView>;

  return <ScrollView style={studioStyles.root} contentContainerStyle={studioStyles.content}>
    <StudioTitle title="アイデアの作業台" back={{ label: '作業台を閉じる', onPress: onBack, disabled: busy }} />
    <View style={styles.board}>
      <View style={styles.slots}>{craftRoles.map((role, i) => {
        const part = parts[i];
        const note = current[i];
        const disabled = busy || i > parts.length;
        return <Pressable accessibilityRole="button" key={role} disabled={disabled} accessibilityState={{ disabled }}
          accessibilityLabel={part ? `${role}の素材を編集` : `${role}にメモを置く`}
          style={({ pressed }) => [styles.slot, part && styles.filled, pressed && studioStyles.quiet]} onPress={() => selectSlot(i)}>
          <Text style={styles.role}>{role}</Text>
          {part ? <Text numberOfLines={3} style={styles.slotText}>{note ? toSeedSnippet(note, 40) : '選び直す'}</Text> :
            <><Ionicons name="add" size={22} color={studioColors.green} /><Text style={styles.slotHint}>{i === 2 ? '任意' : 'メモを置く'}</Text></>}
        </Pressable>;
      })}</View>
      <Text style={styles.boardDetail}>{parts.length > 1 ? '素材をタップして、使う一節を選べます。' : 'メモを2枚置くと、案を読めます。'}</Text>
    </View>
    {stale && <Text accessibilityLiveRegion="polite" style={studioStyles.error}>素材に更新があります。「選び直す」から現在のメモを確認してください。</Text>}
    {!advanced && <Text style={studioStyles.muted}>新しい案の取り込みにはPlusの利用権が必要です。</Text>}
    {base && candidate && <>
      <StudioSegments label="作業台のレシピ" items={craftRecipes} value={recipe} onChange={(next) => {
        if (recipe === next || busy) return;
        cancelGeneration(); setRecipe(next); setShowAI(false); setNotice('');
      }} />
      <View style={[studioStyles.card, styles.paper]}>
        <Text style={styles.resultLabel}>{candidate.generator === 'recipe' ? 'レシピで組んだ案' : '端末内AIの案'} · 未保存</Text>
        <Text accessibilityRole="header" style={styles.resultTitle}>{candidate.title}</Text>
        <Text selectable style={studioStyles.text}>{candidate.body}</Text>
        <StudioAction label={`この案に使った${parts.length}枚の一節`} plain icon="book-outline" expanded={showQuotes} onPress={() => setShowQuotes(!showQuotes)} />
        {showQuotes && parts.map((part, i) => <View key={part.source.ref.seedId}>
          <Text style={styles.role}>{craftRoles[i]} · {part.title || '題名のないメモ'}</Text>
          <Text selectable style={studioStyles.text}>「{part.quote}」</Text>
        </View>)}
      </View>
      {aiReady && canUseAI() && advanced && <View style={studioStyles.card}>
        <Text style={studioStyles.muted}>選んだ一節と組み方を使い、この端末で別案を作ります。</Text>
        <View style={studioStyles.wrap}>
          {alternative && <StudioAction label={showAI ? 'レシピの案と見比べる' : 'AIの案と見比べる'} disabled={busy} onPress={() => setShowAI(!showAI)} />}
          {thinking ? <StudioAction label="AIの案を待つのをやめる" onPress={cancelGeneration} /> :
            <StudioAction label="端末内AIで別案をつくる" icon="sparkles-outline" disabled={busy} onPress={() => void generate()} />}
        </View>
      </View>}
      <View style={studioStyles.wrap}>
        {canCompose() && <StudioAction label="この案を作品の紙面へ" title="作品の紙面へ" icon="albums-outline" primary disabled={busy || !advanced} onPress={() => void adopt(true)} />}
        <StudioAction label={start.target ? 'この案を下書きに加える' : '下書きで書き直す'} title={start.target ? '下書きに加える' : '下書きで続ける'} icon="create-outline"
          disabled={busy || !advanced} onPress={() => void adopt(false)} />
      </View>
      {canCompose() && <Text style={studioStyles.muted}>紙面に進むと、アトリエにこの版を保存します。</Text>}
      {!aiReady && canUseAI() && <Text style={studioStyles.muted}>レシピは通信せずに使えます。対応するiPhoneではApple Intelligenceで別案も作れます。</Text>}
    </>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={studioStyles.error}>{notice}</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  board: { backgroundColor: '#e9ede1', borderColor: '#c8d4c0', borderWidth: 1, borderRadius: 18, padding: 12, gap: 8 },
  boardDetail: { fontSize: 13, lineHeight: 20, color: studioColors.muted }, slots: { flexDirection: 'row', gap: 6 },
  slot: { flex: 1, minWidth: 0, minHeight: 99, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#8c9b86',
    backgroundColor: '#f4f5ec', padding: 7, gap: 5, alignItems: 'center', justifyContent: 'center' },
  filled: { backgroundColor: '#fffdf6', borderStyle: 'solid', borderColor: '#abbda4' },
  role: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: studioColors.green },
  slotText: { fontSize: 14, lineHeight: 20, textAlign: 'center', color: studioColors.text }, slotHint: { fontSize: 12, color: studioColors.muted },
  paper: { borderLeftWidth: 4, borderLeftColor: '#ab7d48', padding: 16, backgroundColor: '#fffbf1' },
  resultLabel: { fontSize: 12, fontWeight: '700', color: '#78552f' },
  resultTitle: { fontSize: 21, lineHeight: 29, fontFamily: theme.fonts.serif, color: studioColors.text, fontWeight: '600' },
  chosen: { backgroundColor: studioColors.soft, borderColor: studioColors.green },
});

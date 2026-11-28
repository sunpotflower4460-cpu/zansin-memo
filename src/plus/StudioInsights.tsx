import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ReturnTypeOfInsights } from './studioSuggestionState';
import type { Suggestion } from '../domain/plus/insights';
import type { Seed } from '../domain/types';
import { toSeedSnippet } from '../utils/seedText';
import { IconButton, StudioAction, StudioSegments, StudioTitle, studioColors, studioStyles } from './StudioUI';

export function InsightCard({ suggestion, pending, onRead, onSettle, onMap, onCraft }: {
  suggestion: Suggestion; pending: boolean; onRead: (id: string) => void;
  onSettle: (suggestion: Suggestion, action: 'connect' | 'dismiss') => void; onMap?: () => void; onCraft?: (suggestion: Suggestion) => void;
}) {
  return <View style={[studioStyles.card, styles.insight]}>
    <Text accessibilityRole="header" style={styles.candidateTitle}>{toSeedSnippet(suggestion.to, 70)}</Text>
    <Text style={styles.kindText}>{suggestion.kind}</Text>
    <Text style={studioStyles.text}>{suggestion.reason}</Text>
    <View style={styles.quotes}>
      {[suggestion.from, suggestion.to].map((seed, index) => <View key={seed.id} style={styles.quote}>
        <Text style={styles.quoteLabel}>{index === 0 ? '起点' : '候補'} · {toSeedSnippet(seed, 35)}</Text>
        <Text selectable style={styles.quoteText}>「{suggestion.evidence[index]}」</Text>
      </View>)}
    </View>
    <View style={studioStyles.wrap}>
      <StudioAction label="つながりを保存" primary icon="link-outline" disabled={pending} onPress={() => onSettle(suggestion, 'connect')} />
      {onCraft && <StudioAction label="この2枚でアイデアをつくる" title="作業台へ" icon="construct-outline" disabled={pending} onPress={() => onCraft(suggestion)} />}
    </View>
    <View style={styles.cardLinks}>
      {onMap && <StudioAction label="候補を地図で見る" title="地図で見る" plain onPress={onMap} />}
      <StudioAction label="原文を開く" title="原文" plain onPress={() => onRead(suggestion.to.id)} />
      <StudioAction label="見送る" plain disabled={pending} onPress={() => onSettle(suggestion, 'dismiss')} />
    </View>
  </View>;
}

export function StudioInsights({ focus, state, notice, pending, skipped, onPick, onRead, onMap, onSettle, onRestore, onPermission, onCraft }: {
  focus: Seed; state: ReturnTypeOfInsights; notice?: string; pending: boolean;
  skipped: Seed[]; onPick: () => void; onRead: (id: string) => void; onMap: (candidate?: string) => void;
  onSettle: (suggestion: Suggestion, action: 'connect' | 'dismiss') => void; onRestore: (peerId: string) => void;
  onPermission: (include: boolean) => void; onCraft?: (suggestion: Suggestion) => void;
}) {
  const [options, setOptions] = React.useState(false);
  const [browse, setBrowse] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string>();
  const active = state.suggestions.find(({ to }) => to.id === activeId) ?? state.suggestions[0];
  const position = active ? state.suggestions.indexOf(active) : -1;
  const scroll = React.useRef<ScrollView>(null);
  const reviewY = React.useRef(0);
  const sourceText = toSeedSnippet(focus, 60);
  React.useEffect(() => {
    if (active && activeId !== active.to.id) setActiveId(active.to.id);
  }, [active, activeId]);
  function choose(id: string) {
    setActiveId(id);
    scroll.current?.scrollTo({ y: Math.max(0, reviewY.current - 8), animated: false });
  }
  return <ScrollView ref={scroll} style={studioStyles.root} contentContainerStyle={studioStyles.content}>
    <StudioTitle title="つながりの候補">
      <IconButton label={options ? '候補の設定を閉じる' : '候補の設定'} icon="options-outline" onPress={() => setOptions(!options)} />
    </StudioTitle>
    <StudioSegments label="候補の探し方" items={[{ id: 'words', label: '言葉で探す' }, { id: 'model', label: '端末内AIも使う' }]}
      value={state.useModel ? 'model' : 'words'} onChange={(value) => state.setUseModel(value === 'model')} />
    {state.useModel && state.mode === 'unavailable' && <Text style={studioStyles.muted}>この端末では、共通の言葉や話題から候補を表示します。</Text>}
    {state.useModel && state.mode === 'assets' && <StudioAction label={state.preparing ? '言語モデルを準備中' : '言語モデルを準備'}
      disabled={state.preparing} icon="download-outline" onPress={() => void state.prepare()} />}
    {state.prepareError && state.useModel && <Text accessibilityLiveRegion="polite" style={studioStyles.error}>モデルを準備できませんでした。言葉による候補は引き続き使えます。</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="起点を選ぶ" accessibilityHint={`候補のもとにするメモは「${sourceText}」です。`}
      onPress={onPick} style={({ pressed }) => [studioStyles.destination, styles.source, pressed && studioStyles.quiet]}>
      <View style={studioStyles.emblem} aria-hidden><Ionicons name="document-text-outline" size={21} color={studioColors.green} /></View>
      <View style={studioStyles.grow}><Text style={studioStyles.muted}>候補のもとにするメモ</Text>
        <Text style={styles.sourceTitle} numberOfLines={2}>{sourceText}</Text></View>
      <Text style={styles.changeSource}>変更</Text>
      <Ionicons name="chevron-forward" size={15} color={studioColors.green} />
    </Pressable>
    {options && <View style={studioStyles.card}>
      <Text accessibilityRole="header" style={studioStyles.subtitle}>候補の設定</Text>
      <Text style={studioStyles.muted}>{state.mode === 'semantic' ? '端末内の言語モデルで照合します。' : '端末内の文章を照合します。'}</Text>
      {!state.excluded && <StudioAction label="このメモを自動候補から外す" onPress={() => onPermission(false)} disabled={pending} />}
    </View>}
    {!state.excluded && state.loading && <View style={styles.status}>
      <ActivityIndicator size="small" color={studioColors.green} />
      <Text accessibilityLiveRegion="polite" style={studioStyles.muted}>関連するメモを探しています…</Text>
    </View>}
    {notice && <Text accessibilityLiveRegion="polite" style={studioStyles.status}>{notice}</Text>}
    {state.excluded && <View style={studioStyles.card}>
      <Text style={studioStyles.text}>このメモは自動候補の対象から外れています。</Text>
      <View style={studioStyles.wrap}><StudioAction label="このメモを候補に含める" onPress={() => onPermission(true)} disabled={pending} /></View>
    </View>}
    {!state.excluded && !state.loading && !state.suggestions.length && <View style={studioStyles.card}>
      <Text style={studioStyles.text}>新しい候補は見つかりませんでした。</Text>
    </View>}
    {active && <View style={styles.review} onLayout={({ nativeEvent }) => { reviewY.current = nativeEvent.layout.y; }}>
      <View style={styles.navigator}>
        <IconButton label="前の候補" icon="chevron-back" disabled={position <= 0}
          onPress={() => setActiveId(state.suggestions[position - 1]?.to.id)} />
        <Text accessibilityLiveRegion="polite" style={styles.navigatorText}>候補 {position + 1} / {state.suggestions.length}</Text>
        <IconButton label="次の候補" icon="chevron-forward" disabled={position >= state.suggestions.length - 1}
          onPress={() => setActiveId(state.suggestions[position + 1]?.to.id)} />
      </View>
      <InsightCard key={active.to.id} suggestion={active} pending={pending} onRead={onRead} onSettle={onSettle}
        onMap={() => onMap(active.to.id)} onCraft={onCraft} />
    </View>}
    {state.suggestions.length > 1 && <StudioAction label={browse ? '候補の一覧を閉じる' : '候補を一覧で見る'}
      icon="list-outline" onPress={() => setBrowse(!browse)} />}
    {browse && state.suggestions.length > 1 && <View style={studioStyles.card}>
      <Text accessibilityRole="header" style={studioStyles.subtitle}>ほかの候補</Text>
      {state.suggestions.filter((suggestion) => suggestion !== active).map(({ to, kind }) =>
        <Pressable key={to.id} accessibilityRole="button" accessibilityLabel={`${toSeedSnippet(to, 55)}の候補を確認`}
          onPress={() => choose(to.id)} style={({ pressed }) => [styles.related, pressed && studioStyles.quiet]}>
          <View style={studioStyles.grow}><Text style={studioStyles.text}>{toSeedSnippet(to, 55)}</Text><Text style={studioStyles.muted}>{kind}</Text></View>
          <Ionicons name="chevron-forward" size={17} color={studioColors.green} />
        </Pressable>)}
    </View>}
    {skipped.length > 0 && <View style={studioStyles.card}>
      <Text accessibilityRole="header" style={studioStyles.subtitle}>見送った候補</Text>
      {skipped.map((seed) => <StudioAction key={seed.id} label={`${toSeedSnippet(seed, 32)}の見送りを解除`}
        disabled={pending} onPress={() => onRestore(seed.id)} />)}
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  source: { backgroundColor: '#eff2e8', borderColor: '#d7e1d3' },
  sourceTitle: { color: studioColors.text, fontSize: 17, fontWeight: '700', lineHeight: 23 },
  changeSource: { color: studioColors.green, fontSize: 12, fontWeight: '700' },
  status: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  insight: { gap: 10, borderColor: '#d4d9c8' },
  candidateTitle: { color: studioColors.text, fontSize: 21, lineHeight: 28, fontWeight: '700' },
  kindText: { color: '#7d432d', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  cardLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: studioColors.rule },
  quotes: { gap: 1, borderRadius: 11, overflow: 'hidden', backgroundColor: '#e2e9dd' },
  quote: { gap: 3, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#f0f3ea' },
  quoteLabel: { color: studioColors.green, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  quoteText: { color: studioColors.text, fontSize: 14, lineHeight: 21 },
  review: { gap: 6 },
  navigator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navigatorText: { color: studioColors.green, fontSize: 13, fontWeight: '700' },
  related: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 48, borderTopColor: studioColors.rule,
    borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
});

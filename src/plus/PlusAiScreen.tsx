import * as React from 'react';
import { ScrollView, Text } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import { buildPlusExample } from '../data/plusExample';
import type { GardenV3Writer } from '../data/gardenV3Writer';
import { requirePlusAccess } from '../domain/plus/entitlements';
import { acceptProposal, cancelProposalRequest, chooseExplorationSeeds, confirmedProposalInput, dismissProposal, prepareProposals, receiveProposals, reconcileQuota,
  recordProposalConsent, restoreProposalPair, updateSeedPermission, type ProposalPlan } from '../domain/plus/proposals';
import { permissionFor } from '../domain/plus/proposalPrivacy';
import { FixtureProposalTransport } from '../domain/plus/proposalTransport';
import { createId } from '../utils/ids';
import { normalizeSearchText, searchableText, toSeedSnippet } from '../utils/seedText';
import { Actions, Heading, PlusButton, PlusInput, plusStyles } from './PlusUI';

const now = () => new Date().toISOString();
const sample = buildPlusExample(8).seeds;
const fixture = new FixtureProposalTransport({
  now, period: () => 'fixture-period', slots: 20, reserveForMs: 90_000, resultForMs: 45_000,
  generate: (input) => {
    const from = input.sources.find((entry) => entry.text === sample[0].body);
    const to = input.sources.find((entry) => entry.text === sample[2].body);
    return !from || !to ? [] : [{ pair: [from.alias, to.alias], relationKind: 'constraint_resource',
      hypothesis: '続けて撮っている散歩の写真を、気づきを短く残すきっかけにできるかもしれません。',
      evidence: [from, to].map(({ alias, text }) => ({ alias, quote: text, start: 0, end: text.length })) }];
  },
});

export function clearPreviewProposalCache(): void { fixture.clear(); }

export async function reconcilePreviewProposals(writer: GardenV3Writer, cancelInterrupted = false): Promise<void> {
  if (cancelInterrupted) {
    for (const request of writer.getSnapshot().aiRequestReceipts.filter((entry) => entry.status === 'waiting')) {
      await writer.run(cancelProposalRequest(request.id, now()));
    }
  }
  const pending = [...writer.getSnapshot().outbox].sort((a, b) => Number(b.kind === 'cancel') - Number(a.kind === 'cancel'));
  for (const entry of pending) {
    try { await writer.run(reconcileQuota(entry, await fixture.reconcile(entry))); }
    catch { return; }
  }
}

const relationLabel = {
  shared_question: '似た問い', goal_means: '目的と手がかり', constraint_resource: '条件と手がかり',
  complementary_views: '違う見方', different_context: '別の場面',
};

export function PlusAiScreen({ writer, centerId, scope, onBack, onMaterial, allowRequest, canRequest }: {
  writer: GardenV3Writer; centerId: string; scope: readonly string[]; onBack: () => void;
  onMaterial?: (seedIds: string[]) => void; allowRequest: boolean; canRequest: () => boolean;
}) {
  const store = React.useSyncExternalStore(writer.subscribe, writer.getSnapshot);
  const generation = React.useRef(0);
  const running = React.useRef(false);
  const chosen = React.useRef<ProposalPlan>(undefined);
  const mounted = React.useRef(true);
  const [ids, setIds] = React.useState<string[]>([centerId]);
  const [automatic, setAutomatic] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState('');
  const [cap, setCap] = React.useState(20);
  const [plan, setPlan] = React.useState<ProposalPlan>();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [settings, setSettings] = React.useState(false);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      if (chosen.current) void writer.run(cancelProposalRequest(chosen.current.receipt.id, now())).then(() => reconcilePreviewProposals(writer));
    };
  }, [writer]);

  const query = normalizeSearchText(search.trim());
  const inScope = new Set(scope);
  const visible = store.seeds.filter((seed) => inScope.has(seed.id) && !seed.deletedAt && (!query || searchableText(seed).includes(query)));
  const candidates = store.connectionProposals.filter(({ pair }) => pair.includes(centerId) && pair.every((id) => inScope.has(id)));
  const suppressions = store.proposalSuppressions.filter(({ pair }) => pair.includes(centerId) && pair.every((id) => inScope.has(id)));

  function preview() {
    if (!canRequest()) { setNotice('新しい候補の依頼には利用権の確認が必要です。'); return; }
    const at = now();
    const next = prepareProposals(writer.getSnapshot(), { requestId: createId(), consentReceiptId: createId(), contextId: `preview:${centerId}`,
      contextGeneration: generation.current, scope, policyVersion: 'preview-v1', providerDisclosureVersion: 'offline-fixture-v1',
      selections: ids.map((seedId) => ({ ref: { seedId, part: 'body' }, selection: automatic.includes(seedId) ? 'automatic_in_confirmed_scope' : 'explicit' })), now: at,
      expiresAt: new Date(Date.parse(at) + 4 * 60_000).toISOString(),
    });
    setNotice(next ? '' : '材料を使用できません。AIに送らない設定や削除の有無を確認してください。');
    chosen.current = next;
    setPlan(next);
  }

  async function confirm() {
    if (!plan || running.current || !allowRequest) return;
    const request = plan;
    running.current = true;
    setBusy(true); setNotice('');
    try {
      const consent = await writer.run(requirePlusAccess(recordProposalConsent(request, now()), canRequest));
      if (!consent.ok) { if (mounted.current) setNotice(consent.detail ?? '依頼を記録できませんでした'); return; }
      const input = confirmedProposalInput(writer.getSnapshot(), request.receipt.id, generation.current, now());
      if (!input) {
        await writer.run(cancelProposalRequest(request.receipt.id, now()));
        if (mounted.current && generation.current === request.receipt.contextGeneration) setNotice('材料が変わりました。もう一度確認してください。');
        return;
      }
      if (!canRequest()) {
        await writer.run(cancelProposalRequest(request.receipt.id, now()));
        if (mounted.current) setNotice('新しい候補の依頼には利用権の確認が必要です。');
        return;
      }
      const raw = await fixture.start(input).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 330));
      const result = await writer.run(receiveProposals(input.requestId, raw, generation.current, now()));
      if (!mounted.current || generation.current !== request.receipt.contextGeneration) return;
      if (!result.ok) { setNotice(result.detail ?? '候補を保存できませんでした。同じ依頼を再確認できます。'); return; }
      chosen.current = undefined;
      setPlan(undefined);
      const received = writer.getSnapshot().aiRequestReceipts.find(({ id }) => id === request.receipt.id);
      setNotice(received?.status === 'received' ? '候補を保存しました' : 'この材料で表示できる例の候補はありません');
    } finally {
      await reconcilePreviewProposals(writer);
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function cancel(close = false) {
    generation.current++;
    const request = chosen.current;
    chosen.current = undefined; setPlan(undefined);
    if (request) await writer.run(cancelProposalRequest(request.receipt.id, now()));
    await reconcilePreviewProposals(writer);
    if (close) onBack(); else if (mounted.current) setNotice('今回の依頼を取り消しました');
  }

  return <ScrollView contentContainerStyle={plusStyles.page} keyboardShouldPersistTaps="handled">
    <Actions><PlusButton label="地図に戻る" onPress={() => void cancel(true)} /></Actions>
    <Heading title>つながりの候補</Heading>
    <Text style={plusStyles.meta}>無通信の開発プレビュー。架空の候補で操作を試せます。</Text>
    {allowRequest && <SectionCard>
      <Heading>今回の材料を選ぶ · {ids.length}件</Heading>
      <PlusButton label="この範囲から材料の候補を追加" disabled={Boolean(plan) || busy || ids.length >= 16} onPress={() => {
        const selected = chooseExplorationSeeds(writer.getSnapshot(), centerId, scope, ids);
        if (!selected.length) { setNotice('この範囲では材料を選べません'); return; }
        setAutomatic((before) => [...before, ...selected.filter((id) => !ids.includes(id))]); setIds(selected);
      }} />
      {automatic.length > 0 && <Text style={plusStyles.meta}>追加した材料も、使う前に全文を確認できます。</Text>}
      <PlusInput accessibilityLabel="候補づくりの材料を探す" placeholder="この範囲のメモを探す" value={search} onChangeText={(value) => { setSearch(value); setCap(20); }} editable={!plan && !busy} />
      {visible.slice(0, cap).map((seed) => <PlusButton key={seed.id} label={toSeedSnippet(seed, 42)} selected={ids.includes(seed.id)} disabled={Boolean(plan) || busy || seed.id === centerId}
        onPress={() => {
          setAutomatic((before) => before.filter((id) => id !== seed.id));
          setIds((before) => before.includes(seed.id) ? before.filter((id) => id !== seed.id) : before.length < 16 ? [...before, seed.id] : before);
        }} />)}
      {visible.length > cap && <PlusButton label="さらに材料を表示" onPress={() => setCap((before) => before + 20)} />}
      <PlusButton label="今回使う内容を確認" primary disabled={ids.length < 2 || Boolean(plan) || busy} onPress={preview} />
    </SectionCard>}
    {plan && <SectionCard>
      <Heading>今回だけ使う原文 · {plan.input.sources.length}件</Heading>
      <Text style={plusStyles.meta}>目的はつながりの候補の確認です。処理先はこの開発プレビュー内です。</Text>
      {plan.input.sources.map(({ alias, text }) => <Text key={alias} selectable style={plusStyles.original}>{text}</Text>)}
      <Actions><PlusButton label={busy ? '候補を確認中' : 'この内容で例の候補を見る'} primary disabled={busy || !allowRequest} onPress={() => void confirm()} />
        <PlusButton label="取り消す" onPress={() => void cancel()} /></Actions>
    </SectionCard>}
    <PlusButton label="材料の送信・自動候補設定" selected={settings} onPress={() => setSettings(!settings)} />
    {settings && ids.map((id) => {
      const seed = store.seeds.find((entry) => entry.id === id && !entry.deletedAt);
      if (!seed) return null;
      const permission = permissionFor(store, id);
      return <SectionCard key={id}><Heading>{toSeedSnippet(seed, 45)}</Heading><Actions>
        <PlusButton label={permission?.externalAi === 'deny' ? 'AIに送らない指定を外す' : 'AIに送らない'} onPress={() => {
          void writer.run(updateSeedPermission(createId(), id, permission?.epoch ?? 0, { externalAi: permission?.externalAi === 'deny' ? 'unasked' : 'deny' }, now()))
            .then(() => reconcilePreviewProposals(writer));
        }} />
        <PlusButton label={permission?.discovery === 'exclude' ? '自動候補に含める' : '自動候補から外す'} onPress={() => {
          void writer.run(updateSeedPermission(createId(), id, permission?.epoch ?? 0, { discovery: permission?.discovery === 'exclude' ? 'include' : 'exclude' }, now()))
            .then(() => reconcilePreviewProposals(writer));
        }} />
      </Actions></SectionCard>;
    })}
    {notice !== '' && <Text accessibilityLiveRegion="polite" style={plusStyles.meta}>{notice}</Text>}
    {store.outbox.length > 0 && <PlusButton label="前の依頼の状態を確認" onPress={() => void reconcilePreviewProposals(writer)} />}
    {candidates.filter(({ decision }) => decision !== 'dismissed').map((proposal) => <SectionCard key={proposal.id}>
      <Heading>{proposal.decision === 'accepted' ? '採用した候補' : '例の候補'} · {relationLabel[proposal.relationKind]}</Heading>
      {proposal.availability !== 'ready' ? <Text style={plusStyles.meta}>{proposal.availability === 'stale' ? '材料が変わりました' : '現在は材料を表示できません'}</Text> : <>
        <Text style={plusStyles.text}>{proposal.hypothesis}</Text>
        {proposal.evidence.map((evidence, i) => <Text key={i} selectable style={plusStyles.original}>「{evidence.quote}」</Text>)}
        {proposal.decision === 'pending' && <Actions>
          <PlusButton label="この候補をつなぐ" primary onPress={() => void writer.run(acceptProposal({ operationId: createId(), proposalId: proposal.id, at: now() }))
            .then((result) => setNotice(result.ok ? 'つながりを保存しました' : result.detail ?? '保存できませんでした'))} />
          <PlusButton label="今回は見送る" onPress={() => void writer.run(dismissProposal(proposal.id, now()))} />
          {onMaterial && <PlusButton label="アトリエの材料にする" onPress={() => onMaterial(proposal.pair)} />}
        </Actions>}
      </>}
    </SectionCard>)}
    {suppressions.map(({ pair }) => <PlusButton key={JSON.stringify(pair)} label={`${pair.map((id) => store.seeds.find((seed) => seed.id === id && !seed.deletedAt)?.title ?? '参照できない種').join('・')}の見送りを解除`}
      onPress={() => void writer.run(restoreProposalPair(...pair, createId()))} />)}
  </ScrollView>;
}

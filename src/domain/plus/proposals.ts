import { z } from 'zod';
import { connectionId, normalizePair } from '../../data/gardenModel';
import { withCoreCommand, type PlusCommand } from '../../data/gardenV3Writer';
import { connectSeeds } from '../gardenCommands';
import { buildAdjacency, extractKeywords } from '../../utils/links';
import { aiRequestReceipt, relationKind, type AiOutboxEntry, type AiRequestReceipt, type ConnectionProposal, type GardenStoreV3,
  type QuotaReceipt, type SeedPermission, type SourceRef } from './contracts';
import { checkReceiptMaterials, invalidateAi, permissionFor, queueAiControl } from './proposalPrivacy';
import { mergeLineage, readSource, sameSourceRef, sourceLineage, textDigest, validTextRange } from './sources';

type Selection = {
  ref: SourceRef; selection: 'explicit' | 'automatic_in_confirmed_scope';
  snapshotId?: string; range?: { start: number; end: number };
};
export type ProposalInput = {
  requestId: string; contextId: string; contextGeneration: number; inputFingerprint: string; consentReceiptId: string;
  purpose: 'connection_proposals'; sources: Array<{ alias: string; text: string; versionToken: string }>;
};
export type ProposalPlan = { input: ProposalInput; receipt: AiRequestReceipt };

/** Prepares a small, varied list for inspection on the device. Only the confirmed subset becomes input. */
export function chooseExplorationSeeds(store: GardenStoreV3, centerId: string, scope: readonly string[], selected: readonly string[] = []): string[] {
  const scopeIds = new Set(scope);
  const center = scopeIds.has(centerId) ? store.seeds.find((seed) => seed.id === centerId && !seed.deletedAt) : undefined;
  if (!center || permissionFor(store, centerId)?.externalAi === 'deny') return [];
  const eligible = store.seeds.filter((seed) => {
    const permission = permissionFor(store, seed.id);
    return seed.id !== centerId && scopeIds.has(seed.id) && !seed.deletedAt && permission?.externalAi !== 'deny' && permission?.discovery !== 'exclude' &&
      !pairIsBlocked(store, centerId, seed.id);
  });
  const words = new Set(extractKeywords(center.body));
  const related = eligible.map((seed) => ({ seed, score: seed.tags.filter((tag) => center.tags.includes(tag)).length * 3 +
    extractKeywords(seed.body).filter((word) => words.has(word)).length }));
  const near = related.filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.seed.id.localeCompare(b.seed.id)).map(({ seed }) => seed);
  const categories = new Set(center.tags);
  const different = eligible.filter((seed) => {
    const category = seed.tags.find((tag) => !categories.has(tag));
    if (!category) return false;
    categories.add(category);
    return true;
  });
  const live = store.seeds.filter((seed) => !seed.deletedAt);
  const adjacency = buildAdjacency(live, store.connections);
  const older = [...eligible].sort((a, b) => Number(Boolean(adjacency.get(a.id)?.size)) - Number(Boolean(adjacency.get(b.id)?.size)) ||
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const found = new Set([centerId, ...selected]);
  const append = (list: typeof eligible, limit: number) => {
    let added = 0;
    for (const seed of list) {
      if (found.size >= 16 || added >= limit) break;
      if (found.has(seed.id)) continue;
      found.add(seed.id); added++;
    }
  };
  append(near, 5); append(different, 5); append(older, 5); append(eligible, 15);
  return [...found].slice(0, 16);
}

export function prepareProposals(store: GardenStoreV3, args: {
  requestId: string; consentReceiptId: string; contextId: string; contextGeneration: number; scope: readonly string[];
  policyVersion: string; providerDisclosureVersion: string; selections: Selection[]; now: string; expiresAt: string;
}): ProposalPlan | undefined {
  const scope = new Set(args.scope);
  const ready = [];
  if (args.selections.length < 2 || args.selections.length > 16 || args.expiresAt <= args.now ||
      new Set(args.selections.map(({ ref }) => ref.seedId)).size !== args.selections.length) return undefined;
  for (const selection of args.selections) {
    const { ref, snapshotId } = selection;
    const rule = permissionFor(store, ref.seedId);
    if (!scope.has(ref.seedId) || (selection.selection === 'automatic_in_confirmed_scope' && rule?.discovery === 'exclude')) return undefined;
    const history = snapshotId && store.sourceSnapshots.find((snapshot) => snapshot.id === snapshotId);
    if (snapshotId && (!history || !sameSourceRef(history.source.ref, ref))) return undefined;
    const live = readSource(store.seeds, ref, Boolean(history));
    if (!live) return undefined;
    const whole = history ? history.text : live.text;
    const range = selection.range ?? { start: 0, end: whole.length };
    if (!validTextRange(whole, range.start, range.end)) return undefined;
    const source = history ? history.source : { ref, textDigest: textDigest(whole), updatedAt: live.updatedAt };
    ready.push({ lineage: history ? history.lineage : sourceLineage(store.seeds, ref),
      item: { source, snapshotId, versionMode: history ? 'historical' as const : 'current' as const, range,
        liveTextDigestAtConfirmation: textDigest(live.text), permissionEpoch: rule?.epoch ?? 0, selection: selection.selection } });
  }
  const lineage = mergeLineage(...ready.map((entry) => entry.lineage));
  if (lineage.status === 'unknown') return undefined;
  const permissionEpochs = Object.fromEntries(lineage.rootSeedIds.map((id) => [id, permissionFor(store, id)?.epoch ?? 0]));
  const purpose = 'connection_proposals' as const;
  const consent = {
    id: args.consentReceiptId, requestId: args.requestId, purpose, policyVersion: args.policyVersion, providerDisclosureVersion: args.providerDisclosureVersion,
    sources: ready.map((entry) => entry.item), confirmedAt: args.now, expiresAt: args.expiresAt,
  };
  const inputFingerprint = textDigest(JSON.stringify([args.requestId, args.contextId, args.contextGeneration, consent, permissionEpochs]));
  const receipt: AiRequestReceipt = { id: args.requestId, contextId: args.contextId, contextGeneration: args.contextGeneration, consent,
    processingRootSeedIds: lineage.rootSeedIds, permissionEpochs, inputFingerprint, status: 'waiting' };
  return proposalPlan(store, receipt);
}

function proposalPlan(store: GardenStoreV3, receipt: AiRequestReceipt): ProposalPlan | undefined {
  const { id, contextId, contextGeneration, inputFingerprint, consent } = receipt;
  if (consent.purpose !== 'connection_proposals' || consent.sources.length < 2 || consent.sources.length > 16 ||
      new Set(consent.sources.map(({ source }) => source.ref.seedId)).size !== consent.sources.length) return undefined;
  const checked = checkReceiptMaterials(store, receipt);
  if ('issue' in checked) return undefined;
  return { receipt, input: { requestId: id, contextId, contextGeneration, inputFingerprint, consentReceiptId: consent.id, purpose: consent.purpose,
    sources: checked.materials.map(({ text }, i) => ({ alias: `material-${i + 1}`, text, versionToken: `${consent.id}:${i + 1}` })) } };
}

function waitingPlan(store: GardenStoreV3, requestId: string, generation: number, at: string): ProposalPlan | undefined {
  const request = store.aiRequestReceipts.find(({ id }) => id === requestId);
  return request?.status === 'waiting' && request.contextGeneration === generation && request.consent.expiresAt > at
    ? proposalPlan(store, request) : undefined;
}

export function confirmedProposalInput(store: GardenStoreV3, requestId: string, generation: number, at: string): ProposalInput | undefined {
  return waitingPlan(store, requestId, generation, at)?.input;
}

const quotaShape = z.strictObject({ reservationId: z.string().min(1), quotaPeriodId: z.string().min(1),
  reservationExpiresAt: z.iso.datetime(), state: z.enum(['reserved', 'committed', 'released']) });
const outputShape = z.strictObject({
  requestId: z.string(), resultId: z.string().min(1), inputFingerprint: z.string(), modelVersion: z.string(), promptVersion: z.string(), quota: quotaShape,
  proposals: z.array(z.strictObject({
    pair: z.tuple([z.string(), z.string()]), relationKind, hypothesis: z.string().trim().min(1).max(400),
    evidence: z.array(z.strictObject({ alias: z.string(), quote: z.string().min(1), start: z.number().int(), end: z.number().int() })).min(2).max(6),
  })).max(3),
});
export type ProposalResult = z.infer<typeof outputShape>;

export function verifyProposals(plan: ProposalPlan, raw: unknown, at: string): { quota: QuotaReceipt; resultId: string; proposals: ConnectionProposal[] } | undefined {
  const parsed = outputShape.safeParse(raw);
  if (!parsed.success) return undefined;
  const result = parsed.data;
  if (result.requestId !== plan.input.requestId || result.inputFingerprint !== plan.input.inputFingerprint ||
      result.quota.state !== 'reserved' || result.quota.reservationExpiresAt <= at) return undefined;
  const byAlias = new Map(plan.input.sources.map(({ alias, text }, i) => [alias, { text, item: plan.receipt.consent.sources[i] }]));
  const visited = new Set<string>();
  const proposals: ConnectionProposal[] = [];
  for (const proposal of result.proposals) {
    const [a, b] = proposal.pair.map((alias) => byAlias.get(alias)?.item.source.ref.seedId);
    if (!a || !b || a === b) return undefined;
    const pair = normalizePair(a, b);
    const key = connectionId(a, b);
    if (visited.has(key)) return undefined;
    visited.add(key);
    const evidence = [];
    const cited = new Set<string>();
    for (const { alias, quote, start, end } of proposal.evidence) {
      const input = byAlias.get(alias);
      if (!input || !proposal.pair.includes(alias) || !validTextRange(input.text, start, end) || quote !== input.text.slice(start, end)) return undefined;
      evidence.push({ source: input.item.source, quote, start, end });
      cited.add(alias);
    }
    if (cited.size < 2) return undefined;
    proposals.push({ id: JSON.stringify(['proposal', result.requestId, result.resultId, pair]), requestId: result.requestId, resultId: result.resultId,
      pair, evidence, relationKind: proposal.relationKind, hypothesis: proposal.hypothesis, processingRootSeedIds: plan.receipt.processingRootSeedIds,
      permissionEpochs: plan.receipt.permissionEpochs, decision: 'pending', availability: 'ready', inputFingerprint: result.inputFingerprint, createdAt: at });
  }
  return { quota: result.quota, resultId: result.resultId, proposals };
}

export function recordProposalConsent(plan: ProposalPlan, confirmedAt: string): PlusCommand {
  const parsed = aiRequestReceipt.safeParse({ ...plan.receipt, consent: { ...plan.receipt.consent, confirmedAt } });
  return { id: `consent:${plan.receipt.id}`, apply: (store) => {
    const receipt = parsed.data;
    const canonical = receipt && proposalPlan(store, receipt);
    if (!receipt || !canonical || receipt.status !== 'waiting' || receipt.consent.expiresAt <= confirmedAt ||
        JSON.stringify(canonical.input) !== JSON.stringify(plan.input)) return { rejected: '材料が変わりました。もう一度確認してください' };
    const existing = store.aiRequestReceipts.find((entry) => entry.id === plan.receipt.id);
    if (existing) return existing.inputFingerprint === plan.receipt.inputFingerprint && existing.status === 'waiting'
      ? store : { rejected: 'この依頼は確認済みです' };
    if (store.aiRequestReceipts.some((entry) => entry.status === 'waiting') || store.outbox.length) return { rejected: '前の依頼を確認しています' };
    return { ...store, aiRequestReceipts: [...store.aiRequestReceipts, receipt] };
  } };
}

export function receiveProposals(requestId: string, raw: unknown, generation: number, at: string): PlusCommand {
  // A rejected delivery still needs to resolve any reserved usage, without sending source text again.
  return { id: `receive:${requestId}`, apply: (store) => {
    const request = store.aiRequestReceipts.find((entry) => entry.id === requestId);
    if (!request || request.status !== 'waiting') return { rejected: 'この依頼は終了しています' };
    const plan = waitingPlan(store, requestId, generation, at);
    const verified = plan && verifyProposals(plan, raw, at);
    const proposals = verified ? verified.proposals.filter(({ pair: [a, b] }) => !pairIsBlocked(store, a, b)) : [];
    const updated: AiRequestReceipt = { ...request, status: proposals.length ? 'received' : 'failed', resultId: verified?.resultId, quota: verified?.quota };
    return { ...store, aiRequestReceipts: store.aiRequestReceipts.map((entry) => entry.id === request.id ? updated : entry),
      connectionProposals: [...store.connectionProposals, ...proposals], outbox: queueAiControl(store, updated, proposals.length ? 'ack' : 'cancel', at) };
  } };
}

export function pairIsBlocked(store: GardenStoreV3, a: string, b: string): boolean {
  const key = connectionId(a, b);
  return store.connections.some((item) => item.id === key) || store.proposalSuppressions.some(({ pair }) => JSON.stringify(pair) === key);
}

function isAvailable(store: GardenStoreV3, proposal: ConnectionProposal) {
  const request = store.aiRequestReceipts.find((entry) => entry.id === proposal.requestId);
  if (proposal.decision !== 'pending' || proposal.availability !== 'ready' || request?.status !== 'received' ||
      request.resultId !== proposal.resultId || request.inputFingerprint !== proposal.inputFingerprint) return false;
  const checked = checkReceiptMaterials(store, request);
  if ('issue' in checked) return false;
  return proposal.evidence.every((evidence) => {
    const material = checked.materials.find((entry) => sameSourceRef(entry.source.ref, evidence.source.ref) &&
      entry.source.textDigest === evidence.source.textDigest);
    return material && validTextRange(material.text, evidence.start, evidence.end) && material.text.slice(evidence.start, evidence.end) === evidence.quote;
  });
}

export function acceptProposal(props: { operationId: string; proposalId: string; at: string }): PlusCommand {
  return { id: props.operationId, apply: (store) => {
    const proposal = store.connectionProposals.find((entry) => entry.id === props.proposalId);
    if (proposal?.decision === 'accepted') return store;
    if (!proposal || !isAvailable(store, proposal)) return { rejected: '材料が変わったため、候補を採用できません' };
    const [a, b] = proposal.pair;
    const connection = connectionId(a, b);
    if (store.proposalSuppressions.some(({ pair }) => JSON.stringify(pair) === connection)) return { rejected: 'この組み合わせは見送り済みです' };
    const result = withCoreCommand(connectSeeds({ commandId: props.operationId, a, b, now: props.at })).apply(store);
    if ('rejected' in result) return result;
    return { ...result, connectionProposals: result.connectionProposals.map((entry) => entry.id === proposal.id
      ? { ...entry, decision: 'accepted', acceptedConnectionId: connection, decidedAt: props.at } : entry) };
  } };
}

export function dismissProposal(proposalId: string, at: string): PlusCommand {
  return { id: `dismiss:${proposalId}`, apply: (store) => {
    const proposal = store.connectionProposals.find((entry) => entry.id === proposalId);
    if (proposal?.decision === 'dismissed') return store;
    if (!proposal || proposal.decision !== 'pending') return { rejected: '見送る候補を確認できません' };
    return { ...store, connectionProposals: store.connectionProposals.map((entry) => entry.id === proposalId
      ? { ...entry, decision: 'dismissed', decidedAt: at } : entry), proposalSuppressions: store.proposalSuppressions.some(({ pair }) => JSON.stringify(pair) === JSON.stringify(proposal.pair))
      ? store.proposalSuppressions : [...store.proposalSuppressions, { pair: proposal.pair, reason: 'dismissed', createdAt: at }] };
  } };
}

export function restoreProposalPair(a: string, b: string, operationId: string): PlusCommand {
  return { id: operationId, apply: (store) => ({ ...store, proposalSuppressions: store.proposalSuppressions.filter(({ pair }) => JSON.stringify(pair) !== connectionId(a, b)) }) };
}

export function updateSeedPermission(commandId: string, seedId: string, expectedEpoch: number,
  patch: Partial<Pick<SeedPermission, 'discovery' | 'externalAi'>>, at: string): PlusCommand {
  return { id: commandId, apply: (store) => {
    const current = permissionFor(store, seedId);
    const before: SeedPermission = current ?? { seedId, epoch: 0, externalAi: 'unasked', discovery: 'include', changedAt: at };
    if (before.epoch !== expectedEpoch || !store.seeds.some((seed) => seed.id === seedId)) return { rejected: '送信設定が更新されています' };
    const next = { ...before, ...patch, changedAt: at };
    if (next.externalAi === before.externalAi && next.discovery === before.discovery) return store;
    next.epoch += next.externalAi === before.externalAi ? 0 : 1;
    return invalidateAi({ ...store, permissions: current ? store.permissions.map((item) => item.seedId === seedId ? next : item) : [...store.permissions, next] }, at);
  } };
}

export function cancelProposalRequest(requestId: string, at: string): PlusCommand {
  return { id: `cancel:${requestId}`, apply: (store) => {
    const request = store.aiRequestReceipts.find((entry) => entry.id === requestId);
    if (request?.status !== 'waiting') return store;
    return { ...store, aiRequestReceipts: store.aiRequestReceipts.map((entry) => entry.id === requestId ? { ...entry, status: 'cancelled' } : entry),
      outbox: queueAiControl(store, request, 'cancel', at) };
  } };
}

export function reconcileQuota(entry: AiOutboxEntry, terminal: QuotaReceipt | 'not_retained'): PlusCommand {
  return { id: `quota:${entry.id}`, apply: (store) => {
    if (!store.outbox.some(({ id }) => id === entry.id)) return store;
    const request = store.aiRequestReceipts.find(({ id }) => id === entry.requestId);
    if (terminal !== 'not_retained' && (terminal.state === 'reserved' ||
        (request?.quota && (request.quota.reservationId !== terminal.reservationId || request.quota.quotaPeriodId !== terminal.quotaPeriodId ||
          (request.quota.state !== 'reserved' && request.quota.state !== terminal.state))))) return { rejected: '利用枠の確認を待っています' };
    return { ...store, outbox: store.outbox.filter(({ id }) => id !== entry.id), aiRequestReceipts: store.aiRequestReceipts.map((receipt) => {
      if (!request || receipt.id !== request.id) return receipt;
      const quota = terminal === 'not_retained' ? (receipt.quota?.state === 'reserved' ? undefined : receipt.quota) : terminal;
      return { ...receipt, quota };
    }) };
  } };
}

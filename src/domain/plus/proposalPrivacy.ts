import type { AiOutboxEntry, AiRequestReceipt, ConnectionProposal, GardenStoreV3 } from './contracts';
import { readSource, textDigest } from './sources';

export const permissionFor = (store: GardenStoreV3, seedId: string) => store.permissions.find((entry) => entry.seedId === seedId);

type Unavailable = NonNullable<ConnectionProposal['unavailableReason']>;
export function receiptIssue(store: GardenStoreV3, request: AiRequestReceipt): Unavailable | 'source_changed' | undefined {
  const seeds = new Map(store.seeds.map((seed) => [seed.id, seed]));
  const permissions = new Map(store.permissions.map((item) => [item.seedId, item]));
  for (const id of request.processingRootSeedIds) {
    const seed = seeds.get(id);
    if (!seed) return 'source_missing';
    if (seed.deletedAt) return 'source_deleted';
    const rule = permissions.get(id);
    if (rule?.externalAi === 'deny' || (rule?.epoch ?? 0) !== request.permissionEpochs[id]) return 'consent_revoked';
  }
  for (const item of request.consent.sources) {
    if (!Object.hasOwn(request.permissionEpochs, item.source.ref.seedId) || !request.processingRootSeedIds.includes(item.source.ref.seedId) ||
        (permissions.get(item.source.ref.seedId)?.epoch ?? 0) !== item.permissionEpoch) return 'consent_revoked';
    if (item.selection === 'automatic_in_confirmed_scope' && permissions.get(item.source.ref.seedId)?.discovery === 'exclude') return 'scope_excluded';
    const live = readSource(store.seeds, item.source.ref, item.versionMode === 'historical');
    if (!live) return 'source_missing';
    if (textDigest(live.text) !== item.liveTextDigestAtConfirmation) return 'source_changed';
    if (item.versionMode === 'historical') {
      const snapshot = store.sourceSnapshots.find(({ id }) => id === item.snapshotId);
      if (!snapshot || textDigest(snapshot.text) !== item.source.textDigest) return 'source_missing';
    }
  }
}

export function queueAiControl(store: GardenStoreV3, request: AiRequestReceipt, kind: AiOutboxEntry['kind'], at: string) {
  const id = JSON.stringify([kind, request.id]);
  if (store.outbox.some((entry) => entry.id === id)) return store.outbox;
  return [...store.outbox, { id, kind, requestId: request.id, contextGeneration: request.contextGeneration,
    reservationId: request.quota?.reservationId, quotaPeriodId: request.quota?.quotaPeriodId, createdAt: at }];
}

export function invalidateAi(store: GardenStoreV3, at: string): GardenStoreV3 {
  if (!store.aiRequestReceipts.length) return store;
  const changed = new Map<string, NonNullable<ReturnType<typeof receiptIssue>>>();
  let result = store;
  for (const request of store.aiRequestReceipts) {
    if (request.status !== 'waiting' && request.status !== 'received') continue;
    const issue = receiptIssue(result, request);
    if (!issue) continue;
    changed.set(request.id, issue);
    if (request.status === 'waiting' || issue !== 'source_changed') {
      result = { ...result, outbox: queueAiControl(result, request, 'cancel', at),
        aiRequestReceipts: result.aiRequestReceipts.map((entry) => entry.id === request.id ? { ...entry, status: 'cancelled' } : entry) };
    }
  }
  if (!changed.size) return result;
  return { ...result, connectionProposals: result.connectionProposals.map((proposal) => {
    const issue = changed.get(proposal.requestId);
    if (!issue) return proposal;
    return issue === 'source_changed' ? { ...proposal, availability: 'stale' } : { ...proposal, availability: 'unavailable', unavailableReason: issue };
  }), atelierSuggestions: result.atelierSuggestions.map((suggestion) => {
    const issue = changed.get(suggestion.requestId);
    return issue ? { ...suggestion, availability: issue === 'source_changed' ? 'stale' : 'unavailable' } : suggestion;
  }) };
}

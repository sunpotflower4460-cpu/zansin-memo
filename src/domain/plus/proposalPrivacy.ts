import type { AiOutboxEntry, AiRequestReceipt, ConnectionProposal, GardenStoreV3 } from './contracts';
import { readSource, sameSourceRef, sourceLineage, textDigest, validTextRange } from './sources';

export const permissionFor = (store: GardenStoreV3, seedId: string) => store.permissions.find((entry) => entry.seedId === seedId);

type ReceiptIssue = NonNullable<ConnectionProposal['unavailableReason']> | 'source_changed';
type ConsentMaterial = { source: AiRequestReceipt['consent']['sources'][number]['source']; text: string };

/** Reconstruct only the approved excerpts. No current or historical text bypasses these checks. */
export function checkReceiptMaterials(store: GardenStoreV3, request: AiRequestReceipt): { issue: ReceiptIssue } | { materials: ConsentMaterial[] } {
  const seeds = new Map(store.seeds.map((seed) => [seed.id, seed]));
  const permissions = new Map(store.permissions.map((item) => [item.seedId, item]));
  const approvedRoots = new Set(request.processingRootSeedIds);
  for (const id of approvedRoots) {
    const seed = seeds.get(id);
    if (!seed) return { issue: 'source_missing' };
    if (seed.deletedAt) return { issue: 'source_deleted' };
    const rule = permissions.get(id);
    if (rule?.externalAi === 'deny' || !Object.hasOwn(request.permissionEpochs, id) ||
        (rule?.epoch ?? 0) !== request.permissionEpochs[id]) return { issue: 'consent_revoked' };
  }
  const roots = new Set<string>();
  const materials: ConsentMaterial[] = [];
  for (const item of request.consent.sources) {
    const { ref } = item.source;
    const rule = permissions.get(ref.seedId);
    if (!approvedRoots.has(ref.seedId) || (rule?.epoch ?? 0) !== item.permissionEpoch) return { issue: 'consent_revoked' };
    if (item.selection === 'automatic_in_confirmed_scope' && rule?.discovery === 'exclude') return { issue: 'scope_excluded' };
    const historical = item.versionMode === 'historical';
    const live = readSource(store.seeds, ref, historical);
    if (!live) return { issue: 'source_missing' };
    const liveDigest = textDigest(live.text);
    if (liveDigest !== item.liveTextDigestAtConfirmation) return { issue: 'source_changed' };
    const snapshot = historical ? store.sourceSnapshots.find(({ id }) => id === item.snapshotId) : undefined;
    if (historical && (!snapshot || !sameSourceRef(snapshot.source.ref, ref) || snapshot.source.updatedAt !== item.source.updatedAt)) {
      return { issue: 'source_missing' };
    }
    const whole = snapshot?.text ?? live.text;
    if ((snapshot ? textDigest(whole) : liveDigest) !== item.source.textDigest) return { issue: 'source_changed' };
    const lineage = snapshot?.lineage ?? (ref.part === 'body' ? { status: 'known', rootSeedIds: [ref.seedId] } : sourceLineage(store.seeds, ref));
    if (lineage.status !== 'known' || !lineage.rootSeedIds.includes(ref.seedId) ||
        lineage.rootSeedIds.some((id) => !approvedRoots.has(id))) return { issue: 'consent_revoked' };
    lineage.rootSeedIds.forEach((id) => roots.add(id));
    const { start, end } = item.range ?? { start: 0, end: whole.length };
    if (!validTextRange(whole, start, end)) return { issue: 'result_invalid' };
    materials.push({ source: item.source, text: whole.slice(start, end) });
  }
  return roots.size === approvedRoots.size ? { materials } : { issue: 'consent_revoked' };
}

export function receiptIssue(store: GardenStoreV3, request: AiRequestReceipt): ReceiptIssue | undefined {
  const checked = checkReceiptMaterials(store, request);
  return 'issue' in checked ? checked.issue : undefined;
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

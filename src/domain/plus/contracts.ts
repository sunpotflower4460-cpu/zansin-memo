import { z } from 'zod';
import { GROWTH_STATE_OPTIONS, MOOD_OPTIONS, TRANSFORM_TYPES } from '../types';

const id = z.string().min(1);
const time = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();
const text = z.string();
const ids = z.array(id);
const growth = z.enum(GROWTH_STATE_OPTIONS);
const mood = z.enum(MOOD_OPTIONS);
const importance = z.literal([1, 2, 3, 4, 5]);
const object = z.strictObject;

const seed = object({
  id, title: text.optional(), body: text, createdAt: time, updatedAt: time, mood: mood.optional(), importance,
  growthState: growth, tags: z.array(text), resurfacingScore: z.number().optional(), lastResurfacedAt: time.optional(),
  deletedAt: time.optional(), transformOutputs: z.array(object({ id, type: z.enum(TRANSFORM_TYPES), content: text, createdAt: time })).optional(),
  synthesis: object({
    id, statement: text, createdAt: time, updatedAt: time, promotedAt: time,
    sources: z.array(object({
      seedId: id, sourcePart: z.enum(['body', 'synthesis']), textSnapshot: text, titleSnapshot: text.optional(),
      sourceUpdatedAt: time, sourceSynthesisId: id.optional(),
    }).refine((source) => source.sourcePart === 'body' || source.sourceSynthesisId !== undefined)),
  }).optional(),
  bloom: object({ note: text.optional(), bloomedAt: time }).optional(), archivedFrom: growth.optional(),
  schemaVersion: z.number().int().refine((version): boolean => version === 2),
});
const connection = object({
  id, aSeedId: id, bSeedId: id, origin: z.enum(['manual', 'legacy']), createdAt: time.optional(), note: text.optional(),
});
const draft = object({
  id, kind: z.enum(['new', 'edit-body', 'add-memo', 'synthesis']), targetSeedId: id.optional(), plannedId: id.optional(),
  body: text, title: text.optional(), tags: text.optional(), mood: mood.optional(), growthState: growth.optional(),
  importance: importance.optional(), materials: z.array(object({ seedId: id, sourcePart: z.enum(['body', 'synthesis']) })).optional(),
  baseBody: text.optional(), standalone: z.boolean().optional(), reselect: z.boolean().optional(), updatedAt: time,
});
export const gardenCore = {
  revision: count, lastMutationId: id.optional(), seeds: z.array(seed), connections: z.array(connection), drafts: z.array(draft),
};

const sourceRef = z.discriminatedUnion('part', [
  object({ seedId: id, part: z.literal('body') }),
  object({ seedId: id, part: z.literal('synthesis'), synthesisId: id }),
]);
const sourceVersion = object({ ref: sourceRef, textDigest: id, updatedAt: time });
const lineage = object({ rootSeedIds: ids, status: z.enum(['known', 'unknown']) });
const sourceSnapshot = object({ id, source: sourceVersion, text, title: text.optional(), capturedAt: time, lineage });
const permission = object({
  seedId: id, externalAi: z.enum(['unasked', 'allow', 'deny']), discovery: z.enum(['include', 'exclude']), epoch: count, changedAt: time,
});
const purpose = z.enum(['connection_proposals', 'atelier_suggestions']);
const versionMode = z.enum(['current', 'historical']);
const consentReceipt = object({
  id, requestId: id, policyVersion: id, providerDisclosureVersion: id, purpose, confirmedAt: time, expiresAt: time,
  sources: z.array(object({
    source: sourceVersion, snapshotId: id.optional(), versionMode, liveTextDigestAtConfirmation: id, permissionEpoch: count,
    selection: z.enum(['automatic_in_confirmed_scope', 'explicit']), range: object({ start: count, end: count }).optional(),
  }).refine((entry) => entry.versionMode === 'current' || entry.snapshotId !== undefined)).min(1),
});
const evidence = object({ source: sourceVersion, quote: text.min(1), start: count, end: count })
  .refine(({ start, end, quote }) => end - start === quote.length);
const pair = z.tuple([id, id]).refine(([a, b]) => a < b);
export const relationKind = z.enum(['shared_question', 'goal_means', 'constraint_resource', 'complementary_views', 'different_context']);
const availability = z.enum(['ready', 'stale', 'unavailable']);
const connectionProposal = object({
  id, requestId: id, resultId: id, pair, relationKind, evidence: z.array(evidence).min(2), hypothesis: text.min(1),
  processingRootSeedIds: ids, decision: z.enum(['pending', 'accepted', 'dismissed']), availability,
  unavailableReason: z.enum(['source_deleted', 'source_missing', 'scope_excluded', 'consent_revoked', 'result_invalid']).optional(),
  acceptedConnectionId: id.optional(), decidedAt: time.optional(), inputFingerprint: id,
  permissionEpochs: z.record(id, count), createdAt: time,
}).refine((proposal) =>
  proposal.evidence.every(({ source }) => proposal.pair.includes(source.ref.seedId)) &&
  proposal.pair.every((seedId) => proposal.evidence.some(({ source }) => source.ref.seedId === seedId)) &&
  (proposal.decision !== 'accepted' || proposal.acceptedConnectionId === JSON.stringify(proposal.pair)));
const suppression = object({ pair, reason: z.enum(['dismissed', 'connection_removed']), createdAt: time });

const scope = z.discriminatedUnion('kind', [
  object({ kind: z.literal('selection'), seedIds: ids }),
  object({ kind: z.literal('query'), query: object({
    queryVersion: z.literal(1), text, tags: ids, tagMode: z.enum(['any', 'all']), growthStates: z.array(growth),
    connection: z.enum(['all', 'linked', 'unlinked']), hasSynthesis: z.boolean().optional(),
  }) }),
]);
const overview = { viewMode: z.literal('overview') };
const neighborhood = { viewMode: z.literal('neighborhood'), centerSeedId: id, expandedHop: count.min(1) };
const focus = z.discriminatedUnion('viewMode', [object(overview), object(neighborhood)]);
const positions = z.record(id, object({ x: z.number(), y: z.number(), pinned: z.boolean() }));
const displayGroups = z.array(object({ id, seedIds: ids, label: text.optional(), collapsed: z.boolean() }));
const viewport = object({ x: z.number(), y: z.number(), scale: z.number().positive() });
const layoutSnapshot = object({ layoutVersion: count.min(1), positions, displayGroups });
const mapViewFields = {
  ...layoutSnapshot.shape, id, revision: count, name: text.optional(), scope, viewport, selectedSeedId: id.optional(),
  expandedGroupIds: ids.optional(), searchText: text.optional(), presentation: z.enum(['plot', 'list']).optional(), updatedAt: time,
};
const mapView = z.discriminatedUnion('viewMode', [object({ ...mapViewFields, ...overview }), object({ ...mapViewFields, ...neighborhood })]);
const mapReturnContext = object({
  origin: z.discriminatedUnion('kind', [
    object({ kind: z.literal('saved'), mapViewId: id, mapRevision: count }),
    object({ kind: z.literal('unsaved'), localViewId: id, localRevision: count }),
  ]),
  scope, focus, layoutSnapshot, viewport, expandedGroupIds: ids, selectedSeedIds: ids, navigationTrail: ids,
  rangeSeedIds: ids.optional(), searchText: text.optional(), presentation: z.enum(['plot', 'list']).optional(), focusedControlId: id.optional(),
  listScrollOffset: z.number().nonnegative().optional(),
});

const atelierProject = object({
  id, title: text.optional(), centerSeedId: id.optional(), status: z.enum(['drafting', 'archived']),
  branches: z.array(object({ id, name: text.optional(), headRevisionId: id.optional() })).min(1),
  activeBranchId: id, originNavigation: mapReturnContext.optional(), createdAt: time, updatedAt: time,
});
const pinnedExcerpts = z.array(object({ id, text: text.min(1), start: count, end: count }));
const atelierText = { projectId: id, branchId: id, text, pinnedExcerpts, insertedSuggestionIds: ids, lineage };
const matchesPins = (entry: { text: string; pinnedExcerpts: z.infer<typeof pinnedExcerpts> }) =>
  entry.pinnedExcerpts.every((pin) => pin.end <= entry.text.length && pin.start < pin.end && entry.text.slice(pin.start, pin.end) === pin.text);
const atelierDraft = object({
  ...atelierText, baseRevisionId: id.optional(), materials: z.array(object({ snapshotId: id, versionMode })), editRevision: count, updatedAt: time,
}).refine(matchesPins);
const atelierRevision = object({
  ...atelierText, id, parentRevisionId: id.optional(), title: text.optional(), materialSnapshotIds: ids, savedAt: time,
}).refine(matchesPins);
const atelierSuggestion = object({
  id, requestId: id, resultId: id, projectId: id, branchId: id, baseEditRevision: count, baseTextDigest: id,
  kind: z.enum(['perspective', 'title', 'outline']), content: text.min(1), evidence: z.array(evidence),
  processingRootSeedIds: ids, permissionEpochs: z.record(id, count), decision: z.enum(['pending', 'inserted', 'dismissed']),
  availability, insertedAt: time.optional(), createdAt: time,
});
const adoptionRecord = object({
  id, atelierRevisionId: id, centerSeedId: id, synthesisId: id, previousSynthesisSnapshotId: id.optional(), adoptedAt: time,
});

const collectionItem = object({ id, currentRevisionId: id, order: count, createdAt: time, updatedAt: time });
const mapSnapshot = object({
  viewId: id.optional(), positions, layoutVersion: count.min(1),
  nodes: z.array(object({ seedId: id, labelSnapshot: text, sourceSnapshotId: id })),
  confirmedConnections: z.array(object({ id, aSeedId: id, bSeedId: id, noteSnapshot: text.optional() })),
});
const collectionFields = {
  id, itemId: id, previousRevisionId: id.optional(), styleVersion: count.min(1), outputSpecVersion: count.min(1), title: text.optional(),
  textSnapshot: text, atelierRevisionId: id.optional(), synthesisRef: sourceVersion.optional(), materialSnapshotIds: ids, lineage, savedAt: time,
  layout: object({
    paper: z.enum(['washi', 'white']), textAlign: z.enum(['start', 'center']),
    mapPosition: z.enum(['above', 'below']), includeSources: z.boolean(),
  }).optional(),
};
const collectionRevision = z.discriminatedUnion('kind', [
  object({ ...collectionFields, kind: z.literal('word_card'), templateId: z.literal('word_card_v1') }),
  object({ ...collectionFields, kind: z.literal('map_and_text_page'), templateId: z.literal('map_text_v1'), mapSnapshot }),
]);
const collectionDraft = object({
  itemId: id, baseCollectionRevisionId: id, title: text.optional(), text, editRevision: count, updatedAt: time,
});
const collectionExportReceipt = object({
  id, itemId: id, collectionRevisionId: id, format: z.enum(['text', 'png', 'pdf']), outputSpecVersion: count.min(1), createdAt: time,
});

const quotaReceipt = object({
  reservationId: id, quotaPeriodId: id, state: z.enum(['reserved', 'committed', 'released']), reservationExpiresAt: time,
});
export const aiRequestReceipt = object({
  id, consent: consentReceipt, contextId: id, contextGeneration: count, processingRootSeedIds: ids,
  permissionEpochs: z.record(id, count), inputFingerprint: id, resultId: id.optional(), quota: quotaReceipt.optional(),
  status: z.enum(['waiting', 'received', 'cancelled', 'failed']),
}).refine(({ id, consent }) => id === consent.requestId);
const outbox = object({
  id, kind: z.enum(['ack', 'cancel', 'status']), requestId: id, contextGeneration: count,
  reservationId: id.optional(), quotaPeriodId: id.optional(), createdAt: time,
});

const studioPreferences = object({
  layout: z.enum(['radial', 'constellation', 'list']),
  palette: z.enum(['paper', 'indigo', 'night']),
});
const reflection = object({ day: z.iso.date(), body: text.min(1), updatedAt: time });

export const gardenV3 = object({
  storeVersion: z.literal(3), ...gardenCore, permissions: z.array(permission), sourceSnapshots: z.array(sourceSnapshot),
  mapViews: z.array(mapView), atelierProjects: z.array(atelierProject), atelierDrafts: z.array(atelierDraft),
  atelierRevisions: z.array(atelierRevision), atelierSuggestions: z.array(atelierSuggestion), adoptionRecords: z.array(adoptionRecord),
  collectionItems: z.array(collectionItem), collectionDrafts: z.array(collectionDraft), collectionRevisions: z.array(collectionRevision),
  collectionExportReceipts: z.array(collectionExportReceipt), connectionProposals: z.array(connectionProposal),
  proposalSuppressions: z.array(suppression), aiRequestReceipts: z.array(aiRequestReceipt), outbox: z.array(outbox),
  studioPreferences: studioPreferences.optional(), reflections: z.array(reflection).optional(),
});

export type GardenStoreV3 = z.infer<typeof gardenV3>;
export type SourceRef = z.infer<typeof sourceRef>;
export type SourceVersion = z.infer<typeof sourceVersion>;
export type SourceSnapshot = z.infer<typeof sourceSnapshot>;
export type Lineage = z.infer<typeof lineage>;
export type SeedPermission = z.infer<typeof permission>;
export type ConsentReceipt = z.infer<typeof consentReceipt>;
export type Evidence = z.infer<typeof evidence>;
export type ConnectionProposal = z.infer<typeof connectionProposal>;
export type AiRequestReceipt = z.infer<typeof aiRequestReceipt>;
export type QuotaReceipt = z.infer<typeof quotaReceipt>;
export type AiOutboxEntry = z.infer<typeof outbox>;
export type MapScope = z.infer<typeof scope>;
export type MapFocus = z.infer<typeof focus>;
export type MapView = z.infer<typeof mapView>;
export type MapReturnContext = z.infer<typeof mapReturnContext>;
export type StudioPreferences = z.infer<typeof studioPreferences>;
export type AtelierProject = z.infer<typeof atelierProject>;
export type AtelierDraft = z.infer<typeof atelierDraft>;
export type AtelierRevision = z.infer<typeof atelierRevision>;
export type AtelierSuggestion = z.infer<typeof atelierSuggestion>;
export type CollectionRevision = z.infer<typeof collectionRevision>;
export type CollectionReturnContext = {
  collectionItemId: string;
  collectionRevisionId: string;
  scrollOffset: number;
  focusedControlId?: string;
  selectedMaterialSnapshotId?: string;
};

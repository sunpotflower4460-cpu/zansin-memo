import type { PlusCommand } from '../../data/gardenV3Writer';
import { withCoreCommand } from '../../data/gardenV3Writer';
import { promoteToSprout } from '../gardenCommands';
import type { Seed } from '../types';
import type { AtelierDraft, AtelierProject, AtelierRevision, GardenStoreV3, MapReturnContext, SourceRef, SourceSnapshot } from './contracts';
import { mergeLineage, readSource, snapshotSource, textDigest } from './sources';

type DraftTarget = { projectId: string; branchId: string; expected: number };
type Pin = AtelierDraft['pinnedExcerpts'][number];

export const activeDraft = (store: GardenStoreV3, project: AtelierProject) =>
  store.atelierDrafts.find((item) => item.projectId === project.id && item.branchId === project.activeBranchId);

const sameRef = (a: SourceRef, b: SourceRef) => a.seedId === b.seedId && a.part === b.part &&
  (a.part !== 'synthesis' || (b.part === 'synthesis' && a.synthesisId === b.synthesisId));

export function materialState(seeds: readonly Seed[], snapshot: SourceSnapshot | undefined) {
  if (!snapshot) return 'missing';
  if (seeds.some((seed) => seed.id === snapshot.source.ref.seedId && seed.deletedAt)) return 'deleted';
  const current = readSource(seeds, snapshot.source.ref);
  if (!current) return readSource(seeds, snapshot.source.ref, true) ? 'changed' : 'missing';
  return textDigest(current.text) === snapshot.source.textDigest ? 'current' : 'changed';
}

export function captureMaterial(store: GardenStoreV3, ref: SourceRef, id: string, at: string) {
  const snapshot = snapshotSource(store.seeds, ref, id, at);
  if (!snapshot) return undefined;
  const existing = store.sourceSnapshots.find((item) => sameRef(item.source.ref, ref) && item.text === snapshot.text && item.title === snapshot.title &&
    item.lineage.status === snapshot.lineage.status && JSON.stringify(item.lineage.rootSeedIds) === JSON.stringify(snapshot.lineage.rootSeedIds));
  if (existing) return { snapshot: existing, snapshots: store.sourceSnapshots };
  if (store.sourceSnapshots.some((item) => item.id === id)) return undefined;
  return { snapshot, snapshots: [...store.sourceSnapshots, snapshot] };
}

function replaceDraft(store: GardenStoreV3, before: AtelierDraft, draft: AtelierDraft) {
  return { ...store, atelierDrafts: store.atelierDrafts.map((item) => item === before ? draft : item) };
}

function withDraft(commandId: string, target: DraftTarget, edit: (store: GardenStoreV3, draft: AtelierDraft) => ReturnType<PlusCommand['apply']>): PlusCommand {
  return { id: commandId, apply: (store) => {
    const draft = store.atelierDrafts.find((entry) => entry.projectId === target.projectId && entry.branchId === target.branchId);
    return draft?.editRevision === target.expected ? edit(store, draft) : { rejected: '下書きに更新があります。入力を残して確認してください' };
  } };
}

export function createAtelier(args: { id: string; branchId: string; centerSeedId?: string; materials: Array<{ ref: SourceRef; id: string }>;
  originNavigation?: MapReturnContext; at: string }): PlusCommand {
  return { id: `atelier:${args.id}`, apply: (store) => {
    if (store.atelierProjects.some((project) => project.id === args.id)) return store;
    let working = store;
    const selected: SourceSnapshot[] = [];
    for (const material of args.materials) {
      if (selected.some((snapshot) => sameRef(snapshot.source.ref, material.ref))) continue;
      const result = captureMaterial(working, material.ref, material.id, args.at);
      if (!result) return { rejected: '材料の原文を確認できません' };
      working = { ...working, sourceSnapshots: result.snapshots };
      selected.push(result.snapshot);
    }
    const project: AtelierProject = { id: args.id, centerSeedId: args.centerSeedId, status: 'drafting',
      branches: [{ id: args.branchId, name: 'はじめの案' }], activeBranchId: args.branchId,
      originNavigation: args.originNavigation, createdAt: args.at, updatedAt: args.at };
    const draft: AtelierDraft = { projectId: project.id, branchId: args.branchId, text: '',
      materials: selected.map(({ id }) => ({ snapshotId: id, versionMode: 'current' })), pinnedExcerpts: [], insertedSuggestionIds: [],
      lineage: mergeLineage(...selected.map((item) => item.lineage)), editRevision: 0, updatedAt: args.at };
    return { ...working, atelierProjects: [...working.atelierProjects, project], atelierDrafts: [...working.atelierDrafts, draft] };
  } };
}

export function reviseMaterial(args: { commandId: string; target: DraftTarget; at: string } & (
  { kind: 'add'; ref: SourceRef; id: string } | { kind: 'refresh'; priorId: string; id: string } |
  { kind: 'historical'; priorId: string } | { kind: 'remove'; priorId: string }
)): PlusCommand {
  return withDraft(args.commandId, args.target, (store, draft) => {
    const before = 'priorId' in args ? draft.materials.find((entry) => entry.snapshotId === args.priorId) : undefined;
    if ('priorId' in args && !before) return { rejected: '材料の選択に更新があります' };
    const original = before && store.sourceSnapshots.find(({ id }) => id === before.snapshotId);
    if (args.kind === 'remove' || args.kind === 'historical') {
      if (args.kind === 'historical' && (!original || ['deleted', 'missing'].includes(materialState(store.seeds, original)))) return { rejected: '材料を確認できません' };
      const materials = args.kind === 'remove' ? draft.materials.filter((entry) => entry !== before) :
        draft.materials.map((entry) => entry === before ? { ...entry, versionMode: 'historical' as const } : entry);
      return replaceDraft(store, draft, { ...draft, materials, editRevision: draft.editRevision + 1, updatedAt: args.at });
    }
    const ref = args.kind === 'add' ? args.ref : original?.source.ref;
    const seed = ref && store.seeds.find((entry) => entry.id === ref.seedId);
    const liveRef = ref?.part === 'synthesis' && seed?.synthesis ? { ...ref, synthesisId: seed.synthesis.id } : ref;
    const result = liveRef && captureMaterial(store, liveRef, args.id, args.at);
    if (!result) return { rejected: '現在の原文を確認できません' };
    if (draft.materials.some((entry) => entry !== before && entry.snapshotId === result.snapshot.id)) return store;
    const next = { snapshotId: result.snapshot.id, versionMode: 'current' as const };
    const materials = before ? draft.materials.map((entry) => entry === before ? next : entry) : [...draft.materials, next];
    return replaceDraft({ ...store, sourceSnapshots: result.snapshots }, draft, {
      ...draft, materials, lineage: mergeLineage(draft.lineage, result.snapshot.lineage), editRevision: draft.editRevision + 1, updatedAt: args.at,
    });
  });
}

export function changedRange(before: string, after: string) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = before.length;
  let afterEnd = after.length;
  while (end > start && afterEnd > start && before[end - 1] === after[afterEnd - 1]) { end--; afterEnd--; }
  return { start, end, afterEnd };
}

export function movePins(before: string, after: string, pins: Pin[]): Pin[] | undefined {
  if (before === after || !pins.length) return pins;
  const { start, end, afterEnd } = changedRange(before, after);
  const delta = afterEnd - end;
  if (pins.some((pin) => start < pin.end && end > pin.start)) return undefined;
  const moved = pins.map((pin) => end <= pin.start ? { ...pin, start: pin.start + delta, end: pin.end + delta } : pin);
  return moved.every((pin) => after.slice(pin.start, pin.end) === pin.text) ? moved : undefined;
}

export function saveAtelierText(target: DraftTarget, text: string, operationId: string, at: string): PlusCommand {
  return withDraft(operationId, target, (store, draft) => {
    if (draft.text === text) return store;
    const pinnedExcerpts = movePins(draft.text, text, draft.pinnedExcerpts);
    if (!pinnedExcerpts) return { rejected: '固定した一節を外してから編集できます' };
    return replaceDraft(store, draft, { ...draft, text, pinnedExcerpts, editRevision: draft.editRevision + 1, updatedAt: at });
  });
}

export function trackPin(args: { target: DraftTarget; id: string; at: string; range?: { start: number; end: number } }): PlusCommand {
  return withDraft(`pin:${args.id}:${args.range ? 'add' : 'remove'}`, args.target, (store, draft) => {
    const pins = draft.pinnedExcerpts;
    if (!args.range) return replaceDraft(store, draft, { ...draft, pinnedExcerpts: pins.filter((pin) => pin.id !== args.id), editRevision: draft.editRevision + 1, updatedAt: args.at });
    const { start, end } = args.range;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > draft.text.length || start >= end ||
        pins.some((pin) => start < pin.end && end > pin.start)) return { rejected: '固定する一節を選んでください' };
    const pin = { id: args.id, start, end, text: draft.text.slice(start, end) };
    return replaceDraft(store, draft, { ...draft, pinnedExcerpts: [...pins, pin], editRevision: draft.editRevision + 1, updatedAt: args.at });
  });
}

export function saveAtelierRevision(target: DraftTarget, id: string, at: string): PlusCommand {
  return withDraft(`atelier-version:${id}`, target, (store, draft) => {
    if (store.atelierRevisions.some((item) => item.id === id)) return store;
    const project = store.atelierProjects.find((item) => item.id === draft.projectId);
    const branch = project?.branches.find((item) => item.id === draft.branchId);
    if (!project || !branch || !draft.text.trim()) return { rejected: '版に残す言葉を書いてください' };
    for (const item of draft.materials) {
      const snapshot = store.sourceSnapshots.find(({ id }) => id === item.snapshotId);
      const state = materialState(store.seeds, snapshot);
      if (state === 'deleted' || state === 'missing' || (state === 'changed' && item.versionMode !== 'historical')) {
        return { rejected: '材料を確認してください。本文は下書きに残っています' };
      }
    }
    const head = store.atelierRevisions.find((item) => item.id === branch.headRevisionId);
    const materialSnapshotIds = draft.materials.map((item) => item.snapshotId);
    if (head?.text === draft.text && JSON.stringify([head.materialSnapshotIds, head.pinnedExcerpts, head.insertedSuggestionIds, head.lineage]) ===
        JSON.stringify([materialSnapshotIds, draft.pinnedExcerpts, draft.insertedSuggestionIds, draft.lineage])) return store;
    const revision: AtelierRevision = { id, projectId: draft.projectId, branchId: draft.branchId, parentRevisionId: branch.headRevisionId ?? draft.baseRevisionId,
      text: draft.text, title: project.title, materialSnapshotIds, pinnedExcerpts: draft.pinnedExcerpts,
      insertedSuggestionIds: draft.insertedSuggestionIds, lineage: draft.lineage, savedAt: at };
    return replaceDraft({ ...store, atelierRevisions: [...store.atelierRevisions, revision], atelierProjects: store.atelierProjects.map((item) => item === project
      ? { ...item, updatedAt: at, branches: item.branches.map((entry) => entry === branch ? { ...entry, headRevisionId: id } : entry) } : item) },
    draft, { ...draft, baseRevisionId: id, editRevision: draft.editRevision + 1, updatedAt: at });
  });
}

export function chooseAtelierBranch(projectId: string, branchId: string, operationId: string): PlusCommand {
  return { id: operationId, apply: (store) => ({ ...store, atelierProjects: store.atelierProjects.map((project) => project.id === projectId &&
    project.branches.some((branch) => branch.id === branchId) ? { ...project, activeBranchId: branchId } : project) }) };
}

export function forkAtelier(projectId: string, branchId: string, at: string, revisionId?: string): PlusCommand {
  return { id: `atelier-branch:${branchId}`, apply: (store) => {
    const project = store.atelierProjects.find((item) => item.id === projectId);
    const revision = revisionId ? store.atelierRevisions.find((item) => item.id === revisionId && item.projectId === projectId) : undefined;
    if (!project || (revisionId && !revision)) return { rejected: '元の版を確認できません' };
    if (project.branches.some((branch) => branch.id === branchId)) return store;
    const draft: AtelierDraft = { projectId, branchId, baseRevisionId: revisionId, text: revision?.text ?? '',
      materials: revision?.materialSnapshotIds.map((snapshotId) => ({ snapshotId, versionMode: 'current' })) ?? [],
      pinnedExcerpts: revision?.pinnedExcerpts ?? [], insertedSuggestionIds: revision?.insertedSuggestionIds ?? [],
      lineage: revision?.lineage ?? mergeLineage(), editRevision: 0, updatedAt: at };
    return { ...store, atelierDrafts: [...store.atelierDrafts, draft], atelierProjects: store.atelierProjects.map((item) => item === project
      ? { ...project, branches: [...project.branches, { id: branchId, name: `案 ${project.branches.length + 1}` }], activeBranchId: branchId, updatedAt: at } : item) };
  } };
}

export function adoptAtelierRevision(args: { id: string; revisionId: string; centerId: string; centerText: string; newSynthesisId: string;
  oldSynthesis?: { id: string; updatedAt: string; statement: string }; snapshotId: string; at: string }): PlusCommand {
  return { id: `atelier-adoption:${args.id}`, apply: (store) => {
    if (store.adoptionRecords.some((item) => item.id === args.id)) return store;
    const revision = store.atelierRevisions.find((item) => item.id === args.revisionId);
    const center = store.seeds.find((seed) => seed.id === args.centerId && !seed.deletedAt);
    const old = center?.synthesis;
    if (!revision || !center || center.body !== args.centerText || Boolean(old) !== Boolean(args.oldSynthesis) ||
        (old && (old.id !== args.oldSynthesis?.id || old.updatedAt !== args.oldSynthesis.updatedAt || old.statement !== args.oldSynthesis.statement))) {
      return { rejected: '中心の原文または現在の芽が変わりました' };
    }
    const materials = [];
    for (const id of revision.materialSnapshotIds) {
      const snapshot = store.sourceSnapshots.find((item) => item.id === id);
      if (!snapshot || materialState(store.seeds, snapshot) !== 'current') return { rejected: '現在の材料を選び直し、新しい版を残してください' };
      materials.push({ seedId: snapshot.source.ref.seedId, sourcePart: snapshot.source.ref.part, expectedText: snapshot.text });
    }
    const previous = old && captureMaterial(store, { seedId: center.id, part: 'synthesis', synthesisId: old.id }, args.snapshotId, args.at);
    if (old && !previous) return { rejected: '現在の芽の控えを保存できません' };
    const synthesisId = old?.id ?? args.newSynthesisId;
    const result = withCoreCommand(promoteToSprout({ commandId: args.id, centerId: center.id, statement: revision.text, synthesisId,
      centerBodyText: args.centerText, materials, review: Boolean(old), now: args.at })).apply(store);
    if ('rejected' in result) return result;
    return { ...result, sourceSnapshots: previous?.snapshots ?? result.sourceSnapshots, adoptionRecords: [...result.adoptionRecords, {
      id: args.id, atelierRevisionId: revision.id, centerSeedId: center.id, synthesisId, previousSynthesisSnapshotId: previous?.snapshot.id, adoptedAt: args.at,
    }] };
  } };
}

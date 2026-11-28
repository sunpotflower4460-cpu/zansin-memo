import type { PlusCommand } from '../../data/gardenV3Writer';
import { withCoreCommand } from '../../data/gardenV3Writer';
import { promoteToSprout } from '../gardenCommands';
import type { Seed } from '../types';
import type { AtelierDraft, AtelierProject, AtelierRevision, AtelierSuggestion, GardenStoreV3, MapReturnContext, SourceRef, SourceSnapshot } from './contracts';
import type { CraftCandidate } from './craft';
import { isTextBoundary, mergeLineage, readSource, sameSourceRef, snapshotSource, textDigest, validTextRange } from './sources';

export type DraftTarget = { projectId: string; branchId: string; expected: number };
type Pin = AtelierDraft['pinnedExcerpts'][number];

export const activeDraft = (store: GardenStoreV3, project: AtelierProject) =>
  store.atelierDrafts.find((item) => item.projectId === project.id && item.branchId === project.activeBranchId);

export function materialState(seeds: readonly Seed[], snapshot: SourceSnapshot | undefined) {
  if (!snapshot) return 'missing';
  if (seeds.some((seed) => seed.id === snapshot.source.ref.seedId && seed.deletedAt)) return 'deleted';
  const current = readSource(seeds, snapshot.source.ref);
  if (!current) return readSource(seeds, snapshot.source.ref, true) ? 'changed' : 'missing';
  return textDigest(current.text) === snapshot.source.textDigest ? 'current' : 'changed';
}

export function readCraftEvidence(store: Pick<GardenStoreV3, 'seeds' | 'sourceSnapshots'>, entry: AtelierSuggestion['evidence'][number]) {
  const snapshot = store.sourceSnapshots.find((item) => sameSourceRef(item.source.ref, entry.source.ref) &&
    item.source.textDigest === entry.source.textDigest && item.source.updatedAt === entry.source.updatedAt);
  if (!snapshot || !validTextRange(snapshot.text, entry.start, entry.end) || snapshot.text.slice(entry.start, entry.end) !== entry.quote) return undefined;
  const state = materialState(store.seeds, snapshot);
  return state === 'current' || state === 'changed' ? { snapshot, state, quote: entry.quote } : undefined;
}

export function captureMaterial(store: GardenStoreV3, ref: SourceRef, id: string, at: string) {
  const snapshot = snapshotSource(store.seeds, ref, id, at);
  if (!snapshot) return undefined;
  const existing = store.sourceSnapshots.find((item) => sameSourceRef(item.source.ref, ref) && item.text === snapshot.text && item.title === snapshot.title &&
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
      if (selected.some((snapshot) => sameSourceRef(snapshot.source.ref, material.ref))) continue;
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
  let earliest = start;
  // Repeated text can put the same edit on either side of the pinned occurrence.
  const removed = end - start;
  const added = afterEnd - start;
  while (earliest > 0 && before[earliest + removed - 1] === after[earliest + added - 1]) earliest--;
  return movePinsPastEdit(after, pins, earliest, end, afterEnd - end);
}

function movePinsPastEdit(text: string, pins: Pin[], start: number, end: number, delta: number): Pin[] | undefined {
  if (pins.some((pin) => start < pin.end && end > pin.start)) return undefined;
  const moved = pins.map((pin) => end <= pin.start ? { ...pin, start: pin.start + delta, end: pin.end + delta } : pin);
  return moved.every((pin) => text.slice(pin.start, pin.end) === pin.text) ? moved : undefined;
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
    if (!validTextRange(draft.text, start, end) ||
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

/** An offline example is stored apart from the editor. It issues no AI request or quota receipt. */
export function saveAtelierExample(target: DraftTarget, args: { id: string; snapshotId: string; kind: AtelierSuggestion['kind']; content: string; at: string }): PlusCommand {
  return withDraft(`atelier-example:${args.id}`, target, (store, draft) => {
    if (store.atelierSuggestions.some((item) => item.id === args.id)) return store;
    const snapshot = store.sourceSnapshots.find(({ id }) => id === args.snapshotId);
    if (!snapshot || !draft.materials.some(({ snapshotId }) => snapshotId === args.snapshotId) ||
        materialState(store.seeds, snapshot) !== 'current' || !args.content.trim()) return { rejected: 'この材料で表示できる例の案はありません' };
    const lineage = mergeLineage(draft.lineage, snapshot.lineage);
    const suggestion: AtelierSuggestion = {
      id: args.id, requestId: `offline-example:${args.id}`, resultId: args.id, projectId: draft.projectId, branchId: draft.branchId,
      baseEditRevision: draft.editRevision, baseTextDigest: textDigest(draft.text), kind: args.kind, content: args.content,
      evidence: [{ source: snapshot.source, start: 0, end: snapshot.text.length, quote: snapshot.text }], processingRootSeedIds: lineage.rootSeedIds,
      permissionEpochs: Object.fromEntries(lineage.rootSeedIds.map((id) => [id, store.permissions.find((item) => item.seedId === id)?.epoch ?? 0])),
      decision: 'pending', availability: 'ready', createdAt: args.at,
    };
    return { ...store, atelierSuggestions: [...store.atelierSuggestions, suggestion] };
  });
}

export function atelierExampleCurrent(store: GardenStoreV3, draft: AtelierDraft, suggestion: AtelierSuggestion) {
  return suggestion.requestId.startsWith('offline-example:') && suggestion.projectId === draft.projectId && suggestion.branchId === draft.branchId &&
    suggestion.decision === 'pending' && suggestion.availability === 'ready' && suggestion.baseEditRevision === draft.editRevision &&
    suggestion.baseTextDigest === textDigest(draft.text) && suggestion.evidence.every((entry) => {
      const source = readSource(store.seeds, entry.source.ref);
      return Boolean(source && textDigest(source.text) === entry.source.textDigest && source.text.slice(entry.start, entry.end) === entry.quote);
    });
}

export function insertAtelierExample(target: DraftTarget, args: { id: string; start: number; end: number; append?: boolean; at: string }): PlusCommand {
  return withDraft(`atelier-insert:${args.id}`, target, (store, draft) => {
    const suggestion = store.atelierSuggestions.find((item) => item.id === args.id);
    if (draft.insertedSuggestionIds.includes(args.id)) return store;
    if (!suggestion || !atelierExampleCurrent(store, draft, suggestion)) return { rejected: '下書きまたは材料が変わりました。案を確認し直してください' };
    const start = args.append ? draft.text.length : args.start;
    const end = args.append ? draft.text.length : args.end;
    if (start > end || !isTextBoundary(draft.text, start) || !isTextBoundary(draft.text, end)) return { rejected: '案を入れる位置を選んでください' };
    const added = args.append && draft.text.length ? `\n${suggestion.content}` : suggestion.content;
    const text = draft.text.slice(0, start) + added + draft.text.slice(end);
    const pinnedExcerpts = movePinsPastEdit(text, draft.pinnedExcerpts, start, end, added.length - (end - start));
    if (!pinnedExcerpts) return { rejected: '固定した一節の外に入れる場所を選んでください' };
    return replaceDraft({ ...store, atelierSuggestions: store.atelierSuggestions.map((item) => item === suggestion
      ? { ...item, decision: 'inserted', insertedAt: args.at } : item) }, draft, { ...draft, text, pinnedExcerpts,
      insertedSuggestionIds: [...draft.insertedSuggestionIds, suggestion.id], lineage: mergeLineage(draft.lineage, { status: 'known', rootSeedIds: suggestion.processingRootSeedIds }),
      editRevision: draft.editRevision + 1, updatedAt: args.at });
  });
}

/** Commit the chosen recipe, exact ingredients, draft and optional work source in one writer operation. */
export function adoptCraft(args: { id: string; target: DraftTarget; create: boolean; candidate: CraftCandidate; saveVersion: boolean; at: string }): PlusCommand {
  const { id, target, candidate, at } = args;
  return { id, apply: (store) => {
    const prior = store.atelierSuggestions.find((item) => item.id === id);
    if (prior) return prior.requestId === `local-craft:${id}` && prior.projectId === target.projectId && prior.branchId === target.branchId &&
      prior.decision === 'inserted' ? store : { rejected: '別の案が保存されています。下書きを確認してください。' };
    const { parts, title, body, recipe, generator } = candidate;
    if (!title.trim() || !body.trim() || parts.length < 2 || parts.length > 3 ||
        new Set(parts.map((part) => part.source.ref.seedId)).size !== parts.length) return { rejected: '異なるメモを2〜3枚選んでください' };
    const uses = generator === 'recipe' ? candidate.uses : undefined;
    if (uses && (uses.length !== parts.length || uses.some((text) => !text.trim() || text.length > 200))) {
      return { rejected: '素材の使い道を確認できません。この案を開き直してください。' };
    }
    let working = store;
    if (args.create) {
      if (store.atelierProjects.some((project) => project.id === target.projectId)) return { rejected: '作業中の下書きを確認してください' };
      const result = createAtelier({ id: target.projectId, branchId: target.branchId, materials: [], centerSeedId: parts[0].source.ref.seedId, at }).apply(store);
      if ('rejected' in result) return result;
      working = result;
    }
    const draft = working.atelierDrafts.find((entry) => entry.projectId === target.projectId && entry.branchId === target.branchId);
    const project = working.atelierProjects.find((entry) => entry.id === target.projectId && entry.activeBranchId === target.branchId);
    if (!draft || !project || draft.editRevision !== target.expected) {
      return { rejected: '下書きが変わりました。開き直してから取り込めます。' };
    }
    if (!project.title && !draft.text && draft.editRevision === 0 && project.branches.length === 1) {
      working = { ...working, atelierProjects: working.atelierProjects.map((entry) => entry === project ? { ...entry, title } : entry) };
    }
    const materials = [...draft.materials];
    const evidence: AtelierSuggestion['evidence'] = [];
    const origins = [];
    for (const [i, part] of parts.entries()) {
      const result = captureMaterial(working, part.source.ref, `${id}:source:${i}`, at);
      const snapshot = result?.snapshot;
      if (!result || !snapshot || snapshot.source.textDigest !== part.source.textDigest || snapshot.title !== part.title ||
          !validTextRange(snapshot.text, part.start, part.end) || snapshot.text.slice(part.start, part.end) !== part.quote) {
        return { rejected: '素材の原文が変わりました。使う一節を選び直してください。' };
      }
      working = { ...working, sourceSnapshots: result.snapshots };
      if (!materials.some((material) => material.snapshotId === snapshot.id)) materials.push({ snapshotId: snapshot.id, versionMode: 'current' });
      evidence.push({ source: snapshot.source, quote: part.quote, start: part.start, end: part.end });
      origins.push(snapshot.lineage);
    }
    const roots = mergeLineage(...origins);
    const insertion = draft.text ? `\n\n${title}\n${body}` : body;
    const suggestion: AtelierSuggestion = { id, requestId: `local-craft:${id}`, resultId: id, projectId: draft.projectId, branchId: draft.branchId,
      baseEditRevision: draft.editRevision, baseTextDigest: textDigest(draft.text), kind: 'outline', content: body,
      craft: { recipe, generator, title, uses }, evidence, processingRootSeedIds: roots.rootSeedIds, permissionEpochs: {},
      decision: 'inserted', availability: 'ready', createdAt: at, insertedAt: at };
    const next = { ...draft, materials, text: draft.text + insertion, lineage: mergeLineage(draft.lineage, roots),
      insertedSuggestionIds: [...draft.insertedSuggestionIds, id], editRevision: draft.editRevision + 1, updatedAt: at };
    working = replaceDraft({ ...working, atelierSuggestions: [...working.atelierSuggestions, suggestion] }, draft, next);
    return args.saveVersion ? saveAtelierRevision({ ...target, expected: next.editRevision }, `${id}:version`, at).apply(working) : working;
  } };
}

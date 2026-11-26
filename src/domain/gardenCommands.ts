import type { GardenCommand } from '../data/gardenWriter';
import { connectionId, makeConnection } from '../data/gardenModel';
import type { Draft, GardenStoreV2, Seed, SeedCreateInput, SeedSynthesis, SeedUpdateInput, SynthesisSource, TransformOutput } from './types';
import { SEED_SCHEMA_VERSION } from './types';

// 保存の意味単位。UI が配列を直接書き換えて保存する経路を作らず、ここに集約する。
// どの操作も、IDと時刻を最初に確定して受け取る（再試行で作り直さない・同じIDなら二重に作らない）。

const cleanArray = (values: string[] | undefined): string[] =>
  Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
const clampImportance = (value: number | undefined): Seed['importance'] =>
  value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : 3;

const draftIds = (id: string | undefined): string[] | undefined => (id ? [id] : undefined);

const isLive = (seed: Seed | undefined): seed is Seed => Boolean(seed && !seed.deletedAt);

export const buildSeed = (id: string, input: SeedCreateInput, now: string): Seed => ({
  id,
  title: input.title?.trim() || undefined,
  body: input.body.trim(),
  createdAt: now,
  updatedAt: now,
  mood: input.mood,
  importance: clampImportance(input.importance),
  growthState: input.growthState ?? 'seed',
  tags: cleanArray(input.tags),
  transformOutputs: [],
  schemaVersion: SEED_SCHEMA_VERSION,
});

const findSeed = (store: GardenStoreV2, id: string): Seed | undefined => store.seeds.find((seed) => seed.id === id);

const withoutDrafts = (store: GardenStoreV2, draftIds: string[] | undefined): GardenStoreV2 =>
  draftIds && draftIds.length > 0 && store.drafts.some((draft) => draftIds.includes(draft.id))
    ? { ...store, drafts: store.drafts.filter((draft) => !draftIds.includes(draft.id)) }
    : store;

/** 新しいメモを残す。タイトル・分類・接続は不要。 */
export const captureSeed = (args: { commandId: string; seedId: string; input: SeedCreateInput; now: string; draftId?: string }): GardenCommand => ({
  id: args.commandId,
  clearsDraftIds: draftIds(args.draftId),
  apply: (store) => {
    if (!args.input.body.trim()) {
      return { rejected: 'empty_body' };
    }
    // 再試行で同じIDのメモが既にあれば作り直さない。
    if (findSeed(store, args.seedId)) {
      return withoutDrafts(store, draftIds(args.draftId));
    }
    return withoutDrafts(
      { ...store, seeds: [buildSeed(args.seedId, args.input, args.now), ...store.seeds] },
      draftIds(args.draftId),
    );
  },
});

/** 二つの種を結ぶ。既にあれば重複作成しない。自己接続・存在しない相手は拒否する。 */
export const connectSeeds = (args: { commandId: string; a: string; b: string; now: string; note?: string }): GardenCommand => ({
  id: args.commandId,
  apply: (store) => {
    if (args.a === args.b) {
      return { rejected: 'self_connection' };
    }
    if (!isLive(findSeed(store, args.a)) || !isLive(findSeed(store, args.b))) {
      return { rejected: 'missing_seed' };
    }
    const id = connectionId(args.a, args.b);
    if (store.connections.some((connection) => connection.id === id)) {
      return store;
    }
    return { ...store, connections: [...store.connections, makeConnection(args.a, args.b, 'manual', args.now, args.note?.trim() || undefined)] };
  },
});

/** 新しいメモの保存と、中心とのつながりを一つの更新で確定する。部分的な成功を作らない。 */
export const captureAndConnect = (args: {
  commandId: string;
  seedId: string;
  input: SeedCreateInput;
  centerId: string;
  now: string;
  draftId?: string;
}): GardenCommand => ({
  id: args.commandId,
  clearsDraftIds: draftIds(args.draftId),
  apply: (store) => {
    if (!args.input.body.trim()) {
      return { rejected: 'empty_body' };
    }
    if (!isLive(findSeed(store, args.centerId))) {
      return { rejected: 'missing_center' };
    }
    const cleared = draftIds(args.draftId);
    const exists = Boolean(findSeed(store, args.seedId));
    const seeds = exists ? store.seeds : [buildSeed(args.seedId, args.input, args.now), ...store.seeds];
    const id = connectionId(args.seedId, args.centerId);
    const connections = store.connections.some((connection) => connection.id === id)
      ? store.connections
      : [...store.connections, makeConnection(args.seedId, args.centerId, 'manual', args.now)];
    return withoutDrafts({ ...store, seeds, connections }, cleared);
  },
});

/** 中心から、選んだメモへだけ線を足す。選んだ全員同士を結ばない。 */
export const connectFromCenter = (args: { commandId: string; centerId: string; targetIds: string[]; now: string }): GardenCommand => ({
  id: args.commandId,
  apply: (store) => {
    if (!isLive(findSeed(store, args.centerId))) {
      return { rejected: 'missing_center' };
    }
    let connections = store.connections;
    for (const targetId of Array.from(new Set(args.targetIds))) {
      if (targetId === args.centerId || !isLive(findSeed(store, targetId))) {
        continue;
      }
      const id = connectionId(args.centerId, targetId);
      if (!connections.some((connection) => connection.id === id)) {
        connections = [...connections, makeConnection(args.centerId, targetId, 'manual', args.now)];
      }
    }
    return connections === store.connections ? store : { ...store, connections };
  },
});

/** つながりだけを外す。両方のメモと他のつながり、芽とその材料は残る。 */
export const disconnectSeeds = (args: { commandId: string; a: string; b: string }): GardenCommand => ({
  id: args.commandId,
  apply: (store) => {
    const id = connectionId(args.a, args.b);
    return store.connections.some((connection) => connection.id === id)
      ? { ...store, connections: store.connections.filter((connection) => connection.id !== id) }
      : store;
  },
});

/** つながりに添える、本人の一言（「どうつながる？」）。 */
export const setConnectionNote = (args: { commandId: string; a: string; b: string; note: string }): GardenCommand => ({
  id: args.commandId,
  apply: (store) => {
    const id = connectionId(args.a, args.b);
    const note = args.note.trim();
    if (!store.connections.some((connection) => connection.id === id)) {
      return { rejected: 'missing_connection' };
    }
    return {
      ...store,
      connections: store.connections.map((connection) => {
        if (connection.id !== id) return connection;
        const { note: _previous, ...rest } = connection;
        return note ? { ...rest, note } : rest;
      }),
    };
  },
});

/**
 * 本文・題名・メタ情報の編集。編集を始めたときの内容（expectedUpdatedAt）と違えば、古い入力で上書きしない。
 * 再浮上など背景の更新は updatedAt を動かさないので、編集中の入力とは衝突しない。
 */
export const updateSeedFields = (args: {
  commandId: string;
  seedId: string;
  patch: SeedUpdateInput;
  now: string;
  expectedUpdatedAt?: string;
  draftId?: string;
}): GardenCommand => ({
  id: args.commandId,
  clearsDraftIds: draftIds(args.draftId),
  apply: (store) => {
    const seed = findSeed(store, args.seedId);
    if (!seed) {
      return { rejected: 'missing_seed' };
    }
    if (args.expectedUpdatedAt !== undefined && seed.updatedAt !== args.expectedUpdatedAt) {
      return { rejected: 'conflict' };
    }
    if (args.patch.body !== undefined && !args.patch.body.trim()) {
      return { rejected: 'empty_body' };
    }
    const next: Seed = {
      ...seed,
      ...args.patch,
      title: args.patch.title !== undefined ? args.patch.title?.trim() || undefined : seed.title,
      body: args.patch.body !== undefined ? args.patch.body.trim() : seed.body,
      tags: args.patch.tags !== undefined ? cleanArray(args.patch.tags) : seed.tags,
      transformOutputs: args.patch.transformOutputs ?? seed.transformOutputs ?? [],
      synthesis: seed.synthesis,
      updatedAt: args.now,
    };
    return withoutDrafts({ ...store, seeds: store.seeds.map((item) => (item.id === seed.id ? next : item)) }, draftIds(args.draftId));
  },
});

/** 旧Transformの出力を足す。生成しただけでは芽や接続を増やさない。 */
export const addTransformOutput = (args: { commandId: string; seedId: string; output: TransformOutput; now: string }): GardenCommand => ({
  id: args.commandId,
  apply: (store) => {
    const seed = findSeed(store, args.seedId);
    if (!seed) {
      return { rejected: 'missing_seed' };
    }
    if (seed.transformOutputs?.some((output) => output.id === args.output.id)) {
      return store;
    }
    return {
      ...store,
      seeds: store.seeds.map((item) =>
        item.id === seed.id ? { ...item, transformOutputs: [...(item.transformOutputs ?? []), args.output], updatedAt: args.now } : item,
      ),
    };
  },
});

/** 削除は状態だけを更新する。つながりの正本は維持し、復元で戻せる。 */
export const softDeleteSeed = (args: { commandId: string; seedId: string; now: string }): GardenCommand => ({
  id: args.commandId,
  apply: (store) => {
    const seed = findSeed(store, args.seedId);
    if (!seed) return { rejected: 'missing_seed' };
    if (seed.deletedAt) return store;
    return { ...store, seeds: store.seeds.map((item) => (item.id === seed.id ? { ...item, deletedAt: args.now, updatedAt: args.now } : item)) };
  },
});

export const restoreSeed = (args: { commandId: string; seedId: string; now: string }): GardenCommand => ({
  id: args.commandId,
  apply: (store) => {
    const seed = findSeed(store, args.seedId);
    if (!seed) return { rejected: 'missing_seed' };
    if (!seed.deletedAt) return store;
    const { deletedAt: _removed, ...rest } = seed;
    return { ...store, seeds: store.seeds.map((item) => (item.id === seed.id ? { ...rest, updatedAt: args.now } : item)) };
  },
});

/** 再浮上の記録。更新日時は動かさず、育成の実績としても数えない。 */
export const touchResurfacing = (args: { commandId: string; seedId: string; resurfacedAt: string; score?: number }): GardenCommand => ({
  id: args.commandId,
  apply: (store) => {
    const seed = findSeed(store, args.seedId);
    if (!seed || seed.deletedAt) return store;
    return {
      ...store,
      seeds: store.seeds.map((item) =>
        item.id === seed.id ? { ...item, lastResurfacedAt: args.resurfacedAt, resurfacingScore: args.score ?? item.resurfacingScore } : item,
      ),
    };
  },
});

// ---- 芽（synthesis）: 材料を読んだ本人が書く「なら、こうできそう」 ----

/** 材料として選んだ文章。expectedText は、本人が画面で実際に読んだ文章。 */
export type MaterialRef = { seedId: string; sourcePart: 'body' | 'synthesis'; expectedText: string };

const materialKey = (ref: Pick<MaterialRef, 'seedId' | 'sourcePart'>) => `${ref.seedId}\u0000${ref.sourcePart}`;

/**
 * 芽を保存する（新しく芽にする／既存の芽を見直す）。
 * - 中心の原文（body）は必ず材料に含み、原文そのものは書き換えない
 * - 材料は、表示して確認した文章が現在の文章と一致するときだけ採用（変わっていれば拒否し、入力は呼び出し側が保持）
 * - 材料の材料は複製しない（採用した文章だけをスナップショットに残す）
 * - すでに芽がある中心への「新規作成」は拒否（見直しは review: true で明示）
 * - 件数・日数の解禁条件はない。材料が中心だけでもよい
 */
export const promoteToSprout = (args: {
  commandId: string;
  centerId: string;
  /** 新規作成のとき予定のID。見直しのときは既存の芽のID。 */
  synthesisId: string;
  statement: string;
  centerBodyText: string;
  /** 中心以外の材料（0件以上）。 */
  materials: MaterialRef[];
  /** 見直しで、材料を変えずに文章だけ直す。 */
  keepExistingSources?: boolean;
  review?: boolean;
  now: string;
  draftId?: string;
}): GardenCommand => ({
  id: args.commandId,
  clearsDraftIds: draftIds(args.draftId),
  apply: (store) => {
    const statement = args.statement.trim();
    if (!statement) {
      return { rejected: 'empty_statement' };
    }
    const center = findSeed(store, args.centerId);
    if (!isLive(center)) {
      return { rejected: 'missing_center' };
    }
    const existing = center.synthesis;

    // 再試行・連打: 同じ芽・同じ文なら、二重に作らない。
    if (existing && existing.id === args.synthesisId && existing.statement === statement && !args.review) {
      return withoutDrafts(store, draftIds(args.draftId));
    }
    if (existing && !args.review && existing.id !== args.synthesisId) {
      return { rejected: 'center_has_synthesis' };
    }
    if (args.review && (!existing || existing.id !== args.synthesisId)) {
      return { rejected: 'missing_synthesis' };
    }

    let sources: SynthesisSource[];
    if (args.review && args.keepExistingSources && existing) {
      sources = existing.sources; // 芽の文章だけを編集した。材料のスナップショットは保持する。
    } else {
      if (center.body !== args.centerBodyText) {
        return { rejected: 'source_changed:center' };
      }
      const refs: MaterialRef[] = [{ seedId: center.id, sourcePart: 'body', expectedText: args.centerBodyText }];
      const seen = new Set<string>([materialKey(refs[0])]);
      for (const ref of args.materials) {
        if (ref.seedId === center.id && ref.sourcePart === 'synthesis') {
          continue; // 編集中の芽を自分自身の材料として引用しない
        }
        if (!seen.has(materialKey(ref))) {
          seen.add(materialKey(ref));
          refs.push(ref);
        }
      }
      sources = [];
      for (const ref of refs) {
        const origin = findSeed(store, ref.seedId);
        if (!isLive(origin)) {
          return { rejected: `source_missing:${ref.seedId}` };
        }
        if (ref.sourcePart === 'body') {
          if (origin.body !== ref.expectedText) {
            return { rejected: `source_changed:${ref.seedId}` };
          }
          sources.push({
            seedId: origin.id,
            sourcePart: 'body',
            textSnapshot: origin.body,
            ...(origin.title ? { titleSnapshot: origin.title } : {}),
            sourceUpdatedAt: origin.updatedAt,
          });
        } else {
          if (!origin.synthesis || origin.synthesis.statement !== ref.expectedText) {
            return { rejected: `source_changed:${ref.seedId}` };
          }
          sources.push({
            seedId: origin.id,
            sourcePart: 'synthesis',
            textSnapshot: origin.synthesis.statement,
            ...(origin.title ? { titleSnapshot: origin.title } : {}),
            sourceUpdatedAt: origin.synthesis.updatedAt,
            sourceSynthesisId: origin.synthesis.id,
          });
        }
      }
    }

    const currentlySprout = center.growthState === 'sprout' || center.growthState === 'tree';
    const synthesis: SeedSynthesis = {
      id: existing?.id ?? args.synthesisId,
      statement,
      sources,
      createdAt: existing?.createdAt ?? args.now,
      updatedAt: args.now,
      // 芽として採用した時刻。文章を直しただけでは更新しない。
      promotedAt: existing && currentlySprout ? existing.promotedAt : args.now,
    };
    const next: Seed = {
      ...center,
      synthesis,
      // 既存の木は降格しない。種・保管からの採用は芽にする。
      growthState: center.growthState === 'tree' ? 'tree' : 'sprout',
    };
    return withoutDrafts(
      { ...store, seeds: store.seeds.map((seed) => (seed.id === center.id ? next : seed)) },
      draftIds(args.draftId),
    );
  },
});

/** 後日の「種として考え直す」。考えと材料は残し、現在の芽として数えない（育ち方だけを種へ）。 */
export const reconsiderSynthesis = (args: { commandId: string; seedId: string }): GardenCommand => ({
  id: args.commandId,
  apply: (store) => {
    const seed = findSeed(store, args.seedId);
    if (!isLive(seed)) return { rejected: 'missing_seed' };
    if (seed.growthState === 'seed') return store;
    return { ...store, seeds: store.seeds.map((item) => (item.id === seed.id ? { ...item, growthState: 'seed' } : item)) };
  },
});

// ---- 花: 芽に書いた考えが、本人の中で形になったら咲かせる ----

/** 花を咲かせる。芽の文がある芽だけ。理由は任意で、数や期限の条件はない。 */
export const bloomSeed = (args: { commandId: string; seedId: string; note: string; now: string }): GardenCommand => ({
  id: args.commandId,
  apply: (store) => {
    const seed = findSeed(store, args.seedId);
    if (!isLive(seed)) return { rejected: 'missing_seed' };
    if (!seed.synthesis || seed.growthState !== 'sprout') return { rejected: 'not_a_sprout' };
    const note = args.note.trim();
    const next: Seed = { ...seed, growthState: 'tree', bloom: { ...(note ? { note } : {}), bloomedAt: args.now } };
    return { ...store, seeds: store.seeds.map((item) => (item.id === seed.id ? next : item)) };
  },
});

/** 花を芽に戻す。咲いたときの理由は残し、次に咲かせるときの書き出しにする。 */
export const returnToSprout = (args: { commandId: string; seedId: string }): GardenCommand => ({
  id: args.commandId,
  apply: (store) => {
    const seed = findSeed(store, args.seedId);
    if (!isLive(seed)) return { rejected: 'missing_seed' };
    if (seed.growthState !== 'tree') return store;
    return { ...store, seeds: store.seeds.map((item) => (item.id === seed.id ? { ...item, growthState: 'sprout' } : item)) };
  },
});

/** 保管する／保管から戻す。戻すと、保管する前の育ち方になる。 */
export const setArchived = (args: { commandId: string; seedId: string; archived: boolean }): GardenCommand => ({
  id: args.commandId,
  apply: (store) => {
    const seed = findSeed(store, args.seedId);
    if (!isLive(seed)) return { rejected: 'missing_seed' };
    if ((seed.growthState === 'archived') === args.archived) return store;
    const { archivedFrom, ...rest } = seed;
    const next: Seed = args.archived
      ? { ...rest, growthState: 'archived', archivedFrom: seed.growthState }
      : { ...rest, growthState: archivedFrom ?? 'seed' };
    return { ...store, seeds: store.seeds.map((item) => (item.id === seed.id ? next : item)) };
  },
});

/**
 * 芽を保存した直後の「元に戻す」。以前の育ち方と芽へ戻し、書いた新しい文章は下書きとして残す。
 * 保存したあとに別の見直しが入っていれば、巻き戻さず拒否する。
 */
export const undoPromotion = (args: {
  commandId: string;
  seedId: string;
  /** 保存した芽（これと一致するときだけ戻す）。 */
  savedSynthesisId: string;
  savedSynthesisUpdatedAt: string;
  /** 保存した直後の育ち方。その後に本人が変えていたら戻さない。 */
  savedGrowthState: Seed['growthState'];
  previous: { growthState: Seed['growthState']; synthesis?: SeedSynthesis };
  /** 戻したあとに残す、書いた文章の下書き。 */
  keepDraft?: Draft;
}): GardenCommand => ({
  id: args.commandId,
  apply: (store) => {
    const seed = findSeed(store, args.seedId);
    if (!seed) return { rejected: 'missing_seed' };
    if (
      !seed.synthesis ||
      seed.synthesis.id !== args.savedSynthesisId ||
      seed.synthesis.updatedAt !== args.savedSynthesisUpdatedAt ||
      seed.growthState !== args.savedGrowthState ||
      // 保存のあとに書き始めた芽の下書きがあれば、それと取り違えないよう戻さない。
      store.drafts.some((draft) => draft.kind === 'synthesis' && draft.targetSeedId === seed.id)
    ) {
      return { rejected: 'changed_since_save' };
    }
    const { synthesis: _current, ...rest } = seed;
    const restored: Seed = { ...rest, growthState: args.previous.growthState, ...(args.previous.synthesis ? { synthesis: args.previous.synthesis } : {}) };
    const drafts = args.keepDraft ? [...store.drafts.filter((d) => d.id !== args.keepDraft?.id), args.keepDraft] : store.drafts;
    return { ...store, drafts, seeds: store.seeds.map((item) => (item.id === seed.id ? restored : item)) };
  },
});

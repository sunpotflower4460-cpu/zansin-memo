import type { GardenCommand } from '../data/gardenWriter';
import { connectionId, makeConnection } from '../data/gardenModel';
import type { GardenStoreV2, Seed, SeedCreateInput, SeedUpdateInput, TransformOutput } from './types';
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

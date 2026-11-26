import {
  type Draft,
  type DraftKind,
  type GardenStoreV2,
  type GrowthState,
  type Importance,
  type LegacySeedV1,
  type Mood,
  type Seed,
  type SeedConnection,
  type SeedSynthesis,
  type SynthesisSource,
  type TransformOutput,
  type TransformType,
  SEED_SCHEMA_VERSION,
} from '../domain/types';

// 保存データの意味づけ（正規化・移行・一意性）。画面にも保存先にも依存しない純粋な処理。
// 契約: docs/core-growth-data.md

export const STORE_VERSION = 2;
export const RECOVERY_BODY_FALLBACK = '（復元できなかった種）';

const GROWTH_STATES: GrowthState[] = ['seed', 'sprout', 'tree', 'archived'];
const MOODS: Mood[] = ['calm', 'excited', 'uncertain', 'heavy', 'bright'];
const TRANSFORM_TYPES: TransformType[] = ['question', 'task', 'article', 'project'];
const IMPORTANCE_VALUES = [1, 2, 3, 4, 5] as const;
const DRAFT_KINDS: DraftKind[] = ['new', 'edit-body', 'add-memo', 'synthesis'];

export const emptyStore = (): GardenStoreV2 => ({
  storeVersion: STORE_VERSION,
  revision: 0,
  seeds: [],
  connections: [],
  drafts: [],
});

// ---- つながりの正規化 ----

/** 同じ二者は、どちらから結んでも同じペアになる。 */
export const normalizePair = (a: string, b: string): [string, string] => (a <= b ? [a, b] : [b, a]);

/** 区切り文字の連結ではなく、正規化したペアの JSON から作る。ID に何が含まれても衝突しない。 */
export const connectionId = (a: string, b: string): string => JSON.stringify(normalizePair(a, b));

export const makeConnection = (
  a: string,
  b: string,
  origin: SeedConnection['origin'],
  createdAt?: string,
  note?: string,
): SeedConnection => {
  const [aSeedId, bSeedId] = normalizePair(a, b);
  const connection: SeedConnection = { id: connectionId(a, b), aSeedId, bSeedId, origin };
  if (createdAt) {
    connection.createdAt = createdAt;
  }
  if (note) {
    connection.note = note;
  }
  return connection;
};

/** 既存画面向けの読取用。Connection から導出するだけで、第二の正本としては保存しない。 */
export const deriveRelatedIds = (connections: SeedConnection[]): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    const list = map.get(from);
    if (list) {
      list.push(to);
    } else {
      map.set(from, [to]);
    }
  };
  for (const connection of connections) {
    add(connection.aSeedId, connection.bSeedId);
    add(connection.bSeedId, connection.aSeedId);
  }
  return map;
};

// ---- 値の取り出し ----

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const isValidIso = (value: string): boolean => !Number.isNaN(new Date(value).getTime());
const normalizeDate = (value: unknown, fallback: string): string => {
  const raw = asString(value);
  return raw && isValidIso(raw) ? new Date(raw).toISOString() : fallback;
};
const optionalDate = (value: unknown): string | undefined => {
  const raw = asString(value);
  return raw && isValidIso(raw) ? new Date(raw).toISOString() : undefined;
};
const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)))
    : [];

const normalizeTransformOutputs = (value: unknown, fallbackDate: string): TransformOutput[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const outputs: TransformOutput[] = [];
  value.forEach((item, index) => {
    const data = asObject(item);
    const type = asString(data?.type);
    const content = asString(data?.content)?.trim();
    if (!data || !type || !TRANSFORM_TYPES.includes(type as TransformType) || !content) {
      return;
    }
    outputs.push({
      id: asString(data.id)?.trim() || `transform-${index}`,
      type: type as TransformType,
      content,
      createdAt: normalizeDate(data.createdAt, fallbackDate),
    });
  });
  return outputs;
};

const normalizeSource = (value: unknown): SynthesisSource | undefined => {
  const data = asObject(value);
  const seedId = asString(data?.seedId)?.trim();
  const sourcePart = asString(data?.sourcePart);
  const textSnapshot = asString(data?.textSnapshot);
  const sourceUpdatedAt = optionalDate(data?.sourceUpdatedAt);
  if (!data || !seedId || (sourcePart !== 'body' && sourcePart !== 'synthesis') || textSnapshot === undefined || !sourceUpdatedAt) {
    return undefined;
  }
  const sourceSynthesisId = asString(data.sourceSynthesisId)?.trim();
  if (sourcePart === 'synthesis' && !sourceSynthesisId) {
    return undefined;
  }
  const source: SynthesisSource = { seedId, sourcePart, textSnapshot, sourceUpdatedAt };
  const titleSnapshot = asString(data.titleSnapshot);
  if (titleSnapshot) {
    source.titleSnapshot = titleSnapshot;
  }
  if (sourceSynthesisId) {
    source.sourceSynthesisId = sourceSynthesisId;
  }
  return source;
};

const normalizeSynthesis = (value: unknown, fallbackDate: string): SeedSynthesis | undefined => {
  const data = asObject(value);
  const statement = asString(data?.statement)?.trim();
  const id = asString(data?.id)?.trim();
  if (!data || !statement || !id) {
    return undefined;
  }
  // 材料の一意キーは (seedId, sourcePart)。
  const seen = new Set<string>();
  const sources: SynthesisSource[] = [];
  for (const raw of Array.isArray(data.sources) ? data.sources : []) {
    const source = normalizeSource(raw);
    const key = source ? `${source.seedId}\u0000${source.sourcePart}` : undefined;
    if (source && key && !seen.has(key)) {
      seen.add(key);
      sources.push(source);
    }
  }
  const createdAt = normalizeDate(data.createdAt, fallbackDate);
  return {
    id,
    statement,
    sources,
    createdAt,
    updatedAt: normalizeDate(data.updatedAt, createdAt),
    promotedAt: normalizeDate(data.promotedAt, createdAt),
  };
};

type CommonSeedFields = Omit<Seed, 'synthesis' | 'schemaVersion'>;

const normalizeCommonFields = (data: Record<string, unknown>, id: string): CommonSeedFields => {
  const now = new Date().toISOString();
  const createdAt = normalizeDate(data.createdAt, now);
  const updatedAt = normalizeDate(data.updatedAt, createdAt);
  const importanceValue = typeof data.importance === 'number' ? (Math.round(data.importance) as Importance) : 3;
  const growthState = asString(data.growthState);
  const mood = asString(data.mood);
  return {
    id,
    title: asString(data.title)?.trim() || undefined,
    body: asString(data.body)?.trim() || RECOVERY_BODY_FALLBACK,
    createdAt,
    updatedAt,
    mood: mood && MOODS.includes(mood as Mood) ? (mood as Mood) : undefined,
    importance: IMPORTANCE_VALUES.includes(importanceValue as (typeof IMPORTANCE_VALUES)[number]) ? importanceValue : 3,
    growthState: growthState && GROWTH_STATES.includes(growthState as GrowthState) ? (growthState as GrowthState) : 'seed',
    tags: normalizeStringArray(data.tags),
    resurfacingScore:
      typeof data.resurfacingScore === 'number' && Number.isFinite(data.resurfacingScore) ? data.resurfacingScore : undefined,
    lastResurfacedAt: optionalDate(data.lastResurfacedAt),
    deletedAt: optionalDate(data.deletedAt),
    transformOutputs: normalizeTransformOutputs(data.transformOutputs, updatedAt),
  };
};

export const normalizeSeedV2 = (value: unknown, fallbackId: string): Seed | undefined => {
  const data = asObject(value);
  if (!data) {
    return undefined;
  }
  const common = normalizeCommonFields(data, asString(data.id)?.trim() || fallbackId);
  const synthesis = normalizeSynthesis(data.synthesis, common.updatedAt);
  const seed: Seed = { ...common, schemaVersion: SEED_SCHEMA_VERSION };
  if (synthesis) {
    seed.synthesis = synthesis;
  }
  return seed;
};

export const normalizeDraft = (value: unknown): Draft | undefined => {
  const data = asObject(value);
  const id = asString(data?.id)?.trim();
  const kind = asString(data?.kind);
  if (!data || !id || !kind || !DRAFT_KINDS.includes(kind as DraftKind)) {
    return undefined;
  }
  const mood = asString(data.mood);
  const growthState = asString(data.growthState);
  const importance = typeof data.importance === 'number' ? (Math.round(data.importance) as Importance) : undefined;
  const materials = Array.isArray(data.materials)
    ? data.materials.flatMap((item) => {
        const m = asObject(item);
        const seedId = asString(m?.seedId)?.trim();
        const part = asString(m?.sourcePart);
        return seedId && (part === 'body' || part === 'synthesis') ? [{ seedId, sourcePart: part as 'body' | 'synthesis' }] : [];
      })
    : undefined;
  const draft: Draft = {
    id,
    kind: kind as DraftKind,
    body: asString(data.body) ?? '',
    updatedAt: normalizeDate(data.updatedAt, new Date(0).toISOString()),
  };
  const targetSeedId = asString(data.targetSeedId)?.trim();
  if (targetSeedId) draft.targetSeedId = targetSeedId;
  const plannedId = asString(data.plannedId)?.trim();
  if (plannedId) draft.plannedId = plannedId;
  const title = asString(data.title);
  // 空文字は「消した」という入力。捨てると、再開時に元の題名やカテゴリが戻ってしまう。
  if (title !== undefined) draft.title = title;
  const tags = asString(data.tags);
  if (tags !== undefined) draft.tags = tags;
  if (mood && MOODS.includes(mood as Mood)) draft.mood = mood as Mood;
  if (growthState && GROWTH_STATES.includes(growthState as GrowthState)) draft.growthState = growthState as GrowthState;
  if (importance && IMPORTANCE_VALUES.includes(importance as (typeof IMPORTANCE_VALUES)[number])) draft.importance = importance;
  if (materials) draft.materials = materials;
  const baseBody = asString(data.baseBody);
  if (baseBody !== undefined) draft.baseBody = baseBody;
  if (data.standalone === true) draft.standalone = true;
  if (data.reselect === true) draft.reselect = true;
  return draft;
};

const normalizeConnection = (value: unknown, seedIds: Set<string>): SeedConnection | undefined => {
  const data = asObject(value);
  const a = asString(data?.aSeedId)?.trim();
  const b = asString(data?.bSeedId)?.trim();
  if (!data || !a || !b || a === b || !seedIds.has(a) || !seedIds.has(b)) {
    return undefined;
  }
  const origin = data.origin === 'legacy' ? 'legacy' : 'manual';
  return makeConnection(a, b, origin, optionalDate(data.createdAt), asString(data.note)?.trim() || undefined);
};

// ---- v2 の読込 ----

export type StoreParseResult =
  | { ok: true; store: GardenStoreV2; droppedConnections: number }
  | { ok: false; reason: 'invalid_json' | 'invalid_shape' | 'unsupported_version' | 'duplicate_ids' };

export const parseStoreV2 = (raw: string): StoreParseResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  const data = asObject(parsed);
  if (!data || typeof data.storeVersion !== 'number') {
    return { ok: false, reason: 'invalid_shape' };
  }
  // 未知の新しい版は、今のコードで解釈して書き戻さない。
  if (data.storeVersion !== STORE_VERSION) {
    return { ok: false, reason: 'unsupported_version' };
  }
  if (!Array.isArray(data.seeds) || !Array.isArray(data.connections)) {
    return { ok: false, reason: 'invalid_shape' };
  }

  const seeds: Seed[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < data.seeds.length; index += 1) {
    const seed = normalizeSeedV2(data.seeds[index], `v2-missing-id-${index}`);
    if (!seed) {
      return { ok: false, reason: 'invalid_shape' };
    }
    if (ids.has(seed.id)) {
      return { ok: false, reason: 'duplicate_ids' };
    }
    ids.add(seed.id);
    seeds.push(seed);
  }

  const connections = new Map<string, SeedConnection>();
  let dropped = 0;
  for (const raw of data.connections) {
    const connection = normalizeConnection(raw, ids);
    if (!connection) {
      dropped += 1;
    } else if (!connections.has(connection.id)) {
      connections.set(connection.id, connection);
    }
  }

  const drafts = (Array.isArray(data.drafts) ? data.drafts : [])
    .map(normalizeDraft)
    .filter((draft): draft is Draft => Boolean(draft));

  return {
    ok: true,
    droppedConnections: dropped,
    store: {
      storeVersion: STORE_VERSION,
      revision: typeof data.revision === 'number' && Number.isFinite(data.revision) && data.revision >= 0 ? Math.floor(data.revision) : 0,
      lastMutationId: asString(data.lastMutationId),
      seeds,
      connections: Array.from(connections.values()),
      drafts,
    },
  };
};

export const serializeStore = (store: GardenStoreV2): string => JSON.stringify(store);

// ---- v1 からの移行 ----

export type MigrationReport = {
  seedCount: number;
  legacyConnectionCount: number;
  /** 自己参照・存在しない相手への参照など、可視のつながりにしなかった数。原本は消さずに残る。 */
  skippedReferences: number;
  skippedNonObjectEntries: number;
};

export type MigrationResult =
  | { ok: true; store: GardenStoreV2; report: MigrationReport }
  | { ok: false; reason: 'invalid_json' | 'not_array' | 'duplicate_ids' | 'unknown_schema' };

/**
 * v1（Seed の配列）から v2 へ。原文・状態・変換結果・日付・削除状態を引き継ぐ。
 * 関連は、どちら側にだけ記録されていても同じ無向ペアにまとめる。芽の文章や接続日時は作らない。
 */
export const migrateV1 = (raw: string): MigrationResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, reason: 'not_array' };
  }

  const seeds: Seed[] = [];
  const legacyRefs: Array<{ from: string; to: string }> = [];
  const ids = new Set<string>();
  let skippedNonObjectEntries = 0;

  for (let index = 0; index < parsed.length; index += 1) {
    const data = asObject(parsed[index]);
    if (!data) {
      skippedNonObjectEntries += 1;
      continue;
    }
    // 未来の版の Seed を、今の正規化に通して情報を落とさない。
    if (typeof data.schemaVersion === 'number' && data.schemaVersion > 1) {
      return { ok: false, reason: 'unknown_schema' };
    }
    const id = asString(data.id)?.trim() || `legacy-missing-id-${index}`;
    if (ids.has(id)) {
      return { ok: false, reason: 'duplicate_ids' };
    }
    ids.add(id);
    seeds.push({ ...normalizeCommonFields(data, id), schemaVersion: SEED_SCHEMA_VERSION });

    const legacy = data as Partial<LegacySeedV1>;
    for (const target of normalizeStringArray(legacy.relatedSeedIds)) {
      legacyRefs.push({ from: id, to: target });
    }
    const continued = asString(legacy.continuedFromId)?.trim();
    if (continued) {
      legacyRefs.push({ from: id, to: continued });
    }
  }

  const connections = new Map<string, SeedConnection>();
  let skippedReferences = 0;
  for (const { from, to } of legacyRefs) {
    if (from === to || !ids.has(to)) {
      skippedReferences += 1;
      continue;
    }
    const id = connectionId(from, to);
    if (!connections.has(id)) {
      connections.set(id, makeConnection(from, to, 'legacy'));
    }
  }

  const sorted = Array.from(connections.values()).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return {
    ok: true,
    store: { storeVersion: STORE_VERSION, revision: 0, seeds, connections: sorted, drafts: [] },
    report: {
      seedCount: seeds.length,
      legacyConnectionCount: sorted.length,
      skippedReferences,
      skippedNonObjectEntries,
    },
  };
};

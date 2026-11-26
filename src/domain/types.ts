export type GrowthState = 'seed' | 'sprout' | 'tree' | 'archived';

export type Mood = 'calm' | 'excited' | 'uncertain' | 'heavy' | 'bright';

export type Importance = 1 | 2 | 3 | 4 | 5;

export type TransformType = 'question' | 'task' | 'article' | 'project';

export type TransformOutput = {
  id: string;
  type: TransformType;
  content: string;
  createdAt: string;
};

// ---- つながり・芽（Phase 10。docs/core-growth-data.md） ----

/** 二つのメモの無向のつながり。同じ二者には1件だけ。親子・方向・栄養の種別は持たない。 */
export type SeedConnection = {
  /** 正規化したペア（昇順の id 配列を JSON にしたもの）から決める。衝突しない。 */
  id: string;
  aSeedId: string;
  bSeedId: string;
  /** manual: 本人が結んだ。legacy: 以前のバージョンの「関連」から移行した。 */
  origin: 'manual' | 'legacy';
  /** legacy の作成日時は不明なので持たない（移行日を作成日にしない）。 */
  createdAt?: string;
  /** 本人が任意で書く「つながりを感じたこと」。 */
  note?: string;
};

/** 芽をまとめるときに本人が実際に読んだ材料の文章。 */
export type SynthesisSource = {
  seedId: string;
  sourcePart: 'body' | 'synthesis';
  /** 採用時に読んだ文章そのもの。材料の材料を再帰的に複製しない。 */
  textSnapshot: string;
  titleSnapshot?: string;
  sourceUpdatedAt: string;
  /** sourcePart が synthesis のときは必須。 */
  sourceSynthesisId?: string;
};

/** 元の本文とは別に保存する、本人の「なら、こうできそう」。 */
export type SeedSynthesis = {
  id: string;
  statement: string;
  sources: SynthesisSource[];
  createdAt: string;
  updatedAt: string;
  /** 本人が芽として採用した時刻。芽の文を直しただけでは更新しない。 */
  promotedAt: string;
};

export type Seed = {
  id: string;
  title?: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  mood?: Mood;
  importance: Importance;
  growthState: GrowthState;
  tags: string[];
  resurfacingScore?: number;
  lastResurfacedAt?: string;
  deletedAt?: string;
  transformOutputs?: TransformOutput[];
  /** 現在の芽（1件）。growthState を sprout/tree にしただけでは作らない。 */
  synthesis?: SeedSynthesis;
  schemaVersion: number;
};

/** v1（以前の保存形式）の Seed。移行のときだけ読む。 */
export type LegacySeedV1 = Omit<Seed, 'synthesis'> & {
  relatedSeedIds: string[];
  continuedFromId?: string;
};

export type DraftKind = 'new' | 'edit-body' | 'add-memo' | 'synthesis';

/** 入力途中の内容。保存・昇格の確定と同じ更新で消す。 */
export type Draft = {
  id: string;
  kind: DraftKind;
  /** edit-body / add-memo / synthesis の対象（中心）となる Seed。 */
  targetSeedId?: string;
  /** 新規メモ・芽の予定ID。復元や再試行で作り直さない。 */
  plannedId?: string;
  body: string;
  title?: string;
  tags?: string;
  mood?: Mood;
  growthState?: GrowthState;
  importance?: Importance;
  /** synthesis: 本人が選んだ材料（seedId と sourcePart だけ。文章は確定時に作る）。 */
  materials?: Array<{ seedId: string; sourcePart: 'body' | 'synthesis' }>;
  /** edit-body: 編集を始めたときの本文。別の更新が先に入ったかを判定する。 */
  baseBody?: string;
  /** add-memo: 単独で残すに切り替えたか。 */
  standalone?: boolean;
  updatedAt: string;
};

export type GardenStoreV2 = {
  storeVersion: 2;
  revision: number;
  lastMutationId?: string;
  seeds: Seed[];
  connections: SeedConnection[];
  drafts: Draft[];
};

export type SeedCreateInput = {
  body: string;
  title?: string;
  mood?: Mood;
  importance?: Importance;
  growthState?: GrowthState;
  tags?: string[];
};

export type SeedUpdateInput = Partial<Omit<Seed, 'id' | 'createdAt' | 'schemaVersion'>>;

export type ResurfacedSeed = {
  seed: Seed;
  reason: string;
};

// 書く画面の入力途中の内容。保存前でも、アプリを閉じて戻ったときに失われないよう端末内に退避する。
export type WriteDraft = {
  title: string;
  body: string;
  tags: string;
  mood?: Mood;
  growthState: GrowthState;
  importance: Importance;
};

export const MOOD_OPTIONS: Mood[] = ['calm', 'excited', 'uncertain', 'heavy', 'bright'];
export const GROWTH_STATE_OPTIONS: GrowthState[] = ['seed', 'sprout', 'tree', 'archived'];
export const TRANSFORM_TYPES: TransformType[] = ['question', 'task', 'article', 'project'];
export const IMPORTANCE_OPTIONS: Importance[] = [1, 2, 3, 4, 5];

export const SEED_SCHEMA_VERSION = 2;

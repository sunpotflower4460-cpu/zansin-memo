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
  relatedSeedIds: string[];
  resurfacingScore?: number;
  lastResurfacedAt?: string;
  transformOutputs?: TransformOutput[];
  schemaVersion: number;
};

export type SeedCreateInput = {
  body: string;
  title?: string;
  mood?: Mood;
  importance?: Importance;
  growthState?: GrowthState;
  tags?: string[];
  relatedSeedIds?: string[];
};

export type SeedUpdateInput = Partial<Omit<Seed, 'id' | 'createdAt' | 'schemaVersion'>>;

export type ResurfacedSeed = {
  seed: Seed;
  reason: string;
};

export const MOOD_OPTIONS: Mood[] = ['calm', 'excited', 'uncertain', 'heavy', 'bright'];
export const GROWTH_STATE_OPTIONS: GrowthState[] = ['seed', 'sprout', 'tree', 'archived'];
export const TRANSFORM_TYPES: TransformType[] = ['question', 'task', 'article', 'project'];
export const IMPORTANCE_OPTIONS: Importance[] = [1, 2, 3, 4, 5];

export const SEED_SCHEMA_VERSION = 1;

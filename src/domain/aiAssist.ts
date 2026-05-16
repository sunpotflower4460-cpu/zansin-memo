import type { Seed, TransformType } from './types';

export type AiAssistSuggestion = {
  content: string;
  confidence?: number;
};

export interface AiAssistService {
  suggestTransform(seed: Seed, type: TransformType): Promise<AiAssistSuggestion | undefined>;
}

export class LocalOnlyAiAssistService implements AiAssistService {
  async suggestTransform(): Promise<undefined> {
    return undefined;
  }
}

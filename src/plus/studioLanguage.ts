import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type SemanticResult = { status: 'semantic' | 'assets' | 'unavailable'; scores: number[] };
const language = Platform.OS === 'ios' ? requireOptionalNativeModule<{
  canCraft?(): Promise<boolean>;
  craftIdea?(aim: string, excerpts: string[]): Promise<{ title: string; body: string } | null>;
  findSimilarities(center: string, notes: string[]): Promise<SemanticResult>;
  prepareModel(text: string): Promise<boolean>;
}>('KizashiLanguage') : null;

export async function compareSemantics(center: string, notes: string[]): Promise<SemanticResult> {
  const fallback = { status: 'unavailable', scores: [] } as const satisfies { status: 'unavailable'; scores: number[] };
  return language ? language.findSimilarities(center, notes).catch(() => fallback) : fallback;
}

export async function prepareSemanticModel(center: string): Promise<boolean> {
  return language?.prepareModel(center).catch(() => false) ?? false;
}

export async function localCraftAvailability(): Promise<boolean> {
  return language?.canCraft?.().catch(() => false) ?? false;
}

export async function generateLocalCraft(aim: string, excerpts: string[]) {
  const result = await language?.craftIdea?.(aim, excerpts);
  if (!result || typeof result.title !== 'string' || typeof result.body !== 'string' ||
      !result.title.trim() || !result.body.trim() || result.title.length > 160 || result.body.length > 2400) return undefined;
  return { title: result.title.trim(), body: result.body.trim() };
}

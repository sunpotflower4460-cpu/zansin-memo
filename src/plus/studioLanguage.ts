import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type SemanticResult = { status: 'semantic' | 'assets' | 'unavailable'; scores: number[] };
const language = Platform.OS === 'ios' ? requireOptionalNativeModule<{
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

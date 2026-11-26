import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GROWTH_STATE_OPTIONS,
  IMPORTANCE_OPTIONS,
  MOOD_OPTIONS,
  type GrowthState,
  type Importance,
  type Mood,
  type WriteDraft,
} from '../domain/types';

// 「kizashi-notes:」で始まるキーは「すべてのデータを削除」でまとめて消える。
const DRAFT_KEY = 'kizashi-notes:draft:v1';

export const EMPTY_WRITE_DRAFT: WriteDraft = {
  title: '',
  body: '',
  tags: '',
  mood: undefined,
  growthState: 'seed',
  importance: 3,
};

export const isEmptyDraft = (draft: WriteDraft): boolean =>
  draft.title.trim() === '' && draft.body.trim() === '' && draft.tags.trim() === '';

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

export const parseDraft = (raw: string): WriteDraft | undefined => {
  try {
    const data = JSON.parse(raw) as Record<string, unknown> | null;
    if (typeof data !== 'object' || data === null) {
      return undefined;
    }

    const mood = data.mood as Mood;
    const growthState = data.growthState as GrowthState;
    const importance = data.importance as Importance;

    return {
      title: asString(data.title),
      body: asString(data.body),
      tags: asString(data.tags),
      mood: MOOD_OPTIONS.includes(mood) ? mood : undefined,
      growthState: GROWTH_STATE_OPTIONS.includes(growthState) ? growthState : 'seed',
      importance: IMPORTANCE_OPTIONS.includes(importance) ? importance : 3,
    };
  } catch {
    return undefined;
  }
};

export const loadDraft = async (): Promise<WriteDraft | undefined> => {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    return raw ? parseDraft(raw) : undefined;
  } catch {
    return undefined;
  }
};

// 書きかけが空になったら退避も消す。失敗しても入力は止めない（最善努力）。
export const saveDraft = async (draft: WriteDraft): Promise<void> => {
  try {
    if (isEmptyDraft(draft)) {
      await AsyncStorage.removeItem(DRAFT_KEY);
      return;
    }
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Best-effort only.
  }
};

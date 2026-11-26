import AsyncStorage from '@react-native-async-storage/async-storage';
import { KEYS } from './gardenStorage';

// 「今回は見送る」で外した候補の組合せ（向きに依存しないペア）。画面設定で、メモの意味データではない。
// 手動の検索・接続は妨げない。「見送った候補を戻す」で解除できる。全データ削除の対象キーに含まれる。

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export const parseDismissed = (raw: string | null): Set<string> => {
  if (!raw) {
    return new Set();
  }
  try {
    const data: unknown = JSON.parse(raw);
    return new Set(Array.isArray(data) ? data.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
};

export const loadDismissed = async (storage: Storage = AsyncStorage): Promise<Set<string>> => {
  try {
    return parseDismissed(await storage.getItem(KEYS.dismissedSuggestions));
  } catch {
    return new Set();
  }
};

// 最善努力。保存できなくても、そのセッション中は見送りが効く。
export const saveDismissed = async (dismissed: Set<string>, storage: Storage = AsyncStorage): Promise<void> => {
  try {
    await storage.setItem(KEYS.dismissedSuggestions, JSON.stringify(Array.from(dismissed)));
  } catch {
    // Best-effort only.
  }
};

/** あるメモに関わる、見送り済みのペアのキー。 */
export const dismissedKeysFor = (dismissed: Set<string>, seedId: string): string[] =>
  Array.from(dismissed).filter((key) => {
    try {
      const pair: unknown = JSON.parse(key);
      return Array.isArray(pair) && pair.includes(seedId);
    } catch {
      return false;
    }
  });

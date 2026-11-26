import AsyncStorage from '@react-native-async-storage/async-storage';

// 「kizashi-notes:」で始まるキーは「すべてのデータを削除」でまとめて消える（そのあと最初の案内がもう一度出る）。
const ONBOARDING_KEY = 'kizashi-notes:onboarding:v1';

export const hasSeenOnboarding = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_KEY)) === 'seen';
  } catch {
    // 読めないときは案内を出さない（初回のたびに邪魔をしない）。
    return true;
  }
};

export const markOnboardingSeen = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'seen');
  } catch {
    // Best-effort only.
  }
};

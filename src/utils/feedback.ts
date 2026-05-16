import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export const triggerLightFeedback = () => {
  if (Platform.OS !== 'ios') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

export const triggerSuccessFeedback = () => {
  if (Platform.OS !== 'ios') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

export const triggerWarningFeedback = () => {
  if (Platform.OS !== 'ios') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
};

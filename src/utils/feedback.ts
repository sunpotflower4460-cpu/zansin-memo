import * as Haptics from 'expo-haptics';

export const triggerLightFeedback = () => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

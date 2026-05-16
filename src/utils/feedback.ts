import { Platform, Vibration } from 'react-native';

export const triggerLightFeedback = () => {
  Vibration.vibrate(Platform.OS === 'ios' ? 10 : 15);
};

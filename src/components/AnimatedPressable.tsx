import * as React from 'react';
import {
  Animated,
  type AccessibilityRole,
  type GestureResponderEvent,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { triggerLightFeedback } from '../utils/feedback';
import { motion } from '../utils/motion';

type AnimatedPressableProps = {
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  haptic?: 'none' | 'light';
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; expanded?: boolean; disabled?: boolean };
};

export function AnimatedPressable({
  children,
  onPress,
  onLongPress,
  style,
  pressedStyle,
  disabled,
  haptic = 'none',
  accessibilityRole,
  accessibilityLabel,
  accessibilityState,
}: AnimatedPressableProps) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = React.useState(false);

  const animateTo = React.useCallback(
    (toValue: number, duration: number) => {
      Animated.timing(scale, {
        toValue,
        duration,
        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  return (
    <Pressable
      disabled={disabled}
      onPress={(event) => {
        if (haptic === 'light' && !disabled) {
          triggerLightFeedback();
        }
        onPress?.(event);
      }}
      onLongPress={onLongPress}
      onPressIn={() => {
        setPressed(true);
        animateTo(motion.pressScale, motion.pressInMs);
      }}
      onPressOut={() => {
        setPressed(false);
        animateTo(1, motion.pressOutMs);
      }}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled: disabled ?? false }}
    >
      <Animated.View
        style={[style, pressed && pressedStyle, { transform: [{ scale }], opacity: pressed ? motion.pressOpacity : 1 }]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

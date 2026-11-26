import * as React from 'react';
import {
  Animated,
  type AccessibilityRole,
  type GestureResponderEvent,
  type Insets,
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
  /** タップ領域（Pressable本体）側に当てるスタイル。flex指定などで当たり判定を広げたいときに使う。 */
  containerStyle?: StyleProp<ViewStyle>;
  hitSlop?: number | Insets;
  pressedStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  haptic?: 'none' | 'light';
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: { selected?: boolean; expanded?: boolean; disabled?: boolean };
};

export function AnimatedPressable({
  children,
  onPress,
  onLongPress,
  style,
  containerStyle,
  hitSlop,
  pressedStyle,
  disabled,
  haptic = 'none',
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
}: AnimatedPressableProps) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = React.useState(false);
  const animatedStyle = React.useMemo(
    () => ({ transform: [{ scale }], opacity: pressed ? motion.pressOpacity : 1 }),
    [pressed, scale],
  );

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
      style={containerStyle}
      hitSlop={hitSlop}
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
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled: disabled ?? false }}
    >
      <Animated.View style={[style, animatedStyle, pressed && pressedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

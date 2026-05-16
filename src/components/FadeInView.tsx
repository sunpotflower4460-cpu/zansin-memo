import * as React from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from '../utils/motion';

type FadeInViewProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delayMs?: number;
};

export function FadeInView({ children, style, delayMs = 0 }: FadeInViewProps) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(motion.riseDistance)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.fadeInMs,
        delay: delayMs,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: motion.fadeInMs,
        delay: delayMs,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delayMs, opacity, translateY]);

  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}


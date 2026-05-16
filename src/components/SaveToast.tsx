import * as React from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { theme } from '../styles/theme';
import { motion } from '../utils/motion';

type SaveToastProps = {
  message: string;
};

export function SaveToast({ message }: SaveToastProps) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(8)).current;

  React.useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.fadeInMs,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: motion.fadeInMs,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [opacity, translateY, message]);

  return (
    <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }] }]} pointerEvents="none">
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    ...theme.shadows.floating,
  },
  text: {
    color: '#ffffff',
    fontSize: theme.typography.subbody,
    fontWeight: '600',
  },
});

import * as React from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { theme } from '../styles/theme';
import { motion } from '../utils/motion';

type SaveToastProps = {
  message: string;
  tone?: 'default' | 'error';
};

export function SaveToast({ message, tone = 'default' }: SaveToastProps) {
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
    <Animated.View style={[styles.toast, tone === 'error' ? styles.errorToast : styles.defaultToast, { opacity, transform: [{ translateY }] }]} pointerEvents="none">
      <Text style={[styles.text, tone === 'error' ? styles.errorText : styles.defaultText]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    ...theme.shadows.floating,
  },
  defaultToast: {
    backgroundColor: theme.colors.primary,
  },
  errorToast: {
    backgroundColor: theme.colors.dangerBg,
    borderWidth: 1,
    borderColor: theme.colors.dangerText,
  },
  text: {
    fontSize: theme.typography.subbody,
    fontWeight: '600',
  },
  defaultText: {
    color: '#ffffff',
  },
  errorText: {
    color: theme.colors.dangerText,
  },
});

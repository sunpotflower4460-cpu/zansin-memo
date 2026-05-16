import * as React from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { theme } from '../styles/theme';

type SaveToastProps = {
  message: string;
};

export function SaveToast({ message }: SaveToastProps) {
  const opacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();

    return () => {
      opacity.stopAnimation();
    };
  }, [opacity]);

  return (
    <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
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

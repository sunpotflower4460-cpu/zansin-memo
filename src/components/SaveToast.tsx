import * as React from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_CONTENT_HEIGHT, tabBarBottomPadding } from './AppTabBar';
import { theme } from '../styles/theme';
import { motion } from '../utils/motion';

type SaveToastProps = {
  message: string;
  tone?: 'default' | 'error';
  /** タブバーの上に重ならないよう、表示位置を持ち上げる。 */
  aboveTabBar?: boolean;
};

const TOAST_GAP = 12;

export function SaveToast({ message, tone = 'default', aboveTabBar = false }: SaveToastProps) {
  const insets = useSafeAreaInsets();
  const bottom = aboveTabBar
    ? TAB_BAR_CONTENT_HEIGHT + tabBarBottomPadding(insets.bottom) + TOAST_GAP
    : Math.max(insets.bottom, 12) + TOAST_GAP;
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
    // VoiceOver利用者にも結果が伝わるようにする。
    AccessibilityInfo.announceForAccessibility(message);

    return () => {
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [opacity, translateY, message]);

  return (
    <Animated.View
      style={[styles.toast, tone === 'error' ? styles.errorToast : styles.defaultToast, { bottom, opacity, transform: [{ translateY }] }]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.text, tone === 'error' ? styles.errorText : styles.defaultText]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '90%',
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
    textAlign: 'center',
    lineHeight: 20,
  },
  defaultText: {
    color: '#ffffff',
  },
  errorText: {
    color: theme.colors.dangerText,
  },
});

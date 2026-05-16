import * as React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../styles/theme';
import { motion } from '../utils/motion';

type AppLaunchIntroProps = {
  visible: boolean;
};

export function AppLaunchIntro({ visible }: AppLaunchIntroProps) {
  const opacity = React.useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [shouldRender, setShouldRender] = React.useState(visible);

  React.useEffect(() => {
    if (visible) {
      setShouldRender(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.fadeInMs,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(opacity, {
      toValue: 0,
      duration: motion.fadeOutMs,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShouldRender(false);
      }
    });
  }, [opacity, visible]);

  if (!shouldRender) {
    return null;
  }

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents={visible ? 'auto' : 'none'}>
      <View style={styles.iconWrap}>
        <Ionicons name="leaf-outline" size={24} color={theme.colors.primary} />
      </View>
      <Text style={styles.title}>Kizashi Notes</Text>
      <Text style={styles.subtitle}>ひとことを置いて、あとでゆっくり育てるためのノート</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: theme.typography.subbody,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
});

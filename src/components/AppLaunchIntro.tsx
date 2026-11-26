import * as React from 'react';
import { Animated, Image, StyleSheet, Text } from 'react-native';
// スプラッシュと同じ画像を使い、起動画面からそのままつながって見えるようにする。
import splashMark from '../../assets/splash-icon.png';
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
      <Image source={splashMark} style={styles.mark} accessibilityIgnoresInvertColors />
      <Text style={styles.title}>きざしノート</Text>
      <Text style={styles.titleEn}>Kizashi Notes</Text>
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
  mark: {
    width: 132,
    height: 132,
    marginBottom: theme.spacing.xs,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
    letterSpacing: 2,
  },
  titleEn: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSoft,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: theme.typography.subbody,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
});

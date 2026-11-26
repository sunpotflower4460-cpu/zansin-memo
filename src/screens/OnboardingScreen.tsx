import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { PrimaryButton } from '../components/PrimaryButton';
import { theme } from '../styles/theme';
import { stageImages } from '../utils/stageImages';

type OnboardingScreenProps = {
  /** 'write' は「最初の種をまく」、'home' は「あとで」「スキップ」。 */
  onFinish: (destination: 'write' | 'home') => void;
};

const PAGES = [
  {
    image: stageImages.seed,
    title: 'ひとことを、種として置く',
    body: '思いついたこと、ふと感じたこと。きれいにまとめなくて大丈夫です。\nタイトルも分類もいりません。',
  },
  {
    image: stageImages.sprout,
    title: '今日の種と、そっと再会する',
    body: 'しばらく見返していない種が、ホームに「今日の種」として現れます。\n通知はありません。見たいときに、見るだけで。',
  },
  {
    image: stageImages.tree,
    title: 'ゆっくり、芽から木へ',
    body: '種は「種 → 芽 → 木」と育てられます。\n同じ話の続きは「続きを書く」でつなげられ、庭にまとまりができていきます。急がなくて大丈夫です。',
  },
] as const;

export function OnboardingScreen({ onFinish }: OnboardingScreenProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = React.useRef<ScrollView>(null);
  const [page, setPage] = React.useState(0);
  const isLast = page === PAGES.length - 1;

  const goTo = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setPage(index);
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topRow}>
        {isLast ? null : (
          <AnimatedPressable
            onPress={() => onFinish('home')}
            style={styles.skip}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="案内をスキップする"
          >
            <Text style={styles.skipText}>スキップ</Text>
          </AnimatedPressable>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        style={styles.pager}
      >
        {PAGES.map((item, index) => (
          <View key={item.title} style={[styles.page, { width }]}>
            <View style={styles.art}>
              <View style={styles.sun} />
              <Image source={item.image} style={styles.image} accessibilityIgnoresInvertColors />
            </View>
            <Text style={styles.title} accessibilityRole="header">
              {item.title}
            </Text>
            <Text style={styles.body}>{item.body}</Text>
            {index === PAGES.length - 1 ? (
              <View style={styles.privacyRow}>
                <Ionicons name="lock-closed-outline" size={14} color={theme.colors.textSoft} />
                <Text style={styles.privacyText}>書いた種は、この端末の中だけに保存されます。</Text>
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.dots} accessible accessibilityLabel={`${page + 1}ページ目、全${PAGES.length}ページ`}>
          {PAGES.map((item, index) => (
            <View key={item.title} style={[styles.dot, index === page && styles.dotActive]} />
          ))}
        </View>
        {isLast ? (
          <View style={styles.actions}>
            <PrimaryButton label="最初の種をまく" onPress={() => onFinish('write')} />
            <AnimatedPressable
              onPress={() => onFinish('home')}
              style={styles.later}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel="あとで書く。ホームに進む"
            >
              <Text style={styles.laterText}>あとで</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <PrimaryButton label="つぎへ" onPress={() => goTo(page + 1)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: theme.colors.background,
  },
  topRow: {
    minHeight: 52,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  skip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  skipText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.body,
    fontWeight: '600',
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  art: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  sun: {
    position: 'absolute',
    top: 44,
    right: 30,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.accent,
    opacity: 0.9,
  },
  image: {
    width: 240,
    height: 240,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
    textAlign: 'center',
    lineHeight: 34,
  },
  body: {
    fontSize: theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 340,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.xs,
  },
  privacyText: {
    fontSize: 13,
    color: theme.colors.textSoft,
  },
  footer: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
  dotActive: {
    width: 22,
    backgroundColor: theme.colors.primary,
  },
  actions: {
    gap: theme.spacing.xs,
  },
  later: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.body,
    fontWeight: '600',
  },
});

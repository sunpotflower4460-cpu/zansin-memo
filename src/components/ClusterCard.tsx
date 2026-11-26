import { Image, StyleSheet, Text, View } from 'react-native';
import groveImage from '../../assets/cluster-grove.png';
import type { Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { toSeedSnippet } from '../utils/seedText';
import { formatRelativeDay } from '../utils/seedUtils';
import { stageImages } from '../utils/stageImages';
import { AnimatedPressable } from './AnimatedPressable';

const MAX_SHOWN = 5;

type ClusterCardProps = {
  members: Seed[];
  onOpenSeed: (seedId: string) => void;
};

// つながった種のまとまり（構想の「木」「森」）。根のような線で結ばれた種が並ぶ。
export function ClusterCard({ members, onOpenSeed }: ClusterCardProps) {
  const root = members[0];
  const shown = members.slice(0, MAX_SHOWN);
  const rest = members.length - shown.length;
  const latest = members.reduce((max, member) => (member.updatedAt > max ? member.updatedAt : max), members[0].updatedAt);

  return (
    <View style={styles.card} accessible={false}>
      <View style={styles.header}>
        <Image source={groveImage} style={styles.grove} accessibilityIgnoresInvertColors />
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>
            「{toSeedSnippet(root, 18)}」の話
          </Text>
          <Text style={styles.meta}>
            {members.length}つの種 ・ {formatRelativeDay(latest)}に動きました
          </Text>
        </View>
      </View>

      <View style={styles.vineWrap}>
        <View style={styles.vine} />
        <View style={styles.members}>
          {shown.map((member) => (
            <AnimatedPressable
              key={member.id}
              onPress={() => onOpenSeed(member.id)}
              containerStyle={styles.memberContainer}
              style={styles.member}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={`まとまりの種を開く。${toSeedSnippet(member)}`}
            >
              <Image source={stageImages[member.growthState]} style={styles.stage} accessibilityIgnoresInvertColors />
              <Text style={styles.memberText} numberOfLines={3}>
                {toSeedSnippet(member, 24)}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      </View>
      {rest > 0 ? <Text style={styles.rest}>ほか{rest}件</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.rule,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  grove: {
    width: 84,
    height: 52,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
  },
  meta: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.textMuted,
  },
  vineWrap: {
    justifyContent: 'flex-start',
  },
  vine: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 46,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#8a6a45', // 根のように結ぶ線
    opacity: 0.55,
  },
  members: {
    flexDirection: 'row',
    gap: 4,
  },
  memberContainer: {
    flex: 1,
  },
  member: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  stage: {
    width: 52,
    height: 52,
  },
  memberText: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.textMuted,
    textAlign: 'center',
    fontFamily: theme.fonts.serif,
  },
  rest: {
    fontSize: 13,
    color: theme.colors.textSoft,
    textAlign: 'right',
  },
});

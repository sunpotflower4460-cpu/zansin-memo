import { Image, StyleSheet, Text, View } from 'react-native';
import soilTexture from '../../assets/soil.png';
import type { GrowthState, Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { growthStateLabels } from '../utils/displayLabels';
import { stageImages } from '../utils/stageImages';
import { AnimatedPressable } from './AnimatedPressable';

const STATES: GrowthState[] = ['seed', 'sprout', 'tree', 'archived'];
const MAX_PLANTS = 5;

type FieldRowProps = {
  seeds: Seed[];
  onPress: () => void;
};

// 書いた種が、土の上に小さな芽や木として並ぶ。育つほどにっこり畑らしくなる。
export function FieldRow({ seeds, onPress }: FieldRowProps) {
  const counts = STATES.map((state) => ({ state, count: seeds.filter((seed) => seed.growthState === state).length }));
  const shown = [...seeds]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_PLANTS)
    .sort((a, b) => STATES.indexOf(a.growthState) - STATES.indexOf(b.growthState));
  const rest = seeds.length - shown.length;
  const summary = counts
    .filter(({ count }) => count > 0)
    .map(({ state, count }) => `${growthStateLabels[state]}${count}`)
    .join('　');

  return (
    <AnimatedPressable
      onPress={onPress}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={`あなたの畑。${summary}。庭を開く`}
    >
      <View style={styles.field}>
        <View style={styles.plants}>
          {shown.map((seed) => (
            <Image key={seed.id} source={stageImages[seed.growthState]} style={styles.plant} accessibilityIgnoresInvertColors />
          ))}
        </View>
        <View style={styles.soil}>
          <Image source={soilTexture} resizeMode="repeat" style={styles.soilImage} />
        </View>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summary}>{summary}</Text>
        {rest > 0 ? <Text style={styles.summary}>ほか{rest}件</Text> : null}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  soilImage: {
    width: '100%',
    height: '100%',
  },
  field: {
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: '#f1e4c3', // 朝の空の色
  },
  plants: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
    paddingTop: 6,
    marginBottom: -26,
    zIndex: 1,
  },
  plant: {
    width: 62,
    height: 62,
  },
  soil: {
    height: 38,
    backgroundColor: '#80603f',
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  summary: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
});

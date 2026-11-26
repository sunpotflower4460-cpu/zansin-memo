import * as React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { CENTER_H, CENTER_W, NODE_H, NODE_W, layoutMap } from '../utils/mapLayout';
import { toSeedSnippet } from '../utils/seedText';
import { stageImages } from '../utils/stageImages';
import { AnimatedPressable } from './AnimatedPressable';

// 中心のメモと、直接つながったメモだけを描く局所マップ（1-hop）。線は本人が結んだ関係だけで、
// A-B と B-C があっても A-C は描かない。位置は並べ方であって、親子や重要度ではない。

export const MAP_NEIGHBOR_LIMIT = 6;

type LocalMapProps = {
  center: Seed;
  /** 表示するつながり先（上限は呼び出し側で決める）。 */
  neighbors: Seed[];
  selectedId?: string;
  onSelect: (seedId: string) => void;
};

type Placed = { seed: Seed; x: number; y: number };

export function LocalMap({ center, neighbors, selectedId, onSelect }: LocalMapProps) {
  const [width, setWidth] = React.useState(320);
  const layout = React.useMemo(() => layoutMap(neighbors.length, width), [neighbors.length, width]);
  const placed = React.useMemo(
    () => layout.spots.map((spot) => ({ seed: neighbors[spot.index], x: spot.x, y: spot.y }) satisfies Placed),
    [layout, neighbors],
  );
  const cx = layout.center.x;
  const cy = layout.center.y;

  return (
    <View
      style={[styles.map, { height: layout.height }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible={false}
    >
      {placed.map(({ seed, x, y }) => {
        const dx = x - cx;
        const dy = y - cy;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const selected = seed.id === selectedId;
        return (
          <View
            key={`line-${seed.id}`}
            pointerEvents="none"
            style={[
              styles.line,
              selected && styles.lineSelected,
              { width: length, left: (cx + x) / 2 - length / 2, top: (cy + y) / 2 - 1, transform: [{ rotate: `${angle}rad` }] },
            ]}
          />
        );
      })}

      <View style={[styles.centerNode, { left: cx - CENTER_W / 2, top: cy - CENTER_H / 2 }]} accessible accessibilityLabel={`いま見ているメモ。${toSeedSnippet(center, 40)}`}>
        <Text style={styles.centerLabel}>いま見ているメモ</Text>
        <Text style={styles.centerText} numberOfLines={3}>
          {toSeedSnippet(center, 40)}
        </Text>
      </View>

      {placed.map(({ seed, x, y }) => {
        const selected = seed.id === selectedId;
        return (
          <AnimatedPressable
            key={seed.id}
            onPress={() => onSelect(seed.id)}
            containerStyle={[styles.nodeContainer, { left: x - NODE_W / 2, top: y - NODE_H / 2 }]}
            style={[styles.node, selected && styles.nodeSelected]}
            haptic="light"
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`つながっているメモ。${toSeedSnippet(seed, 40)}${selected ? '。選択中' : ''}`}
            accessibilityHint="タップで内容を確認します"
          >
            <Image source={stageImages[seed.growthState]} style={styles.nodeImage} accessibilityIgnoresInvertColors />
            <Text style={styles.nodeText} numberOfLines={3}>
              {toSeedSnippet(seed, 30)}
            </Text>
            {selected ? <Text style={styles.selectedMark}>選択中</Text> : null}
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.rule,
    overflow: 'hidden',
  },
  line: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.chipSelectedBorder,
  },
  lineSelected: {
    height: 4,
    backgroundColor: theme.colors.primary,
  },
  centerNode: {
    position: 'absolute',
    width: CENTER_W,
    height: CENTER_H,
    borderRadius: theme.radius.md,
    padding: 8,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    justifyContent: 'center',
    gap: 2,
  },
  centerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  centerText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
  },
  nodeContainer: {
    position: 'absolute',
    width: NODE_W,
    minHeight: NODE_H,
  },
  node: {
    minHeight: NODE_H,
    borderRadius: theme.radius.md,
    padding: 6,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 2,
  },
  nodeSelected: {
    borderColor: theme.colors.primary,
    borderWidth: 3,
    backgroundColor: theme.colors.primarySoft,
  },
  nodeImage: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 22,
    height: 22,
    opacity: 0.9,
  },
  nodeText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
    paddingRight: 18,
  },
  selectedMark: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.primary,
  },
});

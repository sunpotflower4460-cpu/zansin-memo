import type { RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WorkContent } from '../domain/plus/collection';
import { theme } from '../styles/theme';

export function paperMap(content: WorkContent, width: number, height: number) {
  const points = content.diagram?.nodes.map((node) => ({ ...node, ...content.diagram!.positions[node.seedId] })) ?? [];
  if (!points.length) return { points: [], crowded: false };
  const x = points.map((point) => point.x);
  const y = points.map((point) => point.y);
  const [minX, maxX, minY, maxY] = [Math.min(...x), Math.max(...x), Math.min(...y), Math.max(...y)];
  const labelWidth = Math.min(96, width / 3);
  const cells = Math.max(1, Math.floor((labelWidth - 10) / 12));
  const labelHeight = Math.max(44, ...points.map((point) => Math.ceil(Array.from(point.labelSnapshot).length / cells) * 15 + 10));
  const fitted = points.map((point) => ({ ...point,
    x: maxX > minX ? labelWidth / 2 + (point.x - minX) * (width - labelWidth) / (maxX - minX) : width / 2,
    y: maxY > minY ? labelHeight / 2 + (point.y - minY) * (height - labelHeight) / (maxY - minY) : height / 2,
  }));
  const crowded = fitted.some((point, i) => fitted.slice(i + 1).some((next) =>
    Math.abs(point.x - next.x) < labelWidth + 6 && Math.abs(point.y - next.y) < labelHeight + 6));
  return { points: fitted.map((point) => ({ ...point, labelHeight })), crowded: crowded || labelHeight > height };
}

export function PlusWorkPaper({ content, width, height, paperRef, onMeasure }: {
  content: WorkContent; width: number; height: number; paperRef: RefObject<View | null>; onMeasure: (used: number) => void;
}) {
  const margin = Math.round(width * 0.09);
  const chartHeight = Math.round(height * 0.30);
  const font = Math.max(16, Math.round(width * 0.051));
  const color = content.layout.paper === 'white' ? '#fffdf9' : '#fbf6e8';
  const paper = paperMap(content, width - margin * 2, chartHeight);
  const labels = new Map(paper.points.map((point) => [point.seedId, point]));
  const textAlign = content.layout.textAlign === 'center' ? 'center' as const : 'left' as const;
  const chart = content.diagram && <View style={{ gap: 5, marginVertical: 7 }}>
    <View style={{ height: chartHeight, position: 'relative' }}>
      {content.diagram.lines.map((edge) => {
        const a = labels.get(edge.aSeedId);
        const b = labels.get(edge.bSeedId);
        if (!a || !b) return null;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        return <View key={edge.id} style={[styles.line, { width: length, left: (a.x + b.x - length) / 2, top: (a.y + b.y) / 2,
          transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }]} />;
      })}
      {paper.points.map((point) => {
        const span = Math.min(96, (width - margin * 2) / 3);
        return <View key={point.seedId} style={[styles.node, { width: span, height: point.labelHeight, left: point.x - span / 2, top: point.y - point.labelHeight / 2, backgroundColor: color }]}>
          <Text style={styles.nodeText}>{point.labelSnapshot}</Text>
        </View>;
      })}
    </View>
    {content.diagram.nodes.length > 0 && <Text style={styles.citation}>実線は保存したときのつながり</Text>}
  </View>;
  return <View ref={paperRef} testID="work-paper" collapsable={false} style={[styles.paper, { width, height, padding: margin, backgroundColor: color }]}>
    <View style={styles.sheet} onLayout={(event) => onMeasure(event.nativeEvent.layout.height + margin * 2)}>
      {content.work.title && <Text style={[styles.title, { fontSize: font * 1.45, textAlign }]}>{content.work.title}</Text>}
      {content.layout.mapPosition === 'above' && chart}
      <Text style={[styles.body, { fontSize: font, lineHeight: font * 1.65, textAlign }]}>{content.work.textSnapshot}</Text>
      {content.layout.mapPosition === 'below' && chart}
      {content.layout.includeSources && content.materials.map((source) => <Text key={source.id} style={styles.citation}>
        {source.title ? `${source.title}\n` : ''}{source.text}
      </Text>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  paper: { alignSelf: 'center', overflow: 'hidden' },
  sheet: { gap: 12, flexShrink: 0 },
  title: { fontFamily: theme.fonts.serif, fontWeight: '600', color: theme.colors.text },
  body: { fontFamily: theme.fonts.serif, color: theme.colors.text, flexShrink: 0 },
  citation: { fontSize: 12, lineHeight: 18, color: theme.colors.textMuted },
  line: { position: 'absolute', height: 2, backgroundColor: theme.colors.primary },
  node: { position: 'absolute', minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, padding: 4, justifyContent: 'center' },
  nodeText: { fontFamily: theme.fonts.serif, fontSize: 12, lineHeight: 15, color: theme.colors.text, textAlign: 'center' },
});

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { GardenLetter } from '../utils/gardenLetter';
import { formatGardenLetterPeriod } from '../utils/gardenLetter';
import { theme } from '../styles/theme';
import { AnimatedPressable } from './AnimatedPressable';
import { SectionCard } from './SectionCard';

type GardenLetterCardProps = {
  letter: GardenLetter;
  onOpenGarden: () => void;
};

type MetricProps = {
  value: number;
  label: string;
};

function Metric({ value, label }: MetricProps) {
  return (
    <View style={styles.metric} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function GardenLetterCard({ letter, onOpenGarden }: GardenLetterCardProps) {
  return (
    <SectionCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
          </View>
          <View style={styles.titleTextWrap}>
            <Text style={styles.eyebrow}>この7日間</Text>
            <Text style={styles.title}>庭便り</Text>
          </View>
        </View>
        <Text style={styles.period}>{formatGardenLetterPeriod(letter)}</Text>
      </View>

      <View style={styles.metrics}>
        <Metric value={letter.newSeedCount} label="新しい種" />
        <Metric value={letter.tendedSeedCount} label="手入れ" />
        <Metric value={letter.transformCount} label="育てた形" />
      </View>

      <View style={styles.reflection}>
        {letter.leadingTheme ? (
          <View style={styles.themePill} accessible accessibilityLabel={`重なっているテーマ ${letter.leadingTheme.label}`}>
            <Ionicons name="git-branch-outline" size={14} color={theme.colors.primary} />
            <Text style={styles.themeText}>{letter.leadingTheme.label}</Text>
          </View>
        ) : null}
        <Text style={styles.reflectionText}>{letter.reflection}</Text>
      </View>

      <AnimatedPressable
        onPress={onOpenGarden}
        style={styles.openButton}
        pressedStyle={styles.openButtonPressed}
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel="庭を見渡す"
        accessibilityHint="種の育ち方とカテゴリのまとまりを開きます"
      >
        <Text style={styles.openButtonText}>庭を見渡す</Text>
        <Ionicons name="arrow-forward" size={15} color={theme.colors.primary} />
      </AnimatedPressable>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderTopWidth: 3,
    borderTopColor: '#8fb99a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexShrink: 1,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primarySoft,
  },
  titleTextWrap: {
    gap: 1,
  },
  eyebrow: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.sectionTitle,
    fontWeight: '700',
  },
  period: {
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'right',
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  metric: {
    minWidth: 82,
    flexGrow: 1,
    flexBasis: 0,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 10,
    gap: 2,
  },
  metricValue: {
    color: theme.colors.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  metricLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  reflection: {
    borderRadius: theme.radius.md,
    backgroundColor: '#f0f5ee',
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  themePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: theme.radius.full,
    backgroundColor: '#dceee1',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  themeText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  reflectionText: {
    color: theme.colors.text,
    fontSize: theme.typography.subbody,
    lineHeight: 21,
  },
  openButton: {
    minHeight: 44,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSoft,
  },
  openButtonPressed: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  openButtonText: {
    color: theme.colors.primary,
    fontSize: theme.typography.subbody,
    fontWeight: '600',
  },
});

import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ConnectionsPanel, type ConnectionsViewMode } from '../components/ConnectionsPanel';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import { SynthesisCard } from '../components/SynthesisCard';
import { connectSeeds, disconnectSeeds, promoteToSprout, setConnectionNote } from '../domain/gardenCommands';
import type { GardenCommand } from '../data/gardenWriter';
import { emptyStore } from '../data/gardenModel';
import type { Draft, GardenStoreV2, Seed } from '../domain/types';
import { SEED_SCHEMA_VERSION } from '../domain/types';
import { theme } from '../styles/theme';
import { toSeedSnippet } from '../utils/seedText';
import { SynthesisScreen } from './SynthesisScreen';

// 「例で使い方を見る」。実データとは完全に別の、メモリ上だけの領域で、
// 選ぶ → つながりを見る → 芽を書く、を実際の部品で触る。保存・検索・件数・書出し・庭便りには一切入らない。

const NOW = new Date(0).toISOString();
const sample = (id: string, body: string): Seed => ({
  id,
  body,
  createdAt: NOW,
  updatedAt: NOW,
  importance: 3,
  growthState: 'seed',
  tags: [],
  transformOutputs: [],
  schemaVersion: SEED_SCHEMA_VERSION,
});

const SAMPLE_SEEDS: Seed[] = [
  sample('practice-a', '散歩で撮った写真が、スマホにたまるばかり'),
  sample('practice-b', '写真に短い言葉を添えるのが好き'),
  sample('practice-c', '離れた友人と、近況を伝え合いたい'),
];
const EXAMPLE_STATEMENT = '写真3枚とひと言で、友人に送る近況便りが作れそう';

type Step = 'select' | 'connect' | 'sprout' | 'done';

type PracticeScreenProps = {
  onClose: () => void;
  onStartWriting: () => void;
};

export function PracticeScreen({ onClose, onStartWriting }: PracticeScreenProps) {
  const insets = useSafeAreaInsets();
  const [store, setStore] = React.useState<GardenStoreV2>(() => ({ ...emptyStore(), seeds: SAMPLE_SEEDS }));
  const [step, setStep] = React.useState<Step>('select');
  const [picked, setPicked] = React.useState<string[]>([]);
  const [centerId, setCenterId] = React.useState('practice-a');
  const [viewMode, setViewMode] = React.useState<ConnectionsViewMode>('map');
  const [synthesisOpen, setSynthesisOpen] = React.useState(false);
  /** 「あとで考える」で残す下書き。練習の中だけに持ち、保存しない。 */
  const [practiceDraft, setPracticeDraft] = React.useState<Draft | undefined>();

  const apply = (command: GardenCommand) =>
    setStore((current) => {
      const next = command.apply(current);
      return 'rejected' in next ? current : next;
    });
  const now = () => new Date().toISOString();
  const center = store.seeds.find((seed) => seed.id === centerId) ?? store.seeds[0];
  const byId = React.useMemo(() => new Map(store.seeds.map((seed) => [seed.id, seed])), [store.seeds]);

  const togglePick = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : current.length >= 2 ? current : [...current, id]));

  if (synthesisOpen) {
    return (
      <SynthesisScreen
        mode="new"
        center={center}
        seeds={store.seeds}
        connections={store.connections}
        saving={false}
        exampleStatement={EXAMPLE_STATEMENT}
        draft={practiceDraft?.targetSeedId === center.id ? practiceDraft : undefined}
        onDraftChange={(draft) => setPracticeDraft(draft ?? undefined)}
        onSave={async (input) => {
          apply(
            promoteToSprout({
              commandId: 'practice-sprout',
              centerId: center.id,
              synthesisId: input.synthesisId,
              statement: input.statement,
              centerBodyText: input.centerBodyText,
              materials: input.materials,
              now: now(),
            }),
          );
          setPracticeDraft(undefined);
          setSynthesisOpen(false);
          setStep('done');
          return true;
        }}
        onChangeCenter={setCenterId}
        onSwitchToReview={() => undefined}
        onPostpone={() => setSynthesisOpen(false)}
        onBack={() => setSynthesisOpen(false)}
      />
    );
  }

  const stepNumber = step === 'select' ? 1 : step === 'connect' ? 2 : 3;

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(48, insets.bottom + 32) }]} keyboardShouldPersistTaps="handled">
      <View style={styles.topRow}>
        <View style={styles.badge} accessible accessibilityLabel="これは練習用の例です。実際のメモではありません">
          <Ionicons name="school-outline" size={16} color={theme.colors.accent} />
          <Text style={styles.badgeText}>例（実際のメモではありません）</Text>
        </View>
        <AnimatedPressable onPress={onClose} style={styles.close} haptic="light" accessibilityRole="button" accessibilityLabel="例を閉じる">
          <Text style={styles.closeText}>とじる</Text>
        </AnimatedPressable>
      </View>

      <Text style={styles.heading} accessibilityRole="header">
        例で使い方を見る
      </Text>
      <Text style={styles.lead}>三つのメモを使って、「つなげる」→「つながりを見る」→「芽を書く」を触ってみましょう。ここで操作したことは、あなたのメモには入りません。</Text>

      {step !== 'done' ? <Text style={styles.stepLabel} accessibilityLiveRegion="polite">{`ステップ ${stepNumber} / 3`}</Text> : null}

      {step === 'select' ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>1. 関係がありそうな2つを選んで、つなげる</Text>
          <Text style={styles.note}>3つのメモから、2つを選んでください（どの2つでもかまいません）。</Text>
          {store.seeds.map((seed) => {
            const on = picked.includes(seed.id);
            return (
              <AnimatedPressable
                key={seed.id}
                onPress={() => togglePick(seed.id)}
                style={[styles.card, on && styles.cardOn]}
                haptic="light"
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${on ? '選択中' : '選んでいません'}。例のメモ。${toSeedSnippet(seed, 40)}`}
              >
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? theme.colors.primary : theme.colors.chipSelectedBorder} />
                <Text style={styles.cardText}>{seed.body}</Text>
              </AnimatedPressable>
            );
          })}
          <PrimaryButton
            label="2つをつなげる"
            disabled={picked.length !== 2}
            onPress={() => {
              apply(connectSeeds({ commandId: 'practice-connect', a: picked[0], b: picked[1], now: now() }));
              setCenterId(picked[0]);
              setStep('connect');
            }}
          />
        </SectionCard>
      ) : null}

      {step === 'connect' || step === 'sprout' ? (
        <>
          <SectionCard>
            <Text style={styles.sectionTitle}>2. つながりを見る</Text>
            <Text style={styles.note}>
              選んだ2つが、線で結ばれました。メモの内容は変わりません。「選んでつなぐ」から、残りのメモも結べます。
            </Text>
          </SectionCard>
          <ConnectionsPanel
            center={center}
            seeds={store.seeds}
            connections={store.connections}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            onOpenSeed={setCenterId}
            onLink={(otherId) => apply(connectSeeds({ commandId: `practice-link-${otherId}`, a: center.id, b: otherId, now: now() }))}
            onUnlink={(otherId) => apply(disconnectSeeds({ commandId: `practice-unlink-${otherId}-${store.revision}`, a: center.id, b: otherId }))}
            onSetNote={(otherId, note) => apply(setConnectionNote({ commandId: `practice-note-${otherId}-${note.length}`, a: center.id, b: otherId, note }))}
            onAddMemo={() => undefined}
            hideAddMemo
          />
          <SectionCard>
            <Text style={styles.sectionTitle}>3. できそうなことを、芽にする</Text>
            <Text style={styles.note}>メモを見ながら、「こうできそう」を一言。完成例も見られます。</Text>
            <PrimaryButton label="ここに書いて芽にする" onPress={() => setSynthesisOpen(true)} />
          </SectionCard>
        </>
      ) : null}

      {step === 'done' ? (
        <>
          <SectionCard>
            <View style={styles.doneTitle}>
              <Ionicons name="sparkles-outline" size={20} color={theme.colors.accent} />
              <Text style={styles.sectionTitle}>芽になりました（例）</Text>
            </View>
            <Text style={styles.note}>書いた考えは、あとから読み返せます。自分で「咲いた」と思えたら、花にできます。</Text>
          </SectionCard>
          <SynthesisCard seed={center} byId={byId} />
          <Text style={styles.closing}>数は決まっていません。できそうなことが見えた時に、芽にします。</Text>
          <PrimaryButton label="自分のメモを書く" onPress={onStartWriting} />
          <AnimatedPressable onPress={onClose} style={styles.later} haptic="light" accessibilityRole="button" accessibilityLabel="例を閉じる">
            <Text style={styles.laterText}>とじる</Text>
          </AnimatedPressable>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.lg, gap: theme.spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: theme.radius.full, backgroundColor: theme.colors.dangerBg, borderWidth: 1, borderColor: theme.colors.dangerBorder, flexShrink: 1 },
  badgeText: { fontSize: 13, fontWeight: '700', color: theme.colors.accent, flexShrink: 1 },
  close: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  closeText: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  heading: { fontSize: theme.typography.title, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  lead: { fontSize: 14, lineHeight: 22, color: theme.colors.textMuted },
  stepLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  sectionTitle: { fontSize: 17, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text, flexShrink: 1 },
  note: { fontSize: 13, lineHeight: 19, color: theme.colors.textMuted },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: theme.spacing.sm, minHeight: 56, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.rule },
  cardOn: { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary, borderWidth: 2 },
  cardText: { flex: 1, fontSize: 15, lineHeight: 23, fontFamily: theme.fonts.serif, color: theme.colors.text },
  doneTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  closing: { fontSize: 14, lineHeight: 21, color: theme.colors.textMuted, textAlign: 'center' },
  later: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontSize: 15, fontWeight: '600', color: theme.colors.textMuted },
});

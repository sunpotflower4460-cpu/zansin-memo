import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GardenV3Writer } from '../data/gardenV3Writer';
import type { MapIndex } from '../domain/plus/map';
import { adjacentMonth, calendarDate, monthDays, recordDays, saveReflection, type RecordEvent } from '../domain/plus/studio';
import { createId } from '../utils/ids';
import { getLocalDateKey } from '../utils/seedUtils';
import { PlusInput, buttonSelectionProps } from './PlusUI';
import { IconButton, StudioAction, StudioSegments, StudioTitle, studioColors, studioStyles, type StudioIcon } from './StudioUI';

const modes = [{ id: 'calendar', label: 'カレンダー' }, { id: 'timeline', label: '足あと' }] as const;
const weekdayNames = ['月', '火', '水', '木', '金', '土', '日'];
const eventTypes = {
  memo: { label: 'メモ', icon: 'document-text-outline' },
  connection: { label: 'つながり', icon: 'git-network-outline' },
  work: { label: '作品', icon: 'albums-outline' },
  reflection: { label: '振り返り', icon: 'book-outline' },
} satisfies Record<RecordEvent['kind'], { label: string; icon: StudioIcon }>;
const dateLabel = (key: string) => calendarDate(key).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
const basePageSize = 24;

function EventRows({ events, onRead, onWork, onReflect }: {
  events: RecordEvent[]; onRead: (seedId: string) => void; onWork: () => void; onReflect?: () => void;
}) {
  return events.map((event) => {
    const onPress = event.seedId ? () => onRead(event.seedId!) : event.kind === 'work' ? onWork : onReflect;
    const content = <>
      <View style={styles.eventIcon}><Ionicons name={eventTypes[event.kind].icon} color={studioColors.green} size={17} /></View>
      <View style={studioStyles.grow}><Text style={studioStyles.muted}>{eventTypes[event.kind].label}</Text>
        <Text style={studioStyles.text} numberOfLines={2}>{event.label}</Text></View>
      {onPress && <Ionicons name="chevron-forward" size={15} color={studioColors.muted} />}
    </>;
    return onPress ? <Pressable key={event.id} accessibilityRole="button" onPress={onPress} style={styles.event}>{content}</Pressable>
      : <View key={event.id} style={styles.event}>{content}</View>;
  });
}

export function StudioRecords({ writer, index, advanced, canCreateReflection, onRead, onWork, onWrite }: {
  writer: GardenV3Writer; index: MapIndex; advanced: boolean; canCreateReflection: () => boolean;
  onRead: (seedId: string) => void; onWork: () => void; onWrite: () => void;
}) {
  const store = React.useSyncExternalStore(writer.subscribe, writer.getSnapshot);
  const today = getLocalDateKey();
  const days = React.useMemo(() => recordDays(store, index.byId), [index.byId, store]);
  const sortedDays = React.useMemo(() => [...days.keys()].sort().reverse(), [days]);
  const [day, setDay] = React.useState(() => advanced ? today : store.reflections?.map((entry) => entry.day).sort().at(-1) ?? today);
  const [month, setMonth] = React.useState(day.slice(0, 7));
  const calendar = React.useMemo(() => monthDays(month), [month]);
  const calendarRows = Math.ceil((calendar.map(({ inMonth }) => inMonth).lastIndexOf(true) + 1) / 7);
  const [mode, setMode] = React.useState<'calendar' | 'timeline'>('calendar');
  const [limit, setLimit] = React.useState(basePageSize);
  const [drafts, setDrafts] = React.useState<Record<string, { body: string; base?: string }>>({});
  const [notice, setNotice] = React.useState<{ text: string; error: boolean }>();
  const [busy, setBusy] = React.useState(false);
  const working = React.useRef(false);
  const reflection = store.reflections?.find((entry) => entry.day === day);
  const draft = drafts[day];
  const body = draft?.body ?? reflection?.body ?? '';
  const canEdit = Boolean(reflection) || advanced;
  const events = (days.get(day) ?? []).filter(({ kind }) => kind !== 'reflection');
  const monthlyEvents = [...days.entries()].filter(([key]) => key.startsWith(month)).flatMap(([, entries]) => entries);
  const monthlyMemos = monthlyEvents.filter(({ kind }) => kind === 'memo').length;
  const monthlyConnections = monthlyEvents.filter(({ kind }) => kind === 'connection').length;
  const monthlyReflections = monthlyEvents.filter(({ kind }) => kind === 'reflection').length;

  function pick(next: string) {
    setDay(next); setMonth(next.slice(0, 7)); setLimit(basePageSize); setNotice(undefined);
  }

  function shiftMonth(offset: number) {
    const next = adjacentMonth(month, offset);
    const latest = sortedDays.find((key) => key.startsWith(next));
    pick(latest ?? `${next}-01`);
  }

  async function save() {
    if (working.current || !draft || (!reflection && !canCreateReflection())) return;
    working.current = true; setBusy(true); setNotice(undefined);
    const command = saveReflection(day, draft.body, draft.base, createId(), new Date().toISOString());
    try {
      const result = await writer.run({ ...command, apply: (store) => canCreateReflection() || store.reflections?.some((item) => item.day === day)
        ? command.apply(store) : { rejected: '新しい日の振り返りは Plus で書けます。' } });
      if (result.ok) {
        setDrafts((before) => {
          const next = { ...before };
          delete next[day];
          return next;
        });
      }
      setNotice(result.ok ? { text: draft.body.trim() ? '振り返りを保存しました' : '振り返りを削除しました', error: false }
        : { text: result.detail ?? '保存できませんでした。入力は残っています。', error: true });
    } finally { working.current = false; setBusy(false); }
  }

  return <ScrollView style={studioStyles.root} contentContainerStyle={studioStyles.content} keyboardShouldPersistTaps="handled">
    <StudioTitle title="記録" subtitle="日付からメモと、考えのつながりを振り返る">
      <IconButton label="メモを書く" icon="create-outline" onPress={onWrite} />
    </StudioTitle>
    {advanced && <StudioSegments label="記録の見方" items={modes} value={mode} onChange={(value) => { setMode(value); setLimit(basePageSize); }} />}
    {advanced && (mode === 'calendar' ? <View style={[studioStyles.card, styles.calendar]}>
      <View style={studioStyles.row}>
        <IconButton label="前の月" icon="chevron-back" onPress={() => shiftMonth(-1)} />
        <Text accessibilityRole="header" style={[studioStyles.subtitle, styles.month]}>{calendarDate(`${month}-01`).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })}</Text>
        <IconButton label="次の月" icon="chevron-forward" onPress={() => shiftMonth(1)} />
      </View>
      <View style={styles.summary}>
        <Text style={studioStyles.muted}>メモ {monthlyMemos}</Text>
        <Text style={studioStyles.muted}>つながり {monthlyConnections}</Text>
        <Text style={studioStyles.muted}>振り返り {monthlyReflections}</Text>
      </View>
      <View style={styles.week}>{weekdayNames.map((label) => <Text key={label} style={styles.weekLabel}>{label}</Text>)}</View>
      {Array.from({ length: calendarRows }, (_, row) => <View key={row} style={styles.week}>
        {calendar.slice(row * 7, row * 7 + 7).map((cell) => {
          const entries = days.get(cell.day) ?? [];
          const kinds = new Set(entries.map(({ kind }) => kind));
          const active = day === cell.day;
          return <Pressable key={cell.day} accessibilityRole="button" {...buttonSelectionProps(active)} testID={`record-day-${cell.day}`}
            accessibilityLabel={`${dateLabel(cell.day)}${cell.day === today ? '、今日' : ''}、記録${entries.length}件`}
            onPress={() => pick(cell.day)} style={[styles.day, active && styles.today, !cell.inMonth && !active && styles.dimmed]}>
            <Text style={[styles.dayNumber, active && styles.daySelected, cell.day === today && styles.todayNumber]}>{cell.number}</Text>
            <View style={styles.markers}>
              {kinds.has('memo') && <View style={[styles.marker, { backgroundColor: active ? '#fff6df' : studioColors.green }]} />}
              {kinds.has('connection') && <View style={[styles.marker, { backgroundColor: active ? '#f4c99f' : studioColors.orange }]} />}
              {(kinds.has('reflection') || kinds.has('work')) && <View style={[styles.marker, { backgroundColor: active ? '#d6c5f0' : '#625782' }]} />}
            </View>
          </Pressable>;
        })}
      </View>)}
      <View style={studioStyles.wrap}>
        {day !== today && <StudioAction label="今日に戻る" onPress={() => pick(today)} />}
        {!!sortedDays[0] && sortedDays[0] !== day && <StudioAction label="最新の記録" onPress={() => pick(sortedDays[0])} />}
      </View>
    </View> : <View style={studioStyles.card}>
      {sortedDays.length ? sortedDays.slice(0, limit).map((key) => <View key={key} style={styles.timelineDay}>
        <Pressable accessibilityRole="button" onPress={() => { pick(key); setMode('calendar'); }} style={styles.timelineDate}>
          <Text style={studioStyles.subtitle}>{dateLabel(key)}</Text><Ionicons name="chevron-forward" size={15} color={studioColors.muted} />
        </Pressable>
        <EventRows events={days.get(key)!.slice(0, 4)} onRead={onRead} onWork={onWork} onReflect={() => { pick(key); setMode('calendar'); }} />
        {days.get(key)!.length > 4 && <StudioAction label={`この日の記録をすべて見る · ${days.get(key)!.length}件`} onPress={() => { pick(key); setMode('calendar'); }} />}
      </View>) : <Text style={studioStyles.muted}>メモやつながりを残すと、ここから日付順に振り返れます。</Text>}
      {sortedDays.length > limit && <StudioAction label="以前の足あとを表示" onPress={() => setLimit(limit + basePageSize)} />}
    </View>)}
    {!advanced && <View style={studioStyles.card}>
      <Text accessibilityRole="header" style={studioStyles.subtitle}>保存した振り返り</Text>
      {(store.reflections ?? []).slice().sort((a, b) => b.day.localeCompare(a.day)).map((item) =>
        <StudioAction key={item.day} label={dateLabel(item.day)} onPress={() => pick(item.day)} />)}
    </View>}
    {canEdit && (mode === 'calendar' || !advanced) && <View style={studioStyles.card}>
      <Text accessibilityRole="header" style={studioStyles.subtitle}>{dateLabel(day)}の振り返り</Text>
      <PlusInput multiline accessibilityLabel="この日の振り返り" placeholder="気づいたことを、ひとこと" style={styles.editor} value={body}
        editable={!busy} onChangeText={(text) => setDrafts((before) => ({ ...before, [day]: { body: text, base: draft?.base ?? reflection?.updatedAt } }))} />
      <View style={studioStyles.wrap}>
        <StudioAction primary label="振り返りを保存" icon="checkmark" disabled={busy || body.trim() === (reflection?.body ?? '')}
          onPress={() => void save()} />
      </View>
      {notice && <Text accessibilityLiveRegion="polite" style={notice.error ? studioStyles.error : studioStyles.status}>{notice.text}</Text>}
    </View>}
    {advanced && mode === 'calendar' && <View style={studioStyles.card}>
      <Text accessibilityRole="header" style={studioStyles.subtitle}>{dateLabel(day)}の記録</Text>
      {events.length ? <EventRows events={events.slice(0, limit)} onRead={onRead} onWork={onWork} /> : <Text style={studioStyles.muted}>この日のメモやつながりはありません。</Text>}
      {events.length > limit && <StudioAction label="この日の記録をさらに表示" onPress={() => setLimit(limit + basePageSize)} />}
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  calendar: { paddingHorizontal: 7, gap: 4 },
  month: { flex: 1, textAlign: 'center' },
  summary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', paddingVertical: 3, gap: 5 },
  week: { flexDirection: 'row' },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 12, color: studioColors.muted },
  day: { flex: 1, borderRadius: 11, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  today: { backgroundColor: studioColors.green },
  dayNumber: { color: studioColors.text, fontSize: 14, lineHeight: 20 },
  daySelected: { color: '#fffdf4' },
  todayNumber: { fontWeight: '800' },
  dimmed: { opacity: 0.46 },
  markers: { height: 8, flexDirection: 'row', gap: 3, alignItems: 'center' },
  marker: { width: 4, height: 4, borderRadius: 2 },
  editor: { minHeight: 94 },
  timelineDay: { gap: 5, paddingBottom: 9 },
  timelineDate: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  event: { minHeight: 51, flexDirection: 'row', gap: 9, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: studioColors.rule, paddingVertical: 5 },
  eventIcon: { width: 33, height: 33, justifyContent: 'center', alignItems: 'center', backgroundColor: studioColors.soft, borderRadius: 9 },
});

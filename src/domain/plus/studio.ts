import type { PlusCommand } from '../../data/gardenV3Writer';
import { toSeedSnippet } from '../../utils/seedText';
import { getLocalDateKey } from '../../utils/seedUtils';
import type { Seed } from '../types';
import type { GardenStoreV3, StudioPlacement, StudioPreferences } from './contracts';

export const initialStudioPreferences: StudioPreferences = { layout: 'radial', palette: 'paper' };

export function saveStudioPreferences(patch: Partial<StudioPreferences>, id: string): PlusCommand {
  return { id, apply: (store) => {
    const before = store.studioPreferences ?? initialStudioPreferences;
    const next = { ...before, ...patch };
    return next.layout === before.layout && next.palette === before.palette ? store : { ...store, studioPreferences: next };
  } };
}

export function saveStudioArrangement(centerId: string, placements: StudioPlacement[], expected: readonly StudioPlacement[], id: string): PlusCommand {
  return { id, apply: (store) => {
    const arrangements = store.studioArrangements ?? [];
    const existing = arrangements.find((item) => item.centerId === centerId)?.placements ?? [];
    if (JSON.stringify(existing) !== JSON.stringify(expected)) return { rejected: '配置が更新されました。地図を開き直してください。' };
    if (new Set(placements.map(({ seedId }) => seedId)).size !== placements.length ||
      placements.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1 || Math.abs(y) > 1)) {
      return { rejected: 'カードの位置を確認できませんでした。' };
    }
    const live = new Set(store.seeds.filter(({ deletedAt }) => !deletedAt).map(({ id }) => id));
    if (!live.has(centerId)) return { rejected: '中心のメモを確認できませんでした。' };
    const next = placements.filter(({ seedId, x, y }) => live.has(seedId) && (x !== 0 || y !== 0));
    if (JSON.stringify(next) === JSON.stringify(existing)) return store;
    const others = arrangements.filter((item) => item.centerId !== centerId);
    return { ...store, studioArrangements: next.length ? [...others, { centerId, placements: next }] : others };
  } };
}

export function saveReflection(day: string, body: string, previous: string | undefined, id: string, at: string): PlusCommand {
  return { id, apply: (store) => {
    const reflections = store.reflections ?? [];
    const existing = reflections.find((entry) => entry.day === day);
    const text = body.trim();
    if ((existing?.body ?? '') === text) return store;
    if (existing?.updatedAt !== previous) return { rejected: 'この日の振り返りが変わりました。開き直してください。' };
    const remaining = reflections.filter((entry) => entry.day !== day);
    return { ...store, reflections: text ? [...remaining, { day, body: text, updatedAt: at }] : remaining };
  } };
}

export type RecordEvent = { id: string; at: string; label: string } & (
  | { kind: 'memo'; seedId: string }
  | { kind: 'connection'; pair: [string, string]; note?: string }
  | { kind: 'work' | 'reflection' }
);

export function recordDays(store: GardenStoreV3, seeds: ReadonlyMap<string, Seed>) {
  const days = new Map<string, RecordEvent[]>();
  function add(event: RecordEvent, day = getLocalDateKey(new Date(event.at))) {
    const entries = days.get(day);
    if (entries) entries.push(event);
    else days.set(day, [event]);
  }
  for (const seed of seeds.values()) add({ id: `memo-${seed.id}`, at: seed.createdAt, label: toSeedSnippet(seed, 85), kind: 'memo', seedId: seed.id });
  for (const edge of store.connections) {
    const from = seeds.get(edge.aSeedId);
    const to = seeds.get(edge.bSeedId);
    if (!from || !to || !edge.createdAt) continue;
    add({ id: `edge-${edge.id}`, at: edge.createdAt, label: `${toSeedSnippet(from, 27)} ↔ ${toSeedSnippet(to, 27)}`,
      kind: 'connection', pair: [from.id, to.id], note: edge.note });
  }
  const works = new Map(store.collectionRevisions.map((work) => [work.id, work]));
  for (const item of store.collectionItems) {
    const work = works.get(item.currentRevisionId);
    add({ id: `work-${item.id}`, at: item.createdAt, label: work?.title || '題名なしの作品', kind: 'work' });
  }
  for (const entry of store.reflections ?? []) {
    add({ id: `reflection-${entry.day}`, at: entry.updatedAt, label: entry.body, kind: 'reflection' }, entry.day);
  }
  for (const events of days.values()) events.sort((a, b) =>
    Number(b.kind === 'reflection') - Number(a.kind === 'reflection') || Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
  return days;
}

export function calendarDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function monthDays(month: string) {
  const first = calendarDate(`${month}-01`);
  const weekday = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setDate(1 - weekday + index);
    return { day: getLocalDateKey(date), number: date.getDate(), inMonth: date.getMonth() === first.getMonth() };
  });
}

export function adjacentMonth(month: string, offset: number): string {
  const first = calendarDate(`${month}-01`);
  first.setMonth(first.getMonth() + offset);
  return getLocalDateKey(first).slice(0, 7);
}

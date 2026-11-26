import type { Seed, SeedConnection } from '../domain/types';

const LETTER_WINDOW_DAYS = 7;

export type GardenLetterTheme = {
  label: string;
  seedCount: number;
};

export type GardenLetter = {
  startsAt: string;
  endsAt: string;
  newSeedCount: number;
  tendedSeedCount: number;
  transformCount: number;
  /** 今週、本人が結んで、いま残っているつながり（旧データ由来は日時不明のため数えない）。 */
  newConnectionCount: number;
  /** 今週、本人が芽として採用して、いま芽・木の状態にあるもの。 */
  newSproutCount: number;
  leadingTheme?: GardenLetterTheme;
  reflection: string;
  hasActivity: boolean;
};

const toTimestamp = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const isInWindow = (timestamp: number | undefined, startsAt: number, endsAt: number): boolean =>
  timestamp !== undefined && timestamp >= startsAt && timestamp <= endsAt;

const pickLeadingTheme = (seeds: Seed[]): GardenLetterTheme | undefined => {
  const counts = new Map<string, number>();

  for (const seed of seeds) {
    for (const tag of new Set(seed.tags.map((value) => value.trim()).filter(Boolean))) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const [leading] = [...counts.entries()].sort(([labelA, countA], [labelB, countB]) => {
    if (countA !== countB) {
      return countB - countA;
    }
    return labelA.localeCompare(labelB, 'ja');
  });

  if (!leading || leading[1] < 2) {
    return undefined;
  }

  return { label: leading[0], seedCount: leading[1] };
};

const buildReflection = ({
  leadingTheme,
  newSeedCount,
  tendedSeedCount,
  transformCount,
  newConnectionCount,
  newSproutCount,
}: Pick<
  GardenLetter,
  'leadingTheme' | 'newSeedCount' | 'tendedSeedCount' | 'transformCount' | 'newConnectionCount' | 'newSproutCount'
>): string => {
  // 実際に本人がした操作（芽にした・つないだ）を、意味を断定せずに伝える。
  if (newSproutCount > 0) {
    return '今週、言葉にした芽が生まれました。読み返してみませんか？';
  }

  if (newConnectionCount > 0) {
    return '今週、メモ同士をつなぎました。つながりを見ながら、気づいたことを足してもよさそうです。';
  }

  if (leadingTheme) {
    return `「${leadingTheme.label}」が${leadingTheme.seedCount}つの種に重なっています。別々に見える言葉の間に、同じ願いはありますか？`;
  }

  if (transformCount > 0) {
    return '今週は、思いつきを次の形へ育てた跡があります。いちばん心が動くものだけ、もう一歩進めてもよさそうです。';
  }

  if (tendedSeedCount > 0) {
    return '前に置いた言葉へ、もう一度手を伸ばした週でした。変わった部分と、変わらず残った部分を眺めてみましょう。';
  }

  if (newSeedCount > 0) {
    return '新しい気配が庭に置かれています。まだ結論にせず、響き合う言葉が現れるのを待っても大丈夫です。';
  }

  return '静かな一週間も、庭の時間です。言葉になる前の気配があれば、ひとことだけ置いてみましょう。';
};

export const buildGardenLetter = (seeds: Seed[], now = new Date(), connections: SeedConnection[] = []): GardenLetter => {
  const endsAt = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  const startDate = new Date(endsAt);
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (LETTER_WINDOW_DAYS - 1));
  const startsAt = startDate.getTime();
  const activeSeeds = seeds.filter((seed) => !seed.deletedAt);

  let newSeedCount = 0;
  let tendedSeedCount = 0;
  let transformCount = 0;
  const activitySeeds: Seed[] = [];

  for (const seed of activeSeeds) {
    const createdAt = toTimestamp(seed.createdAt);
    const updatedAt = toTimestamp(seed.updatedAt);
    const wasCreated = isInWindow(createdAt, startsAt, endsAt);
    const wasTended = !wasCreated && createdAt !== undefined && createdAt < startsAt && isInWindow(updatedAt, startsAt, endsAt);

    if (wasCreated) {
      newSeedCount += 1;
    } else if (wasTended) {
      tendedSeedCount += 1;
    }

    if (wasCreated || wasTended) {
      activitySeeds.push(seed);
    }

    transformCount += (seed.transformOutputs ?? []).filter((output) =>
      isInWindow(toTimestamp(output.createdAt), startsAt, endsAt),
    ).length;
  }

  // 閲覧・検索・再浮上・下書き・移行・候補の提示は、育成として数えない。
  // 芽は promotedAt（本人が採用した時刻）が今週で、いま芽・木の状態にあるものだけ。
  let newSproutCount = 0;
  for (const seed of activeSeeds) {
    if (seed.synthesis && (seed.growthState === 'sprout' || seed.growthState === 'tree')) {
      if (isInWindow(toTimestamp(seed.synthesis.promotedAt), startsAt, endsAt)) {
        newSproutCount += 1;
      }
    }
  }
  // つながりは正規化したペア単位で、本人が結んだ（日時が分かる）もの。両端が残っているものだけ。
  const activeIds = new Set(activeSeeds.map((seed) => seed.id));
  const countedConnections = new Set<string>();
  for (const connection of connections) {
    if (
      connection.origin === 'manual' &&
      activeIds.has(connection.aSeedId) &&
      activeIds.has(connection.bSeedId) &&
      isInWindow(toTimestamp(connection.createdAt), startsAt, endsAt)
    ) {
      countedConnections.add(connection.id);
    }
  }
  const newConnectionCount = countedConnections.size;

  const leadingTheme = pickLeadingTheme(activitySeeds);
  const hasActivity = newSeedCount + tendedSeedCount + transformCount + newConnectionCount + newSproutCount > 0;
  const reflection = buildReflection({ leadingTheme, newSeedCount, tendedSeedCount, transformCount, newConnectionCount, newSproutCount });

  return {
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    newSeedCount,
    tendedSeedCount,
    transformCount,
    newConnectionCount,
    newSproutCount,
    leadingTheme,
    reflection,
    hasActivity,
  };
};

export const formatGardenLetterPeriod = (letter: GardenLetter): string => {
  const start = new Date(letter.startsAt);
  const end = new Date(letter.endsAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'この7日間';
  }

  return `${start.getMonth() + 1}月${start.getDate()}日 — ${end.getMonth() + 1}月${end.getDate()}日`;
};

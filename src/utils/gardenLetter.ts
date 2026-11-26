import type { Seed } from '../domain/types';

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
}: Pick<GardenLetter, 'leadingTheme' | 'newSeedCount' | 'tendedSeedCount' | 'transformCount'>): string => {
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

export const buildGardenLetter = (seeds: Seed[], now = new Date()): GardenLetter => {
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

  const leadingTheme = pickLeadingTheme(activitySeeds);
  const hasActivity = newSeedCount + tendedSeedCount + transformCount > 0;
  const reflection = buildReflection({ leadingTheme, newSeedCount, tendedSeedCount, transformCount });

  return {
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    newSeedCount,
    tendedSeedCount,
    transformCount,
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

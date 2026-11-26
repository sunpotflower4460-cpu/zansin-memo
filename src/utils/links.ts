import type { Seed } from '../domain/types';

// 種どうしの「つながり」。構想の「木＝関連種のまとまり」「星・水脈＝繰り返し現れる言葉」を、
// 端末の中だけで、理由が説明できる単純な規則で表現する。AIも自動分類も使わず、つなぐかどうかは常にユーザーが決める。
//
// つながりは3種類を同じものとして扱う:
//  - relatedSeedIds: 「つなぐ」で結んだ関係（どちらから結んでも両方に出る）
//  - continuedFromId: 「続きを書く」で生まれた種から、元の種へのつながり
//  - 以前のバージョンで片方だけに保存された関係（relatedSeedIds）も、そのまま両方向に読む

const sortByCreatedAt = (a: Seed, b: Seed) => a.createdAt.localeCompare(b.createdAt);
const sortByUpdatedDesc = (a: Seed, b: Seed) => b.updatedAt.localeCompare(a.updatedAt);

const buildIndex = (seeds: Seed[]): Map<string, Seed> => new Map(seeds.map((seed) => [seed.id, seed]));

/** 全種から、ふたつの種の間にあるつながりをすべて集めた無向グラフ（id → つながる id の集合）。 */
const buildAdjacency = (seeds: Seed[]): Map<string, Set<string>> => {
  const index = buildIndex(seeds);
  const adjacency = new Map<string, Set<string>>(seeds.map((seed) => [seed.id, new Set<string>()]));
  const connect = (a: string, b: string) => {
    if (a === b || !index.has(a) || !index.has(b)) {
      return;
    }
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  };

  for (const seed of seeds) {
    for (const relatedId of seed.relatedSeedIds) {
      connect(seed.id, relatedId);
    }
    if (seed.continuedFromId) {
      connect(seed.id, seed.continuedFromId);
    }
  }
  return adjacency;
};

export const getLinkedSeeds = (seed: Seed, allSeeds: Seed[]): Seed[] => {
  const adjacency = buildAdjacency(allSeeds);
  const index = buildIndex(allSeeds);
  return Array.from(adjacency.get(seed.id) ?? [])
    .map((id) => index.get(id))
    .filter((linked): linked is Seed => Boolean(linked))
    .sort(sortByUpdatedDesc);
};

/** 種ごとのつながりの数。一覧やカードに「つながり n」を出すために使う。 */
export const getLinkCounts = (seeds: Seed[]): Map<string, number> => {
  const adjacency = buildAdjacency(seeds);
  return new Map(Array.from(adjacency, ([id, linked]) => [id, linked.size]));
};

const addUnique = (ids: string[], id: string): string[] => (ids.includes(id) ? ids : [...ids, id]);

/** ふたつの種を、どちらにも表示されるようにつなぐ。更新日時は動かさない（つなぐだけで「最近」の並びを乱さないため）。 */
export const linkSeeds = (seeds: Seed[], aId: string, bId: string): Seed[] => {
  if (aId === bId) {
    return seeds;
  }
  const ids = new Set(seeds.map((seed) => seed.id));
  if (!ids.has(aId) || !ids.has(bId)) {
    return seeds;
  }
  return seeds.map((seed) => {
    if (seed.id === aId) {
      return { ...seed, relatedSeedIds: addUnique(seed.relatedSeedIds, bId) };
    }
    if (seed.id === bId) {
      return { ...seed, relatedSeedIds: addUnique(seed.relatedSeedIds, aId) };
    }
    return seed;
  });
};

/** つながりを外す。「続き」でつながっていた場合は、その印も外す。 */
export const unlinkSeeds = (seeds: Seed[], aId: string, bId: string): Seed[] =>
  seeds.map((seed) => {
    if (seed.id !== aId && seed.id !== bId) {
      return seed;
    }
    const otherId = seed.id === aId ? bId : aId;
    return {
      ...seed,
      relatedSeedIds: seed.relatedSeedIds.filter((id) => id !== otherId),
      continuedFromId: seed.continuedFromId === otherId ? undefined : seed.continuedFromId,
    };
  });

/** 「続きを書く」でたどれる、同じ話の流れ。古い順。続きの印でつながった種だけを対象にする。 */
export const getThread = (seed: Seed, allSeeds: Seed[]): Seed[] => {
  const index = buildIndex(allSeeds);
  const adjacency = new Map<string, Set<string>>(allSeeds.map((s) => [s.id, new Set<string>()]));
  for (const s of allSeeds) {
    if (s.continuedFromId && index.has(s.continuedFromId) && s.continuedFromId !== s.id) {
      adjacency.get(s.id)?.add(s.continuedFromId);
      adjacency.get(s.continuedFromId)?.add(s.id);
    }
  }

  const seen = new Set<string>([seed.id]);
  const queue = [seed.id];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return Array.from(seen)
    .map((id) => index.get(id))
    .filter((s): s is Seed => Boolean(s))
    .sort(sortByCreatedAt);
};

/** つながった種のまとまり（構想の「木」「森」）。2つ以上つながっているものだけ。大きい順、同じなら新しい順。 */
export const buildClusters = (seeds: Seed[]): Seed[][] => {
  const adjacency = buildAdjacency(seeds);
  const index = buildIndex(seeds);
  const visited = new Set<string>();
  const clusters: Seed[][] = [];

  for (const seed of seeds) {
    if (visited.has(seed.id) || (adjacency.get(seed.id)?.size ?? 0) === 0) {
      continue;
    }
    const members: Seed[] = [];
    const queue = [seed.id];
    visited.add(seed.id);
    while (queue.length > 0) {
      const current = queue.shift() as string;
      const found = index.get(current);
      if (found) {
        members.push(found);
      }
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    if (members.length >= 2) {
      clusters.push(members.sort(sortByCreatedAt));
    }
  }

  const latest = (members: Seed[]) => members.reduce((max, m) => (m.updatedAt > max ? m.updatedAt : max), '');
  return clusters.sort((a, b) => b.length - a.length || latest(b).localeCompare(latest(a)));
};

// ---- 言葉（星・水脈） ----

// 漢字2文字以上、カタカナ2文字以上、英単語3文字以上の連なりを「言葉」とみなす。
// ひらがなだけの語（助詞や活用語尾）は拾わないので、辞書がなくても内容語が中心になる。
const WORD_PATTERN = /[一-鿿々]{2,}|[ァ-ヺー]{2,}|[A-Za-z]{3,}/g;
const STOP_WORDS = new Set([
  '今日', '昨日', '明日', '自分', '時間', '最近', '今度', '気持', '感じ', '一番', '本当', '最初', '最後', '今回', '以前', 'する', 'こと', 'もの', 'the', 'and', 'for', 'that', 'this', 'with',
]);

export const extractKeywords = (text: string): string[] => {
  const words = (text.match(WORD_PATTERN) ?? []).map((word) => word.toLowerCase());
  return Array.from(new Set(words.filter((word) => !STOP_WORDS.has(word))));
};

const seedKeywords = (seed: Seed): string[] => extractKeywords(`${seed.title ?? ''} ${seed.body}`);

// 「読書」と「読書会」のように、片方がもう片方を含む言葉も共通とみなす（短いほうを共通の言葉として返す）。
const sharedKeywords = (mine: string[], theirs: string[]): string[] => {
  const shared = new Set<string>();
  for (const word of theirs) {
    for (const mineWord of mine) {
      if (word === mineWord) {
        shared.add(word);
      } else if (mineWord.includes(word)) {
        shared.add(word);
      } else if (word.includes(mineWord)) {
        shared.add(mineWord);
      }
    }
  }
  return Array.from(shared);
};

export type LinkSuggestion = {
  seed: Seed;
  /** なぜ提案したのか。ユーザーが納得して選べるように必ず添える。 */
  reason: string;
};

/** つながりそうな種を、共通のカテゴリ・言葉から提案する。すでにつながっている種は除く。 */
export const suggestLinks = (seed: Seed, allSeeds: Seed[], limit = 3): LinkSuggestion[] => {
  // すでにつながっている種に加えて、同じ話のながれにいる種（続きでつながった仲間）も提案しない。
  const linkedIds = new Set([...getLinkedSeeds(seed, allSeeds), ...getThread(seed, allSeeds)].map((linked) => linked.id));
  const myWords = seedKeywords(seed);
  const myTags = new Set(seed.tags);

  const scored: Array<LinkSuggestion & { score: number }> = [];
  for (const other of allSeeds) {
    if (other.id === seed.id || linkedIds.has(other.id)) {
      continue;
    }
    const sharedTags = other.tags.filter((tag) => myTags.has(tag));
    const sharedWords = sharedKeywords(myWords, seedKeywords(other));
    const score = sharedTags.length * 3 + sharedWords.length * 2;
    if (score < 2) {
      continue;
    }

    const reasons: string[] = [];
    if (sharedWords.length > 0) {
      reasons.push(`「${sharedWords[0]}」という言葉が共通しています`);
    }
    if (sharedTags.length > 0) {
      reasons.push(`カテゴリ「${sharedTags[0]}」が同じです`);
    }
    scored.push({ seed: other, reason: reasons.join('。'), score });
  }

  return scored
    .sort((a, b) => b.score - a.score || sortByUpdatedDesc(a.seed, b.seed))
    .slice(0, limit)
    .map(({ seed: found, reason }) => ({ seed: found, reason }));
};

export type RecurringWord = { word: string; count: number };

/** 複数の種に繰り返し出てくる言葉（構想の「星・水脈」）。 */
export const findRecurringWords = (seeds: Seed[], minCount = 2, limit = 8): RecurringWord[] => {
  const counts = new Map<string, number>();
  for (const seed of seeds) {
    for (const word of seedKeywords(seed)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([word, count]) => ({ word, count }))
    .filter(({ count }) => count >= minCount)
    .sort((a, b) => b.count - a.count || b.word.length - a.word.length || a.word.localeCompare(b.word))
    .slice(0, limit);
};

/** 最近つながる種が更新された種のid。「つながる種が最近育っています」という再会のきっかけに使う。 */
export const getIdsWithRecentlyActiveLinks = (seeds: Seed[], now: Date, windowDays = 3): Set<string> => {
  const adjacency = buildAdjacency(seeds);
  const index = buildIndex(seeds);
  const threshold = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const result = new Set<string>();
  for (const [id, linkedIds] of adjacency) {
    const self = index.get(id);
    const selfUpdated = self ? new Date(self.updatedAt).getTime() : Number.NaN;
    // 自分自身も最近動いているなら、わざわざ再会の理由にしない。
    if (Number.isFinite(selfUpdated) && selfUpdated >= threshold) {
      continue;
    }
    for (const linkedId of linkedIds) {
      const linkedUpdated = new Date(index.get(linkedId)?.updatedAt ?? '').getTime();
      if (Number.isFinite(linkedUpdated) && linkedUpdated >= threshold) {
        result.add(id);
        break;
      }
    }
  }
  return result;
};

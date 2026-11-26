import type { Seed, SeedConnection } from '../domain/types';

// 種どうしの「つながり」の読み取り。つながりの正本は無向の SeedConnection で、ここでは派生して読むだけ。
// 本人が結んだ関係以外（同じカテゴリ・同じ言葉・A-B-C の連鎖）を、つながりとして断定しない。
// 契約: docs/core-growth-data.md §3.2

const sortByUpdatedDesc = (a: Seed, b: Seed) => b.updatedAt.localeCompare(a.updatedAt);

const buildIndex = (seeds: Seed[]): Map<string, Seed> => new Map(seeds.map((seed) => [seed.id, seed]));

/** 隣接インデックス（id → つながる id）。渡された種（通常は削除・非表示を除いたもの）の間の線だけを使う。 */
export const buildAdjacency = (seeds: Seed[], connections: SeedConnection[]): Map<string, Set<string>> => {
  const adjacency = new Map<string, Set<string>>(seeds.map((seed) => [seed.id, new Set<string>()]));
  for (const connection of connections) {
    const a = adjacency.get(connection.aSeedId);
    const b = adjacency.get(connection.bSeedId);
    if (a && b && connection.aSeedId !== connection.bSeedId) {
      a.add(connection.bSeedId);
      b.add(connection.aSeedId);
    }
  }
  return adjacency;
};

export const getLinkedSeeds = (seed: Seed, seeds: Seed[], connections: SeedConnection[]): Seed[] => {
  const index = buildIndex(seeds);
  const adjacency = buildAdjacency(seeds, connections);
  return Array.from(adjacency.get(seed.id) ?? [])
    .map((id) => index.get(id))
    .filter((linked): linked is Seed => Boolean(linked))
    .sort(sortByUpdatedDesc);
};

/** 種ごとのつながりの数（正規化したペア単位。双方の詳細に出ることを2件と数えない）。 */
export const getLinkCounts = (seeds: Seed[], connections: SeedConnection[]): Map<string, number> =>
  new Map(Array.from(buildAdjacency(seeds, connections), ([id, linked]) => [id, linked.size]));

/** ペアに付いた線の情報（任意の一言を含む）。 */
export const findConnection = (connections: SeedConnection[], a: string, b: string): SeedConnection | undefined =>
  connections.find((connection) => (connection.aSeedId === a && connection.bSeedId === b) || (connection.aSeedId === b && connection.bSeedId === a));

// ---- 言葉 ----

// 漢字2文字以上、カタカナ2文字以上、英数字3文字以上の連なりを「言葉」とみなす。
// ひらがなだけの語（助詞や活用語尾）は拾わないので、辞書がなくても内容語が中心になる。
const WORD_PATTERN = /[一-鿿々]{2,}|[ァ-ヺー]{2,}|[a-z0-9]{3,}/g;
const STOP_WORDS = new Set([
  '今日', '昨日', '明日', '自分', '時間', '最近', '今度', '気持', '感じ', '一番', '本当', '最初', '最後', '今回', '以前', 'the', 'and', 'for', 'that', 'this', 'with',
]);

/** 全角・半角、大文字・小文字の違いを吸収して言葉を取り出す。 */
export const extractKeywords = (text: string): string[] => {
  const normalized = text.normalize('NFKC').toLowerCase();
  const words = normalized.match(WORD_PATTERN) ?? [];
  return Array.from(new Set(words.filter((word) => !STOP_WORDS.has(word))));
};

const normalizeTag = (tag: string): string => tag.normalize('NFKC').trim().toLowerCase();
const seedKeywords = (seed: Seed): string[] =>
  extractKeywords(`${seed.title ?? ''} ${seed.body} ${seed.synthesis?.statement ?? ''}`);

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
  /** なぜ候補にしたのか。実際に使った根拠だけを示す。 */
  reason: string;
};

/**
 * つながりそうな種の候補。共通の言葉・カテゴリがあるときだけ、その理由つきで出す。
 * すでにつながっている種・削除済み・保管は出さない。候補は線ではなく、本人が採用して初めて接続になる。
 * 気分や時間だけで意味的な関連を断定しない。
 */
export const suggestLinks = (
  seed: Seed,
  seeds: Seed[],
  connections: SeedConnection[],
  options: { limit?: number; dismissed?: Set<string> } = {},
): LinkSuggestion[] => {
  const limit = options.limit ?? 3;
  const linkedIds = new Set(getLinkedSeeds(seed, seeds, connections).map((linked) => linked.id));
  const myWords = seedKeywords(seed);
  const myTags = new Set(seed.tags.map(normalizeTag));

  const scored: Array<LinkSuggestion & { score: number }> = [];
  for (const other of seeds) {
    if (other.id === seed.id || other.deletedAt || other.growthState === 'archived' || linkedIds.has(other.id)) {
      continue;
    }
    if (options.dismissed?.has(dismissKey(seed.id, other.id))) {
      continue;
    }
    const sharedTags = other.tags.filter((tag) => myTags.has(normalizeTag(tag)));
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

/** 「今回は見送る」を、向きに依存しないペアで記録するためのキー。 */
export const dismissKey = (a: string, b: string): string => JSON.stringify(a <= b ? [a, b] : [b, a]);

export type RecurringWord = { word: string; count: number };

/** 複数の種に繰り返し出てくる言葉。探すための手がかりで、テーマの断定ではない。 */
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

/** 最近つながる種が更新された種のid。再会の実際の理由として使う。自分も最近動いていれば対象にしない。 */
export const getIdsWithRecentlyActiveLinks = (seeds: Seed[], connections: SeedConnection[], now: Date, windowDays = 3): Set<string> => {
  const adjacency = buildAdjacency(seeds, connections);
  const index = buildIndex(seeds);
  const threshold = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const result = new Set<string>();
  for (const [id, linkedIds] of adjacency) {
    const selfUpdated = new Date(index.get(id)?.updatedAt ?? '').getTime();
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

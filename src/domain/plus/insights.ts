import { connectionId, normalizePair } from '../../data/gardenModel';
import { withCoreCommand, type PlusCommand } from '../../data/gardenV3Writer';
import { normalizeSearchText, toSeedSnippet } from '../../utils/seedText';
import { connectSeeds } from '../gardenCommands';
import type { Seed } from '../types';
import type { GardenStoreV3 } from './contracts';
import type { MapIndex } from './map';

const themes: ReadonlyArray<readonly [string, RegExp]> = [
  ['外を歩くこと', /散歩|街歩き|帰り道|歩道|遊歩道|通り道|歩きながら|walk|stroll/iu],
  ['思い出を残すこと', /日記|思い出|思い出せ|記録|書き留め|振り返|ログ|アーカイブ|残[すし]|journal|record|memories/iu],
  ['写真や映像', /写真|カメラ|撮[るりっ影]|アルバム|フィルム|撮像|photo|camera|video/iu],
  ['音の記録', /音色|録音|音声|足音|耳を|ひびき|聞[くいこ]|audio|listen|sound/iu],
  ['光と色', /光|影|色合い|晴れ|曇り|青空|夕日|夕焼け|shade|light|sunset|color/iu],
  ['短い時間で続けること', /手軽|続か|続け|習慣|日課|毎[日週朝晩]|一言|短[いく]|分だけ|routine|habit|daily/iu],
  ['入口や最初の一歩', /入口|始め[方る]|最初の|参加|手順|迷わ|わかりやす|チュートリアル|onboard|first step/iu],
  ['植物を育てること', /水やり|鉢植え|観葉|苗|園芸|植物|庭木|発芽|plant|garden/iu],
  ['食事を作ること', /食事|お弁当|料理|献立|レシピ|台所|食材|調理|recipe|cook|meal/iu],
  ['集中できる環境', /集中|通知|気が散|静けさ|雑音|作業環境|focus|interrupt|distract/iu],
  ['学んだことの定着', /勉強|読書|学習|復習|覚え|思い出す練習|learn|study|recall/iu],
  ['見せ方を考えること', /デザイン|見出し|配色|余白|印刷|レイアウト|組版|layout|design|publish/iu],
  ['誰かと分け合うこと', /便り|おすそ分け|手紙|贈[るり]|届け|ひとに見せ|共有|letter|gift|share/iu],
  ['試して確かめること', /試作|実験|検証|試[すし]|確かめ|プロトタイプ|experiment|prototype|try/iu],
];
const intention = /続かない|[どド]うすれば|どうやって|したい|できるかな|困[るっ]|難し|悩[むん]|難点|課題|？|\?|wish|struggl|how to|hard to/iu;
const example = /[てで]み[たる]|気づい|続けてい|している|できた|よかった|しやす|毎[週朝日]|ずつ|たら|tried|found|worked|every/iu;
const linkWords = new Set(['こと', 'もの', 'メモ', '感じ', '今日', '自分', 'テスト', 'the', 'and', 'with', 'this', 'that']);

const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('ja', { granularity: 'word' }) : undefined;

function words(text: string): Set<string> {
  const tokens = segmenter ? [...segmenter.segment(text)].filter((part) => part.isWordLike).map((part) => part.segment)
    : text.match(/[a-z][a-z0-9-]+|[\p{Script=Han}\p{Script=Katakana}ー]{2,}/gu) ?? [];
  return new Set(tokens.filter((token) => /[a-z]{3,}|[\p{Script=Han}\p{Script=Katakana}ー]{2,}/u.test(token) && !linkWords.has(token)));
}

function noteText(seed: Seed): string {
  return [seed.title, seed.body].filter(Boolean).join('。').slice(0, 1300);
}

function bodyKey(seed: Seed) {
  const body = normalizeSearchText(seed.body.trim());
  const title = normalizeSearchText(seed.title?.trim() ?? '');
  // A numbered note can repeat its own title before an otherwise identical paragraph.
  return title && /\d+$/.test(title) && body.startsWith(title)
    ? JSON.stringify([title.replace(/\d+$/, ''), body.slice(title.length)]) : body;
}

function features(seed: Seed) {
  const text = noteText(seed);
  const normalized = normalizeSearchText(text);
  return {
    seed, text, words: words(normalized), topics: themes.filter(([, pattern]) => pattern.test(normalized)).map(([label]) => label),
    intent: intention.test(text), example: example.test(text),
  };
}

export type Suggestion = {
  from: Seed; to: Seed; kind: '目的と手がかり' | '共通のテーマ' | '意味が近い記録' | '共通のつなぎ役';
  reason: string; evidence: [string, string]; bridge?: Seed;
};

export function shortlistInsights(index: MapIndex, store: Pick<GardenStoreV3, 'permissions' | 'connections' | 'proposalSuppressions'>, centerId: string) {
  const blockedIds = new Set(store.permissions.filter((item) => item.discovery === 'exclude').map(({ seedId }) => seedId));
  const blockedPairs = new Set([...store.connections.map(({ id }) => id), ...store.proposalSuppressions.map(({ pair }) => JSON.stringify(pair))]);
  const source = index.byId.get(centerId);
  if (!source || blockedIds.has(centerId)) return undefined;
  const from = features(source);
  const bridges = new Map<string, Seed>();
  const neighbors = [...index.adjacent.get(source.id) ?? []].filter((id) => !blockedIds.has(id));
  neighbors.sort((a, b) => (index.adjacent.get(a)?.size ?? 0) - (index.adjacent.get(b)?.size ?? 0));
  for (const via of neighbors) {
    const peers = index.adjacent.get(via)!;
    // A large hub by itself is a poor reason to suggest every leaf to every other leaf.
    if (peers.size > 12) continue;
    for (const id of peers) if (!bridges.has(id)) bridges.set(id, index.byId.get(via)!);
  }
  const pool = index.live.filter((seed) => seed.id !== source.id && !blockedIds.has(seed.id) &&
    !blockedPairs.has(connectionId(source.id, seed.id)) && seed.body.trim().length >= 4).map(features);
  const frequency = new Map<string, number>();
  for (const entry of pool) for (const term of entry.words) frequency.set(term, (frequency.get(term) ?? 0) + 1);
  const scored = pool.map((to) => {
    const common = [...from.words].filter((term) => to.words.has(term));
    common.sort((a, b) => frequency.get(a)! - frequency.get(b)! || b.length - a.length);
    const topics = from.topics.filter((topic) => to.topics.includes(topic));
    const direction = (from.intent && to.example) || (to.intent && from.example);
    const termScore = common.slice(0, 3).reduce((score, term) => score + 1.1 / Math.sqrt(frequency.get(term)!), 0);
    const score = topics.length * 0.72 + termScore + (direction && topics.length ? 0.85 : 0);
    const bridge = bridges.get(to.seed.id);
    return { to, common, topics, direction, bridge, score: score + (bridge ? 1.1 : 0) };
  }).sort((a, b) => b.score - a.score || b.to.seed.createdAt.localeCompare(a.to.seed.createdAt) || a.to.seed.id.localeCompare(b.to.seed.id));
  // Reserve the limited model slots for distinct texts, including recent notes without shared words.
  const seenBodies = new Set([bodyKey(source)]);
  const ranked = scored.filter(({ to }) => {
    const key = bodyKey(to.seed);
    if (seenBodies.has(key)) return false;
    seenBodies.add(key);
    return true;
  });
  const preferred = ranked.slice(0, 16);
  const preferredIds = new Set(preferred.map(({ to }) => to.seed.id));
  const remaining = ranked.filter(({ to }) => !preferredIds.has(to.seed.id))
    .sort((a, b) => b.to.seed.createdAt.localeCompare(a.to.seed.createdAt) || a.to.seed.id.localeCompare(b.to.seed.id));
  return { from, ranked: [...preferred, ...remaining.slice(0, 8)] };
}

type Shortlist = NonNullable<ReturnType<typeof shortlistInsights>>;

function quote(seed: Seed, token?: string, topic?: string): string {
  const sentences = seed.body.match(/[^。！？\n]+[。！？]?/gu) ?? [seed.body];
  const pattern = topic ? themes.find(([label]) => label === topic)?.[1] : undefined;
  const excerpt = (token && sentences.find((sentence) => normalizeSearchText(sentence).includes(token)) ||
    pattern && sentences.find((sentence) => pattern.test(sentence)) || sentences.find((sentence) => sentence.trim().length >= 12) || sentences[0]).trim();
  return Array.from(excerpt).slice(0, 93).join('');
}

function purposeReason(goal: ReturnType<typeof features>, clue: ReturnType<typeof features>, shared: string) {
  if (goal.topics.includes('思い出を残すこと') && clue.topics.includes('写真や映像') && /撮り続け|撮っている|撮ってみた|写真を選ん/u.test(clue.seed.body)) {
    return '記録を続けたい日に、すでに撮っている写真を一枚選ぶ。そこから一言書き始める方法を試せそうです。';
  }
  if (goal.topics.includes('思い出を残すこと') && /一言|一行/u.test(clue.seed.body)) {
    return '残したいことを一言だけ書く方法が見つかりました。書く量を減らすと続けやすいか、この2枚から試せます。';
  }
  return `「${toSeedSnippet(goal.seed, 22)}」で気になっていることに、「${toSeedSnippet(clue.seed, 22)}」のやり方を借りられそうです。接点は「${shared}」です。`;
}

export function rankInsights({ from, ranked }: Shortlist, similarities: readonly number[] = []): Suggestion[] {
  const scores = similarities.filter((score) => Number.isFinite(score) && score >= 0).sort((a, b) => a - b);
  const semanticCutoff = scores.length <= 3 ? 0.72 : Math.max(0.68, scores[Math.floor(scores.length / 2)] + 0.055);
  const rankedMatches = ranked.map((candidate, index) => {
    const similarity = Number.isFinite(similarities[index]) ? similarities[index] : -1;
    const semantic = similarity >= semanticCutoff;
    const relevant = candidate.score >= 1.05 || semantic;
    return { ...candidate, similarity, relevant, score: candidate.score + Math.max(0, similarity - 0.56) * 8 };
  }).filter(({ relevant }) => relevant).sort((a, b) => b.score - a.score || b.similarity - a.similarity);

  const results: Suggestion[] = [];
  const usedBridges = new Set<string>();
  for (const { to, common, topics, direction, bridge } of rankedMatches) {
    const label = topics.slice(0, 2).join('・') || common.slice(0, 2).join('・');
    if (!label && bridge) {
      if (usedBridges.has(bridge.id)) continue;
      usedBridges.add(bridge.id);
    }
    const kind = !label && bridge ? '共通のつなぎ役' : direction && label ? '目的と手がかり' : label ? '共通のテーマ' : '意味が近い記録';
    let reason: string;
    if (kind === '共通のつなぎ役' && bridge) {
      reason = `どちらも「${toSeedSnippet(bridge, 35)}」につないだメモです。二つの間にも手がかりがあるか、読み比べてみましょう。`;
    } else if (kind === '目的と手がかり') {
      reason = from.intent && to.example ? purposeReason(from, to, topics[0] ?? common[0]) : purposeReason(to, from, topics[0] ?? common[0]);
    } else if (kind === '共通のテーマ') {
      reason = common.length ? `どちらのメモにも、題名や本文に「${common[0]}」という言葉があります。二つの場面を読み比べられます。`
        : `どちらの文章にも「${topics[0]}」に関わる表現があります。`;
    } else {
      reason = '端末の言語モデルが文章の意味の近さを見つけました。引用を見比べて、残したい関係か確かめられます。';
    }
    results.push({ from: from.seed, to: to.seed, kind, reason, bridge: kind === '共通のつなぎ役' ? bridge : undefined,
      evidence: [quote(from.seed, common[0], topics[0]), quote(to.seed, common[0], topics[0])] });
    if (results.length === 5) break;
  }
  return results;
}

export function settleInsight(suggestion: Suggestion, action: 'connect' | 'dismiss', id: string, at: string): PlusCommand {
  const { from, to } = suggestion;
  const pair = normalizePair(from.id, to.id);
  const edgeId = connectionId(...pair);
  const connect = withCoreCommand(connectSeeds({ commandId: id, a: from.id, b: to.id, now: at }));
  return { id, apply: (store) => {
    const sources = suggestion.bridge ? [from, to, suggestion.bridge] : [from, to];
    const current = sources.every((before) => store.seeds.some((seed) => seed.id === before.id && !seed.deletedAt &&
      seed.updatedAt === before.updatedAt && seed.body === before.body && seed.title === before.title));
    const bridge = suggestion.bridge;
    const pathChanged = bridge && pair.some((id) => !store.connections.some((edge) => edge.id === connectionId(id, bridge.id)));
    if (!current || pathChanged || store.permissions.some(({ seedId, discovery }) => discovery === 'exclude' && sources.some((seed) => seed.id === seedId))) {
      return { rejected: 'メモが変わりました。候補を探し直してください。' };
    }
    if (store.connections.some((edge) => edge.id === edgeId) || store.proposalSuppressions.some((entry) => connectionId(...entry.pair) === edgeId)) return store;
    return action === 'connect' ? connect.apply(store)
      : { ...store, proposalSuppressions: [...store.proposalSuppressions, { pair, reason: 'dismissed', createdAt: at }] };
  } };
}

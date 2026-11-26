import type { Seed } from '../domain/types';

const DEFAULT_LENGTH = 36;

/** 一覧や「つながり」の行で使う短い見出し。タイトルがあればタイトル、なければ本文の頭。 */
export const toSeedSnippet = (seed: Pick<Seed, 'title' | 'body'>, maxLength = DEFAULT_LENGTH): string => {
  const text = (seed.title?.trim() || seed.body).replace(/\s+/g, ' ');
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};

/** 数行だけの表示では読み切れず、「全文」の切り替えが要る長さか。改行が多い短文も含む。 */
export const isLongText = (text: string, maxLength: number, maxLines = 3): boolean =>
  text.length > maxLength || text.split('\n').length > maxLines;

/** 検索用の正規化。全角/半角・大文字/小文字・互換文字の違いで見つからなくならないようにする。 */
export const normalizeSearchText = (text: string): string => text.normalize('NFKC').toLowerCase();

/** 検索語が本文などに含まれるか（正規化したうえで比べる）。 */
export const matchesSearch = (text: string, normalizedQuery: string): boolean =>
  normalizedQuery.length > 0 && normalizeSearchText(text).includes(normalizedQuery);

const EXCERPT_RADIUS = 28;

export type MatchExcerpt = { field: 'body' | 'title' | 'synthesis' | 'tag'; text: string };

/** 検索に一致した語句まわりの短い抜粋。芽の文が一致したときは、その文を見せる。 */
export const buildMatchExcerpt = (seed: Seed, query: string): MatchExcerpt | undefined => {
  const q = normalizeSearchText(query.trim());
  if (!q) {
    return undefined;
  }
  const around = (text: string): string => {
    const normalized = normalizeSearchText(text);
    // 正規化で文字数が変わる文字（㌔・半角カナの濁点など）を含むときは位置がずれるので、抜粋の窓は先頭から取る。
    const index = normalized.length === text.length ? normalized.indexOf(q) : 0;
    if (index < 0) return text;
    const start = Math.max(0, index - EXCERPT_RADIUS);
    const end = Math.min(text.length, index + q.length + EXCERPT_RADIUS);
    return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
  };
  if (seed.synthesis && matchesSearch(seed.synthesis.statement, q)) {
    return { field: 'synthesis', text: around(seed.synthesis.statement) };
  }
  if (matchesSearch(seed.body, q)) {
    return { field: 'body', text: around(seed.body) };
  }
  if (seed.title && matchesSearch(seed.title, q)) {
    return { field: 'title', text: seed.title };
  }
  const tag = seed.tags.find((item) => matchesSearch(item, q));
  return tag ? { field: 'tag', text: tag } : undefined;
};

/** 検索の対象にする文字列（本文・題名・カテゴリ・芽の文）。削除済み材料のスナップショットは含めない。 */
export const searchableText = (seed: Seed): string =>
  `${seed.title ?? ''}\n${seed.body}\n${seed.tags.join(' ')}\n${seed.synthesis?.statement ?? ''}`.normalize('NFKC').toLowerCase();

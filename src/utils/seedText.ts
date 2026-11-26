import type { Seed } from '../domain/types';

const DEFAULT_LENGTH = 36;

/** 一覧や「つながり」の行で使う短い見出し。タイトルがあればタイトル、なければ本文の頭。 */
export const toSeedSnippet = (seed: Pick<Seed, 'title' | 'body'>, maxLength = DEFAULT_LENGTH): string => {
  const text = (seed.title?.trim() || seed.body).replace(/\s+/g, ' ');
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};

const EXCERPT_RADIUS = 28;

export type MatchExcerpt = { field: 'body' | 'title' | 'synthesis' | 'tag'; text: string };

/** 検索に一致した語句まわりの短い抜粋。芽の文が一致したときは、その文を見せる。 */
export const buildMatchExcerpt = (seed: Seed, query: string): MatchExcerpt | undefined => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return undefined;
  }
  const around = (text: string): string => {
    const index = text.toLowerCase().indexOf(q);
    if (index < 0) return text;
    const start = Math.max(0, index - EXCERPT_RADIUS);
    const end = Math.min(text.length, index + q.length + EXCERPT_RADIUS);
    return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
  };
  if (seed.synthesis?.statement.toLowerCase().includes(q)) {
    return { field: 'synthesis', text: around(seed.synthesis.statement) };
  }
  if (seed.body.toLowerCase().includes(q)) {
    return { field: 'body', text: around(seed.body) };
  }
  if (seed.title?.toLowerCase().includes(q)) {
    return { field: 'title', text: seed.title };
  }
  const tag = seed.tags.find((item) => item.toLowerCase().includes(q));
  return tag ? { field: 'tag', text: tag } : undefined;
};

/** 検索の対象にする文字列（本文・題名・カテゴリ・芽の文）。削除済み材料のスナップショットは含めない。 */
export const searchableText = (seed: Seed): string =>
  `${seed.title ?? ''}\n${seed.body}\n${seed.tags.join(' ')}\n${seed.synthesis?.statement ?? ''}`.toLowerCase();

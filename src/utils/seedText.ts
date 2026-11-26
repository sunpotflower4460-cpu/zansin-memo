import type { Seed } from '../domain/types';

const DEFAULT_LENGTH = 36;

/** 一覧や「つながり」の行で使う短い見出し。タイトルがあればタイトル、なければ本文の頭。 */
export const toSeedSnippet = (seed: Pick<Seed, 'title' | 'body'>, maxLength = DEFAULT_LENGTH): string => {
  const text = (seed.title?.trim() || seed.body).replace(/\s+/g, ' ');
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};

import assert from 'node:assert/strict';
import test from 'node:test';
import { makeSeed } from '../data/testSupport';
import { buildMatchExcerpt, matchesSearch, normalizeSearchText, searchableText, toSeedSnippet } from './seedText';

test('toSeedSnippet prefers the title and trims long text', () => {
  assert.equal(toSeedSnippet(makeSeed('a', { title: '題名', body: '本文' })), '題名');
  assert.equal(toSeedSnippet(makeSeed('a', { body: 'あ'.repeat(50) }), 10), `${'あ'.repeat(10)}…`);
  assert.equal(toSeedSnippet(makeSeed('a', { body: '改行\n  のある   本文' })), '改行 のある 本文');
});

test('searchableText covers body, title, category and the sprout sentence only', () => {
  const seed = makeSeed('a', {
    title: '題',
    body: '本文',
    tags: ['日々'],
    synthesis: {
      id: 's',
      statement: '芽の文',
      sources: [{ seedId: 'x', sourcePart: 'body', textSnapshot: '材料の過去の本文', sourceUpdatedAt: '2026-01-01T00:00:00.000Z' }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      promotedAt: '2026-01-01T00:00:00.000Z',
    },
  });
  const text = searchableText(seed);
  for (const word of ['題', '本文', '日々', '芽の文']) assert.ok(text.includes(word));
  assert.equal(text.includes('材料の過去の本文'), false); // 過去の材料スナップショットは通常検索に混ぜない
});

test('buildMatchExcerpt shows the sprout sentence when it matched, and a window around a body match', () => {
  const seed = makeSeed('a', { body: `${'前'.repeat(60)}写真${'後'.repeat(60)}`, synthesis: undefined });
  const body = buildMatchExcerpt(seed, '写真');
  assert.equal(body?.field, 'body');
  assert.ok(body?.text.startsWith('…') && body.text.endsWith('…') && body.text.includes('写真'));
  assert.equal(buildMatchExcerpt(seed, '存在しない語'), undefined);
  assert.equal(buildMatchExcerpt(seed, '  '), undefined);

  const withSprout = makeSeed('b', {
    body: '本文',
    synthesis: {
      id: 's', statement: '近況便りを作れそう', sources: [],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', promotedAt: '2026-01-01T00:00:00.000Z',
    },
  });
  assert.deepEqual(buildMatchExcerpt(withSprout, '便り'), { field: 'synthesis', text: '近況便りを作れそう' });
});

test('D09 search ignores full/half width and case, finds emoji and long text, and works without a title', () => {
  const seeds = [
    makeSeed('w', { title: undefined, body: 'ＡＢＣ写真ｶﾒﾗの話 🌱 と 全角１２３', tags: [] }),
    makeSeed('l', { title: undefined, body: `${'あ'.repeat(5000)}最後のアザラシ`, tags: [] }),
  ];
  const find = (query: string) => seeds.filter((seed) => searchableText(seed).includes(normalizeSearchText(query.trim()))).map((seed) => seed.id);
  assert.deepEqual(find('abc'), ['w']); // 半角・小文字で全角・大文字を探せる
  assert.deepEqual(find('ＡＢＣ'), ['w']);
  assert.deepEqual(find('カメラ'), ['w']); // 全角カナで半角カナを探せる
  assert.deepEqual(find('ｶﾒﾗ'), ['w']);
  assert.deepEqual(find('123'), ['w']);
  assert.deepEqual(find('🌱'), ['w']);
  assert.deepEqual(find('アザラシ'), ['l']); // 長文の末尾まで探せる
  assert.deepEqual(find('存在しない'), []);
  assert.equal(matchesSearch('ＡＢＣ', ''), false); // 空の検索語は一致にしない
});

test('D09 the excerpt explains the match even when normalization changes the text length', () => {
  const seed = makeSeed('k', { body: `${'前'.repeat(80)}㌔の重さ${'後'.repeat(80)}`, tags: [] });
  const excerpt = buildMatchExcerpt(seed, 'キロ');
  assert.equal(excerpt?.field, 'body'); // 一致の理由（本文）は示す。位置がずれる文字を含むときは先頭から見せる
  assert.ok(excerpt && excerpt.text.length > 0);
  const plain = buildMatchExcerpt(makeSeed('p', { body: `${'前'.repeat(60)}ＡＢＣ${'後'.repeat(60)}`, tags: [] }), 'abc');
  assert.ok(plain?.text.includes('ＡＢＣ') && plain.text.startsWith('…'));
});

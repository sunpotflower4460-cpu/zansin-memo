import type { GardenStoreV2, Seed } from '../domain/types';
import { STORE_VERSION } from '../data/gardenModel';
import { growthStateLabels, moodLabels, transformLabels } from './displayLabels';
import { toSeedSnippet } from './seedText';

export type ExportFormat = 'json' | 'text';

export const EXPORT_VERSION = 2;

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * JSON は全データ書出し。削除済みのメモ・つながり・芽と材料・下書きもすべて含む。
 * 書出しファイルをアプリへ取り込んで復元する機能は、現時点ではない。
 */
export const buildJsonExport = (store: GardenStoreV2): string =>
  JSON.stringify(
    {
      exportFormat: 'kizashi-notes',
      exportVersion: EXPORT_VERSION,
      storeVersion: STORE_VERSION,
      exportedAt: new Date().toISOString(),
      revision: store.revision,
      includes: ['deletedSeeds', 'connections', 'syntheses', 'drafts'],
      counts: {
        seeds: store.seeds.length,
        deletedSeeds: store.seeds.filter((seed) => seed.deletedAt).length,
        connections: store.connections.length,
        syntheses: store.seeds.filter((seed) => seed.synthesis).length,
        drafts: store.drafts.length,
      },
      seeds: store.seeds,
      connections: store.connections,
      drafts: store.drafts,
    },
    null,
    2,
  );

const NOTES = [
  'このテキストには、削除済みのメモと下書きは含まれません。すべてを含むJSON書き出しとは範囲が異なります。',
  'この書き出しからアプリへデータを復元する機能は、現時点ではありません。',
];

/** 通常のテキスト書出し。非削除のメモと、つながり・芽・材料の意味を読める形で出す。削除済み材料の本文は出さない。 */
export const buildTextExport = (store: GardenStoreV2): string => {
  const live = store.seeds.filter((seed) => !seed.deletedAt);
  const byId = new Map<string, Seed>(store.seeds.map((seed) => [seed.id, seed]));
  const header = [
    'Kizashi Notes 書き出し',
    `書き出し日時: ${new Date().toLocaleString('ja-JP')}`,
    `メモの数: ${live.length}`,
    `つながり: ${store.connections.filter((c) => !byId.get(c.aSeedId)?.deletedAt && !byId.get(c.bSeedId)?.deletedAt).length}件`,
    `storeVersion: ${STORE_VERSION}`,
    ...NOTES,
    '='.repeat(40),
  ].join('\n');

  if (live.length === 0) {
    return `${header}\n\n（メモはまだありません）\n`;
  }

  const blocks = live.map((seed, index) => {
    const lines: string[] = [`【${index + 1}】${seed.title ? ` ${seed.title}` : ''}`, seed.body];

    const meta: string[] = [`育ち方: ${growthStateLabels[seed.growthState]}`, `大切度: ${seed.importance}`];
    if (seed.mood) meta.push(`気分: ${moodLabels[seed.mood]}`);
    if (seed.tags.length > 0) meta.push(`カテゴリ: ${seed.tags.join(', ')}`);
    meta.push(`作成: ${formatDate(seed.createdAt)}`, `更新: ${formatDate(seed.updatedAt)}`);
    lines.push(meta.join(' · '));

    if (seed.synthesis) {
      lines.push('', `  できそうなこと（芽）: ${seed.synthesis.statement}`, '  芽の材料:');
      for (const source of seed.synthesis.sources) {
        const origin = byId.get(source.seedId);
        const part = source.sourcePart === 'synthesis' ? '芽の文' : '元のメモ';
        lines.push(origin?.deletedAt ? `  - （削除済みのメモ）` : `  - [${part}] ${source.textSnapshot}`);
      }
    } else if (seed.growthState === 'sprout' || seed.growthState === 'tree') {
      lines.push('', '  （以前からの育ち状態。芽の文章は書かれていません）');
    }

    const connected = store.connections
      .filter((c) => c.aSeedId === seed.id || c.bSeedId === seed.id)
      .map((c) => ({ connection: c, other: byId.get(c.aSeedId === seed.id ? c.bSeedId : c.aSeedId) }))
      .filter((item): item is { connection: typeof item.connection; other: Seed } => Boolean(item.other && !item.other.deletedAt));
    if (connected.length > 0) {
      lines.push('', '  つながり:');
      for (const { connection, other } of connected) {
        const legacy = connection.origin === 'legacy' ? '（以前からのつながり）' : '';
        const note = connection.note ? ` — ${connection.note}` : '';
        lines.push(`  - ${toSeedSnippet(other, 40)}${legacy}${note}`);
      }
    }

    if (seed.transformOutputs && seed.transformOutputs.length > 0) {
      lines.push('', '  書き出し方（変換）:');
      for (const output of seed.transformOutputs) {
        lines.push(`  [${transformLabels[output.type]}] ${output.content}`);
      }
    }
    return lines.join('\n');
  });

  return `${header}\n\n${blocks.join('\n\n' + '-'.repeat(40) + '\n\n')}\n`;
};

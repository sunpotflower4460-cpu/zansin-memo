import type { Seed } from '../domain/types';
import { SEED_SCHEMA_VERSION } from '../domain/types';
import { growthStateLabels, moodLabels, transformLabels } from './displayLabels';

export type ExportFormat = 'json' | 'text';

const EXPORT_SCHEMA_VERSION = SEED_SCHEMA_VERSION;

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

export const buildJsonExport = (seeds: Seed[]): string => {
  const payload = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    count: seeds.length,
    seeds,
  };
  return JSON.stringify(payload, null, 2);
};

export const buildTextExport = (seeds: Seed[]): string => {
  const header = [
    'Kizashi Notes バックアップ',
    `エクスポート日時: ${new Date().toLocaleString('ja-JP')}`,
    `種の数: ${seeds.length}`,
    `schemaVersion: ${EXPORT_SCHEMA_VERSION}`,
    '='.repeat(40),
  ].join('\n');

  if (seeds.length === 0) {
    return `${header}\n\n（種はまだありません）\n`;
  }

  const seedTexts = seeds.map((seed, index) => {
    const lines: string[] = [];
    lines.push(`【${index + 1}】${seed.title ? ` ${seed.title}` : ''}`);
    lines.push(seed.body);

    const meta: string[] = [];
    meta.push(`状態: ${growthStateLabels[seed.growthState]}`);
    meta.push(`大切度: ${seed.importance}`);
    if (seed.mood) {
      meta.push(`気分: ${moodLabels[seed.mood]}`);
    }
    if (seed.tags.length > 0) {
      meta.push(`タグ: ${seed.tags.join(', ')}`);
    }
    meta.push(`作成: ${formatDate(seed.createdAt)}`);
    meta.push(`更新: ${formatDate(seed.updatedAt)}`);
    if (seed.deletedAt) {
      meta.push(`削除: ${formatDate(seed.deletedAt)}`);
    }
    lines.push(meta.join(' · '));

    if (seed.transformOutputs && seed.transformOutputs.length > 0) {
      lines.push('  変換出力:');
      for (const output of seed.transformOutputs) {
        const label = transformLabels[output.type];
        lines.push(`  [${label}] ${output.content}`);
      }
    }

    return lines.join('\n');
  });

  return `${header}\n\n${seedTexts.join('\n\n' + '-'.repeat(40) + '\n\n')}\n`;
};

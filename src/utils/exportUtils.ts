import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Seed } from '../domain/types';
import { buildJsonExport, buildTextExport, type ExportFormat } from './exportFormat';

export type { ExportFormat } from './exportFormat';

export type ExportResult =
  | { ok: true }
  | { ok: false; message: string };

export const exportSeeds = async (seeds: Seed[], format: ExportFormat): Promise<ExportResult> => {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    return { ok: false, message: '共有機能はこの端末では利用できません。' };
  }

  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const isJson = format === 'json';
  const content = isJson ? buildJsonExport(seeds) : buildTextExport(seeds);
  const ext = isJson ? 'json' : 'txt';
  const mimeType = isJson ? 'application/json' : 'text/plain';
  const filename = `kizashi-notes-backup-${now}.${ext}`;

  let fileUri: string;

  try {
    const file = new File(Paths.cache, filename);
    file.write(content);
    fileUri = file.uri;
  } catch {
    return { ok: false, message: 'ファイルの書き出しに失敗しました。' };
  }

  try {
    await Sharing.shareAsync(fileUri, {
      mimeType,
      dialogTitle: 'Kizashi Notes バックアップを保存',
      UTI: isJson ? 'public.json' : 'public.plain-text',
    });
  } catch {
    return { ok: false, message: '共有シートの表示に失敗しました。' };
  }

  return { ok: true };
};


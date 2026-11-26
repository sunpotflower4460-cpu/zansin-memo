import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { GardenStoreV2 } from '../domain/types';
import { buildJsonExport, buildTextExport, type ExportFormat } from './exportFormat';

export type { ExportFormat } from './exportFormat';

export type ExportResult = { ok: true } | { ok: false; message: string };

export const exportGarden = async (store: GardenStoreV2, format: ExportFormat): Promise<ExportResult> => {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    return { ok: false, message: '共有機能はこの端末では利用できません。' };
  }

  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const isJson = format === 'json';
  const content = isJson ? buildJsonExport(store) : buildTextExport(store);
  const filename = `kizashi-notes-export-${now}.${isJson ? 'json' : 'txt'}`;

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
      mimeType: isJson ? 'application/json' : 'text/plain',
      dialogTitle: 'Kizashi Notes の書き出しを保存',
      UTI: isJson ? 'public.json' : 'public.plain-text',
    });
  } catch {
    return { ok: false, message: '共有シートの表示に失敗しました。' };
  }
  return { ok: true };
};

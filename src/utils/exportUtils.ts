import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { GardenStoreV2 } from '../domain/types';
import { buildJsonExport, buildTextExport, type ExportFormat } from './exportFormat';
import { createId } from './ids';

export type { ExportFormat } from './exportFormat';

export type ExportResult = { ok: true } | { ok: false; message: string };

const EXPORT_FILE_PREFIX = 'kizashi-notes-export-';

const discardTemporaryExport = (file: File | undefined): void => {
  try {
    if (file?.exists) {
      file.delete();
    }
  } catch {
    // 一時ファイルが残った場合は、データの全削除でも消去する。
  }
};

export const clearTemporaryExports = (): boolean => {
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && entry.name.startsWith(EXPORT_FILE_PREFIX) && /\.(json|txt)$/.test(entry.name)) {
        entry.delete();
      }
    }
    return true;
  } catch {
    return false;
  }
};

export const exportGarden = async (store: GardenStoreV2, format: ExportFormat): Promise<ExportResult> => {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    return { ok: false, message: '共有機能はこの端末では利用できません。' };
  }

  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const isJson = format === 'json';
  const content = isJson ? buildJsonExport(store) : buildTextExport(store);
  const filename = `${EXPORT_FILE_PREFIX}${now}-${createId()}.${isJson ? 'json' : 'txt'}`;
  let file: File | undefined;

  try {
    file = new File(Paths.cache, filename);
    file.write(content);
  } catch {
    discardTemporaryExport(file);
    return { ok: false, message: 'ファイルの書き出しに失敗しました。' };
  }

  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: isJson ? 'application/json' : 'text/plain',
      dialogTitle: 'Kizashi Notes の書き出しを保存',
      UTI: isJson ? 'public.json' : 'public.plain-text',
    });
    return { ok: true };
  } catch {
    return { ok: false, message: '共有シートの表示に失敗しました。' };
  } finally {
    discardTemporaryExport(file);
  }
};

import type { GardenStoreV2 } from '../domain/types';
import { buildJsonExport, buildTextExport, type ExportFormat } from './exportFormat';
import type { ExportResult } from './exportUtils';

export type { ExportFormat } from './exportFormat';
export type { ExportResult } from './exportUtils';

// Web版はダウンロード先をブラウザが管理する。
export const clearTemporaryExports = (): boolean => true;

/** Web版の書き出し。expo-file-system は Web に対応しないため、ブラウザのダウンロードとして保存する。 */
export const exportGarden = async (store: GardenStoreV2, format: ExportFormat): Promise<ExportResult> => {
  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const isJson = format === 'json';
  const filename = `kizashi-notes-export-${now}.${isJson ? 'json' : 'txt'}`;

  try {
    const content = isJson ? buildJsonExport(store) : buildTextExport(store);
    const type = isJson ? 'application/json' : 'text/plain;charset=utf-8';
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // クリック直後に解放すると保存が中断されるブラウザがあるため、少し待つ。
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    return { ok: false, message: 'ファイルの書き出しに失敗しました。' };
  }
  return { ok: true };
};

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { createId } from '../utils/ids';
import { rasterPagePdf, type GeneratedWorkFile } from './workFileTypes';

const directory = () => new Directory(Paths.cache, 'kizashi-plus-preview-exports');

function outputFile(content: string | Uint8Array, format: GeneratedWorkFile['format']): GeneratedWorkFile {
  const destination = directory();
  destination.create({ idempotent: true });
  const extension = format === 'text' ? 'txt' : format;
  const file = new File(destination, `kizashi-${createId()}.${extension}`);
  try { file.write(content); }
  catch (error) { if (file.exists) file.delete(); throw error; }
  return {
    format,
    deliver: async () => {
      if (!file.exists || !(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available');
      const mimeType = { png: 'image/png', pdf: 'application/pdf', text: 'text/plain', json: 'application/json' }[format];
      await Sharing.shareAsync(file.uri, { mimeType });
    },
    discard: () => { try { if (file.exists) file.delete(); } catch { /* The preview purges this cache on restart. */ } },
  };
}

export async function makeWorkFile(view: View, format: 'png' | 'pdf'): Promise<GeneratedWorkFile> {
  const uri = await captureRef(view, { format: 'png', result: 'tmpfile', useRenderInContext: true });
  try {
    const png = await new File(uri).bytes();
    if (!png.length) throw new Error('The paper could not be rendered');
    return outputFile(format === 'pdf' ? await rasterPagePdf(png) : png, format);
  } finally { releaseCapture(uri); }
}

export async function makeWorkText(text: string): Promise<GeneratedWorkFile> { return outputFile(text, 'text'); }
export async function makeGardenFile(data: string, format: 'json' | 'text'): Promise<GeneratedWorkFile> { return outputFile(data, format); }

export function clearWorkFileCache(): void {
  try { const cache = directory(); if (cache.exists) cache.delete(); }
  catch { /* A cache failure never changes stored works. */ }
}

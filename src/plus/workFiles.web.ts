import { toBlob } from 'html-to-image';
import type { View } from 'react-native';
import { rasterPagePdf, type GeneratedWorkFile } from './workFileTypes';

function download(blob: Blob, name: string, format: GeneratedWorkFile['format']): GeneratedWorkFile {
  let available = true;
  return {
    format,
    deliver: async () => {
      if (!available) throw new Error('The output file is no longer available');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    },
    discard: () => { available = false; },
  };
}

export async function makeWorkFile(view: View, format: 'png' | 'pdf'): Promise<GeneratedWorkFile> {
  const png = await toBlob(view as unknown as HTMLElement, { pixelRatio: 3, skipFonts: true });
  if (!png || !png.size) throw new Error('The paper could not be rendered');
  if (format === 'png') return download(png, 'kizashi-card.png', format);
  const pdf = await rasterPagePdf(new Uint8Array(await png.arrayBuffer()));
  return download(new Blob([Uint8Array.from(pdf)], { type: 'application/pdf' }), 'kizashi-page.pdf', format);
}

export async function makeWorkText(text: string): Promise<GeneratedWorkFile> {
  return download(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'kizashi-work.txt', 'text');
}

export async function makeGardenFile(data: string, format: 'json' | 'text'): Promise<GeneratedWorkFile> {
  return format === 'json' ? download(new Blob([data], { type: 'application/json' }), 'kizashi-data.json', format)
    : download(new Blob([data], { type: 'text/plain;charset=utf-8' }), 'kizashi-data.txt', format);
}

export function clearWorkFileCache(): void { /* Files live in each preview until it closes. */ }

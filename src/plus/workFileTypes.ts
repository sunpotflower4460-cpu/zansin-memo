export type GeneratedWorkFile = { format: 'png' | 'pdf' | 'text'; deliver: () => Promise<void>; discard: () => void };

export async function rasterPagePdf(png: Uint8Array): Promise<Uint8Array> {
  // The published CommonJS entry keeps tslib's named helpers intact under Metro.
  const { PDFDocument } = await import('pdf-lib/cjs');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const image = await pdf.embedPng(png);
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  return pdf.save();
}

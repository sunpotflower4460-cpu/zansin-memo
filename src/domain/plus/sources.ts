import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { Seed } from '../types';
import type { Lineage, SourceRef, SourceSnapshot } from './contracts';

/** Exact UTF-16, including line breaks, combining marks and unpaired code units. */
export function textDigest(text: string): string {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    bytes[i * 2] = unit & 255;
    bytes[i * 2 + 1] = unit >>> 8;
  }
  return bytesToHex(sha256(bytes));
}

export function readSource(seeds: readonly Seed[], ref: SourceRef, currentPart = false) {
  const seed = seeds.find((item) => item.id === ref.seedId);
  if (!seed || seed.deletedAt) return undefined;
  if (ref.part === 'body') return { text: seed.body, title: seed.title, updatedAt: seed.updatedAt };
  const synthesis = seed.synthesis;
  if (!synthesis || (!currentPart && synthesis.id !== ref.synthesisId)) return undefined;
  return { text: synthesis.statement, title: seed.title, updatedAt: synthesis.updatedAt };
}

export function sourceLineage(seeds: readonly Seed[], ref: SourceRef): Lineage {
  const byId = new Map(seeds.map((seed) => [seed.id, seed]));
  const roots = new Set<string>();
  const visited = new Set<string>();
  const stack = [ref];
  let status: Lineage['status'] = 'known';
  while (stack.length) {
    const part = stack.pop()!;
    const key = JSON.stringify(part);
    if (visited.has(key)) continue;
    visited.add(key);
    roots.add(part.seedId);
    const seed = byId.get(part.seedId);
    if (!seed) { status = 'unknown'; continue; }
    if (part.part === 'body') continue;
    if (seed.synthesis?.id !== part.synthesisId) { status = 'unknown'; continue; }
    for (const source of seed.synthesis.sources) {
      if (source.sourcePart === 'body') stack.push({ seedId: source.seedId, part: 'body' });
      else if (source.sourceSynthesisId) stack.push({ seedId: source.seedId, part: 'synthesis', synthesisId: source.sourceSynthesisId });
      else status = 'unknown';
    }
  }
  return { rootSeedIds: [...roots].sort(), status };
}

export function mergeLineage(...lineages: Lineage[]): Lineage {
  return {
    rootSeedIds: [...new Set(lineages.flatMap((entry) => entry.rootSeedIds))].sort(),
    status: lineages.every((entry) => entry.status === 'known') ? 'known' : 'unknown',
  };
}

export function snapshotSource(seeds: readonly Seed[], ref: SourceRef, id: string, at: string): SourceSnapshot | undefined {
  const value = readSource(seeds, ref);
  return value && {
    id, source: { ref, textDigest: textDigest(value.text), updatedAt: value.updatedAt },
    text: value.text, title: value.title, capturedAt: at, lineage: sourceLineage(seeds, ref),
  };
}

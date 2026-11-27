import type { GardenStoreV3 } from '../domain/plus/contracts';
import type { StorageLike } from './gardenStorage';
import { GardenCommitWriter, type GardenCommand, type WriterOptions } from './gardenWriter';
import { emptyStoreV3, parseStoreV3, serializeStoreV3 } from './gardenV3Model';
import { beginDeletionV3, finishDeletionV3, PLUS_KEYS } from './gardenV3Storage';

export type PlusCommand = GardenCommand<GardenStoreV3>;

export class GardenV3Writer extends GardenCommitWriter<GardenStoreV3> {
  constructor(storage: StorageLike, initial: GardenStoreV3, options?: WriterOptions & { needsInitialPersist?: boolean }) {
    super(storage, initial, {
      main: PLUS_KEYS.main,
      lastGood: PLUS_KEYS.lastGood,
      empty: emptyStoreV3,
      serialize: serializeStoreV3,
      confirm: (raw, expected, current, recovering) => {
        if (raw === serializeStoreV3(expected)) return 'committed';
        const parsed = raw === null ? undefined : parseStoreV3(raw);
        if (parsed?.ok) {
          return parsed.store.revision === current.revision && parsed.store.lastMutationId === current.lastMutationId
            ? 'not_committed' : 'unknown';
        }
        return recovering && parsed?.reason !== 'unsupported_version' ? 'not_committed' : 'unknown';
      },
      beginDeletion: beginDeletionV3,
      finishDeletion: finishDeletionV3,
    }, options);
  }
}

/** Run an existing core operation inside the v3 commit, preserving all Plus data. */
export function withCoreCommand(command: GardenCommand): PlusCommand {
  return {
    ...command,
    apply: (store) => {
      const core = { storeVersion: 2 as const, seeds: store.seeds, connections: store.connections, drafts: store.drafts,
        revision: store.revision, lastMutationId: store.lastMutationId };
      const result = command.apply(core);
      if ('rejected' in result) return result;
      return result === core ? store : { ...store, seeds: result.seeds, connections: result.connections, drafts: result.drafts };
    },
  };
}

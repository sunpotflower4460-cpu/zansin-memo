import type { StorageLike } from './gardenStorage';

export function isolatePlusPreview(storage: StorageLike): StorageLike {
  const prefix = 'kizashi-plus-preview:';
  const key = (value: string) => prefix + value;
  return {
    getItem: (value) => storage.getItem(key(value)),
    setItem: (value, raw) => storage.setItem(key(value), raw),
    removeItem: (value) => storage.removeItem(key(value)),
    multiRemove: (values) => storage.multiRemove(values.map(key)),
    getAllKeys: async () => (await storage.getAllKeys()).flatMap((value) => value.startsWith(prefix) ? [value.slice(prefix.length)] : []),
  };
}

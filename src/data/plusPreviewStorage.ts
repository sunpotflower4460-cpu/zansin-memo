import type { StorageLike } from './gardenStorage';

const prefix = 'kizashi-plus-preview:';
export const plusPreviewWriterLock = `${prefix}writer`;

export function isolatePlusPreview(storage: StorageLike, isOpen = () => true): StorageLike {
  const requireOpen = () => { if (!isOpen()) throw new Error('Plus preview storage was closed'); };
  const key = (value: string) => prefix + value;
  return {
    getItem: async (value) => { requireOpen(); return storage.getItem(key(value)); },
    setItem: async (value, raw) => { requireOpen(); return storage.setItem(key(value), raw); },
    removeItem: async (value) => { requireOpen(); return storage.removeItem(key(value)); },
    multiRemove: async (values) => { requireOpen(); return storage.multiRemove(values.map(key)); },
    getAllKeys: async () => {
      requireOpen();
      return (await storage.getAllKeys()).flatMap((value) => value.startsWith(prefix) ? [value.slice(prefix.length)] : []);
    },
  };
}

export function previewTabStorage(): StorageLike {
  const tab = window.sessionStorage;
  return {
    getItem: async (key) => tab.getItem(key),
    setItem: async (key, raw) => tab.setItem(key, raw),
    removeItem: async (key) => tab.removeItem(key),
    multiRemove: async (keys) => { for (const key of keys) tab.removeItem(key); },
    getAllKeys: async () => Object.keys(tab),
  };
}

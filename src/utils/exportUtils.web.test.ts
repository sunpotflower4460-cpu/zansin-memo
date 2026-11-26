import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { emptyStore } from '../data/gardenModel';
import { exportGarden } from './exportUtils.web';

type FakeLink = { href: string; download: string; click: () => void; remove: () => void };

const fakeBrowser = (t: TestContext) => {
  const saved: Array<{ href: string; download: string }> = [];
  const blobs: Blob[] = [];
  const revoked: string[] = [];
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => {
        const link: FakeLink = {
          href: '',
          download: '',
          click: () => saved.push({ href: link.href, download: link.download }),
          remove: () => {},
        };
        return link;
      },
      body: { appendChild: () => {} },
    },
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'document'));
  t.mock.method(URL, 'createObjectURL', (blob: Blob) => {
    blobs.push(blob);
    return 'blob:test';
  });
  t.mock.method(URL, 'revokeObjectURL', (url: string) => {
    revoked.push(url);
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  return { saved, blobs, revoked };
};

test('web JSON export downloads a .json file with the full data, then releases the URL', async (t) => {
  const browser = fakeBrowser(t);
  assert.deepEqual(await exportGarden(emptyStore(), 'json'), { ok: true });
  assert.equal(browser.saved.length, 1);
  assert.match(browser.saved[0].download, /^kizashi-notes-export-.+\.json$/);
  assert.equal(browser.saved[0].href, 'blob:test');
  assert.equal(browser.blobs[0].type, 'application/json');
  assert.equal(JSON.parse(await browser.blobs[0].text()).exportFormat, 'kizashi-notes');
  assert.deepEqual(browser.revoked, []);
  t.mock.timers.tick(60_000);
  assert.deepEqual(browser.revoked, ['blob:test']);
});

test('web text export downloads a .txt file', async (t) => {
  const browser = fakeBrowser(t);
  assert.deepEqual(await exportGarden(emptyStore(), 'text'), { ok: true });
  assert.match(browser.saved[0].download, /\.txt$/);
  assert.match(await browser.blobs[0].text(), /Kizashi Notes 書き出し/);
});

test('web export reports a failure instead of claiming success', async (t) => {
  const browser = fakeBrowser(t);
  t.mock.method(URL, 'createObjectURL', () => {
    throw new Error('blocked');
  });
  const result = await exportGarden(emptyStore(), 'json');
  assert.equal(result.ok, false);
  assert.equal(browser.saved.length, 0);
});

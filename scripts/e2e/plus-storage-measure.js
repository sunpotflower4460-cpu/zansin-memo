const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.env.PLUS_STORAGE_MEASURE_URL || 'http://localhost:8103/';
const benchKey = 'kizashi-plus-storage-measure:kizashi-notes:garden:v3';
const appKeys = ['kizashi-notes:garden:v2', 'kizashi-plus-preview:kizashi-notes:garden:v3'];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXEC });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(url);
    await page.evaluate((keys) => keys.forEach((key) => localStorage.setItem(key, 'sentinel')), appKeys);
    const report = async (label, expected) => {
      await page.getByRole('button', { name: label, exact: true }).click();
      const region = page.getByTestId('plus-storage-measure-result').filter({ hasText: expected });
      await region.waitFor({ timeout: 90_000 });
      return JSON.parse(await region.innerText());
    };
    const light = await report('軽い条件で計測（50件）', '"condition": "light"');
    assert.equal(light.envelopeBytes, 266_339);
    assert.equal(light.saved, 120);
    assert.equal(light.failure, undefined);
    assert.equal(light.restoredExactly, true);
    assert.equal(light.backupMatches, true);
    console.log('PASS light measurement through the v3 writer', light);

    const heavy = await report('重い条件で計測（5,000件）', '"condition": "heavy"');
    assert.equal(heavy.envelopeBytes, 25_675_031);
    if (heavy.failure) {
      assert.deepEqual([heavy.stage, heavy.failure], ['initial', 'main_write_failed']);
      assert.equal(heavy.storageError, 'QuotaExceededError');
      console.log('PASS Chromium capacity failure reported during initialization', heavy);
    } else {
      assert.equal(heavy.saved, 120);
      assert.equal(heavy.restoredExactly, true);
      assert.equal(heavy.backupMatches, true);
      console.log('PASS heavy measurement through the v3 writer', heavy);
    }

    await page.reload();
    const reopened = await report('最後の保存を読み直す', '"status": "ready"');
    assert.equal(reopened.seeds, heavy.failure ? 50 : 5_000);
    assert.equal(reopened.draftEditRevision, 120);
    assert.equal(reopened.source, 'v3');
    const keys = await page.evaluate(({ app, bench }) => ({ app: app.map((key) => localStorage.getItem(key)), persistentBench: localStorage.getItem(bench) }),
      { app: appKeys, bench: benchKey });
    assert.deepEqual(keys, { app: ['sentinel', 'sentinel'], persistentBench: null });
    console.log('PASS replay after reload with both application stores untouched', reopened);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { makeConnection } = require('../../src/data/gardenModel.ts');
const { emptyStoreV3 } = require('../../src/data/gardenV3Model.ts');
const { buildPlusExample } = require('../../src/data/plusExample.ts');

const plusUrl = process.env.PLUS_E2E_URL || 'http://localhost:8101/';
const button = (page, name) => page.getByRole('button', { name, exact: true });
const storageKey = 'kizashi-plus-preview:kizashi-notes:garden:v3';
const hub = '散歩の記録';
const neighbor = '雨の日の音';
const title = '川辺の銀杏から始まる長い題名のメモ';
const body = `川辺で見つけた光について。\n${'longunbrokenword'.repeat(12)}\n🌱 写真を一枚だけ残してみる。`;

async function measure(page, size) {
  const { seeds, connections } = buildPlusExample(size);
  Object.assign(seeds.at(-1), { title, body });
  // A real cycle through the hub and two neighbors tests traversal without adding any inferred edges.
  connections.push(makeConnection('example-8', 'example-9', 'manual', seeds[0].createdAt));
  const storage = JSON.stringify({ ...emptyStoreV3(), seeds, connections });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: storage });
  const start = performance.now();
  await page.goto(plusUrl);
  const overview = page.getByLabel('まとまりの地図', { exact: true });
  await overview.getByTestId('map-link-layer').waitFor();
  assert.equal(await overview.getByRole('button').count(), 5);
  const initialMs = Math.round(performance.now() - start);

  const search = page.getByLabel('地図と全件を探す');
  await search.fill(hub);
  await button(page, `${hub} · 選ぶ`).first().click();
  await button(page, '周辺').click();
  await button(page, '検索を閉じる').click();
  const plot = page.getByLabel('確定したつながりの図', { exact: true });
  await plot.getByRole('button', { name: hub, exact: true, pressed: true }).waitFor();
  const focusP95 = await plot.evaluate(async (canvas, labels) => {
    const buttons = [...canvas.querySelectorAll('button[aria-pressed]')];
    const controls = labels.map((label) => buttons.find((node) => node.getAttribute('aria-label') === label));
    if (!controls.every(Boolean)) throw new Error('Both focal cards must remain visible');
    const samples = [];
    for (let i = 0; i < 20; i++) {
      const target = controls[i % controls.length];
      const start = performance.now();
      target.click();
      for (let frame = 0; target.getAttribute('aria-pressed') !== 'true'; frame++) {
        if (frame >= 120) throw new Error('Selection never reached the activated card');
        await new Promise(requestAnimationFrame);
      }
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    return Math.round(samples[18] * 10) / 10;
  }, [neighbor, hub]);
  const degree = 1 + Math.min(size, 309) - 8;
  await page.getByText(`選択中 · 範囲内の確定接続 ${degree}件`, { exact: true }).waitFor();
  const cards = await plot.getByRole('button').count();
  assert.ok(cards >= 2 && cards < degree);
  const expand = button(page, 'もう一段見る');
  await expand.click();
  await expand.click();
  await page.getByRole('heading', { name: `周辺の種 · ${degree + 3}件`, exact: true }).waitFor();
  assert.equal(await expand.isDisabled(), true);

  await search.fill('銀杏');
  await button(page, `${title}の原文を開く`).click();
  await page.getByText(body, { exact: true }).filter({ visible: true }).waitFor();
  await button(page, '地図に戻る').click();
  await plot.getByRole('button', { name: hub, exact: true, pressed: true }).waitFor();
  assert.equal(await search.inputValue(), '銀杏');
  assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).connections.length, storageKey), connections.length);
  return { notes: size, connections: connections.length, degree, cards, bytes: Buffer.byteLength(storage), initialMs, focusP95 };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXEC });
  try {
    for (const size of [50, 500, 2_000, 5_000]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'ja-JP' });
      const errors = [];
      page.setDefaultTimeout(20_000);
      page.on('pageerror', (error) => errors.push(error.message));
      console.log('PASS', await measure(page, size));
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

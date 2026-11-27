const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const freeUrl = process.env.FREE_E2E_URL || 'http://localhost:8102/';
const plusUrl = process.env.PLUS_E2E_URL || 'http://localhost:8101/';
const coreKey = 'kizashi-notes:garden:v2';
const plusKey = 'kizashi-plus-preview:kizashi-notes:garden:v3';
const controls = (page) => ({
  button: (name) => page.getByRole('button', { name, exact: true }),
  read: (key) => page.evaluate((value) => JSON.parse(localStorage.getItem(value)), key),
});
const roundtrip = async (page, button) => {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

async function freeLoop(page) {
  const { button, read } = controls(page);
  const first = '散歩の時間を写真で覚えておきたい。';
  const second = '近況は短い言葉で伝えてみる。';
  const sprout = '週に一枚の写真とひとことを残せそう。';
  await page.goto(freeUrl);
  await page.getByLabel('書くタブ').click();
  for (const body of [first, second]) {
    await page.getByLabel('メモの本文').fill(body);
    await button('保存する').click();
    await page.waitForFunction(({ key, body }) => JSON.parse(localStorage.getItem(key))?.seeds.some((seed) => seed.body === body), { key: coreKey, body });
    await button('続けて書く').click();
  }
  await page.getByLabel('種一覧タブ').click();
  await page.getByLabel('メモを選んでつなげる').click();
  await page.getByLabel(/^選んでいません。散歩の時間/).click();
  await page.getByLabel(/^選んでいません。近況は短い/).click();
  await button('2つをつなげる').click();
  await page.getByRole('heading', { name: 'つながり 1件', exact: true }).waitFor();
  await page.getByLabel('リストで見る', { exact: true }).click();
  await page.getByLabel(/このメモを開く。近況は短い/).waitFor();
  await page.getByLabel('ここに書いて芽にする').click();
  await page.getByLabel('できそうなこと').fill(sprout);
  await button('芽として保存').click();
  await page.waitForFunction(({ key, sprout }) => JSON.parse(localStorage.getItem(key))?.seeds.some((seed) => seed.synthesis?.statement === sprout), { key: coreKey, sprout });
  await page.reload();
  await page.getByLabel('種一覧タブ').click();
  await page.getByLabel('メモの検索').fill('ひとことを残せそう');
  await page.getByLabel(/^メモを開く。散歩の時間/).waitFor();
  const state = await read(coreKey);
  assert.equal(state.seeds.length, 2);
  assert.equal(state.connections.length, 1);
  assert.equal(state.seeds.find((seed) => seed.body === first).synthesis.statement, sprout);
  assert.equal(await page.getByText(/Kizashi Plus 開発プレビュー/).count(), 0);
  await page.getByLabel('ホームタブ').click();
  await page.getByLabel('設定・バックアップ・サポート').click();
  const exported = JSON.parse(await roundtrip(page, page.getByLabel('JSONでエクスポートする')));
  assert.equal(exported.exportVersion, 2);
  assert.equal(exported.seeds.find((seed) => seed.body === first).synthesis.statement, sprout);
  await page.getByLabel('すべてのデータを削除する').click();
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key))?.seeds.length === 0, coreKey);
  await page.reload();
  await page.getByLabel('種一覧タブ').waitFor();
  assert.equal((await read(coreKey)).seeds.length, 0);
  console.log('PASS Free: write, connect, diagram/list, sprout, full search, JSON, deletion and restart');
}

async function plusLoop(page) {
  const { button, read } = controls(page);
  await page.goto(plusUrl);
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ fixtureSentinel: true })), coreKey);
  await button('例の庭を開く').click();
  await page.getByLabel('地図と全件を探す').fill('散歩の記録');
  await button('散歩の記録 · 選ぶ').first().click();
  if (process.env.PLUS_EXPECT_AI_DISABLED === '1') assert.equal(await button('候補を見る').count(), 0);
  await button('アトリエで開く').click();
  const text = '見つけた光から、短い便りをつくる。';
  await page.getByLabel('アトリエの下書き').fill(text);
  await button('この版を残す').click();
  await button('芽にする内容を確認').click();
  await button('この版を芽として保存').click();
  await page.getByText('芽として保存しました', { exact: true }).waitFor();
  await button('この版を作品にする').click();
  await page.getByLabel('作品の題名').fill('短い便り');
  await button('散歩の記録の当時の材料を作品に残す').click();
  await button('紙面を確認').click();
  await button('作品集に残す').click();
  await button('現在の原文を開く').click();
  await button('開いていた作品版に戻る').click();
  await button('作品集に戻る').click();
  await button('アトリエに戻る').click();
  await button('制作を始めた地図に戻る').click();
  await page.getByText('制作を始めた地図に戻りました', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('地図と全件を探す').inputValue(), '散歩の記録');
  const before = await read(plusKey);
  assert.equal(before.seeds.find((seed) => seed.id === 'example-0').synthesis.statement, text);
  assert.equal(before.collectionRevisions[0].textSnapshot, text);
  assert.equal(before.connections.length, 60);
  assert.equal(before.aiRequestReceipts.length, 0);
  await button('データを書き出す・削除する').click();
  await button('全データJSONを作る').click();
  await page.getByText('書き出すファイルを用意しました', { exact: true }).waitFor();
  const json = JSON.parse(await roundtrip(page, button('ファイルを取り出す・共有')));
  assert.equal(json.exportVersion, 3);
  assert.equal(json.collectionRevisions[0].textSnapshot, text);
  assert.equal(json.adoptionRecords.length, 1);
  assert.equal(json.atelierRevisions.length, 1);
  await button('例の庭の全データを削除する').click();
  await button('例の庭を開く').waitFor();
  await page.reload();
  await button('例の庭を開く').waitFor();
  assert.deepEqual(await read(coreKey), { fixtureSentinel: true });
  const after = await read(plusKey);
  assert.equal(after.seeds.length, 0);
  assert.equal(after.collectionItems.length, 0);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('kizashi-plus-preview:')).sort());
  assert.deepEqual(keys, [plusKey, `${plusKey}:lastGood`].sort());
  console.log('PASS Plus without AI: map, Atelier, sprout, work, current source, map return, JSON and isolated deletion');
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXEC });
  try {
    const errors = [];
    const external = [];
    for (const run of [freeLoop, plusLoop]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
      page.setDefaultTimeout(20_000);
      page.on('dialog', (dialog) => dialog.accept());
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        const value = request.url();
        if (/^https?:/.test(value) && ![new URL(freeUrl).origin, new URL(plusUrl).origin].includes(new URL(value).origin)) external.push(value);
      });
      await run(page);
      await page.close();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

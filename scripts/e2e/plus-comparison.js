const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const comparisonUrl = process.env.COMPARISON_URL || 'http://127.0.0.1:8104/';
const productionUrl = process.env.FREE_E2E_URL || 'http://127.0.0.1:8102/';
const coreKey = 'kizashi-notes:garden:v2';
const previewKey = 'kizashi-plus-preview:kizashi-notes:garden:v3';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXEC });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, locale: 'ja-JP' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const button = (name) => page.getByRole('button', { name, exact: true });
    const heading = (name) => page.getByRole('heading', { name, exact: true });
    const readStore = (key) => page.evaluate((value) => JSON.parse(localStorage.getItem(value)), key);

    await page.goto(productionUrl);
    await button('メモを書く').waitFor();
    assert.equal(await button('無料と Plus を比較').count(), 0);

    await page.goto(comparisonUrl);
    await button('メモを書く').click();
    const regularMemo = '比較の外で書いたメモ。';
    await page.getByLabel('メモの本文').fill(regularMemo);
    await button('保存する').click();
    await button('続けて書く').waitFor();
    await page.getByLabel('ホームタブ', { exact: true }).click();
    await button('無料と Plus を比較').click();
    const toggle = page.getByRole('switch', { name: 'Plus を試す', exact: true });
    await toggle.waitFor();
    assert.equal(await toggle.isChecked(), false);
    await button('例の庭を開く').click();
    await heading('無料版の地図').waitFor();
    await heading('散歩の記録').waitFor();
    assert.equal(await heading('考えの地図').count(), 0);
    assert.equal(await button('アトリエを開く').count(), 0);
    assert.equal(await button('作品集を開く').count(), 0);
    await page.getByLabel('リストで見る', { exact: true }).click();
    const examples = await readStore(previewKey);

    await toggle.click();
    await heading('考えの地図').waitFor();
    assert.equal(await toggle.isChecked(), true);
    assert.equal(await heading('無料版の地図').count(), 0);
    await page.getByRole('tab', { name: 'その他', exact: true }).click();
    await button('作品集を開く').click();
    await heading('作品集').waitFor();
    await button('その他に戻る').click();
    await button('アトリエを開く').click();
    await button('新しいアトリエ').click();
    const draft = page.getByLabel('アトリエの下書き', { exact: true });
    const text = '例の文章は無料に戻しても残る。';
    await draft.fill(text);
    await button('下書きを保存').click();
    await page.getByText('下書きを保存しました', { exact: true }).waitFor();
    await toggle.click();
    await page.getByText('無料版を表示中', { exact: true }).waitFor();
    assert.equal(await draft.inputValue(), text);
    assert.equal(await button('この版を残す').count(), 0);
    await button('アトリエを閉じる').click();
    assert.equal(await button('新しいアトリエ').count(), 0);
    await button('地図に戻る').click();
    await heading('無料版の地図').waitFor();

    await button('購入と復元を試す').click();
    await button('購入成功を試す').click();
    await page.getByText('試験用の利用権を反映しました', { exact: true }).waitFor();
    await button('確認画面を閉じる').click();
    await heading('考えの地図').waitFor();
    assert.equal(await toggle.isChecked(), true);
    await page.getByRole('tab', { name: 'その他', exact: true }).click();
    await button('購入と復元を試す').click();
    await button('試験条件を変える').click();
    await button('満了を表示').click();
    await button('確認画面を閉じる').click();
    await heading('無料版の地図').waitFor();
    assert.equal(await toggle.isChecked(), false);
    await button('比較を閉じる').click();
    await button('無料と Plus を比較').click();
    await button('アトリエを開く').click();
    await button(/を再開$/).click();
    assert.equal(await draft.inputValue(), text);
    assert.deepEqual((await readStore(previewKey)).seeds, examples.seeds);
    assert.deepEqual((await readStore(coreKey)).seeds.map((seed) => seed.body), [regularMemo]);
    assert.deepEqual(errors, []);
    console.log('PASS production exclusion, shared examples, Plus switch, saved draft, simulated purchase and expiry, core isolation');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

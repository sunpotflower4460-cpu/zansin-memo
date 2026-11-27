const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.env.PLUS_E2E_URL || 'http://localhost:8101/';
const key = 'kizashi-plus-preview:kizashi-notes:garden:v3';
const button = (page, name) => page.getByRole('button', { name, exact: true });
const read = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);

async function checkSharedStorage(browser) {
  const context = await browser.newContext();
  try {
    const first = await context.newPage();
    await first.goto(url);
    await button(first, '例の庭を開く').click();
    await button(first, '範囲と保存した見方').click();
    await first.getByLabel('見方の名前').fill('保存を引き継ぐ');
    await button(first, 'この見方を保存').click();
    await first.getByText('見方を保存しました', { exact: true }).waitFor();
    const initial = await read(first);

    async function waitingTab() {
      const page = await context.newPage();
      await page.goto(url);
      await page.getByRole('alert').filter({ hasText: '別のタブで例の庭が開いています' }).waitFor();
      assert.equal(await button(page, 'この見方を保存').count(), 0);
      return page;
    }
    const next = await waitingTab();
    await first.close();
    await button(next, '読み込みをやり直す').click();
    await button(next, '範囲と保存した見方').click();
    await button(next, '保存を引き継ぐを開く').waitFor();
    assert.deepEqual(await read(next), initial);

    const last = await waitingTab();
    next.on('dialog', (dialog) => dialog.accept());
    await button(next, 'データを書き出す・削除する').click();
    await button(next, '例の庭の全データを削除する').click();
    await button(next, '例の庭を開く').waitFor();
    await next.close();
    await button(last, '読み込みをやり直す').click();
    await button(last, '例の庭を開く').waitFor();
    const after = await read(last);
    assert.equal(after.seeds.length, 0);
    assert.equal(after.mapViews.length, 0);
    console.log('PASS exclusive Web writer retains saved views and never restores notes deleted in the previous tab');
  } finally { await context.close(); }
}

async function checkTabStorage(browser) {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }));
    const first = await context.newPage();
    await first.goto(url);
    await button(first, '例の庭を開く').click();
    await first.getByLabel('地図と全件を探す').waitFor();
    await first.getByText('例の庭はこのタブを開いている間だけ使えます。').waitFor();
    const next = await context.newPage();
    await next.goto(url);
    await button(next, '例の庭を開く').waitFor();
    assert.equal(await read(next), null);
    await first.reload();
    await first.getByLabel('地図と全件を探す').waitFor();
    console.log('PASS tab-local fixture storage when Web Locks are unavailable');
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXEC });
  try {
    await checkSharedStorage(browser);
    await checkTabStorage(browser);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

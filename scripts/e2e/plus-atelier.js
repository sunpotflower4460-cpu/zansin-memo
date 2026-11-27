const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXEC });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const button = (name) => page.getByRole('button', { name, exact: true });
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('kizashi-plus-preview:kizashi-notes:garden:v3')));
    await page.goto(process.env.PLUS_E2E_URL || 'http://localhost:8101/');
    await button('例の庭を開く').click();
    await page.getByLabel('地図と全件を探す').fill('散歩の記録');
    await button('散歩の記録 · 選ぶ').first().click();
    await button('参考にする').click();
    assert.equal((await read()).atelierProjects.length, 0);
    await button('アトリエで開く · 材料1件').click();
    const editor = page.getByLabel('アトリエの下書き');
    await editor.fill('好きな一節🌱\nもう一行を育てる。');
    await editor.evaluate((node) => node.setSelectionRange(0, 7));
    await button('選択中の一節を固定').click();
    await page.getByText(/固定した一節「好きな一節🌱」/).waitFor();
    await button('この版を残す').click();
    await page.getByText('版を保存しました', { exact: true }).waitFor();
    assert.equal((await read()).seeds.some((seed) => seed.synthesis), false);
    await button('作業中の文と比べる').click();
    await page.getByText('保存した版で異なる部分', { exact: true }).waitFor();
    await button('アトリエを閉じる').click();
    await page.getByText('選択中 · 範囲内の確定接続 57件', { exact: true }).waitFor();
    await page.reload();
    await button('アトリエを開く').click();
    await button('アトリエ 1を再開').click();
    assert.equal(await editor.inputValue(), '好きな一節🌱\nもう一行を育てる。');
    await button('芽にする内容を確認').click();
    assert.equal((await read()).adoptionRecords.length, 0);
    await button('この版を芽として保存').click();
    await page.getByText('芽として保存しました', { exact: true }).waitFor();
    const state = await read();
    assert.equal(state.adoptionRecords.length, 1);
    assert.equal(state.connections.length, 60);
    assert.equal(state.collectionItems.length, 0);
    await button('制作を始めた地図に戻る').click();
    await page.getByText('制作を始めた地図に戻りました', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('地図と全件を探す').inputValue(), '散歩の記録');
    console.log('PASS material tray, draft, fixed excerpt, revision, reload, explicit sprout adoption and origin map');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

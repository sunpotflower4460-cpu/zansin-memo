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
    await button('候補を見る').click();
    await page.getByLabel('候補づくりの材料を探す').fill('写真を一枚選ぶ');
    await button('写真を一枚選ぶ').click();
    await button('今回使う内容を確認').click();
    await page.getByRole('heading', { name: '今回だけ使う原文 · 2件' }).waitFor();
    assert.equal((await read()).aiRequestReceipts.length, 0);
    await button('この内容で例の候補を見る').click();
    await page.getByRole('heading', { name: '例の候補 · 条件と手がかり' }).waitFor();
    assert.equal((await read()).connections.length, 60);
    assert.equal((await read()).connectionProposals[0].evidence.length, 2);
    await button('この候補をつなぐ').click();
    await page.getByText('つながりを保存しました', { exact: true }).waitFor();
    const state = await read();
    assert.equal(state.connections.length, 61);
    assert.equal(state.connectionProposals[0].decision, 'accepted');
    assert.equal(state.connections.find((edge) => edge.id === state.connectionProposals[0].acceptedConnectionId).note, undefined);
    await button('地図に戻る').click();
    await page.getByText('選択中 · 範囲内の確定接続 58件', { exact: true }).waitFor();
    console.log('PASS one-time fixture confirmation, exact quotes, individual adoption and map return');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

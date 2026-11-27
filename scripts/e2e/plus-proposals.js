const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const button = (page, name) => page.getByRole('button', { name, exact: true });
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('kizashi-plus-preview:kizashi-notes:garden:v3')));

async function openConfirmation(page) {
  await page.goto(process.env.PLUS_E2E_URL || 'http://localhost:8101/');
  await button(page, '例の庭を開く').click();
  await page.getByLabel('地図と全件を探す').fill('散歩の記録');
  await button(page, '散歩の記録 · 選ぶ').first().click();
  await button(page, '候補を見る').click();
  await page.getByLabel('候補づくりの材料を探す').fill('写真を一枚選ぶ');
  await button(page, '写真を一枚選ぶ').click();
  await button(page, '今回使う内容を確認').click();
  await page.getByRole('heading', { name: '今回だけ使う原文 · 2件' }).waitFor();
  assert.equal((await read(page)).aiRequestReceipts.length, 0);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXEC });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await openConfirmation(page);
    await button(page, 'この内容で例の候補を見る').click();
    await page.getByRole('heading', { name: '例の候補 · 条件と手がかり' }).waitFor();
    assert.equal((await read(page)).connections.length, 60);
    assert.equal((await read(page)).connectionProposals[0].evidence.length, 2);
    await button(page, 'この候補をつなぐ').click();
    await page.getByText('つながりを保存しました', { exact: true }).waitFor();
    const state = await read(page);
    assert.equal(state.connections.length, 61);
    assert.equal(state.connectionProposals[0].decision, 'accepted');
    assert.equal(state.connections.find((edge) => edge.id === state.connectionProposals[0].acceptedConnectionId).note, undefined);
    await button(page, '地図に戻る').click();
    await page.getByText('選択中 · 範囲内の確定接続 58件', { exact: true }).waitFor();
    console.log('PASS one-time fixture confirmation, exact quotes, individual adoption and map return');

    const expired = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await expired.clock.install();
    await openConfirmation(expired);
    await expired.clock.fastForward(60 * 60_000 + 2_000);
    await button(expired, 'この内容で例の候補を見る').and(expired.locator('[aria-disabled="true"]')).waitFor();
    assert.equal((await read(expired)).aiRequestReceipts.length, 0);
    assert.equal((await read(expired)).connections.length, 60);
    await button(expired, '地図に戻る').click();
    await expired.getByLabel('地図と全件を探す').waitFor();
    console.log('PASS deadline disables a new request on an already open confirmation and preserves the map');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

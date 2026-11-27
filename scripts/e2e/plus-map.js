const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { buildPlusExample } = require('../../src/data/plusExample.ts');

const plusUrl = process.env.PLUS_E2E_URL || 'http://localhost:8101/';
const freeUrl = process.env.FREE_E2E_URL || 'http://localhost:8102/';
const options = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'ja-JP' };
const button = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' });
const hub = '散歩の記録';
const material = '川辺の銀杏';
const crossing = '同じ散歩を音と写真で記録した';

function counter() {
  let actions = 0;
  return {
    click: async (locator) => { await locator.click(); actions++; },
    fill: async (locator, text) => { await locator.fill(text); actions++; },
    report: () => actions,
  };
}

async function measureFree(page) {
  const { seeds, connections } = buildPlusExample();
  const data = { storeVersion: 2, revision: 1, seeds, connections, drafts: [] };
  await page.addInitScript((store) => {
    if (!localStorage.getItem('kizashi-notes:garden:v2')) {
      localStorage.setItem('kizashi-notes:garden:v2', JSON.stringify(store));
    }
  }, data);
  await page.goto(freeUrl);
  const group = counter();
  await group.click(page.getByLabel('種一覧タブ'));
  await group.click(button(page, '育ち方・カテゴリ・並び替え'));
  await group.click(button(page, '写真'));
  await page.getByLabel(/^メモを開く。写真を一枚選ぶ/).waitFor();
  await page.getByLabel(/^メモを開く。一日の便り/).waitFor();
  await group.click(button(page, '散歩'));
  await page.getByLabel(/^メモを開く。光の色/).waitFor();
  await page.getByLabel(/^メモを開く。散歩の記録/).waitFor();
  await group.click(page.getByLabel(/^メモを開く。雨の日の音/));
  await group.click(page.getByLabel('リストで見る', { exact: true }));
  await page.getByText(`つながる理由: ${crossing}`, { exact: true }).waitFor();

  await page.getByLabel(/^このメモを開く。散歩の記録/).click();
  await page.getByRole('heading', { name: 'つながり 57件', exact: true }).waitFor();
  const find = counter();
  const linkSearch = page.getByLabel('つながっているメモから探す');
  if (!(await linkSearch.isVisible())) await find.click(page.getByLabel('リストで見る', { exact: true }));
  await find.fill(linkSearch, '銀杏');
  await find.click(page.getByLabel(/^このメモを開く。川辺の銀杏/));
  await page.getByText(`${material}。写真に残したあとの印象。`, { exact: true }).waitFor();
  const back = counter();
  await back.click(page.getByLabel(/^ひとつ前のつながりへ。散歩の記録/));
  await page.getByRole('heading', { name: 'つながり 57件', exact: true }).waitFor();
  return { group: group.report(), find: find.report(), back: back.report(), expectedEdgeFound: true, returnSucceeded: true,
    repeatedSearch: (await linkSearch.isVisible()) && (await linkSearch.inputValue()) === '銀杏' ? 0 : 1 };
}

async function measurePlus(page) {
  await page.goto(plusUrl);
  await button(page, '例の庭を開く').click();
  const group = counter();
  await group.click(button(page, /^散歩で見つけたこと · 3件/));
  await page.getByRole('heading', { name: 'まとまりをまたぐ確定接続 1件' }).waitFor();
  await page.getByText(crossing, { exact: true }).waitFor();
  for (const label of ['散歩の記録', '雨の日の音', '光の色']) await button(page, `${label} · 選ぶ`).waitFor();
  await group.click(button(page, /^写真と便り · 2件/));
  await page.getByText(crossing, { exact: true }).waitFor();
  for (const label of ['写真を一枚選ぶ', '一日の便り']) await button(page, `${label} · 選ぶ`).waitFor();

  const search = page.getByLabel('地図と全件を探す');
  await search.fill(hub);
  await button(page, `${hub} · 選ぶ`).first().click();
  await button(page, '周辺').click();
  await button(page, '検索を閉じる').click();
  await page.getByLabel('確定したつながりの図').getByRole('button', { name: hub, exact: true, pressed: true }).waitFor();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(() => {
      const plot = document.querySelector('[aria-label="確定したつながりの図"]');
      if (!plot) return false;
      const area = plot.getBoundingClientRect();
      const cards = [...plot.querySelectorAll('[role="button"]')];
      return cards.length >= 2 && cards.every((card) => {
        const bounds = card.getBoundingClientRect();
        return bounds.width >= 44 && bounds.height >= 44 && bounds.left >= area.left && bounds.right <= area.right &&
          bounds.top >= area.top && bounds.bottom <= area.bottom;
      });
    });
  }
  await page.setViewportSize(options.viewport);
  const find = counter();
  await find.fill(search, '銀杏');
  await page.getByText(`${material} · ${hub}につながる`, { exact: true }).waitFor();
  await find.click(button(page, `${material}の原文を開く`));
  await page.getByText(`${material}。写真に残したあとの印象。`, { exact: true }).filter({ visible: true }).waitFor();
  const back = counter();
  await back.click(button(page, '地図に戻る'));
  await page.getByText('選択中 · 範囲内の確定接続 1件', { exact: true }).waitFor();
  await page.waitForFunction((label) => document.activeElement?.textContent === label, `${material}の原文を開く`);
  assert.equal(await search.inputValue(), '銀杏');
  return { group: group.report(), find: find.report(), back: back.report(), expectedEdgeFound: true, returnSucceeded: true, repeatedSearch: 0 };
}

async function scopeAndRestore(page) {
  const search = page.getByLabel('地図と全件を探す');
  for (const name of [hub, '写真を一枚選ぶ']) {
    await search.fill(name);
    await button(page, `${name} · 選ぶ`).first().click();
    await button(page, '範囲の選択に加える').click();
  }
  await button(page, '範囲と保存した見方').click();
  await button(page, '選んだ2件を固定').click();
  await button(page, '配置を変える').click();
  await button(page, '位置を固定').click();
  await page.getByText('選択中 · 範囲内の確定接続 0件 · 位置固定', { exact: true }).waitFor();
  await page.getByLabel('見方の名前').fill('二つだけ');
  await button(page, 'この見方を保存').click();
  await page.getByText('見方を保存しました', { exact: true }).waitFor();
  const saved = () => page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('kizashi-plus-preview:kizashi-notes:garden:v3'));
    return store.mapViews[0];
  });
  const original = await saved();
  await search.fill('雨の日の音');
  await button(page, '雨の日の音 · 地図の外で周辺を開く').click();
  await page.getByText('元の範囲の外を一時表示しています', { exact: true }).waitFor();
  await button(page, '元の範囲に戻る').click();
  await page.getByText('選択中 · 範囲内の確定接続 0件 · 位置固定', { exact: true }).waitFor();
  assert.equal(await search.inputValue(), '雨の日の音');
  assert.deepEqual(await saved(), original);
  await page.reload();
  await button(page, '範囲と保存した見方').click();
  await button(page, '二つだけを開く').click();
  await page.getByText('二つだけ · 選んだ種を保存 · 2件', { exact: true }).waitFor();
  await page.getByText('選択中 · 範囲内の確定接続 0件 · 位置固定', { exact: true }).waitFor();
  assert.deepEqual(await saved(), original);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  }
  console.log('PASS full map cards and touch target bounds, fixed scope, outside return, pinned selection after reload at 320/390/768px');
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXEC });
  try {
    const free = await browser.newPage(options);
    const plus = await browser.newPage(options);
    const errors = [];
    for (const page of [free, plus]) {
      page.setDefaultTimeout(20_000);
      page.on('pageerror', (error) => errors.push(error.message));
    }
    const order = process.env.PLUS_FIRST === '1' ? ['plus', 'free'] : ['free', 'plus'];
    const results = {};
    for (const type of order) results[type] = await (type === 'free' ? measureFree(free) : measurePlus(plus));
    await scopeAndRestore(plus);
    assert.deepEqual(errors, []);
    console.log('PASS scripted comparison', { order, viewport: options.viewport, results });
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

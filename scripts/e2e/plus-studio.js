const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

const url = process.env.COMPARISON_URL || 'http://127.0.0.1:8104/';
const storeKey = 'kizashi-plus-preview:kizashi-notes:garden:v3';
const screenshotDir = process.env.STUDIO_SCREENSHOTS;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXEC });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, locale: 'ja-JP' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const button = (name) => page.getByRole('button', { name, exact: true });
    const tab = (name) => page.getByRole('tab', { name, exact: true });
    const heading = (name) => page.getByRole('heading', { name, exact: true });
    const canvas = page.getByTestId('studio-map-canvas');
    const store = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storeKey);
    const shot = async (name) => { if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, name + '.png') }); };

    await page.goto(url);
    await button('無料と Plus を比較').click();
    await button('例の庭を開く').click();
    await heading('無料版の地図').waitFor();
    const example = await store();
    const access = page.getByRole('switch', { name: 'Plus を試す' });
    await access.click();
    const mapNote = canvas.getByRole('button', { name: '散歩の記録', exact: true });
    await mapNote.waitFor();
    await shot('01-map-paper');

    const originalCenter = await mapNote.boundingBox();
    await button('地図を拡大').click();
    assert.ok((await mapNote.boundingBox()).width > originalCenter.width);
    const frame = await canvas.boundingBox();
    const zoomed = await mapNote.boundingBox();
    await page.mouse.move(frame.x + 65, frame.y + 31);
    await page.mouse.down();
    await page.mouse.move(frame.x + 122, frame.y + 64, { steps: 10 });
    await page.mouse.up();
    assert.ok(Math.abs((await mapNote.boundingBox()).x - zoomed.x) > 10, 'the canvas pans');
    await button('地図を画面に合わせる').click();
    assert.ok(Math.abs((await mapNote.boundingBox()).x - originalCenter.x) < 3);

    await canvas.getByRole('button', { name: '雨の日の音', exact: true }).click();
    await button('ここを中心にする').click();
    await heading('雨の日の音').waitFor();
    await button('原文を開く').click();
    await heading('元のメモ').waitFor();
    await button('地図に戻る').click();
    await heading('雨の日の音').waitFor();
    await button('前の中心へ戻る').click();
    await button('星座').click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key))?.studioPreferences?.layout === 'constellation', storeKey);
    await shot('02-constellation');
    await button('つながり一覧').click();
    await page.getByLabel('地図のメモを探す').fill('銀杏');
    await button('川辺の銀杏、つながり1件').click();
    await heading('川辺の銀杏').waitFor();
    await button('マインドマップ').click();
    await button('表示スタイル').click();
    await button('月夜').click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).studioPreferences.palette === 'night', storeKey);
    await button('表示スタイルを閉じる').click();
    await canvas.getByRole('button', { name: '散歩の記録', exact: true }).click();
    await shot('03-map-night');

    await tab('AIの提案').click();
    await heading('五分だけ書く').waitFor();
    await page.getByText('「就寝前に今日の出来事を一言だけ書いてみた。」', { exact: true }).waitFor();
    await shot('04-insights');
    await button('候補を地図で見る').click();
    await canvas.getByRole('button', { name: /AIの候補/ }).first().waitFor();
    assert.ok(await canvas.locator('path[stroke-dasharray]').count() > 0);
    await shot('05-suggested-map');
    await tab('AIの提案').click();
    await button('つながりを保存').first().click();
    await page.getByText('つながりを保存しました', { exact: true }).waitFor();
    assert.equal((await store()).connections.length, example.connections.length + 1);
    assert.deepEqual((await store()).seeds, example.seeds);
    await button('見送る').first().click();
    await page.getByText('候補を見送りました', { exact: true }).waitFor();
    await button(/の見送りを解除$/).first().click();
    await page.getByText('見送りを解除しました', { exact: true }).waitFor();

    await tab('記録').click();
    await button('カレンダー').waitFor();
    await shot('06-calendar');
    await button('前の月').click();
    await button('今日に戻る').click();
    const reflection = '別々に書いた記録が、ひとつの案になった。';
    await page.getByLabel('この日の振り返り', { exact: true }).fill(reflection);
    await button('振り返りを保存').click();
    await page.getByText('振り返りを保存しました', { exact: true }).waitFor();
    await button('足あと').click();
    await page.getByText(reflection, { exact: true }).waitFor();
    await shot('07-timeline');
    await page.getByRole('dialog').getByRole('button', { name: 'メモを書く', exact: true }).click();
    await page.getByLabel('比較メモの題名').fill('試験用の振り返り');
    await page.getByLabel('比較メモの本文').fill('日記は時間を決めて短く書くと毎晩続けられた。');
    await page.getByLabel('比較メモのカテゴリ').fill('試用、日記');
    await button('メモを保存').click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).seeds.some((seed) => seed.title === '試験用の振り返り'), storeKey);
    await tab('AIの提案').click();
    await button('起点を選ぶ').click();
    await page.getByLabel('地図のメモを探す').fill('試験用');
    await button('試験用の振り返り、つながり0件').click();
    await button('つながりを保存').first().waitFor();

    await access.click();
    await heading('無料版の地図').waitFor();
    await button('保存した振り返り').click();
    assert.equal(await page.getByLabel('この日の振り返り', { exact: true }).inputValue(), reflection);
    await button('比較を閉じる').click();
    await button('無料と Plus を比較').click();
    assert.equal(await access.isChecked(), false);
    await access.click();
    await canvas.waitFor();
    assert.equal((await store()).studioPreferences.palette, 'night');
    assert.equal((await store()).reflections[0].body, reflection);
    assert.deepEqual(errors, []);
    console.log('PASS phone-width map pan, zoom and designs; real-text suggestions, dotted and saved links, recording, and Free/Plus persistence');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

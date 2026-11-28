const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const url = process.env.COMPARISON_URL || 'http://127.0.0.1:8104/';
const screenshotDir = process.env.STUDIO_SCREENSHOTS;
const storageKey = 'kizashi-plus-preview:kizashi-notes:garden:v3';
const draft = '散歩の途中で見つけた色を、短い手紙に。';

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

const centerOf = ({ x, y, width, height }) => ({ x: x + width / 2, y: y + height / 2 });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXEC });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, locale: 'ja-JP', acceptDownloads: true });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const button = (name) => page.getByRole('button', { name, exact: true });
    const heading = (name) => page.getByRole('heading', { name, exact: true });
    const tab = (name) => page.getByRole('tab', { name, exact: true });
    const read = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
    const shot = async (name) => { if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, name + '.png'), animations: 'disabled' }); };
    const start = async () => {
      await button('無料と Plus を比較').click();
      await button('例の庭を開く').or(heading('無料版の地図')).first().waitFor();
      if (await button('例の庭を開く').isVisible()) await button('例の庭を開く').click();
      await heading('無料版の地図').waitFor();
      await page.getByRole('switch', { name: 'Plus を試す' }).click();
      await heading('考えの地図').waitFor();
    };
    const sharedFile = async () => {
      const [download] = await Promise.all([
        page.waitForEvent('download'), button('ファイルを取り出す・共有').click(),
      ]);
      const stream = await download.createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks);
    };

    await page.goto(url);
    await start();
    await tab('その他').click();
    await shot('20-more');
    await button('アトリエを開く').click();
    await heading('アトリエ').waitFor();
    await shot('22-atelier-empty');
    await button('その他に戻る').click();
    await button('作品集を開く').click();
    await heading('作品集').waitFor();
    await button('アトリエで下書きを書く').waitFor();
    await shot('21-collection-empty');
    await button('アトリエで下書きを書く').click();
    await heading('アトリエ').waitFor();
    await button('新しいアトリエ').click();
    const editor = page.getByLabel('アトリエの下書き');
    await editor.fill(draft);
    await shot('23-atelier-draft');
    await button('材料').click();
    await button('材料を足す').click();
    await page.getByLabel('材料を探す').fill('散歩の記録');
    await button('散歩の記録の原文を選ぶ').click();
    await button('散歩の記録').click();
    await page.getByText(/長い日記は続かない/).filter({ visible: true }).waitFor();
    await button('書く').click();
    assert.equal(await editor.inputValue(), draft);
    await button('この版を残す').click();
    await page.getByText('版を保存しました', { exact: true }).waitFor();
    await button('この版を作品にする').waitFor();
    await button('アトリエを閉じる').click();
    assert.equal((await read()).atelierRevisions[0].text, draft);
    await button('作品集に戻る').click();
    await button('作品をつくる').click();
    await heading('作品にする版を選ぶ').waitFor();
    await button(draft).click();
    await page.getByLabel('作品の題名').fill('散歩の色');
    await button('紙面を確認').click();
    await heading('作品のプレビュー').waitFor();
    await shot('24-work-preview');
    await button('作品集に残す').click();
    await button('PNGファイルを作る').click();
    assert.equal((await sharedFile()).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    await button('作品集に戻る').click();
    await button('作品を開く').waitFor();
    await shot('25-collection');
    await button('その他に戻る').click();

    await button('データを書き出す・削除する').click();
    await heading('データ管理').waitFor();
    await shot('26-data');
    await button('標準テキストを作る').click();
    assert.ok((await sharedFile()).toString('utf8').includes(draft));
    page.once('dialog', (dialog) => dialog.dismiss());
    await button('比較用の庭の全データを削除する').click();
    assert.equal((await read()).seeds.length, 16);
    await button('データの画面を閉じる').click();

    await button('購入と復元を試す').click();
    await heading('Plus の利用状態').waitFor();
    await shot('27-plus-billing');
    assert.equal(await button('承認待ちを試す').count(), 0);
    await button('試験条件を変える').click();
    await button('承認待ちを試す').click();
    await button('確認済みの取引を届ける').click();
    await page.getByText('試験用の利用権を反映しました', { exact: true }).waitFor();
    await button('購入の復元を試す').click();
    await page.getByText('試験用の利用権を反映しました', { exact: true }).waitFor();
    await button('確認画面を閉じる').click();

    await button('地図の範囲・配置を編集').click();
    await button('表示するメモを選ぶ').click();
    await heading('地図の範囲').waitFor();
    await shot('28-map-scope');
    await page.getByLabel('範囲に使う検索語').fill('散歩');
    await page.getByLabel('見方の名前').fill('散歩の地図');
    await button('この見方を保存').click();
    await page.getByText('見方を保存しました', { exact: true }).waitFor();
    await button('散歩の地図を開く').click();
    assert.equal((await read()).mapViews[0].scope.query.text, '散歩');
    await button('地図の設定から戻る').click();
    await button('カードを動かす').click();
    await heading('配置を編集').waitFor();
    await button('配置の編集をやめる').click();
    await tab('地図').click();
    await button('星座').click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).studioPreferences.layout === 'constellation', storageKey);
    const arrange = button('マインドマップの配置を編集');
    await arrange.getByText('配置を編集', { exact: true }).waitFor();
    await arrange.click();
    await heading('配置を編集').waitFor();
    assert.equal(await tab('その他').count(), 0);
    const card = page.getByTestId('studio-map-node-example-1');
    const focus = page.getByTestId('studio-map-node-example-0');
    await card.waitFor();
    const before = centerOf(await card.boundingBox());
    await drag(page, before, centerOf(await focus.boundingBox()));
    await page.getByText('空いている場所へ移動できます。', { exact: true }).waitFor();
    assert.ok(Math.abs(centerOf(await card.boundingBox()).y - before.y) < 3);
    const to = { x: before.x + 33, y: before.y - 36 };
    await drag(page, before, to);
    await page.waitForFunction(() => document.querySelector('[aria-label="配置を保存"]')?.getAttribute('aria-disabled') !== 'true');
    const moved = centerOf(await card.boundingBox());
    assert.ok(moved.y < before.y - 20, 'drag moves the card while retaining its connections');
    await shot('29-map-edit');
    await button('移動を元に戻す').click();
    assert.ok(Math.abs(centerOf(await card.boundingBox()).y - before.y) < 3);
    await drag(page, centerOf(await card.boundingBox()), to);
    await button('配置を保存').click();
    await heading('考えの地図').waitFor();
    assert.equal(await button('星座').getAttribute('aria-pressed'), 'true');
    await button('つながり一覧').click();
    const listSearch = page.getByLabel('地図のメモを探す');
    await listSearch.fill('銀杏');
    await button('川辺の銀杏、つながり1件').click();
    const saved = (await read()).studioArrangements;
    assert.equal(saved[0].centerId, 'example-0');
    assert.equal(saved[0].placements[0].seedId, 'example-1');
    assert.equal((await read()).connections.length, 11);
    await arrange.click();
    await heading('配置を編集').waitFor();
    assert.ok(centerOf(await card.boundingBox()).y < before.y - 20);
    await button('自動配置に戻す').click();
    for (const discard of [false, true]) {
      await Promise.all([
        page.waitForEvent('dialog').then(async (dialog) => {
          const message = dialog.message();
          if (discard) await dialog.accept();
          else await dialog.dismiss();
          assert.match(message, /配置の変更を破棄しますか/);
        }),
        button('配置の編集をやめる').click(),
      ]);
      await heading(discard ? '考えの地図' : '配置を編集').waitFor();
    }
    assert.deepEqual((await read()).studioArrangements, saved);
    assert.equal(await button('つながり一覧').getAttribute('aria-pressed'), 'true');
    assert.equal(await listSearch.inputValue(), '銀杏');
    await heading('川辺の銀杏').waitFor();
    await tab('記録').click();
    await button('足あと').click();
    await button('作品').click();
    await button('作品、散歩の色').click();
    await heading('作品集').waitFor();
    await button('記録に戻る').click();
    assert.equal(await button('作品').getAttribute('aria-pressed'), 'true');
    await button(/の記録を開く$/).first().click();
    assert.equal(await button('カレンダー').getAttribute('aria-pressed'), 'true');
    await page.reload();
    await start();
    await arrange.click();
    assert.ok(centerOf(await card.boundingBox()).y < before.y - 20, 'saved arrangement reopens after reload');
    assert.deepEqual(errors, []);
    console.log('PASS More destinations, export, work records, arrangement from the Map tab and other views, undo, discard, and reload');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

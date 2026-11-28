const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { emptyStoreV3 } = require('../../src/data/gardenV3Model.ts');
const { buildPlusExample } = require('../../src/data/plusExample.ts');

const url = process.env.COMPARISON_URL || 'http://127.0.0.1:8104/';
const key = 'kizashi-plus-preview:kizashi-notes:garden:v3';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXEC });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP' });
    const errors = [];
    const external = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(url).origin) external.push(request.url());
    });
    const { seeds, connections } = buildPlusExample(64); // 60 in the largest connected component
    await page.addInitScript(({ key, data }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
    }, { key, data: { ...emptyStoreV3(), seeds, connections } });
    const button = (name) => page.getByRole('button', { name, exact: true });
    const tab = (name) => page.getByRole('tab', { name, exact: true });
    const heading = (name) => page.getByRole('heading', { name, exact: true });
    const read = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
    const shot = async (file) => {
      if (process.env.STUDIO_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.STUDIO_SCREENSHOTS, file + '.png') });
    };
    const enter = async () => {
      await button('無料と Plus を比較').click();
      await page.getByRole('switch', { name: 'Plus を試す' }).click();
    };
    await page.goto(url);
    await enter();
    const original = await read();
    await shot('craft-local');
    await button('地図を拡大').click();
    await button('庭の全体図を開く').click();
    const branches = page.getByTestId('studio-atlas-branches');
    const rainBranch = branches.getByRole('button', { name: '「雨の日の音」のまとまりを開く' });
    await rainBranch.getByText('写真を一枚選ぶ → 一日の便り').waitFor();
    await button('「散歩で見つけたもの」のまとまりを開く').getByText('56件', { exact: true }).waitFor();
    assert.equal(await branches.getByRole('button').count(), 2);
    await shot('craft-map');
    await button('別のまとまり 4件を見る').click();
    await button('「小さな遊びの入口」のまとまりを開く').waitFor();
    await button('「線でつながっていないメモ」のまとまりを開く').waitFor();
    await button('全体図のはじめへ戻る').click();
    await rainBranch.click();
    await button('一日の便り、つながり1件').click();
    const route = page.getByTestId('studio-atlas-route');
    for (const item of ['散歩の記録', '思い出を呼び戻す手がかり', '雨の日の音', '同じ散歩を音と写真で記録した', '写真を一枚選ぶ', '便りに写真を添える', '一日の便り']) {
      await route.getByText(item, { exact: true }).waitFor();
    }
    await shot('craft-route');
    await button('この場所を中心に開く').click();
    await page.getByTestId('studio-map-node-example-3').getByText('中心', { exact: true }).waitFor();
    await button('前の中心へ戻る').click();
    await button('星座').click();
    await heading('話題の星座').waitFor();
    await shot('topic-gallery');
    await button('「街歩き」の星座を開く').click();
    await page.getByText('「街歩き」をカテゴリに選んだメモが集まっています。').waitFor();
    await page.getByText('56件のメモ').waitFor();
    await shot('topic-notes');
    await button('星「帰り道のメモ 1」を選ぶ').click();
    await button('この星を最初の素材にする').click();
    await button('星座のメモへ戻る').click();
    await button('星座の全体へ戻る').click();
    await button('「遊び」の星座を開く').click();
    await button('星「小さな遊びの入口」を選ぶ').click();
    await shot('craft-stars');
    await button('選んだ星2枚でアイデアをつくる').click();
    await heading('アイデアの作業台').waitFor();
    assert.equal((await read()).atelierProjects.length, 0);
    await button('作業台を閉じる').click();

    await tab('つなぐ').click();
    await button('言葉で探す').waitFor();
    await page.getByText('「散歩の写真は自然に撮り続けている。」', { exact: true }).waitFor();
    await button('端末内AIも使う').click();
    await page.getByText('この端末では、共通の言葉や話題から候補を表示します。', { exact: true }).waitFor();
    await button('言葉で探す').click();
    await shot('craft-insights');
    await button('この2枚でアイデアをつくる').click();
    const title = '一枚から始まる日記';
    await heading(title).waitFor();
    await shot('craft-diary');
    await page.setViewportSize({ width: 320, height: 568 });
    const slots = await Promise.all(['きっかけの素材を編集', '手がかりの素材を編集', 'ひと工夫にメモを置く'].map((label) => button(label).boundingBox()));
    assert.ok(slots.every((rect) => rect && rect.width >= 44 && rect.x >= 0 && rect.x + rect.width <= 320));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 320));
    await page.setViewportSize({ width: 390, height: 844 });
    await button('この案に使った2枚の一節').click();
    await page.getByText('「帰り道の気づきを、もっと手軽に残してみたい。」', { exact: true }).last().waitFor();
    await button('この案に使った2枚の一節').click();
    await button('きっかけの素材を編集').click();
    assert.equal(await button('帰り道の気づきを、もっと手軽に残してみたい。').getAttribute('aria-pressed'), 'true');
    await button('作業台に戻る').click();
    await button('ひと工夫にメモを置く').click();
    await page.getByLabel('作業台の素材を探す').fill('雨の日の音');
    await button('雨の日の音を素材に置く').click();
    await button('便りにする').click();
    await page.getByText(/追伸\n「軒下で聞いた音/).waitFor();
    await button('試してみる').click();
    await heading('散歩の記録を試す一日').waitFor();
    await button('体験にする').click();
    await heading(title).waitFor();
    await shot('craft-workbench');
    const before = await read();
    assert.equal(before.atelierProjects.length, 0);
    assert.equal(before.collectionItems.length, 0);
    await button('この案を作品の紙面へ').click();
    const draft = await read();
    assert.equal(draft.atelierProjects.length, 1);
    assert.equal(draft.atelierRevisions.length, 1);
    assert.equal(draft.atelierSuggestions[0].evidence.length, 3);
    assert.equal(draft.collectionItems.length, 0);
    assert.equal(await page.getByLabel('作品の題名').inputValue(), title);
    await button('紙面を確認').click();
    await heading('作品のプレビュー').waitFor();
    await shot('craft-paper');
    await button('作品集に残す').click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).collectionItems.length === 1, key);
    await page.reload();
    await enter();
    await tab('その他').click();
    await button('作品集を開く').click();
    await button('作品を開く').click();
    const saved = await read();
    assert.equal(saved.collectionRevisions[0].textSnapshot, saved.atelierRevisions[0].text);
    assert.equal(saved.collectionRevisions[0].atelierRevisionId, saved.atelierRevisions[0].id);
    assert.deepEqual(saved.seeds, original.seeds);
    assert.deepEqual(saved.connections, original.connections);
    await button('作品集に戻る').click();
    await button('その他に戻る').click();
    await button('アトリエを開く').click();
    await button(title + 'を再開').click();
    await button('残した版').click();
    await button('作業台で使った一節').click();
    for (const { quote } of saved.atelierSuggestions[0].evidence) {
      await page.getByText('「' + quote + '」', { exact: true }).last().waitFor();
    }
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    console.log('PASS grouped 64-note atlas and reasons, topic previews and cross-group ingredients, paired evidence, recipes, paper and work after reload');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

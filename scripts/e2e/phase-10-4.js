const { chromium } = require('playwright');
const BASE = process.env.E2E_URL || 'http://localhost:8099/';
const RAW = process.env.E2E_OUT || require('os').tmpdir();
const ok = (name, cond, extra = '') => console.log(cond ? 'PASS' : 'FAIL', name, extra);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, locale: 'ja-JP' });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  const keys = () => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kizashi-notes:')).sort());
  const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('kizashi-notes:garden:v2') || 'null'));
  const t0 = Date.now();
  await p.goto(BASE);
  await p.getByRole('button', { name: /メモを書く/ }).first().waitFor({ timeout: 8000 });
  ok('first screen reachable quickly without any forced tutorial', Date.now() - t0 < 6000, `${Date.now() - t0}ms`);
  ok('empty home shows the one-sentence promise + 3 lines', (await p.getByText('思いつきを残し、つなげて、できそうなことへ。').count()) === 1 && (await p.getByText('まとまっていない一言も、種になります。').count()) === 1);
  ok('empty home does NOT show empty cards (今日の種/最近の種/あなたの畑)', (await p.getByText('今日の種').count()) === 0 && (await p.getByText('最近の種').count()) === 0 && (await p.getByText('あなたの畑').count()) === 0);
  await p.screenshot({ path: `${RAW}/p104-empty-home.png` });

  // 入力欄まで1回の操作で行ける（演出待ちなし）
  await p.getByRole('button', { name: /^メモを書く/ }).first().click();
  ok('one tap reaches the input', (await p.getByLabel('メモの本文').count()) === 1);
  await p.getByLabel('ホームタブ').click(); await p.waitForTimeout(300);

  // 例で使い方を見る
  const before = await keys();
  await p.getByRole('button', { name: /例で使い方を見る/ }).first().click(); await p.waitForTimeout(500);
  ok('practice opens and says it is not real data', (await p.getByText('例（実際のメモではありません）').count()) === 1);
  await p.screenshot({ path: `${RAW}/p104-practice-1.png` });
  await p.getByLabel(/選んでいません。例のメモ。散歩で撮った/).click();
  await p.getByLabel(/選んでいません。例のメモ。写真に短い/).click();
  await p.getByRole('button', { name: '2つをつなげる' }).click(); await p.waitForTimeout(500);
  ok('practice step 2: map shows the connected sample memo', (await p.getByText('つながっているメモ 1件').count()) === 1);
  await p.getByLabel('保存済みのメモを探して、つなげる').click(); await p.waitForTimeout(300);
  await p.getByText('離れた友人と', { exact: false }).first().click(); await p.getByLabel('選び終わる').click(); await p.waitForTimeout(300);
  await p.screenshot({ path: `${RAW}/p104-practice-2.png` });
  ok('practice step 2: second sample connected', (await p.getByText('つながっているメモ 2件').count()) === 1);
  await p.getByRole('button', { name: 'ここから芽をつくる' }).click(); await p.waitForTimeout(500);
  await p.getByLabel('完成例を入力欄に入れて見る').click();
  await p.getByRole('button', { name: '芽として保存' }).click(); await p.waitForTimeout(600);
  ok('practice done: sprout + materials are shown, closing reminder present', (await p.getByText('数は決まっていません').count()) >= 1 && (await p.getByText('友人に送る近況便りが作れそう').count()) >= 1);
  await p.screenshot({ path: `${RAW}/p104-practice-3.png` });
  const after = await keys();
  ok('D10: practice wrote nothing to storage (no new keys, no seeds, no drafts)', JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after));
  const st = await store();
  ok('D10: real store is untouched/empty', !st || (st.seeds.length === 0 && st.connections.length === 0 && st.drafts.length === 0));
  await p.getByRole('button', { name: '自分のメモを書く' }).click(); await p.waitForTimeout(400);
  ok('after practice, jumps to the real write screen', (await p.getByLabel('メモの本文').count()) === 1);

  // 再体験: 実データがあっても設定から開ける。実データを増減させない
  await p.getByLabel('メモの本文').fill('実際の最初のメモ'); await p.getByRole('button', { name: '保存する' }).click(); await p.waitForTimeout(800);
  await p.getByLabel('ホームタブ').click(); await p.waitForTimeout(500);
  ok('with real data the normal home shows (no forced tutorial / empty cards)', (await p.getByText('今日の種').count()) >= 1 && (await p.getByText('思いつきを残し、つなげて、できそうなことへ。').count()) === 0);
  await p.getByLabel('設定・バックアップ・サポート').click(); await p.waitForTimeout(300);
  await p.getByRole('button', { name: /例で使い方を見る/ }).first().click(); await p.waitForTimeout(500);
  ok('re-experience available from settings', (await p.getByText('例（実際のメモではありません）').count()) === 1);
  await p.getByLabel('例を閉じる').first().click(); await p.waitForTimeout(300);
  const st2 = await store();
  ok('real data unchanged by re-experience (1 memo)', st2.seeds.length === 1 && st2.seeds[0].body === '実際の最初のメモ');
  console.log('console errors:', errs.length ? errs : 'none');
  await b.close();
})();

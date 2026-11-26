const { chromium } = require('playwright');
const BASE = process.env.E2E_URL || 'http://localhost:8099/';
const RAW = process.env.E2E_OUT || require('os').tmpdir();
const N = Number(process.argv[2] || 2000);
const ok = (name, cond, extra = '') => console.log(cond ? 'PASS' : 'FAIL', name, extra);
const words = ['散歩', '写真', '友人', '近況', '読書会', '企画', 'カフェ', '手紙', '朝の光', '記録'];
const t0 = new Date('2026-01-01T00:00:00Z').getTime();
const seeds = Array.from({ length: N }, (_, i) => {
  const t = new Date(t0 + i * 60000).toISOString();
  return { id: `s${i}`, body: i === 3 ? '古いメモ：ユニークな言葉アザラシ水族館' : `${words[i % 10]}と${words[(i * 7 + 3) % 10]}について考えている。(${i})`, createdAt: t, updatedAt: t, importance: 3, growthState: 'seed', tags: [], transformOutputs: [], schemaVersion: 2 };
});
const conn = (a, b) => ({ id: JSON.stringify([a, b].sort()), aSeedId: [a, b].sort()[0], bSeedId: [a, b].sort()[1], origin: 'manual', createdAt: new Date().toISOString() });
const connections = []; for (let h = 5; h < 305; h++) connections.push(conn(`s${N - 1}`, `s${h}`)); // 最新のメモを高次数の中心に(300本)
const store = { storeVersion: 2, revision: 1, seeds, connections, drafts: [] };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'ja-JP' });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p.addInitScript((s) => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('kizashi-notes:garden:v2', JSON.stringify(s)); localStorage.setItem('__seeded', '1'); } }, store);
  const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('kizashi-notes:garden:v2')));
  const t1 = Date.now();
  await p.goto(BASE); await p.getByLabel('種一覧タブ').waitFor({ timeout: 30000 });
  ok(`${N}件: Home reachable`, true, `${Date.now() - t1}ms`);

  await p.getByLabel('種一覧タブ').click();
  await p.getByText(`${N}件のメモ`, { exact: false }).first().waitFor({ timeout: 15000 });
  const rendered = await p.evaluate(() => document.querySelectorAll('[aria-label^="メモを開く"]').length);
  ok('list is virtualized (renders far fewer cards than memos)', rendered > 0 && rendered < N / 5, `rendered=${rendered}/${N}`);

  const ts = Date.now();
  await p.getByLabel('メモの検索').fill('アザラシ');
  await p.getByText(/1件が見つかりました/).waitFor({ timeout: 15000 });
  ok('search finds the old unique memo among all memos', true, `${Date.now() - ts}ms`);
  ok('search shows the whole count, not only rendered ones', (await p.getByText(`（全${N}件）`).count()) === 1);
  await p.getByLabel('検索と絞り込みをすべて解除する').click();

  // 高次数の中心
  await p.getByLabel('メモの検索').fill(`(${N - 1})`);
  await p.getByText(/1件が見つかりました/).waitFor({ timeout: 15000 });
  await p.getByLabel(/^メモを開く/).first().click();
  await p.getByText('つながっているメモ 300件').waitFor({ timeout: 15000 });
  ok('hub with 300 connections: count is shown', true);
  ok('map caps at 6 and tells how many are hidden', (await p.getByText('ほか294件は、リストで見られます').count()) === 1);
  await p.screenshot({ path: `${RAW}/p105-hub-map.png` });
  await p.getByLabel('ほか294件はリストで見られます').click();
  await p.waitForTimeout(400);
  const rows = await p.evaluate(() => document.querySelectorAll('[aria-label^="このメモを中心に見る"]').length);
  ok('list view pages in (20 at first) and offers more', rows === 20 && (await p.getByText(/さらに表示（残り280件）/).count()) === 1, `rows=${rows}`);
  await p.getByLabel('つながっているメモから探す').fill('(299)');
  await p.waitForTimeout(400);
  ok('searching within the connections reaches a specific one', (await p.getByText('(299)', { exact: false }).count()) >= 1);
  await p.screenshot({ path: `${RAW}/p105-hub-list.png` });

  // 21件目以降(古いメモ)を検索して接続
  await p.getByLabel('保存済みのメモを探して、つなげる').click(); await p.waitForTimeout(500);
  await p.getByLabel('つなぐ種を探す').fill('アザラシ');
  await p.getByText('古いメモ：ユニークな言葉アザラシ水族館').first().click(); await p.waitForTimeout(500);
  await p.getByLabel('選び終わる').click(); await p.waitForTimeout(500);
  const st = await stored();
  ok('an old memo far beyond the first 20 can be found by search and connected', st.connections.some((c) => [c.aSeedId, c.bSeedId].includes('s3') && [c.aSeedId, c.bSeedId].includes(`s${N - 1}`)) && st.connections.length === 301);
  console.log('console errors:', errs.length ? errs : 'none');
  await b.close();
})();

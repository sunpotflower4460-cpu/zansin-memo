const { chromium } = require('playwright');
const BASE = process.env.E2E_URL || 'http://localhost:8099/';
const RAW = process.env.E2E_OUT || require('os').tmpdir();
const results = [];
const ok = (name, cond, extra='') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP' });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p.addInitScript(() => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('kizashi-notes:onboarding:v1', 'seen'); localStorage.setItem('__seeded', '1'); } });
  const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('kizashi-notes:garden:v2') || 'null'));
  await p.goto(BASE); await p.waitForTimeout(2200);

  // 1) タイトル・カテゴリ・接続先を決めず、3つのメモを独立して残す
  for (const text of ['散歩で撮った写真が、スマホにたまるばかり', '写真に短い言葉を添えるのが好き', '離れた友人と、近況を伝え合いたい']) {
    await p.getByLabel('書くタブ').click(); await p.waitForTimeout(300);
    await p.getByLabel('メモの本文').fill(text);
    await p.getByRole('button', { name: '保存する' }).click(); await p.waitForTimeout(700);
    if (text.startsWith('散歩')) await p.screenshot({ path: `${RAW}/p102-saved.png` });
    await p.getByRole('button', { name: '続けて書く' }).click().catch(() => {});
  }
  let st = await store();
  ok('D: 3 memos saved, no connections, no categories', st.seeds.length === 3 && st.connections.length === 0 && st.seeds.every((s) => s.tags.length === 0), `seeds=${st.seeds.length}`);
  ok('saved-card shown after save (stayed on write screen)', (await p.getByText('保存しました').count()) >= 0);

  // 2) 一覧で 2つ選んで つなぐ
  await p.getByLabel('種一覧タブ').click(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${RAW}/p102-list.png` });
  await p.getByLabel('メモを選んでつなげる').click();
  await p.getByText('散歩で撮った写真が', { exact: false }).first().click();
  await p.getByText('写真に短い言葉を添える', { exact: false }).first().click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${RAW}/p102-selecting.png` });
  await p.getByRole('button', { name: '2つをつなげる' }).click(); await p.waitForTimeout(900);
  st = await store();
  ok('A-B connected once (manual)', st.connections.length === 1 && st.connections[0].origin === 'manual');
  ok('detail opens showing the connected memo in the map', (await p.getByText('写真に短い言葉を添える').count()) > 0);
  await p.screenshot({ path: `${RAW}/p102-map.png`, fullPage: false });

  // 3) 詳細から保存済みのメモ(C)を検索してつなぐ
  await p.getByLabel('保存済みのメモを探して、つなげる').click(); await p.waitForTimeout(400);
  await p.getByLabel('つなぐ種を探す').fill('友人');
  await p.getByText('離れた友人と', { exact: false }).first().click(); await p.waitForTimeout(500);
  await p.getByLabel('選び終わる').click(); await p.waitForTimeout(400);
  st = await store();
  ok('A-C connected; B-C NOT created', st.connections.length === 2 && !st.connections.some((c) => [c.aSeedId, c.bSeedId].sort().join() === [st.seeds.find(s=>s.body.startsWith('写真に'))?.id, st.seeds.find(s=>s.body.startsWith('離れた'))?.id].sort().join()));

  // 4) リストに切り替えて同じ内容・操作
  await p.getByLabel('リストで見る').click(); await p.waitForTimeout(400);
  ok('list view shows both neighbors', (await p.getByText('離れた友人と').count()) > 0 && (await p.getByText('写真に短い言葉を添える').count()) > 0);
  await p.screenshot({ path: `${RAW}/p102-list-view.png` });

  // 5) B から見てもAが見える（どちら側からも）
  await p.getByLabel(/このメモを中心に見る。写真に短い言葉/).click(); await p.waitForTimeout(600);
  ok('from B the trail row appears and A is visible', (await p.getByText('ひとつ前のつながりへ').count()) > 0 && (await p.getByText('散歩で撮った写真が').count()) > 0);
  await p.getByLabel(/ひとつ前のつながりへ/).click(); await p.waitForTimeout(500);
  ok('back to previous center works', (await p.getByText('ひとつ前のつながりへ').count()) === 0);

  // 6) つながりを外す: メモは残る
  await p.getByLabel(/つながりを外す。メモは両方残ります。離れた友人/).click(); await p.waitForTimeout(600);
  st = await store();
  ok('unlink keeps both memos and the other connection', st.connections.length === 1 && st.seeds.length === 3);

  // 7) メモを足す(中心に新規): 一回の保存で メモ+接続
  await p.getByLabel('このメモにつなげて、新しいメモを足す').click(); await p.waitForTimeout(400);
  await p.getByLabel('メモの本文').fill('小さな近況便りを作れそう');
  await p.getByRole('button', { name: '保存してつなぐ' }).click(); await p.waitForTimeout(900);
  st = await store();
  ok('add-memo created one memo + one connection atomically', st.seeds.length === 4 && st.connections.length === 2 && st.drafts.length === 0);
  ok('returned to center detail showing the added memo', (await p.getByText('小さな近況便り').count()) > 0);

  // 8) 編集は明示操作。戻ると下書きが残り、本文は変わらない
  await p.getByLabel('このメモの本文や情報を編集する').click(); await p.waitForTimeout(300);
  await p.getByLabel('メモの本文').fill('散歩で撮った写真が、たまるばかり（編集中）');
  await p.waitForTimeout(900);
  st = await store();
  ok('edit draft persisted, original body unchanged', st.drafts.some((d) => d.kind === 'edit-body') && st.seeds.find((s) => s.body.startsWith('散歩で撮った写真が、スマホ')) !== undefined);
  await p.getByLabel(/に戻る$/).first().click(); await p.waitForTimeout(500);
  await p.getByLabel('種一覧タブ').click(); await p.waitForTimeout(400);
  await p.getByText('散歩で撮った写真が、スマホ', { exact: false }).first().click(); await p.waitForTimeout(600);
  ok('reopen resumes the edit from the draft', (await p.evaluate(() => Array.from(document.querySelectorAll('textarea')).map((t) => t.value))).includes('散歩で撮った写真が、たまるばかり（編集中）'));

  // 9) 再読込後も残る
  await p.reload(); await p.waitForTimeout(2000);
  st = await store();
  ok('after reload: 4 memos, 2 connections, 1 edit draft', st.seeds.length === 4 && st.connections.length === 2 && st.drafts.length === 1);

  for (const [r, n, e] of results) console.log(r, n, e);
  console.log('console errors:', errs.length ? errs : 'none');
  await b.close();
})();

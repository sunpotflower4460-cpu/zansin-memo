// 幅320/390/768pxの表示・キーボード操作の確認（Web版・Chromium）。
// 44px未満の表示は INFO（RNのhitSlopはDOMの寸法に含まれないため、実機の当たり判定とは一致しない）。
// 実機のVoiceOver・文字拡大・Reduce Motionの代わりにはならない。
const { chromium } = require('playwright');
const BASE = process.env.E2E_URL || 'http://localhost:8099/';
const OUT = process.env.E2E_OUT || require('os').tmpdir();
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) process.exitCode = 1; };
const info = (name, extra = '') => console.log('INFO', name, extra);

const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
const seed = (id, body, d, extra = {}) => ({ id, body, createdAt: iso(d), updatedAt: iso(d), importance: 3, growthState: 'seed', tags: [], transformOutputs: [], schemaVersion: 2, ...extra });
const pair = (a, b) => [a, b].sort();
const conn = (a, b) => ({ id: JSON.stringify(pair(a, b)), aSeedId: pair(a, b)[0], bSeedId: pair(a, b)[1], origin: 'manual', createdAt: iso(1) });
const store = {
  storeVersion: 2, revision: 1, drafts: [],
  seeds: [
    seed('a', '散歩の途中で撮った写真が溜まっていく。長い本文の確認用に、少し長めの文章をここに入れておく。折り返しても読めること、はみ出さないことを見る。', 6),
    seed('b', '写真に短い文を添えるのが好きかもしれない', 4),
    seed('c', '離れた友人と近況を伝え合う方法を考えたい', 2),
    seed('d', 'English and 日本語 mixed 🌱 with emoji', 1),
  ],
  connections: [conn('a', 'b'), conn('a', 'c')],
};

(async () => {
  const b = await chromium.launch();
  for (const width of [320, 390, 768]) {
    const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, locale: 'ja-JP' });
    const p = await ctx.newPage(); const errs = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await p.addInitScript((s) => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('kizashi-notes:garden:v2', JSON.stringify(s)); localStorage.setItem('__seeded', '1'); } }, store);
    await p.goto(BASE); await p.getByLabel('種一覧タブ').waitFor({ timeout: 30000 });

    const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const smallTargets = () => p.evaluate(() => {
      const els = [...document.querySelectorAll('[role="button"],button,a,input,textarea,[tabindex="0"]')];
      return els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44); })
        .map((e) => `${(e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 20)}(${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)})`);
    });

    // 画面ごとに横はみ出しがないこと
    const screens = [
      ['ホーム', null],
      ['書く', async () => p.getByLabel('書くタブ').click()],
      ['種一覧', async () => p.getByLabel('種一覧タブ').click()],
      ['庭', async () => p.getByLabel('庭タブ').click()],
    ];
    for (const [name, go] of screens) {
      if (go) { await go(); await p.waitForTimeout(500); }
      const o = await overflow();
      ok(`${width}px ${name}: no horizontal overflow`, o <= 0, `overflow=${o}`);
      const small = await smallTargets();
      info(`${width}px ${name}: targets under 44 CSS px`, small.length ? small.slice(0, 6).join(', ') : 'none');
    }
    // 検索: 大文字小文字・絵文字（D09）
    await p.getByLabel('種一覧タブ').click(); await p.waitForTimeout(300);
    await p.getByLabel('メモの検索').fill('ＥＮＧＬＩＳＨ'); await p.waitForTimeout(400);
    ok(`${width}px search: full-width upper-case finds the English memo`, (await p.getByText(/1件が見つかりました/).count()) > 0);
    await p.getByLabel('メモの検索').fill('🌱'); await p.waitForTimeout(400);
    ok(`${width}px search: emoji`, (await p.getByText(/1件が見つかりました/).count()) > 0);
    await p.getByLabel('検索と絞り込みをすべて解除する').click(); await p.waitForTimeout(300);
    // 詳細（長い本文・つながり）
    await p.getByLabel('種一覧タブ').click(); await p.waitForTimeout(400);
    await p.getByText('散歩の途中で撮った写真', { exact: false }).first().click(); await p.waitForTimeout(600);
    ok(`${width}px detail: no horizontal overflow`, (await overflow()) <= 0);
    ok(`${width}px detail: full long text is readable`, (await p.getByText('はみ出さないことを見る', { exact: false }).count()) > 0);
    await p.screenshot({ path: `${OUT}/layout-${width}-detail.png` });

    // キーボード: Tabでフォーカスが進み、見える位置にあること（Home）
    await p.getByLabel(/に戻る/).first().click(); await p.waitForTimeout(500);
    const kb = await p.evaluate(() => document.activeElement && document.activeElement.tagName);
    info(`${width}px keyboard: active element after navigation`, String(kb));
    let reached = 0; const seen = new Set();
    for (let i = 0; i < 25; i++) {
      await p.keyboard.press('Tab');
      const label = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return ''; const r = e.getBoundingClientRect(); return (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 24) + (r.bottom < 0 || r.top > innerHeight ? '[offscreen]' : ''); });
      if (label) { seen.add(label); reached += 1; }
    }
    ok(`${width}px keyboard: Tab reaches interactive elements`, reached >= 5, `reached=${reached} unique=${seen.size}`);
    ok(`${width}px console clean`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
})();

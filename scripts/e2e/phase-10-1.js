const { chromium } = require('playwright');
const BASE = process.env.E2E_URL || 'http://localhost:8099/';
const day = 86400000; const iso = (d) => new Date(Date.now() - d * day).toISOString();
const v1 = [
  { id: 'a1', body: '散歩写真が溜まる', createdAt: iso(10), updatedAt: iso(10), importance: 3, growthState: 'seed', tags: [], relatedSeedIds: ['a2', 'a1', 'ghost'], transformOutputs: [], schemaVersion: 1 },
  { id: 'a2', body: '写真に短文を添えるのが好き', createdAt: iso(5), updatedAt: iso(5), importance: 3, growthState: 'sprout', tags: ['日々'], relatedSeedIds: ['a1'], transformOutputs: [], schemaVersion: 1 },
  { id: 'a3', body: '離れた友人と近況を伝え合いたい', createdAt: iso(2), updatedAt: iso(2), importance: 4, growthState: 'tree', tags: [], relatedSeedIds: [], transformOutputs: [], schemaVersion: 1 },
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP' });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p.addInitScript((d) => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('kizashi-notes:seeds:v1', JSON.stringify(d)); localStorage.setItem('kizashi-notes:onboarding:v1', 'seen'); localStorage.setItem('__seeded', '1'); } }, v1);
  await p.goto(BASE); await p.waitForTimeout(2500);
  const keys1 = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kizashi-notes:')).sort());
  const v2 = await p.evaluate(() => JSON.parse(localStorage.getItem('kizashi-notes:garden:v2') || 'null'));
  console.log('after first load keys:', keys1);
  console.log('v2 seeds:', v2?.seeds.length, 'connections:', v2?.connections.map((c) => c.aSeedId + '-' + c.bSeedId + ':' + c.origin), 'revision', v2?.revision);
  const untouched = (await p.evaluate(() => localStorage.getItem('kizashi-notes:seeds:v1'))) === JSON.stringify(v1);
  console.log(untouched ? 'PASS' : 'FAIL', 'v1 original untouched'); if (!untouched) process.exitCode = 1;
  // write a new memo through the UI
  await p.getByLabel('書くタブ').click(); await p.waitForTimeout(500);
  await p.getByLabel('メモの本文').fill('新しく書いた思いつき');
  await p.waitForTimeout(900); // draft debounce
  const draft = await p.evaluate(() => JSON.parse(localStorage.getItem('kizashi-notes:garden:v2')).drafts);
  console.log('draft persisted while typing:', draft.length, draft[0]?.body);
  await p.getByRole('button', { name: '保存する' }).click(); await p.waitForTimeout(900);
  const v2b = await p.evaluate(() => JSON.parse(localStorage.getItem('kizashi-notes:garden:v2')));
  console.log('after save: seeds', v2b.seeds.length, 'drafts', v2b.drafts.length, 'revision', v2b.revision, 'newest:', v2b.seeds[0].body);
  console.log('lastGood in sync:', (await p.evaluate(() => localStorage.getItem('kizashi-notes:garden:v2') === localStorage.getItem('kizashi-notes:garden:v2:lastGood'))));
  // reload: data and connection survive
  await p.reload(); await p.waitForTimeout(2000);
  await p.getByLabel('種一覧タブ').click(); await p.waitForTimeout(600);
  console.log('reload shows new memo:', await p.getByText('新しく書いた思いつき').count());
  await p.getByText('散歩写真が溜まる').first().click(); await p.waitForTimeout(600);
  console.log('connected memo visible in detail:', await p.getByText('写真に短文を添えるのが好き').count());
  console.log('console errors:', errs.length ? errs : 'none');
  await b.close();
})();

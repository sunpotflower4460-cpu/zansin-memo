const { chromium } = require('playwright');
const BASE = process.env.E2E_URL || 'http://localhost:8099/';
const RAW = process.env.E2E_OUT || require('os').tmpdir();
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const now = new Date().toISOString();
const mk = (id, body) => ({ id, body, createdAt: now, updatedAt: now, importance: 3, growthState: 'seed', tags: [], transformOutputs: [], schemaVersion: 2 });
const seeds = [mk('A', '散歩で撮った写真が、スマホにたまるばかり'), mk('B', '写真に短い言葉を添えるのが好き'), mk('C', '離れた友人と、近況を伝え合いたい')];
const conn = (a, b) => ({ id: JSON.stringify([a, b].sort()), aSeedId: [a, b].sort()[0], bSeedId: [a, b].sort()[1], origin: 'manual', createdAt: now });
const initial = { storeVersion: 2, revision: 1, seeds, connections: [conn('A', 'B')], drafts: [] };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, locale: 'ja-JP' });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p.addInitScript((s) => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('kizashi-notes:garden:v2', JSON.stringify(s)); localStorage.setItem('kizashi-notes:onboarding:v1', 'seen'); localStorage.setItem('__seeded', '1'); } }, initial);
  const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('kizashi-notes:garden:v2')));
  await p.goto(BASE); await p.waitForTimeout(2200);

  await p.getByLabel('種一覧タブ').click(); await p.waitForTimeout(400);
  await p.getByText('散歩で撮った写真が', { exact: false }).first().click(); await p.waitForTimeout(500);
  await p.getByLabel('ここに書いて芽にする').click(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${RAW}/p103-new.png` });

  // 保存は一言を書くまで押せない
  const saveBtn = p.getByRole('button', { name: '芽として保存' });
  ok('save disabled until a sentence is written', await saveBtn.isDisabled());
  ok('connected memo is shown as a candidate but NOT pre-selected', await p.getByLabel(/参考にしていない。元のメモ。写真に短い/).isVisible());
  let st = await store();
  ok('opening the screen did not change anything', st.seeds.every((s) => s.growthState === 'seed' && !s.synthesis));

  // 材料B(つながっている)を選び、材料C(つながっていない)を検索して追加。書きかけは下書きに残る
  await p.getByLabel(/参考にしていない。元のメモ。写真に短い/).click();
  await p.getByLabel('参考にするメモを探して追加する').click(); await p.waitForTimeout(400);
  await p.getByLabel('つなぐ種を探す').fill('友人');
  await p.getByText('離れた友人と', { exact: false }).first().click(); await p.waitForTimeout(300);
  await p.getByLabel('選び終わる').click(); await p.waitForTimeout(300);
  await p.getByLabel('できそうなこと').fill('写真3枚にひと言を添えた近況便りを、友人に送れそう');
  await p.waitForTimeout(900);
  st = await store();
  const synDraft = st.drafts.find((d) => d.kind === 'synthesis');
  ok('draft saved while writing (target A, 2 extra materials, text)', synDraft && synDraft.targetSeedId === 'A' && synDraft.materials.length === 2 && synDraft.body.includes('近況便り'));
  ok('materials alone did not create connections (still only A-B)', st.connections.length === 1);
  ok('still a seed until saved', st.seeds.find((s) => s.id === 'A').growthState === 'seed');
  await p.screenshot({ path: `${RAW}/p103-writing.png` });

  // 保存
  await p.getByRole('button', { name: '芽として保存' }).click(); await p.waitForTimeout(900);
  st = await store();
  const a = st.seeds.find((s) => s.id === 'A');
  ok('A is a sprout with a separate synthesis; original body unchanged', a.growthState === 'sprout' && a.body === '散歩で撮った写真が、スマホにたまるばかり' && a.synthesis.statement.includes('近況便り'));
  ok('snapshots: A body + B body + C body', a.synthesis.sources.map((s) => s.seedId).join() === 'A,B,C' && a.synthesis.sources[2].textSnapshot === '離れた友人と、近況を伝え合いたい');
  ok('B and C untouched; no B-C / A-C connections created', st.seeds.filter((s) => s.id !== 'A').every((s) => s.growthState === 'seed') && st.connections.length === 1);
  ok('draft cleared on save', st.drafts.length === 0);
  ok('detail shows the sprout and the Undo bar', (await p.getByText('近況便りを、友人に送れそう').count()) > 0 && (await p.getByText('元に戻す').count()) > 0);
  await p.screenshot({ path: `${RAW}/p103-saved.png` });

  // 元に戻す
  await p.getByRole('button', { name: '元に戻す' }).click(); await p.waitForTimeout(800);
  st = await store();
  ok('undo: back to seed, no synthesis, sentence kept as a draft', st.seeds.find((s) => s.id === 'A').growthState === 'seed' && !st.seeds.find((s) => s.id === 'A').synthesis && st.drafts.some((d) => d.kind === 'synthesis' && d.body.includes('近況便り')));
  ok('detail offers to resume the draft', await p.getByRole('button', { name: '芽の下書きの続きを書く' }).isVisible());

  // 下書きから再開 → 保存
  await p.getByLabel('芽の下書きの続きを書く').click(); await p.waitForTimeout(600);
  const restored = await p.evaluate(() => Array.from(document.querySelectorAll('textarea')).map((t) => t.value));
  ok('draft restored with the sentence', restored.some((v) => v.includes('近況便り')));
  await p.getByRole('button', { name: '芽として保存' }).click(); await p.waitForTimeout(900);
  st = await store();
  ok('saved again: exactly one synthesis, one draft cleared', st.seeds.find((s) => s.id === 'A').synthesis && st.drafts.length === 0);

  // 材料の元メモを編集 → 芽は不変、「材料に更新あり」
  await p.getByLabel('種一覧に戻る').click(); await p.waitForTimeout(400);
  await p.getByText('写真に短い言葉を添えるのが好き').first().click(); await p.waitForTimeout(500);
  await p.getByLabel('このメモの本文や情報を編集する').click();
  await p.getByLabel('メモの本文').fill('写真に短い言葉を添えるのが大好き');
  await p.getByRole('button', { name: '変更を保存' }).click(); await p.waitForTimeout(800);
  await p.getByLabel('種一覧に戻る').click(); await p.waitForTimeout(400);
  await p.getByText('散歩で撮った写真が', { exact: false }).first().click(); await p.waitForTimeout(600);
  st = await store();
  ok('editing a material leaves the sprout and its snapshots unchanged', st.seeds.find((s) => s.id === 'A').synthesis.sources[1].textSnapshot === '写真に短い言葉を添えるのが好き');
  ok('detail marks the changed material', await p.getByText('くわしく見る（参考メモに変更あり）', { exact: true }).isVisible());
  await p.screenshot({ path: `${RAW}/p103-changed.png` });

  // 種として考え直す
  await p.getByLabel('芽のくわしい情報を見る').click();
  await p.getByLabel('種に戻す。書いた考えは残ります').click(); await p.waitForTimeout(700);
  st = await store();
  ok('reconsider: seed again, thought + materials kept', st.seeds.find((s) => s.id === 'A').growthState === 'seed' && st.seeds.find((s) => s.id === 'A').synthesis.sources.length === 3);
  ok('shows as 前に書いた考え', await p.getByRole('heading', { name: '前に書いた考え' }).isVisible());

  // 再読込
  await p.reload(); await p.waitForTimeout(2000);
  st = await store();
  ok('persisted after reload', st.seeds.find((s) => s.id === 'A').synthesis.sources.length === 3);

  console.log('console errors:', errs.length ? errs : 'none');
  if (errs.length || results.some(([result]) => result === 'FAIL')) process.exitCode = 1;
  await b.close();
})();

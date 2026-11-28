import { normalizeSearchText } from '../../utils/seedText';
import type { Seed } from '../types';
import type { SourceVersion } from './contracts';
import { textDigest } from './sources';

export const craftRecipes = [
  { id: 'experience', label: '体験にする', aim: '最初の一節をきっかけに、次の一節で行動が変わる体験を作る' },
  { id: 'experiment', label: '試してみる', aim: '最初の関心に、次の一節から借りた方法を一度だけ試す' },
  { id: 'letter', label: '便りにする', aim: '一枚目を表、二枚目を返事として読める小さな作品を作る' },
] as const;
export type CraftRecipe = typeof craftRecipes[number]['id'];
export const craftRoles = ['きっかけ', '手がかり', 'ひと工夫'] as const;
export type CraftExcerpt = { start: number; end: number; quote: string };
export type CraftPart = CraftExcerpt & { source: SourceVersion; title?: string };
export type CraftIdea = { title: string; body: string };
export type CraftCandidate = CraftIdea & {
  recipe: CraftRecipe; generator: 'recipe' | 'on_device'; parts: CraftPart[];
  summary?: string; uses?: string[];
};

const extraStep = {
  letter: { heading: '追伸', action: 'この一節を添え、返事に書きたい言葉をひとつ尋ねる。',
    sound: '返事には、受け取った人が思い浮かべた音を一言書いてもらう。', use: '受け取った人が返事を書くきっかけにする。' },
  experiment: { heading: 'もう一度試すなら', action: 'この一節から条件を一つ借りて、二回目に変えることを決める。',
    sound: '二回目は音の手がかりを一つ足し、前の答えから変わった言葉を探す。', use: '二回目に変える条件を一つ借りる。' },
  experience: { heading: '最後に開くカード', action: 'このカードを読んで、次に残したいものを一つ選ぶ。',
    sound: '次の人には音の手がかりだけを先に伝え、場面を当ててもらってから全体を見せる。', use: '最後に読み、次に残したいものを選ぶ手がかりにする。' },
} as const;

/** Exact UTF-16 ranges survive duplicate sentences, blank lines and astral characters. */
export function craftExcerpts(body: string): CraftExcerpt[] {
  const excerpts: CraftExcerpt[] = [];
  for (const match of body.matchAll(/[^。！？!?\r\n]+[。！？!?]*|[。！？!?]+/gu)) {
    const value = match[0].trim();
    if (!value) continue;
    let start = match.index! + match[0].indexOf(value);
    const chars = Array.from(value);
    for (let i = 0; i < chars.length; i += 120) {
      const quote = chars.slice(i, i + 120).join('');
      const end = start + quote.length;
      excerpts.push({ start, end, quote });
      start = end;
    }
  }
  return excerpts;
}

export function defaultCraftExcerpt({ title, body }: Pick<Seed, 'title' | 'body'>): CraftExcerpt | undefined {
  const excerpts = craftExcerpts(body);
  if (!title?.trim()) return excerpts[0];
  const normalized = (value: string) => normalizeSearchText(value).trim().replace(/[。.!?]+$/u, '');
  const heading = normalized(title);
  return excerpts.find(({ quote }) => normalized(quote) !== heading) ?? excerpts[0];
}

export function craftPart(seed: Seed, excerpt: CraftExcerpt): CraftPart {
  return { ...excerpt, title: seed.title,
    source: { ref: { seedId: seed.id, part: 'body' }, textDigest: textDigest(seed.body), updatedAt: seed.updatedAt } };
}

function cardName(part: CraftPart) {
  const text = Array.from(part.title?.trim() || part.quote);
  return text.slice(0, 18).join('') + (text.length > 18 ? '…' : '');
}

function soundCue(text: string) {
  return /雨音|音色|足音|録音|音声|音楽|聞こえ|聞い|聴い|聞く|聴く|音[をがに]/u.test(text) &&
    !/聞こえな|聞けな|聴けな|録音[はがを]?(?:禁止|できな)|音を出せな/u.test(text);
}

export function composeCraft(parts: CraftPart[], recipe: CraftRecipe): CraftCandidate | undefined {
  if (parts.length < 2 || parts.length > craftRoles.length || new Set(parts.map(({ source }) => source.ref.seedId)).size !== parts.length ||
      parts.some(({ quote }) => !quote.trim())) return undefined;
  const [first, second, third] = parts;
  const a = cardName(first);
  const front = `「${first.quote}」`;
  const back = `「${second.quote}」`;
  const all = first.quote + '\n' + second.quote;
  const photo = /写真|カメラ|撮影/u;
  const canUsePhoto = !/撮れな|撮らな|撮りたくな|撮影禁止|(?:写真|撮影|カメラ)[^。！？\n]{0,10}(?:禁止|不可|使えな|できな|苦手|嫌い|なし|避け)/u.test(all);
  const diary = /日記|記録|気づき/u.test(first.quote);
  const photoDiary = diary && canUsePhoto && photo.test(second.quote);
  const soundFirst = soundCue(first.quote) && photo.test(second.quote);
  const soundAndPhoto = canUsePhoto && (soundFirst || soundCue(second.quote) && photo.test(first.quote));
  const gesture = second.quote.match(/(声|音|動き|手ぶり|手振り)を(?:まね|真似)/u)?.[1];
  const entrance = /入口|参加|始め方|最初の一歩/u.test(first.quote) && gesture && !/まねられな|まねしな|真似できな/u.test(second.quote) ? gesture : undefined;
  let idea: CraftIdea & { summary: string; uses: string[] };

  if (recipe === 'letter' && soundAndPhoto) {
    const roles = ['先に届く便りに音の手がかりを添える。', '返事が来たら、答え合わせに写真を届ける。'];
    idea = { title: '音のあとに写真が届く便り', summary: '音の便りを送り、返事が来たら写真を届ける。',
      body: '聞こえた音をひとこと添えて「どんな場所だと思う？」と尋ねる。返事が来たら、その音の場面を写した写真を一枚届ける。想像した景色と、実際に見た景色の違いが二人の会話になる。',
      uses: soundFirst ? roles : roles.reverse() };
  } else if (recipe === 'letter') {
    idea = { title: `${a}からの往復便`, summary: '二つの一節を表と裏に置き、相手に一行足してもらう。',
      body: `表にひとこと\n${front}\n\n裏からの返事\n${back}\n\n受け取った人に、二つの間に浮かんだ景色を一行だけ書き足してもらう。`,
      uses: ['便りの表に置き、相手が最初に読む言葉にする。', '便りの裏に置き、表の言葉への返事として読んでもらう。'] };
  } else if (recipe === 'experiment' && photoDiary) {
    idea = { title: `${a}を試す一日`, summary: '写真を見る前と後の一行を比べる。',
      body: '今日気づいたことを、まず一行書く。次に写真を一枚見て、同じ場面をもう一行書く。二行を並べ、写真を見て初めて思い出した言葉に丸を付ける。',
      uses: ['思い出したい気づきを、最初に一行だけ書く。', '写真を見たあとで同じ日を一行書き、増えた言葉を見つける。'] };
  } else if (recipe === 'experiment' && soundAndPhoto) {
    const roles = ['二回目にだけ音の言葉を加え、何を思い出すか読む。', '同じ写真を二回見て、見方が変わるところを確かめる。'];
    idea = { title: '音を足すと景色はどう変わる？', summary: '音の言葉を読む前後で、同じ写真の見え方を比べる。',
      body: 'まず写真を一枚見て、何が気になったか一行書く。その場の音を表す言葉を一つ読んで、同じ写真を見直す。新しく思い浮かんだことを一行書き、最初の一行と読み比べる。',
      uses: soundFirst ? roles : roles.reverse() };
  } else if (recipe === 'experiment' && entrance) {
    idea = { title: 'まねると入りやすくなるか', summary: '説明から始める回と、まねから始める回を比べる。',
      body: `同じ遊びを短く二回試す。一回目は説明を一文だけ伝える。二回目は${entrance}をひとつまねてもらってから始める。最初の一手が出たときに何が役立ったか、参加した人に一言聞く。`,
      uses: ['何が参加のきっかけになるかを確かめる問いにする。', `二回目は${entrance}をまねる操作から始める。`] };
  } else if (recipe === 'experiment') {
    idea = { title: `${a}を試す一日`, summary: '手がかりを足す前と後で、使い道を比べる。',
      body: `試す前に\n${front}を読み、思いついた使い道を一つ書く。\n\n条件を一つ足す\n${back}を読み、その一節を取り入れた別の使い道を書く。二案の違いに下線を引き、今日試せる方を一つ選ぶ。`,
      uses: ['手がかりを加える前の、最初の案を考える。', '二案目に条件を一つ足し、最初の案との違いを確かめる。'] };
  } else if (photoDiary || (diary && /一言|一行/u.test(second.quote))) {
    idea = photoDiary ? { title: '一枚から始まる日記', summary: '写真に写っていないことを一言ずつ残す。',
      body: '一日の終わりに写真を一枚だけ選ぶ。写っていない音や匂いを一言添え、翌日はその一言を手がかりに次の一枚を探す。',
      uses: ['記録したい気づきを、一日に一言ずつ残す。', '写真を選ぶ行動を、日記の書き出しのきっかけにする。'] }
      : { title: 'ひとことを拾う日記', summary: '昨日の一言を開き、今日見えたことを一行返す。',
        body: '一日の終わりに気づきを一言だけ書き、裏返しておく。翌日それを開き、昨日と違って見えたことをもう一行返す。',
        uses: ['気づきを書き留め、翌日に読み返す。', '昨日にも今日にも、一言だけ書くという制約を使う。'] };
  } else if (entrance) {
    idea = { title: 'まねから始まる遊び', summary: '最初の一手をまねしてから、自分のやり方に変える。',
      body: `始める人に${entrance}をひとつ見せ、まず同じことをしてもらう。次に一か所だけ好きに変えてもらい、その変化を次の人がまねする。最初の一手が、次の人の遊びへつながる。`,
      uses: ['その場で手を動かせるよう、遊びの入口を一手に絞る。', `参加した人が${entrance}をまねし、次の人へ動きを渡す仕組みにする。`] };
  } else if (soundAndPhoto) {
    const roles = ['写真をめくる前に読む、音の手がかりにする。', 'めくって見せる写真を選び、想像した景色と答え合わせする。'];
    idea = { title: '耳でめくる写真帖', summary: '音から景色を想像し、めくって写真と見比べる。',
      body: '写真を一枚選び、撮った場所で聞こえた音を短い言葉で裏に書く。読む人は音の言葉から景色を想像し、めくって写真と見比べる。',
      uses: soundFirst ? roles : roles.reverse() };
  } else if (soundCue(second.quote)) {
    idea = { title: `${a}の音のしおり`, summary: '先に音を聞き、想像した場面としおりの表を見比べる。',
      body: `${front}をしおりの表に書く。裏には${back}から思い浮かぶ音を一つ、声に出せる言葉で書く。音の面だけを友人に読み、どんな場面を想像したか聞いてから表を見せる。`,
      uses: ['音から想像したあとで見せる、しおりの表に置く。', '場面を想像するヒントになる音の言葉を選ぶ。'] };
  } else if (/色合い|配色|夕焼け|木漏れ日|光の色|光を|色を/u.test(second.quote)) {
    idea = { title: `${a}の色見本`, summary: '二枚から一色ずつ選び、色だけで場面を伝える。',
      body: `${front}を読んで浮かんだ色をひとつ塗る。隣には${back}を読んで選んだ色を塗る。二色に共通する名前を付け、言葉を伏せて、色だけでどんな場面が伝わるか試す。`,
      uses: ['言葉から思い浮かぶ一色を最初の欄に塗る。', '隣に置く色を選ぶ。二色に共通する場面の名前を考える。'] };
  } else if (/散歩|街歩き|遊歩道|歩きながら/u.test(second.quote) && !/歩けな|歩かない|歩きたくな/u.test(second.quote)) {
    idea = { title: `${a}を探す散歩`, summary: '一節を持って出かけ、思い出した場所を地図に残す。',
      body: `出かける前に${front}を小さな紙に書く。${back}を手がかりに道をひと区間だけ選び、最初の一節を思い出した場所に印を付ける。帰ったら印に短い名前を付け、次の人へ渡す散歩の地図にする。`,
      uses: ['歩きながら何を見つけるかを決める言葉にする。', '歩く区間を選び、場所を地図に記す行動につなげる。'] };
  } else {
    idea = { title: `${a}の問いかけカード`, summary: '一枚目から続きを想像し、二枚目を開いて比べる。',
      body: `${front}を最初のカードに書く。読む人に続きを一言予想してもらい、二枚目の${back}をめくる。想像と重なったところに丸を付け、次の人のためのヒントにする。`,
      uses: ['最初のカードに置き、読んだ人に続きを予想してもらう。', '二枚目に置き、予想と読み比べる答えにする。'] };
  }
  if (third) {
    const step = extraStep[recipe];
    const sound = soundCue(third.quote);
    idea.body += `\n\n${step.heading}\n「${third.quote}」\n${sound ? step.sound : step.action}`;
    idea.uses.push(sound ? step.sound : step.use);
  }
  return { ...idea, recipe, generator: 'recipe', parts };
}

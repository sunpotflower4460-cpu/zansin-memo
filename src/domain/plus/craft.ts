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
export type CraftCandidate = CraftIdea & { recipe: CraftRecipe; generator: 'recipe' | 'on_device'; parts: CraftPart[] };

const extraStep = {
  letter: { heading: '追伸', action: 'この一節を添え、返事に書きたい言葉をひとつ尋ねる。',
    sound: '返事には、受け取った人が思い浮かべた音を一言書いてもらう。' },
  experiment: { heading: 'もう一度試すなら', action: 'この一節から条件を一つ借りて、二回目に変えることを決める。',
    sound: '二回目は音の手がかりを一つ足し、前の答えから変わった言葉を探す。' },
  experience: { heading: '最後に開くカード', action: 'このカードを読んで、次に残したいものを一つ選ぶ。',
    sound: '次の人には音の手がかりだけを先に伝え、場面を当ててもらってから全体を見せる。' },
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
  const canUsePhoto = /写真|カメラ|撮影/u.test(all) && !/撮れな|撮らな|撮りたくな|撮影禁止|(?:写真|撮影|カメラ)[^。！？\n]{0,10}(?:禁止|不可|使えな|できな|苦手|嫌い|なし|避け)/u.test(all);
  const diary = /日記|記録|気づき/u.test(first.quote);
  const photoDiary = diary && canUsePhoto && /写真|撮影|カメラ/u.test(second.quote);
  let title: string;
  let body: string;
  if (recipe === 'letter') {
    title = `${a}からの往復便`;
    body = `表にひとこと\n${front}\n\n裏からの返事\n${back}\n\n受け取った人に、二つの間に浮かんだ景色を一行だけ書き足してもらう。`;
  } else if (recipe === 'experiment') {
    title = `${a}を試す一日`;
    body = photoDiary ? '今日気づいたことを、まず一行書く。次に写真を一枚見て、同じ場面をもう一行書く。二行を並べ、写真を見て初めて思い出した言葉に丸を付ける。'
      : `試す前に\n${front}を読み、思いついた使い道を一つ書く。\n\n条件を一つ足す\n${back}を読み、その一節を取り入れた別の使い道を書く。二案の違いに下線を引き、今日試せる方を一つ選ぶ。`;
  } else if (photoDiary || (diary && /一言|一行/u.test(second.quote))) {
    title = photoDiary ? '一枚から始まる日記' : 'ひとことを拾う日記';
    body = photoDiary ? '一日の終わりに写真を一枚だけ選ぶ。写っていない音や匂いを一言添え、翌日はその一言を手がかりに次の一枚を探す。'
      : '一日の終わりに気づきを一言だけ書き、裏返しておく。翌日それを開き、昨日と違って見えたことをもう一行返す。';
  } else if (soundCue(all) && canUsePhoto) {
    title = '耳でめくる写真帖';
    body = '写真を一枚選び、撮った場所で聞こえた音を短い言葉で裏に書く。読む人は音の言葉から景色を想像し、めくって写真と見比べる。';
  } else if (soundCue(second.quote)) {
    title = `${a}の音のしおり`;
    body = `${front}をしおりの表に書く。裏には${back}から思い浮かぶ音を一つ、声に出せる言葉で書く。音の面だけを友人に読み、どんな場面を想像したか聞いてから表を見せる。`;
  } else if (/色合い|配色|夕焼け|木漏れ日|光の色|光を|色を/u.test(second.quote)) {
    title = `${a}の色見本`;
    body = `${front}を読んで浮かんだ色をひとつ塗る。隣には${back}を読んで選んだ色を塗る。二色に共通する名前を付け、言葉を伏せて、色だけでどんな場面が伝わるか試す。`;
  } else if (/散歩|街歩き|遊歩道|歩きながら/u.test(second.quote) && !/歩けな|歩かない|歩きたくな/u.test(second.quote)) {
    title = `${a}を探す散歩`;
    body = `出かける前に${front}を小さな紙に書く。${back}を手がかりに道をひと区間だけ選び、最初の一節を思い出した場所に印を付ける。帰ったら印に短い名前を付け、次の人へ渡す散歩の地図にする。`;
  } else {
    title = `${a}の問いかけカード`;
    body = `${front}を最初のカードに書く。読む人に続きを一言予想してもらい、二枚目の${back}をめくる。想像と重なったところに丸を付け、次の人のためのヒントにする。`;
  }
  if (third) {
    const step = extraStep[recipe];
    body += `\n\n${step.heading}\n「${third.quote}」\n${soundCue(third.quote) ? step.sound : step.action}`;
  }
  return { title, body, recipe, generator: 'recipe', parts };
}
